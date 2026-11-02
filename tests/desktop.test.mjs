import test from "node:test";
import assert from "node:assert/strict";
import {
  localPage,
  safeExternal,
  safeDownloadName,
  safePreference,
  trustedFrame,
} from "../desktop/policy.mjs";
import {
  makeRecord,
  observation,
  prepareExport,
  reportHTML,
  validateRecord,
} from "../shared/model.mjs";

test("desktop browser handoff cannot launch a foreign URL, credentials or API", () => {
  const origin = "http://127.0.0.1:41235";
  assert.equal(
    localPage("/claude/?ip=1.1.1.1", origin),
    origin + "/claude/?ip=1.1.1.1",
  );
  for (const input of [
    "https://example.com",
    "//example.com",
    "file:///C:/Windows",
    "javascript:alert(1)",
    "/api/health",
    "http://u:p@127.0.0.1:41235/",
  ])
    assert.throws(() => localPage(input, origin));
});
test("desktop privileged bridge checks both sender and top frame", () => {
  const mainFrame = { url: "http://127.0.0.1:41235/claude/" };
  const contents = { mainFrame };
  assert.equal(
    trustedFrame(
      { sender: contents, senderFrame: mainFrame },
      "http://127.0.0.1:41235",
      contents,
    ),
    true,
  );
  assert.equal(
    trustedFrame(
      { sender: contents, senderFrame: { url: mainFrame.url } },
      "http://127.0.0.1:41235",
      contents,
    ),
    false,
  );
  assert.equal(
    trustedFrame(
      { sender: {}, senderFrame: mainFrame },
      "http://127.0.0.1:41235",
      contents,
    ),
    false,
  );
});
test("desktop preference and external URL boundaries", () => {
  assert.equal(safePreference("network-desk/theme", "dark").value, "dark");
  assert.throws(() => safePreference("../../config", "x"));
  assert.throws(() => safePreference("network-desk/theme", {}));
  assert.equal(
    safeExternal("https://example.com/help"),
    "https://example.com/help",
  );
  for (const input of [
    "file:///C:/Windows",
    "ms-settings:network-proxy",
    "http://example.com",
    "https://u:p@example.com",
  ])
    assert.equal(safeExternal(input), null);
  assert.equal(safeDownloadName("a<b>.html"), "a_b_.html");
});
test("desktop provenance survives report import and masked exports", () => {
  const r = makeRecord("home", "桌面检测");
  r.client = "Network Desk 桌面内嵌环境";
  r.results.environment = observation("environment", "设备", {
    status: "ok",
    summary: "已取得",
    execution: "desktop-renderer",
    data: { browserName: "本软件内嵌 Chromium" },
  });
  const exported = prepareExport(r, true);
  assert.equal(validateRecord(exported).client, r.client);
  assert.match(reportHTML(exported, true), /桌面内嵌环境/);
  assert.match(reportHTML(exported, true), /本软件内嵌 Chromium/);
});
