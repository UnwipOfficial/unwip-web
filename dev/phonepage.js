// Unwip - a page from a word, on a phone (beta, 22 Oct). Select a name while writing and ＋ Page shows at the start of
// the formatting row above the keyboard (mobile.js). It opens a panel from the bottom: a new character, place or item
// page (or one in your own template sections) named after the words, or the words added to the end of a page you
// already have. You stay in the chapter, with the cursor after the words. The same page-making as + New (no AI).
window.UnwipPhonePage = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return null;
  const { S, $, $$, esc, api } = U;
  const clean = t => String(t || '').replace(/\s+/g, ' ').trim();
  const roots = () => (S.project ? S.project.binder.filter(r => ['characters', 'places', 'items'].includes(r.kind) || r.custom) : []);
  const ICON = { characters: '👤', places: '📍', items: '💎' };
  const NOUN = { characters: 'Character', places: 'Place', items: 'Item' };
  function pages() {
    const out = [];
    for (const r of roots()) U.walkTree(r.children || [], n => { if (n.type === 'doc' && !n.map) out.push({ n, root: r }); });
    return out;
  }
  let back = null, saved = null;
  function close() { if (back) { back.remove(); back = null; } }
  // the cursor goes back into the chapter, just after the picked words (focus in the tap itself, so the keyboard comes back)
  function backToWriting() {
    const ed = U.editor; ed.focus({ preventScroll: true });
    if (saved) { try { const r = saved.cloneRange(); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } catch {} }
  }
  function open() {
    const s = getSelection(); if (!S.project || !s.rangeCount || s.isCollapsed || !U.editor.contains(s.anchorNode)) return;
    const words = clean(s.toString()); if (!words) return;
    saved = s.getRangeAt(0).cloneRange();
    U.editor.blur();   // the keyboard steps aside while you choose
    close();
    back = document.createElement('div'); back.className = 'pp-back';
    const R = roots();
    back.innerHTML = `<div class="pp-sheet" role="dialog" aria-label="Make a page from the words">
      <label class="pp-cap" for="pp-name">Make a page called</label>
      <input id="pp-name" class="pp-field" type="text" maxlength="80" value="${esc(words.slice(0, 80))}" autocomplete="off" autocapitalize="words">
      <div class="pp-kinds">${R.map(r => `<button type="button" class="btn ${r.kind === 'characters' ? 'primary' : ''}" data-kind="${esc(r.kind)}"><em>${ICON[r.kind] || '📁'}</em><span>${esc(NOUN[r.kind] || r.singular || r.title)}</span></button>`).join('')}</div>
      <div class="pp-msg" hidden></div>
      <label class="pp-cap" for="pp-find">Or add these words to a page</label>
      <input id="pp-find" class="pp-field" type="search" placeholder="⌕ Find a page…" autocomplete="off">
      <div class="pp-list"></div>
      <button type="button" class="btn ghost pp-cancel">Cancel</button>
    </div>`;
    document.body.appendChild(back);
    const list = $('.pp-list', back), find = $('#pp-find', back), msg = $('.pp-msg', back);
    // pages whose name is in the picked words first, then the rest, filtered by what's typed in Find
    const draw = () => {
      const q = clean(find.value).toLowerCase(), all = pages();
      const hit = p => { const t = (p.n.title || '').toLowerCase(); return t && words.toLowerCase().includes(t); };
      const shown = all.filter(p => !q || (p.n.title || '').toLowerCase().includes(q)).sort((a, b) => hit(b) - hit(a)).slice(0, 6);
      list.innerHTML = shown.length ? shown.map(p => `<button type="button" class="pp-li" data-id="${esc(p.n.id)}"><span>${esc(p.n.title || 'Untitled')}</span><small>${esc(p.root.title)}</small></button>`).join('')
        : `<p class="pp-none">${q ? 'No page by that name.' : 'No pages yet.'}</p>`;
    };
    find.oninput = draw; draw();
    back.addEventListener('click', async e => {
      if (e.target === back || e.target.closest('.pp-cancel')) { close(); backToWriting(); return; }
      const k = e.target.closest('[data-kind]'), li = e.target.closest('.pp-li'), go = e.target.closest('[data-open]'), anyway = e.target.closest('[data-anyway]');
      if (go) { const id = go.dataset.open; close(); await U.openDoc(id); return; }
      if (k || anyway) {
        const kind = k ? k.dataset.kind : anyway.dataset.anyway, name = clean($('#pp-name', back).value).slice(0, 80) || words.slice(0, 80);
        const same = !anyway && pages().find(p => (p.n.title || '').toLowerCase() === name.toLowerCase());
        if (same) {   // a page by that name already: open it, or make another anyway
          msg.hidden = false;
          msg.innerHTML = `<span>There’s already a page called <b>${esc(same.n.title)}</b> in ${esc(same.root.title)}.</span><button type="button" class="btn small primary" data-open="${esc(same.n.id)}">Open it</button><button type="button" class="btn small" data-anyway="${esc(kind)}">Make another</button>`;
          return;
        }
        close(); backToWriting();
        const id = await makePage(kind, name);
        if (id) U.toastAction(`A page for <b>${esc(name)}</b> is in ${esc((S.project.binder.find(r => r.kind === kind) || {}).title || '')}.`, 'Open', () => U.openDoc(id), 8000);
        return;
      }
      if (li) {
        close(); backToWriting();
        const t = await addTo(li.dataset.id, words);
        if (t) U.toastAction(`Added to <b>${esc(t)}</b>.`, 'Open', () => U.openDoc(li.dataset.id), 8000);
      }
    });
    setTimeout(() => { const n = $('#pp-name', back); if (n) n.blur(); }, 0);
  }
  // a new page in that section, from its template, with the name filled in where the template asks for one
  async function makePage(kind, name) {
    const root = S.project.binder.find(r => r.kind === kind); if (!root) return null;
    const box = document.createElement('div'); box.innerHTML = U.pageTemplate(root) || '<p><br></p>';
    const nameLine = [...box.querySelectorAll('p')].find(p => { const b = p.querySelector('b, strong'); return b && /\bname\b/i.test(b.textContent) && !clean(p.textContent.replace(b.textContent, '')); });
    if (nameLine) nameLine.appendChild(document.createTextNode((/\s$/.test(nameLine.textContent) ? '' : ' ') + name));
    const node = { id: U.uid(), type: 'doc', title: name, words: 0, mod: Date.now() };
    root.children = root.children || []; root.children.push(node);
    await api.saveDoc(S.slug, node.id, box.innerHTML);
    U.scheduleMeta(); U.renderBinder(); if (U.scheduleNames) U.scheduleNames(0);
    return node.id;
  }
  // the words at the end of a page you already have, saying which chapter they came from
  async function addTo(id, words) {
    const f = U.findNode(id); if (!f) return null;
    const chs = []; U.walkTree(U.findNode('root-manuscript').node.children || [], n => { if (n.type === 'doc') chs.push(n); });
    const i = chs.findIndex(c => c.id === S.docId);
    const html = (S.unsaved && S.unsaved[`${S.slug}:${id}`]) ?? await api.loadDoc(S.slug, id).catch(() => '');
    const box = document.createElement('div'); box.innerHTML = html || '';
    const p = document.createElement('p'); p.textContent = words;
    if (i >= 0) { const it = document.createElement('i'); it.textContent = ` (Ch ${i + 1}: ${chs[i].title || 'Untitled'})`; p.appendChild(it); }
    const last = box.lastElementChild;
    if (last && last.tagName === 'P' && !last.textContent.trim() && !last.querySelector('img')) last.replaceWith(p); else box.appendChild(p);
    await api.saveDoc(S.slug, id, box.innerHTML);
    if (S.unsaved) delete S.unsaved[`${S.slug}:${id}`];
    f.node.words = U.countWords(box.textContent || ''); f.node.mod = Date.now();
    U.scheduleMeta(); U.renderBinder();
    return f.node.title || 'the page';
  }
  return { open, close };
})();
