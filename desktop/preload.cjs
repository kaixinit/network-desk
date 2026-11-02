const { contextBridge, ipcRenderer } = require("electron");
const bootstrap = ipcRenderer.sendSync("desk:bootstrap");
if (bootstrap?.desktop) {
  contextBridge.exposeInMainWorld("networkDeskDesktop", {
    ...bootstrap,
    setPreference: (key, value) =>
      ipcRenderer.invoke("desk:preference", key, value),
    collectSystem: () => ipcRenderer.invoke("desk:collect-system"),
    openReportFolder: () => ipcRenderer.invoke("desk:report-folder"),
    openBrowser: (route) => ipcRenderer.invoke("desk:browser", route),
  });
}
