# 清洁机器人站点前端部署说明

## 1. 部署目标

当前交付目标已经升级为“前端 + 本地站点网关”的单站点商用落地形态，可部署在 Windows 工控机，也可部署在 Ubuntu 20.04 小车本体触摸屏上。

正式运行链路：

`触摸屏/浏览器 -> 本地 Site Gateway -> ROS / rosbridge / 机器人服务`

## 2. 发布包生成

在源码仓库执行：

```powershell
npm.cmd install
npm.cmd run package:trial
```

发布产物会生成在：

```text
release/clean-robot-site-v0.1.0-rc.2
```

发布目录至少包含：

- `dist/`
- `public/app-config.json`
- `site-gateway/`
- `scripts/`
- `package.json`
- `package-lock.json`
- `start-frontend-prod.cmd`
- `stop-frontend-prod.cmd`
- `RELEASE-INFO.json`
- `DEPLOYMENT.md`
- `现场验收清单.md`
- `故障排查手册.md`

## 3. 配置边界

### `public/app-config.json`

这是浏览器可见的 UI 配置，只允许放这些内容：

- `siteName`
- `robotId`
- `apiBaseUrl`
- `enabledModules`
- 支持联系人信息

不再在这里暴露：

- `rosbridgeUrl`
- `rolePolicy`
- `engineerUnlockMode`
- 浏览器可见口令

### `site-gateway/site-config.json`

这是站点网关本地运行配置，负责：

- `rosbridgeUrl`
- 角色能力策略
- 会话时长
- 启动时是否清空旧登录会话
- 审计保留天数
- 出厂调试账号 `bootstrapUsers`

## 4. 首次安装

进入发布目录后执行：

```powershell
npm.cmd install --omit=dev
```

说明：

- 生产启动不再自动执行 `verify`
- 生产机不需要安装 dev 依赖
- `dist` 必须由发布包提前带好

## 5. 手动启动站点

```powershell
.\start-frontend-prod.cmd
```

默认访问地址：

```text
http://127.0.0.1:4173
```

如需禁止自动弹浏览器：

```powershell
$env:FRONTEND_NO_OPEN_BROWSER='1'
.\start-frontend-prod.cmd
```

停止站点：

```powershell
.\stop-frontend-prod.cmd
```

## 6. 安装为 Windows 服务

发布包已经内置 WinSW 服务安装脚本，但 WinSW 二进制需要现场提供一次。

示例：

```powershell
.\scripts\install-site-service.ps1 -WinSwExePath C:\path\to\WinSW.exe
```

如果现场 ROS 不在本机，可在安装服务时写入运行环境变量：

```powershell
.\scripts\install-site-service.ps1 -WinSwExePath C:\path\to\WinSW.exe -RosbridgeUrl ws://<robot-host>:9090
```

安装脚本会：

- 检查发布目录是否完整
- 检查 Node.js 可执行路径
- 生成 `service\clean-robot-site-service.xml`
- 复制 WinSW 可执行文件到 `service\clean-robot-site-service.exe`
- 安装并启动 `CleanRobotSiteGateway` 服务

卸载服务：

```powershell
.\scripts\uninstall-site-service.ps1
```

## 7. Ubuntu 小车本体部署与 kiosk 自启动

小车本体部署时，不建议把完整源码仓库放到车上。现场只拷贝发布包，例如：

```text
clean-robot-site-v0.1.0-rc.2
```

如果是一台全新的 Ubuntu 小车，或需要一次部署多台车，请优先按 [Ubuntu 20.04 新车批量部署手册](docs/ubuntu20_new_robot_batch_deployment.md) 执行。该手册包含系统基线、hostname/IP、Node/Chromium、systemd、kiosk、keyring、NoMachine 和单车验收记录模板。

推荐安装目录：

```bash
/opt/clean-robot-site/current
```

首次安装：

```bash
sudo mkdir -p /opt/clean-robot-site
sudo chown "$USER:$USER" /opt/clean-robot-site
cd /opt/clean-robot-site
cp -a ~/clean-robot-site-v0.1.0-rc.2 ./clean-robot-site-v0.1.0-rc.2
ln -sfn /opt/clean-robot-site/clean-robot-site-v0.1.0-rc.2 /opt/clean-robot-site/current
cd /opt/clean-robot-site/current
npm install --omit=dev
```

安装为开机自启动 systemd 服务：

```bash
cd /opt/clean-robot-site/current
sudo SITE_ROSBRIDGE_URL=ws://127.0.0.1:9090 ./scripts/install-site-systemd.sh
systemctl status clean-robot-site-gateway --no-pager
curl http://127.0.0.1:4173/api/health
```

小车触摸屏 kiosk 推荐由桌面会话自启动 Chromium，入口固定使用本机地址：

```text
http://127.0.0.1:4173/
```

推荐启动脚本路径：

```text
~/.local/bin/clean-robot-kiosk.sh
```

脚本核心命令建议包含：

