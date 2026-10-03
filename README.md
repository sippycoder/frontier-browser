# Frontier — an agentic AI browser (v0.1)

A real desktop browser built on Chromium (via Electron), with the
agentic-browser engine driving your tabs. This is the product surface for
the M0–M5 engine: tabs + omnibox + an agent composer sidebar, instead of
a terminal.

## What it is

- **Real browser chrome**: tabs, back/forward/reload, omnibox — each tab is
  its own Chromium `BrowserView`.
- **Composer sidebar**: type a task ("summarize the top story on this page"),
  the agent executes it *in your visible tab* over CDP, and you watch it work.
- **Workflows panel**: list/install/run the scheduled-workflow templates.
- **Usage panel**: metered spend + distillation report.
- **Python sidecar**: the app spawns `agentic-browser`'s worker service
  (`serve`) on port 8333; the main process forwards composer tasks to its
  `/run-tab-task` endpoint, which attaches to the active tab via CDP
  (`BrowserSession.attach_cdp`). The sidecar never closes your tabs — detach
  only.

## Run it

```bash
cd ~/workspace/browser-app
npm install          # once
npm start            # needs a display; headless: xvfb-run -a npm start
```

Environment: the sidecar inherits your shell env, so `.env` model config
applies. In sandboxed networks set `AGENTIC_RELAY_PROXY=1` (also makes the
app's Chromium skip TLS validation — sandbox only, never elsewhere).

## Architecture

```
┌─ Electron (Chromium 152) ─────────────────────┐
│  renderer (DOM): tab strip, omnibox, sidebar  │
│  BrowserView per tab (native, below the DOM)  │
│  main: IPC, layout, --remote-debugging-port   │
└───────────────┬───────────────────────────────┘
                │ CDP :9333 / HTTP :8333
┌───────────────▼───────────────────────────────┐
│  Python sidecar: serve /run-tab-task          │
│  BrowserSession.attach_cdp → BrowserAgent     │
└───────────────────────────────────────────────┘
```

## Honest limits (v0.1)

- No packaging yet (`electron-packager` per-OS builds are the next step).
- Composer runs one task at a time; no streaming progress (status → answer).
- Tab tasks are auto-approved — supervision is watching the tab itself.
- Not a Chromium *source* fork: 2-core/7GB-RAM VM can't build Chromium
  from source (would take days and OOM at link). This is the real product
  surface on real Chromium, which is what matters for use.
