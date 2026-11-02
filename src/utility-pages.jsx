import React, { useEffect, useRef, useState } from "react";
import { useDesk } from "./state.jsx";
import { desktop } from "./storage.mjs";
import { useChecks } from "./useChecks.jsx";
import { api, download } from "./checks.mjs";
import { canonicalIP, maskIP, summarize } from "../shared/model.mjs";
import { CARD_THEMES, cardSVG, cardLines } from "../shared/card.mjs";
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
import { PageHeading } from "./diagnostics.jsx";
import { ProxyOptions } from "./network-tools.jsx";

export function WhoisPage() {
  const d = useDesk();
  const [query, setQuery] = useState(
      new URLSearchParams(location.search).get("ip") || d.selected || "",
    ),
    [tld, setTld] = useState(""),
    [tlds, setTlds] = useState([]);
  const r = d.record.results.whois;
  const once = useRef(false);
  async function run() {
    await d.task("whois", "Whois / RDAP", async () => {
      const data = await api("whois", { q: query });
      return {
        status: "ok",
        summary: "已取得注册局 RDAP 公开资料",
        source: data.source,
        execution: "local-service",
        target: query,
        data,
      };
    });
  }
  useEffect(() => {
    if (
      query &&
      !once.current &&
      (!d.imported ||
        canonicalIP(new URLSearchParams(location.search).get("ip")))
    ) {
      once.current = true;
      run();
    }
  }, []);
  const data = r?.data?.data;
  return (
    <>
      <PageHeading
        title="Whois / RDAP 查询"
        description="查询域名、IPv4、IPv6 与 ASN 的注册信息，按 IANA 注册表选择对应服务"
      />
      <QueryForm
        value={query}
        setValue={setQuery}
        onSubmit={run}
        placeholder="例如 example.com、1.1.1.1 或 AS13335"
        busy={r?.status === "running"}
      />
      <div className="grid two">
        <Card title="注册资料">
          <ResultLine result={r} />
          <DataGrid
            value={
              data
                ? {
                    名称: data.ldhName || data.name,
                    句柄: data.handle,
                    类型: data.objectClassName,
                    状态: data.status,
                    国家: data.country,
                    起始地址: data.startAddress,
                    结束地址: data.endAddress,
                    ASN起始: data.startAutnum,
                    ASN结束: data.endAutnum,
                    父级: data.parentHandle,
                    DNSSEC: data.secureDNS,
                  }
                : null
            }
          />
        </Card>
        <Card title="时间与名称服务器">
          <DataGrid value={data?.events} />
          <DataGrid value={data?.nameservers} />
        </Card>
      </div>
      <Card title="公开实体、备注与证据">
        <p className="muted">
          注册局可能隐藏注册人资料；未公开不等于没有记录。传统 Whois
          的公开信息优先通过 RDAP 展示。
        </p>
        <DataGrid value={data?.entities} />
        <DataGrid value={data?.remarks} />
        <Evidence result={r} />
      </Card>
      <Card title="支持的域名后缀">
        <button
          onClick={async () => {
            try {
              setTlds(await api("tlds"));
            } catch (e) {
              d.setNotice(e.message);
            }
          }}
        >
          加载 IANA 支持后缀
        </button>
        <input
          aria-label="筛选域名后缀"
          value={tld}
          onChange={(e) => setTld(e.target.value)}
          placeholder="筛选，如 com / jp"
        />
        <div className="tld-list">
          {tlds
            .filter((x) => x.includes(tld.replace(/^\./, "")))
            .slice(0, 120)
            .map((x) => (
              <span key={x}>.{x}</span>
            ))}
        </div>
      </Card>
    </>
  );
}

