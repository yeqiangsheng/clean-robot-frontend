# SLAM Workflow Bringup And Debug

## Canonical Launches

新的正式入口只有两套：

- 只启动 SLAM runtime 和 workflow：
  - `roslaunch slam_workflow_manager slam_workflow_runtime.launch`
- 启动 SLAM runtime + task/executor 全链路：
  - `roslaunch slam_workflow_manager slam_workflow_system.launch`

上层集成入口已经改到新链路：

- `roslaunch robot_hw_bridge bringup_real_robot.launch`

说明：

- `cleanrobot_nav_flex.launch` 已废弃，不作为当前标准入口

## Startup From Base And Sensors

下面这套顺序适合真机分阶段启动，能够从底盘、传感器、SLAM runtime 一路起到建图或定位。

所有终端先执行：

```bash
source /home/baer/Doraemon/devel/setup.bash
```

### Step 1: Start URDF And Sensors

终端 1：

```bash
roslaunch cleanrobot cleanrobot_base.launch
```

这个 launch 会起：

- 机器人 URDF 和 TF
- 激光雷达
- IMU
- 轮速 odom bridge 和 `/odom`
- RealSense 相机

建议先确认下面这些 topic 已经有数据：

```bash
rostopic list | egrep '^/scan$|^/imu/data$|^/odom$|^/camera|^/cam_'
```

### Step 2: Start Chassis And Station Bridges

终端 2：

```bash
roslaunch robot_hw_bridge hardware_bridges.launch
```

这个 launch 会起：

- `mcore_tcp_bridge`
- `station_tcp_bridge`
- `dock_supply_manager`

建议确认：

```bash
rostopic list | egrep '^/battery_state$|^/combined_status$|^/station_status$'
```

### Step 3: Start SLAM Runtime

终端 3：

```bash
roslaunch slam_workflow_manager slam_workflow_runtime.launch
```

默认会同时起：

- `slam_workflow_manager`
- `cartographer_supervisor`
- `slam_http_gateway`

默认会把数据库、地图目录和 HTTP gateway 放到：

- `~/.ros/coverage/planning.db`
- `~/.ros/coverage/operations.db`
- `/home/baer/Doraemon/src/slam_workflow_manager/runtime/map/`
- `http://<robot-ip>:8088`

建议确认：

```bash
rosservice list | egrep '/slam_workflow|/visual_command|/cartographer/runtime/reload'
rostopic list | egrep '^/map$|^/tracked_pose$|^/slam_workflow/state$'
curl http://127.0.0.1:8088/healthz
```

### Step 4: Optional Navigation Stack

如果你要继续跑导航、规划器和地图约束，再起：

终端 4：

```bash
roslaunch clean_robot_description mbf_nav.launch start_map_asset_service:=false
```

如果还要区域规划器：

终端 5：

```bash
roslaunch coverage_planner planner_server.launch
```

## If Service Is Not Available

如果你执行 `rosservice call /slam_workflow/...` 时提示 `Service is not available`，优先检查：

```bash
rosnode list | egrep 'slam_workflow_manager|cartographer_supervisor|slam_runtime_param_bridge'
rosservice list | egrep '/slam_workflow|/visual_command|/cartographer/runtime/reload'
```

正常情况下至少应看到：

- `/slam_workflow_manager`
- `/cartographer_supervisor`
- `/slam_runtime_param_bridge`

如果只看到 `/slam_runtime_param_bridge`，通常说明 runtime launch 只起了一部分，`slam_workflow_manager` 或 `cartographer_supervisor` 已经异常退出。

## One-Command Bringup

如果你不想分阶段起，也可以直接用集成入口：

- 真机全链路：
  - `roslaunch robot_hw_bridge bringup_real_robot.launch`

如果前端还需要 rosbridge websocket，请单独启动：

```bash
roslaunch rosbridge_server rosbridge_websocket.launch
```

默认地址：

- `ws://<robot-ip>:9090`

## Mapping Workflow

下面是“从已经起好底盘/传感器/SLAM runtime 开始”的建图顺序。

### 1. Start Mapping

