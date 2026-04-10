# SLAM Frontend Live Acceptance Prompt v1

这份文档不是给人解释方案的，它是给前端 Codex 直接执行 live 验收用的。

你需要把这份文档完整作为任务上下文发给 Codex，让它在现有前端工程里，基于已经接好的 `SLAM Workbench` 页面，对当前机器人侧 `slam_workflow_manager` 做一轮真实 live 动作链验收。

## 1. 你的角色

你现在是本项目的前端联调工程师，不是只做静态页面检查。

你要：

- 使用现有前端工程里的正式 `SLAM` 页面
- 连真实 `rosbridge websocket`
- 通过页面 UI 跑通一轮 live 动作链
- 记录每一步的结果和证据
- 对失败项给出真实原因，而不是假装通过

除非遇到真实阻塞，否则不要停在分析阶段。

## 2. 你必须先阅读的文档

开始前先阅读：

- [slam_frontend_engineering_v1.md](./slam_frontend_engineering_v1.md)
- [slam_frontend_interface_v1.md](./slam_frontend_interface_v1.md)
- [slam_frontend_codex_prompt_v1.md](./slam_frontend_codex_prompt_v1.md)
- [slam_workflow_bringup_debug_v1.md](./slam_workflow_bringup_debug_v1.md)

重点先读：

1. `当前前后端对接规范`
2. `页面范围`
3. `后端能力与前端页面映射`
4. `状态刷新策略`
5. `失败态处理要求`

## 3. 当前 live 联调环境

本轮 live 环境按下面默认值执行：

- rosbridge：
  - `ws://10.0.0.157:9090`
- 当前后端状态基线：
  - `workflow_state = LOCALIZED`
  - `runtime_mode = localization`
  - `runtime_map_name = 0327-1`
  - `runtime_map_match = true`
  - `localization_state = localized`
  - `localization_valid = true`
  - `mapping_session_active = false`
  - `task_ready = true`

你要先验证这些基线，而不是直接点动作按钮。

## 4. 执行原则

### 4.1 主链必须走页面 UI

这轮验收的主链必须是：

- 通过前端页面操作
- 通过页面背后的 `rosbridge + ROS service/topic`

不要把主验证改成：

- 手工 `rosservice call`
- 单独写脚本绕过页面
- 直接用 HTTP gateway

ROS 命令只能用于辅助排障，不用于替代页面验收。

### 4.2 保持在现有工程里操作

不要新起独立 demo。

你必须使用：

- 现有前端工程
- 现有 `SLAM` tab
- 现有页面状态管理和组件

### 4.3 对真实失败保持诚实

如果某一步失败：

- 明确记录失败
- 写清楚页面现象
- 写清楚是 UI 问题、连接问题、还是后端返回失败

不要把“accepted=true”误写成“动作通过”。

### 4.4 安全优先

如果现场环境不适合做建图或切图动作，比如：

- 机器人正在执行其它任务
- 人员/场地不允许切 runtime
- 当前环境不允许生成测试地图

那就停止对应动作并把这一轮标记为“因现场条件跳过”，不要强行执行。

## 5. 验收输出要求

你本轮必须留下这些产物：

- 每个关键步骤至少 1 张截图
- 至少 1 张 JSON drawer 截图
- 一份结构化验收结果 JSON
- 一段最终总结

建议文件名：

- `docs/assets/slam-live/slam-live-acceptance-step-01-connected-20260401.png`
- `docs/assets/slam-live/slam-live-acceptance-step-02-sync-runtime-20260401.png`
- `docs/assets/slam-live/slam-live-acceptance-step-03-switch-map-20260401.png`
- `docs/assets/slam-live/slam-live-acceptance-step-04-relocalize-20260401.png`
- `docs/assets/slam-live/slam-live-acceptance-step-05-start-mapping-20260401.png`
- `docs/assets/slam-live/slam-live-acceptance-step-06-save-map-20260401.png`
- `docs/assets/slam-live/slam-live-acceptance-step-07-stop-mapping-20260401.png`
- `docs/assets/slam-live/slam-live-acceptance-json-drawer-20260401.png`
- `docs/assets/slam-live/slam-live-acceptance-20260401.json`

## 6. 本轮必须执行的验收项

### 6.1 Step 0: 连接与基线确认

进入 `SLAM` 页面后，先确认：

- 页面显示 `Connected`
- 当前页面能看到：
  - `LOCALIZED`
  - `runtime_map_name = 0327-1`
  - `topic live`
  - `no active job`

还要打开一次 JSON drawer，确认能看到原始 state payload。

通过标准：

- 页面确实连接到 live rosbridge
- 页面状态和后端基线一致

### 6.2 Step 1: Sync Runtime State

通过页面触发：

- `sync_runtime_state`

通过标准：

- 页面出现成功反馈
- state 刷新成功
- JSON drawer 或页面状态没有异常

记录：

