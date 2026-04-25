# Backend Codex Prompt: Deploy Frontend Site Gateway On Ubuntu 20.04 Robot

You are helping deploy the clean robot frontend Site Gateway release package on a commercial cleaning robot running Ubuntu 20.04.

## Goal

Install and start the packaged frontend on the robot, not the full source repository.

Expected topology:

```text
Field browser / tablet / laptop
  -> http://<robot-ip>:4173
Robot Ubuntu 20.04 Site Gateway
  -> ws://127.0.0.1:9090
ROS / rosbridge / backend services on the robot
```

## Input Artifact

Use the release artifact provided by the frontend team:

```text
clean-robot-site-v0.1.0-rc.2-ubuntu20.tar.gz
```

Do not rebuild frontend assets on the robot unless explicitly asked. The package already contains `dist/`, `site-gateway/`, runtime scripts, docs, and production package manifests.

## Deployment Steps

1. Copy the artifact to the robot.

2. Create the install directory:

```bash
sudo mkdir -p /opt/clean-robot-site
sudo chown "$USER:$USER" /opt/clean-robot-site
```

3. Extract the artifact:

```bash
cd /opt/clean-robot-site
tar -xzf /path/to/clean-robot-site-v0.1.0-rc.2-ubuntu20.tar.gz
ln -sfn /opt/clean-robot-site/clean-robot-site-v0.1.0-rc.2 /opt/clean-robot-site/current
cd /opt/clean-robot-site/current
```

4. Confirm Node.js. Use Node 22 or newer.

```bash
node -v
npm -v
```

If Node is missing or too old, install Node.js according to the robot team's standard Ubuntu 20.04 procedure before continuing.

5. Install production dependencies:

```bash
npm install --omit=dev
```

6. Confirm rosbridge is online on the robot:

```bash
ss -ltnp | grep 9090 || true
```

The recommended robot-local rosbridge URL is:

```text
ws://127.0.0.1:9090
```

7. Configure first-login users if needed.

If the local Site Gateway SQLite user database is empty, edit:

```text
site-gateway/site-config.json
```

Add site-specific `bootstrapUsers` using strong passwords delivered securely by the field team. Do not use placeholder passwords such as `change-me-*`, and do not print real passwords in logs or final reports.

Example shape only:

```json
"bootstrapUsers": [
  {
    "username": "engineer",
    "displayName": "现场工程师",
    "role": "engineer",
    "password": "<site-specific-strong-password>"
  }
]
```

8. Manual smoke start:

```bash
SITE_ROSBRIDGE_URL=ws://127.0.0.1:9090 ./start-frontend-prod.sh
curl http://127.0.0.1:4173/api/health
./stop-frontend-prod.sh
```

Expected health response:

- `status` is `ok`
- `version` is `0.1.0-rc.2`
- `ros.status` is `connected` when rosbridge is online

If `ros.status=closed`, check rosbridge and networking first. Do not change frontend source code.

9. Install as a boot-start systemd service:

```bash
sudo SITE_ROSBRIDGE_URL=ws://127.0.0.1:9090 ./scripts/install-site-systemd.sh
```

10. Verify service:

```bash
systemctl status clean-robot-site-gateway --no-pager
journalctl -u clean-robot-site-gateway -n 80 --no-pager
curl http://127.0.0.1:4173/api/health
```

11. Confirm remote browser access from the field network:

```text
http://<robot-ip>:4173
```

## Acceptance Report Format

Report back with:

- Install path
- Node and npm versions
- Whether `npm install --omit=dev` succeeded
- Whether `systemctl status clean-robot-site-gateway` is active/running
- `/api/health` response summary: `status`, `version`, `ros.status`, `ros.url`
- Browser access URL
- Any errors from `journalctl -u clean-robot-site-gateway`

## Safety Rules

- Do not deploy the full frontend source workspace to the robot.
- Do not run dev server commands such as `npm run dev` on the robot.
- Do not commit or hardcode live robot IPs, passwords, tokens, or temporary field credentials.
- Do not modify main business service names or frontend source code during deployment.
- Keep all changes limited to deployment configuration, service installation, and robot-local runtime checks.
