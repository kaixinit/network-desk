// Network Desk's portable result model. No provider-specific UI assumptions.
import { boundedJSON, validateObservationData } from "./report-validation.mjs";
import {
  validateInvestigation,
  conclusionSummary,
  diagnosticObservations,
} from "./investigation.mjs";
export const REPORT_SCHEMA = "network-desk/report-v1";
export const SYSTEM_SCHEMA = "network-desk/system-v1";
import { canonicalIP, sameIP } from "./ip-address.mjs";
export { canonicalIP, sameIP } from "./ip-address.mjs";
import { normalizeWebRTCObservation } from "./webrtc-comparison.mjs";
export function makeRecord(scope, title) {
  const now = new Date().toISOString();
  return {
    schema: REPORT_SCHEMA,
    id: globalThis.crypto.randomUUID(),
    scope,
    title,
    createdAt: now,
    updatedAt: now,
    results: {},
    system: null,
    reference: null,
  };
}
export function observation(key, label, patch = {}) {
  return {
    key,
    label,
    status: "unknown",
    summary: "尚未检测",
    source: "未提供",
    execution: "browser",
    observedAt: new Date().toISOString(),
    target: null,
    limitations: [],
    data: null,
    ...patch,
  };
}
export function normalizeIntelligence(requestedIp, raw, source) {
  const d = raw?.data && typeof raw.data === "object" ? raw.data : raw;
  const returnedIp = d?.ip || d?.query || null;
  const match = sameIP(requestedIp, returnedIp);
  const location = d?.location || {};
  const asn = typeof d?.asn === "object" ? d.asn.asn : d?.asn;
  const number = typeof d?.trust_score === "number" ? d.trust_score : null;
  const score =
    match && Number.isFinite(number) && number >= 0 && number <= 100
      ? number
      : null;
  const flag = (name) =>
    match && typeof d?.[name] === "boolean" ? d[name] : null;
  return {
    requestedIp,
    returnedIp,
    match,
    score,
    source,
    reason: !returnedIp
      ? "供应方未返回完整 IP，不能核验归属"
      : !match
        ? "供应方返回的完整 IP 与查询对象不同，评分和标签不采用"
        : score === null
          ? "完整 IP 已核验；供应方未提供有效评分"
          : "完整 IP 一致；评分来自第三方",
    country: match ? d?.country || location.country || null : null,
    countryCode: match
      ? (
          d?.countryCode ||
          d?.country_code ||
          location.country_code ||
          ""
        ).toUpperCase()
      : "",
    city: match ? d?.city || location.city || null : null,
    region: match ? d?.region || location.state || null : null,
    asn: match && asn ? String(asn).replace(/^AS/i, "") : null,
    organization: match
      ? d?.asOrganization ||
        d?.isp ||
        d?.company_name ||
        d?.asn?.org ||
        d?.company?.name ||
        null
      : null,
    hosting: flag("is_datacenter"),
    vpn: flag("is_vpn"),
    proxy: flag("is_proxy"),
    tor: flag("is_tor"),
    crawler: flag("is_crawler"),
    abuse: flag("is_abuser"),
    residential:
      match && typeof d?.isResidential === "boolean" ? d.isResidential : null,
    raw,
  };
}
export function parseTrace(text) {
  return Object.fromEntries(
    String(text)
      .split(/\r?\n/)
      .filter((x) => x.includes("="))
      .map((line) => {
        const at = line.indexOf("=");
        return [line.slice(0, at), line.slice(at + 1)];
      }),
  );
}
export function resolverAddresses(raw) {
  const list = Array.isArray(raw)
    ? raw
    : raw?.dns_servers ||
      raw?.resolvers ||
      raw?.results ||
      raw?.servers ||
      raw?.ips ||
      raw?.data;
  return Array.isArray(list)
    ? [
        ...new Set(
          list
            .map((x) =>
              canonicalIP(
                typeof x === "string" ? x : x?.ip || x?.address || "",
              ),
            )
            .filter(Boolean),
        ),
      ]
    : [];
}
export function validateSystem(value) {
  value = boundedJSON(value, 2_000_000);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("系统 JSON 必须是对象");
  if (![SYSTEM_SCHEMA, "google-environment-system/v1"].includes(value.schema))
    throw new Error(
      "不支持此系统报告版本，请使用本项目脚本或原 Google 系统脚本",
    );
  if (!Number.isFinite(Date.parse(value.collectedAt)))
    throw new Error("系统报告缺少有效采集时间");
  for (const k of ["os", "timezone", "region", "network"])
    if (!value[k] || typeof value[k] !== "object" || Array.isArray(value[k]))
      throw new Error(`系统报告缺少 ${k} 对象`);
  if (JSON.stringify(value).length > 2_000_000)
    throw new Error("系统报告超过 2 MB 限制");
  return JSON.parse(JSON.stringify(value));
}
export function validateRecord(value) {
  value = boundedJSON(value, 5_000_000);
  if (
    !value ||
    value.schema !== REPORT_SCHEMA ||
    typeof value.id !== "string" ||
    !value.results ||
    Array.isArray(value.results) ||
    typeof value.results !== "object"
  )
    throw new Error("不是 Network Desk v1 检测报告");
  if (
    Object.keys(value.results).length > 300 ||
    JSON.stringify(value).length > 5_000_000
  )
    throw new Error("报告过大");
  if (
    typeof value.title !== "string" ||
    typeof value.scope !== "string" ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    !Number.isFinite(Date.parse(value.updatedAt))
  )
    throw new Error("报告标题、类别或时间格式无效");
  if (
    (value.client != null && typeof value.client !== "string") ||
    (value.redacted != null && typeof value.redacted !== "boolean") ||
    (value.exportModules != null &&
      (!Array.isArray(value.exportModules) ||
        value.exportModules.some((x) => typeof x !== "string")))
  )
    throw new Error("报告元数据格式无效");
  for (const [key, r] of Object.entries(value.results)) {
    if (
      !r ||
      ["__proto__", "constructor", "prototype"].includes(key) ||
      !["ok", "unknown", "error", "running"].includes(r.status) ||
      typeof r.label !== "string" ||
      r.key !== key ||
      typeof r.summary !== "string" ||
      typeof r.source !== "string" ||
      (r.execution != null && typeof r.execution !== "string") ||
      (r.target != null && typeof r.target !== "string") ||
      !Number.isFinite(Date.parse(r.observedAt)) ||
      (r.limitations != null &&
        (!Array.isArray(r.limitations) ||
          r.limitations.some((x) => typeof x !== "string")))
    )
      throw new Error("报告检测项格式无效");
    validateObservationData(key, r.data);
    value.results[key] = normalizeWebRTCObservation(r);
  }
  if (value.system) validateSystem(value.system);
  validateInvestigation(value.investigation);
  if (value.diagnosticSummary != null)
    value.diagnosticSummary = conclusionSummary(value);
  if (
    value.reference &&
    (typeof value.reference !== "object" ||
      Array.isArray(value.reference) ||
      (value.reference.label != null &&
        typeof value.reference.label !== "string") ||
      (value.reference.ipv4Only != null &&
        typeof value.reference.ipv4Only !== "boolean") ||
      ["country", "timezone", "windowsZone", "language", "browser"].some(
        (k) => typeof value.reference[k] !== "string",
      ))
  )
    throw new Error("参考配置格式无效");
  const snapshot = value.assessmentSnapshot;
  if (
    snapshot != null &&
    (typeof snapshot !== "object" ||
      !Array.isArray(snapshot.rows) ||
      snapshot.rows.length > 50 ||
      snapshot.rows.some(
        (r) =>
          !r ||
          !["match", "different", "unknown"].includes(r.state) ||
          ["name", "actual", "expected"].some((k) => typeof r[k] !== "string"),
      ) ||
      !Number.isInteger(snapshot.known) ||
      !Number.isInteger(snapshot.total) ||
      snapshot.total !== snapshot.rows.length ||
      snapshot.known !==
        snapshot.rows.filter((r) => r.state !== "unknown").length ||
      !(
        snapshot.percent === null ||
        (Number.isFinite(snapshot.percent) &&
          snapshot.percent >= 0 &&
          snapshot.percent <= 100)
      ) ||
      typeof snapshot.conclusion !== "string" ||
      typeof snapshot.phoneVerification !== "string")
  )
    throw new Error("报告结论快照格式无效");
  if (snapshot) {
    if (!value.reference && snapshot.rows.length)
      throw new Error("未选择参考配置的报告不能包含配置对照快照");
    const derived = value.reference
      ? summarizeAssessment(snapshot.rows)
      : assessReference(value, null);
    if (snapshot.percent !== derived.percent)
      throw new Error("报告匹配率与分项证据不一致");
    // A file is not an authority for application conclusions or registration promises.
    value.assessmentSnapshot = derived;
  }
  return JSON.parse(JSON.stringify(value));
}
export const REFERENCE_PRESETS = {
  GB: {
    country: "GB",
    timezone: "Europe/London",
    windowsZone: "GMT Standard Time",
    language: "en-GB",
    browser: "Edge",
    ipv4Only: false,
    label: "英国参考配置",
  },
  JP: {
    country: "JP",
    timezone: "Asia/Tokyo",
    windowsZone: "Tokyo Standard Time",
    language: "ja-JP",
    browser: "Edge",
    ipv4Only: true,
    label: "日本参考配置",
  },
  US: {
    country: "US",
    timezone: "America/New_York",
    windowsZone: "Eastern Standard Time",
    language: "en-US",
    browser: "Edge",
    ipv4Only: false,
    label: "美国参考配置",
  },
  SG: {
    country: "SG",
    timezone: "Asia/Singapore",
    windowsZone: "Singapore Standard Time",
    language: "en-SG",
    browser: "Chrome",
    ipv4Only: false,
    label: "新加坡参考配置",
  },
};
export function assessReference(record, reference) {
  if (!reference)
    return {
      percent: null,
      known: 0,
      total: 0,
      rows: [],
      conclusion: "尚未选择参考配置",
      phoneVerification:
        "无法预测是否需要手机验证，以 Google 实际注册流程为准。",
    };
  const env = record.results.environment?.data || {};
  const system = record.system;
  const referenceIP = record.results["egress:ipv4"]?.data?.ip;
  const candidate = record.results["risk:" + referenceIP]?.data;
  const intel = candidate?.match ? candidate : null;
  const rows = [];
  const compare = (
    name,
    actual,
    expected,
    known = actual != null && actual !== "",
  ) =>
    rows.push({
      name,
      actual: known ? String(actual) : "无法检测",
      expected: String(expected),
      state: !known
        ? "unknown"
        : String(actual).toLowerCase() === String(expected).toLowerCase()
          ? "match"
          : "different",
    });
  compare("出口地区", intel?.countryCode, reference.country);
  compare("浏览器时区", env.timezone, reference.timezone);
  compare("浏览器语言", env.language, reference.language);
  if (reference.browser && reference.browser !== "any")
    compare("浏览器", env.browserName, reference.browser);
  if (reference.ipv4Only) {
    const egresses = ["ipv4", "ipv6", "cloudflare"]
      .map((k) => record.results["egress:" + k])
      .filter(Boolean);
    const v6 = egresses.some((x) => canonicalIP(x.data?.ip)?.includes(":"));
    const v6Probe = record.results["egress:ipv6"];
    compare(
      "公网 IPv6",
      v6 ? "可见" : v6Probe?.data?.disabled === true ? "未使用" : null,
      "未使用",
      v6 || v6Probe?.data?.disabled === true,
    );
  }
  compare("系统时区", system?.timezone?.id, reference.windowsZone);
  compare("区域格式", system?.region?.culture, reference.language);
  compare("系统界面语言", system?.region?.uiLanguage, reference.language);
  compare("系统区域", system?.region?.systemLocale, reference.language);
  const geos = { JP: 122, US: 244, SG: 215, GB: 242 };
  compare(
    "国家或地区 GeoID",
    system?.region?.geoId,
    geos[reference.country] ?? "自定义",
  );
  rows.push({
    name: "代理全局模式",
    actual: "无法可靠检测",
    expected: "用户核对代理软件",
    state: "unknown",
  });
  return summarizeAssessment(rows);
}
function summarizeAssessment(rows) {
  const known = rows.filter((x) => x.state !== "unknown").length;
  const matched = rows.filter((x) => x.state === "match").length;
  const different = rows.filter((x) => x.state === "different").length;
  return {
    percent: known ? Math.round((matched / known) * 100) : null,
    known,
    total: rows.length,
    rows,
    conclusion: different
      ? `发现 ${different} 项与参考配置不同，${rows.length - known} 项无法确定。`
      : known
        ? `已知项目与参考配置一致；仍有 ${rows.length - known} 项无法确定。`
        : "检测证据不足，无法形成配置结论。",
    phoneVerification: "无法预测是否需要手机验证，以 Google 实际注册流程为准。",
  };
}
export function summarize(record) {
  const values = diagnosticObservations(record);
  return {
    total: values.length,
    obtained: values.filter((r) => r.status === "ok").length,
    unknown: values.filter((r) => r.status === "unknown").length,
    errors: values.filter((r) => r.status === "error").length,
    running: values.filter((r) => r.status === "running").length,
  };
}
export const escapeHTML = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function maskIP(ip) {
  const c = canonicalIP(ip);
  if (!c) return ip;
  return c.includes(":")
    ? c.split(":").slice(0, 2).join(":") + ":••••"
    : c.split(".").slice(0, 2).join(".") + ".•••.•••";
}
export function redact(value) {
  if (typeof value === "string") {
    const maskCandidate = (s) => {
      if (canonicalIP(s)) return maskIP(s);
      // A result key or URL delimiter may be captured before the address.
      for (let i = 0; i < s.length; i++)
        if (s[i] === ":" && canonicalIP(s.slice(i + 1)))
          return s.slice(0, i + 1) + maskIP(s.slice(i + 1));
      return s;
    };
    return value
      .replace(/[0-9a-f]{0,4}(?:%3a[0-9a-f]{0,4}){2,}/gi, (s) => {
        const decoded = decodeURIComponent(s);
        const masked = maskCandidate(decoded);
        return masked !== decoded ? encodeURIComponent(masked) : s;
      })
      .replace(
        /(?:\d{1,3}\.){3}\d{1,3}|[0-9a-f]{0,4}(?::[0-9a-f]{0,4}){2,}(?:\.\d{1,3}){0,3}/gi,
        maskCandidate,
      );
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const used = new Set();
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => {
        const base = redact(k);
        let next = base,
          suffix = 1;
        while (used.has(next)) next = base + " #" + ++suffix;
        used.add(next);
        const redacted =
          /^(proxyServer|autoConfigURL|macAddress|computerName|username)$/i.test(
            k,
          )
            ? "[已隐藏]"
            : /^(browserVersion|version|schema)$/i.test(k)
              ? v
              : redact(v);
        if (redacted && typeof redacted === "object" && v.key === k)
          redacted.key = next;
        return [next, redacted];
      }),
    );
  }
  return value;
}
export function prepareExport(input, masked = false, modules = null) {
  const rawSource = modules?.length
    ? {
        ...input,
        results: Object.fromEntries(
          Object.entries(input.results).filter(([k]) =>
            modules.includes(resultModule(k)),
          ),
        ),
      }
    : input;
  const source = {
    ...rawSource,
    results: Object.fromEntries(
      Object.entries(rawSource.results).map(([k, r]) => [
        k,
        normalizeWebRTCObservation(r),
      ]),
    ),
  };
  const assessment =
    input.assessmentSnapshot || assessReference(input, input.reference);
  const output = {
    ...(masked ? redact(source) : structuredClone(source)),
    redacted: Boolean(masked || input.redacted),
    exportModules: modules || input.exportModules || null,
    assessmentSnapshot: masked ? redact(assessment) : assessment,
  };
  if (output.investigation) {
    const sourceKeys = Object.keys(source.results);
    const outputKeys = Object.keys(output.results);
    const renamed = new Map(
      sourceKeys.map((key, index) => [key, outputKeys[index]]),
    );
    output.investigation.plannedKeys = input.investigation.plannedKeys
      .filter((key) => !modules?.length || modules.includes(resultModule(key)))
      .map(
        (key, index) =>
          renamed.get(key) ||
          (masked ? redact(key) + " [未执行 " + index + "]" : key),
      );
  }
  output.diagnosticSummary = conclusionSummary(output);
  return output;
}
export function resultModule(key) {
  if (/^(risk|score-check|detail|ripe)/.test(key)) return "ip";
  if (key.startsWith("egress:")) return "egress";
  if (key.startsWith("link:")) return "connectivity";
  if (key.startsWith("dns")) return "dns";
  if (key.startsWith("webrtc")) return "webrtc";
  if (key.startsWith("cf-") || key.startsWith("captcha:")) return "cloudflare";
  return (
    {
      webrtc: "webrtc",
      environment: "environment",
      "global-ping": "ping",
      whois: "whois",
      status: "status",
    }[key] || (key.startsWith("news:") ? "news" : "other")
  );
}
export function riskResult(record, ip) {
  if (canonicalIP(ip)) return record.results["risk:" + ip];
  if (!record.redacted || !ip) return undefined;
  const matches = Object.values(record.results).filter(
    (r) => r.key.startsWith("risk:") && r.data?.requestedIp === ip,
  );
  return matches.length === 1 ? matches[0] : undefined;
}
export function reportHTML(input, masked = false) {
  const record = prepareExport(input, masked);
  const count = summarize(record);
  const assessment = record.assessmentSnapshot;
  const e = escapeHTML;
  const conclusion = conclusionSummary(record);
  const conclusionHTML = `<section><h2>结论摘要</h2><p><b>${e(conclusion.headline)}</b></p><p>范围：${e(conclusion.scope)}${record.exportModules?.length ? "（仅导出所选模块）" : ""} · ${conclusion.errors} 项失败 · ${conclusion.warnings} 项需复查 · ${conclusion.unknown} 项无法确定 · ${conclusion.missing.length} 项尚未执行</p>${conclusion.findings.map((f) => `<details><summary>${e(f.label)} · ${e(f.reason)}</summary><p>${e(f.evidence)}</p><p>建议：${e(f.action)}</p><p class="meta">${e(f.source)} · ${e(f.observedAt)}</p></details>`).join("")}<p class="meta">${e(conclusion.limits)}</p></section>`;
  const resultRows = diagnosticObservations(record)
    .map(
      (r) =>
        `<section><h2>${e(r.label)}</h2><p><b>${e({ ok: "已取得", unknown: "无法确定", error: "检测失败", running: "未完成" }[r.status])}</b> · ${e(r.summary)}</p><p class="meta">目标：${e(r.target || "当前环境")}<br>来源：${e(r.source)} · ${e(r.execution)} · ${e(r.observedAt)}</p>${r.limitations?.length ? `<p>${e(r.limitations.join("；"))}</p>` : ""}<details><summary>查看原始证据</summary><pre>${e(JSON.stringify(r.data, null, 2))}</pre></details></section>`,
    )
    .join("");
  const comparison = record.reference
    ? `<section><h2>参考配置与结论</h2><p>匹配率：${assessment.percent ?? "未知"}${assessment.percent === null ? "" : "%"}（覆盖 ${assessment.known}/${assessment.total} 项；不是 IP 纯净度或注册成功率）</p><p>${e(assessment.conclusion)}</p><p>${e(assessment.phoneVerification)}</p><table><tr><th>项目</th><th>实测</th><th>参考</th><th>结论</th></tr>${assessment.rows.map((r) => `<tr><td>${e(r.name)}</td><td>${e(r.actual)}</td><td>${e(r.expected)}</td><td>${e({ match: "一致", different: "不同", unknown: "无法确定" }[r.state])}</td></tr>`).join("")}</table></section>`
    : "";
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(record.title)} · 网络诊断台报告</title><style>body{font:15px/1.7 system-ui,sans-serif;max-width:960px;margin:32px auto;padding:0 20px;color:#1c2636}h1{font-size:27px}h2{font-size:17px}.meta{color:#667085;font-size:13px}section{border:1px solid #dfe4ec;border-radius:9px;padding:20px;margin:16px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f6f8fb;padding:14px}table{width:100%;border-collapse:collapse}td,th{padding:8px;border-bottom:1px solid #ddd;text-align:left}button{padding:8px 16px} @media print{button{display:none}details{display:block}section{break-inside:avoid}}</style><h1>${e(record.title)} · 检测报告</h1><p class="meta">Network Desk · ${e(record.id)}<br>采集环境：${e(record.client || "见各项检测来源")}<br>开始：${e(record.createdAt)} · 更新：${e(record.updatedAt)} · ${record.redacted ? "包含脱敏数据" : "包含完整 IP"}</p><p>取得 ${count.obtained} 项 · 无法确定 ${count.unknown} 项 · 失败 ${count.errors} 项 · 未完成 ${count.running} 项。取得数据不等于安全；第三方评分不代表任何平台的官方结论。</p>${conclusionHTML}${comparison}${resultRows}${record.system ? `<section><h2>合并的系统报告</h2><p>采集时间 ${e(record.system.collectedAt)} · 系统脚本观测，不覆盖浏览器结果</p><pre>${e(JSON.stringify(record.system, null, 2))}</pre></section>` : "<p>本报告尚未附加系统 JSON。</p>"}<details><summary>完整合并 JSON</summary><pre>${e(JSON.stringify(record, null, 2))}</pre></details><p class="meta">本文件可离线打开，不加载外部脚本、字体或图片。</p></html>`;
}
