const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("native", {
  testing: process.argv.includes("--smoke-test"),
  petTesting: process.argv.includes('--pet-smoke-test'),
  invoke: (method, args) => ipcRenderer.invoke("native", method, args),
  exitTesting: process.argv.includes("--exit-smoke-test"),
  onPetCommand: callback => ipcRenderer.on('pet-command',(_event,value)=>callback(value)),
  onPetDraft: callback => ipcRenderer.on('pet-draft',(_event,value)=>callback(value)),
  onExitRequest: (callback) => {
    ipcRenderer.on("request-exit", () => callback());
  },
});