```bash
rosservice call /slam_workflow/submit_start_mapping "{
  robot_id: 'local_robot',
  map_name: 'factory_map_20260401',
  frame_id: 'map',
  has_initial_pose: false,
  initial_pose_x: 0.0,
  initial_pose_y: 0.0,
  initial_pose_yaw: 0.0,
  save_map_name: '',
  include_unfinished_submaps: false,
  set_active_on_save: false,
  switch_to_localization_after_save: false,
  relocalize_after_switch: false
}"
```

### 2. Watch State

```bash
rostopic echo /slam_workflow/state
```

或者用返回的 `job_id` 轮询：

```bash
rosservice call /slam_workflow/get_job "{job_id: 'slam_job_xxx'}"
```

### 3. Move The Robot To Build The Map

用遥控或底盘控制让机器人覆盖完整区域，期间确认 `/map` 持续更新：

```bash
rostopic hz /map
```

### 4. Save The Map

先保存，再停建图：

```bash
rosservice call /slam_workflow/submit_save_map "{
  robot_id: 'local_robot',
  map_name: '',
  frame_id: 'map',
  has_initial_pose: false,
  initial_pose_x: 0.0,
  initial_pose_y: 0.0,
  initial_pose_yaw: 0.0,
  save_map_name: 'factory_map_20260401',
  include_unfinished_submaps: false,
  set_active_on_save: true,
  switch_to_localization_after_save: false,
  relocalize_after_switch: false
}"
```

### 5. Stop Mapping

```bash
rosservice call /slam_workflow/submit_stop_mapping "{
  robot_id: 'local_robot',
  map_name: '',
  frame_id: 'map',
  has_initial_pose: false,
  initial_pose_x: 0.0,
  initial_pose_y: 0.0,
  initial_pose_yaw: 0.0,
  save_map_name: '',
  include_unfinished_submaps: false,
  set_active_on_save: false,
  switch_to_localization_after_save: false,
  relocalize_after_switch: false
}"
```

### 6. Optional: Switch Directly To Localization

```bash
rosservice call /slam_workflow/submit_switch_map_and_localize "{
  robot_id: 'local_robot',
  map_name: 'factory_map_20260401',
  frame_id: 'map',
  has_initial_pose: false,
  initial_pose_x: 0.0,
  initial_pose_y: 0.0,
  initial_pose_yaw: 0.0,
  save_map_name: '',
  include_unfinished_submaps: false,
  set_active_on_save: false,
  switch_to_localization_after_save: false,
  relocalize_after_switch: false
}"
```

## Localization Workflow

下面是“已有地图后”的定位顺序。

### 1. Start Base, Sensors And Runtime

按前面的顺序至少起到：

1. `roslaunch cleanrobot cleanrobot_base.launch`
2. `roslaunch robot_hw_bridge hardware_bridges.launch`
3. `roslaunch slam_workflow_manager slam_workflow_runtime.launch`

如果要完整运行导航任务，再补：

4. `roslaunch clean_robot_description mbf_nav.launch start_map_asset_service:=false`
5. `roslaunch coverage_planner planner_server.launch`

### 2. Switch Map And Localize

如果希望自动全局重定位：

```bash
rosservice call /slam_workflow/submit_switch_map_and_localize "{
  robot_id: 'local_robot',
  map_name: 'factory_map_20260401',
  frame_id: 'map',
  has_initial_pose: false,
  initial_pose_x: 0.0,
  initial_pose_y: 0.0,
  initial_pose_yaw: 0.0,
  save_map_name: '',
  include_unfinished_submaps: false,
  set_active_on_save: false,
  switch_to_localization_after_save: false,
  relocalize_after_switch: false
}"
```

### 3. Manual Relocalize With Initial Pose

如果自动重定位不收敛，直接给初始位姿：

```bash
rosservice call /slam_workflow/submit_relocalize "{
  robot_id: 'local_robot',
  map_name: 'factory_map_20260401',
  frame_id: 'map',
  has_initial_pose: true,
  initial_pose_x: 1.0,
  initial_pose_y: 2.0,
  initial_pose_yaw: 0.5,
  save_map_name: '',
  include_unfinished_submaps: false,
  set_active_on_save: false,
  switch_to_localization_after_save: false,
  relocalize_after_switch: false
}"
```

