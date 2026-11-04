// Unwip - Build: the pieces of a world that belong to no single book. Maps, magic systems, rune alphabets, sigils
// and coats of arms live here, and any book can use them (a map can be linked, so fixing it once fixes every book).
// Each piece is one file in _Build/items (in the Dropbox app folder when there is one, so the phone and iPad see it).
// Everything is made by the writer: the drawing tools, rule checks and dice are fixed rules on this device, no AI.
window.UnwipBuild = (function () {
  'use strict';
  const U = window.__unwip;
  const { $, $$, esc, I, api } = U;

  const KINDS = {
    map: { icon: '🗺️', name: 'Map', plural: 'Maps', blurb: 'Coastlines, kingdoms, towns and cities. Link one into any book.' },
    magic: { icon: '📜', name: 'Magic system', plural: 'Magic systems', blurb: 'Where the power comes from, what it costs, and rules Unwip checks your spells against.' },
    runes: { icon: 'ᚱ', name: 'Rune alphabet', plural: 'Rune alphabets', blurb: 'Draw runes on a dot grid, then write words, names and inscriptions in them.' },
    sigil: { icon: '✴️', name: 'Sigil', plural: 'Sigils', blurb: 'Draw in one slice and it repeats around the circle. Add a ring of runes.' },
    arms: { icon: '🛡️', name: 'Coat of arms', plural: 'Coats of arms', blurb: 'Shield, colours, symbols and a motto, with the herald’s description written for you.' },
    stats: { icon: '📊', name: 'Stat system', plural: 'Stat systems', blurb: 'LitRPG stats and how they grow each level, an XP curve, and a status screen at any level.' },
    insignia: { icon: '⬢', name: 'Insignia', plural: 'Insignia', blurb: 'Emblems for corporations, gangs and units: a hard frame, a line symbol, flat colours and a name.' },
    person: { icon: '👤', name: 'Character', plural: 'Characters of the world', blurb: 'Someone who belongs to your world before any book. Add them to a book whenever you like.' }
  };
  const ORDER = ['map', 'magic', 'runes', 'sigil', 'arms', 'insignia', 'stats', 'person'];
  // new magic systems, rune alphabets, sigils and insignia are offered at the Lore level; ones you already made always show
  const LORE_KINDS = new Set(['magic', 'runes', 'sigil', 'insignia', 'person']);
  // phones stop at Detail: Open World pieces (Lore) made on an iPad or computer are listed in Build there and open
  // as a picture, view only; new ones are made on a bigger screen. Only the web version counts as a phone, so a narrow
  // window on a PC or Mac (the Build window can be 480 px) still edits as normal.
  const phone = () => document.documentElement.classList.contains('web') && window.matchMedia('(max-width: 720px)').matches;
  const below = k => !LORE_KINDS.has(k) || phone() || !U.level || U.level() < 2;   // shown in Build (not Open World)
  const NEW_ORDER = () => ORDER.filter(k => k !== 'person' && (!LORE_KINDS.has(k) || !U.level || U.level() >= 2));
  // the main screen's Build tab has maps, coats of arms and stat systems; at Lore, the Open World tab has the
  // deep-end pieces (magic, runes, sigils, insignia). Below Lore, ones you already made still show in Build.
  let scope = 'build';
  const inScope = k => scope === 'world' ? LORE_KINDS.has(k) && !phone() : below(k);
  const viewOnly = k => LORE_KINDS.has(k) && phone();
  const editors = {};          // filled in by buildmagic.js, buildrunes.js and buildarms.js
  let items = [];

  // ================================================================== STORAGE
  async function refresh() { try { items = (await api.buildList()) || []; } catch { items = []; } return items; }
  async function get(id) { try { return await api.buildLoad(id); } catch { return null; } }
  async function put(item) {
    item.updated = Date.now();
    const ed = editors[item.kind];
    if (ed && ed.thumb) try { item.thumb = ed.thumb(item) || item.thumb || ''; } catch {}
    await api.buildSave(item.id, JSON.stringify(item));
    const i = items.findIndex(x => x.id === item.id), head = { id: item.id, kind: item.kind, title: item.title, created: item.created, updated: item.updated, thumb: item.thumb || '' };
    if (i >= 0) items[i] = head; else items.push(head);
    return item;
  }
  function make(kind, title) {
    const ed = editors[kind], M = window.UnwipMaps;
    const data = kind === 'map' ? { v: 2, active: 0, sections: [{ name: 'Main map', ...M.blank('parchment', 'world') }] } : (ed && ed.blank ? ed.blank() : {});
    return { id: U.uid(), kind, title, created: Date.now(), updated: Date.now(), thumb: '', data };
  }
  // a character of the world, not in any book yet (New person / New character sheet with no book picked)
  async function newPerson(title, html) { const it = make('person', title); it.data.html = html || ''; await put(it); await open(it.id); return it.id; }
  // a Build map linked into a book is read and saved through here
  async function readMap(id) { const it = await get(id); return it && it.data ? JSON.stringify(it.data) : null; }
  async function writeMap(id, json, thumb) {
    const it = (await get(id)) || { id, kind: 'map', title: 'Map', created: Date.now() };
    it.data = JSON.parse(json); if (thumb) it.thumb = thumb;
    await put(it);
  }
  // pictures of everything (for thumbnails, Copy picture, Save PNG and Add to book)
  // A picture drawn from SVG can't see the page's fonts, so the bundled fonts it names (Bookhaven, Oswald, IBM Plex
  // Mono) go inside it. Exported pictures then never depend on the fonts of the computer they were made on.
  let fontsP = null;
  const loadFonts = () => fontsP || (fontsP = new Promise(res => {
    if (window.UnwipPictureFonts) return res();
    const s = document.createElement('script'); s.src = 'picture-fonts.js'; s.onload = s.onerror = () => res(); document.head.appendChild(s);
  }));
  const fontCSS = {};
  function withFonts(svg) {
    const PF = window.UnwipPictureFonts; if (!PF) return svg;
    const css = Object.keys(PF).filter(f => svg.includes(f)).map(f => fontCSS[f] || (fontCSS[f] = PF[f].map(([w, st, b64]) => `@font-face{font-family:'${f}';src:url(data:font/woff;base64,${b64}) format('woff');font-weight:${w};font-style:${st}}`).join(''))).join('');
    return css ? svg.replace(/<svg\b[^>]*>/, m => `${m}<defs><style>${css}</style></defs>`) : svg;
  }
  const svgURL = svg => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(withFonts(svg));
  async function svgCanvas(svg, w, h) {
    await loadFonts();
    const img = new Image(); img.src = svgURL(svg);
    await img.decode();
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h);
    return c;
  }
  const canvasBytes = async c => new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/png'))).arrayBuffer());
  // The PC/Mac app copies through its own clipboard (the window isn't allowed to write pictures to it). The web hands
  // the clipboard a picture still being made, inside the click: Safari only allows copying during the click itself.
  function copyCanvas(c, msg) {
    const ok = () => U.toast(msg || 'Copied. Paste it into any chapter with Ctrl+V.'), fail = () => U.toast('Couldn’t copy the picture on this device. Try Save PNG instead.', 'warn');
    if (api.clipboardImage) return canvasBytes(c).then(b => api.clipboardImage(b)).then(r => r ? ok() : fail(), fail);
    try {
      const blob = new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('no picture')), 'image/png'));
      return navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(ok, async () => {
        try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': await blob })]); ok(); } catch { fail(); }   // browsers that want the finished picture
      });
    } catch { fail(); return Promise.resolve(); }
  }
  async function savePNG(c, name) { await api.exportBinary(await canvasBytes(c), name || 'Picture', 'png', 'PNG picture'); }

  // ================================================================== THE BUILD PAGE
  const ago = t => { const d = (Date.now() - t) / 1000; if (d < 60) return 'just now'; if (d < 3600) return Math.floor(d / 60) + ' min ago'; if (d < 86400) return Math.floor(d / 3600) + ' h ago'; return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); };
  U.on('level', () => { const bh = document.getElementById('build-home'); if (bh && !bh.classList.contains('hidden')) render(); });
  async function render(sc) {
    if (sc === 'build' || sc === 'world') scope = sc;
    await loadFonts();
    const box = $('#build-home'); if (!box) return;
    await refresh();
    const by = k => items.filter(x => x.kind === k).sort((a, b) => (b.updated || 0) - (a.updated || 0));
    const world = scope === 'world';
    // the first time, read the Story Bible shelf before drawing, so nothing jumps when it arrives
    if (window.UnwipBible && (world ? !phone() : phone()) && !window.UnwipBible.lastShelf) await window.UnwipBible.shelfHTML().catch(() => '');
    box.innerHTML = `
      ${window.UnwipBible && (world ? !phone() : phone()) ? `<div id="sbb-shelf-slot">${window.UnwipBible.lastShelf || ''}</div>` : ''}
      <div class="pl-head"><div><h1>${world ? 'Open World' : 'Build'}</h1><p>${world ? 'The deep end of your world: magic systems, rune alphabets, sigils and insignia. Like everything in Build, they belong to the world, not one book, so any book can use them.' : 'The pieces of your world: maps, coats of arms and stat systems. They belong to the world, not one book, so any book can use them.' + (U.level && U.level() >= 2 ? ' Magic, runes, sigils and insignia are in Open World.' : '')}</p></div></div>
      <div class="pl-tools bd-tools">${NEW_ORDER().filter(inScope).map(k => `<button class="pl-tool" data-new="${k}"><span class="${k === 'runes' ? 'bd-rune-ic' : ''}">${KINDS[k].icon}</span><b>New ${KINDS[k].name.toLowerCase()}</b><em>${esc(KINDS[k].blurb)}</em></button>`).join('')}${world && !phone() && window.UnwipCharSheet ? `<button class="pl-tool" data-csheet><span>🎒</span><b>New character sheet</b><em>Name a character once, put them in the books they’re in, and give them gear slot by slot, chapter by chapter.</em></button>` : ''}</div>
      ${items.some(x => inScope(x.kind)) ? ORDER.filter(k => inScope(k) && by(k).length).map((k, i, shown) => `${!world && LORE_KINDS.has(k) && shown.findIndex(x => LORE_KINDS.has(x)) === i ? `<div class="bd-from"><b>From Open World</b><span>${phone() ? 'Made on an iPad or computer. On a phone they show here, view only.' : 'These belong to Open World, which shows at Lore. They’re listed here so nothing goes missing at Focus and Detail.'}</span></div>` : ''}<div class="lib-row bd-row"><h1>${KINDS[k].plural}</h1></div>
        <div class="bd-grid">${by(k).map(x => `<div class="bd-card" data-id="${x.id}" tabindex="0">
          <div class="bd-thumb ${x.thumb ? '' : 'empty'}">${x.thumb ? `<img src="${esc(x.thumb)}" alt="">` : `<span>${KINDS[k].icon}</span>`}</div>
          <div class="bd-ct"><b>${esc(x.title || 'Untitled')}</b><span>${esc(KINDS[k].name)} · ${viewOnly(k) ? 'View only' : ago(x.updated || x.created || 0)}</span></div>
          ${viewOnly(k) ? '' : '<button class="icon-btn small bd-more" title="More">⋯</button>'}</div>`).join('')}</div>`).join('')
        : `<p class="lib-empty">${world ? 'Nothing here yet. Pick something above to start.' : 'Nothing built yet. Pick something above to start: a map is a good first piece.'}</p>`}`;
    $$('[data-new]', box).forEach(b => b.onclick = () => create(b.dataset.new));
    $$('[data-csheet]', box).forEach(b => b.onclick = () => window.UnwipBible ? window.UnwipBible.newEntry({ kind: 'characters', sheet: true }) : sheetFromLibrary());
    const shelfSlot = $('#sbb-shelf-slot', box); if (shelfSlot) { if (shelfSlot.innerHTML) window.UnwipBible.wireShelf(shelfSlot); window.UnwipBible.shelfHTML().then(h => { if (shelfSlot.isConnected && shelfSlot.innerHTML !== h) { shelfSlot.innerHTML = h; window.UnwipBible.wireShelf(shelfSlot); } }); }
    $$('.bd-card', box).forEach(c => {
      const id = c.dataset.id;
      c.onclick = e => { if (e.target.closest('.bd-more')) { const r = e.target.getBoundingClientRect(); return cardMenu(id, r.left, r.bottom); } open(id); };
      c.onkeydown = e => { if (e.key === 'Enter') open(id); };
      c.oncontextmenu = e => { e.preventDefault(); const it = items.find(x => x.id === id); if (!(it && viewOnly(it.kind))) cardMenu(id, e.clientX, e.clientY); };
    });
  }
  function cardMenu(id, x, y) {
    const it = items.find(i => i.id === id); if (!it) return;
    U.showMenu(x, y, [
      { label: 'Open', action: () => open(id) },
      { label: 'Rename…', action: async () => { const t = await U.promptText('Rename', 'Name', it.title || ''); if (!t) return; const full = await get(id); if (!full) return; full.title = t; await put(full); render(); } },
      { label: 'Duplicate', action: async () => { const full = await get(id); if (!full) return; const copy = JSON.parse(JSON.stringify(full)); copy.id = U.uid(); copy.title = (full.title || 'Untitled') + ' (copy)'; copy.created = Date.now(); await put(copy); render(); } },
      { label: 'Add to a book…', action: async () => { const full = await get(id); if (full) addToBook(full); } },
      { sep: true },
      { label: 'Delete…', danger: true, action: async () => {
        const linked = it.kind === 'map' ? ' Books it’s linked into will show an empty map.' : '';
        if (!await U.confirmBox('Delete this?', `“${esc(it.title || 'Untitled')}” will be deleted.${linked}`, 'Delete', true)) return;
        await api.buildDelete(id); render();
      } }
    ]);
  }
  async function create(kind, opts = {}) {
    const def = { map: 'Map of the world', magic: 'Magic system', runes: 'Runes', sigil: 'Sigil', arms: 'House' }[kind];
    const title = await U.promptText(`New ${KINDS[kind].name.toLowerCase()}`, kind === 'arms' ? 'Whose arms are these? (a house, order or city)' : 'Name', def);
    if (!title) return;
    const it = make(kind, title);
    if (kind === 'map' && window.UnwipMaps) {
      const k = await U.modal({ title: 'New map', body: '<p>What kind of map?</p><p class="hint">A <b>world or region</b> map has coastlines, mountains, forests and towns. A <b>town or city</b> map has streets, buildings and walls. One map can hold both: add sections with “+ Section”.</p>', buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: '🏘️ Town or city', value: 'town', kind: 'ghost' }, { label: '🗺️ World or region', value: 'world', kind: 'primary' }] });
      if (!k) return;
      it.data = { v: 2, active: 0, sections: [{ name: k === 'town' ? 'Town' : 'Main map', ...window.UnwipMaps.blank('parchment', k) }] };
    }
    await put(it);
    if (opts.noOpen) return it;
    await open(it.id);
    return true;
  }

  // ================================================================== THE BUILD SCREEN
  let cur = null, saveT = null, active = null;
  // where Build was opened from: null (the Build page), 'book' (from inside a book: Done goes back to the chapter) or
  // 'window' (its own window on the PC/Mac, next to the book: Done closes the window)
  let ret = null;
  // opened from the Story Bible's Lore tab: Done goes back there (it used to leave you in Build)
  const backToBible = () => { render(); if (window.UnwipBible && window.UnwipBible.reopen) window.UnwipBible.reopen(); };
  const screen = $('#build-screen'), top = $('#bd-top'), main = $('#bd-main');
  // Phones: the picture (or the drawing area) stays pinned at the top while the options scroll under it (style.css,
  // "Build on a phone"). Coats of arms and stat systems get smaller once you scroll down (tap a stat system's picture to see it full size again) and stops
  // being pinned while you type, so the keyboard can't push the field you're typing in underneath it.
  let pinSmall = false, openAt = null;
  const pinReset = () => { pinSmall = false; openAt = null; main.classList.remove('pin-small', 'pin-open', 'pin-hide'); };
  main.addEventListener('scroll', () => {
    const y = main.scrollTop, s = pinSmall ? y > 40 : y > 160;   // two thresholds, so it can't flicker at the edge
    if (s !== pinSmall) { pinSmall = s; main.classList.toggle('pin-small', s); }
    if (openAt !== null && Math.abs(y - openAt) > 80) { openAt = null; main.classList.remove('pin-open'); }
  }, { passive: true });
  const typing = el => el && el.matches && el.matches('input:not([type]), input[type=text], input[type=search], input[type=number], textarea, [contenteditable="true"]');
  main.addEventListener('focusin', e => { if (typing(e.target)) main.classList.add('pin-hide'); });
  main.addEventListener('focusout', e => { if (typing(e.target)) main.classList.remove('pin-hide'); });
  main.addEventListener('click', e => { if (pinSmall && e.target.closest('.bs-shot')) { openAt = main.scrollTop; main.classList.add('pin-open'); } });
  function show(on) {
    if (ret === 'book') $('#workspace').classList.toggle('hidden', on);
    else if (ret === 'window') { $('#library').classList.add('hidden'); $('#workspace').classList.add('hidden'); }
    else $('#library').classList.toggle('hidden', on);
    screen.classList.toggle('hidden', !on);
    document.title = on ? (cur && cur.title || 'Build') + ' — Unwip' : 'Unwip — Write to finish';
  }
  function saved(t) { const el = $('#bd-saved'); if (el) el.textContent = t; }
  function changed() { if (!cur) return; saved('Saving…'); clearTimeout(saveT); saveT = setTimeout(saveNow, 600); creditSoon(); }
  // game-icons.net symbols ask for a credit (CC BY 3.0) when a picture using them is published: say so, with the line
  const symbolsIn = it => { const d = (it && it.data) || {};
    if (it.kind === 'arms') return [d.charge, ...(d.extras || []).map(e => e.k)];
    if (it.kind === 'sigil') return (d.syms || []).map(y => y.k);
    if (it.kind === 'insignia') return ((editors.insignia || {}).SYMBOLS || []).includes(d.symbol) ? [] : [d.symbol];   // its own line symbols need no credit
    return []; };
  let creditT = null;
  const creditSoon = () => { clearTimeout(creditT); creditT = setTimeout(showCredit, 250); };
  function showCredit() {
    const bar = $('#bd-credit'); if (!bar) return;
    const c = cur && window.UnwipSymbols && window.UnwipSymbols.credit(symbolsIn(cur));
    bar.classList.toggle('hidden', !c); if (!c) { bar.innerHTML = ''; return; }
    bar.innerHTML = `<span>Uses symbols by ${esc(c.by.join(', '))} from game-icons.net (free to use, even commercially). If you publish this picture, add the credit: <b>${esc(c.line)}</b></span><button class="btn small ghost" type="button" id="bd-credit-copy">Copy credit</button>`;
    $('#bd-credit-copy').onclick = () => U.copyText(c.line).then(ok => ok ? U.toast('Credit copied. Put it with the picture, or on your book’s copyright page.') : U.toast(esc(c.line), '', 8000));
  }
  async function saveNow() { clearTimeout(saveT); saveT = null; if (!cur) return; await put(cur); saved('Saved'); }
  async function open(id, from) {
    await loadFonts();
    pinReset();
    const it = await get(id); if (!it) { U.toast('Couldn’t open that.', 'warn'); if (!ret && !from) render(); return; }
    if (viewOnly(it.kind)) { await viewPicture(it); if (from === 'bible') backToBible(); else if (!ret && !from) render(); return; }
    await close(true);
    if (from !== undefined) ret = from || null;
    if (ret === 'book' && U.flushSave) await U.flushSave();
    cur = it; main.innerHTML = ''; show(true);
    if (it.kind === 'map') return openMap(it);
    const ed = editors[it.kind]; if (!ed) { U.toast('This needs a newer Unwip.', 'warn'); return close(); }
    top.classList.remove('hidden');
    $('#bd-kind').textContent = KINDS[it.kind].icon + ' ' + KINDS[it.kind].name;
    $('#bd-title').value = it.title || '';
    saved('Saved');
    $('#bd-acts').innerHTML = `<span class="bd-extra"></span>
      <button class="btn small ghost" id="bd-copy" title="Copy a picture of it, ready to paste into a chapter">Copy picture</button>
      <button class="btn small ghost" id="bd-png" title="Save a picture of it as a PNG file">Save PNG…</button>
      <button class="icon-btn small" id="bd-pmenu" title="Picture: copy or save" aria-label="Copy or save a picture">⋯</button>
      ${ret === 'window' ? '' : '<button class="btn small" id="bd-add" title="Put it into one of your books">Add to book…</button>'}
      <button class="btn primary small" id="bd-done" title="${ret === 'book' ? 'Save and go back to your chapter' : ret === 'window' ? 'Save and close this window' : ret === 'bible' ? 'Save and go back to the Story Bible' : 'Save and go back to Build'}">${ret === 'book' ? 'Back to the book' : ret === 'bible' ? 'Back to the Story Bible' : 'Done'}</button>`;
    $('#bd-copy').onclick = async () => { const c = ed.picture && await ed.picture(cur); if (c) copyCanvas(c); };
    $('#bd-png').onclick = async () => { const c = ed.picture && await ed.picture(cur); if (c) savePNG(c, cur.title); };
    // on a phone Copy picture, Save PNG and Add to book fold into ⋯, so the name has room next to Record
    $('#bd-pmenu').onclick = e => { const r = e.currentTarget.getBoundingClientRect(); U.showMenu(r.left, r.bottom, [{ label: 'Copy picture', action: () => $('#bd-copy').click() }, { label: 'Save PNG…', action: () => $('#bd-png').click() }, ...($('#bd-add') ? [{ label: 'Add to book…', action: () => $('#bd-add').click() }] : [])]); };
    if ($('#bd-add')) $('#bd-add').onclick = async () => { await saveNow(); addToBook(cur); };
    $('#bd-done').onclick = () => close();
    active = ed;
    await ed.open(cur, main, { changed, extra: $('.bd-extra', top), items: () => items, get, KINDS, svgCanvas, svgURL });
    showCredit();
  }
  $('#bd-title').addEventListener('input', e => { if (cur) { cur.title = e.target.value; changed(); } });
  $('#bd-back').innerHTML = I.back; $('#bd-back').onclick = () => close();
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && cur && cur.kind !== 'map' && !screen.classList.contains('hidden') && !document.querySelector('.modal-back') && !(e.target.closest && e.target.closest('input, textarea, select'))) close(); });

  function openMap(it) {
    const M = window.UnwipMaps;
    top.classList.add('hidden');
    const host = {
      read: async () => JSON.stringify(it.data),
      write: async (_id, json) => { if (it.stale) return; it.data = JSON.parse(json); it.thumb = M.thumb() || it.thumb; await api.buildSave(it.id, JSON.stringify({ ...it, updated: Date.now() })); it.updated = Date.now(); },
      title: () => it.title,
      mount: v => {
        main.appendChild(v);
        const gen = v.querySelector('#mp-gen');
        const b = document.createElement('button'); b.className = 'btn small mp-end'; b.textContent = 'Add to book…'; b.dataset.tip = 'Put this map into one of your books: linked (fix it here, every book sees it) or as a copy';
        b.onclick = async () => { await M.close(true).catch(() => {}); addToBook(it); };
        const done = v.querySelector('#mp-done'); if (done) { done.classList.remove('mp-end'); done.before(b); } else if (gen) gen.before(b);   // same order as the other Build editors: …, Add to book, Done
        const t = v.querySelector('.mp-title'); if (t) { t.title = 'Double-click to rename'; t.ondblclick = async () => { const n = await U.promptText('Rename map', 'Name', it.title); if (n) { it.title = n; t.textContent = n; await put(it); } }; }
      },
      unmount: () => { cur = null; top.classList.remove('hidden'); const r = ret; show(false); ret = null; if (r === 'window') window.close(); else if (r === 'bible') backToBible(); else if (r !== 'book') render(); },
      inBook: false
    };
    active = null;
    M.open(it.id, host);
  }
  async function close(quiet) {
    { const bar = $('#bd-credit'); if (bar) { bar.classList.add('hidden'); bar.innerHTML = ''; } }
    if (!cur) { if (!quiet) { const r = ret; show(false); ret = null; if (r === 'window') window.close(); else if (r === 'bible') backToBible(); else if (r !== 'book') render(); } return; }
    if (cur.kind === 'map') { await window.UnwipMaps.close(true); return; }
    await saveNow();
    if (active && active.close) try { active.close(); } catch {}
    active = null; cur = null; main.innerHTML = '';
    if (!quiet) { const r = ret; show(false); ret = null; if (r === 'window') window.close(); else if (r === 'bible') backToBible(); else if (r !== 'book') render(); }
  }
  // for the window on the PC/Mac: save before it closes
  async function flush() { if (cur && cur.kind !== 'map') await saveNow(); return true; }

  // ================================================================== FROM INSIDE A BOOK
  // Build without leaving the chapter: pick a piece (or start a new one) and it opens over the book; "Back to the book"
  // returns to the same place. On a PC or Mac it can open in its own window instead, to keep beside the chapter.
  // view only (Open World pieces on a phone): the piece's own picture, the same one Copy picture makes, and nothing
  // to change. Editing stays on the iPad and computer.
  async function viewPicture(it) {
    const ed = editors[it.kind]; const body = document.createElement('div'); body.className = 'bd-view';
    body.innerHTML = `<p class="hint">View only on a phone. Change it on an iPad or computer.</p><div class="bd-view-pic"><span class="hint">Drawing…</span></div>`;
    let shown = null;
    const draw = (async () => { try { await loadFonts(); const c = ed && ed.picture && await ed.picture(it); if (!c) throw 0;
      const img = new Image(); img.alt = it.title || ''; img.src = c.toDataURL('image/png'); shown = c; body.querySelector('.bd-view-pic').replaceChildren(img); }
      catch { body.querySelector('.bd-view-pic').innerHTML = `<p class="lib-empty">${KINDS[it.kind] ? KINDS[it.kind].icon : ''} Open it on an iPad or computer to see it.</p>`; } })();
    const v = await U.modal({ title: it.title || (KINDS[it.kind] || {}).name || 'Build', body, wide: true, buttons: [{ label: 'Copy picture', value: 'copy', kind: 'ghost' }, { label: 'Close', value: false, kind: 'primary' }] });
    await draw; if (v === 'copy' && shown) copyCanvas(shown);
  }
  // the main screen's Open World tab: a character sheet belongs to a character in a book, so pick the book first
  async function sheetFromLibrary() {
    const list = await api.listProjects();
    if (!list.length) { U.toast('Make a book first: a character sheet lives with a character in a book.'); return; }
    let slug = list[0].slug;
    if (list.length > 1) {
      const body = document.createElement('div');
      body.innerHTML = `<div class="field"><label>Which book is the character in?</label><select id="cs-book">${list.map(p => `<option value="${esc(p.slug)}">${esc(p.title)}</option>`).join('')}</select></div>`;
      const ok = await U.modal({ title: 'New character sheet', body, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Next', value: true, kind: 'primary' }] });
      if (!ok) return; slug = body.querySelector('#cs-book').value;
    }
    await window.UnwipCharSheet.newSheet({ slug });
  }
  async function fromBook(sc) {
    await refresh();
    const canWin = !!api.buildWindow, world = sc === 'world' && U.level && U.level() >= 2;
    // same split as the main screen: at Lore, magic, runes, sigils and insignia are under Open World, not Build
    const want = k => world ? LORE_KINDS.has(k) : below(k);
    const by = k => items.filter(x => x.kind === k && want(k)).sort((a, b) => (b.updated || 0) - (a.updated || 0));
    const any = ORDER.some(k => by(k).length);
    const body = document.createElement('div'); body.className = 'bd-pick';
    body.innerHTML = `<p class="hint">${world ? 'Your world’s magic systems, rune alphabets, sigils and insignia.' : (U.level && U.level() >= 2 ? 'Your world’s maps, coats of arms and stat systems.' : 'Your world’s maps, magic, runes, sigils, coats of arms, insignia and stat systems.')} ${canWin ? 'Each opens in its own window, so you can keep it beside your chapter. (↩ opens it in this window instead.)' : 'It opens over your chapter; “Back to the book” returns you to the same place.'}</p>
      ${any ? ORDER.filter(k => by(k).length).map(k => `<h4>${KINDS[k].plural}</h4><div class="bd-pick-list">${by(k).map(x => `<div class="bd-pick-row" data-id="${x.id}">
          <button type="button" class="bd-pick-open" data-open="${x.id}"><span class="bd-pick-th">${x.thumb ? `<img src="${esc(x.thumb)}" alt="">` : KINDS[k].icon}</span><span><b>${esc(x.title || 'Untitled')}</b><small>${esc(KINDS[k].name)} · ${viewOnly(k) ? 'View only' : ago(x.updated || x.created || 0)}</small></span></button>
          ${canWin ? `<button type="button" class="icon-btn bd-pick-win" data-here="${x.id}" title="Open it in this window instead, over the chapter">↩</button>` : ''}</div>`).join('')}</div>`).join('') : '<p class="lib-empty">Nothing built yet.</p>'}
      <h4>Start something new</h4><div class="bd-pick-new">${NEW_ORDER().filter(want).map(k => `<button type="button" class="btn small" data-new="${k}">${KINDS[k].icon} ${esc(KINDS[k].name)}</button>`).join('')}${world && window.UnwipCharSheet ? '<button type="button" class="btn small" data-csheet>🎒 Character sheet</button>' : ''}</div>`;
    let go = null, close2 = () => {};
    body.addEventListener('click', e => {
      if (e.target.closest('[data-csheet]')) { go = () => window.UnwipCharSheet.newSheet(); close2(); return; }
      const o = e.target.closest('[data-open]'), h = e.target.closest('[data-here]'), n = e.target.closest('[data-new]');
      const inWindow = id => api.buildWindow(id, (items.find(x => x.id === id) || {}).title || 'Build');
      if (h) go = () => open(h.dataset.here, 'book');
      else if (o) go = () => canWin ? inWindow(o.dataset.open) : open(o.dataset.open, 'book');
      else if (n) go = () => createFrom(n.dataset.new);
      else return;
      close2();
    });
    await U.modal({ title: world ? 'Open World' : 'Build', body, wide: true, buttons: [{ label: 'Close', value: false, kind: 'ghost' }], onOpen: back => { close2 = () => { const b = back.querySelector('.m-foot .btn'); if (b) b.click(); }; } });
    if (go) await go();
  }
  async function createFrom(kind) {
    if (api.buildWindow) { const it = await create(kind, { noOpen: true }); if (it) api.buildWindow(it.id, it.title); return; }   // PC/Mac: its own window
    ret = 'book'; if (!(await create(kind))) ret = null;
  }

  // ================================================================== CHANGED ON ANOTHER DEVICE
  // A sync brought in a newer copy (phone and iPad), or Dropbox's own app changed the file (PC). The piece on screen
  // is reloaded so an old copy is never saved over the new one; edits not yet saved here are kept as a separate piece.
  let checking = false;
  async function external(id) {
    if (!cur || cur.id !== id || checking) { if (!cur && !$('#build-home').classList.contains('hidden') && !$('#library').classList.contains('hidden')) render(); return; }
    checking = true;
    try {
      const disk = await get(id); if (!disk || !cur || cur.id !== id) return;
      const strip = x => JSON.stringify({ ...x, updated: 0, thumb: '' });
      if (strip(disk) === strip(cur)) return;
      if (saveT) { clearTimeout(saveT); saveT = null; const mine = JSON.parse(JSON.stringify(cur)); mine.id = U.uid(); mine.title = (cur.title || 'Untitled') + ' (unsaved changes)'; await put(mine); }
      if (cur.kind === 'map') { cur.stale = true; await window.UnwipMaps.close(true); await open(id); }
      else { const keepScroll = main.scrollTop; cur = null; await open(id); main.scrollTop = keepScroll; }
      U.toast('This was changed on another device, so the newer version is showing.', '', 6000);
    } finally { checking = false; }
  }
  if (api.onBuildChange) api.onBuildChange(d => external(d && d.id));
  // the PC: Dropbox's own app changes the file, so look when the window comes back and every so often
  const peek = async () => { if (!cur || saveT || checking) return; const disk = await get(cur.id); if (disk && cur && disk.id === cur.id && (disk.updated || 0) > (cur.updated || 0) + 1000) external(cur.id); };
  if (!api.onBuildChange) { window.addEventListener('focus', peek); setInterval(peek, 20000); }

  // ================================================================== ADD TO A BOOK
  async function addToBook(it) {
    const list = await api.listProjects();
    if (!list.length) { U.toast('Make a book first.'); return; }
    const isMap = it.kind === 'map';
    const ROOT = { map: 'places', magic: 'notes', runes: 'notes', sigil: 'notes', arms: 'notes', person: 'characters' }[it.kind];
    const body = document.createElement('div');
    body.innerHTML = `<div class="field"><label>Book</label><select id="ab-p">${list.map(p => `<option value="${esc(p.slug)}">${esc(p.title)}</option>`).join('')}</select></div>
      ${isMap ? `<div class="field" style="margin-top:12px"><label>How</label>
        <label class="bd-radio"><input type="radio" name="ab-how" value="link" checked> <span><b>Linked</b>: change it here or in the book, and every book that links it sees the change</span></label>
        <label class="bd-radio"><input type="radio" name="ab-how" value="copy"> <span><b>A copy</b>: this book gets its own copy to change separately</span></label></div>`
        : `<p class="hint" style="margin-top:10px">Adds it as a page in the book’s ${ROOT === 'notes' ? 'Notes' : 'Places'}, with a picture. It’s a copy: changes made here later won’t reach the book (add it again to update it).</p>`}`;
    const ok = await U.modal({ title: `Add “${it.title}” to a book`, body, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Add', value: true, kind: 'primary' }] });
    if (!ok) return;
    const slug = $('#ab-p', body).value, how = isMap ? ($('input[name="ab-how"]:checked', body) || {}).value : 'copy';
    const here = U.S.slug === slug && U.S.project;
    const project = here ? U.S.project : await api.openProject(slug); if (!project) return;
    const root = project.binder.find(n => n.root && n.kind === ROOT) || project.binder.find(n => n.root && n.kind === 'notes') || project.binder.find(n => n.root && n.kind === 'manuscript');
    const node = { id: U.uid(), type: 'doc', title: it.title || KINDS[it.kind].name, words: 0, icon: isMap ? '🗺️' : undefined };
    if (isMap) {
      node.map = true;
      if (how === 'link') node.buildRef = it.id;
      else await api.saveDoc(slug, node.id, JSON.stringify(it.data));
    } else {
      const ed = editors[it.kind]; let html = '';
      try { html = ed && ed.toBook ? await ed.toBook(it) : ''; } catch (e) { console.warn(e); }
      await api.saveDoc(slug, node.id, html || `<p>${esc(it.title)}</p>`);
      node.words = U.countWords((html || '').replace(/<[^>]+>/g, ' '));
    }
    if (!node.icon) delete node.icon;
    root.children = root.children || []; root.children.push(node); root.open = true;
    if (here) { U.scheduleMeta(); U.renderBinder(); } else await api.saveProjectMeta(slug, project);
    U.toast(`Added to <b>${esc(project.title)}</b> › ${esc(root.title)}${isMap && how === 'link' ? ' (linked)' : ''}.`, '', 5000);
  }

  // what a book can borrow from Build (runes and sigils as coat-of-arms charges, alphabets for a sigil's ring)
  async function all(kind) { await refresh(); const out = []; for (const h of items.filter(x => !kind || x.kind === kind)) { const it = await get(h.id); if (it) out.push(it); } return out; }

  { const bb = document.getElementById('btn-build-book'); if (bb) { bb.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 21V9l3-2 3 2v3h4V9l3-2 3 2v12z"/><path d="M10 21v-4a2 2 0 0 1 4 0v4"/><path d="M7 7V3M17 7V3"/></svg><span class="tb-label">Build</span>'; bb.onclick = () => fromBook(); } }
  return { KINDS, editors, render, refresh, open, close, create, newPerson, fromBook, flush, get from() { return ret; }, readMap, writeMap, get, put, all, svgCanvas, svgURL, loadFonts, copyCanvas, savePNG, canvasBytes, addToBook, get items() { return items; } };
})();
