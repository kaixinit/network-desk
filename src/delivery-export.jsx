import React, { useState } from "react";
import { useDesk } from "./state.jsx";
import { prepareExport } from "../shared/model.mjs";
import { conclusionSummary } from "../shared/investigation.mjs";
import { download } from "./checks.mjs";

export function DeliveryExport({ record, modules = null }) {
  const d = useDesk();
  const [snapshot, setSnapshot] = useState(null);
  const [busy, setBusy] = useState(false);
  const prepared = snapshot
    ? prepareExport(snapshot.record, d.exportMasked, snapshot.modules)
    : null;
  const summary = prepared ? conclusionSummary(prepared) : null;
  async function save() {
    setBusy(true);
    try {
      const { deliveryArchive } = await import("../shared/delivery.mjs");
      const output = await deliveryArchive(prepared, false);
      download(output.name, output.bytes, "application/zip");
      d.setNotice("交付包已生成，包含同一快照的 HTML、JSON、说明和校验值");
      setSnapshot(null);
    } catch (e) {
      d.setNotice("交付包导出失败：" + e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className="delivery-open"
        disabled={!Object.keys(record.results).length && !record.system}
        onClick={() =>
          setSnapshot({ record: structuredClone(record), modules })
        }
      >
        <i className="bi bi-file-earmark-zip" aria-hidden="true" /> 导出交付包
      </button>
      {snapshot && (
        <section className="delivery-preview" aria-label="交付包预览">
          <div className="card-heading">
            <h2>交付包预览</h2>
            <button
              disabled={busy}
              onClick={() => setSnapshot(null)}
              aria-label="关闭交付包预览"
            >
              关闭
            </button>
          </div>
          <p>
            <strong>{summary.headline}</strong>
          </p>
          <p>
            HTML + JSON + 使用说明 + SHA-256 校验值 ·{" "}
            {snapshot.modules?.join("、") || "本次全部检测"} · {summary.total}{" "}
            项观测 · {prepared.system ? "包含系统信息" : "未附系统信息"}
          </p>
          <p className="muted">
            已固定当前记录快照；后续检测结果不会混入本次交付包。
            {summary.active || summary.missing.length
              ? "本次尚不完整，报告将保留未完成状态。"
              : ""}
          </p>
          <label className="check-label">
            <input
              type="checkbox"
              disabled={busy}
              checked={d.exportMasked}
              onChange={(e) => d.setExportMasked(e.target.checked)}
            />{" "}
            导出时隐藏 IP
          </label>
          <p className="muted">
            {prepared.redacted
              ? "已脱敏；时间、地区和设备信息仍保留。"
              : "将包含完整 IP 和网络证据，请确认接收对象。"}
          </p>
          <details>
            <summary>查看将导出的 JSON 内容</summary>
            <pre>{JSON.stringify(prepared, null, 2)}</pre>
          </details>
          <button className="primary" disabled={busy} onClick={save}>
            {busy ? "正在生成…" : "确认导出 ZIP"}
          </button>
        </section>
      )}
    </>
  );
}
