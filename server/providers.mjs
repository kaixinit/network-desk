import { isIP } from "node:net";
import { randomBytes } from "node:crypto";
import {
  canonicalIP,
  normalizeIntelligence,
  parseTrace,
} from "../shared/model.mjs";
import {
  request,
  jsonRequest,
  validateTarget,
  publicIP,
  validateProxy,
} from "./net.mjs";
import { TARGETS, STATUS_SOURCES, FEEDS, DETAIL_SECTIONS } from "./catalog.mjs";
import { lookupEvidence } from "./probe-evidence.mjs";

const coffee = "https://ip.net.coffee";
const safe = async (fn) => {
  try {
    return { ok: true, ...(await fn()) };
  } catch (e) {
    return { ok: false, error: e.message, checkedAt: new Date().toISOString() };
  }
};
export async function probe(
  params,
  transport = request,
  resolveEvidence = lookupEvidence,
) {
  const target = TARGETS[params.target];
  if (!target) throw new Error("未知探测目标");
  const proxy = validateProxy(params);
  // Echo/trace endpoints may reject HEAD even when GET is healthy.
  let method = ["http", "ip-header"].includes(target.kind) ? "HEAD" : "GET";
  const options = {
    proxy,
    signal: params.signal,
    family: ["4", "6"].includes(params.family) ? params.family : undefined,
    method,
  };
  let r, firstError;
  const attempt = (verb, reply) => ({
    method: verb,
    httpStatus: reply.status,
    elapsedMs: reply.elapsedMs,
    checkedAt: reply.checkedAt,
    transportDetails: reply.transportDetails,
  });
  const failure = (verb, error) => ({
    method: verb,
    error: error.message,
    failureKind: error.failureKind || "transport",
    transportDetails: error.transportDetails || null,
    checkedAt: new Date().toISOString(),
  });
  const attempts = [];
  options.signal?.throwIfAborted();
  try {
    r = await transport(target.url, options);
    attempts.push(attempt(method, r));
  } catch (e) {
    if (target.kind !== "http" || e.name === "AbortError") throw e;
    firstError = e;
    attempts.push(failure(method, e));
  }
  // Some sites reject or misroute HEAD. Keep both observations in reports.
  if (
    target.kind === "http" &&
    (!r || [403, 404, 405, 501].includes(r.status))
  ) {
    options.signal?.throwIfAborted();
    try {
      const next = await transport(target.url, { ...options, method: "GET" });
      attempts.push(attempt("GET", next));
      r = next;
      method = "GET";
    } catch (e) {
      if (e.name === "AbortError") throw e;
      attempts.push(failure("GET", e));
    }
  }
  if (!r) {
    options.signal?.throwIfAborted();
    const last = attempts.at(-1);
    const dnsEvidence = await resolveEvidence(target.url);
    const reason = `HEAD 与 GET 两次请求均未取得响应：${last.error}`;
    return {
      target: params.target,
      label: target.label,
      source: target.url,
      execution: "local-service",
      route: proxy.mode,
      proxyEndpoint: ["local", "socks5"].includes(proxy.mode)
        ? `${proxy.mode === "socks5" ? "socks5h" : "http"}://127.0.0.1:${proxy.port}`
        : null,
      method: "GET",
      attempts,
      httpStatus: null,
      ip: null,
      elapsedMs: null,
      error: reason,
      reason,
      failureKind: last.failureKind,
      dnsEvidence,
      checkedAt: last.checkedAt,
      action: ["tls-timeout", "tls"].includes(last.failureKind)
        ? "核对当前代理节点到目标站点的连接及 TLS 握手；隧道建立不等于目标 HTTPS 已可用。请先对照直连与当前节点的结果，再决定是否调整分流；不要关闭证书校验。软件未改变代理设置。"
        : last.failureKind === "proxy-tunnel"
          ? "检查所选本机代理端口及认证要求；代理拒绝 CONNECT 不代表目标网站故障。"
          : dnsEvidence.syntheticProxyAddress
            ? "本机解析结果包含代理映射地址；结合失败阶段核对代理是否接管该域名及其分流规则。映射地址本身不代表故障，本软件未改变代理设置。"
            : "同一路径复测仍未取得响应；核对网络、域名解析和本应用请求方式后重试。",
    };
  }
  let data = {};
  if (target.kind === "trace") data = parseTrace(r.body);
  if (target.kind === "ip") {
    try {
      data = JSON.parse(r.body);
    } catch {
      data = {};
    }
  }
  if (target.kind === "ip-html")
    data = { ip: r.body.match(/<title>[^<]*?((?:\d{1,3}\.){3}\d{1,3})/i)?.[1] };
  if (target.kind === "ip-text")
    data = { ip: r.body.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/)?.[0] };
  if (target.kind === "ip-header")
    data = {
      ip: r.body
        .match(
          /^(?:cdn-user-ip|x-request-ip|x-response-cinfo|x-client-ip|x-real-ip|x-ip)\s*:\s*([^\r\n]+)/im,
        )?.[1]
        ?.trim(),
    };
  const ip = canonicalIP(
    data.ip || data.data?.ip || data.data?.ipAddress || data.IP || "",
  );
  return {
    target: params.target,
    label: target.label,
    source: target.url,
    execution: "local-service",
    route: proxy.mode,
    method,
    attempts,
    recovered: Boolean(firstError),
    proxyEndpoint: ["local", "socks5"].includes(proxy.mode)
      ? `${proxy.mode === "socks5" ? "socks5h" : "http"}://127.0.0.1:${proxy.port}`
      : null,
    ip,
    trace: target.kind === "trace" ? data : null,
    httpStatus: r.status,
    elapsedMs: r.elapsedMs,
    checkedAt: r.checkedAt,
    reason:
      !ip && target.kind !== "http" ? "响应未提供可核验的完整出口 IP" : null,
  };
}
export async function intelligence(ip, provider, config) {
  if (!isIP(ip)) throw new Error("请输入完整 IPv4 或 IPv6 地址");
  let source, url;
  if (provider === "ipapi") {
    source = "ipapi.is";
    url =
      "https://api.ipapi.is/?q=" +
      encodeURIComponent(ip) +
      (config.ipapiKey ? "&key=" + encodeURIComponent(config.ipapiKey) : "");
  } else {
    source = "Net.Coffee 公共 IP 情报接口";
    url = coffee + "/api/ip/lookup/" + encodeURIComponent(ip);
  }
  const reply = await jsonRequest(url);
  return {
    ...normalizeIntelligence(ip, reply.data, source),
    checkedAt: reply.checkedAt,
    elapsedMs: reply.elapsedMs,
  };
}
export async function scoreCheck(ip) {
  if (!isIP(ip)) throw new Error("IP 无效");
  const r = await jsonRequest(coffee + "/api/iprisk/" + encodeURIComponent(ip));
  return {
    ...normalizeIntelligence(ip, r.data, "Net.Coffee 评分复查接口"),
    checkedAt: r.checkedAt,
  };
}
export async function detail(ip, section, asn) {
  const def = DETAIL_SECTIONS[section];
  if (!def) throw new Error("未知查询栏目");
  if (!isIP(ip)) throw new Error("IP 无效");
  if (def.ipv4Only && isIP(ip) !== 4)
    return {
      available: false,
      reason: "此数据源仅支持 IPv4，不能对 IPv6 给出结论",
      source: "Net.Coffee",
      data: null,
    };
  let key = ip;
  if (def.asn) {
    key = String(asn || "").replace(/^AS/i, "");
    if (!/^\d{1,10}$/.test(key)) throw new Error("请先取得 ASN");
  }
  const r = await jsonRequest(
    coffee + "/api/" + def.route + encodeURIComponent(key),
    { timeout: 25000 },
  );
  const available =
    r.data?.ok !== false &&
    r.data?.supported !== false &&
    !r.data?.stale &&
    !r.data?.error;
  return {
    available,
    reason: available
      ? null
      : r.data?.error ||
        (r.data?.stale
          ? "供应方仅返回过期缓存，当前情况无法确定"
          : "供应方未提供有效的当前结果"),
    source: "Net.Coffee · " + def.label,
    requestedIp: ip,
    checkedAt: r.checkedAt,
    data: r.data,
  };
}
export async function ripe(ip, endpoint = "network-info") {
  if (!isIP(ip)) throw new Error("IP 无效");
  if (
    ![
      "network-info",
      "prefix-overview",
      "geoloc",
      "reverse-dns-ip",
      "routing-history",
      "abuse-contact-finder",
    ].includes(endpoint)
  )
    throw new Error("查询类型无效");
  const r = await jsonRequest(
    "https://stat.ripe.net/data/" +
      endpoint +
      "/data.json?resource=" +
      encodeURIComponent(ip),
  );
  return { source: "RIPEstat", checkedAt: r.checkedAt, data: r.data };
}
export async function dnsQuery(name, type = "A", resolver = "cloudflare") {
  const query = validateTarget(name);
  if (
    !["A", "AAAA", "MX", "TXT", "NS", "CNAME", "SOA", "PTR", "CAA"].includes(
      type,
    )
  )
    throw new Error("不支持的 DNS 记录类型");
  const base =
    resolver === "google"
      ? "https://dns.google/resolve"
      : "https://cloudflare-dns.com/dns-query";
  const r = await jsonRequest(
    `${base}?name=${encodeURIComponent(query)}&type=${type}`,
    { headers: { Accept: "application/dns-json" } },
  );
  return {
    source: base,
    query,
    type,
    execution: "local-service",
    checkedAt: r.checkedAt,
    elapsedMs: r.elapsedMs,
    data: r.data,
  };
}
const dnsSessions = new Map();
export function newDNSSession() {
  for (const [k, v] of dnsSessions)
    if (Date.now() - v > 120000) dnsSessions.delete(k);
  const token = randomBytes(12).toString("hex");
  dnsSessions.set(token, Date.now());
  return {
    token,
    source: "Net.Coffee DNS 权威回查服务",
    urls: Array.from(
      { length: 6 },
      (_, i) => `https://${token}-${i}.d.ip.net.coffee/pixel.gif`,
    ),
  };
}
export async function dnsResult(token) {
  if (!dnsSessions.has(token) || Date.now() - dnsSessions.get(token) > 120000)
    throw new Error("DNS 检测会话过期，请重新开始");
  const r = await jsonRequest(coffee + "/api/dns/result/" + token);
  return {
    source: "Net.Coffee DNS 权威回查服务",
    checkedAt: r.checkedAt,
    data: r.data,
  };
}
const pingJobs = new Map();
export async function startGlobalPing(body, config) {
  const target = validateTarget(body.target);
  const regions = Array.isArray(body.regions)
    ? body.regions.slice(0, 5)
    : ["Japan", "United States", "Germany"];
  const allowed = new Set([
    "Japan",
    "United States",
    "Germany",
    "Singapore",
    "United Kingdom",
    "Australia",
    "Hong Kong",
    "World",
  ]);
  if (!regions.length || regions.some((r) => !allowed.has(r)))
    throw new Error("请选择支持的探针地区");
  const headers = { "Content-Type": "application/json" };
  if (config.globalpingToken)
    headers.Authorization = "Bearer " + config.globalpingToken;
  const r = await jsonRequest("https://api.globalping.io/v1/measurements", {
    method: "POST",
    headers,
    body: {
      type: "ping",
      target,
      limit: regions.length,
      locations: regions.map((magic) => ({ magic })),
      measurementOptions: { packets: 3 },
    },
  });
  const id = r.data.id;
  if (!id || !/^[a-zA-Z0-9_-]{1,100}$/.test(id))
    throw new Error("远端未返回测量编号");
  for (const [k, v] of pingJobs)
    if (Date.now() - v > 3600000) pingJobs.delete(k);
  pingJobs.set(id, Date.now());
  return { id, target, source: "Globalping", checkedAt: r.checkedAt };
}
export async function globalPingResult(id) {
  if (!pingJobs.has(id)) throw new Error("未知测量编号，请先创建测量");
  const r = await jsonRequest(
    "https://api.globalping.io/v1/measurements/" + id,
  );
  return { source: "Globalping", checkedAt: r.checkedAt, data: r.data };
}
let bootstrap = null,
  bootstrapTime = 0;
