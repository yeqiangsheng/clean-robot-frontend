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

The release ships three factory bootstrap users for fresh robot commissioning: `operator`, `service`, and `engineer`. The initial password for these three users is `bulibusan1314`. Before customer delivery, decide whether to keep these accounts or replace the passwords in `site-gateway/site-config.json`.

`bootstrapUsers` is synchronized at gateway startup. If a user already exists, the role and password from `site-config.json` will overwrite the local SQLite record for the same username. Do not commit customer-specific passwords back to the source repository.

By default the release also sets:

```json
"clearSessionsOnStartup": true
```

This clears all old login sessions whenever the Site Gateway starts. After a robot power cycle, the touch screen should return to the frontend login page instead of restoring the previous authenticated page. Set this to `false` only for controlled internal debugging where session persistence across gateway restarts is explicitly required.

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

## Touch Screen Kiosk Mode

The commercial robot touch screen should boot into the frontend without requiring an operator to type the Ubuntu desktop password.

Use the robot-local frontend URL for the kiosk browser:

```text
http://127.0.0.1:4173/
```

Enable automatic login for the touch-screen desktop user. On GDM3 this is usually configured in:

```text
/etc/gdm3/custom.conf
```

Example:

```ini
[daemon]
AutomaticLoginEnable=true
AutomaticLogin=<touchscreen-user>
```

Create a user autostart entry:

```text
~/.config/autostart/clean-robot-kiosk.desktop
```

Example:

```ini
[Desktop Entry]
Type=Application
Name=Clean Robot Kiosk
Exec=/home/<touchscreen-user>/.local/bin/clean-robot-kiosk.sh
X-GNOME-Autostart-enabled=true
```

Recommended kiosk launcher:

```bash
#!/usr/bin/env bash
set -e

until curl -fsS http://127.0.0.1:4173/api/health >/dev/null; do
  sleep 2
done

xset s off -dpms 2>/dev/null || true

chromium-browser \
  --kiosk http://127.0.0.1:4173/ \
  --no-first-run \
  --disable-session-crashed-bubble \
  --disable-infobars \
  --password-store=basic \
  --user-data-dir="$HOME/.config/clean-robot-kiosk-chromium"
```

If the robot image uses `chromium` or `google-chrome` instead of `chromium-browser`, replace the executable name only.

`--password-store=basic` and the dedicated `--user-data-dir` avoid coupling the kiosk browser to the desktop user's GNOME keyring. If Ubuntu still shows "login keyring was not unlocked" after auto-login, reset or recreate the current user's login keyring with an empty password. Do not solve this by granting passwordless sudo to the touch-screen user.

If NoMachine update prompts appear at boot, disable the NoMachine update autostart entry while keeping the NoMachine server installed for remote maintenance.

To temporarily exit kiosk for maintenance:

```bash
pkill -f clean-robot-kiosk.sh || true
pkill -f "chromium.*--kiosk" || true
pkill -f "chrome.*--kiosk" || true
```

To disable kiosk on the next boot:

```bash
mv ~/.config/autostart/clean-robot-kiosk.desktop ~/.config/autostart/clean-robot-kiosk.desktop.disabled
```

Restore it by renaming the file back to `clean-robot-kiosk.desktop`.

## Release Health Criteria

- `/api/health` returns `status=ok`.
- `/api/health` returns `version=0.1.0-rc.2` for this release candidate.
- `ros.status=connected` when rosbridge is online on the configured URL.
- The top UI connection badges show Gateway online and ROS connected.
- The touch screen boots directly into the frontend kiosk without Ubuntu password prompts.
- After a robot power cycle, the frontend shows the login page instead of restoring the previous authenticated session.
- The 10.1 inch 1280x800 operator overview fits in one screen without page scrolling.

If `ros.status=closed`, first check rosbridge on the robot:

```bash
systemctl status rosbridge*
ss -ltnp | grep 9090
```

Then confirm the Site Gateway uses the intended `SITE_ROSBRIDGE_URL`.
