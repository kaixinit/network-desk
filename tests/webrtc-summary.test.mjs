import test from "node:test";
import assert from "node:assert/strict";
import { compareWebRTC } from "../shared/webrtc-comparison.mjs";
import {
  makeRecord,
  observation,
  validateRecord,
  prepareExport,
  reportHTML,
} from "../shared/model.mjs";
import {
  diagnosticObservations,
  conclusionSummary,
} from "../shared/investigation.mjs";
const candidate = (address) => ({ address, type: "srflx", protocol: "udp" });
test("UDP comparisons require the same family, canonical addresses and public candidates", () => {
  assert.equal(
    compareWebRTC([candidate("192.0.2.1")], "2001:db8::1").comparison,
    "family-mismatch",
  );
  assert.equal(
    compareWebRTC([candidate("2001:db8::1")], "192.0.2.1").state,
    "unknown",
  );
  assert.equal(
    compareWebRTC([candidate("192.0.2.2")], "192.0.2.1").state,
    "different",
  );
  assert.equal(
    compareWebRTC([candidate("2001:db8::1")], "2001:0db8:0:0:0:0:0:1").state,
    "match",
  );
  const dual = compareWebRTC(
    [candidate("192.0.2.1"), candidate("2001:db8::1")],
    "192.0.2.1",
  );
  assert.equal(dual.state, "match");
  assert.equal(dual.excludedFamilyCount, 1);
  assert.equal(
    compareWebRTC([candidate("192.0.2.1"), candidate("192.0.2.2")], "192.0.2.1")
      .state,
    "different",
  );
  assert.equal(
    compareWebRTC([{ address: "192.0.2.1", type: "host" }], "192.0.2.1").state,
    "unknown",
  );
  assert.equal(
    compareWebRTC([{ ...candidate("192.0.2.1"), protocol: "tcp" }], "192.0.2.1")
      .state,
    "unknown",
  );
  assert.equal(compareWebRTC([], "192.0.2.1").state, "unknown");
  assert.equal(compareWebRTC([candidate("192.0.2.1")], "").state, "unknown");
});
function historical() {
  const r = makeRecord("gpt", "GPT / Codex 环境检测");
  const add = (key, stamp, patch = {}) =>
    (r.results[key] = observation(
      key,
      key.startsWith("webrtc") ? "WebRTC / UDP 出口" : key,
      {
        status: "ok",
        observedAt: `2026-11-01T12:00:${stamp}.000Z`,
        summary: "old result",
        ...patch,
      },
    ));
  const data = {
    state: "different",
    expectedIP: "2001:db8::1",
    candidates: [candidate("192.0.2.1")],
  };
  add("webrtc:192.0.2.1", "00", {
    data: { ...data, state: "match", expectedIP: "192.0.2.1" },
  });
  add("webrtc:2001:db8::2", "01", { data });
  add("webrtc:2001:db8::1", "02", { data });
  add("webrtc", "02", { data });
  add("dns-leak:quick", "00");
  add("dns-leak:extended", "02");
  add("dns-leak", "02");
  add("region:claude", "01", {
    status: "unknown",
    data: { applicable: null, effectiveAt: "2099-01-01" },
  });
  add("region:gpt", "02", {
    status: "error",
    data: { httpStatus: 403, applicable: null, challenge: true },
  });
  return r;
}
test("historical page visits contribute only the latest WebRTC and DNS measurement, retaining raw evidence", () => {
  const r = historical(),
    before = JSON.stringify(r);
  const rows = diagnosticObservations(r),
    s = conclusionSummary(r);
  assert.equal(rows.length, 4);
  assert.equal(s.findings.filter((x) => x.key.startsWith("webrtc")).length, 1);
  assert.equal(s.warnings, 0);
  assert.equal(s.unknown, 2);
  assert.equal(s.errors, 1);
  assert.match(s.scope, /累计观测.*Claude.*GPT/);
  assert.match(
    s.findings.find((x) => x.key === "region:gpt").reason,
    /官方名单.*403/,
  );
  assert.equal(JSON.stringify(r), before);
  const validated = validateRecord(r);
  assert.equal(validated.results.webrtc.data.state, "unknown");
  assert.equal(
    validated.results.webrtc.data.previousComparison.state,
    "different",
  );
  assert.equal(
    validated.results.webrtc.observedAt,
    r.results.webrtc.observedAt,
  );
  assert.equal(Object.keys(validated.results).length, 9);
  for (const masked of [false, true]) {
    const exported = prepareExport(validated, masked);
    const imported = validateRecord(exported);
    assert.deepEqual(conclusionSummary(imported), conclusionSummary(exported));
    assert.equal(conclusionSummary(imported).unknown, 2);
    assert.match(reportHTML(imported), /IPv4 \/ IPv6 无法直接比较/);
  }
});
test("a newer running/failed round replaces stale success; same-time aliases count once", () => {
  const r = historical();
  r.results["webrtc:new"] = observation("webrtc:new", "WebRTC", {
    status: "running",
    observedAt: "2026-11-01T12:01:00Z",
  });
  assert.equal(conclusionSummary(r).running, 1);
  assert.equal(conclusionSummary(r).unknown, 1);
  r.results["webrtc:new"].status = "error";
  assert.equal(conclusionSummary(r).errors, 2);
  assert.equal(
    diagnosticObservations(r).filter((x) => x.key.startsWith("webrtc")).length,
    1,
  );
});
test("masked historical evidence is never reinterpreted as missing or matched addresses", () => {
  const r = historical();
  r.results.webrtc.data = {
    state: "different",
    expectedIP: "2001:db8::1",
    candidates: [candidate("192.0.•••.•••")],
  };
  assert.equal(validateRecord(r).results.webrtc.data.state, "different");
});
