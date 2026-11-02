import { TargetBatch } from "./extended-tools.jsx";
import { desktop } from "./storage.mjs";
import { ProxyOptions } from "./network-tools.jsx";
import { riskResult } from "../shared/model.mjs";
import React, { useEffect, useRef, useState } from "react";
import { useDesk, navigate } from "./state.jsx";
import { useChecks } from "./useChecks.jsx";
import { api } from "./checks.mjs";
import {
  canonicalIP,
  REFERENCE_PRESETS,
  assessReference,
  maskIP,
} from "../shared/model.mjs";
import {
  Card,
  EgressTile,
  Row,
  Badge,
  Flag,
  Copy,
  DataText,
  IPLinks,
  Raw,
  Evidence,
  ResultLine,
  ReportActions,
  EnvironmentCard,
  HistoryCard,
  Icon,
  QueryForm,
  DataGrid,
  planeLabel,
} from "./components.jsx";

const exitIcons = {
  ipv4: "globe2",
  ipv6: "hdd-network",
  domestic: "geo-alt",
  cloudflare: "cloud",
  claude: "stars",
  chatgpt: "chat-square-text",
  openai: "braces",
};
const targetIcons = {
  bytedance: "bar-chart-fill",
  taobao: "bag-fill",
  wechat: "chat-dots-fill",
  github: "github",
  cloudflare: "cloud-fill",
  youtube: "play-btn-fill",
};

