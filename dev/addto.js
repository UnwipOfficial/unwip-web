// Unwip - "Add to…" for words picked in a chapter. From the selection bar, the PC right-click menu and Ctrl+K, at Detail
// and Lore: put the words on a character, place or thing page (under one of its headings), start a timeline event from
// them, and at Lore also a character sheet's gear or the Story Bible. Phones keep the plain writing view, so not there.
window.UnwipAddTo = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return;
  const { S, esc, api } = U;
  const phone = () => document.documentElement.classList.contains('m-phone') || matchMedia('(max-width:720px)').matches;
  const KINDS = [['characters', 'Characters', 'New character'], ['places', 'Places', 'New place'], ['items', 'Things', 'New thing']];
  const walk = (list, fn) => { for (const n of list || []) { fn(n); if (n.children) walk(n.children, fn); } };
  const chapters = () => { const out = [], r = S.project && S.project.binder.find(x => x.kind === 'manuscript'); walk(r && r.children, n => { if (n.type === 'doc') out.push(n); }); return out; };
  const pages = () => { const out = []; for (const [kind, label] of KINDS) { const root = S.project && S.project.binder.find(r => r.kind === kind); if (root) walk(root.children, n => { if (n.type === 'doc' && !n.map) out.push({ n, kind, label }); }); } return out; };
  const clean = t => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 2000);
  // the first page whose name, first name or surname is in the words
  const named = (list, said) => list.find(l => { const t = l.n.title || '', parts = [t, ...t.split(/\s+/).filter(x => x.length > 2)]; return parts.some(x => new RegExp(`(?<![\\p{L}])${x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'iu').test(said)); });

  // ---- the small menu
  let menuEl = null;
  function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
  function menu(at, words) {
    closeMenu();
    const text = clean(words); if (!text || !S.project) return;
    const lore = U.level() >= 2;
    const items = [['page', 'A character, place or thing page'], ['event', 'A new timeline event']];
    if (lore && window.UnwipCharSheet) items.push(['sheet', 'A character sheet (gear)']);
    if (lore && window.UnwipBible) items.push(['bible', 'The Story Bible']);
    menuEl = document.createElement('div'); menuEl.className = 'addto-menu'; menuEl.setAttribute('role', 'menu');
    menuEl.innerHTML = '<div class="addto-h">Add the picked words to</div>' + items.map(([k, l]) => `<button type="button" role="menuitem" data-k="${k}">${esc(l)}</button>`).join('');
    document.body.appendChild(menuEl);
    const r = at && at.getBoundingClientRect ? at.getBoundingClientRect() : { left: (at && at.x) || 100, bottom: (at && at.y) || 100, top: (at && at.y) || 100 };
    const w = menuEl.offsetWidth, h = menuEl.offsetHeight;
    menuEl.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left)) + 'px';
    menuEl.style.top = (r.bottom + h + 8 < innerHeight ? r.bottom + 6 : Math.max(8, r.top - h - 6)) + 'px';
    menuEl.addEventListener('mousedown', e => e.preventDefault());
    menuEl.addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (!b) return; closeMenu(); run(b.dataset.k, text); });
    setTimeout(() => { const f = menuEl && menuEl.querySelector('button'); if (f) f.focus({ preventScroll: true }); }, 0);
  }
  document.addEventListener('mousedown', e => { if (menuEl && !menuEl.contains(e.target)) closeMenu(); }, true);
  document.addEventListener('keydown', e => {
    if (!menuEl) return;
    if (e.key === 'Escape') { e.stopPropagation(); closeMenu(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const bs = [...menuEl.querySelectorAll('button')], i = bs.indexOf(document.activeElement); bs[(i + (e.key === 'ArrowDown' ? 1 : bs.length - 1)) % bs.length].focus(); }
  }, true);

  function run(k, text) {
    if (k === 'page') return toPage(text);
    if (k === 'event') return toEvent(text);
    if (k === 'sheet') return window.UnwipCharSheet.addFrom(text);
    if (k === 'bible') return window.UnwipBible.addFact(text);
  }

  // ---- a new timeline event, from the words, linked to this chapter, with the characters named in them
  function toEvent(text) {
    const chars = pages().filter(p => p.kind === 'characters' && named([p], text)).map(p => p.n.title);
    const first = text.split(/(?<=[.!?])\s/)[0];
    U.newEventFrom({ title: (first.length > 90 ? first.slice(0, 88).replace(/\s+\S*$/, '') + '…' : first), note: text === first ? '' : text, chapterId: S.docId, chars });
  }

  // ---- onto a page in Characters, Places or Items, under a heading of that page (or at the end)
  async function headingsOf(id) {
    const html = (S.unsaved && S.unsaved[`${S.slug}:${id}`]) ?? await api.loadDoc(S.slug, id).catch(() => '');
    const box = document.createElement('div'); box.innerHTML = html || '';
    return { html: html || '', heads: [...box.querySelectorAll('h1, h2, h3')].map(h => h.textContent.trim()).filter(Boolean) };
  }
  async function toPage(text) {
    const list = pages(), chs = chapters(), here = chs.findIndex(c => c.id === S.docId);
    const pick = named(list, text) || list[0];
    const body = document.createElement('div'); body.className = 'addto-page'; body.dataset.ownEnter = '';
    body.innerHTML = `<div class="field"><label>Words</label><textarea id="at-text" rows="3" maxlength="2000">${esc(text)}</textarea></div>
      <div class="addto-row"><div class="field"><label>Page</label><select id="at-page">${KINDS.map(([k, label, nu]) => { const l = list.filter(x => x.kind === k); return `<optgroup label="${label}">${l.map(x => `<option value="${esc(x.n.id)}" ${x === pick ? 'selected' : ''}>${esc(x.n.title || 'Untitled')}</option>`).join('')}<option value="new:${k}" ${!pick && k === 'characters' ? 'selected' : ''}>+ ${nu}…</option></optgroup>`; }).join('')}</select></div>
        <div class="field" id="at-name-f" hidden><label>Name</label><input type="text" id="at-name" maxlength="80" placeholder="e.g. Wren Tallow"></div>
        <div class="field" id="at-under-f"><label>Put it under</label><select id="at-under"><option value="">At the end</option></select></div></div>
      ${here >= 0 ? `<label class="check"><input type="checkbox" id="at-from" checked> Say which chapter it came from <small>(Ch ${here + 1}: ${esc(chs[here].title || 'Untitled')})</small></label>` : ''}`;
    const sel = body.querySelector('#at-page'), under = body.querySelector('#at-under');
    let token = 0;
    const refresh = async () => {
      const isNew = sel.value.startsWith('new:');
      body.querySelector('#at-name-f').hidden = !isNew;
      const my = ++token;
      let heads = [];
      if (isNew) { const root = S.project.binder.find(r => r.kind === sel.value.slice(4)); const box = document.createElement('div'); box.innerHTML = U.pageTemplate(root); heads = [...box.querySelectorAll('h2')].map(h => h.textContent.trim()); }
      else heads = (await headingsOf(sel.value)).heads;
      if (my !== token) return;
      const keep = under.value, best = heads.find(h => /^notes?$/i.test(h)) || '';
      under.innerHTML = '<option value="">At the end</option>' + heads.map(h => `<option value="${esc(h)}">${esc(h)}</option>`).join('');
      under.value = heads.includes(keep) ? keep : best;
      if (isNew) setTimeout(() => body.querySelector('#at-name').focus(), 0);
    };
    sel.onchange = refresh; refresh();
    const ok = await U.modal({ title: 'Add to a page', body, wide: true, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Add', value: true, kind: 'primary' }] });
    if (!ok) return;
    const words = clean(body.querySelector('#at-text').value); if (!words) return;
    const from = body.querySelector('#at-from'), ch = from && from.checked ? chs[here] : null;
    let id = sel.value;
    if (id.startsWith('new:')) {
      const root = S.project.binder.find(r => r.kind === id.slice(4)); if (!root) return;
      const name = clean(body.querySelector('#at-name').value).slice(0, 80) || (KINDS.find(k => k[0] === root.kind) || [])[2] || 'Untitled';
      const node = { id: U.uid(), type: 'doc', title: name, words: 0 };
      root.children = root.children || []; root.children.push(node); root.open = true;
      await api.saveDoc(S.slug, node.id, U.pageTemplate(root));
      id = node.id; U.scheduleMeta(); U.renderBinder();
    }
    const f = U.findNode(id); if (!f) return;
    if (S.splitId === id) await U.openSplit(id);   // saves what's typed beside the chapter first, so it isn't lost
    const { html } = await headingsOf(id);
    const box = document.createElement('div'); box.innerHTML = html || '<p><br></p>';
    const p = document.createElement('p'); p.textContent = words;
    if (ch) { const i = document.createElement('i'); i.textContent = ` (Ch ${here + 1}: ${ch.title || 'Untitled'})`; p.appendChild(i); }
    const head = under.value && [...box.querySelectorAll('h1, h2, h3')].find(h => h.textContent.trim() === under.value);
    if (head) {
      // the end of that heading's part: just before the next heading at the same level or higher
      const lvl = +head.tagName[1]; let last = head, n = head.nextElementSibling;
      while (n && !(/^H[1-3]$/.test(n.tagName) && +n.tagName[1] <= lvl)) { last = n; n = n.nextElementSibling; }
      // an empty line straight under the heading gets the words instead of sitting above them
      if (last !== head && last.tagName === 'P' && !last.textContent.trim() && !last.querySelector('img')) last.replaceWith(p); else last.after(p);
    } else {
      const lastP = box.lastElementChild;
      if (lastP && lastP.tagName === 'P' && !lastP.textContent.trim() && !lastP.querySelector('img')) lastP.replaceWith(p); else box.appendChild(p);
    }
    await api.saveDoc(S.slug, id, box.innerHTML);
    delete S.unsaved[`${S.slug}:${id}`];
    f.node.words = U.countWords(box.innerText || box.textContent || ''); f.node.mod = Date.now(); f.node.dev = S.device || ''; f.node.devId = S.deviceId || '';
    U.scheduleMeta(); U.renderBinder();
    if (S.splitId === id) await U.openSplit(id);
    U.toastAction(`Added to <b>${esc(f.node.title || 'the page')}</b>${head ? ` under ${esc(under.value)}` : ''}.`, 'Open beside', () => { if (S.view !== 'write') U.setView('write'); U.openSplit(id); }, 8000);
  }

  // the selection bar's button, Ctrl+K, and the PC right-click menu
  const hidden = document.createElement('button'); hidden.id = 'btn-add-to'; hidden.hidden = true; document.body.appendChild(hidden);
  hidden.onclick = () => {
    if (U.level() < 1 || phone()) return;
    const sel = getSelection(), t = sel.toString();
    if (!t.trim()) { U.toast('Pick some words in the chapter first.'); return; }
    const sb = document.querySelector('.selbar:not(.hidden) [data-sel="#btn-add-to"]');
    let at = sb; if (!at && sel.rangeCount) { const r = sel.getRangeAt(0).getBoundingClientRect(); at = { x: r.left, y: r.bottom }; }
    menu(at, t);
  };
  if (U.api.onAddTo) U.api.onAddTo(o => {
    if (U.level() < 1 || phone() || !o) return;
    const t = o.text || getSelection().toString();
    if (o.kind === 'menu') { menu({ x: o.x || 120, y: o.y || 120 }, t); return; }
    if (o.kind === 'sheet' && U.level() < 2) return;
    if (o.kind === 'bible' && U.level() < 2) return;
    run(o.kind, clean(t));
  });
  // the words last picked in the chapter, for Ctrl+K (its search box takes the focus, and with it the selection)
  let lastPicked = '';
  document.addEventListener('selectionchange', () => { const sel = getSelection(); if (sel.rangeCount && !sel.isCollapsed && U.editor.contains(sel.anchorNode)) lastPicked = sel.toString(); });
  const picked = () => { const t = getSelection().toString(); return clean(t.trim() ? t : lastPicked); };
  return { menu, toPage: t => clean(t) ? toPage(clean(t)) : U.toast('Pick some words in the chapter first.'), toEvent: t => clean(t) ? toEvent(clean(t)) : U.toast('Pick some words in the chapter first.'), closeMenu, picked };
})();
