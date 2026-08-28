import React, { useEffect, useState, useRef } from 'react'
import gameItems from '../../../game_items.json'

// Mirror of src/util.js getItemEnchantIds/getItemRarity but browser-friendly
function getItemEnchantIds(base64) {
  if (!base64) return []
  try {
    const fixed = base64.replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(fixed)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const view = new DataView(bytes.buffer)
    const enchantIds = []
    let offset = 3
    for (let i = 0; i < 4; i++) {
      if (offset + 1 >= bytes.length) break
      const val = view.getUint16(offset, true) // little-endian
      if (val !== 0xFFFD) enchantIds.push(val)
      offset += 2
    }
    return enchantIds
  } catch (e) {
    return []
  }
}

function getItemRarity(base64) {
  return getItemEnchantIds(base64).length
}

export default function App() {
  const [running, setRunning] = useState(false)
  const [packets, setPackets] = useState([])
  const [showSettings, setShowSettings] = useState(false)
  const [config, setConfig] = useState({ username: '', password: '', collectionName: '' })
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [loggingReady, setLoggingReady] = useState(false)
  const [helperStatus, setHelperStatus] = useState({ state: 'stopped', detail: null })
  const unsubscribeRef = useRef(null)

  useEffect(() => {
    // query initial status
    if (window.trackerAPI && window.trackerAPI.status) {
      window.trackerAPI.status().then(s => setRunning(!!s.running))
    }

    // load config
    if (window.configAPI && window.configAPI.get) {
      window.configAPI.get().then(res => {
        if (res && res.ok && res.config) setConfig(res.config)
      })
    }

    if (window.electronAPI && window.electronAPI.loggingStatus) {
      window.electronAPI.loggingStatus().then(s => {
        setLoggingReady(!!s.ready)
      })
    }

    // subscribe to minimal helper events for login/status
    if (window.helperAPI && window.helperAPI.onResp) {
      const unsub = window.helperAPI.onResp((msg) => {
        if (!msg || !msg.cmd) return
        if (msg.cmd === 'debug') {
          try { console.log('helper debug:', msg) } catch (e) {}
          return
        }
        if (msg.cmd === 'ping') {
          setHelperStatus({ state: 'alive', detail: null })
        } else if (msg.cmd === 'login') {
          const ok = msg.result && msg.result.ok !== false
          const found = msg.result && msg.result.collectionFound
          setHelperStatus({ state: ok ? 'logged-in' : 'login-failed', detail: found ? 'collection found' : 'collection missing' })
        } else if (msg.cmd === 'log') {
          setHelperStatus(s => ({ ...s, detail: 'last log OK' }))
        }
      })
      const unsubFail = window.helperAPI.onLoginFailed((msg) => {
        setHelperStatus({ state: 'login-failed', detail: msg && msg.error ? msg.error : 'unknown' })
      })
      const unsubExit = window.helperAPI.onExit((msg) => {
        setHelperStatus({ state: 'stopped', detail: msg && msg.code != null ? `exit ${msg.code}` : null })
      })
      // subscribe to plain-text helper logs and print to DevTools console
      let unsubLog = null
      if (window.helperAPI && window.helperAPI.onLog) {
        unsubLog = window.helperAPI.onLog((msg) => {
          try { console.log('helper:', msg && msg.text ? msg.text : msg) } catch (e) {}
        })
      }
      return () => { if (unsub) unsub(); if (unsubFail) unsubFail(); if (unsubExit) unsubExit(); if (unsubLog) unsubLog() }
    }
  }, [])

  const start = async () => {
    if (!window.trackerAPI) return
    // Prevent starting unless credentials present
    if (!config.username || !config.collectionName || !config.password) {
      setSaveStatus('need_logging')
      return
    }
    const res = await window.trackerAPI.start()
    if (res && res.status === 'error') {
      setSaveStatus('start_error')
      return
    }
    setRunning(true)
    unsubscribeRef.current = window.trackerAPI.onPacket((pkt) => {
      setPackets(prev => [pkt, ...prev].slice(0, 500))
    })
  }

  const stop = async () => {
    if (!window.trackerAPI) return
    await window.trackerAPI.stop()
    setRunning(false)
    if (unsubscribeRef.current) unsubscribeRef.current()
    unsubscribeRef.current = null
  }

  const saveConfig = async () => {
    if (!window.configAPI || !window.configAPI.set) return
    setSaving(true)
    setSaveStatus(null)
    const res = await window.configAPI.set(config)
    setSaving(false)
    if (res && res.ok) setSaveStatus('saved')
    else setSaveStatus('error')
  }

  const testLogin = async () => {
    if (!window.configAPI || !window.configAPI.testLogin) return
    setSaveStatus(null)
    setTestResult(null)
    setTesting(true)
    try {
      const res = await window.configAPI.testLogin(config)
      setTesting(false)
      if (res && res.ok) {
        setSaveStatus('login_ok')
        setTestResult({ ok: true, collections: res.collections || [], collectionFound: res.collectionFound })
      } else {
        setSaveStatus('login_error')
        setTestResult({ ok: false, error: res && res.error ? res.error : 'unknown' })
      }
    } catch (e) {
      setTesting(false)
      setSaveStatus('login_error')
      setTestResult({ ok: false, error: String(e) })
    }
  }

  // Website logging is mandatory; no toggle provided in the UI.

  return (
    <div className="app">
      <header className="header">
        <h1>rotmg-auto-tracker — Desktop</h1>
        <div style={{display:'flex', alignItems:'center', gap:12}}>
          <div style={{fontSize:12}}>
            Helper: {helperStatus.state === 'stopped' && <span style={{color:'#f97316'}}>stopped</span>}
            {helperStatus.state === 'alive' && <span style={{color:'#60a5fa'}}>alive</span>}
            {helperStatus.state === 'logged-in' && <span style={{color:'#10b981'}}>logged in</span>}
            {helperStatus.state === 'login-failed' && <span style={{color:'#ef4444'}}>login failed</span>}
            {helperStatus.detail && <span style={{marginLeft:8, color:'#6b7280'}}>{helperStatus.detail}</span>}
          </div>
        
          <button className="btn" onClick={() => setShowSettings(s => !s)} style={{marginRight:8}}>{showSettings? 'Close Settings' : 'Settings'}</button>
          {running ? (
            <button className="btn stop" onClick={stop}>Stop</button>
          ) : (
            <button className="btn start" onClick={start} disabled={!config.username || !config.collectionName || !config.password}>Start</button>
          )}
        </div>
      </header>

      {showSettings && (
        <section className="panel" style={{marginBottom:12}}>
          <h2>Settings</h2>
          {running && (
            <div style={{padding:8, background:'#fff5f5', color:'#b91c1c', borderRadius:4, marginBottom:8}}>Settings are locked while the tracker is running.</div>
          )}
          <div style={{display:'grid', gridTemplateColumns:'160px 1fr', gap:8, alignItems:'center'}}>
            <label>Username</label>
            <input value={config.username} onChange={e => setConfig({...config, username: e.target.value})} disabled={running} />
            <label>Password</label>
            <input type="password" value={config.password} onChange={e => setConfig({...config, password: e.target.value})} disabled={running} />
            <label>Collection Name</label>
            <input value={config.collectionName} onChange={e => setConfig({...config, collectionName: e.target.value})} disabled={running} />
            <div />
            <div style={{display:'flex', gap:8, alignItems:'center'}}>
              <button className="btn start" onClick={saveConfig} disabled={saving || running}>{saving? 'Saving...' : 'Save'}</button>
              <button className="btn" onClick={testLogin} disabled={testing || running}>{testing? 'Testing...' : 'Test Login'}</button>
              {/* Website logging is mandatory; no toggle shown. */}
              {loggingReady && <span style={{color:'#8bdc87'}}>Logging Ready</span>}
              {saveStatus === 'saved' && <span style={{color:'#8bdc87'}}>Saved</span>}
              {saveStatus === 'error' && <span style={{color:'#f87171'}}>Error</span>}
              {saveStatus === 'login_ok' && <span style={{color:'#8bdc87'}}>Login OK</span>}
              {saveStatus === 'login_error' && <span style={{color:'#f87171'}}>Login Failed</span>}
            </div>
            {testResult && (
              <div style={{marginTop:8}}>
                {testResult.ok ? (
                  <div style={{color:'#8bdc87'}}>Login succeeded. Collections: {testResult.collections.map(c=>c.name).join(', ')}</div>
                ) : (
                  <div style={{color:'#f87171'}}>Login failed: {testResult.error}</div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      <main>
        <section className="panel">
          <h2>Live Packets</h2>
          <div className="packets">
            {packets.length === 0 && <div className="empty">No packets yet — start the tracker.</div>}
            {packets.map(p => (
              <div key={p.id + (p.time||'')} className="packet">
                <div className="meta">#{p.id} • {p.type} • {p.time ? new Date(p.time).toLocaleTimeString() : ''}</div>
                <div>
                  {Array.isArray(p.contents) && p.contents.length > 0 ? (
                    <table style={{width:'100%', borderCollapse:'collapse'}}>
                      <thead>
                        <tr><th style={{textAlign:'left'}}>Slot</th><th style={{textAlign:'left'}}>Name</th><th style={{textAlign:'left'}}>Rarity</th><th style={{textAlign:'left'}}>Raw</th></tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const seen = new Set()
                          return p.contents.map((it, idx) => {
                            const id = it && it[0]
                            const raw = it && it[1]
                            const name = (id !== undefined && gameItems && gameItems[String(id)]) ? gameItems[String(id)] : String(id)
                            // Filter noise: unmapped numeric id with empty raw is likely not an item
                            if ((String(name).match(/^\d+$/) !== null) && (!raw || raw === '')) return null
                            // Deduplicate by name within this packet
                            if (seen.has(name)) return null
                            seen.add(name)
                          // compute rarity using the same logic as src/util.js
                          const rarity = getItemRarity(raw)

                          return (
                            <tr key={idx} style={{borderTop:'1px solid #eee'}}>
                              <td style={{padding:'6px'}}>{idx+1}</td>
                              <td style={{padding:'6px'}}>{name}</td>
                              <td style={{padding:'6px'}}>{rarity}</td>
                              <td style={{padding:'6px', fontSize:12}}>{raw || ''}</td>
                            </tr>
                          )
                          }).filter(Boolean)
                        })()}
                      </tbody>
                    </table>
                  ) : (
                    <pre>{JSON.stringify(p.contents || p.payload || {}, null, 2)}</pre>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
        {/* Helper debug panel removed */}
      </main>
    </div>
  )
}
