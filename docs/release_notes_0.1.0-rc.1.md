# Release Notes: 0.1.0-rc.1

Date: 2026-04-25

## Scope

This release candidate is the first commercial site-gateway delivery candidate for the clean robot frontend. It moves the field UI behind the local Site Gateway, keeps browser-visible config minimal, and preserves the core field workflows that were live-tested on 2026-04-24.

## Field Validation Status

- Gateway and ROS connection: passed.
- Overview / RuntimeMonitoring / ActuatorControl live status display: passed.
- ExecutionControl: `START -> PAUSE -> CONTINUE -> STOP` passed on a real task.
- SLAM five actions: `start_mapping`, `save_mapping`, `stop_mapping`, `switch_map`, and `relocalize` passed in the live environment.
- MapWorkbench: no-go area creation, coverage zone creation, coverage preview/path generation, task creation, and task execution passed after the backend coverage preview fix.

## Delivery Changes

- Added local Site Gateway runtime, session login, audit records, role capability boundaries, and ROS service/topic proxying.
- Canonicalized the main business service paths for execution, readiness, SLAM, task, schedule, profile, map, and site-editing flows.
- Added connection-state, station-status warning, readiness, SLAM job, schedule delete, and MapWorkbench feedback improvements for field operators.
- Added production package audits, legacy-boundary audits, trial packaging, Windows service helpers, release rollback/upgrade helpers, and live regression test scaffolding.
- Removed stale legacy docs, demo assets, starter scripts, and browser-side unlock/config leakage from the active delivery path.

## Security And Deployment Notes

- The repository default `site-gateway/site-config.json` does not include usable bootstrap passwords.
- Field deployments must provide site-specific `bootstrapUsers` secrets in the deployed config or keep an existing initialized SQLite user database.
- Live ROS addresses should be set through `SITE_ROSBRIDGE_URL`, service install options, or the deployed `site-config.json`; they are not baked into the browser bundle.

## Verification

- `npm run verify`
- `npm run package:trial`
- Release package production dependency install: `npm install --omit=dev`
- Packaged gateway smoke test: `/api/health` reports `ros.status=connected` when started with the field rosbridge URL.

## Known Watch Items

- Browser ROS business fallbacks should not be reintroduced; keep business IO on the Site Gateway path.
- Continue spot-checking MapWorkbench edit/delete flows for no-go areas, coverage zones, and virtual walls before final stable release.
- Promote this RC to a stable version only after the next on-site regression pass confirms there are no new blocking field issues.
