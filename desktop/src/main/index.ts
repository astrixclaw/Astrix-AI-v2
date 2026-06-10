/**
 * Electron main process for Astrix Home.
 *
 * Responsibilities:
 *  - own the BrowserWindow
 *  - persist app config + the active session token to disk (`userData/`)
 *  - expose those over IPC to the renderer via the preload bridge
 *  - strip Electron's injected CSP header so our meta-CSP wins (we learned
 *    this the hard way last project — packaged Windows would silently drop
 *    https:/blob: images otherwise)
 *
 * The renderer does the actual HTTP talking to the backend. The main process
 * stays out of business logic; it's a thin host for the window.
 */
import { app, BrowserWindow, ipcMain, Menu, session, shell } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AppConfig,
  SessionInfo,
} from "../shared/types";

// Default menu would let users open DevTools / quit on the menu bar — we
// build our own chrome in the renderer.
Menu.setApplicationMenu(null);

const isDev = !app.isPackaged;

// ---- Persisted config helpers ------------------------------------------
//
// We store two tiny JSON files under userData: `config.json` (backend URL) and
// `session.json` (token + user). Keep them small and self-healing — if either
// is missing or malformed, we treat it as "fresh install".

const DEFAULT_CONFIG: AppConfig = {
  backendUrl: "http://127.0.0.1:18800",
};

function configPath() {
  return join(app.getPath("userData"), "config.json");
}
function sessionPath() {
  return join(app.getPath("userData"), "session.json");
}

function readJson<T>(path: string): T | null {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

function writeJson(path: string, data: unknown) {
  const dir = join(path, "..");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2), "utf8");
}

function loadConfig(): AppConfig {
  const onDisk = readJson<AppConfig>(configPath());
  return { ...DEFAULT_CONFIG, ...(onDisk ?? {}) };
}

function saveConfig(patch: Partial<AppConfig>): AppConfig {
  const next = { ...loadConfig(), ...patch };
  writeJson(configPath(), next);
  return next;
}

// ---- Window ------------------------------------------------------------

let mainWindow: BrowserWindow | null = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 880,
    minHeight: 600,
    show: false, // we show after `ready-to-show` to avoid the white flash
    backgroundColor: "#0b0d12",
    title: "Astrix Home",
    icon: join(__dirname, "..", "..", "..", "assets", "icon-256.png"),
    webPreferences: {
      preload: join(__dirname, "..", "preload", "index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload uses Node APIs (fs, path)
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  // External links open in the user's browser, not inside Electron.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    void mainWindow.loadURL("http://localhost:5173/");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    // Path math (relative to this file at runtime):
    //   __dirname = .../app.asar/dist/main/main
    //   target    = .../app.asar/dist/renderer/index.html
    // So we go up two: out of `main`, out of `main` again, then into `renderer`.
    const rendererHtml = join(__dirname, "..", "..", "renderer", "index.html");
    console.log("[astrix-home] loading renderer from", rendererHtml);
    mainWindow.loadFile(rendererHtml).catch((err) => {
      console.error("[astrix-home] loadFile failed:", err);
    });
  }
}

// ---- CSP override -------------------------------------------------------
//
// In packaged builds Electron injects a Content-Security-Policy *response
// header* on file:// loads. It's stricter than our <meta> CSP and would
// silently break our backend HTTP calls. We strip the injected header so
// the meta tag wins. (Same fix as Astrix-AI v0.0.13.)
function installCspOverride() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    for (const k of Object.keys(headers)) {
      if (k.toLowerCase() === "content-security-policy") delete headers[k];
    }
    callback({ responseHeaders: headers });
  });
}

// ---- IPC handlers -------------------------------------------------------

function registerIpc() {
  ipcMain.handle("config:get", () => loadConfig());
  ipcMain.handle(
    "config:set",
    (_e, patch: Partial<AppConfig>) => saveConfig(patch),
  );

  ipcMain.handle("session:get", () => readJson<SessionInfo>(sessionPath()));
  ipcMain.handle("session:save", (_e, sess: SessionInfo | null) => {
    if (sess === null) {
      try {
        if (existsSync(sessionPath())) writeFileSync(sessionPath(), "null", "utf8");
      } catch {
        /* ignore */
      }
      return;
    }
    writeJson(sessionPath(), sess);
  });

  ipcMain.handle("meta:version", () => app.getVersion());
  ipcMain.handle("meta:open-external", (_e, url: string) =>
    shell.openExternal(url),
  );
}

// ---- App lifecycle ------------------------------------------------------

void app.whenReady().then(() => {
  installCspOverride();
  registerIpc();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
