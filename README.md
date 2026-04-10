# Clean Robot Frontend

现场单机 Windows 试点交付版前端。

当前默认目标：

- 可执行 `verify`
- 可构建为 `dist`
- 可由本地静态服务托管
- 可在 mock / live 模式下完成基础联调与验收

## Quick Start

安装依赖：

```powershell
npm.cmd install
```

开发模式：

```powershell
npm.cmd run dev
```

生产构建：

```powershell
npm.cmd run build
```

生产静态托管：

```powershell
npm.cmd run start:prod
```

仅本地预览构建产物，不作为生产服务：

```powershell
npm.cmd run preview:bundle
```

## Scripts

- `npm.cmd run lint`
- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run test:e2e`
- `npm.cmd run build`
- `npm.cmd run verify`
- `npm.cmd run serve:prod`
- `npm.cmd run start:prod`

`verify` 当前会执行：

1. `lint`
2. `vitest`
3. `typecheck`
4. `build`

## Local Config

前端启动时会加载并校验 [app-config.json](/c:/work/clean-robot-frontend/public/app-config.json)。

关键字段：

- `siteName`
- `robotId`
- `rosbridgeUrl`
- `quickRosbridgeUrls`
- `enabledModules`
- `rolePolicy`
- `engineerUnlockMode`
- `logRetentionDays`

当前试点约束：

- `engineerPasscode` 已移除
- 前端不再校验任何浏览器可见口令
- `engineerUnlockMode` 只允许 `direct`
- 配置错误会在启动阶段阻断进入业务页

## Field Operation

Windows 启停脚本：

- [start-frontend.cmd](/c:/work/clean-robot-frontend/start-frontend.cmd)
- [stop-frontend.cmd](/c:/work/clean-robot-frontend/stop-frontend.cmd)
- [start-frontend-prod.cmd](/c:/work/clean-robot-frontend/start-frontend-prod.cmd)
- [stop-frontend-prod.cmd](/c:/work/clean-robot-frontend/stop-frontend-prod.cmd)

生产托管默认地址：

- `http://127.0.0.1:4173`

如果不希望生产脚本自动打开浏览器，可设置：

```powershell
$env:FRONTEND_NO_OPEN_BROWSER='1'
```

## Acceptance

建议交付前至少执行：

```powershell
npm.cmd run verify
npm.cmd run test:e2e
```

## Docs

- [DEPLOYMENT.md](/c:/work/clean-robot-frontend/DEPLOYMENT.md)
- [现场验收清单.md](/c:/work/clean-robot-frontend/现场验收清单.md)
- [故障排查手册.md](/c:/work/clean-robot-frontend/故障排查手册.md)
