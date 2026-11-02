import React, { useEffect, useRef, useState } from "react";
import { useDesk } from "./state.jsx";
import { desktop } from "./storage.mjs";
import { useChecks } from "./useChecks.jsx";
import { api, cloudflareSpeed } from "./checks.mjs";
import { canonicalIP, observation } from "../shared/model.mjs";
import { TargetBatch, CaptchaPanel } from "./extended-tools.jsx";
import {
  Card,
  Row,
  Badge,
  Raw,
  Evidence,
  ResultLine,
  Copy,
  DataText,
  IPLinks,
  QueryForm,
  DataGrid,
  ReportActions,
  HistoryCard,
  Icon,
} from "./components.jsx";
import {
  PageHeading,
  ScoreCard,
  Properties,
  Security,
  ConnectivityRows,
} from "./diagnostics.jsx";

export function IPPage() {
  const d = useDesk(),
    c = useChecks();
  const [value, setValue] = useState(
    new URLSearchParams(location.search).get("ip") || d.selected || "",
  );
  const [provider, setProvider] = useState("coffee");
  const [ip, setIP] = useState(canonicalIP(value) || "");
  const once = useRef(false);
  async function query() {
    const target = value.trim()
      ? canonicalIP(value.trim())
      : (await c.exit("ipv4"))?.data?.ip;
    if (!target) {
      d.setNotice("请输入完整 IPv4 / IPv6，不要包含省略号");
      return;
    }
    setIP(target);
    setValue(target);
    d.setSelected(target);
    await c.risk(target, provider);
  }
  useEffect(() => {
    if (
      value &&
      !once.current &&
      (!d.imported ||
        canonicalIP(new URLSearchParams(location.search).get("ip")))
    ) {
      once.current = true;
      query();
    }
  }, []);
  const result = d.record.results["risk:" + ip];
  const intel = result?.data;
  const raw = intel?.match ? intel.raw : null;
  async function runDetail(section) {
    d.task(
      "detail:" + section + ":" + ip,
      d.config?.detailSections[section]?.label || section,
      async () => {
        const data = await api("detail", { ip, section, asn: intel?.asn });
        return {
          status: data.available ? "ok" : "unknown",
          summary: data.available ? "已取得供应方响应（见证据）" : data.reason,
          source: data.source,
          execution: "remote-probe",
          target: ip,
          data,
        };
      },
    );
  }
  return (
    <>
      <PageHeading
        title="IP 评分与网络情报"
        description="指定完整 IP 查询、信誉核验、多源定位、ASN、路由与网段信息"
      />
      <QueryForm
        value={value}
        setValue={setValue}
        onSubmit={query}
        busy={result?.status === "running"}
        placeholder="输入 IPv4 / IPv6，留空查询当前出口"
        required={false}
      >
        <select
          aria-label="IP 数据源"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
        >
          <option value="coffee">Net.Coffee 公共接口</option>
          <option value="ipapi">ipapi.is</option>
        </select>
      </QueryForm>
      {ip && (
        <>
          <div className="selected-ip">
            <b>
              <DataText value={ip} />
            </b>
            <Copy value={ip} />
            <IPLinks ip={ip} />
          </div>
          <div className="grid three assessment-grid">
            <ScoreCard ip={ip} />
            <Properties ip={ip} />
            <Security ip={ip} />
          </div>
          <Card title="多源地理位置与网络属性">
            <DataGrid value={raw?.geo_sources || raw?.location || null} />
            <div className="grid two">
              <DataGrid
                value={
                  raw
                    ? {
                        反向DNS: raw.rdns,
                        网段: raw.cidr,
                        注册地址: raw.registered_country,
                        原生属性:
                          raw.registered_country_code && raw.countryCode
                            ? raw.registered_country_code.toUpperCase() ===
                              raw.countryCode.toUpperCase()
                              ? "注册地与定位国家一致（不等于住宅）"
                              : "注册地与定位国家不同"
                            : "未提供",
                        RPKI: raw.rpki_status,
                      }
                    : null
                }
              />
              <DataGrid
                value={
                  raw
                    ? {
                        ASN名称: raw.asname,
                        网络类型: raw.asn_kind,
                        ASN分配时间: raw.asn_allocated,
                        IPv4地址数: raw.asn_ipv4_count,
                        数据中心: raw.datacenter_name,
                        公共服务: raw.public_service,
                      }
                    : null
                }
              />
            </div>
            <Evidence result={result} />
            <button
              onClick={() =>
                d.task("ripe:" + ip, "RIPEstat 独立路由查询", async () => {
                  const data = await api("ripe", { ip });
                  return {
                    status: "ok",
                    summary: "已取得 RIPE 路由信息",
                    source: data.source,
                    execution: "local-service",
                    target: ip,
                    data,
                  };
                })
              }
            >
              使用 RIPEstat 交叉查询
            </button>
            {d.record.results["ripe:" + ip] && (
              <>
                <ResultLine result={d.record.results["ripe:" + ip]} />
                <DataGrid
                  value={d.record.results["ripe:" + ip].data?.data?.data}
                />
              </>
            )}
          </Card>
          <div className="grid two">
            {Object.entries(d.config?.detailSections || {}).map(
              ([key, section]) => {
                const r = d.record.results["detail:" + key + ":" + ip];
                return (
                  <Card
                    key={key}
                    title={section.label}
                    actions={
                      <button
                        disabled={r?.status === "running"}
                        onClick={() => runDetail(key)}
                      >
                        {r ? "重新查询" : "查询"}
                      </button>
                    }
                  >
                    <ResultLine result={r} />
                    {key === "ports" && (
                      <p className="fine">
                        点击后由第三方探测此公网 IP
                        的端口；仅用于你有权检测的目标。
                      </p>
                    )}
                    {r?.data?.data && <DataGrid value={r.data.data} />}
                    <Evidence result={r} />
                  </Card>
                );
              },
            )}
          </div>
          <Card title="关联信息与历史">
            <DataGrid
              value={
                raw
                  ? {
                      关联域名: raw.related_domains,
                      地区历史: raw.location_history,
                      ASN历史: raw.asn_history,
                      企业历史: raw.company_history,
                      机房邻居: raw.dc_neighbors,
                      威胁证据: raw.intelligence,
                      VPN线索: raw.vpn_trace,
                    }
                  : null
              }
            />
          </Card>
        </>
      )}
      {!ip && (
        <Card title="开始查询">
          <p>
            输入地址，或在首页与平台检测页中点击出口
            IP。未取得数据时不会生成本地猜测评分。
          </p>
        </Card>
      )}
    </>
  );
}
export function LinkPage() {
  const d = useDesk(),
    c = useChecks();
  const [selected, setSelected] = useState([
    "google",
    "accounts",
    "gmail",
    "github",
    "cloudflare",
    "claude",
    "chatgpt",
    "youtube",
    "bytedance",
    "taobao",
    "wechat",
  ]);
  const [group, setGroup] = useState("全部"),
    [search, setSearch] = useState(""),
    [samples, setSamples] = useState(1),
    [execution, setExecution] = useState("local-service"),
    [busy, setBusy] = useState(false);
  const stopped = useRef(false);
  useEffect(
    () => () => {
      stopped.current = true;
    },
    [],
  );
  const region = (k, v) =>
    v.region ||
    (["bytedance", "taobao", "wechat", "deepseek"].includes(k)
      ? "中国"
      : "全球");
  const targets = Object.entries(d.config?.targets || {}).filter(
    ([k]) =>
      !["ipv4", "ipv6", "domestic", "netease_exit", "bytedance_exit"].includes(
        k,
      ),
  );
  const visible = targets.filter(
    ([k, v]) =>
      (group === "全部" || region(k, v) === group) &&
      v.label.toLowerCase().includes(search.toLowerCase()),
  );
  const options = { samples, execution };
  async function run() {
    setBusy(true);
    stopped.current = false;
    const id = d.generation.current;
    try {
      for (let i = 0; i < selected.length; i += 3) {
        if (stopped.current || d.generation.current !== id) break;
        await Promise.all(
          selected.slice(i, i + 3).map((t) => c.connectivity(t, options)),
        );
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        title="网络连通性检测"
        description="按地区与目标采样 HTTP 响应和耗时，支持浏览器 / 本机服务、逐项重试和停止后续目标"
      />
      <Card title="检测目标与请求方式">
        <div className="actions">
          <label>
            目标地区{" "}
            <select value={group} onChange={(e) => setGroup(e.target.value)}>
              {["全部", "中国", "日本", "美国", "全球"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <input
            aria-label="筛选连通性目标"
            placeholder="筛选目标"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            disabled={busy}
            onClick={() => setSelected(visible.map(([k]) => k))}
          >
            选择当前分组
          </button>
          <button disabled={busy} onClick={() => setSelected([])}>
            清空选择
          </button>
        </div>
        <details className="target-picker">
          <summary>
            选择检测目标（已选 {selected.length} / {targets.length}）
          </summary>
          <div className="target-options">
            {visible.map(([k, v]) => (
              <label key={k}>
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={selected.includes(k)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, k]
                        : selected.filter((x) => x !== k),
                    )
                  }
                />
                {v.label}
              </label>
            ))}
          </div>
        </details>
        <div className="actions">
          <label>
            每目标采样次数{" "}
            <select
              value={samples}
              disabled={busy}
              onChange={(e) => setSamples(Number(e.target.value))}
            >
              {[1, 3, 8].map((n) => (
                <option key={n} value={n}>
                  {n} 次
                </option>
              ))}
            </select>
          </label>
          <label>
            请求来源{" "}
            <select
              value={execution}
              disabled={busy}
              onChange={(e) => setExecution(e.target.value)}
            >
              <option value="local-service">
                本机服务（可读取 HTTP 状态）
              </option>
              <option value="browser">浏览器（跨域状态可能不可读）</option>
            </select>
          </label>
        </div>
        <ProxyOptions />
        <div className="actions">
          <button
            className="primary"
            onClick={run}
            disabled={busy || !selected.length}
          >
            开始全部检测
          </button>
          <button
            disabled={!busy}
            onClick={() => {
              stopped.current = true;
              d.setNotice("停止后续目标；当前采样完成后结束");
            }}
          >
            停止后续检测
          </button>
          <span>已选 {selected.length} 个目标</span>
        </div>
        <p className="fine">
          HTTP 403 表示目标拒绝请求；跨域 opaque
          响应不能判定服务正常。请求耗时不是 ICMP Ping，结果保留每次采样。
        </p>
      </Card>
      <div className="grid two compact-cards">
        {selected.map((t) => {
          const r = d.record.results["link:" + t];
          return (
            <Card
              key={t}
              icon="activity"
              title={d.config?.targets[t]?.label || t}
              actions={
                <button
                  disabled={busy || r?.status === "running"}
                  onClick={() => c.connectivity(t, options)}
                >
                  重试
                </button>
              }
            >
              <ResultLine result={r} />
              <div className="sample-strip">
                {r?.data?.samples?.map((s, i) => (
                  <span
                    key={i}
                    className={s.error ? "sample-error" : "sample-ok"}
                    title={
                      s.error ||
                      `HTTP ${s.httpStatus ?? "不可读"} · ${s.elapsedMs} ms`
                    }
                  >
                    {s.error ? "×" : s.elapsedMs + "ms"}
                  </span>
                ))}
              </div>
              <Evidence result={r} />
            </Card>
          );
        })}
      </div>
    </>
  );
}
export function ProxyOptions() {
  const { proxy, setProxy } = useDesk();
  return (
    <div className="proxy-options">
      <label>
        本机请求方式
        <select
          value={proxy.mode}
          onChange={(e) => setProxy({ ...proxy, mode: e.target.value })}
        >
          <option value="system">curl 默认路径 / 环境变量</option>
          <option value="direct">curl 显式不设 HTTP 代理</option>
          <option value="local">本机 HTTP 代理端口</option>
          <option value="socks5">本机 SOCKS5 代理端口（代理解析 DNS）</option>
        </select>
      </label>
      {["local", "socks5"].includes(proxy.mode) && (
        <label>
          127.0.0.1 端口
          <input
            type="number"
            min="1024"
            max="65535"
            value={proxy.port}
            onChange={(e) => setProxy({ ...proxy, port: e.target.value })}
          />
        </label>
      )}
      <small>
        请求方式与端口保存在{desktop ? "本软件的本机数据目录" : "此浏览器"}
        ，刷新后仍保留。TUN 仍可能接管连接；此选项不会修改系统代理。
      </small>
    </div>
  );
}
export function DNSPage() {
  const d = useDesk(),
    c = useChecks();
  const [name, setName] = useState("example.com"),
    [type, setType] = useState("A"),
    [resolver, setResolver] = useState("both");
  const [busy, setBusy] = useState(false);
  async function query() {
    setBusy(true);
    await Promise.all(
      (resolver === "both" ? ["cloudflare", "google"] : [resolver]).map((r) =>
        d.task("dns-query:" + r, "DNS 记录 · " + r, async () => {
          const data = await api("dns-query", { name, type, resolver: r });
          return {
            status: "ok",
            summary: `DNS 状态码 ${data.data.Status} · ${data.elapsedMs} ms`,
            source: data.source,
            execution: "local-service",
            target: name,
            data,
          };
        }),
      ),
    );
    setBusy(false);
  }
  const leak =
    Object.values(d.record.results).find(
      (x) => x.key.startsWith("dns-leak:") && x.status === "running",
    ) || d.record.results["dns-leak"];
  return (
    <>
      <PageHeading
        title="DNS 解析与泄露检测"
        description="分开查看权威回查观测与 DoH 记录查询，避免用 DNS 查询成功替代泄露结论"
      />
      <Card
        title="解析器出口回查"
        actions={
          <>
            <button
              className="primary"
              disabled={leak?.status === "running"}
              onClick={() => c.dns("quick")}
            >
              快速测试
            </button>
            <button
              disabled={leak?.status === "running"}
              onClick={() => c.dns("extended")}
            >
              深度测试（6 轮）
            </button>
          </>
        }
      >
        <ResultLine result={leak} />
        {leak?.data && (
          <p className="fine">
            {leak.data.rounds} 轮 · {leak.data.queries} 个唯一查询 · 已完成{" "}
            {leak.data.completedRounds} 轮
          </p>
        )}
        <p className="muted">
          由浏览器访问唯一域名，第三方权威服务返回可观察到的解析器。尚无结果、缓存或服务失败均显示无法确定。
        </p>
        {leak?.data?.resolvers?.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>解析器完整 IP</th>
                  <th>归属地区</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {leak.data.resolvers.map((ip, index) => (
                  <tr key={ip + ":" + index}>
                    <td>
                      <DataText value={ip} />
                      <Copy value={ip} />
                    </td>
                    <td>
                      {d.record.results["risk:" + ip]?.data?.country ||
                        "尚未查询"}
                    </td>
                    <td>
                      <button
                        disabled={!canonicalIP(ip)}
                        onClick={() => c.risk(ip)}
                      >
                        查询归属
                      </button>{" "}
                      <IPLinks ip={ip} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Evidence result={leak} />
      </Card>
      <Card title="DNS 记录查询 / 多源对照">
        <QueryForm
          value={name}
          setValue={setName}
          onSubmit={query}
          busy={busy}
          placeholder="输入域名"
        >
          <select
            aria-label="记录类型"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            {["A", "AAAA", "MX", "TXT", "NS", "CNAME", "SOA", "CAA", "PTR"].map(
              (t) => (
                <option key={t}>{t}</option>
              ),
            )}
          </select>
          <select
            aria-label="解析服务"
            value={resolver}
            onChange={(e) => setResolver(e.target.value)}
          >
            <option value="both">双源对照</option>
            <option value="cloudflare">Cloudflare</option>
            <option value="google">Google</option>
          </select>
        </QueryForm>
        <p className="fine">
          由本机服务向指定 DoH 服务查询记录；不代表浏览器正在使用该解析器。
        </p>
        <div className="grid two">
          {["cloudflare", "google"].map((r) => {
            const result = d.record.results["dns-query:" + r];
            return (
              <div key={r}>
                <h3>{r === "google" ? "Google DNS" : "Cloudflare DNS"}</h3>
                <ResultLine result={result} />
                <DataGrid value={result?.data?.data?.Answer} />
                <Evidence result={result} />
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}
export function WebRTCPage() {
  const d = useDesk(),
    c = useChecks();
  const [ip, setIP] = useState(d.selected);
  const [readingExit, setReadingExit] = useState(false);
  async function autoCompare() {
    setReadingExit(true);
    const generation = d.generation.current;
    try {
      const exit = await c.exit("ipv4");
      if (generation !== d.generation.current) return;
      const address = canonicalIP(exit?.data?.ip);
      if (!address) {
        d.setNotice(
          "未取得完整公网 IPv4，未执行对照。请重试或手动填写目标出口。",
        );
        return;
      }
      setIP(address);
      await c.rtc(address);
    } finally {
      setReadingExit(false);
    }
  }
  const r =
    Object.values(d.record.results).find(
      (x) => x.key.startsWith("webrtc:") && x.status === "running",
    ) || d.record.results.webrtc;
  return (
    <>
      <PageHeading
        title="WebRTC / UDP 出口检测"
        description="查看浏览器 ICE 候选、STUN 公网地址和与目标出口的差异"
      />
      <Card title="检测与对照">
        <QueryForm
          value={ip}
          setValue={setIP}
          label="对照出口 IP"
          required={false}
          placeholder="可填目标出口 IP，留空则仅展示候选"
          onSubmit={() => {
            if (ip && !canonicalIP(ip)) d.setNotice("对照地址必须是完整 IP");
            else c.rtc(ip);
          }}
          busy={readingExit || r?.status === "running"}
        />
        <button
          className="primary"
          onClick={autoCompare}
          disabled={readingExit || r?.status === "running"}
        >
          {readingExit ? "正在读取出口并对照…" : "自动获取公网 IPv4 并对照"}
        </button>{" "}
        <button
          onClick={() => c.rtc("")}
          disabled={readingExit || r?.status === "running"}
        >
          仅收集候选
        </button>
        <ResultLine result={r} />
        {r?.data?.candidates?.length > 0 && !r?.data?.expectedIP && (
          <p className="fine">
            候选已取得，但本次选择了仅采集，缺少对照出口。点击“自动获取公网 IPv4
            并对照”可补齐比较；不需要密钥。
          </p>
        )}
        <p className="muted">
          不申请摄像头或麦克风权限。mDNS 主机名、没有候选或 STUN
          超时均不能证明不存在泄露。
        </p>
        <DataGrid value={r?.data?.candidates} />
        <Evidence result={r} />
      </Card>
    </>
  );
}
export function CloudflarePage() {
  const d = useDesk(),
    c = useChecks();
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const abort = useRef();
  useEffect(() => {
    const stop = () => abort.current?.abort();
    window.addEventListener("network-desk:stop", stop);
    return () => {
      window.removeEventListener("network-desk:stop", stop);
      stop();
    };
  }, []);
  const r = d.record.results["egress:cloudflare"];
  const speed = d.record.results["cf-speed"];
  async function trace() {
    await c.exit("cloudflare");
  }
  async function test() {
    setBusy(true);
    abort.current = new AbortController();
    await d.task("cf-speed", "Cloudflare 采样测速", async () => ({
      status: "ok",
      summary: "已完成下载与上传采样",
      data: await cloudflareSpeed(abort.current.signal, setMessage),
      source: "Cloudflare Speed",
      execution: "browser",
    }));
    setMessage("");
    setBusy(false);
  }
  return (
    <>
      <PageHeading
        title="Cloudflare 网络诊断"
        description="查看出口、边缘节点、TLS、WARP 与浏览器测速样本"
        onRefresh={trace}
        busy={r?.status === "running"}
      />
      <div className="grid three">
        <Card title="Cloudflare 出口 IP">
          <div className="ip-value">
            <DataText value={r?.data?.ip} />
          </div>
          <Copy value={r?.data?.ip} />
          <IPLinks ip={r?.data?.ip} />
          <ResultLine result={r} />
          <button onClick={trace}>读取 Trace</button>
        </Card>
        <Card title="连接参数">
          <DataGrid
            value={
              r?.data?.trace
                ? {
                    边缘节点: r.data.trace.colo,
                    协议: r.data.trace.http,
                    TLS: r.data.trace.tls,
                    WARP: r.data.trace.warp,
                  }
                : null
            }
          />
        </Card>
        <Card title="请求信息">
          <DataGrid
            value={
              r?.data?.trace
                ? {
                    地区: r.data.trace.loc,
                    主机: r.data.trace.h,
                    SNI: r.data.trace.sni,
                    密钥交换: r.data.trace.kex,
                  }
                : null
            }
          />
          <Evidence result={r} />
        </Card>
      </div>
      <Card
        title="下载 / 上传采样测速"
        actions={
          <>
            <button className="primary" onClick={test} disabled={busy}>
              开始测速
            </button>
            <button onClick={() => abort.current?.abort()} disabled={!busy}>
              停止
            </button>
            <button
              disabled={busy}
              onClick={() => {
                d.put(
                  observation("cf-speed", "Cloudflare 采样测速", {
                    status: "unknown",
                    summary: "已重置，尚未检测",
                    observedAt: new Date().toISOString(),
                    data: null,
                  }),
                );
              }}
            >
              重置
            </button>
          </>
        }
      >
        <p className="muted">
          约下载 4.1 MB、上传 1 MB。浏览器 HTTP
          单连接结果包含请求开销，不能当作带宽上限。
        </p>
        <p role="status">{message}</p>
        <ResultLine result={speed} />
        <DataGrid value={speed?.data?.samples} />
        <Evidence result={speed} />
      </Card>
      <TargetBatch edge />
      <div className="grid two">
        <Properties ip={r?.data?.ip} platform="Cloudflare 参考" />
        <Security ip={r?.data?.ip} platform="Cloudflare 参考" />
      </div>
      <button disabled={!r?.data?.ip} onClick={() => c.risk(r.data.ip)}>
        查询该出口风险与属性
      </button>
      <CaptchaPanel />
      <HistoryCard />
    </>
  );
}
export function PingPage() {
  const d = useDesk();
  const [target, setTarget] = useState("example.com"),
    [regions, setRegions] = useState(["Japan", "United States", "Germany"]),
    [busy, setBusy] = useState(false);
  const stopped = useRef(false);
  const key = "global-ping";
  const r = d.record.results[key];
  async function run() {
    const recordId = d.generation.current;
    setBusy(true);
    stopped.current = false;
    await d.task(key, "全球 Ping", async () => {
      const job = await api(
        "global-ping",
        {},
        { method: "POST", body: JSON.stringify({ target, regions }) },
      );
      let result;
      for (let i = 0; i < 15; i++) {
        if (stopped.current || recordId !== d.generation.current) break;
        await new Promise((resolve) => setTimeout(resolve, 1500));
        if (stopped.current || recordId !== d.generation.current) break;
        result = await api("global-ping-result", { id: job.id });
        if (result.data.status === "finished") break;
      }
      return {
        status: result?.data?.status === "finished" ? "ok" : "unknown",
        summary: stopped.current
          ? "已停止轮询；远端已发出的测量可能继续"
          : result?.data?.status === "finished"
            ? "远端探针测量完成"
            : "测量尚未完成，可查看原始结果",
        source: "Globalping",
        execution: "remote-probe",
        target,
        data: result?.data || job,
      };
    });
    setBusy(false);
  }
  const rows = r?.data?.results?.map((x) => ({
    地区: [x.probe?.country, x.probe?.city].filter(Boolean).join(" · "),
    网络: x.probe?.network,
    地址: x.result?.resolvedAddress,
    平均延迟: x.result?.stats?.avg,
    最小: x.result?.stats?.min,
    最大: x.result?.stats?.max,
    丢包: x.result?.stats?.loss,
    状态: x.result?.status,
  }));
  return (
    <>
      <PageHeading
        title="全球 Ping"
        description="使用真实远端探针比较不同地区的网络路径与时延"
      />
      <Card title="目标与探针">
        <QueryForm
          value={target}
          setValue={setTarget}
          onSubmit={run}
          busy={busy}
        />
        <div className="target-options">
          {[
            ["Japan", "日本"],
            ["United States", "美国"],
            ["Germany", "德国"],
            ["Singapore", "新加坡"],
            ["United Kingdom", "英国"],
            ["Australia", "澳大利亚"],
            ["Hong Kong", "香港"],
            ["World", "全球随机"],
          ].map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={regions.includes(key)}
                disabled={!regions.includes(key) && regions.length >= 5}
                onChange={(e) =>
                  setRegions(
                    e.target.checked
                      ? [...regions, key]
                      : regions.filter((x) => x !== key),
                  )
                }
              />
              {label}
            </label>
          ))}
        </div>
        <p className="muted">
          每次最多 5 个探针，每探针 3 个 ICMP 包。匿名额度由 Globalping
          控制；限流或无节点将保留原因。
        </p>
        <button
          disabled={!busy}
          onClick={() => {
            stopped.current = true;
          }}
        >
          停止轮询
        </button>
      </Card>
      <Card title="测量结果">
        <ResultLine result={r} />
        <DataGrid value={rows} />
        <Evidence result={r} />
      </Card>
    </>
  );
}
