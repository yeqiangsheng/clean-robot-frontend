# SLAM Frontend Codex Kickoff v1

这份文档不是给人解释方案的，它是给前端侧 Codex 直接开工用的。

你需要把这份文档完整作为任务上下文发给 Codex，让它在前端工程里完成一个“SLAM 工作台”页面，接当前机器人侧已经落地的 `slam_workflow_manager`。

## 1. 你的角色

你现在是本项目的资深前端工程师，负责把机器人侧的 `slam_workflow_manager` 做成一个可用于现场联调和产品演进的 SLAM 页面。

你不是只输出组件草图，也不是只写假接口。

你要：

- 先理解真实接口
- 在当前前端工程里落页面
- 跑通真实请求
- 做好异步状态、失败态和轮询
- 让页面既能服务现场调试，也能作为后续产品页基础

除非遇到真实阻塞，否则不要停在分析阶段。

## 2. 你必须先阅读的文档

先阅读这些仓库文档：

- `/home/baer/Doraemon/docs/slam_frontend_engineering_v1.md`
- `/home/baer/Doraemon/docs/slam_frontend_interface_v1.md`
- `/home/baer/Doraemon/docs/slam_workflow_bringup_debug_v1.md`
- `/home/baer/Doraemon/docs/slam_workflow_manager_spec_v1.md`

重点先读：

1. `工程目标`
2. `当前前后端对接规范`
3. `页面在整个工程中的定位`
4. `Localization Workflow`
5. `Mapping Workflow`
6. `submit_* / get_state / get_job / cancel_job / sync_runtime_state`

## 3. 正式接口选择

主业务链必须优先走 `rosbridge websocket + ROS service/topic`，不要把这个页面改写成普通 HTTP REST 客户端。

约束如下：

- 正式业务动作：走 ROS service
- job 轮询：走 ROS service
- 页面主状态：走 ROS topic + ROS service
- 浏览器和机器人后端的正式数据链：走 rosbridge websocket
- 可选 HTTP gateway：只允许作为云端/自动化/非 ROS 客户端增强，不作为当前前端主链
- 页面必须和现有前端工程共用布局、路由、状态管理和基础设施，不要单独再做一套孤立工程

默认 rosbridge 地址：

```text
ws://<robot-ip>:9090
```

请把它做成环境变量：

```env
VITE_ROSBRIDGE_URL=ws://192.168.1.100:9090
```

如果项目不是 Vite，也要提供同等的可配置能力，不要把地址写死在组件里。

注意：

- `slam_workflow_manager` 起起来，不代表 `rosbridge` 一定已经起了
- 如果现场只启动了 runtime/workflow，没有启动 `rosbridge`，前端依然无法联调
- 开工前先确认机器人侧 WebSocket 真的可连

## 4. 页面目标

请实现一个 `SLAM 工作台` 页面，建议路由：

```text
/slam
```

页面至少要覆盖这 5 块：

1. 当前 SLAM 状态总览
2. 切图定位
3. 手动重定位
4. 建图与保存地图
5. job 查询与执行记录

同时必须满足工程集成目标：

- 挂到现有前端路由中
- 尽量复用现有页面布局和基础组件
- 尽量复用现有 rosbridge 连接层
- 不影响已有地图页、任务页和运行监控页

## 5. 页面结构建议

建议使用三段式布局：

### 顶部

- 当前 workflow state
- 当前 map name
- localization state
- task ready
- busy / manual assist / last error

### 左侧操作区

- 切图并定位表单
- 手动重定位表单
- 开始建图表单
- 保存地图表单
- 停止建图按钮

### 右侧信息区

- 当前状态 JSON 摘要
- 最新 job 卡片
- job 轮询列表
- 调试帮助和错误提示

## 6. 你必须接的后端接口

### 6.1 状态 service / topic

- service：`/slam_workflow/get_state`
  - 类型：`my_msg_srv/GetSlamWorkflowState`
- service：`/slam_workflow/sync_runtime_state`
  - 类型：`my_msg_srv/SyncSlamRuntimeState`
- topic：`/slam_workflow/state`
  - 类型：`my_msg_srv/SlamWorkflowState`

### 6.2 job service

- service：`/slam_workflow/get_job`
  - 类型：`my_msg_srv/GetSlamWorkflowJob`
- service：`/slam_workflow/cancel_job`
  - 类型：`my_msg_srv/CancelSlamWorkflowJob`

### 6.3 定位 service

- service：`/slam_workflow/submit_prepare_for_task`
  - 类型：`my_msg_srv/SubmitSlamWorkflow`
- service：`/slam_workflow/submit_switch_map_and_localize`
  - 类型：`my_msg_srv/SubmitSlamWorkflow`
- service：`/slam_workflow/submit_relocalize`
  - 类型：`my_msg_srv/SubmitSlamWorkflow`

### 6.4 建图 service

- service：`/slam_workflow/submit_start_mapping`
  - 类型：`my_msg_srv/SubmitSlamWorkflow`
- service：`/slam_workflow/submit_save_map`
  - 类型：`my_msg_srv/SubmitSlamWorkflow`
- service：`/slam_workflow/submit_stop_mapping`
  - 类型：`my_msg_srv/SubmitSlamWorkflow`

## 7. 请求体字段

所有 `submit_*` service 请求都兼容这一组字段：

```json
{
  "robot_id": "local_robot",
  "map_name": "",
  "frame_id": "map",
  "has_initial_pose": false,
  "initial_pose_x": 0.0,
  "initial_pose_y": 0.0,
  "initial_pose_yaw": 0.0,
  "save_map_name": "",
  "include_unfinished_submaps": false,
  "set_active_on_save": false,
  "switch_to_localization_after_save": false,
  "relocalize_after_switch": false
}
```

