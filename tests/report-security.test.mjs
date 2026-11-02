import test from "node:test";
import assert from "node:assert/strict";
import {
  makeRecord,
  observation,
  validateRecord,
  validateSystem,
  prepareExport,
  REFERENCE_PRESETS,
  reportHTML,
} from "../shared/model.mjs";

function report(key, data, extra = {}) {
  const r = makeRecord("security", "Import fixture");
  r.results[key] = observation(key, "Fixture", { data, ...extra });
  return r;
}
test("reports without a reference preserve their conclusion on import and re-export", () => {
  const source = report("environment", { language: "en-US" });
  for (const masked of [false, true]) {
    const exported = prepareExport(source, masked);
    const imported = validateRecord(exported);
    assert.deepEqual(imported, exported);
    assert.equal(reportHTML(imported, masked), reportHTML(exported, masked));
    assert.equal(imported.assessmentSnapshot.conclusion, "尚未选择参考配置");
  }
});
test("a reference-less report cannot attach a fabricated comparison snapshot", () => {
  const source = report("environment", { language: "ja-JP" });
  source.reference = REFERENCE_PRESETS.JP;
  const exported = prepareExport(source);
  exported.reference = null;
  assert.throws(() => validateRecord(exported), /未选择参考配置/);
});
test("reject imported fields that could crash React or array operations", () => {
  for (const [key, data, extra] of [
    ["x", null, { execution: {} }],
    ["x", null, { target: {} }],
    ["environment", { os: {} }],
    ["environment", { language: [] }],
    ["egress:claude", { ip: {} }],
    ["egress:cloudflare", { trace: { colo: {} } }],
    ["risk:1.1.1.1", { score: {} }],
    ["risk:1.1.1.1", { raw: { countryCode: [] } }],
    ["webrtc", { candidates: {} }],
    ["webrtc", { candidates: [null] }],
    ["dns-leak", { resolvers: "1.1.1.1" }],
    ["dns-leak", { resolvers: [{}] }],
    ["link:google", { samples: {} }],
    ["global-ping", { results: [null] }],
    ["status", {}],
    ["status", [null]],
    ["status", [{ name: {} }]],
    ["status", [{ name: "Service", ok: true }]],
    ["status", [{ name: "Service", data: { incidents: "bad" } }]],
    ["news:feed", { entries: [{ title: {} }] }],
  ])
    assert.throws(
      () => validateRecord(report(key, data, extra)),
      undefined,
      key,
    );
});
test("imported actionable links cannot launch non-HTTPS or credential-bearing URLs", () => {
  for (const url of [
    "javascript:alert(1)",
    "file:///tmp/a",
    "data:text/html,bad",
    "https://user:pass@example.com/",
  ])
    assert.throws(() =>
      validateRecord(
        report("news:feed", { entries: [{ title: "Test", url }] }),
      ),
    );
  assert.doesNotThrow(() =>
    validateRecord(
      report("news:feed", {
        entries: [{ title: "Test", url: "https://example.com/" }],
      }),
    ),
  );
});
test("bounded imported JSON rejects deep trees before recursive operations", () => {
  const r = report("x", {});
  let nested = r.results.x.data;
  for (let i = 0; i < 100; i++) nested = nested.next = {};
  assert.throws(() => validateRecord(r), /嵌套/);
  assert.throws(
    () => validateSystem({ schema: "network-desk/system-v1", nested: r }),
    /嵌套/,
  );
});
test("imported aggregate scores must agree with rows and cannot supply registration guarantees", () => {
  const r = report("environment", { language: "ja-JP" });
  r.reference = REFERENCE_PRESETS.JP;
  const exported = prepareExport(r);
  const forged = structuredClone(exported);
  forged.assessmentSnapshot.percent = 13;
  assert.throws(() => validateRecord(forged), /匹配率/);
  exported.assessmentSnapshot.conclusion = "Guaranteed registration";
  exported.assessmentSnapshot.phoneVerification = "No phone needed";
  const checked = validateRecord(exported);
  assert.match(checked.assessmentSnapshot.phoneVerification, /无法预测/);
  assert(!reportHTML(checked).includes("Guaranteed registration"));
  assert(!reportHTML(checked).includes("No phone needed"));
  assert.equal(
    validateRecord(prepareExport(r, true)).assessmentSnapshot.percent,
    100,
  );
});
test("raw provider evidence and ordinary imported report data remain intact", () => {
  const r = report("risk:1.1.1.1", {
    ip: "1.1.1.1",
    score: 88,
    raw: { nested: { values: [1, "text", null] } },
  });
  assert.deepEqual(validateRecord(r), r);
  assert.doesNotThrow(() =>
    validateRecord(
      report("status", [
        {
          name: "Service",
          ok: true,
          data: {
            status: { indicator: "none", description: "OK" },
            incidents: [],
            components: [],
          },
        },
      ]),
    ),
  );
  assert.doesNotThrow(() =>
    validateRecord(report("x", null, { execution: "constructor" })),
  );
});
