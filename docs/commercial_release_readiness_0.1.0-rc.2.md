# 商用发布就绪审查：0.1.0-rc.2

日期：2026-05-27

## 结论

当前前端工程已按“浏览器只访问 Site Gateway，Site Gateway 负责 ROS 会话和动作 contract”的商用边界收口。默认仓库配置保持通用，不固化现场地址；发布包携带 `operator / service / engineer` 三个出厂调试账号，便于新车部署后立即登录，交付客户前应按现场要求改密。

本页用于发包前审查、现场交接和问题回滚定位。

## 变更分组

### Gateway Contract

- 执行机构控制走 `/api/actuator/commands` 和 `/api/actuators/status`。
- 执行机构力度统一为 `0..100`。
- 出水、吸水/真空、刷盘、刮扒、充电桩/补给站均使用商用组合命令。
- 充电桩/补给站手动动作默认需要工程权限和二次确认。
- Gateway 端负责连接 rosbridge，上游地址只在本地 `site-gateway/site-config.json` 或启动环境中配置。

### 前端页面

- 总览页保留普通 `operator` 可用的任务执行、回家和手动点动入口。
- 执行机构调试页精简为出水、吸水/真空、刷盘、刮扒、充电桩/补给站。
- 充电桩标定页保留两点保存、score 指标提示、手动点动和回桩验证入口。
- 运行监控、执行控制、地图工作台、SLAM、任务、调度均走 Site Gateway HTTP API。

### 配置与安全

- `public/app-config.json` 只放浏览器可见 UI 配置。
- `site-gateway/site-config.json` 放本地运行配置，默认带三类出厂调试 `bootstrapUsers`。
- 新站点可参考 `site-gateway/site-config.field.example.json` 准备现场配置；交付客户前应确认默认密码是否需要替换。
- 现场 rosbridge 地址通过 `SITE_ROSBRIDGE_URL`、安装参数或部署后的 `site-config.json` 写入。
- 登录页只允许记住账号，不保存口令；旧版本地保存过的登录口令会被清理。
- Gateway 启动日志不打印完整 rosbridge 上游地址。

### 清理内容

- 删除浏览器直连 ROS 业务模块。
- 删除浏览器侧 rosbridge 透传入口和旧调试控件。
- 删除旧的执行机构拆分按钮主入口。
- 删除不再参与生产路径的旧组件、hook、worker 和脚本。
- 新增审计脚本，防止旧边界、旧执行机构 contract、生产包泄露项回流。

## 发包前门禁

发包前至少执行：

```powershell
npm.cmd run lint
npm.cmd run test
npm.cmd run typecheck
npm.cmd run build
npm.cmd run audit:modules
npm.cmd run audit:legacy
npm.cmd run audit:actuator-contract
npm.cmd run audit:production
```

打 trial 包时执行：

```powershell
npm.cmd run package:trial
```

## 现场配置检查

- `public/app-config.json` 不应出现 ROS 上游地址、角色策略或任何口令。
- `site-gateway/site-config.json` 的 `rosbridgeUrl` 应由现场部署环境设置。
- 新站点首次启动前，如果本地 SQLite 用户表为空，应在部署配置中临时写入站点专属 bootstrap 账号，初始化后移除或妥善保管该部署配置。
- 使用 `site-config.field.example.json` 时，未替换的占位口令会被 Gateway 拦截。
- 平板和电脑只访问前端入口，例如 `http://<gateway-host>:4173`。

## 现场功能验收

- 登录和角色权限：`operator` 只进入总览，但能执行总览页允许的任务、回家和手动点动。
- ROS 连接：`/api/health` 显示 Gateway 在线、ROS 会话可恢复。
- 任务/调度：CRUD 和执行命令有明确成功、失败、阻断反馈。
- 地图工作台：地图、禁区、虚拟墙、覆盖区域和任务联动可用。
- SLAM：建图、保存、停止、切图、重定位动作有明确反馈。
- 充电桩标定：两点保存、score 提示、warnings、回桩验证可用。
- 执行机构调试：出水、吸水/真空、刷盘、刮扒、补水、排水、充电使能按组合命令下发。
- 审计：高风险动作进入最近命令或审计记录。

## 回滚点

- 发布包回滚：使用 `scripts/rollback-site-release.ps1` 或 Ubuntu 对应部署流程。
- 配置回滚：优先回退部署目录下的 `public/app-config.json` 和 `site-gateway/site-config.json`。
- 数据回滚：保留 `.tmp` 下 SQLite 数据库备份，避免覆盖现场账号和审计记录。
- ROS contract 异常：优先查看 Site Gateway 日志、`/api/health`、`/api/actuators/status`、诊断包。

## 剩余现场事项

- 真机全链路验收结果仍需按 `现场验收清单.md` 留档。
- 每个站点的账号、上游地址和权限策略应单独登记，不进入源码仓库。
- 充电桩、补水、排水、执行机构动作必须在安全条件下由工程权限人员验证。
