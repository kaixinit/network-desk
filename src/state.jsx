import React, {
  createContext,
  useContext,
  useRef,
  useState,
  useEffect,
} from "react";
import { makeRecord, validateRecord } from "../shared/model.mjs";
import { api } from "./checks.mjs";
import { storage, desktop } from "./storage.mjs";
import {
  HISTORY_KEY as STORE,
  historyPreference,
  readHistory,
} from "./history-policy.mjs";
import { runTask } from "./task-runner.mjs";
const Context = createContext(null);
const PROXY_STORE = "network-desk/request-proxy/v1";
function validProxy(value) {
  return (
    value &&
    ["system", "direct", "local", "socks5"].includes(value.mode) &&
    Number.isInteger(Number(value.port)) &&
    Number(value.port) >= 1024 &&
    Number(value.port) <= 65535
  );
}
function proxyRead() {
  try {
    const value = JSON.parse(storage.getItem(PROXY_STORE));
    if (validProxy(value))
      return { mode: value.mode, port: Number(value.port) };
  } catch {}
  return { mode: "system", port: 7890 };
}
function historyRead() {
  return readHistory(storage);
}
export function DeskProvider({ children }) {
  const createRecord = (scope, title) => ({
    ...makeRecord(scope, title),
    client: desktop ? "Network Desk 桌面内嵌环境" : "外部浏览器环境",
  });
  const [record, setRecord] = useState(() =>
    createRecord("combined", "网络环境综合检测"),
  );
  const recordRef = useRef(record);
  const generation = useRef(0);
  const running = useRef(new Map());
  const [history, setHistory] = useState(historyRead);
  const [config, setConfig] = useState(null);
  const [masked, setMasked] = useState(false);
  const [selected, setSelected] = useState("");
  const [exportMasked, setExportMasked] = useState(true);
  const [notice, setNotice] = useState("");
  const [imported, setImported] = useState(false);
  const historyPolicy = useRef(null);
  if (!historyPolicy.current)
    historyPolicy.current = historyPreference(storage, () =>
      setNotice("自动保存选择暂时无法写入，下次启动请核对；本次选择已生效"),
    );
  const [saveHistory, setSaveHistoryState] = useState(() =>
    historyPolicy.current.get(),
  );
  function setSaveHistory(value) {
    setSaveHistoryState(historyPolicy.current.set(value));
  }
  const [proxy, setProxy] = useState(proxyRead);
  useEffect(() => {
    if (!validProxy(proxy)) return;
    try {
      storage.setItem(
        PROXY_STORE,
        JSON.stringify({ mode: proxy.mode, port: Number(proxy.port) }),
      );
    } catch {
      setNotice("浏览器无法保存请求设置，刷新后需要重新选择代理端口");
    }
  }, [proxy]);
  useEffect(() => {
    const error = () => setNotice("本机设置保存失败，请导出报告后重试");
    window.addEventListener("network-desk:storage-error", error);
    return () =>
      window.removeEventListener("network-desk:storage-error", error);
  }, []);
  useEffect(() => {
    api("config")
      .then(setConfig)
      .catch((e) => setNotice(e.message));
  }, []);
  function publish(value) {
    recordRef.current = value;
    setRecord(value);
  }
  function patchRecord(patch) {
    publish({
      ...recordRef.current,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  }
  function put(item) {
    if (desktop && item.execution === "browser")
      item = { ...item, execution: "desktop-renderer" };
    patchRecord({
      results: { ...recordRef.current.results, [item.key]: item },
    });
  }
  function save(value = recordRef.current, force = false) {
    if (!historyPolicy.current.get() && !force) return;
    if (!Object.keys(value.results).length && !value.system) return;
    setHistory((prev) => {
      if (!historyPolicy.current.get() && !force) return prev;
      const next = [
        structuredClone(value),
        ...prev.filter((x) => x.id !== value.id),
      ].slice(0, 20);
      try {
        storage.setItem(STORE, JSON.stringify(next));
      } catch {
        setNotice("浏览器存储空间不足，请先导出报告；本次结果仍保留在页面中");
      }
      return next;
    });
  }
  function startRecord(scope, title) {
    save();
    generation.current++;
    running.current.clear();
    window.dispatchEvent(new Event("network-desk:stop"));
    setImported(false);
    publish(createRecord(scope, title));
  }
  function task(key, label, fn, meta = {}) {
    return runTask({ running, generation, put, save }, key, label, fn, meta);
  }
  function load(value) {
    const validated = validateRecord(value);
    generation.current++;
    running.current.clear();
    window.dispatchEvent(new Event("network-desk:stop"));
    publish(validated);
    setImported(true);
    setNotice("已载入报告，原始采集时间保持不变");
  }
  function clearHistory() {
    setHistory([]);
    try {
      storage.removeItem(STORE);
      setNotice(
        desktop ? "已清空本软件的本地历史" : "已清空此浏览器的本地历史",
      );
    } catch {
      setNotice("历史存储暂时不可写，未能清除持久保存的记录，请重试");
    }
  }
  function stop() {
    generation.current++;
    running.current.clear();
    window.dispatchEvent(new Event("network-desk:stop"));
    patchRecord({
      results: Object.fromEntries(
        Object.entries(recordRef.current.results).map(([key, value]) => [
          key,
          value.status === "running"
            ? {
                ...value,
                status: "unknown",
                summary: "已停止等待；已发出的请求可能仍在结束",
                observedAt: new Date().toISOString(),
              }
            : value,
        ]),
      ),
    });
    save();
    setNotice("已停止本轮等待与后续采集，已有结果已保留");
  }
  const value = {
    record,
    recordRef,
    generation,
    history,
    config,
    masked,
    setMasked,
    exportMasked,
    setExportMasked,
    selected,
    setSelected,
    notice,
    imported,
    setImported,
    saveHistory,
    setSaveHistory,
    setNotice,
    proxy,
    setProxy,
    put,
    patchRecord,
    task,
    save,
    startRecord,
    load,
    clearHistory,
    stop,
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useDesk = () => useContext(Context);
export function navigate(url) {
  const next = new URL(url, location.origin);
  if (next.origin !== location.origin) throw new Error("只能跳转到本地工具");
  history.pushState({}, "", next.pathname + next.search);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo(0, 0);
}
