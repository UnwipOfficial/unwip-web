// Unwip - the import room. Importing gets its own place: the Import button sits in the main screen's bottom right
// corner and opens a room with a calm welcome ("let's take it one step at a time"), every way in, and any book still
// being sorted. After a guided import, the new book is gone through a section at a time:
//   1. Bring it in   the importers bring everything in as it is (bookimport.js, scrivimport.js)
//   2. Manuscript    order, split a long chapter at its headings (or keep it whole), set things aside
//   3. Characters    one page per person or keep the document whole, where each document goes, names that come up a lot
//   4. The rest      places, items, notes and research
//   5. Check it over the numbers: every word that came in is still here
// "Sort the rest later" keeps the book's place (project.importSort), shown as "to sort" on the Import button.
// Turning the guide off (in the room, or Settings) makes imports go straight in, as before.
window.UnwipImportRoom = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return;
  const { S, api, esc, $, $$ } = U;
  const STEPS = [['in', 'Bring it in'], ['manuscript', 'Manuscript'], ['characters', 'Characters'], ['world', 'Places and the rest'], ['check', 'Check it over']];
  const guideOn = () => !(S.settings && S.settings.importGuide === false);
  const phone = () => document.documentElement.classList.contains('m-phone');
  const pl = (n, w, ws) => `${U.fmt(n)} ${n === 1 ? w : (ws || w + 's')}`;
  const textOf = html => { const d = document.createElement('div'); d.innerHTML = html || ''; d.querySelectorAll('br').forEach(b => b.replaceWith(' ')); return (d.textContent || '').replace(/\s+/g, ' ').trim(); };
  const ICON = {
    in: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v3h16v-3"/></svg>',
    back: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>'
  };

  // ---------------------------------------------------------------- the Import button (main screen, bottom right)
  function setupButton() {
    const b = $('#btn-import'); if (!b) return;
    const home = $('#write-home'); if (home && b.parentNode !== home) home.appendChild(b);
    b.className = 'imp-fab'; b.title = 'Bring a book in from Scrivener, Word, Google Docs, Obsidian or Markdown';
    b.innerHTML = `${ICON.in}<span class="imp-fab-t">Import a book</span><span class="imp-fab-n" hidden></span>`;
    b.onclick = e => { e.preventDefault(); open(); };
  }
  function setBadge(list) {
    const n = (list || []).filter(p => p.sorting).length, el = $('#btn-import .imp-fab-n'); if (!el) return;
    el.hidden = !n; el.textContent = phone() ? String(n) : `${n} to sort`;
  }
  U.on('library', list => { lastList = list || []; setBadge(lastList); });
  let lastList = [];

  // ---------------------------------------------------------------- the room
  let room = null, step = null, cache = {}, sel = 0;
  function shell(cur) {
    close();
    room = document.createElement('div'); room.className = 'ir'; room.id = 'import-room';
    const i = cur === 'welcome' ? 0 : STEPS.findIndex(s => s[0] === cur);
    room.innerHTML = `<header class="ir-head">
        <button type="button" class="ir-back">${ICON.back}<span>${S.slug && cur !== 'welcome' ? 'Back to the book' : 'Your books'}</span></button>
        <b class="ir-title">Import room</b>${S.project && cur !== 'welcome' ? `<span class="ir-book">${esc(S.project.title || '')}</span>` : ''}
        <span class="ir-sp"></span>
        <ol class="ir-steps">${STEPS.map(([k, l], n) => `<li class="${n < i ? 'done' : n === i ? 'on' : ''}">${n + 1} ${esc(l)}</li>`).join('')}</ol>
      </header>
      <div class="ir-phonebar">${i >= 0 ? `<span>Step ${i + 1} of ${STEPS.length} · ${esc(STEPS[i][1])}</span><span class="ir-bars">${STEPS.map((s, n) => `<i class="${n <= i ? 'on' : ''}"></i>`).join('')}</span>` : ''}</div>
      <div class="ir-body"></div><footer class="ir-foot"></footer>`;
    document.body.appendChild(room);
    $('.ir-back', room).onclick = () => { close(); if (!S.slug) U.showLibrary(); };
    return { body: $('.ir-body', room), foot: $('.ir-foot', room) };
  }
  function close() { if (room) { room.remove(); room = null; } document.removeEventListener('keydown', keys, true); }
  function keys(e) { if (e.key === 'Escape' && room && !document.querySelector('.modal-back')) { e.stopPropagation(); close(); if (!S.slug) U.showLibrary(); } }

  async function open() {
    if (!guideOn()) return plainMenu();
    const { body, foot } = shell('welcome'); room.classList.add('ir-welcome');
    const sorting = (lastList.length ? lastList : await api.listProjects().catch(() => [])).filter(p => p.sorting);
    const srcs = U.importSources ? U.importSources() : [];
    body.innerHTML = `<div class="ir-wel">
      <section class="ir-wel-l">
        <h1>Bring your book across</h1>
        <p class="ir-lede">Hey, I know change can be brutal, so let’s take it one step at a time.</p>
        <p class="ir-sub">First it all comes in exactly as it is. Then we go through it a section at a time: your manuscript, your characters, then the places and notes. Your original file is never changed, and you can stop after any step.</p>
        <ol class="ir-wel-steps">${STEPS.map(([, l], n) => `<li class="${n ? '' : 'on'}"><span>${n + 1}</span>${n === 0 ? 'Bring it in, exactly as it is' : esc(l)}</li>`).join('')}</ol>
        <label class="check ir-guide"><input type="checkbox" id="ir-guide" checked><span>Guide me through future imports</span></label>
        <p class="ir-hint">You can turn this guide off anytime. Without it, books come straight in as they are.</p>
      </section>
      <section class="ir-wel-r">
        <div class="ir-drop"><div class="ir-drop-ic">${ICON.in}</div><b>Where is your book now?</b>
          <div class="ir-srcs">${srcs.map((s, n) => s.sep ? '' : `<button type="button" class="btn ${n === 0 ? 'primary' : ''}" data-src="${n}">${esc(s.label)}</button>`).join('')}</div></div>
        ${sorting.length ? `<div class="ir-cap">Still being sorted</div>${sorting.map(p => `<div class="ir-pend"><div><b>${esc(p.title)}</b><span>Brought in ${esc(when(p.sortingAt))} · up to ${esc((STEPS.find(s => s[0] === p.sorting) || STEPS[1])[1])}</span></div><button type="button" class="btn" data-carry="${esc(p.slug)}">Carry on</button></div>`).join('')}` : ''}
      </section></div>`;
    foot.remove();
    $('#ir-guide', body).onchange = async e => { S.settings = await api.setSettings({ importGuide: e.target.checked }); U.toast(e.target.checked ? 'Imports will take it one step at a time.' : 'Imports will come straight in. Turn the guide back on here or in Settings.'); };
    $$('[data-src]', body).forEach(b => b.onclick = () => { const s = srcs[+b.dataset.src]; close(); if (s && s.action) s.action(); });
    $$('[data-carry]', body).forEach(b => b.onclick = async () => { const slug = b.dataset.carry; close(); const ok = await U.openProject(slug); if (ok !== false) resume(); });
    document.addEventListener('keydown', keys, true);
  }
  function plainMenu() {
    const b = $('#btn-import'), r = b ? b.getBoundingClientRect() : { left: innerWidth - 300, top: innerHeight - 200 };
    const items = U.importSources ? U.importSources() : [];
    U.showMenu(Math.max(8, r.left - 120), Math.max(8, r.top - 12 - items.length * 34), items);
  }
  const when = t => t ? new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : 'recently';

  // ---------------------------------------------------------------- after an import: start sorting
  // called by the importers once a NEW book is open (bookimport.js after its summary, scrivimport.js after its report)
  async function afterImport(o = {}) {
    if (!guideOn() || !S.project) return false;
    S.project.importSort = { step: 'manuscript', from: o.from || 'Import', at: Date.now(), words: bookWords(), trash: trashWords(), notNames: [] };
    U.scheduleMeta(); await U.saveMetaNow().catch(() => {});
    await go('manuscript');
    return true;
  }
  function resume() { const st = S.project && S.project.importSort; if (st) go(st.step || 'manuscript'); }
  async function setStep(k) { if (!S.project || !S.project.importSort) return; S.project.importSort.step = k; U.scheduleMeta(); }
  async function go(k) {
    step = k; sel = 0;
    try { await U.flushSave(); } catch {}
    if (k !== 'check') await setStep(k);
    if (k === 'manuscript') return stepManuscript();
    if (k === 'characters') return stepDocs('characters');
    if (k === 'world') return stepDocs('world');
    if (k === 'check') return stepCheck();
  }
  function footer(foot, prev, next, nextLabel) {
    foot.innerHTML = `${prev ? `<button type="button" class="btn ghost ir-prev">‹ ${esc(prev[1])}</button>` : '<span></span>'}<span class="ir-sp"></span>
      <button type="button" class="btn ghost ir-later">Sort the rest later</button>
      <button type="button" class="btn primary ir-next">${esc(nextLabel || `Next: ${next[1]} ›`)}</button>`;
    if (prev) $('.ir-prev', foot).onclick = () => go(prev[0]);
    $('.ir-later', foot).onclick = () => { close(); U.toast('Saved where you are. Carry on any time from Import a book on the main screen.', '', 6000); };
    $('.ir-next', foot).onclick = () => go(next[0]);
  }
  async function html(id) { if (!(id in cache)) cache[id] = (await api.loadDoc(S.slug, id).catch(() => '')) || ''; return cache[id]; }
  function trashWords() { let n = 0; const t = U.findNode('root-trash'); if (t) U.walkTree(t.node.children || [], x => { if (x.type === 'doc') n += x.words || 0; }); return n; }
  function bookWords() { let n = 0; U.walkTree(S.project.binder, x => { if (x.type === 'doc' && U.rootOf(x.id) && U.rootOf(x.id).kind !== 'trash') n += x.words || 0; }); return n; }
  const rootByKind = k => S.project.binder.find(r => r.kind === k);

  // ---------------------------------------------------------------- 2. manuscript
  async function stepManuscript() {
    const { body, foot } = shell('manuscript');
    footer(foot, null, STEPS[2]);
    cache = {};
    const ms = U.findNode('root-manuscript').node;
    const rows = []; (function walk(list, depth) { for (const n of list || []) { rows.push({ n, depth }); if (n.type === 'folder') walk(n.children, depth + 1); } })(ms.children, 0);
    const docs = rows.filter(r => r.n.type === 'doc').slice(0, 600);
    for (const r of docs) await html(r.n.id);
    const kept = new Set((S.project.importSort && S.project.importSort.kept) || []);
    let words = 0; for (const r of docs) words += r.n.words || 0;
    let no = 0;
    body.innerHTML = `<div class="ir-pad"><div class="ir-h"><div><h1>Your manuscript</h1><p class="ir-sub">Is this the story, in the right order? Move chapters with the arrows. A long chapter with headings inside can be split into chapters, or kept whole.</p></div><span class="ir-count">${pl(docs.length, 'chapter')} · ${pl(words, 'word')}</span></div>
      <div class="ir-chs">${rows.map(({ n, depth }) => {
        if (n.type === 'folder') return `<div class="ir-part" style="--d:${depth}">${esc(n.title || 'Part')}</div>`;
        const h = cache[n.id] || '', heads = headings(h).length, first = textOf(h).slice(0, 140);
        const offer = heads >= 2 && !kept.has(n.id);
        return `<div class="ir-ch ${offer ? 'big' : ''}" data-id="${esc(n.id)}" style="--d:${depth}">
          <div class="ir-ch-row"><span class="ir-mv"><button type="button" class="icon-btn small" data-up title="Move up" aria-label="Move up">↑</button><button type="button" class="icon-btn small" data-down title="Move down" aria-label="Move down">↓</button></span>
            <b class="ir-no">${++no}</b><div class="ir-ch-t"><b>${esc(n.title || 'Untitled')}</b>${offer ? `<span class="ir-warn">${heads} headings inside: maybe ${heads} chapters?</span>` : `<span class="ir-first">${esc(first)}${first.length >= 140 ? '…' : ''}</span>`}</div>
            <span class="ir-w">${pl(n.words || 0, 'word')}</span><button type="button" class="btn ghost small" data-out title="Move it to Notes › Not in the book">Not in the book</button></div>
          ${offer ? `<div class="ir-ch-do"><button type="button" class="btn small" data-keep>Keep as one chapter</button><button type="button" class="btn primary small" data-split>Split at the ${heads} headings</button></div>` : ''}
        </div>`;
      }).join('')}</div>
      <p class="ir-hint">Deleted scenes or old drafts? <b>Not in the book</b> moves them to Notes › Not in the book, where you can bring them back any time.</p></div>`;
    $$('.ir-ch', body).forEach(row => {
      const id = row.dataset.id;
      $('[data-up]', row).onclick = () => { move(id, -1); stepManuscript(); };
      $('[data-down]', row).onclick = () => { move(id, 1); stepManuscript(); };
      $('[data-out]', row).onclick = () => { notInBook(id); stepManuscript(); };
      const k = $('[data-keep]', row); if (k) k.onclick = () => { const st = S.project.importSort; st.kept = [...new Set([...(st.kept || []), id])]; U.scheduleMeta(); stepManuscript(); };
      const sp = $('[data-split]', row); if (sp) sp.onclick = async () => { sp.disabled = true; const n = await splitDoc(id); U.toast(`Split into ${n} chapters. The whole chapter as it was is kept in its Snapshots.`); stepManuscript(); };
    });
  }
  function move(id, d) {
    const f = U.findNode(id); if (!f) return;
    const to = f.index + d; if (to < 0 || to >= f.list.length || f.list[to].root) return;
    f.list.splice(f.index, 1); f.list.splice(to, 0, f.node); U.scheduleMeta(); U.renderBinder();
  }
  function moveToRoot(id, kind, folderTitle) {
    const f = U.findNode(id); let dest = rootByKind(kind); if (!f || !dest) return false;
    if (folderTitle) {
      let fo = dest.children.find(c => c.type === 'folder' && c.title === folderTitle);
      if (!fo) { fo = { id: U.uid(), type: 'folder', title: folderTitle, children: [], open: false }; dest.children.push(fo); }
      dest = fo;
    }
    f.list.splice(f.index, 1); dest.children.push(f.node);
    U.scheduleMeta(); U.renderBinder(); U.updateStatus && U.updateStatus();
    return true;
  }
  const notInBook = id => moveToRoot(id, 'notes', 'Not in the book');
  // headings at the top level of a chapter (h1 to h3), with the text under each
  function headings(h) { const d = document.createElement('div'); d.innerHTML = h || ''; return [...d.children].filter(e => /^H[1-3]$/.test(e.tagName) && e.textContent.trim()); }
  async function splitDoc(id) {
    const f = U.findNode(id), h = await html(id); if (!f) return 1;
    const d = document.createElement('div'); d.innerHTML = h;
    const pieces = []; let cur = { title: null, nodes: [] };
    for (const el of [...d.childNodes]) {
      if (el.nodeType === 1 && /^H[1-3]$/.test(el.tagName) && el.textContent.trim()) { if (cur.nodes.length || cur.title) pieces.push(cur); cur = { title: el.textContent.replace(/\s+/g, ' ').trim(), nodes: [] }; }
      else cur.nodes.push(el);
    }
    pieces.push(cur);
    const out = pieces.filter(p => p.title || textOf(p.nodes.map(n => n.outerHTML || n.textContent).join('')));
    if (out.length < 2) return 1;
    await api.snapSave(S.slug, id, h, 'Before splitting at headings', false).catch(() => {});
    const toHTML = p => { const box = document.createElement('div'); p.nodes.forEach(n => box.appendChild(n)); return box.innerHTML.trim() || '<p><br></p>'; };
    // the first piece stays this chapter (its title too, unless it's only the text before the first heading)
    const first = out[0], firstHTML = toHTML(first);
    if (first.title && !textOf(firstHTML)) { /* nothing before the first heading */ }
    if (first.title) f.node.title = first.title;
    // headings become chapter names, so their words leave the text (the check at the end counts them)
    const st = S.project.importSort; if (st) { st.titled = (st.titled || 0) + out.reduce((a, p) => a + (p.title ? U.countWords(p.title) : 0), 0); U.scheduleMeta(); }
    await api.saveDoc(S.slug, id, firstHTML); cache[id] = firstHTML;
    f.node.words = U.countWords(textOf(firstHTML)); f.node.mod = Date.now();
    let at = f.index + 1;
    for (const p of out.slice(1)) {
      const nid = U.uid(), ph = toHTML(p);
      await api.saveDoc(S.slug, nid, ph); cache[nid] = ph;
      f.list.splice(at++, 0, { id: nid, type: 'doc', title: p.title || 'Untitled', words: U.countWords(textOf(ph)), mod: Date.now() });
    }
    U.scheduleMeta(); U.renderBinder();
    if (S.docId === id) await U.openDoc(id);
    return out.length;
  }

  // ---------------------------------------------------------------- 3 and 4. where each document goes
  const PEOPLE = /\b(characters?|cast|people|persons?|who.?s who|protagonists?|villains?|npcs?)\b/i;
  function docList(kind) {
    const out = [];
    for (const r of S.project.binder) {
      if (r.kind === 'manuscript' || r.kind === 'trash') continue;
      U.walkTree(r.children || [], n => {
        if (n.type !== 'doc' || n.map) return;
        const parent = U.findNode(n.id).parent;
        const people = r.kind === 'characters' || PEOPLE.test(n.title || '') || (parent && PEOPLE.test(parent.title || ''));
        if ((kind === 'characters') === people) out.push({ n, root: r, from: parent && !parent.root ? parent.title : r.title });
      });
    }
    return out;
  }
  // where it came from, and where it is now if that's different
  function placeOf(x) { const r = U.rootOf(x.n.id), now = r ? r.title : ''; return x.from && x.from !== now ? `${x.from} → ${now}` : now; }
  function dests() {
    const base = [['characters', 'Characters'], ['places', 'Places'], ['items', 'Items'], ['notes', 'Notes'], ['research', 'Research']].filter(([k]) => rootByKind(k));
    for (const r of S.project.binder) if (r.custom) base.push([r.kind, r.title]);
    return [...base, ['trash', 'Leave out']];
  }
  async function stepDocs(kind) {
    const { body, foot } = shell(kind);
    footer(foot, kind === 'characters' ? STEPS[1] : STEPS[2], kind === 'characters' ? STEPS[3] : STEPS[4]);
    const list = docList(kind);
    const lists = kind === 'characters' && window.UnwipSheets ? await window.UnwipSheets.findLists().catch(() => []) : [];
    const many = Object.fromEntries(lists.map(x => [x.id, x.count]));
    for (const it of list) await html(it.n.id);
    if (sel >= list.length) sel = Math.max(0, list.length - 1);
    const names = kind === 'characters' ? await suggestNames() : [];
    const it = list[sel];
    const where = id => { const r = U.rootOf(id); return r ? r.kind : ''; };
    body.innerHTML = `<div class="ir-pad ir-docs">
      <div class="ir-h"><div><h1>${kind === 'characters' ? 'Characters' : 'Places, items and notes'}</h1><p class="ir-sub">${list.length ? `Pick where each document goes. Unwip has made a first guess: ${kind === 'characters' ? 'these look like they’re about people' : 'everything else from your import'}.` : 'Nothing here to sort. On to the next step.'}</p></div>${list.length ? `<span class="ir-count">Document ${sel + 1} of ${list.length}</span>` : ''}</div>
      ${list.length ? `<div class="ir-split">
        <aside class="ir-list">${list.map((x, i) => `<button type="button" class="ir-li ${i === sel ? 'on' : ''}" data-i="${i}"><b>${esc(x.n.title || 'Untitled')}</b><span>${esc(placeOf(x))}</span></button>`).join('')}</aside>
        <article class="ir-card">
          <div class="ir-card-h"><b>${esc(it.n.title || 'Untitled')}</b><span>${pl(it.n.words || 0, 'word')}</span></div>
          <span class="ir-from">From: ${esc(it.from || '')}</span>
          <div class="ir-peek">${previewHTML(cache[it.n.id])}</div>
          ${many[it.n.id] >= 2 && (where(it.n.id) !== 'characters' || PEOPLE.test(it.n.title || '')) ? `<div class="ir-q">It lists ${many[it.n.id]} people. How should it come in?</div>
            <div class="ir-two"><button type="button" class="btn primary" data-pages>One page per person (${many[it.n.id]} pages)</button><button type="button" class="btn" data-whole>Keep it as one document</button></div>` : ''}
          <div class="ir-q">Where does it go?</div>
          <div class="ir-dests">${dests().map(([k, l]) => `<button type="button" class="btn ${where(it.n.id) === k ? 'primary' : ''} ${k === 'trash' ? 'ir-out' : ''}" data-to="${esc(k)}">${esc(l)}</button>`).join('')}</div>
          <div class="ir-nav"><button type="button" class="btn ghost" data-prev ${sel ? '' : 'disabled'}>‹ Previous</button><button type="button" class="btn ghost" data-skip ${sel < list.length - 1 ? '' : 'disabled'}>Next ›</button></div>
        </article></div>` : ''}
      ${names.length ? `<div class="ir-cap">Names that come up a lot in your chapters</div><div class="ir-names">${names.map(x => `<div class="ir-name"><b>${esc(x.name)}</b><span>${pl(x.count, 'time')}</span><button type="button" class="btn small" data-make="${esc(x.name)}">Make a page</button><button type="button" class="btn ghost small" data-not="${esc(x.name)}">Not a person</button></div>`).join('')}</div>
        <p class="ir-hint">Counted by plain rules on this device, no AI.</p>` : ''}
    </div>`;
    $$('.ir-li', body).forEach(b => b.onclick = () => { sel = +b.dataset.i; stepDocs(kind); });
    const nav = (d) => { sel = Math.max(0, Math.min(list.length - 1, sel + d)); stepDocs(kind); };
    const pv = $('[data-prev]', body); if (pv) pv.onclick = () => nav(-1);
    const sk = $('[data-skip]', body); if (sk) sk.onclick = () => nav(1);
    $$('[data-to]', body).forEach(b => b.onclick = () => {
      const k = b.dataset.to;
      if (k === 'trash') { const t = U.findNode('root-trash'); if (t) { const f = U.findNode(it.n.id); f.list.splice(f.index, 1); t.node.children.push(f.node); U.scheduleMeta(); U.renderBinder(); } }
      else if (where(it.n.id) !== k) moveToRoot(it.n.id, k);
      // the next one, unless this was the last
      const after = docList(kind); sel = Math.min(sel + (after.length < list.length ? 0 : 1), Math.max(0, after.length - 1));
      stepDocs(kind);
    });
    const pg = $('[data-pages]', body); if (pg) pg.onclick = async () => { await window.UnwipSheets.convert([it.n.id]); cache = {}; stepDocs(kind); };
    const wh = $('[data-whole]', body); if (wh) wh.onclick = () => { if (where(it.n.id) !== 'characters') moveToRoot(it.n.id, 'characters'); nav(1); };
    $$('[data-make]', body).forEach(b => b.onclick = async () => { await makePerson(b.dataset.make); U.toast(`A page for <b>${esc(b.dataset.make)}</b> is in Characters.`); stepDocs(kind); });
    $$('[data-not]', body).forEach(b => b.onclick = () => { const st = S.project.importSort; st.notNames = [...new Set([...(st.notNames || []), b.dataset.not])]; U.scheduleMeta(); stepDocs(kind); });
  }
  function previewHTML(h) {
    const d = document.createElement('div'); d.innerHTML = h || '';
    const parts = [...d.querySelectorAll('h1,h2,h3,p,li')].map(e => ({ head: /^H/.test(e.tagName) || (e.firstElementChild && e.firstElementChild.tagName === 'B' && e.textContent.length < 60), t: e.textContent.replace(/\s+/g, ' ').trim() })).filter(x => x.t).slice(0, 7);
    if (!parts.length) return '<span class="ir-empty">(empty)</span>';
    return parts.map(x => `<div class="${x.head ? 'ir-ph' : ''}">${esc(x.t.slice(0, 160))}${x.t.length > 160 ? '…' : ''}</div>`).join('');
  }
  async function makePerson(name) {
    const root = rootByKind('characters'); if (!root) return;
    const sh = U.sheetFor ? U.sheetFor(root) : null;
    const nameField = sh && sh.fields.find(f => /\bname\b/i.test(f));
    const h = sh ? sh.fields.map(f => `<p><b>${esc(f)}:</b> ${f === nameField ? esc(name) : ''}</p>`).join('') + sh.sections.map(x => `<h2>${esc(x)}</h2><p><br></p>`).join('') : `<p>${esc(name)}</p>`;
    const id = U.uid();
    await api.saveDoc(S.slug, id, h);
    root.children.push({ id, type: 'doc', title: name, words: 0, mod: Date.now() });
    U.scheduleMeta(); U.renderBinder();
  }
  // names: capitalised words that come up often in the chapters, never at the start of a sentence, never also written
  // in lower case (that's an ordinary word), and not already a character, place or item
  const NOT = new Set('I Im Ive Id Ill The A An And But Or If Then So He She It We They You His Her Its Our Their My Your This That These Those There Here What When Where Why How Who Which Yes No Oh Ah Well Mr Mrs Ms Miss Dr Sir Madam Lord Lady Count Doctor Professor Captain King Queen Prince Princess God Chapter Part Book Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August September October November December English French German'.split(' '));
  async function suggestNames() {
    const st = S.project.importSort || {}, skip = new Set((st.notNames || []).map(x => x.toLowerCase()));
    for (const r of S.project.binder) if (['characters', 'places', 'items'].includes(r.kind) || r.custom) U.walkTree(r.children || [], n => { for (const w of String(n.title || '').toLowerCase().split(/\s+/)) skip.add(w); skip.add(String(n.title || '').toLowerCase()); });
    const ids = []; U.walkTree(U.findNode('root-manuscript').node.children, n => { if (n.type === 'doc') ids.push(n.id); });
    const counts = new Map(), lower = new Set();
    for (const id of ids.slice(0, 400)) {
      const t = textOf(await html(id));
      for (const m of t.matchAll(/\b[a-z][a-z'’]+\b/g)) lower.add(m[0]);
      for (const m of t.matchAll(/([.!?"“”'‘’:—]\s*|^)?\b([A-Z][a-z'’]{2,}(?:\s[A-Z][a-z'’]{2,})?)\b/g)) {
        if (m[1] !== undefined) continue;   // the first word of a sentence or a line
        const name = m[2].replace(/[’']s$/, '');
        counts.set(name, (counts.get(name) || 0) + 1);
      }
    }
    const out = [];
    for (const [name, count] of counts) {
      const parts = name.split(' ');
      if (count < 6 || parts.some(p => NOT.has(p.replace(/[’']/g, ''))) || skip.has(name.toLowerCase()) || parts.some(p => skip.has(p.toLowerCase())) || parts.every(p => lower.has(p.toLowerCase()))) continue;
      out.push({ name, count });
    }
    // "Van Helsing" over a lone "Helsing" that only ever follows it
    const keep = out.filter(x => !out.some(y => y !== x && y.name.split(' ').includes(x.name) && y.count >= x.count * 0.8));
    return keep.sort((a, b) => b.count - a.count).slice(0, 6);
  }

  // ---------------------------------------------------------------- 5. check it over
  function count(kind) { const r = rootByKind(kind); let n = 0; if (r) U.walkTree(r.children || [], x => { if (x.type === 'doc') n++; }); return n; }
  function stepCheck() {
    const { body, foot } = shell('check');
    const st = S.project.importSort || {}, now = bookWords(), then = st.words || now, titled = st.titled || 0;
    const out = Math.max(0, trashWords() - (st.trash || 0)), missing = then - titled - out - now;
    const ch = count('manuscript');
    body.innerHTML = `<div class="ir-pad ir-check"><h1>Your book’s home now</h1>
      <p class="ir-lede">${missing <= 0 ? `Every word came across. <b>${U.fmt(then)}</b> came in, and ${titled || out ? 'every one is accounted for' : 'they’re all here'}.` : `<b>${U.fmt(then)}</b> words came in and <b>${U.fmt(now)}</b> are in the book now.`}</p>
      <ul class="ir-proof">
        ${titled ? `<li>${pl(titled, 'word')} from headings ${titled === 1 ? 'is' : 'are'} now chapter names.</li>` : ''}
        ${out ? `<li>${pl(out, 'word')} ${out === 1 ? 'is' : 'are'} in the Trash, where you left ${out === 1 ? 'it' : 'them'} out. You can still bring ${out === 1 ? 'it' : 'them'} back.</li>` : ''}
        ${missing > 0 ? `<li>${pl(missing, 'word')} more than that changed while sorting (editing as you went counts too).</li>` : ''}
      </ul>
      <div class="ir-tiles">
        <div><b>${U.fmt(ch)}</b><span>${ch === 1 ? 'chapter' : 'chapters'}</span></div>
        ${[['characters', 'character', 'characters'], ['places', 'place', 'places'], ['items', 'item', 'items'], ['notes', 'note', 'notes'], ['research', 'research document', 'research documents']].filter(([k]) => rootByKind(k)).map(([k, a, b]) => { const n = count(k); return `<div><b>${U.fmt(n)}</b><span>${n === 1 ? a : b}</span></div>`; }).join('')}
      </div>
      <p class="ir-sub">You can move anything later in the chapter list, and the guide is here for the next book too.</p></div>`;
    foot.innerHTML = `<button type="button" class="btn ghost ir-prev">‹ ${esc(STEPS[3][1])}</button><span class="ir-sp"></span><button type="button" class="btn primary ir-next">Start writing</button>`;
    $('.ir-prev', foot).onclick = () => go('world');
    $('.ir-next', foot).onclick = () => { delete S.project.importSort; U.scheduleMeta(); close(); U.toast('All sorted. Enjoy the new home.'); };
  }

  setupButton();
  return { open, close, afterImport, resume, go, splitDoc, suggestNames, guideOn, get step() { return step; } };
})();
