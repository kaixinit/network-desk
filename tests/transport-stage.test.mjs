import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { once } from "node:events";
import { request } from "../server/net.mjs";
import {
  createTransportTrace,
  transportError,
} from "../server/transport-error.mjs";
import { probe } from "../server/providers.mjs";
import {
  makeRecord,
  observation,
  validateRecord,
  prepareExport,
} from "../shared/model.mjs";
import { conclusionSummary } from "../shared/investigation.mjs";
import { deliveryArchive } from "../shared/delivery.mjs";
import { unzipSync, strFromU8 } from "fflate";

test("zero curl time_connect cannot override successful CONNECT or SOCKS evidence", () => {
  for (const metrics of [
    { httpConnectStatus: 200, connectMs: 0, tlsMs: 0 },
    { proxyTunnelEstablished: true, connectMs: 0, tlsMs: 0 },
    { tlsStarted: true, connectMs: 0, tlsMs: 0 },
    { connectMs: 20, tlsMs: 0 },
  ])
    assert.equal(transportError(28, metrics).failureKind, "tls-timeout");
  assert.equal(
    transportError(28, { tlsMs: 50 }).failureKind,
    "response-timeout",
  );
  assert.equal(
    transportError(56, { httpConnectStatus: 407 }).failureKind,
    "proxy-tunnel",
  );
  assert.equal(transportError(5).failureKind, "proxy-dns");
  assert.doesNotMatch(
    transportError(28, { connectMs: 0 }).message,
    /TCP 连接未建立/,
  );
});

test("verbose phase extraction survives fragmented input without retaining headers or secrets", () => {
  const trace = createTransportTrace();
  const input =
    "* CONNECT tunnel established, response 200\r\n" +
    "> Proxy-Authorization: Basic PRIVATE\r\n< Set-Cookie: PRIVATE\r\n" +
    "* ALPN: curl offers http/1.1\r\n" +
    "x".repeat(20000) +
    "\n";
  for (const ch of input) trace.push(ch);
  assert.deepEqual(trace.snapshot(), {
    proxyTunnelEstablished: true,
    tlsStarted: true,
  });
  assert.doesNotMatch(
    JSON.stringify(trace.snapshot()),
    /PRIVATE|Cookie|Authorization/,
  );
  const socks = createTransportTrace();
  socks.push("* SOCKS5 request granted.\n");
  assert.equal(socks.snapshot().proxyTunnelEstablished, true);
});

test("real curl reports TLS timeout after a local proxy grants CONNECT", async (t) => {
  const sockets = new Set();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    let answered = false;
    socket.on("data", () => {
      if (!answered) {
        answered = true;
        socket.write("HTTP/1.1 200 Connection established\r\n\r\n");
      }
      // Deliberately leave TLS unanswered. No external connection is created.
    });
    socket.on("error", () => {});
    socket.on("close", () => sockets.delete(socket));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    for (const socket of sockets) socket.destroy();
    server.close();
  });
  await assert.rejects(
    () =>
      request("https://example.com/", {
        timeout: 1000,
        proxy: { mode: "local", port: server.address().port },
      }),
    (error) => {
      assert.equal(error.failureKind, "tls-timeout");
      assert.equal(error.transportDetails.httpConnectStatus, 200);
      assert.match(error.message, /代理隧道已建立/);
      return true;
    },
  );
});

test("TLS-stage evidence survives retry, summary and delivery ZIP import", async () => {
  const result = await probe(
    { target: "taobao", mode: "local", port: 12345 },
    async () => {
      throw transportError(28, {
        httpConnectStatus: 200,
        connectMs: 0,
        tlsMs: 0,
      });
    },
    async () => ({ addresses: ["198.18.0.1"], syntheticProxyAddress: true }),
  );
  assert.match(result.action, /不要关闭证书校验/);
  const record = makeRecord("home", "Network");
  record.results["link:taobao"] = observation("link:taobao", "淘宝", {
    status: "error",
    summary: result.reason,
    data: result,
  });
  assert.equal(
    conclusionSummary(record).findings[0].reason,
    "TLS 握手超时（复测仍失败）",
  );
  const exported = prepareExport(record, true);
  const zip = unzipSync((await deliveryArchive(exported, false)).bytes);
  const imported = validateRecord(JSON.parse(strFromU8(zip["report.json"])));
  assert.deepEqual(conclusionSummary(imported), conclusionSummary(exported));
  assert.equal(
    imported.results["link:taobao"].data.attempts[1].transportDetails
      .httpConnectStatus,
    200,
  );
  assert.match(strFromU8(zip["report.html"]), /TLS 握手超时/);
});
