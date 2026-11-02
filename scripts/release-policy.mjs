import fs from "node:fs/promises";
import path from "node:path";

export const publicDocs = [
  "USAGE.md",
  "CONFIGURATION.md",
  "PUBLISHING.md",
  "DESKTOP.md",
  "ARCHITECTURE.md",
  "PROVENANCE.md",
  "DEPENDENCIES-1.2.7.md",
  "COMPACT-LAYOUT-1.2.7.md",
  "REVIEW-1.2.8.txt",
];
export const commonFiles = [
  "README.md",
  "CHANGELOG.md",
  "LICENSE",
  "SECURITY.md",
  "THIRD_PARTY_NOTICES.md",
  "config.example.json",
  ...publicDocs.map((name) => "docs/" + name),
  "licenses",
  "启动网络诊断台.cmd",
  "生成系统报告.cmd",
];
export const sourceFiles = [
  ...commonFiles,
  "package.json",
  "package-lock.json",
  "index.html",
  "vite.config.mjs",
  "src",
  "desktop",
  "electron-builder.json",
  "server",
  "shared",
  "scripts",
  "tests",
  ".github",
  ".gitignore",
  ".npmrc",
  ".openai/hosting.json",
  "worker",
];
export function assertPublicPath(rel) {
  if (
    !rel ||
    path.isAbsolute(rel) ||
    rel.includes("\\") ||
    rel.split("/").some((p) => p === ".." || p === ".") ||
    /(^|\/)(node_modules|reports|private|qa|\.git|\.codex|\.idea|\.vscode)(\/|$)|(^|\/)(config\.local\.json|preferences\.json|AGENTS\.md|design-qa(?:-[^/]*)?\.md|\.env(?:\..*)?)$|\.(log|zip|pem|key|pfx|p12|exe|har|dmp|sqlite|db)$/i.test(
      rel,
    )
  )
    throw new Error("Private or unsafe release path rejected: " + rel);
  if (rel.startsWith("docs/") && !publicDocs.includes(rel.slice(5)))
    throw new Error("Unreviewed release document: " + rel);
}
export function assertPublicText(rel, text) {
  // High-confidence credential formats; not a substitute for reviewing new files.
  const rules = [
    ["private key", /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/],
    [
      "GitHub credential",
      /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})\b/,
    ],
    [
      "API credential",
      /\b(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{40,}|AIza[0-9A-Za-z_-]{35})\b/,
    ],
    ["AWS access identifier", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
    ["npm credential", /\bnpm_[A-Za-z0-9]{36,}\b/],
    ["Slack credential", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
    [
      "personal Windows path",
      /[A-Z]:[\\/]+Users[\\/]+(?!Public\b|Default\b)[^\\/\r\n"'<>]+[\\/]/i,
    ],
    ["personal Unix path", /\/(?:Users|home)\/[^/\s"'<>]+\//],
    [
      "private attachment reference",
      /\b(?:codex-clipboard|exec)-[a-f0-9]{8}-[a-f0-9-]+\.(?:png|jpe?g|webp)\b/i,
    ],
  ];
  for (const [name, pattern] of rules)
    if (pattern.test(text))
      throw new Error(`${name} detected in ${rel}; value omitted`);
  if (
    rel === "config.example.json" &&
    Object.values(JSON.parse(text)).some((v) => v !== "")
  )
    throw new Error("Example configuration must contain empty credentials");
}

export function assertPublicLinks(files) {
  for (const [rel, bytes] of Object.entries(files)) {
    if (!/^(?:README|CHANGELOG|SECURITY)\.md$|^docs\/.*\.md$/.test(rel))
      continue;
    const content = new TextDecoder().decode(bytes);
    for (const match of content.matchAll(/!?\[[^\]]*\]\(([^\s)]+)\)/g)) {
      const href = match[1];
      if (/^(?:[a-z][a-z\d+.-]*:|#)/i.test(href)) continue;
      const destination = path.posix.normalize(
        path.posix.join(
          path.posix.dirname(rel),
          decodeURIComponent(href.split(/[?#]/)[0]),
        ),
      );
      if (!Object.hasOwn(files, destination))
        throw new Error(`Broken public documentation link: ${rel} -> ${href}`);
    }
  }
}
export async function gatherPublic(root, rel, map) {
  assertPublicPath(rel);
  const full = path.resolve(root, rel);
  if (
    path.relative(root, full).startsWith("..") ||
    path.isAbsolute(path.relative(root, full))
  )
    throw new Error("Release path escapes project");
  const stat = await fs.lstat(full);
  if (stat.isSymbolicLink())
    throw new Error("Release symlink rejected: " + rel);
  if (stat.isDirectory()) {
    for (const child of await fs.readdir(full))
      await gatherPublic(root, rel + "/" + child, map);
  } else if (stat.isFile()) {
    const bytes = await fs.readFile(full);
    if (!/\.(png|ico|woff2?|ttf|eot)$/i.test(rel))
      assertPublicText(rel, bytes.toString("utf8"));
    map[rel] = new Uint8Array(bytes);
  } else throw new Error("Unsupported release file: " + rel);
}
