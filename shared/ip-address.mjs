export function canonicalIP(input) {
  if (
    typeof input !== "string" ||
    input.length > 64 ||
    input !== input.trim() ||
    /[%\[\]\s]/.test(input)
  )
    return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(input)) {
    const parts = input.split(".");
    return parts.every((p) => /^(0|[1-9]\d{0,2})$/.test(p) && +p <= 255)
      ? parts.join(".")
      : null;
  }
  if (!input.includes(":") || !/^[0-9a-f:.]+$/i.test(input)) return null;
  try {
    return new URL(`http://[${input}]/`).hostname.slice(1, -1).toLowerCase();
  } catch {
    return null;
  }
}
export const sameIP = (a, b) =>
  Boolean(canonicalIP(a) && canonicalIP(a) === canonicalIP(b));
