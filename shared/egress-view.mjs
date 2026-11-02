import { canonicalIP } from "./model.mjs";

export function egressView(result, redacted = false) {
  const ip = canonicalIP(result?.data?.ip);
  const masked =
    !ip &&
    redacted &&
    typeof result?.data?.ip === "string" &&
    result.data.ip.includes("•");
  if (result?.status === "running")
    return { ip, label: "检测中", tone: "neutral" };
  if (result?.status === "error")
    return { ip, label: "检测失败", tone: "error" };
  if (masked) return { ip: null, label: "已脱敏 · 需重测", tone: "neutral" };
  if (result?.status === "ok" && ip)
    return { ip, label: "已取得", tone: "good" };
  return {
    ip,
    label: ip ? "待确认" : result ? "未取得 IP" : "待检测",
    tone: "warn",
  };
}
