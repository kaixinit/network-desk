import test from "node:test";
import assert from "node:assert/strict";

test("stop or report replacement during region lookup cannot launch later scan phases", async () => {
  const previousWindow = globalThis.window;
  globalThis.window = new EventTarget();
  try {
    const { createChecks } = await import("../src/check-runner.mjs");
    for (const action of ["stop", "load", "new record"]) {
      const calls = [];
      let ready, finish;
      const regionStarted = new Promise((resolve) => {
        ready = resolve;
      });
      const regionResponse = new Promise((resolve) => {
        finish = resolve;
      });
      const d = {
        config: {
          targets: Object.fromEntries(
            ["domestic", "cloudflare", "claude", "anthropic"].map((name) => [
              name,
              { label: name, url: "https://example.com/" },
            ]),
          ),
        },
        proxy: { mode: "system" },
        generation: { current: 0 },
        recordRef: { current: { results: {} } },
        setImported() {},
        patchRecord() {},
        setSelected() {},
        put() {},
        save() {
          calls.push("save");
        },
        async task(key) {
          calls.push(key);
          if (key.startsWith("egress:"))
            return { key, data: { ip: "1.1.1.1" } };
          if (key.startsWith("risk:"))
            d.recordRef.current.results[key] = { data: { countryCode: "US" } };
          if (key.startsWith("region:")) {
            ready();
            await regionResponse;
          }
          return { key, data: {} };
        },
      };
      const scan = createChecks(d).scan("claude");
      await regionStarted;
      d.generation.current++;
      d.recordRef.current = { results: {} };
      finish();
      await scan;
      assert.deepEqual(
        calls.filter((key) => /^(link:|webrtc:|dns-leak:|save$)/.test(key)),
        [],
        action,
      );
    }
  } finally {
    globalThis.window = previousWindow;
  }
});
