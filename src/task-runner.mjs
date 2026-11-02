import { observation } from "../shared/model.mjs";

export function runTask(
  { running, generation, put, save },
  key,
  label,
  fn,
  meta = {},
) {
  if (running.current.has(key)) return running.current.get(key);
  const gen = generation.current;
  put(
    observation(key, label, { ...meta, status: "running", summary: "检测中…" }),
  );
  // Register before invoking fn, including when it throws synchronously.
  const promise = Promise.resolve().then(async () => {
    try {
      if (gen !== generation.current)
        throw new DOMException("已停止", "AbortError");
      const answer = await fn();
      const item = observation(key, label, { ...meta, ...answer });
      if (gen === generation.current) put(item);
      return item;
    } catch (error) {
      const item = observation(key, label, {
        ...meta,
        status: "error",
        summary:
          error?.name === "AbortError"
            ? "已停止"
            : String(error?.message || error),
      });
      if (gen === generation.current) put(item);
      return item;
    } finally {
      if (gen === generation.current && running.current.get(key) === promise) {
        running.current.delete(key);
        save();
      }
    }
  });
  running.current.set(key, promise);
  return promise;
}
