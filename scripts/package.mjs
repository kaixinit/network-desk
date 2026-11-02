import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { zipSync } from "fflate";
import {
  commonFiles,
  sourceFiles,
  gatherPublic,
  assertPublicLinks,
} from "./release-policy.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const release = path.join(root, "release");
await fs.mkdir(release, { recursive: true });
const pkg = JSON.parse(
  await fs.readFile(path.join(root, "package.json"), "utf8"),
);
const runtime = process.env.NETWORK_DESK_NODE_DIR;
const portable = [
  ...commonFiles,
  "dist/client",
  "server",
  "shared",
  "scripts/collect-system.ps1",
];
async function bundle(kind, paths) {
  const name = `NetworkDesk-${pkg.version}-${kind}`;
  const map = {};
  for (const item of paths) await gatherPublic(root, item, map);
  assertPublicLinks(map);
  if (kind === "windows-x64") {
    if (!runtime)
      throw new Error(
        "Set NETWORK_DESK_NODE_DIR to an official Windows x64 Node directory",
      );
    map["runtime/node.exe"] = new Uint8Array(
      await fs.readFile(path.join(runtime, "node.exe")),
    );
    map["runtime/LICENSE"] = new Uint8Array(
      await fs.readFile(path.join(runtime, "LICENSE")),
    );
    map["runtime/README.txt"] = new TextEncoder().encode(
      "Official Node.js Windows x64 runtime. Source: https://nodejs.org/ . See LICENSE for notices.",
    );
  }
  const manifest = Object.fromEntries(
    Object.entries(map).map(([k, v]) => [
      k,
      createHash("sha256").update(v).digest("hex"),
    ]),
  );
  map["FILE-SHA256.json"] = new TextEncoder().encode(
    JSON.stringify(manifest, null, 2),
  );
  const files = Object.fromEntries(
    Object.entries(map).map(([k, v]) => [name + "/" + k, v]),
  );
  const zip = zipSync(files, { level: 6 });
  const destination = path.join(release, name + ".zip");
  await fs.writeFile(destination, zip);
  console.log(
    JSON.stringify({
      file: path.basename(destination),
      files: Object.keys(map).length,
      bytes: zip.length,
      sha256: createHash("sha256").update(zip).digest("hex"),
    }),
  );
}
await bundle("source", sourceFiles);
await bundle(runtime ? "windows-x64" : "local-node", portable);
