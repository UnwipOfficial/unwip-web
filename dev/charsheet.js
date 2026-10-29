// Unwip - character sheets (Lore level). A sheet for one character in the Characters folder: gear in slots around a
// picture, a chapter timeline that rewinds everything to "as of this chapter", and stats, skills and items read from
// the [system messages] in the manuscript (the LitRPG ledger does the reading).
//
// Kept on the character's binder entry as n.csheet = { fig, img, who, slots: { slotId: [{ ch, name, rar, note }] } }:
//   fig   'f1' | 'f2' | 'own'   which picture (the two built-in figures, or the writer's own)
//   img   the writer's own picture, shrunk to 520 px (a data URL), only when fig is 'own'
//   who   whose stats to follow, as the ledger names them ('' = the main character); unset = matched by name
//   slots each slot's history: from chapter `ch` (a chapter's id) the slot holds `name` (empty = nothing)
//   sys   the Build › Stat system this character follows (its id), to compare the chapters' numbers against
// Nothing here changes the chapters. Everything is in the book's own file, so it syncs and backs up with it.
window.UnwipCharSheet = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return null;
  const { S, $, $$, esc } = U;

  const SLOTS = [   // id, label, column, row, icon
    ['back', 'Back', 1, 1, 'back'], ['ringl', 'Ring (L)', 1, 2, 'ring'], ['ringr', 'Ring (R)', 1, 3, 'ring'], ['legs', 'Legs', 1, 4, 'armour'],
    ['head', 'Head', 3, 1, 'armour'], ['neck', 'Neck', 3, 2, 'neck'], ['chest', 'Chest', 3, 3, 'armour'], ['gloves', 'Gloves', 3, 4, 'armour'],
    ['main', 'Main hand', 1, 5, 'hand'], ['off', 'Off-hand', 2, 5, 'hand'], ['other', 'Other', 3, 5, 'hand']
  ];
  const RAR = [['common', 'Common'], ['uncommon', 'Uncommon'], ['rare', 'Rare'], ['epic', 'Epic'], ['legend', 'Legendary']];
  const RNAME = Object.fromEntries(RAR);
  const ICON = {
    armour: '<path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z"/>',
    ring: '<circle cx="12" cy="14" r="6"/><path d="M9 4h6l-1.5 4h-3z"/>',
    neck: '<path d="M5 4c0 6 3 9 7 9s7-3 7-9"/><path d="M12 13v3"/><path d="M12 16l-2.5 3 2.5 3 2.5-3z"/>',
    back: '<path d="M8 4h8l3 16H5z"/><path d="M9 4c0 3 1.5 4 3 4s3-1 3-4"/>',
    hand: '<path d="M14.5 3.5l6 6L9 21l-6-6z"/><path d="M3 21l3-3"/>'
  };
  const svg = (p, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const SKILLISH = new Set(['skill', 'spell', 'ability', 'perk', 'trait', 'class', 'title']);
  const keyOf = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

  const isChar = id => { const r = id && U.rootOf(id); return !!(r && r.kind === 'characters' && r.id !== id); };

  // ---- the button on a character's page (Lore only)
  const btn = document.createElement('button');
  btn.type = 'button'; btn.id = 'btn-charsheet'; btn.className = 'page-charsheet hidden';
  btn.title = 'Character sheet: gear, stats and skills, chapter by chapter';
  btn.innerHTML = svg(ICON.hand, 15) + '<span>Character sheet</span>';
  const anchor = $('#btn-sheet'); if (anchor) anchor.parentNode.insertBefore(btn, anchor);
  const phoneNow = () => document.documentElement.classList.contains('web') && window.matchMedia('(max-width: 720px)').matches;
  const hasSheet = id => { const f = id && U.findNode(id); return !!(f && Object.keys(sheetOf(f.node).slots).length); };
  function refreshBtn() { btn.classList.toggle('hidden', !(S.project && isChar(S.docId) && (phoneNow() ? hasSheet(S.docId) : U.level() >= 2))); }
  U.on('doc', () => setTimeout(refreshBtn, 0)); U.on('level', refreshBtn); U.on('project', () => setTimeout(refreshBtn, 0));
  btn.onclick = () => open(S.docId);

  // ---- reading
  function chapters() { const out = [], r = U.findNode('root-manuscript'); if (r) U.walkTree(r.node.children || [], n => { if (n.type === 'doc') out.push(n); }); return out; }
  // read a sheet defensively: it syncs between devices and versions, so anything odd in it is dropped, never trusted
  const SLOT_IDS = new Set(SLOTS.map(x => x[0]));
  function sheetOf(n) {
    const c = n.csheet && typeof n.csheet === 'object' ? n.csheet : {};
    const slots = {};
    if (c.slots && typeof c.slots === 'object') for (const [sid, list] of Object.entries(c.slots)) {
      if (!SLOT_IDS.has(sid) || !Array.isArray(list)) continue;
      const ok = list.filter(e => e && typeof e === 'object' && typeof e.ch === 'string').map(e => ({ ch: e.ch, name: typeof e.name === 'string' ? e.name.slice(0, 80) : '', rar: RNAME[e.rar] ? e.rar : 'common', note: typeof e.note === 'string' ? e.note.slice(0, 300) : '' }));
      if (ok.length) slots[sid] = ok;
    }
    const img = typeof c.img === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(c.img) ? c.img : '';
    const sys = typeof c.sys === 'string' && /^[\w-]{1,64}$/.test(c.sys) ? c.sys : '';
    return { sys, fig: ['f1', 'f2', 'own'].includes(c.fig) ? c.fig : 'f1', img, who: typeof c.who === 'string' || c.who === null ? c.who : undefined, slots };
  }
  // the ledger's name for this character: the one picked, else the one whose name matches the sheet's title
  function matchWho(title, names) {
    const t = keyOf(title), first = t.split(' ')[0];
    return names.find(w => keyOf(w) === t) ?? names.find(w => w && (keyOf(w) === first || t.startsWith(keyOf(w) + ' '))) ?? null;
  }

  // ---- the sheet
  // Lore stops at bigger screens: phones go up to Detail, so no way in (search, a link, Add to sheet) opens a sheet there
  const tooSmall = () => { if (!window.matchMedia('(max-width: 720px)').matches) return false; U.toast('Character sheets are part of Lore, which needs an iPad or computer.'); return true; };
  // On a phone a sheet filled in on a bigger screen opens view only: the timeline, stats, inventory and skills as
  // usual, the gear as a list instead of slots round a figure, and nothing to change.
  async function open(id, tab) {
    const ro = phoneNow();
    if (ro && !hasSheet(id)) { tooSmall(); return; }
    const f = id && U.findNode(id); if (!f || !isChar(id)) { U.toast('Open a character in the Characters folder first.'); return; }
    const node = f.node;
    await U.flushSave();
    const body = document.createElement('div'); body.className = 'cs';
    body.innerHTML = '<p class="hint">Reading the book…</p>';
    let L = null;
    try { L = window.UnwipLedger ? await window.UnwipLedger.scan() : null; } catch (e) { console.error(e); }
    const chs = L ? L.chs : chapters();
    const pos = new Map(chs.map((c, i) => [c.id, i]));
    const at = ch => (pos.has(ch) ? pos.get(ch) : -1);   // a chapter that's gone counts as "from the start"
    const ledgerNames = L ? [...new Set([...L.stats.map(s => s.who || ''), ...L.got.map(g => g.who || '')])] : [];
    const st = { tab: ['char', 'stats', 'inv', 'skills'].includes(tab) ? tab : 'char', sel: 'main', ci: null, editing: null };
    // the characters either side, so the sheet can step through them without closing (view only: those with a sheet)
    const others = characters().filter(c => !ro || hasSheet(c.id)), me = others.findIndex(c => c.id === node.id);
    const prevC = me > 0 ? others[me - 1] : null, nextC = me >= 0 && me < others.length - 1 ? others[me + 1] : null;
    const closeSheet = () => $$('.modal-back').forEach(mb => { if (mb.contains(body)) { const c = mb.querySelector('.m-foot .btn'); if (c) c.click(); } });
    let systems = [];
    try { systems = window.UnwipBuild ? (await window.UnwipBuild.all('stats')).filter(x => x && x.data) : []; } catch (e) { console.warn(e); }

    const save = () => { if (ro) return; node.csheet = JSON.parse(JSON.stringify(sh)); U.scheduleMeta(); };
    let sh = sheetOf(node);

    const whoNow = () => (sh.who === null ? null : sh.who !== undefined ? sh.who : matchWho(node.title, ledgerNames.filter(Boolean)) ?? (ledgerNames.length === 1 ? ledgerNames[0] : null));
    function mine() {
      const w = whoNow(); if (w === null || !L) return { stats: [], got: [] };
      return { stats: L.stats.filter(s => (s.who || '') === w), got: L.got.filter(g => (g.who || '') === w) };
    }
    // chapters where something changes for this character: the stops on the timeline
    function stops() {
      const set = new Set();
      for (const h of Object.values(sh.slots)) for (const e of h || []) set.add(Math.max(0, at(e.ch)));
      const m = mine();
      for (const s of m.stats) for (const v of s.values) set.add(v.ci);
      for (const g of m.got) set.add(g.ch);
      if (chs.length) set.add(chs.length - 1);
      return [...set].filter(i => i >= 0).sort((a, b) => a - b);
    }
    const valueAt = (s, ci) => { let v = null; for (const x of s.values) if (x.ci <= ci) v = x; return v; };
    const slotAt = (sid, ci) => { let e = null; for (const x of (sh.slots[sid] || []).slice().sort((a, b) => at(a.ch) - at(b.ch))) if (Math.max(0, at(x.ch)) <= ci) e = x; return e && e.name ? e : null; };
    const chName = ci => (chs[ci] && chs[ci].title) || `Chapter ${ci + 1}`;
    // the stat system's numbers at a level: each stat and bar is its level-1 value plus its growth per level
    const sysNow = () => systems.find(x => x.id === sh.sys) || null;
    function expected(sys, L) {
      const d = sys.data || {}, val = s => Math.round((+s.base || 0) + (+s.per || 0) * (L - 1));
      return [...(d.res || []), ...(d.stats || [])].filter(s => s && s.name).map(s => ({ key: keyOf(s.name), label: s.name, want: val(s) }));
    }
    // compare at chapter ci: the chapters' numbers (the bar's top for HP/MP) against what the system says for that level
    function compare(ci, statTiles, lv) {
      const sys = sysNow(); if (!sys || !lv) return null;
      const L = Math.max(1, Math.round(+lv.v || 1)), have = new Map(statTiles.map(x => [keyOf(x.s.label), x.v]));
      // a number written before the latest level line is from an earlier level: not compared (it would always look wrong)
      const rows = expected(sys, L).map(e => { const v = have.get(e.key); const fresh = v && (v.order == null || lv.order == null || v.order >= lv.order); const got = fresh ? (v.max != null ? v.max : v.v) : null; return { ...e, got, stale: !!(v && !fresh), ok: got == null ? null : Math.round(+got) === e.want }; });
      return { sys, L, rows, off: rows.filter(r => r.ok === false) };
    }

    function render() {
      const SP = stops(), last = SP.length - 1;
      if (st.ci === null || !SP.includes(st.ci)) st.ci = SP.length ? SP[last] : 0;
      const si = Math.max(0, SP.indexOf(st.ci)), ci = st.ci, prevCi = si > 0 ? SP[si - 1] : -1;
      const m = mine();
      const level = m.stats.find(s => s.key === 'level'), lv = level && valueAt(level, ci);
      const w = whoNow();
      const statTiles = m.stats.map(s => ({ s, v: valueAt(s, ci), p: prevCi >= 0 ? valueAt(s, prevCi) : null })).filter(x => x.v);
      const fmtV = v => v.max != null ? `${U.fmt(v.v)}/${U.fmt(v.max)}` : U.fmt(v.v);
      const fig = sh.fig === 'own' && sh.img ? `<img class="cs-own" src="${esc(sh.img)}" alt="">`
        : sh.fig === 'own' ? `<label class="cs-up">${svg('<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/>', 28)}<b>Add your own picture</b><span>Click to choose one</span><input type="file" accept="image/*" class="cs-file"></label>`
        : `<img class="cs-figure" src="art/${sh.fig === 'f2' ? 'figure-2' : 'figure-1'}.png" alt="">`;
      const slotHtml = SLOTS.map(([sid, label, col, row, ic]) => {
        const e = slotAt(sid, ci), isNew = e && si > 0 && Math.max(0, at(e.ch)) > prevCi;
        return `<button type="button" class="cs-slot ${e ? 'r-' + (e.rar || 'common') : 'empty'} ${st.sel === sid ? 'sel' : ''}" data-slot="${sid}" style="grid-column:${col};grid-row:${row}">
          <span class="cs-ic">${svg(ICON[ic])}</span><span class="cs-st"><span class="cs-k">${esc(label)}</span><span class="cs-v">${e ? esc(e.name) : 'Empty'}</span>${e ? `<span class="cs-r">${esc(RNAME[e.rar] || 'Common')}${isNew ? ' · new' : ''}</span>` : ''}</span></button>`;
      }).join('');
      const sel = SLOTS.find(x => x[0] === st.sel), selE = slotAt(st.sel, ci);
      const editing = st.editing;
      const detail = editing ? editForm(editing, ci) : `<div class="cs-detail">${selE ? `<b>${esc(selE.name)}</b><span class="cs-rar r-${selE.rar || 'common'}">${esc(RNAME[selE.rar] || 'Common')}</span><span class="cs-note">${esc(selE.note || '')}${selE.note ? ' ' : ''}Since ${esc(at(selE.ch) >= 0 ? chName(at(selE.ch)) : 'the start')}.</span>` : `<b>${esc(sel[1])}</b><span class="cs-note">Empty at this point.</span>`}
          <span class="cs-sp"></span>${selE && at(selE.ch) >= 0 ? `<button type="button" class="link-btn" data-goch="${esc(selE.ch)}">Go to that chapter</button>` : ''}<button type="button" class="btn small" data-edit="${st.sel}">${selE ? 'Change…' : 'Add an item…'}</button></div>`;
      const items = m.got.filter(g => g.kind === 'item' && g.ch <= ci), skills = m.got.filter(g => SKILLISH.has(g.kind) && g.ch <= ci);
      const gearList = () => { const g = SLOTS.map(([sid, label]) => ({ label, e: slotAt(sid, ci) })).filter(x => x.e);
        return g.length ? `<div class="cs-rows cs-gear">${g.map(({ label, e }) => `<div class="cs-row"><span><small>${esc(label)}</small><b>${esc(e.name)}</b>${e.note ? `<small>${esc(e.note)}</small>` : ''}</span><span class="cs-rar r-${e.rar || 'common'}">${esc(RNAME[e.rar] || 'Common')}</span></div>`).join('')}</div>` : '<p class="hint">Nothing equipped at this chapter.</p>'; };
      const tabBody = st.tab === 'char' && ro ? gearList() : st.tab === 'char' ? `<div class="cs-grid"><div class="cs-frame"><div class="cs-pic">${fig}</div><div class="cs-figs">${[['f1', 'Figure 1'], ['f2', 'Figure 2'], ['own', 'Yours']].map(([k, l]) => `<button type="button" class="cs-fig ${sh.fig === k ? 'on' : ''}" data-fig="${k}">${l}</button>`).join('')}${sh.fig === 'own' && sh.img ? '<button type="button" class="cs-fig" data-clearimg>Remove</button>' : ''}</div></div>${slotHtml}</div>${detail}`
        : st.tab === 'stats' ? sysBox(ci, statTiles, lv) + (statTiles.length ? `<div class="cs-rows">${statTiles.map(x => `<div class="cs-row"><span>${esc(x.s.label)}</span><span><b>${fmtV(x.v)}</b>${x.p && x.p.v !== x.v.v ? ` <small>${x.v.v > x.p.v ? 'up' : 'down'} from ${fmtV(x.p)} since ${esc(chName(prevCi))}</small>` : ''}</span></div>`).join('')}</div>` : emptyStats(w))
        : st.tab === 'inv' ? (items.length ? `<div class="cs-rows">${items.map(g => `<div class="cs-row"><span>${esc(g.name)}</span><small>${esc(chName(g.ch))}</small></div>`).join('')}</div>` : `<p class="hint">No items yet at this chapter. Items come from messages like <b>[Item Obtained: Rusty Key]</b> in your chapters. Gear you put in a slot shows on the Character tab.</p>`)
        : (skills.length ? `<div class="cs-chips">${skills.map(g => `<span class="cs-chip">${esc(g.name)} <small>${esc(g.kind)}, ${esc(chName(g.ch))}</small></span>`).join('')}</div>` : `<p class="hint">No skills yet at this chapter. Skills come from messages like <b>[New Skill Acquired: Shadow Step]</b> in your chapters.</p>`);
      body.innerHTML = `
        ${others.length > 1 ? `<div class="cs-others">${prevC ? `<button type="button" class="btn small ghost" data-other="${esc(prevC.id)}" title="${esc(prevC.title || 'Untitled')}">‹ <span>${esc(prevC.title || 'Untitled')}</span></button>` : ''}${nextC ? `<button type="button" class="btn small ghost nx" data-other="${esc(nextC.id)}" title="${esc(nextC.title || 'Untitled')}"><span>${esc(nextC.title || 'Untitled')}</span> ›</button>` : ''}</div>` : ''}
        <div class="cs-head"><div class="cs-name">${esc(node.title || 'Untitled')}</div><div class="cs-sub">${lv ? `Level ${U.fmt(lv.v)}` : ''}${lv && chs.length ? ' · ' : ''}${chs.length ? esc(chName(ci)) : ''}</div></div>
        <div class="cs-time">
          <div class="cs-when ${si === last ? '' : 'back'}">${svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', 16)}<b>${si === last ? 'Up to date' : 'Looking back'}</b><span>·</span>${chs[ci] ? `<button type="button" class="cs-chlink" data-goch="${esc(chs[ci].id)}" title="Close the sheet and open this chapter">Ch ${ci + 1}: ${esc(chName(ci))}</button>` : `<span>${chs.length ? `Ch ${ci + 1}: ${esc(chName(ci))}` : 'No chapters yet'}</span>`}${si === last ? '' : '<button type="button" class="cs-now" data-now title="Back to the sheet as it is at the latest chapter">Back to latest</button>'}</div>
          <button type="button" class="cs-nav" data-step="-1" ${si <= 0 ? 'disabled' : ''} aria-label="Earlier">‹</button>
          <div class="cs-track"><i style="width:${last > 0 ? si / last * 100 : 100}%"></i>${SP.map((c, i) => `<button type="button" class="cs-stop ${i === si ? 'on' : ''}" style="left:${last > 0 ? i / last * 100 : 50}%" data-stop="${c}" title="${esc('Ch ' + (c + 1) + ': ' + chName(c))}" aria-label="${esc('Chapter ' + (c + 1))}"><span></span></button>`).join('')}</div>
          <button type="button" class="cs-nav" data-step="1" ${si >= last ? 'disabled' : ''} aria-label="Later">›</button>
        </div>
        <div class="cs-tabs" role="tablist">${[['char', 'Character'], ['stats', 'Stats'], ['inv', 'Inventory'], ['skills', 'Skills']].map(([k, l]) => `<button type="button" role="tab" class="${st.tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
        <div class="cs-body">${tabBody}</div>
        ${statTiles.length ? `<div class="cs-tiles">${statTiles.slice(0, 6).map(x => `<div class="cs-tile"><span>${esc(x.s.label)}</span><b>${fmtV(x.v)}</b><small>${x.p && x.v.v > x.p.v ? '+' + U.fmt(x.v.v - x.p.v) : ''}</small></div>`).join('')}</div>` : ''}
        ${ro ? `<div class="cs-foot"><span class="hint">View only on a phone. Change gear on an iPad or computer.${w !== null ? ` Stats of ${esc(w || 'status blocks with no name')}.` : ''}</span></div>`
          : `<div class="cs-foot"><label title="Stats come from the [Status] blocks in your chapters. Pick whose numbers this sheet shows.">Show stats of <select class="cs-who">${whoOptions(w)}</select></label><label>Stat system <select class="cs-sys"><option value="">None</option>${systems.map(x => `<option value="${esc(x.id)}" ${x.id === sh.sys ? 'selected' : ''}>${esc(x.title || 'Untitled')}</option>`).join('')}</select></label><span class="hint">Read from the [system messages] in your chapters. Nothing in the book changes.</span></div>`}`;
      wire();
    }
    // the Stats tab's check against a stat system: one line when all is well, the mismatches when not
    function sysBox(ci, statTiles, lv) {
      if (!sh.sys) return systems.length && !ro ? '<p class="hint cs-sys-tip">Pick a Stat system at the bottom to check these numbers against how the character should grow.</p>' : '';
      const sys = sysNow();
      if (!sys) return '<p class="hint cs-sys-tip">The stat system this sheet followed isn’t in Build any more.</p>';
      if (!lv) return `<p class="hint cs-sys-tip">To check against <b>${esc(sys.title || 'the stat system')}</b>, a chapter needs a level line like <b>[Level: 5]</b>.</p>`;
      const c = compare(ci, statTiles, lv);
      const rows = c.rows.filter(r => r.ok !== null);
      const head = c.off.length ? `<b>${c.off.length === 1 ? '1 number doesn’t' : c.off.length + ' numbers don’t'} match</b> ${esc(sys.title || 'the stat system')} at level ${U.fmt(c.L)}.`
        : rows.length ? `Everything matches ${esc(sys.title || 'the stat system')} at level ${U.fmt(c.L)}.` : `None of ${esc(sys.title || 'the stat system')}’s stats are in the chapters yet.`;
      const stale = c.rows.filter(r => r.stale).map(r => r.label);
      return `<div class="cs-sys ${c.off.length ? 'off' : 'ok'}"><p>${head}${stale.length ? ` <span class="hint">Not checked (last given before this level): ${esc(stale.join(', '))}.</span>` : ''}</p>${c.off.map(r => `<div class="cs-sys-row"><span>${esc(r.label)}</span><span>Chapters say <b>${U.fmt(r.got)}</b>, the system says <b>${U.fmt(r.want)}</b></span></div>`).join('')}</div>`;
    }
    function whoOptions(w) {
      const opts = ledgerNames.length ? ledgerNames : [];
      // whose [Status] numbers to show: a name from the chapters, the blocks that name nobody, or none at all
      const o = opts.map(n => `<option value="${esc(n)}" ${n === w ? 'selected' : ''}>${n ? esc(n) : 'Status blocks with no name'}</option>`)
        .concat([`<option value="__none" ${w === null ? 'selected' : ''}>Don’t show stats, just gear</option>`]);
      return o.join('');
    }
    function emptyStats(w) {
      if (!L) return '<p class="hint">Stats need the LitRPG ledger, which isn’t available here.</p>';
      if (w === null) return `<p class="hint">No stats linked yet. Pick whose stats to follow at the bottom, or write a status block in a chapter that starts <b>[Status: ${esc((node.title || 'Name').split(' ')[0])}]</b> with lines like <b>[Strength: 14]</b>.</p>`;
      return '<p class="hint">No stats at this chapter yet.</p>';
    }
    function editForm(sid, ci) {
      const label = SLOTS.find(x => x[0] === sid)[1];
      const e = slotAt(sid, ci);
      const hist = (sh.slots[sid] || []).slice().sort((a, b) => at(a.ch) - at(b.ch));
      return `<div class="cs-edit" data-own-enter>
        <div class="cs-edit-h"><b>${esc(label)}</b><span class="hint">From the chapter you pick, until something else goes in this slot.</span></div>
        <div class="cs-edit-row">
          <label>Item<input class="cs-in-name" value="${esc(e ? e.name : '')}" placeholder="Leave empty to take it off"></label>
          <label>Rarity<select class="cs-in-rar">${RAR.map(([k, l]) => `<option value="${k}" ${(e ? e.rar || 'common' : 'common') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label>From<select class="cs-in-ch">${chs.map((c, i) => `<option value="${esc(c.id)}" ${i === ci ? 'selected' : ''}>Ch ${i + 1}: ${esc(c.title || 'Untitled')}</option>`).join('')}</select></label>
        </div>
        <label class="cs-edit-note">Note (optional)<input class="cs-in-note" value="${esc(e ? e.note || '' : '')}" placeholder="Where it came from, what it does…"></label>
        ${hist.length ? `<div class="cs-hist"><span class="hint">This slot over the book:</span>${hist.map((h, i) => `<span class="cs-h">${esc(at(h.ch) >= 0 ? 'Ch ' + (at(h.ch) + 1) : 'Start')}: ${esc(h.name || '(nothing)')}<button type="button" class="cs-hx" data-delh="${i}" aria-label="Remove this change">×</button></span>`).join('')}</div>` : ''}
        <div class="cs-edit-b"><button type="button" class="btn small ghost" data-cancel>Cancel</button><button type="button" class="btn small primary" data-saveslot>Save</button></div></div>`;
    }
    function wire() {
      $$('[data-slot]', body).forEach(b => b.onclick = () => { st.sel = b.dataset.slot; st.editing = null; render(); });
      $$('[data-stop]', body).forEach(b => b.onclick = () => { st.ci = +b.dataset.stop; st.editing = null; render(); });
      const nowB = $('[data-now]', body); if (nowB) nowB.onclick = () => { const SP = stops(); st.ci = SP[SP.length - 1]; st.editing = null; render(); };
      $$('[data-step]', body).forEach(b => b.onclick = () => { const SP = stops(), i = SP.indexOf(st.ci) + +b.dataset.step; if (i >= 0 && i < SP.length) { st.ci = SP[i]; st.editing = null; render(); } });
      $$('[data-tab]', body).forEach(b => b.onclick = () => { st.tab = b.dataset.tab; st.editing = null; render(); });
      $$('[data-fig]', body).forEach(b => b.onclick = () => { sh.fig = b.dataset.fig; save(); render(); });
      const clr = $('[data-clearimg]', body); if (clr) clr.onclick = () => { sh.img = ''; save(); render(); };
      const file = $('.cs-file', body); if (file) file.onchange = async () => { const fl = file.files && file.files[0]; if (!fl) return; try { sh.img = await shrink(fl); sh.fig = 'own'; save(); render(); } catch (e) { console.error(e); U.toast('That picture couldn’t be read. Try a JPEG or PNG.'); } };
      $$('[data-goch]', body).forEach(go => go.onclick = () => { const cid = go.dataset.goch; closeSheet(); U.setView && U.setView('write'); U.openDoc(cid); });
      $$('[data-other]', body).forEach(b => b.onclick = () => { const id = b.dataset.other; closeSheet(); setTimeout(() => open(id, st.tab), 0); });
      const ed = $('[data-edit]', body); if (ed) ed.onclick = () => { st.editing = ed.dataset.edit; render(); const n = $('.cs-in-name', body); if (n) n.focus(); };
      const cancel = $('[data-cancel]', body); if (cancel) cancel.onclick = () => { st.editing = null; render(); };
      const sv = $('[data-saveslot]', body); if (sv) sv.onclick = () => {
        const sid = st.editing, name = $('.cs-in-name', body).value.trim().slice(0, 80), rar = $('.cs-in-rar', body).value, ch = $('.cs-in-ch', body).value, note = $('.cs-in-note', body).value.trim().slice(0, 300);
        const list = (sh.slots[sid] || []).filter(x => x.ch !== ch);
        list.push(name ? { ch, name, rar, note } : { ch, name: '' });
        sh.slots[sid] = list; st.editing = null; st.ci = Math.max(0, at(ch)); save(); render();
      };
      $$('[data-delh]', body).forEach(b => b.onclick = () => {
        const sid = st.editing, hist = (sh.slots[sid] || []).slice().sort((a, c) => at(a.ch) - at(c.ch)), gone = hist[+b.dataset.delh];
        sh.slots[sid] = (sh.slots[sid] || []).filter(x => x !== gone); save(); render();
      });
      const name = $('.cs-in-name', body); if (name) name.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('[data-saveslot]', body).click(); } });
      const who = $('.cs-who', body); if (who) who.onchange = () => { sh.who = who.value === '__none' ? null : who.value; save(); st.ci = null; render(); };
      const sysSel = $('.cs-sys', body); if (sysSel) sysSel.onchange = () => { sh.sys = sysSel.value; save(); st.tab = 'stats'; render(); };
    }
    // the writer's own picture: shrunk so the book file stays small
    async function shrink(blob) {
      const bmp = await createImageBitmap(blob), MAX = 520, k = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
      const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.84);
    }
    render();
    await U.modal({ title: ro ? 'Character sheet (view only)' : 'Character sheet', body, wide: true, buttons: [{ label: 'Close', value: true, kind: 'primary' }] });
  }

  // ---- "Add to a character sheet…": from selected words in a chapter (the selection bar, or right-click on PC/Mac).
  // [Item Obtained: Rusty Key] becomes "Rusty Key"; the chapter you're in is where it starts.
  function cleanName(t) {
    let s = String(t || '').replace(/\s+/g, ' ').trim();
    const m = /\[?\s*(?:new\s+)?(?:item|weapon|armou?r|equipment|gear|loot|reward)[^:\]]*:\s*([^\]]+)\]?/i.exec(s);
    if (m) s = m[1]; else s = s.replace(/^\[|\]$/g, '');
    return s.replace(/[.!]+$/, '').trim().slice(0, 80);
  }
  function characters() {
    const out = [], root = S.project && S.project.binder.find(n => n.root && n.kind === 'characters');
    if (root) U.walkTree(root.children || [], n => { if (n.type === 'doc' && !n.map) out.push(n); });
    return out;
  }
  // Lore › Character sheets in the left list: every character, with how much gear they carry, one click to their sheet
  async function browse() {
    if (!S.project || tooSmall()) return;
    const chars = characters();
    if (!chars.length) return newSheet();
    const body = document.createElement('div'); body.className = 'cs-browse';
    const pos = new Map(chapters().map((c, i) => [c.id, i])), at = ch => (pos.has(ch) ? pos.get(ch) : -1);
    const equipped = sh => Object.values(sh.slots).filter(l => { const last = l.slice().sort((a, b) => at(a.ch) - at(b.ch)).pop(); return last && last.name; }).length;
    body.innerHTML = chars.map(c => { const sh = sheetOf(c); const n = equipped(sh);
      return `<button type="button" class="cs-br-row" data-id="${esc(c.id)}"><span class="cs-br-ic">${U.I ? U.I.person : ''}</span><b>${esc(c.title || 'Untitled')}</b><small>${n ? n + ' equipped' : 'No gear yet'}</small></button>`; }).join('');
    let pick = null, close2 = () => {};
    body.addEventListener('click', e => { const r = e.target.closest('[data-id]'); if (r) { pick = r.dataset.id; close2(); } });
    const v = await U.modal({ title: 'Character sheets', body, buttons: [{ label: 'New character sheet…', value: 'new', kind: 'ghost' }, { label: 'Close', value: false, kind: 'primary' }], onOpen: back => { close2 = () => { const b = [...back.querySelectorAll('.m-foot .btn')].pop(); if (b) b.click(); }; } });
    if (v === 'new') return newSheet();
    if (pick) { await U.openDoc(pick); await open(pick); }
  }
  // New character sheet: a new character (added to Characters, with the book's character fields), or one who's already
  // there, then their sheet opens. From the main screen's Open World tab, the book is picked first (opts.slug).
  async function newSheet(opts = {}) {
    if (opts.slug && (!S.project || S.slug !== opts.slug)) { const ok = await U.openProject(opts.slug); if (ok === false || !S.project) return; }
    if (!S.project || tooSmall()) return;
    const chars = characters(), body = document.createElement('div'); body.className = 'cs-new';
    body.innerHTML = `<label class="field">Name<input class="cs-new-name" placeholder="e.g. Wren Tallow" maxlength="80"></label>
      ${chars.length ? `<div class="cs-new-or"><span>or a character already in this book</span></div><div class="cs-new-list">${chars.map(c => `<button type="button" class="cs-new-pick" data-id="${esc(c.id)}">${esc(c.title || 'Untitled')}${Object.keys(sheetOf(c).slots).length ? '<small>has a sheet</small>' : ''}</button>`).join('')}</div>` : ''}
      <p class="hint">A new character goes in your Characters folder, with the same fields as the others.</p>`;
    let pick = null, close2 = () => {};
    body.addEventListener('click', e => { const b = e.target.closest('.cs-new-pick'); if (b) { pick = b.dataset.id; close2(); } });
    const v = await U.modal({ title: 'New character sheet', body, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Make the sheet', value: true, kind: 'primary' }],
      onOpen: back => { const i = back.querySelector('.cs-new-name'); if (i) setTimeout(() => i.focus(), 50); close2 = () => { const b = [...back.querySelectorAll('.m-foot .btn')].pop(); if (b) b.click(); }; } });
    let id = pick;
    if (!id) {
      const name = v ? body.querySelector('.cs-new-name').value.trim().slice(0, 80) : '';
      if (!name) return;
      const root = S.project.binder.find(n => n.root && n.kind === 'characters'); if (!root) return;
      await U.addNode('doc', root.id, true);
      id = S.docId; const f = U.findNode(id); if (!f) return;
      // adding a document opens the binder's rename box: the name goes in there and is saved through it (renaming any
      // other way would be undone when that box later lost focus)
      const box = document.querySelector('.tree-row input.rename');
      if (box) { box.value = name; box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }
      else { f.node.title = name; U.scheduleMeta(); U.renderBinder(); const t = document.getElementById('doc-title'); if (t) t.value = name; }
    } else await U.openDoc(id);
    const f = U.findNode(id); if (!f) return;
    if (!f.node.csheet) { f.node.csheet = { fig: 'f1', slots: {} }; U.scheduleMeta(); }
    if (U.level() < 2) U.setMode('lore');
    await open(id);
  }
  async function addFrom(text) {
    if (!S.project || tooSmall()) return;
    const chars = characters();
    if (!chars.length) { U.toast('Add a character to your Characters folder first, then their sheet can hold gear.'); return; }
    const chs = chapters(), here = chs.findIndex(c => c.id === S.docId);
    const pov = here >= 0 && (chs[here].pov || '').trim().toLowerCase();
    const pick = (pov && chars.find(c => (c.title || '').toLowerCase() === pov || (c.title || '').toLowerCase().split(' ')[0] === pov.split(' ')[0])) || chars[0];
    const body = document.createElement('div'); body.className = 'cs-add';
    body.innerHTML = `<div class="cs-edit-row" style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px">
        <label class="field">Item<input class="cs-a-name" value="${esc(cleanName(text))}"></label>
        <label class="field">Character<select class="cs-a-who">${chars.map(c => `<option value="${esc(c.id)}" ${c === pick ? 'selected' : ''}>${esc(c.title || 'Untitled')}</option>`).join('')}</select></label>
        <label class="field">Slot<select class="cs-a-slot">${SLOTS.map(([sid, l]) => `<option value="${sid}" ${sid === 'other' ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
        <label class="field">Rarity<select class="cs-a-rar">${RAR.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
        <label class="field" style="grid-column:1/-1">From<select class="cs-a-ch">${chs.map((c, i) => `<option value="${esc(c.id)}" ${i === Math.max(0, here) ? 'selected' : ''}>Ch ${i + 1}: ${esc(c.title || 'Untitled')}</option>`).join('')}</select></label>
      </div><p class="hint">It goes in that slot from this chapter on. Open the character's sheet (Lore) to see it, change it or take it off later.</p>`;
    const ok = await U.modal({ title: 'Add to a character sheet', body, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Add', value: true, kind: 'primary' }] });
    if (!ok) return;
    const name = $('.cs-a-name', body).value.trim().slice(0, 80); if (!name) return;
    const f = U.findNode($('.cs-a-who', body).value); if (!f) return;
    const sh = sheetOf(f.node), sid = $('.cs-a-slot', body).value, ch = $('.cs-a-ch', body).value;
    sh.slots[sid] = (sh.slots[sid] || []).filter(x => x.ch !== ch).concat([{ ch, name, rar: $('.cs-a-rar', body).value, note: '' }]);
    f.node.csheet = JSON.parse(JSON.stringify(sh)); U.scheduleMeta();
    U.toastAction(`Added “${esc(name)}” to ${esc(f.node.title || 'their')} sheet.`, 'Open the sheet', () => open(f.node.id), 8000);
  }
  // the selection bar's button clicks this (it works on the words still selected)
  const hiddenAdd = document.createElement('button'); hiddenAdd.id = 'btn-add-sheet'; hiddenAdd.hidden = true; document.body.appendChild(hiddenAdd);
  hiddenAdd.onclick = () => { const t = getSelection().toString(); if (t.trim()) addFrom(t); };
  const tellLevel = () => { try { U.api.setLevel && U.api.setLevel(U.level()); } catch {} };
  U.on('level', tellLevel); setTimeout(tellLevel, 0);

  document.querySelectorAll('#plan-lore [data-lore]').forEach(b => b.onclick = () => {
    if (b.dataset.lore === 'sheets') browse(); else if (window.UnwipBuild) window.UnwipBuild.fromBook('world');
  });
  return { open, browse, newSheet, isChar, addFrom, cleanName };
})();
