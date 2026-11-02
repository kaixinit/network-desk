// Public test objects only. Does not save user egress addresses or secrets.
import fs from "node:fs/promises";
const base = process.env.NETWORK_DESK_URL || "http://127.0.0.1:8780";
const cases = [
  ["health", "/api/health"],
  ["config", "/api/config"],
  ["IP intelligence", "/api/intelligence?ip=1.1.1.1"],
  ["score mismatch defense", "/api/score-check?ip=1.1.1.1"],
  [
    "DNS Cloudflare",
    "/api/dns-query?name=example.com&type=A&resolver=cloudflare",
  ],
  ["DNS Google", "/api/dns-query?name=example.com&type=MX&resolver=google"],
  ["RDAP domain", "/api/whois?q=example.com"],
  ["RDAP IPv4", "/api/whois?q=1.1.1.1"],
  ["RDAP ASN", "/api/whois?q=AS13335"],
  ["RIPE", "/api/ripe?ip=1.1.1.1"],
  ["status", "/api/status"],
  ["news", "/api/news?source=google"],
];
const output = [];
for (let at = 0; at < cases.length; at += 3) {
  await Promise.all(
    cases.slice(at, at + 3).map(async ([name, path]) => {
      const begin = Date.now();
      try {
        const r = await fetch(base + path);
        const data = await r.json();
        output.push({
          name,
          http: r.status,
          elapsedMs: Date.now() - begin,
          status: r.ok ? "responded" : "upstream-or-validation-error",
          detail:
            data.error || (name.includes("mismatch") ? data.reason : undefined),
        });
      } catch (e) {
        output.push({ name, status: "failed", detail: e.message });
      }
    }),
  );
}
for (const path of [
  "/",
  "/claude/",
  "/gpt/",
  "/google/",
  "/ip/",
  "/link/",
  "/dns/",
  "/webrtc/",
  "/cloudflare/",
  "/ping/",
  "/status/",
  "/whois/",
  "/card/",
  "/news/",
  "/reports/",
  "/help/",
  "/settings/",
]) {
  const r = await fetch(base + path);
  output.push({
    name: path,
    http: r.status,
    status: (await r.text()).includes('id="root"') ? "app-shell" : "invalid",
  });
}
const invalid = await fetch(base + "/api/whois?q=127.0.0.1");
output.push({
  name: "private target rejected",
  status: invalid.status === 400 ? "passed" : "failed",
});
const cross = await fetch(base + "/api/health", {
  headers: { Origin: "https://example.com" },
});
output.push({
  name: "cross-origin rejected",
  status: cross.status === 403 ? "passed" : "failed",
});
await fs.mkdir("qa", { recursive: true });
await fs.writeFile(
  "qa/live-checks.json",
  JSON.stringify(
    { checkedAt: new Date().toISOString(), tests: output },
    null,
    2,
  ),
);
console.log(JSON.stringify(output, null, 2));
if (output.some((x) => x.status === "failed" || x.status === "invalid"))
  process.exitCode = 1;
