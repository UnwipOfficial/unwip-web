// Unwip - Edit the binder in one go (iPhone and iPad; beta, 20 Oct). An Edit button at the bottom of the binder: every
// row gets a circle to tick and a ≡ to drag. Ticking a folder takes everything inside it along. Drop on a folder to put
// it inside (closed folders open after a moment), or between rows: the line's indent shows which folder it lands in, so
// sliding the finger left takes it out a level. Ticked rows move together, by dragging any of them or with Move to…,
// Out of folder or Trash at the bottom. Sections (Characters, Notes…) stay where they are. Nothing is deleted.
window.UnwipBinderEdit = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return null;
  const { S, $, $$, esc } = U;
  const touch = () => !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
  let on = false;
  const ticked = new Set();
  const tree = () => $('#binder-tree');

  // ---------------------------------------------------------------- what's ticked
  function walk(list, fn, inTicked, depth = 0, parent = null) {
    for (const n of list || []) { fn(n, inTicked, depth, parent); if (n.children) walk(n.children, fn, inTicked || ticked.has(n.id), depth + 1, n); }
  }
  // the ticked rows that aren't inside a ticked folder (moving a folder takes everything in it), in binder order
  function tops() { const out = []; walk(S.project.binder, (n, inT) => { if (!n.root && ticked.has(n.id) && !inT) out.push(n); }); return out; }
  const depths = () => { const d = {}; walk(S.project.binder, (n, inT, depth) => { d[n.id] = depth; }); return d; };

  // ---------------------------------------------------------------- on and off
  function button() {
    const foot = $('.binder-foot'), nb = $('#btn-new'); if (!foot || !nb || $('#btn-bedit')) return;
    const b = document.createElement('button'); b.type = 'button'; b.id = 'btn-bedit'; b.className = 'btn small be-btn';
    b.innerHTML = '✎ Edit'; b.title = 'Move and tidy the binder: drag rows, or tick several and move them together';
    b.onclick = start; foot.insertBefore(b, nb);
    const show = () => { b.hidden = !touch(); };
    show(); if (window.matchMedia) matchMedia('(pointer: coarse)').addEventListener('change', show);
  }
  function start() {
    if (!S.project) return;
    on = true; ticked.clear();
    document.documentElement.classList.add('bedit');
    const t = tree(); if (!t) return;
    let top = $('#be-top');
    if (!top) { top = document.createElement('div'); top.id = 'be-top'; t.parentNode.insertBefore(top, t); }
    let bar = $('#be-bar');
    if (!bar) { bar = document.createElement('div'); bar.id = 'be-bar'; $('.binder-foot').appendChild(bar); }
    U.renderBinder(); bars();
  }
  function stop() {
    on = false; ticked.clear();
    document.documentElement.classList.remove('bedit');
    for (const id of ['be-top', 'be-bar', 'be-line', 'be-ghost']) { const e = document.getElementById(id); if (e) e.remove(); }
    U.renderBinder();
  }
  function bars() {
    const top = $('#be-top'), bar = $('#be-bar'); if (!top || !bar) return;
    const T = tops(), canOut = T.some(n => { const f = U.findNode(n.id); return f && f.parent && !f.parent.root; });
    top.innerHTML = `<b>${T.length ? `${T.length} ticked` : 'Edit the binder'}</b><span class="be-hint">${T.length ? '' : 'Drag ≡, or tick several'}</span><button type="button" class="btn small primary" data-done>Done</button>`;
    bar.innerHTML = `<button type="button" class="btn small" data-be="move" ${T.length ? '' : 'disabled'}>Move to…</button><button type="button" class="btn small" data-be="out" ${canOut ? '' : 'disabled'}>Out of folder</button><span class="bf-sp"></span><button type="button" class="btn small be-trash" data-be="trash" ${T.length ? '' : 'disabled'}>Trash</button>`;
    $('[data-done]', top).onclick = stop;
    $$('[data-be]', bar).forEach(b => b.onclick = () => act(b.dataset.be));
  }
  async function act(what) {
    const T = tops(); if (!T.length) return;
    if (what === 'move') { if (await U.moveToDialog(null, T.map(n => n.id))) ticked.clear(); }
    if (what === 'out') { for (const n of T.slice().reverse()) U.moveOut(n.id); ticked.clear(); }
    if (what === 'trash') { for (const n of T) await U.moveToTrash(n.id); ticked.clear(); U.toast(`${T.length === 1 ? `“${esc(T[0].title || 'Untitled')}” is` : `${T.length} things are`} in the Trash.`); }
    U.renderBinder(); bars();
  }

  // ---------------------------------------------------------------- the rows, while editing
  function decorate() {
    if (!on) return;
    const inTicked = new Set(); walk(S.project.binder, (n, inT) => { if (inT) inTicked.add(n.id); });
    for (const row of $$('#binder-tree .tree-row[data-id]')) {
      const f = U.findNode(row.dataset.id); if (!f) continue;
      row.draggable = false;
      if (f.node.root) { row.classList.add('be-root'); continue; }
      const ck = document.createElement('span'); ck.className = 'be-ck' + (ticked.has(f.node.id) ? ' on' : inTicked.has(f.node.id) ? ' in' : '');
      ck.setAttribute('aria-hidden', 'true'); ck.textContent = ticked.has(f.node.id) || inTicked.has(f.node.id) ? '✓' : '';
      row.insertBefore(ck, row.firstChild);
      const g = document.createElement('span'); g.className = 'be-grip'; g.textContent = '≡'; g.setAttribute('aria-label', 'Drag to move');
      row.appendChild(g);
      if (inTicked.has(f.node.id)) row.classList.add('be-in');
    }
  }
  function tick(id) {
    const inT = new Set(); walk(S.project.binder, (n, i) => { if (i) inT.add(n.id); });
    if (inT.has(id)) return;   // it's inside a ticked folder: it goes with the folder
    if (ticked.has(id)) ticked.delete(id); else ticked.add(id);
    U.renderBinder(); bars();
  }

  // ---------------------------------------------------------------- dragging by ≡
  let drag = null, openTimer = null;
  const rowsInOrder = () => $$('#binder-tree .tree-row[data-id]');
  function target(x, y) {
    const t = tree(), r = t.getBoundingClientRect();
    const hit = document.elementFromPoint(Math.min(r.right - 8, r.left + 60), y);
    const row = hit && hit.closest && hit.closest('#binder-tree .tree-row[data-id]'); if (!row) return null;
    const f = U.findNode(row.dataset.id); if (!f) return null;
    if (drag.nodes.some(m => m.id === f.node.id || U.isInside(f.node.id, m))) return null;
    const b = row.getBoundingClientRect(), rel = (y - b.top) / b.height;
    if (f.node.root || (f.node.type === 'folder' && rel > 0.25 && rel < 0.75)) return { into: f.node, row };
    // a gap: between the row above and the row below
    const all = rowsInOrder().filter(x => !drag.nodes.some(m => { const n = U.findNode(x.dataset.id); return n && (n.node.id === m.id || U.isInside(n.node.id, m)); }));
    const i = all.indexOf(row), A = rel < 0.5 ? all[i - 1] : row, B = rel < 0.5 ? row : all[i + 1];
    const D = depths(), opts = [];
    const nb = B && U.findNode(B.dataset.id);
    if (nb && !nb.node.root) opts.push({ parent: nb.parent.id, before: nb.node.id, depth: D[nb.node.id] });
    const na = A && U.findNode(A.dataset.id);
    if (na) {
      if (na.node.root || (na.node.type === 'folder' && na.node.open)) opts.push({ parent: na.node.id, first: true, depth: D[na.node.id] + 1 });
      let n = na;
      while (n && !n.node.root) {
        opts.push({ parent: n.parent.id, after: n.node.id, depth: D[n.node.id] });
        if (n.index !== n.list.length - 1) break;   // further out would jump past its later neighbours
        n = U.findNode(n.parent.id);
      }
    }
    if (!opts.length) return null;
    // the level follows how far the finger has slid sideways since it picked the row up (left: out a level)
    const want = drag.depth + (x - drag.x) / 28;
    opts.sort((a, b2) => Math.abs(a.depth - want) - Math.abs(b2.depth - want));
    const gy = rel < 0.5 ? b.top : b.bottom;
    return { gap: opts[0], y: gy - r.top + t.scrollTop };
  }
  function show(tg) {
    $$('#binder-tree .be-into').forEach(x => x.classList.remove('be-into'));
    let line = $('#be-line');
    if (!tg || !tg.gap) { if (line) line.hidden = true; }
    if (tg && tg.into) {
      tg.row.classList.add('be-into');
      if (!tg.into.open && tg.into.type === 'folder' && !tg.into.root) {
        if (!openTimer || openTimer.id !== tg.into.id) { clearTimeout(openTimer && openTimer.t); const n = tg.into; openTimer = { id: n.id, t: setTimeout(() => { n.open = true; U.renderBinder(); }, 800) }; }
      }
      return;
    }
    clearTimeout(openTimer && openTimer.t); openTimer = null;
    if (tg && tg.gap) {
      if (!line) { line = document.createElement('div'); line.id = 'be-line'; tree().appendChild(line); }
      line.hidden = false; line.style.top = (tg.y - 1) + 'px'; line.style.left = (6 + tg.gap.depth * 16 + 30) + 'px';
    }
  }
  function drop(tg) {
    if (!tg) return;
    const nodes = drag.nodes.filter(n => U.findNode(n.id));
    let parent, index;
    // take them out first, then find the place again by its neighbour (indexes shift as they leave)
    const leaving = nodes.map(n => { const f = U.findNode(n.id); return { n, wasTrash: (U.rootOf(n.id) || {}).kind === 'trash', from: { parent: f.parent ? f.parent.id : null, index: f.index } }; });
    for (const l of leaving) { const f = U.findNode(l.n.id); f.list.splice(f.index, 1); }
    if (tg.into) { parent = tg.into; index = (parent.children || []).length; }
    else {
      parent = U.findNode(tg.gap.parent).node;
      const kids = parent.children || (parent.children = []);
      index = tg.gap.first ? 0 : tg.gap.before ? kids.findIndex(c => c.id === tg.gap.before) : kids.findIndex(c => c.id === tg.gap.after) + 1;
      if (index < 0) index = kids.length;
    }
    parent.children = parent.children || [];
    parent.children.splice(index, 0, ...nodes);
    parent.open = true;
    const toTrash = parent.kind === 'trash' || (U.rootOf(parent.id) || {}).kind === 'trash';
    for (const l of leaving) { if (toTrash && !l.wasTrash) l.n.trashedFrom = l.from; else if (!toTrash) delete l.n.trashedFrom; }
    U.scheduleMeta(); U.renderBinder(); bars();
  }
  function down(e) {
    const g = e.target.closest && e.target.closest('.be-grip'); if (!on || !g) return;
    const row = g.closest('.tree-row[data-id]'), f = row && U.findNode(row.dataset.id); if (!f || f.node.root) return;
    e.preventDefault(); e.stopPropagation();
    const nodes = ticked.has(f.node.id) ? tops() : [f.node];
    const b = row.getBoundingClientRect();
    const ghost = row.cloneNode(true); ghost.id = 'be-ghost';
    Object.assign(ghost.style, { position: 'fixed', left: b.left + 'px', top: b.top + 'px', width: b.width + 'px', paddingLeft: row.style.paddingLeft });
    if (nodes.length > 1) { const c = document.createElement('span'); c.className = 'be-count'; c.textContent = `${nodes.length}`; ghost.appendChild(c); }
    document.body.appendChild(ghost);
    drag = { nodes, dy: e.clientY - b.top, ghost, last: null, x: e.clientX, y0: e.clientY, depth: depths()[f.node.id] || 1 };
    for (const n of nodes) { const r = $(`#binder-tree .tree-row[data-id="${n.id}"]`); if (r) r.classList.add('be-moving'); }
    try { g.setPointerCapture(e.pointerId); } catch {}
    g.addEventListener('pointermove', move); g.addEventListener('pointerup', up); g.addEventListener('pointercancel', cancel);
  }
  function move(e) {
    if (!drag) return;
    drag.ghost.style.top = (e.clientY - drag.dy) + 'px';
    const t = tree(), r = t.getBoundingClientRect();
    // near an edge, and heading for it: scroll (not just for picking up a row that happens to sit near the edge)
    const goingUp = e.clientY < (drag.lastY ?? e.clientY), goingDown = e.clientY > (drag.lastY ?? e.clientY);
    if (Math.abs(e.clientY - drag.y0) > 12) { if (goingUp && e.clientY < r.top + 40) t.scrollTop -= 12; else if (goingDown && e.clientY > r.bottom - 40) t.scrollTop += 12; }
    drag.lastY = e.clientY;
    drag.last = target(e.clientX, e.clientY); show(drag.last);
  }
  function end(g) { g.removeEventListener('pointermove', move); g.removeEventListener('pointerup', up); g.removeEventListener('pointercancel', cancel); }
  function up(e) {
    const g = e.currentTarget; end(g); if (!drag) return;
    const tg = drag.last; drag.ghost.remove(); clearTimeout(openTimer && openTimer.t); openTimer = null;
    show(null); drop(tg); drag = null; U.renderBinder();
  }
  function cancel(e) { end(e.currentTarget); if (drag) drag.ghost.remove(); drag = null; show(null); U.renderBinder(); }

  // ---------------------------------------------------------------- wiring
  function wire() {
    const t = tree(); if (!t || t.dataset.beWired) return; t.dataset.beWired = '1';
    t.addEventListener('pointerdown', down, true);
    // while editing, a tap ticks (the arrow still opens and closes a folder) and holding doesn't open the menu
    t.addEventListener('click', e => {
      if (!on) return;
      const row = e.target.closest('.tree-row[data-id]'); if (!row || e.target.closest('.tr-chev') || e.target.closest('.be-grip')) return;
      const f = U.findNode(row.dataset.id); if (!f) return;
      if (f.node.root) return;   // a section: the normal tap opens or closes it
      e.preventDefault(); e.stopImmediatePropagation(); tick(f.node.id);
    }, true);
    t.addEventListener('contextmenu', e => { if (on) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
    t.addEventListener('dragstart', e => { if (on) e.preventDefault(); }, true);
  }
  U.on('binder', () => { wire(); button(); decorate(); });
  U.on('leave', () => { if (on) stop(); });
  button(); wire();
  return { start, stop, get on() { return on; }, _test: { tops, ticked, target: (x, y) => target(x, y), drop: tg => drop(tg), setDrag: (nodes, x, depth) => { drag = { nodes, x: x || 0, depth: depth || 1 }; } } };
})();
