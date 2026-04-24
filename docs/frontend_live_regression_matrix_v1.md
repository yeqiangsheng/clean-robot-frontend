# 前端真机 Live 自动回归矩阵 v1

## 1. 目标

这份矩阵只覆盖当前商用主链范围，不扩 scope：

- `SLAM Workbench`
- `Odom / 里程计健康`
- `System Readiness`
- `Task Execution`
- `MapWorkbench` 只读业务 IO
- `ScheduleManagement` 受控真删除回归

不纳入：

- 禁区 / 虚拟墙写入编辑动作
- 完整区域编辑写入动作
- `RETURN`
- 任何 `/cartographer/runtime/*` 直连
- 任何脚本链路或内部 ROS 节点直连

## 2. 启动前前置条件

现场真机 live 回归开始前，默认要求后端已经满足这些条件：

- 核心节点在线，商用主链可联调。
- `/api/health` 返回 `200`，且 `ros.status=connected`。
- `slam_state / odometry_state / system_readiness / tasks` 能从站点网关正常返回。
- `map catalog / current map / workbench site services` 能从站点网关正常返回。
- 如果要跑受控执行写动作：
  - `can_start_task=true`
  - `mission_state=IDLE`
  - `executor_state=IDLE`
- 如果要跑建图写动作：
  - `can_relocalize` 按现场实际状态成立；旧环境如果仍暴露 `can_restart_localization`，只作为兼容门禁字段。
  - `can_start_mapping / can_save_mapping / can_stop_mapping` 按现场实际状态成立。

## 3. 自动化分层

- `A0`：真机只读自动回归。可直接重复执行，不触发机器人高风险动作。
- `A1`：真机受控写动作回归。默认关闭，只有现场明确放行才执行。
- `M1`：人工或半自动故障注入。比如 topic stale、网关断连、后端服务超时。

## 4. Playwright 入口

新增入口：

- `npm.cmd run test:e2e:live`
- `npm.cmd run test:e2e:live:readonly`
- `npm.cmd run test:e2e:live:write`
- `npm.cmd run test:e2e:live:write:slam`
- `npm.cmd run test:e2e:live:write:task`
- `npm.cmd run test:e2e:live:write:schedule`
- `npm.cmd run test:e2e:live:write:map`

环境变量：

- `PLAYWRIGHT_LIVE_BASE_URL`
  - 默认 `http://127.0.0.1:4173`
- `PLAYWRIGHT_LIVE_USERNAME`
- `PLAYWRIGHT_LIVE_PASSWORD`
- `PLAYWRIGHT_LIVE_TASK_NAME`
  - 受控执行写动作必填
- `PLAYWRIGHT_LIVE_EXPECT_MAP_NAME`
  - 如果现场要求严格校验当前激活地图 / runtime 地图，可填写
- `PLAYWRIGHT_LIVE_REQUIRE_READY`
  - `true` 时会把 `can_start_task / mission_state / executor_state` 当成硬断言
- `PLAYWRIGHT_LIVE_ENABLE_SLAM_WRITE`
  - `true` 才执行 `relocalize / start_mapping / save_mapping / stop_mapping`
- `PLAYWRIGHT_LIVE_ENABLE_TASK_WRITE`
  - `true` 才执行 `START / PAUSE / CONTINUE / STOP`
- `PLAYWRIGHT_LIVE_ENABLE_SCHEDULE_WRITE`
  - `true` 才执行临时调度创建、真删除、列表和详情复核
- `PLAYWRIGHT_LIVE_ENABLE_MAP_WRITE`
  - `true` 才执行 MapWorkbench 的 coverage preview、临时 zone commit 和 cleanup delete
- `PLAYWRIGHT_LIVE_SLAM_MAP_PREFIX`
  - 建图保存时的地图名前缀，默认 `live_regression`

示例：

```powershell
$env:PLAYWRIGHT_LIVE_BASE_URL='http://127.0.0.1:4173'
$env:PLAYWRIGHT_LIVE_USERNAME='engineer'
$env:PLAYWRIGHT_LIVE_PASSWORD='<现场工程师密码>'
$env:PLAYWRIGHT_LIVE_TASK_NAME='task_ye'
npm.cmd run test:e2e:live:readonly
```

