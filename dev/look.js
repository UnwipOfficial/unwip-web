// Unwip - themes, colours and the feel of typing (typewriter scrolling, focus, caret, letter animations, key sounds).
// Everything here is cosmetic: nothing is written into your documents.
window.UnwipLook = (function () {
  'use strict';
  const U = window.__unwip;
  const { $, $$, esc, editor, editorWrap } = U;

  // ================================================================== THEMES
  // Each theme sets the interface colours. "base" picks light or dark controls (scrollbars, inputs).
  // "Match Windows" / "Match Mac" / "Match iPhone": the theme follows the device's light or dark setting
  const SYS_NAME = () => { const ua = navigator.userAgent, api = window.__unwip && window.__unwip.api;
    if (/iPhone|iPod/.test(ua)) return 'Match iPhone'; if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'Match iPad';
    if ((api && api.platform === 'darwin') || /Macintosh/.test(ua)) return 'Match Mac'; if (/Windows/.test(ua)) return 'Match Windows'; return 'Match device'; };
  const THEMES = {
    paper:    { name: 'Paper',     base: 'light', sw: ['#f4f2ed', '#fffefb', '#34528a'], v: {} },
    night:    { name: 'Night',     base: 'dark',  sw: ['#1b1c1f', '#25262a', '#8aa6dc'], v: {} },
    sepia:    { name: 'Sepia',     base: 'light', sw: ['#efe6d4', '#f8f0df', '#8a5a2b'],
      v: { bg: '#efe6d4', panel: '#e7dcc6', 'panel-2': '#dccfb5', paper: '#f8f0df', text: '#3b2f22', muted: '#7d6b55', faint: '#ab9a80', line: '#d6c8ad', accent: '#8a5a2b', sel: '#e3cfa9' } },
    linen:    { name: 'Linen',     base: 'light', sw: ['#f3f1f4', '#ffffff', '#7b4f8f'],
      v: { bg: '#f3f1f4', panel: '#ebe8ee', 'panel-2': '#e1dde6', paper: '#ffffff', text: '#2a2530', muted: '#766d80', faint: '#a79fb0', line: '#ddd8e2', accent: '#7b4f8f', sel: '#e3d6ea' } },
    mint:     { name: 'Mint',      base: 'light', sw: ['#eef3ef', '#fbfdfb', '#2f7a5b'],
      v: { bg: '#eef3ef', panel: '#e5ece7', 'panel-2': '#dae3dd', paper: '#fbfdfb', text: '#1f2a24', muted: '#66766c', faint: '#9caca2', line: '#d3ddd6', accent: '#2f7a5b', sel: '#cfe5d9' } },
    rose:     { name: 'Rose',      base: 'light', sw: ['#f6eeee', '#fffafa', '#a84a5c'],
      v: { bg: '#f6eeee', panel: '#efe4e4', 'panel-2': '#e7d8d8', paper: '#fffafa', text: '#33252a', muted: '#7e6970', faint: '#b09ca2', line: '#e3d3d5', accent: '#a84a5c', sel: '#f0d5da' } },
    slate:    { name: 'Slate',     base: 'dark',  sw: ['#20242b', '#2a2f37', '#7fb0c9'],
      v: { bg: '#20242b', panel: '#262b33', 'panel-2': '#2f353f', paper: '#2a2f37', text: '#e3e8ee', muted: '#98a2ae', faint: '#66707c', line: '#363d48', accent: '#7fb0c9', sel: '#34495a' } },
    forest:   { name: 'Forest',    base: 'dark',  sw: ['#18201b', '#1f2a23', '#8fc79a'],
      v: { bg: '#18201b', panel: '#1c251f', 'panel-2': '#243028', paper: '#1f2a23', text: '#e1eadf', muted: '#93a596', faint: '#617266', line: '#2c3a31', accent: '#8fc79a', sel: '#2e4a37' } },
    midnight: { name: 'Midnight',  base: 'dark',  sw: ['#14151f', '#1c1d2b', '#a99bf0'],
      v: { bg: '#14151f', panel: '#191a26', 'panel-2': '#222332', paper: '#1c1d2b', text: '#e6e4f2', muted: '#9a97b2', faint: '#66637d', line: '#2b2c3d', accent: '#a99bf0', sel: '#373463' } },
    ember:    { name: 'Ember',     base: 'dark',  sw: ['#1f1a17', '#29221e', '#e39a5a'],
      v: { bg: '#1f1a17', panel: '#241e1a', 'panel-2': '#2e2621', paper: '#29221e', text: '#f0e6dc', muted: '#ab9b8d', faint: '#76685c', line: '#3a302a', accent: '#e39a5a', sel: '#4e3826' } },
    // game-system looks, for LitRPG and sci-fi
    sysblue:  { name: 'System',    base: 'dark',  sw: ['#0b1322', '#101b2e', '#5fb4ff'],
      v: { bg: '#0b1322', panel: '#0f1a2c', 'panel-2': '#152238', paper: '#101b2e', text: '#dce8f8', muted: '#8ea3c0', faint: '#5b6e8a', line: '#1f3150', accent: '#5fb4ff', sel: '#1d3a62' } },
    terminal: { name: 'Terminal',  base: 'dark',  sw: ['#0a0d0a', '#0f140f', '#5fd38a'],
      v: { bg: '#0a0d0a', panel: '#0d120d', 'panel-2': '#131a13', paper: '#0f140f', text: '#c9f2d4', muted: '#7fae8b', faint: '#4e6e57', line: '#1c2a1f', accent: '#5fd38a', sel: '#1f4a2c' } },
    neon:     { name: 'Neon',      base: 'dark',  sw: ['#120f1a', '#1a1624', '#ff5fa2'],
      v: { bg: '#120f1a', panel: '#161220', 'panel-2': '#1f1a2c', paper: '#1a1624', text: '#efe6f7', muted: '#a597b8', faint: '#6d6182', line: '#2c2340', accent: '#ff5fa2', sel: '#4a2346' } },
    status:   { name: 'Status',    base: 'light', sw: ['#eef2f7', '#fbfcfe', '#2f6fd0'],
      v: { bg: '#eef2f7', panel: '#e6ebf2', 'panel-2': '#dbe2ec', paper: '#fbfcfe', text: '#1a2433', muted: '#5f6d82', faint: '#93a0b3', line: '#d3dbe6', accent: '#2f6fd0', sel: '#cfdcf2' } },
    // occult looks, for witches, demons and dark fantasy
    witch:    { name: 'Witch',     base: 'dark',  sw: ['#17131c', '#1d1724', '#d6a95b'],
      v: { bg: '#17131c', panel: '#1b1622', 'panel-2': '#241d2d', paper: '#1d1724', text: '#ece3d6', muted: '#a99bab', faint: '#6e6175', line: '#2e2538', accent: '#d6a95b', sel: '#3e2f4a' } },
    infernal: { name: 'Infernal',  base: 'dark',  sw: ['#120a0a', '#190e0e', '#e0452f'],
      v: { bg: '#120a0a', panel: '#160c0c', 'panel-2': '#201111', paper: '#190e0e', text: '#f1dfd6', muted: '#b08d84', faint: '#74554e', line: '#2d1716', accent: '#e0452f', sel: '#4a1a16' } },
    contrast: { name: 'High contrast', base: 'light', sw: ['#ffffff', '#ffffff', '#0033cc'],
      v: { bg: '#ffffff', panel: '#f2f2f2', 'panel-2': '#e6e6e6', paper: '#ffffff', text: '#000000', muted: '#333333', faint: '#555555', line: '#8a8a8a', accent: '#0033cc', sel: '#b3c6ff' } }
  };
  const ACCENTS = ['#34528a', '#2f7a5b', '#8a5a2b', '#a84a5c', '#7b4f8f', '#b4423a', '#1f7a8c', '#c27c0e', '#5c6b2f', '#444444'];
  const PAGES = { theme: 'Theme default', white: 'White', cream: 'Cream', grey: 'Soft grey', dark: 'Dark' };
  const PAGE_COL = { white: ['#ffffff', '#1d1b18'], cream: ['#fbf6e9', '#2b261d'], grey: ['#eceae6', '#26241f'], dark: ['#1e1f22', '#e2dfd8'] };
  const ROOMS = { page: 'Same as the page', theme: 'Theme background', dark: 'Dark room', black: 'Black' };

  const DEF_LOOK = { theme: 'system', light: 'paper', dark: 'night', accent: '', page: 'theme', pageStyle: 'card', room: 'page', uiSize: 100, pageZoom: 100 };
  const DEF_TYPE = { tw: 'writer', twPos: 0.45, twSmooth: true, focus: 'off', focusWhere: 'writer', caret: 'normal', blink: true,
    anim: 'none', sound: 'off', volume: 0.5, bell: true };

  function load(key, def) { try { return { ...def, ...JSON.parse(localStorage.getItem(key) || '{}') }; } catch { return { ...def }; } }
  function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} if (window.UnwipPrefs) window.UnwipPrefs.changed(key); }
  let look = load('unwip-look', DEF_LOOK);
  // older setting from the simple Light/Dark/System picker
  try { const old = localStorage.getItem('folio-theme'); if (old && !localStorage.getItem('unwip-look')) look.theme = old === 'light' ? 'paper' : old === 'dark' ? 'night' : 'system'; } catch {}
  let typing = load('unwip-typing', DEF_TYPE);

  const darkOS = () => matchMedia('(prefers-color-scheme: dark)').matches;
  function themeId(l = look) { return l.theme === 'system' ? (darkOS() ? l.dark : l.light) : l.theme; }

  function mix(hex, other, k) {
    const p = h => { h = h.replace('#', ''); if (h.length === 3) h = h.replace(/./g, c => c + c); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
    const a = p(hex), b = p(other);
    return '#' + a.map((v, i) => Math.round(v * k + b[i] * (1 - k)).toString(16).padStart(2, '0')).join('');
  }
  function lum(hex) { const h = hex.replace('#', ''); const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }

  const VAR_KEYS = ['bg', 'panel', 'panel-2', 'paper', 'text', 'muted', 'faint', 'line', 'accent', 'accent-soft', 'accent-text', 'sel', 'page-bg', 'page-ink', 'room'];
  function applyLook(l = look) {
    const root = document.documentElement;
    const t = THEMES[themeId(l)] || THEMES.paper;
    root.dataset.theme = t.base;
    root.dataset.skin = themeId(l);
    for (const k of VAR_KEYS) root.style.removeProperty('--' + k);
    for (const [k, v] of Object.entries(t.v)) root.style.setProperty('--' + k, v);
    const cs = getComputedStyle(root);
    const bg = (t.v.bg || cs.getPropertyValue('--bg')).trim();
    const accent = l.accent || t.v.accent;
    if (accent) {
      root.style.setProperty('--accent', accent);
      root.style.setProperty('--accent-soft', mix(accent, bg, t.base === 'dark' ? 0.22 : 0.16));
      root.style.setProperty('--accent-text', lum(accent) > 0.55 ? '#15171c' : '#ffffff');
      root.style.setProperty('--sel', mix(accent, bg, t.base === 'dark' ? 0.35 : 0.22));
    }
    const pc = PAGE_COL[l.page];
    if (pc) { root.style.setProperty('--page-bg', pc[0]); root.style.setProperty('--page-ink', pc[1]); }
    const room = l.room === 'dark' ? '#16171a' : l.room === 'black' ? '#000000' : l.room === 'theme' ? 'var(--bg)' : '';
    if (room) root.style.setProperty('--room', room);
    document.body.classList.toggle('page-flat', l.pageStyle === 'flat');
    if (U.api.setZoom) U.api.setZoom((l.uiSize || 100) / 100);
    // page zoom: only the writing page gets bigger (text and page width together); toolbars stay as they are
    const pz = Math.min(2, Math.max(0.8, (l.pageZoom || 100) / 100));
    root.style.setProperty('--page-zoom', pz);
    const zl = document.getElementById('st-zoom'); if (zl) zl.textContent = Math.round(pz * 100) + '%';
  }
  // Ctrl/⌘ + Alt + = / - / 0, the buttons in the status bar, and Ctrl+K all land here
  const ZOOMS = [80, 90, 100, 110, 125, 150, 175, 200];
  function pageZoom(step) {
    const cur = look.pageZoom || 100;
    let next = step === 0 ? 100 : step > 0 ? (ZOOMS.find(z => z > cur) || 200) : ([...ZOOMS].reverse().find(z => z < cur) || 80);
    look = { ...look, pageZoom: next }; save('unwip-look', look); applyLook();
    if (window.UnwipLook && typewriterActive()) try { U.typewriterScroll(true); } catch {}
    try { placeCaret(); } catch {}
    const zl = document.getElementById('st-zoom'); if (zl) { zl.classList.remove('flash'); void zl.offsetWidth; zl.classList.add('flash'); }
  }
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || !e.altKey || e.shiftKey) return;
    const k = e.code === 'Equal' || e.code === 'NumpadAdd' ? 1 : e.code === 'Minus' || e.code === 'NumpadSubtract' ? -1 : e.code === 'Digit0' || e.code === 'Numpad0' ? 0 : null;
    if (k === null || !U.S.project) return;
    e.preventDefault(); pageZoom(k);
  }, true);
  { const sb = document.getElementById('statusbar'), sp = sb && sb.querySelector('.st-spacer');
    if (sp) { const z = document.createElement('span'); z.className = 'st-zoomer';
      z.innerHTML = '<button class="st-btn" type="button" id="st-zoom-out" title="Smaller page (Ctrl+Alt+−)" aria-label="Smaller page">−</button><button class="st-btn" type="button" id="st-zoom" title="Page size: only the writing page, not the toolbars. Click for 100%">100%</button><button class="st-btn" type="button" id="st-zoom-in" title="Bigger page (Ctrl+Alt+=)" aria-label="Bigger page">+</button>';
      sp.after(z);
      z.querySelector('#st-zoom-out').onclick = () => pageZoom(-1); z.querySelector('#st-zoom-in').onclick = () => pageZoom(1); z.querySelector('#st-zoom').onclick = () => pageZoom(0);
      // Writer mode strip (like Scrivener's composition controls): the status bar slides up when the mouse nears the
      // bottom edge, with page size, typewriter, fade and Exit. These buttons never take the cursor out of the page.
      const w = document.createElement('span'); w.className = 'st-writer';
      w.innerHTML = '<button class="st-btn" type="button" id="st-tw" title="Typewriter scrolling: keep the line you’re typing on still"></button><button class="st-btn" type="button" id="st-fade" title="Fade everything except the paragraph or sentence you’re in. Click to change"></button><button class="st-btn st-wexit" type="button" id="st-wexit" title="Back to the full layout (Esc)">Exit writer mode</button>';
      z.after(w);
      sb.addEventListener('mousedown', e => { if (inWriter() && e.target.closest('.st-zoomer, .st-writer')) e.preventDefault(); });
      w.querySelector('#st-tw').onclick = () => { setTyping({ tw: typewriterActive() ? 'off' : 'writer' }); if (typewriterActive()) try { U.typewriterScroll(true); } catch {} };
      w.querySelector('#st-fade').onclick = () => { const n = { off: 'paragraph', paragraph: 'sentence', sentence: 'off' }[typing.focus] || 'off'; setTyping({ focus: n, focusWhere: typing.focusWhere === 'always' ? 'always' : 'writer' }); };
      w.querySelector('#st-wexit').onclick = () => U.setWriter(false);
      let peek = 0;
      document.addEventListener('mousemove', e => {
        if (!inWriter()) return;
        const near = e.clientY > innerHeight - 56;
        if (near) { clearTimeout(peek); sb.classList.add('peek'); }
        else if (sb.classList.contains('peek') && !sb.matches(':hover')) { clearTimeout(peek); peek = setTimeout(() => sb.classList.remove('peek'), 600); }
      }, { passive: true });
      document.addEventListener('keydown', () => { if (sb.classList.contains('peek') && !sb.contains(document.activeElement)) sb.classList.remove('peek'); }, true);
      U.on && U.on('writer', on => { sb.classList.remove('peek'); if (on) stripLabels(); });
    } }
  function stripLabels() {
    const a = document.getElementById('st-tw'), b = document.getElementById('st-fade'); if (!a || !b) return;
    const tw = typing.tw === 'always' || typing.tw === 'writer';
    a.textContent = 'Typewriter: ' + (tw ? 'on' : 'off'); a.classList.toggle('on', tw);
    const f = typing.focus || 'off'; b.textContent = 'Fade: ' + (f === 'off' ? 'off' : f); b.classList.toggle('on', f !== 'off');
  }
  // a change from the writer strip: saved like the Typewriter & animations window would save it
  function setTyping(patch) { typing = { ...typing, ...patch }; save('unwip-typing', typing); try { placeCaret(); updateFocus(); } catch {} stripLabels(); }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyLook());
  applyLook();

  function swatch(t) { return `<span class="th-sw" style="background:${t.sw[0]}"><i style="background:${t.sw[1]}"></i><b style="background:${t.sw[2]}"></b></span>`; }

  async function openThemes() {
    const before = { ...look };
    const draft = { ...look };
    const body = document.createElement('div');
    const opt = (o, cur) => Object.entries(o).map(([v, l]) => `<option value="${v}" ${v === String(cur) ? 'selected' : ''}>${l}</option>`).join('');
    const render = () => {
      const lights = Object.entries(THEMES).filter(([, t]) => t.base === 'light'), darks = Object.entries(THEMES).filter(([, t]) => t.base === 'dark');
      const card = ([id, t]) => `<button type="button" class="th-card ${draft.theme === id ? 'on' : ''}" data-t="${id}">${swatch(t)}<span>${esc(t.name)}</span></button>`;
      body.innerHTML = `
        <div class="th-row"><button type="button" class="th-card sys ${draft.theme === 'system' ? 'on' : ''}" data-t="system">${swatch(THEMES[draft.light])}${swatch(THEMES[draft.dark])}<span>${SYS_NAME()}</span></button>
          <div class="th-sys-pick ${draft.theme === 'system' ? '' : 'dim'}"><label>Daytime <select id="th-light">${opt(Object.fromEntries(lights.map(([id, t]) => [id, t.name])), draft.light)}</select></label>
          <label>Night-time <select id="th-dark">${opt(Object.fromEntries(darks.map(([id, t]) => [id, t.name])), draft.dark)}</select></label></div></div>
        <div class="ip-label">Light</div><div class="th-grid">${lights.map(card).join('')}</div>
        <div class="ip-label">Dark</div><div class="th-grid">${darks.map(card).join('')}</div>
        <div class="ip-label">Accent colour</div>
        <div class="th-accents"><button type="button" class="th-acc def ${!draft.accent ? 'on' : ''}" data-a="" title="The theme's own colour">Auto</button>${ACCENTS.map(a => `<button type="button" class="th-acc ${draft.accent === a ? 'on' : ''}" data-a="${a}" style="--a:${a}" title="${a}"></button>`).join('')}
          <label class="th-custom" title="Pick any colour"><input type="color" id="th-color" value="${draft.accent || '#34528a'}"> Custom</label></div>
        <div class="form-grid" style="margin-top:14px">
          <div class="field"><label>Writing page colour</label><select id="th-page">${opt(PAGES, draft.page)}</select></div>
          <div class="field"><label>Page look</label><select id="th-pstyle">${opt({ card: 'A sheet of paper', flat: 'Full width, no edges' }, draft.pageStyle)}</select></div>
          <div class="field"><label>Writer mode background</label><select id="th-room">${opt(ROOMS, draft.room)}</select></div>
          <div class="field"><label>Page size (just the writing page)</label><select id="th-pz">${opt({ 80: '80%', 90: '90%', 100: '100%', 110: '110%', 125: '125%', 150: '150%', 175: '175%', 200: '200%' }, draft.pageZoom || 100)}</select></div>
          <div class="field"><label>Interface size</label><select id="th-ui">${opt({ 90: 'Small', 100: 'Normal', 110: 'Large', 125: 'Extra large' }, draft.uiSize)}</select></div>
        </div>
        <p class="rp-note">Changes show straight away so you can see them. Cancel puts everything back. Exports always use your manuscript style, never these colours.</p>`;
      $$('.th-card', body).forEach(b => b.onclick = () => { draft.theme = b.dataset.t; update(); });
      $$('.th-acc', body).forEach(b => b.onclick = () => { draft.accent = b.dataset.a; update(); });
      $('#th-color', body).oninput = e => { draft.accent = e.target.value; applyLook(draft); $$('.th-acc', body).forEach(x => x.classList.remove('on')); };
      $('#th-color', body).onchange = () => update();
      const sel = (id, key, num) => $(id, body).onchange = e => { draft[key] = num ? +e.target.value : e.target.value; update(); };
      sel('#th-light', 'light'); sel('#th-dark', 'dark'); sel('#th-page', 'page'); sel('#th-pstyle', 'pageStyle'); sel('#th-room', 'room'); sel('#th-ui', 'uiSize', true); sel('#th-pz', 'pageZoom', true);
    };
    const update = () => { applyLook(draft); const sc = body.closest('.m-body'); const top = sc ? sc.scrollTop : 0; render(); if (sc) sc.scrollTop = top; };
    render();
    const ok = await U.modal({ title: 'Themes & colours', body, wide: true, buttons: [{ label: 'Reset to default', value: 'reset', kind: 'ghost' }, { label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Save', value: true, kind: 'primary' }] });
    if (ok === 'reset') look = { ...DEF_LOOK };
    else if (ok) look = draft; else look = before;
    save('unwip-look', look); applyLook();
  }

  // ================================================================== TYPING FEEL
  const inWriter = () => document.body.classList.contains('writer');
  function typewriterActive() { return typing.tw === 'always' || (typing.tw === 'writer' && inWriter()); }
  function focusActive() { return typing.focus !== 'off' && (typing.focusWhere === 'always' || inWriter()); }

  // ---- where the caret is on screen (works in empty paragraphs and at line starts)
  function caretRect(sel) {
    if (!sel || !sel.rangeCount) return null;
    const r = sel.getRangeAt(0).cloneRange(); r.collapse(!sel.isCollapsed ? false : true);
    const rects = r.getClientRects();
    if (rects.length && rects[0].height) return rects[rects.length - 1];
    const n = r.startContainer, o = r.startOffset;
    const tmp = document.createRange();
    if (n.nodeType === 3) {
      if (o < n.length) { tmp.setStart(n, o); tmp.setEnd(n, o + 1); const q = tmp.getClientRects()[0]; if (q && q.height) return { left: q.left, top: q.top, height: q.height, width: 0 }; }
      if (o > 0) { tmp.setStart(n, o - 1); tmp.setEnd(n, o); const q = [...tmp.getClientRects()].pop(); if (q && q.height) return { left: q.right, top: q.top, height: q.height, width: 0 }; }
    } else {
      const child = n.childNodes[o] || n.childNodes[o - 1];
      if (child) { tmp.selectNode(child); const q = tmp.getBoundingClientRect(); if (q.height) return { left: child === n.childNodes[o] ? q.left : q.right, top: q.top, height: q.height, width: 0 }; }
      const q = n.getBoundingClientRect && n.getBoundingClientRect(); if (q && q.height) {
        const cs = getComputedStyle(n); const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3;
        return { left: q.left + (parseFloat(cs.textIndent) || 0), top: q.top, height: Math.min(lh, q.height), width: 0 };
      }
    }
    return null;
  }

  // ---- custom caret (thick, block, smooth glide)
  const caret = document.createElement('div'); caret.className = 'tw-caret hidden'; document.body.appendChild(caret);
  let caretTimer = null;
  // where the custom cursor goes and how big it is: a line, a thick line, a block, or a terminal underscore
  function caretGeo(rc, z) {
    const h = rc.height / z, c = typing.caret;
    if (c === 'under') { const w = Math.max(7, h * 0.5); return { w, h: Math.max(2, h * 0.09), x: rc.left / z, y: rc.top / z + h * 0.86 }; }
    const w = c === 'thick' || c === 'glow' ? 3 : c === 'block' ? Math.max(6, h * 0.5) : 2;
    return { w, h, x: rc.left / z - (c === 'block' ? 0 : w / 2), y: rc.top / z };
  }
  function placeCaret() {
    const custom = typing.caret !== 'normal';
    document.body.classList.toggle('custom-caret', custom);
    const sel = getSelection();
    const show = custom && document.activeElement === editor && sel.rangeCount && sel.isCollapsed && editor.contains(sel.anchorNode);
    if (!show) { caret.classList.add('hidden'); return; }
    const rc = caretRect(sel); if (!rc) { caret.classList.add('hidden'); return; }
    const z = parseFloat(document.body.style.zoom) || 1;
    caret.className = `tw-caret ${typing.caret}${typing.blink ? '' : ' still'}`;
    const G = caretGeo(rc, z);
    caret.style.height = G.h + 'px'; caret.style.width = G.w + 'px';
    caret.style.transform = `translate(${G.x}px, ${G.y}px)`;
    // restart the blink so the caret is solid while you type
    caret.classList.add('solid'); clearTimeout(caretTimer); caretTimer = setTimeout(() => caret.classList.remove('solid'), 500);
  }

  // ---- focus: dim everything except the paragraph or sentence you're in
  const hasHL = typeof Highlight !== 'undefined' && CSS.highlights;
  function textPoint(block, offset) {
    const w = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    let n, left = offset;
    while ((n = w.nextNode())) { if (left <= n.length) return [n, left]; left -= n.length; }
    return [block, block.childNodes.length];
  }
  function updateFocus() {
    if (!hasHL) return;
    CSS.highlights.delete('unwip-dim');
    if (!focusActive() && !messyFade) return;
    const sel = getSelection(); if (!sel.rangeCount || !editor.contains(sel.anchorNode)) return;
    const block = U.currentBlock(sel.anchorNode); if (!block) return;
    let start = document.createRange(), end = document.createRange();
    if (typing.focus === 'sentence' && !messyFade) {
      const pre = document.createRange(); pre.selectNodeContents(block); pre.setEnd(sel.anchorNode, sel.anchorOffset);
      const pos = pre.toString().length, text = block.textContent;
      const re = /[.!?…]+["'”’)\]]*\s+/g; let m, s0 = 0, s1 = text.length;
      while ((m = re.exec(text))) { const e = m.index + m[0].length; if (e <= pos) s0 = e; else { s1 = e; break; } }
      start.setStart(...textPoint(block, s0)); end.setStart(...textPoint(block, s1));
    } else { start.setStartBefore(block); end.setStartAfter(block); }
    const a = document.createRange(); a.setStart(editor, 0); a.setEnd(start.startContainer, start.startOffset);
    const b = document.createRange(); b.setStart(end.startContainer, end.startOffset); b.setEnd(editor, editor.childNodes.length);
    CSS.highlights.set('unwip-dim', new Highlight(a, b));
  }
  let messyFade = false;   // stuck.js turns this on for messy draft mode
  function setMessyFade(on) { messyFade = on; updateFocus(); }

  // ---- letter animations: hide the real letter for a moment and float a copy into its place
  const layer = document.createElement('div'); layer.className = 'tw-layer'; document.body.appendChild(layer);
  const hidden = hasHL ? new Highlight() : null; if (hidden) CSS.highlights.set('unwip-typed', hidden);
  function animateLetters(e, scope) {
    if (typing.anim === 'none' || !hidden || e.inputType !== 'insertText' || !e.data || e.data.length > 3 || /^\s+$/.test(e.data)) return;
    const sel = getSelection(); if (!sel.rangeCount || !sel.isCollapsed) return;
    const n = sel.anchorNode, o = sel.anchorOffset;
    if (n.nodeType !== 3 || o < e.data.length || !scope.contains(n)) return;
    const r = document.createRange(); r.setStart(n, o - e.data.length); r.setEnd(n, o);
    const rc = r.getClientRects()[0]; if (!rc || !rc.width) return;
    const z = parseFloat(document.body.style.zoom) || 1;
    const cs = getComputedStyle(n.parentElement);
    const g = document.createElement('span');
    g.className = 'tw-ghost ' + typing.anim;
    if (typing.anim === 'strike') g.style.setProperty('--tilt', (Math.random() * 6 - 3).toFixed(1) + 'deg');
    if (typing.anim === 'scatter') { const a = Math.random() * Math.PI * 2; g.style.setProperty('--dx', (Math.cos(a) * 1.6).toFixed(2) + 'em'); g.style.setProperty('--dy', (Math.sin(a) * 1.6).toFixed(2) + 'em'); g.style.setProperty('--rot', (Math.random() * 120 - 60).toFixed(0) + 'deg'); }
    g.textContent = e.data;
    if (typing.anim === 'decode') {   // the letter flickers through a few symbols, then settles on the real one
      const real = e.data, CH = '01#%&*+=<>/\\|?ABCDEFXZ'; let k = 0;
      const iv = setInterval(() => { if (++k > 5 || !g.isConnected) { clearInterval(iv); g.textContent = real; return; } g.textContent = CH[Math.floor(Math.random() * CH.length)]; }, 38);
      g.textContent = CH[Math.floor(Math.random() * CH.length)];
    }
    g.style.cssText = `left:${rc.left / z}px; top:${rc.top / z}px; height:${rc.height / z}px; line-height:${rc.height / z}px; font:${cs.fontStyle} ${cs.fontWeight} ${parseFloat(cs.fontSize) * (n.parentElement.closest('.page') ? Math.min(2, Math.max(0.8, (look.pageZoom || 100) / 100)) : 1)}px ${cs.fontFamily}; color:${cs.color}; letter-spacing:${cs.letterSpacing};`;
    layer.appendChild(g);
    hidden.add(r);
    const done = () => { hidden.delete(r); g.remove(); };
    g.addEventListener('animationend', done); setTimeout(done, 900);
  }

  // ---- key sounds, made on the fly (no sound files)
  // Each sound is built from noise and tones shaped to copy the real thing: a typewriter's type-bar
  // clack, platen thud and escapement tick; a clicky switch's double click and plastic thock; a laptop's
  // muffled tap; graphite grain scratching across paper.
  let ac = null, master = null, lastSound = 0, white = null;
  function ctx() {
    if (!ac) {
      try { ac = new AudioContext(); } catch { return null; }
      const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
      master = ac.createGain(); master.connect(comp); comp.connect(ac.destination);
      white = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate); const d = white.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    // an iPhone puts the sound on hold ("interrupted") while you're in another app, and sometimes leaves it there:
    // wake it from any stop, and if it won't wake, start the sound afresh (beta, 27 Oct: gone after a visit to Discord)
    if (ac.state !== 'running') {
      const was = ac, p = (() => { try { return ac.resume(); } catch { return null; } })();
      if (p && p.catch) p.catch(() => {});
      if (!stuckSince) stuckSince = Date.now();
      else if (Date.now() - stuckSince > 1500) { stuckSince = 0; try { was.close(); } catch {} ac = null; return ctx(); }
    } else stuckSince = 0;
    master.gain.value = typing.volume * 1.4;
    return ac;
  }
  let stuckSince = 0;
  // back from another app: wake the sound before the first key, if it was in use
  document.addEventListener('visibilitychange', () => { if (!document.hidden && ac && ac.state !== 'running') { try { const p = ac.resume(); if (p && p.catch) p.catch(() => {}); } catch {} } });
  const jit = (v, k = 0.08) => v * (1 - k + Math.random() * k * 2);
  // filtered noise with an attack/decay envelope. filters: [[type, freq, Q], ...]
  function burst(t, { filters = [['bandpass', 3000, 1]], attack = 0.001, decay = 0.02, gain = 0.5, len } = {}) {
    const a = ac, src = a.createBufferSource(); src.buffer = white;
    let node = src;
    for (const [type, f, q] of filters) { const b = a.createBiquadFilter(); b.type = type; b.frequency.value = jit(f); b.Q.value = q || 0.7; node.connect(b); node = b; }
    const g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    node.connect(g); g.connect(master);
    src.start(t, Math.random() * 1.5, (len || attack + decay) + 0.05);
  }
  function tone(t, { f = 120, to = null, decay = 0.05, gain = 0.4, type = 'sine' } = {}) {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type;
    o.frequency.setValueAtTime(jit(f, 0.05), t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + decay);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + decay + 0.02);
  }
  // the margin bell: a small steel dome struck by a hammer. A tick from the hammer, then a long ring whose partials are
  // not whole multiples (a bell's aren't), each one doubled a few hertz apart so the ring shimmers as it fades, and the
  // high ones dying first. (It used to be four plain sine tones, which sounded like a phone chime.)
  function ring(t, f, gain, decay) {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.0015); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + decay + 0.05);
  }
  function bell(t) {
    const f = jit(2610, 0.01);
    burst(t, { filters: [['highpass', 5000], ['bandpass', 8500, 1.2]], decay: 0.005, gain: 0.3 });   // the hammer
    for (const [r, g, d] of [[1, 0.2, 2.4], [1.0028, 0.16, 2.1], [2.41, 0.06, 1.0], [2.416, 0.045, 0.9], [3.97, 0.03, 0.5], [5.42, 0.018, 0.3], [0.502, 0.02, 0.8]]) ring(t, f * r, g, d);
  }
  // pencil: grainy noise whose loudness flickers like graphite catching paper fibres
  function scratch(t, { dur = 0.09, gain = 0.35, lo = 2200, hi = 6500, sweep = 0, rub = false } = {}) {
    const a = ac, n = Math.ceil(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    let grain = 0.5, next = 0;
    for (let i = 0; i < n; i++) {
      if (i >= next) { grain = rub ? 0.4 + 0.6 * Math.abs(Math.sin(i / n * Math.PI * 3)) : 0.15 + Math.random() * 0.85; next = i + Math.floor(a.sampleRate * (0.0008 + Math.random() * 0.0025)); }
      const p = i / n, env = Math.min(1, p / 0.12) * Math.min(1, (1 - p) / 0.3);
      d[i] = (Math.random() * 2 - 1) * grain * env;
    }
    const src = a.createBufferSource(); src.buffer = buf;
    const hp = a.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = rub ? 300 : lo;
    const bp = a.createBiquadFilter(); bp.type = rub ? 'lowpass' : 'bandpass'; bp.Q.value = 0.8;
    const f0 = rub ? 1400 : jit((lo + hi) / 2, 0.25); bp.frequency.setValueAtTime(f0, t); if (sweep) bp.frequency.linearRampToValueAtTime(f0 * sweep, t + dur);
    const g = a.createGain(); g.gain.value = gain;
    src.connect(hp); hp.connect(bp); bp.connect(g); g.connect(master); src.start(t);
  }
  const SOUNDS = {
    typewriter(kind, t) {
      if (kind === 'enter') {
        if (typing.bell) bell(t);
        for (let i = 0; i < 9; i++) burst(t + 0.12 + i * (0.022 + i * 0.003), { filters: [['highpass', 2500], ['bandpass', 4200, 2]], decay: 0.008, gain: 0.35 });
        burst(t + 0.12, { filters: [['bandpass', 900, 0.8]], attack: 0.08, decay: 0.2, gain: 0.12, len: 0.3 });   // carriage sliding
        burst(t + 0.47, { filters: [['lowpass', 1200]], decay: 0.05, gain: 0.7 }); tone(t + 0.47, { f: 95, to: 55, decay: 0.12, gain: 0.6 });
        return;
      }
      if (kind === 'space') { tone(t, { f: 90, to: 60, decay: 0.07, gain: 0.5 }); burst(t, { filters: [['lowpass', 900]], decay: 0.03, gain: 0.4 }); burst(t + 0.05, { filters: [['highpass', 4000]], decay: 0.005, gain: 0.25 }); return; }
      if (kind === 'back') { burst(t, { filters: [['bandpass', 700, 1.5]], decay: 0.04, gain: 0.5 }); burst(t + 0.04, { filters: [['highpass', 4000]], decay: 0.006, gain: 0.3 }); return; }
      burst(t, { filters: [['bandpass', 3400, 1.1]], decay: 0.014, gain: 0.95 });           // type-bar hits the ribbon
      tone(t, { f: 1870, decay: 0.035, gain: 0.05, type: 'triangle' }); tone(t, { f: 3150, decay: 0.025, gain: 0.03, type: 'triangle' });   // metal ring
      tone(t + 0.004, { f: 120, to: 70, decay: 0.05, gain: 0.45 });                        // platen thud
      burst(t + jit(0.055, 0.2), { filters: [['highpass', 5000]], decay: 0.005, gain: 0.3 });   // carriage steps along
    },
    mechanical(kind, t) {
      const big = kind === 'space' || kind === 'enter';
      if (!big) { burst(t, { filters: [['highpass', 4500], ['bandpass', 6000, 3]], decay: 0.004, gain: 0.7 }); burst(t + 0.011, { filters: [['highpass', 4500], ['bandpass', 5200, 3]], decay: 0.004, gain: 0.5 }); }
      burst(t + 0.018, { filters: [['bandpass', big ? 520 : 950, 4]], decay: big ? 0.045 : 0.03, gain: big ? 0.9 : 0.7 });   // plastic thock
      tone(t + 0.018, { f: big ? 170 : 240, decay: 0.03, gain: 0.25 });
      if (big) { burst(t + 0.03, { filters: [['highpass', 3000]], decay: 0.006, gain: 0.25 }); burst(t + 0.045, { filters: [['highpass', 3000]], decay: 0.005, gain: 0.18 }); }   // stabiliser rattle
      if (!big) burst(t + 0.09, { filters: [['highpass', 4500], ['bandpass', 5600, 3]], decay: 0.003, gain: 0.25 });   // release click
    },
    // a quiet interface blip: a short soft tone, a lower one for Space, two rising notes for Enter
    blip(kind, t) {
      if (kind === 'enter') { tone(t, { f: 660, decay: 0.08, gain: 0.18, type: 'sine' }); tone(t + 0.07, { f: 990, decay: 0.12, gain: 0.16, type: 'sine' }); return; }
      if (kind === 'back') { tone(t, { f: 420, to: 300, decay: 0.05, gain: 0.14, type: 'sine' }); return; }
      if (kind === 'space') { tone(t, { f: 520, decay: 0.035, gain: 0.12, type: 'sine' }); return; }
      tone(t, { f: jit(1180, 0.06), decay: 0.022, gain: 0.1, type: 'sine' }); tone(t, { f: 2360, decay: 0.012, gain: 0.025, type: 'triangle' });
    },
    soft(kind, t) {
      const big = kind === 'space' || kind === 'enter';
      burst(t, { filters: [['lowpass', big ? 500 : 750, 0.7]], decay: big ? 0.03 : 0.018, gain: big ? 0.7 : 0.5 });
      tone(t, { f: big ? 130 : 170, decay: 0.02, gain: 0.2 });
    },
    pencil(kind, t) {
      if (kind === 'space') { burst(t, { filters: [['highpass', 2500], ['bandpass', 3800, 2]], decay: 0.006, gain: 0.25 }); return; }   // pencil lifts and taps
      if (kind === 'enter') { scratch(t, { dur: 0.32, gain: 0.32, sweep: 0.6 }); return; }       // a long line across the page
      if (kind === 'back') { scratch(t, { dur: 0.22, gain: 0.4, rub: true }); return; }          // eraser rubbing
      scratch(t, { dur: jit(0.085, 0.35), gain: jit(0.32, 0.2), sweep: Math.random() < 0.5 ? 1.25 : 0.8 });
    }
  };
  function playKey(kind, preview) {
    const s = preview || typing.sound;
    if (s === 'off' || !SOUNDS[s]) return;
    const now = performance.now(); if (now - lastSound < 18) return; lastSound = now;
    if (!ctx()) return;
    SOUNDS[s](kind, ac.currentTime + 0.003);
  }
  function soundFor(e) {
    if (e.ctrlKey || e.altKey || e.metaKey || e.repeat && e.key !== 'Backspace') return null;
    if (e.key === 'Enter') return 'enter';
    if (e.key === ' ') return 'space';
    if (e.key === 'Backspace' || e.key === 'Delete') return 'back';
    if (e.key.length === 1) return 'key';
    return null;
  }

  // ---- wiring
  U.on('keydown', e => { const k = soundFor(e); if (k) playKey(k); });
  U.on('input', e => { animateLetters(e, editor); requestAnimationFrame(() => { placeCaret(); updateFocus(); }); });
  U.on('writer', () => { document.body.classList.toggle('writer-room', look.room !== 'page'); updateFocus(); placeCaret(); });
  U.on('doc', () => { CSS.highlights && CSS.highlights.delete('unwip-dim'); requestAnimationFrame(() => { updateFocus(); placeCaret(); }); });
  document.addEventListener('selectionchange', () => { placeCaret(); if (focusActive() || messyFade) updateFocus(); });
  editor.addEventListener('blur', () => caret.classList.add('hidden'));
  editor.addEventListener('focus', () => placeCaret());
  editorWrap.addEventListener('scroll', () => { if (typing.caret !== 'normal') placeCaret(); }, { passive: true });
  window.addEventListener('resize', () => placeCaret());

  // ---- hover explanations: anything with data-tip shows a small bubble after a moment
  const tipEl = document.createElement('div'); tipEl.className = 'ui-tip hidden'; document.body.appendChild(tipEl);
  let tipT = null, tipFor = null, touchedAt = 0;
  // a finger has no hover: the "mouseover" a tap makes would pop up a bubble on whatever ends up under it
  document.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') touchedAt = Date.now(); clearTimeout(tipT); tipEl.classList.add('hidden'); }, true);
  document.addEventListener('mouseover', e => {
    if (Date.now() - touchedAt < 1500) return;
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (t === tipFor) return;
    tipFor = t; clearTimeout(tipT); tipEl.classList.add('hidden');
    if (!t) return;
    tipT = setTimeout(() => {
      tipEl.textContent = t.dataset.tip; tipEl.classList.remove('hidden');
      const r = t.getBoundingClientRect(), w = tipEl.offsetWidth, h = tipEl.offsetHeight;
      let x = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2)), y = r.bottom + 8;
      if (y + h > window.innerHeight - 8) y = r.top - h - 8;
      tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
    }, t.classList.contains('tip-q') ? 80 : 450);
  });
  document.addEventListener('mousedown', () => { clearTimeout(tipT); tipEl.classList.add('hidden'); }, true);
  // tapping or clicking a "?" shows what it means (and doesn't tick or pick the setting it sits next to); tap it
  // again, or anywhere else, to close it. Phones have no hover, so this is the only way they see these.
  let tapShown = null;
  document.addEventListener('click', e => {
    const t = e.target.closest && e.target.closest('.tip-q'); if (!t) { tapShown = null; return; }
    e.preventDefault(); e.stopPropagation();
    if (tapShown === t) { tipEl.classList.add('hidden'); tapShown = null; return; }
    clearTimeout(tipT); tapShown = t; tipFor = t;
    tipEl.textContent = t.dataset.tip; tipEl.classList.remove('hidden');
    const r = t.getBoundingClientRect(), w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    let x = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2)), y = r.bottom + 8;
    if (y + h > window.innerHeight - 8) y = r.top - h - 8;
    tipEl.style.left = x + 'px'; tipEl.style.top = Math.max(8, y) + 'px';
  }, true);
  document.addEventListener('pointerdown', e => { if (tapShown && !(e.target.closest && e.target.closest('.tip-q'))) { tipEl.classList.add('hidden'); tapShown = null; } }, true);
  document.addEventListener('scroll', () => { if (tapShown) { tipEl.classList.add('hidden'); tapShown = null; } }, true);

  // ================================================================== TYPING DIALOG
  async function openTyping() {
    const before = { ...typing };
    const d = { ...typing };
    const opt = (o, cur) => o.map(([v, l]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${l}</option>`).join('');
    const chips = (key, list) => `<div class="chip-row" data-key="${key}">${list.map(([v, l, tip]) => `<button type="button" class="chip ${String(d[key]) === String(v) ? 'on' : ''}" data-v="${v}"${tip ? ` data-tip="${esc(tip)}"` : ''}>${l}</button>`).join('')}</div>`;
    const q = tip => `<span class="tip-q" data-tip="${esc(tip)}">?</span>`;
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="ty-try"><div class="ty-try-head"><span class="ty-try-label">Try it here</span><span class="ty-demo-ctl"><label class="check" data-tip="When on, picking an effect or sound types a few words here so you can hear and see it. Turn off to keep it quiet."><input type="checkbox" id="ty-auto" ${d.autoDemo !== false ? 'checked' : ''}> Sample when I pick</label><button type="button" class="btn small" id="ty-demo" data-tip="Types a sentence for you with the effect, cursor and sound you've picked. Click again to stop.">▶ Demo</button></span></div><div class="ty-pad" contenteditable="true" spellcheck="false" data-ph="Type here to try your settings…"><p><br></p></div></div>
      <div class="ip-label">Letters as you type ${q('A little animation each time a letter appears. Purely for fun. It never changes your text.')}</div>${chips('anim', [
        ['none', 'Plain', 'Letters appear normally, with no animation.'],
        ['fade', 'Fade in', 'Each letter softly fades into view.'],
        ['rise', 'Rise', 'Each letter floats up from just below the line.'],
        ['drop', 'Drop', 'Each letter falls in from above and lands with a small bounce.'],
        ['pop', 'Pop', 'Each letter starts big and shrinks into place.'],
        ['ink', 'Ink', 'Each letter starts blurry and sharpens, like ink soaking into paper.'],
        ['strike', 'Typewriter strike', 'Each letter lands on the page dark and slightly crooked, like a typewriter key striking the ribbon.'],
        ['glow', 'Glow', 'Each letter lights up warm and bright, then cools to the normal colour, like an ember.'],
        ['spin', 'Spin', 'Each letter spins in from small and settles into place.'],
        ['scatter', 'Scatter', 'Each letter flies in from a random direction and lands in its place.'],
        ['decode', 'Decode', 'Each letter flickers through a few symbols before it settles, like a system decoding text.'],
        ['scan', 'Scan in', 'Each letter is drawn top to bottom by a thin bright line, like a screen printing it.'],
        ['glitch', 'Glitch', 'Each letter arrives with a quick colour-split jitter, like a signal settling.']])}
      <div class="ip-label">Cursor ${q('The flashing line that shows where your next letter goes.')}</div>${chips('caret', [
        ['normal', 'Normal', 'The standard thin line.'],
        ['thick', 'Thick', 'A wider line that’s easier to spot on a big screen.'],
        ['block', 'Block', 'A see-through block over the next letter, like an old computer terminal.'],
        ['under', 'Underscore', 'A flat line under the next letter, like a command prompt.'],
        ['glow', 'Glow', 'A line with a soft glow in your accent colour, like a game interface.'],
        ['glide', 'Smooth glide', 'Instead of jumping, the cursor slides smoothly to each new spot as you type or click.']])}
      <label class="check" style="margin:6px 0 4px" data-tip="On: the cursor flashes on and off. Off: it stays solid, so it never vanishes while you look for it."><input type="checkbox" id="ty-blink" ${d.blink ? 'checked' : ''}> Blink ${q('On: the cursor flashes on and off. Off: it stays solid, so it never vanishes while you look for it.')}</label>
      <div class="ip-label">Sounds ${q('A sound for every key you press. They’re made by Unwip as you type, so no sound files are needed.')}</div>${chips('sound', [
        ['off', 'Off', 'Silent typing.'],
        ['typewriter', 'Typewriter', 'A manual typewriter: a sharp clack on each letter, a deep thunk on Space, and the bell and carriage return on Enter.'],
        ['mechanical', 'Mechanical keyboard', 'A clicky gaming keyboard: a crisp double click and a plastic thock. Space and Enter sound deeper.'],
        ['soft', 'Soft keys', 'A quiet laptop keyboard. Just a gentle, muffled tap.'],
        ['blip', 'Interface blip', 'A quiet game-menu blip on each key, a lower one for Space and two rising notes on Enter.'],
        ['pencil', 'Pencil', 'Graphite scratching on paper. Space taps the pencil, Enter draws a line, and Backspace rubs with an eraser.']])}
      <div class="form-grid" style="margin-top:8px">
        <div class="field"><label>Volume ${q('How loud the typing sounds are. Your Windows volume still applies on top.')}</label><input type="range" id="ty-vol" min="0.05" max="1" step="0.05" value="${d.volume}"></div>
        <label class="check" style="align-self:end;padding-bottom:6px"><input type="checkbox" id="ty-bell" ${d.bell ? 'checked' : ''}> Bell and carriage return on Enter ${q('With the Typewriter sound, pressing Enter rings the little bell and slides the carriage back to the start of the line.')}</label>
      </div>
      <div class="ip-label">Typewriter scrolling ${q('Keeps the line you’re typing at the same height on the screen, so your eyes don’t drift down to the bottom edge. The page moves instead of the cursor, like paper rolling up in a typewriter.')}</div>
      <div class="form-grid">
        <div class="field"><label>Keep the line you're typing on still</label><select id="ty-tw">${opt([['off', 'Off'], ['writer', 'In writer mode'], ['always', 'Always']], d.tw)}</select></div>
        <div class="field"><label>Typing line sits ${q('Where on the screen your typing line stays.')}</label><select id="ty-pos">${opt([[0.33, 'Upper third'], [0.45, 'Middle'], [0.6, 'Lower']], d.twPos)}</select></div>
        <label class="check full"><input type="checkbox" id="ty-smooth" ${d.twSmooth ? 'checked' : ''}> Glide the page instead of jumping ${q('When the page moves to keep your line in place, it slides smoothly instead of snapping.')}</label>
      </div>
      <div class="ip-label">Focus ${q('Fades the rest of your writing so only the part you’re working on stands out. Good for not rereading and fiddling.')}</div>
      <div class="form-grid">
        <div class="field"><label>Fade everything except</label><select id="ty-focus">${opt([['off', 'Nothing (off)'], ['paragraph', 'The current paragraph'], ['sentence', 'The current sentence']], d.focus)}</select></div>
        <div class="field"><label>When ${q('Writer mode is the full-screen mode (F11). Choose Always to fade in the normal view too.')}</label><select id="ty-fw">${opt([['writer', 'In writer mode'], ['always', 'Always']], d.focusWhere)}</select></div>
      </div>`;
    const pad = $('.ty-pad', body);
    const apply = () => { typing = { ...d }; placeCaret(); updateFocus(); };
    $$('.chip-row[data-key]', body).forEach(row => $$('.chip', row).forEach(c => c.onclick = () => {
      $$('.chip', row).forEach(x => x.classList.remove('on')); c.classList.add('on'); d[row.dataset.key] = c.dataset.v; apply();
      if (d.autoDemo !== false) demo(row.dataset.key === 'sound' ? 'Tap tap. ' : 'Hello there. ', true); else pad.focus();
    }));
    // type a phrase into the try-it box with the chosen effect, cursor and sound
    let demoT = null, demoOn = false;
    const demoBtn = () => { const b = $('#ty-demo', body); if (b) b.textContent = demoOn ? '■ Stop' : '▶ Demo'; };
    const stopDemo = () => { clearTimeout(demoT); demoOn = false; demoBtn(); };
    const demo = (text, clear) => {
      clearTimeout(demoT); demoOn = true; demoBtn();
      pad.focus();
      if (clear || pad.innerText.length > 160) pad.innerHTML = '<p><br></p>';
      const r = document.createRange(); r.selectNodeContents(pad.lastElementChild || pad); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r);
      const chars = [...text]; let i = 0;
      const step = () => {
        if (!demoOn || i >= chars.length || !document.body.contains(pad)) { stopDemo(); return; }
        const c = chars[i++];
        if (c === '\n') { playKey('enter'); document.execCommand('insertParagraph'); demoT = setTimeout(step, 520); return; }
        playKey(c === ' ' ? 'space' : 'key');
        document.execCommand('insertText', false, c);
        demoT = setTimeout(step, c === ' ' ? 130 : 70 + Math.random() * 60);
      };
      step();
    };
    $('#ty-demo', body).onclick = () => demoOn ? stopDemo() : demo('The lamps along the harbour came on one by one.\nShe did not look back. ', true);
    $('#ty-auto', body).onchange = e => { d.autoDemo = e.target.checked; if (!d.autoDemo) stopDemo(); };
    pad.addEventListener('keydown', () => { if (demoOn) stopDemo(); });
    const bind = (id, key, f = v => v) => $(id, body).onchange = e => { d[key] = f(e.target.type === 'checkbox' ? e.target.checked : e.target.value); apply(); };
    bind('#ty-blink', 'blink'); bind('#ty-bell', 'bell'); bind('#ty-vol', 'volume', Number); bind('#ty-tw', 'tw'); bind('#ty-pos', 'twPos', Number); bind('#ty-smooth', 'twSmooth');
    bind('#ty-focus', 'focus'); bind('#ty-fw', 'focusWhere');
    $('#ty-vol', body).oninput = e => { d.volume = +e.target.value; apply(); playKey('key', d.sound === 'off' ? 'typewriter' : d.sound); };
    pad.addEventListener('keydown', e => { const k = soundFor(e); if (k) playKey(k); });
    pad.addEventListener('input', e => { animateLetters(e, pad); padCaret(); });
    const padCaret = () => {   // the custom cursor inside the try-it box
      const sel = getSelection(); const own = document.querySelector('.ty-caret') || (() => { const c = document.createElement('div'); c.className = 'tw-caret ty-caret'; document.body.appendChild(c); return c; })();
      if (typing.caret === 'normal' || !sel.rangeCount || !pad.contains(sel.anchorNode) || !sel.isCollapsed) { own.style.display = 'none'; pad.classList.remove('no-caret'); return; }
      const rc = caretRect(sel); if (!rc) return;
      const z = parseFloat(document.body.style.zoom) || 1, G = caretGeo(rc, z);
      pad.classList.add('no-caret'); own.style.display = '';
      own.className = `tw-caret ty-caret ${typing.caret}${typing.blink ? '' : ' still'}`;
      own.style.position = 'fixed'; own.style.height = G.h + 'px'; own.style.width = G.w + 'px';
      own.style.transform = `translate(${G.x}px, ${G.y}px)`;
    };
    const selWatch = () => padCaret(); document.addEventListener('selectionchange', selWatch);
    const ok = await U.modal({ title: 'Typewriter & animations', body, wide: true, buttons: [{ label: 'Reset', value: 'reset', kind: 'ghost' }, { label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Save', value: true, kind: 'primary' }],
      onOpen: () => setTimeout(() => { pad.focus(); const r = document.createRange(); r.selectNodeContents(pad); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); padCaret(); }, 50) });
    stopDemo();
    document.removeEventListener('selectionchange', selWatch);
    const tc = document.querySelector('.ty-caret'); if (tc) tc.remove();
    typing = ok === 'reset' ? { ...DEF_TYPE } : ok ? d : before;
    save('unwip-typing', typing); placeCaret(); updateFocus(); stripLabels();
  }

  // other writing areas (e.g. Play) get the same sounds and letter effects
  function attach(el) {
    el.addEventListener('keydown', e => { const k = soundFor(e); if (k) playKey(k); });
    el.addEventListener('input', e => animateLetters(e, el));
  }
  return {
    setTheme(id) { look = { ...look, theme: id }; save('unwip-look', look); applyLook(); }, THEMES,
    attach, openThemes, openTyping, applyLook, pageZoom, setMessyFade, updateFocus, playKey,
    typewriterActive, caretRect, typewriterPosition: () => typing.twPos || 0.45, smoothScroll: () => typing.twSmooth,
    get typing() { return typing; }, get look() { return look; },
    // settings that arrived from another device (prefsync.js): read them again and show them
    reload() { look = load('unwip-look', DEF_LOOK); typing = load('unwip-typing', DEF_TYPE); applyLook(); try { placeCaret(); updateFocus(); stripLabels(); } catch {} }
  };
})();