```bash
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

如果现场 Chromium 命令是 `chromium` 或 `google-chrome`，按实际系统替换即可。`--password-store=basic` 和独立 `--user-data-dir` 用于避免 kiosk 浏览器触发 GNOME keyring。

桌面自启动文件建议放在：

```text
~/.config/autostart/clean-robot-kiosk.desktop
```

内容示例：

```ini
[Desktop Entry]
Type=Application
Name=Clean Robot Kiosk
Exec=/home/<触摸屏用户>/.local/bin/clean-robot-kiosk.sh
X-GNOME-Autostart-enabled=true
```

小车需要开机直接进入前端时，启用该触摸屏用户的系统自动登录。GDM3 常见配置为：

```ini
[daemon]
AutomaticLoginEnable=true
AutomaticLogin=<触摸屏用户>
```

位置通常是：

```text
/etc/gdm3/custom.conf
```

如果开机出现“需要认证 / 登录密钥环未被解锁”，应处理当前触摸屏用户的 GNOME login keyring，或让 kiosk Chromium 使用 `--password-store=basic` 的独立 profile。不要为了消除该弹窗而给用户配置全局 sudo 免密。

如果 NoMachine 弹出更新提示，可以禁用 NoMachine update 的 autostart 项，但不要卸载 NoMachine server，以免影响远程维护。

进入桌面维护时，可以临时关闭 kiosk：

```bash
pkill -f clean-robot-kiosk.sh || true
pkill -f "chromium.*--kiosk" || true
pkill -f "chrome.*--kiosk" || true
```

如需临时禁止下次开机自动进入前端：

```bash
mv ~/.config/autostart/clean-robot-kiosk.desktop ~/.config/autostart/clean-robot-kiosk.desktop.disabled
```

恢复时再改回原文件名。

## 8. 升级与回滚

### 升级

假设新发布包在 `D:\incoming\clean-robot-site-v0.0.1`，正式安装目录为 `C:\CleanRobot\site`：

```powershell
D:\incoming\clean-robot-site-v0.0.1\scripts\upgrade-site-release.ps1 -InstallRoot C:\CleanRobot\site
```

升级脚本会：

1. 停止当前服务
2. 备份当前安装目录到 `backups/`
3. 复制新发布包到安装目录
4. 恢复或重用原有 WinSW 包装器
5. 重新安装并启动站点服务

### 回滚

```powershell
.\scripts\rollback-site-release.ps1 -InstallRoot C:\CleanRobot\site
```

默认会回滚到最新一份 `site-backup-*` 备份目录。也可以用 `-BackupName` 指定具体版本。

## 9. 日志与健康检查

默认日志位置：

- `.tmp/frontend-prod/frontend.out.log`
- `.tmp/frontend-prod/frontend.err.log`
- `.tmp/frontend-prod/frontend.pid`

健康检查接口：

- `http://127.0.0.1:4173/api/health`

健康接口会返回：

- 站点版本
- 站点名称
- 机器人编号
- 当前 ROS 连接状态

## 10. 首次账号初始化

当前发布包默认自带三个出厂调试账号，便于新车部署后立即登录调试：

| 账号 | 角色 | 默认密码 |
| --- | --- | --- |
| `operator` | 操作员 | `bulibusan1314` |
| `service` | 服务人员 | `bulibusan1314` |
| `engineer` | 工程师 | `bulibusan1314` |

站点网关启动时会按部署环境 `site-config.json` 中的 `bootstrapUsers` 同步本地 SQLite 用户表。如果同名用户已存在，配置里的角色和密码会覆盖数据库中的值。因此：

- 新车试产和内部调试可以直接使用默认账号
- 批量交付前应确认是否保留这组三账号
- 如果要修改默认密码，请修改小车部署目录里的 `site-gateway/site-config.json`
- 不要把客户现场专属密码提交回源码仓库

当前默认保留三类现场角色：

- `operator`
- `service`
- `engineer`

现场交付后应立即修改默认密码。

默认配置包含：

```json
"clearSessionsOnStartup": true
```

含义是 Site Gateway 每次启动时清空旧登录会话。小车断电重启后，即使关机前已经登录过，触摸屏也会回到登录页，避免无人确认身份时直接进入操作界面。只有在明确需要保留重启前登录态的内部调试场景，才建议改为 `false`。

如需连接现场 ROS，请在部署配置或启动环境中设置 `SITE_ROSBRIDGE_URL`，不要把某个临时联调 IP 固化进源码发布包。

## 11. 发布前验证

源码仓库中至少执行：

```powershell
npm.cmd run verify
npm.cmd run test:e2e
```

当前基线要求：

- `lint` 通过
- `typecheck` 通过
- `build` 通过
- `verify` 通过
- mock smoke 通过

## 12. 当前限制

这版已经适合“单站点 Windows 商用落地第一阶段”，但还不是最终平台形态。

当前仍保留的过渡项：

- 运行态只读数据已统一由 Site Gateway HTTP API 聚合，浏览器不再直接订阅 ROS
- WinSW 二进制仍需现场提供，不直接放进仓库
- 多站点、云端账号体系、远程运维暂未引入