### 4. Confirm Localization Ready

```bash
rosservice call /slam_workflow/get_state "{robot_id: 'local_robot'}"
rostopic echo /slam_workflow/state
```

期望看到：

- `runtime_mode: localization`
- `localization_state: localized`
- `localization_valid: true`
- `task_ready: true`

## Bringup Order

推荐的启动顺序：

1. 如果是真机，先起硬件桥和底盘相关依赖：
   - `roslaunch robot_hw_bridge hardware_bridges.launch`
2. 起导航和 SLAM 工作流：
   - 真机：`roslaunch robot_hw_bridge bringup_real_robot.launch`
3. 确认核心服务已出现：
   - `rosservice list | grep /slam_workflow`
   - `rosservice list | grep /visual_command`
   - `rosservice list | grep /cartographer/runtime/reload`
4. 如果前端要联调，再单独起：
   - `roslaunch rosbridge_server rosbridge_websocket.launch`

## Common Commands

查看整体状态：

```bash
rosservice call /slam_workflow/get_state "{robot_id: 'local_robot'}"
```

查看状态 topic：

```bash
rostopic echo /slam_workflow/state
```

提交任务前准备：

```bash
rosservice call /slam_workflow/submit_prepare_for_task "{
  robot_id: 'local_robot',
  map_name: 'factory_map',
  frame_id: 'map',
  has_initial_pose: false,
  initial_pose_x: 0.0,
  initial_pose_y: 0.0,
  initial_pose_yaw: 0.0,
  save_map_name: '',
  include_unfinished_submaps: false,
  set_active_on_save: false,
  switch_to_localization_after_save: false,
  relocalize_after_switch: false
}"
```

手动带初始位姿重定位：

```bash
rosservice call /slam_workflow/submit_relocalize "{
  robot_id: 'local_robot',
  map_name: 'factory_map',
  frame_id: 'map',
  has_initial_pose: true,
  initial_pose_x: 1.0,
  initial_pose_y: 2.0,
  initial_pose_yaw: 0.5,
  save_map_name: '',
  include_unfinished_submaps: false,
  set_active_on_save: false,
  switch_to_localization_after_save: false,
  relocalize_after_switch: false
}"
```

轮询 job：

```bash
rosservice call /slam_workflow/get_job "{job_id: 'slam_job_xxx'}"
```

取消 job：

```bash
rosservice call /slam_workflow/cancel_job "{job_id: 'slam_job_xxx'}"
```

同步 runtime 状态：

```bash
rosservice call /slam_workflow/sync_runtime_state "{robot_id: 'local_robot'}"
```

## Current Frontend Standard

当前工程里，浏览器前端的正式主链仍然是：

- 浏览器访问前端页面：HTTP
- 前端与机器人后端交互：`rosbridge websocket`
- 在 websocket 上跑：ROS service + topic

也就是说，当前前端页面应优先调用：

- `/slam_workflow/get_state`
- `/slam_workflow/get_job`
- `/slam_workflow/cancel_job`
- `/slam_workflow/sync_runtime_state`
- `/slam_workflow/submit_*`
- `/slam_workflow/state`

而不是优先走普通 HTTP REST。

## Optional HTTP Gateway

仓库里现在也提供了一个可选北向接口 `slam_http_gateway`，默认地址：

- `http://<robot-ip>:8088`

健康检查：

```bash
curl http://127.0.0.1:8088/healthz
```

接口发现：

```bash
curl http://127.0.0.1:8088/api/v1/slam
```

### Official HTTP Endpoints

- `GET /healthz`
- `GET /api/v1/slam`
- `GET /api/v1/slam/state?robot_id=local_robot`
- `POST /api/v1/slam/runtime/sync`
- `GET /api/v1/slam/jobs/<job_id>`
- `POST /api/v1/slam/jobs/<job_id>/cancel`
- `POST /api/v1/slam/jobs/prepare-for-task`
- `POST /api/v1/slam/jobs/switch-map-and-localize`
- `POST /api/v1/slam/jobs/relocalize`
- `POST /api/v1/slam/jobs/start-mapping`
- `POST /api/v1/slam/jobs/save-map`
- `POST /api/v1/slam/jobs/stop-mapping`