- 同步前后的状态
- 有没有出现意外状态跳变

### 6.3 Step 2: Prepare For Task

通过页面触发：

- `submit_prepare_for_task`

建议目标：

- 地图名使用当前 active map：`0327-1`

通过标准：

- 页面创建了 job
- job 最终进入 `SUCCEEDED`
- 结果接近 `ready` 或等效成功状态

如果页面上只有 job 卡片，不显示完整结果，也要通过 JSON drawer 或 job 详情确认。

### 6.4 Step 3: Switch Map And Localize

通过页面触发：

- `submit_switch_map_and_localize`

建议目标地图：

- 先用当前已知稳定地图 `0327-1`

通过标准：

- 创建 job 成功
- job 终态为 `SUCCEEDED`
- state 最终回到：
  - `workflow_state = LOCALIZED`
  - `runtime_map_name = 0327-1`
  - `localization_valid = true`

如果这里失败：

- 记录 `result_code`
- 记录 `result_message`
- 不要跳过失败原因

### 6.5 Step 4: Relocalize

通过页面触发：

- `submit_relocalize`

先跑一轮：

- 不带初始位姿

通过标准：

- 创建 job 成功
- job 最终进入终态
- 若成功，应回到 `localized`

如果返回 `MANUAL_ASSIST_REQUIRED`：

- 这不算页面失败
- 你要继续验证页面是否自动展开手动重定位表单
- 记录联动是否正确

### 6.6 Step 5: Start Mapping

只有在现场允许切到建图时才执行。

通过页面触发：

- `submit_start_mapping`

建议地图名：

- `frontend_live_20260401`
- 如果担心重名，可加时间后缀

通过标准：

- 创建 job 成功
- job 终态为 `SUCCEEDED`
- 页面 state 显示：
  - `workflow_state = MAPPING`
  - `mapping_session_active = true`

如果现场不允许做建图：

- 不要硬做
- 把这一步记为 `skipped_due_to_environment`

### 6.7 Step 6: Save Map

只有在 Step 5 成功且当前确实处于 mapping active 时才执行。

通过页面触发：

- `submit_save_map`

建议保存名：

- `frontend_live_20260401`
- 如果重名，加后缀：
  - `frontend_live_20260401_a`

通过标准：

- 创建 job 成功
- job 终态为 `SUCCEEDED`
- 页面有明确成功反馈

如果失败：

- 明确记录是否为：
  - `mapping_inactive`
  - `map_exists`
  - 其它 `result_code`

### 6.8 Step 7: Stop Mapping

只有在 Step 5 成功后才执行。

通过页面触发：

- `submit_stop_mapping`

通过标准：

- 页面有二次确认
- 创建 job 成功
- job 终态为 `SUCCEEDED`
- 页面 state 退出 `mapping active`

### 6.9 Step 8: Cancel Job

这是条件性验收项。

如果本轮存在足够长时间的 `RUNNING` job，就在页面里验证：

- `cancel_job`

通过标准：

- 页面能发出 cancel
- job 最终进入 `CANCELED` 或后端返回明确不可取消结果

如果本轮没有可稳定复现的长运行 job：

- 不要伪造
- 记为 `not_reproducible_in_this_round`

### 6.10 Step 9: Manual Assist UI Linkage

这是条件性验收项。

如果本轮任一动作返回：

- `MANUAL_ASSIST_REQUIRED`

那你必须验证：

- 页面是否自动展开手动重定位面板
- 页面是否切到“带初始位姿”模式
- 页面是否高亮提示人工辅助

如果本轮没有自然触发：

- 记为 `not_reproduced`

## 7. 验收结果记录格式

请在 `docs/assets/slam-live/slam-live-acceptance-20260401.json` 输出至少这些字段：

```json
{
  "date": "2026-04-01",
  "rosbridge_url": "ws://10.0.0.157:9090",
  "baseline": {
    "workflow_state": "LOCALIZED",
    "runtime_map_name": "0327-1"
  },
  "steps": [
    {
      "id": "step_00_connected",
      "status": "passed",
      "notes": "",
      "artifacts": []
    }
  ],
  "summary": {
    "passed": [],
    "failed": [],
    "skipped": [],
    "not_reproduced": []
  }
}
```

状态建议只用这些枚举：

- `passed`
- `failed`
- `skipped_due_to_environment`
- `not_reproducible_in_this_round`

## 8. 最终汇报要求

执行完成后，请按这个格式汇报：

1. 已通过项
2. 失败项
3. 跳过项
4. 不可复现项
5. 改了哪些前端文件
6. 留痕文件路径
7. 当前阻塞点

## 9. 你现在就该开始做的事情

现在不要继续讨论方案。

请直接开始：

1. 打开现有前端工程
2. 启动页面
3. 连 `ws://10.0.0.157:9090`
4. 从 Step 0 开始跑
5. 每一步保存留痕
6. 最后输出 JSON 和总结