let bootstrapPending = null;
async function loadBootstrap() {
  if (bootstrap && Date.now() - bootstrapTime < 86400000) return bootstrap;
  if (bootstrapPending) return bootstrapPending;
  bootstrapPending = (async () => {
    const names = ["dns", "ipv4", "ipv6", "asn"];
    const replies = await Promise.all(
      names.map((n) => jsonRequest(`https://data.iana.org/rdap/${n}.json`)),
    );
    bootstrap = Object.fromEntries(names.map((n, i) => [n, replies[i].data]));
    bootstrapTime = Date.now();
    return bootstrap;
  })();
  try {
    return await bootstrapPending;
  } finally {
    bootstrapPending = null;
  }
}
function ipNumber(ip) {
  if (isIP(ip) === 4)
    return ip.split(".").reduce((n, x) => (n << 8n) + BigInt(x), 0n);
  let text = canonicalIP(ip);
  if (text.includes(".")) return null;
  let [left, right] = text.split("::");
  const a = left ? left.split(":") : [],
    b = right ? right.split(":") : [];
  const parts = text.includes("::")
    ? [...a, ...Array(8 - a.length - b.length).fill("0"), ...b]
    : a;
  return parts.reduce((n, x) => (n << 16n) + BigInt("0x" + (x || "0")), 0n);
}
function inCIDR(ip, net) {
  const [address, prefixText] = net.split("/");
  if (isIP(address) !== isIP(ip)) return false;
  const bits = isIP(ip) === 4 ? 32 : 128;
  const shift = BigInt(bits - Number(prefixText));
  const a = ipNumber(ip),
    b = ipNumber(address);
  return a !== null && b !== null && a >> shift === b >> shift;
}
export async function whois(input) {
  const q = validateTarget(input, { asn: true });
  const lists = await loadBootstrap();
  let kind, group;
  if (/^AS\d+$/.test(q)) {
    kind = "autnum";
    group = lists.asn.services.find(([keys]) =>
      keys.some((k) => {
        const [a, b] = k.split("-").map(Number);
        return +q.slice(2) >= a && +q.slice(2) <= b;
      }),
    );
  } else if (isIP(q)) {
    kind = "ip";
    group = lists[isIP(q) === 4 ? "ipv4" : "ipv6"].services.find(([keys]) =>
      keys.some((k) => inCIDR(q, k)),
    );
  } else {
    kind = "domain";
    const suffix = q.split(".").pop();
    group = lists.dns.services.find(([keys]) => keys.includes(suffix));
  }
  if (!group)
    throw new Error("IANA 未提供此查询对象的 RDAP 服务；请检查后缀或地址");
  const base = group[1].find((x) => x.startsWith("https://"));
  if (!base) throw new Error("注册局未提供 HTTPS RDAP 服务");
  const r = await jsonRequest(
    base.replace(/\/?$/, "/") +
      kind +
      "/" +
      encodeURIComponent(kind === "autnum" ? q.slice(2) : q),
    { follow: true, timeout: 22000 },
  );
  return { query: q, source: base, checkedAt: r.checkedAt, data: r.data };
}
export async function tlds() {
  const b = await loadBootstrap();
  return b.dns.services.flatMap(([keys]) => keys).sort();
}
export async function statusAll() {
  return Promise.all(
    STATUS_SOURCES.map(async (s) => ({
      ...s,
      ...(await safe(async () => {
        if (s.kind === "rss") {
          const r = await request(s.url, { follow: true, timeout: 12000 });
          if (r.status !== 200)
            throw new Error("官方事件订阅 HTTP " + r.status);
          const blocks = r.body.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi) || [];
          if (!r.body.includes("<rss")) throw new Error("官方事件订阅结构变化");
          const incidents = blocks.slice(0, 12).map((b, i) => ({
            id: String(i),
            name: decodeXML(b.match(/<title>([\s\S]*?)<\/title>/i)?.[1]),
            updated_at: decodeXML(
              b.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1],
            ),
            status: "官方事件记录（非整体状态）",
          }));
          return {
            ok: false,
            checkedAt: r.checkedAt,
            error:
              "已取得官方近期事件；订阅不提供可核验的实时整体状态，请查看官方页面",
            data: { incidents },
          };
        }
        if (!s.url)
          throw new Error(
            "官方状态页未提供已核验的公开状态接口，请打开官方页面查看；不以 API 认证失败推断故障",
          );
        const r = await jsonRequest(s.url, { timeout: 12000, follow: true });
        if (s.component) {
          const components = (r.data.components || []).filter(
            (c) => c.name === s.component,
          );
          if (!components.length) throw new Error("官方状态源未列出该服务组件");
          const ids = new Set(components.map((c) => c.id));
          const incidents = (r.data.incidents || []).filter((i) =>
            i.components?.some((c) => ids.has(c.id)),
          );
          r.data = {
            ...r.data,
            components,
            incidents,
            scheduled_maintenances: (
              r.data.scheduled_maintenances || []
            ).filter((i) => i.components?.some((c) => ids.has(c.id))),
            status: {
              indicator: components.every((c) => c.status === "operational")
                ? "none"
                : "minor",
              description: components
                .map((c) => c.name + ": " + c.status)
                .join("；"),
            },
          };
        }
        if (!r.data?.status || typeof r.data.status.indicator !== "string")
          throw new Error("官方响应结构改变，无法自动判断当前状态");
        return { checkedAt: r.checkedAt, data: r.data };
      })),
    })),
  );
}
function decodeXML(s = "") {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}
export async function newsFeed(id) {
  const feed = FEEDS.find((x) => x.id === id);
  if (!feed) throw new Error("未知资讯源");
  const r = await request(feed.url, { follow: true, limit: 2_000_000 });
  if (r.status !== 200) throw new Error("资讯源返回 HTTP " + r.status);
  const blocks = r.body.match(/<(item|entry)\b[^>]*>[\s\S]*?<\/\1>/g) || [];
  const entries = blocks
    .slice(0, 30)
    .map((block) => {
      const get = (tag) =>
        decodeXML(
          block.match(
            new RegExp(
              "<" + tag + "(?:\\s[^>]*)?>([\\s\\S]*?)<\\/" + tag + ">",
              "i",
            ),
          )?.[1] || "",
        );
      const url =
        get("link") || block.match(/<link[^>]+href=["']([^"']+)/)?.[1] || "";
      return {
        title: get("title"),
        url,
        date: get("pubDate") || get("updated") || get("published"),
        summary: get("description").slice(0, 150),
      };
    })
    .filter((x) => x.title && /^https:\/\//.test(x.url));
  if (!entries.length) throw new Error("资讯源没有可解析条目");
  return { source: feed.name, checkedAt: r.checkedAt, entries };
}
export { supportRegions } from "./regions.mjs";
