# Release Notes: 0.1.0-rc.2

Date: 2026-04-25

## Scope

This release candidate keeps the `0.1.0-rc.1` field-validated business workflows and adds Ubuntu 20.04 robot-side deployment support. It is the recommended package for installing the Site Gateway directly on a commercial cleaning robot.

## Changes Since 0.1.0-rc.1

- Added Linux manual start/stop scripts: `start-frontend-prod.sh` and `stop-frontend-prod.sh`.
- Added Ubuntu `systemd` install/uninstall scripts: `scripts/install-site-systemd.sh` and `scripts/uninstall-site-systemd.sh`.
- Added robot-side deployment guide: `docs/ubuntu20_robot_deployment.md`.
- Updated trial packaging so Linux scripts and Ubuntu deployment notes are included in the release bundle.
- Normalized `.sh` line endings to LF in both git attributes and generated release packages to avoid Ubuntu shebang failures.
- Updated `RELEASE-INFO.json` generation with Linux entry, install, start, stop, and systemd commands.

## Recommended Robot Topology

```text
Field browser / tablet / laptop
  -> http://<robot-ip>:4173
Robot Ubuntu 20.04 Site Gateway
  -> ws://127.0.0.1:9090
ROS / rosbridge / backend services on the robot
```

## Verification

- `npm run package:trial`
- Release package production dependency install: `npm install --omit=dev`
- Packaged gateway smoke test: `/api/health` returns `version=0.1.0-rc.2`.
- Release `.sh` files are generated with LF line endings.

## Field Validation Carryover

- ExecutionControl `START -> PAUSE -> CONTINUE -> STOP`: passed in live validation.
- SLAM five actions: `start_mapping`, `save_mapping`, `stop_mapping`, `switch_map`, and `relocalize`: passed in live validation.
- MapWorkbench no-go + coverage zone + path generation + task creation + task execution: passed after backend coverage preview fix.
