import { normalizeWebRTCObservation } from "./webrtc-comparison.mjs";
// Shared by the live UI and offline reports. Conclusions are derived, never trusted from a file.
export const INVESTIGATION_SCOPES = {
  network: "基础网络",
  claude: "Claude",
  gpt: "GPT / OpenAI",
  google: "Google / Gmail",
};
const definitions = {
  network: {
    exits: ["ipv4", "ipv6", "domestic", "cloudflare"],
    links: ["bytedance", "taobao", "wechat", "github", "cloudflare", "youtube"],
  },
  claude: { exits: ["claude"], links: ["claude", "anthropic"] },
  gpt: { exits: ["chatgpt", "openai"], links: ["chatgpt", "openai"] },
  google: { exits: [], links: ["google", "accounts", "gmail"] },
};
export function investigationPlan(scopes, includeSystem = false) {
  if (
    !Array.isArray(scopes) ||
    !scopes.length ||
    scopes.some((s) => !Object.hasOwn(definitions, s))
  )
    throw new Error("请选择有效的排查范围");
  const selected = Object.keys(definitions).filter((s) => scopes.includes(s));
  const exits = [
    ...new Set([
      "ipv4",
      "ipv6",
      "cloudflare",
      ...selected.flatMap((s) => definitions[s].exits),
    ]),
  ];
  const links = [...new Set(selected.flatMap((s) => definitions[s].links))];
  const regions = selected.filter((s) => ["claude", "gpt"].includes(s));
  return {
    selected,
    exits,
    links,
    regions,
    keys: [
      "environment",
      ...exits.map((s) => "egress:" + s),
      ...links.map((s) => "link:" + s),
      ...regions.map((s) => "region:" + s),
      "dns-leak",
      "webrtc",
      ...(includeSystem ? ["system:collection"] : []),
    ],
  };
}
export function validateInvestigation(value) {
  if (value == null) return;
  if (
    !value ||
    Array.isArray(value) ||
    value.version !== 1 ||
    !["running", "completed", "stopped", "interrupted"].includes(value.state) ||
    typeof value.includeSystem !== "boolean" ||
    !Number.isFinite(Date.parse(value.startedAt)) ||
    !(
      value.finishedAt === null || Number.isFinite(Date.parse(value.finishedAt))
    ) ||
    !Array.isArray(value.plannedKeys) ||
    value.plannedKeys.length > 300 ||
    value.plannedKeys.some(
      (k) =>
        typeof k !== "string" ||
        k.length > 200 ||
        ["__proto__", "constructor", "prototype"].includes(k),
    )
  )
    throw new Error("综合排查元数据格式无效");
  investigationPlan(value.scopes, value.includeSystem);
}
export function diagnosticObservations(record) {
  const items = Object.values(record.results || {});
  const groups = ["webrtc", "dns-leak"];
  const latest = new Map();
  for (const item of items) {
    const group = groups.find(
      (g) => item.key === g || item.key.startsWith(g + ":"),
    );
    if (!group) continue;
    const previous = latest.get(group);
    const time = Date.parse(item.observedAt),
      prevTime = Date.parse(previous?.observedAt);
    if (
      !previous ||
      time > prevTime ||
      (time === prevTime && item.key === group)
    )
      latest.set(group, item);
  }
  return items
    .filter((item) => {
      const group = groups.find(
        (g) => item.key === g || item.key.startsWith(g + ":"),
      );
      return !group || latest.get(group) === item;
    })
    .map(normalizeWebRTCObservation);
}
function observationScope(record) {
  const keys = Object.keys(record.results || {});
  const platforms = [
    ["claude", /^(region:claude|egress:claude|link:(claude|anthropic))$/],
    ["gpt", /^(region:gpt|egress:(chatgpt|openai)|link:(chatgpt|openai))$/],
    ["google", /^link:(google|accounts|gmail)$/],
  ]
    .filter(([, pattern]) => keys.some((k) => pattern.test(k)))
    .map(([p]) => INVESTIGATION_SCOPES[p]);
  return platforms.length > 1
    ? "累计观测（含 " + platforms.join("、") + "）"
    : record.title;
}
const routeFor = (key) =>
  key.startsWith("link:")
    ? "/link/"
    : key.startsWith("dns")
      ? "/dns/"
      : key.startsWith("webrtc")
        ? "/webrtc/"
        : key === "region:claude"
          ? "/claude/"
          : key === "region:gpt"
            ? "/gpt/"
            : key.startsWith("risk:")
              ? "/ip/"
              : "/reports/";
