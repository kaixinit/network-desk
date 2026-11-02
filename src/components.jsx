import React, { useRef, useState } from "react";
import { useDesk } from "./state.jsx";
import {
  canonicalIP,
  maskIP,
  redact,
  reportHTML,
  validateSystem,
  validateRecord,
  summarize,
  prepareExport,
  resultModule,
} from "../shared/model.mjs";
import { download } from "./checks.mjs";
import { desktop } from "./storage.mjs";
import { egressView } from "../shared/egress-view.mjs";
export const Icon = ({ name, ...props }) => (
  <i aria-hidden="true" className={"bi bi-" + name} {...props} />
);
export function Badge({ children, tone = "neutral" }) {
  return <span className={"badge " + tone}>{children}</span>;
}
export function Card({ title, icon, actions, children, className = "" }) {
  return (
    <section className={"card " + className}>
      <div className="card-heading">
        <h2>
          {icon && (
            <span className="section-icon">
              <Icon name={icon} />
            </span>
          )}
          {title}
        </h2>
        {actions && <div className="card-actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
export function Row({ label, children }) {
  return (
    <div className="data-row">
      <span>{label}</span>
      <strong>{children ?? "未提供"}</strong>
    </div>
  );
}
export function Flag({ value }) {
  return (
    <Badge
      tone={value === true ? "warn" : value === false ? "good" : "neutral"}
    >
      {value === true ? "已检测到" : value === false ? "未检测到" : "未提供"}
    </Badge>
  );
}
export function Copy({ value, label = "复制完整 IP" }) {
  const [done, setDone] = useState(false);
  const { setNotice } = useDesk();
  return (
    <button
      type="button"
      className="icon-button"
      title={label}
      aria-label={label}
      disabled={!value}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(String(value));
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          setNotice("无法写入剪贴板，请展开完整内容手动复制");
        }
      }}
    >
      <Icon name={done ? "check2" : "copy"} />
    </button>
  );
}
export function DataText({ value }) {
  const { masked } = useDesk();
  return masked ? redact(String(value ?? "未提供")) : String(value ?? "未提供");
}
export function Raw({ value, title = "原始证据", open = false }) {
  const { masked } = useDesk();
  return (
    <details className="raw" open={open || undefined}>
      <summary>{title}</summary>
      <pre>{JSON.stringify(masked ? redact(value) : value, null, 2)}</pre>
    </details>
  );
}
export const planeLabel = (value) => {
  const labels = {
    browser: "浏览器",
    "desktop-renderer": "本软件",
    "browser → local-service": "浏览器 → 本机服务",
    "local-service": "本机服务",
    "remote-probe": "远端探针",
    "system-script": "系统脚本",
  };
  return Object.hasOwn(labels, value)
    ? labels[value]
    : String(value ?? "未提供");
};
export function Evidence({ result, title = "来源与检测详情" }) {
  return result ? (
    <details className="evidence">
      <summary>{title}</summary>
      <p>
        <DataText value={result.source} /> · {planeLabel(result.execution)}
        <br />
        {new Date(result.observedAt).toLocaleString()}
      </p>
      {result.limitations?.map((x, i) => (
        <p key={i}>
          <DataText value={x} />
        </p>
      ))}
      <Raw value={result.data} />
    </details>
  ) : null;
}
export function ResultLine({ result }) {
  const { masked } = useDesk();
  return (
    <p
      className={"result-line " + (result?.status === "error" ? "error" : "")}
      role="status"
    >
      {result?.status === "running" && <Icon name="arrow-repeat" />}
      {masked
        ? redact(result?.summary || "尚未检测")
        : result?.summary || "尚未检测"}
    </p>
  );
}
export function IPLinks({ ip }) {
  const { setSelected } = useDesk();
  if (!canonicalIP(ip)) return null;
  return (
    <span className="ip-links">
      {[
        ["/ip/", "评分"],
        ["/whois/", "Whois"],
        ["/card/", "IP 卡片"],
      ].map(([url, name]) => (
        <a
          key={url}
          href={url + "?ip=" + encodeURIComponent(ip)}
          onClick={() => setSelected(ip)}
        >
          {name}
        </a>
      ))}
    </span>
  );
}
export function EgressTile({
  result,
  label,
  target,
  onRetry,
  busy,
  edge = false,
}) {
  const { record } = useDesk();
  const state = egressView(result, record.redacted);
  const tone =
    {
      ipv6: "violet",
      claude: "violet",
      domestic: "teal",
      chatgpt: "teal",
      cloudflare: "amber",
    }[target] || "blue";
  const icon =
    {
      ipv4: "globe2",
      ipv6: "hdd-network",
      domestic: "geo-alt",
      cloudflare: "cloud",
      claude: "stars",
      chatgpt: "chat-square-text",
      openai: "braces",
    }[target] || "globe2";
  return (
    <article
      className="egress-tile"
      data-tone={tone}
      aria-label={label + "出口观测"}
    >
      <div className="tile-heading">
        <span className="tile-identity">
          <span className="tile-symbol">
            <Icon name={icon} />
          </span>
          <strong>{label}</strong>
        </span>
        <Badge tone={state.tone}>{state.label}</Badge>
        <button
          className="icon-button"
          title={"重新检测 " + label}
          aria-label={"重新检测 " + label}
          disabled={busy || result?.status === "running"}
          onClick={onRetry}
        >
          <Icon name="arrow-clockwise" />
        </button>
      </div>
      <div className="tile-address">
        <code>
          <DataText value={result?.data?.ip || "尚未取得出口"} />
        </code>
        <Copy value={state.ip} label={"复制 " + label + " 的完整 IP"} />
      </div>
      <div className="tile-footer">
        <div className="tile-meta">
          <span>
            <Icon name="window" />{" "}
            {result ? planeLabel(result.execution) : "未检测"}
          </span>
          {result?.data?.elapsedMs != null && (
            <span>{result.data.elapsedMs} ms</span>
          )}
          {edge && (
            <span>
              节点 {result?.data?.trace?.colo || "未提供"} /{" "}
              {result?.data?.trace?.http || "未提供"}
            </span>
          )}
          <IPLinks ip={state.ip} />
        </div>
        <Evidence result={result} title="来源、时间与证据" />
      </div>
      {result && result.status !== "ok" && <ResultLine result={result} />}
    </article>
  );
}
export function ReportActions({ compact = false, record: override }) {
  const desk = useDesk();
  const input = useRef();
  const privateExport = desk.exportMasked,
    setPrivateExport = desk.setExportMasked;
  const record = override || desk.record;
  const [module, setModule] = useState("all");
  const moduleNames = {
    ip: "IP 评分与情报",
    egress: "分流出口",
    connectivity: "连通性",
    dns: "DNS",
    webrtc: "WebRTC",
    environment: "设备环境",
    cloudflare: "Cloudflare",
    ping: "全球 Ping",
    whois: "Whois",
    status: "服务状态",
    news: "资讯",
    other: "其他",
  };
  const exported = prepareExport(
    record,
    privateExport,
    module === "all" ? null : [module],
  );
  const base = "NetworkDesk-" + record.scope + "-" + record.id.slice(0, 8);
  async function importFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      if (f.size > 5_000_000) throw new Error("文件超过 5 MB");
      const value = JSON.parse((await f.text()).replace(/^\uFEFF/, ""));
      if (value.schema === "network-desk/report-v1") {
        desk.load(validateRecord(value));
      } else {
        desk.patchRecord({
          system: validateSystem(value),
          assessmentSnapshot: null,
        });
        desk.setNotice("系统 JSON 已合并，浏览器结果保持独立");
        desk.save();
      }
    } catch (err) {
      desk.setNotice("导入失败：" + err.message);
    }
    e.target.value = "";
  }
  return (
    <div className={"report-actions " + (compact ? "compact" : "")}>
      <button
        className="link-button"
        onClick={() =>
          download(
            base + ".html",
            reportHTML(exported, privateExport),
            "text/html;charset=utf-8",
          )
        }
      >
        导出 HTML
      </button>
      <button
        className="link-button"
        onClick={() =>
          download(base + ".json", JSON.stringify(exported, null, 2))
        }
      >
        导出 JSON
      </button>
      {!compact && (
        <>
          <label>
            导出范围{" "}
            <select
              aria-label="导出范围"
              value={module}
              onChange={(e) => setModule(e.target.value)}
            >
              <option value="all">全部检测与系统结果</option>
              {[...new Set(Object.keys(record.results).map(resultModule))].map(
                (m) => (
                  <option key={m} value={m}>
                    {moduleNames[m]}
                  </option>
                ),
              )}
            </select>
          </label>
          <button onClick={() => input.current.click()}>
            <Icon name="file-earmark-arrow-up" />
            导入系统 JSON / 报告
          </button>
          <input
            ref={input}
            className="hidden"
            type="file"
            accept=".json,application/json"
            onChange={importFile}
          />
          <a className="button" href="/scripts/collect-system.ps1" download>
            下载系统脚本
          </a>
        </>
      )}
      <label className="check-label">
        <input
          type="checkbox"
          checked={privateExport}
          onChange={(e) => setPrivateExport(e.target.checked)}
        />
        导出时隐藏 IP
      </label>
    </div>
  );
}
export function EnvironmentCard() {
  const { record } = useDesk();
  const e = record.results.environment?.data;
  return (
    <Card title="设备环境" icon="pc-display">
      <div className="environment-grid">
        {[
          ["操作系统", e?.os],
          ["系统平台", e?.platform],
          ["浏览器", e ? `${e.browserName} ${e.browserVersion}` : null],
          ["屏幕尺寸", e?.screen],
          ["默认语言", e?.language],
          ["所在时区", e?.timezone],
          [
            "WebRTC",
            record.results.webrtc?.data?.candidates?.find(
              (x) => x.type === "srflx",
            )?.address,
          ],
          ["GPU", e?.renderer || e?.gpu],
        ].map(([label, value]) => (
          <Row key={label} label={label}>
            {label === "WebRTC" ? (
              <DataText value={value} />
            ) : (
              value || "未提供"
            )}
          </Row>
        ))}
      </div>
      <details className="minor-details">
        <summary>更多设备与指纹信息</summary>
        <Raw value={e} open />
        <p className="muted">
          Canvas 摘要仅存于当前浏览器和导出报告；不会发送给 IP 数据源。
        </p>
      </details>
    </Card>
  );
}
export function HistoryCard() {
  const { history, load, clearHistory, record, saveHistory, setSaveHistory } =
    useDesk();
  const [compare, setCompare] = useState(null);
  return (
    <Card
      title="出口 IP 历史记录"
      actions={<button onClick={clearHistory}>清除本地历史</button>}
    >
      <p className="muted">
        {desktop ? "只保存在此软件的本机数据目录" : "只保存在此浏览器"}，最多 20
        份；下载的报告不受清除操作影响。
      </p>
      <label className="check-label">
        <input
          type="checkbox"
          checked={saveHistory}
          onChange={(e) => setSaveHistory(e.target.checked)}
        />
        自动保留检测历史
      </label>
      {!history.length ? (
        <p>暂无已完成的检测。</p>
      ) : (
        <div
          className="compact-grid history-grid"
          aria-label="已保存的检测记录"
        >
          {history.map((h) => {
            const count = summarize(h);
            const time = new Date(h.updatedAt).toLocaleString();
            return (
              <article className="history-entry" key={h.id}>
                <strong>{h.title}</strong>
                <Badge
                  tone={count.obtained === count.total ? "good" : "neutral"}
                >
                  {count.obtained}/{count.total} 已取得
                </Badge>
                <time dateTime={h.updatedAt}>{time}</time>
                <div className="history-actions">
                  <button
                    aria-label={"查看 " + h.title + " " + time}
                    onClick={() => load(h)}
                  >
                    查看
                  </button>
                  <button
                    aria-label={"与本次比较 " + h.title + " " + time}
                    onClick={() => setCompare(h)}
                  >
                    与本次比较
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {compare && (
        <details open>
          <summary>
            与 {new Date(compare.updatedAt).toLocaleString()} 比较
          </summary>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>项目</th>
                  <th>历史</th>
                  <th>本次</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ...new Set([
                    ...Object.keys(compare.results),
                    ...Object.keys(record.results),
                  ]),
                ].map((k) => (
                  <tr key={k}>
                    <td>
                      <DataText
                        value={
                          record.results[k]?.label || compare.results[k]?.label
                        }
                      />
                    </td>
                    <td>
                      <DataText
                        value={compare.results[k]?.summary || "无记录"}
                      />
                    </td>
                    <td>
                      <DataText
                        value={record.results[k]?.summary || "无记录"}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </Card>
  );
}
export function QueryForm({
  value,
  setValue,
  onSubmit,
  placeholder = "输入完整 IP 或域名",
  label = "查询目标",
  busy,
  required = true,
  children,
}) {
  return (
    <form
      className="query-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <input
        aria-label={label}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        required={required}
        maxLength={253}
      />
      {children}
      <button className="primary" type="submit" disabled={busy}>
        {busy ? "查询中…" : "查询"}
      </button>
    </form>
  );
}
export function DataGrid({ value }) {
  if (value == null) return <p className="muted">数据源未提供。</p>;
  if (Array.isArray(value)) {
    if (!value.length)
      return <p className="muted">数据源返回空列表；不代表无风险。</p>;
    if (value.every((v) => v && typeof v === "object" && !Array.isArray(v))) {
      const keys = [...new Set(value.slice(0, 20).flatMap(Object.keys))].slice(
        0,
        12,
      );
      return (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {keys.map((k) => (
                  <th key={k}>{k}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {value.slice(0, 100).map((row, i) => (
                <tr key={i}>
                  {keys.map((k) => (
                    <td key={k}>
                      {row[k] && typeof row[k] === "object" ? (
                        <Raw value={row[k]} title="展开数据" />
                      ) : (
                        <DataText value={row[k]} />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {value.length > 100 && <p>表格显示前 100 行，完整数据见原始证据。</p>}
        </div>
      );
    }
    return (
      <ul>
        {value.slice(0, 100).map((v, i) => (
          <li key={i}>
            <DataText value={typeof v === "object" ? JSON.stringify(v) : v} />
          </li>
        ))}
      </ul>
    );
  }
  if (typeof value === "object")
    return (
      <div className="data-grid-fields">
        {Object.entries(value)
          .slice(0, 35)
          .map(([key, val]) =>
            typeof val === "object" && val !== null ? (
              <details key={key} className="nested-data">
                <summary>
                  {key} {Array.isArray(val) ? `(${val.length})` : ""}
                </summary>
                <DataGrid value={val} />
              </details>
            ) : (
              <Row key={key} label={key}>
                <DataText value={val} />
              </Row>
            ),
          )}
      </div>
    );
  return <DataText value={value} />;
}