另外也兼容一组和 ROS service 同名的 HTTP 别名：

- `POST /api/v1/slam/submit_prepare_for_task`
- `POST /api/v1/slam/submit_switch_map_and_localize`
- `POST /api/v1/slam/submit_relocalize`
- `POST /api/v1/slam/submit_start_mapping`
- `POST /api/v1/slam/submit_save_map`
- `POST /api/v1/slam/submit_stop_mapping`

### HTTP Examples

查询当前状态：

```bash
curl http://127.0.0.1:8088/api/v1/slam/state?robot_id=local_robot
```

同步 runtime 状态：

```bash
curl -X POST http://127.0.0.1:8088/api/v1/slam/runtime/sync \
  -H 'Content-Type: application/json' \
  -d '{"robot_id":"local_robot"}'
```

切图并自动重定位：

```bash
curl -X POST http://127.0.0.1:8088/api/v1/slam/jobs/switch-map-and-localize \
  -H 'Content-Type: application/json' \
  -d '{
    "robot_id":"local_robot",
    "map_name":"0327-1",
    "frame_id":"map",
    "has_initial_pose":false,
    "initial_pose_x":0.0,
    "initial_pose_y":0.0,
    "initial_pose_yaw":0.0,
    "save_map_name":"",
    "include_unfinished_submaps":false,
    "set_active_on_save":false,
    "switch_to_localization_after_save":false,
    "relocalize_after_switch":false
  }'
```

建图：

```bash
curl -X POST http://127.0.0.1:8088/api/v1/slam/jobs/start-mapping \
  -H 'Content-Type: application/json' \
  -d '{
    "robot_id":"local_robot",
    "map_name":"factory_map_20260401",
    "frame_id":"map",
    "has_initial_pose":false,
    "initial_pose_x":0.0,
    "initial_pose_y":0.0,
    "initial_pose_yaw":0.0,
    "save_map_name":"",
    "include_unfinished_submaps":false,
    "set_active_on_save":false,
    "switch_to_localization_after_save":false,
    "relocalize_after_switch":false
  }'
```

保存地图：

```bash
curl -X POST http://127.0.0.1:8088/api/v1/slam/jobs/save-map \
  -H 'Content-Type: application/json' \
  -d '{
    "robot_id":"local_robot",
    "map_name":"",
    "frame_id":"map",
    "has_initial_pose":false,
    "initial_pose_x":0.0,
    "initial_pose_y":0.0,
    "initial_pose_yaw":0.0,
    "save_map_name":"0401-1",
    "include_unfinished_submaps":false,
    "set_active_on_save":true,
    "switch_to_localization_after_save":false,
    "relocalize_after_switch":false
  }'
```

查询 job：

```bash
curl http://127.0.0.1:8088/api/v1/slam/jobs/slam_job_xxx
```

取消 job：

```bash
curl -X POST http://127.0.0.1:8088/api/v1/slam/jobs/slam_job_xxx/cancel
```

### HTTP Response Shape

`GET /api/v1/slam/state` 返回：

```json
{
  "ok": true,
  "service": "/slam_workflow/get_state",
  "robot_id": "local_robot",
  "found": true,
  "state": {
    "workflow_state": "LOCALIZED",
    "workflow_phase": "localized",
    "busy": false,
    "runtime_mode": "localization",
    "runtime_map_name": "0327-1",
    "runtime_map_match": true,
    "localization_state": "localized",
    "localization_valid": true,
    "mapping_session_active": false,
    "task_ready": true,
    "manual_assist_required": false,
    "progress_text": "",
    "blocking_reason": "",
    "last_error_code": "",
    "last_error_message": ""
  }
}
```

`POST /api/v1/slam/jobs/*` 返回：

```json
{
  "ok": true,
  "service": "/slam_workflow/submit_switch_map_and_localize",
  "request": {
    "robot_id": "local_robot",
    "map_name": "0327-1"
  },
  "accepted": true,
  "message": "accepted",
  "job_id": "slam_job_xxx",
  "job_type": "SWITCH_MAP_AND_LOCALIZE",
  "workflow_state": "SWITCH_MAP_AND_LOCALIZE",
  "manual_assist_required": false
}
```

