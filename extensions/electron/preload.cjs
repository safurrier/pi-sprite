const { contextBridge, ipcRenderer } = require("electron");

// Expose minimal safe APIs to the renderer process
contextBridge.exposeInMainWorld("api", {
	closeWindow: () => ipcRenderer.send("close-window"),
	getPort: () => ipcRenderer.invoke("get-port"),
});
