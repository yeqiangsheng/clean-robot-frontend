# SLAM Frontend Engineering v1

这份文档面向前端工程实现，目标是指导前端 Codex 基于当前 `slam_workflow_manager` 和现有前后端技术规范，在已有前端工程中落地一个可用、可联调、可继续扩展的 `SLAM 工作台` 页面。

## 1. 工程目标

需要在现有前端工程里实现一个 SLAM 功能页面，用来完成这些能力：

- 查看当前 SLAM 工作流状态
- 切图并定位
- 手动重定位
- 开始建图
- 保存地图
- 停止建图
- 查看 job 状态和执行结果

这个页面不是一个孤立 demo，也不是单独的调试 HTML，而是要和现有前端工程配合：

- 共用现有路由系统
- 共用现有布局和设计风格
- 共用现有状态管理和基础组件
- 共用现有 rosbridge 连接基础设施

## 2. 当前工程边界

### 2.1 浏览器和后端通信方式

当前规范下：

- 浏览器访问前端页面：HTTP
- 前端和机器人后端交互：`rosbridge websocket`
- 实际业务调用：`roslibjs` 上跑 ROS service + topic

所以这个页面的主链必须是：

- `ROSLIB.Service`
- `ROSLIB.Topic`

而不是：

- 直接 `fetch('/api/...')`
- 直接把 `slam_http_gateway` 当成主后端接口

### 2.2 后端真值源

这个页面的后端真值源是：

- `slam_workflow_manager`

正式可用的接口详见：

