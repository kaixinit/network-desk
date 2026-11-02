import test from "node:test";
import assert from "node:assert/strict";
import { egressView } from "../shared/egress-view.mjs";
import { maskIP } from "../shared/model.mjs";

test("redacted egress is identified without being treated as a complete IP", () => {
  for (const ip of ["192.0.2.1", "2001:db8::1"]) {
    const r = { status: "ok", data: { ip: maskIP(ip) } };
    assert.equal(egressView(r, true).label, "已脱敏 · 需重测");
    assert.equal(egressView(r, true).ip, null);
    assert.equal(egressView(r, false).label, "未取得 IP");
    assert.equal(egressView({ ...r, data: { ip } }, true).label, "已取得");
  }
});
test("egress failure and running state remain visible even with a cached IP", () => {
  assert.equal(
    egressView({ status: "error", data: { ip: "192.0.2.1" } }).label,
    "检测失败",
  );
  assert.equal(
    egressView({ status: "running", data: { ip: "192.0.2.1" } }).label,
    "检测中",
  );
});
