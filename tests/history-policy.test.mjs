import test from "node:test";
import assert from "node:assert/strict";
import {
  historyPreference,
  readHistory,
  HISTORY_KEY,
  HISTORY_ENABLED_KEY,
} from "../src/history-policy.mjs";
import { makeRecord } from "../shared/model.mjs";
import { safePreference } from "../desktop/policy.mjs";

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
  };
}
test("history opt-out takes effect for pending tasks and survives restart", () => {
  const store = storage(),
    choice = historyPreference(store);
  const pendingTaskMaySave = () => choice.get();
  assert.equal(pendingTaskMaySave(), true);
  choice.set(false);
  assert.equal(pendingTaskMaySave(), false);
  assert.equal(historyPreference(store).get(), false);
  assert.equal(safePreference(HISTORY_ENABLED_KEY, "false").value, "false");
  choice.set(true);
  assert.equal(historyPreference(store).get(), true);
});
test("history remains opted out in memory even when disk persistence fails", () => {
  let errors = 0;
  const choice = historyPreference(
    {
      getItem() {},
      setItem() {
        throw new Error("disk full");
      },
    },
    () => errors++,
  );
  choice.set(false);
  assert.equal(choice.get(), false);
  assert.equal(errors, 1);
});
test("one invalid stored report does not hide the other valid history records", () => {
  const store = storage(),
    first = makeRecord("home", "First"),
    second = makeRecord("home", "Second");
  store.setItem(
    HISTORY_KEY,
    JSON.stringify([first, { schema: "broken" }, second]),
  );
  assert.deepEqual(readHistory(store), [first, second]);
  store.setItem(HISTORY_KEY, "{}");
  assert.deepEqual(readHistory(store), []);
});
