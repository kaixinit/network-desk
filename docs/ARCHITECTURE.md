# 实现与维护

前端采用 React 与普通 CSS，静态构建产物由仅监听 loopback 的 Node 服务提供。服务运行不需要 npm 依赖，所有供应方请求使用系统 curl；前端不保管 API 密钥。

## 记录模型

`network-desk/report-v1` 包含记录 ID、采集/更新时间、栏目、`results`、可选 `system` 与 `reference`。每个结果都带独立 key、target、source、execution、observedAt、status、summary、data、limitations。

`execution` 分开标记 browser、local-service、remote-probe、system-script。取得数据与安全评价是两回事。IP 情报保存 requestedIp、returnedIp、match；仅完整 canonical IP 一致时采用分数和标签。上游原始响应仍保留作证据。

检测任务按 key 去重，已有结果可重测。新建或导入记录会使旧任务返回失效。浏览器历史最多 20 份，系统 JSON 保留自己的采集时间；HTML 与 JSON 使用相同记录生成。

## 本地服务边界

仅接受本机 Host 和同源请求；拒绝跨站调用。接口逐项列举，无任意 URL 代理。公网探针目标验证禁止回环、私网、链路本地与含路径/凭据的输入。配置中的密钥不会出现在前端配置接口或错误信息中。请求有队列并发、大小与超时限制。

HTML 导出转义所有内容，不加载任何外部脚本。JSON 导入验证 schema、必要对象与大小。报告脱敏递归处理地址和代理配置；用户仍应检查公开分享文件是否包含自行附加的信息。

## 供应方适配

目标清单在 `server/catalog.mjs`；公共情报适配器在 `server/providers.mjs`；传输与输入验证在 `server/net.mjs`。替换服务时，保留完整 IP 核验、真实路径、时间及失败语义，不能把空字段默认为安全。

静态托管 worker 仅用于前端预览，不提供本地 API；完整公开部署需要另行设计服务器访问控制、额度与密钥管理，本版本不直接暴露到公网。
