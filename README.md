# Clean Robot Frontend

商用清洁机器人前端试点工程。

当前仓库面向“现场单机 Windows 试点交付”场景，目标是把前端补到可构建、可部署、可联调、可验收的状态，而不是量产级云端平台。工程已经具备任务管理、调度管理、地图工作台、运行监控、SLAM 工程台、执行控制、执行机构调试、诊断导出和现场启停脚本等能力。

## Current Scope

- 现场单机 Windows 试点交付
- 浏览器直连 `rosbridge`
- 本地 `app-config.json` 配置加载与校验
- 角色显隐与工程师模式隔离
- Mock / Live 双模式联调
- 统一 gateway 收口高风险前端写路径
- 本地 `verify`、Vitest、Playwright smoke

## Core Capabilities

- 运行总览：连接状态、能力探测、诊断导出、审计摘要
- 地图工作台：地图浏览、区域/禁区/虚拟墙编辑
- 任务管理：任务 CRUD、区域与档位绑定
- 调度管理：单次 / 每日 / 每周调度 CRUD
- 执行控制：运行态任务选择、控制反馈
- 运行监控：topic 健康度、运行状态、错误信息
- SLAM 工程台：定位、切图、建图相关工作流
- 执行机构调试：通过 gateway 统一下发高风险命令

## Tech Stack

- React 19
- TypeScript
- Vite
- Ant Design
- TanStack Query
- Zustand
- roslib
- Vitest + React Testing Library
- Playwright

## Quick Start

安装依赖：

```powershell
npm.cmd install
```

开发模式：

```powershell
npm.cmd run dev
```

默认开发地址：

```text
http://127.0.0.1:5173
```

## Production Preview

构建：

```powershell
npm.cmd run build
```

以现场静态托管方式启动：

```powershell
npm.cmd run start:prod
```

默认生产访问地址：

```text
http://127.0.0.1:4173
```

如果不希望启动脚本自动打开浏览器：

```powershell
$env:FRONTEND_NO_OPEN_BROWSER='1'
```

## Common Scripts

- `npm.cmd run lint`
- `npm.cmd run test`
- `npm.cmd run typecheck`
- `npm.cmd run build`
- `npm.cmd run verify`
- `npm.cmd run test:e2e`
- `npm.cmd run serve:prod`
- `npm.cmd run start:prod`

当前 `verify` 会执行：

1. `lint`
2. `test`
3. `build`

## Configuration

前端启动时会加载并校验 [`public/app-config.json`](public/app-config.json)。

关键字段包括：

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
- 前端不再校验浏览器可见口令
- `engineerUnlockMode` 当前只保留 `direct`
- 配置错误会在启动阶段阻断进入业务页

环境变量模板见 [`.env.example`](.env.example)。本仓库默认忽略 `.env.*`，避免把本机环境文件直接提交到版本库。

## Field Operation

现场 Windows 启停脚本：

- [`start-frontend.cmd`](start-frontend.cmd)
- [`stop-frontend.cmd`](stop-frontend.cmd)
- [`start-frontend-prod.cmd`](start-frontend-prod.cmd)
- [`stop-frontend-prod.cmd`](stop-frontend-prod.cmd)

## Project Structure

```text
src/
  api/                ROS 与 gateway 封装
  components/         可复用页面组件
  config/             配置加载与 schema 校验
  features/           任务/调度等领域模块
  hooks/              连接与查询 hooks
  pages/              页面容器
  stores/             Zustand 状态管理
  types/              类型定义
  utils/              工具函数
public/
  app-config.json     现场配置
scripts/
  serve-dist.mjs      生产静态托管器
tests/
  e2e/                Playwright smoke
docs/                 交付、验收、联调留档
```

## Acceptance And Testing

建议交付前至少执行：

```powershell
npm.cmd run verify
npm.cmd run test:e2e
```

## Documentation

- [DEPLOYMENT.md](DEPLOYMENT.md)
- [现场验收清单.md](现场验收清单.md)
- [故障排查手册.md](故障排查手册.md)
- [docs/slam_frontend_live_acceptance_v1.md](docs/slam_frontend_live_acceptance_v1.md)
- [docs/constraint_editor_acceptance_summary.md](docs/constraint_editor_acceptance_summary.md)

## Current Boundaries

- 当前更适合试点交付，不是量产级平台架构
- 浏览器仍直接连接 `rosbridge`
- 审计与部分运行数据仍以前端本地留痕为主
- 若进入规模化商用阶段，建议增加站点侧 gateway / BFF

## Repository Notes

- 当前仓库保留了现场试点配置和联调文档
- 如果后续要长期公开维护，建议再做一轮脱敏、文档整理和示例配置抽离
