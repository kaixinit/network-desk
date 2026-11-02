import {
  canonicalIP,
  parseTrace,
  sameIP,
  resolverAddresses,
} from "../shared/model.mjs";
import { desktop } from "./storage.mjs";
const pendingRequests = new Set();
let stopEpoch = 0;
window.addEventListener("network-desk:stop", () => {
  stopEpoch++;
  for (const controller of pendingRequests) controller.abort();
  pendingRequests.clear();
});
function assertActive(epoch) {
  if (epoch !== stopEpoch) throw new DOMException("已停止", "AbortError");
}
async function networkFetch(
  url,
  options = {},
  consume = (response) => response,
) {
  const controller = new AbortController();
  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;
  pendingRequests.add(controller);
  try {
    const response = await fetch(url, {
      ...options,
      signal,
    });
    const value = await consume(response);
    signal.throwIfAborted();
    return value;
  } finally {
    pendingRequests.delete(controller);
  }
}

export async function api(path, params = {}, options = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null),
  );
  return networkFetch(
    "/api/" + path + (query.size ? "?" + query : ""),
    {
      ...options,
      headers: {
        ...options.headers,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      signal:
        options.signal ||
        AbortSignal.timeout(path === "status" ? 120000 : 60000),
    },
    async (r) => {
      let data;
      try {
        data = await r.json();
      } catch (error) {
        if (["AbortError", "TimeoutError"].includes(error.name)) throw error;
        throw new Error("本地服务响应无效，请确认使用启动脚本运行");
      }
      if (!r.ok) throw new Error(data.error || "HTTP " + r.status);
      return data;
    },
  );
}
export async function egress(target, definition, proxy = { mode: "system" }) {
  const epoch = stopEpoch;
  const start = performance.now();
  let browserFailure = "";
  try {
    return await networkFetch(
      definition.url,
      {
        method: definition.kind === "ip-header" ? "HEAD" : "GET",
        cache: "no-store",
        credentials: "omit",
        signal: AbortSignal.timeout(7000),
      },
      async (r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        const raw =
          definition.kind === "trace"
            ? parseTrace(await r.text())
            : definition.kind === "ip-html"
              ? {
                  ip: (await r.text()).match(
                    /<title>[^<]*?((?:\d{1,3}\.){3}\d{1,3})/i,
                  )?.[1],
                }
              : definition.kind === "ip-text"
                ? {
                    ip: (await r.text()).match(
                      /\b(?:\d{1,3}\.){3}\d{1,3}\b/,
                    )?.[0],
                  }
                : definition.kind === "ip-header"
                  ? {
                      ip:
                        r.headers.get("cdn-user-ip") ||
                        r.headers.get("x-request-ip") ||
                        r.headers.get("x-response-cinfo") ||
                        r.headers.get("x-client-ip") ||
                        r.headers.get("x-real-ip") ||
                        r.headers.get("x-ip"),
                    }
                  : await r.json();
        const ip = canonicalIP(
          raw.ip || raw.data?.ip || raw.data?.ipAddress || "",
        );
        if (!ip) throw new Error("浏览器响应没有完整 IP");
        return {
          ip,
          trace: definition.kind === "trace" ? raw : null,
          source: definition.url,
          execution: "browser",
          elapsedMs: Math.round(performance.now() - start),
          httpStatus: r.status,
          checkedAt: new Date().toISOString(),
        };
      },
    );
  } catch (e) {
    if (e.name === "AbortError") throw e;
    browserFailure = e.name === "TimeoutError" ? "浏览器探测超时" : e.message;
  }
  assertActive(epoch);
  const fallback = await api("probe", { target, ...proxy });
  return {
    ...fallback,
    browserFailure,
    limitations: [
      "浏览器无法直接读取（跨域、代理、网络或超时）；此结果由本机服务发起，不能证明浏览器经过相同出口。",
    ],
  };
}
export async function browserEnvironment() {
  const ua = navigator.userAgent;
  let platform = navigator.userAgentData?.platform || navigator.platform;
  let platformVersion = null,
    architecture = null,
    fullVersions = [];
  try {
    const extra = await navigator.userAgentData?.getHighEntropyValues([
      "platformVersion",
      "architecture",
      "bitness",
      "fullVersionList",
    ]);
    platformVersion = extra?.platformVersion;
    fullVersions = extra?.fullVersionList || [];
    architecture = extra ? `${extra.architecture} ${extra.bitness}位` : null;
  } catch {}
  const os = /Windows/.test(ua)
    ? platformVersion
      ? Number(platformVersion.split(".")[0]) >= 13
        ? "Windows 11"
        : "Windows 10"
      : "Windows（具体版本不可读）"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad/.test(ua)
        ? "iOS"
        : /Mac/.test(ua)
          ? "macOS"
          : platform;
  const browserName = desktop
    ? "本软件内嵌 Chromium"
    : /Edg\//.test(ua)
      ? "Edge"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari/.test(ua)
            ? "Safari"
            : "未知";
  const version =
    ua
      .match(/(?:Edg|Firefox|Chrome|Version)\/([\d.]+)/g)
      ?.at(-1)
      ?.split("/")[1] || "";
  let gpu = null,
    renderer = null,
    canvasHash = null;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    if (ext) {
      gpu = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL);
      renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
    }
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {}
  try {
    const c = document.createElement("canvas");
    c.width = 240;
    c.height = 48;
    const g = c.getContext("2d");
    g.font = "16px sans-serif";
    g.fillText("Network Desk · 环境校验", 8, 28);
    const buffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(c.toDataURL()),
    );
    canvasHash = Array.from(new Uint8Array(buffer))
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
  } catch {}
  return {
    os,
    platform,
    architecture,
    browserName,
    browserVersion:
      fullVersions.find(
        (x) =>
          x.brand ===
          (browserName === "Edge"
            ? "Microsoft Edge"
            : browserName === "Chrome"
              ? "Google Chrome"
              : browserName),
      )?.version || version,
    language: navigator.language,
    languages: navigator.languages,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    utcOffsetMinutes: -new Date().getTimezoneOffset(),
    screen: `${screen.width} × ${screen.height}`,
    viewport: `${innerWidth} × ${innerHeight}`,
    pixelRatio: devicePixelRatio,
    gpu,
    renderer,
    canvasHash,
    cookies: navigator.cookieEnabled,
    doNotTrack: navigator.doNotTrack || "未提供",
    touch: navigator.maxTouchPoints,
    networkType: navigator.connection?.effectiveType || null,
    userAgent: ua,
  };
}
export async function webrtc(expectedIP) {
  if (!window.RTCPeerConnection)
    return { state: "unknown", reason: "浏览器不支持 WebRTC", candidates: [] };
  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.cloudflare.com:3478" },
      { urls: "stun:stun.l.google.com:19302" },
    ],
  });
  const candidates = [],
    errors = [];
  let complete = false;
  let cancel;
  try {
    await new Promise(async (resolve, reject) => {
      const timer = setTimeout(resolve, 8500);
      cancel = () => {
        clearTimeout(timer);
        reject(new DOMException("已停止", "AbortError"));
      };
      window.addEventListener("network-desk:stop", cancel, { once: true });
      pc.onicecandidate = (e) => {
        if (!e.candidate) {
          complete = true;
          clearTimeout(timer);
          resolve();
          return;
        }
        const c = e.candidate;
        const words = c.candidate.split(" ");
        const item = {
          address: c.address || words[4],
          port: c.port || Number(words[5]),
          type: c.type || words[words.indexOf("typ") + 1],
          protocol: c.protocol || words[2],
          raw: c.candidate,
        };
        if (!candidates.some((x) => x.raw === item.raw)) candidates.push(item);
      };
      pc.onicecandidateerror = (e) =>
        errors.push({ code: e.errorCode, text: e.errorText });
      try {
        pc.createDataChannel("network-desk");
        await pc.setLocalDescription(await pc.createOffer());
      } catch (e) {
        clearTimeout(timer);
        reject(e);
      }
    });
  } finally {
    window.removeEventListener("network-desk:stop", cancel);
    pc.close();
  }
  const publicCandidates = candidates.filter(
    (x) => x.type === "srflx" && canonicalIP(x.address),
  );
  const different =
    expectedIP && publicCandidates.some((c) => !sameIP(c.address, expectedIP));
  return {
    state:
      !publicCandidates.length || !expectedIP
        ? "unknown"
        : different
          ? "different"
          : "match",
    reason: !publicCandidates.length
      ? "未取得可比较的公网 ICE 地址，不能据此认定没有泄露"
      : !expectedIP
        ? "尚无目标出口可对照"
        : different
          ? "UDP 与所选出口不同；请结合分流规则核对"
          : "本次可见 UDP 地址与所选出口一致；不代表全部流量",
    candidates,
    errors,
    complete,
    expectedIP,
    source: "浏览器 ICE / Cloudflare 与 Google STUN",
  };
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function dnsLeakRound(epoch) {
  assertActive(epoch);
  const session = await api("dns-session");
  assertActive(epoch);
  await Promise.all(
    session.urls.map(
      (url) =>
        new Promise((resolve) => {
          const image = new Image();
          const timer = setTimeout(resolve, 3500);
          image.onload = image.onerror = () => {
            clearTimeout(timer);
            resolve();
          };
          image.src = url + "?t=" + Date.now();
        }),
    ),
  );
  let result;
  for (let i = 0; i < 3; i++) {
    if (i) await pause(1000);
    assertActive(epoch);
    result = await api("dns-result", { token: session.token });
    const items = resolverAddresses(result.data);
    if (items.length) return { ...result, resolvers: items };
  }
  return {
    ...result,
    resolvers: [],
    reason: "权威回查尚未返回解析器证据；可能受缓存、网络限制或服务可用性影响",
  };
}
export async function dnsLeak(mode = "quick") {
  const epoch = stopEpoch;
  const rounds = mode === "extended" ? 6 : 1;
  const observations = [];
  for (let i = 0; i < rounds; i++) {
    assertActive(epoch);
    try {
      observations.push(await dnsLeakRound(epoch));
    } catch (e) {
      if (e.name === "AbortError") throw e;
      observations.push({
        resolvers: [],
        error: e.message,
        checkedAt: new Date().toISOString(),
      });
    }
  }
  return {
    mode,
    rounds,
    queries: rounds * 6,
    completedRounds: observations.filter((x) => !x.error).length,
    resolvers: [...new Set(observations.flatMap((x) => x.resolvers))],
    observations,
    source: "Net.Coffee DNS 权威回查",
    reason:
      observations.find((x) => x.error)?.error ||
      "权威回查未返回可用解析器证据",
    checkedAt: new Date().toISOString(),
  };
}
export async function browserConnectivity(url) {
  const start = performance.now();
  const r = await networkFetch(url, {
    method: "HEAD",
    mode: "no-cors",
    credentials: "omit",
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  return {
    source: url,
    execution: "browser",
    httpStatus: r.status || null,
    transportCompleted: true,
    opaque: r.type === "opaque" || r.type === "opaqueredirect",
    elapsedMs: Math.round(performance.now() - start),
    checkedAt: new Date().toISOString(),
  };
}
export async function cloudflareSpeed(signal, progress) {
  const samples = [];
  for (const bytes of [100000, 1000000, 3000000]) {
    progress?.("下载样本 " + bytes / 1000000 + " MB");
    const start = performance.now();
    const r = await fetch(
      "https://speed.cloudflare.com/__down?bytes=" + bytes,
      { cache: "no-store", credentials: "omit", signal },
    );
    if (!r.ok) throw new Error("下载测速 HTTP " + r.status);
    const received = (await r.arrayBuffer()).byteLength;
    const ms = performance.now() - start;
    if (received !== bytes) throw new Error("测速返回字节数异常，不采用该结果");
    samples.push({
      direction: "download",
      bytes: received,
      elapsedMs: Math.round(ms),
      mbps: Math.round(((received * 8) / ms / 1000) * 100) / 100,
    });
  }
  progress?.("上传样本 1 MB");
  const sent = 1000000;
  const start = performance.now();
  const r = await fetch("https://speed.cloudflare.com/__up", {
    method: "POST",
    body: new Blob([new Uint8Array(sent)]),
    credentials: "omit",
    signal,
  });
  if (!r.ok) throw new Error("上传测速 HTTP " + r.status);
  await r.arrayBuffer();
  const ms = performance.now() - start;
  samples.push({
    direction: "upload",
    bytes: sent,
    elapsedMs: Math.round(ms),
    mbps: Math.round(((sent * 8) / ms / 1000) * 100) / 100,
  });
  return {
    samples,
    method: "浏览器 HTTP 单连接采样；包含请求及传输开销，不代表接入带宽上限",
    source: "https://speed.cloudflare.com/",
  };
}
export function download(name, contents, type = "application/json") {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
