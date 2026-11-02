import test from "node:test";
import assert from "node:assert/strict";
import { probe } from "../server/providers.mjs";

test("连通性探测兼容拒绝 HEAD 的 IP/Trace 端点，并记录所用代理", async () => {
  for (const target of ["ipv4", "ipv6", "cloudflare", "claude", "chatgpt"]) {
    const result = await probe(
      { target, connectivity: "true", mode: "socks5", port: "7897" },
      async (_url, options) => {
        assert.deepEqual(options.proxy, { mode: "socks5", port: 7897 });
        if (options.method === "HEAD") throw new Error("upstream rejects HEAD");
        return {
          status: 200,
          body:
            target === "ipv4"
              ? '{"ip":"1.1.1.1"}'
              : target === "ipv6"
                ? '{"ip":"2606:4700:4700::1111"}'
                : "ip=1.1.1.1\ncolo=NRT\n",
          elapsedMs: 30,
          checkedAt: new Date().toISOString(),
        };
      },
    );
    assert.equal(result.httpStatus, 200);
    assert.ok(result.ip);
    assert.equal(result.method, "GET");
    assert.equal(result.proxyEndpoint, "socks5h://127.0.0.1:7897");
  }
});

test("网站拒绝 HEAD 后用 GET 复核，并保留拒绝响应与复核失败", async () => {
  for (const rejectedStatus of [403, 404, 405, 501]) {
    for (const failGet of [false, true]) {
      const result = await probe(
        { target: "wechat", mode: "socks5", port: "7897" },
        async (_url, { method }) => {
          if (failGet && method === "GET") throw new Error("GET timeout");
          return {
            status: method === "HEAD" ? rejectedStatus : 200,
            body: "",
            elapsedMs: 10,
            checkedAt: new Date().toISOString(),
          };
        },
      );
      assert.equal(result.httpStatus, failGet ? rejectedStatus : 200);
      assert.equal(result.attempts[0].httpStatus, rejectedStatus);
      assert.equal(result.attempts[1].method, "GET");
      if (failGet) assert.equal(result.attempts[1].error, "GET timeout");
      else assert.equal(result.attempts[1].httpStatus, 200);
    }
  }
});
