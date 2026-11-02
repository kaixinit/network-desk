import test from "node:test";
import assert from "node:assert/strict";
import {
  makeRecord,
  observation,
  prepareExport,
  validateRecord,
  reportHTML,
} from "../shared/model.mjs";
import {
  investigationPlan,
  conclusionSummary,
} from "../shared/investigation.mjs";
import { runInvestigation } from "../src/investigation-runner.mjs";
import { runTask } from "../src/task-runner.mjs";
import { deliveryArchive } from "../shared/delivery.mjs";
import { unzipSync, strFromU8 } from "fflate";
import { createHash } from "node:crypto";

function fixture() {
  const calls = [],
    countries = [];
  const d = {
    recordRef: { current: makeRecord("home", "旧记录") },
    generation: { current: 0 },
    running: { current: new Map() },
    patchRecord(patch) {
      Object.assign(this.recordRef.current, patch);
    },
    startRecord(scope, title) {
      this.generation.current++;
      this.running.current.clear();
      this.recordRef.current = makeRecord(scope, title);
    },
    setSelected() {},
    setNotice() {},
    save() {},
    put(item) {
      this.recordRef.current.results[item.key] = item;
    },
    task(key, label, fn, meta) {
      calls.push(key);
      return runTask(
        {
          running: this.running,
          generation: this.generation,
          put: (r) => this.put(r),
          save() {},
        },
        key,
        label,
        fn,
        meta,
      );
    },
  };
  const emit = (key, data = {}) =>
    d.task(key, key, async () => ({ status: "ok", summary: "fixture", data }));
  const c = {
    environment: () => emit("environment"),
    exit: (t) =>
      emit("egress:" + t, { ip: t === "claude" ? "192.0.2.2" : "192.0.2.1" }),
    risk: (ip) =>
      emit("risk:" + ip, {
        match: true,
        countryCode: ip.endsWith("2") ? "JP" : "US",
      }),
    connectivity: (t) => emit("link:" + t, { httpStatus: 200 }),
    dns: () => emit("dns-leak", { resolvers: ["192.0.2.10"] }),
    rtc: () => emit("webrtc", { state: "unknown" }),
    region: (platform, country) => {
      countries.push([platform, country]);
      return emit("region:" + platform, { applicable: true });
    },
  };
  return { d, c, calls, countries };
}

