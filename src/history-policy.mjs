import { validateRecord } from "../shared/model.mjs";

export const HISTORY_KEY = "network-desk/history/v1";
export const HISTORY_ENABLED_KEY = "network-desk/save-history/v1";

// Pending tasks must consult the current choice, not a render's old value.
export function historyPreference(storage, onError = () => {}) {
  let enabled = true;
  try {
    enabled = storage.getItem(HISTORY_ENABLED_KEY) !== "false";
  } catch {}
  return {
    get: () => enabled,
    set(value) {
      enabled = Boolean(value);
      try {
        storage.setItem(HISTORY_ENABLED_KEY, String(enabled));
      } catch {
        onError();
      }
      return enabled;
    },
  };
}

export function readHistory(storage) {
  try {
    const records = JSON.parse(storage.getItem(HISTORY_KEY) || "[]");
    if (!Array.isArray(records)) return [];
    return records.slice(0, 20).flatMap((record) => {
      try {
        return [validateRecord(record)];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}
