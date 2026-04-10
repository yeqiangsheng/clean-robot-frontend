# SLAM Frontend Interface v1

这份文档面向前端工程和前端 Codex，目标是让前端在当前工程规范下，基于 `slam_workflow_manager` 正确完成 SLAM 页面联调。

## 1. 当前前后端对接规范

当前工程的规范是：

- 浏览器访问前端页面：HTTP
- 前端页面和机器人后端交互：`rosbridge websocket`
- 前端数据调用方式：`roslibjs` 上跑 ROS service + topic
- 前端 v1 不把主业务链改写成普通 HTTP REST 契约

也就是说，前端的正式主链不是 `fetch('/api/...')`，而是：

1. 前端通过 `ws://<robot-ip>:9090` 连接 `rosbridge`
2. 用 `ROSLIB.Service` 调 ROS service
3. 用 `ROSLIB.Topic` 订阅 ROS topic

相关总体规范可参考：

- [frontend_backend_interface_v1.md](/home/baer/Doraemon/docs/frontend_backend_interface_v1.md#L723)
- [frontend_integration_acceptance_v1.md](/home/baer/Doraemon/docs/frontend_integration_acceptance_v1.md#L59)
- [windows_frontend_codex_kickoff.md](/home/baer/Doraemon/docs/windows_frontend_codex_kickoff.md#L159)

## 2. 本文档覆盖范围

本文档只覆盖当前 `slam_workflow_manager` 这一层对前端可直接使用的接口：

- 状态查询
- job 查询
- job 取消
- runtime 状态同步
- 切图定位
- 重定位
- 建图
- 保存地图
- 停止建图
- 状态 topic 订阅

不覆盖：

- `visual_command` 专家级低层接口
- Cartographer 原始调试 topic
- 可选 HTTP gateway 的云端/自动化场景

## 3. 前端必须依赖的后端接口

### 3.1 rosbridge 连接

前端通过 `rosbridge websocket` 连接机器人：

```text
ws://<robot-ip>:9090
```

建议做成前端环境变量：

```env
VITE_ROSBRIDGE_URL=ws://192.168.1.100:9090
```

### 3.1.1 rosbridge 启动前提

前端能否连上，不取决于 `slam_workflow_manager` 自己，而取决于机器人侧是否已经起了 `rosbridge`。

要点：

- `slam_workflow_runtime.launch` 负责 SLAM runtime 和 workflow
- 它本身不等于一定带起 `rosbridge`
- `cleanrobot_nav_flex.launch` 已废弃，不作为当前前端联调入口
- 当前需要时，请单独启动：
  - `roslaunch rosbridge_server rosbridge_websocket.launch`

所以前端联调前要先确认：

1. 机器人侧 `rosbridge` 已在线
2. WebSocket 地址和端口可达
3. 前端配置的 `VITE_ROSBRIDGE_URL` 与现场地址一致

### 3.2 ROS services

前端正式可调用的 service：

- `/slam_workflow/get_state`
  - 类型：`my_msg_srv/GetSlamWorkflowState`
- `/slam_workflow/get_job`
  - 类型：`my_msg_srv/GetSlamWorkflowJob`
- `/slam_workflow/cancel_job`
  - 类型：`my_msg_srv/CancelSlamWorkflowJob`
- `/slam_workflow/sync_runtime_state`
  - 类型：`my_msg_srv/SyncSlamRuntimeState`
- `/slam_workflow/submit_prepare_for_task`
  - 类型：`my_msg_srv/SubmitSlamWorkflow`
- `/slam_workflow/submit_switch_map_and_localize`
  - 类型：`my_msg_srv/SubmitSlamWorkflow`
- `/slam_workflow/submit_relocalize`
  - 类型：`my_msg_srv/SubmitSlamWorkflow`
- `/slam_workflow/submit_start_mapping`
  - 类型：`my_msg_srv/SubmitSlamWorkflow`
- `/slam_workflow/submit_save_map`
  - 类型：`my_msg_srv/SubmitSlamWorkflow`
- `/slam_workflow/submit_stop_mapping`
  - 类型：`my_msg_srv/SubmitSlamWorkflow`

这些 service 由 [slam_workflow_manager_node.py](/home/baer/Doraemon/src/slam_workflow_manager/scripts/slam_workflow_manager_node.py#L178) 注册。

### 3.3 ROS topic

前端正式应订阅：

- `/slam_workflow/state`
  - 类型：`my_msg_srv/SlamWorkflowState`

这是页面实时状态流，来自 [slam_workflow_manager_node.py](/home/baer/Doraemon/src/slam_workflow_manager/scripts/slam_workflow_manager_node.py#L145)。

## 4. 核心交互模型

前端要按“异步 job 工作流”来理解 SLAM 交互，而不是“点击按钮立刻成功”。

### 4.1 submit_* 的语义

所有 `submit_*` service 的返回都只是：

- 任务是否被受理
- 新生成的 `job_id`
- 当前 workflow 进入了什么阶段

不是最终业务结果。

也就是说：

- `accepted=true` 只表示“任务已接收”
- 最终成功与否要继续查 `get_job`

### 4.2 正确的前端处理顺序

每次调用 `submit_*` 后，前端都应：

1. 保存 `job_id`
2. 开始轮询 `/slam_workflow/get_job`
3. 同时刷新一次 `/slam_workflow/get_state`
4. 继续订阅 `/slam_workflow/state`
5. 直到 job 进入终态再停止轮询

### 4.3 job 终态

前端要识别这些终态：

- `SUCCEEDED`
- `FAILED`
- `MANUAL_ASSIST_REQUIRED`
- `CANCELED`

## 5. Service 契约

### 5.1 SubmitSlamWorkflow

服务类型：`my_msg_srv/SubmitSlamWorkflow`

请求字段：

- `robot_id`
- `map_name`
- `frame_id`
- `has_initial_pose`
- `initial_pose_x`
- `initial_pose_y`
- `initial_pose_yaw`
- `save_map_name`
- `include_unfinished_submaps`
- `set_active_on_save`
- `switch_to_localization_after_save`
- `relocalize_after_switch`

响应字段：

- `accepted`
- `message`
- `job_id`
- `job_type`
- `workflow_state`
- `manual_assist_required`

源码定义见 [SubmitSlamWorkflow.srv](/home/baer/Doraemon/src/my_msg_srv/srv/SubmitSlamWorkflow.srv#L1)。

#### 字段使用规则

- 切图定位时，核心字段看 `map_name`
- 手动重定位时，若已知初始位姿，要设：
  - `has_initial_pose=true`
  - `initial_pose_x / initial_pose_y / initial_pose_yaw`
- 保存地图时，输出地图名看 `save_map_name`
- `submit_save_map` 时不要把 `map_name` 当成输出地图名

#### v1 页面建议默认值

对于前端 v1，建议默认带：

- `robot_id = "local_robot"`
- `frame_id = "map"`
- `include_unfinished_submaps = false`
- `set_active_on_save = true`
- `switch_to_localization_after_save = false`
- `relocalize_after_switch = false`

### 5.2 GetSlamWorkflowState

服务类型：`my_msg_srv/GetSlamWorkflowState`

请求字段：

- `robot_id`

响应字段：

- `found`
- `state`

源码定义见 [GetSlamWorkflowState.srv](/home/baer/Doraemon/src/my_msg_srv/srv/GetSlamWorkflowState.srv#L1)。

### 5.3 SlamWorkflowState

消息类型：`my_msg_srv/SlamWorkflowState`

关键字段：

- `workflow_state`
- `workflow_phase`
- `busy`
- `active_job_id`
- `runtime_mode`
- `runtime_map_name`
- `runtime_map_id`
- `runtime_map_md5`
- `asset_active_map_name`
- `runtime_map_match`
- `localization_state`
- `localization_valid`
- `mapping_session_active`
- `task_ready`
- `manual_assist_required`
- `progress_text`
- `blocking_reason`
- `last_error_code`
- `last_error_message`
- `updated_ts`

源码定义见 [SlamWorkflowState.msg](/home/baer/Doraemon/src/my_msg_srv/msg/SlamWorkflowState.msg#L1)。

#### 前端最应该展示的状态字段

顶层页面建议优先显示：

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

#### 常见状态语义

- `workflow_state = IDLE`
  - 当前没有活跃 job，也不在建图会话
- `workflow_state = LOCALIZED`
  - 当前定位有效，可进入任务准备态
- `workflow_state = LOCALIZING`
  - 正在重定位或等待定位稳定
- `workflow_state = MAPPING`
  - 当前处于建图会话
- `workflow_state = MANUAL_ASSIST_REQUIRED`
  - 自动定位没有收敛，需要人工给初始位姿

#### task_ready 的产品语义

对页面来说，`task_ready=true` 可以近似理解为：

- 当前在定位模式
- 运行时地图与选中地图一致
- 已定位成功
- 当前没有建图会话
- 当前没有阻塞性人工辅助状态

### 5.4 GetSlamWorkflowJob

服务类型：`my_msg_srv/GetSlamWorkflowJob`

请求字段：

- `job_id`

响应字段：

- `found`
- `job_id`
- `job_type`
- `job_state`
- `workflow_phase`
- `progress_percent`
- `progress_text`
- `result_success`
- `result_code`
- `result_message`
- `runtime_map_name`
- `runtime_map_match`
- `localization_state`
- `localization_valid`
- `manual_assist_required`
- `created_ts`
- `updated_ts`
- `finished_ts`

源码定义见 [GetSlamWorkflowJob.srv](/home/baer/Doraemon/src/my_msg_srv/srv/GetSlamWorkflowJob.srv#L1)。

#### 前端最应该展示的 job 字段

- `job_type`
- `job_state`
- `workflow_phase`
- `progress_percent`
- `progress_text`
- `result_code`
- `result_message`

### 5.5 CancelSlamWorkflowJob

服务类型：`my_msg_srv/CancelSlamWorkflowJob`

请求字段：

- `job_id`

响应字段：

- `success`
- `message`
- `job_state`

源码定义见 [CancelSlamWorkflowJob.srv](/home/baer/Doraemon/src/my_msg_srv/srv/CancelSlamWorkflowJob.srv#L1)。

### 5.6 SyncSlamRuntimeState

服务类型：`my_msg_srv/SyncSlamRuntimeState`

请求字段：

- `robot_id`

响应字段：

- `success`
- `message`
- `state`

源码定义见 [SyncSlamRuntimeState.srv](/home/baer/Doraemon/src/my_msg_srv/srv/SyncSlamRuntimeState.srv#L1)。

## 6. 前端页面该怎么调用

### 6.1 页面初始化

页面加载建议按这个顺序：

1. 建立 rosbridge 连接
2. 调一次 `/slam_workflow/get_state`
3. 订阅 `/slam_workflow/state`
4. 如果存在本地缓存的 `active_job_id`，恢复 job 轮询

### 6.2 切图定位

主 service：

- `/slam_workflow/submit_switch_map_and_localize`

典型请求：

- `map_name = "0327-1"`
- `has_initial_pose = false`

前端动作：

1. 调 submit service
2. 拿到 `job_id`
3. 轮询 `/slam_workflow/get_job`
4. 观察 `/slam_workflow/state`
5. 若 job 进入 `SUCCEEDED`，刷新状态
6. 若 job 进入 `MANUAL_ASSIST_REQUIRED`，弹出“人工辅助定位”表单

### 6.3 手动重定位

主 service：

- `/slam_workflow/submit_relocalize`

两种模式都要支持：

- 不带初始位姿
- 带初始位姿

如果自动重定位失败，页面要引导用户输入：

- `x`
- `y`
- `yaw`

然后以 `has_initial_pose=true` 再调一次 `submit_relocalize`。

### 6.4 建图

建图页面需要支持完整顺序：

1. `/slam_workflow/submit_start_mapping`
2. `/slam_workflow/submit_save_map`
3. `/slam_workflow/submit_stop_mapping`

#### 建图页必须明确提醒用户

- 要先保存地图，再停止建图
- 保存输出文件名来自 `save_map_name`
- 不是 `map_name`

#### 当前实现的关键行为

- `submit_start_mapping` 成功后，`mapping_session_active=true`
- `submit_save_map` 只有在建图会话 active 时才会成功
- `submit_stop_mapping` 会结束建图会话

这些行为来自 [slam_workflow_manager_node.py](/home/baer/Doraemon/src/slam_workflow_manager/scripts/slam_workflow_manager_node.py#L858)。

### 6.5 任务前准备

主 service：

- `/slam_workflow/submit_prepare_for_task`

语义：

- 如果当前已经在正确地图上并且已定位好，会快速返回 ready
- 否则内部会走切图定位流程

适合放在：

- 任务启动前检查
- 执行任务前“一键准备”

## 7. roslibjs 对接建议

### 7.1 连接层

前端应单独封装：

- `Ros` 连接管理
- service 调用层
- topic 订阅层

不要把 `new ROSLIB.Service(...)` 散落在页面组件里。

### 7.2 推荐目录

建议至少拆成：

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
  pages/
    SlamWorkbenchPage.tsx
  types/
    slam-workflow.ts
```

### 7.3 roslibjs 示例

建立连接：

```ts
import ROSLIB from 'roslib';

const ros = new ROSLIB.Ros({
  url: import.meta.env.VITE_ROSBRIDGE_URL,
});
```

调用 service：

```ts
const service = new ROSLIB.Service({
  ros,
  name: '/slam_workflow/get_state',
  serviceType: 'my_msg_srv/GetSlamWorkflowState',
});

service.callService(
  new ROSLIB.ServiceRequest({ robot_id: 'local_robot' }),
  (resp) => console.log(resp),
  (err) => console.error(err),
);
```

订阅 topic：

```ts
const topic = new ROSLIB.Topic({
  ros,
  name: '/slam_workflow/state',
  messageType: 'my_msg_srv/SlamWorkflowState',
});

topic.subscribe((msg) => {
  console.log(msg.workflow_state, msg.runtime_map_name);
});
```

## 8. 前端轮询建议

建议：

- `state` 初次进入页面就拉一次
- `state` 常规轮询：2 秒
- `job` 活跃时轮询：1 秒
- `job` 进入终态后停止轮询
- 同时保留 `/slam_workflow/state` 订阅，做页面实时刷新

推荐策略：

- `topic` 负责“实时更新”
- `get_state` 负责“页面初始化”和“断线恢复”
- `get_job` 负责“异步操作结果确认”

## 9. 失败态处理要求

### 9.1 submit 返回 accepted=false

前端应直接提示：

- 当前已有 job 在运行
- 不要进入新的轮询流程

### 9.2 get_job 返回 FAILED

页面要直接展示：

- `result_code`
- `result_message`

### 9.3 get_job 返回 MANUAL_ASSIST_REQUIRED

页面要：

- 明确显示“需要人工辅助定位”
- 展开初始位姿输入表单
- 引导用户调用 `submit_relocalize`

### 9.4 常见错误文案理解

- `mapping_inactive`
  - 当前不在建图会话，不能保存地图
- `map_exists`
  - 保存地图名称重复
- `visual_command_failed`
  - 底层 Cartographer/重定位流程失败
- `manual_assist_required`
  - 自动流程没收敛，需要人工介入

## 10. 页面建议最少做出的功能块

前端 Codex 至少应完成：

1. 连接状态卡片
2. 当前 SLAM 状态总览
3. 切图并定位表单
4. 手动重定位表单
5. 开始建图表单
6. 保存地图表单
7. 停止建图操作
8. 当前 job 卡片
9. 最近 job 记录
10. 原始 state/job JSON 查看器

## 11. 当前 v1 不建议的做法

- 不要把浏览器主业务链改成 HTTP REST
- 不要直接调 `visual_command`
- 不要依赖 `/map` 原始 topic 代替 workflow 状态
- 不要把 rosbridge 调用写散到组件里
- 不要把 `accepted=true` 当成最终成功

## 12. 可选北向 HTTP Gateway

仓库里现在确实已经有一个 `slam_http_gateway`，但它更适合：

- 云端系统
- 非 ROS 客户端
- 自动化测试
- 将来北向开放接口

不作为当前浏览器前端主链标准。

如果前端要遵循当前工程规范，请优先按本文档的 `rosbridge + ROS service/topic` 方案实现。
