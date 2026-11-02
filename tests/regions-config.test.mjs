import test from "node:test";
import assert from "node:assert/strict";
import { createRegionLookup, parseRegionPage } from "../server/regions.mjs";
import { captchaConfiguration } from "../shared/diagnostic-guidance.mjs";

const names = new Intl.DisplayNames(["en"], { type: "region" });
const countries =
  "AL JP US GB FR DE IT CA AU NZ IE ES PT BE NL AT CH SE NO DK FI IS PL CZ HU RO BG GR CY MT HR SI SK EE LV LT LU LI AD MC SM VA BR AR CL PE CO EC MX CR PA UY PY BO IN ID SG MY TH VN PH KR TW"
    .split(" ")
    .map((c) => names.of(c));
const list =
  "<ul>" +
  countries.map((c) => `<li class="country"><p>${c}</p></li>`).join("") +
  "</ul>";
const reply = (body) => ({
  status: 200,
  body,
  url: "https://www.anthropic.com/legal/supported-regions",
  checkedAt: "2026-11-01T14:00:00.000Z",
});

test("region 403 preserves source, country, HTTP status and challenge reason", async () => {
  const lookup = createRegionLookup({
    transport: async () => ({
      status: 403,
      body: "<script>window._cf_chl_opt={}</script>",
      url: "https://help.openai.com/en/articles/7947663-chatgpt-supported-countries",
      checkedAt: "2026-11-01T14:00:00Z",
    }),
  });
  const r = await lookup("gpt", "US");
  assert.equal(r.status, "error");
  assert.equal(r.httpStatus, 403);
  assert.equal(r.country, "US");
  assert.equal(r.challenge, true);
  assert.equal(r.applicable, null);
  assert.match(r.source, /help.openai.com/);
  assert.match(r.action, /无需 API 密钥/);
});
test("future region policy stays unknown and retains the effective date", async () => {
  const lookup = createRegionLookup({
    now: () => Date.parse("2026-11-01"),
    transport: async () =>
      reply(
        '<p>Effective</p><time dateTime="2026-11-12T20:20:00Z">Nov 12, 2026</time>' +
          list,
      ),
  });
  const r = await lookup("claude", "JP");
  assert.equal(r.listed, true);
  assert.equal(r.applicable, null);
  assert.equal(r.status, "unknown");
  assert.equal(r.effectiveAt, "2026-11-12T20:20:00Z");
});
test("footer dates and script lists do not masquerade as current region evidence", () => {
  const r = parseRegionPage(
    "<script>" +
      list +
      "</script>" +
      list +
      '<footer>Effective <time dateTime="2099-01-01">Jan 1, 2099</time></footer>',
  );
  assert.equal(r.effectiveDate, null);
  assert.equal(r.items.length, countries.length);
  assert.throws(
    () => parseRegionPage("<script>" + list + "</script><p>challenge</p>"),
    /结构改变/,
  );
});
test("live country membership, not-listed and refresh use the same official evidence", async () => {
  let calls = 0;
  const lookup = createRegionLookup({
    transport: async () => {
      calls++;
      return reply(list);
    },
  });
  assert.equal((await lookup("claude", "JP")).applicable, true);
  assert.equal((await lookup("claude", "CN")).applicable, false);
  assert.equal(calls, 1);
  await lookup("claude", "JP", { refresh: true });
  assert.equal(calls, 2);
});
test("transport failure and changed HTML remain traceable errors, not unsupported regions", async () => {
  for (const transport of [
    async () => {
      throw Error("timeout");
    },
    async (url) => ({ ...reply("<p>new layout</p>"), url }),
  ]) {
    const r = await createRegionLookup({ transport })("gpt", "GB");
    assert.equal(r.status, "error");
    assert.equal(r.applicable, null);
    assert.match(r.source, /openai/);
    assert.equal(r.country, "GB");
  }
});
test("region retries respect application request options without shared proxy changes", async () => {
  let options;
  const lookup = createRegionLookup({
    transport: async (_url, o) => {
      options = o;
      return reply(list);
    },
  });
  await lookup("gpt", "US", { mode: "socks5", port: 7897 });
  assert.deepEqual(options.proxy, { mode: "socks5", port: 7897 });
  await assert.rejects(
    () => lookup("gpt", "US", { mode: "invalid" }),
    /代理方式/,
  );
});
test("captcha config reports only missing names and public site key, never a secret", () => {
  assert.deepEqual(
    captchaConfiguration({ turnstileSiteKey: "public" }, "managed"),
    {
      siteKey: "public",
      configured: false,
      missingFields: ["turnstileSecret"],
    },
  );
  const config = {
    recaptchaSiteKey: "public",
    recaptchaSecret: "PRIVATE-SECRET",
  };
  const out = captchaConfiguration(config, "recaptcha");
  assert.equal(out.configured, true);
  assert.equal(JSON.stringify(out).includes("PRIVATE-SECRET"), false);
  assert.equal(
    captchaConfiguration({}, "noninteractive").missingFields.length,
    2,
  );
});
