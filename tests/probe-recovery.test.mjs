import test from "node:test";
import assert from "node:assert/strict";
import { probe } from "../server/providers.mjs";
import { transportError } from "../server/transport-error.mjs";
import { lookupEvidence } from "../server/probe-evidence.mjs";
import { createRegionLookup } from "../server/regions.mjs";
import { regionReference } from "../shared/region-reference.mjs";
import { countryMembership } from "../shared/region-names.mjs";
import { conclusionSummary } from "../shared/investigation.mjs";
import {
  makeRecord,
  observation,
  prepareExport,
  validateRecord,
} from "../shared/model.mjs";
import { deliveryArchive } from "../shared/delivery.mjs";
import { unzipSync, strFromU8 } from "fflate";

const fail = () => transportError(28, { connectMs: 0, elapsedMs: 7000 });
test("official country spelling variants and subregion exceptions are preserved", () => {
  for (const [code, name] of [
    ["CI", "Côte d'Ivoire"],
    ["AX", "Aland Islands"],
    ["VA", "Holy See (Vatican City)"],
    ["TR", "Turkey"],
    ["MM", "Myanmar"],
  ])
    assert.equal(countryMembership([name], code).listed, true);
  assert.deepEqual(
    countryMembership(["Ukraine (with certain exceptions)"], "UA"),
    { listed: true, restricted: true },
  );
  assert.equal(
    regionReference("gpt", "UA", Date.parse("2026-11-03")).restricted,
    true,
  );
});
test("failed HEAD is retried once as GET using the exact same request route", async () => {
  const methods = [];
  const r = await probe(
    { target: "taobao", mode: "socks5", port: 12345 },
    async (url, options) => {
      assert.equal(url, "https://www.taobao.com/");
      assert.deepEqual(options.proxy, { mode: "socks5", port: 12345 });
      methods.push(options.method);
      if (methods.length === 1) throw fail();
      return {
        status: 200,
        body: "",
        elapsedMs: 50,
        checkedAt: "2026-11-03T00:00:00Z",
      };
    },
  );
  assert.deepEqual(methods, ["HEAD", "GET"]);
  assert.equal(r.httpStatus, 200);
  assert.equal(r.recovered, true);
  assert.equal(r.attempts[0].failureKind, "connect-timeout");
  assert.equal(r.attempts[1].httpStatus, 200);
});
test("exhausted retry retains both failures and read-only synthetic DNS evidence", async () => {
  let calls = 0;
  const r = await probe(
    { target: "taobao" },
    async () => {
      calls++;
      throw fail();
    },
    async () => ({ addresses: ["198.18.0.1"], syntheticProxyAddress: true }),
  );
  assert.equal(calls, 2);
  assert.equal(r.httpStatus, null);
  assert.equal(r.attempts.length, 2);
  assert.equal(r.failureKind, "connect-timeout");
  assert.equal(r.dnsEvidence.syntheticProxyAddress, true);
  assert.match(r.action, /映射地址本身不代表故障/);
  const record = makeRecord("home", "Network");
  record.results["link:taobao"] = observation("link:taobao", "淘宝", {
    status: "error",
    summary: r.reason,
    data: r,
  });
  assert.match(conclusionSummary(record).findings[0].reason, /复测仍失败/);
  validateRecord(record);
});
test("abort and non-HTTP observation failures are not retried", async () => {
  for (const [target, error] of [
    ["taobao", new DOMException("Stopped", "AbortError")],
    ["claude", fail()],
  ]) {
    let calls = 0;
    await assert.rejects(() =>
      probe({ target }, async () => {
        calls++;
        throw error;
      }),
    );
    assert.equal(calls, 1);
  }
});
test("a disconnected client stops recovery even if its first transport returns a generic error", async () => {
  const controller = new AbortController();
  let calls = 0,
    dns = false;
  await assert.rejects(
    () =>
      probe(
        { target: "taobao", signal: controller.signal },
        async (_url, o) => {
          assert.equal(o.signal, controller.signal);
          calls++;
          controller.abort();
          throw fail();
        },
        async () => {
          dns = true;
        },
      ),
    { name: "AbortError" },
  );
  assert.equal(calls, 1);
  assert.equal(dns, false);
});
test("transport errors distinguish DNS, TLS and failure before connection", () => {
  assert.equal(transportError(6).failureKind, "dns");
  assert.equal(transportError(60).failureKind, "tls");
  assert.equal(
    transportError(28, { connectMs: 25, tlsMs: 50 }).failureKind,
    "response-timeout",
  );
  assert.equal(fail().failureKind, "connect-timeout");
});
test("DNS evidence detects synthetic addresses without treating them as public exit IPs", async () => {
  assert.equal(
    (
      await lookupEvidence("https://www.taobao.com/", async () => [
        { address: "198.19.1.1" },
      ])
    ).syntheticProxyAddress,
    true,
  );
  assert.equal(
    (
      await lookupEvidence("https://www.taobao.com/", async () => [
        { address: "192.0.2.1" },
      ])
    ).syntheticProxyAddress,
    false,
  );
  assert.equal(
    (
      await lookupEvidence("https://www.taobao.com/", async () => {
        throw Error("DNS denied");
      })
    ).syntheticProxyAddress,
    null,
  );
});
test("official references are dated, expire and never supply a live supported verdict", async () => {
  assert.equal(regionReference("gpt", "US", Date.parse("2026-11-01")), null);
  assert.equal(
    regionReference("gpt", "US", Date.parse("2026-11-03")).listed,
    true,
  );
  assert.equal(
    regionReference("gpt", "CN", Date.parse("2026-11-03")).listed,
    false,
  );
  const expired = regionReference("gpt", "US", Date.parse("2027-01-01"));
  assert.equal(expired.expired, true);
  assert.equal(expired.listed, null);
  const lookup = createRegionLookup({
    now: () => Date.parse("2026-11-03"),
    transport: async () => ({
      status: 403,
      body: "challenge-platform",
      checkedAt: "2026-11-03T00:00:00Z",
    }),
  });
  const data = await lookup("gpt", "US");
  assert.equal(data.status, "unknown");
  assert.equal(data.liveStatus, "error");
  assert.equal(data.applicable, null);
  assert.equal(data.httpStatus, 403);
  const record = makeRecord("gpt", "GPT");
  record.results["region:gpt"] = observation("region:gpt", "地区", {
    status: data.status,
    summary: data.reason,
    source: data.source,
    data,
  });
  const summary = conclusionSummary(record);
  assert.equal(summary.unknown, 1);
  assert.equal(summary.errors, 0);
  assert.equal(summary.obtained, 0);
  const output = prepareExport(record, true);
  validateRecord(output);
  const zip = unzipSync((await deliveryArchive(output, false)).bytes);
  const imported = validateRecord(JSON.parse(strFromU8(zip["report.json"])));
  assert.deepEqual(conclusionSummary(imported), conclusionSummary(output));
  assert.match(strFromU8(zip["report.html"]), /实时核验受限/);
});