export function conclusionSummary(record) {
  const rows = diagnosticObservations(record);
  const findings = [];
  for (const r of rows) {
    if (r.status === "running") continue;
    let severity = "",
      reason = "",
      action = "";
    const code =
      r.data?.httpStatus ??
      Number(r.summary.match(/\bHTTP\s+([45]\d{2})\b/i)?.[1]);
    if (
      r.key.startsWith("region:") &&
      r.status === "unknown" &&
      r.data?.reference
    ) {
      severity = "unknown";
      reason = r.data.reference.expired
        ? "官方名单参考已过期"
        : "实时核验受限 · 有日期参考";
      action =
        r.data.action ||
        "查看参考日期并在官方页面核验；参考名单不代表本次实时通过。";
    } else if (
      r.key.startsWith("link:") &&
      r.status === "error" &&
      r.data?.attempts?.length > 1
    ) {
      severity = "error";
      reason =
        r.data.failureKind === "tls-timeout"
          ? "TLS 握手超时（复测仍失败）"
          : r.data.failureKind === "proxy-tunnel"
            ? "代理隧道被拒绝（已复测）"
            : /timeout/.test(r.data.failureKind)
              ? "连接超时（复测仍失败）"
              : "请求失败（已复测）";
      action =
        r.data.action || "查看逐次请求与失败阶段，再核对本应用请求路径。";
    } else if (
      r.key.startsWith("region:") &&
      Number.isFinite(code) &&
      code >= 400
    ) {
      severity = "error";
      reason = "官方名单读取失败（HTTP " + code + "）";
      action =
        "这是官方名单页面的读取失败，不是平台连通或账号状态结论。" +
        (r.data?.action || "可在外部浏览器人工核对官方名单；无需 API 密钥。");
    } else if (
      r.key.startsWith("region:") &&
      r.status === "unknown" &&
      r.data?.effectiveAt &&
      r.data?.applicable == null
    ) {
      severity = "unknown";
      reason = "名单适用日期需核对";
      action =
        r.data.action ||
        "页面标注的生效日期晚于本次采集时间，不能直接当作当时的支持结论。";
    } else if (
      r.key.startsWith("webrtc") &&
      r.data?.comparison === "family-mismatch"
    ) {
      severity = "unknown";
      reason = "IPv4 / IPv6 无法直接比较";
      action =
        "在 WebRTC 栏目选择“自动获取公网 IPv4 并对照”，或输入与 UDP 候选同协议的完整目标出口。不同目标的地址仍须分别核对。";
    } else if (Number.isFinite(code) && code >= 400) {
      severity = r.status === "error" ? "error" : "warning";
      reason = "目标返回 HTTP " + code;
      action =
        code === 403 || code === 401
          ? "目标拒绝或要求授权；在实际浏览器复核。该响应不代表账号被封。"
          : code === 429
            ? "目标限流，稍后降低频率重试。"
            : code >= 500
              ? "查看目标官方服务状态，稍后复测。"
              : "核对目标地址和返回内容，再复测。";
    } else if (r.status === "error") {
      severity = "error";
      reason = "检测请求失败";
      action = "核对请求路径和错误详情，再对该目标复测；不要据此判断账号状态。";
    } else if (r.status === "unknown") {
      severity = "unknown";
      reason = "证据不足";
      action = "查看来源和限制，补充缺少的观测后复测。";
    } else if (r.key.startsWith("region:") && r.data?.applicable === false) {
      severity = "warning";
      reason = "支持地区需核对";
      action = "按该平台本次出口地区核对官方支持范围；不要套用另一平台的出口。";
    } else if (r.key.startsWith("webrtc") && r.data?.state === "different") {
      severity = "warning";
      reason = "UDP 与参考出口不同";
      action = "结合网络分流策略核对完整地址；出口不同本身不能单独证明泄露。";
    } else if (
      r.key.startsWith("link:") &&
      r.data?.samples?.some((s) => s.recovered)
    ) {
      severity = "warning";
      reason = "首次失败，复测恢复";
      action =
        "最终请求取得响应，首次失败证据仍保留；可再次采样确认是否持续稳定。";
    } else if (
      r.key.startsWith("link:") &&
      r.data?.responseCount < r.data?.sampleCount
    ) {
      severity = "warning";
      reason = "部分采样未取得响应";
      action = "检查逐次采样明细，重复采样确认是否持续发生。";
    }
    if (
      severity &&
      /未配置|缺少.*(?:密钥|配置|key)|missing.*(?:key|config)/i.test(r.summary)
    ) {
      reason = "需要配置";
      action = "在工具设置中查看该服务所需配置；缺少配置不表示当前网络有故障。";
    }
    if (severity)
      findings.push({
        key: r.key,
        label: r.label,
        severity,
        reason,
        evidence: r.summary,
        action,
        route: routeFor(r.key),
        source: r.source,
        observedAt: r.observedAt,
      });
  }
  const planned = record.investigation?.plannedKeys || [];
  const missing = planned.filter((key) => !record.results[key]);
  const running = rows.filter((r) => r.status === "running").length;
  const active = record.investigation?.state === "running" || running > 0;
  const errors = findings.filter((r) => r.severity === "error").length;
  const warnings = findings.filter((r) => r.severity === "warning").length;
  const unknown = findings.filter((r) => r.severity === "unknown").length;
  const stopped = ["stopped", "interrupted"].includes(
    record.investigation?.state,
  );
  const headline = active
    ? "排查进行中，当前结论为阶段结果"
    : stopped || missing.length
      ? "排查未完整结束，已有结果可供复查"
      : !rows.length
        ? "尚无检测结果"
        : errors || warnings
          ? `发现 ${errors + warnings} 项需要复查的情况`
          : unknown
            ? "仍有项目无法确定，需要补充证据"
            : "本次已执行项目未发现明确请求异常";
  return {
    headline,
    errors,
    warnings,
    unknown,
    running,
    missing,
    active,
    total: rows.length,
    obtained: rows.filter((r) => r.status === "ok").length,
    findings,
    scope: record.investigation
      ? record.investigation.scopes
          .map((s) => INVESTIGATION_SCOPES[s])
          .join("、")
      : observationScope(record),
    limits:
      "结论仅针对本次观测。取得响应不等于账号可用、环境安全或能够免手机验证注册；Google 使用公网参考出口。WebRTC / DNS 摘要只计最新一轮；历史轮次原始证据仍保留在完整 JSON 中。",
  };
}
