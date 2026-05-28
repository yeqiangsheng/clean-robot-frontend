# Ubuntu 20.04 新车批量部署手册

本文面向全新的 Ubuntu 20.04 清洁机器人本体，用于现场批量部署 5 台或更多小车的前端与 Site Gateway。

适用目标：

- 小车本体运行 Ubuntu 20.04 桌面系统
- 小车本体运行 ROS、rosbridge 和后端服务
- 小车触摸屏为 10.1 寸 1280x800
- 前端发布包部署在小车本体
- 开机后自动进入 Chromium kiosk 前端页面

推荐运行链路：

```text
小车触摸屏 / 同网段电脑 / 平板
  -> http://<robot-ip>:4173/
Ubuntu 小车本体 Site Gateway
  -> ws://127.0.0.1:9090
小车本体 ROS / rosbridge / 后端服务
```

## 1. 批量部署前准备

### 1.1 Windows 开发机生成发布包

在 Windows 前端源码工程执行：

```powershell
npm.cmd install
npm.cmd run package:trial
```

发布目录：

```text
release/clean-robot-site-v0.1.0-rc.2
```

部署到小车时只拷贝发布目录，不要拷贝完整源码仓库。

### 1.2 每台小车需要提前登记的信息

建议建立一张交付表，每台车一行：

| 项目 | 示例 | 说明 |
| --- | --- | --- |
| 车辆编号 | CR-001 | 现场资产编号 |
| hostname | clean-robot-001 | Ubuntu 主机名，五台车必须不同 |
| robotId | local_robot 或 CR-001 | 前端/Gateway 展示用机器人编号，按现场约定 |
| 小车 IP | 10.73.51.59 | DHCP 保留或静态 IP |
| rosbridge URL | ws://127.0.0.1:9090 | 小车本体部署时通常固定为本机 |
| 触摸屏用户 | baer | 自动登录和 kiosk 运行用户 |
| 前端入口 | http://<robot-ip>:4173/ | 给电脑和平板访问 |
| 账号策略 | operator/service/engineer | 默认试产密码统一为 `bulibusan1314`，交付前按现场要求改密 |

账号密码、Wi-Fi 密码、远程访问密码应通过现场安全渠道交付，不要写进仓库、截图或群聊。

## 2. 全新 Ubuntu 系统基线

### 2.1 确认系统和硬件

在小车上执行：

```bash
lsb_release -a
uname -a
whoami
ip addr
```

确认：

- 系统是 Ubuntu 20.04
- 触摸屏能正常显示 1280x800
- 鼠标/触摸可操作
- 小车能访问本机 `127.0.0.1`
- 同网段电脑能访问小车 IP

### 2.2 设置主机名

每台车必须使用唯一 hostname：

```bash
sudo hostnamectl set-hostname clean-robot-001
hostnamectl
```

批量复制系统镜像时，还要确认每台车的 `/etc/machine-id` 不相同。若使用克隆镜像，应由后端/系统负责人按 Ubuntu 标准流程重新生成 machine-id，避免多台车在网络、日志和远程运维中身份冲突。

### 2.3 设置时间和时区

```bash
timedatectl
sudo timedatectl set-timezone Asia/Shanghai
```

如果现场不能联网校时，需要确保机器人后端和前端日志使用同一时间基准。

### 2.4 安装基础依赖

至少需要：

- Node.js 22 或更新版本
- npm
- curl
- Chromium 或 Google Chrome
- x11-xserver-utils，用于关闭屏幕休眠

检查：

```bash
node -v
npm -v
curl --version
which chromium-browser || which chromium || which google-chrome || true
which xset || true
```

如果 Node.js 缺失或版本过低，请按公司批准的 Ubuntu 20.04 安装方式安装 Node.js 22 或更新版本。批量部署建议使用离线 `.deb` 包或统一内网镜像，避免五台车临场依赖公网。

## 3. 拷贝和安装前端发布包

推荐安装目录：

```bash
/opt/clean-robot-site
```

