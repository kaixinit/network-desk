import test from "node:test";
import assert from "node:assert/strict";

test("stop also cancels a response body after HTTP headers have arrived", async () => {
  const previousWindow = globalThis.window,
    previousFetch = globalThis.fetch;
  globalThis.window = new EventTarget();
  let finishBody, bodyStarted, signal;
  const ready = new Promise((resolve) => {
    bodyStarted = resolve;
  });
  const body = new Promise((resolve) => {
    finishBody = resolve;
  });
  let request;
  try {
    const { api } = await import("../src/checks.mjs");
    globalThis.fetch = async (_url, options) => {
      signal = options.signal;
      return {
        ok: true,
        json: async () => {
          bodyStarted();
          await body;
          signal.throwIfAborted();
          return {};
        },
      };
    };
    request = api("config").catch((error) => error);
    await ready;
    window.dispatchEvent(new Event("network-desk:stop"));
    assert.equal(signal.aborted, true);
    finishBody();
    assert.equal((await request).name, "AbortError");
  } finally {
    finishBody?.();
    await request;
    globalThis.window = previousWindow;
    globalThis.fetch = previousFetch;
  }
});
