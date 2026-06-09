import { app, BrowserWindow, ipcMain, Menu } from 'electron'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'

const require = createRequire(import.meta.url)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow: BrowserWindow | null = null
const isDev = process.env.NODE_ENV === 'development'
const preloadPath = path.join(__dirname, 'preload.js')

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      enableRemoteModule: false,
      nodeIntegration: false,
      sandbox: true,
    },
    icon: path.join(__dirname, '../../public/icon.png'),
  })

  const startUrl = isDev
    ? 'http://localhost:5173'
    : `file://${path.join(__dirname, '../renderer/index.html')}`

  mainWindow.loadURL(startUrl)

  if (isDev) {
    mainWindow.webContents.openDevTools()
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.on('ready', createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})

// IPC Handlers

// Window control
ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize()
})

ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})

ipcMain.handle('window:close', () => {
  mainWindow?.close()
})

// Config management
const configPath = path.join(app.getPath('userData'), 'config.json')

function readConfig() {
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    }
  } catch (error) {
    console.error('Failed to read config:', error)
  }
  return {}
}

function writeConfig(config: Record<string, any>) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
  } catch (error) {
    console.error('Failed to write config:', error)
  }
}

ipcMain.handle('config:get', (_, key: string) => {
  const config = readConfig()
  return config[key]
})

ipcMain.handle('config:set', (_, key: string, value: any) => {
  const config = readConfig()
  config[key] = value
  writeConfig(config)
  return true
})

// System info
ipcMain.handle('system:version', () => {
  return app.getVersion()
})

// Gateway communication (stub for future implementation)
ipcMain.handle('gateway:send', (_, channel: string, data: any) => {
  // TODO: Implement actual gateway communication
  console.log('Gateway send:', channel, data)
  return { success: true }
})

// Application Menu
const template = [
  {
    label: 'File',
    submenu: [
      {
        label: 'Exit',
        accelerator: 'CmdOrCtrl+Q',
        click: () => app.quit(),
      },
    ],
  },
  {
    label: 'Edit',
    submenu: [
      { role: 'undo' as const },
      { role: 'redo' as const },
      { type: 'separator' as const },
      { role: 'cut' as const },
      { role: 'copy' as const },
      { role: 'paste' as const },
    ],
  },
  {
    label: 'View',
    submenu: [
      { role: 'reload' as const },
      { role: 'forceReload' as const },
      { role: 'toggleDevTools' as const },
      { type: 'separator' as const },
      { role: 'resetZoom' as const },
      { role: 'zoomIn' as const },
      { role: 'zoomOut' as const },
      { type: 'separator' as const },
      { role: 'togglefullscreen' as const },
    ],
  },
  {
    label: 'Help',
    submenu: [
      {
        label: 'About Astrix AI',
        click: () => {
          // TODO: Show about dialog
        },
      },
    ],
  },
]

const menu = Menu.buildFromTemplate(template as any)
Menu.setApplicationMenu(menu)

export { mainWindow }
