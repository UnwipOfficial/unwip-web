// Unwip - Story Bible (main screen › Open World, Lore level). One place for a whole series (or one book): the
// people, places and things from every book's Characters, Places and Items, where each one appears, who they're
// often seen with, their gear, the world's Open World pieces and the timeline across the books.
//
// Facts pinned from a chapter ("Add to bible" on selected words) live in that book's project.json, in
//   bible.facts: [{ id, node, key, topic, text, ch, at }]   node = the page it's about in that book, key = its series
//   key when shared (so it's the same entry in every book), ch = the chapter it comes from. A later fact with the same
//   topic (Hair, Ruler…) replaces an earlier one from its chapter on; "As of" shows the bible up to a chapter.
//   bible.glossary: [{ id, term, meaning, at }]      words of the world; their spelling is checked in every chapter
//   bible.threads:  [{ id, title, note, open, closed, status: 'open'|'paid'|'dropped', at }]   open/closed = chapter ids
//   bible.links:    [{ id, a, b, type, label, ch, end, note, at }]   relationships: a and b are { node, key, kind, title }
//                    (found like facts: series key, else the page id in any book, else the same name). type is one of
//                    REL below (or 'other' with its own label), read from a's side. ch / end = chapter ids it starts and
//                    stops at (empty: from the start / still so), so As of shows who was what to whom at that point.
// Also on each book's project.json:
//   seriesNo   the book's number in its series (Book 1, Book 2…), set by reordering the books here
//   series     the series name (already used by series.js), set here with "Put it in a series"
// An entry is the same character in every book when the books share it (series.js keeps one key for a shared page);
// otherwise pages with the same name in the same folder count as the same entry.
// Appearances are found by name: the page's title, a first name, and anything in an "Aliases" field. No AI: a name
// has to be written for it to count.
window.UnwipBible = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return null;
  const { $, $$, esc, api } = U;
  const KINDS = [['characters', 'People', 'person'], ['places', 'Places', 'pin'], ['items', 'Things', 'gem']];
  const KIND_ONE = { characters: 'person', places: 'place', items: 'thing' };
  // relationship types, by the kinds on each side: [type, from a's side, from b's side (none: the same both ways), group]
  const REL = {
    'characters>characters': [['parent', 'Parent of', 'Child of', 'family'], ['sibling', 'Brother or sister of', null, 'family'], ['family', 'Family of', null, 'family'], ['married', 'Married to', null, 'love'], ['engaged', 'Engaged to', null, 'love'], ['loves', 'In love with', 'Loved by', 'love'], ['friend', 'Friend of', null, 'ally'], ['ally', 'Ally of', null, 'ally'], ['mentor', 'Mentor of', 'Taught by', 'ally'], ['serves', 'Serves', 'Served by', 'ally'], ['worksfor', 'Works for', 'Employs', 'ally'], ['rival', 'Rival of', null, 'conflict'], ['enemy', 'Enemy of', null, 'conflict'], ['hunts', 'Hunts', 'Hunted by', 'conflict'], ['betrayed', 'Betrayed', 'Betrayed by', 'conflict']],
    'characters>places': [['lives', 'Lives in', 'Home of', 'place'], ['rules', 'Rules', 'Ruled by', 'place'], ['born', 'Born in', 'Birthplace of', 'place'], ['held', 'Held in', 'Holds', 'place'], ['guards', 'Guards', 'Guarded by', 'place']],
    'characters>items': [['owns', 'Owns', 'Owned by', 'thing'], ['carries', 'Carries', 'Carried by', 'thing'], ['made', 'Made', 'Made by', 'thing'], ['seeks', 'Seeks', 'Sought by', 'thing'], ['lost', 'Lost', 'Lost by', 'thing']],
    'any': [['part', 'Part of', 'Has in it', 'other'], ['near', 'Near', null, 'other'], ['tied', 'Tied to', null, 'other']]
  };
  const REL_GROUPS = { family: 'Family', love: 'Love', ally: 'Allies and work', conflict: 'Conflict', place: 'Places', thing: 'Things', other: 'Other' };
  const relDef = type => { for (const list of Object.values(REL)) { const d = list.find(x => x[0] === type); if (d) return d; } return null; };
  const LORE = { magic: 'Magic systems', runes: 'Rune alphabets', sigil: 'Sigils', insignia: 'Insignia', map: 'Maps', arms: 'Coats of arms', stats: 'Stat systems' };
  const COMMON = new Set(['the', 'a', 'an', 'old', 'young', 'lady', 'lord', 'sir', 'mr', 'mrs', 'miss', 'dr', 'king', 'queen', 'captain', 'count', 'new']);
  const norm = s => String(s || '').trim();
  // a place in the series as one number: book, then chapter (a chapter that's gone counts as the start of its book)
  const gp = s => s.b.no * 100000 + Math.max(0, s.ci);
  const keyName = s => norm(s).toLowerCase().replace(/\s+/g, ' ');
  const phone = () => window.matchMedia('(max-width: 720px)').matches;
  const ICO = n => (U.I && U.I[n]) || '';

  // ---------------------------------------------------------------- the shelf: every series, and books on their own
  async function shelf() {
    let list = []; try { list = await api.listProjects(); } catch {}
    const series = new Map();
    for (const b of list) if (b.series) { const k = keyName(b.series); if (!series.has(k)) series.set(k, { name: b.series, books: [] }); series.get(k).books.push(b); }
    const alone = list.filter(b => !b.series);
    return { series: [...series.values()].map(s => ({ ...s, books: s.books.sort((a, b) => (a.seriesNo || 999) - (b.seriesNo || 999) || (a.modified || 0) - (b.modified || 0)) })), alone };
  }
  // the Story Bible row at the top of the Open World tab
  // the last shelf drawn, so Build can show it straight away while the books are read again (an empty slot that
  // fills a moment later made the Build buttons jump: they flashed at the top, then dropped below)
  let lastShelf = '';
  async function shelfHTML() {
    const sh = await shelf();
    const card = (label, sub, data) => `<button type="button" class="sbb-card" ${data}><span class="sbb-spine"></span><b>${esc(label)}</b><em>${esc(sub)}</em></button>`;
    const cards = sh.series.map(s => card(s.name, `Series · ${s.books.length} book${s.books.length === 1 ? '' : 's'}`, `data-bible-series="${esc(s.name)}"`))
      .concat(sh.alone.map(b => card(b.title, 'One book', `data-bible-book="${esc(b.slug)}"`)));
    return `<div class="sbb-shelf"><div class="pl-head"><div><h1>Story Bible</h1><p>Everything about your world in one place, for a whole series or one book: who and what is in it, where each one turns up, and when things happen.${phone() ? ' On a phone you can read it; add to it on an iPad or computer.' : ''}</p></div></div>
      <div class="sbb-row">${cards.join('') || '<p class="lib-empty sbb-empty">Make a book first, then its Story Bible fills itself in.</p>'}</div></div>`;
  }
  const shelfHTMLSaved = async () => (lastShelf = await shelfHTML());
  function wireShelf(box) {
    $$('[data-bible-series]', box).forEach(b => b.onclick = () => open({ series: b.dataset.bibleSeries }));
    $$('[data-bible-book]', box).forEach(b => b.onclick = () => open({ slug: b.dataset.bibleBook }));
  }

  // ---------------------------------------------------------------- reading the books
  const text = html => String(html || '').replace(/<(sup|span)[^>]*class="(fn|cmt)[^"]*"[^>]*>[\s\S]*?<\/\1>/g, m => m.replace(/<[^>]+>/g, '')).replace(/<\/(p|h\d|li|blockquote)>/g, '\n').replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&rsquo;/g, '’');
  function walk(nodes, fn) { for (const n of nodes || []) { fn(n); if (n.children) walk(n.children, fn); } }
  // a sheet page: "Field: value" lines and headed sections
  function parseSheet(html) {
    const doc = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html'), root = doc.body.firstChild, fields = [], sections = [];
    let cur = null;
    for (const el of [...(root ? root.children : [])]) {
      const t = norm(el.textContent);
      if (/^H[1-6]$/.test(el.tagName)) { cur = { h: t, p: [] }; sections.push(cur); continue; }
      const b = el.querySelector('b, strong'), m = /^([^:]{1,40}):\s*([\s\S]*)$/.exec(t);
      if (!cur && b && m && t.startsWith(norm(b.textContent).replace(/:$/, ''))) { fields.push([m[1].trim(), m[2].trim()]); continue; }
      if (t || el.querySelector('img')) { if (!cur) { cur = { h: '', p: [] }; sections.push(cur); } cur.p.push(el.querySelector('img') && !t ? '[picture]' : t); }
    }
    return { fields, sections: sections.filter(s => s.p.some(x => x) || s.h) };
  }
  async function load(target) {
    const sh = await shelf();
    if (window.UnwipBuild && window.UnwipBuild.refresh) { try { await window.UnwipBuild.refresh(); } catch {} }   // for the maps and pictures linked to pages
    let books, label, series = '';
    if (target.series) { const s = sh.series.find(x => keyName(x.name) === keyName(target.series)); if (!s) return null; books = s.books; label = s.name; series = s.name; }
    else { const b = [...sh.alone, ...sh.series.flatMap(s => s.books)].find(x => x.slug === target.slug); if (!b) return null; books = [b]; label = b.title; series = b.series || ''; }
    const B = [];
    for (const [bi, b] of books.entries()) {
      let p = null; try { p = await api.openProject(b.slug); } catch {}
      if (!p) continue;
      const chs = []; const ms = (p.binder || []).find(r => r.kind === 'manuscript');
      walk(ms && ms.children, n => { if (n.type === 'doc') chs.push({ id: n.id, title: n.title || 'Untitled' }); });
      B.push({ slug: b.slug, title: p.title || b.title, no: bi + 1, p, chs });
    }
    // every chapter's words, once (names are found in these)
    let done = 0; const total = B.reduce((a, b) => a + b.chs.length, 0);
    for (const b of B) for (const c of b.chs) { try { c.text = text(await api.loadDoc(b.slug, c.id)); } catch { c.text = ''; } done++; if (st && st.loading) progress(done, total); }
    // the entries: shared pages are one entry; otherwise the same name in the same folder
    const E = new Map();
    for (const b of B) for (const [kind] of KINDS) {
      const root = (b.p.binder || []).find(r => r.kind === kind); if (!root) continue;
      walk(root.children, n => {
        if (n.type !== 'doc' || n.map) return;
        const id = n.series && n.series.key ? 's:' + n.series.key : kind + ':' + keyName(n.title);
        if (!E.has(id)) E.set(id, { id, kind, title: n.title || 'Untitled', in: [], node: n, book: b, mod: 0 });
        const e = E.get(id); e.in.push({ b, node: n });
        const m = n.mod || 0; if (m >= e.mod) { e.mod = m; e.node = n; e.book = b; e.title = n.title || e.title; }
      });
    }
    for (const e of E.values()) {
      let html = ''; try { html = await api.loadDoc(e.book.slug, e.node.id); } catch {}
      e.sheet = parseSheet(html);
      const alias = (e.sheet.fields.find(f => /^(aliases?|also known as|nicknames?|names?)$/i.test(f[0])) || [])[1] || '';
      // a person is also found by first name and by surname ("Harker," he said; "Van Helsing")
      const words = e.title.split(/\s+/).filter(Boolean), first = words[0] || '', last = words.slice(1).join(' ');
      const usable = w => w && w.length > 2 && !COMMON.has(w.toLowerCase()) && /^\p{Lu}/u.test(w);
      const people = e.kind === 'characters' && words.length > 1 ? [first, last].filter(usable) : [];
      e.names = [...new Set([e.title, ...people, ...alias.split(/[,;/]| or /).map(norm).filter(x => x.length > 1)])];
      const esc2 = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      e.re = new RegExp(`(?<![\\p{L}\\p{N}])(${e.names.map(esc2).sort((a, b) => b.length - a.length).join('|')})(?![\\p{L}\\p{N}])`, 'u');
      e.seen = [];
      for (const b of B) b.chs.forEach((c, ci) => { if (e.re.test(c.text)) e.seen.push({ b, ci }); });
      e.img = (e.in.map(x => x.node.csheet && typeof x.node.csheet.img === 'string' && /^data:image\//.test(x.node.csheet.img) ? x.node.csheet.img : '').find(Boolean)) || '';
    }
    // pinned facts, from every book, on the entry they're about, with where they come from
    for (const e of E.values()) e.facts = [];
    for (const b of B) {
      const F = (b.p.bible && Array.isArray(b.p.bible.facts)) ? b.p.bible.facts : [];
      for (const f of F) {
        if (!f || typeof f !== 'object' || typeof f.text !== 'string') continue;
        const e = (f.key && E.get('s:' + f.key)) || [...E.values()].find(x => x.in.some(i => i.b === b && i.node.id === f.node));
        if (!e) continue;
        const ci = b.chs.findIndex(c => c.id === f.ch);
        e.facts.push({ id: String(f.id || ''), topic: norm(f.topic).slice(0, 40), text: f.text.slice(0, 600), b, ci, at: +f.at || 0 });
      }
    }
    for (const e of E.values()) e.facts.sort((x, y) => gp(x) - gp(y) || x.at - y.at);
    // threads and glossary words, from every book
    const threads = [], gloss = new Map();
    for (const b of B) {
      const bb = b.p.bible && typeof b.p.bible === 'object' ? b.p.bible : {};
      for (const t of Array.isArray(bb.threads) ? bb.threads : []) {
        if (!t || typeof t !== 'object' || typeof t.title !== 'string') continue;
        threads.push({ id: String(t.id || ''), title: t.title.slice(0, 120), note: typeof t.note === 'string' ? t.note.slice(0, 600) : '', b, ci: b.chs.findIndex(c => c.id === t.open),
          closed: t.closed ? (() => { for (const bx of B) { const i = bx.chs.findIndex(c => c.id === t.closed); if (i >= 0) return { b: bx, ci: i }; } return null; })() : null, status: ['open', 'paid', 'dropped'].includes(t.status) ? t.status : 'open', at: +t.at || 0 });
      }
      for (const g of Array.isArray(bb.glossary) ? bb.glossary : []) {
        if (!g || typeof g.term !== 'string' || !norm(g.term)) continue;
        const k = keyName(g.term), prev = gloss.get(k);
        if (!prev || (+g.at || 0) > prev.at) gloss.set(k, { id: String(g.id || ''), term: norm(g.term).slice(0, 60), meaning: typeof g.meaning === 'string' ? g.meaning.slice(0, 600) : '', b, at: +g.at || 0 });
      }
    }
    threads.sort((x, y) => gp(x) - gp(y) || x.at - y.at);
    // relationships, from every book, with the chapters they start and stop at
    const whereCh = id => { if (!id) return null; for (const bx of B) { const i = bx.chs.findIndex(c => c.id === id); if (i >= 0) return { b: bx, ci: i }; } return null; };
    const findEnt = r => r && typeof r === 'object' ? ((r.key && E.get('s:' + r.key)) || [...E.values()].find(x => x.in.some(i => i.node.id === r.node)) || E.get(r.kind + ':' + keyName(r.title || ''))) : null;
    const links = [];
    for (const b of B) {
      const bb = b.p.bible && typeof b.p.bible === 'object' ? b.p.bible : {};
      for (const l of Array.isArray(bb.links) ? bb.links : []) {
        if (!l || typeof l !== 'object' || typeof l.type !== 'string') continue;
        const ea = findEnt(l.a), eb = findEnt(l.b); if (!ea || !eb || ea === eb) continue;
        links.push({ id: String(l.id || ''), a: ea, b: eb, type: l.type, label: typeof l.label === 'string' ? l.label.slice(0, 40) : '', from: whereCh(l.ch), to: whereCh(l.end), note: typeof l.note === 'string' ? l.note.slice(0, 300) : '', book: b, at: +l.at || 0 });
      }
    }
    // the book's own Connections (the strip at the top of a character, place or thing page): the same thing seen from the
    // book, so they show here as relationships. Saved as { a, b, f, r } (page ids in that book, the label from a's and
    // from b's side); ones made here also carry type, ch, end, note and id.
    for (const b of B) {
      (Array.isArray(b.p.links) ? b.p.links : []).forEach((l, i) => {
        if (!l || typeof l !== 'object' || typeof l.f !== 'string') return;
        const ea = [...E.values()].find(x => x.in.some(k => k.b === b && k.node.id === l.a)), eb = [...E.values()].find(x => x.in.some(k => k.b === b && k.node.id === l.b));
        if (!ea || !eb || ea === eb) return;
        links.push({ id: l.id ? String(l.id) : 'i:' + i, a: ea, b: eb, type: typeof l.type === 'string' && l.type ? l.type : 'conn', label: l.f.slice(0, 40), rlabel: typeof l.r === 'string' ? l.r.slice(0, 40) : '', conn: true,
          from: whereCh(l.ch), to: whereCh(l.end), note: typeof l.note === 'string' ? l.note.slice(0, 300) : '', book: b, at: +l.at || 0 });
      });
    }
    // often seen with: the entries that share the most chapters with this one
    const list = [...E.values()];
    for (const e of list) {
      const mine = new Set(e.seen.map(s => s.b.slug + ':' + s.ci));
      e.with = list.filter(o => o !== e && o.kind === 'characters').map(o => ({ o, n: o.seen.filter(s => mine.has(s.b.slug + ':' + s.ci)).length })).filter(x => x.n).sort((a, b) => b.n - a.n).slice(0, 6);
    }
    return { label, series, books: B, entries: list, threads, links, glossary: [...gloss.values()].sort((a, b) => a.term.localeCompare(b.term)) };
  }

  // ---------------------------------------------------------------- the page
  let st = null, page = null, last = null;
  // back from a Lore piece opened here: the same bible, on the Lore tab, at the same As of
  async function reopen() { if (!last) return; const l = last; last = null; await open({ ...l.target, tab: l.tab }); if (st) { st.asOf = l.asOf; if (l.sel && st.data.entries.some(e => e.id === l.sel)) st.sel = l.sel; draw(); } }
  function progress(n, of) { const p = page && page.querySelector('.sbb-load'); if (p) p.textContent = `Reading the books… ${Math.round(n / Math.max(1, of) * 100)}%`; }
  async function open(target) {
    if (!page) { page = document.createElement('section'); page.id = 'bible'; page.className = 'sbb hidden'; document.body.appendChild(page); }
    st = { target, tab: target.tab || 'characters', sel: null, q: '', loading: true, data: null, asOf: null };
    page.classList.remove('hidden'); document.body.classList.add('in-bible');
    page.innerHTML = `<div class="sbb-top"><button type="button" class="icon-btn" data-close aria-label="Back">‹</button><h1>Story Bible</h1></div><p class="sbb-load">Reading the books…</p>`;
    page.querySelector('[data-close]').onclick = close;
    st.data = await load(target);
    st.loading = false;
    if (!st.data) { close(); U.toast('That series or book isn’t there any more.'); return; }
    draw();
  }
  function close() { if (page) { page.classList.add('hidden'); page.innerHTML = ''; } document.body.classList.remove('in-bible'); st = null; refreshShelf(); }
  const upto = s => !st || st.asOf == null || gp(s) <= st.asOf;
  const seenNow = e => e.seen.filter(upto);
  const factsNow = e => e.facts.filter(upto);
  const visible = e => st.asOf == null || !e.seen.length || upto(e.seen[0]) || factsNow(e).length;
  const where = s => `${s.b.no > 1 || (st && st.data.books.length > 1) ? `Book ${s.b.no} · ` : ''}Ch ${s.ci + 1}`;
  function draw() {
    const D = st.data, multi = D.books.length > 1;
    const tabs = [...KINDS.map(([k, t]) => [k, t, D.entries.filter(e => e.kind === k && visible(e)).length]), ['web', 'Web', null], ['threads', 'Threads', null], ['glossary', 'Glossary', null], ['lore', 'Lore', null], ['timeline', 'Timeline', null]];
    page.innerHTML = `
      <div class="sbb-top"><button type="button" class="icon-btn" data-close aria-label="Back to the main screen" title="Back">‹</button>
        <div class="sbb-title"><span class="sbb-kicker">Story Bible</span><h1>${esc(D.label)}</h1></div>
        <div class="sbb-books">${D.books.map((b, i) => `<span class="sbb-book" title="${esc(b.title)}">${multi ? `<b>${b.no}</b>` : ''}<span class="sbb-bk-t">${esc(b.title)}</span><button type="button" class="sbb-bk-more" data-bmore="${i}" aria-label="More for ${esc(b.title)}" title="Open, take out of the series, or delete">⋯</button>${multi ? `<span class="sbb-mv">${i ? `<button type="button" data-bmv="-1" data-i="${i}" aria-label="Earlier in the series" title="Move this book earlier in the series (Book ${b.no - 1})">‹</button>` : ''}${i < D.books.length - 1 ? `<button type="button" data-bmv="1" data-i="${i}" aria-label="Later in the series" title="Move this book later in the series (Book ${b.no + 1})">›</button>` : ''}</span>` : ''}</span>`).join('')}
          ${D.series ? '<button type="button" class="link-btn" data-endseries title="Every book stays, as a book of its own">End the series…</button>' : '<button type="button" class="link-btn" data-series>Put it in a series…</button>'}<button type="button" class="btn small" data-export title="Save the Story Bible as a Word file or PDF, up to a chapter if you like">Export…</button></div></div>
      <div class="sbb-asof"><label>As of <select class="sbb-asof-sel" aria-label="Show the bible as of">
          <option value="">the whole ${multi ? 'series' : 'book'}</option>
          ${D.books.map(b => `<optgroup label="${multi ? `Book ${b.no}: ` : ''}${esc(b.title)}">${b.chs.map((c, ci) => `<option value="${b.no * 100000 + ci}" ${st.asOf === b.no * 100000 + ci ? 'selected' : ''}>${multi ? `Book ${b.no} · ` : ''}Ch ${ci + 1}: ${esc(c.title)}</option>`).join('')}</optgroup>`).join('')}
        </select></label>${st.asOf != null ? '<button type="button" class="sbb-chip" data-step-asof="-1" aria-label="A chapter earlier">‹</button><button type="button" class="sbb-chip" data-step-asof="1" aria-label="A chapter later">›</button><span class="sbb-spoil">Nothing after this chapter is shown: no spoilers.</span>' : ''}</div>
      <nav class="sbb-tabs">${tabs.map(([k, t, n]) => `<button type="button" class="${st.tab === k ? 'on' : ''}" data-tab="${k}">${t}${n != null ? ` <small>${n}</small>` : ''}</button>`).join('')}</nav>
      <div class="sbb-body">${st.sel ? entryHTML(D.entries.find(e => e.id === st.sel)) : st.tab === 'lore' ? '<p class="sbb-load">Gathering…</p>' : st.tab === 'timeline' ? timelineHTML() : st.tab === 'web' ? webHTML() : st.tab === 'threads' ? threadsHTML() : st.tab === 'glossary' ? '<p class="sbb-load">Reading the words…</p>' : listHTML(st.tab)}</div>`;
    wire();
    if (!st.sel && st.tab === 'glossary') glossaryHTML().then(h => { const b = page.querySelector('.sbb-body'); if (b && st && st.tab === 'glossary' && !st.sel) { b.innerHTML = h; wireGloss(b); } });
    if (!st.sel && st.tab === 'lore') loreHTML().then(h => { const b = page.querySelector('.sbb-body'); if (b && st && st.tab === 'lore' && !st.sel) { b.innerHTML = h; wireLore(b); } });
  }
  const byBookOn = () => { try { return localStorage.getItem('unwip-bible-bybook') === '1'; } catch { return false; } };
  function listHTML(kind) {
    const D = st.data, all = D.entries.filter(e => e.kind === kind), q = keyName(st.q);
    const list = all.filter(visible).filter(e => !q || keyName(e.title).includes(q) || e.sheet.fields.some(f => keyName(f[1]).includes(q)) || e.facts.some(f => upto(f) && keyName(f.text).includes(q)))
      .sort((a, b) => (seenNow(b).length - seenNow(a).length) || a.title.localeCompare(b.title));
    const role = e => (e.sheet.fields.find(f => /^(role|class|type|kind|occupation|what)$/i.test(f[0]) && f[1]) || [])[1] || '';
    const ini = t => esc(t.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase());
    // a series can show everyone together, or in a section per book (by the book they first turn up in)
    const multi = D.books.length > 1, byBook = multi && byBookOn();
    const card = e => `<button type="button" class="sbb-ent" data-ent="${esc(e.id)}">
        <span class="sbb-pic ${e.img ? '' : 'none'}">${e.img ? `<img src="${esc(e.img)}" alt="">` : kind === 'characters' ? ini(e.title) : ICO(KINDS.find(k => k[0] === kind)[2])}</span>
        <span class="sbb-ent-t"><b>${esc(e.title)}</b>${role(e) ? `<em>${esc(role(e))}</em>` : ''}
        <small>${seenNow(e).length ? `First seen ${where(seenNow(e)[0])} · in ${seenNow(e).length} chapter${seenNow(e).length === 1 ? '' : 's'}` : 'Not named in a chapter yet'}${factsNow(e).length ? ` · ${factsNow(e).length} fact${factsNow(e).length === 1 ? '' : 's'}` : ''}${e.in.length > 1 ? ` · in ${e.in.length} books` : ''}</small></span></button>`;
    const homeBook = e => (seenNow(e)[0] || {}).b || (e.in.map(x => x.b).sort((a, b) => a.no - b.no)[0]);
    const grid = l => `<div class="sbb-grid">${l.map(card).join('')}</div>`;
    const body = !list.length ? '' : !byBook ? grid(list) : D.books.map(b => { const l = list.filter(e => homeBook(e) === b); return l.length ? `<h3 class="sbb-h sbb-bookh">Book ${b.no}: ${esc(b.title)} <small>${l.length} first seen here</small></h3>${grid(l)}` : ''; }).join('');
    return `<div class="sbb-tools"><input type="search" class="sbb-q" placeholder="Find a ${KIND_ONE[kind]}…" value="${esc(st.q)}" aria-label="Find">${multi ? `<div class="chip-row sbb-grp" role="group" aria-label="Show"><button type="button" class="chip ${byBook ? '' : 'on'}" data-grp="all">All together</button><button type="button" class="chip ${byBook ? 'on' : ''}" data-grp="book">By book</button></div>` : ''}<button type="button" class="btn primary small" data-new="${kind}">+ New ${KIND_ONE[kind]}</button></div>
      ${list.length ? body
        : `<p class="lib-empty">${all.length ? 'Nothing matches.' : `No ${KINDS.find(k => k[0] === kind)[1].toLowerCase()} yet. They come from each book’s ${kind === 'characters' ? 'Characters' : kind === 'places' ? 'Places' : 'Items'} folder, or add one here.`}</p>`}`;
  }
  function gearHTML(e) {
    const rows = [];
    for (const { b, node } of e.in) {
      if (st.asOf != null && b.no * 100000 > st.asOf) continue;
      const cs = node.csheet; if (!cs || typeof cs !== 'object' || !cs.slots || typeof cs.slots !== 'object') continue;
      const pos = new Map(b.chs.map((c, i) => [c.id, i]));
      for (const [slot, list] of Object.entries(cs.slots)) {
        if (!Array.isArray(list)) continue;
        const last = list.filter(x => x && typeof x === 'object' && upto({ b, ci: pos.get(x.ch) ?? -1 })).sort((x, y) => (pos.get(x.ch) ?? -1) - (pos.get(y.ch) ?? -1)).pop();
        if (last && last.name) rows.push({ slot, name: String(last.name).slice(0, 80), rar: last.rar, book: b });
      }
    }
    return rows.length ? `<div class="sbb-gear">${rows.map(r => `<span class="sbb-chip r-${esc(r.rar || 'common')}"><small>${esc(r.slot)}</small> ${esc(r.name)}${st.data.books.length > 1 ? ` <small>· end of Book ${r.book.no}</small>` : ''}</span>`).join('')}</div>` : '';
  }
  function entryHTML(e) {
    if (!e) return '';
    const D = st.data, by = new Map(), seen = seenNow(e);
    for (const s of seen) { if (!by.has(s.b)) by.set(s.b, []); by.get(s.b).push(s.ci); }
    // "often with", counted up to the As of chapter
    const mine = new Set(seen.map(s => s.b.slug + ':' + s.ci));
    const withNow = D.entries.filter(o => o !== e && o.kind === 'characters').map(o => ({ o, n: seenNow(o).filter(s => mine.has(s.b.slug + ':' + s.ci)).length })).filter(x => x.n).sort((a, b) => b.n - a.n).slice(0, 6);
    const missingFrom = D.books.filter(b => !e.in.some(x => x.b === b));
    return `<div class="sbb-ent-page">
      <button type="button" class="link-btn sbb-back" data-back>‹ All ${KINDS.find(k => k[0] === e.kind)[1].toLowerCase()}</button>
      <div class="sbb-hero"><span class="sbb-pic big ${e.img ? '' : 'none'}">${e.img ? `<img src="${esc(e.img)}" alt="">` : esc(e.title.slice(0, 1))}</span>
        <div><h2>${esc(e.title)}</h2>${e.names.length > 1 ? `<p class="sbb-aka">Also found as ${e.names.slice(1).map(n => `<b>${esc(n)}</b>`).join(', ')}</p>` : ''}
        <div class="sbb-acts"><button type="button" class="btn small" data-openin="${esc(e.book.slug)}|${esc(e.node.id)}">Open in ${esc(e.book.title)}</button>
          ${e.kind === 'characters' ? `<button type="button" class="btn small ghost" data-sheet="${esc(e.book.slug)}|${esc(e.node.id)}">Character sheet</button>` : ''}
          ${missingFrom.length ? `<button type="button" class="btn small ghost" data-addto>Add to another book…</button>` : ''}</div></div></div>
      <div class="sbb-cols"><div>
        ${e.sheet.fields.filter(f => f[1]).length ? `<dl class="sbb-fields">${e.sheet.fields.filter(f => f[1]).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}
        ${e.sheet.sections.filter(s => s.p.some(Boolean)).map(s => `<section class="sbb-sec">${s.h ? `<h3>${esc(s.h)}</h3>` : ''}${s.p.filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('')}</section>`).join('')}
        ${!e.sheet.fields.some(f => f[1]) && !e.sheet.sections.some(s => s.p.some(Boolean)) ? '<p class="hint">Nothing written on this page yet. Open it in the book to fill it in.</p>' : ''}
        ${piecesHTML(e)}
        ${factsHTML(e)}
        ${linksHTML(e)}
        ${e.kind === 'characters' && gearHTML(e) ? `<h3 class="sbb-h">Gear</h3>${gearHTML(e)}` : ''}
      </div><aside>
        <h3 class="sbb-h">Appears in <small>${seen.length} chapter${seen.length === 1 ? '' : 's'}${st.asOf != null ? ' so far' : ''}</small></h3>
        ${seen.length ? [...by.entries()].map(([b, cis]) => `<div class="sbb-app">${D.books.length > 1 ? `<b>Book ${b.no}: ${esc(b.title)}</b>` : ''}<div>${cis.map(ci => `<button type="button" class="sbb-chip" data-go="${esc(b.slug)}|${esc(b.chs[ci].id)}" title="${esc(b.chs[ci].title)}">${ci + 1}</button>`).join('')}</div></div>`).join('')
          : `<p class="hint">Not named in a chapter yet. Unwip looks for ${e.names.map(n => `“${esc(n)}”`).join(', ')}. Add other names in an “Aliases” line on the page.</p>`}
        ${seen.length ? `<p class="sbb-fl">First seen <b>${where(seen[0])}</b>, last seen <b>${where(seen[seen.length - 1])}</b>.</p>` : ''}
        ${withNow.length ? `<h3 class="sbb-h">Often with</h3><div class="sbb-with">${withNow.map(w => `<button type="button" class="sbb-chip" data-ent="${esc(w.o.id)}">${esc(w.o.title)} <small>${w.n}</small></button>`).join('')}</div>` : ''}
        <h3 class="sbb-h">In ${e.in.length === 1 ? 'one book' : e.in.length + ' books'}</h3><p class="hint">${e.in.map(x => esc(x.b.title)).join(', ')}${e.in.length > 1 && !e.id.startsWith('s:') ? '. These pages have the same name but aren’t shared, so each book keeps its own.' : ''}</p>
      </aside></div></div>`;
  }
  // facts: by topic, the latest one (up to As of) first, with what it was before; facts with no topic in order
  function factsHTML(e) {
    const F = factsNow(e); if (!F.length) return `<h3 class="sbb-h">Facts</h3><p class="hint">None pinned yet. In a chapter, select the words that say something about ${esc(e.title)} and choose <b>Add to…</b> › The Story Bible.</p>`;
    const topics = new Map(), loose = [];
    for (const f of F) { if (f.topic) { const k = keyName(f.topic); if (!topics.has(k)) topics.set(k, []); topics.get(k).push(f); } else loose.push(f); }
    const chip = f => `<button type="button" class="sbb-chip" data-go="${esc(f.b.slug)}|${esc((f.b.chs[f.ci] || {}).id || '')}" title="${esc((f.b.chs[f.ci] || {}).title || '')}">${where(f)}</button>`;
    const del = f => `<button type="button" class="sbb-fx" data-delfact="${esc(f.b.slug)}|${esc(f.id)}" aria-label="Remove this fact" title="Remove this fact">×</button>`;
    return `<h3 class="sbb-h">Facts <small>${F.length}${st.asOf != null ? ' so far' : ''}</small></h3><div class="sbb-facts">
      ${[...topics.values()].map(l => { const now = l[l.length - 1]; return `<div class="sbb-fact"><span class="sbb-ft">${esc(now.topic)}</span><div><p>${esc(now.text)}</p><div class="sbb-fm">${chip(now)}${del(now)}</div>
        ${l.length > 1 ? `<details class="sbb-was"><summary>Before: ${l.length - 1} earlier</summary>${l.slice(0, -1).reverse().map(f => `<div class="sbb-old"><p>${esc(f.text)}</p><div class="sbb-fm">${chip(f)}${del(f)}</div></div>`).join('')}</details>` : ''}</div></div>`; }).join('')}
      ${loose.map(f => `<div class="sbb-fact"><span class="sbb-ft none"></span><div><p>${esc(f.text)}</p><div class="sbb-fm">${chip(f)}${del(f)}</div></div></div>`).join('')}</div>`;
  }
  // maps and pictures linked to the page (pagelinks.js keeps them on the page as node.build)
  function piecesHTML(e) {
    const idsAll = [...new Set(e.in.flatMap(x => Array.isArray(x.node.build) ? x.node.build : []))];
    const items = (window.UnwipBuild && window.UnwipBuild.items) || [];
    const L = idsAll.map(id => items.find(x => x.id === id)).filter(Boolean);
    if (!L.length) return '';
    return `<h3 class="sbb-h">Maps and pictures <small>${L.length}</small></h3><div class="pg-links">${L.map(it => `<button type="button" class="pg-link" data-lore="${esc(it.id)}"><span class="pg-thumb">${it.thumb ? `<img src="${esc(it.thumb)}" alt="">` : '🗺️'}</span><span class="pg-t"><b>${esc(it.title || 'Untitled')}</b></span></button>`).join('')}</div>`;
  }
  // ---------------------------------------------------------------- relationships
  // A relationship holds from its Since chapter (or the start) and stops at its Until chapter: As of shows who was what
  // to whom at that point (engaged in book one, married in book two). Read from either side: "Parent of" / "Child of".
  const linkOn = l => !l.from || upto(l.from);
  const linkOver = l => !!(l.to && upto(l.to));
  const linkGroup = l => { if (l.type === 'conn') { const t = (l.label || '').toLowerCase(); for (const list of Object.values(REL)) { const d = list.find(x => x[1].toLowerCase() === t || (x[2] || '').toLowerCase() === t); if (d) return d[3]; } return /enem|rival|war|hunt|betray/.test(t) ? 'conflict' : /love|married|partner|engaged/.test(t) ? 'love' : /parent|child|sibling|related|family/.test(t) ? 'family' : /lives|born|rules|guards|near|part of/.test(t) ? 'place' : /owns|made|wants|hidden/.test(t) ? 'thing' : 'ally'; } return (relDef(l.type) || [0, 0, 0, 'other'])[3]; };
  function linkWords(l, me) {
    const d = relDef(l.type), mine = l.a === me;
    if (l.type === 'conn') { const t = mine ? l.label : (l.rlabel || l.label); return esc(t ? t[0].toUpperCase() + t.slice(1) : 'Tied to'); }
    if (!d) return mine ? esc(l.label || 'Tied to') : `${esc(l.label || 'Tied to')} <small>(their side)</small>`;
    return esc(mine ? d[1] : (d[2] || d[1]));
  }
  function linksHTML(e) {
    const L = st.data.links.filter(l => (l.a === e || l.b === e) && linkOn(l));
    const row = l => { const o = l.a === e ? l.b : l.a;
      return `<div class="sbb-link g-${linkGroup(l)} ${linkOver(l) ? 'over' : ''}"><span class="sbb-lk-t">${l.type === 'other' && l.a === e ? esc(l.label || 'Tied to') : linkWords(l, e)}</span>
        <button type="button" class="sbb-chip" data-ent="${esc(o.id)}">${esc(o.title)}</button>
        <small class="sbb-lk-when">${l.from ? `from ${where(l.from)}` : ''}${l.to && upto(l.to) ? `${l.from ? ', ' : ''}until ${where(l.to)}` : ''}</small>
        ${l.note ? `<span class="sbb-lk-note">${esc(l.note)}</span>` : ''}
        <button type="button" class="sbb-fx" data-dellink="${esc(l.book.slug)}|${esc(l.id)}" aria-label="Remove this relationship" title="Remove">×</button></div>`; };
    const now = L.filter(l => !linkOver(l)), before = L.filter(linkOver);
    return `<h3 class="sbb-h">Relationships ${L.length ? `<small>${now.length}${st.asOf != null ? ' at this point' : ''}</small>` : ''}</h3>
      ${now.length ? `<div class="sbb-links">${now.map(row).join('')}</div>` : `<p class="hint">${L.length ? 'None that still hold.' : `Who ${esc(e.title)} is tied to: family, love, allies, enemies, where they live, what they carry.`}</p>`}
      ${before.length ? `<div class="sbb-links sbb-links-before"><span class="sbb-before-h">Before</span>${before.map(row).join('')}</div>` : ''}
      <button type="button" class="btn small ghost sbb-addlink" data-newlink>+ Relationship</button>`;
  }
  async function newLink(e) {
    if (phone() || !e) return;
    const D = st.data, others = D.entries.filter(o => o !== e);
    if (!others.length) { U.toast('Add another person, place or thing first.'); return; }
    const multi = D.books.length > 1;
    const chOpts = first => `<option value="">${first}</option>` + D.books.map(b => `<optgroup label="${multi ? `Book ${b.no}: ` : ''}${esc(b.title)}">${b.chs.map((c, ci) => `<option value="${esc(c.id)}">${multi ? `Book ${b.no} · ` : ''}Ch ${ci + 1}: ${esc(c.title)}</option>`).join('')}</optgroup>`).join('');
    const body = document.createElement('div'); body.className = 'sbb-add';
    body.innerHTML = `<div class="sbb-add-row"><div class="field"><label>${esc(e.title)} is</label><select id="sbb-ltype"></select></div>
        <div class="field"><label>Who or what</label><select id="sbb-lwith">${KINDS.map(([k, t]) => { const l = others.filter(o => o.kind === k).sort((a, b) => a.title.localeCompare(b.title)); return l.length ? `<optgroup label="${t}">${l.map(o => `<option value="${esc(o.id)}">${esc(o.title)}</option>`).join('')}</optgroup>` : ''; }).join('')}</select></div></div>
      <div class="field" id="sbb-lother" hidden><label>In your own words</label><input type="text" id="sbb-llabel" maxlength="40" placeholder="e.g. Sworn to protect"></div>
      <div class="sbb-add-row"><div class="field"><label>Since</label><select id="sbb-lfrom">${chOpts('The start')}</select></div><div class="field"><label>Until</label><select id="sbb-lto">${chOpts('Still so')}</select></div></div>
      <div class="field"><label>Note <small>(optional)</small></label><input type="text" id="sbb-lnote" maxlength="300" placeholder="e.g. Secretly"></div>
      <p class="hint">Since and Until make As of honest: engaged in book one, married in book two, and nothing shown before it happens.</p>`;
    const typeSel = body.querySelector('#sbb-ltype'), withSel = body.querySelector('#sbb-lwith'), other = body.querySelector('#sbb-lother');
    const choices = () => {
      const o = D.entries.find(x => x.id === withSel.value); if (!o) return [];
      const out = [], fwd = REL[e.kind + '>' + o.kind], back = REL[o.kind + '>' + e.kind];
      if (fwd) for (const d of fwd) out.push([d[0] + '|f', d[1], d[3]]);
      else if (back) for (const d of back) out.push([d[0] + '|r', d[2] || d[1], d[3]]);
      for (const d of REL.any) out.push([d[0] + '|f', d[1], d[3]]);
      out.push(['other|f', 'Something else…', 'other']);
      return out;
    };
    const fill = () => {
      const keep = typeSel.value, c = choices(), groups = [...new Set(c.map(x => x[2]))];
      typeSel.innerHTML = groups.map(g => `<optgroup label="${REL_GROUPS[g]}">${c.filter(x => x[2] === g).map(x => `<option value="${x[0]}">${esc(x[1])}</option>`).join('')}</optgroup>`).join('');
      if (c.some(x => x[0] === keep)) typeSel.value = keep;
      other.hidden = typeSel.value !== 'other|f';
    };
    withSel.onchange = fill; typeSel.onchange = () => { other.hidden = typeSel.value !== 'other|f'; };
    const same = others.find(o => o.kind === e.kind); if (same) withSel.value = same.id;
    fill();
    const ok = await U.modal({ title: `Relationship: ${esc(e.title)}`, body, wide: true, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Add', value: true, kind: 'primary' }] });
    if (!ok) return;
    const o = D.entries.find(x => x.id === withSel.value); if (!o) return;
    const [type, dir] = typeSel.value.split('|'), label = type === 'other' ? norm(body.querySelector('#sbb-llabel').value).slice(0, 40) : '';
    if (type === 'other' && !label) { U.toast('Say in a few words what ties them.'); return; }
    let from = body.querySelector('#sbb-lfrom').value, to = body.querySelector('#sbb-lto').value;
    const pos = id => { for (const b of D.books) { const i = b.chs.findIndex(c => c.id === id); if (i >= 0) return b.no * 100000 + i; } return -1; };
    if (from && to && pos(to) <= pos(from)) { U.toast('Until has to come after Since. It’s saved without an Until.'); to = ''; }
    const [a, b] = dir === 'r' ? [o, e] : [e, o];
    const ref = x => ({ node: x.node.id, key: x.id.startsWith('s:') ? x.id.slice(2) : '', kind: x.kind, title: x.title });
    const home = (from && D.books.find(bk => bk.chs.some(c => c.id === from))) || e.book;   // kept in the book it starts in
    const note = norm(body.querySelector('#sbb-lnote').value).slice(0, 300);
    // both pages in that book: it goes in the book's own Connections (so the page's strip shows it too); otherwise
    // (a person shared across books with someone only in another) it's kept in the bible's list
    const na = a.in.find(x => x.b === home), nb = b.in.find(x => x.b === home);
    if (na && nb) {
      const d0 = relDef(type), f = type === 'other' ? label : (d0 ? d0[1] : label).toLowerCase(), r = type === 'other' ? '' : d0 && d0[2] ? d0[2].toLowerCase() : '';
      await editBook(home.slug, p => { p.links = Array.isArray(p.links) ? p.links : []; p.links.push({ a: na.node.id, b: nb.node.id, f, ...(r ? { r } : {}), id: U.uid(), type, ch: from, end: to, note, at: Date.now() }); });
    } else await editBible(home.slug, bb => { bb.links = Array.isArray(bb.links) ? bb.links : []; bb.links.push({ id: U.uid(), a: ref(a), b: ref(b), type, label, ch: from, end: to, note, at: Date.now() }); });
  }
  // the Web: everyone with a relationship, drawn as a map of who is tied to whom (at the As of chapter). The layout is
  // worked out the same way every time (a fixed start, then springs), so it doesn't jump about between visits.
  function webHTML() {
    const D = st.data, L = D.links.filter(linkOn);
    if (!L.length) return `<p class="lib-empty">No relationships ${st.asOf != null ? 'yet at this point' : 'yet'}. Open a person, place or thing and choose <b>+ Relationship</b>: who they’re married to, who they serve, where they live, what they carry. They show here as a web.</p>`;
    const N = [...new Set(L.flatMap(l => [l.a, l.b]))].sort((x, y) => KINDS.findIndex(k => k[0] === x.kind) - KINDS.findIndex(k => k[0] === y.kind) || x.title.localeCompare(y.title));
    const W = 960, H = Math.max(420, Math.min(900, 200 + N.length * 28)), idx = new Map(N.map((n, i) => [n, i]));
    const P = N.map((n, i) => { const a = i / N.length * Math.PI * 2; return { x: W / 2 + Math.cos(a) * W * 0.32, y: H / 2 + Math.sin(a) * H * 0.34, vx: 0, vy: 0 }; });
    const E2 = L.map(l => [idx.get(l.a), idx.get(l.b)]);
    for (let it = 0; it < 360; it++) {
      const k = 1 - it / 360;
      for (let i = 0; i < N.length; i++) for (let j = i + 1; j < N.length; j++) {
        let dx = P[i].x - P[j].x, dy = P[i].y - P[j].y, d2 = dx * dx + dy * dy + 0.01; const f = 9000 / d2, d = Math.sqrt(d2);
        dx /= d; dy /= d; P[i].vx += dx * f; P[i].vy += dy * f; P[j].vx -= dx * f; P[j].vy -= dy * f;
      }
      for (const [i, j] of E2) { const dx = P[j].x - P[i].x, dy = P[j].y - P[i].y, d = Math.sqrt(dx * dx + dy * dy) + 0.01, f = (d - 210) * 0.02; P[i].vx += dx / d * f; P[i].vy += dy / d * f; P[j].vx -= dx / d * f; P[j].vy -= dy / d * f; }
      // keep people off other people's lines (a line through someone reads as if they were part of it)
      if (N.length * E2.length < 30000) for (const [i, j] of E2) { const a = P[i], b = P[j], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
        for (let m = 0; m < N.length; m++) { if (m === i || m === j) continue; const q = P[m], t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / L2)), px = a.x + dx * t - q.x, py = a.y + dy * t - q.y, d = Math.sqrt(px * px + py * py) + 0.01;
          if (d < 60) { const f = (60 - d) * 0.25; q.vx -= px / d * f; q.vy -= py / d * f; a.vx += px / d * f * 0.3; a.vy += py / d * f * 0.3; b.vx += px / d * f * 0.3; b.vy += py / d * f * 0.3; } } }
      for (const p of P) { p.vx += (W / 2 - p.x) * 0.004; p.vy += (H / 2 - p.y) * 0.006; p.x += Math.max(-20, Math.min(20, p.vx * k)); p.y += Math.max(-20, Math.min(20, p.vy * k)); p.vx *= 0.5; p.vy *= 0.5; p.x = Math.max(60, Math.min(W - 60, p.x)); p.y = Math.max(40, Math.min(H - 50, p.y)); }
    }
    // spread the result over the picture (but don't blow two people up to opposite corners)
    { const xs = P.map(p => p.x), ys = P.map(p => p.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const sx = Math.min(2.4, (W - 200) / Math.max(1, x1 - x0)), sy = Math.min(2.4, (H - 130) / Math.max(1, y1 - y0)), k = Math.min(sx, sy * 1.6);
      for (const p of P) { p.x = W / 2 + (p.x - (x0 + x1) / 2) * k; p.y = H / 2 - 10 + (p.y - (y0 + y1) / 2) * Math.min(k, sy); } }
    const R = 22, ini = t => esc(t.split(/\s+/).map(w => w[0] || '').join('').slice(0, 2).toUpperCase());
    // two relationships between the same pair are bent apart so both labels read
    const pairN = new Map();
    const edges = L.map(l => {
      const i = idx.get(l.a), j = idx.get(l.b), key = [Math.min(i, j), Math.max(i, j)].join('-'), n = pairN.get(key) || 0; pairN.set(key, n + 1);
      const a = P[i], b = P[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / d, uy = dy / d;
      const bend = n ? (n % 2 ? 1 : -1) * Math.ceil(n / 2) * 56 : 0, mx = (a.x + b.x) / 2 - uy * bend, my = (a.y + b.y) / 2 + ux * bend;
      const x1 = a.x + ux * R, y1 = a.y + uy * R, x2 = b.x - ux * (R + 4), y2 = b.y - uy * (R + 4);
      const d0 = relDef(l.type), dir = d0 ? !!d0[2] : l.type === 'other' || (l.type === 'conn' && !!l.rlabel && l.rlabel !== l.label);
      const word = l.type === 'other' || l.type === 'conn' ? (l.label || 'Tied to') : d0 ? d0[1] : 'Tied to';
      return `<g class="sbb-we g-${linkGroup(l)} ${linkOver(l) ? 'over' : ''}"><path d="M${x1.toFixed(1)},${y1.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}" ${dir ? `marker-end="url(#sbb-ar-${linkGroup(l)})"` : ''}/><text x="${((x1 + x2) / 2 * 0.5 + mx * 0.5).toFixed(1)}" y="${((y1 + y2) / 2 * 0.5 + my * 0.5 - 4).toFixed(1)}">${esc(word)}</text></g>`;
    });
    const nodes = N.map((n, i) => { const p = P[i], shape = n.kind === 'places' ? `<rect x="${(p.x - R).toFixed(1)}" y="${(p.y - R).toFixed(1)}" width="${R * 2}" height="${R * 2}" rx="7"/>` : n.kind === 'items' ? `<path d="M${p.x.toFixed(1)},${(p.y - R - 3).toFixed(1)} L${(p.x + R + 3).toFixed(1)},${p.y.toFixed(1)} L${p.x.toFixed(1)},${(p.y + R + 3).toFixed(1)} L${(p.x - R - 3).toFixed(1)},${p.y.toFixed(1)} Z"/>` : `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${R}"/>`;
      return `<g class="sbb-wn k-${n.kind}" data-ent="${esc(n.id)}" tabindex="0" role="button" aria-label="${esc(n.title)}">${shape}<text class="ini" x="${p.x.toFixed(1)}" y="${(p.y + 5).toFixed(1)}">${ini(n.title)}</text><text class="nm" x="${p.x.toFixed(1)}" y="${(p.y + R + 16).toFixed(1)}">${esc(n.title)}</text></g>`; });
    const groups = [...new Set(L.map(linkGroup))];
    return `<p class="hint">Everyone with a relationship${st.asOf != null ? ', as things stood at this chapter' : ''}. Click a name to open their page. Dashed lines are ones that had ended by then.</p>
      <div class="sbb-web-legend">${groups.map(g => `<span class="g-${g}"><i></i>${REL_GROUPS[g]}</span>`).join('')}</div>
      <div class="sbb-web-wrap"><svg class="sbb-web" viewBox="0 0 ${W} ${H}" role="img" aria-label="Relationships"><defs>${Object.keys(REL_GROUPS).map(g => `<marker id="sbb-ar-${g}" class="g-${g}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker>`).join('')}</defs>${edges.join('')}${nodes.join('')}</svg></div>`;
  }
  async function deleteFact(slug, id) {
    if (phone()) return;   // read only on a phone
    if (!(await U.confirmBox('Remove this fact?', 'It comes out of the Story Bible. The chapter itself doesn’t change.', 'Remove'))) return;
    const p = await api.openProject(slug); if (!p || !p.bible || !Array.isArray(p.bible.facts)) return;
    p.bible.facts = p.bible.facts.filter(f => f && f.id !== id);
    await api.saveProjectMeta(slug, p);
    const keep = { tab: st.tab, sel: st.sel, asOf: st.asOf }; st.data = await load(st.target); Object.assign(st, keep); draw();
  }
  // ---------------------------------------------------------------- threads: set-ups waiting for a pay-off
  // As of a chapter: threads set up later are hidden, and one paid off later still shows as open.
  function threadsHTML() {
    const D = st.data, T = D.threads.filter(upto);
    // a pay-off after the As of chapter hasn't happened yet, so that thread still shows as open
    const statusNow = t => t.status === 'paid' ? (t.closed && upto(t.closed) ? 'paid' : 'open') : t.status;
    const lastCh = st.asOf != null ? st.asOf : Math.max(0, ...D.books.map(b => b.no * 100000 + Math.max(0, b.chs.length - 1)));
    const chapGap = t => { let n = 0; for (const b of D.books) b.chs.forEach((c, i) => { const g = b.no * 100000 + i; if (g > gp(t) && g <= lastCh) n++; }); return n; };
    const card = t => { const s = statusNow(t), ch = t.b.chs[t.ci];
      return `<div class="sbb-thread ${s}"><div class="sbb-th-main"><b>${esc(t.title)}</b>${t.note ? `<p>${esc(t.note)}</p>` : ''}
        <div class="sbb-fm"><span class="sbb-th-when">Set up</span>${ch ? `<button type="button" class="sbb-chip" data-go="${esc(t.b.slug)}|${esc(ch.id)}">${where(t)}</button>` : ''}
        ${s === 'paid' && t.closed ? `<span class="sbb-th-when">paid off</span><button type="button" class="sbb-chip" data-go="${esc(t.closed.b.slug)}|${esc(t.closed.b.chs[t.closed.ci].id)}">${where(t.closed)}</button>` : ''}
        ${s === 'open' ? `<span class="sbb-th-age">open for ${chapGap(t)} chapter${chapGap(t) === 1 ? '' : 's'}</span>` : ''}</div></div>
        <div class="sbb-th-acts">${s === 'open' ? `<button type="button" class="btn small" data-paid="${esc(t.b.slug)}|${esc(t.id)}">Paid off…</button><button type="button" class="btn small ghost" data-drop="${esc(t.b.slug)}|${esc(t.id)}">Drop</button>` : `<button type="button" class="btn small ghost" data-reopen="${esc(t.b.slug)}|${esc(t.id)}">Open again</button>`}
          <button type="button" class="sbb-fx" data-delthread="${esc(t.b.slug)}|${esc(t.id)}" aria-label="Remove this thread" title="Remove this thread">×</button></div></div>`; };
    const open = T.filter(t => statusNow(t) === 'open'), paid = T.filter(t => statusNow(t) === 'paid'), dropped = T.filter(t => statusNow(t) === 'dropped');
    return `<div class="sbb-tools"><p class="hint sbb-grow">A thread is something set up that the reader will expect to be paid off: a locked door, a promise, a prophecy, a gun on the wall. In a chapter, select the words that set it up and choose <b>Add to…</b> › The Story Bible › Plot thread.</p><button type="button" class="btn primary small" data-newthread>+ New thread</button></div>
      ${T.length ? `<h3 class="sbb-h">Open <small>${open.length}</small></h3>${open.map(card).join('') || '<p class="hint">Nothing waiting for a pay-off.</p>'}
        ${paid.length ? `<h3 class="sbb-h">Paid off <small>${paid.length}</small></h3>${paid.map(card).join('')}` : ''}
        ${dropped.length ? `<h3 class="sbb-h">Dropped <small>${dropped.length}</small></h3>${dropped.map(card).join('')}` : ''}` : '<p class="lib-empty">No threads yet.</p>'}`;
  }
  // edit one book's bible data: the book's project.json is read, changed and saved (the book needn't be open)
  // the same for anything else in a book's project.json (its Connections)
  async function editBook(slug, fn) {
    if (phone()) return;
    const open = U.S.slug === slug && U.S.project;
    const p = open ? U.S.project : await api.openProject(slug); if (!p) return;
    fn(p);
    if (open) { U.scheduleMeta(); if (window.UnwipLinks && window.UnwipLinks.render) try { window.UnwipLinks.render(); } catch {} } else await api.saveProjectMeta(slug, p);
    if (st && st.data) { const keep = { tab: st.tab, sel: st.sel, asOf: st.asOf }; st.data = await load(st.target); Object.assign(st, keep); draw(); }
  }
  async function editBible(slug, fn) {
    if (phone()) return;   // read only on a phone
    const open = U.S.slug === slug && U.S.project;
    const p = open ? U.S.project : await api.openProject(slug); if (!p) return;
    p.bible = p.bible && typeof p.bible === 'object' ? p.bible : {};
    fn(p.bible);
    if (open) U.scheduleMeta(); else await api.saveProjectMeta(slug, p);
    if (st && st.data) { const keep = { tab: st.tab, sel: st.sel, asOf: st.asOf }; st.data = await load(st.target); Object.assign(st, keep); draw(); }
  }
  const findIn = (list, id) => (Array.isArray(list) ? list : []).find(x => x && x.id === id);
  function chapterPicker(label, sel) {
    const D = st.data, multi = D.books.length > 1;
    return `<div class="field"><label>${label}</label><select class="sbb-chpick">${D.books.map(b => `<optgroup label="${multi ? `Book ${b.no}: ` : ''}${esc(b.title)}">${b.chs.map((c, ci) => `<option value="${esc(b.slug)}|${esc(c.id)}" ${sel === c.id ? 'selected' : ''}>${multi ? `Book ${b.no} · ` : ''}Ch ${ci + 1}: ${esc(c.title)}</option>`).join('')}</optgroup>`).join('')}</select></div>`;
  }
  async function newThread() {
    const D = st.data; if (!D.books.some(b => b.chs.length)) { U.toast('Write a chapter first: a thread is set up in a chapter.'); return; }
    const body = document.createElement('div'); body.className = 'sbb-add';
    const lastBook = [...D.books].reverse().find(b => b.chs.length);
    body.innerHTML = `<div class="field"><label>What was set up</label><input type="text" id="sbb-ttitle" maxlength="120" placeholder="e.g. The locked door in the cellar"></div>
      <div class="field"><label>Note <small>(optional)</small></label><textarea id="sbb-tnote" rows="2" maxlength="600" placeholder="What the reader now expects"></textarea></div>${chapterPicker('Set up in', lastBook.chs[lastBook.chs.length - 1].id)}`;
    const ok = await U.modal({ title: 'New plot thread', body, wide: true, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Add', value: true, kind: 'primary' }], onOpen: back => setTimeout(() => back.querySelector('#sbb-ttitle').focus(), 50) });
    const title = ok ? norm(body.querySelector('#sbb-ttitle').value).slice(0, 120) : ''; if (!title) return;
    const [slug, ch] = body.querySelector('.sbb-chpick').value.split('|');
    await editBible(slug, bb => { bb.threads = Array.isArray(bb.threads) ? bb.threads : []; bb.threads.push({ id: U.uid(), title, note: norm(body.querySelector('#sbb-tnote').value).slice(0, 600), open: ch, closed: null, status: 'open', at: Date.now() }); });
  }
  async function payOff(slug, id) {
    if (phone()) return;   // read only on a phone
    const body = document.createElement('div'); body.className = 'sbb-add';
    body.innerHTML = chapterPicker('Paid off in', null) + '<p class="hint">The chapter where the reader gets what was promised.</p>';
    const ok = await U.modal({ title: 'Paid off', body, wide: true, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Save', value: true, kind: 'primary' }] });
    if (!ok) return; const ch = body.querySelector('.sbb-chpick').value.split('|')[1];
    await editBible(slug, bb => { const t = findIn(bb.threads, id); if (t) { t.status = 'paid'; t.closed = ch; } });
  }

  // ---------------------------------------------------------------- glossary: the world's words, spelled the same everywhere
  const STOP = new Set(('a about above after again against all am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves ill ive id youre youd youll hed hes shed shes theyre theyd theyll weve wed wont dont didnt doesnt cant couldnt wouldnt shouldnt isnt wasnt werent hasnt havent hadnt mr mrs ms dr st shall whilst amongst upon unto thee thou thy thine hath doth ere nay aye ' + 'arose awoke bore beat became began bent bet bit bled blew broke brought built burnt bought caught chose clung came cost crept dealt dug drew dreamt drank drove ate fell fed felt fought found fled flung flew forbade forgot forgave froze got gave went ground grew hung heard hid hit held hurt kept knelt knew laid led leant leapt learnt left lent lay lit lost made meant met paid put quit read rode rang rose ran said saw sought sold sent set shook shed shone shot showed shrank shut sang sank sat slept slid slung smelt spoke sped spent spilt spun spat split spread sprang stood stole stuck stung stank strode struck strove swore swept swam swung took taught tore told thought threw thrust trod understood woke wore wove wept won wound wrung wrote arisen awoken borne beaten become begun bitten blown broken chosen done drawn drunk driven eaten fallen forbidden forgotten forgiven frozen gotten given gone grown hidden known lain ridden risen run seen shaken shown shrunk sung sunk slain spoken sprung stolen stridden striven sworn swollen swum taken torn thrown trodden woken worn woven written').split(' '));
  let VOCAB = null;
  const fold = w => w.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');   // calèche and caleche are the same word
  const levenshtein = (a, b) => { if (Math.abs(a.length - b.length) > 2) return 3; const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
  async function glossaryHTML() {
    const D = st.data, W = window.UnwipWords;
    let dict = null; try { if (W) { await W.load(); dict = window.UnwipWordData; } } catch {}
    // known words: the dictionary's own words, every word its definitions use (that covers came, without, shall…),
    // and British spellings of either (harbour, centre, realise, analyse, catalogue)
    if (dict && !VOCAB) { VOCAB = new Set(); for (const sense of dict.s || []) for (const m of String(sense[1] || '').toLowerCase().matchAll(/[a-z]+(?:'[a-z]+)?/g)) VOCAB.add(m[0]); }
    const inDict = k => { if (dict.w[k] || VOCAB.has(k)) return true; try { const b = W._base(k); return !!(b && (dict.w[b] || VOCAB.has(b))); } catch { return false; } };
    const BRIT = [[/our(s?)$/, 'or$1'], [/re(s?)$/, 'er$1'], [/is(e|es|ed|ing|ation)$/, 'iz$1'], [/ys(e|es|ed|ing)$/, 'yz$1'], [/ogue(s?)$/, 'og$1'], [/ence(s?)$/, 'ense$1'], [/ll(ed|ing|er)$/, 'l$1']];
    const known = w => { if (!dict) return true; const k = w.toLowerCase().replace(/[’]/g, "'"); if (STOP.has(k.replace(/'/g, ''))) return true; if (inDict(k)) return true; for (const [re, to] of BRIT) if (re.test(k) && inDict(k.replace(re, to))) return true; return false; };
    // every word in the chapters (up to As of), where it's first used and how often
    const count = new Map();
    for (const b of D.books) b.chs.forEach((c, ci) => { if (!upto({ b, ci })) return; for (const m of (c.text || '').matchAll(/\p{L}[\p{L}’'-]*\p{L}/gu)) { const w = m[0].replace(/[’']s$/, ''); if (w.length < 4) continue; const k = fold(w); const x = count.get(k) || { w, n: 0, first: { b, ci }, caps: 0 }; x.n++; if (/^\p{Lu}/u.test(w)) x.caps++; count.set(k, x); } });
    const names = new Set(D.entries.flatMap(e => e.names.flatMap(n => [keyName(n), ...n.split(/\s+/).map(keyName)])));
    const terms = D.glossary, termKeys = new Set(terms.map(t => fold(t.term)));
    const sugg = [...count.values()].filter(x => x.n >= 3 && !termKeys.has(fold(x.w)) && !names.has(x.w.toLowerCase()) && !known(x.w)).sort((a, b) => b.n - a.n);
    // capitalised almost every time: names and invented words, the likeliest glossary entries
    const capsSugg = sugg.filter(x => x.caps >= x.n * 0.8).slice(0, 30), lowSugg = sugg.filter(x => x.caps < x.n * 0.8).slice(0, 20);
    // misspellings: words a letter or two away from a glossary word or a name, not in the dictionary, used rarely
    const targets = [...terms.map(t => t.term), ...D.entries.flatMap(e => e.names)].filter(t => t.length >= 5 && !/\s/.test(t));
    const near = [];
    for (const x of count.values()) {
      if (x.n > 3 || known(x.w)) continue;
      const lw = fold(x.w);
      for (const t of targets) { const lt = fold(t); if (lw === lt || lw[0] !== lt[0]) continue; const d = levenshtein(lw, lt); if (d === 1 || (d === 2 && lt.length >= 8)) { near.push({ x, t }); break; } }
    }
    const used = t => count.get(fold(t.term)) || null;
    const chipGo = f => `<button type="button" class="sbb-chip" data-go="${esc(f.b.slug)}|${esc(f.b.chs[f.ci].id)}">${where(f)}</button>`;
    return `<div class="sbb-tools"><p class="hint sbb-grow">The words of your world: invented names, ranks, foods, curses. Their spelling is checked in every chapter${dict ? '' : ' (the word list couldn’t load, so suggestions are off)'}.</p><button type="button" class="btn primary small" data-newterm>+ New word</button></div>
      ${terms.length ? `<div class="sbb-gloss">${terms.map(t => { const u = used(t); return `<div class="sbb-term"><b>${esc(t.term)}</b><p>${t.meaning ? esc(t.meaning) : '<span class="hint">No meaning written yet.</span>'}</p><div class="sbb-fm">${u ? `<small>${u.n} time${u.n === 1 ? '' : 's'}, first</small>${chipGo(u.first)}` : '<small>Not in a chapter yet</small>'}<button type="button" class="sbb-fx" data-editterm="${esc(t.b.slug)}|${esc(t.id)}" aria-label="Change" title="Change">✎</button><button type="button" class="sbb-fx" data-delterm="${esc(t.b.slug)}|${esc(t.id)}" aria-label="Remove" title="Remove">×</button></div></div>`; }).join('')}</div>` : '<p class="hint">No words yet. Add one, or pick from the suggestions below.</p>'}
      ${near.length ? `<h3 class="sbb-h">Possible misspellings <small>${near.length}</small></h3><div class="sbb-near">${near.slice(0, 40).map(({ x, t }) => `<div class="sbb-near-row"><span><b>${esc(x.w)}</b> <small>looks like</small> <b>${esc(t)}</b></span>${chipGo(x.first)}</div>`).join('')}</div>` : ''}
      ${phone() ? '' : `${capsSugg.length ? `<h3 class="sbb-h">Names and invented words <small>not in the dictionary, used 3 times or more</small></h3><div class="sbb-with">${capsSugg.map(x => `<button type="button" class="sbb-chip" data-suggest="${esc(x.w)}">${esc(x.w)} <small>${x.n}</small></button>`).join('')}</div>` : ''}
      ${lowSugg.length ? `<h3 class="sbb-h">Other words not in Unwip’s word list</h3><div class="sbb-with">${lowSugg.map(x => `<button type="button" class="sbb-chip" data-suggest="${esc(x.w)}">${esc(x.w)} <small>${x.n}</small></button>`).join('')}</div>` : ''}
      ${capsSugg.length || lowSugg.length ? '<p class="hint">Click one to add it to the glossary. Unwip’s word list is a short one, so some ordinary words turn up here too.</p>' : ''}`}`;
  }
  async function termDialog(slug, g) {
    if (phone()) return;   // read only on a phone
    const D = st.data, body = document.createElement('div'); body.className = 'sbb-add';
    body.innerHTML = `<div class="field"><label>Word</label><input type="text" id="sbb-gterm" maxlength="60" value="${esc(g ? g.term : '')}"></div>
      <div class="field"><label>Meaning <small>(optional)</small></label><textarea id="sbb-gmean" rows="3" maxlength="600">${esc(g ? g.meaning : '')}</textarea></div>
      ${!g && D.books.length > 1 ? `<div class="field"><label>Keep it with</label><select id="sbb-gbook">${D.books.map(b => `<option value="${esc(b.slug)}">Book ${b.no}: ${esc(b.title)}</option>`).join('')}</select></div>` : ''}`;
    const ok = await U.modal({ title: g && g.id ? 'Change word' : 'New word', body, wide: true, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Save', value: true, kind: 'primary' }], onOpen: back => setTimeout(() => back.querySelector(g && g.term ? '#sbb-gmean' : '#sbb-gterm').focus(), 50) });
    const term = ok ? norm(body.querySelector('#sbb-gterm').value).slice(0, 60) : ''; if (!term) return;
    const meaning = norm(body.querySelector('#sbb-gmean').value).slice(0, 600);
    const target = g && g.id ? slug : (body.querySelector('#sbb-gbook') || {}).value || slug || D.books[0].slug;
    await editBible(target, bb => { bb.glossary = Array.isArray(bb.glossary) ? bb.glossary : []; const x = g && g.id && findIn(bb.glossary, g.id); if (x) { x.term = term; x.meaning = meaning; x.at = Date.now(); } else bb.glossary.push({ id: U.uid(), term, meaning, at: Date.now() }); });
  }
  function wireGloss(box) {
    if (phone()) box.querySelectorAll(EDITS).forEach(x => x.remove());
    $$('[data-go]', box).forEach(b => b.onclick = () => { const [slug, id] = b.dataset.go.split('|'); goTo(slug, id); });
    const nt = box.querySelector('[data-newterm]'); if (nt) nt.onclick = () => termDialog(st.data.books[0].slug, null);
    $$('[data-suggest]', box).forEach(b => b.onclick = () => termDialog(st.data.books[0].slug, { term: b.dataset.suggest, meaning: '' }));
    $$('[data-editterm]', box).forEach(b => b.onclick = () => { const [slug, id] = b.dataset.editterm.split('|'); const g = st.data.glossary.find(x => x.id === id && x.b.slug === slug); if (g) termDialog(slug, g); });
    $$('[data-delterm]', box).forEach(b => b.onclick = async () => { const [slug, id] = b.dataset.delterm.split('|'); if (await U.confirmBox('Remove this word?', 'It comes out of the glossary. Your chapters don’t change.', 'Remove')) editBible(slug, bb => { bb.glossary = (bb.glossary || []).filter(x => x && x.id !== id); }); });
  }
  function timelineHTML() {
    const D = st.data, rows = [];
    for (const b of D.books) {
      const T = b.p.timeline || {}, ev = (T.events || []).filter(x => x && x.title && (st.asOf == null || (x.chapterId && upto({ b, ci: b.chs.findIndex(c => c.id === x.chapterId) }) && b.chs.some(c => c.id === x.chapterId))));
      const chName = id => { const i = b.chs.findIndex(c => c.id === id); return i >= 0 ? `Ch ${i + 1}` : ''; };
      if (ev.length) rows.push(`<div class="sbb-tl-book"><h3 class="sbb-h">${D.books.length > 1 ? `Book ${b.no}: ` : ''}${esc(b.title)}${T.calendar && T.calendar.on ? ` <small>${esc(T.calendar.name || 'own calendar')}</small>` : ''}</h3>
        ${ev.slice().sort((x, y) => String(x.date || x.day || '').localeCompare(String(y.date || y.day || ''), undefined, { numeric: true })).map(x => `<div class="sbb-tl-row"><span class="sbb-tl-when">${esc(x.date || (x.day != null ? 'Day ' + x.day : 'No date'))}</span><span class="sbb-tl-dot" style="background:${esc(x.color || '#888')}"></span><span><b>${esc(x.title)}</b>${(x.chars || []).length ? ` <small>${esc(x.chars.join(', '))}</small>` : ''}${x.note ? `<em>${esc(x.note)}</em>` : ''}</span>${x.chapterId && chName(x.chapterId) ? `<button type="button" class="sbb-chip" data-go="${esc(b.slug)}|${esc(x.chapterId)}">${chName(x.chapterId)}</button>` : ''}</div>`).join('')}</div>`);
    }
    return rows.join('') || '<p class="lib-empty">No timeline events yet. Add them in a book’s Timeline (Detail level).</p>';
  }
  async function loreHTML() {
    const B = window.UnwipBuild; if (!B) return '';
    try { await B.refresh(); } catch {}
    const items = (B.items || []).filter(x => LORE[x.kind]);
    const groups = Object.keys(LORE).map(k => [k, items.filter(x => x.kind === k)]).filter(([, l]) => l.length);
    return groups.length ? `<p class="hint">Open World and Build pieces belong to the world, so every book can use them.</p>${groups.map(([k, l]) => `<h3 class="sbb-h">${LORE[k]}</h3><div class="sbb-lore">${l.map(x => `<button type="button" class="sbb-lore-it" data-lore="${esc(x.id)}"><span>${x.thumb ? `<img src="${esc(x.thumb)}" alt="">` : ''}</span><b>${esc(x.title || 'Untitled')}</b></button>`).join('')}</div>`).join('')}`
      : '<p class="lib-empty">No magic systems, runes, sigils, insignia or maps yet. Make them in Open World and Build.</p>';
  }
  function wireLore(box) { $$('[data-lore]', box).forEach(b => b.onclick = async () => { const id = b.dataset.lore; last = { target: st.target, tab: st.tab, sel: st.sel, asOf: st.asOf }; close(); const isLore = ['magic', 'runes', 'sigil', 'insignia'].includes(((window.UnwipBuild.items || []).find(x => x.id === id) || {}).kind); if (window.UnwipPlay) window.UnwipPlay.setTab(isLore && !phone() ? 'world' : 'build'); await window.UnwipBuild.open(id, 'bible'); }); }
  // On a phone (up to 720 px wide) the bible is for reading: everything that changes it comes out of the page, and the
  // edit functions refuse too. iPads and bigger keep all of it.
  const EDITS = '[data-new], [data-addto], [data-newthread], [data-newterm], [data-editterm], [data-delterm], [data-delfact], [data-delthread], [data-paid], [data-drop], [data-reopen], [data-bmv], [data-series], [data-suggest], [data-rm], [data-newlink], [data-dellink], [data-bmore], [data-endseries]';
  function wire() {
    const D = st.data;
    page.classList.toggle('sbb-ro', phone());
    if (phone()) { page.querySelectorAll(EDITS).forEach(x => x.remove()); const t = page.querySelector('.sbb-title'); if (t && !t.querySelector('.sbb-ro-tag')) t.insertAdjacentHTML('beforeend', '<span class="sbb-ro-tag">Read only on a phone</span>'); }
    page.querySelector('[data-close]').onclick = close;
    $$('[data-tab]', page).forEach(b => b.onclick = () => { st.tab = b.dataset.tab; st.sel = null; st.q = ''; draw(); });
    $$('[data-ent]', page).forEach(b => b.onclick = () => { st.sel = b.dataset.ent; const e = D.entries.find(x => x.id === st.sel); if (e) st.tab = e.kind; draw(); page.scrollTop = 0; });
    const back = page.querySelector('[data-back]'); if (back) back.onclick = () => { st.sel = null; draw(); };
    const q = page.querySelector('.sbb-q'); if (q) q.oninput = () => { st.q = q.value; const pos = q.selectionStart; draw(); const n = page.querySelector('.sbb-q'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } };
    $$('[data-go]', page).forEach(b => b.onclick = () => { const [slug, id] = b.dataset.go.split('|'); goTo(slug, id); });
    $$('[data-openin]', page).forEach(b => b.onclick = () => { const [slug, id] = b.dataset.openin.split('|'); goTo(slug, id); });
    $$('[data-sheet]', page).forEach(b => b.onclick = async () => { const [slug, id] = b.dataset.sheet.split('|'); await goTo(slug, id); if (window.UnwipCharSheet) { if (U.level() < 2) U.setMode('lore'); window.UnwipCharSheet.open(id); } });
    $$('[data-new]', page).forEach(b => b.onclick = () => newEntry({ kind: b.dataset.new, into: st.target }));
    const add = page.querySelector('[data-addto]'); if (add) add.onclick = () => addToBooks(D.entries.find(x => x.id === st.sel));
    const ser = page.querySelector('[data-series]'); if (ser) ser.onclick = putInSeries;
    const endS = page.querySelector('[data-endseries]'); if (endS) endS.onclick = endSeries;
    const ex = page.querySelector('[data-export]'); if (ex) ex.onclick = exportDialog;
    $$('[data-bmv]', page).forEach(b => b.onclick = () => reorder(+b.dataset.i, +b.dataset.bmv));
    if (st.sel) wireLore(page);
    $$('[data-grp]', page).forEach(b => b.onclick = () => { try { localStorage.setItem('unwip-bible-bybook', b.dataset.grp === 'book' ? '1' : '0'); } catch {} draw(); });
    $$('[data-bmore]', page).forEach(b => b.onclick = e => { const bk = D.books[+b.dataset.bmore]; if (!bk) return; const r = b.getBoundingClientRect();
      U.showMenu(r.left, r.bottom + 4, [{ label: 'Open the book', action: () => goTo(bk.slug, null) },
        ...(D.series ? [{ label: 'Take it out of the series', action: () => takeOut(bk) }] : []),
        { sep: true }, { label: 'Delete the book…', danger: true, action: () => deleteFromBible(bk) }]); });
    const nt = page.querySelector('[data-newthread]'); if (nt) nt.onclick = newThread;
    $$('[data-paid]', page).forEach(b => b.onclick = () => { const [slug, id] = b.dataset.paid.split('|'); payOff(slug, id); });
    $$('[data-drop]', page).forEach(b => b.onclick = () => { const [slug, id] = b.dataset.drop.split('|'); editBible(slug, bb => { const t = findIn(bb.threads, id); if (t) { t.status = 'dropped'; t.closed = null; } }); });
    $$('[data-reopen]', page).forEach(b => b.onclick = () => { const [slug, id] = b.dataset.reopen.split('|'); editBible(slug, bb => { const t = findIn(bb.threads, id); if (t) { t.status = 'open'; t.closed = null; } }); });
    $$('[data-delthread]', page).forEach(b => b.onclick = async () => { const [slug, id] = b.dataset.delthread.split('|'); if (await U.confirmBox('Remove this thread?', 'It comes out of the Story Bible. Your chapters don’t change.', 'Remove')) editBible(slug, bb => { bb.threads = (bb.threads || []).filter(x => x && x.id !== id); }); });
    $$('[data-delfact]', page).forEach(b => b.onclick = () => { const [slug, id] = b.dataset.delfact.split('|'); deleteFact(slug, id); });
    $$('[data-newlink]', page).forEach(b => b.onclick = () => newLink(D.entries.find(e => e.id === st.sel)));
    $$('[data-dellink]', page).forEach(b => b.onclick = async () => { const [slug, id] = b.dataset.dellink.split('|'); if (await U.confirmBox('Remove this relationship?', 'It comes out of the Story Bible. Your chapters don’t change.', 'Remove')) { if (id.startsWith('i:')) { const at = +id.slice(2); editBook(slug, p => { if (Array.isArray(p.links)) p.links.splice(at, 1); }); } else editBook(slug, p => { if (Array.isArray(p.links)) p.links = p.links.filter(x => !x || x.id !== id); if (p.bible && Array.isArray(p.bible.links)) p.bible.links = p.bible.links.filter(x => x && x.id !== id); }); } });
    $$('.sbb-wn', page).forEach(g => g.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); g.dispatchEvent(new MouseEvent('click', { bubbles: true })); } });
    const asof = page.querySelector('.sbb-asof-sel'); if (asof) asof.onchange = () => { st.asOf = asof.value === '' ? null : +asof.value; draw(); };
    $$('[data-step-asof]', page).forEach(b => b.onclick = () => { const opts = [...asof.options].filter(o => o.value !== '').map(o => +o.value), i = opts.indexOf(st.asOf) + +b.dataset.stepAsof; if (i >= 0 && i < opts.length) { st.asOf = opts[i]; draw(); } });
  }
  // ---------------------------------------------------------------- export: the bible as a Word file or PDF
  // Built from what's visible As of the chosen chapter, so a beta reader at chapter 10 gets nothing from later on.
  async function exportDialog() {
    const D = st.data, multi = D.books.length > 1;
    const body = document.createElement('div'); body.className = 'sbb-add';
    body.innerHTML = `<div class="field"><label>Up to</label><select id="sbb-xasof"><option value="">the whole ${multi ? 'series' : 'book'}</option>${D.books.map(b => `<optgroup label="${multi ? `Book ${b.no}: ` : ''}${esc(b.title)}">${b.chs.map((c, ci) => `<option value="${b.no * 100000 + ci}" ${st.asOf === b.no * 100000 + ci ? 'selected' : ''}>${multi ? `Book ${b.no} · ` : ''}Ch ${ci + 1}: ${esc(c.title)}</option>`).join('')}</optgroup>`).join('')}</select></div>
      <div class="field"><label>Put in</label><div class="sbb-pick">${[['people', 'People', 1], ['places', 'Places', 1], ['things', 'Things', 1], ['facts', 'Facts on each page', 1], ['links', 'Relationships', 1], ['glossary', 'Glossary', 1], ['timeline', 'Timeline', 1], ['threads', 'Plot threads (your notes: leave out for readers)', 0]].map(([k, l, on]) => `<label class="check"><input type="checkbox" value="${k}" ${on ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div>
      <div class="field"><label>As</label><div class="sbb-kinds">${[['docx', 'Word (.docx)'], ['pdf', 'PDF']].map(([k, l], i) => `<label><input type="radio" name="sbb-xfmt" value="${k}" ${i ? '' : 'checked'}><span>${l}</span></label>`).join('')}</div></div>
      <p class="hint">Up to a chapter, nothing that happens after it is included: the people met so far, facts as they stood, threads set up so far. Good for a beta reader or an editor partway through.</p>`;
    const ok = await U.modal({ title: 'Export the Story Bible', body, wide: true, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Export', value: true, kind: 'primary' }] });
    if (!ok) return;
    const v = body.querySelector('#sbb-xasof').value, inc = new Set([...body.querySelectorAll('.sbb-pick input:checked')].map(x => x.value)), fmt = body.querySelector('[name=sbb-xfmt]:checked').value;
    const keep = st.asOf; st.asOf = v === '' ? null : +v;
    let html; try { html = exportHTML(inc); } finally { st.asOf = keep; }
    const asLabel = v === '' ? '' : ' (to ' + body.querySelector('#sbb-xasof').selectedOptions[0].textContent.replace(/:.*/, '') + ')';
    const name = `${D.label} - Story Bible${asLabel}`;
    try {
      if (fmt === 'pdf') {
        const doc = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(name)}</title><style>${EXPORT_CSS}</style></head><body>${html}</body></html>`;
        await api.exportPDF(doc, name, 'A4', { pageNumbers: true, font: 'Georgia' });
      } else {
        const Clip = window.FolioClip, X = window.FolioDOCX;
        const blocks = Clip.extract(Clip.parseHTML(html)).blocks;
        const style = (U.S.project && U.S.project.style) || U.DEFAULT_STYLE;
        const bytes = X.build(blocks, style, { title: name, author: (U.S.settings || {}).author || '', pageBreaks: false });
        await api.exportBinary(bytes, name, 'docx', 'Word document');
      }
    } catch (e) { console.error(e); U.toast('The Story Bible couldn’t be exported: ' + esc(e.message || e), 'warn'); }
  }
  const EXPORT_CSS = `body{font:11.5pt/1.5 Georgia,'Times New Roman',serif;color:#111;margin:0}h1{font-size:26pt;margin:0 0 4pt}h2{font-size:17pt;margin:22pt 0 6pt;border-bottom:1px solid #ccc;padding-bottom:3pt;page-break-after:avoid}h3{font-size:12.5pt;margin:14pt 0 4pt;page-break-after:avoid}p{margin:0 0 6pt}.k{color:#555}.part{page-break-before:always}.part:first-of-type{page-break-before:auto}.sub{color:#555;margin-bottom:24pt}`;
  function exportHTML(inc) {
    const D = st.data, multi = D.books.length > 1, P = [];
    const asText = st.asOf != null ? (() => { const b = D.books.find(x => x.no === Math.floor(st.asOf / 100000)); const ci = st.asOf % 100000; return b ? `Up to ${multi ? `Book ${b.no}, ` : ''}chapter ${ci + 1}: ${b.chs[ci] ? b.chs[ci].title : ''}` : ''; })() : (multi ? 'The whole series' : 'The whole book');
    P.push(`<h1>${esc(D.label)}</h1><p class="sub">Story Bible. ${esc(asText)}.${multi ? ` Books: ${D.books.map(b => `${b.no}. ${esc(b.title)}`).join(', ')}.` : ''}</p>`);
    const sections = [['people', 'characters', 'People'], ['places', 'places', 'Places'], ['things', 'items', 'Things']];
    for (const [key, kind, title] of sections) {
      if (!inc.has(key)) continue;
      const list = D.entries.filter(e => e.kind === kind && visible(e)).sort((a, b) => (seenNow(b).length - seenNow(a).length) || a.title.localeCompare(b.title));
      if (!list.length) continue;
      P.push(`<div class="part"><h1>${title}</h1>`);
      for (const e of list) {
        const seen = seenNow(e);
        P.push(`<h2>${esc(e.title)}</h2>`);
        for (const [k, v] of e.sheet.fields) if (v) P.push(`<p><b>${esc(k)}:</b> ${esc(v)}</p>`);
        for (const sec of e.sheet.sections) { const ps = sec.p.filter(Boolean); if (!ps.length) continue; if (sec.h) P.push(`<h3>${esc(sec.h)}</h3>`); for (const x of ps) P.push(`<p>${esc(x)}</p>`); }
        if (inc.has('facts')) {
          const F = factsNow(e); if (F.length) {
            const topics = new Map(), loose = [];
            for (const f of F) { if (f.topic) topics.set(keyName(f.topic), f); else loose.push(f); }   // the latest on each topic
            P.push('<h3>Facts</h3>');
            for (const f of topics.values()) P.push(`<p><b>${esc(f.topic)}:</b> ${esc(f.text)} <span class="k">(${where(f)})</span></p>`);
            for (const f of loose) P.push(`<p>${esc(f.text)} <span class="k">(${where(f)})</span></p>`);
          }
        }
        if (inc.has('links')) {
          const L = D.links.filter(l => (l.a === e || l.b === e) && linkOn(l) && !linkOver(l));
          if (L.length) { P.push('<h3>Relationships</h3>'); for (const l of L) { const o = l.a === e ? l.b : l.a; P.push(`<p>${l.type === 'other' && l.a === e ? esc(l.label) : linkWords(l, e).replace(/<[^>]+>/g, '')} <b>${esc(o.title)}</b>${l.note ? ` <span class="k">(${esc(l.note)})</span>` : ''}</p>`); } }
        }
        if (seen.length) P.push(`<p class="k">First seen ${where(seen[0])}, in ${seen.length} chapter${seen.length === 1 ? '' : 's'}${st.asOf != null ? ' so far' : ''}.</p>`);
      }
      P.push('</div>');
    }
    if (inc.has('glossary') && D.glossary.length) {
      // up to a chapter, only words already used by then (a word first used later could give something away)
      const firstUse = t => { const re = new RegExp(`(?<![\\p{L}])${t.term.normalize('NFD').replace(/\p{M}/gu, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'iu'); for (const b of D.books) for (let ci = 0; ci < b.chs.length; ci++) if (re.test((b.chs[ci].text || '').normalize('NFD').replace(/\p{M}/gu, ''))) return { b, ci }; return null; };
      const G = D.glossary.filter(t => { if (st.asOf == null) return true; const f = firstUse(t); return f && upto(f); });
      if (G.length) { P.push('<div class="part"><h1>Glossary</h1>'); for (const t of G) P.push(`<p><b>${esc(t.term)}</b>${t.meaning ? `: ${esc(t.meaning)}` : ''}</p>`); P.push('</div>'); }
    }
    if (inc.has('timeline')) {
      const rows = [];
      for (const b of D.books) for (const x of ((b.p.timeline || {}).events || [])) {
        if (!x || !x.title) continue;
        const ci = b.chs.findIndex(c => c.id === x.chapterId);
        if (st.asOf != null && (ci < 0 || !upto({ b, ci }))) continue;
        rows.push(`<p><b>${esc(x.date || (x.day != null ? 'Day ' + x.day : ''))}</b>${x.date || x.day != null ? ' · ' : ''}${esc(x.title)}${ci >= 0 ? ` <span class="k">(${where({ b, ci })})</span>` : ''}${x.note ? `<br><span class="k">${esc(x.note)}</span>` : ''}</p>`);
      }
      if (rows.length) P.push(`<div class="part"><h1>Timeline</h1>${rows.join('')}</div>`);
    }
    if (inc.has('threads')) {
      const T = D.threads.filter(upto);
      if (T.length) { P.push('<div class="part"><h1>Plot threads</h1>'); for (const t of T) { const paid = t.status === 'paid' && t.closed && upto(t.closed); P.push(`<p><b>${esc(t.title)}</b> <span class="k">(set up ${where(t)}${paid ? `, paid off ${where(t.closed)}` : t.status === 'dropped' ? ', dropped' : ', still open'})</span>${t.note ? `<br>${esc(t.note)}` : ''}</p>`); } P.push('</div>'); }
    }
    return P.join('\n');
  }
  async function goTo(slug, id) {
    close();
    if (U.S.slug !== slug) { const ok = await U.openProject(slug); if (ok === false) return; }
    if (id) await U.openDoc(id);
  }
  async function reorder(i, d) {
    if (phone()) return;   // read only on a phone
    const L = st.data.books, j = i + d; if (j < 0 || j >= L.length) return;
    [L[i], L[j]] = [L[j], L[i]];
    for (const [k, b] of L.entries()) { b.no = k + 1; const p = await api.openProject(b.slug).catch(() => null); if (p && +p.seriesNo !== k + 1) { p.seriesNo = k + 1; await api.saveProjectMeta(b.slug, p); } b.p.seriesNo = k + 1; }
    draw();
    U.toast(`“${esc(L[j].title)}” is now Book ${j + 1} of the series.`);
  }
  // a book leaves the series: it stays a book of its own, and pages it shared stop updating with the others (each book
  // keeps its own copy), as series.js does when the series name is changed
  async function takeOut(bk) {
    if (phone()) return;
    if (!(await U.confirmBox('Take it out of the series?', `“${esc(bk.title)}” stays a book of its own, with everything in it. Pages it shares with the series stop updating together: each book keeps its own copy.`, 'Take it out'))) return;
    const open = U.S.slug === bk.slug && U.S.project, p = open ? U.S.project : await api.openProject(bk.slug); if (!p) return;
    p.series = ''; delete p.seriesNo;
    walk(p.binder, n => { if (n.series && typeof n.series === 'object') delete n.series; });
    if (open) { U.scheduleMeta(); await U.saveMetaNow(); } else await api.saveProjectMeta(bk.slug, p);
    // the rest close up (Book 1, 2, 3…)
    const rest = st.data.books.filter(b => b !== bk);
    for (const [k, b] of rest.entries()) { const q = await api.openProject(b.slug).catch(() => null); if (q && +q.seriesNo !== k + 1) { q.seriesNo = k + 1; await api.saveProjectMeta(b.slug, q); } }
    U.toast(`“${esc(bk.title)}” is out of the series.`);
    if (rest.length) { const keep = { tab: st.tab }; st.data = await load(st.target); st.sel = null; Object.assign(st, keep); draw(); } else close();
  }
  // the whole series ends: every book stays, as a book of its own with its own Story Bible
  async function endSeries() {
    if (phone() || !st || !st.data.series) return;
    const D = st.data;
    if (!(await U.confirmBox(`End the series “${esc(D.label)}”?`, `${D.books.length === 1 ? 'The book stays' : `All ${D.books.length} books stay`}, with everything in ${D.books.length === 1 ? 'it' : 'them'}, as books of their own. Pages they share stop updating together: each book keeps its own copy. To delete a book as well, use the ⋯ next to it.`, 'End the series'))) return;
    for (const bk of D.books) {
      const open = U.S.slug === bk.slug && U.S.project, p = open ? U.S.project : await api.openProject(bk.slug).catch(() => null); if (!p) continue;
      p.series = ''; delete p.seriesNo;
      walk(p.binder, n => { if (n.series && typeof n.series === 'object') delete n.series; });
      if (open) { U.scheduleMeta(); await U.saveMetaNow(); } else await api.saveProjectMeta(bk.slug, p);
    }
    U.toast(`The series “${esc(D.label)}” has ended. Its books are still here.`);
    close();
  }
  // the Open World shelf behind the bible shows the series and books as they are now
  async function refreshShelf() {
    const slot = document.getElementById('sbb-shelf-slot'); if (!slot) return;
    const h = await shelfHTMLSaved(); if (slot.isConnected) { slot.innerHTML = h; wireShelf(slot); }
  }
  async function deleteFromBible(bk) {
    if (phone() || !U.deleteBook) return;
    const list = await api.listProjects().catch(() => []), p = list.find(x => x.slug === bk.slug); if (!p) return;
    const before = list.length;
    await U.deleteBook(p);
    const after = await api.listProjects().catch(() => []);
    if (after.length === before) return;   // not deleted
    const rest = st.data.books.filter(b => b !== bk && after.some(x => x.slug === b.slug));
    if (!rest.length) { close(); return; }
    const keep = { tab: st.tab }; st.data = await load(st.target); st.sel = null; Object.assign(st, keep); draw();
  }
  async function putInSeries() {
    const sh = await shelf(), b = st.data.books[0];
    const body = document.createElement('div');
    body.innerHTML = `<div class="field"><label>Series name</label><input type="text" id="sbb-sname" list="sbb-snames" placeholder="e.g. The Tallow Street books"><datalist id="sbb-snames">${sh.series.map(s => `<option value="${esc(s.name)}">`).join('')}</datalist></div><p class="hint">Books with the same series name share one Story Bible. Pick an existing series to add this book to it.</p>`;
    const ok = await U.modal({ title: 'Put it in a series', body, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Save', value: true, kind: 'primary' }], onOpen: back => setTimeout(() => back.querySelector('#sbb-sname').focus(), 50) });
    const name = ok ? norm(body.querySelector('#sbb-sname').value).slice(0, 80) : ''; if (!name) return;
    const p = await api.openProject(b.slug); if (!p) return;
    const same = sh.series.find(s => keyName(s.name) === keyName(name));
    p.series = same ? same.name : name; p.seriesNo = same ? same.books.length + 1 : 1;
    await api.saveProjectMeta(b.slug, p);
    if (U.S.slug === b.slug && U.S.project) { U.S.project.series = p.series; U.S.project.seriesNo = p.seriesNo; }
    open({ series: p.series, tab: st.tab });
  }

  // ---------------------------------------------------------------- new entries, and adding one to more books
  function sheetHTML(p, kind, name) {
    const root = (p.binder || []).find(r => r.kind === kind);
    const sh = root && U.sheetFor ? U.sheetFor(root) : null;
    if (!sh) return `<p>${esc(name)}</p>`;
    const nameField = sh.fields.find(f => /\bname\b/i.test(f));
    return sh.fields.map(f => `<p><b>${esc(f)}:</b> ${f === nameField ? esc(name) : ''}</p>`).join('') + sh.sections.map(x => `<h2>${esc(x)}</h2><p><br></p>`).join('');
  }
  const stamp = html => (window.UnwipSeries && window.UnwipSeries.hash ? window.UnwipSeries.hash(norm(html)) : '');
  async function putIn(slug, kind, node, html) {
    const p = await api.openProject(slug); if (!p) return false;
    let root = (p.binder || []).find(r => r.kind === kind);
    if (!root) { root = { id: 'root-' + kind, type: 'folder', kind, title: { characters: 'Characters', places: 'Places', items: 'Items' }[kind], root: true, children: [] }; p.binder.splice(Math.max(0, p.binder.length - 1), 0, root); }
    root.children = root.children || []; root.children.push(node);
    await api.saveDoc(slug, node.id, html); await api.saveProjectMeta(slug, p);
    if (U.S.slug === slug && U.S.project) { await U.reloadProjectMeta?.(); }
    return true;
  }
  // a new person, place or thing: named once, put in the books you pick, shared between them when there's more than one
  // ---- a book picker that copes with any number of books: chips for the ones picked, a search box, and a short list
  // under it (recent books when the box is empty, matches when typing; a series name offers all its books at once)
  function bookPicker(sh, all, ctx) {
    const seriesOf = b => b.series || '';
    const picked = new Map();
    const el = document.createElement('div'); el.className = 'sbb-bp'; el.dataset.ownEnter = '1';
    el.innerHTML = `<div class="sbb-bp-chips"></div><input type="search" class="sbb-bp-q" placeholder="Find a book or series" aria-label="Find a book or series" autocomplete="off"><div class="sbb-bp-list" role="listbox"></div>`;
    const chips = el.querySelector('.sbb-bp-chips'), q = el.querySelector('.sbb-bp-q'), listEl = el.querySelector('.sbb-bp-list');
    let tell = () => {};
    const label = b => `${seriesOf(b) ? `${esc(seriesOf(b))}${b.seriesNo ? ` ${b.seriesNo}` : ''} · ` : ''}${esc(b.title)}`;
    function drawChips() {
      chips.innerHTML = picked.size ? [...picked.values()].map(b => `<span class="sbb-bp-chip">${label(b)}<button type="button" data-rm="${esc(b.slug)}" aria-label="Take out ${esc(b.title)}">×</button></span>`).join('') : '<span class="sbb-bp-none">No book picked yet</span>';
      tell(picked.size);
    }
    function drawList() {
      const t = q.value.trim().toLowerCase();
      const rows = [];
      const ser = t ? sh.series.filter(s => s.name.toLowerCase().includes(t)) : (ctx && ctx.series ? sh.series.filter(s => keyName(s.name) === keyName(ctx.series)) : []);
      for (const s of ser.slice(0, 3)) if (s.books.length > 1 && s.books.some(b => !picked.has(b.slug))) rows.push(`<button type="button" class="sbb-bp-row sbb-bp-all" data-series="${esc(s.name)}"><b>All ${s.books.length} books</b> in ${esc(s.name)}</button>`);
      const pool = (t ? all.filter(b => b.title.toLowerCase().includes(t) || seriesOf(b).toLowerCase().includes(t)) : [...all].sort((a, b) => (b.modified || 0) - (a.modified || 0))).filter(b => !picked.has(b.slug));
      for (const b of pool.slice(0, 6)) rows.push(`<button type="button" class="sbb-bp-row" data-add="${esc(b.slug)}">+ ${label(b)}</button>`);
      if (pool.length > 6) rows.push(`<div class="sbb-bp-more">${pool.length - 6} more${t ? ' match' : ''}: type to narrow it down</div>`);
      if (!rows.length) rows.push(`<div class="sbb-bp-more">${t ? 'No book matches that.' : 'Every book is picked.'}</div>`);
      listEl.innerHTML = (t ? '' : '<div class="sbb-bp-h">Recent books</div>') + rows.join('');
    }
    const add = slug => { const b = all.find(x => x.slug === slug); if (b) picked.set(slug, b); };
    el.addEventListener('click', e => {
      const a = e.target.closest('[data-add]'), r = e.target.closest('[data-rm]'), s = e.target.closest('[data-series]');
      if (a) add(a.dataset.add); else if (r) picked.delete(r.dataset.rm); else if (s) (sh.series.find(x => x.name === s.dataset.series) || { books: [] }).books.forEach(b => add(b.slug)); else return;
      drawChips(); drawList(); q.focus();
    });
    q.addEventListener('input', drawList);
    q.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); const f = listEl.querySelector('[data-add], [data-series]'); if (f) f.click(); } });
    // starting point: a series' latest book, or the book whose bible is open, or nothing
    if (ctx && ctx.series) { const s = sh.series.find(x => keyName(x.name) === keyName(ctx.series)); if (s && s.books.length) add(s.books[s.books.length - 1].slug); }
    else if (ctx && ctx.slug) add(ctx.slug);
    drawChips(); drawList();
    return { el, get: () => [...picked.keys()], onChange: fn => { tell = fn; fn(picked.size); } };
  }
  async function newEntry(o = {}) {
    if (phone()) { U.toast('On a phone the Story Bible is read only. Add people, places and things on an iPad or computer.'); return; }
    const kind = o.kind || 'characters';
    const sh = await shelf();
    const all = [...sh.series.flatMap(s => s.books), ...sh.alone];
    const loose = kind === 'characters' && window.UnwipBuild && window.UnwipBuild.newPerson;   // a person can wait in Open World until a book needs them
    if (!all.length && !loose) { U.toast('Make a book first: people, places and things live in your books.'); return; }
    // which books: a search over every book (there may be hundreds), with the ones picked shown as chips. In a series'
    // bible its latest book starts picked and "All N books" is one tap; from the main screen nothing is picked until you
    // choose (it used to tick only the last book opened, and listing every book wouldn't work with 500 of them).
    const picker = bookPicker(sh, all, st && st.target ? st.target : o.into || null);
    const body = document.createElement('div'); body.className = 'sbb-new';
    body.innerHTML = `<div class="field"><label>Name</label><input type="text" id="sbb-nname" maxlength="80" placeholder="${kind === 'characters' ? 'e.g. Wren Tallow' : kind === 'places' ? 'e.g. Tallow Street' : 'e.g. The brass wick-hook'}"></div>
      <div class="field"><label>Put it in</label><div class="sbb-bp-slot"></div></div>
      <p class="hint">It goes in each book’s ${({ characters: 'Characters', places: 'Places', items: 'Items' }[kind])} folder. In more than one book the page is shared: change it in any of them and the others follow.${kind === 'characters' ? ' No book for them yet? Leave it empty: they wait in Open World until you add them to one.' : ''}${o.sheet ? ' Its character sheet opens next.' : ''}</p>`;
    body.querySelector('.sbb-bp-slot').appendChild(picker.el);
    const ok = await U.modal({ title: `New ${KIND_ONE[kind]}`, body, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Make it', value: true, kind: 'primary' }],
      onOpen: back => { const go = back.querySelector('.m-foot .btn.primary'); picker.onChange(n => { if (go) go.disabled = !n && !loose; }); setTimeout(() => back.querySelector('#sbb-nname').focus(), 50); } });
    const name = ok ? norm(body.querySelector('#sbb-nname').value).slice(0, 80) : '';
    const picks = picker.get();
    if (name && !picks.length && loose) {
      // no book: a character of the world, kept in Open World with the maps and coats of arms
      await window.UnwipBuild.newPerson(name, sheetHTML(U.newProjectTemplate(), 'characters', name));
      U.toast(`<b>${esc(name)}</b> is in Open World › Characters of the world. Add them to a book whenever you like (Add to book… at the top).`, '', 7000);
      return;
    }
    if (!name || !picks.length) return;
    const key = picks.length > 1 ? U.uid() + U.uid() : null;
    let firstSlug = null, firstId = null;
    for (const slug of picks) {
      const p = await api.openProject(slug); if (!p) continue;
      const html = sheetHTML(p, kind, name), id = U.uid();
      const node = { id, type: 'doc', title: name, words: 0, mod: Date.now(), ...(key ? { series: { key, hash: stamp(html), at: Date.now() } } : {}), ...(o.sheet && kind === 'characters' ? { csheet: { fig: 'f1', slots: {} } } : {}) };
      await putIn(slug, kind, node, html);
      if (!firstSlug) { firstSlug = slug; firstId = id; }
    }
    U.toast(`<b>${esc(name)}</b> added to ${picks.length === 1 ? esc((all.find(b => b.slug === picks[0]) || {}).title || 'the book') : picks.length + ' books'}.`);
    if (o.sheet && firstSlug) { await goTo(firstSlug, firstId); if (U.level() < 2) U.setMode('lore'); if (window.UnwipCharSheet) window.UnwipCharSheet.open(firstId); return; }
    if (st) { const keepTab = st.tab; st.data = await load(st.target); st.tab = keepTab; const e = st.data && st.data.entries.find(x => x.title === name && x.kind === kind); st.sel = e ? e.id : null; draw(); }
  }
  async function addToBooks(e) {
    if (phone()) return;   // read only on a phone
    if (!e) return;
    const D = st.data, missing = D.books.filter(b => !e.in.some(x => x.b === b)); if (!missing.length) return;
    const body = document.createElement('div');
    body.innerHTML = `<div class="sbb-pick">${missing.map(b => `<label class="check"><input type="checkbox" value="${esc(b.slug)}" checked><span>Book ${b.no}: ${esc(b.title)}</span></label>`).join('')}</div><p class="hint">The page is shared: change it in any book and the others follow.</p>`;
    const ok = await U.modal({ title: `Add ${esc(e.title)} to…`, body, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Add', value: true, kind: 'primary' }] });
    const picks = ok ? [...body.querySelectorAll('input:checked')].map(x => x.value) : []; if (!picks.length) return;
    const html = await api.loadDoc(e.book.slug, e.node.id);
    // the source gets a series key if it hasn't one, so every copy stays in step
    let key = e.node.series && e.node.series.key;
    if (!key) { key = U.uid() + U.uid(); const p = await api.openProject(e.book.slug); let n = null; walk(p.binder, x => { if (x.id === e.node.id) n = x; }); if (n) { n.series = { key, hash: stamp(html), at: Date.now() }; await api.saveProjectMeta(e.book.slug, p); } }
    for (const slug of picks) await putIn(slug, e.kind, { id: U.uid(), type: 'doc', title: e.title, words: e.node.words || 0, mod: Date.now(), series: { key, hash: stamp(html), at: Date.now() } }, html);
    U.toast(`${esc(e.title)} is now in ${picks.length + e.in.length} books.`);
    const keepTab = st.tab; st.data = await load(st.target); st.tab = keepTab; st.sel = 's:' + key; draw();
  }

  // ---------------------------------------------------------------- Add to bible: selected words become a fact
  const S = U.S;
  function entriesHere() {
    const out = [];
    for (const [kind, label] of KINDS) { const root = S.project && S.project.binder.find(r => r.kind === kind); if (root) walk(root.children, n => { if (n.type === 'doc' && !n.map) out.push({ n, kind, label }); }); }
    return out;
  }
  const chaptersHere = () => { const out = [], r = S.project && S.project.binder.find(x => x.kind === 'manuscript'); walk(r && r.children, n => { if (n.type === 'doc') out.push(n); }); return out; };
  async function addFact(words) {
    if (!S.project) return;
    const list = entriesHere();
    if (!list.length) { U.toast('Add a character, place or item to this book first: facts are about one of them.'); return; }
    const chs = chaptersHere(); if (!chs.length) { U.toast('Write a chapter first: a fact comes from a chapter.'); return; }
    const here = Math.max(0, chs.findIndex(c => c.id === S.docId));
    const said = norm(String(words || '').replace(/\s+/g, ' ')).slice(0, 600);
    // who it's about: the first page whose name (or first name, or surname) is in the words
    const named = l => { const w = l.n.title.split(/\s+/).filter(x => x.length > 2); return [l.n.title, ...w].some(x => new RegExp(`(?<![\\p{L}])${x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u').test(said)); };
    const pick = list.find(named) || list[0];
    const topics = new Set(['Appearance', 'Hair', 'Eyes', 'Age', 'Status', 'Where they are', 'Allegiance', 'Ruler', 'Owner']);
    for (const f of (S.project.bible && S.project.bible.facts) || []) if (f && f.topic) topics.add(f.topic);
    const body = document.createElement('div'); body.className = 'sbb-add'; body.dataset.ownEnter = '';
    body.innerHTML = `<div class="sbb-kinds" role="radiogroup">${[['fact', 'Fact'], ['thread', 'Plot thread'], ['word', 'Glossary word']].map(([k, l], i) => `<label><input type="radio" name="sbb-kind" value="${k}" ${i ? '' : 'checked'}><span>${l}</span></label>`).join('')}</div>
      <div class="sbb-k-thread" hidden><div class="field"><label>What was set up</label><input type="text" id="sbb-ttitle" maxlength="120" value="${esc(said.slice(0, 120))}"></div><div class="field"><label>Note <small>(optional)</small></label><textarea id="sbb-tnote" rows="2" maxlength="600" placeholder="What the reader now expects"></textarea></div></div>
      <div class="sbb-k-word" hidden><div class="field"><label>Word</label><input type="text" id="sbb-gterm" maxlength="60" value="${esc(said.split(/\s+/).slice(0, 4).join(' ').replace(/[.,;:!?”“"’]+$/, ''))}"></div><div class="field"><label>Meaning <small>(optional)</small></label><textarea id="sbb-gmean" rows="2" maxlength="600"></textarea></div></div>
      <div class="sbb-k-fact"><div class="field"><label>Fact</label><textarea id="sbb-ftext" rows="3" maxlength="600">${esc(said)}</textarea></div>
      <div class="sbb-add-row"><div class="field"><label>About</label><select id="sbb-fabout">${KINDS.map(([k, t]) => { const l = list.filter(x => x.kind === k); return l.length ? `<optgroup label="${t}">${l.map(x => `<option value="${esc(x.n.id)}" ${x === pick ? 'selected' : ''}>${esc(x.n.title)}</option>`).join('')}</optgroup>` : ''; }).join('')}</select></div>
        <div class="field"><label>Topic <small>(optional)</small></label><input type="text" id="sbb-ftopic" list="sbb-ftopics" maxlength="40" placeholder="e.g. Hair"><datalist id="sbb-ftopics">${[...topics].map(t => `<option value="${esc(t)}">`).join('')}</datalist></div></div>
</div>
      <div class="field"><label>From chapter</label><select id="sbb-fch">${chs.map((c, i) => `<option value="${esc(c.id)}" ${i === here ? 'selected' : ''}>Ch ${i + 1}: ${esc(c.title || 'Untitled')}</option>`).join('')}</select></div>
      <p class="hint sbb-k-fact">With a topic, a later fact on the same topic replaces this one from its chapter on, for things that change, like hair colour or who rules a city. The Story Bible can show what was true at any chapter.</p>
      <p class="hint sbb-k-thread" hidden>Something set up that the reader will expect to be paid off. The Story Bible's Threads list keeps it until you mark it paid off.</p>`;
    const kindNow = () => (body.querySelector('[name=sbb-kind]:checked') || {}).value || 'fact';
    body.addEventListener('change', e => { if (e.target.name !== 'sbb-kind') return; const k = kindNow(); body.querySelectorAll('.sbb-k-fact, .sbb-k-thread, .sbb-k-word').forEach(x => { x.hidden = !x.classList.contains('sbb-k-' + k); }); });
    const ok = await U.modal({ title: 'Add to the Story Bible', body, wide: true, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Add', value: true, kind: 'primary' }], onOpen: back => setTimeout(() => { const t = back.querySelector(said ? '#sbb-ftopic' : '#sbb-ftext'); if (t) t.focus(); }, 50) });
    if (!ok) return;
    const kind = kindNow(), chId = body.querySelector('#sbb-fch').value;
    const BB = () => { const B = S.project.bible = (S.project.bible && typeof S.project.bible === 'object') ? S.project.bible : {}; return B; };
    if (kind === 'thread') {
      const title = norm(body.querySelector('#sbb-ttitle').value).slice(0, 120); if (!title) return;
      const B = BB(); B.threads = Array.isArray(B.threads) ? B.threads : [];
      B.threads.push({ id: U.uid(), title, note: norm(body.querySelector('#sbb-tnote').value).slice(0, 600), open: chId, closed: null, status: 'open', at: Date.now() });
      U.scheduleMeta(); U.toast(`Thread added to the Story Bible: <b>${esc(title)}</b>.`); return;
    }
    if (kind === 'word') {
      const term = norm(body.querySelector('#sbb-gterm').value).slice(0, 60); if (!term) return;
      const B = BB(); B.glossary = Array.isArray(B.glossary) ? B.glossary : [];
      B.glossary.push({ id: U.uid(), term, meaning: norm(body.querySelector('#sbb-gmean').value).slice(0, 600), at: Date.now() });
      U.scheduleMeta(); U.toast(`<b>${esc(term)}</b> added to the glossary.`); return;
    }
    const text = norm(body.querySelector('#sbb-ftext').value).slice(0, 600); if (!text) return;
    const nodeId = body.querySelector('#sbb-fabout').value, f = U.findNode(nodeId); if (!f) return;
    const B = S.project.bible = (S.project.bible && typeof S.project.bible === 'object') ? S.project.bible : {};
    B.facts = Array.isArray(B.facts) ? B.facts : [];
    const topic = norm(body.querySelector('#sbb-ftopic').value).slice(0, 40);
    B.facts.push({ id: U.uid(), node: nodeId, key: (f.node.series && f.node.series.key) || '', topic, text, ch: chId, at: Date.now() });
    U.scheduleMeta();
    U.toast(`Added to the Story Bible: <b>${esc(f.node.title)}</b>${topic ? ` · ${esc(topic)}` : ''}.`);
  }
  // the selection bar's button (Lore), the PC right-click menu, and Ctrl+K
  const hiddenFact = document.createElement('button'); hiddenFact.id = 'btn-add-fact'; hiddenFact.hidden = true; document.body.appendChild(hiddenFact);
  hiddenFact.onclick = () => addFact(getSelection().toString());

  document.addEventListener('keydown', e => { if (e.key === 'Escape' && st && !document.querySelector('.modal-back')) { if (st.sel) { st.sel = null; draw(); } else close(); } });
  return { open, close, reopen, shelfHTML: shelfHTMLSaved, get lastShelf() { return lastShelf; }, wireShelf, newEntry, addFact, load, parseSheet, exportHTML: inc => exportHTML(new Set(inc)), get state() { return st; } };
})();
