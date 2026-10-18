// Unwip - sync status on the PC. Here the Dropbox (or OneDrive…) app does the syncing; Unwip shows where the book
// is, whether that app is running, when another device last changed the open book, and a button to look for
// changes straight away. (The iPhone/iPad version syncs by itself: dropbox.js.)
window.UnwipPCSync = (function () {
  'use strict';
  const U = window.__unwip, api = U && U.api;
  if (!api || api.web || !api.syncStatus) return null;
  const { S, esc } = U;
  const CLOUD = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 9.2 4.4 4.4 0 0 0 7 18z"/></svg>';
  const APP = { dropbox: 'Dropbox', onedrive: 'OneDrive', gdrive: 'Google Drive', icloud: 'iCloud' };
  let status = null, seenAt = 0, busy = false;
  const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(t).toLocaleDateString(); };
  function state() {
    if (!status) return { cls: 'off', text: '' };
    if (busy) return { cls: 'busy', text: 'Checking…' };
    if (status.provider === 'none') return { cls: 'off', text: (status.label === 'This PC' || status.label === 'This Mac') ? status.label + ' only' : status.label };
    const app = APP[status.provider];
    if (status.running === false) return { cls: 'warn', text: `${app} app isn’t running`, long: `The ${app} app isn’t running on this PC, so your changes aren’t reaching your other devices (and theirs aren’t arriving). Start ${app} and it catches up by itself.` };
    if (S.slug && status.lastExternal > seenAt) return { cls: 'news', text: `Updated from another device ${ago(status.lastExternal)}`, long: `Another device changed this book ${ago(status.lastExternal)}, and the changes are in. Changed chapters keep your version in Snapshots.` };
    return { cls: 'ok', text: `${status.label} · in step`, long: `This ${S.slug ? 'book is' : 'library is'} in your ${status.label} folder. The ${app} app keeps it in step with your other devices${status.running ? ' (it’s running)' : ''}. Click to look for changes from other devices right now.` };
  }
  function render() {
    const s = state();
    // the main screen
    const head = document.querySelector('.lib-head-right');
    if (head) {
      let pill = document.getElementById('pc-sync-pill');
      if (!pill) { pill = document.createElement('button'); pill.id = 'pc-sync-pill'; head.insertBefore(pill, head.firstChild); pill.onclick = click; }
      pill.className = 'dbx-pill pcs-pill ' + s.cls; pill.hidden = !s.text;
      pill.innerHTML = CLOUD + (s.cls === 'warn' || s.cls === 'news' ? '<b class="dbx-warn">⚠</b>' : '') + `<span>${esc(s.text)}</span>` + (status && status.provider !== 'none' ? `<span class="pcs-act">${busy ? 'Checking…' : doneNote || '↻ Sync now'}</span>` : '');
      pill.title = s.long || s.text;
    }
    // beside the book's name while writing
    const tb = document.querySelector('#workspace .tb-left');
    if (tb) {
      let mini = document.getElementById('pc-sync-mini');
      if (!mini) { mini = document.createElement('button'); mini.id = 'pc-sync-mini'; tb.appendChild(mini); mini.onclick = click; }
      mini.className = 'pcs-mini ' + s.cls; mini.hidden = !s.text;
      mini.innerHTML = CLOUD + (s.cls === 'warn' || s.cls === 'news' ? '<b class="dbx-warn">⚠</b>' : '') + `<span class="pcs-lab">${status && status.provider !== 'none' ? (busy ? 'Checking…' : doneNote || 'Sync') : 'This PC'}</span>`;
      mini.title = (s.long || s.text) + (S.slug && status && status.provider !== 'none' ? '' : '');
    }
  }
  async function refresh() { try { status = await api.syncStatus(S.slug || null); } catch { status = null; } render(); }
  // click: look for changes now, then say how things stand
  let doneNote = '', doneT = null;
  async function click() {
    if (busy) return;
    busy = true; render();
    let found = 0, latest = null;
    const t0 = Date.now();
    try {
      if (S.slug) found = await api.syncCheck(S.slug);
      else {
        // the main screen: read the books again, and find the last change another device made
        await U.showLibrary();
        const list = await api.listProjects();
        latest = list.filter(b => b.dev && !U.isMine(b.dev, b.devId)).sort((a, b) => b.modified - a.modified)[0] || null;
      }
      await refresh();
    } catch {}
    if (Date.now() - t0 < 700) await new Promise(r => setTimeout(r, 700 - (Date.now() - t0)));   // long enough to see it happened
    busy = false; seenAt = Date.now();
    doneNote = found ? `✓ Brought in ${found} change${found === 1 ? '' : 's'}` : '✓ Up to date'; clearTimeout(doneT); doneT = setTimeout(() => { doneNote = ''; render(); }, 6000);
    render();
    const s = state();
    if (!S.slug && status && status.provider !== 'none') { U.toast(`Checked your books: ${latest ? `the last change from another device was “${esc(latest.title)}” on ${esc(latest.dev)}, ${ago(latest.modified)}.` : 'nothing from your other devices yet.'} The ${APP[status.provider]} app syncs them by itself, so there’s nothing else to press.`, '', 8000); return; }
    if (S.slug && found) U.toast(`Brought in ${found} change${found === 1 ? '' : 's'} from another device.`);
    else if (s.cls === 'warn') U.toast(esc(s.long), 'warn', 9000);
    else if (status && status.provider === 'none') U.toast(`${S.slug ? 'This book is' : 'Your books are'} kept on this PC only, so there’s nothing to sync. To share ${S.slug ? 'it' : 'them'} with your phone or other PCs, use Move to… on a book’s ⋯ menu.`, '', 8000);
    else U.toast(`Up to date: nothing new from your other devices. The ${APP[status.provider]} app syncs this book by itself.`, '', 6000);
  }
  U.on('project', () => { seenAt = Date.now(); refresh(); });
  U.on('library', () => refresh());
  U.on('leave', () => setTimeout(refresh, 300));
  api.onExternalChange(() => setTimeout(refresh, 1200));
  setInterval(() => { if (!document.hidden) refresh(); }, 60000);
  window.addEventListener('focus', refresh);
  setTimeout(refresh, 1500);
  // opening a book in Dropbox/OneDrive when the PC can't be in step: say so (once per book until things are back)
  const warned = new Set();
  window.addEventListener('online', () => warned.clear());
  window.UnwipOpenGate = async slug => {
    let st = null; try { st = await api.syncStatus(slug); } catch { return true; }
    if (!st || st.provider === 'none') return true;
    const app = APP[st.provider] || st.label, offline = navigator.onLine === false;
    if (!offline && st.running !== false) { warned.delete(slug); return true; }
    if (warned.has(slug)) return true;
    warned.add(slug);
    let title = slug; try { title = ((await api.listProjects()).find(p => p.slug === slug) || {}).title || slug; } catch {}
    const why = offline ? 'This PC isn’t connected to the internet' : `The ${app} app isn’t running on this PC`;
    return !!(await U.modal({ title: offline ? 'You’re offline' : `${app} isn’t running`, body: `<p>${why}, so if “${esc(title)}” was changed on another device, those changes may not be here yet.</p><p>You can still write. If the other device changed it too, ${app} keeps both versions and Unwip helps you choose${offline ? ' once you’re back online' : ` when ${app} is running again`}.</p>`,
      buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Open anyway', value: true, kind: 'primary' }] }));
  };
  return { refresh, click };
})();