要点：

- 切图定位看 `map_name`
- 保存地图看 `save_map_name`
- 手动重定位时 `has_initial_pose=true`
- 有初始位姿时，必须展示 `x / y / yaw`

## 8. 返回值处理要求

### 8.1 提交 job

提交动作成功返回的不是最终结果，而是“任务已受理”：

```json
{
  "accepted": true,
  "job_id": "slam_job_xxx",
  "job_type": "SWITCH_MAP_AND_LOCALIZE",
  "workflow_state": "SWITCH_MAP_AND_LOCALIZE",
  "manual_assist_required": false
}
```

所以前端必须：

- 保存 `job_id`
- 自动轮询 `/slam_workflow/get_job`
- 同时刷新 `/slam_workflow/get_state`
- 同时订阅 `/slam_workflow/state`

### 8.2 job 最终态

前端要识别这些 job 终态：

- `SUCCEEDED`
- `FAILED`
- `MANUAL_ASSIST_REQUIRED`
- `CANCELED`

并把这些字段清晰展示出来：

- `result_code`
- `result_message`
- `workflow_phase`
- `progress_percent`
- `runtime_map_name`
- `localization_state`
- `localization_valid`

## 9. 必须实现的交互

### 9.1 状态总览

页面进入后立即：

1. 连上 rosbridge
2. 拉一次 `/slam_workflow/get_state`
3. 订阅 `/slam_workflow/state`
4. 每 2 秒做一次 `get_state` 兜底同步
5. 页面上常驻显示：
   - `workflow_state`
   - `runtime_mode`
   - `runtime_map_name`
   - `runtime_map_match`
   - `localization_state`
   - `localization_valid`
   - `mapping_session_active`
   - `task_ready`
   - `manual_assist_required`
   - `last_error_code`
   - `last_error_message`

### 9.2 切图并定位

用户输入 `map_name` 后：

- 调 `/slam_workflow/submit_switch_map_and_localize`
- 持续轮询 job
- job 成功后刷新 state
- 如果 `MANUAL_ASSIST_REQUIRED`，页面要显式提示“需要人工辅助定位”

### 9.3 手动重定位

支持两种模式：

- 不带初始位姿
- 带初始位姿

带初始位姿时要提供：

- `x`
- `y`
- `yaw`

### 9.4 建图

页面要支持完整顺序：

1. `/slam_workflow/submit_start_mapping`
2. `/slam_workflow/submit_save_map`
3. `/slam_workflow/submit_stop_mapping`

UI 上要明确提醒：

- 先保存，再停止建图
- 保存名称来自 `save_map_name`
- 不是 `map_name`

### 9.5 job 区

至少要做：

- 当前活动 job 卡片
- 最近成功 / 失败 job 列表
- 点击查看原始 JSON
- 支持取消当前 job

## 10. 前端实现要求

如果当前工程已有现成技术栈，优先遵循现有工程规范。

如果没有明确约束，优先使用：

- `React`
- `TypeScript`
- `Ant Design`
- `@tanstack/react-query`
- `zustand`

实现要求：

- 接口层独立封装，不要把 `ROSLIB.Service` 直接写在页面里
- 为 `state`、`job`、`submit_*`、`topic` 分层建 ROS API 模块
- 目录拆分优先按 `slam_frontend_engineering_v1.md` 里的建议结构来做
- 表单、状态卡片、job 列表拆分成组件
- 轮询要能自动停止，避免页面离开后继续请求
- 对 rosbridge 断连、service 调用失败、job 失败和 topic 超时做清晰提示

## 11. 视觉和交互要求

不要做成“调试脚本集合页”，要有产品页质感，但也要保留工程调试信息。

要求：

- 顶部状态区要一眼看出当前是否可执行任务
- `localized / not_localized / relocalizing / manual assist` 用明确颜色区分
- 危险动作如 `stop mapping` 和 `cancel job` 要二次确认
- 保存地图和切图定位要有明显成功反馈
- 对失败原因直接显示后端 `result_message`

## 12. 你可以增加但不能删掉的增强项

你可以增加：

- 原始 JSON Drawer
- 一键复制 `rosservice call` 调试命令
- 状态时间线
- 最近操作历史
- 可选的 rosbridge 调试面板

但不要删掉主链：

- 状态总览
- 切图定位
- 手动重定位
- 建图保存停止
- job 轮询

## 13. 验收标准

完成后必须至少验证这几条：

1. 页面能正常加载当前 `state`
2. 页面能提交 `switch-map-and-localize`
3. 页面能轮询 job 直到终态
4. 页面能提交 `start-mapping`
5. 页面能提交 `save-map`
6. 页面能提交 `stop-mapping`
7. 页面能清晰显示失败原因和人工辅助状态
8. 页面在刷新后仍能恢复当前状态视图

## 14. 最后的工作方式要求

请直接动手实现，不要先输出一大段分析。

如果你需要补充前端类型、API client、状态管理、页面路由、组件拆分、错误处理、轮询逻辑，就直接做。

如果当前工程里已经有设计系统或页面风格，保持一致；如果没有，就做一个干净、偏工程控制台风格、但不是简陋表单堆砌的 SLAM 工作台页面。

补充要求：

- 这页的数据主链必须建立在 `rosbridge websocket + roslibjs` 上
- 不要把这页实现成对 `slam_http_gateway` 的普通 HTTP 调用页
- 可以在页面里保留“后续可扩展 HTTP gateway”的注释，但不要作为当前主实现
- 这页必须作为现有工程的一部分交付，不要新起一个独立前端 demo
