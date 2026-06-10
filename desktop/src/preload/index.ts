/**
 * Preload bridge.
 *
 * Exposes a typed `window.api` surface to the renderer. Every method here
 * has a matching `ipcMain.handle` in main/index.ts and a matching entry in
 * the ApiBridge interface in shared/types.ts. If you add a method, update
 * all three.
 */
import { contextBridge, ipcRenderer } from "electron";
import type { ApiBridge, AppConfig, SessionInfo } from "../shared/types";

const api: ApiBridge = {
  getConfig: () => ipcRenderer.invoke("config:get") as Promise<AppConfig>,
  setConfig: (patch) =>
    ipcRenderer.invoke("config:set", patch) as Promise<AppConfig>,

  getStoredSession: () =>
    ipcRenderer.invoke("session:get") as Promise<SessionInfo | null>,
  saveSession: (sess) =>
    ipcRenderer.invoke("session:save", sess) as Promise<void>,

  getAppVersion: () => ipcRenderer.invoke("meta:version") as Promise<string>,
  openExternal: (url) =>
    ipcRenderer.invoke("meta:open-external", url) as Promise<void>,
};

contextBridge.exposeInMainWorld("api", api);
