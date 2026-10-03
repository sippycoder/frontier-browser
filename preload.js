'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('frontier', {
  onTabs: cb => ipcRenderer.on('tabs', (e, data) => cb(data)),
  onSidecar: cb => ipcRenderer.on('sidecar-status', (e, ok, msg) => cb(ok, msg)),
  newTab: url => ipcRenderer.invoke('tabs-new', url),
  closeTab: id => ipcRenderer.invoke('tabs-close', id),
  switchTab: id => ipcRenderer.invoke('tabs-switch', id),
  go: url => ipcRenderer.invoke('nav-go', url),
  back: () => ipcRenderer.invoke('nav-back'),
  forward: () => ipcRenderer.invoke('nav-forward'),
  reload: () => ipcRenderer.invoke('nav-reload'),
  toggleSidebar: () => ipcRenderer.invoke('sidebar-toggle'),
  runTask: task => ipcRenderer.invoke('agent-run', task),
  workflowsList: () => ipcRenderer.invoke('workflows-list'),
  workflowsRun: name => ipcRenderer.invoke('workflows-run', name),
  templatesList: () => ipcRenderer.invoke('templates-list'),
  templatesInstall: name => ipcRenderer.invoke('templates-install', name),
  usageReport: () => ipcRenderer.invoke('usage-report'),
  distillReport: () => ipcRenderer.invoke('distill-report'),
});
