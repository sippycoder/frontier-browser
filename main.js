/* Frontier browser — Electron main process.
 *
 * Real Chromium tabs (BrowserView per tab), a DOM sidebar with the agent
 * composer / workflows / usage panels, and a Python sidecar (the
 * agentic-browser engine) that drives the active tab over CDP.
 */
'use strict';

const { app, BrowserWindow, BrowserView, ipcMain } = require('electron');
const { spawn, execFile } = require('child_process');
const path = require('path');
const os = require('os');
const http = require('http');

const CDP_PORT = 9333;
const CDP_URL = `http://127.0.0.1:${CDP_PORT}`;
const SIDECAR_PORT = 8333;
const SIDECAR_URL = `http://127.0.0.1:${SIDECAR_PORT}`;
const TOP_H = 96;      // tab strip + toolbar, rendered in DOM
const SIDEBAR_W = 380;

const PROJECT_DIR = path.join(os.homedir(), 'workspace', 'agentic-browser');
const VENV_PY = path.join(PROJECT_DIR, '.venv', 'bin', 'python');

app.commandLine.appendSwitch('remote-debugging-port', String(CDP_PORT));
app.commandLine.appendSwitch('no-sandbox');
if (process.env.AGENTIC_RELAY_PROXY === '1') {
  // Sandbox-only: the sandbox egress proxy TLS-intercepts, so Chromium must
  // skip cert validation here — exactly like the Python engine does in this
  // mode. Never enable outside a trusted sandbox.
  app.commandLine.appendSwitch('ignore-certificate-errors');
}
// NOTE: no --proxy-server switch — Chromium picks up https_proxy from the
// environment (including auth) on its own; an explicit switch with embedded
// credentials breaks parsing (ERR_NO_SUPPORTED_PROXIES).

let win = null;
let sidecar = null;
let sidecarReady = false;
const tabs = new Map();   // tabId -> {view, url, title}
let activeTabId = null;
let nextTabId = 1;
let sidebarOpen = true;

/* ---------------- sidecar ---------------- */

function startSidecar() {
  sidecar = spawn(VENV_PY, ['-m', 'agentic_browser.cli', 'serve', '--port', String(SIDECAR_PORT)], {
    cwd: PROJECT_DIR,
    env: { ...process.env, AGENTIC_RELAY_PROXY: '1' },
  });
  sidecar.stdout.on('data', d => console.log('[sidecar]', String(d).trim()));
  sidecar.stderr.on('data', d => console.log('[sidecar:err]', String(d).trim()));
  const poll = () => {
    http.get(`${SIDECAR_URL}/health`, res => {
      if (res.statusCode === 200) {
        sidecarReady = true;
        win && win.webContents.send('sidecar-status', true);
      } else setTimeout(poll, 1000);
    }).on('error', () => setTimeout(poll, 1000));
  };
  setTimeout(poll, 1500);
}

function pyCli(args) {
  return new Promise(resolve => {
    execFile(VENV_PY, ['-m', 'agentic_browser.cli', ...args],
      { cwd: PROJECT_DIR, env: { ...process.env, AGENTIC_RELAY_PROXY: '1' }, timeout: 30000 },
      (err, stdout) => resolve(err ? `(error: ${err.message})` : stdout));
  });
}

function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': data.length } }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/* ---------------- tabs ---------------- */

function layout() {
  if (!win) return;
  const [W, H] = win.getContentSize();
  const w = W - (sidebarOpen ? SIDEBAR_W : 0);
  const tab = tabs.get(activeTabId);
  if (tab) tab.view.setBounds({ x: 0, y: TOP_H, width: Math.max(200, w), height: Math.max(200, H - TOP_H) });
}

function addView(view) {
  if (win.contentView && win.contentView.add) win.contentView.add(view);
  else win.addBrowserView(view);
}
function removeView(view) {
  if (win.contentView && win.contentView.remove) win.contentView.remove(view);
  else win.removeBrowserView(view);
}

