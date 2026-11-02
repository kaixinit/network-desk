// Consume curl's local diagnostics, retaining only phase flags. Never retain
// verbose headers, cookies, credentials, URLs or certificate text in reports.
export function createTransportTrace() {
  const flags = {};
  let line = "";
  const inspect = () => {
    if (!line.startsWith("* ")) return;
    if (/^\* (?:Connected to|Established connection to) /.test(line))
      flags.tcpConnected = true;
    if (/^\* (?:CONNECT tunnel established|SOCKS5 request granted)/.test(line))
      flags.proxyTunnelEstablished = true;
    if (
      /^\* (?:schannel: disabled automatic use of client certificate|ALPN: curl offers|TLSv[^ ]* \(OUT\), TLS handshake, Client hello)/.test(
        line,
      )
    )
      flags.tlsStarted = true;
    if (
      /^\* (?:SSL connection using|schannel: SSL\/TLS connection with)/.test(
        line,
      )
    )
      flags.tlsCompleted = true;
  };
  return {
    push(chunk) {
      for (const ch of String(chunk)) {
        if (ch === "\n") {
          inspect();
          line = "";
        } else if (line.length < 256) line += ch;
      }
    },
    snapshot() {
      inspect();
      return { ...flags };
    },
  };
}

export function transportError(code, metrics = {}) {
  const tunnel =
    metrics.proxyTunnelEstablished || metrics.httpConnectStatus === 200;
  const tlsComplete = metrics.tlsCompleted || metrics.tlsMs > 0;
  const tlsPending =
    !tlsComplete &&
    (tunnel ||
      metrics.tlsStarted ||
      metrics.tcpConnected ||
      metrics.connectMs > 0);
  const kind =
    metrics.httpConnectStatus >= 400
      ? "proxy-tunnel"
      : code === 28
        ? tlsComplete
          ? "response-timeout"
          : tlsPending
            ? "tls-timeout"
            : "connect-timeout"
        : code === 5
          ? "proxy-dns"
          : code === 6
            ? "dns"
            : code === 7
              ? "connect"
              : [35, 60].includes(code)
                ? "tls"
                : code === 52
                  ? "empty-response"
                  : code === 56
                    ? "connection-reset"
                    : "transport";
  const description = {
    "connect-timeout":
      "连接阶段超时，现有证据不足以区分 DNS、TCP、代理或 TLS 阶段",
    "tls-timeout": tunnel
      ? "代理隧道已建立，等待 TLS 握手超时"
      : "等待 TLS 握手超时",
    "response-timeout": "TLS 已建立，但 HTTP 响应或传输超时",
    "proxy-tunnel": `代理拒绝建立隧道（CONNECT HTTP ${metrics.httpConnectStatus}）`,
    "proxy-dns": "代理服务器域名解析失败",
    dns: "DNS 解析失败",
    connect: "无法连接目标或指定代理",
    tls: tunnel
      ? "代理隧道已建立，但 TLS 握手或证书校验失败"
      : "TLS 握手或证书校验失败",
    "empty-response": "目标未返回 HTTP 响应",
    "connection-reset": "连接被中断",
    transport: "请求传输失败",
  }[kind];
  return Object.assign(
    new Error(`${description}（curl ${code ?? "terminated"}）`),
    {
      failureKind: kind,
      transportDetails: { curlCode: code, ...metrics },
    },
  );
}
