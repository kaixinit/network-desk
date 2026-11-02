import test from "node:test";
import assert from "node:assert/strict";
import { runTask } from "../src/task-runner.mjs";

function context() {
  const results = [],
    saved = [];
  return {
    running: { current: new Map() },
    generation: { current: 0 },
    put: (r) => results.push(r),
    save: () => saved.push(true),
    results,
    saved,
  };
}
test("synchronous task failures release the key so retry executes again", async () => {
  const d = context();
  let attempts = 0;
  const task = () => {
    attempts++;
    throw new Error("fixture failure");
  };
  assert.equal((await runTask(d, "test", "Test", task)).status, "error");
  await runTask(d, "test", "Test", task);
  assert.equal(attempts, 2);
  assert.equal(d.running.current.size, 0);
});
test("in-flight requests are deduplicated and successful results persist once", async () => {
  const d = context();
  let finish,
    attempts = 0;
  const delayed = new Promise((resolve) => {
    finish = resolve;
  });
  const first = runTask(d, "test", "Test", () => {
    attempts++;
    return delayed;
  });
  assert.equal(
    runTask(d, "test", "Test", () => {}),
    first,
  );
  finish({ status: "ok" });
  assert.equal((await first).status, "ok");
  assert.equal(attempts, 1);
  assert.equal(d.saved.length, 1);
});
test("old completions cannot overwrite or release the new report's same-key request", async () => {
  const d = context();
  let finishOld, finishNew;
  const oldResponse = new Promise((resolve) => {
    finishOld = resolve;
  });
  const newResponse = new Promise((resolve) => {
    finishNew = resolve;
  });
  const old = runTask(d, "test", "Old", () => oldResponse);
  await Promise.resolve();
  d.generation.current++;
  d.running.current.clear();
  const current = runTask(d, "test", "New", () => newResponse);
  finishOld({ status: "ok", summary: "old" });
  await old;
  assert.equal(d.running.current.get("test"), current);
  assert.equal(
    d.results.some((r) => r.summary === "old"),
    false,
  );
  assert.equal(d.saved.length, 0);
  finishNew({ status: "ok", summary: "new" });
  await current;
  assert.equal(d.results.at(-1).summary, "new");
});
test("cancellation before a queued task starts does not invoke its request", async () => {
  const d = context();
  let called = false;
  const task = runTask(d, "test", "Test", () => {
    called = true;
  });
  d.generation.current++;
  d.running.current.clear();
  assert.equal((await task).summary, "已停止");
  assert.equal(called, false);
  assert.equal(d.saved.length, 0);
});
