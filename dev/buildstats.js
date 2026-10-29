// Unwip - Build › Stat system (LitRPG status screen). A character's class, stats and how they grow each level, an
// XP curve (how much experience each level takes), and a status screen at any level, as a picture or as
// [bracketed] lines for the book, which the LitRPG ledger then follows chapter by chapter.
(function () {
  'use strict';
  const B = window.UnwipBuild; if (!B) return;
  const U = window.__unwip;
  const { $, $$, esc, fmt } = U;

  const CURVES = {
    linear: { name: 'Steady', note: 'every level takes the same extra amount', f: (L, b) => b * L },
    quad: { name: 'Climbing', note: 'each level takes a bit more than the last (most games)', f: (L, b) => Math.round(b * L * L) },
    exp: { name: 'Steep', note: 'each level takes a set percentage more (high levels get very slow)', f: (L, b, g) => Math.round(b * Math.pow(g, L - 1)) }
  };
  const LOOKS = {
    system: { name: 'System blue', bg: '#0d1626', panel: '#13213a', line: '#4f8fe8', ink: '#e7f0ff', soft: '#9fb7da', accent: '#7fd0ff' },
    parchment: { name: 'Parchment', bg: '#f4ecd8', panel: '#efe3c8', line: '#7a5c2e', ink: '#3a2a19', soft: '#6b5434', accent: '#9a3b2b' },
    dark: { name: 'Dark', bg: '#151515', panel: '#1f1f1f', line: '#8a8a8a', ink: '#f2f2f2', soft: '#b5b5b5', accent: '#e0b65a' },
    clean: { name: 'Clean', bg: '#ffffff', panel: '#f4f6fa', line: '#9aa3b2', ink: '#1f2430', soft: '#4a5262', accent: '#34528a' }
  };
  const id = () => U.uid();
  const blank = () => ({
    name: '', cls: '', race: '', show: 5, maxLevel: 30, look: 'system',
    xp: { curve: 'quad', base: 100, growth: 1.25 },
    res: [{ id: id(), name: 'HP', base: 100, per: 10 }, { id: id(), name: 'MP', base: 50, per: 5 }],
    stats: [{ id: id(), name: 'Strength', base: 10, per: 1 }, { id: id(), name: 'Agility', base: 10, per: 1 }, { id: id(), name: 'Intelligence', base: 10, per: 1 }, { id: id(), name: 'Vitality', base: 10, per: 1 }],
    notes: ''
  });
  const at = (s, L) => Math.round((+s.base || 0) + (+s.per || 0) * (L - 1));
  const xpFor = (d, L) => { const c = CURVES[d.xp.curve] || CURVES.quad; return c.f(L, +d.xp.base || 100, +d.xp.growth || 1.25); };   // to go from L to L+1
  const totalTo = (d, L) => { let t = 0; for (let i = 1; i < L; i++) t += xpFor(d, i); return t; };

  // ---- the status screen picture
  function screenSVG(item, d, L) {
    const P = LOOKS[d.look] || LOOKS.system, x = s => esc(String(s == null ? '' : s));
    const H = 210 + Math.ceil(d.stats.length / 2) * 40 + d.res.length * 44 + 40;
    let y = 196;
    const res = d.res.map(r => { const g = `<text x="56" y="${y}" font-size="20" fill="${P.soft}">${x(r.name)}</text><rect x="170" y="${y - 16}" width="420" height="20" rx="4" fill="none" stroke="${P.line}"/><rect x="172" y="${y - 14}" width="416" height="16" rx="3" fill="${P.accent}" opacity=".55"/><text x="744" y="${y}" font-size="18" fill="${P.ink}" text-anchor="end">${x(fmt(at(r, L)))}</text>`; y += 44; return g; }).join('');
    y += 6;
    const st = d.stats.map((s, i) => { const col = i % 2, gx = col ? 400 : 56, gy = y + Math.floor(i / 2) * 40; return `<text x="${gx}" y="${gy}" font-size="20" fill="${P.soft}">${x(s.name)}</text><text x="${gx + 290}" y="${gy}" font-size="22" fill="${P.ink}" text-anchor="end" font-weight="bold">${x(fmt(at(s, L)))}</text>`; }).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 ${H}" width="800" height="${H}" font-family="'IBM Plex Mono', Menlo, Consolas, monospace">
      <rect width="800" height="${H}" rx="18" fill="${P.bg}"/><rect x="16" y="16" width="768" height="${H - 32}" rx="12" fill="${P.panel}" stroke="${P.line}" stroke-width="2"/>
      <text x="400" y="62" text-anchor="middle" font-size="18" letter-spacing="6" fill="${P.accent}">STATUS</text>
      <text x="56" y="112" font-size="30" font-weight="bold" fill="${P.ink}">${x(d.name || item.title || 'Unnamed')}</text>
      <text x="744" y="112" text-anchor="end" font-size="26" fill="${P.accent}">Level ${L}</text>
      <text x="56" y="144" font-size="18" fill="${P.soft}">${x([d.race, d.cls].filter(Boolean).join(' · '))}</text>
      <line x1="56" y1="162" x2="744" y2="162" stroke="${P.line}" stroke-opacity=".6"/>
      ${res}${st}
      <text x="56" y="${H - 40}" font-size="15" fill="${P.soft}">XP to level ${L + 1}: ${x(fmt(xpFor(d, L)))}  ·  total so far: ${x(fmt(totalTo(d, L)))}</text></svg>`;
  }
  // the same, as [bracketed] lines for the book (the ledger reads these)
  function bracketLines(item, d, L) {
    const who = d.name || item.title || 'Unnamed';
    const lines = [`[Status: ${who}]`, `[Level: ${L}]${d.cls ? ` [Class: ${d.cls}]` : ''}${d.race ? ` [Race: ${d.race}]` : ''}`];
    if (d.res.length) lines.push(d.res.map(r => `[${r.name}: ${at(r, L)}/${at(r, L)}]`).join(' '));
    for (let i = 0; i < d.stats.length; i += 3) lines.push(d.stats.slice(i, i + 3).map(s => `[${s.name}: ${at(s, L)}]`).join(' '));
    return lines;
  }

  // ================================================================== THE SHEET
  let it = null, ctx = null, box = null;
  function open(item, el, c) {
    it = item; ctx = c; box = el;
    it.data = Object.assign(blank(), it.data || {});
    if (!it.data.name) it.data.name = it.title || '';
    draw();
  }
  const save = () => ctx.changed();
  function draw() {
    const d = it.data, L = Math.max(1, Math.min(+d.maxLevel || 30, +d.show || 1));
    const rowsOf = (list, k) => list.map(s => `<div class="bs-row" data-k="${k}" data-id="${s.id}"><input data-f="name" value="${esc(s.name)}" placeholder="Name"><input data-f="base" type="number" value="${s.base}" title="At level 1"><input data-f="per" type="number" step="0.5" value="${s.per}" title="Added every level"><button class="icon-btn small" data-del title="Remove">×</button></div>`).join('');
    const levels = []; for (let l = 1; l <= Math.min(+d.maxLevel || 30, 200); l++) levels.push(l);
    box.innerHTML = `<div class="bs-page">
      <div class="bs-left">
        <section class="bm-card"><h2>Who</h2>
          <div class="bs-grid"><label>Name<span class="bs-name"><input data-d="name" value="${esc(d.name)}" placeholder="e.g. Jory Pell"><button type="button" class="btn small ghost" id="bs-names" title="Name ideas (no AI)">🎲</button></span></label><label>Class<input data-d="cls" value="${esc(d.cls)}" placeholder="e.g. Dungeon Keeper"></label><label>Race<input data-d="race" value="${esc(d.race)}" placeholder="optional"></label></div></section>
        <section class="bm-card"><h2>Stats</h2><p class="bm-help">Each stat’s value at level 1, and how much it goes up every level.</p>
          <div class="bs-row bs-th"><span>Bars (HP, MP…)</span><span>At level 1</span><span>Per level</span><span></span></div>${rowsOf(d.res, 'res')}<button class="btn small ghost" data-add="res">+ Add a bar</button>
          <div class="bs-row bs-th" style="margin-top:12px"><span>Stats</span><span>At level 1</span><span>Per level</span><span></span></div>${rowsOf(d.stats, 'stats')}<button class="btn small ghost" data-add="stats">+ Add a stat</button></section>
        <section class="bm-card"><h2>Experience</h2><p class="bm-help">How much XP each level takes. Change it until the numbers feel right for how fast your character should grow.</p>
          <div class="chip-row">${Object.entries(CURVES).map(([k, c]) => `<button type="button" class="chip ${d.xp.curve === k ? 'on' : ''}" data-curve="${k}" title="${esc(c.note)}">${c.name}</button>`).join('')}</div>
          <p class="hint">${esc((CURVES[d.xp.curve] || CURVES.quad).note)}</p>
          <div class="bs-grid"><label>Level 1 → 2 takes<input data-xp="base" type="number" value="${d.xp.base}"></label>${d.xp.curve === 'exp' ? `<label>Each level takes × <input data-xp="growth" type="number" step="0.05" value="${d.xp.growth}"></label>` : ''}<label>Highest level<input data-d="maxLevel" type="number" min="2" max="200" value="${d.maxLevel}"></label></div>
          <div class="bs-levels"><table><thead><tr><th>Level</th><th>XP to next</th><th>Total XP</th>${[...d.res, ...d.stats].slice(0, 6).map(s => `<th>${esc(s.name)}</th>`).join('')}</tr></thead><tbody>${levels.map(l => `<tr class="${l === L ? 'on' : ''}" data-level="${l}"><td>${l}</td><td>${fmt(xpFor(d, l))}</td><td>${fmt(totalTo(d, l))}</td>${[...d.res, ...d.stats].slice(0, 6).map(s => `<td>${fmt(at(s, l))}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>
        <section class="bm-card"><h2>Notes</h2><textarea data-d="notes" rows="3" placeholder="Where they’re at in the story, stat caps, what each stat does…">${esc(d.notes || '')}</textarea></section>
      </div>
      <div class="bs-right"><div class="bs-stick"><section class="bm-card bs-pin"><h2>Status screen</h2>
        <label class="bs-lv">Show at level <input type="range" data-d="show" min="1" max="${d.maxLevel}" value="${L}"><b>${L}</b></label>
        <div class="bs-shot" id="bs-shot"></div></section>
        <section class="bm-card bs-more">        <div class="chip-row">${Object.entries(LOOKS).map(([k, v]) => `<button type="button" class="chip ${d.look === k ? 'on' : ''}" data-look="${k}">${v.name}</button>`).join('')}</div>
        <p class="bm-help">For the book, as system messages (the LitRPG ledger follows these):</p>
        <pre class="bs-lines" id="bs-lines"></pre>
        <div class="bs-acts"><button class="btn small" id="bs-copy">Copy these lines</button></div></section></div></div>
    </div>`;
    shot();
  }
  function shot() {
    const d = it.data, L = Math.max(1, Math.min(+d.maxLevel || 30, +d.show || 1));
    const s = $('#bs-shot', box); if (s) s.innerHTML = `<img alt="" src="${B.svgURL(screenSVG(it, d, L))}">`;
    const l = $('#bs-lines', box); if (l) l.textContent = bracketLines(it, d, L).join('\n');
    const lb = box.querySelector('.bs-lv b'); if (lb) lb.textContent = L;
    $$('.bs-levels tr[data-level]', box).forEach(r => r.classList.toggle('on', +r.dataset.level === L));
  }
  let redrawT = null;
  function wire() {
    box.oninput = e => {
      const t = e.target, d = it.data;
      if (t.dataset.d) { d[t.dataset.d] = t.type === 'number' || t.type === 'range' ? +t.value : t.value; if (t.dataset.d === 'name' && !it.title) it.title = t.value; }
      else if (t.dataset.xp) d.xp[t.dataset.xp] = +t.value;
      else if (t.dataset.f) { const row = t.closest('.bs-row'), list = d[row.dataset.k], s = list.find(x => x.id === row.dataset.id); s[t.dataset.f] = t.dataset.f === 'name' ? t.value : +t.value; }
      else return;
      save(); shot();
      if (t.dataset.d !== 'show' && t.dataset.d !== 'name' && t.dataset.d !== 'cls' && t.dataset.d !== 'race' && t.dataset.d !== 'notes') { clearTimeout(redrawT); redrawT = setTimeout(() => { const y = box.scrollTop, f = document.activeElement, sel = f && f.dataset && (f.dataset.f || f.dataset.xp || f.dataset.d), rowId = f && f.closest && f.closest('.bs-row') && f.closest('.bs-row').dataset.id; draw(); box.scrollTop = y; const back = rowId ? box.querySelector(`.bs-row[data-id="${rowId}"] [data-f="${sel}"]`) : sel ? box.querySelector(`[data-xp="${sel}"], [data-d="${sel}"]`) : null; if (back) { back.focus(); try { const v = back.value; back.value = ''; back.value = v; } catch {} } }, 700); }
    };
    box.onclick = async e => {
      const t = e.target.closest('button, tr[data-level]'); if (!t) return; const d = it.data;
      if (t.matches('tr[data-level]')) { d.show = +t.dataset.level; const r = box.querySelector('[data-d="show"]'); if (r) r.value = d.show; save(); return shot(); }
      if (t.dataset.add) { d[t.dataset.add].push({ id: id(), name: '', base: t.dataset.add === 'res' ? 50 : 10, per: 1 }); save(); draw(); $$(`.bs-row[data-k="${t.dataset.add}"] [data-f="name"]`, box).pop().focus(); }
      else if (t.hasAttribute('data-del')) { const row = t.closest('.bs-row'); d[row.dataset.k] = d[row.dataset.k].filter(x => x.id !== row.dataset.id); save(); draw(); }
      else if (t.dataset.curve) { d.xp.curve = t.dataset.curve; save(); draw(); }
      else if (t.dataset.look) { d.look = t.dataset.look; $$('[data-look]', box).forEach(x => x.classList.toggle('on', x === t)); save(); shot(); }
      else if (t.id === 'bs-names') { window.UnwipNames && window.UnwipNames.open({ onUse: n => { d.name = n.name; if (!it.title || it.title === 'Untitled') { it.title = n.name; const ti = document.getElementById('bd-title'); if (ti) ti.value = n.name; } save(); draw(); } }); }
      else if (t.id === 'bs-copy') { const txt = bracketLines(it, d, Math.max(1, +d.show || 1)).join('\n'); U.copyText(txt).then(ok => U.toast(ok ? 'Copied. Paste them into a chapter.' : 'Couldn’t copy here. Select the lines and copy them.', ok ? '' : 'warn')); }
    };
  }
  const openWired = (item, el, c) => { open(item, el, c); wire(); };
  B.editors.stats = {
    blank, open: openWired,
    thumb: item => { const d = Object.assign(blank(), item.data || {}); return B.svgURL(screenSVG(item, d, Math.max(1, +d.show || 1))); },
    picture: item => { const d = Object.assign(blank(), item.data || {}), svg = screenSVG(item, d, Math.max(1, +d.show || 1)), h = +/height="(\d+)"/.exec(svg)[1]; return B.svgCanvas(svg, 1600, Math.round(1600 * h / 800)); },
    toBook: item => { const d = Object.assign(blank(), item.data || {}); return bracketLines(item, d, Math.max(1, +d.show || 1)).map(l => `<p>${esc(l)}</p>`).join(''); },
    close: () => { if (box) { box.onclick = null; box.oninput = null; } it = null; box = null; }
  };
})();