假设发布包目录已经拷贝到小车当前用户主目录：

```bash
~/clean-robot-site-v0.1.0-rc.2
```

安装：

```bash
sudo mkdir -p /opt/clean-robot-site
sudo chown "$USER:$USER" /opt/clean-robot-site

cd /opt/clean-robot-site
cp -a ~/clean-robot-site-v0.1.0-rc.2 ./clean-robot-site-v0.1.0-rc.2
ln -sfn /opt/clean-robot-site/clean-robot-site-v0.1.0-rc.2 /opt/clean-robot-site/current

cd /opt/clean-robot-site/current
npm install --omit=dev
```

确认发布包完整：

```bash
test -f dist/index.html
test -f site-gateway/server.mjs
test -f scripts/install-site-systemd.sh
test -f start-frontend-prod.sh
```

## 4. 配置每台车的运行参数

### 4.1 浏览器可见配置

按现场需要编辑：

```text
public/app-config.json
```

只放浏览器可见信息，例如：

- `siteName`
- `robotId`
- `apiBaseUrl`
- `enabledModules`
- 支持联系人信息

不要在这里写：

- rosbridge 地址
- 密码
- 令牌
- 工程师口令

### 4.2 Site Gateway 本地配置

编辑：

```text
site-gateway/site-config.json
```

小车本体部署时，rosbridge 推荐保持：

```json
"rosbridgeUrl": "ws://127.0.0.1:9090"
```

发布包默认自带三个出厂调试账号：

| 账号 | 角色 | 默认密码 |
| --- | --- | --- |
| `operator` | 操作员 | `bulibusan1314` |
| `service` | 服务人员 | `bulibusan1314` |
| `engineer` | 工程师 | `bulibusan1314` |

注意：

- `bootstrapUsers` 是启动同步配置，不只是空库初始化
- 如果同名用户已存在，配置里的角色和密码会覆盖数据库中的值
- 新车试产和内部调试可以直接使用默认账号
- 批量交付前应确认是否保留默认密码
- 如果要修改默认密码，请修改小车部署目录里的 `site-gateway/site-config.json`
- 不要把客户现场专属密码提交回源码仓库
- 不要把 A 车的 SQLite 数据库复制到 B 车

默认配置还包含：

```json
"clearSessionsOnStartup": true
```

含义是 Site Gateway 每次启动时清空旧登录会话。小车断电重启后，不管关机前是否已经登录，触摸屏都应回到登录页。这样现场人员每次上电都需要重新选择账号登录，避免上一次使用者的会话被自动恢复。只有在明确需要保留重启前登录态的内部调试场景，才建议改成 `false`。

Site Gateway 数据库位置：

```text
.tmp/site-gateway/site-gateway.sqlite
```

全新小车如果需要重新初始化账号，可以在首次启动前确保该文件不存在。已经交付使用的小车不要随意删除该文件，否则会丢失账号、会话和审计记录。

## 5. 启动 Site Gateway

### 5.1 手动冒烟启动

```bash
cd /opt/clean-robot-site/current
SITE_ROSBRIDGE_URL=ws://127.0.0.1:9090 ./start-frontend-prod.sh
curl http://127.0.0.1:4173/api/health
./stop-frontend-prod.sh
```

期望：

- `status` 为 `ok`
- `version` 为当前发布版本
- rosbridge 正常时 `ros.status` 为 `connected`

如果 `ros.status` 不是 `connected`，先排查小车后端 rosbridge，不要改前端源码。

检查 rosbridge：

```bash
ss -ltnp | grep 9090 || true
systemctl status rosbridge* --no-pager || true
```

### 5.2 安装 systemd 开机服务

```bash
cd /opt/clean-robot-site/current
sudo SITE_ROSBRIDGE_URL=ws://127.0.0.1:9090 ./scripts/install-site-systemd.sh
```

检查：

```bash
systemctl status clean-robot-site-gateway --no-pager
journalctl -u clean-robot-site-gateway -n 80 --no-pager
curl http://127.0.0.1:4173/api/health
```

