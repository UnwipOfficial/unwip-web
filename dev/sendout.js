// Unwip - Send a book out. The other half of the Import / Export room (the button in the main screen's bottom right
// corner): a book goes back to Scrivener, or into Word, Google Docs, Obsidian or a Markdown folder, one step at a time.
//   1. Where to      which book, and which app it's going to
//   2. Structure     the shape it arrives in: as Unwip has it, as it came in (Scrivener), chapters only, one file...
//   3. What changes  anything that travels in a different form (character sheets, the Story Bible, maps, comments),
//                    each with a tick box, and anything that stays behind
//   4. Check it over the word proof: the words in the manuscript here against the words that went out
// It uses the exporters that were already here (scrivexport.js, exportfolder.js, docx.js) and never changes the book.
// Inside a book, Export › No hard feelings… opens this with the book already picked.
window.UnwipSendOut = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return;
  const { S, api, esc, $, $$ } = U;
  const STEPS = [['where', 'Where to'], ['shape', 'Structure'], ['changes', 'What changes'], ['check', 'Check it over']];
  const DEST = {
    scriv: ['Scrivener', 'A .scriv project with its binder, notes, labels and status.'],
    word: ['Word', 'One .docx, or one per chapter. Chapter names become headings.'],
    gdocs: ['Google Docs', 'A Word file Google Docs opens as it is. Upload it to your Drive.'],
    obsidian: ['Obsidian', 'A vault folder of Markdown files. Names of characters and places become [[links]].'],
    md: ['Markdown folder', 'Plain .md files in folders, for iA Writer, Bear, Typora and the rest.']
  };
  const SHAPES = {
    unwip: ['As Unwip has it now', 'Your folders, chapters, characters and notes, the way you’ve sorted them here.'],
    origin: ['As it came in', 'No hard feelings. Put it back exactly as Scrivener had it: the same folders, order, names and icons, with what you wrote here next to the chapter before it.'],
    flat: ['Chapters only', 'Every chapter in story order, with no folders. Notes, characters and the rest stay behind.'],
    ms: ['Manuscript only', 'Just the chapters, in their folders. Notes, characters and the rest stay behind.'],
    one: ['One file', 'The whole manuscript in one file, each chapter on a new page under its name.'],
    each: ['A file per chapter', 'In folders like your chapter list, numbered “01 - …” so they stay in order.'],
    vellum: ['For Vellum or Atticus', 'One file laid out the way those apps import a book: chapter names as Heading 1, scene breaks as ***.']
  };
  const shapesFor = to => to === 'scriv' ? ['unwip', 'origin', 'flat'] : to === 'word' ? ['one', 'each', 'vellum'] : to === 'gdocs' ? ['one', 'each'] : ['unwip', 'ms'];
  const SLOT = { back: 'Back', ringl: 'Ring (L)', ringr: 'Ring (R)', legs: 'Legs', head: 'Head', neck: 'Neck', chest: 'Chest', gloves: 'Gloves', main: 'Main hand', off: 'Off-hand', other: 'Other' };
  const RAR = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legend: 'Legendary' };
  const pl = (n, w, ws) => `${U.fmt(n)} ${n === 1 ? w : (ws || w + 's')}`;
  const safe = t => (t || 'Untitled').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 80) || 'Untitled';
  const pad = (i, n) => String(i + 1).padStart(Math.max(2, String(n).length), '0');
  const run = (text, o = {}) => ({ text, bold: !!o.bold, italic: !!o.italic, underline: false, strike: false, sup: false, sub: false, font: null, size: null, color: null, bg: null });
  const blk = (tag, runs) => ({ tag, align: null, indent: null, lineHeight: null, runs });
  const countWords = blocks => window.UnwipNoHardFeelings ? window.UnwipNoHardFeelings.countWords(blocks) : 0;
  const ICON = {
    back: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    in: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v3h16v-3"/></svg>',
    out: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5"/><path d="M4 17v3h16v-3"/></svg>'
  };

  // ---------------------------------------------------------------- what was sent recently (this device)
  const LOG = 'unwip-moves';
  const recent = () => { try { const l = JSON.parse(localStorage.getItem(LOG) || '[]'); return Array.isArray(l) ? l.slice(0, 5) : []; } catch { return []; } };
  const remember = x => { try { localStorage.setItem(LOG, JSON.stringify([x, ...recent().filter(y => !(y.slug === x.slug && y.to === x.to))].slice(0, 5))); } catch {} };
  const when = t => t ? new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : 'recently';

  // ---------------------------------------------------------------- the room
  let room = null, st = null;
  function shell(cur, opts = {}) {
    if (room) room.remove();
    room = document.createElement('div'); room.className = 'ir so'; room.id = 'send-room';
    const i = STEPS.findIndex(s => s[0] === cur);
    room.innerHTML = `<header class="ir-head">
        <button type="button" class="ir-back">${ICON.back}<span>${opts.backLabel || 'Import / Export'}</span></button>
        <b class="ir-title">${opts.title || 'Send a book out'}</b>
        <span class="ir-sp"></span>
        ${i >= 0 ? `<ol class="ir-steps">${STEPS.map(([, l], n) => `<li class="${n < i ? 'done' : n === i ? 'on' : ''}">${n < i ? '✓' : n + 1} ${esc(l)}</li>`).join('')}</ol>` : ''}
      </header>
      <div class="ir-phonebar">${i >= 0 ? `<span>Step ${i + 1} of ${STEPS.length} · ${esc(STEPS[i][1])}</span><span class="ir-bars">${STEPS.map((s, n) => `<i class="${n <= i ? 'on' : ''}"></i>`).join('')}</span>` : ''}</div>
      <div class="ir-body"></div><footer class="ir-foot"></footer>`;
    document.body.appendChild(room);
    $('.ir-back', room).onclick = () => (opts.onBack || (() => choose()))();
    document.removeEventListener('keydown', keys, true); document.addEventListener('keydown', keys, true);
    return { body: $('.ir-body', room), foot: $('.ir-foot', room) };
  }
  async function close() {
    if (room) { room.remove(); room = null; }
    document.removeEventListener('keydown', keys, true);
    // a book opened just to send it goes back to the shelf
    if (st && st.openedHere && S.slug) { try { await U.leaveProject(); } catch {} }
    if (!S.slug) U.showLibrary();
    st = null;
  }
  function keys(e) { if (e.key === 'Escape' && room && !document.querySelector('.modal-back')) { e.stopPropagation(); close(); } }

  // ---------------------------------------------------------------- Import / Export: in or out
  async function choose() {
    const keep = st; st = null;
    if (keep && keep.openedHere && S.slug) { try { await U.leaveProject(); } catch {} }
    const { body, foot } = shell('', { title: 'Import / Export', backLabel: S.slug ? 'Back to the book' : 'Your books', onBack: close });
    room.classList.add('so-choose'); foot.remove();
    const list = await api.listProjects().catch(() => []);
    const sorting = list.filter(p => p.sorting), sent = recent().filter(x => list.some(p => p.slug === x.slug));
    body.innerHTML = `<div class="so-ch">
      <div class="so-ch-h"><h1>Moving a book?</h1><p class="ir-sub">Coming in or going out, it’s one step at a time, and your words always come with you.</p></div>
      <div class="so-cards">
        <button type="button" class="so-card" data-go="in"><span class="so-ic so-ic-in">${ICON.in}</span><b>Bring a book in</b><span>From Scrivener, Word, Google Docs, Obsidian or Markdown. It comes in as it is, then you sort it a section at a time.</span></button>
        <button type="button" class="so-card" data-go="out"><span class="so-ic so-ic-out">${ICON.out}</span><b>Send a book out</b><span>Back to Scrivener, or into Word, Google Docs, Obsidian or Markdown, in the shape you want. Unwip shows you anything that changes on the way.</span></button>
      </div>
      ${sent.length || sorting.length ? `<div class="so-recent"><div class="ir-cap">Recently</div>
        ${sent.map((x, n) => `<div class="ir-pend"><div><b>${esc(x.title)} → ${esc((DEST[x.to] || [x.to])[0])}</b><span>Sent out ${esc(when(x.at))} · ${esc((SHAPES[x.shape] || [''])[0])}${x.words ? ` · ${pl(x.words, 'word')}` : ''}</span></div><button type="button" class="btn" data-again="${n}">Send again</button></div>`).join('')}
        ${sorting.map(p => `<div class="ir-pend"><div><b>${esc(p.title)} ←</b><span>Brought in ${esc(when(p.sortingAt))} · still being sorted</span></div><button type="button" class="btn" data-carry="${esc(p.slug)}">Carry on</button></div>`).join('')}</div>` : ''}
      <p class="ir-hint so-foot">Making a print-ready PDF or an EPUB to publish? That’s Export inside the book, where you can preview every page.</p></div>`;
    $('[data-go="in"]', body).onclick = () => { if (room) room.remove(); room = null; window.UnwipImportRoom && window.UnwipImportRoom.open(); };
    $('[data-go="out"]', body).onclick = () => open({ slug: S.slug || '' });
    $$('[data-again]', body).forEach(b => b.onclick = () => { const x = sent[+b.dataset.again]; open({ slug: x.slug, to: x.to, shape: x.shape }); });
    $$('[data-carry]', body).forEach(b => b.onclick = async () => { const slug = b.dataset.carry; if (room) room.remove(); room = null; const ok = await U.openProject(slug); if (ok !== false && window.UnwipImportRoom) window.UnwipImportRoom.resume(); });
  }

  // ---------------------------------------------------------------- 1. which book, where to
  async function open(o = {}) {
    try { await U.flushAll(); } catch {}
    st = { slug: o.slug || S.slug || '', to: o.to || 'scriv', shape: o.shape || '', openedHere: false, peek: null, opts: {}, list: [] };
    return stepWhere();
  }
  async function peek(slug) {
    if (!slug) return null;
    if (slug === S.slug && S.project) return S.project;
    try { return await api.openProject(slug); } catch { return null; }
  }
  async function stepWhere() {
    const { body, foot } = shell('where');
    st.list = await api.listProjects().catch(() => []);
    if (!st.list.some(p => p.slug === st.slug)) st.slug = (st.list[0] || {}).slug || '';
    st.peek = await peek(st.slug);
    const draw = () => {
      const came = st.peek && st.peek.scrivOrigin;
      body.innerHTML = `<div class="ir-pad so-pad">
        <div><h1>Which book, and where is it going?</h1><p class="ir-sub">Unwip keeps its own copy. Sending a book out never changes it here.</p></div>
        <div class="ir-cap">The book</div>
        <div class="so-books">${st.list.length ? st.list.map(p => `<button type="button" class="so-book ${p.slug === st.slug ? 'on' : ''}" data-book="${esc(p.slug)}"><span class="so-spine"></span><span><b>${esc(p.title)}</b><small>${pl(p.words || 0, 'word')}</small></span></button>`).join('') : '<p class="ir-hint">There are no books here yet.</p>'}</div>
        <div class="ir-cap">Where to</div>
        <div class="so-dests">${Object.entries(DEST).map(([k, [l, d]]) => `<button type="button" class="so-dest ${k === st.to ? 'on' : ''}" data-to="${k}"><b>${esc(l)}</b><span>${esc(d)}</span>${k === 'scriv' && came ? '<em>Where it came from</em>' : ''}</button>`).join('')}</div>
        <p class="ir-hint">Or keep everything exactly as it is here: <button type="button" class="linkish" id="so-backup">save a full Unwip backup</button> of this book.</p></div>`;
      $$('[data-book]', body).forEach(b => b.onclick = async () => { st.slug = b.dataset.book; st.peek = await peek(st.slug); st.shape = ''; draw(); });
      $$('[data-to]', body).forEach(b => b.onclick = () => { st.to = b.dataset.to; st.shape = ''; draw(); });
      $('#so-backup', body).onclick = backup;
      foot.innerHTML = `<span class="so-sum">${st.peek ? `${esc(st.peek.title || '')} to ${esc(DEST[st.to][0])}` : ''}</span><span class="ir-sp"></span><button type="button" class="btn primary ir-next" ${st.slug ? '' : 'disabled'}>Next: structure ›</button>`;
      $('.ir-next', foot).onclick = async () => { if (await ready()) stepShape(); };
    };
    draw();
  }
  // the exporters work on the open book, so the chosen one is opened (and put away again afterwards)
  async function ready() {
    if (!st.slug) return false;
    if (S.slug !== st.slug) {
      const ok = await U.openProject(st.slug);
      if (ok === false || S.slug !== st.slug) { U.toast('Couldn’t open that book.', 'warn'); return false; }
      st.openedHere = true;
      if (room) document.body.appendChild(room);   // keep the room on top of the book
    }
    try { await U.flushSave(); } catch {}
    return true;
  }
  async function backup() {
    if (!(await ready())) return;
    try { const p = await api.backupExport(S.slug); if (p) U.toast('Full backup saved.'); } catch (e) { U.toast('Couldn’t save the backup.', 'warn'); }
  }

  // ---------------------------------------------------------------- 2. structure
  const kindOf = r => r.kind;
  function treeLines(shape) {
    const P = S.project, lines = [];
    const add = (t, d, cls = '') => lines.push(`<div class="so-tl ${cls}" style="--d:${d}">${esc(t)}</div>`);
    const ms = P.binder.find(r => r.kind === 'manuscript') || { children: [] };
    if (shape === 'flat' || shape === 'one' || shape === 'vellum') {
      const ch = []; U.walkTree(ms.children || [], n => { if (n.type !== 'folder' && !n.map) ch.push(n); });
      if (shape === 'flat') add('📁 Draft', 0);
      ch.slice(0, 5).forEach((n, i) => add(`${shape === 'flat' ? '📄 ' : ''}${i + 1}. ${n.title || 'Untitled'}`, shape === 'flat' ? 1 : 0));
      if (ch.length > 5) add(`… ${ch.length - 5} more`, shape === 'flat' ? 1 : 0, 'so-tl-m');
      if (shape !== 'flat') lines.unshift(`<div class="so-tl so-tl-m">📄 ${esc(safe(P.title))}.docx</div>`);
      return lines.join('');
    }
    if (shape === 'origin' && P.scrivOrigin && window.UnwipNoHardFeelings) {
      let tops = []; try { tops = window.UnwipNoHardFeelings.restoreTree(P); } catch {}
      for (const v of tops.slice(0, 5)) { add(`📁 ${v.title != null ? v.title : (v.n && v.n.title) || 'Untitled'}`, 0); for (const k of (v.kids || []).slice(0, 2)) add(`${k.folder ? '📁' : '📄'} ${k.title != null ? k.title : (k.n && k.n.title) || 'Untitled'}`, 1); if ((v.kids || []).length > 2) add(`… ${v.kids.length - 2} more`, 1, 'so-tl-m'); }
      return lines.join('');
    }
    const roots = P.binder.filter(r => r.kind !== 'conflicts' && r.kind !== 'trash' && (r.children || []).length && (shape !== 'ms' || r.kind === 'manuscript'));
    for (const r of roots.slice(0, 5)) { add(`📁 ${r.title}`, 0); for (const k of (r.children || []).slice(0, 2)) add(`${k.type === 'folder' ? '📁' : '📄'} ${k.title || 'Untitled'}`, 1); if ((r.children || []).length > 2) add(`… ${r.children.length - 2} more`, 1, 'so-tl-m'); }
    return lines.join('');
  }
  function stepShape() {
    const { body, foot } = shell('shape');
    const P = S.project, list = shapesFor(st.to);
    if (!list.includes(st.shape)) st.shape = st.to === 'scriv' && P.scrivOrigin ? 'origin' : list[0];
    const draw = () => {
      body.innerHTML = `<div class="ir-pad so-pad">
        <div><h1>What shape should it arrive in?</h1><p class="ir-sub">Pick the layout you want to open in ${esc(DEST[st.to][0])}. The words are the same either way.</p></div>
        <div class="so-shapes">${list.map(k => { const off = k === 'origin' && !P.scrivOrigin; return `<button type="button" class="so-shape ${k === st.shape ? 'on' : ''}" data-shape="${k}" ${off ? 'disabled' : ''}>
          <span class="so-sh-t"><i class="so-radio"></i><b>${esc(SHAPES[k][0])}</b></span>
          <span class="so-sh-d">${esc(off ? 'Only for books brought in from Scrivener. This one started here, so there’s nothing to put back.' : SHAPES[k][1])}</span>
          ${off ? '' : `<span class="so-tree">${treeLines(k)}</span>`}</button>`; }).join('')}</div></div>`;
      $$('[data-shape]', body).forEach(b => b.onclick = () => { if (b.disabled) return; st.shape = b.dataset.shape; draw(); });
    };
    draw();
    foot.innerHTML = `<button type="button" class="btn ghost ir-prev">‹ Back</button><span class="ir-sp"></span><button type="button" class="btn primary ir-next">Next: what changes ›</button>`;
    $('.ir-prev', foot).onclick = stepWhere;
    $('.ir-next', foot).onclick = stepChanges;
  }

  // ---------------------------------------------------------------- 3. what changes
  const rootsFor = () => {
    const P = S.project, all = P.binder.filter(r => r.kind !== 'conflicts' && r.kind !== 'trash' && (r.children || []).length);
    return ['flat', 'ms', 'one', 'vellum'].includes(st.shape) ? all.filter(r => r.kind === 'manuscript') : all;
  };
  const oneFile = () => ['one', 'vellum'].includes(st.shape);
  function gearOf(n) {
    const s = n.csheet && n.csheet.slots; if (!s) return [];
    const out = [];
    for (const [k, hist] of Object.entries(s)) { const h = Array.isArray(hist) ? hist[hist.length - 1] : null; if (h && h.name) out.push([SLOT[k] || k, h.name, RAR[h.rar] || '']); }
    return out;
  }
  function bibleBits() {
    const B = (S.project.bible && typeof S.project.bible === 'object') ? S.project.bible : {};
    const facts = (Array.isArray(B.facts) ? B.facts : []).filter(f => f && typeof f.text === 'string');
    const threads = (Array.isArray(B.threads) ? B.threads : []).filter(t => t && typeof t.title === 'string');
    const gloss = (Array.isArray(B.glossary) ? B.glossary : []).filter(g => g && typeof g.term === 'string');
    return { facts, threads, gloss, count: facts.length + threads.length + gloss.length };
  }
  // the Story Bible as blocks: facts under the page they're about, then plot threads and the glossary
  function bibleBlocks() {
    const { facts, threads, gloss } = bibleBits(), out = [blk('h1', [run('Story Bible')])];
    const title = id => { const f = id && U.findNode(id); return f ? f.node.title || 'Untitled' : ''; };
    const by = new Map(); for (const f of facts) { const t = title(f.node) || 'Other'; (by.get(t) || by.set(t, []).get(t)).push(f); }
    for (const [t, F] of by) { out.push(blk('h2', [run(t)])); for (const f of F) out.push(blk('p', [...(f.topic ? [run(f.topic + ': ', { bold: true })] : []), run(f.text), ...(title(f.ch) ? [run(` (${title(f.ch)})`, { italic: true })] : [])])); }
    if (threads.length) { out.push(blk('h2', [run('Plot threads')])); for (const t of threads) out.push(blk('p', [run(t.title, { bold: true }), run(` (${t.status === 'paid' ? 'paid off' : t.status === 'dropped' ? 'dropped' : 'still open'})`, { italic: true }), ...(t.note ? [run(': ' + t.note)] : [])])); }
    if (gloss.length) { out.push(blk('h2', [run('Glossary')])); for (const g of gloss) out.push(blk('p', [run(g.term, { bold: true }), ...(g.meaning ? [run(': ' + g.meaning)] : [])])); }
    return out;
  }
  const blocksHTML = blocks => blocks.map(b => `<${b.tag === 'li' ? 'p' : b.tag}>${b.runs.map(r => { let t = esc(r.text || ''); if (r.italic) t = `<i>${t}</i>`; if (r.bold) t = `<b>${t}</b>`; return t; }).join('')}</${b.tag === 'li' ? 'p' : b.tag}>`).join('');
  // comments in a document's text: the words they're on, and what they say
  function commentsIn(html) {
    const d = document.createElement('div'); d.innerHTML = html || ''; const m = new Map();
    for (const s of d.querySelectorAll('span.cmt[data-cid]')) { const id = s.dataset.cid; if (!m.has(id)) m.set(id, { on: '', note: s.dataset.note || '' }); m.get(id).on += s.textContent; }
    return [...m.values()].map(c => ({ on: c.on.replace(/\s+/g, ' ').trim().slice(0, 200), note: c.note.trim() })).filter(c => c.on || c.note);
  }
  async function survey() {
    const P = S.project, roots = rootsFor(), docs = [], maps = [], sheets = [];
    const walk = (list, root) => { for (const n of list || []) { if (n.type === 'folder') walk(n.children, root); else if (n.map) maps.push(n); else { docs.push({ n, root }); if (root.kind === 'characters' && gearOf(n).length) sheets.push(n); } } };
    for (const r of roots) walk(r.children, r);
    let comments = 0, sys = 0, ins = 0, del = 0, syn = 0, status = 0;
    for (const { n } of docs) {
      const h = (n.id === S.docId ? U.editor.innerHTML : await api.loadDoc(S.slug, n.id).catch(() => '')) || '';
      comments += commentsIn(h).length;
      ins += (h.match(/class="tc-ins"/g) || []).length; del += (h.match(/class="tc-del"/g) || []).length;
      if (n.synopsis) syn++; if (n.status || (n.label && n.label.n)) status++;
      sys += (h.replace(/<[^>]+>/g, '').match(/\[[^\]\n]{1,200}\]/g) || []).length;
    }
    let typed = false, look = !!P.scrivLayout; U.walkTree(P.binder, n => { if (n.tt) typed = true; if (n.sv) look = true; });
    const names = []; for (const r of P.binder) if (['characters', 'places', 'items'].includes(r.kind)) U.walkTree(r.children || [], n => { if (n.type === 'doc' && !n.map && (n.title || '').trim().length > 2) names.push(n.title.trim()); });
    return { docs, maps, sheets, comments, sys, ins, del, syn, status, typed, look, names, bible: bibleBits().count };
  }
  async function stepChanges() {
    const { body, foot } = shell('changes');
    body.innerHTML = '<div class="ir-pad so-pad"><p class="ir-hint">Looking through the book…</p></div>';
    const sv = st.survey = await survey(), to = st.to, sc = to === 'scriv', one = oneFile(), O = st.opts;
    const app = DEST[to][0];
    // [key, title, what it becomes, count, ticked by default] ; a null default is a line with nothing to choose
    const rows = [];
    if (sv.sheets.length && !one) rows.push(['sheets', 'Character sheets', 'The gear in each slot, listed at the end of that character’s page', pl(sv.sheets.length, 'sheet'), true]);
    if (sv.bible && !one && st.shape !== 'flat' && st.shape !== 'ms') rows.push(['bible', 'Story Bible facts', `One “Story Bible” document${sc ? ', just above Research' : ''}, with each fact under the page it’s about, then plot threads and the glossary`, pl(sv.bible, 'entry', 'entries'), true]);
    if (sv.maps.length && !one) rows.push(['maps', 'Maps', `Pictures${sc ? ' in the binder, where the maps are here' : ', next to the chapters they sit with'}. They won’t be editable in ${app}.`, pl(sv.maps.length, 'map'), true]);
    if (sv.comments) rows.push(sc ? ['comments', 'Comments', 'Each one in its document’s notes, with the words it was on', pl(sv.comments, 'comment'), true]
      : one ? ['comments', 'Comments', 'They stay here in Unwip. A single file has nowhere to put them.', pl(sv.comments, 'comment'), null]
      : ['comments', 'Comments', 'A “Comments” file listing each one, with its chapter and the words it was on', pl(sv.comments, 'comment'), true]);
    if (to === 'obsidian' && sv.names.length && st.shape !== 'ms') rows.push(['links', 'Names', 'The first mention of each character, place and thing in a chapter becomes a [[link]] to its page', pl(sv.names.length, 'page'), true]);
    if (sc) rows.push(['titles', sv.typed ? 'Typed chapter titles' : 'Chapter names', sv.typed ? 'Put back at the top of each chapter, as they were in Scrivener' : 'Typed at the top of each chapter. Scrivener adds titles itself when it compiles, so most people leave this off.', '', sv.typed]);
    else if (!one) rows.push(['titles', 'Chapter names', 'At the top of each file', '', true]);
    if (sc && sv.look) rows.push(['look', 'How it looked in Scrivener', 'Title lines at their old size and the empty lines where you had them', '', true]);
    if (!sc && sv.syn && !oneFile()) rows.push(['syn', 'Synopses', 'A line in italics under each chapter’s name', pl(sv.syn, 'synopsis', 'synopses'), false]);
    if (sv.status) rows.push(['status', 'Status and labels', sc ? 'Scrivener’s own status and labels' : `They stay here. ${app} has nowhere to put them.`, pl(sv.status, 'document'), null]);
    if (sv.sys) rows.push(['sys', 'System message boxes', 'Plain text in [square brackets], as you typed them, so the words stay in the chapter', pl(sv.sys, 'box', 'boxes'), null]);
    for (const r of rows) if (!(r[0] in O)) O[r[0]] = r[4] !== false;
    if (!O.tcm) O.tcm = 'accept';
    body.innerHTML = `<div class="ir-pad so-pad">
      <div><h1>What changes on the way out</h1><p class="ir-sub">${esc(app)} doesn’t have everything Unwip does, so a few things travel in a different form. Untick anything you’d rather leave behind.</p></div>
      <div class="so-rows">${rows.map(([k, t, d, c, def]) => `<label class="so-row ${def === null ? 'so-info' : ''}">${def === null ? '<i class="so-dot"></i>' : `<input type="checkbox" data-opt="${k}" ${O[k] ? 'checked' : ''}>`}<b>${esc(t)}</b><span class="so-arrow">→</span><span class="so-what">${esc(d)}</span><span class="so-n">${esc(c)}</span></label>`).join('')}
      ${sv.ins + sv.del ? `<div class="so-row so-tc"><i class="so-dot"></i><b>Suggested changes</b><span class="so-arrow">→</span><span class="so-what">${pl(sv.ins + sv.del, 'suggestion')} nobody has accepted or rejected yet. In the copy:
        <select id="so-tcm"><option value="accept">accept them all</option><option value="reject">leave them all out</option>${to === 'word' || to === 'gdocs' ? '<option value="keep">keep them as suggestions</option>' : ''}</select></span><span class="so-n"></span></div>` : ''}
      </div>
      <p class="ir-hint">Connections, the timeline, the calendar and mood boards stay here in Unwip. Nothing in Unwip changes.</p></div>`;
    $$('[data-opt]', body).forEach(c => c.onchange = () => { O[c.dataset.opt] = c.checked; });
    const tcm = $('#so-tcm', body); if (tcm) { tcm.value = O.tcm; tcm.onchange = () => { O.tcm = tcm.value; }; }
    foot.innerHTML = `<button type="button" class="btn ghost ir-prev">‹ Back</button><span class="ir-sp"></span><button type="button" class="btn primary ir-next">Send it out ›</button>`;
    $('.ir-prev', foot).onclick = stepShape;
    $('.ir-next', foot).onclick = async e => { e.target.disabled = true; e.target.textContent = 'Sending…'; try { await send(); } finally { if (e.target.isConnected) { e.target.disabled = false; e.target.textContent = 'Send it out ›'; } } };
  }

  // ---------------------------------------------------------------- sending
  // the words of every manuscript chapter as they are here (with suggestions decided as asked)
  async function wordsHere(ids) {
    const XF = window.UnwipExportFolder, out = new Map();
    await XF.withChanges(st.opts.tcm === 'keep' ? 'accept' : st.opts.tcm, async () => { for (const id of ids) out.set(id, countWords(await U.docBlocks(id, 'none'))); });
    return out;
  }
  function msDocs(bookOnly) {
    const ms = S.project.binder.find(r => r.kind === 'manuscript'), ids = [];
    U.walkTree((ms && ms.children) || [], n => { if (n.type === 'doc' && !n.map && !(bookOnly && n.noBook)) ids.push(n.id); });
    return ids;
  }
  async function send() {
    const O = st.opts, to = st.to, shape = st.shape, P = S.project, name = safe(P.title || 'My book');
    let where = null, outWords = 0, files = 0, wrote = null;
    const ids = msDocs(oneFile());
    try {
      if (to === 'scriv') {
        const NHF = window.UnwipNoHardFeelings;
        const res = await NHF.buildScriv(name, null, {
          restore: !!O.titles, tcm: O.tcm, look: !!O.look, structure: shape === 'origin', flat: shape === 'flat', noMaps: O.maps === false,
          addHTML: O.sheets ? n => { const g = gearOf(n); return g.length ? `<h2>Gear</h2>${g.map(([s, it, r]) => `<p><b>${esc(s)}:</b> ${esc(it)}${r ? ` (${esc(r)})` : ''}</p>`).join('')}` : ''; } : null,
          notesFor: O.comments ? html => commentsIn(html).map(c => `<p><b>Comment</b>${c.on ? ` on “${esc(c.on)}”` : ''}: ${esc(c.note)}</p>`).join('') : null,
          extra: O.bible && shape !== 'flat' ? [{ title: 'Story Bible', html: blocksHTML(bibleBlocks()) }] : []
        });
        wrote = res.wrote; files = res.docs;
        where = await NHF.saveScriv(name, res);
      } else if (oneFile()) {
        where = await sendOneFile(name, r => { outWords = r; });
        files = 1;
      } else {
        const r = await sendFolder(name); where = r.where; wrote = r.wrote; files = r.files;
      }
    } catch (e) { return U.toast('Couldn’t send it out: ' + esc(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')), 'warn', 8000); }
    if (!where) return;
    const here = await wordsHere(ids);
    let inWords = 0, missing = [];
    for (const id of ids) { inWords += here.get(id) || 0; if (wrote) { if (wrote.has(id)) outWords += wrote.get(id); else if (here.get(id)) missing.push(id); } }
    window.UnwipStart && window.UnwipStart.done('export');
    remember({ slug: S.slug, title: P.title || 'Untitled', to, shape, at: Date.now(), words: outWords });
    stepCheck({ where, inWords, outWords, missing, files });
  }
  async function sendOneFile(name, setOut) {
    const XF = window.UnwipExportFolder, st0 = S.project.style, was = st0.chapterTitles, wasH = st0.titlesAsHeadings;
    const lang = (((await api.spellSettings().catch(() => ({ current: ['en-AU'] }))).current || [])[0]) || 'en-AU';
    const tcm = st.opts.tcm;
    // the proof: the manuscript compiled with no chapter names added, so only your own words are counted
    st0.chapterTitles = 'none'; delete st0.titlesAsHeadings;
    try { setOut(countWords(await XF.withChanges(tcm === 'keep' ? 'accept' : tcm, () => U.compileManuscript()))); }
    finally { if (was === undefined) delete st0.chapterTitles; else st0.chapterTitles = was; if (wasH !== undefined) st0.titlesAsHeadings = wasH; }
    if (st.shape === 'vellum') { const r = await XF.oneWord({ yes: true, tcm, bytesOnly: true }); return api.exportBinary(r.bytes, name, 'docx', 'Word document'); }
    st0.chapterTitles = 'names'; delete st0.titlesAsHeadings;
    let blocks;
    try { blocks = await XF.withChanges(tcm, () => U.compileManuscript()); }
    finally { if (was === undefined) delete st0.chapterTitles; else st0.chapterTitles = was; if (wasH !== undefined) st0.titlesAsHeadings = wasH; }
    const bk = S.project.book || {};
    const bytes = window.FolioDOCX.build(blocks, S.project.style, { title: bk.title || S.project.title || '', author: bk.author || (S.settings && S.settings.author) || '', pageBreaks: true, lang });
    return api.exportBinary(bytes, name, 'docx', 'Word document');
  }
  async function sendFolder(book) {
    const O = st.opts, XF = window.UnwipExportFolder, md = st.to === 'obsidian' || st.to === 'md', obs = st.to === 'obsidian', fmt = md ? 'md' : 'docx';
    const roots = rootsFor(), out = [], wrote = new Map(), cmts = [];
    const lang = (((await api.spellSettings().catch(() => ({ current: ['en-AU'] }))).current || [])[0]) || 'en-AU';
    const tcm = O.tcm === 'keep' && md ? 'accept' : O.tcm;
    const names = obs && O.links ? st.survey.names.slice().sort((a, b) => b.length - a.length) : [];
    const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let picN = 0, files = 0;
    const toBytes = (blocks, title, depth) => {
      if (!md) return window.FolioDOCX.build(blocks, S.project.style, { title, author: (S.settings && S.settings.author) || '', lang });
      let k = 0;
      const picture = src => { const m = /^data:image\/([a-z+]+);base64,(.*)$/i.exec(src || ''); if (!m) return ''; const bin = atob(m[2]), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
        const f = `${pad(picN++, 999)}-${safe(title).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 40)}-${++k}.${m[1].toLowerCase().replace('jpeg', 'jpg').replace('svg+xml', 'svg')}`; out.push({ name: `Pictures/${f}`, data: a }); return `${'../'.repeat(depth)}Pictures/${f}`; };
      let text = XF.blocksToMarkdown(blocks, { picture });
      // Obsidian: the first mention of each named page becomes a [[link]] (never inside a heading or an existing link)
      for (const nm of names) {
        if (nm === title) continue;
        const re = new RegExp(`(^|[^\\p{L}\\p{N}\\[])(${reEsc(nm)})(?![\\p{L}\\p{N}\\]])`, 'u');
        const lines = text.split('\n'); const i = lines.findIndex(l => !/^#/.test(l) && re.test(l));
        if (i >= 0) { lines[i] = lines[i].replace(re, (m, a, b) => `${a}[[${b}]]`); text = lines.join('\n'); }
      }
      return new TextEncoder().encode(text);
    };
    // Obsidian finds [[Count Dracula]] by the file's name, so pages outside the manuscript keep their own names
    const fileName = (n, i, count, root) => obs && root.kind !== 'manuscript' ? safe(n.title) : `${pad(i, count)} - ${safe(n.title)}`;
    async function one(n, dir, i, count, depth, root) {
      const nm = fileName(n, i, count, root);
      if (n.type === 'folder') { const kids = st.shape === 'flat' ? n.children : n.children || []; for (let k = 0; k < kids.length; k++) await one(kids[k], `${dir}${nm}/`, k, kids.length, depth + 1, root); return; }
      if (n.map) {
        if (O.maps === false || !window.UnwipMaps || !window.UnwipMaps.pictures) return;
        const pic = await window.UnwipMaps.pictures(n.id).catch(() => []);
        if (pic.length) { const b64 = pic[0].canvas.toDataURL('image/png').split(',')[1], bin = atob(b64), a = new Uint8Array(bin.length); for (let q = 0; q < bin.length; q++) a[q] = bin.charCodeAt(q); out.push({ name: `${dir}${nm}.png`, data: a }); files++; }
        return;
      }
      const html = (n.id === S.docId ? U.editor.innerHTML : await api.loadDoc(S.slug, n.id).catch(() => '')) || '';
      if (O.comments) { const c = commentsIn(html); if (c.length) cmts.push([n.title || 'Untitled', c]); }
      const blocks = await XF.withChanges(tcm, () => U.docBlocks(n.id, 'none'));
      if (root.kind === 'manuscript') wrote.set(n.id, countWords(blocks));
      if (O.titles !== false) blocks.unshift(blk('h1', [run(n.title || 'Untitled')]));
      if (O.syn && n.synopsis) blocks.splice(O.titles !== false ? 1 : 0, 0, blk('p', [run(n.synopsis, { italic: true })]));
      if (O.sheets && root.kind === 'characters') { const g = gearOf(n); if (g.length) { blocks.push(blk('h2', [run('Gear')])); for (const [s, it, r] of g) blocks.push(blk('p', [run(s + ': ', { bold: true }), run(it + (r ? ` (${r})` : ''))])); } }
      out.push({ name: `${dir}${nm}.${fmt}`, data: toBytes(blocks, n.title || '', depth) }); files++;
    }
    for (let r = 0; r < roots.length; r++) {
      const multi = roots.length > 1, dir = multi ? `${obs ? '' : pad(r, roots.length) + ' - '}${safe(roots[r].title)}/` : '';
      let kids = roots[r].children || [];
      for (let i = 0; i < kids.length; i++) await one(kids[i], dir, i, kids.length, multi ? 1 : 0, roots[r]);
    }
    if (O.bible && st.shape !== 'ms') { out.push({ name: `Story Bible.${fmt}`, data: toBytes(bibleBlocks(), 'Story Bible', 0) }); files++; }
    if (cmts.length) {
      const b = [blk('h1', [run('Comments')])];
      for (const [t, list] of cmts) { b.push(blk('h2', [run(t)])); for (const c of list) b.push(blk('p', [...(c.on ? [run(`“${c.on}”: `, { italic: true })] : []), run(c.note || '(no words)')])); }
      out.push({ name: `Comments.${fmt}`, data: toBytes(b, 'Comments', 0) }); files++;
    }
    if (!files) throw new Error('there’s nothing in it to send yet');
    let where;
    if (api.exportFolder) where = await api.exportFolder(book, out);
    else { const zip = window.FolioEPUB.zip(out.map(f => ({ name: `${book}/${f.name}`, data: f.data }))); const p = await api.exportBinary(zip, book, 'zip', 'Folder of files (zip)'); where = p ? `${p} (unzip it to get the folder)` : null; }
    return { where, wrote, files };
  }

  // ---------------------------------------------------------------- 4. check it over
  function stepCheck(r) {
    const { body, foot } = shell('check');
    const app = DEST[st.to][0], same = r.outWords === r.inWords && !r.missing.length, sv = st.survey || {}, O = st.opts;
    const tiles = [[msDocs(oneFile()).length, 'manuscript document', 'manuscript documents', oneFile() ? 'in one file' : st.shape === 'flat' ? 'in story order' : '']];
    if (sv.sheets && sv.sheets.length && O.sheets && !oneFile()) tiles.push([sv.sheets.length, 'character sheet', 'character sheets', 'as gear lists']);
    if (sv.maps && sv.maps.length && O.maps !== false && !oneFile()) tiles.push([sv.maps.length, 'map', 'maps', 'as pictures']);
    if (sv.comments && O.comments && !oneFile()) tiles.push([sv.comments, 'comment', 'comments', st.to === 'scriv' ? 'in the notes' : 'in their own file']);
    const titles = missingTitles(r.missing);
    body.innerHTML = `<div class="ir-pad ir-check so-check">
      <h1>${same ? 'Every word went out' : 'Some words didn’t go'}</h1>
      <p class="ir-lede">${same ? `${esc(S.project.title || 'Your book')} is ready to open in ${esc(app)}.` : `The manuscript has <b>${U.fmt(r.inWords)}</b> words here and <b>${U.fmt(r.outWords)}</b> went out.${titles ? ` Not sent: ${titles}.` : ''} Please tell us through Help › Report a problem.`}</p>
      <div class="so-proof"><div><span>In Unwip</span><b>${U.fmt(r.inWords)}</b><small>words in the manuscript</small></div><div class="${same ? 'ok' : 'bad'}"><span>Sent out</span><b>${U.fmt(r.outWords)}</b><small>words in the ${st.to === 'scriv' ? 'Draft' : 'chapters'}</small></div></div>
      <div class="ir-tiles">${tiles.map(([n, a, b, s]) => `<div><b>${U.fmt(n)}</b><span>${n === 1 ? a : b}${s ? ' ' + s : ''}</span></div>`).join('')}</div>
      <div class="ir-pend"><div><span>Saved to</span><b>${esc(String(r.where))}</b></div></div>
      <p class="ir-hint">${st.to === 'scriv' ? 'In Scrivener, choose File › Open and pick it. It may take a moment to rebuild its search index the first time. ' : st.to === 'gdocs' ? 'In Google Drive, choose New › File upload and pick it, then Open with › Google Docs. ' : ''}Your book in Unwip hasn’t changed. You can send it again whenever you like.</p></div>`;
    foot.innerHTML = `<span class="ir-sp"></span><button type="button" class="btn primary ir-next">Done</button>`;
    $('.ir-next', foot).onclick = close;
  }
  const missingTitles = ids => ids.slice(0, 3).map(id => { const f = U.findNode(id); return `“${esc(f ? f.node.title || 'Untitled' : 'a chapter')}”`; }).join(', ') + (ids.length > 3 ? ` and ${ids.length - 3} more` : '');

  return { open, choose, close, get state() { return st; } };
})();
