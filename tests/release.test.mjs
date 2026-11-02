import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  assertPublicPath,
  assertPublicText,
  assertPublicLinks,
  publicDocs,
  sourceFiles,
} from "../scripts/release-policy.mjs";
import { VERSION } from "../shared/version.mjs";
test("release policy rejects private files and common credential formats", () => {
  for (const name of [
    "qa/report.json",
    "docs/private/data.json",
    "config.local.json",
    ".env.local",
    "desktop/signing.pfx",
    "../outside",
    "reports/result.json",
  ])
    assert.throws(() => assertPublicPath(name));
  assert.doesNotThrow(() => assertPublicPath("src/App.jsx"));
  for (const value of [
    "ghp_" + "a".repeat(36),
    "-----BEGIN " + "PRIVATE KEY-----",
    ["C:", "Users", "example", "secret.json"].join("/"),
  ])
    assert.throws(() => assertPublicText("data.txt", value));
  assert.throws(() =>
    assertPublicText("config.example.json", '{"ipapiKey":"filled"}'),
  );
  assert.doesNotThrow(() =>
    assertPublicText("config.example.json", '{"ipapiKey":""}'),
  );
});
test("package, lockfile, server and portable launcher versions agree", async () => {
  const pkg = JSON.parse(
    await fs.readFile(new URL("../package.json", import.meta.url)),
  );
  const lock = JSON.parse(
    await fs.readFile(new URL("../package-lock.json", import.meta.url)),
  );
  const launcher = await fs.readFile(
    new URL("../desktop/launcher.cs", import.meta.url),
    "utf8",
  );
  assert.equal(pkg.version, VERSION);
  assert.equal(lock.version, VERSION);
  assert.equal(lock.packages[""].version, VERSION);
  assert(launcher.includes(`AssemblyVersion("${VERSION}.0")`));
});

test("public documentation is allowlisted consistently for source, desktop and Git", async () => {
  const builder = JSON.parse(
    await fs.readFile(new URL("../electron-builder.json", import.meta.url)),
  );
  const ignores = await fs.readFile(
    new URL("../.gitignore", import.meta.url),
    "utf8",
  );
  assert.deepEqual(
    builder.extraResources.find((r) => r.from === "docs").filter,
    publicDocs,
  );
  for (const name of publicDocs) {
    assert(sourceFiles.includes("docs/" + name));
    assert(ignores.includes("!/docs/" + name));
    assert.doesNotThrow(() => assertPublicPath("docs/" + name));
  }
  assert(!sourceFiles.includes("docs"));
  for (const name of [
    "AGENTS.md",
    "design-qa.md",
    "docs/unreviewed.md",
    "capture.har",
    "history.sqlite",
    ".vscode/settings.json",
  ])
    assert.throws(() => assertPublicPath(name));
  const encode = (value) => new TextEncoder().encode(value);
  assert.doesNotThrow(() =>
    assertPublicLinks({
      "README.md": encode("[Guide](docs/USAGE.md)"),
      "docs/USAGE.md": encode("[Home](../README.md)"),
    }),
  );
  assert.throws(() =>
    assertPublicLinks({ "README.md": encode("[Private](docs/internal.md)") }),
  );
});

test("release scan rejects additional credentials and private development traces", () => {
  const paths = [
    ["C:", "Users", "示例 用户", "report.json"].join("/"),
    ["", "home", "sample", "report.json"].join("/"),
    [
      "codex-clipboard",
      "00000000",
      "0000",
      "0000",
      "0000",
      "000000000000.png",
    ].join("-"),
  ];
  for (const text of [
    ...paths,
    "AKIA" + "A".repeat(16),
    "npm_" + "a".repeat(36),
    "xoxb-" + "a".repeat(24),
  ])
    assert.throws(() => assertPublicText("sample.txt", text));
  assert.doesNotThrow(() =>
    assertPublicText(
      "guide.md",
      "%APPDATA% and C:/tools/node are generic locations",
    ),
  );
});
