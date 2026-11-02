import React, { useEffect, useRef, useState } from "react";
import { useDesk } from "./state.jsx";
import { useChecks } from "./useChecks.jsx";
import { api } from "./checks.mjs";
import { desktop } from "./storage.mjs";
import { CAPTCHA_SETUP } from "../shared/diagnostic-guidance.mjs";
import {
  Card,
  EgressTile,
  DataText,
  Evidence,
  IPLinks,
  ResultLine,
  planeLabel,
  Icon,
  Badge,
  Copy,
} from "./components.jsx";

// The same batch controller is used for egress discovery and edge comparison.
export function TargetBatch({ edge = false }) {
  const d = useDesk(),
    c = useChecks();
  const [group, setGroup] = useState("全部"),
    [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(
    edge ? [] : ["cloudflare", "claude", "chatgpt", "openai"],
  );
  const stop = useRef(false),
    initialized = useRef(false);
  const targets = Object.entries(d.config?.targets || {}).filter(([k, v]) =>
    edge
      ? d.config?.edgeTargets?.includes(k)
      : v.split ||
        [
          "ipv4",
          "ipv6",
          "domestic",
          "cloudflare",
          "claude",
          "chatgpt",
          "openai",
        ].includes(k),
  );
  useEffect(() => {
    if (edge && d.config && !initialized.current) {
      initialized.current = true;
      setSelected(d.config.edgeTargets || []);
    }
  }, [d.config, edge]);
  useEffect(
    () => () => {
      stop.current = true;
    },
    [],
  );
  const visible = targets.filter(
    ([, v]) => group === "全部" || (v.category || "基础") === group,
  );
  async function run() {
    setBusy(true);
    stop.current = false;
    const recordId = d.generation.current;
    try {
      for (let i = 0; i < selected.length; i += 3) {
        if (stop.current || d.generation.current !== recordId) break;
        await Promise.all(selected.slice(i, i + 3).map(c.exit));
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card
      title={edge ? "多目标边缘节点对比" : "多站点分流检测"}
      icon={edge ? "diagram-3" : "shuffle"}
      className="target-batch"
      actions={
        <span className="batch-count">
          <Icon name="layers" /> {selected.length} 个目标
        </span>
      }
    >
      <div className="actions batch-toolbar">
        <label>
          目标分类{" "}
          <select value={group} onChange={(e) => setGroup(e.target.value)}>
            {[
              "全部",
              ...new Set(targets.map(([, v]) => v.category || "基础")),
            ].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <button
          disabled={busy}
          onClick={() => setSelected(visible.map(([k]) => k))}
        >
          选择当前分类
        </button>
        <button disabled={busy} onClick={() => setSelected([])}>
          清空选择
        </button>
        <span className="fine">
          已选 {selected.length} / 共 {targets.length} 个目标
        </span>
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
        <button
          className="primary"
          disabled={busy || !selected.length}
          onClick={run}
        >
          {busy ? "检测中…" : "检测所选目标"}
        </button>
        <button
          disabled={!busy}
          onClick={() => {
            stop.current = true;
            d.setNotice("后续目标已停止；已发出的请求仍会保留结果");
          }}
        >
          停止后续目标
        </button>
      </div>
      <p className="fine batch-note">
        <Icon name="info-circle" />
        <span>
          完整 IP
          单独记录。浏览器跨域受限时显示本机服务结果及原因；不同请求路径不能直接当作同一出口。节点代码为目标实际响应，不推断套餐或网络纯净度。
        </span>
      </p>
      <div
        className="compact-grid"
        aria-label={edge ? "边缘节点检测结果" : "多站点分流检测结果"}
      >
        {selected.map((k) => (
          <EgressTile
            key={k}
            target={k}
            label={d.config?.targets[k]?.label || k}
            result={d.record.results["egress:" + k]}
            edge={edge}
            busy={busy}
            onRetry={() => c.exit(k)}
          />
        ))}
      </div>
    </Card>
  );
}

const scripts = new Map();
function loadScript(url) {
  if (!scripts.has(url))
    scripts.set(
      url,
      new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = url;
        s.onload = resolve;
        s.onerror = () => {
          scripts.delete(url);
          s.remove();
          reject(new Error("验证组件加载失败"));
        };
        document.head.appendChild(s);
      }),
    );
  return scripts.get(url);
}
export function CaptchaPanel() {
  const d = useDesk(),
    container = useRef(),
    widget = useRef();
  const [kind, setKind] = useState("managed"),
    [loading, setLoading] = useState(false);
  const names = {
    managed: "Turnstile 托管验证",
    noninteractive: "Turnstile 非交互验证",
    recaptcha: "reCAPTCHA v3",
  };
  const key = "captcha:" + kind,
    r = d.record.results[key];
  function reset() {
    if (widget.current != null) {
      window.turnstile?.remove(widget.current);
      widget.current = null;
    }
    container.current?.replaceChildren();
  }
  useEffect(() => reset, []);
  async function start() {
    const selected = kind;
    reset();
    setLoading(true);
    try {
      if (!d.config?.captcha?.[selected]?.configured) {
        const missingFields =
          d.config?.captcha?.[selected]?.missingFields ||
          CAPTCHA_SETUP[selected].fields;
        await d.task(key, names[selected], async () => ({
          status: "unknown",
          summary: "需要配置：" + missingFields.join("、") + "；本次未执行验证",
          source: names[selected],
          execution: "browser",
          data: {
            configured: false,
            missingFields,
            configurationHelp: "/help/?topic=captcha",
          },
          limitations: [
            "需要你自己的站点密钥；未配置不表示网络不纯净，也不是账号验证失败。",
          ],
        }));
        return;
      }
      const sitekey = d.config.captcha[selected].siteKey;
      const verify = (token) =>
        d.task("captcha:" + selected, names[selected], async () => {
          const data = await api(
            selected === "recaptcha" ? "recaptcha" : "turnstile",
            {},
            { method: "POST", body: JSON.stringify({ token, kind: selected }) },
          );
          return {
            status: data.success ? "ok" : "error",
            summary: data.success
              ? `本站点验证成功${data.score != null ? "，本站点分数 " + data.score : ""}`
              : "验证失败：" + (data["error-codes"] || []).join("、"),
            data,
            source: names[selected],
            execution: "local-service",
            limitations: [
              "本站点的验证/分数不代表 Google、Gmail、Claude 或其他网站的注册结果。",
            ],
          };
        });
      if (selected === "recaptcha") {
        await loadScript(
          "https://www.google.com/recaptcha/api.js?render=" +
            encodeURIComponent(sitekey),
        );
        await new Promise((resolve) => window.grecaptcha.ready(resolve));
        await verify(
          await window.grecaptcha.execute(sitekey, { action: "network_desk" }),
        );
      } else {
        await loadScript(
          "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
        );
        widget.current = window.turnstile.render(container.current, {
          sitekey,
          callback: verify,
          "expired-callback": () =>
            d.setNotice("验证令牌已过期，请重新加载组件"),
          "error-callback": () =>
            d.setNotice("验证组件失败，请检查本站点配置后重试"),
        });
      }
    } catch (e) {
      d.setNotice(e.message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <Card title="站点人机验证">
      <p className="fine">
        使用你自己的站点配置。Turnstile
        的托管/非交互模式分别对应控制台创建的站点密钥；不能通过前端设置改变密钥模式。
      </p>
      <div className="actions">
        <select
          aria-label="验证模式"
          value={kind}
          disabled={loading}
          onChange={(e) => {
            reset();
            setKind(e.target.value);
          }}
        >
          {Object.entries(names).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button disabled={loading} onClick={start}>
          加载验证组件
        </button>
        <button onClick={reset}>移除验证组件</button>
        <a href="/help/?topic=captcha">逐项配置说明</a>
      </div>
      {!d.config?.captcha?.[kind]?.configured && (
        <div className="notice">
          <p>
            <strong>需要自有配置，本次未执行</strong>
          </p>
          <p>{CAPTCHA_SETUP[kind].mode}</p>
          <p>
            缺少字段：
            {(
              d.config?.captcha?.[kind]?.missingFields ||
              CAPTCHA_SETUP[kind].fields
            ).join("、")}
          </p>
          <p>
            保存位置：
            {desktop
              ? desktop.dataDirectory + "\\config.local.json"
              : "本地服务项目目录下的 config.local.json"}
            ；保存后退出并重启软件。
          </p>
          <p>
            站点密钥需允许实际主机名。Turnstile 使用 127.0.0.1；reCAPTCHA
            若无法登记 IP，请在外部浏览器以 localhost 打开本地页。详见配置说明。
          </p>
        </div>
      )}
      <div ref={container} />
      <ResultLine result={r} />
      <Evidence result={r} />
    </Card>
  );
}
