import { canonicalIP, sameIP } from "./ip-address.mjs";

// STUN and HTTP exits must use the same address family before comparing addresses.
export function compareWebRTC(candidates, expectedIP) {
  const expected = canonicalIP(expectedIP);
  const publicAddresses = [
    ...new Set(
      (candidates || [])
        .filter(
          (c) =>
            c.type === "srflx" &&
            (!c.protocol || c.protocol.toLowerCase() === "udp"),
        )
        .map((c) => canonicalIP(c.address))
        .filter(Boolean),
    ),
  ];
  const expectedFamily = expected ? (expected.includes(":") ? 6 : 4) : null;
  const comparable = publicAddresses.filter(
    (ip) => (ip.includes(":") ? 6 : 4) === expectedFamily,
  );
  const different = comparable.some((ip) => !sameIP(ip, expected));
  const comparison = !publicAddresses.length
    ? "no-candidates"
    : !expected
      ? "no-reference"
      : !comparable.length
        ? "family-mismatch"
        : different
          ? "different"
          : "match";
  return {
    comparisonVersion: 2,
    comparison,
    expectedFamily,
    comparableCount: comparable.length,
    excludedFamilyCount: publicAddresses.length - comparable.length,
    state: ["match", "different"].includes(comparison) ? comparison : "unknown",
    reason:
      comparison === "no-candidates"
        ? "未取得可比较的公网 UDP ICE 地址，不能据此认定没有泄露"
        : comparison === "no-reference"
          ? "尚无完整目标出口可对照"
          : comparison === "family-mismatch"
            ? `UDP 候选与参考出口的 IP 协议版本不同（参考 IPv${expectedFamily}），无法直接比较；请取得同协议出口后复测`
            : different
              ? "同协议 UDP 地址与所选出口不同；请结合分流规则核对，不能单独判定泄露"
              : "本次同协议 UDP 地址与所选出口一致；其他协议及未观测流量不在此结论内",
  };
}

// Re-evaluate historical full evidence without changing its collection time or losing its old conclusion.
export function normalizeWebRTCObservation(item) {
  if (
    !/^webrtc(?:$|:)/.test(item.key) ||
    !["ok", "unknown"].includes(item.status) ||
    !Array.isArray(item.data?.candidates) ||
    !canonicalIP(item.data?.expectedIP)
  )
    return item;
  // A redacted candidate is not negative evidence; preserve the original derived result.
  if (
    item.data.candidates.some(
      (c) => c.type === "srflx" && !canonicalIP(c.address),
    )
  )
    return item;
  const comparison = compareWebRTC(item.data.candidates, item.data.expectedIP);
  const previous =
    item.data.comparisonVersion === 2
      ? {}
      : {
          previousComparison: {
            state: item.data.state ?? null,
            reason: item.summary,
            status: item.status,
          },
        };
  return {
    ...item,
    status: comparison.state === "unknown" ? "unknown" : "ok",
    summary: comparison.reason,
    data: { ...item.data, ...previous, ...comparison },
  };
}
