// @ts-check
/**
 * Flowstate's Electron shell.
 *
 * The renderer is the same `dist/` build the web app and the Android app use.
 * It is served from a private `app://flowstate` origin instead of `file://` so
 * the page gets a real, stable origin: local storage survives restarts, the
 * pronunciation chunk and canvas work like they do on the web, and the origin
 * counts as a secure context for the microphone.
 */
import { app, BrowserWindow, Menu, dialog, ipcMain, protocol, session, shell } from 'electron'
import { readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(HERE, '..', 'dist')
const ORIGIN = 'app://flowstate'
/** Set FLOWSTATE_DEV_URL=http://localhost:3000 to point the shell at `npm run dev`. */
const DEV_URL = process.env.FLOWSTATE_DEV_URL ?? ''
const PAPER = '#f6f1e8'

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
}

// Must run before the app is ready. `allowServiceWorkers` is deliberately left
// off: the app is already on disk, and a cached shell would outlive updates.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
])

/** @type {BrowserWindow | null} */
let mainWindow = null

/**
 * @param {number} status
 * @param {string} message
 */
const fail = (status, message) => new Response(message, { status })

/** @param {Request} request */
async function serveFromDist(request) {
  const url = new URL(request.url)
  if (url.host !== 'flowstate') return fail(404, 'Not found')

  const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '')
  const target = path.join(DIST, relative || 'index.html')
  if (target !== DIST && !target.startsWith(DIST + path.sep)) return fail(403, 'Forbidden')

  try {
    const body = await readFile(target)
    /** @type {BodyInit} */
    const payload = /** @type {any} */ (body)
    return new Response(payload, {
      headers: { 'content-type': MIME[/** @type {keyof MIME} */ (path.extname(target).toLowerCase())] ?? 'application/octet-stream' },
    })
  } catch {
    // A missing asset is a real 404; a missing page falls back to the shell.
    if (path.extname(relative)) return fail(404, 'Not found')
    try {
      const html = await readFile(path.join(DIST, 'index.html'))
      return new Response(/** @type {any} */ (html), { headers: { 'content-type': MIME['.html'] } })
    } catch {
      return fail(500, 'The app build is missing. Run `npm run build` first.')
    }
  }
}

/** Microphone for the booth recorder; nothing else is granted. */
function grantMicrophone() {
  const ses = session.defaultSession

  ses.setPermissionCheckHandler((_contents, permission, requestingOrigin, details) => {
    if (permission !== 'media') return false
    if (!requestingOrigin.startsWith(ORIGIN)) return false
    return (details?.mediaType ?? 'audio') !== 'video'
  })

  ses.setPermissionRequestHandler((_contents, permission, callback, details) => {
    if (permission !== 'media') return callback(false)
    const { mediaTypes } = /** @type {Electron.MediaAccessPermissionRequest} */ (details)
    callback((mediaTypes ?? []).every((type) => type === 'audio'))
  })
}

/**
 * Only our own page may call the IPC handlers.
 * @param {Electron.IpcMainInvokeEvent} event
 */
function trusted(event) {
  const url = event.senderFrame?.url ?? ''
  if (url.startsWith(ORIGIN)) return true
  return DEV_URL !== '' && url.startsWith(DEV_URL)
}

/**
 * @param {unknown} value
 * @returns {Buffer | null}
 */
function toBuffer(value) {
  if (value instanceof ArrayBuffer) return Buffer.from(new Uint8Array(value))
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength)
  return null
}

/**
 * @param {string} filename
 * @returns {Electron.FileFilter[]}
 */
function filtersFor(filename) {
  /** @type {Record<string, Electron.FileFilter>} */
  const byExtension = {
    '.png': { name: 'PNG image', extensions: ['png'] },
    '.json': { name: 'JSON', extensions: ['json'] },
    '.md': { name: 'Markdown', extensions: ['md'] },
    '.lrc': { name: 'LRC lyrics', extensions: ['lrc'] },
    '.txt': { name: 'Text', extensions: ['txt'] },
  }
  const match = byExtension[path.extname(filename).toLowerCase()]
  return match ? [match, { name: 'All files', extensions: ['*'] }] : [{ name: 'All files', extensions: ['*'] }]
}