```powershell
$env:PLAYWRIGHT_LIVE_ENABLE_SLAM_WRITE='true'
$env:PLAYWRIGHT_LIVE_SLAM_MAP_PREFIX='site_live'
npm.cmd run test:e2e:live:write:slam
```

```powershell
$env:PLAYWRIGHT_LIVE_ENABLE_TASK_WRITE='true'
$env:PLAYWRIGHT_LIVE_TASK_NAME='task_ye'
npm.cmd run test:e2e:live:write:task
```

```powershell
$env:PLAYWRIGHT_LIVE_ENABLE_SCHEDULE_WRITE='true'
npm.cmd run test:e2e:live:write:schedule
```

```powershell
$env:PLAYWRIGHT_LIVE_ENABLE_MAP_WRITE='true'
npm.cmd run test:e2e:live:write:map
```

## 5. A0 真机只读自动回归矩阵

| ID | 模块 | 入口 | 自动化检查 | 期望 |
| --- | --- | --- | --- | --- |
| A0-01 | Site health | `/api/health` | `status / ros.status / ros.isConnected / ros.url` | `200`、`status=ok`、`ros.status=connected` |
| A0-02 | System readiness baseline | `/api/system/readiness?taskId=0` | `success / activeMapName / runtimeMapName / executorState` | 服务成功、字段完整、无空值 |
| A0-03 | Odom | `/api/odometry/state` | `success / odomSource / odomValid` | 服务成功、字段完整 |
| A0-04 | SLAM state | `/api/slam/state` | `activeMapName / runtimeMapName / localizationState / can*` | 状态可读、字段完整 |
| A0-05 | Task list | `/api/tasks` | 任务列表非空；如指定 `PLAYWRIGHT_LIVE_TASK_NAME` 则检查存在 | 页面可选任务不缺失 |
| A0-06 | 执行控制页 | `执行控制` | 任务下拉、`任务启动前 readiness`、`START/PAUSE/CONTINUE/STOP` 按钮存在 | 页面主链能渲染 |
| A0-07 | 执行页字段对真值 | `执行控制` | `activeMapName / runtimeMapName / executorState` 在 UI 可见 | 页面显示不偏离网关真值 |
| A0-08 | SLAM 页 | `SLAM` | `里程计健康`、`系统 readiness 摘要`、SLAM 状态卡存在 | SLAM 主读链渲染正常 |
| A0-09 | SLAM 页字段对真值 | `SLAM` | `runtimeMapName / localizationState` 在 UI 可见 | 页面显示不偏离网关真值 |
| A0-10 | 运行监控页 | `运行监控` | `Task State / Executor State / Topic Health` 卡片存在 | runtime snapshot 渲染正常 |
| A0-11 | Map catalog | `/api/maps` | 地图列表非空，至少一张 active map | 地图资产 CRUD 的读入口可用 |
| A0-12 | Current map | `/api/maps/current` | `map_name / map_data.info.width / height` 有真值 | live `/map` 所需底图可读 |
| A0-13 | Site editor lists | `/api/workbench/alignment`、`/api/workbench/zones`、`/api/workbench/no-go-areas`、`/api/workbench/virtual-walls` | canonical site 服务返回 `200`，列表是数组 | 业务读入口不再依赖旧 rosbridge 直连 |
| A0-14 | Zone detail / plan path | `/api/workbench/zones/:id`、`/api/workbench/zones/:id/plan-path` | 如果存在 zone，详情和 plan path 返回 `200` | 区域详情和路径读取可用 |
| A0-15 | MapWorkbench 页 | `地图工作台` | 页面 heading 可见，当前 map name 在 UI 可见 | Web 画布工作台可渲染 |

## 6. A1 受控写动作自动回归矩阵

### 6.1 SLAM

