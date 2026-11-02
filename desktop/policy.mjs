import path from "node:path";

export const preferenceKeys = new Set([
  "network-desk/history/v1",
  "network-desk/save-history/v1",
  "network-desk/request-proxy/v1",
  "network-desk/theme",
]);
export function safePreference(key, value) {
  if (!preferenceKeys.has(key)) throw new Error("不支持的设置项");
  if (
    value !== null &&
    (typeof value !== "string" || value.length > 20_000_000)
  )
    throw new Error("设置内容无效或过大");
  return { key, value };
}
export function localPage(value, origin) {
  if (typeof value !== "string" || value.length > 4096)
    throw new Error("页面地址无效");
  const url = new URL(value, origin);
  if (
    url.origin !== origin ||
    url.username ||
    url.password ||
    url.pathname.startsWith("/api/")
  )
    throw new Error("只能打开本软件的检测页面");
  return url.href;
}
export function safeExternal(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function safeDownloadName(value) {
  const name = path
    .basename(String(value || "report.html"))
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
  return name.slice(0, 160) || "report.html";
}
export function trustedFrame(event, origin, contents) {
  return Boolean(
    event.sender === contents &&
      event.senderFrame === contents.mainFrame &&
      event.senderFrame?.url &&
      new URL(event.senderFrame.url).origin === origin,
  );
}
