import { EXTRA_TARGETS, EXTRA_STATUS, EDGE_TARGETS } from "./coverage.mjs";
export { EDGE_TARGETS };
export const TARGETS = {
  ...EXTRA_TARGETS,
  ipv4: {
    label: "公网 IPv4",
    url: "https://api4.ipify.org?format=json",
    kind: "ip",
  },
  ipv6: {
    label: "公网 IPv6",
    url: "https://api6.ipify.org?format=json",
    kind: "ip",
  },
  domestic: {
    label: "国内探测出口",
    url: "https://2026.ip138.com/",
    kind: "ip-html",
  },
  cloudflare: {
    label: "Cloudflare",
    url: "https://www.cloudflare.com/cdn-cgi/trace",
    kind: "trace",
  },
  claude: {
    label: "Claude",
    url: "https://claude.ai/cdn-cgi/trace",
    kind: "trace",
  },
  chatgpt: {
    label: "ChatGPT",
    url: "https://chatgpt.com/cdn-cgi/trace",
    kind: "trace",
  },
  openai: {
    label: "OpenAI API",
    url: "https://api.openai.com/cdn-cgi/trace",
    kind: "trace",
  },
  anthropic: {
    label: "Anthropic",
    url: "https://www.anthropic.com/",
    kind: "http",
  },
  google: {
    label: "Google",
    url: "https://www.google.com/generate_204",
    kind: "http",
  },
  accounts: {
    label: "Google 账户",
    url: "https://accounts.google.com/",
    kind: "http",
  },
  gmail: { label: "Gmail", url: "https://mail.google.com/", kind: "http" },
  github: { label: "GitHub", url: "https://github.com/", kind: "http" },
  youtube: { label: "YouTube", url: "https://www.youtube.com/", kind: "http" },
  microsoft: {
    label: "Microsoft",
    url: "https://www.microsoft.com/",
    kind: "http",
  },
  baidu: { label: "百度", url: "https://www.baidu.com/", kind: "http" },
  taobao: { label: "淘宝", url: "https://www.taobao.com/", kind: "http" },
  wechat: { label: "微信", url: "https://weixin.qq.com/", kind: "http" },
  bytedance: {
    label: "字节跳动",
    url: "https://www.bytedance.com/",
    kind: "http",
  },
};
export const STATUS_SOURCES = [
  ...EXTRA_STATUS,
  {
    id: "claude",
    name: "Claude / Anthropic",
    category: "AI",
    url: "https://status.claude.com/api/v2/summary.json",
    page: "https://status.claude.com/",
  },
  {
    id: "openai",
    name: "OpenAI",
    category: "AI",
    url: "https://status.openai.com/api/v2/summary.json",
    page: "https://status.openai.com/",
  },
  {
    id: "github",
    name: "GitHub",
    category: "开发",
    url: "https://www.githubstatus.com/api/v2/summary.json",
    page: "https://www.githubstatus.com/",
  },
  {
    id: "cloudflare",
    name: "Cloudflare",
    category: "网络",
    url: "https://www.cloudflarestatus.com/api/v2/summary.json",
    page: "https://www.cloudflarestatus.com/",
  },
  {
    id: "vercel",
    name: "Vercel",
    category: "开发",
    url: "https://www.vercel-status.com/api/v2/summary.json",
    page: "https://www.vercel-status.com/",
  },
  {
    id: "discord",
    name: "Discord",
    category: "协作",
    url: "https://discordstatus.com/api/v2/summary.json",
    page: "https://discordstatus.com/",
  },
];
export const FEEDS = [
  {
    id: "openai",
    name: "OpenAI 官方",
    url: "https://openai.com/news/rss.xml",
    page: "https://openai.com/news/",
  },
  {
    id: "google",
    name: "Google AI 官方",
    url: "https://blog.google/technology/ai/rss/",
    page: "https://blog.google/technology/ai/",
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    url: "https://huggingface.co/blog/feed.xml",
    page: "https://huggingface.co/blog",
  },
];
export const DETAIL_SECTIONS = {
  bgp: { label: "BGP 路由", route: "ipv2/bgp/" },
  heat: { label: "IPv4 /24 网段趋势", route: "ipv2/heat/", ipv4Only: true },
  dnsbl: { label: "DNSBL 黑名单", route: "ipv2/dnsbl/", ipv4Only: true },
  related: { label: "关联域名与 IP", route: "ip/related/" },
  ports: { label: "公开端口探测", route: "ip/portscan/" },
  ping: { label: "远端连通探测", route: "ip/pingcheck/" },
  asncos: { label: "ASN 企业关联", route: "ipv2/asncos/", asn: true },
  radar: { label: "ASN 网络画像", route: "ipv2/radar/", asn: true },
};
