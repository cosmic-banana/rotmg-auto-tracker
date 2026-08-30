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
  const [showSettings, setShowSettings] = useState(true)
  const [config, setConfig] = useState({ username: '', password: '', collectionName: '' })
  const [collections, setCollections] = useState([])
  const [authenticated, setAuthenticated] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [saveStatus, setSaveStatus] = useState(null)
  const [testing, setTesting] = useState(false)
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
        if (res && res.ok && res.config) {
          setConfig({ ...res.config, collectionName: '' })
        }
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
    if (!config.collectionName) {
      setSaveStatus('need_collection')
      return
    }
    if (!config.username || !config.password) {
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

  const login = async () => {
    if (!window.configAPI || !window.configAPI.testLogin) return
    setSaveStatus(null)
    setTesting(true)
    try {
      const res = await window.configAPI.testLogin(config)
      setTesting(false)
      if (res && res.ok) {
        setSaveStatus('login_ok')
        setCollections(res.collections || [])
        setAuthenticated(true)
        setConfig(current => ({ ...current, collectionName: '' }))
      } else {
        setSaveStatus('login_error')
      }
    } catch (e) {
      setTesting(false)
      setSaveStatus('login_error')
    }
  }

  const aboutModal = showAbout ? (
    <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:10}} onClick={() => setShowAbout(false)}>
      <section className="panel" role="dialog" aria-modal="true" aria-labelledby="about-title" onClick={e => e.stopPropagation()} style={{maxWidth:420, margin:16}}>
        <h2 id="about-title">About rotmg-auto-tracker</h2>
        <p>rotmg-auto-tracker is a dedicated tool for rotmg-builds.com that automatically tracks eligible RotMG loot and logs it to your selected collection.</p>
        <p>Per DECA's recent blog post, <a href="https://hub.realmofthemadgod.com/news0/news1/guardians" target="_blank" rel="noopener noreferrer">sniffers do not violate the terms of service</a>. Therefore, this app is completely legal to use.</p>
        <p>To use this app, simply run it BEFORE launching realm, log in with your rotmg-builds.com credentials, and select your collection. Then press start, and launch realm. The app will automatically track your loot!</p>
        <p><b>Important:</b> This app requires you to have a rotmg-builds.com account and a created collection to store your tracked loot.</p>
        <p>If you do not have a rotmg-builds.com account, you can create one at <a href="https://rotmg-builds.com/pages/login.html" target="_blank" rel="noopener noreferrer">rotmg-builds.com</a>.</p>
        <p>Once you've created an account, create a new collection in browser to store your tracked loot. Once the collection is created, you can start tracking your loot!</p>
        <p>Version 0.1.0</p>
        <button className="btn" onClick={() => setShowAbout(false)}>Close</button>
      </section>
    </div>
  ) : null

  if (!authenticated) {
    return (
      <div className="app">
        <main>
          <section className="panel">
            <h1>rotmg-auto-tracker</h1>
            <h2>Log in</h2>
            <div style={{display:'grid', gridTemplateColumns:'160px 1fr', gap:8, alignItems:'center'}}>
              <label>Username</label>
              <input value={config.username} onChange={e => setConfig({...config, username: e.target.value})} disabled={testing} />
              <label>Password</label>
              <input type="password" value={config.password} onChange={e => setConfig({...config, password: e.target.value})} disabled={testing} />
              <div />
              <div>
                <button className="btn start" onClick={login} disabled={testing || !config.username || !config.password}>{testing ? 'Logging in...' : 'Log In'}</button>
                <button className="btn" onClick={() => setShowAbout(true)} style={{marginLeft:8}}>About</button>
                {saveStatus === 'login_error' && <span style={{color:'#f87171', marginLeft:8}}>Login failed</span>}
              </div>
            </div>
          </section>
        </main>
        {aboutModal}
      </div>
    )
  }

  // Website logging is mandatory; no toggle provided in the UI.

  return (
    <div className="app">
      <header className="header">
        <h1>rotmg-auto-tracker — Desktop</h1>
        <div style={{display:'flex', alignItems:'center', gap:12}}>
          <button className="btn" onClick={() => setShowAbout(true)}>About</button>
          <div style={{fontSize:12}}>
            Tracker: {helperStatus.state === 'stopped' && <span style={{color:'#f97316'}}>stopped</span>}
            {helperStatus.state === 'alive' && <span style={{color:'#60a5fa'}}>alive</span>}
            {helperStatus.state === 'logged-in' && <span style={{color:'#10b981'}}>logged in</span>}
            {helperStatus.state === 'login-failed' && <span style={{color:'#ef4444'}}>login failed</span>}
            {helperStatus.detail && <span style={{marginLeft:8, color:'#6b7280'}}>{helperStatus.detail}</span>}
          </div>
        
          <button className="btn" onClick={() => setShowSettings(s => !s)} style={{marginRight:8}}>{showSettings? 'Close Settings' : 'Settings'}</button>
          {running ? (
            <button className="btn stop" onClick={stop}>Stop</button>
          ) : (
            <button className="btn start" onClick={start}>Start</button>
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
            <label>Collection Name</label>
            <select value={config.collectionName} onChange={async e => {
              const collectionName = e.target.value
              setConfig(current => ({...current, collectionName}))
              setSaveStatus(null)
              const res = await window.configAPI.set({...config, collectionName})
              if (!res || !res.ok) {
                setConfig(current => ({...current, collectionName: ''}))
                setSaveStatus('error')
              }
            }} disabled={running}>
              <option value="">Select a collection</option>
              {collections.map(collection => <option key={collection.name} value={collection.name}>{collection.name}</option>)}
            </select>
            {saveStatus === 'need_collection' && <div style={{gridColumn:'2', color:'#f97316'}}>Select a collection before starting.</div>}
            <div />
            <div style={{display:'flex', gap:8, alignItems:'center'}}>
              {/* Website logging is mandatory; no toggle shown. */}
              {loggingReady && <span style={{color:'#8bdc87'}}>Logging Ready</span>}
              {saveStatus === 'error' && <span style={{color:'#f87171'}}>Error</span>}
              {saveStatus === 'login_ok' && <span style={{color:'#8bdc87'}}>Login OK</span>}
              {saveStatus === 'login_error' && <span style={{color:'#f87171'}}>Login Failed</span>}
            </div>
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
                            if (/^\d+$/.test(String(name).trim())) return null
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

      {aboutModal}
    </div>
  )
}
