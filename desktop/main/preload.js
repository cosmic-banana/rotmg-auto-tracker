const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('trackerAPI', {
  start: () => ipcRenderer.invoke('tracker:start'),
  stop: () => ipcRenderer.invoke('tracker:stop'),
  status: () => ipcRenderer.invoke('tracker:status'),
  onPacket: (cb) => {
    const handler = (event, pkt) => cb(pkt)
    ipcRenderer.on('tracker:packet', handler)
    return () => ipcRenderer.removeListener('tracker:packet', handler)
  }
})

contextBridge.exposeInMainWorld('configAPI', {
  get: () => ipcRenderer.invoke('config:get'),
  set: (cfg) => ipcRenderer.invoke('config:set', cfg),
  testLogin: (cfg) => ipcRenderer.invoke('config:testLogin', cfg)
})

contextBridge.exposeInMainWorld('electronAPI', {
  setLogging: (v) => ipcRenderer.invoke('logging:set', v),
  loggingStatus: () => ipcRenderer.invoke('logging:status')
})
// helper events forwarded to renderer for diagnostics
contextBridge.exposeInMainWorld('helperAPI', {
  onResp: (cb) => {
    const handler = (event, msg) => cb(msg)
    ipcRenderer.on('helper:resp', handler)
    return () => ipcRenderer.removeListener('helper:resp', handler)
  },
  onLoginFailed: (cb) => {
    const handler = (event, msg) => cb(msg)
    ipcRenderer.on('helper:loginFailed', handler)
    return () => ipcRenderer.removeListener('helper:loginFailed', handler)
  },
  onExit: (cb) => {
    const handler = (event, msg) => cb(msg)
    ipcRenderer.on('helper:exit', handler)
    return () => ipcRenderer.removeListener('helper:exit', handler)
  }
  ,
  onLog: (cb) => {
    const handler = (event, msg) => cb(msg)
    ipcRenderer.on('helper:log', handler)
    return () => ipcRenderer.removeListener('helper:log', handler)
  }
})
