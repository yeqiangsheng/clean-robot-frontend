# SLAM Frontend Live Acceptance v1

这份文档记录 `2026-04-01` 这一轮 `SLAM Workbench` 前端 live 联调与动作链验收结果，目标是作为正式留档，而不是新的执行提示词。

相关上下文文档：

- [slam_frontend_engineering_v1.md](./slam_frontend_engineering_v1.md)
- [slam_frontend_interface_v1.md](./slam_frontend_interface_v1.md)
- [slam_frontend_codex_prompt_v1.md](./slam_frontend_codex_prompt_v1.md)
- [slam_frontend_live_acceptance_prompt_v1.md](./slam_frontend_live_acceptance_prompt_v1.md)
- [slam_workflow_bringup_debug_v1.md](./slam_workflow_bringup_debug_v1.md)

## 1. 验收范围

本轮验收对象是已经接入现有前端工程的 `SLAM Workbench` 正式页面，不是独立 demo。

前后端对接主链是：

- 浏览器访问前端页面：HTTP
- 前端与机器人后端交互：`rosbridge websocket`
- 页面数据调用：`roslibjs` 上跑 ROS service + topic

本轮 live 环境：

- `rosbridge_url = ws://10.0.0.157:9090`
- 后端核心能力来自 `slam_workflow_manager`
- 页面使用现有 `SLAM` tab 和现有状态管理/组件体系

## 2. 验收基线

本轮开始前的后端基线状态为：

- `workflow_state = LOCALIZED`
- `runtime_mode = localization`
- `runtime_map_name = 0327-1`
- `runtime_map_match = true`
- `localization_state = localized`
- `localization_valid = true`
- `mapping_session_active = false`
- `task_ready = true`

页面侧基线预期为：

- `Connected`
- `LOCALIZED`
- `runtime_map_name = 0327-1`
- `topic live`
- `no active job`

## 3. 总体结论

本轮可以确认：

- `SLAM Workbench` 已与当前 `slam_workflow_manager` 真正接通
- live 只读链路通过
- live 定位动作链通过
- 建图动作链未因前端问题阻塞，而是因现场安全条件未执行

当前阶段可给出的结论是：

- `SLAM Workbench live 定位链验收通过`
- `SLAM Workbench live 建图链待现场条件允许后补验`
- `cancel_job` 与 `MANUAL_ASSIST_REQUIRED` 联动待可复现场景补验

## 4. 已通过项

### 4.1 Step 0: Connected / Baseline

状态：`passed`

结果：

- 页面成功连接 `ws://10.0.0.157:9090`
- 页面显示 `Connected`
- 页面状态与后端基线一致：
  - `LOCALIZED`
  - `localization`
  - `0327-1`
  - `topic live`
  - `no active job`
- 页面 JSON drawer 可看到原始 state payload

### 4.2 Step 1: Sync Runtime State

状态：`passed`

结果：

- 页面成功触发 `sync_runtime_state`
- 页面反馈 `Runtime sync completed`
- 同步后状态仍与基线保持一致
- 未观察到异常状态跳变

### 4.3 Step 2: Prepare For Task

状态：`passed`

结果：

- 页面成功创建 job：`slam_job_31177fc2d30b`
- job 终态：`SUCCEEDED`
- `result_code = ok`
- `result_message = ready`

结论：

- `submit_prepare_for_task` 页面链路正常
- job 创建、轮询、终态展示正常

### 4.4 Step 3: Switch Map And Localize

状态：`passed`

结果：

- 页面成功创建 job：`slam_job_baf94063f7e4`
- job 终态：`SUCCEEDED`
- `result_message = localized`
- 页面最终回到：
  - `runtime_map_name = 0327-1`
  - `localization_valid = true`

结论：

- `submit_switch_map_and_localize` 页面链路正常
- 切图定位后的状态回收正确

### 4.5 Step 4: Relocalize

状态：`passed`

结果：

- 页面成功创建 job：`slam_job_1cd0c7c9ae2e`
- job 终态：`SUCCEEDED`
- `result_message = localized`

结论：

- `submit_relocalize` 页面链路正常
- 不带初始位姿的默认重定位链路本轮可稳定成功

## 5. 跳过项

### 5.1 Step 5: Start Mapping

状态：`skipped_due_to_environment`

原因：

- 本轮无法远程确认现场是否允许切到 mapping
- 无法确认机器人是否空闲、环境是否允许生成测试地图
- 为避免影响现场，未强行执行 `submit_start_mapping`

### 5.2 Step 6: Save Map

状态：`skipped_due_to_environment`

原因：

