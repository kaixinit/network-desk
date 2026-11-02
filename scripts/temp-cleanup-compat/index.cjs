"use strict";
const fs = require("node:fs");
const path = require("node:path");

// Only temp 0.9.4 uses this facade. It supplies generated absolute file/dir
// paths, never globs. fs.rm replaces its rimraf 2 -> glob 7 -> minimatch 3 chain.
function checked(target) {
  if (typeof target !== "string" || !path.isAbsolute(target) ||
      path.resolve(target) === path.parse(path.resolve(target)).root)
    throw new TypeError("Temporary cleanup requires a non-root absolute path");
  return target;
}
function options(value) {
  return { recursive: true, force: true, maxRetries: Math.min(10,
    Math.max(0, Number.isInteger(value?.maxBusyTries) ? value.maxBusyTries : 3)) };
}
function cleanup(target, opts, callback) {
  if (typeof opts === "function") { callback = opts; opts = {}; }
  if (typeof callback !== "function") throw new TypeError("Callback required");
  try { target = checked(target); } catch (error) {
    return process.nextTick(callback, error);
  }
  fs.rm(target, options(opts), callback);
}
cleanup.sync = (target, opts) => fs.rmSync(checked(target), options(opts));
module.exports = cleanup;