function drawCard(canvas, { ip, details, style, width, masked, badge }) {
  if (!canvas) return;
  const h = Math.round(width * 0.53);
  canvas.width = width * 2;
  canvas.height = h * 2;
  canvas.style.aspectRatio = `${width} / ${h}`;
  const g = canvas.getContext("2d");
  g.scale(2, 2);
  const theme = CARD_THEMES[style] || CARD_THEMES.light;
  g.fillStyle = theme.bg;
  g.fillRect(0, 0, width, h);
  g.fillStyle = theme.accent;
  g.globalAlpha = 0.22;
  g.beginPath();
  g.moveTo(width * 0.78, 0);
  g.lineTo(width, h * 0.4);
  g.lineTo(width, h);
  g.lineTo(width * 0.65, 0);
  g.fill();
  g.globalAlpha = 1;
  g.strokeStyle = theme.accent;
  g.strokeRect(0.5, 0.5, width - 1, h - 1);
  const p = width * 0.065;
  g.fillStyle = theme.fg;
  g.font = `${Math.round(width * 0.026)}px system-ui`;
  g.fillText("NETWORK DESK  /  网络诊断台", p, p + 8);
  g.textAlign = "right";
  g.fillText(badge || "", width - p, p + 8);
  g.textAlign = "left";
  g.fillStyle = theme.fg;
  const text = masked ? maskIP(ip) : ip || "等待 IP 信息";
  const size = text.length > 24 ? width * 0.043 : width * 0.062;
  g.font = `600 ${Math.round(size)}px system-ui`;
  g.fillText(text, p, h * 0.43, width - p * 2);
  g.font = `${Math.round(width * 0.032)}px system-ui`;
  g.fillText(
    [details?.country, details?.city].filter(Boolean).join(" · ") ||
      "地理位置未提供",
    p,
    h * 0.62,
    width - p * 2,
  );
  g.fillStyle = theme.fg;
  g.font = `${Math.round(width * 0.026)}px system-ui`;
  g.fillText(
    details?.organization || "运营商未提供",
    p,
    h * 0.75,
    width - p * 2,
  );
  g.fillText(
    details?.asn
      ? "AS" + String(details.asn).replace(/^AS/i, "")
      : "ASN 未提供",
    p,
    h * 0.88,
    width - p * 2,
  );
}
export function CardPage({ embed = false }) {
  const d = useDesk(),
    c = useChecks();
  const params = new URLSearchParams(location.search);
  const [input, setInput] = useState(params.get("ip") || d.selected || ""),
    [ip, setIP] = useState(canonicalIP(input) || ""),
    [style, setStyle] = useState(params.get("style") || "light"),
    [width, setWidth] = useState(640),
    [code, setCode] = useState(""),
    [badge, setBadge] = useState(""),
    [format, setFormat] = useState("html"),
    [motion, setMotion] = useState(false);
  const canvas = useRef();
  const once = useRef(false);
  const intel = d.record.results["risk:" + ip]?.data;
  const r = d.record.results["risk:" + ip];
  async function query() {
    const next = canonicalIP(input.trim());
    if (!next) {
      d.setNotice("请输入完整 IP");
      return;
    }
    setIP(next);
    d.setSelected(next);
    await c.risk(next);
  }
  useEffect(() => {
    if (
      d.config &&
      !once.current &&
      (!d.imported || canonicalIP(params.get("ip")))
    ) {
      once.current = true;
      if (ip) c.risk(ip);
      else if (embed)
        c.exit("ipv4").then((r) => {
          if (r?.data?.ip) {
            setIP(r.data.ip);
            setInput(r.data.ip);
            c.risk(r.data.ip);
          }
        });
    }
  }, [d.config]);
  useEffect(() => {
    drawCard(canvas.current, {
      ip,
      details: intel,
      style,
      width,
      masked: d.masked,
      badge,
    });
  }, [ip, intel, style, width, d.masked, badge]);
  function png() {
    canvas.current.toBlob((blob) => {
      if (blob) download("NetworkDesk-IP-card.png", blob, "image/png");
      else d.setNotice("图片编码失败，请重新生成卡片");
    }, "image/png");
  }
  async function copyImage() {
    try {
      const blob = await new Promise((resolve) =>
        canvas.current.toBlob(resolve, "image/png"),
      );
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      d.setNotice("IP 卡片图片已复制");
    } catch {
      d.setNotice("当前浏览器不支持复制图片，请导出 PNG");
    }
  }
  if (embed)
    return (
      <div className="embed-card">
        <canvas ref={canvas} aria-label="当前访客 IP 卡片" />
        <p className="fine">
          动态本地预览 · 数据来源 {intel?.source || "尚未取得"}
        </p>
      </div>
    );
  return (
    <>
      <PageHeading
        title="IP 卡片生成"
        description="为选定 IP 生成原创样式卡片，支持尺寸、图片导出、复制与嵌入"
      />
      <QueryForm
        value={input}
        setValue={setInput}
        onSubmit={query}
        busy={r?.status === "running"}
        placeholder="输入完整 IP"
      />
      <Card title="卡片设置与即时预览">
        <ResultLine result={r} />
        <Evidence result={r} />
        <div className="actions">
          <label>
            样式
            <select value={style} onChange={(e) => setStyle(e.target.value)}>
              {Object.entries(CARD_THEMES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            宽度
            <select
              value={width}
              onChange={(e) => setWidth(Number(e.target.value))}
            >
              {[240, 360, 480, 560, 640, 960].map((w) => (
                <option key={w} value={w}>
                  {w} px
                </option>
              ))}
            </select>
          </label>
        </div>
        <canvas className="ip-canvas" ref={canvas} aria-label="IP 卡片预览" />
        <div className="actions">
          <label>
            贴纸 / 短标签{" "}
            <input
              maxLength={16}
              aria-label="卡片贴纸"
              placeholder="例如 🌐、JP、我的网络"
              value={badge}
              onChange={(e) => setBadge(e.target.value)}
            />
          </label>
          <button
            onClick={() => {
              const keys = Object.keys(CARD_THEMES);
              setStyle(keys[Math.floor(Math.random() * keys.length)]);
              setBadge(
                ["🌐", "☕", "🛰️", "📍", "✨"][Math.floor(Math.random() * 5)],
              );
            }}
          >
            随机样式与贴纸
          </button>
          <label className="check-label">
            <input
              type="checkbox"
              checked={motion}
              onChange={(e) => setMotion(e.target.checked)}
            />
            SVG 背景呼吸动效
          </label>
        </div>
        <div className="actions">
          <button
            className="primary"
            onClick={png}
            disabled={!ip || r?.status === "running"}
          >
            导出 PNG
          </button>
          <button
            disabled={!ip || r?.status === "running"}
            onClick={() =>
              download(
                "NetworkDesk-IP-card.svg",
                cardSVG({
                  ip,
                  details: intel,
                  style,
                  width,
                  masked: d.masked,
                  badge,
                  motion,
                }),
                "image/svg+xml",
              )
            }
          >
            导出 SVG
          </button>
          <button onClick={copyImage} disabled={!ip || r?.status === "running"}>
            复制图片
          </button>
          <label>
            嵌入格式{" "}
            <select
              aria-label="嵌入格式"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
            >
              <option value="html">HTML</option>
              <option value="markdown">Markdown</option>
              <option value="bbcode">BBCode</option>
            </select>
          </label>
          <button
            onClick={() =>
              setCode(
                format === "markdown"
                  ? "![Network Desk IP card](./NetworkDesk-IP-card.png)"
                  : format === "bbcode"
                    ? "[img]https://YOUR-IMAGE-HOST/NetworkDesk-IP-card.png[/img]"
                    : `<img src="${canvas.current.toDataURL("image/png")}" alt="Network Desk IP card" width="${width}" />`,
              )
            }
            disabled={!ip || r?.status === "running"}
          >
            生成静态嵌入代码
          </button>
          <Copy value={ip} />
        </div>
        {code && (
          <label className="embed-code">
            静态图片嵌入代码（包含当前显示的数据）
            <textarea readOnly value={code} />
            <Copy value={code} label="复制嵌入代码" />
          </label>
        )}
        <p className="fine">
          Markdown 请把导出的 PNG 放在文档同目录；BBCode
          请替换为你上传后的公开图片地址。SVG 可选独立背景动效，PNG 为静态快照。
          PNG 为 2 倍清晰度。静态卡片记录当前查询；隐藏 IP
          开关同时影响卡片与图片。
        </p>
      </Card>
      <Card title="动态访客卡片">
        <p>
          本地预览会重新取得访问此页面的浏览器出口。公开动态服务需要单独部署后端和域名配置；本机地址不能被其他电脑直接访问。
        </p>
        <a
          className="button"
          href={"/card/embed/?style=" + encodeURIComponent(style)}
          target="_blank"
          rel="noreferrer"
        >
          打开动态本地预览
        </a>
        <p className="fine">同源嵌入示例</p>
        <code className="break">
          {'<iframe src="' +
            location.origin +
            "/card/embed/?style=" +
            style +
            '" width="640" height="390" title="IP 卡片"></iframe>'}
        </code>
      </Card>
    </>
  );
}

export function StatusPage() {
  const d = useDesk();
  const [category, setCategory] = useState("全部"),
    [faults, setFaults] = useState(false),
    [search, setSearch] = useState("");
  const once = useRef(false);
  const r = d.record.results.status;
  function refresh() {
    d.task("status", "官方服务状态", async () => {
      const data = await api("status");
      return {
        status: data.some((x) => x.ok) ? "ok" : "unknown",
        summary: `${data.filter((x) => x.ok).length}/${data.length} 个官方状态源已取得`,
        source: "各服务官方状态页",
        execution: "local-service",
        data,
      };
    });
  }
  useEffect(() => {
    if (!once.current && !d.imported) {
      once.current = true;
      refresh();
    }
  }, []);
  const services = (r?.data || [])
    .filter(
      (s) =>
        (category === "全部" || s.category === category) &&
        (!faults || !s.ok || s.data?.status?.indicator !== "none") &&
        s.name.toLowerCase().includes(search.toLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(a.ok && a.data?.status?.indicator === "none") -
        Number(b.ok && b.data?.status?.indicator === "none"),
    );
  return (
    <>
      <PageHeading
        title="服务状态"
        description="聚合官方状态源，故障优先显示；上游不可用时显示未知"
        onRefresh={refresh}
        busy={r?.status === "running"}
      />
      <div className="actions">
        <input
          aria-label="搜索服务"
          placeholder="搜索服务"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="服务分类"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {[
            "全部",
            ...new Set(
              Object.values(d.config?.statusSources || {}).map(
                (x) => x.category,
              ),
            ),
          ].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <label>
          <input
            type="checkbox"
            checked={faults}
            onChange={(e) => setFaults(e.target.checked)}
          />
          仅异常与未知
        </label>
      </div>
      <ResultLine result={r} />
      <div className="grid two compact-cards service-cards">
        {services.map((s) => (
          <Card
            key={s.id}
            title={s.name}
            actions={
              <Badge
                tone={
                  !s.ok
                    ? "neutral"
                    : s.data?.status?.indicator === "none"
                      ? "good"
                      : "warn"
                }
              >
                {!s.ok
                  ? "状态未知"
                  : s.data.status?.indicator === "none"
                    ? "官方报告正常"
                    : "存在事件"}
              </Badge>
            }
          >
            <p>{s.ok ? s.data.status?.description : s.error}</p>
            <details className="service-details">
              <summary>更新时间、事件与组件</summary>
              <p className="fine">
                抓取：{new Date(s.checkedAt).toLocaleString()}
                <br />
                上游更新时间：
                {s.data?.page?.updated_at
                  ? new Date(s.data.page.updated_at).toLocaleString()
                  : "未提供"}
              </p>
              <details>
                <summary>事件与维护 ({s.data?.incidents?.length || 0})</summary>
                {s.data?.incidents?.map((x) => (
                  <div key={x.id} className="incident">
                    <b>{x.name}</b>
                    <p>
                      {x.status} · {x.updated_at}
                    </p>
                    {x.incident_updates?.slice(0, 3).map((up) => (
                      <p key={up.id}>{up.body}</p>
                    ))}
                  </div>
                ))}
                <DataGrid value={s.data?.scheduled_maintenances} />
              </details>
              <details>
                <summary>组件详情</summary>
                <DataGrid
                  value={s.data?.components?.map((x) => ({
                    名称: x.name,
                    状态: x.status,
                    更新: x.updated_at,
                  }))}
                />
              </details>
            </details>
            <a href={s.page} target="_blank" rel="noreferrer">
              官方状态页 <Icon name="box-arrow-up-right" />
            </a>
          </Card>
        ))}
      </div>
      {!services.length && <p>没有符合筛选条件的服务。</p>}
    </>
  );
}

export function NewsPage() {
  const d = useDesk();
  const [source, setSource] = useState("openai"),
    [filter, setFilter] = useState("");
  const r = d.record.results["news:" + source];
  async function run() {
    await d.task("news:" + source, "资讯来源 · " + source, async () => {
      const data = await api("news", { source });
      return {
        status: "ok",
        summary: "已取得 " + data.entries.length + " 条来源条目",
        source: data.source,
        execution: "local-service",
        data,
      };
    });
  }
  return (
    <>
      <PageHeading
        title="AI 资讯与工具知识"
        description="查看公开 RSS 条目与来源链接；使用独立编写的本地说明，不收录搬运的文章全文"
      />
      <Card title="资讯来源">
        <div className="actions">
          <select
            aria-label="资讯来源"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            {(d.config?.feeds || []).map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <button onClick={run} disabled={r?.status === "running"}>
            刷新来源
          </button>
          <input
            aria-label="检索资讯"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="搜索标题"
          />
        </div>
        <ResultLine result={r} />
        <div className="news-list">
          {r?.data?.entries
            ?.filter((x) =>
              x.title.toLowerCase().includes(filter.toLowerCase()),
            )
            .map((x, i) => (
              <article key={i}>
                <a href={x.url} target="_blank" rel="noreferrer">
                  <h3>{x.title}</h3>
                </a>
                <p className="muted">
                  {x.date} · {r.source} · 原文在外部网站
                </p>
              </article>
            ))}
        </div>
        <a
          href={d.config?.feeds?.find((x) => x.id === source)?.page}
          target="_blank"
          rel="noreferrer"
        >
          打开所选官方来源
        </a>
      </Card>
      <Card title="本地知识说明">
        <HelpLinks />
      </Card>
    </>
  );
}

const HELP = {
  overview: {
    title: "如何使用网络诊断台",
    paragraphs: [
      "先在 IP 查询或平台检测页获取各目标的完整出口，再进入评分、Whois 和 IP 卡片。不同目标的出口可能不同，不应强行统一。",
      "每条检测记录包含时间、来源、请求路径与原始证据。浏览器、系统脚本和远端探针各有观测范围；报告按实际证据合并。",
      "所有栏目页面均由本地项目提供。实时检测仍需联网；外部接口失效时保留失败原因。",
    ],
  },
  ipv6: {
    title: "IPv6 与出口一致性",
    paragraphs: [
      "IPv6 与 IPv4 可能走不同的代理规则。判断是否符合你的网络策略，应对比完整出口和请求目标，不能只比较截断后的前缀。",
      "关闭 IPv6 是某些用户的参考配置，不是所有 AI 服务的通用要求。本工具不会修改网卡、注册表或系统代理。",
      "如果第三方返回的 IP 与查询地址不完全一致，评分和风险标签都不采用；同网段也不能代替同一 IP。",
    ],
  },
  regions: {
    title: "平台支持地区与结论边界",
    paragraphs: [
      "平台支持地区会变化，应以平台官方说明为准。本工具不依据旧文章或内置常量承诺服务可用。",
      "IP 信誉分数来自选定的数据源；配置匹配率仅对照你选择的参考值。这两者都不是注册成功概率，也不能预测是否需要手机验证。",
    ],
  },
  system: {
    title: "系统脚本与合并报告",
    paragraphs: [
      "Windows 本地运行包：双击“生成系统报告.cmd”，脚本会把 JSON 保存到 reports 文件夹。打开网页“报告中心”或 Google / Gmail 页，点击“导入系统 JSON / 报告”选中文件。",
      "源码包：在项目根目录运行 powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\collect-system.ps1。Bypass 仅作用于这次进程，不会永久改变执行策略。",
      "脚本只读取系统时区、区域、语言、网卡、DNS 配置和代理配置；不要求管理员权限，不采集账户密码，不更改网络设置。无法读取的字段会写入 limitations。",
      "导入成功后可导出 HTML 或 JSON。HTML 可以离线打开；默认隐藏 IP，若需完整证据，可取消“导出时隐藏 IP”。系统 JSON 本身包含网络信息，请勿放进公开仓库。",
    ],
  },
  configuration: {
    title: "数据源与本地配置",
    paragraphs: [
      "默认公共接口不需要你提供密钥。Net.Coffee 用于 IP 情报、扩展网络信息和 DNS 权威回查；它属于第三方服务，独立源码不代表拥有这些数据库。",
      "把 config.example.json 复制为 config.local.json，可配置 ipapiKey、globalpingToken、turnstileSiteKey、turnstileSecret、turnstileNoninteractiveSiteKey、turnstileNoninteractiveSecret、recaptchaSiteKey、recaptchaSecret。修改后重启。Secret 仅由本地服务读取；站点公钥发送给浏览器加载验证组件，Secret 不进入前端或报告。",
      "ipapi.is 匿名响应可能缺少风险字段；Globalping 可能限流或某地区没有探针；DNS 回查可能因缓存或服务变化没有结果。页面会区分这些状态，不使用假数据填充。",
      "本机服务默认使用 curl 的环境变量代理路径，也可在“网络连通”中选择本机 HTTP / SOCKS5 代理端口。Windows 系统代理配置不保证 curl 使用相同代理；TUN 可能接管任意路径。",
    ],
  },
  captcha: {
    title: "验证码检测：逐项配置",
    paragraphs: [
      "这三项用于验证你自己的站点集成。没有密钥时是“需要配置，未执行”，不是网络不纯净，也不是 Google/Gmail 注册失败。成功和分数只对你的站点有意义，不能预测其他网站的手机验证。",
      "EXE：配置文件位于 %APPDATA%\\NetworkDesk\\config.local.json，工具设置页显示完整路径。网页版：放在启动本地服务的项目根目录。以 config.example.json 为模板；已有文件只合并缺少字段，不要覆盖已有配置。保存后完整退出并重新启动。",
      "Turnstile 托管：在 Cloudflare 控制台 → Turnstile 创建自己的网站部件，选择 Managed，允许本机测试主机名 127.0.0.1（可同时允许 localhost）。将 Sitekey 填入 turnstileSiteKey，Secret key 填入 turnstileSecret。主机名不要填写协议、端口或路径。",
      "Turnstile 非交互：单独创建 Non-interactive 部件，将它的 Sitekey/Secret 分别填入 turnstileNoninteractiveSiteKey 和 turnstileNoninteractiveSecret。不能把托管密钥改个前端模式当成非交互密钥。",
      "reCAPTCHA：创建与你自己的 reCAPTCHA v3 / siteverify 集成兼容的公钥和 Secret，填入 recaptchaSiteKey 与 recaptchaSecret；不能填写 v2 密钥、Google Cloud API key 或 OpenAI API key。本工具使用 network_desk action，并检查返回的 hostname/action。",
      "reCAPTCHA 的本地开发允许列表应加入 localhost。如果控制台不接受 127.0.0.1，在外部浏览器把当前本地地址的 127.0.0.1 替换为 localhost，保留同一端口，再打开 Cloudflare 栏目；EXE 的其他检测仍可继续使用。不关闭域名验证，不修改 hosts、系统代理或防火墙。",
      "重启后到 Cloudflare → 站点人机验证选对应模式，确认“缺少字段”提示消失，再由你点击加载并完成实际验证。只有 Sitekey 是浏览器需要的公钥；Secret 不会发送到前端、报告或公开源码包。",
      "Cloudflare 官方测试密钥只能检验接入代码，不能用固定通过结果作为环境检测。reCAPTCHA v3 测试站点的评分也不代表真实业务环境；本项目不会自动填入测试密钥来消除未知项。",
    ],
  },
  privacy: {
    title: "隐私、历史与报告",
    paragraphs: [
      "项目没有统计脚本和遥测。网页版检测记录存储在当前站点 localStorage；EXE 的设置与历史保存在 %APPDATA%\\NetworkDesk。清空历史只清除当前运行环境保存的记录，不删除下载报告。",
      "请求第三方检测接口时，供应方会看到请求出口和查询目标 IP。Canvas 与设备摘要只用于本地显示及报告，不主动发送给情报接口。",
      "隐藏 IP 控制界面显示；报告的“导出时隐藏 IP”独立控制文件内容。公开 GitHub 源码包不包含个人检测报告、本机配置或密钥。",
    ],
  },
};
export function HelpLinks() {
  return (
    <div className="help-links">
      {Object.entries(HELP).map(([key, item]) => (
        <a href={"/help/?topic=" + key} key={key}>
          {item.title}
        </a>
      ))}
    </div>
  );
}
export function HelpPage() {
  const key =
    new URLSearchParams(location.search).get("topic") ||
    (location.pathname.endsWith("/ipv6.html") ? "ipv6" : "overview");
  const item = HELP[key] || HELP.overview;
  return (
    <>
      <PageHeading
        title={item.title}
        description="网络诊断台 · 独立编写的本地使用说明"
      />
      <Card title={item.title}>
        {item.paragraphs.map((p, i) => (
          <p className="help-paragraph" key={i}>
            {p}
          </p>
        ))}
        {key === "regions" && (
          <ul>
            <li>
              <a
                href="https://www.anthropic.com/supported-countries"
                target="_blank"
                rel="noreferrer"
              >
                Anthropic 官方支持地区
              </a>
            </li>
            <li>
              <a
                href="https://help.openai.com/en/articles/5347006-openai-api-supported-countries-and-territories"
                target="_blank"
                rel="noreferrer"
              >
                OpenAI 官方支持地区
              </a>
            </li>
            <li>
              <a
                href="https://support.google.com/accounts/answer/114129?hl=zh-Hans"
                target="_blank"
                rel="noreferrer"
              >
                Google 官方：验证您的账号
              </a>
            </li>
          </ul>
        )}
        {key === "captcha" && (
          <ul>
            <li>
              <a
                href="https://developers.cloudflare.com/turnstile/get-started/widget-management/dashboard/"
                target="_blank"
                rel="noreferrer"
              >
                Cloudflare：创建 Turnstile 部件
              </a>
            </li>
            <li>
              <a
                href="https://developers.cloudflare.com/turnstile/troubleshooting/testing/"
                target="_blank"
                rel="noreferrer"
              >
                Cloudflare：本地开发与测试密钥说明
              </a>
            </li>
            <li>
              <a
                href="https://developers.google.com/recaptcha/docs/v3"
                target="_blank"
                rel="noreferrer"
              >
                Google：reCAPTCHA v3 集成
              </a>
            </li>
            <li>
              <a
                href="https://developers.google.com/recaptcha/docs/domain_validation"
                target="_blank"
                rel="noreferrer"
              >
                Google：localhost 与域名验证
              </a>
            </li>
          </ul>
        )}
      </Card>
      <Card title="其他说明">
        <HelpLinks />
      </Card>
    </>
  );
}
export function ReportsPage() {
  const d = useDesk();
  const count = summarize(d.record);
  const [filter, setFilter] = useState("all");
  const rows = Object.values(d.record.results).filter(
    (r) => filter === "all" || r.status === filter,
  );
  return (
    <>
      <PageHeading
        title="报告中心"
        description="汇总本次检测、导入系统 JSON、查看历史和导出可离线打开的合并报告"
      />
      <Card title={d.record.title}>
        <p className="muted">
          记录 {d.record.id} · 更新于{" "}
          {new Date(d.record.updatedAt).toLocaleString()}
        </p>
        <div className="summary-metrics">
          <span>
            <b>{count.obtained}</b> 已取得
          </span>
          <span>
            <b>{count.unknown}</b> 无法确定
          </span>
          <span>
            <b>{count.errors}</b> 失败
          </span>
          <span>
            <b>{d.record.system ? "已合并" : "未导入"}</b> 系统 JSON
          </span>
        </div>
        <ReportActions />
        <div className="actions">
          <button
            onClick={() => {
              d.save(undefined, true);
              d.setNotice("当前报告已保存到本地历史");
            }}
          >
            保存到本地历史
          </button>
          <button
            onClick={() => {
              d.startRecord("combined", "网络环境综合检测");
              d.setNotice(
                d.saveHistory
                  ? "已新建检测记录；已启用自动保存历史"
                  : "已新建检测记录；自动保存历史已关闭，旧记录未自动保存",
              );
            }}
          >
            新建空白检测
          </button>
        </div>
      </Card>
      <Card
        title="本次检测明细"
        actions={
          <select
            aria-label="筛选检测状态"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">全部项目</option>
            <option value="ok">已取得</option>
            <option value="unknown">无法确定</option>
            <option value="error">失败</option>
          </select>
        }
      >
        <div className="compact-grid report-grid">
          {rows.map((r) => (
            <details className="report-item" key={r.key}>
              <summary>
                <span>
                  <DataText value={r.label} />
                </span>
                <Badge
                  tone={
                    r.status === "ok"
                      ? "good"
                      : r.status === "error"
                        ? "warn"
                        : "neutral"
                  }
                >
                  {r.status === "ok"
                    ? "已取得"
                    : r.status === "error"
                      ? "失败"
                      : r.status === "running"
                        ? "检测中"
                        : "无法确定"}
                </Badge>
              </summary>
              <ResultLine result={r} />
              <Evidence result={r} />
            </details>
          ))}
        </div>
        {!rows.length && <p>没有符合条件的检测项。</p>}
      </Card>
      {d.record.system && (
        <Card title="附加系统结果">
          <p>
            采集时间：{new Date(d.record.system.collectedAt).toLocaleString()}
          </p>
          <DataGrid value={d.record.system} />
        </Card>
      )}
      <HistoryCard />
    </>
  );
}
export function SettingsPage() {
  const d = useDesk();
  return (
    <>
      <PageHeading
        title="工具设置与数据源"
        description="仅调整本工具的请求方式；不会更改系统代理或网络设置"
      />
      <Card title="本机请求方式">
        <ProxyOptions />
      </Card>
      <Card title="外部接口配置">
        <Row label="ipapi.is 密钥">
          <Badge tone={d.config?.configured.ipapi ? "good" : "neutral"}>
            {d.config?.configured.ipapi ? "已配置" : "匿名公共接口"}
          </Badge>
        </Row>
        <Row label="Globalping Token">
          <Badge tone={d.config?.configured.globalping ? "good" : "neutral"}>
            {d.config?.configured.globalping ? "已配置" : "匿名公共额度"}
          </Badge>
        </Row>
        <Row label="自有 Turnstile">
          <Badge tone={d.config?.configured.turnstile ? "good" : "neutral"}>
            {d.config?.configured.turnstile ? "已配置" : "待配置"}
          </Badge>
        </Row>
        <p>
          密钥从{desktop ? "本软件数据目录" : "项目目录"}读取：
          <code className="break">
            {desktop
              ? desktop.dataDirectory + "\\config.local.json"
              : "config.local.json"}
          </code>
          。个人配置不会包含在公开源码包中。
        </p>
        <a href="/help/?topic=configuration">查看配置方式</a>
      </Card>
      <Card title="数据来源与运行边界">
        <p>
          IP：ipify / 目标 Trace / Net.Coffee / ipapi.is；DNS：Cloudflare /
          Google / Net.Coffee 权威回查；WebRTC：浏览器 ICE 与 STUN；RDAP：IANA
          与注册局；全球探针：Globalping；网络路由：RIPEstat；状态：各服务官方状态页。
        </p>
        <p>
          界面、组件、检测编排、校验、报告和系统脚本为本项目独立实现。第三方数据仍属于对应服务，受其可用性和使用条款约束。
        </p>
      </Card>
    </>
  );
}