前端要继续轮询：

- `GET /api/v1/slam/jobs/<job_id>`
- `GET /api/v1/slam/state`

直到 job 进入 `SUCCEEDED / FAILED / MANUAL_ASSIST_REQUIRED / CANCELED`。

## WebSocket

当前浏览器前端的正式标准优先走 rosbridge websocket。

如果你需要 ROS 原始 topic / service 联调，当前推荐直接手动起：

```bash
roslaunch rosbridge_server rosbridge_websocket.launch
```

建议分工：

- rosbridge websocket：当前浏览器前端主链、专家调试、topic 观测、原始 ROS 联调
- HTTP gateway：云端任务编排、自动化测试、非 ROS 客户端

## ROS Server Debugging

下面这组命令适合现场排查 “为什么服务不通 / 为什么定位不成功 / 为什么建图没保存”。

### 1. Process And Node Check

```bash
rosnode list
rosnode info /slam_workflow_manager
rosnode info /cartographer_supervisor
rosnode info /slam_http_gateway
```

### 2. Service Check

```bash
rosservice list | egrep 'slam_workflow|visual_command|write_state|reload'
rosservice info /slam_workflow/get_state
rosservice info /slam_workflow/submit_switch_map_and_localize
```

### 3. Sensor And Runtime Topic Check

```bash
rostopic hz /scan
rostopic hz /odom
rostopic hz /tracked_pose
rostopic hz /map
rostopic echo -n 1 /slam_workflow/state
```

### 4. TF Check

```bash
rosrun tf tf_echo map odom
rosrun tf tf_echo odom base_footprint
```

### 5. Runtime Param Check

```bash
rosparam get /cartographer/runtime/current_mode
rosparam get /cartographer/runtime/map_name
rosparam get /cartographer/runtime/pbstream_path
rosparam get /cartographer/runtime/localization_state
rosparam get /map_name
rosparam get /map_md5
```

### 6. Workflow State Check

```bash
rosservice call /slam_workflow/get_state "{robot_id: 'local_robot'}"
rosservice call /slam_workflow/sync_runtime_state "{robot_id: 'local_robot'}"
rosservice call /slam_workflow/get_job "{job_id: 'slam_job_xxx'}"
```

### 7. Relocalization Debug

手动触发 `try_global_relocate`：

```bash
rosservice call /visual_command "{
  command: 'try_global_relocate',
  payload_json: '{}'
}"
```

如果 `code != 0`，常见含义是：

- `-6`
  - 等待新的激光 / node 数据超时
  - 常见根因是 `/scan` 虽然有，但定位模式需要的 `/odom` 或 TF 链没起来，Cartographer 没产出新 node
- `-8`
  - 没有候选位姿
- `-9`
  - 候选位姿存在，但精匹配分数不够

### 8. HTTP Gateway Debug

```bash
curl http://127.0.0.1:8088/healthz
curl http://127.0.0.1:8088/api/v1/slam/state?robot_id=local_robot
curl http://127.0.0.1:8088/api/v1/slam/jobs/slam_job_xxx
```

## Quick Checks

核心服务：

```bash
rosservice list | egrep 'slam_workflow|visual_command|write_state|reload'
```

核心 topic：

```bash
rostopic list | egrep '^/map$|^/tracked_pose$|^/slam_workflow/state$'
```

核心参数：

```bash
rosparam get /cartographer/runtime/current_mode
rosparam get /cartographer/runtime/localization_state
rosparam get /map_name
rosparam get /map_md5
```

## Failure Hints

- `/visual_command` 不存在：先检查 `cartographer_supervisor` 是否起来，以及 `SLAM_ROOT` 是否指向 `slam_workflow_manager/runtime`。
- `submit_prepare_for_task` 一直失败：优先检查目标地图是否已经注册到 `planning.db`，以及 `slam_workflow_manager/runtime/map/*.pbstream` 是否存在。
- job 卡在 `MANUAL_ASSIST_REQUIRED`：说明自动重定位没有收敛，需要人工给初始位姿后再调 `submit_relocalize`。
- `/map` 有数据但 `localized=false`：优先检查 `/tracked_pose` 和 `map->odom` TF。
