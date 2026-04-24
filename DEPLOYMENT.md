# 清洁机器人站点前端部署说明

## 1. 部署目标

当前交付目标已经升级为“前端 + 本地站点网关”的单站点 Windows 商用落地形态。

正式运行链路：

`浏览器 -> 本地 Site Gateway -> ROS / rosbridge / 机器人服务`

## 2. 发布包生成

在源码仓库执行：

```powershell
npm.cmd install
npm.cmd run package:trial
```

发布产物会生成在：

```text
release/clean-robot-site-v0.0.0
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
- `quickRosbridgeUrls`
- `rolePolicy`
- `engineerUnlockMode`
- 浏览器可见口令

### `site-gateway/site-config.json`

这是站点网关本地运行配置，负责：

- `rosbridgeUrl`
- 角色能力策略
- 会话时长
- 审计保留天数
- 首次引导账号

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

## 7. 升级与回滚

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

## 8. 日志与健康检查

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

## 9. 首次账号初始化

如果本地 SQLite 用户表为空，站点网关会按部署环境 `site-config.json` 中的 `bootstrapUsers` 初始化账号。仓库默认配置不带可登录的初始密码；现场安装时必须写入站点专属强密码，禁止使用 `change-me*` 之类占位值。

默认建议保留四类角色：

- `operator`
- `service`
- `engineer`
- `admin`

现场交付后应立即修改默认密码。

如需连接现场 ROS，请在部署配置或启动环境中设置 `SITE_ROSBRIDGE_URL`，不要把某个临时联调 IP 固化进源码发布包。

## 10. 发布前验证

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

## 11. 当前限制

这版已经适合“单站点 Windows 商用落地第一阶段”，但还不是最终平台形态。

当前仍保留的过渡项：

- 部分只读运行态还复用浏览器侧 ROS 订阅，但已经统一改走本地 `/ws/rosbridge` 代理
- WinSW 二进制仍需现场提供，不直接放进仓库
- 多站点、云端账号体系、远程运维暂未引入