function RegionStatus({ platform }) {
  const { record } = useDesk();
  const c = useChecks();
  const key = platform.includes("Claude")
    ? "claude"
    : platform.includes("ChatGPT")
      ? "gpt"
      : null;
  const result = key ? record.results["region:" + key] : null;
  const country = result?.target || result?.data?.country;
  return (
    <details className="region-status">
      <summary>
        <span>{key ? platform + "支持地区" : "服务地区说明"}</span>
        <Badge
          tone={
            result?.data?.applicable === true
              ? "good"
              : result?.data?.applicable === false
                ? "warn"
                : "neutral"
          }
        >
          {result?.data?.applicable === true
            ? "名单列出"
            : result?.data?.applicable === false
              ? "未列出"
              : "需核对"}
        </Badge>
      </summary>
      {result && (
        <>
          <ResultLine result={result} />
          {result.data?.action && <p className="fine">{result.data.action}</p>}
          <div className="actions">
            <button
              disabled={!country || result.status === "running"}
              onClick={() => c.region(key, country, true)}
            >
              重新核验地区
            </button>
            {/^https:\/\//.test(result.source) && (
              <a href={result.source} target="_blank" rel="noreferrer">
                在浏览器查看官方名单
              </a>
            )}
          </div>
          <Evidence result={result} />
        </>
      )}
      <a href="/help/?topic=regions">查看官方名单与适用范围</a>
    </details>
  );
}
export function EgressCard({ target, title }) {
  const { record, masked, setSelected } = useDesk();
  const c = useChecks();
  const result = record.results["egress:" + target];
  const ip = result?.data?.ip;
  const intel = riskResult(record, ip)?.data;
  return (
    <Card
      className={"egress-card egress-" + target}
      icon={exitIcons[target] || "globe2"}
      title={title}
      actions={<Copy value={ip} />}
    >
      <div className="ip-value" title={masked ? "IP 已隐藏" : ip}>
        {ip ? (
          <button className="ip-select" onClick={() => setSelected(ip)}>
            {masked ? maskIP(ip) : ip}
          </button>
        ) : (
          <span className="unavailable">
            {result?.status === "running" ? "检测中…" : "未取得 IP"}
          </span>
        )}
      </div>
      <p className="egress-geo">
        {intel?.match ? (
          [intel.country, intel.city, intel.organization]
            .filter(Boolean)
            .join(" · ")
        ) : (
          <DataText value={result?.summary || "等待检测"} />
        )}
      </p>
      <details className="minor-details egress-tools">
        <summary
          aria-label="展开完整 IP 与工具"
          title="完整 IP、数据来源与关联工具"
        >
          <Icon name="chevron-down" />
          <span>
            {result ? planeLabel(result.execution) : "探测详情"}
            {ip ? " · 完整 IP 与工具" : ""}
          </span>
        </summary>
        {ip && (
          <>
            <p className="break">
              <DataText value={ip} />
            </p>
            <IPLinks ip={ip} />
          </>
        )}
        <button className="link-button" onClick={() => c.exit(target)}>
          重新探测
        </button>
        <Evidence result={result} />
      </details>
    </Card>
  );
}
export function ScoreCard({ ip, platform = "IP" }) {
  const desk = useDesk();
  const c = useChecks();
  const result = riskResult(desk.record, ip);
  const data = result?.data;
  const score = data?.score;
  const maskedSnapshot = desk.record.redacted && !canonicalIP(ip);
  const check = desk.record.results["score-check:" + ip];
  function recheck() {
    desk.task("score-check:" + ip, "同 IP 评分复查", async () => {
      const data = await api("score-check", { ip });
      return {
        status: data.match ? "ok" : "unknown",
        summary: data.reason,
        data,
        source: data.source,
        target: ip,
        execution: "local-service",
      };
    });
  }
  return (
    <Card title="IP 信誉参考评分 (TRUST SCORE)" className="score-card">
      <div className="score-number">
        {score ?? "—"}{" "}
        <Badge tone={score != null ? "good" : "neutral"}>
          {score == null ? "无法评分" : "第三方参考"}
        </Badge>
      </div>
      <p className="score-caption">第三方参考，非平台官方评分</p>
      <div
        className={"score-track " + (score == null ? "empty" : "")}
        aria-label={score == null ? "暂无有效评分" : "评分 " + score + " / 100"}
      >
        {score != null && (
          <span className="score-pointer" style={{ left: score + "%" }} />
        )}
      </div>
      <div className="score-ticks">
        <span>0 低</span>
        <span>25</span>
        <span>50</span>
        <span>75</span>
        <span>100 高</span>
      </div>
      <div className="ip-verify">
        <b>自动同 IP 核验</b>
        <p>{maskedSnapshot ? "导入的脱敏记录" : "本次核验的完整 IP"}</p>
        <strong className="break">
          <DataText value={ip || "尚未取得"} />
        </strong>
        <p className={data?.match ? "good-text" : "muted"}>
          {maskedSnapshot
            ? data
              ? "采集时核验结果（导入快照）"
              : "脱敏地址无法唯一关联，请查看报告明细"
            : data?.match
              ? "完整 IP 一致"
              : data?.reason || result?.summary || "等待完整 IP"}
        </p>
        <div className="verification-actions">
          <details>
            <summary>核验详情</summary>
            <p className="muted">
              {data?.source || "未取得数据源"}。不同目标测得的出口分别保留。
            </p>
            {check && (
              <>
                <ResultLine result={check} />
                <Raw value={check.data} />
              </>
            )}
            <div className="actions">
              <button
                disabled={!canonicalIP(ip) || result?.status === "running"}
                onClick={() => c.risk(ip)}
              >
                刷新评分
              </button>
              <button
                disabled={!canonicalIP(ip) || check?.status === "running"}
                onClick={recheck}
              >
                同 IP 复查
              </button>
            </div>
            <Evidence result={result} />
          </details>
          <ReportActions compact />
        </div>
      </div>
      <RegionStatus platform={platform} />
    </Card>
  );
}
export function Properties({ ip, platform = "IP" }) {
  const { record } = useDesk();
  const d = riskResult(record, ip)?.data;
  return (
    <Card title={platform + " 出口 IP 属性"}>
      <Row label="地区">{d?.country}</Row>
      <Row label="城市">{d?.city}</Row>
      <Row label="IP 属性">
        <Badge tone={d?.hosting ? "warn" : "neutral"}>
          {d?.hosting === true
            ? "机房 IP"
            : d?.residential === true
              ? "住宅 IP"
              : d?.hosting === false
                ? "非机房（供应方标记）"
                : "未提供"}
        </Badge>
      </Row>
      <Row label="ASN">{d?.asn ? "AS" + d.asn : null}</Row>
      <Row label="运营商">{d?.organization}</Row>
    </Card>
  );
}
export function Security({ ip, platform = "IP" }) {
  const { record } = useDesk();
  const d = riskResult(record, ip)?.data;
  return (
    <Card title={platform + " 出口 IP 安全检测"}>
      {[
        ["VPN", "vpn"],
        ["代理 (Proxy)", "proxy"],
        ["Tor", "tor"],
        ["机器人 (Crawler)", "crawler"],
        ["滥用记录", "abuse"],
      ].map(([title, key]) => (
        <Row key={key} label={title}>
          <Flag value={d?.[key]} />
        </Row>
      ))}
    </Card>
  );
}
export function ConnectivityRows({ targets }) {
  const { record, config } = useDesk();
  const c = useChecks();
  return targets.map((target) => {
    const r = record.results["link:" + target];
    return (
      <div key={target} className="data-row">
        <span className="target-label">
          <span className={"target-icon target-" + target}>
            <Icon name={targetIcons[target] || "globe2"} />
          </span>
          {config?.targets[target]?.label || target}
        </span>
        <span className="link-result">
          <Badge
            tone={
              !r
                ? "neutral"
                : r.data?.httpStatus >= 200 && r.data?.httpStatus < 400
                  ? "good"
                  : r.data?.httpStatus
                    ? "warn"
                    : "neutral"
            }
          >
            {r?.status === "running"
              ? "检测中"
              : r?.data?.httpStatus
                ? "HTTP " + r.data.httpStatus
                : r?.status === "error"
                  ? "失败"
                  : r?.status === "unknown"
                    ? "无法判定"
                    : "待检测"}
          </Badge>
          {r?.data?.elapsedMs != null && <small>{r.data.elapsedMs} ms</small>}
          <button
            className="icon-button"
            title={"重试 " + target}
            aria-label={"重试 " + target}
            onClick={() => c.connectivity(target)}
          >
            <Icon name="arrow-clockwise" />
          </button>
        </span>
      </div>
    );
  });
}
export function LeakCards({ ip, platform }) {
  const { record } = useDesk();
  const c = useChecks();
  const dns =
      Object.values(record.results).find(
        (r) => r.key.startsWith("dns-leak:") && r.status === "running",
      ) || record.results["dns-leak"],
    rtc = record.results["webrtc:" + (ip || "collect")];
  const targets =
    platform === "gpt"
      ? ["chatgpt", "openai"]
      : platform === "google"
        ? ["google", "accounts", "gmail"]
        : ["claude", "anthropic"];
  return (
    <div className="grid three leak-grid">
      <Card
        title={
          platform === "gpt"
            ? "GPT · Codex 可用性检测"
            : platform === "google"
              ? "Google / Gmail 连通性"
              : "Claude 可用性检测"
        }
        actions={
          <button onClick={() => Promise.all(targets.map(c.connectivity))}>
            刷新
          </button>
        }
      >
        <ConnectivityRows targets={targets} />
        <details className="evidence">
          <summary>响应明细</summary>
          <p className="fine">本机服务 HTTP 观测，响应状态不代表账号可用。</p>
          {targets.map((t) => (
            <Evidence key={t} result={record.results["link:" + t]} />
          ))}
        </details>
      </Card>
      <Card
        title="DNS 泄露检测"
        actions={
          <a className="small-button" href="/dns/">
            查询 DNS 安全
          </a>
        }
      >
        <ResultLine result={dns} />
        <button
          className="link-button"
          disabled={dns?.status === "running"}
          onClick={c.dns}
        >
          快速回查
        </button>
        <Evidence result={dns} />
      </Card>
      <Card
        title="WebRTC UDP 泄露检测"
        actions={
          <a className="small-button" href="/webrtc/">
            深度查询
          </a>
        }
      >
        <ResultLine result={rtc} />
        <button
          className="link-button"
          disabled={rtc?.status === "running"}
          onClick={() => c.rtc(ip)}
        >
          重新检测
        </button>
        <Evidence result={rtc} />
      </Card>
    </div>
  );
}
function RegistrationNotice({ ipv6 }) {
  return (
    <div className="notice">
      <p>
        {ipv6
          ? "检测到 IPv6 出口，部分结果可能不完整。"
          : "出口与环境检查仅供诊断参考。"}{" "}
        <a href="/help/?topic=ipv6">查看本地说明</a>
      </p>
      <details>
        <summary>
          <b>注册账户须知：</b>代理与系统参考配置　展开
        </summary>
        <p>
          1、代理软件：关闭
          IPv6，虚拟网卡模式，全局模式，节点：日本；2、操作系统：时区：UTC
          +09:00，语言：日本，国家或地区：日本，区域：日本，语言：日本，浏览器：Edge。
        </p>
        <p className="fine">
          以上为你保存的参考配置，可用于对照；它不是平台官方要求，也不保证注册、登录或免手机验证。检测工具不会修改系统设置。
        </p>
        <a href="/google/">Google / Gmail 环境检测</a>
      </details>
    </div>
  );
}
export function PlatformPage({ platform }) {
  const d = useDesk(),
    c = useChecks();
  const target = platform === "gpt" ? "chatgpt" : "claude";
  const title = platform === "gpt" ? "ChatGPT · Codex" : "Claude AI";
  const ip = d.record.results["egress:" + target]?.data?.ip;
  const initiated = useRef(false);
  const busy = Object.values(d.record.results).some(
    (r) => r.status === "running",
  );
  useEffect(() => {
    if (d.config && !initiated.current) {
      initiated.current = true;
      if (
        !d.imported &&
        (!d.record.results["egress:" + target] ||
          !d.record.results[
            "link:" + (platform === "gpt" ? "openai" : "anthropic")
          ])
      )
        c.scan(platform);
    }
  }, [d.config]);
  return (
    <>
      <PageHeading
        title={title + " IP 风险检测"}
        description={
          "检测当前" +
          title +
          "出口 IP 纯净度、风险、属性（住宅/机房）、DNS、UDP、时区、指纹、历史和安全性"
        }
        onRefresh={() => c.scan(platform)}
        busy={busy}
      />
      <RegistrationNotice ipv6={ip?.includes(":")} />
      <div className="grid three">
        <EgressCard target="domestic" title="国内探测出口 IPv4" />
        <EgressCard target="cloudflare" title="Cloudflare 出口 IP" />
        <EgressCard target={target} title={title + " 出口 IP"} />
      </div>
      <div className="grid three assessment-grid">
        <ScoreCard ip={ip} platform={title} />
        <Properties ip={ip} platform={title} />
        <Security ip={ip} platform={title} />
      </div>
      <LeakCards ip={ip} platform={platform} />
      <EnvironmentCard />
      <HistoryCard />
    </>
  );
}
export function PageHeading({ title, description, onRefresh, busy }) {
  const { masked, setMasked, setNotice } = useDesk();
  return (
    <header className="page-heading">
      <div className="title-row">
        <h1>{title}</h1>
        <span className="product-name">网络诊断台</span>
        {onRefresh && (
          <button className="refresh-page" disabled={busy} onClick={onRefresh}>
            <Icon name="arrow-clockwise" />
            {busy ? "检测中…" : "重新检测"}
          </button>
        )}
        {desktop && (
          <button
            className="browser-recheck"
            onClick={() =>
              desktop
                .openBrowser(location.pathname + location.search)
                .catch((e) => setNotice(e.message))
            }
          >
            <Icon name="box-arrow-up-right" /> 在浏览器中复测
          </button>
        )}
      </div>
      <div className="description">
        <p>{description}</p>
        <label className="mask-switch">
          隐藏 IP{" "}
          <input
            type="checkbox"
            role="switch"
            checked={masked}
            onChange={(e) => setMasked(e.target.checked)}
          />
        </label>
      </div>
    </header>
  );
}
export function HomePage() {
  const d = useDesk(),
    c = useChecks();
  const once = useRef(false);
  const [query, setQuery] = useState("");
  const busy = Object.values(d.record.results).some(
    (r) => r.status === "running",
  );
  useEffect(() => {
    if (d.config && !once.current) {
      once.current = true;
      if (
        !d.imported &&
        (!d.record.results["egress:ipv4"] || !d.record.results["link:github"])
      )
        c.scan("home");
    }
  }, [d.config]);
  const targets = [
    "ipv4",
    "ipv6",
    "domestic",
    "cloudflare",
    "claude",
    "chatgpt",
    "openai",
  ];
  const exits = targets
    .map((t) => d.record.results["egress:" + t])
    .filter(Boolean);
  const ip = d.record.results["egress:ipv4"]?.data?.ip;
  const details = d.record.results["risk:" + ip]?.data;
  return (
    <>
      <PageHeading
        title="我的 IP 查询"
        description="查看当前的 IP 地址、地理位置、网络连通性和 IP 分流"
        onRefresh={() => c.scan("home")}
        busy={busy}
      />
      <Card title="当前网络概览" icon="diagram-3" className="network-overview">
        <div className="home-overview">
          <div className="primary-egress">
            <span className="egress-label">
              <Icon name="globe2" /> IPv4
            </span>
            <div className="ip-value">
              <DataText value={ip || "检测中…"} />
              <Copy value={ip} />
            </div>
            <p>
              {[details?.country, details?.region, details?.city]
                .filter(Boolean)
                .join(" ") || "地区尚未取得"}
            </p>
            <p className="muted">{details?.organization || "运营商未提供"}</p>
            <IPLinks ip={ip} />
          </div>
          <div className="overview-right">
            <EnvironmentCard />
            <div className="connectivity-title">
              <span>
                <Icon name="activity" /> 网络连通性
              </span>
              <a href="/link/">查看更多</a>
            </div>
            <div className="connectivity-grid">
              <ConnectivityRows
                targets={[
                  "bytedance",
                  "taobao",
                  "wechat",
                  "github",
                  "cloudflare",
                  "youtube",
                ]}
              />
            </div>
          </div>
        </div>
        <details className="exit-summary" open={desktop ? undefined : true}>
          <summary className="section-label">
            <span>
              <Icon name="shuffle" /> 分流出口 IP 汇总
            </span>
            <small>
              点击查看 IP 详情 <Icon name="arrow-right" />
            </small>
          </summary>
          <div className="exit-grid">
            {exits
              .filter((x) => x.data?.ip)
              .map((x) => (
                <a
                  href={"/ip/?ip=" + encodeURIComponent(x.data.ip)}
                  key={x.key}
                  data-egress={x.key.replace("egress:", "")}
                  onClick={() => d.setSelected(x.data.ip)}
                >
                  <span className="exit-label">
                    <Icon
                      name={exitIcons[x.key.replace("egress:", "")] || "globe2"}
                    />
                    {x.label}
                  </span>
                  <strong>
                    <DataText value={x.data.ip} />
                  </strong>
                </a>
              ))}
          </div>
        </details>
      </Card>
      <QueryForm
        value={query}
        setValue={setQuery}
        placeholder="查询其他 IPv4 / IPv6"
        onSubmit={() => {
          if (!canonicalIP(query.trim())) d.setNotice("请输入完整 IP");
          else navigate("/ip/?ip=" + encodeURIComponent(query.trim()));
        }}
      />
      <Card
        title="各目标的真实观测"
        icon="list-columns"
        className="observation-card"
        actions={
          <span className="observation-count">
            <Icon name="layers" /> {exits.length} 个目标
            <span aria-hidden="true">·</span>
            {exits.filter((r) => canonicalIP(r.data?.ip)).length} 个完整 IP
          </span>
        }
      >
        <div className="compact-grid" aria-label="各目标的真实观测">
          {exits.map((r) => {
            const target = r.key.replace("egress:", "");
            return (
              <EgressTile
                key={r.key}
                target={target}
                result={r}
                label={d.config?.targets[target]?.label || r.label}
                onRetry={() => c.exit(target)}
              />
            );
          })}
        </div>
      </Card>
      <TargetBatch />
      <HistoryCard />
    </>
  );
}
export function GooglePage() {
  const d = useDesk(),
    c = useChecks();
  const once = useRef(false);
  const [preset, setPreset] = useState("JP");
  const [custom, setCustom] = useState(
    d.record.reference || REFERENCE_PRESETS.JP,
  );
  useEffect(() => {
    if (d.record.reference) {
      setCustom(d.record.reference);
      setPreset("custom");
    }
  }, [d.record.reference]);
  useEffect(() => {
    if (d.config && !once.current) {
      once.current = true;
      if (
        !d.imported &&
        (!d.record.results["egress:ipv4"] || !d.record.results["link:accounts"])
      )
        c.scan("google");
    }
  }, [d.config]);
  const ref = d.record.reference;
  const assess = d.record.assessmentSnapshot || assessReference(d.record, ref);
  const ip = d.record.results["egress:ipv4"]?.data?.ip;
  const busy = Object.values(d.record.results).some(
    (r) => r.status === "running",
  );
  return (
    <>
      <PageHeading
        title="Google / Gmail 环境检测"
        description="核对 IP 信誉、浏览器与系统环境，导入系统 JSON 后生成合并报告"
        onRefresh={() => c.scan("google")}
        busy={busy}
      />
      <div className="notice">
        <b>检测结论边界：</b>不能预测或保证绕过手机验证。IP
        信誉、参考配置匹配率与注册结果是不同指标。
        <p className="fine">
          公网 IP 是参考出口观测，不能证明访问 Google 使用了相同的出口。
        </p>
      </div>
      <div className="grid three">
        <EgressCard target="ipv4" title="公网 IPv4" />
        <EgressCard target="ipv6" title="公网 IPv6" />
        <EgressCard target="cloudflare" title="Cloudflare 出口 IP" />
      </div>
      <div className="grid three assessment-grid">
        <ScoreCard ip={ip} platform="Google" />
        <Properties ip={ip} platform="参考" />
        <Security ip={ip} platform="参考" />
      </div>
      <Card title="检测请求方式">
        <ProxyOptions />
        <p className="fine">
          修改后点击重新检测。仅影响本机服务请求；浏览器走当前浏览器网络。浏览器参考输入
          any 表示不限。
        </p>
      </Card>
      <Card title="参考配置与综合结论">
        <div className="reference-controls">
          <label>
            参考模板
            <select
              value={preset}
              onChange={(e) => {
                setPreset(e.target.value);
                if (REFERENCE_PRESETS[e.target.value])
                  setCustom(REFERENCE_PRESETS[e.target.value]);
              }}
            >
              {Object.entries(REFERENCE_PRESETS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
              <option value="custom">自定义</option>
            </select>
          </label>
          {[
            ["country", "国家代码"],
            ["timezone", "浏览器时区"],
            ["windowsZone", "Windows 时区 ID"],
            ["language", "语言"],
            ["browser", "浏览器"],
          ].map(([key, label]) => (
            <label key={key}>
              {label}
              {key === "browser" ? (
                <select
                  value={custom.browser}
                  onChange={(e) => {
                    setPreset("custom");
                    setCustom({ ...custom, browser: e.target.value });
                  }}
                >
                  {["Edge", "Chrome", "Firefox", "Safari", "any"].map((v) => (
                    <option key={v} value={v}>
                      {v === "any" ? "不限定" : v}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={custom[key]}
                  onChange={(e) => {
                    setPreset("custom");
                    setCustom({ ...custom, [key]: e.target.value });
                  }}
                />
              )}
            </label>
          ))}
          <label className="check-label">
            <input
              type="checkbox"
              checked={custom.ipv4Only}
              onChange={(e) =>
                setCustom({ ...custom, ipv4Only: e.target.checked })
              }
            />
            仅 IPv4 参考
          </label>
          <button
            onClick={() => {
              d.patchRecord({ reference: custom, assessmentSnapshot: null });
              d.save();
            }}
          >
            应用参考配置
          </button>
        </div>
        <div className="conclusion">
          <div>
            <b className="conclusion-value">
              {assess.percent ?? "—"}
              {assess.percent !== null ? "%" : ""}
            </b>
            <p>
              参考配置匹配率 · 已知 {assess.known}/{assess.total} 项
            </p>
          </div>
          <div>
            <strong>{assess.conclusion}</strong>
            <p>
              能否无需手机验证注册：<b>无法预测</b>
            </p>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>检查项目</th>
                <th>实测</th>
                <th>参考</th>
                <th>结论</th>
              </tr>
            </thead>
            <tbody>
              {assess.rows.map((r) => (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td>{r.actual}</td>
                  <td>{r.expected}</td>
                  <td>
                    <Badge
                      tone={
                        r.state === "match"
                          ? "good"
                          : r.state === "different"
                            ? "warn"
                            : "neutral"
                      }
                    >
                      {r.state === "match"
                        ? "一致"
                        : r.state === "different"
                          ? "不同"
                          : "无法确定"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <LeakCards ip={ip} platform="google" />
      <EnvironmentCard />
      <Card title="系统检测与报告合并">
        <p>
          运行随附的只读 PowerShell 脚本，生成 JSON
          后导入。系统结果保留采集时间，不覆盖浏览器观测。
        </p>
        <ReportActions />
        {d.record.system ? (
          <>
            <p className="good-text">
              已合并系统报告 ·{" "}
              {new Date(d.record.system.collectedAt).toLocaleString()}
            </p>
            <DataGrid
              value={{
                操作系统: d.record.system.os,
                时区: d.record.system.timezone,
                地区语言: d.record.system.region,
                网络: d.record.system.network,
              }}
            />
          </>
        ) : (
          <p className="muted">
            尚未导入系统报告：系统地区、网卡 IPv6 绑定、代理设置等显示未知。
          </p>
        )}
        <a href="/help/?topic=system">查看系统脚本运行步骤</a>
      </Card>
      <HistoryCard />
    </>
  );
}
