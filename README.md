# Clean Robot Frontend

Commercial cleaning robot frontend for single-site Windows deployments.

This repository now ships a two-layer site architecture:

`Browser SPA -> Site Gateway -> ROS / rosbridge / robot services`

The frontend keeps the existing React/Vite page shell and operator workflows, while the local `site-gateway` becomes the commercial runtime boundary for:

- local account login and session cookies
- role/capability enforcement
- audit persistence
- high-risk command routing
- diagnostics export
- ROS / rosbridge proxying
- Windows service hosting
- packaged upgrade and rollback flows

## What Is Included

- operations overview
- map workbench
- task management
- schedule management
- execution control
- runtime monitoring
- SLAM workbench
- actuator debugging
- local deployment scripts
- diagnostics export
- WinSW service install scripts
- upgrade and rollback scripts
- Vitest + Playwright smoke coverage

## Repository Layout

```text
src/                 React frontend shell and business pages
site-gateway/        Local site gateway for auth, audit, ROS proxying, and static hosting
public/              Public UI config served at runtime
scripts/             Packaging, service install, upgrade, and rollback scripts
tests/e2e/           Playwright smoke tests
release/             Generated trial release bundles
```

## Runtime Config Split

Two config files now serve different purposes:

- [`public/app-config.json`](public/app-config.json)
  UI-visible config only. Includes site branding, `apiBaseUrl`, enabled modules, and support contact info.
- [`site-gateway/site-config.json`](site-gateway/site-config.json)
  Local site runtime config. Includes `rosbridgeUrl`, role policy, session retention, and optional bootstrap users.

The browser should no longer expose real ROS topology or front-end-side unlock policies.
For field deployments, keep repository defaults generic, override the live rosbridge address with `SITE_ROSBRIDGE_URL` or the deployed `site-config.json`, and provide site-specific bootstrap passwords only during installation.

## Local Development

Install dependencies:

```powershell
npm.cmd install
```

Run the site gateway in one terminal:

```powershell
npm.cmd run gateway:dev
```

Run the frontend dev server in another terminal:

```powershell
npm.cmd run dev
```

Default local URLs:

- frontend: `http://127.0.0.1:5173`
- site gateway: `http://127.0.0.1:4180`

Vite proxies `/api/*` and `/ws/*` to the local site gateway during development.

## Verification

```powershell
npm.cmd run verify
npm.cmd run test:e2e
```

`verify` runs:

1. `lint`
2. `audit:legacy`
3. `test`
4. `build`
5. `audit:production`

`audit:legacy` protects current pages, current docs, and formal gateway-facing layers from reintroducing legacy service names, stale sample addresses, or compatibility wording that belongs only in bottom-layer boundaries.

`audit:production` runs after `build` and checks `dist/` plus current delivery docs/config for test chunks, test-framework markers, stale live IPs, old endpoint wording, and other release-package residue.

## Workspace Cleanup

Remove generated local artifacts:

```powershell
npm.cmd run clean:workspace
```

Also remove local release backups:

```powershell
npm.cmd run clean:workspace:deep
```

Remove generated release bundles as well:

```powershell
npm.cmd run clean:workspace:release
```

## Trial Packaging

Build a field-delivery bundle:

```powershell
npm.cmd run package:trial
```

This produces a release directory like:

```text
release/clean-robot-site-v0.1.0-rc.1/
```

The packaged bundle includes:

- built `dist/`
- editable `public/app-config.json`
- `site-gateway/`
- `scripts/`
- `package.json` and `package-lock.json`
- start/stop scripts
- deployment and troubleshooting docs
- `RELEASE-INFO.json`

## Production Startup

From a packaged release directory:

```powershell
npm.cmd install --omit=dev
.\start-frontend-prod.cmd
```

Default entry URL:

```text
http://127.0.0.1:4173
```

Stop the site:

```powershell
.\stop-frontend-prod.cmd
```

Set `FRONTEND_NO_OPEN_BROWSER=1` to suppress automatic browser launch.

## Windows Service Installation

The release bundle now contains WinSW-oriented service scripts.

Seed the WinSW executable once and install the service:

```powershell
.\scripts\install-site-service.ps1 -WinSwExePath C:\path\to\WinSW.exe
```

Set field-specific runtime overrides at install time when needed:

```powershell
.\scripts\install-site-service.ps1 -WinSwExePath C:\path\to\WinSW.exe -RosbridgeUrl ws://<robot-host>:9090
```

Uninstall the service:

```powershell
.\scripts\uninstall-site-service.ps1
```

Notes:

- the WinSW binary itself is not committed into the repository
- the install script copies that binary into the release `service/` directory
- the generated service runs `site-gateway/server.mjs` directly with Node.js

## Upgrade And Rollback

Upgrade an installed site using a new packaged release:

```powershell
.\scripts\upgrade-site-release.ps1 -InstallRoot C:\CleanRobot\site
```

Rollback to the latest backup:

```powershell
.\scripts\rollback-site-release.ps1 -InstallRoot C:\CleanRobot\site
```

The upgrade script:

- stops the existing service
- backs up the current installed release
- copies the new release into the install root
- restores or reuses the WinSW wrapper
- starts the site service again

## Current Commercialization Status

This repository now has:

- a local site gateway with session login, audit persistence, diagnostics export, and rosbridge proxying
- frontend session-driven role/capability rendering
- high-risk write paths moved behind gateway APIs
- a releasable trial package flow
- Windows production start/stop scripts aligned to the site gateway
- WinSW service installation scripts
- packaged upgrade and rollback scripts

Still planned for later phases:

- fuller gateway test coverage
- more read-path migration off browser-side ROS subscriptions
- stronger long-term SQLite/runtime hardening
- multi-site and cloud platform capabilities

## Documentation

- [DEPLOYMENT.md](DEPLOYMENT.md)
- [现场验收清单.md](现场验收清单.md)
- [故障排查手册.md](故障排查手册.md)
- [docs/README.md](docs/README.md)
