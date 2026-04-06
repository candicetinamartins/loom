// Loom Electron Main Process
// Starts the Theia backend then opens the BrowserWindow

import { app, BrowserWindow, shell } from 'electron'
import * as http from 'http'
import * as net from 'net'
import * as path from 'path'

// Keep a global reference so the window isn't garbage-collected
let mainWindow: BrowserWindow | null = null

// Surface any unhandled crash as a dialog instead of silent exit
process.on('uncaughtException', (err) => {
  const { dialog } = require('electron')
  dialog.showErrorBox('Loom failed to start', err.stack ?? err.message)
  app.exit(1)
})

// ── Find a free TCP port ──────────────────────────────────────────────────────
function getFreePort (): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address() as net.AddressInfo
      srv.close(() => resolve(addr.port))
    })
    srv.on('error', reject)
  })
}

// ── Wait until the backend HTTP server responds ───────────────────────────────
function waitForBackend (port: number, retries = 30): Promise<void> {
  return new Promise((resolve, reject) => {
    let attempts = 0
    const check = () => {
      const req = http.get(`http://127.0.0.1:${port}`, (res) => {
        resolve()
      })
      req.on('error', () => {
        attempts++
        if (attempts >= retries) {
          reject(new Error(`Backend did not start on port ${port} after ${retries} attempts`))
        } else {
          setTimeout(check, 500)
        }
      })
      req.setTimeout(400, () => req.destroy())
    }
    check()
  })
}

// ── Create the Electron window ────────────────────────────────────────────────
function createWindow (port: number): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'Loom',
    icon: path.join(app.getAppPath(), 'resources', 'icon.ico'),
    backgroundColor: '#1e1e1e',
    show: false,  // show only once ready-to-show fires
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,           // Theia uses <webview> for plugin iframes
      allowRunningInsecureContent: false,
    },
  })

  mainWindow.loadURL(`http://127.0.0.1:${port}`)

  // Show the window once the page has loaded enough to render
  mainWindow.once('ready-to-show', () => {
    mainWindow!.show()
    mainWindow!.focus()
  })

  // Open external links in the OS browser, not inside Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith('http://127.0.0.1')) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    app.quit()
  })
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  try {
    const port = await getFreePort()
    console.log(`[loom] starting backend on port ${port}`)

    // Point Theia at a writable userData dir rather than the read-only ASAR archive.
    // Must be set before the server module is required.
    process.env.THEIA_APP_PROJECT_PATH = app.getPath('userData')

    // Load and start the generated Theia backend server.
    // Use app.getAppPath() so the path resolves correctly inside an ASAR
    // package, in dev, and in the unpacked dist directory.

    const serverPath = path.join(app.getAppPath(), 'src-gen', 'backend', 'server')
    const serverFactory = require(serverPath)
    serverFactory(port, '127.0.0.1').then(() => {
      console.log(`[loom] backend ready on port ${port}`)
    }).catch((err: unknown) => {
      // exit code 0 = clean CLI help/version exit, not a real error
      if (err !== 0) {
        console.error('[loom] backend error:', err)
        app.quit()
      }
    })

    // Wait up to 15 s for the backend to accept connections
    await waitForBackend(port)
    createWindow(port)

  } catch (err) {
    const msg = err instanceof Error ? (err.stack ?? err.message) : String(err)
    console.error('[loom] startup failed:', msg)
    const { dialog } = require('electron')
    dialog.showErrorBox('Loom failed to start', msg)
    app.exit(1)
  }
})

app.on('window-all-closed', () => {
  // On macOS apps stay in the dock until explicitly quit
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // macOS: re-open window when dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    // port is already known from the running backend — re-read from env if needed
  }
})
