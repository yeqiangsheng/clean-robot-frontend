# Ubuntu 20.04 Robot Deployment

This document describes the recommended commercial deployment mode when the robot itself runs Ubuntu 20.04.

## Recommended Topology

```text
Field browser / tablet / laptop
  -> http://<robot-ip>:4173
Robot Ubuntu 20.04 Site Gateway
  -> ws://127.0.0.1:9090
ROS / rosbridge / backend services on the robot
```

The browser only renders the UI. The release package and Site Gateway run on the robot or on a trusted edge gateway in the same robot network.

## Build On Windows, Deploy The Release Package

Build the release candidate on the development machine:

```powershell
npm.cmd run package:trial
```

Copy the generated release directory to the robot, for example:

```text
release/clean-robot-site-v0.1.0-rc.2
```

A typical robot-side install location is:

```bash
/opt/clean-robot-site/current
```

Do not deploy the full source workspace to the robot. Deploy only the packaged release directory.

## First-Time Robot Setup

Install Node.js on Ubuntu 20.04. The current frontend uses modern Node APIs, so use Node 22 or newer for the Site Gateway runtime.

From the release directory on the robot:

```bash
cd /opt/clean-robot-site/current
npm install --omit=dev
```

If this is a fresh robot and the local Site Gateway SQLite user database is empty, add site-specific `bootstrapUsers` to `site-gateway/site-config.json` before first start. Do not use placeholder passwords such as `change-me-*`.

## Manual Start

```bash
cd /opt/clean-robot-site/current
SITE_ROSBRIDGE_URL=ws://127.0.0.1:9090 ./start-frontend-prod.sh
```

Open from another device on the same field network:

```text
http://<robot-ip>:4173
```

Stop the manual process:

```bash
./stop-frontend-prod.sh
```

## systemd Install

Install the release as a boot-start service:

```bash
cd /opt/clean-robot-site/current
sudo SITE_ROSBRIDGE_URL=ws://127.0.0.1:9090 ./scripts/install-site-systemd.sh
```

Useful optional environment variables:

- `SITE_SERVICE_NAME`: systemd service name. Default: `clean-robot-site-gateway`.
- `SITE_SERVICE_USER`: Linux user that runs the service. Default: the `sudo` caller.
- `SITE_LISTEN_HOST`: gateway bind address. Default: `0.0.0.0`.
- `SITE_PORT`: gateway HTTP port. Default: `4173`.
- `SITE_ROSBRIDGE_URL`: rosbridge URL. Default: `ws://127.0.0.1:9090`.
- `SITE_MAP_IMPORT_PBSTREAM_DIR`: pbstream search directory. Default: `/opt/carto/map`.
- `SITE_NODE_BIN`: explicit Node.js executable path.

Check status:

```bash
systemctl status clean-robot-site-gateway
journalctl -u clean-robot-site-gateway -f
curl http://127.0.0.1:4173/api/health
```

Uninstall the systemd service without deleting release files:

```bash
sudo ./scripts/uninstall-site-systemd.sh
```

## Release Health Criteria

- `/api/health` returns `status=ok`.
- `/api/health` returns `version=0.1.0-rc.2` for this release candidate.
- `ros.status=connected` when rosbridge is online on the configured URL.
- The top UI connection badges show Gateway online and ROS connected.

If `ros.status=closed`, first check rosbridge on the robot:

```bash
systemctl status rosbridge*
ss -ltnp | grep 9090
```

Then confirm the Site Gateway uses the intended `SITE_ROSBRIDGE_URL`.