function createTab(url) {
  const id = nextTabId++;
  const view = new BrowserView({ webPreferences: { nodeIntegration: false, contextIsolation: true } });
  const tab = { id, view, url: url || 'about:blank', title: 'New tab' };
  tabs.set(id, tab);
  view.webContents.on('page-title-updated', (e, title) => { tab.title = title; pushTabs(); });
  view.webContents.on('did-navigate', (e, navUrl) => { tab.url = navUrl; pushTabs(); });
  view.webContents.on('did-navigate-in-page', (e, navUrl) => { tab.url = navUrl; pushTabs(); });
  if (url) view.webContents.loadURL(url);
  setActiveTab(id);
  return id;
}

function setActiveTab(id) {
  const old = tabs.get(activeTabId);
  if (old) removeView(old.view);
  activeTabId = id;
  const tab = tabs.get(id);
  if (tab) { addView(tab.view); layout(); }
  pushTabs();
}

function closeTab(id) {
  const tab = tabs.get(id);
  if (!tab) return;
  if (id === activeTabId) {
    const rest = [...tabs.keys()].filter(k => k !== id);
    if (rest.length === 0) { createTab('about:blank'); }
    else setActiveTab(rest[rest.length - 1]);
  }
  removeView(tab.view);
  tab.view.webContents.destroy();
  tabs.delete(id);
  pushTabs();
}

function pushTabs() {
  if (!win) return;
  win.webContents.send('tabs', {
    tabs: [...tabs.values()].map(t => ({ id: t.id, title: t.title, url: t.url })),
    activeTabId,
    sidebarOpen,
    sidecarReady,
  });
}

/* ---------------- window ---------------- */

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
    title: 'Frontier',
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('resize', layout);
  win.on('closed', () => { win = null; });
  createTab('https://example.com');
  pushTabs();
}

/* ---------------- IPC ---------------- */

ipcMain.handle('tabs-new', (e, url) => createTab(url));
ipcMain.handle('tabs-close', (e, id) => closeTab(id));
ipcMain.handle('tabs-switch', (e, id) => setActiveTab(id));
ipcMain.handle('nav-go', (e, raw) => {
  const tab = tabs.get(activeTabId);
  if (!tab) return;
  let url = raw.trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) url = 'https://' + url;
  tab.view.webContents.loadURL(url);
});
ipcMain.handle('nav-back', () => tabs.get(activeTabId)?.view.webContents.goBack());
ipcMain.handle('nav-forward', () => tabs.get(activeTabId)?.view.webContents.goForward());
ipcMain.handle('nav-reload', () => tabs.get(activeTabId)?.view.webContents.reload());
ipcMain.handle('sidebar-toggle', () => { sidebarOpen = !sidebarOpen; layout(); pushTabs(); });

ipcMain.handle('agent-run', async (e, task) => {
  if (!sidecarReady) return { answer: '(agent sidecar is still starting — try again in a few seconds)', finished: false, steps: 0 };
  const tab = tabs.get(activeTabId);
  try {
    return await postJson(`${SIDECAR_URL}/run-tab-task`, {
      task, cdp_url: CDP_URL, url_match: tab ? tab.url : undefined,
      max_steps: 40, auto_approve: true,
    });
  } catch (err) {
    return { answer: `(agent error: ${err.message})`, finished: false, steps: 0 };
  }
});

ipcMain.handle('workflows-list', () => pyCli(['workflows', 'list']));
ipcMain.handle('workflows-run', (e, name) => pyCli(['workflows', 'run', name]));
ipcMain.handle('templates-list', () => pyCli(['templates', 'list']));
ipcMain.handle('templates-install', (e, name) => pyCli(['templates', 'install', name]));
ipcMain.handle('usage-report', () => pyCli(['usage', 'report', '--days', '7']));
ipcMain.handle('distill-report', () => pyCli(['distill', 'report']));

app.whenReady().then(() => { createWindow(); startSidecar(); });
app.on('window-all-closed', () => { if (sidecar) sidecar.kill(); app.quit(); });
