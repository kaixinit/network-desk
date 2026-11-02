# 网络诊断台 · Network Desk

中文本地网络诊断工具，提供 Windows 免安装桌面版和本地网页版。将 IP 出口、平台环境、DNS、WebRTC、连通性和系统信息汇总为可导出的报告。

**当前版本：1.2.8 · Windows x64 · MIT（自主编写代码）**

只监听 `127.0.0.1`，不要求管理员权限，不修改系统代理、网卡、时区或防火墙。实时检测会访问第三方服务，不是完全离线工具。

## 选择运行方式

| 方式                                    | 使用方法                        | 条件                                                       |
| --------------------------------------- | ------------------------------- | ---------------------------------------------------------- |
| `NetworkDesk-1.2.8-portable.exe`        | 双击使用桌面版                  | Windows 10/11 x64，无须安装 Node.js                        |
| `NetworkDesk-1.2.8-windows-x64.zip`     | 解压后双击 `启动网络诊断台.cmd` | 包内含 Node.js，在 Edge/Chrome 等浏览器中使用              |
| 本仓库 / `NetworkDesk-1.2.8-source.zip` | 安装依赖、构建后运行            | Node.js 22.12+ 的受支持版本，建议与 CI 一样使用 Node.js 24 |

EXE 和运行包由发布者放在 GitHub Releases。源码 ZIP 是构建输入，不包含运行时或构建好的前端。实时请求依赖系统 `curl`，Windows 系统采集依赖 PowerShell。

## 快速开始

### 桌面版

1. 双击免安装 EXE，首次启动会解压内置文件。
2. 在顶部选择栏目，点击“开始检测”或“重新检测”。部分栏目打开后自动读取数据。
3. 点击底部“采集系统信息”，只读脚本生成 JSON 并自动合并。
4. 点击“保存合并报告”导出 HTML；右侧箭头展开 JSON 导出、导入和脱敏选项。

设置、历史和默认报告位于 `%APPDATA%\NetworkDesk`，不会写进 EXE。退出后本地服务停止，已保存报告保留。完整步骤见 [使用说明](docs/USAGE.md) 和 [桌面版说明](docs/DESKTOP.md)。

### 本地网页版

完整解压 Windows 运行 ZIP，再双击 `启动网络诊断台.cmd`。浏览器自动打开；默认端口 `8780`，占用时自动选空闲端口。关闭服务窗口即可停止。不要直接双击 `index.html`：完整检测需要本地服务。

### 从源码运行

在包含 `package.json` 的项目目录执行：

```sh
npm ci
npm run build
npm start
```

`npm start` 启动完整本地服务并打开浏览器。构建需要开发依赖，请勿加 `--omit=dev`。`package.json` 中的 `private: true` 防止误发 npm，不影响公开到 GitHub。

热更新使用两个终端：第一个执行 `node server/index.mjs --port 8780`，第二个执行 `npm run dev`，使用 Vite 输出的地址。Vite 转发固定指向 `127.0.0.1:8780`，开发时确认该端口由本项目服务占用。

## 功能栏目

| 栏目           | 功能                                                                             |
| -------------- | -------------------------------------------------------------------------------- |
| IP 查询        | IPv4/IPv6、多目标出口、设备环境、连通摘要、完整 IP 查询联动                      |
| Claude / GPT   | 平台出口、第三方评分与完整 IP 核验、属性、安全标签、支持地区依据、连通、DNS、UDP |
| Google / Gmail | 公网参考出口、环境与参考配置对照、系统信息合并、连通性和证据说明                 |
| IP 评分        | 多源情报、反向 DNS、ASN/BGP、网段、DNSBL、关联信息；无数据时明确标注             |
| 网络连通       | 目标筛选、多次 HTTP 采样、浏览器/本机请求、重试、停止、应用内 HTTP/SOCKS5 选项   |
| DNS / WebRTC   | 权威 DNS 回查、双源 DoH、ICE/STUN 候选、完整出口比较                             |
| Cloudflare     | Trace、边缘节点对比、协议/TLS/WARP、上传下载采样、自有验证码配置验证             |
| 全球 Ping      | Globalping 多地区远端探针、时延、丢包、原始输出                                  |
| 服务状态       | 官方状态来源、事件、维护、组件、筛选                                             |
| Whois / RDAP   | 域名、IPv4/IPv6、ASN 注册信息及原始响应                                          |
| IP 卡片        | 配色、尺寸、PNG/SVG/剪贴板导出和嵌入代码                                         |
| AI 资讯 / 帮助 | 官方 RSS 标题及原文链接、本地帮助；不含转载文章全文                              |
| 报告中心       | 系统 JSON 合并、HTML/JSON、模块导出、脱敏、历史开关、查看与比较、报告回读        |

