// Simple helper process that accepts JSON commands on stdin and writes JSON responses to stdout.
// Commands:
// { cmd: 'login', username, password, collectionName }
// { cmd: 'log', itemName, rarity }

const readline = require('readline')
const https = require('https')
const path = require('path')

// Try to load the local game item ID -> canonical name map. Missing file is non-fatal.
let idToName = {}
try {
  idToName = require(path.join(__dirname, '..', '..', 'game_items.json'))
} catch (e) {}

function mapIdToName(key) {
  const s = String(key)
  if (/^\d+$/.test(s)) return idToName[s] || s
  return s
}

function postJson(pathSuffix, body, token) {
  const data = JSON.stringify(body)
  const opts = {
    method: 'POST',
    hostname: 'www.rotmg-builds.com',
    path: pathSuffix,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    }
  }
  if (token) opts.headers['Authorization'] = `Bearer ${token}`

  return new Promise((resolve, reject) => {
    const req = https.request(opts, res => {
      let buf = ''
      res.setEncoding('utf8')
      try { emitDebug({ level: 'info', event: 'responseStart', path: pathSuffix, statusCode: res.statusCode }) } catch (e) {}
      res.on('data', d => buf += d)
      res.on('end', () => {
        try {
          const parsed = JSON.parse(buf)
          try { emitDebug({ level: 'info', event: 'responseParsed', path: pathSuffix }) } catch (e) {}
          resolve(parsed)
        } catch (e) {
          try { emitDebug({ level: 'error', event: 'responseParseError', path: pathSuffix, error: e && e.message ? e.message : String(e) }) } catch (e2) {}
          reject(e)
        }
      })
    })
    req.on('error', (err) => {
      try { emitDebug({ level: 'error', event: 'requestError', path: pathSuffix, error: err && err.message ? err.message : String(err) }) } catch (e) {}
      reject(err)
    })
    try { req.write(data) } catch (e) { try { emitDebug({ level: 'error', event: 'requestWriteFailed', path: pathSuffix, error: String(e) }) } catch (e2) {} ; reject(e); return }
    try { emitDebug({ level: 'info', event: 'request', method: 'POST', path: pathSuffix, bytes: Buffer.byteLength(data) }) } catch (e) {}
    req.end()
  })
}

function emitDebug(obj) {
  try {
    const out = Object.assign({ cmd: 'debug', time: new Date().toISOString() }, obj)
    process.stdout.write(JSON.stringify(out) + '\n')
  } catch (e) { /* ignore */ }
}

let state = {
  username: null,
  token: null,
  collectionName: null,
  collectionId: null
}

async function handleLogin(cmd) {
  const { username, password, collectionName } = cmd
  const loginResp = await postJson('/api/login', { username, password })
  if (!loginResp || !loginResp.token) {
    emitDebug({ level: 'error', event: 'loginFailed', reason: 'no token in response' })
    throw new Error('login failed')
  }
  state.username = username
  state.token = loginResp.token
  try { emitDebug({ level: 'info', event: 'loginSuccess', username }) } catch (e) {}
  state.collectionName = collectionName
  const cols = await postJson('/api/getCollections', { username, token: state.token }, state.token)
  const collections = cols.collections || []
  const col = collections.find(c => c.name === collectionName)
  if (!col) {
    // return collections for UI
    try { emitDebug({ level: 'info', event: 'collectionNotFound', collectionName }) } catch (e) {}
    return { ok: true, collections }
  }
  state.collectionId = col.id || col.name
  try { emitDebug({ level: 'info', event: 'collectionSelected', collectionId: state.collectionId }) } catch (e) {}
  return { ok: true, collectionFound: true }
}

async function handleLog(cmd) {
  if (!state.token || !state.username || !state.collectionName) throw new Error('not logged in')
  // fetch collections, update and save
  const colsResp = await postJson('/api/getCollections', { username: state.username, token: state.token }, state.token)
  const collections = colsResp.collections || []
  let collection = collections.find(c => c.name === state.collectionName)
  if (!collection) throw new Error('collection not found')

  if (!('rarities' in collection)) collection.rarities = {}
  if (!('counts' in collection)) collection.counts = {}

  // Normalize any numeric-ID keys in this collection to canonical names
  try {
    const newCounts = {}
    for (const [k, v] of Object.entries(collection.counts || {})) {
      const nk = mapIdToName(k)
      newCounts[nk] = (newCounts[nk] || 0) + v
    }
    collection.counts = newCounts

    const newRarities = {}
    for (const [k, v] of Object.entries(collection.rarities || {})) {
      const nk = mapIdToName(k)
      newRarities[nk] = Math.max(newRarities[nk] || 0, v || 0)
    }
    collection.rarities = newRarities
  } catch (e) {
    // non-fatal: if normalization fails, leave as-is
  }

  const { itemName, rarity } = cmd
  const mappedItemName = mapIdToName(itemName)
  const currentRarity = collection.rarities[mappedItemName] || 0
  const currentCount = collection.counts[mappedItemName] || 0
  collection.counts[mappedItemName] = currentCount + 1
  collection.rarities[mappedItemName] = Math.max(currentRarity, rarity || 0)


  // Post updated collections and return the server response for visibility
  // Diagnostic: emit which item we're saving (sanitized, no token)
  try { emitDebug({ level: 'info', event: 'saveCollectionsFor', item: mappedItemName }) } catch (e) {}
  const saveResp = await postJson('/api/saveCollections', { username: state.username, token: state.token, collections }, state.token)
  try {
    if (saveResp && saveResp.saved && saveResp.saved.message) {
      emitDebug({ level: 'info', event: 'saveCollectionsResult', message: saveResp.saved.message })
    } else {
      emitDebug({ level: 'info', event: 'saveCollectionsResponseReceived' })
    }
  } catch (e) {}


  // fetch collections again to verify
  const verifyResp = await postJson('/api/getCollections', { username: state.username, token: state.token }, state.token)

  // (verbose debug logging removed)

  return { ok: true, saved: saveResp, collectionsAfterSave: verifyResp.collections || [] }
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false })
rl.on('line', async (line) => {
  let cmd
  try {
    cmd = JSON.parse(line)
  } catch (e) {
    emitDebug({ level: 'error', event: 'invalidJsonOnStdin', error: e && e.message ? e.message : String(e) })
    process.stdout.write(JSON.stringify({ ok: false, error: 'invalid json' }) + '\n')
    return
  }

    try {
      if (cmd.cmd === 'login') {
        const res = await handleLogin(cmd)
        process.stdout.write(JSON.stringify({ ok: true, cmd: 'login', result: res }) + '\n')
      } else if (cmd.cmd === 'log') {
        const res = await handleLog(cmd)
        process.stdout.write(JSON.stringify({ ok: true, cmd: 'log', result: res }) + '\n')
      } else if (cmd.cmd === 'ping') {
        process.stdout.write(JSON.stringify({ ok: true, cmd: 'ping' }) + '\n')
      } else {
        process.stdout.write(JSON.stringify({ ok: false, cmd: cmd.cmd || 'unknown', error: 'unknown cmd' }) + '\n')
      }
    } catch (e) {
      try { emitDebug({ level: 'error', event: 'commandHandlerError', cmd: cmd && cmd.cmd ? cmd.cmd : 'unknown', error: e && e.stack ? e.stack : String(e) }) } catch (ee) {}
      process.stdout.write(JSON.stringify({ ok: false, cmd: cmd.cmd || 'unknown', error: String(e) }) + '\n')
    }
})

// keep process alive
process.stdin.resume()
