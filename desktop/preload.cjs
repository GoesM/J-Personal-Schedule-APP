const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("native", {
  testing: process.argv.includes("--smoke-test"),
  invoke: (method, args) => ipcRenderer.invoke("native", method, args),
  exitTesting: process.argv.includes("--exit-smoke-test"),
  onExitRequest: (callback) => {
    ipcRenderer.on("request-exit", () => callback());
  },
});
