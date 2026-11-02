# Windows 桌面版

## 使用

双击发布包中的 `NetworkDesk-<版本>-portable.exe`。无需安装 Node.js、无需管理员权限，也不需要手动启动本地服务。首次启动会解压内置运行文件到临时目录，因此可能稍慢。只支持 Windows x64；实时检测仍需要互联网及 Windows 自带的 curl、PowerShell。

这是免安装版，设置与历史保存在 `%APPDATA%\NetworkDesk`，默认报告目录为其下的 `reports`。退出软件不会删除已保存的报告。复制 EXE 到另一台电脑不包含旧电脑的私人记录；如需迁移请导出 JSON，再在新电脑导入。

顶部横向导航包含全部原有栏目，“更多”中保留 Whois、IP 卡片、资讯、报告中心、帮助和设置。底部任务栏提供系统采集、停止本轮等待、保存合并 HTML、打开报告目录。最右侧箭头展开完整报告选项，可导出 JSON、按模块导出、导入系统 JSON/历史报告和选择脱敏。

“采集系统信息”调用随软件附带的只读 PowerShell 脚本，生成本机 JSON 后自动合并到当前报告。脚本中的进程级 `ExecutionPolicy Bypass` 不更改系统执行策略。软件不写 Windows/WinHTTP 代理、网卡、注册表或防火墙设置。

Windows 若显示网络权限提示，由用户自行决定；点击“取消”可保持当前防火墙权限。受限制的 UDP/WebRTC 观测会按实际返回显示失败或无法确定。软件不自动添加防火墙规则。

## 检测来源

桌面窗口使用独立的 Chromium 环境。界面、JSON 和 HTML 报告会区分“本软件内嵌环境”、外部浏览器和本机服务请求。这些来源的 IP、指纹、扩展和代理路径不能相互替代。

“在浏览器中复测”通过系统默认浏览器打开同一栏目。也可将打开的本机地址复制到 Edge 或 Chrome；保持桌面程序运行。外部浏览器报告可独立导出，导入报告中心时保留其原采集来源和时间。系统 JSON 可与任一浏览器报告合并。

软件内的 HTTP/SOCKS5 选项只用于指定本机服务的请求路径；不更改 Windows 系统代理，也不修改外部浏览器配置。停止按钮中止等待和后续采集；已经发出的网络或远端探针请求可能仍会结束，已有结果会保留。

## 从源码构建

在 Windows 10/11 x64 上安装 Node.js 22.12 或更新的受支持版本（建议 Node.js 24，与 CI 一致），确认 curl 和 PowerShell 可用，进入源码目录：

```sh
npm ci
npm exec install-electron
npm run desktop:assets
npm run build
npm run desktop
```

生成单文件免安装包：

```sh
npm run desktop:pack
```

产物位于 `release/desktop/NetworkDesk-1.2.12-portable.exe`。`desktop:pack` 已包含发布检查、前端构建和图标生成；不要提交生成的 release 或 node_modules。`npm run desktop:dir` 生成未压缩目录供调试，常规网页版本使用 `npm start`。初次安装 Electron 与构建工具会下载官方构建资源，需网络。

免安装版使用 AppData 保存私人记录，应用文件虽为单文件，个人数据不会被打进 EXE。配置位置、请求路径和可选密钥见 [配置说明](CONFIGURATION.md)，报告操作见 [使用说明](USAGE.md)。

## 代码位置与权限边界

- `desktop/main.cjs`：窗口、单实例、本机服务生命周期、文件保存、只读采集和外部浏览器入口。
- `desktop/preload.cjs`：有限的桌面能力桥接，不暴露 Node.js、shell 或任意文件写入接口。
- `desktop/policy.mjs`：IPC 发送者与主框架校验、协议/路径和设置项限制。
- `src/desktop.jsx` / `src/desktop.css`：底部任务栏与桌面布局；所有检测栏目复用共享模块。
- `src/storage.mjs`：桌面设置/历史与浏览器存储适配，桌面数据不依赖随机端口。
- `electron-builder.json`：Windows x64 portable 打包；只包含明确列出的项目资源。

渲染页面保持 sandbox/contextIsolation，关闭 Node 集成与 webview。外部 HTTPS 链接交给浏览器处理；特权操作只接受本软件主页面调用。软件只监听 `127.0.0.1`，不设置开机启动、不写系统代理。公开源码包和 EXE 不包含用户报告、密钥、测试数据或本地配置。

此版本未配置商业代码签名证书；不要通过关闭系统安全功能来安装或运行。发布者可在自己的构建环境中配置签名，不能把证书或密码放进源码仓库。

## 免安装启动器的重复启动保护

公开的单文件 EXE 外层由 `desktop/launcher.cs` 实现，在解压之前取得当前用户会话的命名互斥锁。再次双击时激活已打开的窗口，不重复覆盖运行文件。退出后清理本次启动器自己的临时文件；个人报告仍保存在 AppData。

`npm run desktop:pack` 会先打包 Electron，再运行 `scripts/wrap-portable.mjs` 编译此启动器。编译器使用 Windows 自带 .NET Framework 的 `csc.exe`；运行使用 Windows 10/11 的 .NET Framework 4.x。构建目录中的 `*-runtime.exe` 是内部打包中间文件，公开交付只使用 `*-portable.exe`。
