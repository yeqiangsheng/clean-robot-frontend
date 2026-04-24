# 2026-04-24 Live Acceptance Notes

## Environment

- Frontend entry: `http://127.0.0.1:4173`
- Live rosbridge: configured through `SITE_ROSBRIDGE_URL` / deployed site config during field validation.
- Operator role used during validation: engineer / field engineer
- Active map after SLAM validation: `slam_map_20260424_144051`

## Passed Items

- Gateway and ROS connection: `ros.status=connected`.
- Overview / RuntimeMonitoring / ActuatorControl topic display: passed with station status treated as non-blocking warning when stale or missing.
- ExecutionControl: `START -> PAUSE -> CONTINUE -> STOP` passed on a real task.
- SLAM five actions: `start_mapping`, `save_mapping`, `stop_mapping`, `switch_map`, `relocalize` passed in the live environment.
- MapWorkbench: no-go area creation, coverage zone creation, coverage preview/path generation passed after backend coverage preview fix.
- TaskManagement: task creation from the new coverage zone passed.
- End-to-end field loop: create SLAM map -> switch/relocalize -> draw no-go and coverage zone -> generate path -> create task -> execute task passed.
- Trial release package: `release/clean-robot-site-v0.0.0` was generated, production dependencies installed with `npm install --omit=dev`, and the packaged site gateway smoke-tested successfully on `http://127.0.0.1:4173`.

## Frontend Fixes Confirmed During Validation

- The map worker now preserves lightweight business identifiers such as `map_revision_id`, `active_revision_id`, `latest_head_revision_id`, `lifecycle_status`, and `verification_status` when normalizing current map payloads.
- Coverage preview requests now carry the canonical payload shape with `map_name`, `map_revision_id`, `alignment_version`, `region`, `profile_name`, and `debug_publish_markers`.
- Gateway audit API no longer throws a local `isRecord is not defined` error.
- `start-frontend-prod.cmd` and `stop-frontend-prod.cmd` now fall back to local pid/port process handling when the Windows service exists but cannot be controlled from the current non-admin shell.

## Backend Issue Resolved During Validation

- `coverage_preview_service` initially failed on the new SLAM map revision while the same region worked on the old site map.
- Backend fixed the issue, and the frontend live chain was retested successfully.

## Remaining Watch Items

- Keep browser-side ROS business fallbacks confined to low-level compatibility boundaries.
- Continue spot-checking MapWorkbench edit/delete flows for no-go areas, coverage zones, and virtual walls before final release packaging.
- Run the formal build and legacy-boundary checks before creating the final release package.
