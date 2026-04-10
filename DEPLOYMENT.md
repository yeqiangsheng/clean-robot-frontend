# 清洁机器人前端试点部署说明

## 目标范围

本仓库当前交付目标为“现场单机 Windows 试点部署”。
默认要求是：

- 前端可执行 `verify`
- 前端可构建为 `dist`
- 前端可由本地静态服务托管
- 前端可在 mock 和 live 两种模式下完成基础验收

## 前置条件

- Windows 10/11
- Node.js 20+
- `npm.cmd`
- 现场 live 联调时可访问 rosbridge，例如 `ws://127.0.0.1:9090`

## 本地配置

部署前先检查 [public/app-config.json](/c:/work/clean-robot-frontend/public/app-config.json)。

当前试点约束：

- `engineerPasscode` 已移除，前端不再校验浏览器可见口令
- `engineerUnlockMode` 只允许 `direct`
- `rosbridgeUrl` 和 `quickRosbridgeUrls` 必须是合法 `ws://` 或 `wss://`
- 配置字段缺失、类型错误或 URL 非法时，前端会在启动阶段阻断进入业务页

## 发布前验证

在仓库根目录执行：

```powershell
npm.cmd install
npm.cmd run verify
npm.cmd run test:e2e
```

说明：

- `verify` 会执行 `lint`、`vitest`、`typecheck`、`build`
- `test:e2e` 使用 mock 模式启动开发服务器，并执行基础 smoke

## 生产启动

推荐使用仓库内脚本：

```powershell
.\start-frontend-prod.cmd
```

如需在自动化环境中避免弹出浏览器：

```powershell
$env:FRONTEND_NO_OPEN_BROWSER='1'
.\start-frontend-prod.cmd
```

默认服务地址：

- `http://127.0.0.1:4173`

脚本行为：

- 先执行 `npm.cmd run verify`
- 使用 [scripts/serve-dist.mjs](/c:/work/clean-robot-frontend/scripts/serve-dist.mjs) 托管 `dist`
- 执行端口检查和健康检查
- 写入 PID 文件，便于停止脚本回收

## 停止服务

```powershell
.\stop-frontend-prod.cmd
```

## 日志与运行文件

生产脚本相关文件位于：

- `.tmp/frontend-prod/frontend.out.log`
- `.tmp/frontend-prod/frontend.err.log`
- `.tmp/frontend-prod/frontend.pid`

## Mock / Live 切换

### Mock 验收

用于无 ROS 后端时的页面级验收：

```powershell
npm.cmd run dev -- --mode test --host 127.0.0.1 --port 4174
```

`.env.test` 已启用：

- `VITE_USE_MOCK_DATA=true`

### Live 联调

live 模式使用真实 rosbridge，重点检查：

- 连接
- 断开
- 重连
- 页面反馈
- 审计记录
- 诊断包导出

## 回滚建议

现场建议保留上一版完整发布目录，至少包含：

- `dist`
- `public/app-config.json`
- `package.json`
- `package-lock.json`
- 启停脚本

回滚步骤：

1. 停止当前前端服务。
2. 恢复上一版发布目录。
3. 执行 `npm.cmd install`。
4. 执行 `npm.cmd run verify`。
5. 重新运行 `.\start-frontend-prod.cmd`。
