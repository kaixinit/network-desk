import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalIP,
  sameIP,
  normalizeIntelligence,
  makeRecord,
  observation,
  validateSystem,
  validateRecord,
  redact,
  reportHTML,
  assessReference,
  REFERENCE_PRESETS,
  resolverAddresses,
  prepareExport,
  resultModule,
  riskResult,
} from "../shared/model.mjs";
import { validateTarget, validateProxy, publicIP } from "../server/net.mjs";
import { CARD_THEMES, cardSVG } from "../shared/card.mjs";
import { TARGETS, STATUS_SOURCES, EDGE_TARGETS } from "../server/catalog.mjs";
test("多 IPv6 脱敏不会覆盖检测项，JSON 回读与 HTML 结论一致", () => {
  const r = makeRecord("google", "回归报告");
  r.reference = REFERENCE_PRESETS.JP;
  for (const ip of ["2001:db8::1", "2001:db8::2", "2001:db8::3"]) {
    const key = "risk:" + ip;
    r.results[key] = observation(key, "风险 " + ip, {
      status: "ok",
      data: { ip, match: true, score: 80 },
    });
  }
  const exported = prepareExport(r, true);
  assert.equal(Object.keys(exported.results).length, 3);
  assert.equal(validateRecord(exported).assessmentSnapshot.total, 11);
  assert(!JSON.stringify(exported).includes("2001:db8::1"));
  assert.equal(Object.keys(prepareExport(exported, true).results).length, 3);
  assert(
    reportHTML(exported, true).includes(exported.assessmentSnapshot.conclusion),
  );
});
test("脱敏后不能把同前缀的另一 IP 评分带入卡片", () => {
  const r = makeRecord("test", "隐私");
  for (const ip of ["2001:db8::1", "2001:db8::2"]) {
    const k = "risk:" + ip;
    r.results[k] = observation(k, k, { data: { requestedIp: ip, score: 80 } });
  }
  const out = prepareExport(r, true);
  assert.equal(riskResult(out, "2001:db8:••••"), undefined);
  assert.equal(riskResult(r, "2001:db8::1").data.score, 80);
});
test("分项导出按模块筛选并保留原采集时间和附加系统", () => {
  const r = makeRecord("test", "模块");
  r.system = system;
  for (const k of ["dns-leak:extended", "webrtc:collect", "link:google"])
    r.results[k] = observation(k, k);
  const out = prepareExport(r, false, ["dns"]);
  assert.deepEqual(Object.keys(out.results), ["dns-leak:extended"]);
  assert.equal(out.createdAt, r.createdAt);
  assert.deepEqual(out.system, r.system);
  assert.equal(resultModule("webrtc:collect"), "webrtc");
});
test("错误结论快照、检测键和时间拒绝导入", () => {
  const r = makeRecord("test", "校验");
  r.results.x = observation("x", "测试");
  assert.throws(() =>
    validateRecord({ ...r, assessmentSnapshot: { rows: null } }),
  );
  assert.throws(() => validateRecord({ ...r, results: { bad: r.results.x } }));
  assert.throws(() => validateRecord({ ...r, updatedAt: "bad" }));
});
test("英国模板、不限浏览器与显式 IPv6 禁用", () => {
  const r = makeRecord("test", "参考");
  r.results.environment = observation("environment", "环境", {
    data: { browserName: "Chrome" },
  });
  r.results["egress:ipv6"] = observation("egress:ipv6", "IPv6", {
    data: { disabled: true },
  });
  const a = assessReference(r, {
    ...REFERENCE_PRESETS.GB,
    browser: "any",
    ipv4Only: true,
  });
  assert(!a.rows.some((x) => x.name === "浏览器"));
  assert.equal(a.rows.find((x) => x.name === "公网 IPv6").state, "match");
  assert.equal(REFERENCE_PRESETS.GB.windowsZone, "GMT Standard Time");
  assert.equal(validateProxy({ mode: "socks5", port: 7890 }).mode, "socks5");
  assert.throws(() => validateProxy({ mode: "socks5", port: 99999 }));
});
test("完整目标目录与原创 SVG 编码", () => {
  assert.equal(EDGE_TARGETS.length, 8);
  assert.equal(STATUS_SOURCES.length, 31);
  assert(Object.values(TARGETS).filter((x) => x.split).length >= 38);
  assert.equal(Object.keys(CARD_THEMES).length, 22);
  const svg = cardSVG({
    ip: "1.2.3.4",
    width: 240,
    badge: '<script>"&',
    masked: true,
    motion: true,
  });
  assert(svg.includes('width="240"'));
  assert(!svg.includes("<script>"));
  assert(!svg.includes("1.2.3.4"));
  assert(svg.includes("<animate"));
});
test("脱敏同时覆盖链接中的编码 IPv6", () => {
  const original =
    "https://example.com/ip/2001%3Adb8%3A1234%3A5678%3Aabcd%3A5678%3A9012%3A3456";
  const masked = redact(original);
  assert(!decodeURIComponent(masked).includes("abcd"));
  assert(decodeURIComponent(masked).includes("••••"));
});
test("完整 IP 规范化并拒绝截断与歧义输入", () => {
  assert.equal(canonicalIP("2001:0DB8:0:0:0:0:0:1"), "2001:db8::1");
  assert(sameIP("2001:db8::1", "2001:0db8::0001"));
  for (const s of [
    "1.1.1.01",
    "999.1.1.1",
    " 1.1.1.1",
    "2001:db8:...",
    "fe80::1%eth0",
    "[::1]",
    "example.com",
  ])
    assert.equal(canonicalIP(s), null);
  assert(!sameIP("2001:db8::1", "2001:db8::2"));
});
test("评分及风险标签必须属于完整查询 IP", () => {
  const mismatched = normalizeIntelligence(
    "1.1.1.1",
    { ip: "1.1.1.2", trust_score: 99, is_vpn: false },
    "provider",
  );
  assert.equal(mismatched.score, null);
  assert.equal(mismatched.vpn, null);
  assert.equal(mismatched.match, false);
  const missing = normalizeIntelligence(
    "1.1.1.1",
    { trust_score: 90, is_vpn: false },
    "provider",
  );
  assert.equal(missing.score, null);
  const valid = normalizeIntelligence(
    "1.1.1.1",
    { ip: "1.1.1.1", trust_score: 0, is_proxy: false },
    "provider",
  );
  assert.equal(valid.score, 0);
  assert.equal(valid.proxy, false);
  assert.equal(valid.vpn, null);
  const badScore = normalizeIntelligence(
    "1.1.1.1",
    { ip: "1.1.1.1", trust_score: "90" },
    "provider",
  );
  assert.equal(badScore.score, null);
});
const system = {
  schema: "network-desk/system-v1",
  collectedAt: "2026-10-31T10:00:00Z",
  os: { name: "Fixture OS" },
  timezone: { id: "Tokyo Standard Time" },
  region: {
    culture: "ja-JP",
    uiLanguage: "ja-JP",
    systemLocale: "ja-JP",
    geoId: 122,
  },
  network: { windowsProxy: { proxyServer: "127.0.0.1:7890" } },
};
test("系统报告版本与必需字段严格验证", () => {
  assert.equal(validateSystem(system).schema, system.schema);
  assert.throws(() => validateSystem({ ...system, schema: "unknown" }));
  assert.throws(() => validateSystem({ ...system, collectedAt: "bad" }));
  assert.throws(() => validateSystem({ ...system, network: null }));
  assert.equal(
    validateSystem({ ...system, schema: "google-environment-system/v1" })
      .schema,
    "google-environment-system/v1",
  );
});
test("配置分数不会把未知记为一致；不产生免验证结论", () => {
  const r = makeRecord("google", "Google");
  r.results.environment = observation("environment", "环境", {
    status: "ok",
    data: { timezone: "Asia/Tokyo", language: "ja-JP", browserName: "Edge" },
  });
  const a = assessReference(r, REFERENCE_PRESETS.JP);
  assert.equal(a.known, 3);
  assert.equal(a.percent, 100);
  assert(a.total > a.known);
  assert.match(a.phoneVerification, /无法预测/);
  r.system = system;
  const b = assessReference(r, REFERENCE_PRESETS.JP);
  assert.equal(b.known, 8);
  r.results["egress:ipv6"] = observation("egress:ipv6", "IPv6", {
    status: "error",
  });
  assert.equal(
    assessReference(r, REFERENCE_PRESETS.JP).rows.find(
      (x) => x.name === "公网 IPv6",
    ).state,
    "unknown",
  );
});
test("报告 HTML 转义上游内容且保留系统数据和未知项", () => {
  const r = makeRecord("test", "<script>alert(1)</script>");
  r.system = system;
  r.results.test = observation("test", "<img src=x onerror=alert(1)>", {
    status: "unknown",
    summary: "1.2.3.4 未知",
    data: { ip: "2001:db8::5", bad: "</pre><script>bad</script>" },
  });
  const html = reportHTML(r);
  assert(!html.includes("<script>"));
  assert(html.includes("&lt;script&gt;"));
  assert(html.includes("系统报告"));
  assert(html.includes("无法确定"));
  const masked = reportHTML(r, true);
  assert(!masked.includes("1.2.3.4"));
  assert(!masked.includes("2001:db8::5"));
  assert(!masked.includes("127.0.0.1:7890"));
  assert.equal(validateRecord(r).id, r.id);
});
test("脱敏递归处理字段、URL、IPv4/IPv6与代理配置", () => {
  const x = redact({
    ip: "1.2.3.4",
    source: "https://example.com/ip/2001:db8::2",
    raw: ["10.0.0.1"],
    proxyServer: "secret",
  });
  assert.notEqual(x.ip, "1.2.3.4");
  assert(!x.source.includes("2001:db8::2"));
  assert.equal(x.proxyServer, "[已隐藏]");
});
test("公网目标与代理端口边界", () => {
  for (const v of ["127.1", "0x7f000001", "2130706433"])
    assert.throws(() => validateTarget(v));
  for (const v of [
    "localhost",
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "::1",
    "http://example.com/a",
    "example.com:443",
    "evil.local",
    "-bad.com",
    "x.com/../../",
  ])
    assert.throws(() => validateTarget(v));
  assert.equal(validateTarget("Example.COM"), "example.com");
  assert.equal(validateTarget("AS13335", { asn: true }), "AS13335");
  assert(publicIP("1.1.1.1"));
  assert.throws(() => validateProxy({ mode: "local", port: 80 }));
  assert.throws(() => validateProxy({ mode: "remote" }));
  assert.equal(validateProxy({ mode: "local", port: 7890 }).port, 7890);
});
test("DNS 权威响应保留完整解析器而不是误报空列表", () => {
  assert.deepEqual(
    resolverAddresses({
      dns_servers: ["1.1.1.1", "1.1.1.1", "invalid", "2001:0db8::1"],
    }),
    ["1.1.1.1", "2001:db8::1"],
  );
  assert.deepEqual(resolverAddresses({ results: [{ ip: "8.8.8.8" }] }), [
    "8.8.8.8",
  ]);
  assert.deepEqual(resolverAddresses({ error: "no data" }), []);
});
test("Google 参考配置不误用其他目标的 IP 情报", () => {
  const r = makeRecord("google", "Google");
  r.results["risk:1.1.1.1"] = observation("risk:1.1.1.1", "other", {
    status: "ok",
    data: { match: true, countryCode: "JP" },
  });
  assert.equal(
    assessReference(r, REFERENCE_PRESETS.JP).rows[0].state,
    "unknown",
  );
  r.results["egress:ipv4"] = observation("egress:ipv4", "IPv4", {
    status: "ok",
    data: { ip: "8.8.8.8" },
  });
  r.results["risk:8.8.8.8"] = observation("risk:8.8.8.8", "target", {
    status: "ok",
    data: { match: true, countryCode: "US" },
  });
  assert.equal(assessReference(r, REFERENCE_PRESETS.JP).rows[0].actual, "US");
});