| ID | 动作 | 自动化检查 | 期望 |
| --- | --- | --- | --- |
| A1-01 | `relocalize` | 按钮必须可点；`/api/slam/actions` 返回 `accepted=true`；返回体有 `jobId`；页面提示 `重定位请求已提交` | 前端正确拿到 job 并回显 |
| A1-02 | `start_mapping` | 按钮可点；请求返回 `accepted=true`；返回体有 `jobId`；页面提示 `开始建图请求已提交` | 正确起建图作业 |
| A1-03 | `save_mapping` | 仅在 `can_save_mapping=true` 后执行；返回体有 `jobId`；页面提示 `保存地图请求已提交` | 正确起保存作业 |
| A1-04 | `stop_mapping` | 仅在 `can_stop_mapping=true` 后执行；返回体有 `jobId`；页面提示 `结束建图请求已提交` | 正确起结束作业 |

### 6.2 Task Execution

| ID | 动作 | 自动化检查 | 期望 |
| --- | --- | --- | --- |
| A1-05 | `START` | 指定真实任务；按钮必须可点；`/api/execution/commands` 返回 `success=true`；页面提示 `START 返回` | 前端正确带正式 `task_id` 下发 |
| A1-06 | `PAUSE` | `START` 后等待按钮可点；返回 `success=true`；页面提示 `PAUSE 返回` | 暂停链路正常 |
| A1-07 | `CONTINUE` | `PAUSE` 后等待按钮可点；返回 `success=true`；页面提示 `CONTINUE 返回` | 继续链路正常 |
| A1-08 | `STOP` | `CONTINUE` 后等待按钮可点；返回 `success=true`；页面提示 `STOP 返回` | 收口链路正常 |

### 6.3 ScheduleManagement

| ID | 动作 | 自动化检查 | 期望 |
| --- | --- | --- | --- |
| A1-09 | 临时调度真删除 | 创建 `live_delete_probe_*` 临时调度；DELETE 返回 `message=deleted`；刷新列表后不存在；detail/get 返回 `schedule not found` | 前端和 live canonical schedule delete 对齐真删除语义 |

### 6.4 MapWorkbench

| ID | 动作 | 自动化检查 | 期望 |
| --- | --- | --- | --- |
| A1-10 | coverage preview | 使用现有 zone 的 `display_region` 调 `/api/workbench/zones/coverage-preview`；返回 `200`，且预计长度大于 `0` | preview payload 符合正式字段 |
| A1-11 | 临时 zone commit / cleanup | 创建 `live_zone_probe_*` 临时 zone；detail 能读回；finally 中调用 DELETE 清理；刷新列表后不存在 | site coverage commit / zone delete 写入口可用且可收口 |

## 7. M1 人工/半自动故障注入矩阵

这些场景建议保留人工盯机，不默认自动跑：

| ID | 场景 | 触发方式 | 前端期望 |
| --- | --- | --- | --- |
| M1-01 | 网关 ROS 断连 | 暂停上游 rosbridge 或断网 | 明确显示 `disconnected`，不要误判成 service `success=false` |
| M1-02 | readiness topic stale | 后端暂停发布 `/coverage_task_manager/system_readiness` | 页面显示 `stale / waiting`，同时保留最近一次服务结果 |
| M1-03 | 任务服务超时 | 人工制造 `/database_server/app/clean_task_service` 慢响应 | 页面显示真实 timeout，不吞成泛化网络错误 |
| M1-04 | service `success=false` | 后端返回明确业务阻断 | 原始 backend message 原样展示 |
| M1-05 | stop 后 executor 未回 idle | 人工复现执行链未收口 | 页面允许保留 `STOP` 恢复动作，不出现四个灰按钮死区 |

## 8. 证据留存

每次真机 live 回归至少留这些证据：

- Playwright HTML report / trace
- `/api/health` 原始 JSON
- 如果失败，保存原始 backend message
- 关键页面截图：
  - `执行控制`
  - `SLAM`
  - `运行监控`
- 如果跑了写动作：
  - `jobId`
  - `command / taskId`
  - 现场结果截图

## 9. 结论口径

真机 live 回归报告必须区分：

- transport error
- service `success=false`
- topic `waiting`
- topic `stale`
- job 未完成
- 页面本地状态展示错误

不要把这些混成一类“网络问题”。
