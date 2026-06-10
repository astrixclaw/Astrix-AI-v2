"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
const electron_1 = require("electron");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
// Default menu would let users open DevTools / quit on the menu bar — we
// build our own chrome in the renderer.
electron_1.Menu.setApplicationMenu(null);
const isDev = !electron_1.app.isPackaged;
// ---- Persisted config helpers ------------------------------------------
//
// We store two tiny JSON files under userData: `config.json` (backend URL) and
// `session.json` (token + user). Keep them small and self-healing — if either
// is missing or malformed, we treat it as "fresh install".
const DEFAULT_CONFIG = {
    backendUrl: "http://127.0.0.1:18800",
};
function configPath() {
    return (0, node_path_1.join)(electron_1.app.getPath("userData"), "config.json");
}
function sessionPath() {
    return (0, node_path_1.join)(electron_1.app.getPath("userData"), "session.json");
}
function readJson(path) {
    try {
        if (!(0, node_fs_1.existsSync)(path))
            return null;
        return JSON.parse((0, node_fs_1.readFileSync)(path, "utf8"));
    }
    catch {
        return null;
    }
}
function writeJson(path, data) {
    const dir = (0, node_path_1.join)(path, "..");
    if (!(0, node_fs_1.existsSync)(dir))
        (0, node_fs_1.mkdirSync)(dir, { recursive: true });
    (0, node_fs_1.writeFileSync)(path, JSON.stringify(data, null, 2), "utf8");
}
function loadConfig() {
    const onDisk = readJson(configPath());
    return { ...DEFAULT_CONFIG, ...(onDisk ?? {}) };
}
function saveConfig(patch) {
    const next = { ...loadConfig(), ...patch };
    writeJson(configPath(), next);
    return next;
}
// ---- Window ------------------------------------------------------------
let mainWindow = null;
function createMainWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1100,
        height: 760,
        minWidth: 880,
        minHeight: 600,
        show: false, // we show after `ready-to-show` to avoid the white flash
        backgroundColor: "#0b0d12",
        title: "Astrix Home",
        icon: (0, node_path_1.join)(__dirname, "..", "..", "assets", "icon-256.png"),
        webPreferences: {
            preload: (0, node_path_1.join)(__dirname, "..", "preload", "index.js"),
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
        void electron_1.shell.openExternal(url);
        return { action: "deny" };
    });
    if (isDev) {
        void mainWindow.loadURL("http://localhost:5173/");
        mainWindow.webContents.openDevTools({ mode: "detach" });
    }
    else {
        void mainWindow.loadFile((0, node_path_1.join)(__dirname, "..", "renderer", "index.html"));
    }
}
// ---- CSP override -------------------------------------------------------
//
// In packaged builds Electron injects a Content-Security-Policy *response
// header* on file:// loads. It's stricter than our <meta> CSP and would
// silently break our backend HTTP calls. We strip the injected header so
// the meta tag wins. (Same fix as Astrix-AI v0.0.13.)
function installCspOverride() {
    electron_1.session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        const headers = { ...details.responseHeaders };
        for (const k of Object.keys(headers)) {
            if (k.toLowerCase() === "content-security-policy")
                delete headers[k];
        }
        callback({ responseHeaders: headers });
    });
}
// ---- IPC handlers -------------------------------------------------------
function registerIpc() {
    electron_1.ipcMain.handle("config:get", () => loadConfig());
    electron_1.ipcMain.handle("config:set", (_e, patch) => saveConfig(patch));
    electron_1.ipcMain.handle("session:get", () => readJson(sessionPath()));
    electron_1.ipcMain.handle("session:save", (_e, sess) => {
        if (sess === null) {
            try {
                if ((0, node_fs_1.existsSync)(sessionPath()))
                    (0, node_fs_1.writeFileSync)(sessionPath(), "null", "utf8");
            }
            catch {
                /* ignore */
            }
            return;
        }
        writeJson(sessionPath(), sess);
    });
    electron_1.ipcMain.handle("meta:version", () => electron_1.app.getVersion());
    electron_1.ipcMain.handle("meta:open-external", (_e, url) => electron_1.shell.openExternal(url));
}
// ---- App lifecycle ------------------------------------------------------
void electron_1.app.whenReady().then(() => {
    installCspOverride();
    registerIpc();
    createMainWindow();
    electron_1.app.on("activate", () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createMainWindow();
    });
});
electron_1.app.on("window-all-closed", () => {
    if (process.platform !== "darwin")
        electron_1.app.quit();
});
//# sourceMappingURL=index.js.map