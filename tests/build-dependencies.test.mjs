import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

test("all installed matcher engines are patched and no legacy matcher chain remains", async () => {
  const lock = JSON.parse(
    await fs.readFile(new URL("../package-lock.json", import.meta.url)),
  );
  const matchers = Object.entries(lock.packages).filter(([p]) =>
    p.endsWith("node_modules/minimatch"),
  );
  assert(matchers.length > 0);
  for (const [p, meta] of matchers) {
    assert.equal(meta.version, "11.0.3", p);
    assert(!meta.link);
  }
  for (const legacy of ["dir-compare", "filelist", "jake", "inflight"])
    assert(
      !Object.keys(lock.packages).some((p) =>
        p.endsWith("node_modules/" + legacy),
      ),
      legacy,
    );
});

test("builder filters preserve includes, exclusions, dotfiles and nested paths", () => {
  const { FileMatcher } = require("app-builder-lib/out/fileMatcher.js");
  const root = path.resolve("build-filter-fixture");
  const matcher = new FileMatcher(root, root, (x) => x, [
    "desktop/**",
    "package.json",
    "!desktop/private/**",
    "!node_modules/**",
  ]);
  const filter = matcher.createFilter();
  for (const [file, expected] of [
    ["desktop/main.cjs", true],
    ["desktop/.flag", true],
    ["desktop/assets/icon.ico", true],
    ["package.json", true],
    ["desktop/private/key.txt", false],
    ["node_modules/a/index.js", false],
    ["reports/a.json", false],
  ])
    assert.equal(
      filter(path.join(root, file), { isDirectory: () => false }),
      expected,
      file,
    );
});

test("asar packs and extracts real files with modern glob and unpack patterns", async () => {
  const asar = await import("@electron/asar");
  const { glob } = await import("glob");
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "network-desk-asar-test-"),
  );
  try {
    const source = path.join(root, "source");
    await fs.mkdir(path.join(source, "nested"), { recursive: true });
    await fs.writeFile(path.join(source, "main.cjs"), "module.exports = 42;");
    await fs.writeFile(path.join(source, "nested", "helper.cjs"), "helper");
    await fs.writeFile(path.join(source, "native.node"), "native fixture");
    assert.deepEqual(
      (await glob("**/*.cjs", { cwd: source }))
        .map((p) => p.split(path.sep).join("/"))
        .sort(),
      ["main.cjs", "nested/helper.cjs"],
    );
    const dest = path.join(root, "test.asar");
    await asar.createPackageWithOptions(source, dest, { unpack: "*.node" });
    assert.equal(
      asar.extractFile(dest, "main.cjs").toString(),
      "module.exports = 42;",
    );
    assert.equal(
      asar.extractFile(dest, "nested/helper.cjs").toString(),
      "helper",
    );
    assert.equal(
      await fs.readFile(dest + ".unpacked/native.node", "utf8"),
      "native fixture",
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("upgraded template and universal imports retain builder entry points", async () => {
  const ejs = require("ejs");
  assert.equal(
    ejs.compile("<%= name %> / <%- body %>")({
      name: "A&B",
      body: "<b>ok</b>",
    }),
    "A&amp;B / <b>ok</b>",
  );
  assert.equal(
    typeof (await import("@electron/universal")).makeUniversalApp,
    "function",
  );
  assert.equal(
    typeof require("electron-winstaller").createWindowsInstaller,
    "function",
  );
});

test("temp exact-path adapter supports sync/callback cleanup without glob expansion", async () => {
  const cleanup = require("../scripts/temp-cleanup-compat/index.cjs");
  const temp = require("temp").track();
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "network-desk-temp-test-"),
  );
  try {
    const generated = temp.mkdirSync({ prefix: "tracked-", dir: root });
    await fs.writeFile(path.join(generated, "child.txt"), "fixture");
    assert.equal(temp.cleanupSync().dirs, 1);
    assert.equal(
      await fs.stat(generated).then(
        () => true,
        () => false,
      ),
      false,
    );
    const file = temp.openSync({ prefix: "tracked-", dir: root });
    require("node:fs").closeSync(file.fd);
    const result = await new Promise((resolve, reject) =>
      temp.cleanup((e, value) => (e ? reject(e) : resolve(value))),
    );
    assert.equal(result.files, 1);
    assert.equal(
      await fs.stat(file.path).then(
        () => true,
        () => false,
      ),
      false,
    );
    assert.throws(() => cleanup.sync(path.parse(root).root));
    assert.throws(() => cleanup.sync("relative-path"));
    const sibling = path.join(root, "keep.txt");
    await fs.writeFile(sibling, "keep");
    await new Promise((resolve, reject) =>
      cleanup(path.join(root, "*.txt"), {}, (e) => (e ? reject(e) : resolve())),
    );
    assert.equal(await fs.readFile(sibling, "utf8"), "keep");
  } finally {
    temp.track(false);
    await fs.rm(root, { recursive: true, force: true });
  }
});