/**
 * Blob downloads are dropped in a desktop shell, so the renderer hands the
 * bytes here and the user picks where they go.
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {unknown} payload
 */
async function handleSaveFile(event, payload) {
  if (!trusted(event)) return { ok: false, reason: 'untrusted' }

  const input = /** @type {{ suggestedName?: unknown, mimeType?: unknown, data?: unknown }} */ (payload ?? {})
  const suggestedName = typeof input.suggestedName === 'string' ? path.basename(input.suggestedName) : ''
  const data = toBuffer(input.data)
  if (!suggestedName || !data) return { ok: false, reason: 'bad-request' }

  const options = {
    defaultPath: path.join(app.getPath('documents'), suggestedName),
    filters: filtersFor(suggestedName),
  }
  const owner = BrowserWindow.fromWebContents(event.sender)
  const result = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options)

  if (result.canceled || !result.filePath) return { ok: false, reason: 'canceled' }
  try {
    await writeFile(result.filePath, data)
    return { ok: true, filePath: result.filePath }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'write-failed' }
  }
}

/**
 * The browser's `window.open('', '_blank')` + `print()` flow has no window to
 * open in, so print the document from a hidden window instead.
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {unknown} payload
 */
async function handlePrint(event, payload) {
  if (!trusted(event)) return { ok: false, reason: 'untrusted' }

  const input = /** @type {{ html?: unknown }} */ (payload ?? {})
  if (typeof input.html !== 'string' || input.html.length === 0) return { ok: false, reason: 'bad-request' }

  const file = path.join(app.getPath('temp'), `flowstate-print-${Date.now()}.html`)
  await writeFile(file, input.html, 'utf8')

  const printer = new BrowserWindow({
    show: false,
    width: 800,
    height: 900,
    backgroundColor: '#ffffff',
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  })

  try {
    await printer.loadFile(file)
    const outcome = await new Promise((resolve) => {
      printer.webContents.print({ printBackground: true }, (success, failureReason) => resolve({ success, failureReason }))
    })
    return outcome.success ? { ok: true } : { ok: false, reason: outcome.failureReason || 'print-cancelled' }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'print-failed' }
  } finally {
    printer.destroy()
    void unlink(file).catch(() => undefined)
  }
}

function buildMenu() {
  /** @type {Electron.MenuItemConstructorOptions[]} */
  const template = [
    { label: 'File', submenu: [{ role: 'quit' }] },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 880,
    minWidth: 720,
    minHeight: 560,
    show: false,
    title: 'Flowstate',
    backgroundColor: PAPER,
    webPreferences: {
      preload: path.join(HERE, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error(`[flowstate] could not load ${url}: ${description} (${code})`)
  })

  // Nothing in the app opens its own window; real links belong in the browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = DEV_URL ? url.startsWith(DEV_URL) : url.startsWith(ORIGIN)
    if (!allowed) event.preventDefault()
  })

  if (DEV_URL) void mainWindow.loadURL(DEV_URL)
  else void mainWindow.loadURL(`${ORIGIN}/`)
}

function main() {
  // Keep the same data folder whether the app runs from source or is installed.
  app.setName('Flowstate')
  app.setPath('userData', path.join(app.getPath('appData'), 'Flowstate'))
  app.setAppUserModelId('com.flowstate.app')

  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.on('window-all-closed', () => {
    app.quit()
  })

  void app.whenReady().then(() => {
    if (!DEV_URL) protocol.handle('app', serveFromDist)
    grantMicrophone()
    buildMenu()
    ipcMain.handle('flowstate:save-file', handleSaveFile)
    ipcMain.handle('flowstate:print', handlePrint)
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

if (!app.requestSingleInstanceLock()) app.quit()
else main()