- 本轮未安全开启 mapping session
- 因此前置条件不满足，未执行 `submit_save_map`

### 5.3 Step 7: Stop Mapping

状态：`skipped_due_to_environment`

原因：

- 本轮未安全开启 mapping session
- 因此前置条件不满足，未执行 `submit_stop_mapping`

## 6. 不可复现项

### 6.1 Step 8: Cancel Job

状态：`not_reproducible_in_this_round`

原因：

- 本轮没有出现“足够长且适合安全取消”的 `RUNNING` job
- 未人为制造取消场景

### 6.2 Step 9: Manual Assist UI Linkage

状态：`not_reproducible_in_this_round`

原因：

- 本轮 `relocalize` 直接 `SUCCEEDED`
- 未自然触发 `MANUAL_ASSIST_REQUIRED`

## 7. 本轮无失败项

本轮没有记录到明确失败项。

说明：

- 没有把 `accepted = true` 误判为通过
- 各已执行动作均通过 job 终态确认
- 跳过项与不可复现项均已单独归类，没有混入“通过”

## 8. 本轮相关前端改动

本轮验收执行本身没有新增产品逻辑改动。

本 session 中与 live 联调直接相关的页面侧改动为：

- `.env.development`
- `useSlamWorkflowState.ts`

补充说明：

- 修复了 `topic_age` 在时钟 tick 边界短暂显示负数的问题
- 处理方式是把时钟初值改为 `Date.now()`，并将 age clamp 到 `>= 0`
- 现场回归后页面显示为 `0 ms ago`，不再出现负值

为执行自动化验收，另新增了临时脚本：

- 临时脚本 `.tmp/slam-live-acceptance-20260401.cjs` 已在仓库清理时移除，不再作为正式归档产物保留

## 9. 留痕与产物

本轮已在当前前端工程工作区内落盘这些产物：

- 结构化 JSON 曾位于 `.tmp/slam-live-acceptance-20260401.json`，该临时产物已在仓库清理时移除
- [slam-live-acceptance-step-01-connected-20260401.png](./assets/slam-live/slam-live-acceptance-step-01-connected-20260401.png)
- [slam-live-acceptance-json-drawer-20260401.png](./assets/slam-live/slam-live-acceptance-json-drawer-20260401.png)
- [slam-live-acceptance-step-02-sync-runtime-20260401.png](./assets/slam-live/slam-live-acceptance-step-02-sync-runtime-20260401.png)
- [slam-live-acceptance-step-02b-prepare-for-task-20260401.png](./assets/slam-live/slam-live-acceptance-step-02b-prepare-for-task-20260401.png)
- [slam-live-acceptance-step-03-switch-map-20260401.png](./assets/slam-live/slam-live-acceptance-step-03-switch-map-20260401.png)
- [slam-live-acceptance-step-04-relocalize-20260401.png](./assets/slam-live/slam-live-acceptance-step-04-relocalize-20260401.png)
- [slam-live-acceptance-step-05-start-mapping-20260401.png](./assets/slam-live/slam-live-acceptance-step-05-start-mapping-20260401.png)
- [slam-live-acceptance-step-06-save-map-20260401.png](./assets/slam-live/slam-live-acceptance-step-06-save-map-20260401.png)
- [slam-live-acceptance-step-07-stop-mapping-20260401.png](./assets/slam-live/slam-live-acceptance-step-07-stop-mapping-20260401.png)

当前说明：

- 上述路径已经在当前前端工程工作区中可用
- 结构化结果与截图均可直接作为本轮正式留痕
- 如后续需要同步到其它仓库，可从当前前端工程工作区直接拷贝

## 10. 当前阻塞点

当前阻塞“全链路全通过”的因素不是前端主链，而是现场条件：

- Step 5 到 Step 7 需要现场确认允许切到 mapping 并生成测试地图
- `cancel_job` 需要可稳定复现的长运行 job
- `MANUAL_ASSIST_REQUIRED` 需要可稳定复现的定位失败/人工辅助场景

非阻塞问题：

- 控制台仍有少量 Ant Design deprecated warning
- 不影响本轮 live 主验收结论

## 11. 下一步建议

建议下一轮补验按下面顺序执行：

1. 在安全窗口内补 `submit_start_mapping`
2. 补 `submit_save_map`
3. 补 `submit_stop_mapping`
4. 人为制造一个可取消的长运行 job，补 `cancel_job`
5. 找一个可稳定触发 `MANUAL_ASSIST_REQUIRED` 的场景，补 UI 联动

补验完成后，建议在本文件基础上更新为 `v2` 或新增补验记录章节，而不是覆盖本轮事实结论。
