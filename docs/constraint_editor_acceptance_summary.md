# Constraint Editor 验收总结

日期：2026-03-23

## 1. 本轮交付范围

本轮前端交付范围为 `constraint editor`，不包含 task/schedule 页面，不包含高级 polygon / holes 编辑，不包含多段 virtual wall 高级编辑。

当前已完成并可交付的能力：

- read-only map workbench
- zone editor 主流程
- no-go area 只读、添加、修改、删除
- virtual wall 只读、添加、修改、删除
- diagnostics panel 保留为可折叠的 debug-only 面板

live rosbridge：

- `ws://10.0.0.174:9090`

## 2. 里程碑完成情况

### Milestone 1

已完成 no-go read-only layer、selection、details。

页面能力：

- 左侧对象列表包含 `No-Go Areas`
- 画布可渲染 no-go polygon
- 支持选中高亮
- 右侧详情显示 `area_id / display_name / enabled / display_frame / updated_ts / warnings`

### Milestone 2

已完成 no-go add / modify / delete。

实现约束：

- 前端只编辑 `display_region`
- 不直接编辑 `map_region`
- add / modify / delete 后统一 refetch `getAll`
- add 成功后自动选中新建 no-go area

live 结果：

- add 成功
- modify 成功
- delete 成功
- 列表 / 画布 / 详情刷新链路正常

### Milestone 3

已完成 virtual wall read-only + add / modify / delete。

实现约束：

- 前端只编辑 `display_path`
- 不直接编辑 `map_path`
- 支持两点线段
- 支持端点拖拽
- 支持 `buffer_m` 编辑
- add / modify / delete 后统一 refetch `getAll`
- add 成功后自动选中新建 wall

### Milestone 4

已完成 constraint editor 的真实 live 验证。

live 验证覆盖：

- no-go `getAll / add / modify / delete`
- virtual wall `getAll / add / modify / delete`

## 3. No-Go Live 验证结果

### add

页面真实成功。

验证结果：

- add 后 page/backend 数量同步增加
- 新建对象会被自动选中
- 右侧 `No-Go Details` 可直接显示新对象详情
- `display_frame` 实际按 live backend 返回，不硬编码 `site_map`

### modify

页面真实成功。

验证结果：

- 更新的是同一个 `area_id`
- 列表数量保持不变
- `display_region` 按修改后的矩形真实更新
- 保存后页面详情、对象列表、画布内容同步刷新

### delete

页面真实成功。

验证结果：

- 被删对象从 backend 中消失
- 页面对象列表消失
- 画布图层消失
- 右侧详情不再显示被删对象

## 4. Virtual Wall Live 验证结果

### getAll

真实 backend 可正常返回 virtual wall 列表。

注意：

- 使用真实 `map_name='yeyeyeye'` 时返回正常
- 使用 `map_name='--'` 时 backend 返回 `map asset not found`

### add

页面真实成功。

验证结果：

- `beforeCount=0 -> afterAddCount=1`
- 新建 wall 后会自动选中
- 右侧 `Virtual Wall Details` 正确显示新对象
- 页面计数同步显示 `Wall 1`

### modify

页面真实成功。

验证结果：

- 更新的是同一个 `wall_id`
- 列表数量保持不变
- `display_name / buffer_m / display_path` 均可真实更新
- 保存后页面仍显示编辑后的对象和正确计数

### delete

页面真实成功。

验证结果：

- 删除后对象从 backend 中消失
- 页面对象列表中消失
- 画布中消失
- 页面计数回到 `Wall 0`

### enabled 附加验证

额外验证了 virtual wall 的 `enabled` 编辑。

结果：

- 把 wall 保存为 `enabled=false` 后，backend 会真实持久化为禁用
- 当前页面由于 `getAll` 使用 `include_disabled=false`，禁用 wall 会从列表和画布中隐藏

## 5. 已确认的后端差异

### map_name 行为

已确认：

- 空字符串 `map_name=''` 可以让 backend 按当前地图推断
- `'--'` 不是合法 fallback，会被 backend 拒绝

### display_frame

当前 live backend 中常见值为：

- `display_frame='map'`

前端没有硬编码 `site_map`。

## 6. 关键实现原则已落实

- no-go 编辑只使用 `display_region`
- virtual wall 编辑只使用 `display_path`
- 不直接修改 `map_region / map_path`
- add / modify / delete 成功后统一 refetch `getAll`
- diagnostics panel 保留且默认折叠
- 页面在 `map_server` 异常时仍保持可运行

## 7. 主要变更文件

- `src/pages/MapWorkbenchPage.tsx`
- `src/components/canvas/MapCanvas.tsx`
- `src/api/ros/services.ts`
- `src/hooks/useMapWorkbenchData.ts`
- `src/stores/constraintEditorStore.ts`
- `src/types/map-editor.ts`
- `src/utils/constraint-editor.ts`
- `src/components/constraint-editor/NoGoEditorToolbar.tsx`
- `src/components/constraint-editor/NoGoEditorPanel.tsx`
- `src/components/constraint-editor/NoGoDetailsPanel.tsx`
- `src/components/wall-editor/VirtualWallEditorToolbar.tsx`
- `src/components/wall-editor/VirtualWallEditorPanel.tsx`
- `src/components/wall-editor/VirtualWallDetailsPanel.tsx`
- `src/components/wall-editor/VirtualWallEditorLayer.tsx`

## 8. build / lint 状态

当前 `build` 和 `lint` 均通过。

已知非阻塞项：

- `vite build` 仍有既有 chunk size warning
- 无新的编译错误或 lint 错误

## 9. 验收结论

constraint editor 当前可以按阶段性成果验收通过。

结论范围：

- no-go editor：通过
- virtual wall editor：通过
- live backend integration：通过

## 10. 地图服务恢复补充结论

2026-03-23 已补充验证：live `/clean_robot_server/map_server` 已恢复正常。

live 验证结果：

- `getAll -> success=true`
- `get(yeyeyeye) -> success=true`
- `map_name = yeyeyeye`
- `width = 1009`
- `height = 1262`
- `resolution = 0.05`
- `frame_id = map`
- `data.length = 1273358`

前端回归结果：

- 刷新页面后，fallback banner 已消失
- `Current Map` 恢复为真实地图元数据
- `Map Canvas` 已恢复 occupancy grid 底图渲染
- zone 图层可正常叠加在底图上

问题定性：

- 之前看到的 `Base map metadata is temporarily unavailable` 属于 `map_server` 故障期间的降级状态
- 在 backend 恢复后，刷新页面即可回到正常地图加载路径
- 前端已补齐 `Reconnect = reconnect + refetch workbench data`，后续再遇到类似恢复场景，不应再必须手动整页刷新

## 11. 建议的下一步

建议优先从下面两项中选一项继续：

- 进入 task / schedule 页面开发
- 先补一轮交付清理，例如统一文档、整理调试截图、补少量回归用例
