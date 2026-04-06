// Loom Electron Main Process
// Starts the Theia backend then opens the BrowserWindow

import { app, BrowserWindow, shell } from 'electron'
import * as fs from 'fs'
import * as http from 'http'
import * as net from 'net'
import * as path from 'path'

// Ensure app name is "Loom" so userData is %APPDATA%\Loom, not %APPDATA%\loom-electron
app.setName('Loom')

// Keep a global reference so the window isn't garbage-collected
let mainWindow: BrowserWindow | null = null

// ── File logger — writes to %APPDATA%\Loom\loom-debug.log ────────────────────
// Uses appendFileSync so every write is on disk immediately, even if we crash.
let logPath = ''

function initLog (): void {
  try {
    const logDir = app.getPath('userData')
    fs.mkdirSync(logDir, { recursive: true })
    logPath = path.join(logDir, 'loom-debug.log')
    log(`\n${'='.repeat(60)}`)
    log(`Loom startup  ${new Date().toISOString()}`)
    log(`Electron ${process.versions.electron}  Node ${process.versions.node}`)
    log(`Platform: ${process.platform}  Arch: ${process.arch}`)
    log(`appPath: ${app.getAppPath()}`)
    log(`userData: ${logDir}`)
    log('='.repeat(60))
  } catch (e) {
    // If we can't write the log, swallow — the error dialog will still appear
  }
}

function log (msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`
  console.log(line)
  if (logPath) {
    try { fs.appendFileSync(logPath, line + '\n') } catch (_) { /* ignore */ }
  }
}

function showFatalError (msg: string): void {
  log(`FATAL: ${msg}`)
  const { dialog } = require('electron')
  // Also append the log path so the user knows where to find it
  const logFile = logPath || '(log unavailable)'
  dialog.showErrorBox(
    'Loom failed to start',
    `${msg}\n\nFull log: ${logFile}`
  )
  app.exit(1)
}

// Surface uncaught synchronous errors
process.on('uncaughtException', (err) => {
  showFatalError(err.stack ?? err.message)
})

// Surface unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)
  showFatalError(`Unhandled rejection: ${msg}`)
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
function waitForBackend (port: number, retries = 40): Promise<void> {
  return new Promise((resolve, reject) => {
    let attempts = 0
    const check = () => {
      const req = http.get(`http://127.0.0.1:${port}`, () => { resolve() })
      req.on('error', () => {
        attempts++
        if (attempts % 5 === 0) log(`  still waiting for backend (attempt ${attempts}/${retries})`)
        if (attempts >= retries) {
          reject(new Error(`Backend did not respond on port ${port} after ${retries} attempts`))
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
  log(`Creating BrowserWindow → http://127.0.0.1:${port}`)
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'Loom',
    icon: path.join(app.getAppPath(), 'resources', 'icon.ico'),
    backgroundColor: '#1e1e1e',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      allowRunningInsecureContent: false,
    },
  })

  mainWindow.loadURL(`http://127.0.0.1:${port}`)
  mainWindow.once('ready-to-show', () => {
    log('Window ready-to-show → showing')
    mainWindow!.show()
    mainWindow!.focus()
  })

  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    log(`Page load failed: ${code} ${desc}`)
  })

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
  initLog()

  try {
    log('Step 1: finding free port')
    const port = await getFreePort()
    log(`Step 2: port ${port} selected`)

    const userData = app.getPath('userData')
    process.env.THEIA_APP_PROJECT_PATH = userData
    log(`Step 3: THEIA_APP_PROJECT_PATH = ${userData}`)

    const serverPath = path.join(app.getAppPath(), 'src-gen', 'backend', 'server')
    log(`Step 4: loading server module from ${serverPath}`)
    const serverFactory = require(serverPath)
    // Re-apply: server.js sets it unconditionally at module-load time
    process.env.THEIA_APP_PROJECT_PATH = userData
    log('Step 5: server module loaded OK')

    // Start backend; if it fails fast, reject immediately instead of waiting 20 s
    log('Step 6: starting Theia backend')
    let serverFailed = false
    const serverDone = serverFactory(port, '127.0.0.1')
      .then(() => { log('Step 6a: serverFactory resolved') })
      .catch((err: unknown) => {
        if (err === 0) return   // clean Theia CLI exit (--help etc.)
        serverFailed = true
        const msg = err instanceof Error ? (err.stack ?? err.message) : String(err)
        log(`Step 6 FAILED: ${msg}`)
        throw err               // propagate into Promise.race
      })

    log('Step 7: polling backend HTTP endpoint')
    // Race: fail immediately if the server crashes, otherwise wait for HTTP
    await Promise.race([
      waitForBackend(port),
      serverDone,
    ])

    if (serverFailed) {
      throw new Error('Backend startup failed (see log)')
    }

    log('Step 8: backend accepting connections → creating window')
    createWindow(port)

  } catch (err) {
    const msg = err instanceof Error ? (err.stack ?? err.message) : String(err)
    showFatalError(msg)
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
