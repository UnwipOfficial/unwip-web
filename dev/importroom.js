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
    b.className = 'imp-fab'; b.title = 'Bring a book in, or send one out to Scrivener, Word, Google Docs, Obsidian or Markdown';
    b.innerHTML = `${ICON.in}<span class="imp-fab-t">Import / Export</span><span class="imp-fab-n" hidden></span>`;
    b.onclick = e => { e.preventDefault(); if (window.UnwipSendOut) window.UnwipSendOut.choose(); else open(); };
    // a second way in next to New book, where people look first (beta, 20 Oct: the round button was missed). Not on
    // a phone: the round button is right there, and the row would get crowded.
    const row = $('.lib-actions'), nb = $('#btn-new-project');
    if (row && nb && !$('#btn-import2')) {
      const b2 = document.createElement('button'); b2.type = 'button'; b2.className = 'btn'; b2.id = 'btn-import2';
      b2.innerHTML = `${ICON.in.replace('width="20" height="20"', 'width="16" height="16"')}<span>Import / Export</span>`; b2.title = b.title;
      b2.onclick = b.onclick; row.insertBefore(b2, nb);
    }
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
    // back goes to Import / Export, where you picked bringing a book in
    if (window.UnwipSendOut) { $('.ir-back span', room).textContent = 'Import / Export'; $('.ir-back', room).onclick = () => { close(); window.UnwipSendOut.choose(); }; }
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
    msText = null;
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
  // redrawing a step keeps where you were in the list (moving a chapter used to jump back to the top on a phone)
  let keepScroll = null, keepRow = null;
  function restoreScroll(body) {
    if (keepScroll == null) return;
    body.scrollTop = keepScroll; keepScroll = null;
    const r = keepRow && body.querySelector(`[data-id="${CSS.escape(keepRow)}"]`); keepRow = null;
    if (r) r.scrollIntoView({ block: 'nearest' });
  }
  const remember = (body, id) => { keepScroll = body.scrollTop; keepRow = id || null; };
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
    body.innerHTML = `<div class="ir-pad"><div class="ir-h"><div><h1>Your manuscript</h1><p class="ir-sub">Is this the story, in the right order? Drag a chapter by its ≡, or move it with the arrows. A long chapter with headings inside can be split into chapters, or kept whole.</p></div><span class="ir-count">${pl(docs.length, 'chapter')} · ${pl(words, 'word')}</span></div>
      <div class="ir-chs">${rows.map(({ n, depth }) => {
        if (n.type === 'folder') return `<div class="ir-part" style="--d:${depth}">${esc(n.title || 'Part')}</div>`;
        const h = cache[n.id] || '', heads = headings(h).length, first = textOf(h).slice(0, 140);
        const offer = heads >= 2 && !kept.has(n.id);
        return `<div class="ir-ch ${offer ? 'big' : ''}" data-id="${esc(n.id)}" style="--d:${depth}">
          <div class="ir-ch-row"><span class="ir-grip" data-grip title="Drag to move" aria-label="Drag to move">≡</span><span class="ir-mv"><button type="button" class="icon-btn small" data-up title="Move up" aria-label="Move up">↑</button><button type="button" class="icon-btn small" data-down title="Move down" aria-label="Move down">↓</button></span>
            <b class="ir-no">${++no}</b><div class="ir-ch-t"><b>${esc(n.title || 'Untitled')}</b>${offer ? `<span class="ir-warn">${heads} headings inside: maybe ${heads} chapters?</span>` : `<span class="ir-first">${esc(first)}${first.length >= 140 ? '…' : ''}</span>`}</div>
            <span class="ir-w">${pl(n.words || 0, 'word')}</span><button type="button" class="btn ghost small" data-out title="Move it to Notes › Not in the book">Not in the book</button></div>
          ${offer ? `<div class="ir-ch-do"><button type="button" class="btn small" data-keep>Keep as one chapter</button><button type="button" class="btn primary small" data-split>Split at the ${heads} headings</button></div>` : ''}
        </div>`;
      }).join('')}</div>
      <p class="ir-hint">Deleted scenes or old drafts? <b>Not in the book</b> moves them to Notes › Not in the book, where you can bring them back any time.</p></div>`;
    $$('.ir-ch', body).forEach(row => {
      const id = row.dataset.id;
      $('[data-up]', row).onclick = () => { remember(body, id); move(id, -1); stepManuscript(); };
      $('[data-down]', row).onclick = () => { remember(body, id); move(id, 1); stepManuscript(); };
      $('[data-out]', row).onclick = () => { remember(body); notInBook(id); stepManuscript(); };
      dragRow(body, row, id);
      const k = $('[data-keep]', row); if (k) k.onclick = () => { const st = S.project.importSort; st.kept = [...new Set([...(st.kept || []), id])]; U.scheduleMeta(); stepManuscript(); };
      const sp = $('[data-split]', row); if (sp) sp.onclick = async () => { sp.disabled = true; remember(body, id); const n = await splitDoc(id); U.toast(`Split into ${n} chapters. The whole chapter as it was is kept in its Snapshots.`); stepManuscript(); };
    });
    restoreScroll(body);
  }
  // drag a chapter by its ≡ (mouse, finger or pen): a line shows where it will go, the list scrolls near the edges
  function dragRow(body, row, id) {
    const grip = $('[data-grip]', row); if (!grip) return;
    grip.onpointerdown = e => {
      e.preventDefault(); grip.setPointerCapture(e.pointerId);
      row.classList.add('ir-dragging');
      let target = null, after = false, y = e.clientY, timer = null;
      const clear = () => $$('.ir-ch.ir-drop-b, .ir-ch.ir-drop-a', body).forEach(x => x.classList.remove('ir-drop-b', 'ir-drop-a'));
      const aim = () => {
        clear(); target = null;
        const under = document.elementFromPoint(Math.min(innerWidth - 2, Math.max(2, e.clientX)), y);
        const r = under && under.closest('.ir-ch'); if (!r || r === row) return;
        const b = r.getBoundingClientRect(); after = y > b.top + b.height / 2;
        target = r.dataset.id; r.classList.add(after ? 'ir-drop-a' : 'ir-drop-b');
      };
      const edge = () => { const b = body.getBoundingClientRect(); const d = y < b.top + 50 ? -14 : y > b.bottom - 50 ? 14 : 0; if (d) { body.scrollTop += d; aim(); } };
      timer = setInterval(edge, 30);
      grip.onpointermove = ev => { y = ev.clientY; aim(); };
      grip.onpointerup = grip.onpointercancel = () => {
        clearInterval(timer); grip.onpointermove = grip.onpointerup = grip.onpointercancel = null;
        row.classList.remove('ir-dragging'); clear();
        if (target && target !== id) { remember(body, id); moveBeside(id, target, after); stepManuscript(); }
      };
    };
  }
  // put a chapter just before or after another one (into that one's folder, if it's in a different one)
  function moveBeside(id, targetId, after) {
    const f = U.findNode(id); if (!f || id === targetId) return;
    f.list.splice(f.index, 1);
    const t = U.findNode(targetId); if (!t) { f.list.splice(f.index, 0, f.node); return; }
    t.list.splice(t.index + (after ? 1 : 0), 0, f.node);
    U.scheduleMeta(); U.renderBinder();
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
        const g = ((S.project.importSort || {}).guess || {})[n.id];
        const people = g && g.kind ? g.kind === 'characters' : (r.kind === 'characters' || PEOPLE.test(n.title || '') || (parent && PEOPLE.test(parent.title || '')));
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
  // ---------------------------------------------------------------- first guesses, by plain rules (no AI)
  // Each document gets points toward a section from: where you put a folder of the same name last time, its title,
  // the folder it came from, what's in it ([system] lines, a sheet of Age/Hair fields, place words, item words,
  // prices), and whether its title is a name that keeps coming up in the chapters. The best one is the guess, if it's
  // clearly ahead. Nothing moves until you say.
  const KIND_RULES = {
    characters: { t: PEOPLE, w: /\b(he|she|his|her|him|brother|sister|mother|father|wife|husband|friend|girlfriend|boyfriend|leader|son|daughter|uncle|aunt|cousin|lover|mentor|rival)\b/gi, say: 'talks about people' },
    places: { t: /\b(places?|locations?|settings?|world|maps?|kingdoms?|cities|city|towns?|regions?|realms?|lands?|geography|countries|country|planets?)\b/i, w: /\b(town|city|village|castle|kingdom|river|mountains?|forest|harbou?r|port|tavern|inn|road|street|valley|island|lake|sea|desert|capital|district|temple|fortress|ruins|dungeon|cave|estate|abbey)\b/gi, say: 'mentions' },
    items: { t: /\b(items?|gear|weapons?|armou?r|inventory|artifacts?|artefacts?|equipment|loot|potions?|relics?)\b/i, w: /\b(sword|blade|dagger|axe|bow|staff|wand|ring|amulet|necklace|potion|shield|helm|cloak|boots|gauntlets?|scroll|crossbow|rifle)\b/gi, say: 'mentions' },
    research: { t: /\b(research|references?|sources?|inspiration|links?|reading)\b/i },
    notes: { t: /\b(notes?|ideas?|to ?do|outline|plot|timeline|scratch|brainstorm|summary|prices?|costs?)\b/i }
  };
  const SYSTEM_T = /\b(system|stats?|skills?|abilit(?:y|ies)|class(?:es)?|levels?|msgs?|messages?|spells?|magic|perks?|quests?|questing)\b/i;
  const STOP = new Set('the and for with from that this your into about notes note list lists book'.split(' '));
  const wordsOf = t => String(t || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 4 && !STOP.has(w));
  let msText = null;
  async function manuscriptText() {
    if (msText != null) return msText;
    const ids = []; U.walkTree(U.findNode('root-manuscript').node.children || [], n => { if (n.type === 'doc') ids.push(n.id); });
    const parts = []; for (const id of ids.slice(0, 600)) parts.push(textOf(await html(id)));
    return (msText = parts.join('\n'));
  }
  async function guessFor(n, came) {
    const P = S.project, h = await html(n.id), text = textOf(h), title = n.title || '', both = `${title} ${came || ''}`;
    const roots = P.binder.filter(r => r.root && !['manuscript', 'trash', 'conflicts'].includes(r.kind));
    const score = new Map(), why = new Map();
    const add = (kind, pts, reason) => { if (!roots.some(r => r.kind === kind)) return; score.set(kind, (score.get(kind) || 0) + pts); if (reason) (why.get(kind) || why.set(kind, []).get(kind)).push([pts, reason]); };
    // where you put a folder of this name last time
    const mem = ((S.settings && S.settings.importMemory) || {})[String(came || '').toLowerCase()];
    if (mem) { const r = roots.find(x => x.title.toLowerCase() === mem.toLowerCase()); if (r) add(r.kind, 10, `where you put “${came}” last time`); }
    for (const [kind, R] of Object.entries(KIND_RULES)) {
      // "notes" and "research" are loose words (people call all sorts of things notes), so they count for less
      const loose = kind === 'notes' || kind === 'research';
      if (R.t.test(title)) add(kind, loose ? 2 : 4, `called “${title}”`);
      else if (came && R.t.test(came)) add(kind, loose ? 1 : 3, `from “${came}”`);
    }
    // a section of your own with words in common ("Monsters & Classes" for a document in "Monsters")
    const bw = new Set(wordsOf(both));
    for (const r of roots.filter(x => x.custom)) { const hit = wordsOf(r.title).find(w => bw.has(w)); if (hit) add(r.kind, 5, `shares “${hit}” with ${r.title}`); }
    const sysRoot = roots.find(r => r.custom && SYSTEM_T.test(r.title));
    if (SYSTEM_T.test(both)) add(sysRoot ? sysRoot.kind : 'notes', sysRoot ? 3 : 1, `about the system`);
    // what's in it
    const lines = text ? h.split(/<\/(?:p|li|h\d)>/i).map(x => textOf(x)).filter(Boolean) : [];
    const br = lines.filter(l => /^\s*\[/.test(l)).length;
    if (lines.length >= 3 && br >= lines.length * 0.5) add(sysRoot ? sysRoot.kind : 'notes', 5, 'mostly [system] lines');
    if (window.UnwipSheets) { try { const r = window.UnwipSheets.parse(h); const names = r.groups.flatMap(g => g.entries.map(e => String(e.name || '').toLowerCase().trim())); if (names.filter(x => /^(age|hair|eyes|eye colou?r|gender|height|occupation|appearance|personality)$/.test(x)).length >= 2) add('characters', 6, 'a character sheet (Age, Hair…)'); } catch {} }
    const words = Math.max(1, (text.match(/\S+/g) || []).length);
    for (const kind of ['characters', 'places', 'items']) {
      const R = KIND_RULES[kind], hits = text.match(R.w) || []; if (!hits.length) continue;
      const per100 = hits.length * 100 / words, distinct = [...new Set(hits.map(x => x.toLowerCase()))];
      const pts = Math.min(4, Math.round(per100 / (kind === 'characters' ? 2.5 : 1.2)));
      if (pts > 0) add(kind, pts, kind === 'characters' ? R.say : `mentions ${distinct.slice(0, 2).map(w => /^[aeiou]/.test(w) ? 'an ' + w : 'a ' + w).join(', ')}`);
    }
    if (/\b(copper|silver|gold)\b[^.\n]{0,40}=|=\s*[^.\n]{0,20}\b(copper|silver|gold)\b/i.test(text)) add('notes', 3, 'prices');
    // a title that's a name that keeps coming up in the chapters
    if (/^\p{Lu}[\p{L}'’.-]*(\s\p{Lu}[\p{L}'’.-]*){0,2}$/u.test(title.trim()) && !KIND_RULES.places.w.test(title)) {
      KIND_RULES.places.w.lastIndex = 0;
      const ms = await manuscriptText(), esc2 = title.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const hits = [...ms.matchAll(new RegExp(`(?<![\\p{L}])${esc2}(?![\\p{L}])`, 'gu'))], c = hits.length;
      // a term, not a name (beta, 20 Oct: "Danger Rating" was guessed a person): mostly inside a [system message] or
      // after "the", "a", "his"… in the chapters
      const termish = hits.filter(m => { const before = ms.slice(Math.max(0, m.index - 60), m.index), line = before.slice(before.lastIndexOf('\n') + 1);
        return /\[[^\]]*$/.test(line) || /\b(the|a|an|his|her|its|their|my|your|our|this|that)\s+$/i.test(line); }).length;
      if (c >= 5 && termish < c * 0.4) add('characters', 5, `named ${c} times in your chapters`);
    }
    KIND_RULES.places.w.lastIndex = 0;
    const ranked = [...score.entries()].sort((a, b) => b[1] - a[1]);
    if (!ranked.length || ranked[0][1] < 3 || (ranked[1] && ranked[0][1] - ranked[1][1] < 2)) return null;
    const k = ranked[0][0], reasons = (why.get(k) || []).sort((a, b) => b[0] - a[0]).map(x => x[1]);
    return { kind: k, why: [...new Set(reasons)].slice(0, 2).join(' · ') };
  }
  // once per import: a guess for every document outside the manuscript
  async function ensureGuesses() {
    const st = S.project.importSort; if (!st) return;
    st.guess = st.guess || {};
    for (const r of S.project.binder) {
      if (!r.root || ['manuscript', 'trash', 'conflicts'].includes(r.kind)) continue;
      const todo = []; U.walkTree(r.children || [], n => { if (n.type === 'doc' && !n.map && !(n.id in st.guess)) todo.push(n); });
      for (const n of todo) st.guess[n.id] = await guessFor(n, fromOf(n.id)).catch(() => null);
    }
    U.scheduleMeta();
  }
  // where you send a folder's documents is remembered (on this device's settings, by the folder's name) for next time
  async function rememberChoice(id) {
    const came = fromOf(id), r = U.rootOf(id); if (!came || !r || r.kind === 'trash') return;
    const mem = { ...((S.settings && S.settings.importMemory) || {}) }; const key = came.toLowerCase();
    if (mem[key] === r.title) return;
    mem[key] = r.title; try { S.settings = await api.setSettings({ importMemory: mem }); } catch {}
  }

  // Each step keeps its own list from the moment you first reach it (importSort.lists), so a document you send to
  // Places stays here, showing where it went, instead of vanishing from under you. A document is "done" once you
  // choose where it goes, keep it whole, make it pages, or go past it with Next (importSort.done).
  function stepList(kind) {
    const st = S.project.importSort || (S.project.importSort = {});
    st.lists = st.lists || {}; st.done = st.done || [];
    const other = kind === 'characters' ? 'world' : 'characters';
    const exists = id => !!U.findNode(id);
    if (!st.lists[kind]) { const taken = new Set(st.lists[other] || []); st.lists[kind] = docList(kind).map(x => x.n.id).filter(id => !taken.has(id)); U.scheduleMeta(); }
    // pages made while sorting (one page per person) join the list as done
    const known = new Set([...(st.lists.characters || []), ...(st.lists.world || [])]);
    for (const x of docList(kind)) if (!known.has(x.n.id)) { st.lists[kind].push(x.n.id); st.done.push(x.n.id); }
    st.lists[kind] = st.lists[kind].filter(exists);
    return st.lists[kind].map(id => { const f = U.findNode(id), r = U.rootOf(id); return { n: f.node, root: r, from: fromOf(id) }; });
  }
  // where a document was when it came in (remembered the first time it's seen)
  function fromOf(id) {
    const st = S.project.importSort; st.came = st.came && typeof st.came === 'object' ? st.came : {};   // (st.from is what the import came from)
    if (!st.came[id]) { const f = U.findNode(id), r = U.rootOf(id); st.came[id] = f && f.parent && !f.parent.root ? f.parent.title : (r ? r.title : ''); }
    return st.came[id];
  }
  const isDone = id => ((S.project.importSort || {}).done || []).includes(id);
  // a list (people, places, things) waits for "one page each" or "keep it as one document"; choosing a section or
  // pressing Next used to tick it off whole, so the split the card offered was quietly skipped
  const decided = id => !!(((S.project.importSort || {}).split || {})[id]);
  const placed = id => ((S.project.importSort || {}).placed || []).includes(id);
  const markPlaced = id => { const st = S.project.importSort; st.placed = st.placed || []; if (!st.placed.includes(id)) st.placed.push(id); };
  const decide = (id, how) => { const st = S.project.importSort; st.split = st.split || {}; st.split[id] = how; U.scheduleMeta(); };
  const kept = id => (((S.project.importSort || {}).split || {})[id]) === 'whole';
  // A list's two choices are a switch (beta, 20 Oct): picking one only picks it, and the preview follows. Pages are made
  // when you move on (another document, the next step, Sort the rest later), and can be changed back from any of them.
  const pickOf = id => { const st = S.project.importSort || {}; return (st.pick || {})[id] || (kept(id) ? 'whole' : null); };
  const setPick = (id, how, byUnwip) => { const st = S.project.importSort; st.pick = st.pick || {}; st.pick[id] = how; st.pickBy = st.pickBy || {}; if (byUnwip) st.pickBy[id] = 'unwip'; else delete st.pickBy[id]; decide(id, how); if (how === 'whole') markDone(id); U.scheduleMeta(); };
  const madeFrom = id => ((S.project.importSort || {}).made || []).find(m => m.pages.includes(id));
  let wantId = null;   // after a change, the document to show
  const isList = id => !!listOf(cache[id]);
  const undecidedList = id => isList(id) && !decided(id);
  const markDone = id => { const st = S.project.importSort; if (st && !st.done.includes(id)) { st.done.push(id); U.scheduleMeta(); } };
  // A list of names (people, places, things) can become one page each. A single character's sheet ("Name: …",
  // "Age: …", "Hair: …") is fields, not a list, so it isn't offered.
  const FIELDS = new Set('name names full name aliases alias nickname nicknames age gender sex pronouns hair eyes eye colour eye color height weight build skin role occupation job title species race class level rank appearance looks personality background history backstory likes dislikes family relationships friends enemies notes note description status location home origin hometown nationality born birthday birth death died skills abilities powers goal goals motivation motivations fears fear strengths weaknesses quirks habits voice speech first appearance affiliation faction allegiance religion education'.split(' '));
  function listOf(html) {
    if (!window.UnwipSheets) return null;
    let r; try { r = window.UnwipSheets.parse(html || ''); } catch { return null; }
    if (!r || r.count < 2) return null;
    const names = r.groups.flatMap(g => g.entries.map(e => String(e.name || '').toLowerCase().trim()));
    if (names.filter(n => FIELDS.has(n)).length >= names.length / 2) return null;
    return { count: r.count, abilities: !!r.abilities };
  }
  // the small preview of the pages a list would make: which one you're looking at, and whether the fold is open
  const pvAt = {};
  const pvOpen = () => { try { return localStorage.getItem('unwip-ir-pv') !== '0'; } catch { return true; } };
  function previewBlock(it) {
    const P = window.UnwipSheets && window.UnwipSheets.preview ? window.UnwipSheets.preview(it.n.id, cache[it.n.id]) : null;
    if (!P || !P.items.length) return '';
    const i = Math.max(0, Math.min(P.items.length - 1, pvAt[it.n.id] || 0)), e = P.items[i];
    return `<details class="ir-pv" ${pvOpen() ? 'open' : ''}><summary>Preview: each page</summary>
      <div class="ir-pv-where">They’ll go in <b>${esc(P.section)}${e.group ? ` › ${esc(e.group)}` : ''}</b></div>
      <div class="ir-paper"><h3>${esc(e.name)}</h3>${e.html}</div>
      <div class="ir-flip"><button type="button" class="icon-btn small" data-pv="-1" ${i ? '' : 'disabled'} aria-label="Previous page">‹</button><span>${i + 1} of ${P.items.length} · ${esc(e.name)}</span><button type="button" class="icon-btn small" data-pv="1" ${i < P.items.length - 1 ? '' : 'disabled'} aria-label="Next page">›</button></div></details>`;
  }
  // what keeping it whole looks like: the document as one page, in the section it's in
  // (plain: any document that isn't a list gets the same page preview, saying where it goes; beta, 20 Oct)
  function wholePreview(it, plain) {
    const d = document.createElement('div'); d.innerHTML = cache[it.n.id] || '';
    const parts = [...d.children].slice(0, 8).map(x => x.outerHTML).join('') + (d.children.length > 8 ? '<p class="ir-more-l">…</p>' : '');
    const r = U.rootOf(it.n.id), sec = esc((r && r.title) || '');
    const where = plain ? (r && r.kind === 'trash' ? 'Left out: it’s in the Trash' : `It goes in <b>${sec}</b>`) : `It stays in <b>${sec}</b>, as one page`;
    return `<details class="ir-pv" ${pvOpen() ? 'open' : ''}><summary>${plain ? 'Preview' : 'Preview: one document'}</summary>
      <div class="ir-pv-where">${where}</div>
      <div class="ir-paper"><h3>${esc(it.n.title || 'Untitled')}</h3>${parts}</div></details>`;
  }
  const nounFor = (k, abil) => abil ? ['entry', 'entries'] : k === 'characters' ? ['person', 'people'] : k === 'places' ? ['place', 'places'] : k === 'items' ? ['thing', 'things'] : ['entry', 'entries'];
  async function stepDocs(kind) {
    const { body, foot } = shell(kind);
    footer(foot, kind === 'characters' ? STEPS[1] : STEPS[2], kind === 'characters' ? STEPS[3] : STEPS[4]);
    await ensureGuesses();
    const list = stepList(kind);
    const G = (S.project.importSort || {}).guess || {};
    const rootTitle = k => (rootByKind(k) || {}).title || k;
    for (const it of list) await html(it.n.id);
    if (wantId) { const wi = list.findIndex(x => x.n.id === wantId); if (wi >= 0) sel = wi; wantId = null; }
    if (sel >= list.length) sel = Math.max(0, list.length - 1);
    const names = kind === 'characters' ? await suggestNames() : [];
    const it = list[sel];
    const where = id => { const r = U.rootOf(id); return r ? r.kind : ''; };
    const done = list.filter(x => isDone(x.n.id)).length;
    const lst = it ? listOf(cache[it.n.id]) : null, noun = it ? nounFor(where(it.n.id), lst && lst.abilities) : null;
    // every list comes with Unwip's pick (beta, 20 Oct, option 1: lists left unanswered came back for a second pass):
    // one page each in Characters, Places, Items or a template section, one document anywhere else. Switch any time.
    { const st = S.project.importSort;
      for (const x of list) if (!pickOf(x.n.id) && listOf(cache[x.n.id])) { const r = U.rootOf(x.n.id) || {}; setPick(x.n.id, ['characters', 'places', 'items'].includes(r.kind) || r.custom ? 'pages' : 'whole', true); }
      void st; }
    const byUnwip = id => (((S.project.importSort || {}).pickBy || {})[id]) === 'unwip';
    const nowIn = it ? U.rootOf(it.n.id) : null;
    const g = it && G[it.n.id];
    // the rest of this step that Unwip has a guess for, somewhere else than where they are
    const guessable = list.filter(x => !isDone(x.n.id) && G[x.n.id] && rootByKind(G[x.n.id].kind) && G[x.n.id].kind !== where(x.n.id));
    // the others from the same folder, not done yet
    const sameFolder = it ? list.filter(x => x !== it && !isDone(x.n.id) && x.from === it.from) : [];
    // the section it's in now, with this document marked, so you can see what choosing a section did
    const sectionPeek = () => {
      if (!nowIn || nowIn.kind === 'trash') return nowIn ? '<div class="ir-now"><b>Left out.</b> It’s in the Trash, where you can still get it back.</div>' : '';
      const sib = []; U.walkTree(nowIn.children || [], n => { if (n.type === 'doc') sib.push(n); });
      const i = sib.findIndex(n => n.id === it.n.id), from = Math.max(0, Math.min(i - 2, sib.length - 5)), part = sib.slice(from, from + 5);
      const apply = (isDone(it.n.id) || placed(it.n.id)) && sameFolder.length ? `<button type="button" class="btn small ir-apply" data-apply>Apply to all in folder (${sameFolder.length} more from “${esc(it.from)}”)</button>` : '';
      return `<div class="ir-now"><b>${it.from && it.from !== nowIn.title ? `Now in ${esc(nowIn.title)}` : `In ${esc(nowIn.title)}`}</b>${apply}
        <div class="ir-now-l">${from ? `<span class="ir-now-m">… ${from} more</span>` : ''}${part.map(n => `<span class="${n.id === it.n.id ? 'on' : ''}">${n.id === it.n.id ? '▸ ' : ''}${esc(n.title || 'Untitled')}</span>`).join('')}${sib.length > from + 5 ? `<span class="ir-now-m">… ${sib.length - from - 5} more</span>` : ''}</div></div>`;
    };
    body.innerHTML = `<div class="ir-pad ir-docs">
      <div class="ir-h"><div><h1>${kind === 'characters' ? 'Characters' : 'Places, items and notes'}</h1><p class="ir-sub">${list.length ? `Pick where each document goes. Unwip has made a first guess: ${kind === 'characters' ? 'these look like they’re about people' : 'everything else from your import'}.` : 'Nothing here to sort. On to the next step.'}</p></div>
        ${guessable.length ? `<button type="button" class="btn small ir-useall" data-useall title="Each one goes where Unwip guessed, and is ticked off">Use Unwip’s guesses for the rest (${guessable.length})</button>` : ''}
        ${list.length ? `<div class="ir-prog"><span class="ir-count">Document ${sel + 1} of ${list.length} · ${done} done</span><span class="ir-prog-bar"><i style="width:${Math.round(100 * done / list.length)}%"></i></span></div>` : ''}</div>
      ${list.length ? `<div class="ir-split">
        <aside class="ir-list">${list.map((x, i) => `<button type="button" class="ir-li ${i === sel ? 'on' : ''} ${isDone(x.n.id) ? 'done' : ''}" data-i="${i}"><b>${isDone(x.n.id) ? '<i class="ir-tick">✓</i>' : ''}${esc(x.n.title || 'Untitled')}</b><span>${esc(placeOf(x))}</span></button>`).join('')}</aside>
        <article class="ir-card">
          <div class="ir-card-h"><b>${esc(it.n.title || 'Untitled')}</b><span>${pl(it.n.words || 0, 'word')}</span></div>
          <span class="ir-from">From: ${esc(it.from || '')}</span>
          ${lst || madeFrom(it.n.id) ? `<div class="ir-peek">${previewHTML(cache[it.n.id])}</div>` : wholePreview(it, true)}
          ${it && madeFrom(it.n.id) ? (() => { const m = madeFrom(it.n.id); return `<div class="ir-made"><span>Made from <b>${esc(m.title)}</b>, one of ${m.pages.length} pages.</span><button type="button" class="btn small" data-unsplit="${esc(m.id)}">Change back to one document</button></div>`; })() : ''}
          ${lst ? (() => { const p = pickOf(it.n.id); return `<div class="ir-q ${p ? '' : 'ir-ask'}">It lists ${lst.count} ${noun[1]}. How should it come in?</div>
            <div class="ir-two ir-pick" role="group" aria-label="How it comes in"><button type="button" class="btn ${p === 'pages' ? 'primary' : ''}" data-pages aria-pressed="${p === 'pages'}">${p === 'pages' ? '✓ ' : ''}One page per ${noun[0]} (${lst.count} pages)</button><button type="button" class="btn ${p === 'whole' ? 'primary' : ''}" data-whole aria-pressed="${p === 'whole'}">${p === 'whole' ? '✓ ' : ''}Keep it as one document</button></div>
            ${p ? `<p class="ir-kept">${byUnwip(it.n.id) ? 'Unwip’s pick. ' : 'Picked. '}${p === 'pages' ? `The ${lst.count} pages are made when you move on. Switch if you’d rather.` : 'It stays one document. Switch if you’d rather.'}</p>` : ''}
            ${p === 'whole' ? wholePreview(it) : previewBlock(it)}`; })() : ''}
          ${g && rootByKind(g.kind) ? (g.kind === where(it.n.id) ? `<div class="ir-guess agree"><span class="ir-g-t">Unwip’s guess: <b>${esc(rootTitle(g.kind))}</b>, where it is now · ${esc(g.why)}</span></div>`
            : `<div class="ir-guess"><span class="ir-g-t">Unwip’s guess: <b>${esc(rootTitle(g.kind))}</b> · ${esc(g.why)}</span><button type="button" class="btn small primary" data-guess>Put it there</button></div>`) : ''}
          <div class="ir-q">Where does it go?</div>
          <div class="ir-dests">${dests().map(([k, l]) => `<button type="button" class="btn ${where(it.n.id) === k ? 'primary' : ''} ${k === 'trash' ? 'ir-out' : ''} ${g && g.kind === k && where(it.n.id) !== k ? 'ir-guessed' : ''}" data-to="${esc(k)}">${esc(l)}</button>`).join('')}<button type="button" class="btn ghost ir-newsec" data-newsec>+ New section…</button></div>
          ${sectionPeek()}
          <div class="ir-nav"><button type="button" class="btn ghost" data-prev ${sel ? '' : 'disabled'}>‹ Previous</button><button type="button" class="btn ${isDone(it.n.id) ? 'primary' : 'ghost'}" data-skip>${sel < list.length - 1 ? 'Next document ›' : `Next: ${esc((kind === 'characters' ? STEPS[3] : STEPS[4])[1])} ›`}</button></div>
        </article></div>` : ''}
      ${names.length ? (() => { const sure = names.filter(x => x.sure), less = names.filter(x => !x.sure), row = x => `<div class="ir-name"><b>${esc(x.name)}</b><span>${pl(x.count, 'time')}</span><button type="button" class="btn small" data-make="${esc(x.name)}">Make a page</button><button type="button" class="btn ghost small" data-not="${esc(x.name)}">Not a person</button></div>`;
        return `<div class="ir-cap">Names that come up a lot in your chapters</div>${sure.length ? `<div class="ir-names">${sure.map(row).join('')}</div>` : ''}
        ${less.length ? `<details class="ir-more" ${namesOpen || !sure.length ? 'open' : ''}><summary>More names, less sure (${less.length})</summary><p class="ir-hint">Fewer mentions, or names that also start a lot of sentences.</p><div class="ir-names">${less.map(row).join('')}</div></details>` : ''}
        <p class="ir-missed">Missed someone? You can make a page for anyone later in Characters, and their Appears in list fills in by itself.</p>`; })() + `
        <p class="ir-hint">Counted by plain rules on this device, no AI.</p>` : ''}
    </div>`;
    const again = () => { remember(body, it && it.n.id); stepDocs(kind); };
    // leaving this document with "one page per person" picked: the pages are made now (the review window can still
    // untick names). Cancelled there: nothing is picked, and you stay.
    const commitPick = async () => {
      if (!it || pickOf(it.n.id) !== 'pages' || !U.findNode(it.n.id) || U.rootOf(it.n.id).kind === 'trash' || !isList(it.n.id) || !window.UnwipSheets) return true;
      const id = it.n.id, title = it.n.title;
      window.UnwipSheets.convert.last = [];
      await window.UnwipSheets.convert([id]); cache = {};
      const rec = (window.UnwipSheets.convert.last || []).find(r => r.id === id);
      const st = S.project.importSort;
      if (!rec) { delete (st.pick || {})[id]; delete (st.split || {})[id]; U.scheduleMeta(); again(); return false; }
      $$('.toast.with-action').forEach(t => t.remove());   // its Undo is the card's "Change back" here
      st.made = (st.made || []).concat([{ ...rec, title }]); markDone(id); rec.pages.forEach(markDone); U.scheduleMeta();
      return true;
    };
    const unsplit = oid => {
      const st = S.project.importSort, rec = (st.made || []).find(m => m.id === oid); if (!rec) return;
      if (rec.newRoot) { const i = S.project.binder.findIndex(r => r.id === rec.newRoot); if (i >= 0) S.project.binder.splice(i, 1); }
      else { const fo = U.findNode(rec.folder); if (fo) fo.list.splice(fo.index, 1); }
      const t = U.findNode(oid);
      if (t && U.rootOf(oid).kind === 'trash') {
        t.list.splice(t.index, 1);
        const p = rec.parent && U.findNode(rec.parent), into = p ? p.node.children : (rootByKind('characters') || rootByKind('notes')).children;
        into.splice(Math.min(rec.index, into.length), 0, t.node);
      }
      st.made = st.made.filter(m => m !== rec); st.done = (st.done || []).filter(x => !rec.pages.includes(x));
      setPick(oid, 'whole'); cache = {}; U.renderBinder(); if (U.scheduleNames) U.scheduleNames(0);
      wantId = oid; U.toast(`“${esc(rec.title)}” is one document again.`);
      // back to it, in whichever sorting step it belongs to now
      if (stepList(kind).some(x => x.n.id === oid)) stepDocs(kind); else go(kind === 'characters' ? 'world' : 'characters');
    };
    $$('[data-unsplit]', body).forEach(b => b.onclick = () => unsplit(b.dataset.unsplit));
    $$('.ir-li', body).forEach(b => b.onclick = async () => { const to = list[+b.dataset.i]; if (to === it) return; if (!(await commitPick())) return; wantId = to && to.n.id; stepDocs(kind); });
    const nav = async d => { if (!(await commitPick())) return; const to = list[Math.max(0, Math.min(list.length - 1, sel + d))]; wantId = to && to.n.id; if (d > 0 && it && !undecidedList(it.n.id)) markDone(it.n.id); sel = Math.max(0, Math.min(list.length - 1, sel + d)); stepDocs(kind); };
    const pv = $('[data-prev]', body); if (pv) pv.onclick = () => nav(-1);
    // on the last document it goes on to the next step (beta, 20 Oct: it was greyed out there, and looked stuck)
    const sk = $('[data-skip]', body); if (sk) sk.onclick = () => { if (sel < list.length - 1) return nav(1); if (it && !undecidedList(it.n.id)) markDone(it.n.id); const nx = $('.ir-next', foot); if (nx) nx.click(); };   // .ir-next makes picked pages first (below)
    // choosing a section moves it there and shows the result; Next document moves on
    $$('[data-to]', body).forEach(b => b.onclick = () => {
      const k = b.dataset.to;
      if (k === 'trash') { const t = U.findNode('root-trash'); if (t && where(it.n.id) !== 'trash') { const f = U.findNode(it.n.id); f.list.splice(f.index, 1); t.node.children.push(f.node); U.scheduleMeta(); U.renderBinder(); } }
      else if (where(it.n.id) !== k) moveToRoot(it.n.id, k);
      if (byUnwip(it.n.id)) { const st = S.project.importSort; delete st.pick[it.n.id]; delete (st.split || {})[it.n.id]; st.done = (st.done || []).filter(x => x !== it.n.id); }   // re-picked for where it is now
      markPlaced(it.n.id); if (!undecidedList(it.n.id) && pickOf(it.n.id) !== null) markDone(it.n.id); rememberChoice(it.n.id); again();
    });
    const sendTo = (id, k) => {
      if (k === 'trash') { const t = U.findNode('root-trash'), f = U.findNode(id); if (t && f && U.rootOf(id).kind !== 'trash') { f.list.splice(f.index, 1); t.node.children.push(f.node); } }
      else if (where(id) !== k) moveToRoot(id, k);
      if (!undecidedList(id)) markDone(id);
    };
    // the lists among some documents just moved together: one review window for all of them ("Make the sheets")
    const splitLists = async ids => {
      const lists = ids.filter(id => U.findNode(id) && (undecidedList(id) || (pickOf(id) === 'pages' && isList(id))) && U.rootOf(id).kind !== 'trash'); if (!lists.length || !window.UnwipSheets) return;
      const titles = Object.fromEntries(lists.map(id => [id, U.findNode(id).node.title]));
      window.UnwipSheets.convert.last = [];
      await window.UnwipSheets.convert(lists); cache = {};
      const st = S.project.importSort; for (const r of window.UnwipSheets.convert.last || []) { st.made = (st.made || []).concat([{ ...r, title: titles[r.id] || '' }]); r.pages.forEach(markDone); }
      // only the lists really made into pages are ticked off (Cancel in the review window used to tick them all: the cache
      // was just cleared, so they no longer looked like lists)
      for (const r of window.UnwipSheets.convert.last || []) { decide(r.id, 'pages'); markDone(r.id); }
      return (window.UnwipSheets.convert.last || []).length;
    };
    const gb = $('[data-guess]', body); if (gb) gb.onclick = () => { sendTo(it.n.id, g.kind); rememberChoice(it.n.id); again(); };
    const ua = $('[data-useall]', body); if (ua) ua.onclick = async () => { for (const x of guessable) sendTo(x.n.id, G[x.n.id].kind); U.scheduleMeta(); U.renderBinder(); U.toast(`${pl(guessable.length, 'document')} went where Unwip guessed. Anything can still be moved.`); await splitLists(guessable.map(x => x.n.id)); again(); };
    const ap = $('[data-apply]', body); if (ap) ap.onclick = async () => { const k = where(it.n.id); for (const x of sameFolder) sendTo(x.n.id, k); U.scheduleMeta(); U.renderBinder(); U.toast(`${pl(sameFolder.length, 'more document')} from “${esc(it.from)}” went to ${esc(nowIn.title)}.`); await splitLists([it.n.id, ...sameFolder.map(x => x.n.id)]); again(); };
    const ns = $('[data-newsec]', body); if (ns) ns.onclick = async () => {
      const before = new Set(S.project.binder.map(r => r.id));
      if (U.templateGallery) await U.templateGallery();
      const made = S.project.binder.find(r => r.root && !before.has(r.id));
      if (made) { moveToRoot(it.n.id, made.kind); markDone(it.n.id); rememberChoice(it.n.id); }
      again();
    };
    const pg = $('[data-pages]', body); if (pg) pg.onclick = () => { setPick(it.n.id, 'pages'); const st = S.project.importSort; st.done = (st.done || []).filter(x => x !== it.n.id); again(); };
    $$('[data-pv]', body).forEach(b => b.onclick = () => { pvAt[it.n.id] = (pvAt[it.n.id] || 0) + +b.dataset.pv; again(); });
    const pvd = $('.ir-pv', body); if (pvd) pvd.ontoggle = () => { try { localStorage.setItem('unwip-ir-pv', pvd.open ? '1' : '0'); } catch {} };
    const wh = $('[data-whole]', body); if (wh) wh.onclick = () => { setPick(it.n.id, 'whole'); again(); };   // only picks it: stays on the card, the preview follows
    const more = $('.ir-more', body); if (more) more.ontoggle = () => { namesOpen = more.open; };
    $$('[data-make]', body).forEach(b => b.onclick = async () => { await makePerson(b.dataset.make); U.toast(`A page for <b>${esc(b.dataset.make)}</b> is in Characters.`); again(); });
    $$('[data-not]', body).forEach(b => b.onclick = () => { const st = S.project.importSort; st.notNames = [...new Set([...(st.notNames || []), b.dataset.not])]; U.scheduleMeta(); again(); });
    // moving on to the next step with documents here not looked at yet: a gentle reminder first
    const next = $('.ir-next', foot), left = list.filter(x => !isDone(x.n.id) && pickOf(x.n.id) !== 'pages');
    if (next && left.length && it) next.onclick = () => {
      if (room.querySelector('.ir-remind')) return go(kind === 'characters' ? 'world' : 'check');
      const box = document.createElement('div'); box.className = 'ir-remind';
      const what = kind === 'characters' ? (left.length === 1 ? 'character document' : 'character documents') : (left.length === 1 ? 'document' : 'documents');
      box.innerHTML = `<span><b>${left.length} more ${what}</b> to look at here${kind === 'characters' ? ' before places and the rest' : ''}.</span><button type="button" class="btn primary small" data-look>Look at the next one</button><button type="button" class="btn ghost small" data-on>Move on anyway</button>`;
      foot.parentNode.insertBefore(box, foot);
      $('[data-look]', box).onclick = () => { sel = list.indexOf(left[0]); stepDocs(kind); };
      $('[data-on]', box).onclick = () => go(kind === 'characters' ? 'world' : 'check');
    };
    // leaving the step: this document's pick first, then every other list picked for pages, in one review window
    const commitAll = async () => { if (!(await commitPick())) return false; await splitLists(list.filter(x => x !== it && U.findNode(x.n.id) && pickOf(x.n.id) === 'pages').map(x => x.n.id)); return true; };
    for (const b of $$('.ir-prev, .ir-next', foot)) {   // (Sort the rest later keeps the picks for next time)
      const f = b.onclick; if (f) b.onclick = async e => { if (await commitAll()) f.call(b, e); }; }
    restoreScroll(body);
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
  let namesOpen = false;   // the "less sure" fold stays open while you work through it
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
      if (count < 3 || parts.some(p => NOT.has(p.replace(/[’']/g, ''))) || skip.has(name.toLowerCase()) || parts.some(p => skip.has(p.toLowerCase())) || parts.every(p => lower.has(p.toLowerCase()))) continue;
      out.push({ name, count });
    }
    // "Van Helsing" over a lone "Helsing" that only ever follows it
    const keep = out.filter(x => !out.some(y => y !== x && y.name.split(' ').includes(x.name) && y.count >= x.count * 0.8));
    // every name it found (beta, 20 Oct: only the top 6 showed, so important people mentioned a dozen times turned up
    // late or not at all). The surest come first; the rest, and anything under 6 mentions, are "less sure".
    keep.sort((a, b) => b.count - a.count);
    return keep.slice(0, 60).map((x, i) => ({ ...x, sure: i < 8 && x.count >= 6 }));
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
    $('.ir-next', foot).onclick = () => { delete S.project.importSort; U.scheduleMeta(); close(); U.toast('All sorted. Enjoy the new home.'); if (window.UnwipIntro && window.UnwipIntro.importTour) setTimeout(() => window.UnwipIntro.importTour(), 600); };
  }

  setupButton();
  return { open, close, afterImport, resume, go, splitDoc, suggestNames, guideOn, get step() { return step; } };
})();