如果需要重新安装：

```bash
cd /opt/clean-robot-site/current
sudo ./scripts/uninstall-site-systemd.sh
sudo SITE_ROSBRIDGE_URL=ws://127.0.0.1:9090 ./scripts/install-site-systemd.sh
```

## 6. 配置开机自动进入前端 kiosk

### 6.1 启用触摸屏用户自动登录

确认触摸屏用户：

```bash
whoami
echo "$HOME"
```

GDM3 常见配置：

```bash
sudo nano /etc/gdm3/custom.conf
```

确保包含：

```ini
[daemon]
AutomaticLoginEnable=true
AutomaticLogin=<触摸屏用户>
```

例如：

```ini
[daemon]
AutomaticLoginEnable=true
AutomaticLogin=baer
```

不要为了自动登录而配置全局 sudo 免密。

### 6.2 创建 kiosk 启动脚本

创建：

```bash
mkdir -p ~/.local/bin
nano ~/.local/bin/clean-robot-kiosk.sh
```

内容：

```bash
#!/usr/bin/env bash
set -e

until curl -fsS http://127.0.0.1:4173/api/health >/dev/null; do
  sleep 2
done

xset s off -dpms 2>/dev/null || true

if command -v chromium-browser >/dev/null 2>&1; then
  BROWSER=chromium-browser
elif command -v chromium >/dev/null 2>&1; then
  BROWSER=chromium
elif command -v google-chrome >/dev/null 2>&1; then
  BROWSER=google-chrome
else
  echo "No Chromium-compatible browser found." >&2
  exit 1
fi

exec "$BROWSER" \
  --kiosk http://127.0.0.1:4173/ \
  --no-first-run \
  --disable-session-crashed-bubble \
  --disable-infobars \
  --password-store=basic \
  --user-data-dir="$HOME/.config/clean-robot-kiosk-chromium"
```

授权：

```bash
chmod +x ~/.local/bin/clean-robot-kiosk.sh
```

### 6.3 创建桌面自启动文件

```bash
mkdir -p ~/.config/autostart
nano ~/.config/autostart/clean-robot-kiosk.desktop
```

内容：

```ini
[Desktop Entry]
Type=Application
Name=Clean Robot Kiosk
Exec=/home/<触摸屏用户>/.local/bin/clean-robot-kiosk.sh
X-GNOME-Autostart-enabled=true
```

将 `<触摸屏用户>` 替换为真实用户名，例如：

```ini
Exec=/home/baer/.local/bin/clean-robot-kiosk.sh
```

### 6.4 处理 keyring 认证弹窗

如果开机出现：

```text
需要认证 / 您登录计算机时，您的登录密钥环未被解锁
```

优先确认 kiosk 启动命令已包含：

```text
--password-store=basic
--user-data-dir="$HOME/.config/clean-robot-kiosk-chromium"
```

仍弹窗时，处理当前触摸屏用户的 login keyring。命令行方式处理前先备份：

```bash
mkdir -p ~/.local/share/keyrings.backup
cp -a ~/.local/share/keyrings/* ~/.local/share/keyrings.backup/ 2>/dev/null || true
```

然后清理旧 keyring：

```bash
rm -f ~/.local/share/keyrings/login.keyring
rm -f ~/.local/share/keyrings/user.keystore
```

重启后确认不再弹出认证框。

### 6.5 禁用 NoMachine 更新弹窗

保留 NoMachine server 远程维护能力，但禁用开机更新提示。检查：

```bash
ls /etc/xdg/autostart | grep -i nomachine || true
ls ~/.config/autostart | grep -i nomachine || true
```

如果存在 NoMachine update 相关 autostart 项，将其改名为 `.disabled`。不要卸载 NoMachine server。

## 7. 触摸屏显示验收

触摸屏规格：

- 10.1 寸
- 16:10
- 1280x800

验收重点：

