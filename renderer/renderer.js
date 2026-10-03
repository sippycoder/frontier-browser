'use strict';
const $ = id => document.getElementById(id);
const F = window.frontier;

/* sidebar panes */
document.querySelectorAll('#sidebartabs button').forEach(b => {
  b.onclick = () => {
    document.querySelectorAll('#sidebartabs button').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.pane').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    $('pane-' + b.dataset.pane).classList.add('active');
  };
});

/* tabs */
F.onTabs(({ tabs, activeTabId, sidebarOpen, sidecarReady }) => {
  const el = $('tabs');
  el.innerHTML = '';
  tabs.forEach(t => {
    const d = document.createElement('div');
    d.className = 'tab' + (t.id === activeTabId ? ' active' : '');
    const label = document.createElement('span');
    label.className = 't';
    label.textContent = t.title || t.url;
    label.title = t.url;
    label.onclick = () => F.switchTab(t.id);
    const x = document.createElement('button');
    x.className = 'x';
    x.textContent = '×';
    x.onclick = ev => { ev.stopPropagation(); F.closeTab(t.id); };
    d.append(label, x);
    d.ondblclick = () => F.switchTab(t.id);
    el.appendChild(d);
  });
  $('sidebar').classList.toggle('hidden', !sidebarOpen);
  $('agentdot').classList.toggle('ok', !!sidecarReady);
  const active = tabs.find(t => t.id === activeTabId);
  if (active && document.activeElement !== $('omnibox')) $('omnibox').value = active.url;
});
$('newtab').onclick = () => F.newTab('about:blank');
$('sidebartoggle').onclick = () => F.toggleSidebar();

/* navigation */
function go() { const u = $('omnibox').value.trim(); if (u) F.go(u); }
$('omnibox').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
$('back').onclick = () => F.back();
$('fwd').onclick = () => F.forward();
$('reload').onclick = () => F.reload();

/* chat — multi-turn conversation with the browser agent */
let chatSid = null, sidecarUrl = null, chatRunning = false;

function addMsg(kind, text) {
  const el = document.createElement('div');
  el.className = 'msg ' + kind;
  el.textContent = text;
  $('chatlog').appendChild(el);
  $('chatlog').scrollTop = $('chatlog').scrollHeight;
  return el;
}

async function ensureChat() {
  if (chatSid) return true;
  const r = await F.chatStart();
  if (r.error) { addMsg('agent', 'Could not start chat: ' + r.error); return false; }
  chatSid = r.session_id;
  sidecarUrl = r.sidecar_url;
  return true;
}

function renderQuestion(evt) {
  const card = document.createElement('div');
  card.className = 'msg question';
  const p = document.createElement('div');
  p.textContent = evt.prompt;
  const row = document.createElement('div');
  row.className = 'qrow';
  const input = document.createElement('input');
  input.placeholder = evt.options ? evt.options.join(' / ') : 'Your answer…';
  const btn = document.createElement('button');
  btn.textContent = 'Answer';
  const send = async () => {
    const text = input.value.trim();
    if (!text) return;
    btn.disabled = true;
    await F.chatAnswer(chatSid, text);
    card.classList.add('answered');
    input.disabled = true; btn.disabled = true;
    addMsg('user', '↩ ' + text);
  };
  btn.onclick = send;
  input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
  row.appendChild(input); row.appendChild(btn);
  card.appendChild(p); card.appendChild(row);
  $('chatlog').appendChild(card);
  $('chatlog').scrollTop = $('chatlog').scrollHeight;
  input.focus();
}

function handleChatEvent(evt, statusEl) {
  if (evt.type === 'status') statusEl.textContent = evt.text;
  else if (evt.type === 'thought') statusEl.textContent = '💭 ' + (evt.text || '');
  else if (evt.type === 'action') statusEl.textContent = `⚙️ ${evt.tool}${evt.risk ? ' (approval asked)' : ''}…`;
  else if (evt.type === 'question') renderQuestion(evt);
  else if (evt.type === 'done') {
    statusEl.remove();
    addMsg('agent', evt.answer || '(no answer)');
  }
}

async function sendChat() {
  const text = $('chatinput').value.trim();
  if (!text || chatRunning) return;
  if (!await ensureChat()) return;
  chatRunning = true;
  $('chatsend').disabled = true;
  addMsg('user', text);
  $('chatinput').value = '';
  const statusEl = addMsg('status', 'working…');
  try {
    const resp = await fetch(`${sidecarUrl}/chat-sessions/${chatSid}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
    });
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const raw = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        for (const line of raw.split('\n')) {
          if (line.startsWith('data: ')) handleChatEvent(JSON.parse(line.slice(6)), statusEl);
        }
      }
    }
  } catch (e) {
    statusEl.textContent = 'connection error: ' + e;
  }
  chatRunning = false;
  $('chatsend').disabled = false;
}
$('chatsend').onclick = sendChat;
$('chatinput').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
addMsg('agent', 'Hi — I can see and drive the current tab. Ask me to do something.');

F.onSidecar((ok, msg) => {
  $('agentdot').classList.toggle('ok', ok);
  if (!ok && msg) addMsg('agent', msg);
});

/* workflows */
async function refreshWorkflows() {
  $('wlist').textContent = await F.workflowsList();
  $('tlist').textContent = await F.templatesList();
}
$('wrefresh').onclick = refreshWorkflows;
$('wrunbtn').onclick = async () => {
  const name = $('wrun').value.trim();
  if (!name) return;
  $('wstatus').textContent = `Running ${name}…`;
  $('wstatus').textContent = await F.workflowsRun(name);
};
$('tinstallbtn').onclick = async () => {
  const name = $('tinstall').value.trim();
  if (!name) return;
  $('wstatus').textContent = await F.templatesInstall(name);
  refreshWorkflows();
};

/* usage */
async function refreshUsage() {
  $('uout').textContent = await F.usageReport();
  $('dout').textContent = await F.distillReport();
}
$('urefresh').onclick = refreshUsage;

/* mcp */
async function refreshMcp() {
  const cfg = await F.getMcpConfig();
  const snippet = {
    mcpServers: {
      "frontier-browser": {
        command: cfg.python,
        args: ["-m", "agentic_browser.cli", "mcp", "--cdp-url", cfg.cdpUrl],
      },
    },
  };
  $('mcpjson').textContent = JSON.stringify(snippet, null, 2);
  $('mcpstatus').textContent = `CDP debugging on 127.0.0.1:${cfg.cdpPort} · engine ${cfg.engineDir}`;
}
$('mcpcopy').onclick = async () => {
  await navigator.clipboard.writeText($('mcpjson').textContent);
  $('mcpstatus').textContent = 'Copied — paste it into your main agent\'s MCP config.';
};

refreshWorkflows();
refreshUsage();
refreshMcp();
