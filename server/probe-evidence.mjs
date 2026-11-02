import { lookup } from "node:dns/promises";

// Bounded, read-only DNS evidence. A synthetic proxy address alone is not a fault.
export async function lookupEvidence(url, resolver = lookup) {
  let timer;
  try {
    const records = await Promise.race([
      resolver(new URL(url).hostname, { all: true }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error("DNS evidence timeout")), 2500);
      }),
    ]);
    const addresses = records.map((x) => x.address);
    return {
      addresses,
      syntheticProxyAddress: addresses.some((ip) => /^198\.(18|19)\./.test(ip)),
      checkedAt: new Date().toISOString(),
      source: "本机系统域名解析（只读）",
    };
  } catch {
    return {
      addresses: [],
      syntheticProxyAddress: null,
      source: "本机系统域名解析（未取得补充证据）",
    };
  } finally {
    clearTimeout(timer);
  }
}
