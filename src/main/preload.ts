import { contextBridge, ipcRenderer } from 'electron'

export const electronAPI = {
  // Window control
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),

  // Gateway communication
  gateway: {
    send: (channel: string, data: any) => ipcRenderer.invoke('gateway:send', channel, data),
    on: (channel: string, callback: (data: any) => void) => {
      ipcRenderer.on(channel, (_, data) => callback(data))
    },
    off: (channel: string) => ipcRenderer.removeAllListeners(channel),
  },

  // Config management
  config: {
    get: (key: string) => ipcRenderer.invoke('config:get', key),
    set: (key: string, value: any) => ipcRenderer.invoke('config:set', key, value),
  },

  // System info
  system: {
    getVersion: () => ipcRenderer.invoke('system:version'),
    getPlatform: () => process.platform,
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

declare global {
  interface Window {
    electronAPI: typeof electronAPI
  }
}
