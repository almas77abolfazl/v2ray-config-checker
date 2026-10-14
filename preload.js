'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  listSources: () => ipcRenderer.invoke('sources:list'),
  addSource: (p) => ipcRenderer.invoke('sources:add', p),
  removeSource: (url) => ipcRenderer.invoke('sources:remove', { url }),
  toggleSource: (p) => ipcRenderer.invoke('sources:toggle', p),
  resetSources: () => ipcRenderer.invoke('sources:reset'),
  collect: (urls) => ipcRenderer.invoke('collect', { urls }),
  importText: (text) => ipcRenderer.invoke('configs:import', { text }),
  parseConfigs: (items) => ipcRenderer.invoke('configs:parse', { items }),
  customList: () => ipcRenderer.invoke('custom:list'),
  customRemove: (index) => ipcRenderer.invoke('custom:remove', { index }),
  runTests: (configs, options) => ipcRenderer.invoke('tests:run', { configs, options }),
  stopTests: () => ipcRenderer.invoke('tests:stop'),

  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (s) => ipcRenderer.invoke('settings:set', s)
  },

  xray: {
    status: () => ipcRenderer.invoke('xray:status'),
    ensure: () => ipcRenderer.invoke('xray:ensure'),
    selectPath: () => ipcRenderer.invoke('xray:select')
  },

  session: {
    connect: (raw) => ipcRenderer.invoke('session:connect', { raw }),
    disconnect: () => ipcRenderer.invoke('session:disconnect'),
    status: () => ipcRenderer.invoke('session:status')
  },

  blacklist: {
    list: () => ipcRenderer.invoke('blacklist:list'),
    clear: () => ipcRenderer.invoke('blacklist:clear')
  },

  cache: {
    get: () => ipcRenderer.invoke('cache:get'),
    save: (payload) => ipcRenderer.invoke('cache:save', payload)
  },

  saveFile: (payload) => ipcRenderer.invoke('file:save', payload),

  onEvent: (cb) => {
    for (const channel of ['collect:progress', 'test:update', 'test:blacklist', 'xray:progress', 'session:changed', 'session:recovered']) {
      ipcRenderer.on(channel, (_event, payload) => cb(channel, payload));
    }
  },

  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close')
  }
});