- 开机后自动进入前端页面
- 小车断电重启后回到前端登录页，不自动恢复上次已登录页面
- 不出现 Ubuntu 系统密码输入
- 不出现 keyring 认证弹窗
- 不出现 NoMachine 更新弹窗
- `operator` 登录后只看到总览页，不显示顶部模块导航栏
- `operator` 总览页一屏显示，无页面滚动条
- `operator` 总览页可执行任务、回家、手动点动
- service/engineer 角色可看到对应模块导航

前端工程内可提前用 1280x800 自动检查：

```powershell
npm.cmd run test:tablet-ui
```

## 8. 同网段访问验收

在小车上确认 IP：

```bash
ip addr
```

在同一 Wi-Fi 或同一局域网电脑访问：

```text
http://<robot-ip>:4173/
http://<robot-ip>:4173/api/health
```

如果电脑无法访问：

- 确认小车 IP 正确
- 确认电脑和平板在同一网段
- 确认 Site Gateway 监听 `0.0.0.0:4173`
- 确认防火墙没有拦截 4173

检查监听：

```bash
ss -ltnp | grep 4173 || true
```

## 9. 五台车批量部署建议

推荐流程：

1. 在 Windows 开发机生成唯一 release 包
2. 把同一 release 包拷贝到 5 台小车
3. 每台车单独设置 hostname、IP、robotId、账号密码
4. 每台车单独安装 `npm install --omit=dev`
5. 每台车单独安装 systemd 服务
6. 每台车单独配置 kiosk autostart
7. 每台车单独完成 `/api/health`、触摸屏、同网段访问和 ROS 联调验收

可以复制的内容：

- 发布包 `clean-robot-site-v0.1.0-rc.2`
- kiosk 脚本模板
- systemd 安装脚本
- 文档和验收清单

不要在多台车之间直接复制：

- `.tmp/site-gateway/site-gateway.sqlite`
- `.config/clean-robot-kiosk-chromium`
- 已登录浏览器 profile
- `/etc/hostname`
- `/etc/machine-id`
- 真实账号密码记录
- 现场日志和审计记录

## 10. 单车验收记录模板

每台车完成后，建议记录：

```text
车辆编号：
hostname：
小车 IP：
安装目录：
发布版本：
Node 版本：
npm 版本：
Site Gateway 服务状态：
/api/health status：
/api/health version：
/api/health ros.status：
触摸屏是否自动进入前端：
是否无 keyring 弹窗：
是否无 NoMachine 弹窗：
operator 总览页是否一屏显示：
同网段电脑访问 URL：
验收人：
验收日期：
遗留问题：
```

## 11. 常用维护命令

查看服务：

```bash
systemctl status clean-robot-site-gateway --no-pager
journalctl -u clean-robot-site-gateway -f
```

重启服务：

```bash
sudo systemctl restart clean-robot-site-gateway
```

健康检查：

```bash
curl http://127.0.0.1:4173/api/health
```

临时退出 kiosk：

```bash
pkill -f clean-robot-kiosk.sh || true
pkill -f "chromium.*--kiosk" || true
pkill -f "chrome.*--kiosk" || true
```

临时禁用 kiosk 自启动：

```bash
mv ~/.config/autostart/clean-robot-kiosk.desktop ~/.config/autostart/clean-robot-kiosk.desktop.disabled
```

恢复 kiosk 自启动：

```bash
mv ~/.config/autostart/clean-robot-kiosk.desktop.disabled ~/.config/autostart/clean-robot-kiosk.desktop
```

## 12. 交付边界

前端团队交付：

- 发布包
- Site Gateway
- systemd 安装脚本
- kiosk 启动建议
- 前端触摸屏适配
- 前端/Gateway 验收文档

小车后端/系统团队确认：

- Ubuntu 图形桌面可用
- rosbridge 在本机 `9090` 可用
- ROS 后端服务启动稳定
- 小车网络和 IP 策略稳定
- NoMachine 或其他远程维护工具可用
- 自动登录策略符合公司安全要求

如果现场现象与本文不一致，先按 `故障排查手册.md` 排查，再决定是否需要前端、后端或系统侧调整。
