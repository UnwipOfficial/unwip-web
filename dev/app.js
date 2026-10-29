// Unwip - app logic (library, binder, editor, copy/paste, export, writer mode)
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const api = window.folio;
  const Clip = window.FolioClip;
  const Fonts = window.FolioFonts;
  const I = window.ICONS;

  // ------------------------------------------------------------------ defaults
  const DEFAULT_STYLE = {
    font: 'Times New Roman', size: 12, lineHeight: 1.5, indent: 0.5, paraSpacing: 0,
    justify: false, noIndentFirst: true, titlesAsHeadings: true, pageWidth: 760,
    headings: {
      h1: { font: 'Times New Roman', size: 18, bold: true, italic: false, align: 'center', spaceBefore: 24, spaceAfter: 18 },
      h2: { font: 'Times New Roman', size: 14, bold: true, italic: false, align: 'left', spaceBefore: 18, spaceAfter: 10 },
      h3: { font: 'Times New Roman', size: 12, bold: true, italic: true, align: 'left', spaceBefore: 14, spaceAfter: 6 }
    }
  };
  const ROOTS = [
    { kind: 'manuscript', title: 'Manuscript', icon: 'book' },
    { kind: 'characters', title: 'Characters', icon: 'person' },
    { kind: 'places', title: 'Places', icon: 'pin' },
    { kind: 'items', title: 'Items', icon: 'gem' },
    { kind: 'notes', title: 'Notes', icon: 'note' },
    { kind: 'research', title: 'Research', icon: 'flask' },
    { kind: 'trash', title: 'Trash', icon: 'trash' }
  ];
  const NEW_TITLE = { manuscript: 'Chapter', characters: 'New character', places: 'New place', items: 'New item', notes: 'New note', research: 'New research note', trash: 'Untitled' };
  const SHEETS = {
    characters: ['Full name', 'Aliases', 'Role', 'Age'], places: ['Name', 'Aliases', 'Region', 'Type'], items: ['Name', 'Aliases', 'Type', 'Owner']
  };
  const SHEET_SECTIONS = {
    characters: ['Appearance', 'Personality', 'Backstory', 'Notes'],
    places: ['Description', 'History', 'Notes'],
    items: ['Description', 'History', 'Notes']
  };

  // ------------------------------------------------------------------ state
  const S = { unsaved: {},
    slug: null, project: null, docId: null, selectedId: null,
    lastRange: null, sessionTyped: 0, lastDocWords: 0, programmatic: false,
    saveTimer: null, metaTimer: null, dirty: false, backupTimer: null, plainPaste: false,
    pendingSize: null
  };  // which device this is: a hidden ID kept on this device. The device's name ("iPad", "Workhorse") is only for showing:
  // two iPhones share a name, and an iPhone set to "Request Desktop Website" calls itself an iPad
  S.deviceId = (() => { try { let id = localStorage.getItem('unwip-device-id'); if (!id) { id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); localStorage.setItem('unwip-device-id', id); } return id; } catch { return ''; } })();
  // was this changed on this device? By ID where it was recorded, by name only for changes saved before IDs existed
  const isMine = (dev, devId) => devId && S.deviceId ? devId === S.deviceId : !!(dev && S.device && dev === S.device);
  // "this iPad", "this iPhone", or "this computer"
  const hereName = () => /^(iPad|iPhone|Android)$/.test(S.device || '') ? 'this ' + S.device : 'this computer';

  // small event bus so the add-on modules (notes.js, stuck.js, look.js) can follow along
  const HOOKS = {};
  function on(name, fn) { (HOOKS[name] = HOOKS[name] || []).push(fn); }
  function emit(name, ...a) { for (const f of HOOKS[name] || []) { try { f(...a); } catch (e) { console.error(name, e); } } }
  const editor = $('#editor');
  const editorWrap = $('#editor-wrap');

  const uid = () => 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const countWords = t => (String(t).match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) || []).length;
  const fmt = n => Number(n || 0).toLocaleString();
  const today = () => new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD
  // when a book was last changed, with the time (people switch between books a lot): Today 3:05 pm, Yesterday 9:12 am, 14 Oct 2026, 8:40 pm
  function lastChanged(t) {
    const d = new Date(t), time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).replace(/\s?([AP])M$/i, (m, a) => ' ' + a.toLowerCase() + 'm');
    const day = x => x.toLocaleDateString('en-CA'), y = new Date(); y.setDate(y.getDate() - 1);
    if (day(d) === day(new Date())) return 'Today ' + time;
    if (day(d) === day(y)) return 'Yesterday ' + time;
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) + ', ' + time;
  }

  // ------------------------------------------------------------------ theme
  function applyTheme() {
    const pref = localStorage.getItem('folio-theme') || 'system';
    const dark = pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  applyTheme();

  // ------------------------------------------------------------------ toasts, menus, modals
  function toast(msg, kind = '', ms = 3200) {
    const t = document.createElement('div');
    t.className = 'toast ' + kind; t.innerHTML = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, ms);
    return t;
  }

  function toastAction(msg, label, action, ms = 12000) {
    const t = document.createElement('div');
    t.className = 'toast with-action';
    t.innerHTML = `<span>${msg}</span>`;
    const b = document.createElement('button');
    b.className = 'toast-btn'; b.textContent = label;
    const close = () => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); };
    b.onclick = () => { close(); action(); };
    const x = document.createElement('button');
    x.className = 'toast-x'; x.textContent = '✕'; x.title = 'Dismiss'; x.onclick = close;
    t.append(b, x);
    $('#toasts').appendChild(t);
    setTimeout(close, ms);
  }

  function showMenu(x, y, items) {
    const m = $('#menu');
    m.innerHTML = '';
    for (const it of items) {
      if (it.sep) { m.appendChild(document.createElement('hr')); continue; }
      const b = document.createElement('button');
      b.innerHTML = esc(it.label) + (it.hint ? `<span class="hint">${esc(it.hint)}</span>` : '');
      if (it.danger) b.classList.add('danger');
      if (it.disabled) b.disabled = true;
      b.onclick = () => { hideMenu(); it.action && it.action(); };
      m.appendChild(b);
    }
    m.classList.remove('hidden');
    const r = m.getBoundingClientRect();
    m.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
    m.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
  }
  function hideMenu() { $('#menu').classList.add('hidden'); }
  document.addEventListener('mousedown', e => { if (!e.target.closest('#menu') && !(S.longPress && Date.now() - S.longPress < 900)) hideMenu(); });

  // Copy plain text. Call it straight from a click or tap: Safari (and iPhone/iPad) only allow copying during one. The
  // old-style copy goes first because it happens at once, inside the click; the newer clipboard call is the fallback.
  function copyText(text) {
    text = String(text == null ? '' : text);
    let ok = false;
    try {
      const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;font-size:16px';
      const had = document.activeElement; document.body.appendChild(ta); ta.focus(); ta.select(); ta.setSelectionRange(0, text.length);
      ok = document.execCommand('copy'); ta.remove(); if (had && had.focus) try { had.focus({ preventScroll: true }); } catch {}
    } catch {}
    if (ok) return Promise.resolve(true);
    try { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(() => true, () => false); } catch {}
    return Promise.resolve(false);
  }
  function modal({ title, body, buttons, wide, onOpen }) {
    return new Promise(resolve => {
      const back = document.createElement('div');
      back.className = 'modal-back';
      back.innerHTML = `<div class="modal ${wide ? 'wide' : ''}"><h2>${esc(title)}</h2><div class="m-body"></div><div class="m-foot"></div></div>`;
      const bodyEl = $('.m-body', back);
      if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
      const foot = $('.m-foot', back);
      const close = v => { back.remove(); document.removeEventListener('keydown', onKey, true); resolve(v); };
      for (const b of buttons || [{ label: 'OK', value: true, kind: 'primary' }]) {
        const btn = document.createElement('button');
        btn.className = 'btn ' + (b.kind || '');
        btn.textContent = b.label;
        // onClick runs inside the click itself (copying needs that in Safari) and keeps the dialog open
        btn.onclick = () => { if (b.onClick) { b.onClick(); return; } close(b.value === undefined ? b.label : b.value); };
        foot.appendChild(btn);
      }
      const onKey = e => {
        if (e.key === 'Escape') { e.stopPropagation(); close(null); }
        if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'SELECT' && !e.target.isContentEditable && !(e.target.closest && e.target.closest('[data-own-enter]'))) {
          const primary = foot.querySelector('.primary'); if (primary) { e.preventDefault(); primary.click(); }
        }
      };
      document.addEventListener('keydown', onKey, true);
      back.addEventListener('mousedown', e => { if (e.target === back) close(null); });
      document.body.appendChild(back);
      onOpen && onOpen(back);
      // put the cursor in the first box to type in, never a drop-down or a tick box (on an iPhone or iPad, focusing a
      // drop-down pops its picker open straight away). On touch screens only for a dialog that is just one text box,
      // so the keyboard doesn't jump up over every dialog.
      const texts = [...back.querySelectorAll('input:not([type]), input[type=text], input[type=search], input[type=number], input[type=email], input[type=url]')].filter(x => !x.disabled && x.offsetParent !== null);
      const touch = window.matchMedia && matchMedia('(pointer: coarse)').matches;
      const first = texts[0];
      if (first && (!touch || texts.length === 1)) { first.focus(); first.select && first.select(); }
    });
  }
  async function promptText(title, label, value = '') {
    let input;
    const body = document.createElement('div');
    body.innerHTML = `<div class="field"><label>${esc(label)}</label><input type="text" value="${esc(value)}"></div>`;
    input = $('input', body);
    const ok = await modal({ title, body, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'OK', value: true, kind: 'primary' }] });
    return ok ? input.value.trim() : null;
  }
  async function confirmBox(title, text, okLabel = 'OK', danger = false) {
    return !!(await modal({ title, body: `<p>${text}</p>`, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: okLabel, value: true, kind: danger ? 'danger primary' : 'primary' }] }));
  }

  // ------------------------------------------------------------------ icons into static buttons
  $('#btn-library').innerHTML = I.back;
  $('#btn-export').innerHTML = I.preview;
  $('#btn-settings').innerHTML = I.gear; $('#btn-settings-lib').innerHTML = I.gear;
  $('#sprint-bolt').innerHTML = I.bolt; $('#rp-refresh-ic').innerHTML = I.refresh;
  $('#btn-style').innerHTML = I.style;
  $('#btn-writer').innerHTML = I.writer;
  $('#btn-cmdk').innerHTML = I.goto + `<span class="cmdk-lbl">Go to or do</span><span class="cmdk-key">${/Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘K' : 'Ctrl K'}</span>`; $('#btn-panel').innerHTML = I.panel; $('#btn-binder').innerHTML = I.panel.replace('M15 4.5v15', 'M9 4.5v15'); if (/Mac|iPhone|iPad/.test(navigator.userAgent)) $('#btn-binder').dataset.tip = 'Hide or show the left panel · ⌘⇧['; $('#ex-caret').innerHTML = I.caretDown; $('#ex-btn-ic').innerHTML = I.export || I.doc || '';
  $('#btn-cmdk').onclick = () => window.UnwipCommand && window.UnwipCommand.open();
  $$('[data-icon]').forEach(b => b.innerHTML = I[b.dataset.icon]);
  const writerExit = document.createElement('button');
  writerExit.className = 'btn writer-exit'; writerExit.textContent = 'Exit writer mode (Esc)';
  writerExit.onclick = () => setWriter(false);
  document.body.appendChild(writerExit);

  // ================================================================== LIBRARY
  async function showLibrary() {
    if (S.slug && (await leaveProject()) === false) return;   // stayed: the book couldn't be saved
    $('#workspace').classList.add('hidden');
    $('#library').classList.remove('hidden');
    try { S.settings = await api.getSettings(); } catch {}
    const list = await api.listProjects();
    $('#lib-total-words').textContent = fmt(list.reduce((a, p) => a + (p.words || 0), 0));
    $('#lib-today').textContent = '';
    renderDashboard(list);
    renderQuoteCard();
    emit('library', list);
    document.title = 'Unwip — Write to finish';
    const grid = $('#project-grid');
    grid.innerHTML = '';
    if (!list.length) grid.innerHTML = '<div class="lib-empty">No books yet. Start one with <b>New book</b>, or bring one in with <b>Import</b>.</div>';
    // grouped by where they're kept (Dropbox, then other synced folders, then this device), when there's more than one place
    const groupKey = p => `${p.placeRank ?? 2}|${p.place || ''}`;
    const groups = [...new Set(list.map(groupKey))].sort((a, b) => (+a.split('|')[0] - +b.split('|')[0]) || a.localeCompare(b));
    const grouped = groups.length > 1;
    const ordered = grouped ? groups.flatMap(g => list.filter(p => groupKey(p) === g)) : list;
    let lastGroup = null;
    for (const p of ordered) {
      if (grouped && groupKey(p) !== lastGroup) {
        lastGroup = groupKey(p);
        const n = list.filter(x => groupKey(x) === lastGroup).length;
        const h = document.createElement('div'); h.className = 'lib-group'; h.innerHTML = `<span>${esc(p.place || 'Other')}</span><small>${n} book${n === 1 ? '' : 's'}</small>`; grid.appendChild(h);
      }
      const card = document.createElement('div');
      card.className = 'project-card';
      const when = p.modified ? lastChanged(p.modified) : '';
      const goal = (p.goals || {}).total || 0;
      const pace = paceText(p.goals || {}, p.words || 0);
      card.innerHTML = `<div class="pc-top"><div><div class="pc-spine"></div><h3>${esc(p.title)}</h3></div>
          ${goal ? dial({ pct: p.words / goal, big: Math.floor(p.words / goal * 100) + '%', small: '', size: 58, track: 6 }) : ''}</div>
        ${pace ? `<div class="pc-pace">${esc(pace)}</div>` : ''}
        ${p.elsewhere ? `<div class="pc-elsewhere" title="Another device changed this book since this ${esc(window.folio.__device || 'device')} last synced. Opening it brings the changes in first.">⚠ Changed on another device</div>` : ''}
        ${p.unsynced ? `<div class="pc-unsynced" title="This book has changes on this ${esc(p.unsynced)} that aren’t in Dropbox yet. Press Sync to send them.">● Not synced yet</div>` : ''}
        <div class="pc-meta">${fmt(p.words)}${goal ? ' / ' + fmt(goal) : ''} words · ${when}${p.dev && !isMine(p.dev, p.devId) ? ` · on ${esc(p.dev)}` : ''}</div><button class="icon-btn small pc-more" title="More">${I.dots}</button>`;
      card.onclick = e => { if (!e.target.closest('.pc-more')) openBook(p); };
      $('.pc-more', card).onclick = e => {
        e.stopPropagation();
        showMenu(e.clientX, e.clientY, [
          { label: 'Open', action: () => openBook(p) },
          { label: 'Rename…', action: () => renameBook(p) },
          { label: 'Export…', action: async () => { const ok = await openBook(p); if (ok !== false && S.slug === p.slug) openPreview(); } },
          ...(api.web ? [] : [{ label: 'Show in folder', action: () => api.revealProject(p.slug) }]),
          { label: 'Backups…', action: () => window.UnwipSync && window.UnwipSync.backupsDialog(p.slug, p.title) },
          { label: 'Save a full backup file…', action: async () => { const f = await api.backupExport(p.slug); if (f) toast('Full backup saved, including images and snapshots.'); } },
          ...(api.moveProject ? [{ label: 'Move to…', action: () => moveBook(p) }] : []),
          { sep: true },
          { label: 'Delete…', danger: true, action: () => deleteBook(p) }
        ]);
      };
      grid.appendChild(card);
    }
    renderBin();
  }
  // a book that's gone since the list was drawn (deleted or moved on another device): say so and redraw
  async function openBook(p) {
    try { await openProject(p.slug); }
    catch (e) { toast(`“${esc(p.title)}” isn’t here any more. It may have been deleted or moved on another device (look in Deleted books).`, 'warn', 8000); showLibrary(); }
  }
  // ---- deleting a book: it goes to Deleted books (on this screen), where it can be restored
  // renaming a book from the main screen (beta, 28 Oct: there was no way to). The name changes everywhere in Unwip and
  // on your other devices; the folder keeps its name, so Dropbox has nothing to move.
  async function renameBook(p) {
    const name = await promptText('Rename this book', 'Book name', p.title || '');
    if (name == null || !name || name === p.title) return;
    try {
      const proj = await api.openProject(p.slug);
      proj.title = name.slice(0, 120);
      await api.saveProjectMeta(p.slug, proj);
      showLibrary(); toast(`Renamed to “${esc(proj.title)}”.`);
    } catch (e) { toast(`Couldn’t rename it: ${esc(e.message || e)}`, 'warn', 8000); }
  }
  async function deleteBook(p) {
    // the phone/iPad version with Dropbox may offer "this device only" or "everywhere" (dropbox.js)
    const choices = api.deleteChoices ? await api.deleteChoices(p.slug) : null;
    const where = p.place && /dropbox|onedrive|drive/i.test(p.place) ? ` It’s in ${esc(p.place)}, so it leaves your other devices too (they keep it in their Deleted books).` : '';
    const v = await modal({ title: 'Delete this book?', body: `<p>“${esc(p.title)}” goes to <b>Deleted books</b>, at the bottom of this screen. You can bring it back from there any time.${choices ? '' : where}</p>${choices ? `<p class="hint">${choices.note}</p>` : ''}`,
      buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, ...(choices ? choices.buttons.map((b, i) => ({ label: b, value: 'c' + i, kind: i === choices.buttons.length - 1 ? 'danger primary' : 'ghost' })) : [{ label: 'Delete', value: 'c0', kind: 'danger primary' }])] });
    if (!v) return;
    try { await api.deleteProject(p.slug, { how: +v.slice(1) }); }
    catch (e) {
      // nothing changed: the book is still here, so don't also say it's in Deleted books (beta, 28 Oct)
      showLibrary();
      if (/BUSY/.test(String(e.message || e))) toast(`Couldn’t delete “${esc(p.title)}” just now: the Dropbox app (or another program) is busy with its folder. It’s still here, untouched. Try again in a minute.`, 'warn', 12000);
      else toast(`Couldn’t delete “${esc(p.title)}”: ${esc(e.message || e)}. It’s still here, untouched.`, 'warn', 12000);
      return;
    }
    showLibrary();
    toast(`“${esc(p.title)}” is in Deleted books.`);
  }
  // ---- moving a book to another place (Dropbox, this device only…)
  async function moveBook(p) {
    const norm = x => String(x || '').replace(/[\\/]+$/, '').toLowerCase();
    const places = (await api.projectPlaces().catch(() => [])).filter(x => norm(x.path) !== norm(p.placePath));
    if (!places.length && !api.pickPlace) return toast('There’s nowhere else to move it to yet.');
    const body = document.createElement('div');
    body.innerHTML = `<p>“${esc(p.title)}” is in <b>${esc(p.place || 'your library')}</b>.</p><div class="field"><label>Move it to</label><select id="mv-place">${places.map((x, i) => `<option value="${i}">${esc(x.label)}${x.note ? ` (${esc(x.note)})` : ''}</option>`).join('')}${api.pickPlace ? '<option value="pick">Another folder…</option>' : ''}</select></div><p class="hint" id="mv-note"></p>`;
    const note = () => { const v = $('#mv-place', body).value, x = places[+v]; $('#mv-note', body).textContent = x && x.note && /not synced/i.test(x.note) ? 'It will only be on this device from now on. Your other devices keep a copy in their Deleted books.' : x && /dropbox/i.test(x.label) ? 'It will sync to your other devices from now on.' : ''; };
    const ok = await modal({ title: 'Move book', body, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Move', value: true, kind: 'primary' }], onOpen: () => { $('#mv-place', body).onchange = note; note(); } });
    if (!ok) return;
    const v = $('#mv-place', body).value, place = v === 'pick' ? await api.pickPlace() : (places[+v] || {}).path;
    if (!place) return;
    try { await api.moveProject(p.slug, place); toast(`Moved “${esc(p.title)}”.`); } catch (e) { toast(`Couldn’t move it: ${esc(e.message || e)}`, 'warn', 9000); }
    showLibrary();
  }
  async function renderBin() {
    const el = $('#lib-bin'); if (!el) return;
    const list = api.deletedProjects ? await api.deletedProjects().catch(() => []) : [];
    el.innerHTML = list.length ? `<button class="link-btn" id="lib-bin-open">🗑️ Deleted books (${list.length})</button>` : '';
    if (list.length) $('#lib-bin-open').onclick = () => binDialog();
  }
  async function binDialog() {
    const body = document.createElement('div'); body.className = 'bin-box';
    const draw = async () => {
      const list = await api.deletedProjects().catch(() => []);
      if (!list.length) { body.innerHTML = '<p class="hint">Nothing in Deleted books.</p>'; return; }
      const when = t => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
      body.innerHTML = `<p class="hint">Deleted books stay here until you delete them forever. Bring one back and it’s just as it was.</p>
        <div class="bin-list">${list.map(b => `<div class="bin-row" data-id="${esc(b.id)}"><div><b>${esc(b.title)}</b><span>${fmt(b.words)} words · deleted ${when(b.at)}${b.by ? ` on ${esc(b.by)}` : ''}${b.place ? ` · ${esc(b.place)}` : ''}</span></div>
          <button class="btn small" data-a="restore">Bring back</button><button class="btn small ghost danger-text" data-a="purge">Delete forever</button></div>`).join('')}</div>`;
      body.querySelectorAll('.bin-row button').forEach(btn => btn.onclick = async () => {
        const id = btn.closest('.bin-row').dataset.id, b = list.find(x => x.id === id);
        if (btn.dataset.a === 'restore') { await api.restoreDeleted(id); toast(`“${esc(b.title)}” is back.`); }
        else if (await confirmBox('Delete forever?', `“${esc(b.title)}” will be removed from Unwip for good${api.web ? '' : ' (Windows keeps it in its Recycle Bin for a while)'}.`, 'Delete forever', true)) await api.purgeDeleted(id);
        await draw();
      });
    };
    await draw();
    await modal({ title: 'Deleted books', body, wide: true, buttons: [{ label: 'Close', value: true, kind: 'primary' }] });
    showLibrary();
  }
  // ---- where a new book is kept: offered when there's more than one place it could go
  async function placeField(id = 'np-place') {
    const places = api.projectPlaces ? await api.projectPlaces().catch(() => []) : [];
    if (places.length < 2 && !api.pickPlace) return { html: '', read: async () => null };
    const last = (S.settings || {}).newBookPlace;
    // on a phone or iPad, "this device only" is never the remembered default: it's easy to pick once and then forget,
    // and a book kept there doesn't sync
    const pick = (last === 'local' ? null : places.find(x => x.path === last)) || places.find(x => x.main) || places[0];
    const html = `<div class="field"><label>Keep it in</label><select id="${id}">${places.map((x, i) => `<option value="${i}" ${x === pick ? 'selected' : ''}>${esc(x.label)}${x.note ? ` (${esc(x.note)})` : ''}</option>`).join('')}${api.pickPlace ? '<option value="pick">Another folder…</option>' : ''}</select></div>`;
    return { html, read: async body => {
      const v = $('#' + id, body).value;
      const place = v === 'pick' ? await api.pickPlace() : (places[+v] || {}).path;
      if (place) S.settings = await api.setSettings({ newBookPlace: place }).catch(() => S.settings);
      return place || null;
    } };
  }
  $('#btn-new-project').onclick = async () => {
    const pf = await placeField();
    const body = document.createElement('div');
    body.innerHTML = `<div class="field"><label>Title</label><input type="text" id="np-title" placeholder="You can change it any time"></div>${pf.html}`;
    const ok = await modal({ title: 'New book', body, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Create', value: true, kind: 'primary' }], onOpen: () => setTimeout(() => $('#np-title', body).focus(), 50) });
    const title = ok ? $('#np-title', body).value.trim() : '';
    if (!title) return;
    const place = await pf.read(body);
    const slug = await api.createProject(title, newProjectTemplate(), place);
    openProject(slug);
  };
  $('#btn-open-folder').onclick = () => api.revealProject(null);
  if (api.web) $('#btn-open-folder').classList.add('hidden');   // the web keeps books inside the browser: there's no folder to show

  function newProjectTemplate() {
    const firstChapter = { id: uid(), type: 'doc', title: 'Chapter 1', words: 0 };
    return {
      version: 1, format: FORMAT,
      style: mergeStyle({ ...JSON.parse(JSON.stringify(DEFAULT_STYLE)), ...((S.settings || {}).defaultStyle || {}) }),
      binder: ROOTS.map(r => ({ id: 'root-' + r.kind, type: 'folder', kind: r.kind, title: r.title, root: true, open: r.kind === 'manuscript', children: r.kind === 'manuscript' ? [firstChapter] : [] })),
      lastDoc: firstChapter.id,
      totalWords: 0,
      stats: { days: {} }
    };
  }

  // ================================================================== PROJECT
  // How projects are stored. Raise FORMAT only when that changes, and add a step to MIGRATIONS that turns the
  // previous format into the new one. Opening an older project backs it up first; a newer one is never opened
  // (an older Unwip could drop things it doesn't understand), it asks you to update instead.
  const FORMAT = 1;
  const MIGRATIONS = { /* 2: project => { ... } */ };
  // ---- one tab or window at a time per book (web and iPad). Two tabs on one book would each save their own copy of a
  // chapter over the other's, so a second tab asks first. Uses the browser's locks where it has them (they let go by
  // themselves if a tab is closed or crashes), and asks the other tabs over a channel where it doesn't.
  const TABS = api.web && 'BroadcastChannel' in window ? new BroadcastChannel('unwip-tabs') : null;
  let heldBook = null, letGo = null;
  if (TABS) TABS.onmessage = async e => {
    const m = e.data || {};
    if (m.who && m.who === S.slug) TABS.postMessage({ mine: m.who });
    if (m.close && m.close === S.slug) {
      await flushSave().catch(() => {});
      if (troubleRetry) { TABS.postMessage({ unsaved: m.close }); toast('Another tab asked to open this book, but some writing here isn’t saved yet, so it stays open here.', 'warn', 9000); return; }
      await leaveProject(); await showLibrary(); toast('This book was opened in another tab or window, so it was closed here. Your writing was saved first.', '', 9000);
    }
  };
  const askTabs = slug => new Promise(res => { if (!TABS) return res(false); let yes = false; const h = e => { if (e.data && e.data.mine === slug) yes = true; }; TABS.addEventListener('message', h); TABS.postMessage({ who: slug }); setTimeout(() => { TABS.removeEventListener('message', h); res(yes); }, 300); });
  function tryHold(slug) {
    if (heldBook === slug) return Promise.resolve(true);
    if (!(navigator.locks && navigator.locks.request)) return askTabs(slug).then(busy => { if (!busy) heldBook = slug; return !busy; });
    return new Promise(res => {
      navigator.locks.request('unwip-book:' + slug, { ifAvailable: true }, lock => {
        if (!lock) { res(false); return; }
        heldBook = slug; res(true);
        return new Promise(r => { letGo = r; });
      }).catch(() => res(true));   // locks not usable here: don't stop anyone opening their book
    });
  }
  function releaseBook() { if (letGo) letGo(); letGo = null; heldBook = null; }
  async function holdBook(slug) {
    if (!api.web) return true;
    if (heldBook && heldBook !== slug) releaseBook();
    if (await tryHold(slug)) return true;
    const v = await modal({ title: 'Open in another tab', body: '<p>This book is already open in another Unwip tab or window. Writing in both at once would let one save over the other, so only one can have it open.</p>',
      buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Close it there and open here', value: true, kind: 'primary' }] });
    if (!v) return false;
    let refused = false; const h = e => { if (e.data && e.data.unsaved === slug) refused = true; };
    if (TABS) { TABS.addEventListener('message', h); TABS.postMessage({ close: slug }); }
    for (let i = 0; i < 20 && !refused; i++) { await new Promise(r => setTimeout(r, 250)); if (await tryHold(slug)) { if (TABS) TABS.removeEventListener('message', h); return true; } }
    if (TABS) TABS.removeEventListener('message', h);
    if (refused) { await modal({ title: 'Not yet', body: '<p>The other tab has writing it hasn’t been able to save yet, so it’s keeping the book open. Go to that tab: the bar at the top says what’s wrong.</p>', buttons: [{ label: 'OK', value: true, kind: 'primary' }] }); return false; }
    await modal({ title: 'Still open in the other tab', body: '<p>The other tab didn’t let go of the book. Close that tab (or go back to its library), then try again.</p>', buttons: [{ label: 'OK', value: true, kind: 'primary' }] });
    return false;
  }
  async function openProject(slug, opts = {}) {
    if (!opts.skipCheck && window.UnwipOpenGate && !(await window.UnwipOpenGate(slug))) return false;   // other devices' changes first (or a warning when offline)
    if (!opts.skipCheck && window.UnwipSync && !(await window.UnwipSync.beforeOpen(slug))) return false;
    try { S.settings = await api.getSettings(); } catch {}
    const project = await api.openProject(slug);
    const fmt = project.format || 1;
    if (fmt > FORMAT) {
      await modal({ title: 'Made with a newer Unwip', body: `<p>“${esc(project.title || slug)}” was last saved by Unwip ${esc(project.savedBy || 'a newer version')}, which stores books in a newer way than this version can safely read.</p><p>To keep it safe, this version won’t open it. Update Unwip (Settings › Updates, or download it again from the Unwip page), then open it.</p>`, buttons: [{ label: 'OK', value: true, kind: 'primary' }] });
      return false;
    }
    if (fmt < FORMAT) {
      try { await api.backup(slug); } catch (e) { toast('Couldn’t make a backup before updating this book, so it wasn’t changed: ' + esc(String(e.message || e)), 'warn', 9000); return false; }
      for (let v = fmt + 1; v <= FORMAT; v++) if (MIGRATIONS[v]) MIGRATIONS[v](project);
      toast(`Updated “${esc(project.title || slug)}” for this version of Unwip. A backup of how it was is in Backups.`, '', 7000);
    }
    project.format = FORMAT;
    project.style = mergeStyle(project.style);
    repairRoots(project);
    project.stats = project.stats || { days: {} };
    // older versions counted pasted text as written words, so start progress tracking fresh
    if (project.statsVersion !== 2) { project.stats.days = {}; project.statsVersion = 2; }
    if (!(await holdBook(slug))) return false;
    S.slug = slug; S.project = project;
    S.popped = new Set(api.popoutList ? await api.popoutList(slug).catch(() => []) : []);
    $('#library').classList.add('hidden');
    $('#workspace').classList.remove('hidden');
    $('#project-title').textContent = project.title;
    document.title = project.title + ' — Unwip';
    applyStyle();
    const total = manuscriptWords();
    S.sessionTyped = 0;
    S.project.totalWords = total; scheduleMeta(); // refresh a stale total straight away
    renderBinder();
    const first = project.lastDoc && findNode(project.lastDoc) ? project.lastDoc : firstDocId();
    if (first) await openDoc(first); else showEmpty(true);
    updateStatus();
    api.backup(slug).catch(() => {});
    project.goals = project.goals || { daily: 0, total: 0, deadline: '' };
    if (project.goals.daily && !S.settings.dailyGoal) S.settings = await api.setSettings({ dailyGoal: project.goals.daily });
    try { const all = await api.listProjects(); S.allProjects = all; S.allDays = all.filter(p => p.slug !== slug).map(p => p.days || {}); } catch { S.allDays = []; S.allProjects = []; }
    project.stats.sprints = project.stats.sprints || [];
    scheduleNames(0);
    if (project.splitId && findNode(project.splitId) && !document.documentElement.classList.contains('m-phone')) setTimeout(() => openSplit(project.splitId), 300);
    emit('project', project);
    clearInterval(S.backupTimer);
    S.backupTimer = setInterval(() => { if (S.slug && S.dirtySinceBackup) { api.backup(S.slug); S.dirtySinceBackup = false; } }, 10 * 60 * 1000);
  }
  // The Manuscript and Trash must always exist (exports read the Manuscript). If a project file
  // ever lost one, put it back rather than failing.
  function repairRoots(project) {
    project.binder = Array.isArray(project.binder) ? project.binder : [];
    for (const kind of ['manuscript', 'trash']) {
      let r = project.binder.find(n => n.root && n.kind === kind);
      if (!r) {
        const def = ROOTS.find(x => x.kind === kind);
        r = { id: 'root-' + kind, type: 'folder', kind, title: def.title, root: true, open: true, children: [] };
        if (kind === 'manuscript') project.binder.unshift(r); else project.binder.push(r);
      }
      r.root = true; r.type = 'folder'; r.children = r.children || [];
      if (!String(r.title || '').trim()) r.title = ROOTS.find(x => x.kind === kind).title;
    }
  }
  // another device changed project.json (via Dropbox): take its binder without closing the project
  function reloadProjectMeta(p) {
    p.style = mergeStyle(p.style); repairRoots(p);
    p.stats = p.stats || { days: {} }; p.stats.days = p.stats.days || {}; p.stats.sprints = p.stats.sprints || [];
    p.goals = p.goals || { daily: 0, total: 0, deadline: '' };
    S.project = p;
    applyStyle(); renderBinder(); refreshPlanView(); updateStatus();
    if (S.docId && !findNode(S.docId)) { S.docId = null; showEmpty(true); }
    emit('reload', p);
  }
  function mergeStyle(st) {
    const d = JSON.parse(JSON.stringify(DEFAULT_STYLE));
    st = st || {};
    const out = { ...d, ...st, headings: { h1: { ...d.headings.h1, ...(st.headings || {}).h1 }, h2: { ...d.headings.h2, ...(st.headings || {}).h2 }, h3: { ...d.headings.h3, ...(st.headings || {}).h3 } } };
    // fonts renamed for licence reasons (Lora → Larkspur, Libre Baskerville → Bookhaven) unless the real one is installed
    if (window.FolioFonts) { out.font = window.FolioFonts.alias(out.font); for (const h of ['h1', 'h2', 'h3']) out.headings[h].font = window.FolioFonts.alias(out.headings[h].font); }
    return out;
  }
  async function leaveProject() {
    if (S.lastPlace && S.lastPlace.slug === S.slug) { clearTimeout(S.lastPlaceT); try { S.settings = await api.setSettings({ lastPlace: S.lastPlace }); } catch {} }
    if (S.sprint) await endSprint(false);
    S.sprintDone = null;   // its result is already saved with the book
    if (S.brk && S.brk.then) stopBreak();   // rounds belong to the book; a break timer on its own keeps going
    await flushSplit(); $('#split-pane').classList.add('hidden'); $('#btn-split').classList.remove('on'); S.splitId = null;
    setRevise(false);
    await flushSave();
    if (S.slug && api.popoutClose && S.popped && S.popped.size) await api.popoutClose(S.slug).catch(() => {});
    if (troubleRetry && !(await confirmBox('Not saved yet', 'Unwip still can’t save this book (the warning at the top says why). If you leave now, Unwip keeps trying in the background while it stays open, but it’s safest to fix the problem first.', 'Leave anyway'))) return false;
    if (S.metaTimer && S.slug) await saveMetaNow().catch(() => {});   // a rename or move made just before leaving
    if (S.slug) await api.backup(S.slug).catch(() => {});
    clearInterval(S.backupTimer);
    emit('leave');
    releaseBook();
    S.slug = null; S.project = null; S.docId = null;
    setWriter(false);
  }
  $('#btn-library').onclick = () => showLibrary();

  // ------------------------------------------------------------------ tree helpers
  function walkTree(list, fn, parent = null) {
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      if (fn(n, parent, list, i) === false) return false;
      if (n.children && walkTree(n.children, fn, n) === false) return false;
    }
  }
  function findNode(id) {
    let found = null;
    walkTree(S.project.binder, (n, parent, list, index) => { if (n.id === id) { found = { node: n, parent, list, index }; return false; } });
    return found;
  }
  function rootOf(id) {
    let root = null;
    for (const r of S.project.binder) {
      if (r.id === id) return r;
      walkTree(r.children || [], n => { if (n.id === id) { root = r; return false; } });
      if (root) return root;
    }
    return null;
  }
  function firstDocId() {
    let id = null;
    walkTree(S.project.binder, n => { if (n.type === 'doc' && !n.map && rootOf(n.id).kind !== 'trash') { id = n.id; return false; } });
    return id;
  }
  function isInside(childId, ancestor) {
    let inside = false;
    walkTree(ancestor.children || [], n => { if (n.id === childId) { inside = true; return false; } });
    return inside;
  }
  function folderWords(n) {
    if (n.type === 'doc') return n.words || 0;
    return (n.children || []).reduce((a, c) => a + folderWords(c), 0);
  }
  function manuscriptWords() { return folderWords(S.project.binder.find(r => r.kind === 'manuscript')); }

  // ------------------------------------------------------------------ binder rendering
  function refreshPlanView() { if (S.view === 'outline') renderOutline(); else if (S.view === 'cork') renderCork(); else if (S.view === 'timeline') renderTimeline(); }
  function toggleFav(id) {
    const f = findNode(id); if (!f || f.node.root) return;
    f.node.fav = !f.node.fav; if (!f.node.fav) delete f.node.fav;
    scheduleMeta(); renderBinder();
    toast(f.node.fav ? `★ Added “${esc(f.node.title)}” to Favourites (top of the binder).` : `Removed “${esc(f.node.title)}” from Favourites.`);
  }
  // ---- custom icons / emojis for binder items
  const ICON_CHOICES = ['folder', 'doc', 'book', 'person', 'pin', 'gem', 'note', 'flask', 'scene', 'flame', 'bolt', 'tag', 'mood', 'image', 'sticky', 'palette', 'timeline', 'cork', 'outline', 'history', 'search', 'columns', 'trash'];
  const EMOJI_CHOICES = ('📖 📕 📗 📘 📙 📓 📝 ✏️ 🖋️ 📜 🗒️ 📌 📍 🔖 ⭐ 🌟 ✨ 💡 🔥 ⚡ ❤️ 💔 💀 👑 🗡️ ⚔️ 🛡️ 🏹 🔮 🧪 🗝️ 💎 💰 🪙 📦 🎁 ' +
    '🧙 🧝 🧛 🧟 🐉 🦄 🐺 🦅 🐈 🐍 👤 👥 👩 👨 🧒 👵 🤴 👸 🕵️ 🦹 ' +
    '🏰 🏯 🏠 🏚️ ⛪ 🏙️ 🌆 🌃 🌲 🌳 🏔️ 🌋 🏝️ 🌊 🏜️ 🌍 🗺️ 🧭 🚢 🚂 🚀 ' +
    '🗑️ ☀️ 🌙 🌧️ ❄️ 🌪️ 🌸 🍂 🕯️ 🕰️ ⏳ 📅 🎭 🎬 🎵 🎨 🧩 ❓ ❗ ✅ ❌ 🚧 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪').split(' ');
  function iconHTML(n, fallback) {
    if (!n.icon) return fallback;
    if (I[n.icon] && /^[a-zA-Z]+$/.test(n.icon)) return I[n.icon];
    return `<span class="tr-emoji">${esc(n.icon)}</span>`;
  }
  // the icon chooser: returns { icon } ('' = default) or null if cancelled
  // every emoji with its name and search words (app/vendor/emoji/names.txt, made by tools/emoji/make.py), loaded the
  // first time someone searches, so "trash" finds the wastebasket without the Windows emoji keyboard
  let emojiNames = null;
  const loadEmojiNames = () => emojiNames || (emojiNames = fetch('vendor/emoji/names.txt').then(r => r.ok ? r.text() : '').then(t => t.split('\n').filter(Boolean).map(l => { const [e, n, k] = l.split('\t'); return { e, n, k: (n + ' ' + (k || '')).toLowerCase() }; })).catch(() => []));
  function findEmoji(list, q) {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean), out = [];
    for (const it of list) {
      const ws = it.k.split(' ');
      if (!words.every(w => ws.some(x => x.startsWith(w)))) continue;
      const nm = it.n.toLowerCase(), score = nm === q ? 0 : nm.startsWith(words[0]) ? 1 : nm.split(' ').some(x => x.startsWith(words[0])) ? 2 : 3;
      out.push([score, it]);
    }
    return out.sort((a, b) => a[0] - b[0]).slice(0, 120).map(x => x[1]);
  }
  // the icon chooser: returns { icon } ('' = default) or null if cancelled
  async function pickIcon(current, title) {
    let chosen = current || '';
    const body = document.createElement('div');
    const btn = (v, t) => `<button class="ip-btn" type="button" data-v="${esc(v)}"${t ? ` title="${esc(t)}"` : ''}>${esc(v)}</button>`;
    body.innerHTML = `<div class="ip-own"><label>Search emojis by name (trash, dragon, castle…), or type or paste any emoji</label><input type="text" maxlength="40" value="${chosen && !I[chosen] ? esc(chosen) : ''}" placeholder="Search, or 🙂" aria-label="Search emojis"></div>
      <div class="ip-found hidden"><div class="ip-label">Found</div><div class="ip-grid emoji ip-found-grid"></div></div>
      <div class="ip-label">Icons</div><div class="ip-grid icons">${ICON_CHOICES.map(k => `<button class="ip-btn" type="button" data-v="${k}" title="${k}">${I[k]}</button>`).join('')}</div>
      <div class="ip-label">Emojis</div><div class="ip-grid emoji">${EMOJI_CHOICES.map(e => btn(e)).join('')}</div>`;
    const input = $('.ip-own input', body), found = $('.ip-found', body), fgrid = $('.ip-found-grid', body);
    const mark = () => $$('.ip-btn', body).forEach(b => b.classList.toggle('on', b.dataset.v === chosen));
    const wire = root => $$('.ip-btn', root).forEach(b => b.onclick = () => { chosen = b.dataset.v; if (!input.value || !/\p{L}/u.test(input.value) || /\p{Extended_Pictographic}/u.test(input.value)) input.value = I[chosen] ? '' : chosen; mark(); });
    mark(); wire(body);
    let seq = 0;
    input.oninput = async () => {
      const v = input.value.trim(), my = ++seq;
      if (v && /\p{L}/u.test(v) && !/\p{Extended_Pictographic}/u.test(v)) {   // words: search
        const list = findEmoji(await loadEmojiNames(), v); if (my !== seq) return;
        found.classList.remove('hidden');
        fgrid.innerHTML = list.length ? list.map(it => btn(it.e, it.n)).join('') : `<p class="hint">No emoji called “${esc(v)}”. Try another word.</p>`;
        wire(fgrid); mark();
      } else { found.classList.add('hidden'); fgrid.innerHTML = ''; chosen = v; mark(); }
    };
    const r = await modal({ title: `Icon for “${title || 'Untitled'}”`, body, wide: true, buttons: [{ label: 'Use default', value: 'reset', kind: 'ghost' }, { label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Save', value: true, kind: 'primary' }] });
    if (!r) return null;
    if (r === 'reset' || !chosen) return { icon: '' };
    return { icon: I[chosen] && /^[a-zA-Z]+$/.test(chosen) ? chosen : [...chosen].slice(0, 8).join('') };
  }
  const iconMarkup = v => !v ? '' : I[v] && /^[a-zA-Z]+$/.test(v) ? I[v] : esc(v);
  async function iconPicker(id) {
    const f = findNode(id); if (!f) return;
    const n = f.node;
    const r = await pickIcon(n.icon, n.title); if (!r) return;
    if (!r.icon) delete n.icon; else n.icon = r.icon;
    scheduleMeta(); renderBinder(); refreshPlanView();
  }
  function rootIcon(n) { if (n.icon) return iconHTML(n, ''); const r = ROOTS.find(x => x.kind === n.kind); return r ? I[r.icon] : I.tag; }
  function renderBinder() {
    if (!S.project) return;
    const tree = $('#binder-tree');
    // a rename box is open: redrawing now would throw it away (the "flicker" on double-click), so wait for it
    if (S.renaming && tree.contains(S.renaming)) { S.binderPending = true; return; }
    tree.innerHTML = '';
    settleConflicts();
    const ms = S.project.binder.find(r => r.kind === 'manuscript');
    const build = (n, depth) => {
      if (n.root && n.kind === 'conflicts' && !(n.children || []).length) return;   // nothing waiting to be sorted
      const row = document.createElement('div');
      row.className = 'tree-row' + (n.root ? ' root' : '') + (n.id === S.selectedId ? ' selected' : '') + (n.noBook ? ' no-book' : '');
      if (n.noBook) row.title = 'Left out of the book (it isn’t in the preview or exports)';
      if (n.type === 'folder') row.dataset.folder = '1';
      row.dataset.id = n.id;
      row.style.paddingLeft = (6 + depth * 16) + 'px';
      const hasKids = n.type === 'folder' && n.children && n.children.length;
      const icon = n.root ? rootIcon(n) : iconHTML(n, n.type === 'folder' ? (n.open ? I.folderOpen : I.folder) : I.doc);
      const showCount = n.id === ms.id || isInside(n.id, ms);
      const count = showCount ? folderWords(n) : 0;
      row.innerHTML = `<span class="tr-chev ${n.open ? 'open' : ''} ${n.type === 'folder' && (hasKids || n.root) ? '' : 'none'}">${I.chevron}</span><span class="tr-icon">${icon}</span>${'conflictOf' in n ? `<span class="tr-cq" title="Conflicted copy from ${esc(n.conflictFrom || 'another device')}: changed in two places at once">⚠️</span>` : ''}<span class="tr-title">${esc(n.title || 'Untitled')}</span>${S.popped && S.popped.has(n.id) ? '<span class="tr-pop" title="Open in its own window">⧉</span>' : ''}${n.series && S.project.series ? `<span class="tr-series" title="Shared with the series “${esc(S.project.series)}”">${I.series}</span>` : ''}${n.fav ? `<span class="tr-fav" title="Favourite">★</span>` : ''}${n.type === 'doc' && statusOf(n.status) && S.mode === 'detailed' ? `<span class="st-dot" style="--st:${statusColor(n.status)}" title="${esc(statusName(n.status))}"></span>` : ''}${showCount && count ? `<span class="tr-count">${fmt(count)}</span>` : ''}${n.root && n.kind !== 'trash' && n.kind !== 'conflicts' ? `<button class="tr-add" title="Add a new ${n.kind === 'manuscript' ? 'chapter' : newTitleFor(n).replace(/^New /, '')} to ${esc(n.title)}">+</button>` : ''}`;
      row.draggable = !n.root;
      tree.appendChild(row);
      if (n.type === 'folder' && n.open) for (const c of n.children || []) build(c, depth + 1);
    };
    const favs = []; walkTree(S.project.binder, n => { if (n.fav && !n.root && rootOf(n.id).kind !== 'trash') favs.push(n); });
    if (favs.length) {
      const head = document.createElement('div'); head.className = 'fav-head'; head.innerHTML = '<span>★</span> Favourites'; tree.appendChild(head);
      for (const n of favs) {
        const r = document.createElement('div');
        r.className = 'tree-row fav-row' + (n.id === S.docId ? ' current' : '');
        r.dataset.goto = n.id; r.style.paddingLeft = '6px';
        r.innerHTML = `<span class="tr-icon">${iconHTML(n, n.type === 'folder' ? I.folder : I.doc)}</span><span class="tr-title">${esc(n.title || 'Untitled')}</span><button class="tr-unfav" title="Remove from favourites">✕</button>`;
        tree.appendChild(r);
      }
    }
    let labelled = false;
    for (const r of S.project.binder) {
      if (!r.root && !labelled) { labelled = true; const l = document.createElement('div'); l.className = 'tree-unsorted'; l.textContent = 'New: drag into place'; tree.appendChild(l); }
      build(r, 0);
    }
    emit('binder');
  }

  const tree = $('#binder-tree');
  tree.addEventListener('click', e => {
    const fav = e.target.closest('.fav-row');
    if (fav) {
      const f = findNode(fav.dataset.goto); if (!f) return;
      if (e.target.closest('.tr-unfav')) { toggleFav(f.node.id); return; }
      if (f.node.type === 'doc') { if (S.view !== 'write') setView('write'); openDoc(f.node.id); }
      else { S.selectedId = f.node.id; let p = findNode(f.node.id); while (p && p.parent) { p.parent.open = true; p = findNode(p.parent.id); } f.node.open = true; renderBinder(); const row = $(`.tree-row[data-id="${f.node.id}"]`); if (row) row.scrollIntoView({ block: 'center' }); }
      return;
    }
    const row = e.target.closest('.tree-row'); if (!row) return;
    if (e.target.closest('.tr-add')) { if (e.detail < 2) addNode('doc', row.dataset.id, true); return; }   // a double-click still adds one
    if (S.swallowClick && Date.now() - S.swallowClick < 800) { S.swallowClick = 0; return; }        // the end of a press-and-hold
    // a second click on the same row straight after the first is a double-click: rename. Counted here rather than
    // left to the browser's dblclick, because the first click redraws the binder and Windows may then not see a
    // double-click on the new row at all.
    if (!e.target.closest('input.rename')) {
      const now = Date.now(), again = S.lastRowClick && S.lastRowClick.id === row.dataset.id && now - S.lastRowClick.t < 500;
      S.lastRowClick = { id: row.dataset.id, t: now };
      if ((e.detail >= 2 || again) && !e.target.closest('.tr-chev')) {
        S.lastRowClick = null;
        const n0 = (findNode(row.dataset.id) || {}).node;
        if (n0 && !(n0.root && n0.kind === 'trash')) setTimeout(() => startRename(null, n0), 0);
        return;
      }
    }
    const f = findNode(row.dataset.id); if (!f) return;
    const n = f.node;
    if (n.type === 'folder') {
      // the second click of a double-click (which renames) shouldn't fold the folder away
      if (e.target.closest('.tr-chev') || (n.id === S.selectedId && e.detail < 2)) { n.open = !n.open; scheduleMeta(); }
      S.selectedId = n.id; renderBinder();
    } else {
      openDoc(n.id, { focus: false, from: 'list' });
    }
  });
  tree.addEventListener('dblclick', e => {
    const row = e.target.closest('.tree-row'); if (!row || row.classList.contains('fav-row')) return;
    const n = findNode(row.dataset.id).node;
    if (n.root && n.kind === 'trash') return;   // the Trash keeps its name
    startRename(row, n);                          // sections (Manuscript, Characters…) can be renamed too
  });
  // press and hold on a phone or tablet opens the same menu as a right-click (iPhones and iPads have no right-click)
  {
    let lp = null;
    const cancel = () => { clearTimeout(lp); lp = null; };
    tree.addEventListener('touchstart', e => {
      const row = e.target.closest('.tree-row'); if (!row || row.classList.contains('fav-row') || e.touches.length > 1) return;
      const t = e.touches[0], x = t.clientX, y = t.clientY;
      cancel(); lp = setTimeout(() => { lp = null; S.longPress = Date.now(); S.swallowClick = Date.now(); row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y })); }, 500);
    }, { passive: true });
    tree.addEventListener('touchmove', cancel, { passive: true });
    // lifting the finger after the menu opened isn't a tap (it would close the menu again)
    tree.addEventListener('touchend', e => { cancel(); if (S.longPress && Date.now() - S.longPress < 1500 && e.cancelable) e.preventDefault(); });
    tree.addEventListener('touchcancel', cancel, { passive: true });
  }
  tree.addEventListener('contextmenu', e => {
    const row = e.target.closest('.tree-row'); if (!row || row.classList.contains('fav-row')) return;
    if (e.isTrusted && S.longPress && Date.now() - S.longPress < 1200) { e.preventDefault(); return; }   // Android's own long-press menu, after ours
    e.preventDefault();
    const n = findNode(row.dataset.id).node;
    const root = rootOf(n.id);
    S.selectedId = n.id; renderBinder();
    const items = [];
    const f = findNode(n.id);
    if (root.kind !== 'trash') {
      if (n.type === 'folder') {
        items.push({ label: 'New document inside', action: () => addNode('doc', n.id, true) });
        items.push({ label: 'New folder inside', action: () => addNode('folder', n.id, true) });
        if (window.UnwipTitles && root.kind === 'manuscript') items.push({ label: 'Tidy chapter titles typed into the text…', action: () => window.UnwipTitles.fixExisting(n.id) });
        if (window.UnwipSheets && root.kind !== 'manuscript' && root.kind !== 'trash') items.push({ label: 'Turn lists in here into sheets…', action: () => { const ids = []; walkTree(n.children || [], c => { if (c.type === 'doc' && !c.map) ids.push(c.id); }); window.UnwipSheets.convert(ids); } });
      }
      if (!n.root) {
        items.push({ label: 'New document below', action: () => addNode('doc', n.id, false) });
        items.push({ label: 'New folder below', action: () => addNode('folder', n.id, false) });
      }
    }
    if ('conflictOf' in n && window.UnwipSync) {
      const R = window.UnwipSync.resolveConflict;
      if (n.conflictOf) items.push({ label: 'Compare side by side', action: () => { openDoc(n.id); R(n.id, 'compare'); } }, { label: 'Use this version', action: () => R(n.id, 'use') });
      items.push({ label: 'Keep both', action: () => R(n.id, 'both') }, { label: 'Not needed (to Trash)', action: () => R(n.id, 'drop') }, { sep: true });
    }
    if (n.root && n.kind !== 'trash' && n.kind !== 'conflicts') items.push({ sep: true }, { label: 'Rename section', hint: 'Double-click', action: () => startRename($(`.tree-row[data-id="${n.id}"]`), n) });
    if (!n.root) {
      items.push({ sep: true });
      items.push({ label: n.fav ? '☆ Remove from favourites' : '★ Add to favourites', hint: 'Ctrl+D', action: () => toggleFav(n.id) });
      items.push({ label: 'Change icon…', action: () => iconPicker(n.id) });
      if (root.kind === 'manuscript') {
        const all = [n]; if (n.type === 'folder') walkTree(n.children || [], c => all.push(c));
        const out = all.some(c => c.noBook);
        items.push({ label: out ? 'Put back in the book' : n.type === 'folder' ? 'Leave out of the book (with everything in it)' : 'Leave out of the book', action: () => {
          for (const c of all) { if (out) delete c.noBook; else c.noBook = true; }
          scheduleMeta(); renderBinder();
          toast(out ? `“${esc(n.title)}” is back in the book.` : `“${esc(n.title)}” stays here but is left out of the preview and exports. Right-click it again to put it back.`);
        } });
      }
      items.push({ label: 'Rename', hint: matchMedia('(pointer: coarse)').matches ? '' : 'Double-click', action: () => startRename($(`.tree-row[data-id="${n.id}"]`), n) });
      if (n.type === 'doc') items.push({ label: 'Copy for Docs', action: () => copyDocForDocs(n.id) });
      if (n.type === 'doc' && window.UnwipRR) items.push({ label: 'Copy for Royal Road…', action: () => window.UnwipRR.open(n.id) });
      if (n.type === 'doc' && !n.map && window.UnwipSeries && ['characters', 'places', 'items'].concat(S.project.binder.filter(r => r.custom).map(r => r.kind)).includes(root.kind)) {
        if (n.series && S.project.series) items.push({ label: 'Stop sharing with the series…', action: async () => { if (await confirmBox('Stop sharing?', `“${esc(n.title)}” stays in every book, but the copies stop updating each other.`, 'Stop sharing')) window.UnwipSeries.unshare(n); } });
        else items.push({ label: 'Share with the series…', action: async () => { if (!S.project.series) return window.UnwipSeries.open(); await flushSave(); await window.UnwipSeries.share([n]); toast(`“${esc(n.title)}” is shared with the series “${esc(S.project.series)}”.`); } });
      }
      if (n.type === 'doc') items.push({ label: 'Snapshots…', action: async () => { await openDoc(n.id); snapshotsDialog(); } });
      if (window.UnwipFog && root.kind === 'manuscript' && level() === 0) items.push(...window.UnwipFog.menuItems(n));
      if (n.type === 'doc' && !n.map && window.UnwipSheets && root.kind !== 'manuscript' && root.kind !== 'trash') items.push({ label: 'Turn into separate sheets…', action: () => window.UnwipSheets.convert([n.id]) });
      if (n.type === 'doc' || n.type === 'folder') items.push({ label: 'Remove empty lines…', action: () => tidyBlankLines(n.id) });
      if (window.UnwipPageLinks && window.UnwipPageLinks.isPage(n.id) && level() >= 1) items.push({ label: 'Maps and pictures…', action: () => window.UnwipPageLinks.link(n.id) });
      if (n.type === 'doc' && n.id !== S.docId && !document.documentElement.classList.contains('m-phone')) items.push({ label: 'Open in split view', action: () => { if (S.view !== 'write') setView('write'); openSplit(n.id); } });
      if (n.type === 'doc' && !n.map && api.popoutOpen) items.push({ label: S.popped && S.popped.has(n.id) ? 'Show its window' : 'Open in a new window', action: () => popOut(n.id) });
      { const fn = findNode(n.id); const nx = fn.list[fn.index + 1];
        if (n.type === 'doc' && nx && nx.type === 'doc' && !nx.root) items.push({ label: `Merge with next (“${nx.title.length > 24 ? nx.title.slice(0, 24) + '…' : nx.title}”)…`, action: () => mergeWithNext(n.id) });
        if (n.type === 'folder') items.push({ label: 'Merge folder into one document…', action: () => mergeFolder(n.id) }); }
      if (n.type === 'doc' && level() >= 1) items.push({ label: 'Status', disabled: true }, ...statusOptions().map(([v, l]) => ({ label: (n.status || '') === v ? `✓ ${l}` : `    ${l}`, action: () => { n.status = v; scheduleMeta(); renderBinder(); refreshPlanView(); } })), { label: '    Edit status labels…', action: editStatuses });
      items.push({ sep: true });
      // in the Trash: Put back goes to where it was deleted from (beta, 20 Oct: Move out of folder was greyed out there,
      // and the only way out was finding a folder in Move to…)
      if (root.kind === 'trash' && f.parent && f.parent.root) {
        const from = n.trashedFrom && n.trashedFrom.parent && findNode(n.trashedFrom.parent), ok = from && rootOf(from.node.id) && rootOf(from.node.id).kind !== 'trash';
        items.push({ label: ok ? `Put back in “${from.node.title}”` : 'Put back…', action: () => {
          if (!ok) return moveToDialog(n.id);
          moveNodeTo(n.id, from.node.id, n.trashedFrom.index); toast(`“${esc(n.title)}” is back in ${esc(from.node.title)}.`);
        } });
      }
      items.push({ label: 'Move to…', action: () => moveToDialog(n.id) });
      items.push({ label: 'Move up', hint: 'Alt+↑', disabled: f.index === 0, action: () => moveBy(n.id, -1) });
      items.push({ label: 'Move down', hint: 'Alt+↓', disabled: f.index === f.list.length - 1, action: () => moveBy(n.id, 1) });
      items.push({ label: 'Move out of folder', hint: 'Alt+←', disabled: !f.parent || f.parent.root, action: () => moveOut(n.id) });
      items.push({ sep: true });
      if (root.kind === 'trash') items.push({ label: 'Delete forever…', danger: true, action: () => deleteForever(n.id) });
      else items.push({ label: 'Move to Trash', danger: true, action: () => moveToTrash(n.id) });
    }
    if (n.type === 'folder' && !n.root && root.kind === 'manuscript') {
      const h = folderHolds(n), auto = !n.holds;
      items.push({ sep: true }, { label: 'Documents inside are…', disabled: true },
        { label: `${h === 'chapters' ? '✓' : '   '} Chapters (each gets a title)${auto && h === 'chapters' ? ' · auto' : ''}`, action: () => { n.holds = 'chapters'; scheduleMeta(); toast(`Documents in “${esc(n.title)}” will export as chapters, each with its own title.`); } },
        { label: `${h === 'scenes' ? '✓' : '   '} Scenes (joined with * * *)${auto && h === 'scenes' ? ' · auto' : ''}`, action: () => { n.holds = 'scenes'; scheduleMeta(); toast(`Documents in “${esc(n.title)}” will export as scenes of one chapter called “${esc(n.title)}”.`); } });
    }
    if (n.type === 'folder' && root.kind !== 'trash') items.push({ sep: true }, { label: '🗺️ New map here…', action: () => window.UnwipMaps && window.UnwipMaps.create(n.id) }, ...(window.UnwipBookImport ? window.UnwipBookImport.menuItems({ parentId: n.id }).map(x => ({ ...x, label: x.label.replace(/^Word, Google Docs, LibreOffice, text files…/, 'Import files here…').replace(/^A folder of chapter files…/, 'Import a folder of chapters here…').replace(/^Paste a whole book.*/, 'Paste chapters here…') })) : [{ label: 'Import Word file here…', action: () => importDocxInto(n.id) }]));
    if (n.kind === 'manuscript') items.push({ sep: true }, { label: '🔒 Protected: this is what gets exported', disabled: true });
    if (n.root) {
      if (window.UnwipSeries && n.kind !== 'manuscript' && n.kind !== 'trash') items.push({ sep: true }, { label: 'Series bible (share with other books)…', action: () => window.UnwipSeries.open() });
      items.push({ sep: true }, { label: 'Change icon…', action: () => iconPicker(n.id) }, { label: 'New template section (Factions, Magic, Creatures…)…', action: () => templateGallery() });
      if (SHEETS[n.kind]) items.push({ label: 'Edit the sheet (fields and headings)…', action: () => editSheet(n) });
      if (n.custom) items.push({ label: 'Edit this section…', action: () => editSection(n) }, { label: 'Save as one of my templates…', action: () => editSection(n, true) }, { label: 'Remove this section…', danger: true, action: () => deleteSection(n) });
    }
    if (n.kind === 'trash') items.push({ label: 'Empty Trash…', danger: true, disabled: !(n.children || []).length, action: emptyTrash });
    showMenu(e.clientX, e.clientY, items);
  });

  function startRename(row, n) {
    if (S.renaming && S.renaming.isConnected) return;   // already renaming (the click and the dblclick both ask)
    // the binder may have been redrawn since the first click of a double-click (opening the document does that)
    row = $(`.tree-row[data-id="${n.id}"]`) || row;
    const titleEl = row && $('.tr-title', row); if (!titleEl) return;
    const input = document.createElement('input');
    input.className = 'rename'; input.value = n.title;
    titleEl.replaceWith(input);
    S.renaming = input;
    input.focus(); input.select();
    input.addEventListener('mousedown', e => e.stopPropagation()); input.addEventListener('click', e => e.stopPropagation()); input.addEventListener('dblclick', e => e.stopPropagation());
    let finished = false;
    const done = commit => {
      if (finished) return; finished = true;
      S.renaming = null; S.binderPending = false;
      if (commit && input.value.trim()) {
        n.title = input.value.trim();
        if (n.id === S.docId) $('#doc-title').value = n.title;
        scheduleMeta(); scheduleNames();
      }
      renderBinder(); refreshPlanView();
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); e.stopPropagation(); });
    input.addEventListener('blur', () => done(true));
  }

  // Add a document or folder. By default it goes just below the selected item, at the same level
  // (so a new folder never lands inside another folder unless you ask for "inside").
  async function addNode(type, nearId, inside = false) {
    let target = nearId ? findNode(nearId) : null;
    if (!target) target = findNode(S.selectedId || 'root-manuscript') || findNode('root-manuscript');
    let parent, index;
    if (target.node.root || (inside && target.node.type === 'folder')) { parent = target.node; index = parent.children.length; }
    else { parent = target.parent; index = target.index + 1; }
    const root = rootOf(parent.id) || parent;
    const kind = root.kind === 'trash' ? 'manuscript' : root.kind;
    if (root.kind === 'trash') { parent = findNode('root-manuscript').node; index = parent.children.length; }
    let title;
    if (type === 'folder') title = kind === 'manuscript' ? 'New part' : 'New folder';
    else if (kind === 'manuscript') { let c = 0; walkTree(findNode('root-manuscript').node.children, n => { if (n.type === 'doc') c++; }); title = 'Chapter ' + (c + 1); }
    else title = newTitleFor(root);
    const node = type === 'folder' ? { id: uid(), type: 'folder', title, open: true, children: [] } : { id: uid(), type: 'doc', title, words: 0 };
    parent.children.splice(index, 0, node);
    parent.open = true;
    if (type === 'doc' && sheetFor(root)) await api.saveDoc(S.slug, node.id, sheetTemplate(root));
    scheduleMeta();
    if (type === 'doc') await openDoc(node.id, { from: 'new' }); else { S.selectedId = node.id; }
    renderBinder();
    const row = $(`.tree-row[data-id="${node.id}"]`);
    if (row) { row.scrollIntoView({ block: 'nearest' }); startRename(row, node); }
  }
  function sheetFor(root) {
    if (!root) return null;
    if (SHEETS[root.kind]) return { fields: root.fields || SHEETS[root.kind], sections: root.sections || SHEET_SECTIONS[root.kind] };   // Characters, Places and Items can have their sheet changed too
    if (root.custom) return { fields: root.fields || ['Name', 'Aliases'], sections: root.sections || ['Description', 'Notes'] };
    return null;
  }
  function newTitleFor(root) { return NEW_TITLE[root.kind] || (root.custom ? 'New ' + (root.singular || 'entry').toLowerCase() : 'Untitled'); }
  function sheetTemplate(root) {
    const sh = sheetFor(root);
    return sh.fields.map(f => `<p><b>${esc(f)}:</b> </p>`).join('') + sh.sections.map(x => `<h2>${esc(x)}</h2><p><br></p>`).join('');
  }

  // ---- split & merge
  async function splitAtCursor() {
    if (!S.docId) return;
    const sel = getSelection();
    if (!sel.rangeCount || !editor.contains(sel.anchorNode)) { toast('Click where you want to split first.'); return; }
    const f = findNode(S.docId);
    await flushSave();
    const before = editor.innerHTML;
    const r = sel.getRangeAt(0).cloneRange(); r.collapse(true);
    r.setEnd(editor, editor.childNodes.length);
    const frag = r.extractContents();
    const box = document.createElement('div'); box.appendChild(frag);
    // drop empty paragraphs at the split point
    while (box.firstElementChild && !box.firstElementChild.textContent.trim() && box.children.length > 1) box.firstElementChild.remove();
    while (editor.lastElementChild && !editor.lastElementChild.textContent.trim() && editor.children.length > 1) editor.lastElementChild.remove();
    if (!box.textContent.trim()) { editor.innerHTML = before; toast('Nothing after the cursor to split off.'); return; }
    ensureParagraphs();
    // name the new part: use its first line if it looks like a heading
    let title = `${f.node.title} (part 2)`;
    const first = box.firstElementChild;
    if (first && (/^H[1-3]$/.test(first.tagName) || /^(chapter|scene|part|prologue|epilogue)\b/i.test(first.textContent.trim())) && first.textContent.trim().length < 80) { title = first.textContent.trim(); first.remove(); }
    await api.snapSave(S.slug, S.docId, before, 'Before splitting', true);
    const node = { id: uid(), type: 'doc', title, words: countWords(box.innerText || box.textContent), status: f.node.status };
    await api.saveDoc(S.slug, node.id, box.innerHTML || '<p><br></p>');
    f.list.splice(f.index + 1, 0, node);
    S.dirty = true; await flushSave(); resyncWords();
    scheduleMeta(); renderBinder(); updateStatus();
    toastAction(`Split off “${esc(title)}”.`, 'Open it', () => openDoc(node.id), 8000);
  }
  async function mergeWithNext(id) {
    const f = findNode(id); const next = f.list[f.index + 1];
    if (!next || next.type !== 'doc') return;
    const sep = await modal({ title: 'Merge documents', body: `<p>Join “${esc(next.title)}” onto the end of “${esc(f.node.title)}”? The second document goes to the Trash afterwards.</p>`,
      buttons: [{ label: 'Cancel', value: null, kind: 'ghost' }, { label: 'Join directly', value: 'none' }, { label: 'Join with a scene break', value: 'scene', kind: 'primary' }] });
    if (!sep) return;
    await flushSave();
    const a = id === S.docId ? editor.innerHTML : await api.loadDoc(S.slug, id);
    const b = await api.loadDoc(S.slug, next.id);
    await api.snapSave(S.slug, id, a, `Before merging in “${next.title}”`, true);
    const merged = a + (sep === 'scene' ? '<p class="scene" style="text-align: center">* * *</p>' : '') + b;
    await api.saveDoc(S.slug, id, merged);
    f.node.words = countWords(htmlText(merged));
    f.list.splice(f.index + 1, 1); findNode('root-trash').node.children.push(next);
    if (S.docId === id) { editor.innerHTML = merged; resyncWords(); markScenes(editor); }
    if (S.docId === next.id) await openDoc(id);
    scheduleMeta(); renderBinder(); updateStatus();
    toast(`Merged. “${esc(next.title)}” is in the Trash if you need it.`);
  }
  // remove empty paragraphs used as spacing in a document or every document in a folder (a snapshot is kept first)
  async function tidyBlankLines(id) {
    const f = findNode(id); const docs = [];
    if (f.node.type === 'doc') docs.push(f.node); else walkTree(f.node.children || [], n => { if (n.type === 'doc') docs.push(n); });
    await flushSave();
    const plan = [];
    for (const d of docs) {
      const before = d.id === S.docId ? editor.innerHTML : await api.loadDoc(S.slug, d.id);
      const r = Clip.dropBlankLines(before);
      if (r.removed) plan.push({ d, before, ...r });
    }
    if (!plan.length) { toast('No empty lines to remove here.'); return; }
    const lines = plan.reduce((a, x) => a + x.removed, 0), scenes = plan.reduce((a, x) => a + x.scenes, 0);
    const msg = `Removes <b>${fmt(lines)}</b> empty line${lines === 1 ? '' : 's'} from ${plan.length} document${plan.length === 1 ? '' : 's'}, so the gaps between paragraphs come only from Manuscript style.` +
      (scenes ? ` Where there were two or more empty lines in a row (${scenes} place${scenes === 1 ? '' : 's'}), a scene break (* * *) is put in instead.` : '') + ' A snapshot of each document is saved first, so you can go back.';
    if (!(await confirmBox('Remove empty lines?', msg, 'Remove them'))) return;
    for (const x of plan) {
      await api.snapSave(S.slug, x.d.id, x.before, 'Before removing empty lines', true);
      await api.saveDoc(S.slug, x.d.id, x.html);
      x.d.words = countWords(htmlText(x.html));
      if (x.d.id === S.docId) { editor.innerHTML = x.html; markScenes(editor); resyncWords(); }
    }
    scheduleMeta(); renderBinder(); updateStatus();
    const undoTidy = async () => {
      await flushSave();
      for (const x of plan) {
        await api.saveDoc(S.slug, x.d.id, x.before);
        x.d.words = countWords(htmlText(x.before));
        if (x.d.id === S.docId) { editor.innerHTML = x.before; markScenes(editor); resyncWords(); }
      }
      S.appUndo = null; scheduleMeta(); renderBinder(); updateStatus(); toast('Empty lines put back.');
    };
    // Ctrl+Z straight afterwards undoes it too (until you type in that document)
    const open = plan.find(x => x.d.id === S.docId);
    S.appUndo = open ? { docId: S.docId, html: editor.innerHTML, run: undoTidy } : null;
    toastAction(`Removed ${fmt(lines)} empty line${lines === 1 ? '' : 's'}${scenes ? ` and added ${scenes} scene break${scenes === 1 ? '' : 's'}` : ''}.`, 'Undo', undoTidy, 15000);
  }

  async function mergeFolder(id) {
    const f = findNode(id); const docs = [];
    walkTree(f.node.children || [], n => { if (n.type === 'doc') docs.push(n); });
    if (docs.length < 1) { toast('This folder has no documents to merge.'); return; }
    if (!(await confirmBox('Merge folder into one document?', `The ${docs.length} documents in “${esc(f.node.title)}” become one document, separated by scene breaks. The folder and its documents go to the Trash, so nothing is lost.`, 'Merge'))) return;
    await flushSave();
    const parts = [];
    for (const d of docs) parts.push(d.id === S.docId ? editor.innerHTML : await api.loadDoc(S.slug, d.id));
    const merged = parts.join('<p class="scene" style="text-align: center">* * *</p>');
    const node = { id: uid(), type: 'doc', title: f.node.title, words: countWords(htmlText(merged)), synopsis: f.node.synopsis, status: f.node.status };
    await api.saveDoc(S.slug, node.id, merged);
    f.list.splice(f.index, 1, node); findNode('root-trash').node.children.push(f.node);
    scheduleMeta(); await openDoc(node.id, { from: 'new' }); renderBinder(); updateStatus();
    toast(`Merged ${docs.length} documents into “${esc(node.title)}”.`);
  }

  // ---- template sections: a binder section where every new entry starts from the same sheet
  const TEMPLATES = [
    ['🛡️', 'Factions', 'Faction', ['Name', 'Aliases', 'Leader', 'Base', 'Size'], ['Goals', 'Beliefs', 'Allies & enemies', 'History', 'Notes']],
    ['📜', 'Magic systems', 'Magic system', ['Name', 'Aliases', 'Source', 'Cost'], ['Rules', 'Limits', 'Who can use it', 'Examples in the story', 'Notes']],
    ['🐉', 'Creatures', 'Creature', ['Name', 'Aliases', 'Habitat', 'Size', 'Danger'], ['Appearance', 'Behaviour', 'Abilities', 'Weaknesses', 'Notes']],
    ['👹', 'Monsters', 'Monster', ['Name', 'Aliases', 'Level', 'Area or floor', 'Loot'], ['Appearance', 'Attacks', 'Weaknesses', 'Notes']],
    ['🎲', 'Classes & skills', 'Class or skill', ['Name', 'Aliases', 'Type', 'Rank', 'Main stat'], ['What it does', 'How it levels up', 'Strengths', 'Weaknesses', 'Notes']],
    ['🔮', 'Spells & abilities', 'Spell', ['Name', 'Aliases', 'School', 'Cost', 'Range'], ['Effect', 'Requirements', 'Who knows it', 'Notes']],
    ['⛩️', 'Religions & gods', 'Deity', ['Name', 'Aliases', 'Domain', 'Symbol', 'Followers'], ['Beliefs', 'Rituals', 'Myths', 'Notes']],
    ['🏺', 'Cultures', 'Culture', ['Name', 'Aliases', 'Region', 'Language'], ['Customs', 'Food & dress', 'Values', 'Notes']],
    ['🗣️', 'Languages', 'Language', ['Name', 'Aliases', 'Spoken in', 'Script'], ['Sounds', 'Common words', 'Phrases', 'Notes']],
    ['📜', 'Historical events', 'Event', ['Name', 'Aliases', 'Date', 'Place'], ['What happened', 'Who was involved', 'Consequences', 'Notes']],
    ['🗺️', 'Quests & plot threads', 'Quest', ['Name', 'Aliases', 'Given by', 'Reward', 'Status'], ['Goal', 'Steps', 'Outcome', 'Notes']],
    ['🚢', 'Ships & vehicles', 'Ship', ['Name', 'Aliases', 'Type', 'Captain', 'Crew'], ['Description', 'History', 'Notes']],
    ['🪐', 'Worlds & planets', 'World', ['Name', 'Aliases', 'System', 'Climate', 'Population'], ['Geography', 'Cultures', 'History', 'Notes']]
  ];
  // a small picture of what one entry's sheet will look like
  function sheetPreviewHTML(icon, singular, fields, sections) {
    return `<div class="sp-sheet"><div class="sp-h">${icon ? `<span class="sp-ic">${iconMarkup(icon)}</span>` : ''}New ${esc(singular.toLowerCase())}</div>
      ${fields.map(f => `<div class="sp-f"><b>${esc(f)}:</b><i></i></div>`).join('')}
      ${sections.map(x => `<div class="sp-s">${esc(x)}</div><div class="sp-l"></div>`).join('')}</div>`;
  }
  async function templateGallery() {
    let pick = 0;
    const body = document.createElement('div'); body.className = 'tg';
    const mine = (S.settings.myTemplates || []).map(t => [t.icon || '🗂️', t.title, t.singular, t.fields, t.sections, t.id]);
    const list = [...mine, ...TEMPLATES, ['✏️', 'Make your own…', 'Entry', ['Name', 'Aliases'], ['Description', 'Notes']]];
    const taken = new Set(S.project.binder.filter(n => n.root).map(n => (n.title || '').toLowerCase()));
    body.innerHTML = `<p class="hint">A template section sits in your binder like Characters or Places. Every new entry in it starts from the same sheet, so you fill in the blanks instead of starting from nothing.</p>
      <div class="tg-cols"><div class="tg-list">${list.map(([ic, t, , , , mid], i) => `${i === 0 && mine.length ? '<div class="tg-group">Your templates</div>' : ''}${i === mine.length && mine.length ? '<div class="tg-group">Ready-made</div>' : ''}<button class="tg-item ${i === 0 ? 'on' : ''}" data-i="${i}"${taken.has(t.toLowerCase()) ? ' data-tip="You already have this section"' : ''}><span class="tg-ic">${iconMarkup(ic)}</span><span class="tg-t">${esc(t)}${taken.has(t.toLowerCase()) ? ' <small>✓</small>' : ''}</span>${mid ? `<span class="tg-del" data-del="${esc(mid)}" title="Delete this template (sections already in your binder stay)">✕</span>` : ''}</button>`).join('')}</div>
      <div class="tg-prev" id="tg-prev"></div></div>`;
    const show = i => { pick = i; const [ic, , sg, f, sc] = list[i]; $('#tg-prev', body).innerHTML = `<div class="tg-cap">Each new entry looks like this:</div>` + sheetPreviewHTML(ic, sg, f, sc); $$('.tg-item', body).forEach(b => b.classList.toggle('on', +b.dataset.i === i)); };
    show(0);
    // click to choose (hovering doesn't change the choice), double-click to add it straight away
    $$('.tg-item', body).forEach(b => { b.onclick = () => show(+b.dataset.i); b.ondblclick = () => $('.modal-back .m-foot .primary').click(); });
    $$('.tg-del', body).forEach(x => x.onclick = async e => {
      e.stopPropagation();
      const t = (S.settings.myTemplates || []).find(y => y.id === x.dataset.del); if (!t) return;
      S.settings = await api.setSettings({ myTemplates: (S.settings.myTemplates || []).filter(y => y.id !== t.id) });
      const b = x.closest('.tg-item'); b.remove(); toast(`Deleted the “${esc(t.title)}” template.`);
    });
    const ok = await modal({ title: 'New template section', body, wide: true, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Change it first…', value: 'edit', kind: 'ghost' }, { label: 'Add to binder', value: true, kind: 'primary' }] });
    if (!ok) return;
    const [ic, title, singular, fields, sections] = list[pick];
    const custom = pick === list.length - 1;
    let r = { title: custom ? '' : title, singular, fields, sections, icon: custom ? '' : ic };
    if (ok === 'edit' || custom) { r = await sectionDialog(custom ? null : r, { offerSave: true }); if (!r) return; }
    const k = 'custom-' + uid();
    const node = { id: 'root-' + k, type: 'folder', kind: k, root: true, custom: true, open: true, children: [], ...r };
    if (!node.icon) delete node.icon;
    S.project.binder.splice(S.project.binder.findIndex(x => x.kind === 'trash'), 0, node);
    scheduleMeta(); renderBinder(); scheduleNames();
    toast(`Added “${esc(r.title)}”. Use + New › New ${esc((r.singular || 'entry').toLowerCase())} or hover it and click + to add one.`, '', 6000);
  }
  // ---- the + New menu at the bottom of the binder, with a preview of each choice
  function newMenu(anchor) {
    document.querySelectorAll('.new-pop').forEach(x => x.remove());
    const t = addTarget();
    const where = t ? `in “${t.title}”` : 'at the bottom of the binder';
    const root = t ? rootOf(t.id) : null;
    const sheet = root && sheetFor(root);
    const items = [
      { ic: '📄', label: sheet ? `New ${newTitleFor(root).replace(/^New /i, '').toLowerCase()}` : 'New document', sub: sheet ? `A fresh sheet ${where}` : `A blank page ${where}`, key: 'Ctrl+N',
        prev: sheet ? sheetPreviewHTML(root.icon && !/^[a-z]+$/i.test(root.icon) ? root.icon : '', newTitleFor(root).replace(/^New /i, ''), sheet.fields, sheet.sections) : '<div class="np-page"><i></i><i></i><i></i><i class="s"></i><i></i><i></i><i class="s"></i></div>', run: () => addHere('doc') },
      { ic: '📁', label: 'New folder', sub: `To group chapters or notes, ${where}`, prev: '<div class="np-tree"><div>📁 Part One</div><div class="in">📄 Chapter 1</div><div class="in">📄 Chapter 2</div><div>📁 Part Two</div></div>', run: () => addHere('folder') },
      { ic: '🗺️', label: 'New map', sub: 'A map kept in this book. For one map several books share, make it in Build', prev: '<svg viewBox="0 0 120 80" class="np-map"><rect width="120" height="80" fill="#d8c59c"/><path d="M22 40 C20 18 52 12 64 22 C80 8 104 22 96 42 C108 58 82 72 62 62 C44 74 18 64 22 40Z" fill="#f1e5c9" stroke="#4e3b26" stroke-width="1.6"/><path d="M40 34 l6 -9 l6 9z M52 38 l6 -10 l6 10z" fill="#b59a72" stroke="#3a2a19" stroke-width="1"/><circle cx="74" cy="44" r="2.6" fill="#c0492b"/><rect x="3" y="3" width="114" height="74" fill="none" stroke="#3a2a19" stroke-width="1.4"/></svg>', run: () => $('#btn-add-map').click() },
      { ic: '🗂️', label: 'New template section…', sub: 'Factions, magic, creatures, monsters, quests… every entry starts from the same sheet', prev: sheetPreviewHTML('🛡️', 'Faction', TEMPLATES[0][3], TEMPLATES[0][4]), run: () => templateGallery() },
      { ic: '📥', label: 'Bring in chapters…', sub: 'From Word, Google Docs, text or a whole folder', prev: '<div class="np-tree"><div>📄 Chapter 1.docx</div><div>📄 Chapter 2.docx</div><div>📄 Chapter 3.docx</div><div style="margin-top:6px;color:var(--accent)">→ 3 chapters</div></div>', run: () => { if (window.UnwipBookImport) { const r = anchor.getBoundingClientRect(); showMenu(r.left, r.top - 120, window.UnwipBookImport.menuItems({ parentId: t ? t.id : 'root-manuscript' })); } } }
    ];
    const pop = document.createElement('div'); pop.className = 'new-pop';
    pop.innerHTML = `<div class="np-list">${items.map((x, i) => `<button class="np-item" data-i="${i}"><span class="np-ic">${x.ic}</span><span class="np-t"><b>${esc(x.label)}</b><small>${esc(x.sub)}</small></span>${x.key ? `<kbd>${x.key}</kbd>` : ''}</button>`).join('')}</div><div class="np-prev" id="np-prev"></div>`;
    document.body.appendChild(pop);
    const prev = i => { $('#np-prev', pop).innerHTML = items[i].prev; $$('.np-item', pop).forEach(b => b.classList.toggle('on', +b.dataset.i === i)); };
    prev(0);
    $$('.np-item', pop).forEach(b => { b.onmouseenter = () => prev(+b.dataset.i); b.onclick = () => { pop.remove(); items[+b.dataset.i].run(); }; });
    const r = anchor.getBoundingClientRect();
    pop.style.left = Math.max(8, r.left) + 'px'; pop.style.bottom = (innerHeight - r.top + 8) + 'px';
    setTimeout(() => document.addEventListener('mousedown', function off(e) { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('mousedown', off); } }), 0);
  }

  // ---- your own sections (Factions, Magic, Creatures…)
  async function sectionDialog(existing, opts = {}) {
    const body = document.createElement('div');
    const f = existing || { title: '', singular: '', fields: ['Name', 'Aliases'], sections: ['Description', 'Notes'] };
    let icon = f.icon || '';
    const isMine = !!(S.settings.myTemplates || []).find(t => t.title.toLowerCase() === (f.title || '').toLowerCase());
    body.className = 'cs-dlg' + (opts.sheetOnly ? ' sheet-only' : '');
    body.innerHTML = `<p>${opts.sheetOnly ? `Change what every new entry in “${esc(f.title)}” starts with: add fields like Class or Role, or headings like Goals. Your existing entries can get the new ones too (you’ll be asked next).` : 'Make a section for anything your story needs: factions, magic systems, creatures, ships, gods… Each new entry starts from the sheet you set up here.'}</p>
      <div class="cs-cols"><div class="form-grid">
        <div class="field full cs-name"><label>Section name</label><div class="cs-row"><button type="button" class="cs-icon" id="cs-icon" title="Choose an icon">${iconMarkup(icon) || '🗂️'}</button><input type="text" id="cs-title" value="${esc(f.title)}" placeholder="e.g. Factions"></div></div>
        <div class="field cs-single-f"><label>One entry is called a…</label><input type="text" id="cs-single" value="${esc(f.singular || '')}" placeholder="e.g. Faction"></div>
        ${opts.presets ? `<div class="field full"><label>Start from</label><div class="chip-row cs-presets">${Object.keys(opts.presets).map(k => `<button type="button" class="chip" data-preset="${esc(k)}">${esc(k)}</button>`).join('')}</div></div>` : ''}
        <div class="field full"><label>Fields at the top of each sheet (comma separated). Keep “Name” and “Aliases” for name suggestions.</label><input type="text" id="cs-fields" value="${esc(f.fields.join(', '))}"></div>
        <div class="field full"><label>Headings below (comma separated)</label><input type="text" id="cs-sections" value="${esc(f.sections.join(', '))}"></div>
        ${(opts.offerSave || opts.forceSave) && !opts.sheetOnly ? `<label class="check full"><input type="checkbox" id="cs-save" ${!existing || isMine || opts.forceSave ? 'checked' : ''}> Save as one of my templates, so I can add it to other projects from + New</label>` : ''}
      </div><div class="cs-prev"><div class="tg-cap">Each new entry looks like this:</div><div id="cs-sheet"></div></div></div>`;
    const list = id => $('#' + id, body).value.split(',').map(x => x.trim()).filter(Boolean);
    const read = () => { const title = $('#cs-title', body).value.trim(); return { title, singular: $('#cs-single', body).value.trim() || title.replace(/s$/i, '') || 'Entry', fields: list('cs-fields'), sections: list('cs-sections'), icon }; };
    const redraw = () => { const r = read(); $('#cs-sheet', body).innerHTML = sheetPreviewHTML(icon || '🗂️', r.singular, r.fields, r.sections); };
    body.addEventListener('input', redraw); redraw();
    $$('[data-preset]', body).forEach(b => b.onclick = () => { const pr = opts.presets[b.dataset.preset]; $('#cs-fields', body).value = pr[0].join(', '); $('#cs-sections', body).value = pr[1].join(', '); $$('[data-preset]', body).forEach(x => x.classList.toggle('on', x === b)); redraw(); });
    $('#cs-icon', body).onclick = async () => { const r = await pickIcon(icon, read().title || 'this section'); if (!r) return; icon = r.icon; $('#cs-icon', body).innerHTML = iconMarkup(icon) || '🗂️'; redraw(); };
    const ok = await modal({ title: opts.sheetOnly ? `The sheet for “${existing.title}”` : existing && existing.id ? `Edit “${existing.title}”` : existing ? `Set up “${existing.title}”` : 'New template section', body, wide: true,
      buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, ...(opts.resetTo ? [{ label: 'Back to the standard sheet', value: 'reset', kind: 'ghost' }] : []), { label: existing && existing.id ? 'Save' : 'Create section', value: true, kind: 'primary' }] });
    if (!ok) return null;
    if (ok === 'reset') return { ...opts.resetTo, reset: true };
    const r = read();
    if (!r.title) return null;
    if (!r.icon) delete r.icon;
    if ($('#cs-save', body) && $('#cs-save', body).checked) {
      const mineList = (S.settings.myTemplates || []).filter(t => t.title.toLowerCase() !== r.title.toLowerCase());
      mineList.unshift({ id: uid(), title: r.title, singular: r.singular, fields: r.fields, sections: r.sections, icon: r.icon || '' });
      S.settings = await api.setSettings({ myTemplates: mineList });
      toast(`Saved “${esc(r.title)}” to your templates. It’s in + New › New template section in every book.`, '', 5000);
    }
    return r;
  }
  async function editSection(n, forceSave) {
    const was = sheetFor(n);
    const r = await sectionDialog(n, { offerSave: true, forceSave }); if (!r) return;
    Object.assign(n, r); if (!r.icon) delete n.icon;
    scheduleMeta(); renderBinder(); scheduleNames();
    await offerSheetUpdate(n, was);
  }
  // a button on every character, place and item sheet, so changing its fields is easy to find (not only by
  // right-clicking the folder)
  { const b = $('#btn-sheet');
    const upd = () => { const r = S.project && S.docId && rootOf(S.docId); const on = !!(r && SHEETS[r.kind] && r.id !== S.docId); b.classList.toggle('hidden', !on); const nb = $('#btn-names'); if (nb) nb.classList.toggle('hidden', !(on && r.kind === 'characters')); if (on) b.textContent = `Edit ${({ characters: 'character', places: 'place', items: 'item' })[r.kind] || 'sheet'} fields…`; };
    b.onclick = () => { const r = S.docId && rootOf(S.docId); if (r) editSheet(r); };
    on('doc', () => setTimeout(upd, 0)); on('project', () => setTimeout(upd, 0)); }
  // starting points for different kinds of story (the writer can change any of it)
  const SHEET_PRESETS = {
    characters: {
      'Standard': [SHEETS.characters, SHEET_SECTIONS.characters],
      'Fantasy': [['Full name', 'Aliases', 'Role', 'Age', 'Race or people', 'Homeland', 'Calling'], ['Appearance', 'Personality', 'Abilities', 'Backstory', 'Allegiances', 'Notes']],
      'Sci-fi': [['Full name', 'Aliases', 'Role', 'Age', 'Species', 'Homeworld', 'Rank or job'], ['Appearance', 'Personality', 'Augments and tech', 'Backstory', 'Ship or crew', 'Notes']],
      'LitRPG': [['Full name', 'Aliases', 'Player handle', 'Class', 'Level', 'Race'], ['Appearance', 'Stats', 'Skills', 'Equipment', 'Personality', 'Backstory', 'Notes']],
      'Contemporary': [['Full name', 'Aliases', 'Role', 'Age', 'Job', 'Lives in'], ['Appearance', 'Personality', 'Family and friends', 'Backstory', 'What they want', 'Notes']]
    },
    places: {
      'Standard': [SHEETS.places, SHEET_SECTIONS.places],
      'Fantasy': [['Name', 'Aliases', 'Region', 'Type', 'Ruled by'], ['Description', 'People', 'History', 'Secrets', 'Notes']],
      'Sci-fi': [['Name', 'Aliases', 'System or sector', 'Type', 'Controlled by'], ['Description', 'Environment', 'Population', 'History', 'Notes']],
      'LitRPG': [['Name', 'Aliases', 'Zone', 'Level range', 'Type'], ['Description', 'Monsters', 'Loot', 'Quests here', 'Notes']]
    },
    items: {
      'Standard': [SHEETS.items, SHEET_SECTIONS.items],
      'LitRPG': [['Name', 'Aliases', 'Type', 'Rarity', 'Owner', 'Requirements'], ['Stats', 'Effects', 'How it was found', 'Notes']],
      'Sci-fi': [['Name', 'Aliases', 'Type', 'Maker', 'Owner'], ['Description', 'What it does', 'Power and limits', 'Notes']]
    }
  };
  // Characters, Places and Items: change the fields and headings their new entries start with
  async function editSheet(n) {
    const was = sheetFor(n), std = { fields: SHEETS[n.kind], sections: SHEET_SECTIONS[n.kind] };
    const custom = !!(n.fields || n.sections);
    const r = await sectionDialog({ title: n.title, singular: (NEW_TITLE[n.kind] || 'entry').replace(/^New /i, ''), fields: was.fields, sections: was.sections, icon: '', id: n.id }, { sheetOnly: true, resetTo: custom ? std : null, presets: SHEET_PRESETS[n.kind] });
    if (!r) return;
    const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
    if (r.reset || (same(r.fields, std.fields) && same(r.sections, std.sections))) { delete n.fields; delete n.sections; }
    else { n.fields = r.fields.length ? r.fields : std.fields; n.sections = r.sections; }
    scheduleMeta(); scheduleNames();
    toast(`New ${esc((NEW_TITLE[n.kind] || 'entries').replace(/^New /i, '').toLowerCase())} sheets in “${esc(n.title)}” will start with the ${r.reset ? 'standard' : 'new'} fields and headings.`, '', 5000);
    await offerSheetUpdate(n, was);
  }
  // after a sheet changes: add the new fields and headings to the entries already there (never removes anything)
  async function offerSheetUpdate(root, was) {
    const now = sheetFor(root); if (!now || !was) return;
    const lc = a => new Set(a.map(x => x.trim().toLowerCase()));
    const oldF = lc(was.fields), oldS = lc(was.sections);
    const addF = now.fields.filter(f => !oldF.has(f.trim().toLowerCase())), addS = now.sections.filter(x => !oldS.has(x.trim().toLowerCase()));
    if (!addF.length && !addS.length) return;
    const docs = []; walkTree(root.children || [], d => { if (d.type === 'doc' && !d.map) docs.push(d); });
    if (!docs.length) return;
    const what = [...addF, ...addS].map(x => `“${esc(x)}”`).join(', ');
    if (!(await confirmBox(`Add to your ${docs.length} existing ${docs.length === 1 ? 'entry' : 'entries'}?`, `Add ${what} to the ${docs.length === 1 ? 'entry' : `${docs.length} entries`} already in “${esc(root.title)}”? Nothing already written is changed or removed; any that already have it are skipped.`, 'Add them'))) return;
    await flushSave();
    let changedN = 0;
    for (const d of docs) {
      const html = d.id === S.docId ? editor.innerHTML : await api.loadDoc(S.slug, d.id).catch(() => null);
      if (html == null) continue;
      const box = document.createElement('div'); box.innerHTML = html;
      const has = new Map(), heads = new Set();
      let lastField = null;
      for (const el of box.children) {
        const m = el.tagName === 'P' && /^\s*([^:\n]{1,40}):/.exec(el.textContent || '');
        const bold = el.tagName === 'P' && el.firstElementChild && /^(B|STRONG)$/.test(el.firstElementChild.tagName);
        if (m && bold) { has.set(m[1].trim().toLowerCase(), el); if (!heads.size) lastField = el; }
        if (/^H[1-6]$/.test(el.tagName)) heads.add((el.textContent || '').trim().toLowerCase());
      }
      let did = false;
      for (const f of addF) {
        if (has.has(f.trim().toLowerCase())) continue;
        const p = document.createElement('p'); p.innerHTML = `<b>${esc(f)}:</b> `;
        // in the sheet's order: after the field that comes before it, when the entry has that one
        const k = now.fields.indexOf(f); let after = null;
        for (let j = k - 1; j >= 0 && !after; j--) after = has.get(now.fields[j].trim().toLowerCase()) || null;
        if (after) after.after(p); else if (k === 0 || !lastField) box.prepend(p); else lastField.after(p);
        has.set(f.trim().toLowerCase(), p); if (!after && lastField && k !== 0) lastField = p;
        did = true;
      }
      for (const x of addS) {
        if (heads.has(x.trim().toLowerCase())) continue;
        box.insertAdjacentHTML('beforeend', `<h2>${esc(x)}</h2><p><br></p>`); did = true;
      }
      if (!did) continue;
      changedN++;
      if (d.id === S.docId) { editor.innerHTML = box.innerHTML; scheduleSave(); }
      else await api.saveDoc(S.slug, d.id, box.innerHTML);
    }
    toast(changedN ? `Added to ${changedN} ${changedN === 1 ? 'entry' : 'entries'}.` : 'They all had them already.');
  }
  async function deleteSection(n) {
    if (!(await confirmBox(`Remove “${esc(n.title)}”?`, (n.children || []).length ? `Its ${n.children.length} item(s) will be moved to the Trash first.` : 'It is empty.', 'Remove section', true))) return;
    findNode('root-trash').node.children.push(...(n.children || []));
    S.project.binder.splice(S.project.binder.indexOf(n), 1);
    if (S.docId && !findNode(S.docId)) { S.docId = null; showEmpty(true); }
    scheduleMeta(); renderBinder(); scheduleNames();
  }
  // "+ Document" / "+ Folder": add at the bottom of the binder (under Trash), then drag it where it belongs
  async function addLoose(type) {
    const node = type === 'folder' ? { id: uid(), type: 'folder', title: 'New folder', open: true, children: [] } : { id: uid(), type: 'doc', title: 'Untitled', words: 0 };
    S.project.binder.push(node);
    scheduleMeta();
    if (type === 'doc') await openDoc(node.id, { from: 'new' }); else S.selectedId = node.id;
    renderBinder();
    const row = $(`.tree-row[data-id="${node.id}"]`);
    if (row) { row.scrollIntoView({ block: 'nearest' }); startRename(row, node); }
  }
  // + Document / + Folder: into the selected folder or section; with nothing (or a document) selected, at the bottom
  function addTarget() {
    const sel = S.selectedId && findNode(S.selectedId);
    if (!sel || sel.node.type !== 'folder') return null;
    const r = rootOf(sel.node.id);
    return r && r.kind === 'trash' ? null : sel.node;
  }
  function addHere(type) { const t = addTarget(); if (t) addNode(type, t.id, true); else addLoose(type); }
  function updateAddHints() {
    const t = addTarget();
    $('#btn-new').title = t ? `New document, folder, map or template, in “${t.title}”` : 'New document, folder, map or template (select a folder first to add it there)';
    $('#binder').classList.toggle('has-target', !!t);
  }
  $('#btn-new').onclick = e => newMenu(e.currentTarget);
  $('#btn-help').onclick = () => window.UnwipHelp && window.UnwipHelp.open();
  $('#btn-add-doc').onclick = () => addHere('doc');
  $('#btn-add-folder').onclick = () => addHere('folder');
  // maps go in the selected folder, or at the bottom of the binder like new documents
  $('#btn-add-map').onclick = () => {
    const sel = S.selectedId && findNode(S.selectedId);
    const target = sel && sel.node.type === 'folder' && rootOf(sel.node.id).kind !== 'trash' ? sel.node.id : null;   // nothing chosen: the bottom, like documents
    if (window.UnwipMaps) window.UnwipMaps.create(target);
  };
  $('#btn-new').addEventListener('mouseenter', updateAddHints);
  // clicking empty space in the binder clears the selection
  $('#binder-tree').addEventListener('mousedown', e => {
    if (e.target.closest('.tree-row')) return;
    S.selectedId = null; renderBinder();
  });

  async function moveToTrash(id) {
    const f = findNode(id); if (!f || f.node.root) return;
    f.node.trashedFrom = { parent: f.parent ? f.parent.id : null, index: f.index };   // for Put back
    f.list.splice(f.index, 1);
    findNode('root-trash').node.children.push(f.node);
    if (id === S.docId || isInside(S.docId, f.node)) { await flushSave(); S.docId = null; showEmpty(true); }
    // select the neighbour so pressing Delete again keeps working down the list
    const next = f.list[f.index] || f.list[f.index - 1];
    S.selectedId = next && !next.root ? next.id : null;
    scheduleMeta(); renderBinder(); updateStatus(); refreshPlanView();
    toastAction(`Moved “${esc(f.node.title)}” to the Trash.`, 'Undo', () => {
      const t = findNode(id); if (!t) return;
      t.list.splice(t.index, 1);
      f.list.splice(Math.min(f.index, f.list.length), 0, t.node);
      S.selectedId = id; scheduleMeta(); renderBinder(); updateStatus(); refreshPlanView();
    }, 8000);
  }
  // Delete key: binder item (or corkboard card) → Trash; already in the Trash → delete forever
  function deleteSelected() {
    const id = S.view === 'cork' && S.ckSelected ? S.ckSelected : S.selectedId;
    const f = id && findNode(id);
    if (!f) return false;
    if (f.node.root) { protectedNote(f.node); return true; }
    if (rootOf(id).kind === 'trash') deleteForever(id); else moveToTrash(id);
    if (S.view === 'cork') S.ckSelected = null;
    return true;
  }
  function protectedNote(n) {
    if (n.kind === 'manuscript') toast('The Manuscript can’t be deleted or moved. Everything in it is what gets exported, so it’s always kept safe.', '', 5200);
    else if (n.kind === 'trash') toast('The Trash is always there. Right-click it to empty it.');
    else if (n.custom) toast(`To remove “${esc(n.title)}”, right-click it and choose “Remove this section…”.`, '', 4500);
    else toast(`“${esc(n.title)}” is a built-in section, so it can’t be deleted. You can collapse it or change its icon.`, '', 4500);
  }
  // ---- moving things around (menu + keyboard; drag and drop is below)
  // Conflicted copies sit in their own section below the Trash, each with a ⚠️. Dragged out of it (anywhere but the
  // Trash) a copy becomes an ordinary document. An empty section isn't shown; it's kept so Undo still has a place.
  function settleConflicts() {
    const B = S.project.binder, c = B.find(r => r.root && r.kind === 'conflicts'); let changed = false;
    if (c) { const t = B.findIndex(r => r.root && r.kind === 'trash'); if (t > B.indexOf(c)) { B.splice(B.indexOf(c), 1); B.splice(t, 0, c); changed = true; } }
    const walk = (list, keep) => { for (const n of list || []) { if ('conflictOf' in n && !keep) { delete n.conflictOf; delete n.conflictFrom; delete n.conflictAt; changed = true; } if (n.children) walk(n.children, keep); } };
    for (const r of B) walk(r.children, r.kind === 'conflicts' || r.kind === 'trash');
    if (changed) scheduleMeta();
  }
  function moveNodeTo(id, parentId, index) {
    const src = findNode(id); if (!src || src.node.root) return;
    const parent = findNode(parentId).node;
    if (parent.id === id || isInside(parentId, src.node)) return;
    if (parent.kind !== 'trash' && (rootOf(parentId) || {}).kind !== 'trash') delete src.node.trashedFrom;
    src.list.splice(src.index, 1);
    if (index == null || index > parent.children.length) index = parent.children.length;
    parent.children.splice(index, 0, src.node);
    parent.open = true;
    S.selectedId = id;
    scheduleMeta(); renderBinder(); updateStatus(); refreshPlanView();
    const row = $(`.tree-row[data-id="${id}"]`); if (row) row.scrollIntoView({ block: 'nearest' });
  }
  function moveBy(id, delta) {
    const f = findNode(id); if (!f || f.node.root) return;
    const to = f.index + delta;
    if (to < 0 || to >= f.list.length || f.list[to].root) return;
    f.list.splice(f.index, 1); f.list.splice(to, 0, f.node);
    S.selectedId = id; scheduleMeta(); renderBinder();
  }
  function moveOut(id) {
    const f = findNode(id); if (!f || !f.parent || f.parent.root) return;
    const p = findNode(f.parent.id);
    moveNodeTo(id, p.parent.id, p.index + 1);
  }
  function moveInto(id) {
    // Alt+→ : put it inside the folder directly above it
    const f = findNode(id); if (!f || f.index === 0) return;
    const above = f.list[f.index - 1];
    if (above.type !== 'folder') return;
    moveNodeTo(id, above.id, null);
  }
  // (many: several ids moved together, in their order, from the binder's Edit mode)
  async function moveToDialog(id, many) {
    const ids = many && many.length ? many : [id], node = findNode(ids[0]).node, moving = ids.map(x => findNode(x)).filter(Boolean).map(f => f.node);
    const body = document.createElement('div');
    body.innerHTML = `<p>Choose where to put ${ids.length > 1 ? 'them' : 'it'}. ${ids.length > 1 ? 'They go' : 'It goes'} to the end of that folder.</p><div class="dest-list"></div>`;
    const list = $('.dest-list', body);
    let chosen = null;
    const add = (n, depth) => {
      if (n.type !== 'folder' || moving.some(m => n.id === m.id || isInside(n.id, m))) return;
      const b = document.createElement('button');
      b.className = 'dest' + (n.root ? ' root' : '');
      b.style.paddingLeft = (12 + depth * 18) + 'px';
      const icon = n.root ? rootIcon(n) : I.folder;
      b.innerHTML = `${icon}<span>${esc(n.title)}</span>`;
      b.onclick = () => { $$('.dest', list).forEach(x => x.classList.remove('on')); b.classList.add('on'); chosen = n.id; };
      b.ondblclick = () => { chosen = n.id; body.closest('.modal-back').querySelector('.btn.primary').click(); };
      list.appendChild(b);
      for (const c of n.children || []) add(c, depth + 1);
    };
    for (const r of S.project.binder) add(r, 0);
    const ok = await modal({ title: ids.length > 1 ? `Move ${ids.length} things` : `Move "${node.title}"`, body, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Move here', value: true, kind: 'primary' }] });
    if (ok && chosen) { for (const x of ids) { if (findNode(chosen).node.kind === 'trash') await moveToTrash(x); else moveNodeTo(x, chosen, null); } return true; }
    return false;
  }
  tree.addEventListener('mousedown', e => {
    S.binderActive = true; S.focusTarget = null; S.ckSelected = null;
    if (!e.target.closest('input') && document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  });
  editor.addEventListener('focus', () => { S.binderActive = false; });
  document.addEventListener('keydown', e => {
    if (!S.slug || !S.binderActive || !e.altKey || !S.selectedId) return;
    if (document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    const map = { ArrowUp: () => moveBy(S.selectedId, -1), ArrowDown: () => moveBy(S.selectedId, 1), ArrowLeft: () => moveOut(S.selectedId), ArrowRight: () => moveInto(S.selectedId) };
    if (map[e.key]) { e.preventDefault(); map[e.key](); }
  });

  async function deleteForever(id) {
    const f = findNode(id);
    if (!(await confirmBox('Delete forever?', `"${esc(f.node.title)}" will be removed from this project. This can't be undone (your automatic backups still have it).`, 'Delete', true))) return;
    if (id === S.docId || isInside(S.docId, f.node)) { await flushSave(); await api.backup(S.slug).catch(() => {}); S.docId = null; showEmpty(true); }   // its last words reach the backups first
    f.list.splice(f.index, 1);
    scheduleMeta(); renderBinder();
  }
  async function emptyTrash() {
    if (!(await confirmBox('Empty Trash?', 'Everything in the Trash will be removed from this book. Your automatic backups still keep a copy.', 'Empty Trash', true))) return;
    const t = findNode('root-trash').node;
    if (S.docId && isInside(S.docId, t)) { await flushSave(); S.docId = null; showEmpty(true); }
    await api.backup(S.slug).catch(() => {});   // the automatic backups keep what was in the Trash, as the message promises
    t.children = [];
    scheduleMeta(); renderBinder();
  }

  // drag and drop in the binder.
  // Drop on the top half of a row = above it, bottom half = below it, middle of a folder = inside it.
  // Below the last item in a folder, move the mouse LEFT to drop it outside that folder instead.
  let dragId = null;
  tree.addEventListener('dragstart', e => {
    const row = e.target.closest('.tree-row'); if (!row) return;
    dragId = row.dataset.id; row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/x-folio-node', dragId);
  });
  tree.addEventListener('dragend', () => { dragId = null; clearDrop(); renderBinder(); });
  function clearDrop() {
    $$('.drop-before,.drop-after,.drop-inside', tree).forEach(r => { r.classList.remove('drop-before', 'drop-after', 'drop-inside'); r.style.removeProperty('--drop-left'); });
  }
  function depthOf(id) { let d = 0; let f = findNode(id); while (f && f.parent) { d++; f = findNode(f.parent.id); } return d; }
  function resolveDrop(e, row) {
    const f = findNode(row.dataset.id); if (!f) return null;
    const n = f.node;
    if (n.root) return { id: n.id, zone: 'inside', row };
    const r = row.getBoundingClientRect(); const y = (e.clientY - r.top) / r.height;
    let zone;
    const openWithKids = n.type === 'folder' && n.open && n.children && n.children.length;
    if (n.type === 'folder') zone = y < .3 ? 'before' : (y > .7 && !openWithKids) ? 'after' : 'inside';
    else zone = y < .5 ? 'before' : 'after';
    let target = f;
    if (zone === 'after') {
      // climb out of folders when the pointer is left of this row's indent and this is the last item
      const indentX = r.left + parseFloat(row.style.paddingLeft || 0) + 10;
      let levelsOut = Math.max(0, Math.floor((indentX - e.clientX) / 16));
      while (levelsOut > 0 && target.parent && !target.parent.root && target.index === target.list.length - 1) {
        target = findNode(target.parent.id); levelsOut--;
      }
    }
    return { id: target.node.id, zone, row };
  }
  function canDrop(targetId, zone) {
    if (!dragId || targetId === dragId) return false;
    const drag = findNode(dragId).node;
    if (isInside(targetId, drag)) return false;
    const t = findNode(targetId).node;
    if (zone === 'inside' && t.type !== 'folder') return false;
    return true;
  }
  tree.addEventListener('dragover', e => {
    const row = e.target.closest('.tree-row'); if (!row || !dragId) return;
    const d = resolveDrop(e, row);
    clearDrop();
    if (!d || !canDrop(d.id, d.zone)) return;
    e.preventDefault();
    row.classList.add('drop-' + d.zone);
    if (d.zone !== 'inside') row.style.setProperty('--drop-left', (6 + depthOf(d.id) * 16 + 18) + 'px');
  });
  tree.addEventListener('drop', e => {
    const row = e.target.closest('.tree-row'); if (!row || !dragId) return;
    e.preventDefault();
    const d = resolveDrop(e, row);
    if (!d || !canDrop(d.id, d.zone)) return;
    const id = dragId; dragId = null; clearDrop();
    if (d.zone === 'inside') { moveNodeTo(id, d.id, null); return; }
    // remove first, then find the target's new position
    const src = findNode(id); src.list.splice(src.index, 1);
    const tgt = findNode(d.id);
    tgt.list.splice(tgt.index + (d.zone === 'after' ? 1 : 0), 0, src.node);
    S.selectedId = id; scheduleMeta(); renderBinder(); updateStatus(); refreshPlanView();
  });
  // dropping on the empty space under the tree puts it at the end of the Manuscript
  const binderScroll = $('#binder-tree');
  binderScroll.addEventListener('dragover', e => { if (dragId && !e.target.closest('.tree-row')) { e.preventDefault(); binderScroll.classList.add('drop-end'); } });
  binderScroll.addEventListener('dragleave', () => binderScroll.classList.remove('drop-end'));
  binderScroll.addEventListener('drop', e => {
    binderScroll.classList.remove('drop-end');
    if (!dragId || e.target.closest('.tree-row')) return;
    e.preventDefault(); const id = dragId; dragId = null;
    const src = findNode(id); if (!src || src.node.root) return;
    src.list.splice(src.index, 1); S.project.binder.push(src.node);
    S.selectedId = id; scheduleMeta(); renderBinder(); updateStatus(); refreshPlanView();
  });

  // ================================================================== EDITOR
  document.execCommand('defaultParagraphSeparator', false, 'p');

  function showEmpty(on) {
    $('#page').classList.toggle('hidden', on);
    $('#empty-state').classList.toggle('hidden', !on);
    if (on) { const p = $('#empty-state p'); if (p) p.textContent = S.emptyNote || 'Select a document in the binder, or create a new one.'; S.emptyNote = null; }
    if (on) { editor.innerHTML = ''; updateStatus(); if (window.CSS && CSS.highlights) clearRvHighlights(); }
  }

  async function openDoc(id, opts = {}) {
    await flushSave();
    const f = findNode(id); if (!f) return;
    if (f.node.map && window.UnwipMaps) { S.selectedId = id; renderBinder(); return window.UnwipMaps.open(id); }
    // opening a page always shows the writing view: from the Corkboard, Moodboard, Timeline or Insights charts it used
    // to show the page but keep that view's state, which hid the toolbar until the level was switched
    if (S.view !== 'write') setView('write');
    navNote(id, opts);
    if (S.splitId === id) { await flushSplit(); $('#split-pane').classList.add('hidden'); $('#btn-split').classList.remove('on'); S.splitId = null; if (S.project) S.project.splitId = null; }
    $$('.toast.with-action').forEach(t => t.remove()); // offers about the previous document
    S.docId = id; S.selectedId = id; S.touchedDoc = null;
    S.project.lastDoc = id; scheduleMeta();
    let html = await api.loadDoc(S.slug, id);
    // words that couldn't be saved yet: show those, not the older copy on disk (they're saved as soon as saving works)
    const kept = S.unsaved[`${S.slug}:${id}`];
    if (kept != null) html = kept;
    if (kept == null && f.node.series && window.UnwipSeries) { try { const fresh = await window.UnwipSeries.reconcile(f.node, html); if (fresh != null && S.docId === id) html = fresh; } catch (e) { console.warn('series', e); } }
    if (S.docId !== id) return;
    showEmpty(false);
    editor.innerHTML = html || '<p><br></p>';
    S.loadedHTML = editor.innerHTML;
    if (kept != null) S.dirty = true;
    resyncWords();
    $('#doc-title').value = f.node.title;
    synopsis.value = f.node.synopsis || ''; requestAnimationFrame(fitSynopsis);
    $('#snap-count').textContent = ''; refreshSnapCount();
    const kind = rootOf(id).kind;
    editor.classList.toggle('sheet', kind !== 'manuscript' && kind !== 'trash' && kind !== 'conflicts');
    markScenes(editor);
    renderBinder();
    editorWrap.scrollTop = 0;
    updateStatus();
    hideAutocomplete();
    if (S.revise) runRevise();
    emit('doc', id);
    renderNav();
    if (opts.focus === false) return;   // opened from the binder: keep the keyboard there (Delete, arrows)
    editor.focus();
    const r = document.createRange(); r.setStart(editor.firstChild || editor, 0); r.collapse(true);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
  }

  // ---- Back and Forward between pages (beta, 20 Oct: following a name, Appears in, a map pin or a search result left
  // you wondering where you'd been). Every move to another page is remembered with its scroll and cursor; the Back
  // chip at the top of the page shows only after a move that wasn't a pick from the binder or chapter list (or a new
  // page). Alt+← / Alt+→ (Mac: Cmd+[ / Cmd+]) and a mouse's back and forward buttons do the same.
  const NAV = { slug: null, back: [], fwd: [], show: false };
  const navTouch = () => !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
  function navSpot() { return S.docId && findNode(S.docId) ? { id: S.docId, top: editorWrap.scrollTop, at: caretOffset() } : null; }
  function navNote(id, opts) {
    if (NAV.slug !== S.slug) { NAV.slug = S.slug; NAV.back = []; NAV.fwd = []; NAV.show = false; }
    if (opts.nav || !S.docId || S.docId === id) return;
    const sp = navSpot(); if (sp) { NAV.back.push(sp); if (NAV.back.length > 30) NAV.back.shift(); }
    NAV.fwd = []; NAV.show = !opts.from;
  }
  const navLive = list => list.filter(x => findNode(x.id) && (rootOf(x.id) || {}).kind !== 'trash');
  const navMac = () => api.platform === 'darwin' || (!api.platform && /Mac/.test(navigator.platform || ''));   // the same test the Back keys use
  async function navGo(dir, steps = 1) {
    if (!S.slug) return false;
    NAV.back = navLive(NAV.back); NAV.fwd = navLive(NAV.fwd);
    const from = dir < 0 ? NAV.back : NAV.fwd, to = dir < 0 ? NAV.fwd : NAV.back;
    if (!from.length) return false;
    const here = navSpot(); if (here) to.push(here);
    let spot = from.pop();
    for (let i = 1; i < steps && from.length; i++) { to.push(spot); spot = from.pop(); }
    NAV.show = true;
    await openDoc(spot.id, { nav: true, focus: false });
    if (S.docId !== spot.id) return false;
    requestAnimationFrame(() => { if (spot.at != null && !navTouch()) placeCaretAt(spot.at); else editorWrap.scrollTop = spot.top || 0; });
    return true;
  }
  const navTitle = sp => { const f = findNode(sp.id); return (f && f.node.title) || 'Untitled'; };
  function renderNav() {
    let box = $('#nav-chips');
    if (!box) { box = document.createElement('div'); box.id = 'nav-chips'; box.className = 'nav-chips'; editorWrap.insertBefore(box, editorWrap.firstChild); }
    NAV.back = navLive(NAV.back); NAV.fwd = navLive(NAV.fwd);
    const b = NAV.show && NAV.back.length ? NAV.back[NAV.back.length - 1] : null, f = NAV.show && NAV.fwd.length ? NAV.fwd[NAV.fwd.length - 1] : null;
    box.hidden = !b && !f;
    box.innerHTML = `<div class="nav-in">${b ? `<button type="button" class="nav-chip" data-nav="-1" title="Back (${navMac() ? 'Cmd+[' : 'Alt+←'})"><i>←</i>Back <span>to ${esc(navTitle(b))}</span></button>` : ''}${f ? `<button type="button" class="nav-chip" data-nav="1" title="Forward (${navMac() ? 'Cmd+]' : 'Alt+→'})">Forward <span>to ${esc(navTitle(f))}</span><i>→</i></button>` : ''}</div>`;
    $$('[data-nav]', box).forEach(btn => { btn.onclick = () => navGo(+btn.dataset.nav); });
    // hover Back for a moment: the last few places, to jump back more than one
    const bb = $('[data-nav="-1"]', box);
    if (bb && !navTouch() && NAV.back.length > 1) {
      let t = null;
      bb.onmouseenter = () => { t = setTimeout(() => {
        $$('.nav-list', box).forEach(x => x.remove());
        const l = document.createElement('div'); l.className = 'nav-list';
        l.innerHTML = NAV.back.slice(-6).reverse().map((sp, i) => `<button type="button" data-steps="${i + 1}">${esc(navTitle(sp))}</button>`).join('');
        $('.nav-in', box).appendChild(l);
        $$('[data-steps]', l).forEach(x => x.onclick = () => navGo(-1, +x.dataset.steps));
        $('.nav-in', box).onmouseleave = () => l.remove();
      }, 450); };
      bb.onmouseleave = () => clearTimeout(t);
    }
  }
  document.addEventListener('keydown', e => {
    if (!S.slug || !S.docId || document.querySelector('.modal-back, .tour-card')) return;
    // only on the page: in the binder, Alt+← / → move an item out of or into a folder
    const tg = e.target; if (S.binderActive || (tg && tg !== document.body && !(tg.closest && tg.closest('#editor-wrap')))) return;
    const mac = navMac();
    const dir = mac ? (e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey ? (e.key === '[' ? -1 : e.key === ']' ? 1 : 0) : 0)
      : (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey ? (e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0) : 0);
    if (!dir || !(dir < 0 ? NAV.back.length : NAV.fwd.length)) return;
    e.preventDefault(); e.stopPropagation(); navGo(dir);
  }, true);
  window.addEventListener('mouseup', e => {
    if ((e.button !== 3 && e.button !== 4) || !S.slug || !S.docId) return;
    const dir = e.button === 3 ? -1 : 1; if (!(dir < 0 ? NAV.back.length : NAV.fwd.length)) return;
    e.preventDefault(); navGo(dir);
  });

  $('#doc-title').addEventListener('input', e => {
    const f = findNode(S.docId); if (!f) return;
    f.node.title = e.target.value;
    scheduleMeta(); scheduleNames();
    const row = $(`.tree-row[data-id="${S.docId}"] .tr-title`); if (row) row.textContent = e.target.value || 'Untitled';
  });
  $('#doc-title').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); editor.focus(); } });
  $('#doc-title').addEventListener('focus', () => { S.focusTarget = 'title'; refreshToolbar(); });
  $('#doc-title').addEventListener('mousedown', () => { S.focusTarget = 'title'; setTimeout(refreshToolbar, 0); });
  editor.addEventListener('focus', () => { S.focusTarget = 'editor'; $('#sel-block').disabled = false; });

  // The document title is the chapter heading, so the toolbar edits the "Heading 1" style
  // (shared by every chapter title, which keeps the book consistent).
  function titleFocused() { return S.focusTarget === 'title' && document.activeElement !== editor; }
  function setTitleStyle(change) {
    Object.assign(S.project.style.headings.h1, change);
    applyStyle(); scheduleMeta(); refreshToolbar();
    if (!localStorage.getItem('folio-title-tip')) {
      localStorage.setItem('folio-title-tip', '1');
      toast('Changed the chapter title style. It applies to every chapter title, and you can fine-tune it in Manuscript style.', '', 6000);
    }
    $('#doc-title').focus();
  }

  // ---- saving
  function scheduleSave() {
    S.dirty = true; S.dirtySinceBackup = true; S.touchedDoc = S.docId;
    $('#st-save').textContent = 'Saving…'; $('#st-save').classList.add('saving');
    clearTimeout(S.saveTimer);
    // saved a moment after you stop, and at least every 3 seconds while you keep typing (it used to wait for a pause,
    // so a long run of typing wasn't on disk until you stopped; found by the force-close test, 27 Oct)
    if (!S.typingSince) S.typingSince = Date.now();
    // the save made while you keep typing is the chapter alone; the book's details wait for the pause (beta, 28 Oct:
    // saving the whole book file every 3 seconds made typing jitter on a big book)
    S.saveTimer = Date.now() - S.typingSince > 3000 ? setTimeout(() => flushSave({ typing: true }), 0) : setTimeout(flushSave, 700);
  }
  async function flushSave(opts) {
    const typing = !!(opts && opts.typing);
    clearTimeout(S.saveTimer); S.typingSince = 0;
    if (!S.dirty || !S.slug || !S.docId) return;
    S.dirty = false;
    const id = S.docId;
    const html = editor.innerHTML;
    const f = findNode(id);
    if (f) { f.node.words = countWords(editorText()); f.node.mod = Date.now(); f.node.dev = S.device || ''; f.node.devId = S.deviceId || ''; }
    if (S.loadedHTML && S.loadedHTML !== html) autoSnapshotIfNeeded(id, S.loadedHTML).catch(() => {});
    const slug = S.slug, ukey = `${slug}:${id}`;
    try { await api.saveDoc(slug, id, html); delete S.unsaved[ukey]; if (pending.delete(`doc:${slug}:${id}`) && !pending.size) { troubleRetry = null; saveTrouble(null); } }
    catch (e) {
      // the words are kept (on screen, in the retry, and in S.unsaved so going to another chapter and back brings
      // them back instead of the older copy on disk) and tried again; nothing is thrown away
      S.unsaved[ukey] = html;
      if (S.docId === id && editor.innerHTML === html) S.dirty = true;
      saveTrouble(e, async () => { const now = S.slug === slug && S.docId === id ? editor.innerHTML : (S.unsaved[ukey] != null ? S.unsaved[ukey] : html); await api.saveDoc(slug, id, now); if (S.unsaved[ukey] === now || (S.slug === slug && S.docId === id)) delete S.unsaved[ukey]; if (S.slug === slug && S.docId === id && editor.innerHTML === now) S.dirty = false; }, `doc:${slug}:${id}`);
      return;
    }
    if (f && f.node.series && window.UnwipSeries) window.UnwipSeries.push(f.node, html).catch(e => console.warn('series', e));
    emit('saved', id, html);
    if (f && ['characters', 'places', 'items'].includes((rootOf(id) || {}).kind)) scheduleNames();
    if (typing) { S.metaWaiting = true; return; }   // saved with the next pause (or on leaving, Sync, restarting)
    try { await saveMetaNow(); } catch { return; }
    if (!troubleRetry) { $('#st-save').textContent = 'Saved'; $('#st-save').classList.remove('saving'); }
  }
  // everything still waiting a moment to be saved (the page, a map, a Build piece, the book's details), saved now.
  // Sync calls this first, so what you just did goes up with it instead of showing "Not synced" right after
  async function flushAll() {
    try { await flushSave(); } catch {}
    try { await flushSplit(); } catch {}
    try { if (window.UnwipMaps && window.UnwipMaps.flush) await window.UnwipMaps.flush(); } catch {}
    try { if (window.UnwipBuild && window.UnwipBuild.flush) await window.UnwipBuild.flush(); } catch {}
    try { if ((S.metaTimer || S.metaWaiting) && S.slug) await saveMetaNow(); } catch {}
  }
  // Restarting for an update (beta, 27 Oct: work was lost around one): everything waiting is saved first, and with
  // Dropbox connected in the web version (iPhone, iPad), a sync runs and finishes before the restart, so the newest
  // words are in Dropbox too. If saving or the sync doesn't work, it says so and doesn't restart.
  async function safeRestart(go) {
    const back = document.createElement('div'); back.className = 'modal-back up-saving';
    back.innerHTML = '<div class="modal" role="dialog" aria-label="Saving"><div class="m-body"><div class="sy-wait"><span class="sy-spin"></span><div><b>Saving your writing before the update…</b><span></span></div></div></div></div>';
    document.body.appendChild(back);
    const say = t => { const s = back.querySelector('.sy-wait span:last-child'); if (s) s.textContent = t; };
    try {
      await flushAll();
      if (S.saveFailing || U_saveFailing()) { back.remove(); toast('Unwip can’t update yet: some writing isn’t saved (the bar at the top says why). It updates once saving works again.', 'warn', 9000); return false; }
      const D = window.UnwipDropbox;
      if (api.web && D && D.connected && D.connected()) {
        say('Syncing with Dropbox…');
        const ok = await Promise.race([D.sync({ quiet: true }), new Promise(r => setTimeout(() => r('slow'), 45000))]);
        if (ok !== true) {
          back.remove();
          const anyway = await modal({ title: 'Dropbox didn’t finish', body: `<p>Your writing is saved on this ${esc(S.device || 'device')}, but ${ok === 'slow' ? 'Dropbox is taking a long time' : 'the sync with Dropbox didn’t work just now'}${D.lastError ? ` (${esc(D.lastError)})` : ''}.</p><p>If you update now, it syncs the next time Dropbox can be reached. Nothing is lost either way.</p>`,
            buttons: [{ label: 'Wait', value: false, kind: 'ghost' }, { label: 'Update anyway', value: true, kind: 'primary' }] });
          if (!anyway) return false;
          go(); return true;
        }
      }
      say('Restarting…');
      go(); return true;
    } catch (e) { back.remove(); toast('Couldn’t get ready to restart: ' + esc(e.message || e), 'warn', 8000); return false; }
  }
  const U_saveFailing = () => !!troubleRetry;
  function scheduleMeta() { clearTimeout(S.metaTimer); S.metaTimer = setTimeout(() => saveMetaNow().catch(() => {}), 600); }
  async function saveMetaNow() {
    clearTimeout(S.metaTimer); S.metaTimer = null; S.metaWaiting = false; if (!S.slug) return;
    S.project.totalWords = manuscriptWords(); S.project.lastDevice = S.device || S.project.lastDevice; S.project.lastDeviceId = S.deviceId || S.project.lastDeviceId;
    try { await api.saveProjectMeta(S.slug, S.project); saveTrouble(null); }
    catch (e) {
      const msg = String(e && e.message || e);
      if (/NEWER_FORMAT/.test(msg)) { newerElsewhere(msg.split('NEWER_FORMAT:')[1]); return; }   // (the message never holds up saving chapters)
      const slug = S.slug, proj = S.project;
      saveTrouble(e, () => api.saveProjectMeta(slug, proj), `meta:${slug}`); throw e;
    }
  }
  // ---- when saving fails (disk full, folder not allowed, file locked): a warning that stays until it works again
  // each thing that failed to save keeps its own retry (a chapter's words, the binder), so none replaces another
  let troubleTimer = null; const pending = new Map();
  let troubleRetry = null;   // truthy while anything is waiting to be saved
  // ---- a book deleted on another device while it's open here (PC/Mac): its folder has moved to Deleted books.
  // The saves that follow go into that Deleted copy (main.js), so the latest words are kept there; here the book
  // closes, and nothing makes it again in the old place.
  async function bookGone(how) {
    if (S.bookGone || !S.slug) return;
    S.bookGone = true;
    const title = (S.project && S.project.title) || S.slug, slug = S.slug;
    try { await flushSave(); } catch {}
    try { if (S.metaTimer) await saveMetaNow(); } catch {}
    pending.clear(); saveTrouble(null);
    if (api.popoutClose && S.popped && S.popped.size) await api.popoutClose(slug).catch(() => {});
    clearInterval(S.backupTimer); setRevise(false);
    emit('leave');
    releaseBook();
    S.slug = null; S.project = null; S.docId = null; S.bookGone = false;
    setWriter(false);
    await showLibrary();
    const where = /^bin/.test(how || '') ? `It’s in Deleted books at the bottom of this screen${/kept/.test(how || '') ? ', with the last changes you made here' : ''}, if you need it back.` : 'It’s no longer in its folder on this computer, and there’s no copy in Deleted books. If it was moved on another device, it will come back when that sync arrives.';
    toast(`“${esc(title)}” was deleted on another device, so it closed here. ${where}`, 'warn', 12000);
  }
  // One missing look isn't enough to close a book: Dropbox (or an older Unwip on another computer) can swap the
  // book's file for a moment mid-sync, and that looked exactly like a deletion (beta, 20 Oct). It has to stay gone for
  // three looks in a row, about ten seconds. Saves that hit the gap are kept and done again if the book is still there.
  // projectAlive says true (there), 'bin' (gone, with a copy in Deleted books) or false (gone, no copy).
  let goneLooking = false; const goneRetries = new Map();
  const nap = ms => new Promise(r => setTimeout(r, ms));
  async function goneCheck(how) {
    if (goneLooking || S.bookGone || !S.slug) return;
    goneLooking = true; const slug = S.slug;
    try {
      let r = false;
      for (let i = 0; i < 3; i++) {
        await nap(i ? goneGap : goneGap / 3);
        if (S.slug !== slug || S.bookGone) return;
        r = api.projectAlive ? await api.projectAlive(slug).catch(() => true) : true;
        if (r === true) {
          // a blip: it's still here. Do the saves that bounced off the gap again.
          const again = [...goneRetries.values()]; goneRetries.clear();
          for (const f of again) { try { await f(); } catch {} }
          return;
        }
      }
      goneRetries.clear();
      bookGone((r === 'bin' ? 'bin' : 'none') + (/kept/.test(how || '') ? ':kept' : ''));
    } finally { goneLooking = false; }
  }
  let goneGap = 4000;
  if (api.projectAlive) setInterval(async () => {
    if (!S.slug || S.bookGone || document.hidden || goneLooking) return;
    try { if ((await api.projectAlive(S.slug)) !== true) goneCheck(''); } catch {}
  }, 4000);

  function saveTrouble(e, retry, key) {
    if (e && /BOOK_GONE/.test(String(e.message || e))) { if (retry) goneRetries.set(key || 'x' + Math.random(), retry); if (!S.bookGone) goneCheck(String(e.message || e)); return; }
    let bar = $('#save-trouble');
    if (!e) { if (bar && !pending.size) { bar.remove(); clearInterval(troubleTimer); troubleTimer = null; troubleRetry = null; if (api.setSaveTrouble) api.setSaveTrouble(false); } return; }
    if (retry) pending.set(key || 'x' + Math.random(), retry);
    troubleRetry = pending.size ? true : null;
    if (api.setSaveTrouble) api.setSaveTrouble(!!troubleRetry);
    const m = String(e && [e.name, e.code, e.message].filter(x => x != null && x !== '').join(' ') || e);
    const why = /ENOSPC|no space|quota|QuotaExceeded|\b22\b/i.test(m) ? (api.web ? 'This device is out of room for Unwip’s storage, so it can’t save. Free up some space (delete photos, videos or apps you don’t need, or old snapshots), then it saves by itself. Your words are kept on screen until then.' : 'Your disk is full, so Unwip can’t save. Free up some space (empty the Recycle Bin, or delete big downloads) and it will save by itself.')
      : /EACCES|EPERM|not permitted|denied/i.test(m) ? 'Unwip isn’t allowed to save in this book’s folder. If it’s in OneDrive, Dropbox or a network folder, check that it’s available and not read-only.'
      : /EBUSY|locked|in use/i.test(m) ? 'The book’s file is in use by another program (often a sync app or antivirus). Unwip will keep trying.'
      : 'Unwip couldn’t save just now (' + esc(m.replace(/^Error invoking remote method '[^']+': (Error: )?/, '').slice(0, 120)) + ').';
    if (!bar) { bar = document.createElement('div'); bar.id = 'save-trouble'; document.body.appendChild(bar); }
    bar.innerHTML = `<b>Not saved yet.</b> ${why} Your words are still here; don’t close Unwip until this goes away. <button class="btn small" id="st-retry">Try again now</button>`;
    $('#st-save').textContent = 'Not saved'; $('#st-save').classList.add('saving');
    const attempt = async () => {
      for (const [k, r] of [...pending]) { try { await r(); pending.delete(k); } catch (err) { /* still failing: the bar stays */ } }
      if (pending.size) return;
      troubleRetry = null; saveTrouble(null); $('#st-save').textContent = 'Saved'; $('#st-save').classList.remove('saving'); toast('Saved. Everything is safe again.');
    };
    $('#st-retry', bar).onclick = attempt;
    if (!troubleTimer) troubleTimer = setInterval(attempt, 10000);
  }
  // another computer updated Unwip and saved this book in a newer way while it was open here
  let warnedNewer = false;
  async function newerElsewhere(by) {
    if (warnedNewer) return; warnedNewer = true;
    await modal({ title: 'Updated on another computer', body: `<p>This book was just saved by Unwip ${esc((by || '').replace(/^Error.*NEWER_FORMAT:/, '') || 'a newer version')} on another device, in a newer way than this version knows. To keep it safe, this version stops saving the binder now.</p><p>Your chapters are still saved. Update Unwip here, then open the book again.</p>`, buttons: [{ label: 'OK', value: true, kind: 'primary' }] });
  }
  window.addEventListener('beforeunload', e => {
    flushSave(); if (S.metaTimer) saveMetaNow().catch(() => {});
    // closing while words couldn't be saved: ask first (the words would be gone)
    // (on the PC the window itself asks before closing; in a browser, the browser's own "leave this page?" does)
    if (troubleRetry && api.web) { e.preventDefault(); e.returnValue = ''; }
  });

  // ---- status bar
  function updateStatus() {
    if (!S.project) return;
    const docWords = S.docId ? countWords(editorText()) : 0;
    const f = S.docId && findNode(S.docId);
    if (f) f.node.words = docWords;
    $('#st-doc').textContent = S.docId ? `${fmt(docWords)} words in this document` : 'No document open';
    const total = manuscriptWords();
    const sess = S.sessionTyped;
    if (sess > 0) window.UnwipStart && window.UnwipStart.done('wrote');
    $('#st-session').textContent = `Written this session: ${sess >= 0 ? '+' : ''}${fmt(sess)}`;
    $('#st-session').title = 'Words you typed (pasted text and big deletions are not counted). Click for goals and history.';
    const goals = S.project.goals || {};
    const daily = (S.settings || {}).dailyGoal || 0;
    const todayW = writtenOn(today());
    if (daily) {
      const pct = Math.min(100, Math.round(todayW / daily * 100));
      $('#st-today').innerHTML = `Today ${fmt(todayW)} / ${fmt(daily)}<span class="goal-bar ${pct >= 100 ? 'done' : ''}"><i style="width:${pct}%"></i></span>`;
    } else $('#st-today').innerHTML = '';
    $('#st-today').previousElementSibling.classList.toggle('hidden', !daily);
    if (goals.total) {
      const pct = Math.min(100, Math.round(total / goals.total * 100));
      $('#st-project').innerHTML = `Manuscript: ${fmt(total)} / ${fmt(goals.total)}<span class="goal-bar ${pct >= 100 ? 'done' : ''}"><i style="width:${pct}%"></i></span>`;
    } else $('#st-project').textContent = `Manuscript: ${fmt(total)}`;
    if (S.sprint) renderSprint();
    const sel = getSelection();
    if (sel.rangeCount && !sel.isCollapsed && editor.contains(sel.anchorNode)) {
      $('#st-sel').textContent = `${fmt(countWords(sel.toString()))} selected`; $('#st-sel').classList.remove('hidden');
    } else $('#st-sel').classList.add('hidden');
  }
  let countTimer;
  function updateCountsSoon() {
    clearTimeout(countTimer);
    countTimer = setTimeout(() => {
      updateStatus();
      const row = $(`.tree-row[data-id="${S.docId}"] .tr-count`);
      if (row) row.textContent = fmt(findNode(S.docId).node.words); else if (S.docId) renderBinderCountsOnly();
    }, 250);
  }
  function renderBinderCountsOnly() {
    // refresh counts on folders without rebuilding (avoids breaking an open rename box)
    if (!$('#binder-tree input.rename')) renderBinder();
  }

  // ---- editor helpers
  function currentBlock(node) {
    while (node && node !== editor) {
      if (node.nodeType === 1 && /^(P|H1|H2|H3|BLOCKQUOTE|LI|DIV)$/.test(node.tagName) && node.parentNode === editor) return node;
      if (node.nodeType === 1 && /^(P|H1|H2|H3)$/.test(node.tagName)) return node;
      node = node.parentNode;
    }
    return null;
  }
  function markScenes(scope) {
    const blocks = scope === editor ? $$(':scope > p', editor) : [scope];
    for (const b of blocks) {
      if (!b || b.tagName !== 'P') continue;
      const t = b.textContent;
      // an empty bullet item ("• " waiting for its text) looks like a "•" scene break, but isn't one: it stays on the left
      const isScene = Clip.SCENE_BREAK.test(t) && t.trim().length > 0 && !/^[•◦▪‣·][ \u00a0]+$/.test(t);
      b.classList.toggle('scene', isScene);
      if (!b.classList.length) b.removeAttribute('class');
    }
  }
  function ensureParagraphs() {
    // wrap any stray text that ended up directly in the editor
    for (const n of [...editor.childNodes]) {
      if (n.nodeType === 3 && n.nodeValue.trim() || (n.nodeType === 1 && /^(SPAN|B|I|U|S|FONT|EM|STRONG|A)$/.test(n.tagName))) {
        const p = document.createElement('p');
        editor.insertBefore(p, n); p.appendChild(n);
        const sel = getSelection(); const r = document.createRange();
        r.selectNodeContents(p); r.collapse(false); sel.removeAllRanges(); sel.addRange(r);
      } else if (n.nodeType === 1 && n.tagName === 'DIV') {
        const p = document.createElement('p');
        while (n.firstChild) p.appendChild(n.firstChild);
        if (n.getAttribute('style')) p.setAttribute('style', n.getAttribute('style'));
        n.replaceWith(p);
      }
    }
    if (!editor.firstChild) editor.innerHTML = '<p><br></p>';
  }
  function fixFontSizeSpans() {
    for (const el of $$('[style*="xxx-large"], font[size="7"]', editor)) {
      const pt = S.pendingSize || S.project.style.size;
      if (el.tagName === 'FONT') {
        const span = document.createElement('span');
        while (el.firstChild) span.appendChild(el.firstChild);
        el.replaceWith(span); span.style.fontSize = pt + 'pt';
      } else el.style.fontSize = pt + 'pt';
    }
  }
  function cleanEmptySpans() {
    for (const s of $$('span', editor)) {
      if (!s.getAttribute('style') && !s.className) s.replaceWith(...s.childNodes);
      else if (!s.textContent && !s.querySelector('br')) s.remove();
    }
  }

  // "Written" words: only what you type. Pastes, drops, undoing a paste and deleting big chunks
  // change the document's count but not your writing progress.
  const BIG_CHANGE = 30;
  function trackTyping() {
    const w = countWords(editorText());
    const d = w - S.lastDocWords;
    S.lastDocWords = w;
    if (S.programmatic || !d || Math.abs(d) > BIG_CHANGE) return;
    S.sessionTyped += d;
    const day = today();
    const daily = (S.settings || {}).dailyGoal || 0;
    const before = daily ? writtenOn(day) : 0;
    S.project.stats.days[day] = (S.project.stats.days[day] || 0) + d;
    // for Writing history: what time of day the words come, and minutes spent writing
    const st = S.project.stats, now = new Date();
    if (d > 0) { st.hours = st.hours || {}; const h = now.getHours(); st.hours[h] = (st.hours[h] || 0) + d; }
    const minute = Math.floor(now.getTime() / 60000);
    if (S.lastTypedMinute !== minute) { S.lastTypedMinute = minute; st.mins = st.mins || {}; st.mins[day] = (st.mins[day] || 0) + 1; }
    emit('typed', d);
    if (daily && before < daily && writtenOn(day) >= daily && S.goalCheered !== day) { S.goalCheered = day; quoteToast(`Daily goal reached: ${fmt(daily)} words!`); }
  }
  // the words on the page, leaving out suggested deletions (tracked changes)
  function editorText() {
    if (!editor.querySelector('del.tc-del')) return editor.innerText;
    const c = editor.cloneNode(true); c.querySelectorAll('del.tc-del').forEach(d => d.remove());
    return [...c.children].map(e => e.textContent).join('\n');
  }
  function resyncWords() { S.lastDocWords = countWords(editorText()); }
  // Two hyphens become an em dash (—) as you type the second one, like Word, Scrivener and a Mac's own apps do.
  // Undo straight after gives the two hyphens back. A setting in Settings › Writing turns it off.
  const smartDash = () => { try { return localStorage.getItem('folio-dash') !== 'off'; } catch { return true; } };
  let dashNext = false;
  editor.addEventListener('beforeinput', e => {
    dashNext = false;
    if (e.inputType !== 'insertText' || e.data !== '-' || !smartDash()) return;
    const sel = getSelection(); if (!sel.rangeCount || !sel.isCollapsed) return;
    const n = sel.anchorNode, o = sel.anchorOffset;
    dashNext = !!n && n.nodeType === 3 && o >= 1 && n.data[o - 1] === '-' && !(o > 1 && n.data[o - 2] === '-');
  }, true);
  editor.addEventListener('input', e => {
    if (!dashNext || e.inputType !== 'insertText') return;
    dashNext = false;
    const sel = getSelection(); if (!sel.rangeCount) return;
    const n = sel.anchorNode, o = sel.anchorOffset;
    if (!n || n.nodeType !== 3 || o < 2 || n.data.slice(o - 2, o) !== '--') return;
    const r = document.createRange(); r.setStart(n, o - 2); r.setEnd(n, o);
    sel.removeAllRanges(); sel.addRange(r);
    document.execCommand('insertText', false, '\u2014');
  });
  editor.addEventListener('input', e => {
    trackTyping();
    ensureParagraphs();
    fixFontSizeSpans();
    const sel = getSelection();
    if (sel.rangeCount) { const b = currentBlock(sel.anchorNode); if (b) { markScenes(b); if (b.previousElementSibling) markScenes(b.previousElementSibling); } }
    scheduleSave();
    updateCountsSoon();
    if (typewriterActive()) typewriterScroll();
    if (S.revise) scheduleRevise();
    emit('input', e);
    if (e.inputType === 'insertText') checkAutocomplete(); else hideAutocomplete();
    if (/^(insert|delete)/.test(e.inputType || '')) noteLastPlace();
  });

  // ---- “Continue”: remember the last place you typed (project, document and cursor), saved every few seconds
  function caretOffset() {
    const sel = getSelection(); if (!sel.rangeCount || !editor.contains(sel.anchorNode)) return null;
    const r = document.createRange(); r.selectNodeContents(editor); r.setEnd(sel.anchorNode, sel.anchorOffset);
    return r.toString().length;
  }
  function noteLastPlace(now) {
    if (!S.slug || !S.docId) return;
    const off = caretOffset(); if (off == null) return;
    const f = findNode(S.docId);
    // preview: the words just before the cursor in its paragraph (and the paragraph before, if this one is short)
    const sel = getSelection(), blk = currentBlock(sel.anchorNode);
    let snip = '';
    if (blk) { const r = document.createRange(); r.selectNodeContents(blk); r.setEnd(sel.anchorNode, sel.anchorOffset); snip = r.toString(); if (snip.length < 40 && blk.previousElementSibling) snip = blk.previousElementSibling.textContent + ' ' + snip; }
    snip = snip.replace(/\s+/g, ' ').trim().slice(-90);
    S.lastPlace = { slug: S.slug, docId: S.docId, offset: off, project: S.project.title, doc: f ? f.node.title : '', snippet: snip, at: Date.now() };
    clearTimeout(S.lastPlaceT);
    const save = () => { if (S.lastPlace) api.setSettings({ lastPlace: S.lastPlace }).then(x => { S.settings = x; }).catch(() => {}); };
    if (now) save(); else S.lastPlaceT = setTimeout(save, 4000);
  }
  // put the cursor back at a text position and bring it into view
  function placeCaretAt(offset) {
    const w = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let left = offset, node = null;
    while ((node = w.nextNode())) { if (left <= node.length) break; left -= node.length; }
    const r = document.createRange();
    if (node) r.setStart(node, Math.min(left, node.length)); else { r.selectNodeContents(editor); r.collapse(false); }
    r.collapse(true);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    editor.focus();
    const el = (node && node.parentElement) || editor.lastElementChild;
    if (el) el.scrollIntoView({ block: 'center' });
  }
  async function continueWriting(lp) {
    await openProject(lp.slug);
    if (!S.project) return;
    if (lp.docId && findNode(lp.docId) && S.docId !== lp.docId) await openDoc(lp.docId);
    if (S.docId === lp.docId) requestAnimationFrame(() => placeCaretAt(lp.offset || 0));
  }

  // Ctrl+Z right after a whole-document change Unwip made (like Remove empty lines) undoes that change
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z' || !S.appUndo) return;
    const t = e.target; if (t !== editor && t !== document.body && !(t.closest && t.closest('#binder, .tree')) && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    const u = S.appUndo;
    if (u.docId !== S.docId || editor.innerHTML !== u.html) { S.appUndo = null; return; }
    e.preventDefault(); e.stopPropagation(); S.appUndo = null; u.run();
  }, true);
  editor.addEventListener('keydown', e => {
    emit('keydown', e); if (e.defaultPrevented) return;
    if (e.key === 'Tab') { e.preventDefault(); return; } // first-line indents are automatic
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && (e.key === 'V' || e.key === 'v')) {
      // On the web on a Mac, iPad or iPhone, the browser doesn't paste at all for Cmd+Shift+V (only Windows does), so
      // read the clipboard's text ourselves, like Google Docs. The Mac app gets it from its Edit menu instead.
      if (e.metaKey && document.documentElement.classList.contains('web') && navigator.clipboard && navigator.clipboard.readText) {
        e.preventDefault();
        navigator.clipboard.readText().then(t => { if (!t) return; S.plainPaste = true; restoreRange(); return pasteContent({ text: t }); })
          .catch(() => toast('Your browser didn’t let Unwip read the clipboard. Paste normally, then use Clear formatting on the pasted text, or allow clipboard access for this site in your browser settings.', '', 7000));
        return;
      }
      S.plainPaste = true; setTimeout(() => S.plainPaste = false, 400);
    }
  });

  // ---- selection tracking + toolbar state
  document.addEventListener('selectionchange', () => {
    const sel = getSelection();
    if (!sel.rangeCount || !editor.contains(sel.anchorNode)) return;
    S.lastRange = sel.getRangeAt(0).cloneRange();
    refreshToolbar();
    updateStatus();
  });
  function restoreRange() {
    editor.focus();
    if (S.lastRange && editor.contains(S.lastRange.startContainer)) {
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(S.lastRange);
    }
  }
  function refreshToolbar() {
    if (titleFocused()) {
      const h = S.project.style.headings.h1;
      for (const b of $$('.tb-btn[data-cmd]')) {
        const c = b.dataset.cmd;
        const on = (c === 'bold' && h.bold) || (c === 'italic' && h.italic) ||
          (c === 'justifyLeft' && h.align === 'left') || (c === 'justifyCenter' && h.align === 'center') || (c === 'justifyRight' && h.align === 'right');
        b.classList.toggle('on', !!on);
      }
      $('#sel-block').value = 'h1'; $('#sel-block').disabled = true;
      setFontSelect(h.font); setSizeSelect(h.size);
      return;
    }
    $('#sel-block').disabled = false;
    for (const b of $$('.tb-btn[data-cmd]')) {
      let on = false;
      try { on = (FMT || []).includes(b.dataset.cmd) ? fmtShown(b.dataset.cmd) : document.queryCommandState(b.dataset.cmd); } catch {}
      b.classList.toggle('on', on && /bold|italic|underline|strike/i.test(b.dataset.cmd));
    }
    // when focus is elsewhere (e.g. the Style panel), read the place the cursor was last in the chapter
    const sel = getSelection();
    let node = sel.rangeCount ? sel.anchorNode : null; if (node && node.nodeType === 3) node = node.parentNode;
    if (!node || !editor.contains(node)) {
      node = S.lastRange && editor.contains(S.lastRange.startContainer) ? S.lastRange.startContainer : (editor.querySelector('p') || null);
      if (node && node.nodeType === 3) node = node.parentNode;
      if (!node || !editor.contains(node)) return;
    }
    const block = node.closest('h1,h2,h3,blockquote,p');
    $('#sel-block').value = block ? (block.closest('blockquote') ? 'blockquote' : block.tagName.toLowerCase()) : 'p';
    const cs = getComputedStyle(node);
    const fam = (cs.fontFamily.split(',')[0] || '').replace(/["']/g, '').trim();
    setFontSelect(fam);
    const pt = Math.round(parseFloat(cs.fontSize) * 0.75 * 2) / 2;
    setSizeSelect(pt);
  }

  // ---- narrow windows: tools that don't fit go into a "⋯" menu instead of hiding behind the right-hand buttons
  (function toolbarOverflow() {
    const tb = $('#toolbar'); if (!tb) return;
    const more = document.createElement('button');
    more.className = 'tb-btn tb-more'; more.id = 'tb-more'; more.title = 'More tools'; more.textContent = '⋯'; more.hidden = true;
    tb.appendChild(more);
    const pop = document.createElement('div'); pop.className = 'tb-pop hidden'; document.body.appendChild(pop);
    const items = [...tb.children].filter(x => x !== more);
    const order = new Map(items.map((el, i) => [el, i]));
    // first to be tucked away → last
    const PRIO = ['#btn-listen', '#btn-cmdk', '#btn-image', '#btn-footnote', '#btn-numbers', '#btn-bullets', '#btn-clear', '[data-cmd="strikeThrough"]', '[data-cmd="justifyFull"]', '[data-cmd="justifyRight"]',
      '[data-cmd="justifyCenter"]', '[data-cmd="justifyLeft"]', '#sel-size', '#btn-scene', '#btn-comment', '#sel-block', '#sel-font'];   // B, I and U always stay (beta, 27 Oct: U was gone on an iPad)
    [more, pop].forEach(el => el.addEventListener('mousedown', e => { if (!e.target.closest('select')) e.preventDefault(); }));
    more.onclick = () => {
      if (!pop.classList.contains('hidden')) { pop.classList.add('hidden'); return; }
      const r = more.getBoundingClientRect();
      pop.classList.remove('hidden');
      pop.style.top = (r.bottom + 6) + 'px';
      pop.style.left = Math.max(8, Math.min(window.innerWidth - pop.offsetWidth - 8, r.right - pop.offsetWidth)) + 'px';
    };
    document.addEventListener('mousedown', e => { if (!pop.contains(e.target) && e.target !== more) pop.classList.add('hidden'); });
    const fits = () => tb.scrollWidth <= tb.clientWidth + 1;
    let busy = false;
    function fit() {
      if (busy) return; busy = true;
      for (const el of items) tb.insertBefore(el, more);
      more.hidden = true; tb.classList.remove('tight');
      if (!fits()) {
        more.hidden = false; tb.classList.add('tight');
        for (const sel of PRIO) {
          if (fits()) break;
          const el = $(sel, tb); if (el && !el.closest('.tb-tucked') && el.offsetParent !== null) pop.appendChild(el);
        }
        // then fill what's left: tucking a wide box (Body, the font) can free more room than was needed, so the tools
        // tucked before it come back, the ones that matter most first, as long as they fit (beta, 28 Oct: ⌘K and the
        // font size sat in "⋯" next to an empty stretch of toolbar)
        for (const sel of [...PRIO].reverse()) {
          const el = $(sel, pop); if (!el) continue;
          const after = [...tb.children].find(x => x !== more && order.has(x) && order.get(x) > order.get(el));
          tb.insertBefore(el, after || more);
          if (!fits()) pop.appendChild(el);
        }
        [...pop.children].sort((a, b) => order.get(a) - order.get(b)).forEach(el => pop.appendChild(el));
      }
      if (!pop.children.length) { more.hidden = true; pop.classList.add('hidden'); }
      busy = false;
    }
    new ResizeObserver(() => requestAnimationFrame(fit)).observe(tb);
    window.addEventListener('resize', () => requestAnimationFrame(fit));
    setTimeout(fit, 300);
    // the toolbar's contents change size too (fonts loading, Focused/Detailed, a project opening): check again then
    try { document.fonts.ready.then(() => requestAnimationFrame(fit)); } catch {}
    ['project', 'doc', 'view'].forEach(ev => on(ev, () => setTimeout(fit, 60)));
    { const mo = new MutationObserver(() => requestAnimationFrame(fit)); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] }); mo.observe(document.body, { attributes: true, attributeFilter: ['class'] }); }
  })();

  // ---- toolbar actions
  $$('.tb-btn, #btn-copy-docs').forEach(b => b.addEventListener('mousedown', e => e.preventDefault()));
  $$('.tb-btn[data-cmd]').forEach(b => b.addEventListener('click', () => {
    if (titleFocused()) {
      const h = S.project.style.headings.h1, c = b.dataset.cmd;
      if (c === 'bold') setTitleStyle({ bold: !h.bold });
      else if (c === 'italic') setTitleStyle({ italic: !h.italic });
      else if (c === 'justifyLeft' || c === 'justifyFull') setTitleStyle({ align: 'left' });
      else if (c === 'justifyCenter') setTitleStyle({ align: 'center' });
      else if (c === 'justifyRight') setTitleStyle({ align: 'right' });
      return;
    }
    restoreRange();
    document.execCommand('styleWithCSS', false, false);
    if ((FMT || []).includes(b.dataset.cmd)) fmtToggle(b.dataset.cmd); else document.execCommand(b.dataset.cmd);
    cleanEmptySpans(); scheduleSave(); refreshToolbar();
  }));
  // ---- what the next letters will look like (beta, 27 Oct). Unwip keeps track itself of bold, italic, underline and
  // strikethrough for the spot the cursor is in, rather than asking the browser: Safari (iPhone, iPad, Mac) kept
  // saying underline was on after it was turned off, until the next letter. Two things set it:
  //  - turning one on or off with the cursor in one place: the next letters follow, and the button shows it at once
  //  - deleting a selection: what's typed in its place carries on in the formatting the deleted words started with,
  //    as in Scrivener and Word (Safari sometimes did, sometimes didn't, and the buttons didn't say which)
  // The first letters typed there are given exactly that formatting; after that, typing follows on from them. Moving
  // the cursor elsewhere goes back to the formatting of the words there.
  var FMT = ['bold', 'italic', 'underline', 'strikeThrough'];   // var: the toolbar can be drawn before this part runs
  var fmtPend = null;   // { node, off, f: { bold, italic, underline, strikeThrough } }
  const caretNow = () => { const s = getSelection(); return s.rangeCount && s.isCollapsed && editor.contains(s.anchorNode) ? { node: s.anchorNode, off: s.anchorOffset } : null; };
  const pendHere = () => { const c = caretNow(); return fmtPend && c && c.node === fmtPend.node && c.off === fmtPend.off && fmtPend.node.isConnected ? fmtPend : null; };
  // the formatting the words at a point have, from the page itself (b/strong, i/em, u, s/strike, or the same as a style)
  function fmtOf(node) {
    const f = { bold: false, italic: false, underline: false, strikeThrough: false };
    for (let e = node && node.nodeType === 3 ? node.parentElement : node; e && e !== editor && editor.contains(e); e = e.parentElement) {
      const t = e.tagName, st = e.style || {}, dec = `${st.textDecoration || ''} ${st.textDecorationLine || ''}`;
      if (t === 'B' || t === 'STRONG' || /^(bold|[6-9]00)$/.test(st.fontWeight || '')) f.bold = true;
      if (t === 'I' || t === 'EM' || st.fontStyle === 'italic') f.italic = true;
      if (t === 'U' || /underline/.test(dec)) f.underline = true;
      if (t === 'S' || t === 'STRIKE' || /line-through/.test(dec)) f.strikeThrough = true;
    }
    return f;
  }
  const inHeading = node => { const b = node && currentBlock(node); return !!(b && /^H[1-6]$/.test(b.tagName)); };
  // the button: what the next letter will be
  function fmtShown(cmd) { const p = pendHere(); if (p) return !!p.f[cmd]; try { return document.queryCommandState(cmd); } catch { return false; } }
  function fmtToggle(cmd) {
    const c = caretNow(), base = c ? { ...(pendHere() ? fmtPend.f : fmtOf(c.node)) } : null;
    if (cmd === 'underline') toggleUnderline(); else document.execCommand(cmd);
    const after = caretNow();
    if (base && after && !inHeading(after.node)) { base[cmd] = !base[cmd]; fmtPend = { node: after.node, off: after.off, f: base }; }
    else fmtPend = null;
  }
  // deleting a selection: remember how the deleted words started
  let delFmt = null, fmtNext = null, fmtBusy = false;
  editor.addEventListener('beforeinput', e => {
    if (fmtBusy) return;
    const s = getSelection();
    if (/^delete/.test(e.inputType || '') && s.rangeCount && !s.isCollapsed && editor.contains(s.anchorNode)) {
      const r = s.getRangeAt(0); let n = r.startContainer;
      if (n.nodeType !== 3 || r.startOffset >= n.length) { const w = document.createTreeWalker(r.commonAncestorContainer, NodeFilter.SHOW_TEXT); let t; while ((t = w.nextNode())) if (r.intersectsNode(t) && t.data.trim() && !(t === r.endContainer && r.endOffset === 0) && !(t === n && r.startOffset >= t.length)) { n = t; break; } }
      delFmt = inHeading(n) ? null : fmtOf(n); fmtNext = null; return;
    }
    delFmt = null;
    fmtNext = e.inputType === 'insertText' && e.data && pendHere() ? fmtPend.f : null;
  }, true);
  editor.addEventListener('input', e => {
    if (fmtBusy) return;
    if (delFmt && /^delete/.test(e.inputType || '')) { const c = caretNow(); fmtPend = c ? { node: c.node, off: c.off, f: delFmt } : null; delFmt = null; return; }
    const want = fmtNext; fmtNext = null;
    if (!want || e.inputType !== 'insertText' || !e.data) return;
    fmtPend = null;
    const s = getSelection(), n = s.anchorNode, o = s.anchorOffset, len = e.data.length;
    if (!n || n.nodeType !== 3 || o < len) return;
    const have = fmtOf(n), wrong = FMT.filter(c => !!have[c] !== !!want[c]);
    if (!wrong.length) return;
    // give the new letters exactly that formatting, then put the cursor back after them
    fmtBusy = true;
    try {
      const r = document.createRange(); r.setStart(n, o - len); r.setEnd(n, o); s.removeAllRanges(); s.addRange(r);
      document.execCommand('styleWithCSS', false, false);
      for (const c of wrong) document.execCommand(c);
      const r2 = s.getRangeAt(0); r2.collapse(false); s.removeAllRanges(); s.addRange(r2);
      // the cursor stays inside the letters just typed, so the next ones follow on from them
      let t = s.anchorNode; if (t && t.nodeType !== 3) { const kid = t.childNodes[s.anchorOffset - 1]; let last = kid; while (last && last.nodeType !== 3) last = last.lastChild; if (last) { const r3 = document.createRange(); r3.setStart(last, last.length); r3.collapse(true); s.removeAllRanges(); s.addRange(r3); } }
      cleanEmptySpans();
    } catch {} finally { fmtBusy = false; }
    refreshToolbar();
  });
  // Underline on an empty line (straight after Enter at the end of underlined words): on a Mac the browser keeps the
  // line's empty placeholder inside the underline, so Cmd+U couldn't turn it off until something was typed.
  // Here an empty line just loses the underline around its placeholder, and new typing is plain.
  function toggleUnderline() {
    const sel = getSelection();
    const block = sel.rangeCount && sel.isCollapsed && editor.contains(sel.anchorNode) ? currentBlock(sel.anchorNode) : null;
    if (block && !block.textContent.replace(/[\u200b\u00a0\s]/g, '')) {
      const marks = [...block.querySelectorAll('u, [style*="underline"]')];
      let n = sel.anchorNode, inU = false; for (; n && n !== block; n = n.parentNode) if (n.nodeType === 1 && (n.tagName === 'U' || /underline/.test(n.getAttribute('style') || ''))) inU = true;
      if (marks.length || inU || document.queryCommandState('underline')) {
        for (const m of marks) { if (m.tagName === 'U') { while (m.firstChild) m.before(m.firstChild); m.remove(); } else { m.style.textDecoration = ''; m.style.textDecorationLine = ''; if (!m.getAttribute('style')) { while (m.firstChild) m.before(m.firstChild); m.remove(); } } }
        if (!block.firstChild) block.appendChild(document.createElement('br'));
        const r = document.createRange(); r.setStart(block, 0); r.collapse(true); sel.removeAllRanges(); sel.addRange(r);
        if (document.queryCommandState('underline')) document.execCommand('underline');
        return;
      }
    }
    document.execCommand('underline');
  }
  editor.addEventListener('keydown', e => {
    const k = (e.key || '').toLowerCase(), c = { u: 'underline', b: 'bold', i: 'italic' }[k];
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && c) {
      e.preventDefault(); document.execCommand('styleWithCSS', false, false); fmtToggle(c); cleanEmptySpans(); scheduleSave(); refreshToolbar();
    }
  });

  $('#sel-block').addEventListener('change', e => {
    const v = e.target.value;
    restoreRange();
    // leaving a quote: formatBlock 'p' inside blockquote doesn't remove it, so unwrap first
    const sel = getSelection();
    let node = sel.anchorNode; if (node && node.nodeType === 3) node = node.parentNode;
    const bq = node && node.closest && node.closest('blockquote');
    if (bq && v !== 'blockquote') document.execCommand('outdent');
    document.execCommand('formatBlock', false, v === 'blockquote' ? 'blockquote' : v);
    if (/^h[1-3]$/.test(v)) {
      // headings take their font from the manuscript style, so drop pasted font overrides
      node = getSelection().anchorNode; if (node && node.nodeType === 3) node = node.parentNode;
      const h = node && node.closest && node.closest('h1,h2,h3');
      if (h) $$('span', h).forEach(s => { s.style.fontFamily = ''; s.style.fontSize = ''; if (!s.getAttribute('style')) s.replaceWith(...s.childNodes); });
    }
    ensureParagraphs(); cleanEmptySpans(); scheduleSave(); refreshToolbar();
  });

  // fonts dropdown
  const selFont = $('#sel-font');
  let allFontsLoaded = false;
  // fonts you've starred, shown at the top of every font list
  const fontFavs = () => ((S.settings || {}).fontFavs || []).filter(Boolean);
  async function toggleFontFav(fam) {
    const favs = fontFavs(); const i = favs.indexOf(fam);
    if (i >= 0) favs.splice(i, 1); else favs.unshift(fam);
    S.settings = await api.setSettings({ fontFavs: favs });
    buildFontSelect();
    return i < 0;
  }
  // grouped <option>s: your favourites, publishing favourites, imported, everything installed
  function fontOptionsHTML(sel) {
    const opt = f => `<option value="${esc(f)}" ${f === sel ? 'selected' : ''} style="font-family:'${esc(f)}'">${esc(f)}</option>`;
    const grp = (label, list) => list.length ? `<optgroup label="${esc(label)}">${list.map(opt).join('')}</optgroup>` : '';
    const mine = fontFavs();
    const pub = Fonts.FAVOURITES.filter(f => Fonts.isAvailable(f));
    const imp = Fonts.imported.map(i => i.family);
    const all = Fonts.installed ? [...Fonts.installed].filter(f => !pub.includes(f)).sort((a, b) => a.localeCompare(b)) : [];
    const known = new Set([...mine, ...pub, ...imp, ...all]);
    return (sel && !known.has(sel) ? opt(sel) : '') + grp('★ Your favourites', mine) + grp('Publishing favourites', pub) + grp('Imported', imp) + grp('All installed fonts', all);
  }
  function buildFontSelect() {
    const current = selFont.value;
    selFont.innerHTML = '';
    const addGroup = (label, fams) => {
      if (!fams.length) return;
      const g = document.createElement('optgroup'); g.label = label;
      for (const f of fams) { const o = document.createElement('option'); o.value = f; o.textContent = f; g.appendChild(o); }
      selFont.appendChild(g);
    };
    const fav = Fonts.FAVOURITES.filter(f => Fonts.isAvailable(f));
    addGroup('★ Your favourites', fontFavs());
    addGroup('Publishing favourites', fav);
    addGroup('Imported', Fonts.imported.map(i => i.family));
    if (Fonts.installed && Fonts.installed.size) addGroup('All installed fonts', [...Fonts.installed].filter(f => !fav.includes(f)).sort((a, b) => a.localeCompare(b)));
    const imp = document.createElement('option'); imp.value = '__import'; imp.textContent = 'Import a font file…'; selFont.appendChild(imp);
    if (current) setFontSelect(current);
  }
  function setFontSelect(fam) {
    if (!fam) return;
    if (![...selFont.options].some(o => o.value === fam)) {
      const o = document.createElement('option'); o.value = fam; o.textContent = fam; selFont.insertBefore(o, selFont.firstChild);
    }
    selFont.value = fam;
  }
  selFont.addEventListener('mousedown', async () => {
    if (allFontsLoaded) return;
    allFontsLoaded = true;
    await Fonts.loadInstalled();
    buildFontSelect();
  });
  selFont.addEventListener('change', async () => {
    const fam = selFont.value;
    if (fam === '__import') { await importFonts(); refreshToolbar(); return; }
    if (titleFocused()) { setTitleStyle({ font: fam }); return; }
    restoreRange();
    document.execCommand('styleWithCSS', false, true);
    document.execCommand('fontName', false, fam);
    document.execCommand('styleWithCSS', false, false);
    cleanEmptySpans(); scheduleSave(); editor.focus();
  });
  async function importFonts() {
    const list = await api.importFonts();
    if (!list.length) return;
    await Fonts.loadImported(list);
    buildFontSelect();
    toast('Fonts imported. They appear under "Imported" in the font list.');
  }

  // sizes dropdown
  const selSize = $('#sel-size');
  const SIZES = [8, 9, 10, 10.5, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];
  function buildSizeSelect() {
    selSize.innerHTML = SIZES.map(s => `<option value="${s}">${s}</option>`).join('');
  }
  function setSizeSelect(pt) {
    if (!pt) return;
    if (![...selSize.options].some(o => +o.value === pt)) {
      const o = document.createElement('option'); o.value = pt; o.textContent = pt;
      const after = [...selSize.options].find(op => +op.value > pt);
      selSize.insertBefore(o, after || null);
    }
    selSize.value = String(pt);
  }
  selSize.addEventListener('change', () => {
    const pt = parseFloat(selSize.value);
    if (titleFocused()) { setTitleStyle({ size: pt }); return; }
    restoreRange();
    S.pendingSize = pt;
    document.execCommand('styleWithCSS', false, true);
    document.execCommand('fontSize', false, '7');
    document.execCommand('styleWithCSS', false, false);
    fixFontSizeSpans(); cleanEmptySpans(); scheduleSave(); editor.focus();
  });

  $('#btn-scene').addEventListener('click', () => {
    restoreRange();
    const sel = getSelection();
    const b = currentBlock(sel.anchorNode);
    if (b) { const r = document.createRange(); r.selectNodeContents(b); r.collapse(false); sel.removeAllRanges(); sel.addRange(r); }
    document.execCommand('insertParagraph');
    document.execCommand('insertText', false, '* * *');
    document.execCommand('insertParagraph');
    markScenes(editor); scheduleSave();
  });
  $('#btn-clear').addEventListener('click', () => {
    restoreRange();
    document.execCommand('removeFormat');
    cleanEmptySpans(); scheduleSave(); refreshToolbar();
  });

  // ================================================================== COPY / PASTE
  function insertCleanHTML(html) {
    if (!html) return;
    S.programmatic = true;
    try { document.execCommand('insertHTML', false, html); } finally { S.programmatic = false; }
    ensureParagraphs(); cleanEmptySpans(); markScenes(editor);
    scheduleSave(); updateCountsSoon();
  }
  editor.addEventListener('paste', async e => {
    e.preventDefault();
    const dt = e.clipboardData;
    await pasteContent({ html: dt.getData('application/x-unwip') || dt.getData('text/html'), rtf: dt.getData('text/rtf'), text: dt.getData('text/plain') });
  });
  // the normal paste, from whatever the clipboard gave (images.js calls it too, once it has turned pasted pictures
  // into ones stored in the chapter)
  async function pasteContent({ html = '', rtf = '', text = '' }) {
    const plain = S.plainPaste;
    S.plainPaste = false;
    const st = S.project.style;
    // Some apps (e.g. Scrivener) only offer RTF; read it straight from the system clipboard if needed
    if (!plain && !html && !rtf) {
      try { const c = await api.clipboardRead(); rtf = c.rtf || ''; if (!html) html = c.html || ''; } catch {}
    }
    if (!plain && !html && rtf) html = window.FolioRTF.toHTML(rtf);
    let clean = plain || !html
      ? Clip.textToHTML(text)
      : Clip.cleanPaste(html, { docFont: st.font, docSize: st.size, dropFonts: false });
    // empty lines used as spacing come out (Manuscript style does the spacing), unless this book keeps them
    let offer = null;
    if (/<\/p>[\s\S]*<p/i.test(clean) && st.blankLines !== 'keep') {
      const r = Clip.dropBlankLines(clean);
      if ((r.removed || r.scenes) && !st.blankLines) offer = { kept: clean, r };
      clean = r.html;
    }
    insertCleanHTML(clean);
    if (offer) {
      const { removed, scenes } = offer.r;
      toastAction(`Took out ${removed} empty line${removed === 1 ? '' : 's'}${scenes ? `, and made ${scenes} scene break${scenes === 1 ? '' : 's'} where several were in a row` : ''}. Unwip spaces paragraphs itself.`, 'Keep them as they were', () => {
        document.execCommand('undo'); insertCleanHTML(offer.kept);
        S.project.style.blankLines = 'keep'; scheduleMeta();
        toast('Kept. Empty lines you paste into this book will stay from now on (change it in Manuscript style).', '', 7000);
      }, 15000);
    }
    offerTitleFromPaste(text || '');
  }
  // from the right-click menu, or Cmd+Shift+V on a Mac (Edit menu): outside the chapter (a search box, a note) it's a normal paste
  api.onPastePlain(() => {
    const a = document.activeElement;
    if (a && a !== document.body && !editor.contains(a)) { api.paste(); return; }
    S.plainPaste = true; restoreRange(); api.paste();
  });
  api.onSplit(() => { restoreRange(); splitAtCursor(); });

  // If a pasted chapter starts with its own title ("Chapter 3: ...") and this document has no
  // real title yet, offer to use that line as the document title.
  function offerTitleFromPaste(text) {
    const f = S.docId && findNode(S.docId); if (!f) return;
    const title = (f.node.title || '').trim();
    if (title && !/^(untitled|chapter \d+|new .*)$/i.test(title)) return;
    const firstLine = (text.split(/\r?\n/).find(l => l.trim()) || '').trim();
    if (!firstLine || firstLine.length > 90 || !/^(chapter|prologue|epilogue|part|interlude|book)\b/i.test(firstLine)) return;
    toastAction(`This looks like a chapter title: <b>${esc(firstLine)}</b>`, 'Use as document title', () => {
      f.node.title = firstLine; $('#doc-title').value = firstLine;
      const block = $$(':scope > p, :scope > h1, :scope > h2, :scope > h3', editor).find(b => b.textContent.trim() === firstLine);
      if (block) {
        block.remove();
        // also drop blank lines left at the top of the chapter
        while (editor.firstElementChild && editor.firstElementChild.tagName === 'P' && !editor.firstElementChild.textContent.trim() && editor.children.length > 1) editor.firstElementChild.remove();
      }
      resyncWords(); scheduleSave(); scheduleMeta(); renderBinder(); updateStatus();
    });
  }
  editor.addEventListener('drop', e => {
    const html = e.dataTransfer.getData('text/html');
    const text = e.dataTransfer.getData('text/plain');
    if (!html && !text) return;
    e.preventDefault();
    const r = document.caretRangeFromPoint(e.clientX, e.clientY);
    if (r) { const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
    const st = S.project.style;
    insertCleanHTML(html ? Clip.cleanPaste(html, { docFont: st.font, docSize: st.size }) : Clip.textToHTML(text));
  });

  function selectionFragment() {
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed || !editor.contains(sel.anchorNode)) return null;
    const range = sel.getRangeAt(0);
    const box = document.createElement('div');
    const startB = currentBlock(range.startContainer), endB = currentBlock(range.endContainer);
    let frag = range.cloneContents();
    if (startB && startB === endB) {
      // keep the formatting of the words around the selection (font, bold, etc)
      let anc = range.commonAncestorContainer;
      if (anc.nodeType === 3) anc = anc.parentNode;
      while (anc && anc !== startB && anc !== editor) {
        const wrap = anc.cloneNode(false); wrap.appendChild(frag);
        frag = document.createDocumentFragment(); frag.appendChild(wrap);
        anc = anc.parentNode;
      }
      const shell = startB.cloneNode(false); shell.appendChild(frag); box.appendChild(shell);
    } else box.appendChild(frag);
    return box;
  }
  function exportSettings() { return S.project.style; }
  function onCopy(e, cut) {
    const box = selectionFragment(); if (!box) return;
    const out = Clip.exportFrom(box, exportSettings());
    if (!S.warnedManualCopy) {
      const probs = Fonts.docsCheck(fontsInBlocks(Clip.extract(box).blocks));
      if (probs.length) { S.warnedManualCopy = true; setTimeout(() => toast(`Copied. Note: Google Docs doesn't have ${probs.map(p => esc(p.font)).join(', ')}. Use "Copy for Docs" to swap in the closest Docs font.`, 'warn', 9000), 50); }
    }
    e.preventDefault();
    e.clipboardData.setData('text/html', out.html);
    e.clipboardData.setData('text/plain', out.text);
    e.clipboardData.setData('application/x-unwip', box.innerHTML);   // keeps footnotes when pasting back into Unwip
    if (cut) { document.execCommand('delete'); scheduleSave(); updateCountsSoon(); }
  }
  editor.addEventListener('copy', e => onCopy(e, false));
  editor.addEventListener('cut', e => onCopy(e, true));

  function fontsInBlocks(blocks) {
    const st = S.project.style; const fams = [st.font];
    for (const b of blocks) {
      if (/^h[1-3]$/.test(b.tag)) fams.push(st.headings[b.tag].font);
      for (const r of b.runs) if (r.font) fams.push(r.font);
    }
    return fams;
  }
  // After copying for Google Docs: if a font isn't available in Docs, say so and offer a copy
  // that uses the closest font Docs does have.
  function warnDocsFonts(blocks, redo) {
    const probs = Fonts.docsCheck(fontsInBlocks(blocks));
    if (!probs.length) return;
    const names = probs.map(p => `<b>${esc(p.font)}</b>`).join(', ');
    const map = {}; probs.forEach(p => { if (p.suggestion) map[p.font] = p.suggestion; });
    const swaps = Object.entries(map).map(([a, b]) => `${esc(a)} → ${esc(b)}`).join(', ');
    if (redo && swaps) {
      toastAction(`Google Docs doesn't have ${names}, so it will show its own default font there.`, `Copy again with ${swaps}`, () => redo(map), 15000);
    } else {
      toast(`Google Docs doesn't have ${names}, so it will show its own default font there. Word is fine if the font is installed.`, 'warn', 9000);
    }
  }

  // How chapter headings are made when copying and exporting:
  //  'names'     - the document's name in the binder becomes the heading
  //  'firstline' - the chapter's own first line (e.g. "Chapter 2: …") becomes a real heading
  //  'none'      - nothing added
  function titleMode() { const st = S.project.style; return st.chapterTitles || (st.titlesAsHeadings === false ? 'none' : 'names'); }
  // tracked changes, decided in a copy only (the book itself is untouched)
  function rejectChanges(html) { if (!/tc-(ins|del)/.test(html || '')) return html; const d = document.createElement('div'); d.innerHTML = html; d.querySelectorAll('ins.tc-ins, .tc-ins').forEach(x => x.remove()); d.querySelectorAll('del.tc-del, .tc-del').forEach(x => x.replaceWith(...x.childNodes)); return d.innerHTML; }
  function acceptChanges(html) { if (!/tc-(ins|del)/.test(html || '')) return html; const d = document.createElement('div'); d.innerHTML = html; d.querySelectorAll('del.tc-del, .tc-del').forEach(x => x.remove()); d.querySelectorAll('ins.tc-ins, .tc-ins').forEach(x => x.replaceWith(...x.childNodes)); return d.innerHTML; }
  const isTitlePage = t => /^\s*(title|title page|front matter|copyright)\s*$/i.test(t || '');
  async function docBlocks(id, mode) {
    if (mode === true) mode = titleMode(); else if (!mode) mode = 'none';
    const f = findNode(id);
    let html = id === S.docId ? editor.innerHTML : await api.loadDoc(S.slug, id);
    if (Clip.changesMode === 'reject') html = rejectChanges(html);   // an export asked for the text as it was before suggestions
    const blocks = Clip.extract(Clip.parseHTML(html)).blocks;
    if (f && isTitlePage(f.node.title)) { if (blocks[0]) blocks[0] = { ...blocks[0], titleDoc: true }; return blocks; }   // a title page keeps its own layout
    if (mode === 'names' && f && f.node.title) blocks.unshift(headingBlock('h1', f.node.title));
    if (mode === 'firstline') {
      while (blocks.length && !blocks[0].runs.some(r => (r.text || '').trim())) blocks.shift();   // blank lines before it
      const text = blocks.length ? blocks[0].runs.map(r => r.br ? ' ' : (r.text || '')).join('').trim() : '';
      if (blocks.length && /^h[1-3]$/.test(blocks[0].tag)) blocks[0].tag = 'h1';
      else if (blocks.length && blocks[0].tag === 'p' && text.length <= 140 && /^(chapter|prologue|epilogue|interlude|part|book|ch\.|\d+\s*[-–—:.)])/i.test(text)) blocks[0] = headingBlock('h1', text);
      else if (f && f.node.title) blocks.unshift(headingBlock('h1', f.node.title));   // no heading line in the text: use the document name
      while (blocks.length > 1 && !blocks[1].runs.some(r => (r.text || '').trim())) blocks.splice(1, 1);   // and right after it
    }
    return blocks;
  }
  // does this folder hold chapters (e.g. a book or part) or scenes (e.g. "Chapter 3")?
  const CHAPTERISH = /^\s*(chapter|ch\.|prologue|epilogue|interlude|part|book|\[?book|\d+\s*[-–—:.)])/i;
  function folderHolds(n) {
    if (n.holds) return n.holds;
    if (/^\s*(chapter|ch\.?)\s*[\divxlc]+/i.test(n.title || '') || /^\s*\d+\s*$/.test(n.title || '')) return 'scenes';
    const docs = (n.children || []).filter(c => c.type === 'doc' && !isTitlePage(c.title));
    if (!docs.length) return 'chapters';
    const named = docs.filter(c => CHAPTERISH.test(c.title || '')).length;
    const avg = docs.reduce((a, c) => a + (c.words || 0), 0) / docs.length;
    return named >= docs.length / 2 || avg >= 1500 ? 'chapters' : 'scenes';
  }
  function headingBlock(tag, text) {
    return { tag, align: null, indent: null, lineHeight: null, runs: [{ text, bold: false, italic: false, underline: false, strike: false, sup: false, sub: false, font: null, size: null, color: null, bg: null }] };
  }
  async function copyDocForDocs(id) {
    id = id || S.docId; if (!id) return;
    await flushSave();
    const inMs = rootOf(id).kind === 'manuscript';
    const f0 = findNode(id), par = f0 && f0.parent;
    const asChapter = inMs && (!par || par.root || folderHolds(par) === 'chapters');
    const blocks = await docBlocks(id, asChapter ? titleMode() : 'none');
    const doCopy = async (fontMap) => {
      const out = Clip.exportFromBlocks(blocks, exportSettings(), { fontMap });
      await api.clipboardWrite(out.html, out.text);
    };
    await doCopy();
    toast(`Copied "${esc(findNode(id).node.title)}". Paste it into Google Docs or Word with Ctrl+V.`);
    warnDocsFonts(blocks, async map => { await doCopy(map); toast('Copied with Docs-friendly fonts. Paste with Ctrl+V.'); });
  }
  $('#btn-copy-docs').onclick = () => copyDocForDocs();

  // ================================================================== COMPILE & EXPORT
  async function compileManuscript() {
    await flushSave();
    const st = S.project.style;
    const ms = findNode('root-manuscript').node;
    const out = [];
    const sceneBreak = () => ({ tag: 'p', align: 'center', indent: 0, lineHeight: null, runs: [{ text: '* * *', bold: false, italic: false, underline: false, strike: false, sup: false, sub: false, font: null, size: null, color: null, bg: null }] });
    const mode = titleMode();
    const newPage = (blocks, title) => { if (blocks.length) blocks[0] = { ...blocks[0], newPage: true, chapterTitle: title }; return blocks; };
    async function walk(nodes, level, parentHolds) {
      let prevWasScene = false;
      for (const n of nodes) {
        if (n.noBook && n.type !== 'folder') continue;   // left out of the book
        if (n.type === 'folder' && n.noBook) { await walk(n.children || [], level + 1, folderHolds(n)); continue; }
        if (n.type === 'folder') {
          const holds = folderHolds(n);
          if (holds === 'scenes') {
            // a chapter made of scenes: its title follows the "Chapter titles" choice like any chapter
            const inner = [];
            const save = out.length; await walk(n.children || [], level + 1, holds); inner.push(...out.splice(save));
            if (mode === 'names') out.push(headingBlock('h1', n.title), ...inner);
            else if (mode === 'firstline') {
              while (inner.length && !inner[0].runs.some(r => (r.text || '').trim())) inner.shift();
              const t = inner.length ? inner[0].runs.map(r => r.br ? ' ' : (r.text || '')).join('').trim() : '';
              if (inner.length && (/^h[1-3]$/.test(inner[0].tag) || (t.length <= 140 && /^(chapter|prologue|epilogue|interlude|part|book|ch\.|\d+\s*[-–—:.)])/i.test(t)))) { inner[0] = headingBlock('h1', t); out.push(...inner); }
              else out.push(headingBlock('h1', n.title), ...inner);
            } else out.push(...newPage(inner, n.title));
          } else {
            if (mode !== 'none') out.push({ ...headingBlock('h1', n.title), part: true });   // a book or part title
            await walk(n.children || [], level + 1, holds);
          }
          prevWasScene = false;
        } else if (level === 0 || parentHolds === 'chapters') {
          const b = await docBlocks(n.id, mode);
          out.push(...(mode === 'none' && !isTitlePage(n.title) ? newPage(b, n.title) : b));
          prevWasScene = false;
        } else {
          // documents inside a folder are scenes: separate them with a scene break
          if (prevWasScene) out.push(sceneBreak());
          out.push(...await docBlocks(n.id, false));
          prevWasScene = true;
        }
      }
    }
    await walk(ms.children || [], 0);
    return out;
  }

  // ================================================================== PREVIEW & EXPORT
  const TRIMS = { '5 × 8 in': [5, 8], '5.25 × 8 in': [5.25, 8], '5.5 × 8.5 in': [5.5, 8.5], '6 × 9 in': [6, 9], 'A5': [5.83, 8.27] };
  const DEVICES = {
    'Kindle Paperwhite': { w: 3.9, h: 5.3, m: 0.22 },
    'Phone': { w: 2.75, h: 5.6, m: 0.16 },
    'Tablet': { w: 5.9, h: 7.9, m: 0.45 },
    'Kindle Scribe': { w: 6.2, h: 8.3, m: 0.4 }
  };
  const DOC_PAGES = { 'A4': [8.27, 11.69], 'Letter': [8.5, 11] };
  const PX = 96, SPACE = 28;
  // what publishers, agents and Amazon expect
  const STANDARDS = [
    { id: 'smf', label: 'Agent & publisher submission', sub: 'Standard manuscript format: Times New Roman 12 pt, double-spaced, 1 inch margins, name / title / page header',
      apply: () => { PV.format = 'docs'; PV.smf = true; }, match: () => PV.format === 'docs' && PV.smf },
    { id: 'fiction', label: 'Novel paperback', sub: '5.5 × 8.5 in, 11 pt, 1.3 spacing. The most common size for fiction',
      apply: () => { PV.format = 'paperback'; setDesignQuiet({ trim: '5.5 × 8.5 in', size: 0, leading: 0, largePrint: false }); }, match: () => PV.format === 'paperback' && PV.trim === '5.5 × 8.5 in' && !bookDesign().size && !bookDesign().largePrint },
    { id: 'trade', label: 'Trade paperback', sub: '6 × 9 in, 11 pt, 1.3 spacing. Common for longer fantasy and non-fiction',
      apply: () => { PV.format = 'paperback'; setDesignQuiet({ trim: '6 × 9 in', size: 0, leading: 0, largePrint: false }); }, match: () => PV.format === 'paperback' && PV.trim === '6 × 9 in' && !bookDesign().size && !bookDesign().largePrint },
    { id: 'kdp', label: 'Kindle / KDP e-book', sub: 'Reflowable EPUB with a clickable contents page. KDP, Apple Books and Kobo accept it',
      apply: () => { PV.format = 'ebook'; PV.device = 'Kindle Paperwhite'; PV.ebookSize = 12; }, match: () => PV.format === 'ebook' }
  ];
  const STANDARD_TRIMS = ['5.5 × 8.5 in', '6 × 9 in', '5 × 8 in'];
  const THEMEHEAD = d => (TS.THEMES[d.theme] || TS.THEMES.classic).head;
  // front and back matter: title page, copyright, dedication, epigraph, contents, acknowledgements, about the author, also by
  async function editBookMatter() {
    const b = S.project.book || {}, d = bookDesign(), cfg = S.settings || {};
    const f = (id, label, val, ph = '', area = 0) => `<div class="field ${area ? 'full' : ''}"><label for="${id}">${label}</label>${area ? `<textarea id="${id}" rows="${area}" placeholder="${esc(ph)}">${esc(val || '')}</textarea>` : `<input id="${id}" value="${esc(val || '')}" placeholder="${esc(ph)}">`}</div>`;
    const c = (id, label, on) => `<label class="check"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><span>${label}</span></label>`;
    let el;
    const ok = await modal({ title: 'Title page, copyright & more', wide: true, onOpen: x => { el = x; }, buttons: [{ label: 'Cancel', value: false }, { label: 'Save', value: true, kind: 'primary' }],
      body: `<p class="hint">Used in the print PDF and the e-book. Leave anything blank to skip it.</p>
        <div class="grid2 bm-grid">
          ${f('bm-title', 'Book title', b.title || S.project.title)}${f('bm-sub', 'Subtitle', b.subtitle, 'e.g. Book One of the Salt Coast')}
          ${f('bm-author', 'Author name (as printed)', b.author || cfg.author, 'Ima Novelist')}${f('bm-pub', 'Publisher / imprint', b.publisher, 'e.g. your own imprint name')}
          ${f('bm-isbn', 'ISBN (paperback)', b.isbn, 'From your ISBN agency or KDP')}${f('bm-isbne', 'ISBN (e-book, optional)', b.isbnEbook, 'Not needed for Kindle')}
          ${f('bm-year', 'Copyright year', b.year || new Date().getFullYear())}
          ${f('bm-ded', 'Dedication', b.dedication, 'For Mum, who read everything first.', 2)}
          ${f('bm-epi', 'Epigraph (a quotation before the story)', b.epigraph, '', 2)}${f('bm-epiby', 'Epigraph by', b.epigraphBy)}
          ${f('bm-copy', 'Copyright page (leave blank for a standard one)', b.copyright, 'Copyright © year Author. All rights reserved. …', 3)}
          ${f('bm-ack', 'Acknowledgements', b.acknowledgements, '', 3)}
          ${f('bm-about', 'About the author', b.about, '', 3)}
          ${f('bm-also', 'Also by (one title per line)', b.alsoBy, '', 3)}
        </div>
        <div class="bm-toggles"><b>Include</b>
          ${c('bm-f-half', 'Half-title page', d.front.halfTitle)}${c('bm-f-title', 'Title page', d.front.titlePage)}${c('bm-f-copy', 'Copyright page', d.front.copyright)}
          ${c('bm-f-ded', 'Dedication', d.front.dedication)}${c('bm-f-epi', 'Epigraph', d.front.epigraph)}${c('bm-f-toc', 'Contents with page numbers', d.front.toc)}
          ${c('bm-b-ack', 'Acknowledgements', d.back.acknowledgements)}${c('bm-b-about', 'About the author', d.back.about)}${c('bm-b-also', 'Also by', d.back.alsoBy)}
        </div>` });
    if (!ok || !el) return false;
    const v = id => (el.querySelector('#' + id) || {}).value || '', k = id => !!(el.querySelector('#' + id) || {}).checked;
    S.project.book = { title: v('bm-title').trim(), subtitle: v('bm-sub').trim(), author: v('bm-author').trim(), publisher: v('bm-pub').trim(), isbn: v('bm-isbn').trim(), isbnEbook: v('bm-isbne').trim(),
      year: v('bm-year').trim(), dedication: v('bm-ded'), epigraph: v('bm-epi'), epigraphBy: v('bm-epiby').trim(), copyright: v('bm-copy'), acknowledgements: v('bm-ack'), about: v('bm-about'), alsoBy: v('bm-also') };
    S.project.design = { ...d, front: { halfTitle: k('bm-f-half'), titlePage: k('bm-f-title'), copyright: k('bm-f-copy'), dedication: k('bm-f-ded'), epigraph: k('bm-f-epi'), toc: k('bm-f-toc') },
      back: { acknowledgements: k('bm-b-ack'), about: k('bm-b-about'), alsoBy: k('bm-b-also') } };
    scheduleMeta();
    return true;
  }
  const TS = window.UnwipTypeset;
  const bookDesign = () => TS ? TS.design(S.project) : {};
  function setDesignQuiet(patch) { S.project.design = { ...bookDesign(), ...patch }; PV.trim = S.project.design.trim; scheduleMeta(); }
  const PV = { smf: false, smfFont: 'Times New Roman', format: 'paperback', trim: '5.5 × 8.5 in', bookSize: 11, bookLine: 1.3, device: 'Kindle Paperwhite', ebookSize: 12, docPage: 'A4', scope: 'ms', page: 0, pages: 1, blocks: [], counts: {} };

  function bookStyle() {
    const st = JSON.parse(JSON.stringify(S.project.style));
    st.size = PV.bookSize; st.lineHeight = PV.bookLine; st.indent = 0.3; st.paraSpacing = 0; st.justify = true; st.noIndentFirst = true;
    st.headings.h1 = { ...st.headings.h1, size: Math.round(PV.bookSize * Math.min(3.5, Math.max(1.2, S.project.style.headings.h1.size / (S.project.style.size || 12)))), spaceBefore: 90, spaceAfter: 30 };
    st.headings.h2 = { ...st.headings.h2, size: Math.round(PV.bookSize * 1.2) };
    return st;
  }
  // Standard manuscript format (what agents and editors ask for)
  function smfStyle() {
    const st = JSON.parse(JSON.stringify(S.project.style));
    const F = PV.smfFont === 'Courier New' ? 'Courier New' : 'Times New Roman';
    Object.assign(st, { font: F, size: 12, lineHeight: 2, indent: 0.5, paraSpacing: 0, justify: false, noIndentFirst: false });
    st.headings.h1 = { font: F, size: 12, bold: false, italic: false, align: 'center', spaceBefore: 200, spaceAfter: 24 };
    st.headings.h2 = { ...st.headings.h2, font: F, size: 12 };
    st.headings.h3 = { ...st.headings.h3, font: F, size: 12 };
    return st;
  }
  function ebookStyle() {
    const st = JSON.parse(JSON.stringify(S.project.style));
    st.size = PV.ebookSize; st.lineHeight = 1.45; st.indent = 0.25; st.paraSpacing = 0; st.justify = false; st.noIndentFirst = true;
    st.headings.h1 = { ...st.headings.h1, size: Math.round(PV.ebookSize * Math.min(3, Math.max(1.2, S.project.style.headings.h1.size / (S.project.style.size || 12)))), spaceBefore: 40, spaceAfter: 20 };
    return st;
  }
  // page geometry (inches) for a format
  function geometry(fmt) {
    if (fmt === 'paperback') { const [w, h] = TRIMS[PV.trim]; return { w, h, mt: 0.7, mb: 0.75, ml: 0.75, mr: 0.55, style: bookStyle(), dropBlank: false }; }
    if (fmt === 'ebook') { const d = DEVICES[PV.device]; return { w: d.w, h: d.h, mt: d.m, mb: d.m, ml: d.m, mr: d.m, style: ebookStyle(), dropBlank: true }; }
    const [w, h] = DOC_PAGES[PV.docPage]; return { w, h, mt: 1, mb: 1, ml: 1, mr: 1, style: PV.smf ? smfStyle() : S.project.style, dropBlank: false, smf: PV.smf };
  }
  function layoutHTML(fmt, g) {
    let blocks = PV.blocks;
    if (g.dropBlank) blocks = blocks.filter(b => b.runs.some(r => !r.br && (r.text || '').trim()));
    if (g.smf) blocks = blocks.map(b => Clip.SCENE_BREAK.test(b.runs.map(r => r.text || '').join('')) && b.runs.some(r => (r.text || '').trim()) ? { ...b, runs: [{ ...b.runs.find(r => !r.br), text: '#' }] } : b);
    let html = Clip.exportFromBlocks(blocks, g.style, { pageBreaks: true }).html;
    // Kindle / EPUB: [system messages] as boxes, as the EPUB will have them (Settings › LitRPG). The preview used to
    // leave them as plain brackets whatever the setting said.
    if (fmt === 'ebook') html = ebookSysBoxes(html);
    // in the preview, "new page" means "new column"
    return html.replace(/page-break-before: always; break-before: page/g, 'break-before: column');
  }
  function ebookSysBoxes(html) {
    const L = S.settings.litrpg, Lit = window.UnwipLitRPG;
    if (!L || !L.on || !L.ebook || !Lit) return html;
    const box = document.createElement('div'); box.innerHTML = html;
    const ps = [...box.querySelectorAll('p')].filter(p => (p.textContent || '').trim());
    const mode = Lit.shortStyle();
    // the same look as the EPUB's p.sys (epub.js)
    const FULL = 'text-indent:0;text-align:left;margin:.7em 1.2em;padding:.35em .7em;border:1px solid #5d84c9;border-left:4px solid #5d84c9;background-color:#eef3fb;color:#1d2a44;font-family:monospace;font-size:.88em;break-inside:avoid;';
    ps.forEach((p, i) => {
      const t = p.textContent || ''; if (!Lit.isSys(t)) return;
      const short = mode !== 'full' && Lit.isShort(t, ps[i - 1] ? ps[i - 1].textContent : '', ps[i + 1] ? ps[i + 1].textContent : '');
      if (short && mode === 'plain') { p.style.cssText += ';text-indent:0;margin:.5em 1.2em;font-weight:bold;'; return; }
      p.style.cssText += ';' + FULL + (short ? 'display:table;margin-right:auto;' : '');
      p.querySelectorAll('[style]').forEach(x => { x.style.fontFamily = ''; x.style.fontSize = ''; });   // the box's own monospace, as in the EPUB
      if (!short && ps[i - 1] && Lit.isSys(ps[i - 1].textContent)) p.style.cssText += 'margin-top:-.45em;border-top:0;';
    });
    return box.innerHTML;
  }
  // Flow the text into page-sized columns and count them
  function layoutInto(flow, fmt) {
    // paperback: the real book layout (typeset.js), page by page
    if (fmt === 'paperback' && PV.book && flow.id === 'pv-flow') {
      TS.ensureStyle(PV.book);
      const g = PV.book.geo;
      flow.style.cssText = ''; flow.innerHTML = '';
      TS.fill(flow, PV.book, 0, 1, SPACE);
      return { pages: PV.book.pages.length, P: g.P, H: g.PH, g };
    }
    const g = geometry(fmt);
    const W = Math.round((g.w - g.ml - g.mr) * PX), H = Math.round((g.h - g.mt - g.mb) * PX);
    const P = Math.round(g.w * PX), gap = Math.round((g.mr + g.ml) * PX) + SPACE;
    const ml = Math.round(g.ml * PX), mr = P - W - ml, mt = Math.round(g.mt * PX), mb = Math.round(g.h * PX) - H - mt;
    flow.style.cssText = `position:relative; box-sizing:content-box; width:${W}px; height:${H}px; padding:${mt}px ${mr}px ${mb}px ${ml}px;
      column-width:${W}px; column-gap:${gap}px; column-fill:auto; color:#1d1b18;`;
    flow.innerHTML = layoutHTML(fmt, g) + '<span class="pv-end"></span>';
    const end = flow.querySelector('.pv-end');
    const fr = flow.getBoundingClientRect(), er = end.getBoundingClientRect();
    const scale = fr.width / flow.offsetWidth || 1;
    const n = Math.max(1, Math.floor(((er.left - fr.left) / scale - ml) / (W + gap)) + 1);
    flow.style.columnCount = n;
    flow.style.width = (n * W + (n - 1) * gap) + 'px';
    flow.style.backgroundImage = `linear-gradient(to right, #fffefb 0, #fffefb ${P}px, transparent ${P}px)`;
    flow.style.backgroundSize = `${P + SPACE}px 100%`;
    flow.style.backgroundRepeat = 'repeat-x';
    return { pages: n, P, H: H + mt + mb, g };
  }
  async function measureAll() {
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed; left:-100000px; top:0; visibility:hidden;';
    document.body.appendChild(box);
    const saved = { format: PV.format };
    for (const f of ['paperback', 'ebook', 'docs']) {
      if (f === 'paperback' && PV.book) { PV.counts[f] = PV.book.pages.length; continue; }
      const flow = document.createElement('div'); box.appendChild(flow);
      PV.counts[f] = layoutInto(flow, f).pages;
      flow.remove();
      await new Promise(r => requestAnimationFrame(r));
    }
    box.remove();
    PV.format = saved.format;
  }

  async function openPreview(format) {
    await flushSave();
    if (format === 'paperback' || format === 'ebook' || format === 'docs') { PV.format = format; if (format !== 'docs') PV.smf = false; }
    const hasDoc = !!S.docId && rootOf(S.docId).kind === 'manuscript';
    try { await Fonts.loadInstalled(); } catch {}
    PV.scope = 'ms'; PV.page = 0; PV.book = null;
    if (TS) PV.trim = bookDesign().trim;
    if (!PV.docPageSet) { const lang = ((await api.spellSettings().catch(() => ({ current: [] }))).current[0]) || ''; PV.docPage = /en-US|en-CA/.test(lang) ? 'Letter' : 'A4'; PV.docPageSet = true; }
    const back = document.createElement('div');
    back.className = 'pv-back';
    back.innerHTML = `
      <div class="pv">
        <header class="pv-head">
          <div class="pv-title">Preview</div>
          <div class="pv-tabs">
            <button data-f="paperback">Paperback / PDF</button>
            <button data-f="ebook">Kindle / EPUB</button>
            <button data-f="docs">Google Docs / Word</button>
          </div>
          <button class="icon-btn" id="pv-close" title="Close (Esc)">&#10005;</button>
        </header>
        <div class="pv-body">
          <aside class="pv-side">
            <div class="field"><label>What to preview</label>
              <select id="pv-scope"><option value="ms">Whole manuscript</option>${hasDoc ? '<option value="doc">This chapter only</option>' : ''}</select></div>
            <div class="field"><label>Chapter titles</label>
              <select id="pv-titles">${[['names', 'Document names from the binder'], ['firstline', 'The first line of each chapter'], ['none', 'Don’t add titles']].map(([v, l]) => `<option value="${v}" ${titleMode() === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
              <div class="pv-hint" id="pv-titles-hint"></div></div>
            <div class="field pv-tstyle"><label>Chapter title look <span class="tip-q" data-tip="The font and size for chapter titles, in the editor and in every export (paperback, e-book, PDF, Word, Google Docs). Agent submission format always uses Times New Roman 12, as agents expect.">?</span></label>
              <div class="pv-trow pv-fontrow"><select id="pv-tf">${fontOptionsHTML(S.project.style.headings.h1.font)}</select><button class="tb-btn pv-fav" id="pv-tfav" data-tip="Add this font to your favourites (shown at the top of every font list)">${fontFavs().includes(S.project.style.headings.h1.font) ? '★' : '☆'}</button></div>
              <div class="pv-trow">
                <select id="pv-tsz" title="Size">${[14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48].map(n => `<option value="${n}" ${+S.project.style.headings.h1.size === n ? 'selected' : ''}>${n} pt</option>`).join('')}${[14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48].includes(+S.project.style.headings.h1.size) ? '' : `<option selected value="${S.project.style.headings.h1.size}">${S.project.style.headings.h1.size} pt</option>`}</select>
                <button class="tb-btn ${S.project.style.headings.h1.bold ? 'on' : ''}" id="pv-tb" title="Bold"><b>B</b></button>
                <button class="tb-btn ${S.project.style.headings.h1.italic ? 'on' : ''}" id="pv-ti" title="Italic"><i>I</i></button>
                <select id="pv-ta" title="Alignment">${[['left', 'Left'], ['center', 'Centre'], ['right', 'Right']].map(([v, l]) => `<option value="${v}" ${S.project.style.headings.h1.align === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
              </div>
              <div class="pv-hint" id="pv-tlook-hint"></div></div>
            <div class="pv-std">
              <div class="pv-std-head">Publishing standards</div>
              <div id="pv-stds"></div>
              <div class="pv-std-status" id="pv-std-status"></div>
            </div>
            <div class="pv-counts" id="pv-counts"></div>
            <div id="pv-opts"></div>
            <div class="pv-actions" id="pv-actions"></div>
            <p class="pv-note" id="pv-note"></p>
          </aside>
          <main class="pv-stage">
            <div class="pv-viewport" id="pv-viewport"><div class="pv-scale" id="pv-scale"><div id="pv-flow"></div></div></div>
            <div class="pv-nav">
              <button class="icon-btn" id="pv-prev" title="Previous (←)">&#8592;</button>
              <input type="range" id="pv-slider" min="0" value="0">
              <button class="icon-btn" id="pv-next" title="Next (→)">&#8594;</button>
              <span id="pv-pageinfo"></span>
            </div>
          </main>
        </div>
      </div>`;
    document.body.appendChild(back);
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', fit); };
    const onKey = e => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
      else if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(-1); }
    };
    document.addEventListener('keydown', onKey, true);
    $('#pv-close', back).onclick = close;

    let geo = null;
    const flow = $('#pv-flow', back), scaleEl = $('#pv-scale', back), vp = $('#pv-viewport', back);
    const perView = () => PV.format === 'docs' || window.innerWidth <= 640 ? 1 : 2; // phones: one page at a time
    function fit() {
      if (!geo) return;
      const stage = $('.pv-stage', back).getBoundingClientRect();
      const n = perView();
      const wNeeded = n * geo.P + (n - 1) * SPACE;
      const s = Math.min((stage.width - 40) / wNeeded, (stage.height - 80) / geo.H, 1.4);
      scaleEl.style.transform = `scale(${s})`;
      vp.style.width = Math.floor(wNeeded * s) + 'px';
      vp.style.height = Math.floor(geo.H * s) + 'px';
      show();
    }
    function show() {
      const n = perView();
      PV.page = Math.max(0, Math.min(PV.page, PV.pages - 1));
      if (n === 2 && PV.format === 'paperback') PV.page = PV.page === 0 ? 0 : PV.page - ((PV.page - 1) % 2); // book spreads: 1, 2–3, 4–5…
      const bookMode = PV.format === 'paperback' && PV.book;
      // in a printed book page 1 is a right-hand page, so it sits on the right with nothing beside it (two-page view only)
      flow.style.transform = `translateX(${-(bookMode && n === 2 ? PV.page - (PV.page === 0 ? 1 : 0) : PV.page) * (geo.P + SPACE)}px)`;
      if (bookMode) TS.fill(flow, PV.book, PV.page - 1, PV.page + 2, SPACE);
      const last = bookMode && n === 2 && PV.page === 0 ? 1 : Math.min(PV.pages, PV.page + n);
      const unit = PV.format === 'ebook' ? 'Screen' : 'Page';
      $('#pv-pageinfo', back).textContent = last > PV.page + 1 ? `${unit}s ${PV.page + 1}–${last} of ${fmt(PV.pages)}` : `${unit} ${PV.page + 1} of ${fmt(PV.pages)}`;
      const sl = $('#pv-slider', back); sl.max = Math.max(0, PV.pages - 1); sl.value = PV.page;
    }
    function go(d) { PV.page += d * perView(); if (PV.format === 'paperback' && perView() === 2 && PV.page === 1 && d < 0) PV.page = 0; show(); }
    $('#pv-prev', back).onclick = () => go(-1);
    $('#pv-next', back).onclick = () => go(1);
    $('#pv-slider', back).oninput = e => { PV.page = +e.target.value; show(); };
    window.addEventListener('resize', fit);

    function renderCounts() {
      const words = PV.blocks.reduce((a, b) => a + countWords(b.runs.map(r => r.text || '').join(' ')), 0);
      const chars = PV.blocks.reduce((a, b) => a + b.runs.reduce((x, r) => x + (r.text || '').length, 0), 0);
      const c = PV.counts;
      $('#pv-counts', back).innerHTML = `
        <button class="pv-count ${PV.format === 'paperback' ? 'on' : ''}" data-f="paperback"><b>${c.paperback != null ? fmt(c.paperback) : '…'}</b><span>paperback pages<br>${esc(PV.trim)}</span></button>
        <button class="pv-count ${PV.format === 'ebook' ? 'on' : ''}" data-f="ebook"><b>${c.ebook != null ? fmt(c.ebook) : '…'}</b><span>e-reader screens<br>${esc(PV.device)}</span></button>
        <button class="pv-count ${PV.format === 'docs' ? 'on' : ''}" data-f="docs"><b>${c.docs != null ? fmt(c.docs) : '…'}</b><span>Docs / Word pages<br>${PV.docPage}</span></button>
        <div class="pv-count static"><b>${fmt(words)}</b><span>words · about ${fmt(Math.max(1, Math.round(words / 238)))} min to read<br>≈ ${fmt(Math.ceil(chars / 128))} Kindle locations</span></div>`;
      $$('.pv-count[data-f]', back).forEach(b => b.onclick = () => setFormat(b.dataset.f));
    }
    function renderStandards() {
      const hit = STANDARDS.find(x => x.match());
      $('#pv-stds', back).innerHTML = STANDARDS.map(x => `<button class="pv-stdbtn ${hit === x ? 'on' : ''}" data-s="${x.id}"><span class="star">★</span><span><b>${esc(x.label)}</b><small>${esc(x.sub)}</small></span></button>`).join('');
      $('#pv-std-status', back).innerHTML = hit ? `<span class="ok">✓ Matches the ${esc(hit.label.toLowerCase())} standard</span>` : '<span class="custom">Custom settings. Pick a standard above to match what publishers expect.</span>';
      $$('.pv-stdbtn', back).forEach(b => b.onclick = () => { const x = STANDARDS.find(y => y.id === b.dataset.s); x.apply(); PV.page = 0; setFormat(PV.format); });
    }
    function renderOptions() {
      const o = $('#pv-opts', back), a = $('#pv-actions', back), note = $('#pv-note', back);
      // ★ marks the values publishers treat as standard
      const sel = (id, opts, cur, label, std = []) => `<div class="field"><label>${label}</label><select id="${id}">${opts.map(v => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${v}${std.map(String).includes(String(v)) ? '  ★ standard' : ''}</option>`).join('')}</select></div>`;
      if (PV.format === 'paperback') {
        const d = bookDesign(), t = TS.resolved(d);
        const chk = (id, on, label, tip) => `<label class="check pv-chk"${tip ? ` data-tip="${esc(tip)}"` : ''}><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><span>${label}</span></label>`;
        const fontsList = [...new Set([...TS.FONTS, ...fontFavs(), 'Garamond', 'Georgia', 'Palatino Linotype', 'Book Antiqua', 'Times New Roman'])];
        const fsel = (id, cur, label, def) => `<div class="field"><label>${label}</label><select id="${id}"><option value="">${esc(def)} (theme)</option>${fontsList.map(f => `<option ${f === cur ? 'selected' : ''} style="font-family:'${esc(f)}'">${esc(f)}</option>`).join('')}</select></div>`;
        o.innerHTML = `<div class="field"><label>Book design</label><div class="pv-themes">${Object.entries(TS.THEMES).map(([k, th]) => `<button class="pv-theme ${d.theme === k ? 'on' : ''}" data-theme="${k}" data-tip="${esc(th.blurb)}"><span class="pv-th-a" style="font-family:'${esc(th.head)}', serif${th.titleStyle === 'italic' ? ';font-style:italic' : ''}">${th.number === 'digits' ? '1' : th.number === 'none' ? 'Aa' : 'One'}</span><span class="pv-th-n">${esc(th.name)}</span></button>`).join('')}</div></div>` +
          sel('pv-trim', Object.keys(TS.TRIMS), d.trim, 'Trim size', STANDARD_TRIMS) +
          `<div class="pv-row">${sel('pv-bsize', ['Theme', 10, 10.5, 11, 11.5, 12, 13], d.size || 'Theme', 'Text size (pt)')}${sel('pv-bline', ['Theme', 1.25, 1.3, 1.35, 1.4, 1.5], d.leading || 'Theme', 'Line spacing')}</div>` +
          `<div class="pv-row">${fsel('pv-bfont', d.bodyFont, 'Text font', t.body)}${fsel('pv-hfont', d.headFont, 'Heading font', THEMEHEAD(d))}</div>` +
          sel('pv-scene', TS.SCENES.map(x => x === 'theme' ? `Theme (${t.scene})` : x), d.scene === 'theme' ? `Theme (${t.scene})` : d.scene, 'Scene breaks') +
          `<div class="pv-checks">` +
          chk('pv-recto', d.recto, 'Chapters start on a right-hand page', 'How printed novels do it. May add a blank page before some chapters.') +
          chk('pv-drop', t.drop, 'Drop capitals') + chk('pv-lead', t.lead, 'Small capitals on the first line') +
          chk('pv-heads', d.headers, 'Running heads (author / title)') + chk('pv-nums', d.pageNumbers, 'Page numbers') +
          chk('pv-just', d.justify, 'Justified text') + chk('pv-hyph', d.hyphenate, 'Hyphenation', 'Splits long words at line ends so justified lines don’t get big gaps.') +
          chk('pv-large', d.largePrint, 'Large print (16 pt)') +
          `</div>` + sel('pv-hright', ['Book title', 'Chapter title'], d.headerRight === 'chapter' ? 'Chapter title' : 'Book title', 'Right-hand page head') +
          `<button class="btn" id="pv-matter" style="width:100%;margin-top:6px">Title page, copyright & more…</button>`;
        a.innerHTML = `<button class="btn primary" data-a="pdf">Export print PDF</button><button class="btn" data-a="exact">Check exact PDF page count</button>`;
        const gut = PV.book ? PV.book.geo.gutter : 0.5;
        note.textContent = `Print-ready interior for Amazon KDP, IngramSpark and other printers: fonts are embedded, chapters open on right-hand pages, and the inside margin (${gut} in) is sized for ${PV.book ? fmt(PV.book.pages.length) : 'this many'} pages. What you see here is exactly what prints.`;
            } else if (PV.format === 'ebook') {
        o.innerHTML = sel('pv-device', Object.keys(DEVICES), PV.device, 'Device') + sel('pv-esize', ['Small', 'Medium', 'Large'], { 10: 'Small', 12: 'Medium', 14: 'Large' }[PV.ebookSize], 'Reader text size');
        a.innerHTML = `<button class="btn primary" data-a="epub">Export EPUB</button>`;
        note.textContent = 'E-books have no fixed pages: readers pick their own font and size. This shows a typical screen. The EPUB works with Kindle (Send to Kindle or upload to KDP), Apple Books, Kobo and Google Play. Open it in Amazon’s free Kindle Previewer to see exactly how Kindle shows it.';
      } else {
        o.innerHTML = `<label class="check pv-smf"><input type="checkbox" id="pv-smf" ${PV.smf ? 'checked' : ''}><span>Standard manuscript format <span class="star">★</span></span><small>For agents and publishers. Overrides your Manuscript style.</small></label>` +
          (PV.smf ? sel('pv-smffont', ['Times New Roman', 'Courier New'], PV.smfFont, 'Font') : '') +
          sel('pv-docpage', Object.keys(DOC_PAGES), PV.docPage, 'Paper size', ['A4', 'Letter']);
        a.innerHTML = `<button class="btn primary" data-a="copy">Copy for Google Docs</button><button class="btn" data-a="docx">Export Word (.docx)</button><button class="btn" data-a="docpdf">Export manuscript PDF</button>`;
        note.textContent = PV.smf
          ? `Standard manuscript format: ${PV.smfFont} 12 pt throughout (the file names the standard font, which every agent’s computer has), double-spaced, every paragraph indented half an inch, chapters starting a third of the way down a new page, # for scene breaks. The PDF adds your surname, the title and the page number at the top right. US agents usually want Letter paper; UK and Australian agents A4.`
          : 'Uses your Manuscript style (font, spacing, indents) on standard pages with 1 inch margins, like a fresh Google Doc or Word file.';
      }
      const on = (id, fn) => { const el = $('#' + id, back); if (el) el.onchange = fn; };
      const des = patch => { setDesignQuiet(patch); renderOptions(); rebuildBook(); };
      on('pv-trim', e => des({ trim: e.target.value }));
      on('pv-bsize', e => des({ size: e.target.value === 'Theme' ? 0 : +e.target.value }));
      on('pv-bline', e => des({ leading: e.target.value === 'Theme' ? 0 : +e.target.value }));
      on('pv-bfont', e => des({ bodyFont: e.target.value }));
      on('pv-hfont', e => des({ headFont: e.target.value }));
      on('pv-scene', e => des({ scene: /^Theme/.test(e.target.value) ? 'theme' : e.target.value }));
      on('pv-recto', e => des({ recto: e.target.checked }));
      on('pv-drop', e => des({ drop: e.target.checked }));
      on('pv-lead', e => des({ lead: e.target.checked }));
      on('pv-heads', e => des({ headers: e.target.checked }));
      on('pv-nums', e => des({ pageNumbers: e.target.checked }));
      on('pv-just', e => des({ justify: e.target.checked }));
      on('pv-hyph', e => des({ hyphenate: e.target.checked }));
      on('pv-large', e => des({ largePrint: e.target.checked, ...(e.target.checked && !/6 ×/.test(bookDesign().trim) ? { trim: '6 × 9 in' } : {}) }));
      on('pv-hright', e => des({ headerRight: e.target.value === 'Chapter title' ? 'chapter' : 'title' }));
      $$('.pv-theme', back).forEach(b => b.onclick = () => des({ theme: b.dataset.theme, drop: 'theme', lead: 'theme', scene: 'theme', bodyFont: '', headFont: '' }));
      const mb = $('#pv-matter', back); if (mb) mb.onclick = async () => { if (await editBookMatter()) rebuildBook(); };
      on('pv-device', e => { PV.device = e.target.value; relayout(true); });
      on('pv-esize', e => { PV.ebookSize = { Small: 10, Medium: 12, Large: 14 }[e.target.value]; relayout(true); });
      on('pv-docpage', e => { PV.docPage = e.target.value; relayout(true); });
      on('pv-smf', e => { PV.smf = e.target.checked; renderOptions(); relayout(true); });
      on('pv-smffont', e => { PV.smfFont = e.target.value; renderOptions(); relayout(true); });
      $$('[data-a]', a).forEach(b => b.onclick = () => doExport(b.dataset.a, b));
    }
    function setFormat(f) {
      PV.format = f; PV.page = 0;
      $$('.pv-tabs button', back).forEach(b => b.classList.toggle('on', b.dataset.f === f));
      renderOptions(); relayout(false);
    }
    $$('.pv-tabs button', back).forEach(b => b.onclick = () => setFormat(b.dataset.f));
    function relayout(recount) {
      geo = layoutInto(flow, PV.format);
      PV.pages = geo.pages; PV.counts[PV.format] = geo.pages;
      vp.dataset.format = PV.format;
      fit(); renderCounts(); renderStandards();
      const tst = $('.pv-tstyle', back); if (tst) tst.hidden = PV.format === 'paperback' && !!PV.book;   // paperback headings come from the book design
      const th = $('#pv-tlook-hint', back);
      if (th) th.innerHTML = PV.format === 'docs' && PV.smf ? 'Agent submission format always uses plain Times New Roman 12 for titles, as agents expect, so your title look isn’t shown here. Switch to <b>Paperback</b> or <b>E-book</b> to see it.' : '';
      $$('#pv-tf, #pv-tsz, #pv-ta, #pv-tb, #pv-ti, #pv-tfav', back).forEach(x => x.classList.toggle('pv-dim', PV.format === 'docs' && !!PV.smf));
      if (recount) { /* other formats unaffected by these options */ }
    }
    async function rebuildBook() {
      if (!TS) return;
      const token = PV.bookToken = (PV.bookToken || 0) + 1;
      const info = $('#pv-pageinfo', back); if (info && PV.format === 'paperback') info.textContent = 'Setting the pages…';
      let book;
      try { book = await TS.build(PV.blocks, S.project, { author: (S.settings || {}).author || '', yield: true }); }
      catch (e) { console.error(e); toast('Couldn’t lay out the book: ' + esc(e.message || ''), 'warn'); return; }
      if (token !== PV.bookToken) return;
      PV.book = book; PV.trim = book.design.trim; PV.counts.paperback = book.pages.length;
      if (PV.format === 'paperback') { relayout(false); renderOptions(); }
      renderCounts(); renderStandards();
    }
    async function loadScope() {
      PV.blocks = PV.scope === 'doc' ? await docBlocks(S.docId, titleMode()) : await compileManuscript();
      PV.counts = {};
      PV.book = null;
      await rebuildBook();
      renderCounts();
      relayout(false);
      await measureAll();
      PV.counts[PV.format] = PV.pages;
      renderCounts();
    }
    $('#pv-scope', back).onchange = e => { PV.scope = e.target.value; PV.page = 0; loadScope(); };
    const titleLook = change => { Object.assign(S.project.style.headings.h1, change); applyStyle(); scheduleMeta(); refreshToolbar(); relayout(false); measureAll().then(() => { PV.counts[PV.format] = PV.pages; renderCounts(); }); };
    const favBtn = () => { const b = $('#pv-tfav', back); if (b) b.textContent = fontFavs().includes(S.project.style.headings.h1.font) ? '★' : '☆'; };
    $('#pv-tf', back).onchange = e => { titleLook({ font: e.target.value }); favBtn(); };
    $('#pv-tf', back).addEventListener('mousedown', async () => {
      if (Fonts.installed && Fonts.installed.size) return;
      await Fonts.loadInstalled(); const sel = $('#pv-tf', back); sel.innerHTML = fontOptionsHTML(S.project.style.headings.h1.font);
    });
    $('#pv-tfav', back).onclick = async () => {
      const fam = S.project.style.headings.h1.font, added = await toggleFontFav(fam);
      $('#pv-tf', back).innerHTML = fontOptionsHTML(fam); favBtn();
      toast(added ? `★ ${esc(fam)} added to your favourite fonts.` : `${esc(fam)} removed from your favourites.`);
    };
    $('#pv-tsz', back).onchange = e => titleLook({ size: +e.target.value });
    $('#pv-ta', back).onchange = e => titleLook({ align: e.target.value });
    $('#pv-tb', back).onclick = e => { const on = !S.project.style.headings.h1.bold; e.currentTarget.classList.toggle('on', on); titleLook({ bold: on }); };
    $('#pv-ti', back).onclick = e => { const on = !S.project.style.headings.h1.italic; e.currentTarget.classList.toggle('on', on); titleLook({ italic: on }); };
    $('#pv-titles', back).onchange = e => { S.project.style.chapterTitles = e.target.value; scheduleMeta(); titlesHint(); loadScope(); };
    // if chapters already begin with "Chapter 2: …", say so, so both don't end up in the book
    async function titlesHint() {
      const el = $('#pv-titles-hint', back); if (!el) return;
      const docs = []; walkTree(findNode('root-manuscript').node.children || [], n => { if (n.type === 'doc' && !isTitlePage(n.title)) docs.push(n); });
      let starts = 0, example = '';
      for (const n of docs.slice(0, 12)) {
        const html = n.id === S.docId ? editor.innerHTML : await api.loadDoc(S.slug, n.id);
        const first = (Clip.extract(Clip.parseHTML(html)).blocks.find(b => b.runs.some(r => (r.text || '').trim())) || { runs: [] }).runs.map(r => r.text || '').join('').trim();
        if (/^(chapter|prologue|epilogue|interlude)\b/i.test(first) && first.length < 140) { starts++; example = example || first; }
      }
      const many = docs.length && starts >= Math.min(docs.length, 12) / 2;
      el.innerHTML = many && titleMode() === 'names' ? `Your chapters already start with a heading like “${esc(example)}”, so the book will show both. Choose <b>The first line of each chapter</b> to use just that one.` : many && titleMode() === 'firstline' ? `Using each chapter’s own first line, like “${esc(example)}”, as its heading.` : '';
    }
    titlesHint();

    async function doExport(kind, btn) {
      const name = PV.scope === 'doc' ? findNode(S.docId).node.title : S.project.title;
      const settings = await api.getSettings().catch(() => ({}));
      const pageDoc = (g) => `<!doctype html><html><head><meta charset="utf-8"><title>${esc(name)}</title><style>
          body { margin: 0; } p, h1, h2, h3 { orphans: 2; widows: 2; } h1, h2, h3 { break-after: avoid; }
        </style></head><body>${Clip.exportFromBlocks(g.dropBlank ? PV.blocks.filter(b => b.runs.some(r => (r.text || '').trim())) : PV.blocks, g.style, { pageBreaks: true }).html}</body></html>`;
      if ((kind === 'pdf' || kind === 'exact') && PV.book) {
        const imp = await api.importedFonts().catch(() => []);
        const faces = imp.map(f => `@font-face{font-family:"${(Fonts.imported.find(i => i.file === f.file) || {}).family || f.file.replace(/\.[^.]+$/, '')}";src:url(data:font/${/otf$/i.test(f.file) ? 'otf' : /woff2$/i.test(f.file) ? 'woff2' : /woff$/i.test(f.file) ? 'woff' : 'ttf'};base64,${f.data})}`).join('');
        const html = TS.documentHTML(PV.book, faces);
        const size = { width: PV.book.geo.w, height: PV.book.geo.h };
        if (kind === 'exact') {
          btn.disabled = true; btn.textContent = 'Counting…';
          try { const n = await api.pdfPages(html, size, { raw: true }); btn.textContent = `Exact: ${fmt(n)} pages`; }
          catch { btn.textContent = 'Could not count'; }
          btn.disabled = false; return;
        }
        btn.disabled = true; const was = btn.textContent; btn.textContent = 'Making the PDF…';
        try { const r = await api.exportPDF(html, name, size, { raw: true }); if (r) window.UnwipStart && window.UnwipStart.done('export'); if (r) toast(`Print PDF saved (${fmt(r.pages)} page${r.pages === 1 ? "" : "s"}, ${esc(PV.book.design.trim)}).`, '', 6000); }
        finally { btn.disabled = false; btn.textContent = was; }
        return;
      }
      if (kind === 'pdf' || kind === 'exact' || kind === 'docpdf') {
        const g = geometry(kind === 'docpdf' ? 'docs' : 'paperback');
        const surname = (settings.author || '').trim().split(/\s+/).pop() || '';
        const opts = { margins: { top: g.mt, bottom: g.mb, left: g.ml, right: g.mr }, pageNumbers: !g.smf, font: g.style.font,
          header: g.smf ? `${surname ? surname + ' / ' : ''}${name.toUpperCase()} / ` : null };
        if (kind === 'exact') {
          btn.disabled = true; btn.textContent = 'Counting…';
          try { const n = await api.pdfPages(pageDoc(g), { width: g.w, height: g.h }, opts); btn.textContent = `Exact: ${fmt(n)} pages`; }
          catch { btn.textContent = 'Could not count'; }
          btn.disabled = false; return;
        }
        const r = await api.exportPDF(pageDoc(g), name, { width: g.w, height: g.h }, opts);
        if (r) window.UnwipStart && window.UnwipStart.done('export');
        if (r) toast(`PDF saved (${fmt(r.pages)} page${r.pages === 1 ? "" : "s"}).`);
      } else if (kind === 'epub') {
        const lang = ((await api.spellSettings().catch(() => ({ current: ['en'] }))).current[0]) || 'en';
        if (!S.project.epubId) { S.project.epubId = 'urn:uuid:' + crypto.randomUUID(); scheduleMeta(); }
        const bk = S.project.book || {};
        const typeset = TS ? { t: TS.resolved(bookDesign()), d: bookDesign(), book: bk } : null;
        const { bytes, chapters } = window.FolioEPUB.build({ blocks: PV.blocks, style: S.project.style, title: PV.scope === 'doc' ? name : (bk.title || name), author: bk.author || settings.author || '', lang, id: S.project.epubId, typeset: PV.scope === 'doc' ? null : typeset, systemBoxes: !!(S.settings.litrpg && S.settings.litrpg.on && S.settings.litrpg.ebook), systemShort: window.UnwipLitRPG ? window.UnwipLitRPG.shortStyle() : 'full' });
        const p = await api.exportBinary(bytes, name, 'epub', 'EPUB e-book');
        if (p) window.UnwipStart && window.UnwipStart.done('export');
        if (p) toast(`EPUB saved with ${chapters} chapter${chapters === 1 ? '' : 's'}.${settings.author ? '' : ' Tip: add your author name in Settings.'}`, '', 6000);
      } else if (kind === 'copy') {
        const out = Clip.exportFromBlocks(PV.blocks, PV.smf ? smfStyle() : exportSettings(), { pageBreaks: true, plainRuns: PV.smf });
        await api.clipboardWrite(out.html, out.text);
        toast('Copied. Paste into Google Docs or Word with Ctrl+V.');
        warnDocsFonts(PV.blocks, async map => { const o = Clip.exportFromBlocks(PV.blocks, exportSettings(), { pageBreaks: true, fontMap: map }); await api.clipboardWrite(o.html, o.text); toast('Copied with Docs-friendly fonts.'); });
      } else if (kind === 'docx') {
        const lang = ((await api.spellSettings().catch(() => ({ current: ['en-AU'] }))).current[0]) || 'en-AU';
        // a Word file keeps tracked changes as real Word tracked changes
        let wblocks = PV.blocks; Clip.keepChanges = true;
        try { wblocks = PV.scope === 'doc' ? await docBlocks(S.docId, titleMode()) : await compileManuscript(); } catch { wblocks = PV.blocks; } finally { Clip.keepChanges = false; }
        const bytes = window.FolioDOCX.build(wblocks, PV.smf ? smfStyle() : S.project.style, { title: name, author: settings.author || '', page: PV.docPage, smf: PV.smf, pageBreaks: true, lang });
        const p = await api.exportBinary(bytes, name, 'docx', 'Word document');
        if (p) window.UnwipStart && window.UnwipStart.done('export');
        if (p) toast(`Word file saved.${PV.smf ? ' It has the name / title / page header agents expect.' : ''} It also opens in Google Docs (upload it to Drive).`, '', 6000);
      } else if (kind === 'html') {
        const p = await api.exportHTML(pageDoc(geometry('docs')), name);
        if (p) window.UnwipStart && window.UnwipStart.done('export');
        if (p) toast('Saved. Open it in Word, or upload it to Google Drive and open with Google Docs.');
      }
    }

    $$('.pv-tabs button', back).forEach(b => b.classList.toggle('on', b.dataset.f === PV.format));
    renderOptions();
    await loadScope();
  }
  $('#btn-export').onclick = () => openPreview();
  // Export: every way to get the book out, grouped. One line each; the explanation shows at the bottom for the item
  // you point at (or reach with the arrow keys), so the menu stays short.
  $('#btn-export-more').onclick = e => {
    e.stopPropagation();
    const open = document.querySelector('.export-pop'); if (open) { open.remove(); return; }
    const groups = [
      ['Copy and paste', [
        ['copy', 'Copy for Docs', 'This chapter, ready to paste into Google Docs or Word.', 'Ctrl+Shift+C', () => copyDocForDocs()],
        ['boxes', 'Copy for Royal Road…', 'This chapter, with [system messages] as boxes Royal Road keeps.', '', () => window.UnwipRR && window.UnwipRR.open()]]],
      ['Check it', [
        ['preview', 'Preview & page counts', 'See it as a paperback, Kindle or Word page. Choose the whole book or this chapter there.', '', () => openPreview()]]],
      ['Publish', [
        ['doc', 'Print-ready PDF', 'Paperback interior with page numbers and chapter openers.', '', () => openPreview('paperback')],
        ['book', 'EPUB e-book', 'For Kindle (KDP), Apple Books and Kobo.', '', () => openPreview('ebook')],
        ['book', 'One Word file for Vellum or Atticus…', 'Each chapter a Heading 1, scene breaks as *** (not yet beta tested).', '', () => window.UnwipExportFolder && window.UnwipExportFolder.oneWord()]]],
      ['Share', [
        ['doc', 'Word document (.docx)', 'For an editor or agent.', '', () => openPreview('docs')],
        ['person', 'Send to a beta reader…', 'A Word file they mark up with Track Changes and comments.', '', () => window.UnwipReader && window.UnwipReader.send()],
        ['importic', 'Bring in a reader’s feedback…', 'Their changes and comments land in the right chapters.', '', () => window.UnwipReader && window.UnwipReader.receive()]]],
      ['Take it elsewhere', [
        ['folder', 'A folder of chapter files…', 'One Word or Markdown file per chapter, for Scrivener or any app.', '', () => window.UnwipExportFolder && window.UnwipExportFolder.open()],
        ['heart', 'No hard feelings…', 'Take your book to Scrivener or anywhere else. Nothing in Unwip is changed.', '', () => window.UnwipSendOut ? window.UnwipSendOut.open({ slug: S.slug }) : window.UnwipNoHardFeelings && window.UnwipNoHardFeelings.open()]]]
    ];
    const items = []; groups.forEach(g => g[1].forEach(x => items.push(x)));
    const NOTE = 'Point at an item to see what it does.';
    const pop = document.createElement('div'); pop.className = 'export-pop ex-grouped'; pop.setAttribute('role', 'menu');
    let k = 0;
    pop.innerHTML = groups.map(g => `<div class="ex-grp">${esc(g[0])}</div>` + g[1].map(x => `<button class="ex-item" role="menuitem" data-i="${k++}"><span class="ex-ic">${I[x[0]] || ''}</span><span class="ex-t"><b>${esc(x[1])}</b></span>${x[3] ? `<kbd>${x[3]}</kbd>` : ''}</button>`).join('')).join('') + `<p class="ex-note" id="ex-note">${NOTE}</p>`;
    document.body.appendChild(pop);
    const note = $('#ex-note', pop);
    const r = $('#export-split').getBoundingClientRect();
    pop.style.top = (r.bottom + 6) + 'px'; pop.style.left = Math.max(8, Math.min(innerWidth - pop.offsetWidth - 8, r.right - pop.offsetWidth)) + 'px';
    pop.style.maxHeight = Math.max(200, innerHeight - r.bottom - 14) + 'px'; pop.style.overflowY = 'auto';   // a short window: it scrolls instead of running off the bottom
    $$('.ex-item', pop).forEach(b => {
      const show = () => { note.textContent = items[+b.dataset.i][2]; };
      b.addEventListener('mouseenter', show); b.addEventListener('focus', show);
      b.onclick = () => { pop.remove(); items[+b.dataset.i][4](); };
    });
    pop.addEventListener('mouseleave', () => { if (!pop.contains(document.activeElement)) note.textContent = NOTE; });
    pop.addEventListener('keydown', ev => {
      const bs = $$('.ex-item', pop), at = bs.indexOf(document.activeElement);
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); bs[(at + (ev.key === 'ArrowDown' ? 1 : bs.length - 1)) % bs.length].focus(); }
      else if (ev.key === 'Escape') { pop.remove(); $('#btn-export-more').focus(); }
    });
    setTimeout(() => document.addEventListener('mousedown', function off(ev) { if (!pop.contains(ev.target)) { pop.remove(); document.removeEventListener('mousedown', off); } }), 0);
  };

  // ================================================================== STYLE SETTINGS
  function applyStyle() {
    const st = S.project.style;
    const q = Clip.quoteFamily;
    const set = (k, v) => editor.style.setProperty(k, v);
    set('--doc-font', q(st.font)); set('--doc-size', st.size + 'pt'); set('--doc-lh', st.lineHeight);
    set('--doc-indent', st.indent + 'in'); set('--doc-pspace', st.paraSpacing + 'pt'); set('--doc-align', st.justify ? 'justify' : 'left');
    for (const h of ['h1', 'h2', 'h3']) {
      const s = st.headings[h];
      set(`--${h}-font`, q(s.font)); set(`--${h}-size`, s.size + 'pt'); set(`--${h}-align`, s.align);
      set(`--${h}-weight`, s.bold ? 700 : 400); set(`--${h}-style`, s.italic ? 'italic' : 'normal');
      set(`--${h}-before`, s.spaceBefore + 'pt'); set(`--${h}-after`, s.spaceAfter + 'pt');
    }
    editor.classList.toggle('no-first-indent', !!st.noIndentFirst);
    $('#page').style.setProperty('--page-width', st.pageWidth + 'px');
    const t = $('#doc-title'), h1 = st.headings.h1;
    t.style.setProperty('--t-font', q(h1.font)); t.style.setProperty('--t-size', h1.size + 'pt');
    t.style.setProperty('--t-weight', h1.bold ? 700 : 400); t.style.setProperty('--t-style', h1.italic ? 'italic' : 'normal');
    t.style.setProperty('--t-align', h1.align);
    // the book font (bookfont.js) can also be used for synopses, cards and split view
    document.body.classList.toggle('book-font', !!st.displayFont);
    if (st.displayFont) document.body.style.setProperty('--book-font', q(st.displayFont)); else document.body.style.removeProperty('--book-font');
  }

  function langName(code) {
    try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || code; } catch { return code; }
  }
  function spellOptions(sp) {
    const list = [...sp.available].sort((a, b) => {
      const ea = a.startsWith('en'), eb = b.startsWith('en');
      return ea !== eb ? (ea ? -1 : 1) : langName(a).localeCompare(langName(b));
    });
    const cur = sp.current[0] || '';
    return list.map(c => `<option value="${esc(c)}" ${c === cur ? 'selected' : ''}>${esc(langName(c))}</option>`).join('');
  }
  async function dictionaryDialog() {
    const words = (await api.spellWords()).sort((a, b) => a.localeCompare(b));
    const body = document.createElement('div');
    const render = () => {
      body.innerHTML = words.length
        ? `<p>Words you've added (character and place names are added automatically). Remove any you added by mistake.</p><div class="dict-list">${words.map((w, i) => `<div class="dict-row"><span>${esc(w)}</span><button class="rc-btn ghost" data-i="${i}">Remove</button></div>`).join('')}</div>`
        : '<p>No words added yet. Right-click a word with a red underline and choose “Add to dictionary”.</p>';
      $$('.dict-row button', body).forEach(b => b.onclick = async () => { const w = words[+b.dataset.i]; await api.removeSpellWord(w); words.splice(+b.dataset.i, 1); render(); });
    };
    render();
    await modal({ title: 'Custom dictionary', body, buttons: [{ label: 'Done', value: true, kind: 'primary' }] });
  }

  // Manuscript style form: used in the side panel (changes show on the page straight away) and kept for the old dialog
  async function styleForm() {
    await Fonts.loadInstalled();
    const st = JSON.parse(JSON.stringify(S.project.style));
    const fontOptions = sel => {
      const fams = [...new Set([...Fonts.FAVOURITES.filter(f => Fonts.isAvailable(f)), ...Fonts.imported.map(i => i.family), ...(Fonts.installed ? [...Fonts.installed].sort() : [])])];
      if (!fams.includes(sel)) fams.unshift(sel);
      return fams.map(f => `<option ${f === sel ? 'selected' : ''}>${esc(f)}</option>`).join('');
    };
    const opt = (vals, cur) => vals.map(([v, l]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${l}</option>`).join('');
    const align = cur => opt([['left', 'Left'], ['center', 'Centre'], ['right', 'Right']], cur);
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="form-grid">
        <div class="section-label">Body text</div>
        <div class="field"><label>Font</label><select id="s-font">${fontOptions(st.font)}</select></div>
        <div class="field"><label>Size (pt)</label><input type="number" id="s-size" min="6" max="40" step="0.5" value="${st.size}"></div>
        <div class="field"><label>Line spacing</label><select id="s-lh">${opt([[1, 'Single'], [1.15, '1.15'], [1.5, '1.5'], [2, 'Double']].concat([1, 1.15, 1.5, 2].includes(+st.lineHeight) ? [] : [[st.lineHeight, String(st.lineHeight)]]).sort((a, b) => a[0] - b[0]), st.lineHeight)}</select></div>
        <div class="field"><label>First-line indent (inches)</label><input type="number" id="s-indent" min="0" max="2" step="0.05" value="${st.indent}"></div>
        <div class="field"><label>Space after paragraphs (pt)</label><input type="number" id="s-pspace" min="0" max="36" step="1" value="${st.paraSpacing}"></div>
        <div class="field"><label>Page width on screen</label><select id="s-width">${opt([[640, 'Narrow'], [760, 'Medium'], [900, 'Wide']], st.pageWidth)}</select></div>
        <div class="field full"><label>Empty lines in text you paste or import</label><select id="s-blank">${opt([['keep', 'Keep them where they are'], ['tidy', 'Take them out (two or more in a row become a scene break)']], st.blankLines === 'keep' ? 'keep' : 'tidy')}</select></div>
        <label class="check"><input type="checkbox" id="s-justify" ${st.justify ? 'checked' : ''}> Justify text</label>
        <label class="check"><input type="checkbox" id="s-nofirst" ${st.noIndentFirst ? 'checked' : ''}> No indent after headings and scene breaks</label>
        <div class="field full"><label>Chapter titles when copying and exporting</label><select id="s-titles">${[['names', 'Document names from the binder'], ['firstline', 'The first line of each chapter (e.g. “Chapter 2: …”)'], ['none', 'Don’t add titles']].map(([v, l]) => `<option value="${v}" ${titleMode() === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        ${['h1', 'h2'].map(h => `
          <div class="section-label">${h === 'h1' ? 'Heading 1 (chapter titles)' : 'Heading 2'}</div>
          <div class="field"><label>Font</label><select id="s-${h}-font">${fontOptions(st.headings[h].font)}</select></div>
          <div class="field"><label>Size (pt)</label><input type="number" id="s-${h}-size" min="6" max="72" step="0.5" value="${st.headings[h].size}"></div>
          <div class="field"><label>Alignment</label><select id="s-${h}-align">${align(st.headings[h].align)}</select></div>
          <div class="field" style="display:flex;gap:14px;align-items:flex-end;padding-bottom:6px">
            <label class="check"><input type="checkbox" id="s-${h}-bold" ${st.headings[h].bold ? 'checked' : ''}> Bold</label>
            <label class="check"><input type="checkbox" id="s-${h}-italic" ${st.headings[h].italic ? 'checked' : ''}> Italic</label>
          </div>`).join('')}
      </div>`;
    const read = () => {
      const v = id => $('#' + id, body).value, c = id => $('#' + id, body).checked;
      st.font = v('s-font'); st.size = +v('s-size') || 12; st.lineHeight = +v('s-lh'); st.indent = +v('s-indent'); st.paraSpacing = +v('s-pspace'); st.blankLines = v('s-blank');
      st.pageWidth = +v('s-width'); st.justify = c('s-justify'); st.noIndentFirst = c('s-nofirst'); st.chapterTitles = v('s-titles'); st.titlesAsHeadings = st.chapterTitles !== 'none';
      for (const h of ['h1', 'h2']) {
        Object.assign(st.headings[h], { font: v(`s-${h}-font`), size: +v(`s-${h}-size`) || st.headings[h].size, align: v(`s-${h}-align`), bold: c(`s-${h}-bold`), italic: c(`s-${h}-italic`) });
      }
      st.headings.h3.font = st.headings.h2.font;
      return st;
    };
    return { body, read };
  }
  function applyStyleNow(st) { S.project.style = st; applyStyle(); scheduleMeta(); refreshToolbar(); }
  $('#btn-style').onclick = async () => {
    if (window.UnwipSide) { window.UnwipSide.open('style'); return; }
    const f = await styleForm();
    const ok = await modal({ title: 'Manuscript style', body: f.body, wide: true, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Save', value: true, kind: 'primary' }] });
    if (ok) applyStyleNow(f.read());
  };

  // ================================================================== SETTINGS (app-wide)
  async function openSettings() {
    const sp = await api.spellSettings().catch(() => ({ available: [], current: [], enabled: true }));
    const cfg = S.settings;
    const opt = (vals, cur) => vals.map(([v, l]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${l}</option>`).join('');
    const theme = localStorage.getItem('folio-theme') || 'system';
    const body = document.createElement('div');
    body.innerHTML = `
      <nav class="set-jump" aria-label="Settings sections"></nav>
      <div class="form-grid">
        <div class="section-label">You</div>
        <div class="field"><label>Author name (used on title pages and e-books)</label><input type="text" id="g-author" value="${esc(cfg.author || '')}" placeholder="e.g. Ima Novelist"></div>
        <div class="field"><label>Daily writing goal (all books)</label><input type="number" id="g-daily" min="0" step="50" value="${cfg.dailyGoal || ''}" placeholder="e.g. 1000"></div>
        <div class="field full"><label>Goal colours (the rings on the main screen and in Goals)</label><div class="gc-pick" id="g-colors"></div></div>
        <label class="check full"><input type="checkbox" id="g-impguide" ${cfg.importGuide !== false ? 'checked' : ''}> Guide me through imports, one step at a time</label>
        <label class="check full"><input type="checkbox" id="g-quotes" ${cfg.quotes !== false ? 'checked' : ''}> Show quotes from writers (front page, writer mode, sprints, goals)</label>
        <div class="section-label">Appearance</div>
        <div class="field"><label>Theme and colours</label><button class="btn" id="s-themes" type="button">Themes &amp; colours…</button></div>
        <label class="check full"><input type="checkbox" id="g-binderauto" ${(window.UnwipSide && window.UnwipSide.binderAuto()) ? 'checked' : ''}> Hide the left panel while Revise or the side panel is open <span class="hint" style="display:inline">(it comes back when you close them)</span></label>
        <div class="field"><label>Typing feel</label><button class="btn" id="s-typing" type="button">Typewriter &amp; animations…</button></div>
        <div class="field full"><label>Fonts</label><div class="set-row"><button class="btn" id="s-bookfont" type="button">Font for the whole book…</button><button class="btn" id="s-import" type="button">Import font files…</button></div>
          <div class="hint">The font while you write: side panel › Style (or the font box in the toolbar). Fonts for print: Export › Preview › Paperback (Book design).</div></div>
        <div class="section-label">Name suggestions</div>
        <label class="check"><input type="checkbox" id="s-ac" ${acPrefs().on ? 'checked' : ''}> Suggest character, place and item names as I type</label>
        <div class="field"><label>Start suggesting after</label><select id="s-acmin">${opt([[2, '2 letters'], [3, '3 letters'], [4, '4 letters']], acPrefs().min)}</select></div>
        <div class="section-label">Language &amp; spelling</div>
        ${api.web ? `<div class="field full"><label>Spelling language</label><div class="hint" style="padding-top:4px">${(/iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)) ? 'Your iPhone or iPad checks spelling in the languages of its keyboards, and Unwip can’t change that. To check another language, add its keyboard: Settings › General › Keyboard › Keyboards › Add New Keyboard, then switch to it with the 🌐 key while you write.' : 'This browser checks spelling in your device’s languages. Add a language in your device or browser settings to check it too.'}</div></div>` : `<div class="field"><label>Spelling language</label>${sp.available.length ? `<select id="s-lang">${spellOptions(sp)}</select>` : `<div style="padding-top:8px;color:var(--muted)">${api.platform === 'darwin' ? 'Uses your Mac’s spelling languages (System Settings › Keyboard › Text Input)' : 'Uses your Windows language settings'}</div>`}</div>
        <div class="field"><label>Custom dictionary</label><button class="btn" id="s-dict" type="button">Manage added words…</button></div>`}
        <label class="check full"><input type="checkbox" id="s-dash" ${smartDash() ? 'checked' : ''}> Turn two hyphens (--) into an em dash (—) as I type</label>
        <label class="check full"><input type="checkbox" id="s-spell" ${sp.enabled ? 'checked' : ''}> Underline spelling mistakes</label>
        <div class="section-label">Autocorrect <span class="sl-now">· applies straight away</span></div>
        <div class="field full" id="s-autocorrect">${window.UnwipAutocorrect ? window.UnwipAutocorrect.settingsHTML() : ''}</div>
        <div class="section-label">LitRPG and text shortcuts <span class="sl-now">· applies straight away</span></div>
        <div class="field full" id="s-litrpg"></div>
        <div class="section-label">Licence <span class="sl-now">· applies straight away</span></div>
        <div class="field full" id="s-licence"></div>
        <div class="section-label">Help</div>
        <div class="field"><label>New here, or showing someone?</label><button class="btn" id="g-intro" type="button">Welcome setup…</button></div>
        <div class="field"><label>A quick look around a book</label><button class="btn" id="g-tour" type="button">Take the tour</button></div>
        <div class="field"><label>What everything does, and keyboard shortcuts</label><button class="btn" id="g-help" type="button">Open Help (F1)</button></div>
        <div class="section-label">What’s new</div>
        <div class="field full" id="s-news"></div>
<div class="pc-only">        <div class="section-label">Updates</div>
        <label class="check"><input type="checkbox" id="g-autoup" ${cfg.autoUpdate !== false ? 'checked' : ''}> Install updates automatically</label>
        <div class="field"><label id="g-version">Unwip</label><button class="btn" id="g-checkup" type="button">Check for updates now</button></div>
</div>
        <div class="section-label">Where your books live <span class="sl-now">· applies straight away</span></div>
        <div class="field full" id="s-lib"><label>Loading…</label></div>
        <div class="section-label">Extra backup copy <span class="sl-now">· applies straight away</span></div>
        <div class="field full" id="s-extra"></div>
      </div>`;
    // a row of section names at the top: every setting stays on the one page, this only jumps to it
    const jump = $('.set-jump', body);
    $$('.form-grid > .section-label, .form-grid > .pc-only > .section-label', body).filter(l => l.offsetParent !== null || !l.closest('.pc-only') || !api.web).forEach(l => {
      const name = l.firstChild.textContent.trim(), b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = name;
      b.onclick = () => l.scrollIntoView({ behavior: 'smooth', block: 'start' }); jump.appendChild(b);
    });
    $('#s-import', body).onclick = importFonts;
    $('#s-bookfont', body).onclick = () => { if (!S.project) return toast('Open a book first, then choose its font here (you can apply it to every book from there).'); body.closest('.modal-back').remove(); window.UnwipBookFont && window.UnwipBookFont.open(); };
    // goal colours: pick a ring, then its colour (like the accent colour in Themes); saved with Save
    const gcDraft = Object.assign({}, cfg.goalColors || {}); let gcKey = 'today';
    const GC_NAMES = { today: 'Today', week: 'This week', book: 'Manuscript' };
    const gcCol = k => gcDraft[k] || GOAL_DEFAULT[k] || 'var(--accent)';
    const drawGC = () => {
      const box = $('#g-colors', body); if (!box) return;
      const cur = gcDraft[gcKey] || '';
      box.innerHTML = `<div class="gc-rings">${Object.keys(GC_NAMES).map(k => `<button type="button" class="gc-ring ${k === gcKey ? 'on' : ''}" data-k="${k}"><i style="--c:${gcCol(k)}"></i>${GC_NAMES[k]}</button>`).join('')}</div>
        <div class="th-accents"><button type="button" class="th-acc def ${!cur ? 'on' : ''}" data-a="" title="This ring's own colour">Auto</button>${GOAL_SWATCHES.map(a => `<button type="button" class="th-acc ${cur === a ? 'on' : ''}" data-a="${a}" style="--a:${a}" title="${a}"></button>`).join('')}
          <label class="th-custom" title="Pick any colour"><input type="color" id="gc-color" value="${/^#[0-9a-f]{6}$/i.test(gcCol(gcKey)) ? gcCol(gcKey) : '#34528a'}"> Custom</label></div>`;
      box.querySelectorAll('.gc-ring').forEach(b => b.onclick = () => { gcKey = b.dataset.k; drawGC(); });
      box.querySelectorAll('.th-acc').forEach(b => b.onclick = () => { if (b.dataset.a) gcDraft[gcKey] = b.dataset.a; else delete gcDraft[gcKey]; drawGC(); });
      $('#gc-color', box).oninput = e => { gcDraft[gcKey] = e.target.value; box.querySelector('.gc-ring.on i').style.setProperty('--c', e.target.value); box.querySelectorAll('.th-acc').forEach(x => x.classList.remove('on')); };
    };
    drawGC();
    $('#s-themes', body).onclick = () => window.UnwipLook && window.UnwipLook.openThemes();
    $('#s-typing', body).onclick = () => window.UnwipLook && window.UnwipLook.openTyping();
    if ($('#s-dict', body)) $('#s-dict', body).onclick = dictionaryDialog;
    if (window.UnwipAutocorrect && $('#s-autocorrect', body)) window.UnwipAutocorrect.wireSettings($('#s-autocorrect', body));
    if (window.UnwipSync) window.UnwipSync.settingsSection(body);
    if (window.UnwipLicence) window.UnwipLicence.settingsSection(body);
    if (window.UnwipLitRPG) window.UnwipLitRPG.settingsSection(body);
    $('#g-intro', body).onclick = () => { body.closest('.modal-back').remove(); window.UnwipIntro && window.UnwipIntro.start(); };
    $('#g-tour', body).onclick = () => { body.closest('.modal-back').remove(); window.UnwipIntro && window.UnwipIntro.tour(); };
    $('#g-help', body).onclick = () => { body.closest('.modal-back').remove(); window.UnwipHelp && window.UnwipHelp.open(); };
    const news = $('#s-news', body); if (news && window.UnwipUpdates) news.innerHTML = window.UnwipUpdates.newsHTML();
    api.updateState().then(st => { const l = $('#g-version', body); if (l) { const u = window.UnwipUpdates && window.UnwipUpdates.status ? window.UnwipUpdates.status() : {}; const ago = u.lastCheck ? Math.round((Date.now() - u.lastCheck) / 60000) : null; l.textContent = `You have Unwip ${st.current}` + (st.status === 'ready' ? ` · ${st.version} is installed, restart to use it` : u.lastError ? ` · the last check failed: ${u.lastError}` : ago != null ? ` · checked ${ago < 1 ? 'just now' : ago + ' min ago'}` : ''); } if (news && window.UnwipUpdates && st.current) news.innerHTML = window.UnwipUpdates.newsHTML(st.current); }).catch(() => {});
    $('#g-checkup', body).onclick = () => { window.UnwipUpdates && window.UnwipUpdates.checkNow(); };
    const ok = await modal({ title: 'Settings', body, wide: true, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Save', value: true, kind: 'primary' }] });
    if (!ok) return;
    const v = id => $('#' + id, body).value, c = id => $('#' + id, body).checked;
    S.settings = await api.setSettings({ author: v('g-author').trim(), dailyGoal: Math.max(0, +v('g-daily') || 0), goalColors: gcDraft, importGuide: c('g-impguide'), quotes: c('g-quotes'), autoUpdate: c('g-autoup'), binderAuto: c('g-binderauto') }); if (window.UnwipSide) window.UnwipSide.layout();
    try { localStorage.setItem('folio-ac', JSON.stringify({ on: c('s-ac'), min: +v('s-acmin') })); } catch {}
    try { localStorage.setItem('folio-dash', c('s-dash') ? 'on' : 'off'); } catch {}
    const langSel = $('#s-lang', body);
    const newLangs = langSel ? [langSel.value] : sp.current;
    if ((langSel && newLangs[0] !== sp.current[0]) || c('s-spell') !== sp.enabled) {
      await api.setSpell(newLangs, c('s-spell'));
      editor.spellcheck = false; requestAnimationFrame(() => { editor.spellcheck = c('s-spell'); });
      if (langSel && newLangs[0] !== sp.current[0]) toast(`Spelling language: ${esc(langName(newLangs[0]))}. The first time, Unwip may need the internet once to download that dictionary.`, '', 6000);
    }
    if (S.project) updateStatus(); else showLibrary();
  }
  $('#btn-settings').onclick = openSettings;
  $('#btn-settings-lib').onclick = openSettings;

  // ================================================================== WRITER MODE
  async function setWriter(on) {
    const was = document.body.classList.contains('writer');
    if (on === was) return;
    document.body.classList.toggle('writer', on);
    renderSprint();
    if (!on && S.sprintDone) setTimeout(showPendingSprint, 250);   // a sprint finished while writing: its result now
    await api.fullscreen(on);
    if (on) { editor.focus(); typewriterScroll(true); writerQuote(); }
    emit('writer', on);
  }
  // Typewriter scrolling: keep the line you're typing on at the same height on screen.
  // Settings live in look.js (Typing & typewriter); without it, it's on in writer mode only.
  function typewriterActive() { const L = window.UnwipLook; return L ? L.typewriterActive() : document.body.classList.contains('writer'); }
  let twAnim = null;
  function typewriterScroll(instant) {
    const sel = getSelection(); if (!sel.rangeCount || !editor.contains(sel.anchorNode)) return;
    const L = window.UnwipLook;
    // the caret's own line; a whole paragraph's box is only a last resort (its top can be many lines above the caret)
    let rect = L && L.caretRect ? L.caretRect(sel) : null;
    if (!rect) { const r = sel.getRangeAt(0).cloneRange(); r.collapse(true); rect = r.getBoundingClientRect(); }
    if (!rect || !rect.height) { const b = currentBlock(sel.anchorNode); if (!b) return; const br = b.getBoundingClientRect(); rect = { top: br.top, height: Math.min(br.height, parseFloat(getComputedStyle(b).lineHeight) || 24) }; }
    const wrap = editorWrap.getBoundingClientRect();
    const target = wrap.top + wrap.height * (L ? L.typewriterPosition() : 0.45);
    const delta = rect.top - target;
    if (Math.abs(delta) < 2) return;
    cancelAnimationFrame(twAnim);
    // where it can actually go (near the top or end of a chapter the page can't move all the way): nothing to do if it's already there
    const from = editorWrap.scrollTop, to = Math.max(0, Math.min(editorWrap.scrollHeight - editorWrap.clientHeight, from + delta));
    if (Math.abs(to - from) < 1) return;
    if (instant || !L || !L.smoothScroll()) { editorWrap.scrollTop = to; return; }
    const t0 = performance.now(), dur = 160;
    // (the first frame's clock can read a moment before t0: without the floor at 0 it moved the page the wrong way first,
    // which was the "jumping up and down" in Writer mode)
    const step = now => { const k = Math.max(0, Math.min(1, (now - t0) / dur)); editorWrap.scrollTop = from + (to - from) * (1 - Math.pow(1 - k, 3)); if (k < 1) twAnim = requestAnimationFrame(step); };
    twAnim = requestAnimationFrame(step);
  }
  // When the window changes size (a Mac takes most of a second to slide into full screen, and the page's top gap is
  // measured in screen height) keep the line you're on where it was, instead of letting the next key press yank it.
  let twResize = 0;
  new ResizeObserver(() => {
    if (!typewriterActive() || document.activeElement !== editor) return;
    cancelAnimationFrame(twResize); twResize = requestAnimationFrame(() => typewriterScroll(true));
  }).observe(editorWrap);
  $('#btn-writer').onclick = () => setWriter(true);

  // ================================================================== FIND
  const findbar = $('#findbar'), findInput = $('#find-input');
  function openFind() {
    findbar.classList.remove('hidden');
    const sel = getSelection().toString().trim();
    if (sel && sel.length < 60) findInput.value = sel;
    findInput.focus(); findInput.select();
  }
  // Find looks only in the chapter's text and highlights matches itself (all soft, the current one strong). The PC used to
  // use the browser's find, which also matched the buttons and binder, and took the focus out of the box after every
  // key, so Backspace stopped after each letter. Now you can type or backspace freely; Enter goes to the next match.
  let findState = { text: '', idx: -1 }, findTimer = 0;
  function findRanges(text) {
    if (!text) return [];
    const needle = text.toLowerCase(), out = [];
    const tw = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      const hay = n.data.toLowerCase(); let i = hay.indexOf(needle);
      while (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + text.length); out.push(r); i = hay.indexOf(needle, i + needle.length); }
    }
    return out;
  }
  function clearFindMarks() { try { CSS.highlights.delete('unwip-find'); CSS.highlights.delete('unwip-find-cur'); } catch {} findState = { text: '', idx: -1 }; }
  function closeFind() { clearTimeout(findTimer); findbar.classList.add('hidden'); $('#find-count').textContent = ''; clearFindMarks(); restoreRange(); }
  function runFind(forward = true, next = true) {
    clearTimeout(findTimer);
    const t = findInput.value, count = $('#find-count');
    if (!t) { count.textContent = ''; clearFindMarks(); return; }
    const rs = findRanges(t);
    if (!rs.length) { clearFindMarks(); count.textContent = 'No matches'; return; }
    let idx = findState.text === t && next ? findState.idx + (forward ? 1 : -1) : findState.text === t ? findState.idx : 0;
    idx = (idx + rs.length) % rs.length;
    findState = { text: t, idx };
    try { if (window.Highlight && CSS.highlights) { CSS.highlights.set('unwip-find', new Highlight(...rs)); CSS.highlights.set('unwip-find-cur', new Highlight(rs[idx])); } } catch {}
    const el = rs[idx].startContainer.parentElement;
    if (el) el.scrollIntoView({ block: 'center', behavior: next ? 'smooth' : 'auto' });
    count.textContent = `${idx + 1} of ${rs.length}`;
  }
  // typing in the box: wait for a short pause, so backspacing over a word doesn't search after every key
  findInput.addEventListener('input', () => { clearTimeout(findTimer); if (!findInput.value) { $('#find-count').textContent = ''; clearFindMarks(); return; } findTimer = setTimeout(() => runFind(true, false), 250); });
  findInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); runFind(!e.shiftKey, findState.text === findInput.value); }
    if (e.key === 'Escape') { e.preventDefault(); closeFind(); }
  });
  $('#find-next').onclick = () => runFind(true, true);
  $('#find-prev').onclick = () => runFind(false, true);
  $('#find-close').onclick = closeFind;


  // ================================================================== REVISION MODE
  const Rev = window.FolioRevise;
  const hasHighlights = !!(window.CSS && CSS.highlights && window.Highlight);
  let revTimer = null, revResult = null;
  const revJump = {};
  function revisePrefs() {
    try { return JSON.parse(localStorage.getItem('folio-revise') || '{}'); } catch { return {}; }
  }
  function saveRevisePrefs(p) { try { localStorage.setItem('folio-revise', JSON.stringify(p)); } catch {} }
  // Main checks: the five big things; All checks: every check. Follows the book's level (Focus, or Detail and up) until changed here.
  function reviseLevel() { if (document.documentElement.classList.contains('m-phone')) return 'focused'; const p = revisePrefs(); return p.level || (level() >= 1 ? 'detailed' : 'focused'); }
  function catShown(id) { if (id === 'more' && !window.UnwipHarper) return false; return reviseLevel() === 'detailed' || !!Rev.CATS.find(c => c.id === id).focused; }
  function catOn(id) { if (!catShown(id)) return false; const p = revisePrefs(); return p[id] !== undefined ? p[id] : Rev.CATS.find(c => c.id === id).on; }
  $$('#rp-level button').forEach(b => b.onclick = () => { const p = revisePrefs(); p.level = b.dataset.l; saveRevisePrefs(p); runRevise(); });

  // only the revision highlights (other modules use their own: focus fading, letter animations, comments)
  function clearRvHighlights() { if (!(window.CSS && CSS.highlights)) return; for (const k of [...CSS.highlights.keys()]) if (k.startsWith('rv-')) CSS.highlights.delete(k); }
  // Revise or the side panel next to a split view squeezes the chapter into a thin strip: close the split view
  // (a chapter popped out into its own window is left alone). Revise always closes it; other panels only when the
  // chapter would get too narrow to write in.
  function makeRoom(always) {
    if (!S.splitId || $('#split-pane').classList.contains('hidden')) return;
    const go = () => { closeSplit(); toast('Split view closed to make room. Open it again with the split button (Ctrl+\\).', '', 5000); };
    if (always) return go();
    requestAnimationFrame(() => { const pg = editor.closest('.page') || editor; const w = pg.getBoundingClientRect().width; if (w && w < 480) go(); });
  }
  function setRevise(on) {
    if (on) { emit('revise', true); makeRoom(true); }
    S.revise = !!on;
    $('#revise-panel').classList.toggle('hidden', !on);
    $('#btn-revise').classList.toggle('on', !!on);
    if (on) { if (!hasHighlights) toast('Revision highlights need a newer app engine.'); runRevise(); }
    else { if (hasHighlights) clearRvHighlights(); hideTip(); revResult = null; }
  }
  $('#btn-revise').onclick = () => setRevise(!S.revise);
  { const rb = $('#btn-revise'); if (rb && !rb.querySelector('svg')) rb.innerHTML = I.revise + '<span>Revise</span>'; }
  $('#rp-close').onclick = () => setRevise(false);

  function scheduleRevise() { clearTimeout(revTimer); revTimer = setTimeout(runRevise, 450); }
  if (window.UnwipHarper) window.UnwipHarper.onReady(() => { if (S.revise) runRevise(); });
  function nameWords() { return new Set(window.FolioNames.allWords().map(w => w.toLowerCase())); }

  function runRevise() {
    clearTimeout(revTimer);
    if (!S.revise || !S.docId) return;
    if (!S.spellPrefer) { S.spellPrefer = 'uk'; S.spellDialect = 'uk'; api.spellSettings().then(x => { const l = (x.current || [])[0] || ''; S.spellPrefer = /en-(US|CA)/i.test(l) ? 'us' : 'uk'; S.spellDialect = /en-US/i.test(l) ? 'us' : /en-CA/i.test(l) ? 'ca' : /en-AU|en-NZ/i.test(l) ? 'au' : /en-IN/i.test(l) ? 'in' : 'uk'; }).catch(() => {}); }
    if (window.UnwipHarper) window.UnwipHarper.setDialect(S.spellDialect);
    revResult = Rev.analyse(editor, { names: nameWords(), ignored: new Set(S.project.reviseIgnored || []), spellingPrefer: S.spellPrefer, harper: catOn('more') });
    // a very hard sentence is not also listed as hard
    if (hasHighlights) {
      clearRvHighlights();
      for (const c of Rev.CATS) {
        if (!catOn(c.id)) continue;
        const ranges = revResult.issues.filter(i => i.cat === c.id).map(i => i.range);
        if (ranges.length) CSS.highlights.set('rv-' + c.id, new Highlight(...ranges));
      }
    }
    renderRevisePanel();
    S.revCheckedAt = Date.now(); updateChecked();
  }
  function updateChecked() {
    if (!S.revCheckedAt) return;
    const sec = Math.round((Date.now() - S.revCheckedAt) / 1000);
    $('#rp-checked').textContent = sec < 10 ? '· checked just now' : sec < 60 ? `· checked ${sec}s ago` : `· checked ${Math.round(sec / 60)} min ago`;
  }
  setInterval(() => { if (S.revise) updateChecked(); }, 10000);
  $('#rp-refresh').onclick = () => {
    const btn = $('#rp-refresh'); btn.classList.add('spin');
    scheduleNames(0);
    setTimeout(() => { runRevise(); btn.classList.remove('spin'); }, 250);
  };

  function renderRevisePanel() {
    if (!revResult) return;
    const st = revResult.stats;
    $('#rp-grade').textContent = st.words ? st.grade : '–';
    $('#rp-grade-label').textContent = st.words ? `Grade ${st.grade} · ${Rev.gradeLabel(st.grade)}` : 'Reading grade';
    $('#rp-stats').innerHTML = [
      [fmt(st.words), 'words'], [fmt(st.sentences), 'sentences'],
      [st.avgSentence, 'words per sentence'], [`${st.readingMinutes} min`, 'reading time']
    ].map(([b, l]) => `<div class="rp-stat"><b>${b}</b><span>${l}</span></div>`).join('');
    const nIgn = (S.project.reviseIgnored || []).length;
    const ign = $('#rp-ignored');
    ign.innerHTML = nIgn ? `${nIgn} highlight${nIgn === 1 ? '' : 's'} ignored in this project. <a href="#" id="rp-unignore">Show them again</a>` : '';
    if (nIgn) $('#rp-unignore').onclick = e => { e.preventDefault(); S.project.reviseIgnored = []; scheduleMeta(); runRevise(); };
    const cats = $('#rp-cats');
    cats.innerHTML = '';
    $$('#rp-level button').forEach(b => b.classList.toggle('on', b.dataset.l === reviseLevel()));
    for (const c of Rev.CATS) {
      if (!catShown(c.id)) continue;
      const count = revResult.issues.filter(i => i.cat === c.id).length;
      const on = catOn(c.id);
      const row = document.createElement('div');
      row.className = 'rp-cat' + (on ? '' : ' off') + (count ? '' : ' zero');
      row.title = c.hint + (count ? ' Click to jump through them.' : '');
      const busy = c.id === 'more' && on && revResult.pendingMore;
      row.innerHTML = `<input type="checkbox" ${on ? 'checked' : ''} title="Show or hide these highlights"><span class="sw ${c.id}"></span><span class="nm">${esc(c.label)}</span><span class="ct">${busy ? '<span class="rp-busy" title="Still checking…">…</span>' : ''}${count}</span>`;
      $('input', row).addEventListener('click', e => {
        e.stopPropagation();
        const p = revisePrefs(); p[c.id] = e.target.checked; saveRevisePrefs(p); runRevise();
      });
      row.addEventListener('click', () => jumpTo(c.id));
      cats.appendChild(row);
    }
  }

  function jumpTo(cat) {
    if (!revResult) return;
    const list = revResult.issues.filter(i => i.cat === cat);
    if (!list.length) return;
    revJump[cat] = ((revJump[cat] ?? -1) + 1) % list.length;
    const issue = list[revJump[cat]];
    // put the cursor at the start of it so you can fix it straight away. First, and without letting the focus
    // scroll: an iPad scrolls back to where the cursor was when the page takes the focus, which undid the jump
    // (beta, 29 Oct). Then scroll to it, and again once the iPad has settled.
    const r = issue.range.cloneRange(); r.collapse(true);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    try { editor.focus({ preventScroll: true }); } catch { editor.focus(); }
    if (getSelection().rangeCount === 0 || !editor.contains(getSelection().anchorNode)) { const s2 = getSelection(); s2.removeAllRanges(); s2.addRange(r); }
    if (hasHighlights) {
      CSS.highlights.set('rv-focus', new Highlight(issue.range));
      clearTimeout(jumpTo.t); jumpTo.t = setTimeout(() => CSS.highlights.delete('rv-focus'), 1600);
    }
    jumpQuietUntil = Date.now() + 900;   // the jump's own scrolling doesn't close the reason
    const go = () => {
      const rect = issue.range.getBoundingClientRect(), wrap = editorWrap.getBoundingClientRect();
      if (rect.top < wrap.top + 20 || rect.bottom > wrap.bottom - 20 || Math.abs(rect.top - wrap.top - wrap.height * 0.35) > wrap.height * 0.2) editorWrap.scrollTop += rect.top - wrap.top - wrap.height * 0.35;
      const at = issue.range.getBoundingClientRect();
      showTip(issue.msg, at.left, at.bottom + 6);
    };
    go(); requestAnimationFrame(go); clearTimeout(jumpTo.t2); jumpTo.t2 = setTimeout(go, 350);
    clearTimeout(hideTip.t); hideTip.t = setTimeout(hideTip, 2900);
  }
  let jumpQuietUntil = 0;

  // ---- hover card: why it's marked, an example, and fixes where a rule can be sure
  const tip = $('#rv-tip');
  let cardIssues = [], cardHideTimer = null;
  const CAT_LABEL = Object.fromEntries(Rev.CATS.map(c => [c.id, c.label]));
  function showTip(text, x, y) {   // simple text tip (used after jumping)
    tip.className = 'rv-tip'; tip.textContent = text; tip.classList.remove('hidden');
    placeTip(x, y);
  }
  function placeTip(x, y, above) {
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(x, innerWidth - w - 8)) + 'px';
    tip.style.top = (y + h > innerHeight - 36 ? Math.max(8, (above ?? y) - h - 8) : y) + 'px';
  }
  function hideTip() { tip.classList.add('hidden'); cardIssues = []; }
  function previewHTML(p) {
    return `<div class="rc-prev">${esc(p.before)}${p.removed ? `<del>${esc(p.removed)}</del>` : ''}${p.added ? `<ins>${esc(p.added)}</ins>` : ''}${esc(p.after)}</div>`;
  }
  // When the cards pop up (beta, 29 Oct): Show (as before), Tap twice (one tap puts the cursor in, a second tap on the
  // same highlight opens the card; on a PC a click in a highlight you're already in) or Off; and the "e.g." lines on
  // or off (off unless turned on). Kept on this device for every book.
  const CARDS_LS = 'unwip-rv-cards';
  const cardsCfg = () => { try { const v = JSON.parse(localStorage.getItem(CARDS_LS) || '{}'); return { mode: ['show', 'twice', 'off'].includes(v.mode) ? v.mode : 'show', examples: v.examples === true }; } catch { return { mode: 'show', examples: false }; } };
  function setCards(ch) { const v = { ...cardsCfg(), ...ch }; try { localStorage.setItem(CARDS_LS, JSON.stringify(v)); } catch {} renderCardsCfg(); }
  function renderCardsCfg() {
    const c = cardsCfg();
    $$('#rp-cards-mode button').forEach(b => b.classList.toggle('on', b.dataset.m === c.mode));
    const ex = $('#rp-cards-ex'); if (ex) ex.checked = c.examples;
  }
  $$('#rp-cards-mode button').forEach(b => { b.onclick = () => { setCards({ mode: b.dataset.m }); if (b.dataset.m !== 'show') { hideTip(); lastKey = ''; } }; });
  { const ex = $('#rp-cards-ex'); if (ex) ex.onchange = () => setCards({ examples: ex.checked }); }
  renderCardsCfg();
  let armedKey = '';
  function showCard(issues, rect) {
    cardIssues = issues;
    const showEx = cardsCfg().examples;
    tip.className = 'rv-tip rv-card';
    tip.innerHTML = issues.map((is, i) => `
      <div class="rc">
        <div class="rc-cat"><span class="sw ${is.cat}"></span>${esc(CAT_LABEL[is.cat])}</div>
        <div class="rc-msg">${esc(is.msg)}</div>
        ${is.preview ? previewHTML(is.preview) : ''}
        ${showEx && is.example && !is.preview && !is.fixes.length ? `<div class="rc-ex"><span>e.g.</span> ${esc(is.example[0])}<br><span>→</span> ${esc(is.example[1])}</div>` : ''}
        <div class="rc-actions">
          ${is.fixes.map((f, j) => `<button class="rc-btn primary" data-i="${i}" data-fix="${j}">${esc(f.label)}</button>`).join('')}
          ${is.prev ? `<button class="rc-btn" data-i="${i}" data-act="prev">Show earlier use</button>` : ''}
          <button class="rc-btn ghost" data-i="${i}" data-act="ignore" title="Hide this one">Ignore</button>
          ${is.canIgnoreAll ? `<button class="rc-btn ghost" data-i="${i}" data-act="ignoreall" title="Never flag this word for this reason in this book">Ignore “${esc(is.word.length > 18 ? is.word.slice(0, 18) + '…' : is.word)}” everywhere</button>` : ''}
        </div>
      </div>`).join('') + `<button class="rc-off" type="button" data-act="cardsoff">Stop showing these cards <span>(turn back on in Revise)</span></button>`;
    tip.classList.remove('hidden');
    placeTip(rect.left, rect.bottom + 6, rect.top);
  }
  function issuesAt(x, y) {
    if (!revResult) return [];
    const pos = document.caretRangeFromPoint(x, y);
    if (!pos) return [];
    const hits = revResult.issues.filter(i => catOn(i.cat) && i.range.isPointInRange(pos.startContainer, pos.startOffset) &&
      !(i.range.endContainer === pos.startContainer && i.range.endOffset === pos.startOffset) &&
      [...i.range.getClientRects()].some(r => x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 2 && y <= r.bottom + 2));
    const order = ['doubled', 'typo', 'comma', 'simpler', 'passive', 'adverb', 'filler', 'echo', 'starts', 'veryhard', 'hard'];
    return hits.sort((a, b) => order.indexOf(a.cat) - order.indexOf(b.cat)).slice(0, 2);
  }
  let tipRaf = 0, lastKey = '';
  editor.addEventListener('mousemove', e => {
    if (!S.revise || !revResult || tipRaf || cardsCfg().mode !== 'show') return;
    tipRaf = requestAnimationFrame(() => {
      tipRaf = 0;
      const hits = issuesAt(e.clientX, e.clientY);
      if (!hits.length) { if (!tip.matches(':hover')) { clearTimeout(cardHideTimer); cardHideTimer = setTimeout(() => { if (!tip.matches(':hover')) { hideTip(); lastKey = ''; } }, 250); } return; }
      clearTimeout(cardHideTimer);
      const key = hits.map(h => h.key).join('&');
      if (key === lastKey && !tip.classList.contains('hidden')) return;
      lastKey = key;
      const rects = [...hits[0].range.getClientRects()];
      const rect = rects.find(r => e.clientY >= r.top - 2 && e.clientY <= r.bottom + 2) || rects[0];
      showCard(hits, rect);
    });
  });
  // touchscreens (iPad, iPhone): tap a highlight to see why and fix it
  editor.addEventListener('pointerup', e => {
    const mode = cardsCfg().mode;
    if (!S.revise || !revResult || mode === 'off' || (e.pointerType === 'mouse' && mode === 'show')) return;
    const hits = issuesAt(e.clientX, e.clientY);
    if (!hits.length) { armedKey = ''; if (e.pointerType !== 'mouse') { hideTip(); lastKey = ''; } return; }
    const key = hits.map(h => h.key).join('&');
    if (mode === 'twice' && key !== armedKey) { armedKey = key; hideTip(); lastKey = ''; return; }   // the first tap only puts the cursor in
    armedKey = '';
    lastKey = key;
    const rects = [...hits[0].range.getClientRects()];
    showCard(hits, rects.find(r => e.clientY >= r.top - 2 && e.clientY <= r.bottom + 2) || rects[0]);
  });
  document.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' && !tip.contains(e.target) && !editor.contains(e.target)) { hideTip(); lastKey = ''; } });
  // (a real mouse only: an iPad sends a made-up mouseleave after taps too, which closed a card a moment after a tap opened it)
  editor.addEventListener('pointerleave', e => { if (e.pointerType !== 'mouse') return; clearTimeout(cardHideTimer); cardHideTimer = setTimeout(() => { if (!tip.matches(':hover')) { hideTip(); lastKey = ''; } }, 300); });
  tip.addEventListener('pointerleave', e => { if (e.pointerType !== 'mouse') return; clearTimeout(cardHideTimer); cardHideTimer = setTimeout(() => { hideTip(); lastKey = ''; }, 250); });
  tip.addEventListener('mouseenter', () => clearTimeout(cardHideTimer));
  tip.addEventListener('mousedown', e => e.preventDefault());
  tip.addEventListener('click', e => {
    if (e.target.closest('.rc-off')) { setCards({ mode: 'off' }); hideTip(); lastKey = ''; toastAction('Cards are off. Turn them back on at the bottom of Revise.', 'Undo', () => setCards({ mode: 'show' }), 6000); return; }
    const b = e.target.closest('.rc-btn'); if (!b) return;
    const is = cardIssues[+b.dataset.i]; if (!is) return;
    if (b.dataset.fix !== undefined) applyFix(is.fixes[+b.dataset.fix]);
    else if (b.dataset.act === 'prev') {
      const r = is.prev.getBoundingClientRect(), w = editorWrap.getBoundingClientRect();
      editorWrap.scrollTop += r.top - w.top - w.height * 0.35;
      if (hasHighlights) { CSS.highlights.set('rv-focus', new Highlight(is.prev)); clearTimeout(jumpTo.t); jumpTo.t = setTimeout(() => CSS.highlights.delete('rv-focus'), 1800); }
      hideTip(); return;
    }
    else if (b.dataset.act === 'ignore' || b.dataset.act === 'ignoreall') {
      const list = S.project.reviseIgnored = S.project.reviseIgnored || [];
      const key = b.dataset.act === 'ignore' ? is.key : `${is.cat}|${is.word.toLowerCase()}|*`;
      if (!list.includes(key)) list.push(key);
      while (list.length > 3000) list.shift();
      scheduleMeta();
      toastAction(b.dataset.act === 'ignore' ? 'Ignored.' : `“${esc(is.word)}” won’t be flagged as ${esc(CAT_LABEL[is.cat].toLowerCase())} in this project.`, 'Undo', () => {
        const i = S.project.reviseIgnored.indexOf(key); if (i >= 0) S.project.reviseIgnored.splice(i, 1); scheduleMeta(); runRevise();
      }, 6000);
    }
    hideTip(); lastKey = '';
    runRevise();
  });
  function applyFix(f) {
    if (!f || !editor.contains(f.range.startContainer)) return;
    editor.focus();
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(f.range);
    S.programmatic = true;
    try {
      if (f.text) document.execCommand('insertText', false, f.text);
      else document.execCommand('delete');
    } finally { S.programmatic = false; }
    resyncWords();
    scheduleSave(); updateCountsSoon();
    // the same as Ctrl/Cmd+Z, as a button (Ignore has one too)
    const doc = S.docId;
    toastAction(f.text ? `Changed to “${esc(f.text.length > 40 ? f.text.slice(0, 38) + '…' : f.text)}”.` : 'Taken out.', 'Undo', () => {
      if (S.docId !== doc) return;
      editor.focus(); S.programmatic = true; try { document.execCommand('undo'); } finally { S.programmatic = false; }
      resyncWords(); scheduleSave(); updateCountsSoon(); if (S.revise) scheduleRevise();
    }, 8000);
  }
  editorWrap.addEventListener('scroll', () => { if (Date.now() < jumpQuietUntil) return; if (!tip.classList.contains('hidden') && !tip.matches(':hover')) hideTip(); });

  // ================================================================== NAME AUTOCOMPLETE
  const Names = window.FolioNames;
  const acPop = $('#ac-pop');
  let ac = null;  // { items, index, node, start, end }
  let namesTimer = null;
  function acPrefs() {
    let p = {}; try { p = JSON.parse(localStorage.getItem('folio-ac') || '{}'); } catch {}
    return { on: p.on !== false, min: p.min || 3 };
  }
  function scheduleNames(delay = 800) {
    clearTimeout(namesTimer);
    namesTimer = setTimeout(async () => {
      if (!S.slug) return;
      const slug = S.slug;
      await Names.rebuild(S.project, id => id === S.docId ? Promise.resolve(editor.innerHTML) : api.loadDoc(slug, id));
      api.addSpellWords(Names.allWords()).catch(() => {});
      if (S.revise) scheduleRevise();
    }, delay);
  }
  function hideAutocomplete() { ac = null; acPop.classList.add('hidden'); }
  function checkAutocomplete() {
    const prefs = acPrefs();
    if (!prefs.on || !Names.entries.length || S.programmatic) { hideAutocomplete(); return; }
    const sel = getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) { hideAutocomplete(); return; }
    const node = sel.anchorNode, off = sel.anchorOffset;
    if (!node || node.nodeType !== 3) { hideAutocomplete(); return; }
    const before = node.nodeValue.slice(0, off);
    const m = before.match(/(?:^|[^\p{L}\p{N}'’\-])([\p{L}][\p{L}'’\-]*)$/u);
    if (!m || m[1].length < prefs.min) { hideAutocomplete(); return; }
    const prefix = m[1];
    const items = Names.suggest(prefix);
    if (!items.length) { hideAutocomplete(); return; }
    ac = { items, index: 0, node, start: off - prefix.length, end: off, prefix };
    renderAutocomplete();
  }
  function renderAutocomplete() {
    acPop.innerHTML = ac.items.map((e, i) => `<div class="ac-item ${i === ac.index ? 'on' : ''}" data-i="${i}">
        <span class="ac-text">${esc(e.text)}</span>${e.primary ? `<span class="ac-of">${esc(e.primary)}</span>` : ''}<span class="ac-kind">${e.kind}</span></div>`).join('') +
      '<div class="ac-hint">Tab or Enter to insert · Esc to dismiss</div>';
    acPop.classList.remove('hidden');
    const r = document.createRange();
    try { r.setStart(ac.node, ac.start); r.setEnd(ac.node, ac.end); } catch { hideAutocomplete(); return; }
    const rect = r.getBoundingClientRect();
    const h = acPop.offsetHeight, w = acPop.offsetWidth;
    acPop.style.left = Math.min(rect.left, innerWidth - w - 8) + 'px';
    acPop.style.top = (rect.bottom + 6 + h > innerHeight - 30 ? rect.top - h - 6 : rect.bottom + 6) + 'px';
  }
  function acceptAutocomplete(i) {
    if (!ac) return;
    const e = ac.items[i ?? ac.index];
    const r = document.createRange();
    try { r.setStart(ac.node, ac.start); r.setEnd(ac.node, Math.min(ac.end, ac.node.nodeValue.length)); } catch { hideAutocomplete(); return; }
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    const prefix = ac.prefix;
    hideAutocomplete();
    // typing "Gat" for "the Gatewarden" mid-sentence inserts just "Gatewarden" (you've already typed "the")
    let text = e.text;
    const art = text.match(/^(the|a|an)\s+(.+)$/i);
    if (art && !art[0].toLowerCase().startsWith(prefix.toLowerCase()) && art[2].toLowerCase().startsWith(prefix.toLowerCase())) text = art[2];
    document.execCommand('insertText', false, text);
    Names.used(e.text);
  }
  editor.addEventListener('keydown', e => {
    if (!ac) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); ac.index = (ac.index + 1) % ac.items.length; renderAutocomplete(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); ac.index = (ac.index - 1 + ac.items.length) % ac.items.length; renderAutocomplete(); }
    else if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); acceptAutocomplete(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); hideAutocomplete(); }
  }, true);
  acPop.addEventListener('mousedown', e => { e.preventDefault(); const it = e.target.closest('.ac-item'); if (it) acceptAutocomplete(+it.dataset.i); });
  editor.addEventListener('blur', () => setTimeout(hideAutocomplete, 100));
  editor.addEventListener('mousedown', hideAutocomplete);
  editorWrap.addEventListener('scroll', () => { if (ac) renderAutocomplete(); });

  // ================================================================== SPRINTS
  function renderSprint() {
    const b = $('#btn-sprint'), lbl = $('#sprint-label'), bar = $('#sprint-progress'), fl = $('#sprint-float');
    fl.classList.remove('goal', 'done'); b.classList.remove('goal');
    // a sprint that ended in writer mode: the pill says so and waits; tap it for the result (writing carries on)
    if (!S.sprint && !S.brk && S.sprintDone) {
      const d = S.sprintDone;
      lbl.textContent = `Sprint done · ${fmt(d.rec.words)} words`; b.classList.remove('running'); bar.style.width = '0';
      b.title = 'Sprint finished. Click to see how it went.';
      document.body.classList.remove('sprinting');
      fl.innerHTML = `<span>✓ Sprint done</span><b>${fmt(d.rec.words)}</b><span>words · see how it went</span>`;
      fl.classList.add('done'); fl.classList.toggle('hidden', !document.body.classList.contains('writer'));
      return;
    }
    if (!S.sprint && S.brk) {      // a break between rounds (or a break timer on its own)
      const left = Math.max(0, S.brk.end - Date.now()), time = `${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}`;
      const plan = S.sprintPlan, nextUp = plan && S.brk.then ? ` · round ${plan.round} of ${plan.rounds} next` : '';
      lbl.textContent = `Break ${time}${nextUp}`; b.classList.add('running'); bar.style.width = (100 - left / (S.brk.minutes * 60000) * 100) + '%';
      b.title = 'On a break. Click to skip it or stop.';
      document.body.classList.remove('sprinting');
      fl.innerHTML = `☕<span>Break</span><b>${time}</b>`; fl.classList.toggle('hidden', !document.body.classList.contains('writer'));
      return;
    }
    if (!S.sprint) {
      lbl.textContent = 'Sprint'; b.classList.remove('running'); bar.style.width = '0';
      b.title = 'Start a timed writing sprint';
      document.body.classList.remove('sprinting'); fl.classList.add('hidden'); return;
    }
    const left = Math.max(0, S.sprint.end - Date.now());
    const mm = Math.floor(left / 60000), ss = Math.floor(left / 1000) % 60;
    const words = Math.max(0, S.sessionTyped - S.sprint.startTyped);
    const time = `${mm}:${String(ss).padStart(2, '0')}`;
    lbl.textContent = `${time} · ${fmt(words)}${S.sprint.goal ? '/' + fmt(S.sprint.goal) : ''} words`;
    bar.style.width = (100 - left / (S.sprint.minutes * 60000) * 100) + '%';
    b.classList.add('running'); b.title = 'Sprint running. Click to stop early.';
    document.body.classList.add('sprinting');
    const hit = !!(S.sprint.goal && words >= S.sprint.goal);   // goal reached: the pill (and the Sprint button) go green
    fl.innerHTML = `${hit ? '✓' : I.bolt}<span>${time}</span><b>${fmt(words)}</b>${S.sprint.goal ? `<span>/ ${fmt(S.sprint.goal)}</span>` : '<span>words</span>'}`;
    fl.classList.toggle('goal', hit); b.classList.toggle('goal', hit);
    fl.classList.toggle('hidden', !document.body.classList.contains('writer'));
  }
  async function startSprintDialog() {
    if (S.brk) {
      const plan = S.sprintPlan && S.brk.then;
      const v = await modal({ title: 'On a break', body: `<p>${plan ? `Round ${S.sprintPlan.round} of ${S.sprintPlan.rounds} starts when the break ends.` : 'Your break timer is running.'}</p>`,
        buttons: [{ label: plan ? 'Stop the sprints' : 'Stop the timer', value: 'stop', kind: 'ghost' }, { label: 'Keep resting', value: null, kind: 'ghost' }, ...(plan ? [{ label: 'Skip the break', value: 'skip', kind: 'primary' }] : [])] });
      if (v === 'skip') endBreak(true); else if (v === 'stop') { const pl = S.sprintPlan; stopBreak(); if (pl && pl.recs.length) showSprintResult(pl.recs[pl.recs.length - 1], pl, true); }
      return;
    }
    if (S.sprint) {
      if (await confirmBox('Stop sprint?', S.sprintPlan && S.sprintPlan.rounds > 1 ? 'End this sprint (and the rounds after it) now and see your result?' : 'End this sprint now and see your result?', 'End sprint')) endSprint(true, true);
      return;
    }
    const last = S.project.stats.sprints.slice(-1)[0];
    let minutes = (last && last.minutes) || 15;
    const body = document.createElement('div');
    body.innerHTML = `<p>Write as much as you can before the timer runs out. Only words you type count.</p>
      <div class="field"><label>Length</label><div class="chip-row" id="sp-len">${[5, 10, 15, 20, 25, 30, 45, 60].map(m => `<button type="button" class="chip ${m === minutes ? 'on' : ''}" data-m="${m}">${m} min</button>`).join('')}</div></div>
      <div class="form-grid" style="margin-top:12px">
        <div class="field"><label>Custom minutes</label><input type="number" id="sp-custom" min="1" max="240" placeholder="${minutes}"></div>
        <div class="field"><label>Word goal (optional)</label><input type="number" id="sp-goal" min="0" step="50" value="${(last && last.goal) || ''}" placeholder="e.g. 500"></div>
      </div>
      <div class="field" style="margin-top:12px"><label>Rounds</label><div class="chip-row" id="sp-rounds">${[1, 2, 3, 4, 6].map(n => `<button type="button" class="chip ${n === ((last && last.rounds) || 1) ? 'on' : ''}" data-n="${n}">${n === 1 ? 'Just one' : n + ' sprints'}</button>`).join('')}</div></div>
      <div class="field sp-brk-f" style="margin-top:10px"><label>Break between them</label><div class="chip-row" id="sp-brk">${[2, 5, 10, 15].map(m => `<button type="button" class="chip ${m === ((last && last.brk) || 5) ? 'on' : ''}" data-m="${m}">${m} min</button>`).join('')}</div><span class="hint">A chime (and a notification) when each break is over, then the next sprint starts.</span></div>
      <label class="check" style="margin-top:12px"><input type="checkbox" id="sp-writer"> Switch to writer mode for the sprint</label>
      <p class="hint" style="margin-top:10px">Only need a rest? <button type="button" class="link-btn" id="sp-breakonly">Start a break timer instead</button></p>`;
    $$('#sp-len .chip', body).forEach(c => c.onclick = () => { $$('#sp-len .chip', body).forEach(x => x.classList.remove('on')); c.classList.add('on'); minutes = +c.dataset.m; $('#sp-custom', body).value = ''; });
    let rounds = (last && last.rounds) || 1, brk = (last && last.brk) || 5;
    const showBrk = () => $('.sp-brk-f', body).classList.toggle('hidden', rounds < 2);
    $$('#sp-rounds .chip', body).forEach(c => c.onclick = () => { $$('#sp-rounds .chip', body).forEach(x => x.classList.toggle('on', x === c)); rounds = +c.dataset.n; showBrk(); });
    $$('#sp-brk .chip', body).forEach(c => c.onclick = () => { $$('#sp-brk .chip', body).forEach(x => x.classList.toggle('on', x === c)); brk = +c.dataset.m; });
    showBrk();
    let breakOnly = false;
    $('#sp-breakonly', body).onclick = () => { breakOnly = true; body.closest('.modal-back').querySelector('.m-foot .btn.primary').click(); };
    const ok = await modal({ title: 'Word sprint', body, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Start sprint', value: true, kind: 'primary' }] });
    if (!ok) return;
    if (breakOnly) { breakTimerDialog(); return; }
    askToNotify();
    const custom = +$('#sp-custom', body).value;
    if (custom > 0) minutes = Math.min(240, custom);
    const goal = Math.max(0, +$('#sp-goal', body).value || 0);
    S.sprintPlan = { rounds, brk, round: 1, minutes, goal, recs: [] };
    beginSprint(minutes, goal, { writer: $('#sp-writer', body).checked, message: rounds > 1 ? `Sprint 1 of ${rounds} started: ${minutes} minutes.` : null });
  }
  // ---- breaks: between rounds, or a timer on its own
  function sprintChime() {
    try {
      const A = window.AudioContext || window.webkitAudioContext; if (!A) return; const ac = new A(), t = ac.currentTime;
      [[660, 0], [880, 0.22], [990, 0.44]].forEach(([f, d]) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.25, t + d + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.9); o.connect(g); g.connect(ac.destination); o.start(t + d); o.stop(t + d + 1); });
      setTimeout(() => ac.close().catch(() => {}), 2000);
    } catch {}
  }
  function askToNotify() { try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {}); } catch {} }
  function notify(title, body) {
    sprintChime();
    try { if ('Notification' in window && Notification.permission === 'granted' && !document.hasFocus()) new Notification(title, { body, silent: true }); } catch {}
  }
  function startBreak(minutes, then) {
    stopBreak(true);
    S.brk = { end: Date.now() + minutes * 60000, minutes, then };
    S.brk.timer = setInterval(() => { if (!S.brk) return; renderSprint(); if (Date.now() >= S.brk.end) endBreak(false); }, 500);
    renderSprint();
  }
  function stopBreak(quiet) { if (S.brk) clearInterval(S.brk.timer); S.brk = null; if (!quiet) S.sprintPlan = null; renderSprint(); }
  function endBreak(skipped) {
    const b = S.brk; if (!b) return;
    clearInterval(b.timer); S.brk = null; renderSprint();
    if (b.then) { if (!skipped) notify('Break’s over', 'Your next sprint is starting.'); b.then(); }
    else { notify('Break’s over', 'Time to get back to it.'); quoteToast('Break’s over. Back to it when you’re ready.'); }
  }
  async function breakTimerDialog() {
    const body = document.createElement('div');
    body.innerHTML = `<p>A chime (and a notification if Unwip is in the background) when it’s time to come back.</p><div class="chip-row" id="bk-len">${[2, 5, 10, 15, 20, 30].map(m => `<button type="button" class="chip ${m === 5 ? 'on' : ''}" data-m="${m}">${m} min</button>`).join('')}</div>`;
    let m = 5; $$('#bk-len .chip', body).forEach(c => c.onclick = () => { $$('#bk-len .chip', body).forEach(x => x.classList.toggle('on', x === c)); m = +c.dataset.m; });
    if (!(await modal({ title: 'Break timer', body, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Start break', value: true, kind: 'primary' }] }))) return;
    askToNotify(); S.sprintPlan = null; startBreak(m, null); toast(`Break started: ${m} minutes. The Sprint button shows the time left.`);
  }
  // opts: { writer, mini (gentle: cheer at the goal and keep going), message }
  function beginSprint(minutes, goal, opts = {}) {
    if (S.sprint) return;
    S.sprintDone = null;
    S.sprint = { start: Date.now(), end: Date.now() + minutes * 60000, minutes, goal, startTyped: S.sessionTyped, mini: !!opts.mini };
    S.sprint.timer = setInterval(() => {
      const sp = S.sprint; if (!sp) return;
      renderSprint();
      if (sp.mini && sp.goal && !sp.cheered && S.sessionTyped - sp.startTyped >= sp.goal) { sp.cheered = true; quoteToast(`${fmt(sp.goal)} words, goal reached. You can keep going if you like: the timer's still running.`); }
      if (Date.now() >= sp.end) endSprint(true, false);
    }, 500);
    renderSprint();
    if (opts.writer) setWriter(true); else quoteToast(opts.message || `Sprint started: ${minutes} minutes.`);
    editor.focus();
  }
  async function endSprint(showResult, early) {
    const sp = S.sprint; if (!sp) return;
    clearInterval(sp.timer); S.sprint = null; renderSprint();
    const mins = Math.max(0.1, Math.min(sp.minutes, (Date.now() - sp.start) / 60000));
    const words = Math.max(0, S.sessionTyped - sp.startTyped);
    const wpm = Math.round(words / mins * 10) / 10;
    const docNode = S.docId && findNode(S.docId);
    const rec = { date: new Date().toISOString(), minutes: Math.round(mins * 10) / 10, words, wpm, goal: sp.goal, doc: docNode ? docNode.node.title : '' };
    const plan = S.sprintPlan;
    if (plan) { rec.rounds = plan.rounds; if (plan.rounds > 1) { rec.brk = plan.brk; rec.round = plan.round; } plan.recs.push(rec); }
    const prevBest = S.project.stats.sprints.reduce((a, x) => Math.max(a, x.wpm || 0), 0);
    S.project.stats.sprints.push(rec);
    scheduleMeta();
    if (!showResult) { S.sprintPlan = null; return; }
    // more rounds to go: a break, then the next sprint starts by itself
    if (plan && !early && plan.round < plan.rounds) {
      plan.round++;
      notify('Sprint done', `${fmt(words)} words. ${plan.brk}-minute break, then sprint ${plan.round} of ${plan.rounds}.`);
      quoteToast(`Sprint ${plan.round - 1} of ${plan.rounds} done: ${fmt(words)} words. ${plan.brk}-minute break. Stretch, drink some water.`);
      startBreak(plan.brk, () => { if (S.slug) beginSprint(plan.minutes, plan.goal, { message: `Sprint ${plan.round} of ${plan.rounds} started.` }); else S.sprintPlan = null; });
      return;
    }
    S.sprintPlan = null;
    // in writer mode, don't pull them out mid-word: a chime, the pill says it's done, the result waits for a tap
    // (or for leaving writer mode)
    if (document.body.classList.contains('writer')) { S.sprintDone = { rec, plan, prevBest }; sprintChime(); renderSprint(); return; }
    return showSprintResult(rec, plan, false, prevBest);
  }
  function showPendingSprint() { const d = S.sprintDone; if (!d) return; S.sprintDone = null; renderSprint(); showSprintResult(d.rec, d.plan, false, d.prevBest); }
  $('#sprint-float').addEventListener('mousedown', e => e.preventDefault());   // tapping the pill keeps the cursor where it is
  $('#sprint-float').addEventListener('click', () => { if (S.sprintDone) showPendingSprint(); });
  // the result, and "how did it go?" (saved with the sprint, and shown in All sprints)
  const SPRINT_WORK = ['Planning', 'Outlining', 'Drafting from an outline', 'Discovery writing', 'Revising', 'Editing'];
  const SPRINT_FEEL = ['Feeling good', 'In the zone', 'Tired', 'Distracted', 'Sad', 'Burnt out'];
  async function showSprintResult(rec, plan, stoppedOnBreak, prevBest) {
    const sp = { goal: rec.goal }, words = rec.words, wpm = rec.wpm;
    if (prevBest == null) prevBest = S.project.stats.sprints.filter(x => x !== rec).reduce((a, x) => Math.max(a, x.wpm || 0), 0);
    const recs = plan && plan.recs.length > 1 ? plan.recs : [rec];
    const goalLine = sp.goal && recs.length === 1 ? (words >= sp.goal ? `Goal of ${fmt(sp.goal)} words reached!` : `${fmt(sp.goal - words)} words short of your ${fmt(sp.goal)} goal.`) : '';
    const best = wpm > prevBest && S.project.stats.sprints.length > 1 ? 'New personal best speed!' : `Best so far: ${prevBest || wpm} wpm`;
    const tw = recs.reduce((a, r) => a + r.words, 0), tm = Math.round(recs.reduce((a, r) => a + r.minutes, 0) * 10) / 10, twpm = tm ? Math.round(tw / tm * 10) / 10 : 0;
    const chips = (id, list) => `<div class="chip-row sp-log" id="${id}">${list.map(x => `<button type="button" class="chip" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div>`;
    const body = document.createElement('div');
    body.innerHTML = `<div class="sprint-result">${recs.length > 1 ? `<div class="big">${twpm}</div><div class="lbl">words per minute over ${recs.length} sprints</div>
        <div class="sprint-grid"><div><b>${fmt(tw)}</b><span>words</span></div><div><b>${tm}</b><span>minutes writing</span></div><div><b>${recs.map(r => fmt(r.words)).join(' · ')}</b><span>words each sprint</span></div></div>`
      : `<div class="big">${wpm}</div><div class="lbl">words per minute</div>
        <div class="sprint-grid"><div><b>${fmt(words)}</b><span>words</span></div><div><b>${rec.minutes}</b><span>minutes</span></div><div><b>${S.project.stats.sprints.length}</b><span>sprints in this project</span></div></div>`}
        <p style="margin-top:14px">${[goalLine, best].filter(Boolean).join(' ')}</p></div>
      <div class="sp-howwent"><b>How did it go?</b> <span class="hint">(optional, saved with ${recs.length > 1 ? 'these sprints' : 'the sprint'})</span>
        <label>What you worked on</label>${chips('sp-work', SPRINT_WORK)}
        <label>How you felt</label>${chips('sp-feel', SPRINT_FEEL)}
        <input type="text" id="sp-note" placeholder="A note for yourself (optional)" maxlength="200"></div>
      ${quotesOn() ? (q => `<div class="sprint-quote">${quoteHTML(q)}</div>`)(Quotes.random()) : ''}`;
    const pick = { work: '', feel: '' };
    for (const [id, k] of [['sp-work', 'work'], ['sp-feel', 'feel']]) $$(`#${id} .chip`, body).forEach(c => c.onclick = () => { const on = !c.classList.contains('on'); $$(`#${id} .chip`, body).forEach(x => x.classList.remove('on')); c.classList.toggle('on', on); pick[k] = on ? c.dataset.v : ''; });
    const v = await modal({ title: recs.length > 1 ? `${recs.length} sprints finished` : 'Sprint finished', body,
      buttons: [...(window.UnwipSprints ? [{ label: 'All sprints', value: 'all', kind: 'ghost' }] : []), { label: 'Done', value: true, kind: 'primary' }] });
    const note = ($('#sp-note', body).value || '').trim();
    if (pick.work || pick.feel || note) { for (const r of recs) { if (pick.work) r.work = pick.work; if (pick.feel) r.feel = pick.feel; if (note) r.note = note; } scheduleMeta(); }
    if (v === 'all') window.UnwipSprints.open();
    editor.focus();
  }
  $('#btn-sprint').onclick = () => S.sprintDone ? showPendingSprint() : startSprintDialog();
  $('#btn-sprint').addEventListener('mousedown', e => e.preventDefault());

  // ================================================================== GOALS, DIALS & HISTORY
  // words typed on a given day, across every project
  function writtenOn(day, allDays) {
    const sets = allDays || [...(S.allDays || []), (S.project && S.project.stats.days) || {}];
    return sets.reduce((a, d) => a + Math.max(0, d[day] || 0), 0);
  }
  function dayKey(offset) { const d = new Date(); d.setDate(d.getDate() - offset); return d.toLocaleDateString('en-CA'); }
  // how many days of this week so far, today included: the week starts on the day this device's region starts it
  // (Monday in Australia and the UK, Sunday in the US). "This week" used to be the last 7 days (beta, 27 Oct)
  function weekSoFar(now = new Date()) {
    let first = 1;   // Monday
    try { const L = new Intl.Locale(navigator.language || 'en-AU'), w = (L.getWeekInfo && L.getWeekInfo()) || L.weekInfo; if (w && w.firstDay >= 1 && w.firstDay <= 7) first = w.firstDay; } catch {}
    const today = now.getDay() || 7;   // 1 Monday … 7 Sunday
    return ((today - first + 7) % 7) + 1;
  }
  function streaks(allDays) {
    const wrote = k => writtenOn(k, allDays) > 0;
    let cur = 0, i = wrote(dayKey(0)) ? 0 : 1;            // today not written yet doesn't break the streak
    while (wrote(dayKey(i)) && i < 3650) { cur++; i++; }
    // best streak over the last two years
    let best = 0, run = 0;
    for (let j = 730; j >= 0; j--) { if (wrote(dayKey(j))) { run++; best = Math.max(best, run); } else run = 0; }
    return { current: cur, best: Math.max(best, cur) };
  }
  // ring dial: pct 0..1+, big centre text, small label
  // the little copy button under Today: just the number, so it pastes cleanly into a spreadsheet
  document.addEventListener('click', async e => {
    const b = e.target.closest && e.target.closest('.dial-copy'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const n = b.dataset.copy || '0';
    try { await navigator.clipboard.writeText(n); } catch { try { await api.clipboardWrite(n, n); } catch {} }
    toast(`Copied ${fmt(+n)}.`, '', 2000);
  });
  // the goal rings' colours (Settings › Goal colours); empty = the ring's own colour
  const GOAL_DEFAULT = { today: '', week: '#7a5cc7', book: '#c27a2c' };
  const GOAL_SWATCHES = ['#34528a', '#2f7a5b', '#7a5cc7', '#c27a2c', '#a84a5c', '#b4423a', '#1f7a8c', '#c27c0e', '#5c6b2f', '#444444'];
  const goalColor = k => (((S.settings || {}).goalColors || {})[k]) || GOAL_DEFAULT[k] || '';
  function dial({ pct, big, small, label, color, size = 132, track = 11 }) {
    const r = (size - track) / 2, c = 2 * Math.PI * r;
    const p = Math.max(0, Math.min(1, pct || 0));
    const done = (pct || 0) >= 1;
    return `<div class="dial ${done ? 'done' : ''}" style="--dial-size:${size}px">
      <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--dial-track)" stroke-width="${track}"/>
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${done ? 'var(--good)' : (color || 'var(--accent)')}" stroke-width="${track}" stroke-linecap="round"
          stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}" transform="rotate(-90 ${size / 2} ${size / 2})" class="dial-arc"/>
      </svg>
      <div class="dial-centre"><b>${big}</b><span>${small || ''}</span></div>
      ${label ? `<div class="dial-label">${label}</div>` : ''}
    </div>`;
  }
  function historyChart(allDays, daily, days = 14) {
    const list = [];
    for (let i = days - 1; i >= 0; i--) {
      const key = dayKey(i), d = new Date(key + 'T12:00:00');
      list.push({ key, label: d.toLocaleDateString(undefined, { weekday: 'narrow' }), date: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), words: writtenOn(key, allDays) });
    }
    const max = Math.max(1, daily * 1.15 || 0, ...list.map(x => x.words));
    const none = list.every(x => !x.words);
    return `<div class="chart${none ? ' chart-none' : ''}">
      ${none ? '<div class="chart-empty">Your writing days show up here as you write.</div>' : ''}
      ${daily ? `<div class="chart-goal" style="bottom:${daily / max * 100}%"><span>goal ${fmt(daily)}</span></div>` : ''}
      ${list.map((x, i) => `<div class="chart-bar ${daily && x.words >= daily ? 'met' : ''} ${i === list.length - 1 ? 'today' : ''}" title="${x.date}: ${fmt(x.words)} words">
        <i style="height:${Math.max(x.words ? 3 : 0, x.words / max * 100)}%">${x.words ? `<em>${x.words >= 1000 ? (x.words / 1000).toFixed(1) + 'k' : x.words}</em>` : ''}</i><span>${x.label}</span></div>`).join('')}
    </div>`;
  }
  function paceText(goals, total) {
    if (!goals.total) return '';
    const left = Math.max(0, goals.total - total);
    if (!left) return 'Manuscript goal reached!';
    if (!goals.deadline) return `${fmt(left)} words to go`;
    const daysLeft = Math.ceil((new Date(goals.deadline + 'T23:59:59') - new Date()) / 86400000);
    if (daysLeft <= 0) return `Deadline passed · ${fmt(left)} to go`;
    return `${fmt(Math.ceil(left / daysLeft))} words/day for ${daysLeft} day${daysLeft === 1 ? '' : 's'}`;
  }

  async function goalsDialog() {
    const g = S.project.goals;
    const daily = S.settings.dailyGoal || 0;
    const total = manuscriptWords();
    const todayW = writtenOn(today());
    let week = 0; for (let i = 0; i < weekSoFar(); i++) week += writtenOn(dayKey(i));
    const st = streaks();
    const sprints = S.project.stats.sprints || [];
    const bestWpm = sprints.reduce((a, x) => Math.max(a, x.wpm || 0), 0);
    const avgWpm = sprints.length ? Math.round(sprints.reduce((a, x) => a + (x.wpm || 0), 0) / sprints.length * 10) / 10 : 0;
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="dial-row">
        ${dial({ pct: daily ? todayW / daily : 0, big: fmt(todayW), small: daily ? `of ${fmt(daily)}` : 'words', label: `Today <button type="button" class="dial-copy" data-copy="${todayW}" title="Copy today’s word count (${todayW}), to paste into a spreadsheet or a chat"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg></button>`, color: goalColor('today') })}
        ${dial({ pct: daily ? week / (daily * 7) : 0, big: fmt(week), small: daily ? `of ${fmt(daily * 7)}` : 'words', label: 'This week', color: goalColor('week') })}
        ${dial({ pct: g.total ? total / g.total : 0, big: g.total ? Math.floor(total / g.total * 100) + '%' : fmt(total), small: g.total ? `${fmt(total)} / ${fmt(g.total)}` : 'words', label: 'Manuscript', color: goalColor('book') })}
        <div class="stat-stack">
          <div class="stat-card flame"><span class="ic">${I.flame}</span><b>${st.current}</b><span>${st.current ? `day streak<br><small>best ${st.best}</small>` : st.best ? `day streak<br><small>best ${st.best} · write today to start again</small>` : `day streak<br><small>write today to start one</small>`}</span></div>
          <button type="button" class="stat-card bolt" id="g-sprints" title="See every sprint"><span class="ic">${I.bolt}</span><b>${bestWpm || '–'}</b><span>best sprint wpm<br><small>${sprints.length} sprints${avgWpm ? ` · avg ${avgWpm}` : ''} ›</small></span></button>
        </div>
      </div>
      ${paceText(g, total) ? `<div class="pace">${paceText(g, total)}</div>` : ''}
      <div class="chart-wrap"><div class="chart-cap"><span>Words written, last 14 days (all projects)</span><span>${fmt(week)} this week${window.UnwipHistory ? ` · <button class="link-btn" id="g-history">Full history ›</button>` : ''}</span></div>${historyChart(null, daily)}</div>
      <div class="form-grid" style="margin-top:16px">
        <div class="field"><label>Daily goal (all books)</label><input type="number" id="g-daily" min="0" step="50" value="${daily || ''}" placeholder="e.g. 1000"></div>
        <div class="field"><label>Manuscript goal for this book</label><input type="number" id="g-total" min="0" step="1000" value="${g.total || ''}" placeholder="e.g. 90000"></div>
        <div class="field"><label>Deadline (optional)</label><input type="date" id="g-deadline" value="${g.deadline || ''}" class="date-input"></div>
      </div>
      <p style="margin-top:10px">Only words you type count towards daily goals and streaks. Pasting and big deletions are left out so the numbers stay honest.</p>`;
    const gs = $('#g-sprints', body); if (gs) gs.onclick = () => { const c = body.closest('.modal-back'); const x = c && c.querySelector('.m-foot button'); if (x) x.click(); window.UnwipSprints && window.UnwipSprints.open(); };
    const hb = $('#g-history', body); if (hb) hb.onclick = () => { const c = body.closest('.modal-back'); const x = c && c.querySelector('.m-foot button'); if (x) x.click(); window.UnwipHistory.open(); };
    const ok = await modal({ title: 'Goals & progress', body, wide: true, buttons: [{ label: 'Close', value: false, kind: 'ghost' }, { label: 'Save goals', value: true, kind: 'primary' }] });
    if (!ok) return;
    g.total = Math.max(0, +$('#g-total', body).value || 0);
    g.deadline = $('#g-deadline', body).value || '';
    S.settings = await api.setSettings({ dailyGoal: Math.max(0, +$('#g-daily', body).value || 0) });
    scheduleMeta(); updateStatus();
  }

  // ---- front page dashboard
  function renderDashboard(list) {
    const allDays = list.map(p => p.days || {});
    const daily = (S.settings || {}).dailyGoal || 0;
    const todayW = writtenOn(today(), allDays);
    let week = 0; for (let i = 0; i < weekSoFar(); i++) week += writtenOn(dayKey(i), allDays);
    const st = streaks(allDays);
    const totalWords = list.reduce((a, p) => a + (p.words || 0), 0);
    const dash = $('#dash');
    if (!list.length) { dash.innerHTML = ''; return; }
    const lp = (S.settings || {}).lastPlace;
    const lpOk = lp && list.some(p => p.slug === lp.slug);
    const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 2 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} day${Math.round(m / 1440) === 1 ? '' : 's'} ago`; };
    dash.innerHTML = (lpOk ? `<button class="continue-card" id="btn-continue" title="Open where you last wrote, with the cursor where you left it">
        <span class="cc-go">Continue ›</span>
        <span class="cc-where"><b>${esc(lp.doc || 'Untitled')}</b> · ${esc((list.find(p => p.slug === lp.slug) || {}).title || lp.project || '')} <small>${ago(lp.at)}</small></span>
        ${lp.snippet ? `<span class="cc-snip">…${esc(lp.snippet.slice(-80))}<i class="cc-caret"></i></span>` : ''}
      </button>` : '') + `
      <div class="dash-card dials">
        ${dial({ pct: daily ? todayW / daily : 0, big: fmt(todayW), small: daily ? `of ${fmt(daily)}` : 'words', label: `Today <button type="button" class="dial-copy" data-copy="${todayW}" title="Copy today’s word count (${todayW}), to paste into a spreadsheet or a chat"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg></button>`, color: goalColor('today'), size: 120 })}
        ${dial({ pct: daily ? week / (daily * 7) : 0, big: fmt(week), small: daily ? `of ${fmt(daily * 7)}` : 'words', label: 'This week', color: goalColor('week'), size: 120 })}
        <div class="stat-stack">
          <div class="stat-card flame"><span class="ic">${I.flame}</span><b>${st.current}</b><span>${st.current ? `day streak<br><small>best ${st.best}</small>` : st.best ? `day streak<br><small>best ${st.best} · write today to start again</small>` : `day streak<br><small>write today to start one</small>`}</span></div>
          <div class="stat-card"><span class="ic">${I.book}</span><b>${fmt(totalWords)}</b><span>words in your manuscripts<br><small>${totalWords ? `≈ ${fmt(Math.max(1, Math.round(totalWords / 280)))} paperback page${Math.max(1, Math.round(totalWords / 280)) === 1 ? '' : 's'}` : 'nothing written yet'}</small></span></div>
        </div>
        ${daily ? '' : `<button class="btn ghost small dash-setgoal" id="dash-setgoal">Set a daily goal</button>`}
      </div>
      <div class="dash-card chart-card"><div class="chart-cap"><span>Last 14 days</span><span>${daily && todayW >= daily ? 'Goal met today! · ' : daily ? `${fmt(Math.max(0, daily - todayW))} to go today · ` : ''}<button class="link-btn" id="dash-history">Full history ›</button></span></div>${historyChart(allDays, daily)}</div>`;
    const dh = $('#dash-history'); if (dh) dh.onclick = () => window.UnwipHistory && window.UnwipHistory.open();
    const sg = $('#dash-setgoal'); if (sg) sg.onclick = openSettings;
    const cb = $('#btn-continue'); if (cb) cb.onclick = () => continueWriting(lp);
  }

  const goalsHere = () => { if (!document.documentElement.classList.contains('m-phone')) goalsDialog(); };
  $('#st-session').onclick = goalsHere;
  $('#st-today').onclick = goalsHere;

  // ================================================================== SEARCH & WORD ANALYSIS
  const Ana = window.FolioAnalysis;
  const htmlText = html => { const d = document.createElement('div'); d.innerHTML = html; d.querySelectorAll('del.tc-del').forEach(x => x.remove()); d.querySelectorAll('br').forEach(x => x.replaceWith('\n')); d.querySelectorAll('sup.fn').forEach(x => x.replaceWith(' ')); return [...d.querySelectorAll('p,h1,h2,h3,blockquote,li')].filter(e => !e.querySelector('p,h1,h2,h3')).map(e => e.textContent).join('\n') || d.textContent; };
  function docsIn(kinds) {
    const out = [];
    for (const r of S.project.binder) {
      if (!kinds.includes(r.kind)) continue;
      walkTree(r.children || [], n => { if (n.type === 'doc' && !n.map) out.push(n); });
    }
    return out;
  }
  async function loadTexts(kinds) {
    await flushSave();
    const docs = docsIn(kinds);
    const out = [];
    for (const d of docs) {
      const html = d.id === S.docId ? editor.innerHTML : await api.loadDoc(S.slug, d.id);
      out.push({ id: d.id, title: d.title, html, text: htmlText(html) });
    }
    return out;
  }
  function searchRegex(q, { matchCase, wholeWord }) {
    const src = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/['’]/g, "['’]").replace(/["“”]/g, '["“”]');
    return new RegExp(wholeWord ? `(?<![\\p{L}\\p{N}])${src}(?![\\p{L}\\p{N}])` : src, 'gu' + (matchCase ? '' : 'i'));
  }
  // select the n-th match of a regex in the open editor
  function selectMatch(re, n) {
    const tw = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    const nodes = []; let text = '', t;
    while ((t = tw.nextNode())) { nodes.push({ node: t, start: text.length }); text += t.nodeValue; }
    re.lastIndex = 0; let m, i = 0;
    while ((m = re.exec(text))) { if (i++ === n) break; if (m.index === re.lastIndex) re.lastIndex++; }
    if (!m) return false;
    const at = idx => { for (let k = nodes.length - 1; k >= 0; k--) if (idx >= nodes[k].start) return [nodes[k].node, idx - nodes[k].start]; return [nodes[0].node, 0]; };
    const r = document.createRange(); const [a, ao] = at(m.index); const [b, bo] = at(m.index + m[0].length);
    r.setStart(a, ao); r.setEnd(b, bo);
    editor.focus(); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    const rect = r.getBoundingClientRect(), w = editorWrap.getBoundingClientRect();
    editorWrap.scrollTop += rect.top - w.top - w.height * 0.35;
    if (hasHighlights) { CSS.highlights.set('rv-focus', new Highlight(r)); clearTimeout(jumpTo.t); jumpTo.t = setTimeout(() => CSS.highlights.delete('rv-focus'), 1800); }
    return true;
  }
  async function goToMatch(docId, q, opts, n) {
    if (S.view !== 'write') setView('write');
    if (S.docId !== docId) await openDoc(docId);
    setTimeout(() => selectMatch(searchRegex(q, opts), n), 30);
  }

  async function openSearch(tab = 'search', preset = '') {
    const body = document.createElement('div');
    body.className = 'srch';
    body.innerHTML = `
      <div class="srch-tabs">
        <button data-t="search">Find &amp; replace</button><button data-t="freq">Word frequency</button><button data-t="phrases">Repeated phrases</button><button data-t="names">Name check</button>
        <select id="sr-scope" title="Where to look"><option value="ms">Manuscript</option><option value="all">Everything (incl. notes &amp; sheets)</option></select>
      </div>
      <div class="srch-pane" data-p="search">
        <div class="srch-row"><input type="text" id="sr-q" placeholder="Find in the whole book…" value="${esc(preset)}"><label class="check"><input type="checkbox" id="sr-case"> Match case</label><label class="check"><input type="checkbox" id="sr-word" checked> Whole words</label></div>
        <div class="srch-row"><input type="text" id="sr-r" placeholder="Replace with…"><button class="btn" id="sr-replace">Replace all</button></div>
        <div class="srch-results" id="sr-results"><p class="srch-empty">Type to search every chapter at once.</p></div>
      </div>
      <div class="srch-pane" data-p="freq"><div class="srch-row"><label class="check"><input type="checkbox" id="fq-common"> Include common words (the, and, was…)</label></div><div class="srch-results" id="fq-results"></div></div>
      <div class="srch-pane" data-p="phrases"><div class="srch-results" id="ph-results"></div></div>
      <div class="srch-pane" data-p="names"><div class="srch-results" id="nm-results"></div></div>`;
    let texts = [];
    const opts = () => ({ matchCase: $('#sr-case', body).checked, wholeWord: $('#sr-word', body).checked });
    const kinds = () => $('#sr-scope', body).value === 'all' ? ['manuscript', 'characters', 'places', 'items', 'notes', 'research', ...S.project.binder.filter(r => r.custom).map(r => r.kind)] : ['manuscript'];
    async function reload() { texts = await loadTexts(kinds()); renderAll(); }
    let closeModal;
    function renderSearch() {
      const q = $('#sr-q', body).value;
      const res = $('#sr-results', body);
      if (!q.trim()) { res.innerHTML = '<p class="srch-empty">Type to search every chapter at once.</p>'; return; }
      const re = searchRegex(q, opts());
      let total = 0, html = '';
      for (const t of texts) {
        const hits = []; let m; re.lastIndex = 0;
        while ((m = re.exec(t.text))) { hits.push(m.index); if (m.index === re.lastIndex) re.lastIndex++; if (hits.length > 500) break; }
        if (!hits.length) continue;
        total += hits.length;
        html += `<div class="sr-doc"><div class="sr-doc-title">${esc(t.title)} <span>${hits.length}</span></div>` +
          hits.slice(0, 8).map((ix, i) => {
            const a = Math.max(0, ix - 50), b = Math.min(t.text.length, ix + q.length + 60);
            const before = t.text.slice(a, ix), hit = t.text.slice(ix, ix + q.length), after = t.text.slice(ix + q.length, b);
            return `<button class="sr-hit" data-id="${t.id}" data-n="${i}">${a > 0 ? '…' : ''}${esc(before.replace(/\n/g, ' ¶ '))}<mark>${esc(hit)}</mark>${esc(after.replace(/\n/g, ' ¶ '))}…</button>`;
          }).join('') + (hits.length > 8 ? `<div class="sr-more">+ ${hits.length - 8} more in this document</div>` : '') + '</div>';
      }
      res.innerHTML = total ? `<div class="sr-total">${fmt(total)} match${total === 1 ? '' : 'es'} in ${texts.filter(t => { re.lastIndex = 0; return re.test(t.text); }).length} document(s)</div>` + html : '<p class="srch-empty">No matches.</p>';
      $$('.sr-hit', res).forEach(b => b.onclick = () => { closeModal(); goToMatch(b.dataset.id, q, opts(), +b.dataset.n); });
    }
    function renderFreq() {
      const names = new Set(window.FolioNames.allWords().map(w => w.toLowerCase()));
      const { total, list } = Ana.frequency(texts, { includeCommon: $('#fq-common', body).checked, names });
      const max = list.length ? list[0].count : 1;
      $('#fq-results', body).innerHTML = `<div class="sr-total">${fmt(total)} words. Your most-used words (names are marked). Click one to see every use.</div>` +
        `<div class="fq-list">${list.map(x => `<button class="fq-row" data-w="${esc(x.word)}"><span class="fq-word">${esc(x.word)}${x.name ? ' <em>name</em>' : ''}</span><span class="fq-bar"><i style="width:${x.count / max * 100}%"></i></span><span class="fq-n">${fmt(x.count)}</span><span class="fq-r">${x.per10k}/10k</span></button>`).join('')}</div>`;
      $$('.fq-row', body).forEach(b => b.onclick = () => { $('#sr-q', body).value = b.dataset.w; $('#sr-word', body).checked = true; setTab('search'); });
    }
    function renderPhrases() {
      const list = Ana.phrases(texts);
      $('#ph-results', body).innerHTML = list.length ? `<div class="sr-total">Phrases you've used 3 or more times. Some repetition is voice; a lot can read as a habit.</div>` +
        `<div class="fq-list">${list.map(x => `<button class="fq-row" data-w="${esc(x.phrase)}"><span class="fq-word">“${esc(x.phrase)}”</span><span class="fq-n">${x.count}×</span></button>`).join('')}</div>` : '<p class="srch-empty">No phrase is repeated 3 or more times. Nice.</p>';
      $$('#ph-results .fq-row', body).forEach(b => b.onclick = () => { $('#sr-q', body).value = b.dataset.w; $('#sr-word', body).checked = true; setTab('search'); });
    }
    function renderNames() {
      const ents = window.FolioNames.entries;
      if (!ents.length) { $('#nm-results', body).innerHTML = '<p class="srch-empty">Add characters, places or items (with a name and aliases) and Unwip will check their spelling across the book.</p>'; return; }
      // suggestions you've said no to are kept with the book
      const ig = S.project.nameIgnore = S.project.nameIgnore || { pairs: [] };
      const { names, suspects } = Ana.nameCheck(texts, ents, ig);
      $('#nm-results', body).innerHTML = (suspects.length
        ? `<div class="sr-total warn nm-head"><span>Possible misspellings of your names:</span><button class="rc-btn" id="nm-ignore-all" title="Hide every suggestion in this list">Ignore all</button></div>` + suspects.map(s => `<div class="nm-row"><span><b>${esc(s.found)}</b> ×${s.count} → did you mean <b>${esc(s.suggestion)}</b>?<small>${esc(s.docs.slice(0, 3).join(', '))}${s.docs.length > 3 ? '…' : ''}</small></span><span class="nm-acts"><button class="rc-btn" data-ign="${esc(s.found + '|' + s.suggestion)}" title="Not a misspelling: don’t suggest this again">Ignore</button><button class="rc-btn" data-find="${esc(s.found)}">Show</button><button class="rc-btn primary" data-fix="${esc(s.found)}" data-to="${esc(s.suggestion)}">Replace all</button></span></div>`).join('')
          + (ig.pairs.length ? `<p class="nm-ignored">${ig.pairs.length} suggestion${ig.pairs.length === 1 ? '' : 's'} ignored. <button class="link-btn" id="nm-unignore">Show them again</button></p>` : '')
        : `<div class="sr-total ok">✓ No misspelled names found.</div>`) +
        `<div class="sr-total" style="margin-top:14px">How often each name appears</div><div class="fq-list">${names.map(n => `<button class="fq-row" data-w="${esc(n.name)}"><span class="fq-word">${esc(n.name)}</span><span class="fq-n">${fmt(n.count)}</span></button>`).join('')}</div>`;
      $$('#nm-results [data-ign]', body).forEach(b => b.onclick = () => { ig.pairs.push(b.dataset.ign); scheduleMeta(); renderNames(); });
      { const all = $('#nm-ignore-all', body); if (all) all.onclick = () => { const before = ig.pairs.slice(); suspects.forEach(s => ig.pairs.push(s.found + '|' + s.suggestion)); scheduleMeta(); renderNames(); toastAction(`Ignored ${suspects.length} suggestion${suspects.length === 1 ? '' : 's'}.`, 'Undo', () => { ig.pairs = before; S.project.nameIgnore.pairs = before; scheduleMeta(); renderNames(); }); }; }
      { const un = $('#nm-unignore', body); if (un) un.onclick = () => { ig.pairs = []; S.project.nameIgnore.pairs = []; scheduleMeta(); renderNames(); }; }
      $$('#nm-results [data-find]', body).forEach(b => b.onclick = () => { $('#sr-q', body).value = b.dataset.find; $('#sr-case', body).checked = true; setTab('search'); });
      $$('#nm-results [data-fix]', body).forEach(b => b.onclick = async () => { $('#sr-q', body).value = b.dataset.fix; $('#sr-r', body).value = b.dataset.to; $('#sr-case', body).checked = true; $('#sr-word', body).checked = true; setTab('search'); });
      $$('#nm-results .fq-row', body).forEach(b => b.onclick = () => { $('#sr-q', body).value = b.dataset.w; setTab('search'); });
    }
    let cur = tab;
    function renderAll() { ({ search: renderSearch, freq: renderFreq, phrases: renderPhrases, names: renderNames })[cur](); }
    function setTab(t) {
      cur = t;
      $$('.srch-tabs [data-t]', body).forEach(b => b.classList.toggle('on', b.dataset.t === t));
      $$('.srch-pane', body).forEach(p => p.classList.toggle('hidden', p.dataset.p !== t));
      renderAll();
      if (t === 'search') $('#sr-q', body).focus();
    }
    $$('.srch-tabs [data-t]', body).forEach(b => b.onclick = () => setTab(b.dataset.t));
    let qt; $('#sr-q', body).oninput = () => { clearTimeout(qt); qt = setTimeout(renderSearch, 150); };
    $('#sr-case', body).onchange = renderSearch; $('#sr-word', body).onchange = renderSearch;
    $('#fq-common', body).onchange = renderFreq;
    $('#sr-scope', body).onchange = reload;
    $('#sr-q', body).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const h = $('.sr-hit', body); if (h) h.click(); } });
    $('#sr-replace', body).onclick = async () => {
      const q = $('#sr-q', body).value, r = $('#sr-r', body).value;
      if (!q) return;
      const n = await replaceAll(q, r, opts(), kinds());
      if (n != null) { await reload(); }
    };
    const p = modal({ title: 'Search & word analysis', body, wide: true, buttons: [{ label: 'Close', value: true, kind: 'ghost' }], onOpen: back => { back.querySelector('.modal').classList.add('xwide'); closeModal = () => back.querySelector('.m-foot .btn').click(); } });
    await reload(); setTab(tab);
    await p;
  }

  // Replace inside one document's HTML (a detached element). Works paragraph by paragraph on the text as it reads, so a
  // word split by formatting ("Gr<i>eg</i>") is found and replaced too; the replacement takes the formatting of where the
  // word starts. Text deleted with tracked changes is left alone, and line breaks and footnote marks separate words.
  function replaceInTree(root, re, rep, opts) {
    const fix = m => opts.matchCase || !rep ? rep : m.length > 1 && m === m.toUpperCase() && m !== m.toLowerCase() ? rep.toUpperCase() : /^\p{Lu}/u.test(m) ? rep[0].toUpperCase() + rep.slice(1) : rep;   // GREG → BOB, Greg → Bob
    const BLOCK = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,td,th,pre,div';
    const groups = new Map();
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, { acceptNode: n => n.nodeType === 1 && (n.matches('del.tc-del, sup.fn, [contenteditable="false"]')) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    const groupOf = n => { const b = n.parentElement; const blk = b && b.closest(BLOCK); return blk && root.contains(blk) ? blk : root; };
    let t;
    while ((t = tw.nextNode())) {
      const g = groupOf(t); if (!groups.has(g)) groups.set(g, []);
      if (t.nodeType === 3) groups.get(g).push({ node: t, text: t.nodeValue });
      else if (t.tagName === 'BR' || t.tagName === 'IMG') groups.get(g).push({ node: null, text: '\n' });
    }
    // footnote marks and other locked bits were skipped above: put a separator where they sit, so "Greg¹" still matches
    for (const el of root.querySelectorAll('sup.fn, [contenteditable="false"]')) { const g = groupOf(el); const list = groups.get(g); if (!list) continue;
      const after = list.findIndex(x => x.node && (el.compareDocumentPosition(x.node) & Node.DOCUMENT_POSITION_FOLLOWING));
      list.splice(after < 0 ? list.length : after, 0, { node: null, text: '\n' }); }
    let count = 0;
    for (const segs of groups.values()) {
      let full = ''; const at = []; for (const sg of segs) { at.push(full.length); full += sg.text; }
      const hits = []; let m; re.lastIndex = 0;
      while ((m = re.exec(full))) { if (!m[0].length) { re.lastIndex++; continue; } hits.push([m.index, m.index + m[0].length, m[0]]); }
      // from the end, so earlier positions stay right
      for (const [a, b, word] of hits.reverse()) {
        const si = segs.findIndex((sg, k) => sg.node && a >= at[k] && a < at[k] + sg.text.length);
        if (si < 0) continue;
        if (segs.slice(si, segs.length).some((sg, k) => !sg.node && at[si + k] < b)) continue;   // runs across a line break: leave it
        let ei = si; while (ei < segs.length - 1 && at[ei] + segs[ei].text.length < b) ei++;
        const s0 = segs[si], e0 = segs[ei];
        const head = s0.text.slice(0, a - at[si]), tail = e0.text.slice(b - at[ei]);
        if (si === ei) s0.text = head + fix(word) + tail;
        else { s0.text = head + fix(word); for (let k = si + 1; k < ei; k++) segs[k].text = ''; e0.text = tail; }
        count++;
      }
      for (const sg of segs) if (sg.node && sg.node.nodeValue !== sg.text) {
        if (sg.text) { sg.node.nodeValue = sg.text; continue; }
        // a bit of text emptied by a replace goes, and so does formatting left holding nothing ("<i></i>")
        let el = sg.node.parentElement; sg.node.remove();
        while (el && el !== root && el.matches('i,b,em,strong,u,s,span,sup,sub,mark,font') && !el.childNodes.length) { const up = el.parentElement; el.remove(); el = up; }
      }
    }
    return count;
  }
  // Replace across documents, text only (formatting is kept). Takes a snapshot of every changed document first.
  async function replaceAll(q, rep, opts, kinds) {
    await flushSave(); await flushSplit();
    const re = searchRegex(q, opts);
    const changed = [];
    let count = 0;
    const current = id => id === S.docId ? editor.innerHTML : id === S.splitId ? spEd.innerHTML : null;
    for (const d of docsIn(kinds)) {
      const html = current(d.id) ?? await api.loadDoc(S.slug, d.id);
      const div = document.createElement('div'); div.innerHTML = html;
      const n = replaceInTree(div, re, rep, opts);
      if (n) { changed.push({ d, before: html, after: div.innerHTML }); count += n; }
    }
    if (!count) { toast('Nothing to replace.'); return 0; }
    if (!(await confirmBox('Replace all?', `Replace <b>${fmt(count)}</b> use${count === 1 ? '' : 's'} of “${esc(q)}” with “${esc(rep)}” in ${changed.length} document${changed.length === 1 ? '' : 's'}?<br><br>Unwip saves a snapshot of each document first, so you can undo this.`, 'Replace all'))) return null;
    await flushSave(); await flushSplit();
    const show = (id, html) => {
      if (id === S.docId) { editor.innerHTML = html; resyncWords(); markScenes(editor); S.loadedHTML = editor.innerHTML; }
      if (id === S.splitId) { spEd.innerHTML = html; S.splitDirty = false; spFoot(); }
    };
    for (const c of changed) {
      await api.snapSave(S.slug, c.d.id, c.before, `Before replacing “${q}” with “${rep}”`, true);
      await api.saveDoc(S.slug, c.d.id, c.after);
      c.d.words = countWords(htmlText(c.after));
      show(c.d.id, c.after);
      c.saved = c.d.id === S.docId ? editor.innerHTML : c.after;   // how it reads back, to tell later whether it was changed again
    }
    scheduleMeta(); renderBinder(); updateStatus(); refreshSnapCount();
    toastAction(`Replaced ${fmt(count)} in ${changed.length} document${changed.length === 1 ? '' : 's'}.`, 'Undo', async () => {
      await flushSave(); await flushSplit();
      // a document written in since the replace keeps that writing: it isn't put back (its snapshot still has the old version)
      let kept = 0;
      for (const c of changed) {
        const now = current(c.d.id) ?? await api.loadDoc(S.slug, c.d.id);
        if (now !== c.saved && now !== c.after) { kept++; continue; }
        await api.saveDoc(S.slug, c.d.id, c.before); c.d.words = countWords(htmlText(c.before)); show(c.d.id, c.before);
      }
      scheduleMeta(); renderBinder(); updateStatus();
      toast(kept ? `Replace undone, except in ${kept} document${kept === 1 ? '' : 's'} you’ve written in since (to undo there, open Snapshots: the version from before the replace is saved).` : 'Replace undone.', kept ? 'warn' : '', kept ? 9000 : undefined);
    }, 15000);
    return count;
  }
  $('#btn-search').innerHTML = I.search;
  $('#btn-search').onclick = () => openSearch('search');
  $('#rp-analysis').onclick = () => openSearch('freq');
  $('#rp-read').onclick = () => window.UnwipRead && window.UnwipRead.open();
  $('#btn-listen').onclick = () => { const R = window.UnwipRead; if (!R) return; if (document.querySelector('.ra-bar')) R.stop(); else R.open(); };
  $('#btn-listen').addEventListener('mousedown', e => e.preventDefault());

  // ================================================================== SNAPSHOTS
  $('#snap-ic').innerHTML = I.history;
  async function refreshSnapCount() {
    if (!S.docId) return;
    const list = await api.snapList(S.slug, S.docId).catch(() => []);
    $('#snap-count').textContent = list.length ? list.length : '';
  }
  async function takeSnapshot(label) {
    if (!S.docId) return;
    await flushSave();
    await api.snapSave(S.slug, S.docId, editor.innerHTML, label || '', false);
    refreshSnapCount();
    window.UnwipStart && window.UnwipStart.done('snapshot');
    toast(`Snapshot saved${label ? `: “${esc(label)}”` : ''}.`);
  }
  // first change to a document each day keeps a copy of how it was before
  async function autoSnapshotIfNeeded(id, previousHTML) {
    S.autoSnapDone = S.autoSnapDone || {};
    const key = id + '|' + today();
    if (S.autoSnapDone[key] || !previousHTML || !htmlText(previousHTML).trim()) return;
    S.autoSnapDone[key] = true;
    const list = await api.snapList(S.slug, id).catch(() => []);
    if (list.some(s => new Date(s.ts).toLocaleDateString('en-CA') === today())) return;
    await api.snapSave(S.slug, id, previousHTML, 'Automatic: start of ' + new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }), true);
    refreshSnapCount();
  }
  async function snapshotsDialog(openTs) {
    if (!S.docId) return;
    await flushSave();
    const id = S.docId, title = findNode(id).node.title;
    const body = document.createElement('div');
    body.className = 'snaps';
    const paras = html => { const d = document.createElement('div'); d.innerHTML = html; return [...d.children].map(e => e.textContent); };
    let list = [];
    async function render(selectedTs) {
      list = await api.snapList(S.slug, id);
      const curWords = countWords(editorText());
      body.innerHTML = `
        <div class="snap-side">
          <div class="snap-take"><input type="text" id="sn-label" placeholder="Name this version (optional)"><button class="btn primary" id="sn-take">Take snapshot</button></div>
          <div class="snap-list">${list.length ? list.map(s => `<button class="snap-item ${s.ts === selectedTs ? 'on' : ''}" data-ts="${s.ts}">
            <b>${esc(s.label || 'Snapshot')}</b><span>${new Date(s.ts).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}${s.auto ? ' · automatic' : ''}</span></button>`).join('') : '<p class="srch-empty">No snapshots yet. Take one before a big rewrite.</p>'}</div>
        </div>
        <div class="snap-main" id="sn-main"><p class="srch-empty">Pick a snapshot to compare it with the current text.<br><br>Unwip also keeps one automatically the first time you change a chapter each day, and before any “Replace all”.</p></div>`;
      $('#sn-take', body).onclick = async () => { await takeSnapshot($('#sn-label', body).value.trim()); render(); };
      $('#sn-label', body).onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('#sn-take', body).click(); } };
      $$('.snap-item', body).forEach(b => b.onclick = () => { $$('.snap-item', body).forEach(x => x.classList.remove('on')); b.classList.add('on'); show(+b.dataset.ts, curWords); });
      if (selectedTs) show(selectedTs, curWords);
    }
    async function show(ts, curWords) {
      const html = await api.snapLoad(S.slug, id, ts);
      if (html == null) return;
      const d = Ana.diff(paras(html), paras(editor.innerHTML));
      const s = list.find(x => x.ts === ts);
      const words = countWords(htmlText(html));
      $('#sn-main', body).innerHTML = `
        <div class="snap-head"><div><b>${esc(s.label || 'Snapshot')}</b><span>${fmt(words)} words then → ${fmt(curWords)} now · <ins>+${fmt(d.added)}</ins> <del>−${fmt(d.removed)}</del> · ${d.changed} paragraph${d.changed === 1 ? '' : 's'} edited</span></div>
          <div class="snap-acts"><button class="rc-btn" id="sn-rename">Rename</button><button class="rc-btn" id="sn-del">Delete</button><button class="rc-btn primary" id="sn-restore">Restore this version</button></div></div>
        <div class="snap-legend"><del>Removed since then</del> <ins>Added since then</ins></div>
        <div class="snap-diff">${d.html || '<p class="srch-empty">No differences.</p>'}</div>`;
      $('#sn-restore', body).onclick = async () => {
        if (!(await confirmBox('Restore this version?', 'Your current text will be saved as a snapshot first, so nothing is lost.', 'Restore'))) return;
        await api.snapSave(S.slug, id, editor.innerHTML, 'Before restoring an older version', true);
        editor.innerHTML = html; resyncWords(); markScenes(editor); S.dirty = true; await flushSave(); updateStatus(); renderBinder();
        toast('Restored.'); render();
      };
      $('#sn-del', body).onclick = async () => { if (await confirmBox('Delete snapshot?', 'This saved version will be removed.', 'Delete', true)) { await api.snapDelete(S.slug, id, ts); render(); } };
      $('#sn-rename', body).onclick = async () => { const l = await promptText('Rename snapshot', 'Name', s.label || ''); if (l != null) { await api.snapRename(S.slug, id, ts, l); render(ts); } };
    }
    await render(typeof openTs === 'number' ? openTs : undefined);
    await modal({ title: `Snapshots · ${title}`, body, wide: true, buttons: [{ label: 'Close', value: true, kind: 'ghost' }], onOpen: back => back.querySelector('.modal').classList.add('xwide') });
    refreshSnapCount();
  }
  $('#btn-snap').onclick = snapshotsDialog;

  // ================================================================== IMPORT
  async function importDocxInto(parentId) {
    let file;
    try { file = await api.importDocx(); } catch (e) { toast('Could not open that file.'); return; }
    if (!file) return;
    let html;
    try { html = await window.FolioImport.docxToHTML(file.bytes); } catch (e) { toast(esc(e.message || 'Could not read that Word file.'), 'warn', 6000); return; }
    const chapters = window.FolioImport.splitChapters(html);
    const split = chapters.length > 1 && await confirmBox('Split into chapters?', `This file looks like it has <b>${chapters.length} chapters</b>. Import each as its own document?`, 'Split into chapters');
    const parent = findNode(parentId || 'root-manuscript').node;
    const items = split ? chapters : [{ title: file.name, html }];
    for (const c of items) {
      const node = { id: uid(), type: 'doc', title: c.title, words: 0 };
      const clean = Clip.dropBlankLines(Clip.cleanPaste(c.html, {})).html;
      await api.saveDoc(S.slug, node.id, clean);
      node.words = countWords(htmlText(clean));
      parent.children.push(node);
    }
    parent.open = true;
    scheduleMeta(); renderBinder(); updateStatus();
    toast(`Imported ${items.length} document${items.length === 1 ? '' : 's'} from ${esc(file.name)}.`);
  }
  // the three-step Scrivener import lives in scrivimport.js
  // imports run with Dropbox syncing held back until the whole book is written (dropbox.js hold)
  const holdSync = fn => window.UnwipDropbox && window.UnwipDropbox.hold ? window.UnwipDropbox.hold(fn) : fn();
  { const raw = importWordProject; importWordProject = (...a) => holdSync(() => raw(...a)); }
  { const raw = importDocxInto; importDocxInto = (...a) => holdSync(() => raw(...a)); }
  async function importScrivener() { if (window.UnwipScriv) return window.UnwipScriv.start(); }
  // every way to bring a book in (the import room lists them; with its guide off, the Import button shows them as a menu)
  function importSources() {
    return [
      ...(window.UnwipBookImport ? window.UnwipBookImport.menuItems() : []), { sep: true },
      { label: 'Scrivener project (.scriv)…', action: importScrivener },
      { label: 'Restore from a backup file (.unwip)…', action: async () => { try { const slug = await api.backupImportFile(); if (slug) { try { await Fonts.loadImported(await api.importedFonts()); } catch {} toast('Backup restored as a new book.'); showLibrary(); } } catch (e) { toast(esc(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')), 'warn', 7000); } } }
    ];
  }
  $('#btn-import').onclick = e => {
    if (window.UnwipImportRoom) return window.UnwipImportRoom.open();
    const r = e.target.getBoundingClientRect();
    showMenu(r.left, r.bottom + 4, importSources());
  };
  async function importWordProject() {
    const title = await promptText('New book from a Word file', 'Book title', '');
    if (!title) return;
    const slug = await api.createProject(title, (() => { const t = newProjectTemplate(); t.binder[0].children = []; return t; })());
    await openProject(slug); await importDocxInto('root-manuscript');
  }

  // ================================================================== FOCUSED / DETAILED MODE & OUTLINE
  // Status labels are per project and fully editable (name + colour), like Scrivener's labels.
  const DEFAULT_STATUSES = [{ id: 'todo', name: 'To do', color: '#9b968d' }, { id: 'draft', name: 'First draft', color: '#d39b2a' }, { id: 'revised', name: 'Revised', color: '#4a7fd0' }, { id: 'final', name: 'Final', color: '#3f9a5a' }];
  function statusList() { if (!S.project.statuses) S.project.statuses = JSON.parse(JSON.stringify(DEFAULT_STATUSES)); return S.project.statuses; }
  function statusOf(id) { return id ? statusList().find(x => x.id === id) : null; }
  const statusColor = id => (statusOf(id) || {}).color || 'var(--line)';
  const statusName = id => (statusOf(id) || {}).name || 'No status';
  const statusOptions = () => [['', 'No status'], ...statusList().map(x => [x.id, x.name])];
  async function editStatuses() {
    const list = JSON.parse(JSON.stringify(statusList()));
    const PRESETS = ['#9b968d', '#d39b2a', '#4a7fd0', '#3f9a5a', '#c0392b', '#7a5cc7', '#13a1a1', '#c2577a', '#e67e22', '#2c3e50'];
    const body = document.createElement('div');
    const render = () => {
      body.innerHTML = `<p>Name your stages however you like (e.g. Outline, Drafted, With beta readers, Done) and pick a colour for each. They show in the binder, outline and corkboard.</p>
        <div class="stat-edit">${list.map((x, i) => `<div class="se-row" data-i="${i}">
          <label class="se-swatch" style="background:${x.color}"><input type="color" value="${x.color}"></label>
          <input type="text" class="se-name" value="${esc(x.name)}">
          <div class="se-presets">${PRESETS.map(c => `<button type="button" class="se-p" data-c="${c}" style="background:${c}" title="${c}"></button>`).join('')}</div>
          <button type="button" class="icon-btn small se-up" title="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="icon-btn small se-down" title="Move down" ${i === list.length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" class="icon-btn small se-del" title="Remove">${I.x}</button>
        </div>`).join('')}</div>
        <button type="button" class="btn small" id="se-add" style="margin-top:10px">+ Add status</button>
        <button type="button" class="btn small ghost" id="se-reset" style="margin-top:10px">Reset to defaults</button>`;
      $$('.se-row', body).forEach(row => {
        const x = list[+row.dataset.i];
        $('input[type=color]', row).oninput = e => { x.color = e.target.value; $('.se-swatch', row).style.background = x.color; };
        $('.se-name', row).oninput = e => { x.name = e.target.value; };
        $$('.se-p', row).forEach(b => b.onclick = () => { x.color = b.dataset.c; render(); });
        $('.se-up', row).onclick = () => { const i = +row.dataset.i; [list[i - 1], list[i]] = [list[i], list[i - 1]]; render(); };
        $('.se-down', row).onclick = () => { const i = +row.dataset.i; [list[i + 1], list[i]] = [list[i], list[i + 1]]; render(); };
        $('.se-del', row).onclick = () => { list.splice(+row.dataset.i, 1); render(); };
      });
      $('#se-add', body).onclick = () => { list.push({ id: 's' + uid(), name: 'New status', color: PRESETS[list.length % PRESETS.length] }); render(); const n = $$('.se-name', body).pop(); n.focus(); n.select(); };
      $('#se-reset', body).onclick = () => { list.splice(0, list.length, ...JSON.parse(JSON.stringify(DEFAULT_STATUSES))); render(); };
    };
    render();
    const ok = await modal({ title: 'Status labels', body, wide: true, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Save', value: true, kind: 'primary' }] });
    if (!ok) return;
    S.project.statuses = list.map(x => ({ ...x, name: x.name.trim() || 'Untitled status' }));
    const ids = new Set(S.project.statuses.map(x => x.id));
    walkTree(S.project.binder, n => { if (n.status && !ids.has(n.status)) delete n.status; });
    scheduleMeta(); renderBinder(); refreshPlanView();
  }
  // Levels: Focus (0, stored as 'focused'), Detail (1, 'detailed'), Lore (2, 'lore'). Each level shows everything the one
  // before it does, plus more; switching only hides and shows, it never changes the book. Code that asks "is Detail on?"
  // uses level() >= 1, never S.mode === 'detailed' (that would be false in Lore).
  const LEVELS = ['focused', 'detailed', 'lore'];
  const phoneMQ = window.matchMedia('(max-width: 720px)');
  // phones stop at Detail: Lore's tools need a bigger screen. A device that's switched to Lore keeps it saved, so it comes
  // back when the window is wide again; on a phone it simply counts as Detail.
  function level(m = S.mode) { const l = Math.max(0, LEVELS.indexOf(m)); return phoneMQ.matches ? Math.min(l, 1) : l; }
  function applyLevelClasses(m) {
    document.body.classList.toggle('detailed', level(m) >= 1);
    document.body.classList.toggle('lore', level(m) >= 2);
    const shown = LEVELS[level(m)];
    $$('#mode-switch button, #lib-mode button').forEach(b => b.classList.toggle('on', b.dataset.m === shown));
  }
  function setMode(m) {
    if (!LEVELS.includes(m)) m = 'focused';
    const before = S.mode;
    S.mode = m;
    if (level(m) >= 1 && S.project) window.UnwipStart && window.UnwipStart.done('detailed');
    try { localStorage.setItem('folio-mode', m); } catch {}
    applyLevelClasses(m);
    emit('level', m, before);
    if (!S.project) return;
    if (S.revise && !revisePrefs().level) runRevise();      // Revise follows the level until set separately
    if (level(m) < 1 && S.view !== 'write') setView('write');
    renderBinder(); fitSynopsis();
  }
  $$('#mode-switch button, #lib-mode button').forEach(b => b.onclick = () => setMode(b.dataset.m));
  phoneMQ.addEventListener('change', () => { applyLevelClasses(S.mode); emit('level', S.mode, S.mode); });
  function setView(v) {
    S.view = v;
    setTimeout(() => emit('view', v), 0);
    $$('#plan-nav button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    const views = { outline: '#outline-view', cork: '#cork-view', mood: '#mood-view', timeline: '#timeline-view', insights: '#insights-view' };
    for (const [k, sel] of Object.entries(views)) $(sel).classList.toggle('hidden', v !== k);
    $('#page').classList.toggle('hidden', v !== 'write' || !S.docId);
    $('#empty-state').classList.toggle('hidden', v !== 'write' || !!S.docId);
    document.body.classList.toggle('in-outline', v !== 'write');
    document.body.classList.toggle('in-mood', v === 'mood');
    if (v !== 'write' && S.revise) setRevise(false);
    // back to the chapter: show what the outline or corkboard changed (synopsis and title)
    if (v === 'write' && S.docId) { const f = findNode(S.docId); if (f) { const sy = $('#doc-synopsis'); if (sy && document.activeElement !== sy) { sy.value = f.node.synopsis || ''; requestAnimationFrame(() => { sy.style.height = 'auto'; const h = sy.scrollHeight; sy.style.height = h ? h + 'px' : ''; }); } const t = $('#doc-title'); if (t && document.activeElement !== t && 'value' in t && t.value !== (f.node.title || '')) t.value = f.node.title || ''; } }
    if (v === 'outline') renderOutline();
    if (v === 'cork') renderCork();
    if (v === 'mood') renderMood();
    if (v === 'timeline') renderTimeline();
    if (v === 'insights' && window.UnwipInsights) window.UnwipInsights.render();
  }
  $$('#plan-nav button').forEach(b => b.onclick = () => setView(b.dataset.v));

  // synopsis under the title (detailed mode)
  const synopsis = $('#doc-synopsis');
  // measured while hidden (Focus, or the phone's chapter list), scrollHeight is 0 and the line was squashed flat
  function fitSynopsis() { synopsis.style.height = 'auto'; const h = synopsis.scrollHeight; synopsis.style.height = h ? h + 'px' : ''; }
  synopsis.addEventListener('focus', fitSynopsis);
  // and measured again once it's on screen (a phone opens the chapter before showing its page) or its width changes
  if (window.ResizeObserver) { let w = 0; new ResizeObserver(() => { const nw = synopsis.clientWidth; if (nw && nw !== w) { w = nw; fitSynopsis(); } }).observe(synopsis); }
  synopsis.addEventListener('input', () => { const f = findNode(S.docId); if (!f) return; f.node.synopsis = synopsis.value; fitSynopsis(); scheduleMeta(); });
  synopsis.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); editor.focus(); } });

  function renderOutline() {
    const ov = $('#outline-view');
    const ms = findNode('root-manuscript').node;
    const rows = [];
    let chapterNo = 0;
    const walk = (list, depth) => list.forEach(n => {
      if (depth === 0) chapterNo++;
      rows.push({ n, depth, no: depth === 0 ? chapterNo : '' });
      if (n.type === 'folder') walk(n.children || [], depth + 1);
    });
    walk(ms.children || [], 0);
    const total = folderWords(ms);
    const goal = (S.project.goals || {}).total || 0;
    const counts = Object.fromEntries(statusList().map(x => [x.id, 0]));
    rows.forEach(r => { if (r.n.type === 'doc' && statusOf(r.n.status)) counts[r.n.status]++; });
    const docsN = rows.filter(r => r.n.type === 'doc').length;
    ov.innerHTML = `
      <div class="ol-head">
        <div><h2>Outline</h2><span>${docsN} documents · ${fmt(total)} words${goal ? ` of ${fmt(goal)}` : ''}</span></div>
        <div class="ol-status-wrap"><div class="ol-status-bar" title="Progress by status">${statusList().slice().reverse().map(x => counts[x.id] ? `<i style="--st:${x.color};flex:${counts[x.id]}" title="${esc(x.name)}: ${counts[x.id]}"></i>` : '').join('')}${docsN - Object.values(counts).reduce((a, b) => a + b, 0) ? `<i style="--st:var(--line);flex:${docsN - Object.values(counts).reduce((a, b) => a + b, 0)}"></i>` : ''}</div><button class="btn small ghost" id="ol-edit-status">Edit status labels…</button></div>
      </div>
      <div class="ol-table">
        <div class="ol-row ol-th"><span>#</span><span>Title</span><span>Synopsis</span><span>POV</span><span>Status</span><span class="num">Words</span></div>
        ${rows.map(({ n, depth, no }) => `
          <div class="ol-row ${n.type}" data-id="${n.id}">
            <span class="ol-no">${no}</span>
            <span class="ol-title" style="padding-left:${depth * 18}px">${n.icon ? iconHTML(n, '') : n.type === 'folder' ? I.folder : ''}<button class="ol-open" title="Open">${esc(n.title || 'Untitled')}</button>${n.label ? `<span class="lbl-chip" style="--lc:${esc(n.label.c)}" title="Label">${esc(n.label.n)}</span>` : ''}</span>
            <span><textarea class="ol-syn" rows="1" placeholder="${n.type === 'folder' ? 'What this part covers…' : 'What happens…'}">${esc(n.synopsis || '')}</textarea></span>
            <span><input class="ol-pov" value="${esc(n.pov || '')}" placeholder="POV" title="POV (point of view): the character this chapter is told through" list="ol-pov-list"></span>
            <span>${n.type === 'doc' ? `<select class="ol-status" style="--st:${statusColor(n.status)}">${statusOptions().map(([v, l]) => `<option value="${v}" ${v === (n.status || '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>` : ''}</span>
            <span class="num">${fmt(folderWords(n))}</span>
          </div>`).join('')}
      </div>
      <datalist id="ol-pov-list">${[...new Set(window.FolioNames.entries.filter(e => e.kind === 'Character' && !e.primary).map(e => e.text))].map(t => `<option value="${esc(t)}">`).join('')}</datalist>
      <p class="ol-tip">Drag documents in the binder to reorder. Click a title to open it. Synopses also show under the title while you write at the Detail level.</p>`;
    $$('.ol-syn', ov).forEach(t => { const fit = () => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }; requestAnimationFrame(fit); t.oninput = () => { findNode(t.closest('.ol-row').dataset.id).node.synopsis = t.value; fit(); scheduleMeta(); }; });
    $$('.ol-pov', ov).forEach(t => t.oninput = () => { findNode(t.closest('.ol-row').dataset.id).node.pov = t.value; scheduleMeta(); });
    $$('.ol-status', ov).forEach(sel => sel.onchange = () => { findNode(sel.closest('.ol-row').dataset.id).node.status = sel.value; scheduleMeta(); renderBinder(); renderOutline(); });
    $('#ol-edit-status', ov).onclick = editStatuses;
    $$('.ol-open', ov).forEach(b => b.onclick = () => { const n = findNode(b.closest('.ol-row').dataset.id).node; if (n.type === 'doc') { setView('write'); openDoc(n.id); } else { n.open = true; S.selectedId = n.id; renderBinder(); } });
  }

  // ================================================================== CORKBOARD (corkboard.js)
  const renderCork = () => window.UnwipCork && window.UnwipCork.render();

  // ================================================================== MOODBOARD, TIMELINE (moodboard.js, timeline.js)
  const renderMood = () => window.UnwipMood && window.UnwipMood.render();
  const renderTimeline = () => window.UnwipTimeline && window.UnwipTimeline.render();
  const editEvent = (ev, seed) => window.UnwipTimeline && window.UnwipTimeline.edit(ev, seed);

  // ================================================================== SPLIT VIEW
  const spEd = $('#sp-editor');
  $('#btn-split').innerHTML = I.columns;
  $('#sp-open').innerHTML = I.export;
  let spTimer = null;
  // ---- choosing the document beside your chapter: the binder's own folders, which open and close like the binder
  const spOpenFolders = new Set();
  function spLabel() { const f = S.splitId && findNode(S.splitId); $('.sp-pick-t', $('#sp-doc')).textContent = f ? (f.node.map ? '🗺️ ' : '') + (f.node.title || 'Untitled') : 'Choose a document'; }
  function spPicker() {
    const old = document.querySelector('.sp-menu'); if (old) { old.remove(); return; }
    const btn = $('#sp-doc'), r = btn.getBoundingClientRect();
    const menu = document.createElement('div'); menu.className = 'sp-menu'; menu.setAttribute('role', 'listbox');
    menu.style.left = r.left + 'px'; menu.style.top = (r.bottom + 4) + 'px'; menu.style.width = Math.max(r.width, 300) + 'px';
    // the folders holding the split document and your chapter start open
    for (const id of [S.splitId, S.docId]) { let f = id && findNode(id); while (f && f.parent) { spOpenFolders.add(f.parent.id); f = findNode(f.parent.id); } }
    menu.innerHTML = `<input type="text" class="sp-menu-q" placeholder="Type to find a document…" spellcheck="false"><div class="sp-menu-list"></div>`;
    const list = $('.sp-menu-list', menu), q = $('.sp-menu-q', menu);
    const draw = () => {
      const term = q.value.trim().toLowerCase(), rows = [];
      const row = (n, d, kind) => {
        if (kind === 'doc') rows.push(`<button type="button" class="sp-mi doc ${n.id === S.splitId ? 'on' : ''} ${n.id === S.docId ? 'cur' : ''}" data-id="${n.id}" style="--d:${d}">${n.map ? '🗺️ ' : ''}${esc(n.title || 'Untitled')}${n.id === S.docId ? ' <small>(open on the left)</small>' : ''}</button>`);
        else rows.push(`<button type="button" class="sp-mi ${kind}" data-f="${n.id}" style="--d:${d}"><span class="sp-chev ${spOpenFolders.has(n.id) || term ? 'open' : ''}">${I.chevron}</span>${kind === 'root' ? `<b>${esc(n.title)}</b>` : esc(n.title || 'Folder')}</button>`);
      };
      const hit = n => n.type === 'doc' ? (n.title || '').toLowerCase().includes(term) : (n.children || []).some(hit);
      const walk = (ns, d) => ns.forEach(n => {
        if (term && !hit(n)) return;
        if (n.type === 'doc') return row(n, d, 'doc');
        if (!(n.children || []).length) return;
        row(n, d, 'folder'); if (term || spOpenFolders.has(n.id)) walk(n.children, d + 1);
      });
      for (const rt of S.project.binder) {
        if (rt.kind === 'trash' || !rt.root || !(rt.children || []).length || (term && !hit(rt))) continue;
        if (!spOpenFolders.has(rt.id) && !term && !spOpenFolders.has('seen:' + rt.id)) { spOpenFolders.add('seen:' + rt.id); if (rt.kind === 'manuscript' || rt.kind === rootOf(S.splitId || '')?.kind) spOpenFolders.add(rt.id); }
        row(rt, 0, 'root'); if (term || spOpenFolders.has(rt.id)) walk(rt.children, 1);
      }
      list.innerHTML = rows.join('') || '<p class="sp-menu-none">No document by that name.</p>';
    };
    list.addEventListener('click', e => {
      const b = e.target.closest('.sp-mi'); if (!b) return;
      if (b.dataset.f) { const id = b.dataset.f; spOpenFolders.has(id) ? spOpenFolders.delete(id) : spOpenFolders.add(id); draw(); q.focus(); return; }
      close(); openSplit(b.dataset.id);
    });
    q.addEventListener('input', draw);
    const close = () => { menu.remove(); document.removeEventListener('mousedown', away, true); document.removeEventListener('keydown', key, true); };
    const away = e => { if (!menu.contains(e.target) && !btn.contains(e.target)) close(); };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } else if (e.key === 'Enter' && document.activeElement === q) { const first = list.querySelector('.sp-mi.doc'); if (first) { e.preventDefault(); close(); openSplit(first.dataset.id); } } };
    document.addEventListener('mousedown', away, true); document.addEventListener('keydown', key, true);
    document.body.appendChild(menu); draw(); q.focus();
    const mr = menu.getBoundingClientRect(); if (mr.right > innerWidth - 8) menu.style.left = Math.max(8, innerWidth - 8 - mr.width) + 'px';
    const on = list.querySelector('.sp-mi.on'); if (on) on.scrollIntoView({ block: 'center' });
  }
  async function openSplit(id) {
    // a phone is too small for two pages side by side: open the other one as its own page instead, and ‹ comes back
    if (document.documentElement.classList.contains('m-phone')) {
      if (!id || id === S.docId || !findNode(id)) return;
      const from = S.docId;
      if (S.view !== 'write') setView('write');
      await openDoc(id);
      S.phoneReturn = from && from !== id ? from : null;
      if (window.UnwipMobile) window.UnwipMobile.showPage();
      return;
    }
    await flushSplit();
    if (!id) {   // pick something useful: first character sheet, else first note, else next chapter
      const pick = k => { const r = S.project.binder.find(x => x.kind === k); let f = null; if (r) walkTree(r.children || [], n => { if (n.type === 'doc' && n.id !== S.docId) { f = n.id; return false; } }); return f; };
      id = S.splitId && findNode(S.splitId) ? S.splitId : (pick('characters') || pick('notes') || pick('places') || pick('manuscript'));
      if (!id) { toast('Add a character sheet or a note first, then open it beside your chapter.'); return; }
    }
    if (id === S.docId) { toast('That document is already open on the left.'); return; }
    S.splitId = id; S.project.splitId = id; scheduleMeta();
    $('#split-pane').classList.remove('hidden');
    $('#btn-split').classList.add('on');
    spLabel();
    const fn = findNode(id);
    if (fn && fn.node.map) {   // a map: show its picture (edit it by opening it)
      spEd.contentEditable = 'false'; spEd.classList.add('sp-map'); spEd.classList.remove('sheet-like');
      spEd.innerHTML = '<p class="sp-map-wait">Drawing the map…</p>';
      const pics = window.UnwipMaps && window.UnwipMaps.pictures ? await window.UnwipMaps.pictures(id).catch(() => []) : [];
      if (S.splitId !== id) return;
      spEd.innerHTML = pics.length ? '' : '<p>Couldn’t draw this map.</p>';
      pics.forEach(p => { const fig = document.createElement('figure'); if (pics.length > 1) { const c = document.createElement('figcaption'); c.textContent = p.name; fig.appendChild(c); } p.canvas.className = 'sp-map-img'; fig.appendChild(p.canvas); spEd.appendChild(fig); });
      const b = document.createElement('button'); b.className = 'btn small'; b.textContent = 'Open this map to edit it'; b.onclick = () => openDoc(id); spEd.appendChild(b);
      $('#sp-foot').textContent = `Map · ${pics.length} section${pics.length === 1 ? '' : 's'} · ${rootOf(id).title || ''}`;
      return;
    }
    spEd.contentEditable = 'true'; spEd.classList.remove('sp-map');
    { const disk = await api.loadDoc(S.slug, id), kept = S.unsaved[`${S.slug}:${id}`]; spEd.innerHTML = (kept != null ? kept : disk) || '<p><br></p>'; if (kept != null) S.splitDirty = true; }
    spEd.classList.toggle('sheet-like', rootOf(id).kind !== 'manuscript');
    spFoot();
  }
  function spFoot() { const n = findNode(S.splitId); $('#sp-foot').textContent = n ? `${fmt(countWords(spEd.innerText))} words · ${rootOf(S.splitId).title || ''}` : ''; }
  async function flushSplit() {
    clearTimeout(spTimer);
    if (!S.splitDirty || !S.splitId || !S.slug) return;
    S.splitDirty = false;
    const html = spEd.innerHTML, slug = S.slug, id = S.splitId, ukey = `${slug}:${id}`;
    // a failed save keeps the words (and retries) the same way the main page does, instead of dropping them
    try { await api.saveDoc(slug, id, html); delete S.unsaved[ukey]; }
    catch (e) {
      S.unsaved[ukey] = html;
      saveTrouble(e, async () => { const now = S.splitId === id && S.slug === slug ? spEd.innerHTML : S.unsaved[ukey]; if (now == null) return; await api.saveDoc(slug, id, now); delete S.unsaved[ukey]; }, `split:${slug}:${id}`);
      return;
    }
    const f = findNode(S.splitId); if (f) f.node.words = countWords(spEd.innerText);
    if (f && ['characters', 'places', 'items'].includes(rootOf(S.splitId).kind)) scheduleNames();
    scheduleMeta();
  }
  async function closeSplit() {
    await flushSplit();
    S.splitId = null; S.project && (S.project.splitId = null); scheduleMeta();
    $('#split-pane').classList.add('hidden'); $('#btn-split').classList.remove('on');
  }
  spEd.addEventListener('input', () => { S.splitDirty = true; clearTimeout(spTimer); spTimer = setTimeout(flushSplit, 700); spFoot(); });
  spEd.addEventListener('paste', e => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html'), text = e.clipboardData.getData('text/plain');
    document.execCommand('insertHTML', false, html ? Clip.cleanPaste(html, { docFont: S.project.style.font, docSize: S.project.style.size }) : Clip.textToHTML(text));
  });
  $('#sp-doc').onclick = spPicker;
  $('#sp-close').onclick = closeSplit;
  $('#sp-open').onclick = async () => { const id = S.splitId; await closeSplit(); if (S.view !== 'write') setView('write'); openDoc(id); };
  // ---- a chapter in its own window, for a second screen (PC)
  async function popOut(id) {
    if (!api.popoutOpen) return;
    const f = findNode(id); if (!f || f.node.map || f.node.type !== 'doc') return;
    if (id === S.docId) await flushSave();
    if (id === S.splitId) await flushSplit();
    S.popped = S.popped || new Set(); S.popped.add(id); renderBinder();
    await api.popoutOpen(S.slug, id, f.node.title);
  }
  if (api.popoutOpen) {
    const pb = document.createElement('button'); pb.className = 'icon-btn small'; pb.id = 'sp-pop'; pb.title = 'Open in a new window (keeps it here too)'; pb.textContent = '⧉';
    $('#sp-open').before(pb); pb.onclick = () => { if (S.splitId) popOut(S.splitId); };
    let wordsT = null;
    api.onPopout(async d => {
      if (d.unsaved && d.html != null) {   // a chapter window closed while its save kept failing: keep those words and keep trying
        const ukey = `${d.slug}:${d.id}`; S.unsaved[ukey] = d.html;
        saveTrouble(new Error('A chapter window couldn’t save before it closed'), async () => { const now = S.slug === d.slug && S.docId === d.id ? editor.innerHTML : S.unsaved[ukey]; if (now == null) return; await api.saveDoc(d.slug, d.id, now); delete S.unsaved[ukey]; }, `pop:${ukey}`);
        return;
      }
      if (!S.slug || d.slug !== S.slug) return;
      S.popped = S.popped || new Set();
      if (d.open) S.popped.add(d.id); else S.popped.delete(d.id);
      const f = findNode(d.id);
      if (f && typeof d.words === 'number') { f.node.words = d.words; f.node.mod = Date.now(); S.dirtySinceBackup = true; clearTimeout(wordsT); wordsT = setTimeout(() => { if (!S.project || S.slug !== d.slug) return; scheduleMeta(); updateStatus(); renderBinder(); }, 800); }
      else renderBinder();
      if (d.saved) await takeInWindowChange(d.id);
      if (d.back && f && S.docId !== d.id) openDoc(d.id);
    });
    // the same chapter open here too: show what was written in the other window (not while typing here)
    async function takeInWindowChange(id) {
      if (!S.slug || (id !== S.docId && id !== S.splitId)) return;
      const html = await api.loadDoc(S.slug, id);
      if (id === S.docId && !S.dirty && html !== editor.innerHTML) {
        const sc = editorWrap.scrollTop; editor.innerHTML = html; S.loadedHTML = html; resyncWords(); markScenes(editor); editorWrap.scrollTop = sc;
      }
      if (id === S.splitId && !S.splitDirty && html !== spEd.innerHTML) { const sc = spEd.scrollTop; spEd.innerHTML = html; spFoot(); spEd.scrollTop = sc; }
    }
    // moving to another window saves what's typed here first, so it shows there straight away; coming back checks
    window.addEventListener('blur', () => { if (S.popped && S.popped.size) { flushSave(); flushSplit(); } });
    window.addEventListener('focus', () => { if (S.popped && S.popped.size) for (const id of [S.docId, S.splitId]) if (id && S.popped.has(id)) takeInWindowChange(id); });
  }
  // the chapter on the right changed on another device: take it in, or (if typing there) keep it in Snapshots
  api.onExternalChange(async info => {
    if (!S.slug || info.slug !== S.slug || !info.id || info.id !== S.splitId || info.id === S.docId) return;
    const id = info.id, incoming = await api.loadDoc(S.slug, id);
    if (S.splitId !== id || incoming === spEd.innerHTML) return;
    if (S.splitDirty) { await api.snapSave(S.slug, id, incoming, 'Version from another device', false).catch(() => {}); toast('The chapter on the right was also changed on another device. Its version is in Snapshots.', '', 8000); }
    else { const sc = spEd.scrollTop; spEd.innerHTML = incoming || '<p><br></p>'; spFoot(); spEd.scrollTop = sc; }
  });
  $('#btn-split').onclick = () => S.splitId ? closeSplit() : openSplit(null);

  // ================================================================== QUOTES
  const Quotes = window.UnwipQuotes;
  const quotesOn = () => (S.settings || {}).quotes !== false;
  const quoteHTML = q => `<blockquote class="q-text">“${esc(q[0])}”</blockquote><cite>${esc(q[1])}</cite>`;
  function renderQuoteCard(q) {
    const el = $('#quote-card');
    if (!quotesOn()) { el.classList.add('hidden'); return; }
    // keep the same quote while Unwip is open (syncing redraws this screen); only ↻ or a fresh start brings a new one
    q = renderQuoteCard.q = q || renderQuoteCard.q || Quotes.today();
    el.classList.remove('hidden');
    el.innerHTML = `${quoteHTML(q)}<button class="icon-btn small q-next" title="Another quote">${I.refresh}</button>`;
    $('.q-next', el).onclick = () => renderQuoteCard(Quotes.random(q));
  }
  function writerQuote() {
    if (!quotesOn()) return;
    const el = $('#writer-quote');
    el.innerHTML = quoteHTML(Quotes.random());
    el.classList.remove('hidden', 'out');
    clearTimeout(writerQuote.t); clearTimeout(writerQuote.t2);
    writerQuote.t = setTimeout(() => el.classList.add('out'), 6000);
    writerQuote.t2 = setTimeout(() => el.classList.add('hidden'), 7200);
  }
  function quoteToast(prefix) {
    if (!quotesOn()) { if (prefix) toast(prefix); return; }
    const q = Quotes.random();
    toast(`${prefix ? `<b>${prefix}</b><br>` : ''}<i>“${esc(q[0])}”</i><br><span style="opacity:.7">— ${esc(q[1])}</span>`, 'quote', 9000);
  }

  // ================================================================== SHORTCUTS
  document.addEventListener('keydown', e => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (!S.slug) return;
    if (e.key === 'F1') { e.preventDefault(); window.UnwipHelp && window.UnwipHelp.open(); }
    else if (e.key === 'F7') { e.preventDefault(); setRevise(!S.revise); }
    else if (e.key === 'F5') { e.preventDefault(); if (S.revise) $('#rp-refresh').click(); }
    else if (ctrl && e.key === '\\') { e.preventDefault(); $('#btn-split').click(); }
    else if (ctrl && e.shiftKey && !e.altKey && (e.code === 'BracketLeft' || e.key === '{' || e.key === '[')) { e.preventDefault(); if (window.UnwipSide) window.UnwipSide.toggleBinder(); }
    else if (ctrl && !e.shiftKey && e.key.toLowerCase() === 'd') { e.preventDefault(); const id = S.binderActive && S.selectedId ? S.selectedId : S.docId; if (id) toggleFav(id); }
    else if (e.key === 'F11') { e.preventDefault(); setWriter(!document.body.classList.contains('writer')); }
    else if (e.key === 'Escape' && document.body.classList.contains('writer') && !document.querySelector('.modal-back')) { setWriter(false); }
    else if (ctrl && !e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); openFind(); }
    else if (ctrl && !e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); S.dirty = true; flushSave().then(() => toast('Saved')); }
    else if (ctrl && e.shiftKey && e.key.toLowerCase() === 'c') { e.preventDefault(); copyDocForDocs(); }
    else if (ctrl && e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); openSearch('search', getSelection().toString().trim().slice(0, 60)); }
    else if (ctrl && e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); takeSnapshot(''); }
    else if (ctrl && e.shiftKey && e.key.toLowerCase() === 'k' && document.activeElement === editor) { e.preventDefault(); splitAtCursor(); }
    else if (e.key === 'Delete' && !ctrl && !e.altKey && !document.querySelector('.modal-back, .pv-back')) {
      const a = document.activeElement;
      const typing = a && (a === editor || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable);
      const inBinder = S.binderActive && S.view !== 'mood';
      const inCork = S.view === 'cork' && S.ckSelected;
      if (!typing && (inBinder || inCork) && deleteSelected()) e.preventDefault();
    }
    else if (e.key === 'Enter' && S.binderActive && S.view === 'write' && S.docId && document.activeElement === document.body) { e.preventDefault(); editor.focus(); }
    else if (ctrl && e.key.toLowerCase() === 'n' && !e.shiftKey) { e.preventDefault(); addNode('doc', S.selectedId); }
  });

  // ================================================================== START
  (async function start() {
    // every window says it's the beta: "… — Unwip Beta" (one watcher, so every page title gets it)
    if (!window.__betaTitle) { window.__betaTitle = 1; const t = document.querySelector('title'); const fix = () => { const n = document.title.replace(/Unwip(?= —|$)(?! Beta)/, 'Unwip Beta'); if (n !== document.title) document.title = n; }; fix(); if (t) new MutationObserver(fix).observe(t, { childList: true, characterData: true, subtree: true }); }
    try { S.settings = await api.getSettings(); } catch { S.settings = {}; }
    // a Build piece in its own window (PC/Mac, opened from inside a book): show just that piece
    const buildWin = new URLSearchParams(location.search).get('buildwin');
    if (buildWin) {
      window.UNWIP_BUILDWIN = true; document.body.classList.add('buildwin');
      $('#library').classList.add('hidden'); $('#workspace').classList.add('hidden');
      try { await Fonts.loadImported(await api.importedFonts()); } catch {}
      if (document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r, { once: true }));
      window.__flush = () => window.UnwipBuild ? window.UnwipBuild.flush() : true;
      if (window.UnwipBuild) await window.UnwipBuild.open(buildWin, 'window');
      return;
    }
    S.view = 'write';
    let m = 'focused'; try { m = localStorage.getItem('folio-mode') || 'focused'; } catch {}
    if (!LEVELS.includes(m)) m = 'focused';
    S.mode = m; applyLevelClasses(m);
    buildSizeSelect();
    try { await Fonts.loadImported(await api.importedFonts()); } catch {}
    buildFontSelect();
    await showLibrary();
    const list = await api.listProjects();
    // the add-on scripts (setup, maps, sync…) load after this one: wait for them
    if (document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r, { once: true }));
    // first time ever: the welcome setup instead of an empty library
    if (!S.settings.onboarded && window.UnwipIntro) {
      if (!list.length) { window.UnwipIntro.start(); return; }
      api.setSettings({ onboarded: true }).then(st => { S.settings = st; });
      setTimeout(() => toastAction('New: a welcome setup and a guided tour of Unwip.', 'Take the tour', () => window.UnwipIntro.start()), 4000);
    }
    // the main screen first, on every device: "Continue" there goes back to where you left off
  })();

  // test hooks (used by the automated checks, harmless otherwise)
  window.__folio = { S, openProject, openDoc, copyDocForDocs, compileManuscript, flushSave, addNode, setWriter, insertCleanHTML };
  window.__unwip = { renameBook, safeRestart, weekSoFar, fmtToggle, fmtShown, startRename, typewriterActive, moveNodeTo, moveToTrash, moveToDialog, moveOut, navGo, navState: () => ({ back: NAV.back.map(x => x.id), fwd: NAV.fwd.map(x => x.id), show: NAV.show }), goneCheck, setGoneGap: ms => { goneGap = ms; },
    editStatuses: () => editStatuses(), folderWords, iconHTML, newTitleFor, statusColor, statusName, statusOptions,   // for corkboard.js
    newEventFrom: seed => editEvent(null, seed), deleteBook: p => deleteBook(p), pageTemplate: root => sheetFor(root) ? sheetTemplate(root) : '<p><br></p>',
    get saveFailing() { return !!troubleRetry; }, pasteContent,
    S, api, I, $, $$, esc, fmt, makeRoom, countWords, today, editor, editorWrap, on, emit,
    modal, copyText, toast, toastAction, confirmBox, promptText, showMenu, quoteToast, placeField, pickIcon,
    findNode, walkTree, rootOf, isInside, currentBlock, scheduleSave, scheduleMeta, saveMetaNow, flushSave,
    renderBinder, refreshPlanView, updateStatus, updateCountsSoon, openDoc, addNode, setWriter, setRevise,
    beginSprint, typewriterScroll, applyTheme, insertCleanHTML, resyncWords, openSplit, takeSnapshot, uid,
    reloadProjectMeta, showLibrary, openProject, leaveProject: () => leaveProject(), importScrivener: () => importScrivener(), DEFAULT_STYLE, setView: v => setView(v), importWordProject: () => importWordProject(), newProjectTemplate: () => newProjectTemplate(), ROOTS,
    tidyBlankLines, sectionDialog, sheetFor, scheduleNames, fontOptionsHTML, applyStyle, markScenes, docBlocks, rejectChanges, acceptChanges, isTitlePage, compileManuscript, templateGallery, continueWriting, noteLastPlace, caretOffset,
    openPreview, snapshotsDialog, openSettings, flushAll, holdSync, isMine, hereName, importSources, goalsDialog, writtenOn, dayKey, streaks, dial, manuscriptWords, openFind, openSearch, splitAtCursor, setMode, level: m => level(m), restoreRange, refreshToolbar, styleForm, applyStyleNow, refreshSnapCount
  };
})();

// The main screen's header: always two rows on a computer or tablet (the level switch and the tabs on the second), so
// switching level (Lore adds Open World) doesn't snap it between one row and two; a phone has its own layout.
// (It once measured whether one row fitted; the measuring went in the sweep of 29 Oct, as it no longer decided anything.)
(function () {
  const head = document.querySelector('#library .lib-head') || document.querySelector('.lib-head'); if (!head) return;
  function fit() {
    const two = !!head.offsetParent && !matchMedia('(max-width: 720px)').matches;
    if (head.classList.contains('lh-two') !== two) head.classList.toggle('lh-two', two);
  }
  let t = null; const soon = () => { clearTimeout(t); t = setTimeout(fit, 30); };
  new ResizeObserver(soon).observe(head);
  new MutationObserver(soon).observe(head, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'hidden', 'style'] });
  addEventListener('resize', soon);
  if (window.__unwip && window.__unwip.on) window.__unwip.on('level', soon);
  setTimeout(fit, 0);
})();
