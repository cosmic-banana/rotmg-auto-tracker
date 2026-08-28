const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const https = require('https')

function getKeytar() {
  try {
    return require('keytar')
  } catch (e) {
    return null
  }
}

let mainWindow
let packetInterval
let listenerInstance = null
let usingDemo = false
let helperProcess = null
let helperQueue = []
let helperReady = false

const sendToHelper = (msg) => {
  try {
    if (helperProcess && helperProcess.stdin && typeof helperProcess.stdin.write === 'function') {
      helperProcess.stdin.write(JSON.stringify(msg) + '\n')
    } else {
      helperQueue.push(msg)
      console.warn('sendToHelper: helper stdin not available, queued', msg.cmd || msg)
    }
  } catch (e) {
    helperQueue.push(msg)
    console.warn('sendToHelper error, queued', e)
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const startUrl = process.env.ELECTRON_START_URL
  if (startUrl) {
    mainWindow.loadURL(startUrl)
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()

  // Auto-start helper if config requests logging by default. Default to enabled when missing.
  (async () => {
    try {
      const cfgPath = path.resolve(__dirname, '..', '..', 'config.json')
      const cfg = require(cfgPath)
      // Auto-start helper only when credentials are configured (password checked via keytar)
      if (cfg && cfg.username && cfg.collectionName) {
        try {
          const keytar = getKeytar()
          const pw = keytar ? await keytar.getPassword('rotmg-auto-tracker', cfg.username) : ''
          if (pw) startHelperProcess()
        } catch (e) {
          // ignore keytar failures
        }
      }
    } catch (e) {
      // no config: do not auto-start helper
    }
  })()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})

// Demo packet generator: emits fake packets every 1s when started.
ipcMain.handle('tracker:start', async (event) => {
  if (listenerInstance || packetInterval) return { status: 'running' }

  // Enforce website logging and credentials before starting the tracker
  try {
    const cfgPath = path.resolve(__dirname, '..', '..', 'config.json')
    const cfg = require(cfgPath)
    if (!cfg.username || !cfg.collectionName) return { status: 'error', error: 'Username and collectionName must be set in settings' }
    // ensure password is available in keytar (or at least present)
    let password = ''
    try {
      const keytar = getKeytar()
      if (keytar && cfg.username) password = await keytar.getPassword('rotmg-auto-tracker', cfg.username) || ''
    } catch (e) { /* ignore */ }
    if (!password) return { status: 'error', error: 'Password not found. Save credentials in settings.' }
  } catch (e) {
    return { status: 'error', error: 'Config missing or unreadable; please configure logging and credentials.' }
  }

  // Ensure helper process is running so logs can be sent immediately
  try {
    if (!helperProcess) {
      startHelperProcess()
    } else if (helperProcess && !helperReady) {
      // helper is present but not logged in (previous login failed). Re-send login with current creds.
      (async () => {
        try {
          const cfgPath = path.resolve(__dirname, '..', '..', 'config.json')
          const cfg = require(cfgPath)
          let password = ''
          try {
            const keytar = getKeytar()
            if (keytar && cfg.username) password = await keytar.getPassword('rotmg-auto-tracker', cfg.username) || ''
          } catch (e) { /* ignore */ }
          if (cfg && cfg.username && password) {
            const loginMsg = { cmd: 'login', username: cfg.username, password, collectionName: cfg.collectionName }
            try { sendToHelper(loginMsg) } catch (e) { console.warn('re-login queued', e); }
          }
        } catch (e) { console.warn('relogin attempt failed', e) }
      })()
    }
  } catch (e) { console.warn('startHelperProcess failed', e) }

  // Try to start the real tracker using the repo's Node modules. If that fails, fall back to demo.
  try {
    const Listener = require(path.resolve(__dirname, '..', '..', 'src', 'listener.js'))
    const WikiScraper = require(path.resolve(__dirname, '..', '..', 'src', 'wikiScraper.js'))
    // Avoid requiring rotmgBuilds.js because it imports Playwright which requires Node 20+.
    const Session = require(path.resolve(__dirname, '..', '..', 'src', 'session.js'))
    const Packet_2A = require(path.resolve(__dirname, '..', '..', 'src', 'packet_2a.js'))
    const fs = require('fs')

    const appLike = {
      // Minimal rotmgBuilds stub to avoid Playwright at startup. Replace with the real module if Node >= 20.
      rotmgBuilds: {
        masterlistItems: [],
        logItem: function(itemName, rarity) {
          // enqueue or send to helper process
          const msg = { cmd: 'log', itemName, rarity }
          sendToHelper(msg)
        }
      },
      wikiScraper: new WikiScraper(),
      newConnection() {
        const session = new Session(this)
        // wrap handlePacket so we can forward parsed loot packets to the renderer
        const orig = session.handlePacket.bind(session)
        // rate-limited logging for forward-parsing errors to avoid spam from corrupted packets
        const _forwardErrorState = { count: 0, windowStart: Date.now() }
        const _shouldLogForwardError = () => {
          const now = Date.now()
          if (now - _forwardErrorState.windowStart > 60_000) {
            _forwardErrorState.count = 0
            _forwardErrorState.windowStart = now
          }
          _forwardErrorState.count += 1
          return _forwardErrorState.count <= 10
        }

        session.handlePacket = (packetId, payload) => {
          try {
            orig(packetId, payload)
          } catch (e) {
            console.error('session.handlePacket error', e)
          }
          // try to parse again only for UI forwarding; errors here are not fatal and are rate-limited
          if (packetId !== 0x2A) return
          try {
            const pkt = new Packet_2A(payload)
            if (!pkt.hasLoot()) return
            for (const id of pkt.getLootBagIds()) {
              const contents = pkt.getLootBagContentsById(id)
              // send minimal payload to renderer
              if (mainWindow && mainWindow.webContents) mainWindow.webContents.send('tracker:packet', {
                type: '2A', id, contents, time: new Date().toISOString()
              })
            }
          } catch (e) {
            if (_shouldLogForwardError()) {
              console.warn('packet parsing forward error (suppressed after limit):', e && e.message ? e.message : e)
            }
          }
        }
        return session
      }
    }

    // Load local wiki items (fast) using absolute path to avoid cwd issues
    try {
      const gameItemsPath = path.resolve(__dirname, '..', '..', 'game_items.json')
      const content = fs.readFileSync(gameItemsPath, 'utf8')
      appLike.wikiScraper.wikiItems = JSON.parse(content)
    } catch (e) {
      console.warn('wiki load failed', e)
    }

    listenerInstance = new Listener(appLike)
    listenerInstance.start()
    usingDemo = false
    return { status: 'started', mode: 'real' }
  } catch (e) {
    console.error('Real tracker start failed, falling back to demo:', e)
    // Fall back to demo generator
    let counter = 0
    packetInterval = setInterval(() => {
      counter += 1
      const pkt = {
        id: counter,
        type: 'DEMO_PACKET',
        time: new Date().toISOString(),
        payload: { message: `Demo packet #${counter}` }
      }
      mainWindow.webContents.send('tracker:packet', pkt)
    }, 1000)
    usingDemo = true
    return { status: 'started', mode: 'demo' }
  }
})

ipcMain.handle('tracker:stop', (event) => {
  if (listenerInstance) {
    try { listenerInstance.stop() } catch (e) { console.error(e) }
    listenerInstance = null
  }
  if (packetInterval) {
    clearInterval(packetInterval)
    packetInterval = null
  }
  usingDemo = false
  return { status: 'stopped' }
})

ipcMain.handle('tracker:status', () => {
  return { running: !!listenerInstance || !!packetInterval, mode: listenerInstance ? 'real' : (usingDemo ? 'demo' : null) }
})

// Config read/write handlers
ipcMain.handle('config:get', async () => {
  try {
    const cfgPath = path.resolve(__dirname, '..', '..', 'config.json')
    const raw = require(cfgPath)
    // retrieve password from keytar if possible
    try {
      const keytar = getKeytar()
      if (keytar && raw.username) {
        const pw = await keytar.getPassword('rotmg-auto-tracker', raw.username)
        raw.password = pw || ''
      }
    } catch (e) {
      console.warn('keytar.getPassword failed', e)
    }
    return { ok: true, config: raw }
  } catch (e) {
    console.error('config:get failed', e)
    return { ok: false, error: String(e) }
  }
})

ipcMain.handle('config:set', async (event, cfg) => {
  try {
    const cfgPath = path.resolve(__dirname, '..', '..', 'config.json')
    const fs = require('fs')
    // preserve only username and collectionName in file; password stored in keytar
    const out = {
      username: cfg.username || '',
      collectionName: cfg.collectionName || ''
    }
    // read existing to detect username change
    let prevUsername = null
    try {
      const existing = require(cfgPath)
      prevUsername = existing.username
    } catch (e) { /* ignore missing */ }

    fs.writeFileSync(cfgPath, JSON.stringify(out, null, 2), 'utf8')

    try {
      const keytar = getKeytar()
      if (keytar && cfg.password) {
        // if username changed, delete old entry
        if (prevUsername && prevUsername !== out.username) {
          try { await keytar.deletePassword('rotmg-auto-tracker', prevUsername) } catch (e) { /* ignore */ }
        }
        if (out.username) await keytar.setPassword('rotmg-auto-tracker', out.username, cfg.password)
      }
    } catch (e) {
      console.warn('keytar.setPassword failed', e)
    }

    return { ok: true }
  } catch (e) {
    console.error('config:set failed', e)
    return { ok: false, error: String(e) }
  }
})

// Test login: POST to rotmg-builds login and verify collection exists. Does not require Playwright.
ipcMain.handle('config:testLogin', async (event, cfg) => {
  try {
    const username = cfg.username
    const password = cfg.password
    const collectionName = cfg.collectionName
    if (!username || !password) return { ok: false, error: 'username/password required' }

    const base = 'https://www.rotmg-builds.com'
    const post = (pathSuffix, body, token) => new Promise((resolve, reject) => {
      const data = JSON.stringify(body)
      const url = new URL(base + pathSuffix)
      const opts = {
        method: 'POST',
        hostname: url.hostname,
        path: url.pathname,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      }
      if (token) opts.headers['Authorization'] = `Bearer ${token}`
      const req = https.request(opts, res => {
        let buf = ''
        res.setEncoding('utf8')
        res.on('data', d => buf += d)
        res.on('end', () => {
          try { resolve(JSON.parse(buf)) } catch (e) { reject(e) }
        })
      })
      req.on('error', err => reject(err))
      req.write(data)
      req.end()
    })

    const loginResp = await post('/api/login', { username, password })
    if (!loginResp || !loginResp.token) return { ok: false, error: 'login failed' }
    const token = loginResp.token
    const colsResp = await post('/api/getCollections', { username, token }, token)
    const collections = colsResp && colsResp.collections ? colsResp.collections : []
    const found = collections.find(c => c.name === collectionName) !== undefined
    return { ok: true, collections, collectionFound: found }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
})

function startHelperProcess(cfg) {
  const { spawn } = require('child_process')
  const helperPath = path.resolve(__dirname, '..', 'helper', 'index.js')
  // spawn using system node; if unavailable, fall back to process.execPath (Electron)
  const nodeCmd = 'node'
  try {
    helperProcess = spawn(nodeCmd, [helperPath], { stdio: ['pipe', 'pipe', 'pipe'] })
  } catch (e) {
    helperProcess = spawn(process.execPath, [helperPath], { stdio: ['pipe', 'pipe', 'pipe'] })
  }

  helperReady = false
  helperProcess.stdout.setEncoding('utf8')
  helperProcess.stdout.on('data', (data) => {
    const lines = data.split(/\r?\n/).filter(Boolean)
    for (const line of lines) {
      const t = String(line)
      const trimmed = t.trim()
      if (!trimmed) continue
      const first = trimmed[0]
      // Only attempt JSON.parse when the line looks like JSON (object/array)
      if (first === '{' || first === '[') {
        try {
          const obj = JSON.parse(trimmed)
          // forward responses to main window for visibility
          if (mainWindow && mainWindow.webContents) mainWindow.webContents.send('helper:resp', obj)
          // If helper replied to login, handle readiness and queue flushing based on login success
          if (obj && obj.cmd === 'login') {
            if (obj.ok) {
              helperReady = true
              // flush queue
              while (helperQueue.length > 0) {
                const m = helperQueue.shift()
                try {
                  sendToHelper(m)
                } catch (e) { console.warn('send to helper failed', e); helperQueue.unshift(m); break }
              }
            } else {
              helperReady = false
              // notify renderer that login failed
              if (mainWindow && mainWindow.webContents) mainWindow.webContents.send('helper:loginFailed', { error: obj.error })
            }
          }
        } catch (e) {
          // Non-fatal: line looked like JSON but failed to parse. Forward as debug text instead of spamming stack traces.
          console.warn('helper stdout json parse error (not fatal):', e && e.message ? e.message : e)
          if (mainWindow && mainWindow.webContents) mainWindow.webContents.send('helper:log', { text: trimmed })
        }
      } else {
        // Plain text log emitted by the helper (console.log). Forward to renderer as debug text.
        if (mainWindow && mainWindow.webContents) mainWindow.webContents.send('helper:log', { text: trimmed })
      }
    }
  })
  helperProcess.stderr.setEncoding('utf8')
  helperProcess.stderr.on('data', (d) => console.error('[helper]', d))

  helperProcess.on('exit', (code) => {
    helperProcess = null
    helperReady = false
    helperQueue = []
    if (mainWindow && mainWindow.webContents) mainWindow.webContents.send('helper:exit', { code })
  })

  // send ping then login when helper starts. We'll wait for helper's login response to mark ready and flush queue.
  // Inline safe write here to avoid failures
  try {
    if (helperProcess && helperProcess.stdin && typeof helperProcess.stdin.write === 'function') {
      helperProcess.stdin.write(JSON.stringify({ cmd: 'ping' }) + '\n')
    } else {
      helperQueue.push({ cmd: 'ping' })
    }
  } catch (e) { helperQueue.push({ cmd: 'ping' }); console.warn('ping queued', e) }
  (async () => {
    try {
      // retrieve credentials
      const cfgPath = path.resolve(__dirname, '..', '..', 'config.json')
      const cfg = require(cfgPath)
      let password = ''
      try {
        const keytar = getKeytar()
        if (keytar && cfg.username) password = await keytar.getPassword('rotmg-auto-tracker', cfg.username) || ''
      } catch (e) { /* ignore */ }
      const loginMsg = { cmd: 'login', username: cfg.username, password, collectionName: cfg.collectionName }
      try {
        if (helperProcess && helperProcess.stdin && typeof helperProcess.stdin.write === 'function') {
          helperProcess.stdin.write(JSON.stringify(loginMsg) + '\n')
        } else {
          helperQueue.push(loginMsg)
        }
      } catch (e) { helperQueue.push(loginMsg); console.warn('login queued', e) }
      // do not set helperReady here; wait for helper stdout response handler to set readiness based on login outcome
    } catch (e) { console.error('startHelperProcess error', e) }
  })()
}

function stopHelperProcess() {
  if (!helperProcess) return
  try { helperProcess.kill() } catch (e) { /* ignore */ }
  helperProcess = null
  helperReady = false
  helperQueue = []
}

ipcMain.handle('logging:set', async (event, enabled) => {
  if (enabled) {
    startHelperProcess()
    return { ok: true }
  } else {
    stopHelperProcess()
    return { ok: true }
  }
})

ipcMain.handle('logging:status', async () => {
  return { enabled: !!helperProcess, ready: helperReady }
})

// Example: to integrate your Node modules directly, you could require them here.
// const listener = require(path.resolve(__dirname, '..', '..', 'src', 'listener.js'))
// Then use listener.start() and emit parsed packets via mainWindow.webContents.send('tracker:packet', parsed)
