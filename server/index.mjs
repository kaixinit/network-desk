import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import * as providers from "./providers.mjs";
import {
  TARGETS,
  STATUS_SOURCES,
  FEEDS,
  DETAIL_SECTIONS,
  EDGE_TARGETS,
} from "./catalog.mjs";
import { jsonRequest, stopRequests } from "./net.mjs";
import { captchaConfiguration } from "../shared/diagnostic-guidance.mjs";
import { VERSION } from "../shared/version.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const web = path.join(root, "dist", "client");
let config = {};
try {
  config = JSON.parse(
    await fs.readFile(
      path.join(process.env.NETWORK_DESK_DATA_DIR || root, "config.local.json"),
      "utf8",
    ),
  );
} catch (e) {
  if (e.code !== "ENOENT")
    console.error("config.local.json 无效，使用默认配置");
}
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
  ".ps1": "text/plain; charset=utf-8",
};
let port = 0;
function send(res, code, data, type = "application/json; charset=utf-8") {
  const bytes = Buffer.isBuffer(data)
    ? data
    : Buffer.from(typeof data === "string" ? data : JSON.stringify(data));
  res.writeHead(code, {
    "Content-Type": type,
    "Content-Length": bytes.length,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": res.getHeader("X-Frame-Options") || "DENY",
    "Permissions-Policy": "geolocation=(), camera=(), microphone=()",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self' https://challenges.cloudflare.com https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self'; connect-src 'self' https:; frame-src 'self' https://challenges.cloudflare.com https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/; object-src 'none'; base-uri 'none'; frame-ancestors 'self'",
  });
  res.end(bytes);
}
async function body(req) {
  let bytes = 0;
  const parts = [];
  for await (const part of req) {
    bytes += part.length;
    if (bytes > 16384) throw new Error("请求超过 16 KB");
    parts.push(part);
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString());
  } catch {
    throw new Error("请求 JSON 无效");
  }
}
const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host || "";
    if (!["127.0.0.1:" + port, "localhost:" + port].includes(host))
      return send(res, 403, { error: "仅允许本机访问" });
    if (
      req.headers.origin &&
      !["http://127.0.0.1:" + port, "http://localhost:" + port].includes(
        req.headers.origin,
      )
    )
      return send(res, 403, { error: "拒绝跨来源调用" });
    if (req.headers["sec-fetch-site"] === "cross-site")
      return send(res, 403, { error: "拒绝跨站请求" });
    if (!["GET", "HEAD", "POST"].includes(req.method))
      return send(res, 405, { error: "不支持的方法" });
    const u = new URL(req.url, "http://127.0.0.1:" + port);
    const p = u.pathname;
    const q = Object.fromEntries(u.searchParams);
    if (p.startsWith("/api/")) {
      // Other ports on localhost are different origins even when browsers call them same-site.
      if (
        req.headers["sec-fetch-site"] &&
        !["same-origin", "none"].includes(req.headers["sec-fetch-site"])
      )
        return send(res, 403, { error: "API 仅允许本软件页面调用" });
      if (req.method === "HEAD")
        return send(res, 405, { error: "API 不支持 HEAD" });
      const postPaths = [
        "/api/global-ping",
        "/api/turnstile",
        "/api/recaptcha",
      ];
      if (req.method === "POST" && !postPaths.includes(p))
        return send(res, 405, { error: "此接口仅支持 GET" });
      if (
        req.method === "POST" &&
        !/^application\/json\b/i.test(req.headers["content-type"] || "")
      )
        return send(res, 415, { error: "需要 application/json" });
      let result;
      switch (p) {
        case "/api/health":
          result = { ok: true, name: "Network Desk", version: VERSION, port };
          break;
        case "/api/config":
          result = {
            targets: TARGETS,
            statusSources: STATUS_SOURCES,
            feeds: FEEDS,
            detailSections: DETAIL_SECTIONS,
            edgeTargets: EDGE_TARGETS,
            captcha: {
              managed: captchaConfiguration(config, "managed"),
              noninteractive: captchaConfiguration(config, "noninteractive"),
              recaptcha: captchaConfiguration(config, "recaptcha"),
            },
            configured: {
              ipapi: Boolean(config.ipapiKey),
              globalping: Boolean(config.globalpingToken),
              turnstile: Boolean(
                config.turnstileSiteKey && config.turnstileSecret,
              ),
            },
            turnstileSiteKey: config.turnstileSiteKey || null,
          };
          break;
        case "/api/probe":
          result = await providers.probe(q);
          break;
        case "/api/intelligence":
          result = await providers.intelligence(q.ip, q.provider, config);
          break;
        case "/api/score-check":
          result = await providers.scoreCheck(q.ip);
          break;
        case "/api/detail":
          result = await providers.detail(q.ip, q.section, q.asn);
          break;
        case "/api/ripe":
          result = await providers.ripe(q.ip, q.section);
          break;
        case "/api/dns-query":
          result = await providers.dnsQuery(q.name, q.type, q.resolver);
          break;
        case "/api/dns-session":
          result = providers.newDNSSession();
          break;
        case "/api/dns-result":
          result = await providers.dnsResult(q.token);
          break;
        case "/api/global-ping":
          if (req.method !== "POST")
            return send(res, 405, { error: "使用 POST 创建测量" });
          result = await providers.startGlobalPing(await body(req), config);
          break;
        case "/api/global-ping-result":
          result = await providers.globalPingResult(q.id);
          break;
        case "/api/whois":
          result = await providers.whois(q.q);
          break;
        case "/api/tlds":
          result = await providers.tlds();
          break;
        case "/api/status":
          result = await providers.statusAll();
          break;
        case "/api/news":
          result = await providers.newsFeed(q.source);
          break;
        case "/api/regions":
          result = await providers.supportRegions(
            q.platform || "claude",
            q.country,
            { mode: q.mode, port: q.port, refresh: q.refresh === "1" },
          );
          break;
        case "/api/recaptcha":
        case "/api/turnstile": {
          if (req.method !== "POST")
            return send(res, 405, { error: "使用 POST" });
          const b = await body(req);
          const google = p === "/api/recaptcha";
          if (
            !google &&
            ![undefined, "managed", "noninteractive"].includes(b.kind)
          )
            throw new Error("验证模式无效");
          const secret = google
            ? config.recaptchaSecret
            : b.kind === "noninteractive"
              ? config.turnstileNoninteractiveSecret
              : config.turnstileSecret;
          const sitekey = google
            ? config.recaptchaSiteKey
            : b.kind === "noninteractive"
              ? config.turnstileNoninteractiveSiteKey
              : config.turnstileSiteKey;
          if (!sitekey || !secret)
            return send(res, 409, {
              error: "尚未配置此验证模式的本站点密钥",
            });
          if (
            typeof b.token !== "string" ||
            !b.token.length ||
            b.token.length > (google ? 8192 : 2048)
          )
            throw new Error("验证令牌无效");
          const r = await jsonRequest(
            google
              ? "https://www.google.com/recaptcha/api/siteverify"
              : "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                secret,
                response: b.token,
              }).toString(),
            },
          );
          result = r.data;
          const hosts = ["localhost", "127.0.0.1"];
          if (
            result.success &&
            (!hosts.includes(result.hostname) ||
              (google && result.action !== "network_desk"))
          )
            result = {
              success: false,
              "error-codes": ["本站点 hostname / action 校验不通过"],
            };
          break;
        }
        default:
          return send(res, 404, { error: "未知 API" });
      }
      return send(res, 200, result);
    }
    if (req.method === "POST")
      return send(res, 405, { error: "静态页面仅支持 GET" });
    let decoded;
    try {
      decoded = decodeURIComponent(p);
    } catch {
      return send(res, 400, "无效路径");
    }
    if (
      decoded.includes("\\") ||
      decoded.includes("\0") ||
      decoded.split("/").includes("..")
    )
      return send(res, 400, "无效路径");
    if (decoded.split("/").some((segment) => segment.startsWith(".")))
      return send(res, 404, "文件不存在", "text/plain; charset=utf-8");
    if (decoded.startsWith("/card/embed/"))
      res.setHeader("X-Frame-Options", "SAMEORIGIN");
    let file = path.resolve(web, "." + decoded);
    if (!file.startsWith(web + path.sep) && file !== web)
      return send(res, 403, "无效路径");
    if (p === "/scripts/collect-system.ps1")
      file = path.join(root, "scripts", "collect-system.ps1");
    else if (
      !path.extname(p) ||
      p.endsWith("/") ||
      /^\/(claude|gpt)\/ipv6\.html$/.test(p)
    )
      file = path.join(web, "index.html");
    let bytes;
    try {
      const allowedRoot =
        p === "/scripts/collect-system.ps1" ? path.join(root, "scripts") : web;
      const [realRoot, realFile] = await Promise.all([
        fs.realpath(allowedRoot),
        fs.realpath(file),
      ]);
      const relative = path.relative(realRoot, realFile);
      if (relative.startsWith("..") || path.isAbsolute(relative))
        return send(res, 404, "文件不存在", "text/plain; charset=utf-8");
      bytes = await fs.readFile(realFile);
    } catch {
      return send(
        res,
        404,
        "文件不存在，请先 npm run build",
        "text/plain; charset=utf-8",
      );
    }
    if (p === "/scripts/collect-system.ps1")
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="collect-system.ps1"',
      );
    return send(
      res,
      200,
      req.method === "HEAD" ? Buffer.alloc(0) : bytes,
      mime[path.extname(file)] || "application/octet-stream",
    );
  } catch (e) {
    if (!res.headersSent)
      send(res, 400, {
        error: e.message || "检测失败",
        checkedAt: new Date().toISOString(),
      });
    else res.end();
  }
});
const at = process.argv.indexOf("--port");
process.parentPort?.on("message", (event) => {
  if (event.data?.type !== "shutdown") return;
  stopRequests();
  server.closeAllConnections();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 500).unref();
});
const wanted = at >= 0 ? Number(process.argv[at + 1]) : 8780;
if (!Number.isInteger(wanted) || wanted < 0 || wanted > 65535)
  throw new Error("端口无效");
server.on("error", (e) => {
  if (e.code === "EADDRINUSE" && wanted !== 0) server.listen(0, "127.0.0.1");
  else {
    console.error(e);
    process.exitCode = 1;
  }
});
server.listen(wanted, "127.0.0.1", () => {
  port = server.address().port;
  process.parentPort?.postMessage({ type: "ready", port });
  const url = "http://127.0.0.1:" + port + "/";
  console.log(
    "网络诊断台 Network Desk " +
      VERSION +
      "\n" +
      url +
      "\n仅监听本机。关闭服务窗口后停止。",
  );
  if (process.argv.includes("--open")) {
    const child =
      process.platform === "win32"
        ? spawn("rundll32.exe", ["url.dll,FileProtocolHandler", url], {
            windowsHide: true,
            stdio: "ignore",
            detached: true,
          })
        : spawn(process.platform === "darwin" ? "open" : "xdg-open", [url], {
            stdio: "ignore",
            detached: true,
          });
    child.on("error", () => {});
    child.unref();
  }
});
