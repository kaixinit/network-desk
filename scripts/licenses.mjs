import fs from "node:fs/promises";
import path from "node:path";
const root = process.cwd();
const lock = JSON.parse(await fs.readFile("package-lock.json", "utf8"));
await fs.mkdir("licenses", { recursive: true });
const rows = [];
for (const [folder, entry] of Object.entries(lock.packages)) {
  if (!folder) continue;
  if (entry.link) continue;
  const name = entry.name || folder.split("node_modules/").at(-1);
  let files = [];
  try {
    files = await fs.readdir(path.join(root, folder));
  } catch {}
  const selected = files.filter((f) =>
    /^(license|licence|copying)(\.|$)/i.test(f),
  );
  const copies = [];
  for (const f of selected) {
    const destination = "licenses/" + name.replaceAll("/", "_") + "-" + f;
    try {
      await fs.copyFile(path.join(root, folder, f), destination);
      copies.push(destination);
    } catch {}
  }
  rows.push(
    `| ${name} | ${entry.version} | ${entry.license || "参见上游包"} | ${copies.map((x) => `[许可](${x})`).join(" ")} |`,
  );
}
await fs.writeFile(
  "THIRD_PARTY_NOTICES.md",
  "# 第三方组件声明\n\n自主编写部分采用项目 MIT 许可。以下依赖保留各自许可；并非声称所有依赖为本项目编写。网页便携版另附官方 Node.js 运行时 LICENSE。桌面 EXE 使用 Electron；其运行目录保留 Electron LICENSE 与 LICENSES.chromium.html。应用图标来自 Bootstrap Icons globe2，许可副本见 desktop/assets。\n\n| 包 | 版本 | 许可 | 副本 |\n| --- | --- | --- | --- |\n" +
    rows.join("\n") +
    "\n",
);
console.log("Dependency notices generated:", rows.length);
