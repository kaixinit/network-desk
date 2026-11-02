import React, { useState } from "react";
import { useDesk } from "./state.jsx";
import { Icon, Badge, ReportActions } from "./components.jsx";
import { desktop } from "./storage.mjs";
import { validateSystem, prepareExport, reportHTML } from "../shared/model.mjs";
import { download } from "./checks.mjs";

export function DesktopDock() {
  const d = useDesk();
  const [collecting, setCollecting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const entries = Object.values(d.record.results).filter(
    (r) => !["webrtc", "dns-leak"].includes(r.key),
  );
  const pending = entries.filter((r) => r.status === "running");
  const done = entries.length - pending.length;
  const issues = entries.filter((r) =>
    ["unknown", "error"].includes(r.status),
  ).length;
  async function collect() {
    setCollecting(true);
    const recordId = d.recordRef.current.id;
    try {
      const system = validateSystem(await desktop.collectSystem());
      if (d.recordRef.current.id !== recordId) {
        d.setNotice(
          "系统 JSON 已保存到报告目录；当前记录已切换，可从报告中心导入",
        );
      } else {
        d.patchRecord({ system, assessmentSnapshot: null });
        d.save();
        d.setNotice("系统信息已采集并合并；此操作未修改系统设置");
      }
    } catch (e) {
      d.setNotice("采集失败：" + e.message);
    } finally {
      setCollecting(false);
    }
  }
  function saveMerged() {
    const exported = prepareExport(d.recordRef.current, d.exportMasked);
    download(
      "NetworkDesk-merged-" + exported.id.slice(0, 8) + ".html",
      reportHTML(exported, d.exportMasked),
      "text/html;charset=utf-8",
    );
  }
  return (
    <>
      {expanded && (
        <section className="desktop-report-panel" aria-label="报告选项">
          <div className="card-heading">
            <h2>报告与数据</h2>
            <button
              aria-label="关闭报告选项"
              onClick={() => setExpanded(false)}
            >
              <Icon name="x-lg" />
            </button>
          </div>
          <p className="muted">
            {d.record.system ? "已合并系统信息" : "系统信息尚未采集"} ·{" "}
            {d.record.client || "来源见原始记录"}
          </p>
          <ReportActions />
          <a href="/reports/" onClick={() => setExpanded(false)}>
            打开报告中心与历史记录 <Icon name="arrow-right" />
          </a>
        </section>
      )}
      <footer className="desktop-dock" aria-label="本次检测任务栏">
        <span className="dock-symbol">
          <Icon name="file-earmark-text" />
        </span>
        <div className="dock-task">
          <strong>本次检测</strong>
          <span>
            {collecting
              ? "正在采集系统信息…"
              : pending.length
                ? pending[0].label
                : entries.length
                  ? "本轮检测已结束"
                  : "等待开始检测"}
          </span>
        </div>
        <div className="dock-progress">
          <strong>
            {done} / {entries.length} <small>已结束</small>
          </strong>
          <progress
            aria-label="本次检测进度"
            value={done}
            max={entries.length || 1}
          />
        </div>
        <Badge tone={issues ? "warn" : "neutral"}>
          {issues
            ? issues + " 项待确认"
            : pending.length
              ? "检测中"
              : "查看真实结果"}
        </Badge>
        <div className="dock-actions">
          <button disabled={collecting} onClick={collect}>
            <Icon name="gear" /> {collecting ? "采集中…" : "采集系统信息"}
          </button>
          <button disabled={!pending.length} onClick={d.stop}>
            <Icon name="pause" /> 停止
          </button>
          <button
            className="primary"
            disabled={!entries.length && !d.record.system}
            onClick={saveMerged}
          >
            <Icon name="file-earmark-arrow-down" /> 保存合并报告
          </button>
          <button
            onClick={() =>
              desktop.openReportFolder().catch((e) => d.setNotice(e.message))
            }
          >
            <Icon name="folder2" /> 打开报告目录
          </button>
          <button
            className="dock-options"
            aria-label="更多报告选项"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            <Icon name={expanded ? "chevron-down" : "chevron-up"} />
          </button>
        </div>
      </footer>
    </>
  );
}
