// Sandboxed preload: the renderer only ever sees these three members.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('flowstate', {
  platform: process.platform,
  /** @param {{ suggestedName: string, mimeType?: string, data: ArrayBuffer }} input */
  saveFile: (input) => ipcRenderer.invoke('flowstate:save-file', input),
  /** @param {{ html: string, title: string }} input */
  printHtml: (input) => ipcRenderer.invoke('flowstate:print', input),
})
