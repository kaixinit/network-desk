import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { VERSION } from "../shared/version.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let temporary, child, port;
const sentinel = "test-credential-" + crypto.randomUUID();
before(async () => {
  temporary = await fs.mkdtemp(path.join(os.tmpdir(), "networkdesk-security-"));
  for (const name of ["server", "shared"])
    await fs.cp(path.join(root, name), path.join(temporary, name), {
      recursive: true,
    });
  await fs.mkdir(path.join(temporary, "dist/client"), { recursive: true });
  await fs.writeFile(
    path.join(temporary, "dist/client/index.html"),
    '<!doctype html><div id="root"></div>',
  );
  await fs.mkdir(path.join(temporary, "private"));
  await fs.writeFile(path.join(temporary, "private/secret.txt"), sentinel);
  await fs.symlink(
    path.join(temporary, "private"),
    path.join(temporary, "dist/client/linked"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await fs.writeFile(
    path.join(temporary, "config.local.json"),
    JSON.stringify({
      ipapiKey: sentinel,
      globalpingToken: sentinel,
      turnstileSecret: sentinel,
      turnstileSiteKey: "public-test-site-key",
      recaptchaSecret: sentinel,
    }),
  );
  child = spawn(
    process.execPath,
    [path.join(temporary, "server/index.mjs"), "--port", "0"],
    {
      env: { ...process.env, NETWORK_DESK_DATA_DIR: temporary },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Test server start timed out")),
      10000,
    );
    let output = "";
    child.once("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.stdout.on("data", (bytes) => {
      output += bytes;
      const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
      if (match) {
        port = +match[1];
        clearTimeout(timer);
        resolve();
      }
    });
  });
});
after(async () => {
  if (child && child.exitCode === null)
    await new Promise((resolve) => {
      child.once("exit", resolve);
      child.kill();
    });
  if (temporary) await fs.rm(temporary, { recursive: true, force: true });
});
function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: url,
        method: options.method || "GET",
        headers: options.headers,
      },
      (res) => {
        const parts = [];
        res.on("data", (part) => parts.push(part));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            text: Buffer.concat(parts).toString(),
          }),
        );
      },
    );
    req.on("error", reject);
    req.end(options.body);
  });
}
test("local server rejects foreign Host, Origin and cross-site requests", async () => {
  for (const headers of [
    { Host: "attacker.example" },
    { Origin: "https://example.com" },
    { "Sec-Fetch-Site": "cross-site" },
  ])
    assert.equal((await request("/api/health", { headers })).status, 403);
  assert.equal(
    JSON.parse((await request("/api/health")).text).version,
    VERSION,
  );
});
test("a different localhost port cannot invoke APIs through same-site requests", async () => {
  assert.equal(
    (
      await request("/api/health", {
        headers: { "Sec-Fetch-Site": "same-site" },
      })
    ).status,
    403,
  );
  for (const site of ["same-origin", "none"])
    assert.equal(
      (await request("/api/health", { headers: { "Sec-Fetch-Site": site } }))
        .status,
      200,
    );
  assert.equal(
    (await request("/", { headers: { "Sec-Fetch-Site": "same-site" } })).status,
    200,
  );
});
test("static files cannot escape the public directory through symlinks or junctions", async () => {
  const r = await request("/linked/secret.txt");
  assert.equal(r.status, 404);
  assert(!r.text.includes(sentinel));
});
test("local API never exposes configured secrets or private config files", async () => {
  const config = await request("/api/config");
  assert.equal(config.status, 200);
  assert(!config.text.includes(sentinel));
  assert.equal(
    JSON.parse(config.text).turnstileSiteKey,
    "public-test-site-key",
  );
  for (const url of [
    "/config.local.json",
    "/preferences.json",
    "/.env",
    "/reports/test.json",
  ])
    assert.equal((await request(url)).status, 404);
});
test("API rejects unsupported verbs, bad JSON and oversized bodies", async () => {
  assert.equal(
    (
      await request("/api/health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
    ).status,
    405,
  );
  assert.equal(
    (await request("/api/health", { method: "DELETE" })).status,
    405,
  );
  assert.equal(
    (await request("/api/turnstile", { method: "POST", body: "{}" })).status,
    415,
  );
  for (const body of ["{bad", JSON.stringify({ token: "x".repeat(17000) })])
    assert.equal(
      (
        await request("/api/turnstile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        })
      ).status,
      400,
    );
});
test("static traversal is rejected and missing API does not become an app shell", async () => {
  for (const url of ["/%2e%2e%5cconfig.local.json", "/%00", "/%zz"])
    assert.equal((await request(url)).status, 400);
  assert.equal((await request("/api/not-found")).status, 404);
  assert.equal((await request("/missing.js")).status, 404);
});
test("legacy IPv6 help URLs serve the local application with security headers", async () => {
  for (const url of ["/claude/ipv6.html", "/gpt/ipv6.html"]) {
    const r = await request(url);
    assert.equal(r.status, 200);
    assert.match(r.text, /id="root"/);
    assert.equal(r.headers["x-frame-options"], "DENY");
    assert.match(r.headers["content-security-policy"], /object-src 'none'/);
    assert(!r.headers["access-control-allow-origin"]);
  }
});
