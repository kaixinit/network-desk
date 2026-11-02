import { countryMembership } from "../shared/region-names.mjs";
import { request, validateProxy } from "./net.mjs";
import { REGION_SOURCES } from "../shared/diagnostic-guidance.mjs";
import { regionReference } from "../shared/region-reference.mjs";

function text(value) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function parseRegionPage(body) {
  // Ignore script payloads, navigation and footer lists/dates.
  const cleaned = body.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
  const candidates = [...cleaned.matchAll(/<ul\b[^>]*>([\s\S]*?)<\/ul>/gi)].map(
    (match) => ({
      index: match.index,
      items: [...match[1].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((m) =>
        text(m[1]),
      ),
    }),
  );
  const list = candidates.find(
    ({ items }) =>
      items.length >= 50 &&
      items.includes("Albania") &&
      items.includes("Japan"),
  );
  if (!list) throw new Error("官方名单结构改变，无法自动核验，请查看官方页面");
  const { items } = list;
  const header = cleaned.slice(0, list.index);
  const effective = header.match(
    /Effective[\s\S]{0,400}?<time\b[^>]*dateTime=["']([^"']+)["'][^>]*>([^<]+)<\/time>/i,
  );
  const fallback = header.match(
    /Effective[\s\S]{0,300}?([A-Z][a-z]{2,8} \d{1,2}, \d{4})/,
  );
  const effectiveDate = effective?.[2] || fallback?.[1] || null;
  return { items, effectiveDate, effectiveAt: effective?.[1] || effectiveDate };
}

export function createRegionLookup({
  transport = request,
  now = Date.now,
} = {}) {
  const cache = new Map();
  return async function supportRegions(platform, country, options = {}) {
    const source = REGION_SOURCES[platform];
    if (!source || !/^[A-Z]{2}$/.test(country || ""))
      throw new Error("平台或国家代码无效");
    const proxy = validateProxy(options);
    const unavailable = (failure) => {
      const reference = regionReference(platform, country, now());
      if (!reference) return failure;
      return {
        ...failure,
        status: "unknown",
        liveStatus: failure.status,
        liveReason: failure.reason,
        reference,
        reason:
          failure.reason +
          (reference.expired
            ? "；随附名单参考已过期，无法据此核对地区"
            : `；${reference.verifiedAt.slice(0, 10)} 的官方名单参考${reference.listed ? "列出" : "未列出"} ${country}，本次实时适用性仍未核实`),
        action:
          "可在浏览器打开官方页面人工核对，或重试实时核验；无需 API 密钥。随附参考不是实时通过结论。",
      };
    };
    const cacheKey = `${platform}:${proxy.mode}:${proxy.port}`;
    let entry = options.refresh ? null : cache.get(cacheKey);
    if (!entry || now() - entry.time > 1800000) {
      let reply;
      try {
        reply = await transport(source, {
          follow: true,
          timeout: 20000,
          proxy,
        });
        if (
          reply.status !== 200 ||
          /_cf_chl_opt|Enable JavaScript and cookies to continue/i.test(
            reply.body,
          )
        ) {
          const challenge =
            /_cf_chl_opt|challenge-platform|Enable JavaScript and cookies to continue/i.test(
              reply.body,
            );
          return unavailable({
            status: "error",
            country,
            listed: null,
            applicable: null,
            source: reply.url || source,
            checkedAt: reply.checkedAt,
            httpStatus: reply.status,
            challenge,
            sourceFailure: challenge ? "browser-challenge" : "http",
            transportDetails: reply.transportDetails || null,
            requestMode: proxy.mode,
            reason: `官方地区页面 HTTP ${reply.status}${challenge ? "：网站要求浏览器验证，本机请求未取得名单" : "：未取得有效名单"}`,
            action:
              "可重试或在外部浏览器打开官方页面人工核对；无需 API 密钥。此错误不代表目标地区不受支持。",
          });
        }
        entry = {
          ...parseRegionPage(reply.body),
          time: now(),
          checkedAt: reply.checkedAt,
          source: reply.url || source,
        };
        cache.set(cacheKey, entry);
      } catch (error) {
        return unavailable({
          status: "error",
          country,
          listed: null,
          applicable: null,
          source: reply?.url || source,
          checkedAt: reply?.checkedAt || new Date(now()).toISOString(),
          httpStatus: reply?.status || null,
          requestMode: proxy.mode,
          sourceFailure: reply ? "structure" : "transport",
          failureKind: error.failureKind || null,
          transportDetails:
            error.transportDetails || reply?.transportDetails || null,
          reason: error.message,
          action: "重试或在外部浏览器人工核对官方名单；无需 API 密钥。",
        });
      }
    }
    const { listed, restricted } = countryMembership(entry.items, country);
    const future = entry.effectiveAt && Date.parse(entry.effectiveAt) > now();
    return {
      status: future || restricted ? "unknown" : "ok",
      country,
      listed,
      applicable: future || restricted ? null : listed,
      restricted,
      effectiveDate: entry.effectiveDate,
      effectiveAt: entry.effectiveAt,
      source: entry.source,
      checkedAt: entry.checkedAt,
      requestMode: proxy.mode,
      httpStatus: 200,
      reason: restricted
        ? "官方名单列出该国家但注明部分地区例外，不能只凭国家代码判定适用"
        : future
          ? `已读取官方名单（${country}：${listed ? "列出" : "未列出"}），但页面标注 ${entry.effectiveDate} 生效；当前适用性仍需人工核对`
          : listed
            ? "官方页面名单列出此国家或地区；不代表账号状态"
            : "官方页面名单未列出此国家或地区",
      action: future
        ? "无需配置密钥；不能把尚未生效的政策直接视为当前支持结论。"
        : null,
    };
  };
}

export const supportRegions = createRegionLookup();
