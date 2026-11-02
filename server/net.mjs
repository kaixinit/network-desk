import { spawn } from "node:child_process";
import { isIP } from "node:net";
import { domainToASCII } from "node:url";
import { canonicalIP } from "../shared/model.mjs";
import { VERSION } from "../shared/version.mjs";
import { transportError, createTransportTrace } from "./transport-error.mjs";

export function publicIP(value) {
  const ip = canonicalIP(value);
  if (!ip) return false;
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  return !(
    /^(::|::1|fc|fd|fe[89ab]|ff|2001:db8)/i.test(ip) || ip.startsWith("::ffff:")
  );
}
export function validateTarget(value, { asn = false } = {}) {
  const text = String(value || "").trim();
  if (asn && /^AS\d{1,10}$/i.test(text) && +text.slice(2) <= 4294967295)
    return text.toUpperCase();
  if (isIP(text)) {
    if (!publicIP(text))
      throw new Error("请输入公网 IP；不接受本机、内网或链路本地目标");
    return canonicalIP(text);
  }
  if (/[\s\\/:@?#%]/.test(text))
    throw new Error("目标不能包含协议、端口、路径或特殊字符");
  const host = domainToASCII(text.toLowerCase().replace(/\.$/, ""));
  if (isIP(host)) {
    if (!publicIP(host)) throw new Error("目标解析为保留地址");
    return canonicalIP(host);
  }
  if (
    host.length > 253 ||
    !host.includes(".") ||
    !host
      .split(".")
      .every((p) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(p)) ||
    /\.(localhost|local|internal|home|lan|test|invalid)$/.test(host)
  )
    throw new Error("请输入有效的公网域名或 IP，不要带协议、端口或路径");
  return host;
}
let active = 0;
const queue = [];
const children = new Set();
let closing = false;
export function stopRequests() {
  closing = true;
  for (const child of children) child.kill();
  while (queue.length) queue.shift()();
}
async function slot() {
  if (closing) throw new Error("检测服务正在退出");
  if (queue.length > 60) throw new Error("检测队列已满，请稍后重试");
  if (active >= 6) await new Promise((resolve) => queue.push(resolve));
  if (closing) throw new Error("检测服务正在退出");
  active++;
}
function release() {
  active--;
  queue.shift()?.();
}
export async function request(
  url,
  {
    method = "GET",
    body,
    headers = {},
    timeout = 15000,
    limit = 3_000_000,
    proxy,
    family,
    signal,
    follow = false,
  } = {},
) {
  const u = new URL(url);
  if (u.protocol !== "https:" || u.username || u.password)
    throw new Error("数据源必须使用 HTTPS");
  signal?.throwIfAborted();
  await slot();
  try {
    signal?.throwIfAborted();
    return await new Promise((resolve, reject) => {
      const args = [
        "--silent",
        "--show-error",
        "--verbose",
        "--max-time",
        String(Math.ceil(timeout / 1000)),
        "--connect-timeout",
        "7",
        "--proto",
        "=https",
        "--proto-redir",
        "=https",
        "--max-redirs",
        "3",
        "--request",
        method,
        "--user-agent",
        "NetworkDesk/" + VERSION,
        "--write-out",
        "\n__ND_RESULT__%{http_code}|%{time_total}|%{url_effective}|%{remote_ip}|%{time_namelookup}|%{time_connect}|%{time_appconnect}|%{http_connect}",
      ];
      if (follow) args.push("--location");
      if (method === "HEAD") args.push("--head");
      if (family === "4" || family === "6") args.push("-" + family);
      if (proxy?.mode === "direct") args.push("--noproxy", "*");
      if (["local", "socks5"].includes(proxy?.mode))
        args.push(
          "--proxy",
          `${proxy.mode === "socks5" ? "socks5h" : "http"}://127.0.0.1:${proxy.port}`,
          "--noproxy",
          "",
        );
      for (const [key, val] of Object.entries(headers))
        args.push("--header", `${key}: ${val}`);
      if (body != null) args.push("--data-binary", "@-");
      args.push(url);
      const child = spawn(
        process.platform === "win32" ? "curl.exe" : "curl",
        args,
        { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
      );
      children.add(child);
      const abort = () => child.kill();
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
      child.once("close", () => {
        children.delete(child);
        signal?.removeEventListener("abort", abort);
      });
      const chunks = [];
      let length = 0;
      const trace = createTransportTrace();
      let exceeded = false;
      const timer = setTimeout(() => child.kill(), timeout + 2500);
      child.stdout.on("data", (part) => {
        length += part.length;
        if (length > limit) {
          exceeded = true;
          child.kill();
        } else chunks.push(part);
      });
      child.stderr.on("data", (part) => {
        trace.push(part.toString());
      });
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(
          new Error(
            e.code === "ENOENT"
              ? "未找到系统 curl，请安装 curl 或使用 Windows 10/11"
              : e.message,
          ),
        );
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (signal?.aborted)
          return reject(
            signal.reason || new DOMException("已停止", "AbortError"),
          );
        if (exceeded) return reject(new Error("上游响应超过大小限制"));
        const text = Buffer.concat(chunks).toString("utf8");
        const at = text.lastIndexOf("\n__ND_RESULT__");
        const parts = at < 0 ? [] : text.slice(at + 14).split("|");
        const ms = (value) =>
          value && Number.isFinite(Number(value))
            ? Math.round(Number(value) * 1000)
            : null;
        const transportDetails = {
          ...trace.snapshot(),
          httpConnectStatus: Number(parts[7]) || null,
          remoteIP: parts[3] || null,
          dnsMs: ms(parts[4]),
          connectMs: ms(parts[5]),
          tlsMs: ms(parts[6]),
          elapsedMs: ms(parts[1]),
        };
        if (code !== 0) return reject(transportError(code, transportDetails));
        if (at < 0) return reject(new Error("无法读取请求结果"));
        const [status, time, effective] = text.slice(at + 14).split("|");
        resolve({
          status: Number(status),
          elapsedMs: Math.round(Number(time) * 1000),
          url: effective,
          body: text.slice(0, at),
          checkedAt: new Date().toISOString(),
          transportDetails,
        });
      });
      child.stdin.on("error", () => {});
      child.stdin.end(
        body == null
          ? undefined
          : typeof body === "string"
            ? body
            : JSON.stringify(body),
      );
    });
  } finally {
    release();
  }
}
export async function jsonRequest(url, options) {
  const r = await request(url, options);
  if (r.status < 200 || r.status >= 300)
    throw new Error(`数据源返回 HTTP ${r.status}`);
  try {
    return { ...r, data: JSON.parse(r.body) };
  } catch {
    throw new Error("数据源未返回有效 JSON（可能遇到验证页）");
  }
}
export function validateProxy(input = {}) {
  const mode = input.mode || "system";
  if (!["system", "direct", "local", "socks5"].includes(mode))
    throw new Error("不支持的代理方式");
  const port = Number(input.port || 7890);
  if (
    ["local", "socks5"].includes(mode) &&
    (!Number.isInteger(port) || port < 1024 || port > 65535)
  )
    throw new Error("代理端口必须为 1024–65535");
  return { mode, port };
}
