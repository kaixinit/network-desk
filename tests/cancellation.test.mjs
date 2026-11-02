import test from "node:test";
import assert from "node:assert/strict";

test("stopping extended DNS does not start later rounds; a new scan still works", async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  globalThis.window = new EventTarget();
  try {
    const { dnsLeak, browserConnectivity } = await import("../src/checks.mjs");
    let requests = 0;
    globalThis.fetch = (_url, { signal }) => {
      requests++;
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    };
    const scan = dnsLeak("extended");
    window.dispatchEvent(new Event("network-desk:stop"));
    await assert.rejects(scan, { name: "AbortError" });
    assert.equal(requests, 1);
    const connectivity = browserConnectivity("https://example.com");
    window.dispatchEvent(new Event("network-desk:stop"));
    await assert.rejects(connectivity, { name: "AbortError" });
    globalThis.fetch = async () => new Response(null, { status: 200 });
    assert.equal((await browserConnectivity("https://example.com")).httpStatus, 200);
  } finally {
    globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
  }
});
