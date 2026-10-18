// Unwip - fog of war (Focus). A whole manuscript can be too much to look at; the fog hides it all except the chapter
// you're on and the next one. You start it by saying where you're starting: your "needs doing" list (each chapter with
// what it needs: "check Mina's timeline"), where you left off, or story order. Chapters you finish stay in view, ticked.
// "Done for now" moves on; "Pick a different one…" changes course without lifting the fog. Characters, places and
// notes are looked up on request (Look up…), so nothing else is on show. When the list is done, the fog lifts.
// Kept in the book (project.fog), so it follows you between devices. Only at Focus: Detail and Lore pause it.
window.UnwipFog = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return;
  const { S, esc, $, $$ } = U;
  const CLOUD = '<svg viewBox="-2 -3 34 27" width="21" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 13a5 5 0 0 1 1-9.9A6.5 6.5 0 0 1 21.5 5 4.5 4.5 0 0 1 22 14H8z"/><path d="M4 18h17M9 21h15"/></svg>';
  const root = document.documentElement;
  const F = () => (S.project && S.project.fog) || null;
  const active = () => !!(F() && F().on && S.project && U.level() === 0);
  const node = id => { const f = id && U.findNode(id); return f && f.node.type === 'doc' && U.rootOf(id) && U.rootOf(id).kind === 'manuscript' ? f.node : null; };
  const chapters = () => { const out = []; U.walkTree(U.findNode('root-manuscript').node.children || [], n => { if (n.type === 'doc') out.push(n.id); }); return out; };
  const needOf = id => { const x = ((F() && F().list) || []).find(l => l.id === id); return x ? x.need : ''; };
  const phone = () => root.classList.contains('m-phone');

  // ---------------------------------------------------------------- the button, beside Focus / Detail / Lore
  let btn = null, panel = null;
  function setup() {
    const head = $('#binder .binder-head'); if (!head || btn) return;
    btn = document.createElement('button'); btn.type = 'button'; btn.id = 'fog-btn'; btn.className = 'fog-btn';
    btn.title = 'Fog of war: hide the book except the chapter you’re on and the next one';
    btn.onclick = () => active() ? lift() : start();
    head.appendChild(btn);
    panel = document.createElement('div'); panel.id = 'fog-panel'; panel.className = 'fog-panel';
    const tree = $('#binder-tree'); tree.parentNode.insertBefore(panel, tree);
    draw();
  }
  function draw() {
    if (!btn) return;
    const on = active();
    root.classList.toggle('fog-on', on);
    root.classList.toggle('fog-hide-total', on && !!(F() && F().hideTotal));
    btn.classList.toggle('on', on); btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.innerHTML = `${CLOUD}<span>${on && phone() ? 'Fog on' : 'Fog'}</span>`;
    if (!on) { panel.innerHTML = ''; return; }
    const f = F(), q = f.queue || [], cur = node(f.cur) ? f.cur : null, i = q.indexOf(cur);
    const next = q.slice(i + 1).find(node) || null;
    const done = (f.done || []).filter(node);
    const shown = new Set([...done, cur, next].filter(Boolean));
    const hidden = chapters().filter(id => !shown.has(id)).length;
    const row = (id, cls, extra) => { const n = node(id); return `<button type="button" class="fog-row ${cls}" data-id="${esc(id)}">${cls === 'done' ? '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>' : ''}<span class="fog-t"><b>${esc(n.title || 'Untitled')}</b>${extra || ''}</span></button>`; };
    panel.innerHTML = `
      ${done.length ? `<div class="fog-cap">Done</div>${done.map(id => row(id, 'done', needOf(id) ? `<small>${esc(needOf(id))}</small>` : '')).join('')}` : ''}
      <div class="fog-cap">Now</div>
      ${cur ? row(cur, 'now', `<small class="fog-need">${needOf(cur) ? 'Needs: ' + esc(needOf(cur)) : `${U.fmt(node(cur).words || 0)} words`}</small>`) : '<p class="fog-none">Nothing picked yet.</p>'}
      ${next ? `<div class="fog-cap">Next up</div>${row(next, 'next', needOf(next) ? `<small>Needs: ${esc(needOf(next))}</small>` : '')}` : ''}
      <div class="fog-cloud">${hidden ? `${hidden} more ${hidden === 1 ? 'chapter' : 'chapters'} in the fog` : 'Nothing else in the fog'}<small>The fog lifts when your list is done</small></div>
      <button type="button" class="btn small fog-look">Look up…</button>
      <button type="button" class="btn primary fog-next">${next ? 'Done for now: next up ›' : 'Done: lift the fog'}</button>
      <button type="button" class="fog-pick">Pick a different one…</button>`;
    $$('.fog-row', panel).forEach(b => b.onclick = () => openCh(b.dataset.id, b.classList.contains('next')));
    $('.fog-next', panel).onclick = doneForNow;
    $('.fog-pick', panel).onclick = () => start();
    $('.fog-look', panel).onclick = lookUp;
  }
  async function openCh(id, makeCurrent) {
    const f = F(); if (makeCurrent && f) { f.cur = id; U.scheduleMeta(); }
    if (S.view !== 'write') U.setView('write');
    await U.openDoc(id);
    if (phone() && window.UnwipMobile) window.UnwipMobile.showPage();
    draw();
  }
  async function doneForNow() {
    const f = F(); if (!f) return;
    if (f.cur && !f.done.includes(f.cur)) f.done.push(f.cur);
    const q = f.queue || [], next = q.slice(q.indexOf(f.cur) + 1).find(node);
    if (!next) { f.on = false; U.scheduleMeta(); draw(); U.toast('That’s your list done. The fog lifts.', '', 6000); return; }
    f.cur = next; U.scheduleMeta();
    await openCh(next);
  }
  function lift() { const f = F(); if (f) { f.on = false; U.scheduleMeta(); } draw(); U.toast('The fog lifts. Your list is kept for next time.'); }

  // ---------------------------------------------------------------- where are we starting?
  async function start() {
    if (!S.project) return;
    const f = S.project.fog || { on: false, list: [], done: [], queue: [], hideTotal: true };
    const list = (f.list || []).filter(x => node(x.id)).map(x => ({ ...x }));
    const all = chapters();
    let mode = list.length ? 'list' : 'left';
    const body = document.createElement('div'); body.className = 'fog-start';
    const draw2 = () => {
      const free = all.filter(id => !list.some(l => l.id === id));
      const left = node(S.docId) ? S.docId : node(S.project.lastDoc) ? S.project.lastDoc : all[0];
      body.innerHTML = `<p class="hint">The fog hides everything except the chapter you’re on and the next one. Chapters you finish stay in view, ticked off.</p>
        <div class="fog-cols">
          <div class="fog-col"><div class="fog-cap">What needs doing, in order</div>
            ${list.map((l, i) => `<div class="fog-li" data-i="${i}"><span class="fog-mv"><button type="button" class="icon-btn small" data-up aria-label="Move up" ${i ? '' : 'disabled'}>↑</button><button type="button" class="icon-btn small" data-down aria-label="Move down" ${i < list.length - 1 ? '' : 'disabled'}>↓</button></span>
              <div class="fog-li-t"><b>${esc(node(l.id).title || 'Untitled')}</b><input type="text" data-need value="${esc(l.need || '')}" placeholder="What does it need?" aria-label="What it needs"></div>
              <button type="button" class="icon-btn small" data-x aria-label="Take it off the list">✕</button></div>`).join('') || '<p class="hint">Nothing on the list yet. Add the chapters you want to work on, in the order you want them.</p>'}
            ${free.length ? `<div class="fog-add"><select id="fog-add-ch" aria-label="Chapter to add">${free.map(id => `<option value="${esc(id)}">${esc(node(id).title || 'Untitled')}</option>`).join('')}</select><input type="text" id="fog-add-need" placeholder="What does it need?" aria-label="What it needs"><button type="button" class="btn small" id="fog-add">Add</button></div>` : ''}
          </div>
          <div class="fog-col"><div class="fog-cap">Start from</div>
            <label class="fog-opt"><input type="radio" name="fog-from" value="list" ${mode === 'list' ? 'checked' : ''} ${list.length ? '' : 'disabled'}><span><b>The top of my list</b><small>${list.length ? esc(node(list[0].id).title || 'Untitled') : 'Add a chapter to the list first'}</small></span></label>
            <label class="fog-opt"><input type="radio" name="fog-from" value="left" ${mode === 'left' ? 'checked' : ''}><span><b>Where I left off</b><small>${esc((node(left) || {}).title || 'Untitled')}</small></span></label>
            <label class="fog-opt"><input type="radio" name="fog-from" value="story" ${mode === 'story' ? 'checked' : ''}><span><b>Story order</b><small>From the first chapter, one after another</small></span></label>
            <p class="hint">Tip: right-click a chapter (press and hold on a phone) and choose <b>Needs doing…</b> to add it here.</p>
          </div>
        </div>
        <label class="check"><input type="checkbox" id="fog-hide" ${f.hideTotal !== false ? 'checked' : ''}><span>Hide the book’s total word count too</span></label>`;
      $$('.fog-li', body).forEach(r => {
        const i = +r.dataset.i;
        $('[data-need]', r).oninput = e => { list[i].need = e.target.value; };
        $('[data-up]', r).onclick = () => { [list[i - 1], list[i]] = [list[i], list[i - 1]]; draw2(); };
        $('[data-down]', r).onclick = () => { [list[i + 1], list[i]] = [list[i], list[i + 1]]; draw2(); };
        $('[data-x]', r).onclick = () => { list.splice(i, 1); if (!list.length && mode === 'list') mode = 'left'; draw2(); };
      });
      const add = $('#fog-add', body); if (add) add.onclick = () => { list.push({ id: $('#fog-add-ch', body).value, need: $('#fog-add-need', body).value.trim() }); mode = 'list'; draw2(); };
      $$('[name="fog-from"]', body).forEach(r => r.onchange = () => { mode = r.value; });
      body.leftId = left;
    };
    draw2();
    const ok = await U.modal({ title: 'Where are we starting?', body, wide: true, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: f.on ? 'Carry on in the fog' : 'Bring in the fog', value: true, kind: 'primary' }] });
    if (!ok) return;
    const from = (body.querySelector('[name="fog-from"]:checked') || {}).value || mode;
    let queue;
    if (from === 'list' && list.length) queue = list.map(l => l.id);
    else if (from === 'story') queue = all.slice();
    else { const l = body.leftId; queue = list.length ? [l, ...list.map(x => x.id).filter(id => id !== l)] : all.slice(Math.max(0, all.indexOf(l))); }
    queue = queue.filter(node);
    if (!queue.length) { U.toast('There are no chapters to work on yet.'); return; }
    S.project.fog = { on: true, list, queue, cur: queue[0], done: f.on ? (f.done || []).filter(id => !queue.slice(1).includes(id) && id !== queue[0]) : [], hideTotal: $('#fog-hide', body).checked, at: Date.now() };
    U.scheduleMeta();
    await openCh(queue[0]);
  }

  // ---------------------------------------------------------------- Needs doing… (chapter menu)
  function menuItems(n) {
    if (!n || n.type !== 'doc' || !node(n.id)) return [];
    return [{ label: 'Needs doing…', action: async () => {
      const f = S.project.fog || (S.project.fog = { on: false, list: [], done: [], queue: [], hideTotal: true });
      const had = f.list.find(x => x.id === n.id);
      const need = await U.promptText('Needs doing', `What does “${n.title || 'this chapter'}” need?`, had ? had.need : '');
      if (need == null) return;
      if (had) had.need = need.trim(); else { f.list.push({ id: n.id, need: need.trim() }); if (f.on && f.queue && !f.queue.includes(n.id)) f.queue.push(n.id); }
      U.scheduleMeta(); draw();
      U.toast(`<b>${esc(n.title || 'It')}</b> is on your “needs doing” list${f.on ? '' : '. Turn on the fog to work through it'}.`);
    } }];
  }

  // ---------------------------------------------------------------- Look up… without lifting the fog
  async function lookUp() {
    const docs = [];
    for (const r of S.project.binder) if (!['manuscript', 'trash'].includes(r.kind)) U.walkTree(r.children || [], n => { if (n.type === 'doc' && !n.map) docs.push({ n, where: r.title }); });
    const body = document.createElement('div'); body.className = 'fog-lookup';
    body.innerHTML = `<input type="text" id="fog-q" placeholder="A character, place, item or note…" aria-label="Look up"><div class="fog-res"></div><div class="fog-card" hidden></div>`;
    const res = $('.fog-res', body), card = $('.fog-card', body);
    const show = () => {
      const q = $('#fog-q', body).value.trim().toLowerCase(); card.hidden = true;
      res.innerHTML = q ? docs.filter(d => (d.n.title || '').toLowerCase().includes(q)).slice(0, 8).map(d => `<button type="button" class="fog-hit" data-id="${esc(d.n.id)}"><b>${esc(d.n.title || 'Untitled')}</b><span>${esc(d.where)}</span></button>`).join('') || '<p class="hint">Nothing by that name.</p>' : '';
      $$('.fog-hit', res).forEach(b => b.onclick = async () => {
        const d = document.createElement('div'); d.innerHTML = (await U.api.loadDoc(S.slug, b.dataset.id).catch(() => '')) || '';
        const t = [...d.querySelectorAll('p,li,h1,h2,h3')].map(e => e.textContent.trim()).filter(Boolean).slice(0, 8);
        card.innerHTML = `<b>${esc(b.querySelector('b').textContent)}</b>${t.map(x => `<p>${esc(x.slice(0, 220))}</p>`).join('') || '<p class="hint">(empty)</p>'}<button type="button" class="btn small" data-open="${esc(b.dataset.id)}">Open its page</button>`;
        card.hidden = false; res.innerHTML = '';
        $('[data-open]', card).onclick = async () => { const back = body.closest('.modal-back'); if (back) { const x = back.querySelector('.m-foot button'); if (x) x.click(); } await U.openDoc(b.dataset.id); if (phone() && window.UnwipMobile) window.UnwipMobile.showPage(); };
      });
    };
    await U.modal({ title: 'Look up', body, onOpen: () => { const q = $('#fog-q', body); q.oninput = show; q.focus(); }, buttons: [{ label: 'Close', value: false, kind: 'ghost' }] });
  }

  U.on('project', () => { setup(); draw(); });
  U.on('level', () => draw());
  U.on('doc', () => { if (active()) draw(); });
  U.on('leave', () => root.classList.remove('fog-on', 'fog-hide-total'));
  setup();
  return { start, lift, doneForNow, menuItems, lookUp, draw, active };
})();
