import {
  api,
  egress,
  browserEnvironment,
  webrtc,
  dnsLeak,
  browserConnectivity,
} from "./checks.mjs";
import { canonicalIP } from "../shared/model.mjs";
import { REGION_SOURCES } from "../shared/diagnostic-guidance.mjs";
import { runInvestigation } from "./investigation-runner.mjs";
export function createChecks(d) {
  const environment = () =>
    d.task("environment", "浏览器与设备环境", async () => ({
      status: "ok",
      summary: "已取得浏览器可见信息",
      source: "浏览器标准 API",
      execution: "browser",
      data: await browserEnvironment(),
    }));
  async function risk(ip, provider = "coffee") {
    if (!canonicalIP(ip)) return null;
    return d.task(
      "risk:" + ip,
      "IP 信誉与属性 " + ip,
      async () => {
        const data = await api("intelligence", { ip, provider });
        return {
          status: data.match ? "ok" : "unknown",
          summary: data.reason,
          source: data.source,
          execution: "local-service",
          target: ip,
          data,
          limitations: [
            "第三方情报不代表 Claude、Google 或 OpenAI 的官方风控结论。",
          ],
        };
      },
      {
        source:
          provider === "ipapi" ? "ipapi.is" : "Net.Coffee 公共 IP 情报接口",
        execution: "local-service",
        target: ip,
      },
    );
  }
  async function exit(target) {
    if (!d.config?.targets[target]) return null;
    const result = await d.task(
      "egress:" + target,
      d.config.targets[target].label + "出口",
      async () => {
        const data = await egress(target, d.config.targets[target], d.proxy);
        return {
          status: data.ip ? "ok" : "unknown",
          summary: data.ip
            ? "已取得 " + data.ip
            : data.reason || "未取得完整 IP",
          source: data.source,
          execution: data.execution,
          target: d.config.targets[target].url,
          data,
          limitations: data.limitations || [],
        };
      },
      {
        source: d.config.targets[target].url,
        execution: "browser → local-service",
        target: d.config.targets[target].url,
      },
    );
    return result;
  }
  const connectivity = (target, options = {}) => {
    const recordId = d.generation.current;
    const definition = d.config?.targets[target];
    const count = [1, 3, 8].includes(options.samples) ? options.samples : 1;
    const execution =
      options.execution === "browser" ? "browser" : "local-service";
    const requestRoute = {
      route: execution === "browser" ? "browser" : d.proxy.mode,
      proxyEndpoint:
        execution !== "browser" && ["local", "socks5"].includes(d.proxy.mode)
          ? `${d.proxy.mode === "socks5" ? "socks5h" : "http"}://127.0.0.1:${d.proxy.port}`
          : null,
    };
    return d.task(
      "link:" + target,
      definition?.label || target,
      async () => {
        const samples = [];
        for (let i = 0; i < count; i++) {
          if (d.generation.current !== recordId)
            throw new DOMException("已停止", "AbortError");
          try {
            samples.push(
              execution === "browser"
                ? await browserConnectivity(definition.url)
                : await api("probe", {
                    target,
                    connectivity: true,
                    ...d.proxy,
                  }),
            );
          } catch (e) {
            samples.push({
              ...requestRoute,
              error: e.message,
              checkedAt: new Date().toISOString(),
            });
          }
        }
        const responses = samples.filter((s) => !s.error);
        const elapsed = responses.map((s) => s.elapsedMs);
        const latest = responses.at(-1) || samples.at(-1);
        return {
          status: !responses.length
            ? "error"
            : latest.opaque
              ? "unknown"
              : "ok",
          summary: !responses.length
            ? latest.error
            : `${responses.length}/${count} 次取得响应 · ${latest.opaque ? "浏览器跨域状态不可读" : "HTTP " + latest.httpStatus} · 平均 ${Math.round(elapsed.reduce((a, b) => a + b, 0) / elapsed.length)} ms${samples.some((s) => s.recovered) ? " · 首次请求失败后复测恢复，见逐次证据" : ""}`,
          source: definition.url,
          execution,
          target: definition.url,
          data: {
            ...requestRoute,
            ...latest,
            samples,
            sampleCount: count,
            responseCount: responses.length,
            minMs: elapsed.length ? Math.min(...elapsed) : null,
            maxMs: elapsed.length ? Math.max(...elapsed) : null,
          },
          limitations: [
            "HTTP/跨域探测耗时不是 ICMP Ping；连通不代表账号注册或登录可用。",
            ...(latest.action ? [latest.action] : []),
          ],
        };
      },
      {
        source: definition?.url || target,
        execution,
        target: definition?.url || target,
      },
    );
  };
  const rtc = async (ip) => {
    const expected = ip === undefined ? d.selected : ip;
    const recordId = d.generation.current;
    const item = await d.task(
      "webrtc:" + (expected || "collect"),
      "WebRTC / UDP 出口",
      async () => {
        const data = await webrtc(expected);
        return {
          status: data.state === "unknown" ? "unknown" : "ok",
          summary: data.reason,
          source: data.source || "浏览器 WebRTC",
          execution: "browser",
          target: expected,
          data,
        };
      },
      { source: "浏览器 ICE / STUN", execution: "browser", target: expected },
    );
    if (d.generation.current === recordId) {
      d.put({ ...item, key: "webrtc" });
      d.save();
    }
    return item;
  };
  const dns = async (mode = "quick") => {
    mode = mode === "extended" ? "extended" : "quick";
    const recordId = d.generation.current;
    const item = await d.task(
      "dns-leak:" + mode,
      mode === "extended" ? "DNS 深度权威回查" : "DNS 快速权威回查",
      async () => {
        const data = await dnsLeak(mode);
        return {
          status: data.resolvers.length ? "ok" : "unknown",
          summary: data.resolvers.length
            ? `取得 ${data.resolvers.length} 个解析器观测；需结合出口判断`
            : data.reason,
          source: data.source,
          execution: "browser",
          data,
          limitations: [
            "解析器地区或地址不同并不单独证明 DNS 泄露；需结合代理策略、DoH 和网络设计。",
          ],
        };
      },
      { source: "Net.Coffee DNS 权威回查", execution: "browser" },
    );
    if (d.generation.current === recordId) {
      d.put({ ...item, key: "dns-leak" });
      d.save();
    }
    return item;
  };
  async function region(platform, country, refresh = false) {
    return d.task(
      "region:" + platform,
      (platform === "gpt" ? "GPT" : "Claude") + " 官方支持地区核验",
      async () => {
        const data = await api("regions", {
          platform,
          country,
          ...d.proxy,
          refresh: refresh ? "1" : undefined,
        });
        return {
          status: data.status || (data.applicable === null ? "unknown" : "ok"),
          summary: data.reason,
          data,
          source: data.source,
          execution: "local-service",
          target: country,
          limitations: data.action ? [data.action] : [],
        };
      },
      {
        source: REGION_SOURCES[platform],
        execution: "local-service",
        target: country,
      },
    );
  }
  async function scan(platform = "home") {
    if (d.recordRef.current.investigation?.state === "running") {
      d.setNotice("综合排查正在运行，请等待完成或停止后再单独检测");
      return;
    }
    d.setImported(false);
    d.patchRecord({ assessmentSnapshot: null });
    const recordId = d.generation.current;
    const targets =
      platform === "home"
        ? [
            "ipv4",
            "ipv6",
            "domestic",
            "cloudflare",
            "claude",
            "chatgpt",
            "openai",
          ]
        : platform === "google"
          ? ["ipv4", "ipv6", "cloudflare"]
          : [
              "domestic",
              "cloudflare",
              platform === "gpt" ? "chatgpt" : "claude",
            ];
    if (!d.recordRef.current.investigation)
      d.patchRecord({
        scope: platform,
        title: {
          home: "IP 与网络环境",
          claude: "Claude 环境检测",
          gpt: "GPT / Codex 环境检测",
          google: "Google / Gmail 环境检测",
        }[platform],
      });
    environment();
    const results = await Promise.all(targets.map(exit));
    if (d.generation.current !== recordId) return;
    const preferred = ["home", "google"].includes(platform)
      ? results.find((r) => r?.key === "egress:ipv4")?.data?.ip
      : results.at(-1)?.data?.ip;
    if (preferred) d.setSelected(preferred);
    await Promise.all(
      [...new Set(results.map((r) => r?.data?.ip).filter(Boolean))].map((ip) =>
        risk(ip),
      ),
    );
    if (d.generation.current !== recordId) return;
    if (["claude", "gpt"].includes(platform)) {
      const country =
        d.recordRef.current.results["risk:" + preferred]?.data?.countryCode;
      if (country) await region(platform, country);
    }
    if (d.generation.current !== recordId) return;
    const links =
      platform === "google"
        ? ["google", "accounts", "gmail"]
        : platform === "gpt"
          ? ["chatgpt", "openai"]
          : platform === "claude"
            ? ["claude", "anthropic"]
            : [
                "bytedance",
                "taobao",
                "wechat",
                "github",
                "cloudflare",
                "youtube",
              ];
    await Promise.all([...links.map(connectivity), rtc(preferred), dns()]);
    if (d.generation.current === recordId) d.save();
  }
  const checks = {
    environment,
    risk,
    exit,
    connectivity,
    rtc,
    dns,
    region,
    scan,
  };
  return {
    ...checks,
    investigate: (scopes, options) =>
      runInvestigation(d, checks, scopes, options),
  };
}