test("comprehensive runs deduplicate shared checks and use each platform's own exit", async () => {
  const { d, c, calls, countries } = fixture();
  await runInvestigation(d, c, ["network", "claude", "gpt", "google"]);
  assert.equal(calls.length, new Set(calls).size);
  assert.equal(calls.filter((k) => k.startsWith("risk:")).length, 2);
  assert.deepEqual(countries, [
    ["claude", "JP"],
    ["gpt", "US"],
  ]);
  assert.equal(d.recordRef.current.scope, "investigation");
  assert.equal(d.recordRef.current.investigation.state, "completed");
  assert.equal(conclusionSummary(d.recordRef.current).missing.length, 0);
  validateRecord(d.recordRef.current);
});
test("a selected platform does not silently run other platform requests", async () => {
  const p = investigationPlan(["google", "google"]);
  assert.deepEqual(p.selected, ["google"]);
  assert.deepEqual(p.links, ["google", "accounts", "gmail"]);
  assert.equal(p.exits.includes("claude"), false);
  assert.throws(() => investigationPlan([]));
  assert.throws(() => investigationPlan(["constructor"]));
});
test("stop/replacement during a system collection cannot attach to a new report or launch later stages", async () => {
  const { d, c, calls } = fixture();
  let started, finish;
  const ready = new Promise((r) => {
    started = r;
  });
  const wait = new Promise((r) => {
    finish = r;
  });
  const pending = runInvestigation(d, c, ["network"], {
    includeSystem: true,
    collectSystem: async () => {
      started();
      return wait;
    },
  });
  await ready;
  d.startRecord("home", "另一记录");
  const id = d.recordRef.current.id;
  finish({
    schema: "network-desk/system-v1",
    collectedAt: new Date().toISOString(),
    os: {},
    network: {},
    region: {},
    timezone: {},
  });
  await pending;
  assert.equal(d.recordRef.current.id, id);
  assert.equal(d.recordRef.current.system, null);
  assert.deepEqual(Object.keys(d.recordRef.current.results), []);
  assert.equal(
    calls.some((k) => k.startsWith("link:")),
    false,
  );
});
test("a failed system collector remains explicit while network checks finish", async () => {
  const { d, c } = fixture();
  await runInvestigation(d, c, ["google"], {
    includeSystem: true,
    collectSystem: async () => {
      throw Error("script denied by policy");
    },
  });
  assert.equal(
    d.recordRef.current.results["system:collection"].status,
    "error",
  );
  assert.equal(d.recordRef.current.results["link:gmail"].status, "ok");
  assert.equal(d.recordRef.current.investigation.state, "completed");
});
test("region checks without verified intelligence are unknown, never inherited from another exit", async () => {
  const { d, c, countries } = fixture();
  c.risk = (ip) =>
    d.task("risk:" + ip, "unverified", async () => ({
      status: "unknown",
      summary: "IP mismatch",
      data: { match: false, countryCode: "JP" },
    }));
  await runInvestigation(d, c, ["claude"]);
  assert.equal(countries.length, 0);
  assert.equal(d.recordRef.current.results["region:claude"].status, "unknown");
});
test("summary distinguishes HTTP refusal, absent evidence and incomplete execution", () => {
  const r = makeRecord("combined", "Test");
  for (const [key, patch] of [
    ["link:claude", { status: "ok", data: { httpStatus: 403 } }],
    ["dns-leak", { status: "unknown" }],
    ["environment", { status: "ok" }],
  ])
    r.results[key] = observation(key, key, patch);
  const s = conclusionSummary(r);
  assert.equal(s.warnings, 1);
  assert.equal(s.unknown, 1);
  assert.match(s.findings[0].action, /不代表账号被封/);
  r.investigation = {
    version: 1,
    scopes: ["claude"],
    includeSystem: false,
    state: "stopped",
    startedAt: r.createdAt,
    finishedAt: r.updatedAt,
    plannedKeys: ["link:anthropic"],
  };
  assert.match(conclusionSummary(r).headline, /未完整结束/);
  assert.equal(conclusionSummary(r).missing.length, 1);
  r.diagnosticSummary = { headline: "保证安全，免手机验证" };
  assert.doesNotMatch(
    validateRecord(r).diagnosticSummary.headline,
    /保证|免手机/,
  );
  assert.throws(() =>
    validateRecord({
      ...r,
      investigation: { ...r.investigation, scopes: ["invalid"] },
    }),
  );
});
test("compatibility aliases do not double-count one DNS or WebRTC observation", () => {
  const r = makeRecord("home", "Test");
  const item = observation("dns-leak:quick", "DNS", { status: "unknown" });
  r.results[item.key] = item;
  r.results["dns-leak"] = { ...item, key: "dns-leak" };
  assert.equal(conclusionSummary(r).unknown, 1);
});
test("delivery ZIP uses one redacted snapshot, offline HTML, valid JSON and correct checksums", async () => {
  const { d, c } = fixture();
  await runInvestigation(d, c, ["network", "gpt"]);
  const r = d.recordRef.current;
  r.results["link:chatgpt"].summary =
    '<img src=x onerror="alert(1)"> 192.0.2.1';
  const original = JSON.stringify(r);
  const archive = await deliveryArchive(r, true);
  const files = unzipSync(archive.bytes);
  assert.deepEqual(
    Object.keys(files).sort(),
    ["SHA256SUMS.txt", "report.html", "report.json", "使用说明.txt"].sort(),
  );
  for (const bytes of Object.values(files))
    assert.equal(strFromU8(bytes).includes("192.0.2.1"), false);
  const restored = validateRecord(JSON.parse(strFromU8(files["report.json"])));
  assert.equal(restored.redacted, true);
  assert.equal(restored.id, r.id);
  const html = strFromU8(files["report.html"]);
  assert.equal(html.includes("<img src=x"), false);
  assert.equal(html.includes(restored.diagnosticSummary.headline), true);
  assert.equal(html.includes("<script"), false);
  for (const line of strFromU8(files["SHA256SUMS.txt"]).trim().split("\n")) {
    const [hash, name] = line.split("  ");
    assert.equal(hash, createHash("sha256").update(files[name]).digest("hex"));
  }
  assert.equal(JSON.stringify(r), original);
  assert.equal(conclusionSummary(restored).missing.length, 0);
  const again = prepareExport(restored, false);
  assert.equal(again.redacted, true);
  assert.equal(reportHTML(again).includes("<img src=x"), false);
});
test("module delivery exports exclude unselected evidence without marking it as missing", async () => {
  const { d, c } = fixture();
  await runInvestigation(d, c, ["claude"]);
  const { record } = await deliveryArchive(d.recordRef.current, false, [
    "connectivity",
  ]);
  assert.ok(Object.keys(record.results).every((k) => k.startsWith("link:")));
  assert.equal(record.diagnosticSummary.missing.length, 0);
  assert.deepEqual(record.exportModules, ["connectivity"]);
});

test("redaction collisions cannot turn an unexecuted planned IP lookup into a completed lookup", () => {
  const r = makeRecord("investigation", "Partial");
  r.results["risk:192.0.2.1"] = observation("risk:192.0.2.1", "Lookup", {
    status: "ok",
  });
  r.investigation = {
    version: 1,
    scopes: ["network"],
    includeSystem: false,
    state: "stopped",
    startedAt: r.createdAt,
    finishedAt: r.updatedAt,
    plannedKeys: ["risk:192.0.2.1", "risk:192.0.2.2"],
  };
  const exported = prepareExport(r, true);
  assert.equal(exported.diagnosticSummary.missing.length, 1);
  assert.equal(
    prepareExport(exported, false).diagnosticSummary.missing.length,
    1,
  );
});
