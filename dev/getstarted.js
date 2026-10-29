// Unwip - the "Getting started" card on the main screen: five small things that make Unwip feel like home.
// Each ticks itself when it's been done (on this device). The card can be hidden any time with its ×, and it
// steps aside by itself once everything is ticked. Hidden for good means hidden: it never comes back on its own.
window.UnwipStart = (function () {
  'use strict';
  const U = window.__unwip;
  const { $, esc, S, api } = U;
  const phone = () => document.documentElement.classList.contains('m-phone');
  let saving = Promise.resolve();

  const ITEMS = [
    ['wrote', 'Write your first words', 'Open a book and type. It saves itself every few seconds.'],
    ['sync', 'Keep your books safe', 'Sync with Dropbox or OneDrive, or move your books to a backed-up folder. Settings › Where your books live.'],
    ['detailed', 'Try Detail', 'The corkboard, outline and timeline. Click Detail at the top of the left panel in a book.'],
    ['snapshot', 'Take a snapshot', 'Saves a copy of a chapter before a big rewrite. Ctrl+Shift+S, or the clock button at the top right of the page.'],
    ['export', 'Export your book', 'A PDF, Word file or e-book, from Export at the top of a book.']
  ];
  const flags = () => (S.settings && S.settings.started) || {};

  // mark one done (cheap to call often)
  function done(key) {
    if (!S.settings || flags()[key]) return;
    const started = { ...flags(), [key]: Date.now() };
    S.settings.started = started;
    saving = saving.then(() => api.setSettings({ started }).then(st => { S.settings = st; }).catch(() => {}));
    if (!document.getElementById('library').classList.contains('hidden')) render();
  }

  async function syncOn() {
    if (window.UnwipDropbox && window.UnwipDropbox.connected()) return true;
    try { const list = await api.listProjects(); return list.some(p => /Dropbox|OneDrive|Google Drive|iCloud/.test(p.place || '')); } catch { return false; }
  }

  async function render() {
    const home = document.getElementById('write-home'); if (!home) return;
    let card = document.getElementById('gs-card');
    const st = S.settings || {};
    if (st.startedHidden) { if (card) card.remove(); return; }
    if (await syncOn()) { if (!flags().sync) done('sync'); }
    const PHONE = { sync: 'Connect Dropbox with the button at the top, so a copy is always in your own Dropbox.', snapshot: 'Saves a copy of a chapter before a big rewrite. In a chapter: More (…) › Snapshots.', export: 'A PDF, Word file or e-book: tap the magnifying glass at the bottom and type “export”.' };
    const items = ITEMS.filter(([k]) => !(k === 'detailed' && phone())).map(([k, t, d]) => [k, t, (api.web && touch() && PHONE[k]) || d]);
    const f = flags(), left = items.filter(([k]) => !f[k]);
    if (!left.length) { if (card) card.remove(); return; }   // all done: step aside
    if (!card) { card = document.createElement('section'); card.id = 'gs-card'; card.className = 'gs-card'; const dash = document.getElementById('dash'); dash ? dash.after(card) : home.prepend(card); }
    const n = items.length - left.length;
    card.innerHTML = `<div class="gs-head"><div><h2>Getting started</h2><span>${n} of ${items.length} done</span></div>
        <button class="gs-x" type="button" title="Hide this card" aria-label="Hide Getting started">×</button></div>
      <div class="gs-bar"><i style="width:${Math.round(n / items.length * 100)}%"></i></div>
      <ul>${items.map(([k, t, d]) => `<li class="${f[k] ? 'on' : ''}"><span class="gs-tick" aria-hidden="true"></span><div><b>${esc(t)}</b><small>${esc(d)}</small></div></li>`).join('')}</ul>`;
    card.querySelector('.gs-x').onclick = async () => {
      card.remove();
      try { S.settings = await api.setSettings({ startedHidden: true }); } catch {}
      U.toast('Hidden. Settings › Help has the tour and the welcome setup if you want them.', '', 6000);
    };
  }

  // ---------------------------------------------------------------- phone and iPad: keep writing safe
  // In the browser version, books are kept in the browser's own storage. Safari can clear a website's storage after
  // about a week without a visit (a Home Screen app is exempt), so on a phone or iPad we ask, once, after the setup:
  // add Unwip to the Home Screen, and connect Dropbox so there's always a copy in your own Dropbox.
  const touch = () => api.web && (matchMedia('(pointer: coarse)').matches || 'ontouchend' in document);
  const ios = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && 'ontouchend' in document);
  const standalone = () => navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  const dbx = () => window.UnwipDropbox && window.UnwipDropbox.connected();

  async function safety() {
    if (!api.web || !S.settings || !S.settings.onboarded) return;
    // ask the browser to keep Unwip's storage, and find out whether it said yes (the warning is stronger if not)
    let kept = true; try { if (navigator.storage && navigator.storage.persisted) kept = (await navigator.storage.persisted()) || (await navigator.storage.persist()); } catch {}
    const needHome = ios() && !standalone(), needDbx = !dbx() && window.UnwipDropbox;
    banner(!dbx(), kept);
    if (!touch()) return;   // the one-time setup question is for phones and iPads
    if (S.settings.safeAsked || (!needHome && !needDbx)) return;
    try { S.settings = await api.setSettings({ safeAsked: Date.now() }); } catch {}
    const body = document.createElement('div');
    body.innerHTML = `<p>Your books are saved on this ${/iPad/.test(navigator.userAgent) ? 'iPad' : 'device'}, inside the browser. ${needHome && needDbx ? 'Two quick things make' : 'One quick thing makes'} sure they stay safe:</p>
      ${needHome ? `<div class="sf-step"><b>${needDbx ? '1. ' : ''}Add Unwip to your Home Screen</b><span>Tap <b>Share</b> (the square with an arrow), then <b>Add to Home Screen</b>. It opens full screen, works offline, and Safari is much less likely to clear its storage (it can clear a website’s storage after about a week without a visit). Do it before you write much: the Home Screen app keeps its own storage, so books written in a Safari tab don’t move across by themselves${needDbx ? ', but Dropbox carries them across' : ''}.</span></div>` : ''}
      ${needDbx ? `<div class="sf-step"><b>${needHome ? '2. ' : ''}Connect Dropbox</b><span>A copy of every book goes to <b>your own</b> Dropbox, so nothing is lost if this device is, and your PC or Mac can open the same books.</span></div>` : ''}`;
    const v = await U.modal({ title: 'Keep your writing safe', body, buttons: [{ label: 'Not now', value: false, kind: 'ghost' }, ...(needDbx ? [{ label: 'Connect Dropbox', value: 'dbx', kind: 'primary' }] : [{ label: 'Got it', value: true, kind: 'primary' }])] });
    if (v === 'dbx') window.UnwipDropbox.connect();
  }
  // until Dropbox is connected, a small reminder on the main screen (hide it for two weeks with ×)
  // (a browser that hasn't promised to keep the storage gets it back after 3 days instead of 14)
  async function backupFiles() {
    let list = []; try { list = (await api.listProjects()).filter(p => !p.deleted); } catch {}
    if (!list.length) return U.toast('No books to back up yet.');
    const body = document.createElement('div');
    body.innerHTML = `<p>A backup file holds a whole book (chapters, sheets, images and snapshots). Keep it somewhere safe, like Files, iCloud Drive or email, and open it in Unwip to bring the book back.</p>
      <div class="sy-list">${list.map(p => `<div class="sy-row"><div><b>${U.esc(p.title || p.slug)}</b><span>${(p.words || 0).toLocaleString()} words</span></div><button class="btn primary" type="button" data-s="${U.esc(p.slug)}">Save</button></div>`).join('')}</div>`;
    body.querySelectorAll('[data-s]').forEach(b => b.onclick = async () => { try { const f = await api.backupExport(b.dataset.s); if (f !== false) { b.textContent = 'Saved ✓'; try { localStorage.setItem('unwip-backupfile', String(Date.now())); } catch {} } } catch (e) { U.toast('Couldn’t save the backup file: ' + U.esc(String(e.message || e)), 'warn'); } });
    await U.modal({ title: 'Save a backup file', body, buttons: [{ label: 'Done', value: true, kind: 'primary' }] });
  }
  function banner(show, kept = true) {
    const home = document.getElementById('write-home'); if (!home) return;
    let b = document.getElementById('sf-banner');
    const quiet = S.settings && S.settings.safeQuiet && Date.now() - S.settings.safeQuiet < (kept ? 14 : 3) * 864e5;
    if (!show || quiet) { if (b) b.remove(); return; }
    if (b) return;
    b = document.createElement('div'); b.id = 'sf-banner'; b.className = 'sf-banner';
    const say = kept ? 'Your books are only on this device, inside the browser. Connect Dropbox, or save a backup file now and then, so there’s always a copy.' : 'This browser hasn’t agreed to keep Unwip’s storage, so it could clear your books to save space. Connect Dropbox, or save a backup file, so there’s always a copy.';
    b.innerHTML = `<span>${say}</span>${window.UnwipDropbox ? '<button class="btn small primary" type="button" data-c>Connect Dropbox</button>' : ''}<button class="btn small" type="button" data-b>Save a backup file</button><button class="gs-x" type="button" aria-label="Hide for now" data-x>×</button>`;
    const c = b.querySelector('[data-c]'); if (c) c.onclick = () => window.UnwipDropbox.connect();
    b.querySelector('[data-b]').onclick = () => backupFiles();
    b.querySelector('[data-x]').onclick = async () => { b.remove(); try { S.settings = await api.setSettings({ safeQuiet: Date.now() }); } catch {} };
    home.prepend(b);
  }

  // when the main screen shows, refresh the card
  const lib = document.getElementById('library');
  if (lib) new MutationObserver(() => { if (!lib.classList.contains('hidden')) { render(); safety(); } }).observe(lib, { attributes: true, attributeFilter: ['class'] });
  setTimeout(() => { render(); safety(); }, 1200);
  return { done, render, safety, ITEMS };
})();
