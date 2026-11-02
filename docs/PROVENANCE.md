# 源码、设计与数据来源

本项目独立编写页面组件、样式、数据模型、任务调度、导入导出和系统脚本。采用横向导航、出口/评分/属性卡片、紧凑双列结果和设备/历史区域等常见工具布局，保留网络诊断所需的功能分组与操作习惯。

实现过程由 Codex 辅助完成。不以改名、格式化或删署名的方式把第三方源码声称为原创。该声明描述实际代码来源，不保证外观主观上不会令人联想到其他网络工具。

## 自主实现范围

- `src/` 页面、路由、组件、状态与报告交互；`shared/` IP/数据校验和报告生成；`server/` 本地网关和各项接口适配；PowerShell 系统采集、发布脚本和功能测试。
- 不导入旧镜像前端，不包含原站素材、旧品牌、文章全文或源站脚本；不通过 iframe 加载原站整个检测页面。
- IP 卡片通过本项目 Canvas 数据排版生成，没有调用原 IP 卡片生成服务。资讯只展示公开 RSS 标题及来源链接；本地帮助为本项目撰写。

## 开源基础

项目初始构建框架来自 Product Design 的公开工作流模板，保留 Vite/React 启动入口、可选静态托管 worker、构建适配脚本与对应测试。不是从旧网络查询网站获取。

使用 React/ReactDOM、Vite、React 插件、Bootstrap Icons 和开发工具 Prettier。系统字体来自运行设备；不打包原站字体。锁文件固定依赖版本。许可副本位于 `licenses/`，清单位于 `THIRD_PARTY_NOTICES.md`。

## 实时数据与第三方服务

| 服务                                   | 用途                                                              | 限制 / 文档                                                                              |
| -------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| ipify                                  | 公网 IPv4/IPv6 回显                                               | [API 文档](https://www.ipify.org/)；仅代表请求该端点的出口                               |
| IP138                                  | 国内目标 IPv4 观测                                                | 当前年度公开回显页；版式或访问条件改变会导致无法读取                                     |
| Cloudflare / Claude / ChatGPT / OpenAI | 目标 Trace / HTTP 响应                                            | 不保证跨域可读，不等同账号可用                                                           |
| Net.Coffee                             | IP 情报、评分复查、ASN/BGP/网段/DNSBL/关联/端口信息、DNS 权威回查 | [服务站点](https://ip.net.coffee/)；公共接口非本项目资产，无可用性承诺，不内置数据库副本 |
| ipapi.is                               | 可选独立 IP 情报                                                  | [官方文档](https://ipapi.is/developers.html)；匿名响应受限，风险字段可能需要密钥         |
| RIPEstat                               | 路由交叉查询                                                      | [Network Info](https://stat.ripe.net/docs/data-api/api-endpoints/network-info.html)      |
| IANA / 各注册局                        | RDAP 引导、域名/IP/ASN 注册信息                                   | [IANA RDAP 服务表](https://www.iana.org/assignments/rdap-dns)                            |
| Cloudflare / Google DNS                | DoH 记录查询                                                      | 本机服务发起；不代表浏览器使用该 DNS                                                     |
| Google / Cloudflare STUN               | WebRTC ICE 候选                                                   | 无结果不能推断无泄露                                                                     |
| Globalping                             | 真正的全球探针                                                    | [官方 API](https://globalping.io/docs/api.globalping.io)；匿名额度及节点可用性限制       |
| Cloudflare Speed / Turnstile           | 采样测速 / 自有站点验证                                           | Turnstile 必须填写自己的配置；不复制原站站点标识                                         |
| 各服务官方状态源 / 官方 RSS            | 状态与资讯索引                                                    | 页面明确标注源、抓取时间与失败                                                           |

接口调用由本项目独立编写。独立源码不等于拥有上游数据，也不等于可以脱离网络运行实时检测。发布源代码与数据服务的使用条件是两个问题。

## 发布排除

白名单打包不包括旧镜像、个人系统/浏览器报告、QA 截图、缓存、密钥、`config.local.json`、`node_modules`、本机路径或聊天附件。本机交付目录可能包含完整出口截图及报告；它与公开源码包是两个范围，不应整体上传。公开代码包不自动上传。

## 1.1.0 适配更新

- 扩展目标与状态目录只记录公开服务名称/URL，适配、批量控制、显示与报告为本项目新写。
- Turnstile 服务端要求参见 https://developers.cloudflare.com/turnstile/get-started/server-side-validation/ 。
- reCAPTCHA v3 自有站点 action/服务端验证参见 https://developers.google.com/recaptcha/docs/v3 。
- Replicate 官方状态入口现重定向到 Cloudflare 的 Replicate 服务： https://status.replicate.com/ 。聚合只采用该组件，不冒用整个 Cloudflare 的状态。
- xAI 官方文档列出事件订阅 https://docs.x.ai/developers/debugging ；本项目读取 https://status.x.ai/feed.xml 的近期事件，不凭未授权 API 请求判定服务正常。
- 原创 IP 卡片的配色、几何排版、SVG 序列化与可选透明度动效独立实现；未复制旧站动画或贴纸素材。