重复结果采用紧凑双列，窄屏自动单列。失败、未执行、未提供和无法确定均保留真实语义，不用演示数据补齐。

## 系统采集和报告

网页用户双击 `生成系统报告.cmd`，或在项目根目录执行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\collect-system.ps1
```

在报告中心点击“导入系统 JSON / 报告”，选择生成的 `reports/system-*.json`，再导出 HTML 或 JSON。脚本只读，`Bypass` 只作用于本次 PowerShell 进程。详见 [使用说明](docs/USAGE.md)。

**界面“隐藏 IP”和“导出时隐藏 IP”是独立开关。** 导出默认脱敏，HTML 可离线阅读，JSON 可再次导入。脱敏报告无法恢复完整 IP，需要重测。时间、地区、设备摘要和自行填写内容仍可能识别使用者，分享前须检查实际文件。

## 配置与检测边界

基础功能不需要密钥。可选 IP 情报、Globalping 配额及自有验证码的字段、路径和应用内请求选项见 [配置说明](docs/CONFIGURATION.md)。`config.example.json` 所有值为空，个人配置只放 `config.local.json`，不提交 Git。

- 评分来自第三方，只有完整返回 IP 与查询 IP 一致时才采用。轮换出口或分流可能导致不同分数。
- 内嵌 Chromium、外部浏览器和本机服务是不同观测环境，报告分别记录来源。
- Google 页面使用公网参考出口；配置匹配率不是纯净度或注册成功率，不能预测手机验证。
- HTTP 200 不等于账号可用；无 ICE 候选不等于没有泄露；DoH 查询不等于浏览器实际 DNS 出口。
- 上游 403、超时、限流、跨域限制和缺少密钥不能转换成“安全”或“通过”。

第三方来源与限制见 [来源说明](docs/PROVENANCE.md)，安全模型见 [SECURITY.md](SECURITY.md)。本项目不隶属于各被检测平台。

## 验证与打包

```sh
npm run build
npm test
npm run check:release
npm audit --audit-level=low
npm run package
```

`package` 生成 `release/NetworkDesk-1.2.8-source.zip` 和不含 Node 的 `local-node.zip`。设置 `NETWORK_DESK_NODE_DIR` 指向官方 Windows x64 Node 解压目录后，生成含运行时的 `windows-x64.zip`。ZIP 内附逐文件 `FILE-SHA256.json`。

Windows 单文件 EXE 构建：

```sh
npm exec install-electron
npm run desktop:pack
```

产物为 `release/desktop/NetworkDesk-1.2.8-portable.exe`。构建条件与签名边界见 [桌面构建](docs/DESKTOP.md)。仓库有自动源码检查及手动 `windows-portable` Actions 工作流，默认不自动发布，也不要求发布令牌。

## 上传 GitHub

以**新解压的源码包内层目录**作为仓库根目录，保留 `.github`、`.gitignore`、`.npmrc`、`.openai` 等隐藏文件。不要上传整个开发工作区、交付目录或 AppData。白名单包排除个人报告、本机配置、内部设计记录、截图、日志和缓存。

步骤与校验方法见 [GitHub 发布说明](docs/PUBLISHING.md)。GitHub Pages 只能托管静态前端，不能运行完整 Node 本地 API。

## 维护与许可

- [版本记录](CHANGELOG.md)
- [源码结构](docs/ARCHITECTURE.md)
- [1.2.8 缺陷复查](docs/REVIEW-1.2.8.txt)
- [第三方组件声明](THIRD_PARTY_NOTICES.md)

独立编写代码采用 [MIT](LICENSE)。第三方组件及数据保留各自许可和条件；`licenses/` 中的上游作者署名与联系方式属于版权声明，应保留。
