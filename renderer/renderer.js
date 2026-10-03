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

/* composer */
$('runtask').onclick = async () => {
  const task = $('task').value.trim();
  if (!task) return;
  $('runtask').disabled = true;
  $('taskstatus').textContent = 'Agent working in the current tab…';
  $('answer').textContent = '';
  try {
    const r = await F.runTask(task);
    $('taskstatus').textContent = r.finished ? `Done (${r.steps} steps)` : 'Finished with issues';
    $('answer').textContent = r.answer || '(no answer)';
  } catch (e) {
    $('taskstatus').textContent = 'Error';
    $('answer').textContent = String(e);
  }
  $('runtask').disabled = false;
};
F.onSidecar(ok => $('agentdot').classList.toggle('ok', ok));

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

refreshWorkflows();
refreshUsage();
