import { maskIP, escapeHTML } from "./model.mjs";
export const CARD_THEMES = Object.fromEntries(
  [
    ["light", "简洁白", "#ffffff", "#182436", "#e2e9f1"],
    ["dark", "深色墨蓝", "#182334", "#f8fafc", "#39516d"],
    ["blue", "浅蓝信息", "#edf5ff", "#163355", "#c6ddfa"],
    ["mint", "薄荷纸", "#eaf7ef", "#214c3a", "#a8d7be"],
    ["sand", "沙色注记", "#fbf2dc", "#604726", "#e4c895"],
    ["rose", "玫瑰笺", "#fff0f1", "#73414b", "#efc0ca"],
    ["lavender", "淡紫档案", "#f1eefe", "#514478", "#c8bbec"],
    ["slate", "石板灰", "#edf0f3", "#374351", "#bac5d0"],
    ["sea", "青海线", "#e8f8fa", "#1c5159", "#9fd8dd"],
    ["peach", "杏色便签", "#fff0e3", "#71472b", "#efc3a4"],
    ["lime", "青柠页", "#f2f7df", "#47562b", "#cad99c"],
    ["berry", "莓色记录", "#fbeafa", "#713563", "#ddafd4"],
    ["navy", "午夜航线", "#101f39", "#e8effb", "#345b8c"],
    ["forest", "深林", "#123a30", "#e1f8e9", "#3d7864"],
    ["copper", "铜色夜", "#3c2821", "#ffecda", "#916347"],
    ["plum", "紫夜", "#312244", "#f2e9ff", "#775a95"],
    ["graphite", "石墨", "#23272e", "#f0f2f5", "#576575"],
    ["ocean", "海潮", "#123a4a", "#e4faff", "#377d95"],
    ["wine", "酒红档案", "#44242f", "#ffeaf1", "#935267"],
    ["olive", "橄榄墨", "#353a23", "#f1f5dd", "#798253"],
    ["indigo", "靛蓝", "#232d58", "#eef1ff", "#5d72b0"],
    ["teal", "孔雀蓝", "#123d40", "#e9ffff", "#428388"],
  ].map(([id, name, bg, fg, accent]) => [id, { name, bg, fg, accent }]),
);
export function cardLines({ ip, details, masked }) {
  return [
    "NETWORK DESK  /  网络诊断台",
    masked ? maskIP(ip) : ip || "等待 IP 信息",
    [details?.country, details?.city].filter(Boolean).join(" · ") ||
      "地理位置未提供",
    details?.organization || "运营商未提供",
    details?.asn
      ? "AS" + String(details.asn).replace(/^AS/i, "")
      : "ASN 未提供",
  ];
}
export function cardSVG(options) {
  const { width = 640, style = "light", badge = "", motion = false } = options,
    h = Math.round(width * 0.53),
    p = width * 0.065,
    t = CARD_THEMES[style] || CARD_THEMES.light,
    lines = cardLines(options),
    ys = [p + 8, h * 0.43, h * 0.62, h * 0.75, h * 0.88],
    sizes = [0.026, lines[1].length > 24 ? 0.043 : 0.062, 0.032, 0.026, 0.026];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}" role="img" aria-label="Network Desk IP card"><rect width="100%" height="100%" rx="10" fill="${t.bg}"/><path d="M${width * 0.78} 0L${width} ${h * 0.4}V${h}L${width * 0.65} 0" fill="${t.accent}" opacity=".22">${motion ? '<animate attributeName="opacity" values=".12;.32;.12" dur="6s" repeatCount="indefinite"/>' : ""}</path><rect x=".5" y=".5" width="${width - 1}" height="${h - 1}" rx="10" fill="none" stroke="${t.accent}"/>${lines.map((l, i) => `<text x="${p}" y="${ys[i]}" font-family="system-ui,sans-serif" font-size="${Math.round(width * sizes[i])}" font-weight="${i === 1 ? 600 : 400}" fill="${t.fg}"${l.length > 48 ? ` textLength="${width - p * 2}" lengthAdjust="spacingAndGlyphs"` : ""}>${escapeHTML(l)}</text>`).join("")}<text x="${width - p}" y="${p + 8}" text-anchor="end" font-family="system-ui,sans-serif" font-size="${width * 0.025}" fill="${t.fg}">${escapeHTML(String(badge).slice(0, 16))}</text></svg>`;
}