- [slam_frontend_interface_v1.md](/home/baer/Doraemon/docs/slam_frontend_interface_v1.md#L1)

## 3. 页面在整个工程中的定位

建议把这个页面定位成：

- 机器人运行与运维控制页中的一个子页面
- 任务 / 地图 / 运行监控旁边的独立 SLAM 面板

建议路由：

```text
/slam
```

建议菜单名：

- `SLAM`
- 或 `SLAM 工作台`

### 3.1 页面角色

它不是纯工程页，也不是面向普通最终用户的极简页。

建议把它做成：

- 偏产品化的工程控制台页面
- 对现场调试友好
- 对运行状态清晰
- 对风险操作有保护

### 3.2 和现有模块的关系

它应与这些现有业务模块并列或配合：

- 地图管理
- 任务管理
- 调度管理
- 运行监控

页面不要自己重复实现地图资产 CRUD，也不要覆盖任务启动逻辑；它主要负责 SLAM runtime 和 workflow 的直接操作。

## 4. 页面范围

### 4.1 本期必须做

- 当前状态总览
- 切图并定位
- 手动重定位
- 开始建图
- 保存地图
- 停止建图
- 当前 job 查看
- 最近 job 历史
- 原始 state/job JSON 查看

### 4.2 本期可选增强

- 一键复制 `rosservice call` 调试命令
- 状态时间线
- 操作历史
- 调试诊断抽屉
- rosbridge 连接状态浮层

### 4.3 本期不要做

- 直接调用 `visual_command`
- 在前端自己实现 Cartographer 低层控制
- 把 `/map` 原始栅格渲染做成主流程
- 把这页改造成地图编辑器

## 5. 后端能力与前端页面映射

建议页面按下面的能力映射后端接口：

### 5.1 状态总览

后端接口：

- `/slam_workflow/get_state`
- `/slam_workflow/state`

前端显示：

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

### 5.2 切图并定位

后端接口：

- `/slam_workflow/submit_switch_map_and_localize`
- `/slam_workflow/get_job`

前端表单字段：

- `map_name`
- `frame_id`
- `has_initial_pose`
- 可选 `initial_pose_x / initial_pose_y / initial_pose_yaw`

### 5.3 手动重定位

后端接口：

- `/slam_workflow/submit_relocalize`
- `/slam_workflow/get_job`

前端要支持两种模式：

- 不带初始位姿
- 带初始位姿

### 5.4 开始建图

后端接口：

- `/slam_workflow/submit_start_mapping`

前端表单字段：

- `map_name`
- `frame_id`

### 5.5 保存地图

后端接口：

- `/slam_workflow/submit_save_map`

前端表单字段：

- `save_map_name`
- `include_unfinished_submaps`
- `set_active_on_save`

页面要明确提示：

- 真正决定输出地图名的是 `save_map_name`
- 不是 `map_name`

### 5.6 停止建图

后端接口：

- `/slam_workflow/submit_stop_mapping`

这是危险操作，前端必须二次确认。

### 5.7 任务前准备

后端接口：

- `/slam_workflow/submit_prepare_for_task`

可以做成页面上的辅助按钮，但不应抢占主操作区。

## 6. 前端工程拆分建议

建议至少拆成下面这些模块。

```text
src/
  api/
    ros/
      client.ts
      slamWorkflowServices.ts
      slamWorkflowTopics.ts
  hooks/
    useRosConnection.ts
    useSlamWorkflowState.ts
    useSlamWorkflowJob.ts
    useSlamJobRunner.ts
  stores/
    slamWorkbenchStore.ts
  types/
    slam-workflow.ts
  components/
    slam/
      SlamStatusHeader.tsx
      SlamStateCard.tsx
      SlamJobCard.tsx
      SlamJobHistory.tsx
      SwitchMapForm.tsx
      RelocalizeForm.tsx
      StartMappingForm.tsx
      SaveMapForm.tsx
      StopMappingAction.tsx
      JsonViewerDrawer.tsx
  pages/
    SlamWorkbenchPage.tsx
```

## 7. 模块职责建议

### 7.1 `api/ros/client.ts`

职责：

- 建立和管理 `ROSLIB.Ros`
- 统一处理连接、重连、关闭
- 提供共享 ros 实例

不要在每个组件里各自 new 一个 `ROSLIB.Ros`。

### 7.2 `api/ros/slamWorkflowServices.ts`

职责：

- 封装全部 SLAM workflow service 调用
- 把 service 名和 service type 固定在这一层
- 把 request/response 类型映射成前端类型

典型函数建议：

- `getSlamWorkflowState`
- `syncSlamRuntimeState`
- `getSlamWorkflowJob`
- `cancelSlamWorkflowJob`
- `submitPrepareForTask`
- `submitSwitchMapAndLocalize`
- `submitRelocalize`
- `submitStartMapping`
- `submitSaveMap`
- `submitStopMapping`

### 7.3 `api/ros/slamWorkflowTopics.ts`

职责：

- 封装 `/slam_workflow/state` 订阅
- 提供 subscribe / unsubscribe 逻辑
- 对消息结构做基础清洗

### 7.4 `hooks/useRosConnection.ts`

职责：

- 暴露连接状态：
  - `connected`
  - `connecting`
  - `error`
- 提供连接生命周期管理

### 7.5 `hooks/useSlamWorkflowState.ts`

职责：

- 初始化时拉一次 `get_state`
- 持续订阅 `/slam_workflow/state`
- 做 2 秒兜底轮询
- 统一把 state 暴露给页面

### 7.6 `hooks/useSlamWorkflowJob.ts`

职责：

- 根据 `job_id` 做轮询
- 在终态自动停轮询
- 提供：
  - `job`
  - `loading`
  - `error`
  - `startPolling`
  - `stopPolling`

### 7.7 `hooks/useSlamJobRunner.ts`

职责：

- 统一 submit 行为
- 统一处理：
  - `accepted=false`
  - 保存 `job_id`
  - 启动 `get_job` 轮询
  - 刷新 `get_state`

这个 hook 会明显减少页面里的重复逻辑。

### 7.8 `stores/slamWorkbenchStore.ts`

职责：

- 保存页面本地状态
- 保存当前活跃 `job_id`
- 保存最近 job 列表
- 保存 UI 状态：
  - JSON Drawer 开关
  - 最近操作历史
  - 手动重定位面板是否展开

如果项目已有全局 store 规范，优先复用，不必强行单独建 `zustand` store。

## 8. 类型定义建议

建议前端至少定义这些类型：

### 8.1 基础类型

- `RosConnectionState`
- `SlamWorkflowState`
- `SlamWorkflowJob`
- `SubmitSlamWorkflowRequest`

### 8.2 页面类型

- `SlamActionKind`
  - `switch_map_and_localize`
  - `relocalize`
  - `start_mapping`
  - `save_map`
  - `stop_mapping`
  - `prepare_for_task`
- `SlamJobTerminalState`
  - `SUCCEEDED`
  - `FAILED`
  - `MANUAL_ASSIST_REQUIRED`
  - `CANCELED`

### 8.3 UI 状态类型

- `SlamWorkbenchPanelState`
- `SlamToastPayload`
- `SlamCommandPreview`

## 9. 页面布局建议

建议采用三段式布局。

### 9.1 顶部状态区

建议放：

- 当前工作流状态
- 当前地图名
- 当前运行模式
- 当前是否已定位
- 当前是否 task ready
- 当前连接状态

这里应该是一眼能看出“现在能不能执行任务、是不是在正确地图上”的区域。

### 9.2 左侧操作区

建议放：

- 切图并定位
- 手动重定位
- 开始建图
- 保存地图
- 停止建图

### 9.3 右侧信息区

建议放：

- 当前 state 摘要
- 当前 job
- 最近 job 历史
- 错误与提示
- 原始 JSON 查看

## 10. 交互流建议

### 10.1 切图并定位

前端动作：

1. 用户填写 `map_name`
2. 调 `submit_switch_map_and_localize`
3. 如果 `accepted=false`
   - 直接提示“当前已有 job 在运行”
4. 如果 `accepted=true`
   - 保存 `job_id`
   - 启动 job 轮询
   - 刷新 state
5. 如果 job 最终 `SUCCEEDED`
   - 给出成功提示
6. 如果 job 最终 `MANUAL_ASSIST_REQUIRED`
   - 自动展开手动重定位表单

### 10.2 手动重定位

前端动作：

1. 自动模式下直接调 `submit_relocalize`
2. 手动模式下填写 `x / y / yaw`
3. 带 `has_initial_pose=true` 调 submit
4. 轮询 job 直到终态

### 10.3 开始建图

前端动作：

1. 用户填写目标建图名
2. 调 `submit_start_mapping`
3. 轮询 job
4. 成功后页面进入“mapping active”态

### 10.4 保存地图

前端动作：

1. 用户填写 `save_map_name`
2. 调 `submit_save_map`
3. 轮询 job
4. 成功后提示保存完成

前端必须提示：

- 当前实现要求建图会话 active 才能保存
- 如果已停建图，再保存会失败

### 10.5 停止建图

前端动作：

1. 点击停止
2. 二次确认
3. 调 `submit_stop_mapping`
4. 轮询 job

## 11. 状态刷新策略

建议采用“topic + service”双轨。

### 11.1 topic

用途：

- 实时更新页面状态

订阅：

- `/slam_workflow/state`

### 11.2 service 轮询

用途：

- 页面初始化
- 浏览器刷新恢复
- job 提交后的确认
- topic 断流兜底

建议策略：

- `get_state`：2 秒
- `get_job`：1 秒，仅对活跃 job

## 12. 和现有工程配合的要求

### 12.1 复用现有布局

如果现有前端工程已经有：

- 主布局
- 菜单系统
- 页面容器
- 状态卡片组件
- 统一错误提示

优先复用，不要自己再做一套完全不同的风格。

### 12.2 复用现有连接层

如果工程里已经有：

- `rosbridge` 连接管理
- service 封装
- topic 封装

优先扩展已有实现，不要重复造一个新的 ROS client。

### 12.3 不要破坏其它页面

这个页面要做到：

- 不影响现有地图页
- 不影响任务页
- 不影响运行监控页
- 不改变其它模块的通信约定

## 13. 错误处理要求

前端至少要正确处理这些情况：

### 13.1 rosbridge 未连接

表现：

- 页面展示连接失败状态
- 所有动作按钮禁用
- 提供重试连接

### 13.2 submit 未受理

表现：

- 明确提示“当前已有 job 在运行”

### 13.3 job 失败

表现：

- 直接显示 `result_code`
- 直接显示 `result_message`

### 13.4 需要人工辅助

表现：

- 明确显示 `MANUAL_ASSIST_REQUIRED`
- 自动展开手动重定位表单

### 13.5 topic 超时或 state 不更新

表现：

- 页面标记为“状态可能过期”
- 自动退回 `get_state` 轮询兜底

## 14. 危险操作保护

这几个动作必须二次确认：

- `stop mapping`
- `cancel job`

如果页面允许保存地图后自动切定位，也要给用户明确提示当前行为影响。

## 15. 验收标准

前端 Codex 完成后，至少要满足：

1. 页面能稳定连接 `rosbridge`
2. 页面能显示当前 `state`
3. 页面能订阅 `/slam_workflow/state`
4. 页面能提交切图定位
5. 页面能提交手动重定位
6. 页面能提交开始建图
7. 页面能提交保存地图
8. 页面能提交停止建图
9. 页面能轮询 job 到终态
10. 页面能清晰显示错误和人工辅助状态
11. 页面刷新后能恢复当前 state 视图

## 16. 前端 Codex 实施建议

如果把这份文档交给前端 Codex，建议同时附上：

- [slam_frontend_interface_v1.md](/home/baer/Doraemon/docs/slam_frontend_interface_v1.md#L1)
- [slam_frontend_codex_prompt_v1.md](/home/baer/Doraemon/docs/slam_frontend_codex_prompt_v1.md#L1)

推荐执行顺序：

1. 先建立 rosbridge 连接层
2. 再封装 service/topic API
3. 再做状态总览
4. 再做定位表单
5. 再做建图表单
6. 最后补 job 历史和调试增强
