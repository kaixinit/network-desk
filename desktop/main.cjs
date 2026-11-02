const {
  app,
  BrowserWindow,
  ipcMain,
  utilityProcess,
  dialog,
  shell,
  Menu,
  session,
  nativeImage,
} = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { pathToFileURL } = require("node:url");

app.setName("Network Desk");
app.setPath(
  "userData",
  process.env.NETWORK_DESK_USER_DATA ||
    path.join(app.getPath("appData"), "NetworkDesk"),
);
const dataDir = app.getPath("userData");
const reportsDir = path.join(dataDir, "reports");
const resourceRoot = app.isPackaged
  ? path.join(process.resourcesPath, "desk")
  : path.resolve(__dirname, "..");
let window,
  service,
  origin,
  preferences = {},
  collector,
  quitting = false,
  writeQueue = Promise.resolve();
const ownLock = app.requestSingleInstanceLock();
if (!ownLock) app.quit();
else {
  app.on("second-instance", () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    }
  });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", (event) => {
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    collector?.kill();
    try { service?.postMessage({ type: "shutdown" }); } catch {}
    Promise.race([
      writeQueue.catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 800)),
    ]).finally(() => {
      setTimeout(() => {
        service?.kill();
        app.exit(0);
      }, 600);
    });
  });
  app
    .whenReady()
    .then(start)
    .catch((e) => {
      dialog.showErrorBox("网络诊断台无法启动", e.message);
      app.quit();
    });
}
async function startService() {
  return new Promise((resolve, reject) => {
    service = utilityProcess.fork(
      path.join(resourceRoot, "server/index.mjs"),
      ["--port", "0"],
      {
        env: { ...process.env, NETWORK_DESK_DATA_DIR: dataDir },
        stdio: "pipe",
        serviceName: "Network Desk 本机检测服务",
      },
    );
    const timeout = setTimeout(() => {
      service.kill();
      reject(new Error("本机检测服务启动超时"));
    }, 25000);
    service.stdout?.on("data", () => {});
    service.stderr?.on("data", (chunk) =>
      fs
        .appendFile(path.join(dataDir, "service.log"), String(chunk))
        .catch(() => {}),
    );
    service.on("message", (message) => {
      if (message?.type === "ready" && Number.isInteger(message.port)) {
        clearTimeout(timeout);
        resolve("http://127.0.0.1:" + message.port);
      }
    });
    service.on("exit", (code) => {
      clearTimeout(timeout);
      if (!origin) reject(new Error("本机检测服务意外退出（" + code + "）"));
      else if (!quitting) {
        dialog.showErrorBox(
          "检测服务已停止",
          "请关闭并重新打开网络诊断台。已保存的报告不会丢失。",
        );
        app.quit();
      }
    });
  });
}
async function start() {
  await fs.mkdir(reportsDir, { recursive: true });
  const policy = await import(
    pathToFileURL(path.join(__dirname, "policy.mjs")).href
  );
  const { validateSystem } = await import(
    pathToFileURL(path.join(resourceRoot, "shared/model.mjs")).href
  );
  try {
    const saved = JSON.parse(
      await fs.readFile(path.join(dataDir, "preferences.json"), "utf8"),
    );
    for (const [key, value] of Object.entries(saved)) {
      try {
        policy.safePreference(key, value);
        preferences[key] = value;
      } catch {}
    }
  } catch {}
  origin = await startService();
  const allow = (event) => {
    if (!policy.trustedFrame(event, origin, window.webContents))
      throw new Error("拒绝非本软件页面调用");
  };
  ipcMain.on("desk:bootstrap", (event) => {
    try {
      allow(event);
      event.returnValue = {
        desktop: true,
        version: app.getVersion(),
        preferences,
        dataDirectory: dataDir,
        chromium: process.versions.chrome,
      };
    } catch {
      event.returnValue = null;
    }
  });
  ipcMain.handle("desk:preference", async (event, key, value) => {
    allow(event);
    policy.safePreference(key, value);
    if (value === null) delete preferences[key];
    else preferences[key] = value;
    const text = JSON.stringify(preferences);
    writeQueue = writeQueue
      .catch(() => {})
      .then(async () => {
        const temp = path.join(dataDir, "preferences.tmp");
        await fs.writeFile(temp, text, "utf8");
        await fs.rename(temp, path.join(dataDir, "preferences.json"));
      });
    await writeQueue;
    return true;
  });
  ipcMain.handle("desk:report-folder", async (event) => {
    allow(event);
    const error = await shell.openPath(reportsDir);
    if (error) throw new Error(error);
    return true;
  });
  ipcMain.handle("desk:browser", async (event, route) => {
    allow(event);
    await shell.openExternal(policy.localPage(route, origin));
    return true;
  });
  ipcMain.handle("desk:collect-system", async (event) => {
    allow(event);
    if (collector) throw new Error("系统信息正在采集，请稍候");
    const output = path.join(
      reportsDir,
      "system-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json",
    );
    const executable = path.join(
      process.env.SystemRoot || "C:\\Windows",
      "System32/WindowsPowerShell/v1.0/powershell.exe",
    );
    await new Promise((resolve, reject) => {
      collector = spawn(
        executable,
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          path.join(resourceRoot, "scripts/collect-system.ps1"),
          "-OutputPath",
          output,
        ],
        { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
      );
      let stderr = "";
      collector.stdout.on("data", () => {});
      collector.stderr.on("data", (part) => {
        stderr = (stderr + part).slice(-2000);
      });
      const timer = setTimeout(() => {
        collector?.kill();
        reject(new Error("系统采集超时，请重试"));
      }, 60000);
      collector.once("error", (e) => {
        clearTimeout(timer);
        collector = null;
        reject(e);
      });
      collector.once("close", (code) => {
        clearTimeout(timer);
        collector = null;
        code === 0
          ? resolve()
          : reject(new Error("系统采集失败：" + (stderr || code)));
      });
    });
    return validateSystem(
      JSON.parse((await fs.readFile(output, "utf8")).replace(/^\uFEFF/, "")),
    );
  });
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, permission, callback) =>
    callback(permission === "clipboard-sanitized-write"),
  );
  ses.setPermissionCheckHandler(
    (_wc, permission) => permission === "clipboard-sanitized-write",
  );
  ses.on("will-download", (_event, item) => {
    item.setSaveDialogOptions({
      title: "保存检测报告或文件",
      defaultPath: path.join(
        reportsDir,
        policy.safeDownloadName(item.getFilename()),
      ),
    });
  });
  Menu.setApplicationMenu(null);
  window = new BrowserWindow({
    width: 1440,
    height: 1024,
    minWidth: 1000,
    minHeight: 700,
    title: "网络诊断台 · Network Desk",
    show: false,
    backgroundColor: "#f1f4fb",
    icon: nativeImage.createFromPath(path.join(__dirname, "assets/icon.png")),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      webviewTag: false,
      spellcheck: false,
    },
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    const safe = policy.safeExternal(url);
    if (safe) shell.openExternal(safe);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== origin) {
      event.preventDefault();
      const safe = policy.safeExternal(url);
      if (safe) shell.openExternal(safe);
    }
  });
  window.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );
  window.webContents.on("page-title-updated", (event) =>
    event.preventDefault(),
  );
  window.once("ready-to-show", () => window.show());
  await window.loadURL(origin + "/");
}
