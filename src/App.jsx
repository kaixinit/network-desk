import React, { useEffect, useState } from "react";
import "bootstrap-icons/font/bootstrap-icons.css";
import { DeskProvider, useDesk } from "./state.jsx";
import { Icon, ReportActions } from "./components.jsx";
import { storage, desktop } from "./storage.mjs";
import { DesktopDock } from "./desktop.jsx";
import { HomePage, PlatformPage, GooglePage } from "./diagnostics.jsx";
import {
  IPPage,
  LinkPage,
  DNSPage,
  WebRTCPage,
  CloudflarePage,
  PingPage,
} from "./network-tools.jsx";
import {
  WhoisPage,
  CardPage,
  StatusPage,
  NewsPage,
  HelpPage,
  ReportsPage,
  SettingsPage,
} from "./utility-pages.jsx";

const primary = [
  ["/", "IP查询"],
  ["/claude/", "Claude检测"],
  ["/ip/", "IP评分"],
  ["/gpt/", "GPT检测"],
  ["/google/", "Google/Gmail"],
  ["/link/", "网络连通"],
  ["/dns/", "DNS泄露"],
  ["/webrtc/", "WebRTC"],
  ["/cloudflare/", "Cloudflare"],
  ["/ping/", "全球Ping"],
  ["/status/", "服务状态"],
];
const extra = [
  ["/whois/", "Whois 查询"],
  ["/card/", "IP 卡片"],
  ["/news/", "AI 资讯"],
  ["/reports/", "报告中心"],
  ["/help/", "本地帮助"],
  ["/settings/", "工具设置"],
];
class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    return this.state.error ? (
      <main>
        <h1>页面遇到错误</h1>
        <p>{this.state.error.message}</p>
        <button onClick={() => location.reload()}>重新载入</button>
        <a href="/reports/">返回报告中心</a>
      </main>
    ) : (
      this.props.children
    );
  }
}
function Shell() {
  const d = useDesk();
  const [url, setURL] = useState(location.pathname + location.search);
  const [theme, setTheme] = useState(
    () => storage.getItem("network-desk/theme") || "light",
  );
  useEffect(() => {
    const pop = () => setURL(location.pathname + location.search);
    const click = (e) => {
      const a = e.target.closest?.("a[href]");
      if (
        !a ||
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey ||
        a.target ||
        a.hasAttribute("download")
      )
        return;
      const u = new URL(a.href);
      if (
        u.origin !== location.origin ||
        u.pathname.startsWith("/scripts/") ||
        u.hash
      )
        return;
      e.preventDefault();
      history.pushState({}, "", u.pathname + u.search);
      setURL(u.pathname + u.search);
      window.scrollTo(0, 0);
    };
    window.addEventListener("popstate", pop);
    document.addEventListener("click", click);
    return () => {
      window.removeEventListener("popstate", pop);
      document.removeEventListener("click", click);
    };
  }, []);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      (document.documentElement.dataset.theme =
        theme === "system" ? (media.matches ? "dark" : "light") : theme);
    apply();
    storage.setItem("network-desk/theme", theme);
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  useEffect(() => {
    const ip = new URLSearchParams(location.search).get("ip");
    if (ip) d.setSelected(ip);
  }, [url]);
  const route = location.pathname;
  const root = route.split("/")[1] || "home";
  let page;
  if (route.startsWith("/card/embed")) return <CardPage embed />;
  if (route.endsWith("/ipv6.html")) page = <HelpPage />;
  else
    switch (root) {
      case "home":
        page = <HomePage />;
        break;
      case "claude":
      case "gpt":
        page = <PlatformPage key={root} platform={root} />;
        break;
      case "google":
        page = <GooglePage />;
        break;
      case "ip":
        page = <IPPage key={url} />;
        break;
      case "link":
        page = <LinkPage />;
        break;
      case "dns":
        page = <DNSPage />;
        break;
      case "webrtc":
        page = <WebRTCPage />;
        break;
      case "cloudflare":
        page = <CloudflarePage />;
        break;
      case "ping":
        page = <PingPage />;
        break;
      case "whois":
        page = <WhoisPage key={url} />;
        break;
      case "card":
        page = <CardPage key={url} />;
        break;
      case "status":
        page = <StatusPage />;
        break;
      case "news":
      case "articles":
        page = <NewsPage />;
        break;
      case "reports":
        page = <ReportsPage />;
        break;
      case "settings":
        page = <SettingsPage />;
        break;
      case "help":
        page = <HelpPage key={url} />;
        break;
      default:
        page = (
          <div>
            <h1>未找到这个栏目</h1>
            <a href="/">返回 IP 查询</a>
          </div>
        );
    }
  return (
    <div className={"container" + (desktop ? " desktop-mode" : "")}>
      <a href="#main" className="skip">
        跳到内容
      </a>
      <nav aria-label="主导航" className="nav">
        <div className="nav-scroll">
          {primary.map(([href, title]) => (
            <a
              key={href}
              href={href}
              className={route === href ? "active" : ""}
              aria-current={route === href ? "page" : undefined}
            >
              {title}
            </a>
          ))}
          <details className="nav-more">
            <summary>
              更多 <Icon name="chevron-down" />
            </summary>
            <div>
              {extra.map(([href, title]) => (
                <a
                  key={href}
                  href={href}
                  onClick={(e) =>
                    e.target.closest("details")?.removeAttribute("open")
                  }
                >
                  {title}
                </a>
              ))}
            </div>
          </details>
        </div>
        <select
          className="theme-choice"
          aria-label="界面主题"
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
        >
          <option value="light">浅色</option>
          <option value="dark">深色</option>
          <option value="system">跟随系统</option>
        </select>
      </nav>
      {d.notice && (
        <div className="toast" role="status">
          <span>{d.notice}</span>
          <button aria-label="关闭提示" onClick={() => d.setNotice("")}>
            <Icon name="x-lg" />
          </button>
        </div>
      )}
      <main id="main" key={url} className={"page-" + root}>
        {page}
      </main>
      {!desktop && root !== "reports" && (
        <footer className="report-footer">
          <div>
            <a href="/reports/">
              <Icon name="file-earmark-text" /> 本次检测与合并报告
            </a>
            <span>
              {d.record.system ? "已附加系统 JSON" : "可导入系统 JSON"}
            </span>
          </div>
          <ReportActions />
        </footer>
      )}
      <footer className="site-footer">
        <span>Network Desk · 网络诊断台 · 本地运行</span>
        <a href="/help/?topic=privacy">隐私与数据来源</a>
        <a href="/settings/">设置</a>
      </footer>
      {desktop && <DesktopDock />}
    </div>
  );
}
export function App() {
  return (
    <ErrorBoundary>
      <DeskProvider>
        <Shell />
      </DeskProvider>
    </ErrorBoundary>
  );
}
