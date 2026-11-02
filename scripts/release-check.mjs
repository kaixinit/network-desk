import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  sourceFiles,
  gatherPublic,
  assertPublicLinks,
} from "./release-policy.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = {};
for (const rel of sourceFiles) await gatherPublic(root, rel, files);
assertPublicLinks(files);
console.log(
  `Release source check passed: ${Object.keys(files).length} allowlisted files; public document links resolve; no prohibited paths or matched credential patterns.`,
);
