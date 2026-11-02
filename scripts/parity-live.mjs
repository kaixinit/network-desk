// Full catalog smoke tests. Public targets only; results omit personal egress IPs.
import fs from "node:fs/promises";
import { canonicalIP } from "../shared/model.mjs";
const base = process.env.NETWORK_DESK_URL || "http://127.0.0.1:8791";
const get = async (p) => {
  const r = await fetch(base + p, { signal: AbortSignal.timeout(150000) });
  return { http: r.status, data: await r.json() };
};
const { data: config } = await get("/api/config");
const tests = [];
const cases = [];
for (const [id, t] of Object.entries(config.targets)) {
  cases.push([
    "连通性 " + t.label,
    "/api/probe?connectivity=true&target=" + id,
    (d) => ({
      responseStatus: d.httpStatus,
      timingValid: Number.isFinite(d.elapsedMs),
    }),
  ]);
  if (t.split || config.edgeTargets.includes(id))
    cases.push([
      "出口 " + t.label,
      "/api/probe?target=" + id,
      (d) => ({
        completeIP: !!canonicalIP(d.ip),
        colo: d.trace?.colo || null,
        reason: d.reason || null,
      }),
    ]);
}
for (const [section, def] of Object.entries(config.detailSections)) {
  // Probe endpoints kept to user-operated egress elsewhere; avoid unsolicited active scanning of public examples.
  if (["ports", "ping"].includes(section)) continue;
  cases.push([
    def.label,
    "/api/detail?ip=1.1.1.1&asn=13335&section=" + section,
    (d) => ({ available: d.available, reason: d.reason }),
  ]);
}
for (let i = 0; i < cases.length; i += 3) {
  await Promise.all(
    cases.slice(i, i + 3).map(async ([name, path, summary]) => {
      try {
        const r = await get(path);
        tests.push({
          name,
          http: r.http,
          ...(r.http === 200 ? summary(r.data) : { error: r.data.error }),
        });
      } catch (e) {
        tests.push({ name, error: e.message });
      }
    }),
  );
  if (i % 15 === 0)
    console.log(`Completed ${Math.min(i + 3, cases.length)}/${cases.length}`);
}
const status = await get("/api/status");
tests.push({
  name: "31 个官方状态源",
  http: status.http,
  services: status.data.map((s) => ({
    name: s.name,
    ok: s.ok,
    error: s.error || null,
  })),
});
for (const route of ["turnstile", "recaptcha"]) {
  const r = await fetch(base + "/api/" + route, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "configuration-test" }),
  });
  tests.push({ name: route + " 无配置状态", http: r.status, expected: 409 });
}
await fs.mkdir("qa", { recursive: true });
await fs.writeFile(
  "qa/parity-live.json",
  JSON.stringify({ checkedAt: new Date().toISOString(), tests }, null, 2),
);
console.log(
  JSON.stringify({
    total: tests.length,
    transportFailures: tests.filter((x) => x.error).length,
    missingEgress: tests.filter((x) => x.completeIP === false).length,
    statusSources: status.data.length,
  }),
);
