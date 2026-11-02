import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
if (process.platform !== "win32") throw new Error("Windows is required to build the portable launcher");
const output = path.resolve(root, process.argv[2] || "release/desktop");
const portable = path.join(output, `NetworkDesk-${pkg.version}-portable.exe`);
const runtime = path.join(output, `NetworkDesk-${pkg.version}-runtime.exe`);
const temporary = path.join(output, `NetworkDesk-${pkg.version}-portable.new.exe`);
const compiler = path.join(process.env.SystemRoot || "C:\\Windows", "Microsoft.NET/Framework64/v4.0.30319/csc.exe");
await fs.access(compiler);
await fs.copyFile(portable, runtime);
await new Promise((resolve, reject) => {
  const child = spawn(compiler, [
    "/nologo", "/target:winexe", "/platform:x64", "/optimize+",
    "/reference:System.Windows.Forms.dll",
    "/win32icon:" + path.join(root, "desktop/assets/icon.ico"),
    "/resource:" + runtime + ",NetworkDesk.Payload",
    "/out:" + temporary,
    path.join(root, "desktop/launcher.cs"),
  ], { windowsHide: true, stdio: "inherit" });
  child.once("error", reject);
  child.once("close", code => code === 0 ? resolve() : reject(new Error("Launcher compilation failed: " + code)));
});
await fs.rename(temporary, portable);
console.log("Portable launcher ready: " + portable);
