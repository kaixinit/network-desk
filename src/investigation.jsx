import React, { useState } from "react";
import { useDesk } from "./state.jsx";
import { useChecks } from "./useChecks.jsx";
import { desktop } from "./storage.mjs";
import {
  INVESTIGATION_SCOPES,
  conclusionSummary,
} from "../shared/investigation.mjs";
import { Card, Badge, DataText } from "./components.jsx";
import { DeliveryExport } from "./delivery-export.jsx";
import { REGION_SOURCES } from "../shared/diagnostic-guidance.mjs";

export function InvestigationPanel() {
  const d = useDesk(),
    c = useChecks();
  const [scopes, setScopes] = useState(Object.keys(INVESTIGATION_SCOPES));
  const [includeSystem, setIncludeSystem] = useState(Boolean(desktop));
  const active = d.record.investigation?.state === "running";
  return (
    <Card
      title="一键综合排查"
      icon="clipboard2-pulse"
      className="investigation-panel"
    >
      <div className="investigation-toolbar">
        <fieldset disabled={active || !d.config}>
          <legend className="muted">选择本次排查范围</legend>
          <div className="investigation-choices">
            {Object.entries(INVESTIGATION_SCOPES).map(([key, label]) => (
              <label key={key} className="check-label">
                <input
                  type="checkbox"
                  checked={scopes.includes(key)}
                  onChange={(e) =>
                    setScopes((prev) =>
                      e.target.checked
                        ? [...prev, key]
                        : prev.filter((s) => s !== key),
                    )
                  }
                />{" "}
                {label}
              </label>
            ))}
            {desktop && (
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={includeSystem}
                  onChange={(e) => setIncludeSystem(e.target.checked)}
                />{" "}
                合并只读系统信息
              </label>
            )}
          </div>
        </fieldset>
        <div className="actions">
          <button
            className="primary"
            disabled={!d.config || active || !scopes.length}
            onClick={() =>
              c.investigate(scopes, {
                includeSystem,
                collectSystem: desktop
                  ? () => desktop.collectSystem()
                  : undefined,
              })
            }
          >
            {active ? "综合排查中…" : "开始综合排查"}
          </button>
          {active && <button onClick={d.stop}>停止综合排查</button>}
          <DeliveryExport record={d.record} />
        </div>
      </div>
      <p className="muted">
        新建一次排查记录，公共项目只测一次，平台出口分别记录。
        {desktop
          ? "系统信息只读采集，不改系统代理。"
          : "系统信息可在报告中心导入 JSON 合并。"}
      </p>
    </Card>
  );
}
export function ConclusionCard() {
  const d = useDesk();
  const c = useChecks();
  const s = conclusionSummary(d.record);
  const [all, setAll] = useState(false);
  if (!s.total && !d.record.investigation) return null;
  return (
    <Card
      title="结论摘要"
      icon="journal-check"
      className="conclusion-card"
      actions={<a href="/reports/">查看报告与全部证据 →</a>}
    >
      <div aria-live="polite">
        <strong>{s.headline}</strong>
        <p className="muted">
          范围：{s.scope} · {s.total} 项观测 · {s.obtained} 项已取得 ·{" "}
          {s.errors} 项失败 · {s.warnings} 项需复查 · {s.unknown} 项无法确定
          {s.missing.length ? ` · ${s.missing.length} 项尚未执行` : ""}
        </p>
      </div>
      <div className="compact-grid conclusion-grid">
        {(all ? s.findings : s.findings.slice(0, 4)).map((f) => (
          <details className="conclusion-item" key={f.key}>
            <summary>
              <span>
                <DataText value={f.label} />
              </span>
              <Badge tone={f.severity === "unknown" ? "neutral" : "warn"}>
                {f.reason}
              </Badge>
            </summary>
            <p>
              <DataText value={f.evidence} />
            </p>
            <p>{f.action}</p>
            <p className="muted">
              <DataText value={f.source} /> ·{" "}
              {new Date(f.observedAt).toLocaleString()}
            </p>
            <a href={f.route}>打开相关栏目</a>
            {REGION_SOURCES[f.key.replace(/^region:/, "")] &&
              f.key.startsWith("region:") && (
                <a
                  href={REGION_SOURCES[f.key.slice(7)]}
                  target="_blank"
                  rel="noreferrer"
                >
                  在浏览器核对官方名单
                </a>
              )}
            {f.key.startsWith("link:") && (
              <button
                disabled={s.active}
                onClick={() => c.connectivity(f.key.slice(5))}
              >
                复测此项
              </button>
            )}
            {f.key.startsWith("region:") && d.record.results[f.key]?.target && (
              <button
                disabled={s.active}
                onClick={() =>
                  c.region(f.key.slice(7), d.record.results[f.key].target, true)
                }
              >
                重新核验名单
              </button>
            )}
          </details>
        ))}
      </div>
      {s.findings.length > 4 && (
        <button className="link-button" onClick={() => setAll(!all)}>
          {all ? "收起" : `展开全部 ${s.findings.length} 项`}
        </button>
      )}
      <p className="muted">{s.limits}</p>
    </Card>
  );
}
