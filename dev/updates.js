// Unwip - updates. Checks quietly a little after start-up; installs in the background if allowed,
// then offers a restart. After a restart it shows what's new, once.
window.UnwipUpdates = (function () {
  'use strict';
  const U = window.__unwip;
  const { api, esc } = U;

  // release notes as a list: "- " lines are points, indented "  - " lines sit under the point above
  function notesList(t) {
    const lines = String(t || '').replace(/sha256:\s*[a-f0-9]{64}/ig, '').split('\n');
    let html = '', open = 0;
    const inline = x => esc(x).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    const close = to => { while (open > to) { html += '</li></ul>'; open--; } };
    for (const raw of lines) {
      if (!raw.trim()) continue;
      const m = raw.match(/^(\s*)[-*]\s+(.*)$/), h = raw.match(/^#+\s*(.*)$/);
      if (h) { close(0); html += `<h4>${inline(h[1])}</h4>`; continue; }
      if (!m) { close(0); html += `<p>${inline(raw.trim())}</p>`; continue; }
      const depth = m[1].length >= 2 ? 2 : 1;
      if (depth > open) { while (open < depth) { html += '<ul>'; open++; } html += `<li>${inline(m[2])}`; }
      else { close(depth); html += `</li><li>${inline(m[2])}`; }
    }
    close(0);
    return html;
  }
  // the first few points of a version's notes, for the notice
  function highlights(t, n = 3) {
    const top = String(t || '').split('\n').filter(l => /^[-*]\s+/.test(l)).map(l => l.replace(/^[-*]\s+/, '').replace(/\*\*/g, ''));
    return { shown: top.slice(0, n).map(x => x.length > 140 ? x.slice(0, 138).replace(/\s+\S*$/, '') + '…' : x), more: Math.max(0, top.length - n) };
  }
  // A new version: a proper card instead of a small grey toast that was easy to miss. Title, the first few things it
  // brings, the whole notes a click away, and the button.
  let noticeEl = null;
  function notice({ title, version, notes, action, run, later = 'Later' }) {
    if (noticeEl) noticeEl.remove();
    const h = highlights(notes);
    const el = noticeEl = document.createElement('div'); el.className = 'up-card'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', title);
    el.innerHTML = `<div class="up-c-head"><span class="up-c-dot"></span><div><div class="up-c-title">${esc(title)}</div>${version ? `<div class="up-c-ver">Unwip ${esc(version)}</div>` : ''}</div><button type="button" class="up-c-x" aria-label="Close">×</button></div>
      ${h.shown.length ? `<ul class="up-c-list">${h.shown.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="up-c-p">Fixes and improvements.</p>'}
      ${notes && (h.more || h.shown.length) ? `<button type="button" class="up-c-all">${h.more ? `See all the changes (${h.more} more)` : 'See all the changes'}</button>` : ''}
      <div class="up-c-foot"><button type="button" class="btn ghost up-c-later">${esc(later)}</button><button type="button" class="btn primary up-c-go">${esc(action)}</button></div>`;
    document.body.appendChild(el);
    const shut = () => { el.remove(); if (noticeEl === el) noticeEl = null; };
    el.querySelector('.up-c-x').onclick = shut; el.querySelector('.up-c-later').onclick = shut;
    el.querySelector('.up-c-go').onclick = () => { shut(); run && run(); };
    const all = el.querySelector('.up-c-all');
    if (all) all.onclick = () => U.modal({ title: `What’s new in Unwip ${esc(version || '')}`, body: `<div class="up-notes up-rich">${notesList(notes)}</div>`, wide: true, buttons: [{ label: 'Close', value: true, kind: 'primary' }] });
    return el;
  }

  async function settings() { try { return await api.getSettings(); } catch { return {}; } }
  let lastNotes = '';
  function readyToast(st) {
    notice({ title: 'An update is installed', version: st.version, notes: st.notes || lastNotes, action: 'Restart now', run: () => U.safeRestart(() => api.relaunch()), later: 'Restart later' });
  }
  // Automatic checks: a little after start, every hour, and whenever Unwip comes back to the front after half an hour.
  // (It used to check at start and then only every six hours, so an Unwip left open all day rarely saw a new version,
  // and a failed check said nothing.) Once an update is in, a "Restart to update" button stays until you restart.
  let lastCheck = 0, lastError = '', busy = false, offered = '';
  async function auto() {
    if (busy) return; busy = true;
    try {
      let st; try { st = await api.updateState(); } catch { return; }
      if (!st.auto) return;
      if (st.status === 'ready') { readyPill(st.version); return; }
      if (st.status === 'downloading') return;
      const cfg = await settings();
      const c = await api.updateCheck(); lastCheck = Date.now();
      if (c.status === 'error') { lastError = c.error || 'unknown problem'; return; }
      lastError = '';
      if (c.status !== 'available') return;
      lastNotes = c.notes || '';
      if (cfg.autoUpdate === false) { if (offered !== c.version) { offered = c.version; notice({ title: 'A new version of Unwip is available', version: c.version, notes: c.notes, action: 'Install', run: () => checkNow(true) }); } return; }
      const r = await api.updateInstall();
      if (r.status === 'ready') { readyToast(r); readyPill(r.version); }
      else if (r.status === 'error') lastError = r.error || 'the download didn’t finish';
    } finally { busy = false; }
  }
  // a small button that stays (main screen and the status bar) until Unwip restarts into the new version
  function readyPill(version) {
    const make = () => { const b = document.createElement('button'); b.type = 'button'; b.className = 'up-pill'; b.textContent = 'Restart to update'; b.title = `Unwip ${version} is installed. Restart to start using it (your writing is saved first).`;
      b.onclick = () => U.safeRestart(() => api.relaunch()); return b; };
    const head = document.querySelector('.lib-head-right'); if (head && !head.querySelector('.up-pill')) head.prepend(make());
    const sb = document.querySelector('#statusbar .st-spacer'); if (sb && !document.querySelector('#statusbar .up-pill')) sb.after(make());
  }
  const status = () => ({ lastCheck, lastError });
  async function checkNow(install) {
    U.toast('Checking for updates…', '', 1500);
    const c = await api.updateCheck(); lastCheck = Date.now(); lastError = c.status === 'error' ? (c.error || '') : '';
    if (c.status === 'none') { U.toast(`You’re up to date (Unwip ${esc(c.current)}).`); return; }
    if (c.status === 'error') { U.toast(`Couldn’t check for updates: ${esc(c.error)}`, 'warn', 6000); return; }
    lastNotes = c.notes || '';
    if (!install) {
      const ok = await U.modal({ title: `Unwip ${esc(c.version)} is available`, body: `<div class="up-notes up-rich">${notesList(c.notes) || 'Fixes and improvements.'}</div><p>Your projects aren’t touched. Only the app’s own files are replaced, and the old version is kept as a backup.</p>`,
        buttons: [{ label: 'Later', value: false, kind: 'ghost' }, { label: 'Install', value: true, kind: 'primary' }] });
      if (!ok) return;
    }
    U.toast('Downloading the update…', '', 2500);
    const r = await api.updateInstall();
    if (r.status === 'ready') { readyToast(r); readyPill(r.version); }
    else U.toast(`The update didn’t install: ${esc(r.error || 'unknown problem')}`, 'warn', 8000);
  }
  // what's new, once, after an update
  (async () => {
    const cfg = await settings();
    if (cfg.justUpdated && cfg.justUpdated.version) {
      const j = cfg.justUpdated;
      await api.setSettings({ justUpdated: null });
      setTimeout(() => U.modal({ title: `What’s new in Unwip ${esc(j.version)}`, body: `<div class="up-notes up-rich">${notesList(j.notes) || 'Fixes and improvements.'}</div>`, wide: true, buttons: [{ label: 'Nice', value: true, kind: 'primary' }] }), 1200);
    }
  })();
  setTimeout(auto, 8000);
  setInterval(auto, 60 * 60 * 1000);
  const back = () => { if (!document.hidden && Date.now() - lastCheck > 30 * 60 * 1000) auto(); };
  document.addEventListener('visibilitychange', back); window.addEventListener('focus', back);
  // Settings › What's new: the latest three versions, this one open and the two before it folded
  function newsHTML(current) {
    const list = Array.isArray(window.UNWIP_NOTES) ? window.UNWIP_NOTES : [];
    if (!list.length) return '<div class="hint">The notes for each version show here.</div>';
    const cur = current || window.UNWIP_VERSION || '';
    return `<div class="up-news">${list.slice(0, 3).map((x, i) => `<details class="up-n" ${i ? '' : 'open'}><summary><b>Unwip ${esc(x.v)}</b>${x.v === cur ? ' <span class="up-n-now">this version</span>' : ''}</summary><div class="up-notes up-rich">${notesList(x.notes)}</div></details>`).join('')}</div>`;
  }
  return { checkNow, notice, notesList, newsHTML, status, auto };
})();
