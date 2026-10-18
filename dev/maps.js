// Unwip - map maker. Maps live in the binder (usually under Places) like documents.
// A map is saved as JSON in its document file: a low-resolution land mask (painted or generated) plus
// lists of stamps (forests, mountains, towns…), paths (roads, rivers, borders), labels and pins.
// Pins can point at a Places sheet; double-click a pin to open it.
window.UnwipMaps = (function () {
  'use strict';
  const U = window.__unwip;
  const { $, $$, esc, S, api, I } = U;
  const W = 1600, H = 1100, MW = 400, MH = 275, K = W / MW;   // world size, mask size, mask scale

  const STYLES = {
    parchment: { name: 'Parchment', paper: '#eadcbf', sea: '#d8c59c', seaLine: '#b9a477', land: '#f1e5c9', coast: '#4e3b26', ink: '#3a2a19', forest: '#8a9a5b', mountain: '#b59a72', river: '#5f7f96', road: '#5c4630', border: '#9a3b2b', label: '#3a2a19', pin: '#c0492b' },
    atlas: { name: 'Atlas', paper: '#f4f1ea', sea: '#a9cfe0', seaLine: '#7fb3cc', land: '#dfe7c0', coast: '#3f5f47', ink: '#2c2f2a', forest: '#5f8f4e', mountain: '#a58c6a', river: '#3c7fb0', road: '#6b5640', border: '#b0413e', label: '#23262a', pin: '#d2462b' },
    night: { name: 'Night', paper: '#151a24', sea: '#1c2433', seaLine: '#2c3a52', land: '#2a3242', coast: '#c9b98f', ink: '#d8cfb4', forest: '#56705a', mountain: '#7d7262', river: '#6d9cc7', road: '#bfae86', border: '#d0675a', label: '#efe6c8', pin: '#ef7b57' },
    ink: { name: 'Ink sketch', paper: '#ffffff', sea: '#ffffff', seaLine: '#9a9a9a', land: '#ffffff', coast: '#111111', ink: '#111111', forest: '#ffffff', mountain: '#ffffff', river: '#111111', road: '#111111', border: '#111111', label: '#111111', pin: '#111111' },
    // a game's map screen: dark glass, glowing coastlines, a grid always on and plain typeface labels
    holo: { name: 'Holo map', paper: '#050a14', sea: '#07101e', seaLine: '#14385c', land: '#0d2238', coast: '#5fd0ff', ink: '#8fdcff', forest: '#2f8f8a', mountain: '#4f7ea8', river: '#5fd0ff', road: '#8fdcff', border: '#ff6b9a', label: '#d6f3ff', pin: '#ffd36b', mono: true }
  };
  const FONT = (P, w, size) => P.mono ? `${w === 'italic' ? '' : w} ${size}px "IBM Plex Mono", Consolas, Menlo, monospace` : `${w} ${size}px Bookhaven, Georgia, serif`;
  const BORDER_ICON = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M3 17 C8 5, 14 21, 21 7" fill="none" stroke="#b0413e" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="1 4.5"/></svg>';
  const FRAMES = { double: 'Double line', simple: 'Single line', thick: 'Thick line', ornate: 'Ornate corners', none: 'No frame' };
  const FRAME_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#3a3a3a"><rect x="3" y="5" width="18" height="14" stroke-width="2"/><rect x="6" y="8" width="12" height="8" stroke-width="1"/></svg>';
  const MARK_ICON = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 3 20 12 12 21 4 12z" fill="#ffd36b" stroke="#3a3a3a" stroke-width="1.6"/><circle cx="12" cy="12" r="2.5" fill="#3a3a3a"/></svg>';
  const FOG_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#3a3a3a" stroke-linecap="round"><path d="M3 10c3-3 6-3 9 0s6 3 9 0M3 15c3-3 6-3 9 0s6 3 9 0" stroke-width="2.2"/></svg>';
  const MARKS = [['waypoint', 'Waypoint'], ['quest', 'Quest'], ['dungeon', 'Dungeon'], ['safe', 'Safe zone'], ['boss', 'Boss'], ['shop', 'Shop'], ['respawn', 'Respawn']];
  const MARQ_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="15" height="12" stroke-dasharray="3 3"/><path d="M13 12l7 7m0-5v5h-5"/></svg>';
  const MARQ_TIP = 'Select an area: drag a box round things to select them all, then drag any of them to move them together. Delete or 🗑 removes them. Tap empty space or press Esc to let go';
  const TOOLS = [
    ['select', '✋', 'Select and move: tap or click a thing to select it, then drag it to move it. Double-click a label or pin to edit it. Delete or 🗑 removes it. To turn a landmark or label, drag the round handle that appears when it’s selected (it turns in small steps; hold Shift to turn it freely), or press R and Shift+R. To make one bigger or smaller, drag the square corner handle, or press + and −. Drag a bridge’s end to turn and stretch it. Drag empty space to move around; scroll or pinch to zoom'],
    ['marquee', MARQ_ICON, MARQ_TIP],
    ['land', '🟫', 'Paint land'], ['water', '🌊', 'Water: paint over land to make lakes, bays and rivers (the sea around the land is already water)'],
    ['forest', '🌲', 'Forest: drag to scatter trees'], ['mountain', '⛰️', 'Mountains: drag to place a range'], ['hill', '🏔️', 'Hills: drag to scatter'],
    ['town', '🏠', 'Town: click to place'], ['city', '🏰', 'City or castle: click to place'], ['tower', '🗼', 'Tower: click to place'], ['ruin', '🏚️', 'Ruins: click to place'],
    ['road', '〰️', 'Road or path: drag to draw'], ['border', BORDER_ICON, 'Border: drag to draw a dotted border between lands or kingdoms. (For rivers and lakes, paint with 🌊 water)'],
    ['frame', FRAME_ICON, 'Frame: drag out a rectangle to draw a border box, for your own map edge, an inset or a title box. Pick its line style (double, single, thick, ornate) in the list at the top. Drag the corner to resize'],
    ['mark', MARK_ICON, 'Markers: waypoint, quest, dungeon, safe zone, boss, shop, respawn (for LitRPG and game maps). Pick one above, then click'],
    ['fog', FOG_ICON, 'Fog of war: cover what hasn’t been explored yet, and reveal it again as the story goes. Brush size below'],
    ['pin', '📍', 'Pin: click to mark a place. You can link it to a Places sheet'], ['label', '🔤', 'Label: click to name a region, sea or place']
  ];

  // where the map is kept: in a book (a binder document, or a Build map linked into the book), or in Build itself
  const bookHost = {
    ref: id => { const f = U.findNode(id); return f && f.node.buildRef && window.UnwipBuild ? f.node.buildRef : null; },
    async read(id) { const r = this.ref(id); return r ? window.UnwipBuild.readMap(r) : api.loadDoc(S.slug, id); },
    async write(id, json) {
      const r = this.ref(id);
      if (r) await window.UnwipBuild.writeMap(r, json, thumb()); else await api.saveDoc(S.slug, id, json);
      const f = U.findNode(id); if (f) { f.node.mod = Date.now(); f.node.dev = S.device || ''; f.node.devId = S.deviceId || ''; U.scheduleMeta(); }
    },
    title: id => { const f = U.findNode(id); return f ? f.node.title : 'Map'; },
    mount: v => { const ew = $('#editor-wrap'); ew.classList.add('hidden'); ew.after(v); },
    unmount: () => $('#editor-wrap').classList.remove('hidden'),
    inBook: true
  };
  let host = bookHost;
  let st = null, nodeId = null, tool = 'select', brush = 18, cam = { x: 0, y: 0, z: 1 }, sel = null, undo = [], redo = [];
  let mask = null, mctx = null, landCache = null, landDirty = true, saveT = null, view = null, cv = null, ctx = null, drawing = null;

  // ================================================================== DATA
  function blank(style = 'parchment', kind = 'world') { const b = { v: 1, kind, style, land: null, stamps: [], paths: [], labels: [], pins: [], grid: false, compass: true, frame: 'double', boxes: [], seed: 1 }; const m = modFor(kind); return m ? Object.assign(b, m.blank()) : b; }
  // town and city maps (town.js) and dungeon floors (dungeon.js) draw and edit their own way; T is the one in use
  let TW = null, DG = null, T = null;
  const modFor = k => k === 'town' ? TW : k === 'dungeon' ? DG : null;
  const fillKind = s => { const m = modFor(s.kind); if (m) { const b = m.blank(); for (const k of Object.keys(b)) if (s[k] == null || (k !== 'compass' && !s[k])) s[k] = s[k] || b[k]; } };
  const syncT = () => { T = (st && modFor(st.kind)) || TW; };
  const isTown = () => !!(st && modFor(st.kind) && T === modFor(st.kind));
  const isDungeon = () => !!(st && st.kind === 'dungeon' && DG);
  // a map document holds one or more sections (the whole world, a region, a city…), each a full map of its own
  let docData = null;
  async function load(id) {
    let data = null;
    try { data = JSON.parse(await host.read(id) || 'null'); } catch {}
    st = null;
    if (data && Array.isArray(data.sections)) docData = data;
    else docData = { v: 2, active: 0, sections: [{ name: 'Main map', ...Object.assign(blank(), data || {}) }] };
    docData.sections = docData.sections.map(x => Object.assign(blank(), x));
    docData.active = Math.min(docData.active || 0, docData.sections.length - 1);
    mask = document.createElement('canvas'); mask.width = MW; mask.height = MH; mctx = mask.getContext('2d', { willReadFrequently: true });
    await useSection(docData.active);
  }
  async function useSection(i) {
    if (st && mask) st.land = maskData();
    docData.active = i; st = docData.sections[i]; st.boxes = st.boxes || []; st.fog = st.fog || [];
    fillKind(st); syncT(); fogDirty = true;
    mctx.clearRect(0, 0, MW, MH);
    if (st.land) { const im = new Image(); im.src = st.land; await im.decode().catch(() => {}); mctx.drawImage(im, 0, 0); }
    landDirty = true; itemsDirty = true; undo = []; redo = []; sel = null;
  }
  const maskData = () => { const d = mctx.getImageData(0, 0, MW, MH).data; for (let i = 3; i < d.length; i += 4) if (d[i]) return mask.toDataURL('image/png'); return null; };
  function snapshot() { return JSON.stringify({ ...st, land: mask.toDataURL('image/png') }); }
  let itemsDirty = true;
  function push() { undo.push(snapshot()); if (undo.length > 40) undo.shift(); redo = []; }
  async function restore(json) { const d = JSON.parse(json); Object.keys(st).forEach(k => delete st[k]); Object.assign(st, d); itemsDirty = true; fogDirty = true; const im = new Image(); im.src = d.land; await im.decode().catch(() => {}); mctx.clearRect(0, 0, MW, MH); mctx.drawImage(im, 0, 0); landDirty = true; itemsDirty = true; sel = null; baseKey = ''; redraw(); schedule(); }
  // edited: something changed since the map was opened or last saved. Closing a map you only looked at doesn't save it
  // again: every save counts as a change for Dropbox, so the book showed "Not synced" straight after a sync
  let edited = false, openedActive = 0;
  function schedule() { if (hintToast) { hintToast.remove(); hintToast = null; }   // the "empty map" tip is done once something's on it
    edited = true;
    clearTimeout(saveT); saveT = setTimeout(saveNow, 700); $('#mp-saved') && ($('#mp-saved').textContent = 'Saving…'); }
  async function saveNow() {
    clearTimeout(saveT); saveT = null; if (!st || !nodeId) return;
    edited = false; openedActive = docData.active;
    st.land = maskData();
    await host.write(nodeId, JSON.stringify(docData));
    const el = $('#mp-saved'); if (el) el.textContent = 'Saved';
  }

  // ================================================================== GENERATION (no AI: value noise)
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e6) / 1e6; }; }
  function noise2(seed) {
    const r = rng(seed), P = 256, g = new Float32Array(P * P); for (let i = 0; i < g.length; i++) g[i] = r();
    const at = (x, y) => g[((y & 255) * P) + (x & 255)];
    const sm = t => t * t * (3 - 2 * t);
    return (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
      const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
      return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf; };
  }
  function fbm(n, x, y, oct = 5) { let v = 0, a = 1, f = 1, t = 0; for (let o = 0; o < oct; o++) { v += n(x * f, y * f) * a; t += a; a *= 0.5; f *= 2; } return v / t; }
  // place names built the way real ones are: an old word for a person, a tree, a river or the land, plus an ending
  // that says what the place was (a farm, a ford, a hill, a harbour). No stock fantasy words (no "Vale", no "Ash-").
  const SYL = ['brack', 'hol', 'kes', 'dun', 'tav', 'lin', 'mor', 'cal', 'pen', 'tre', 'gol', 'wex', 'sund', 'hart', 'bar', 'rud', 'olm', 'stav', 'cor', 'mel', 'farn', 'tor', 'abb', 'quarr', 'lod', 'nan', 'pol', 'skel', 'hask', 'wend', 'blen', 'cran', 'eg', 'hun', 'inch', 'kil', 'mar', 'ross', 'sel', 'bran'];
  const MID = ['', '', '', 'e', 'er', 'ing', 'ley', 'en', 'is'];
  const END = ['ham', 'by', 'ton', 'wick', 'stead', 'ford', 'dale', 'mouth', 'sey', 'thorp', 'kirk', 'bury', 'avon', 'ness', 'holm', 'garth', 'well', 'field', 'more', 'combe', 'den', 'haven', 'ey', 'low', 'stow', 'ach', 'ard', 'ock'];
  function name(r) { const pick = a => a[Math.floor(r() * a.length)]; let n = pick(SYL) + pick(MID) + pick(END); n = n.replace(/([aeiou])\1/g, '$1').replace(/(.)\1\1/g, '$1$1'); return n[0].toUpperCase() + n.slice(1); }
  // kind: island | continent | archipelago ; add: keep what's there and put new land in the emptiest stretch of sea
  function generate(kind, add = false) {
    push();
    const seed = Math.floor(Math.random() * 1e9); if (!add) st.seed = seed;
    const n = noise2(seed), n2 = noise2(seed + 7), r = rng(seed + 3);
    const old = mctx.getImageData(0, 0, MW, MH).data;
    const img = mctx.createImageData(MW, MH), elev = new Float32Array(MW * MH), fresh = new Uint8Array(MW * MH);
    let centres = kind === 'archipelago' ? [...Array(7)].map(() => [0.15 + r() * 0.7, 0.15 + r() * 0.7, 0.10 + r() * 0.12]) : kind === 'continent' ? [[0.5, 0.5, 0.62]] : [[0.5, 0.5, 0.40]];
    if (add) {
      // the point of open sea furthest from any land
      let best = null;
      for (let t = 0; t < 500; t++) {
        const cx = 0.18 + r() * 0.64, cy = 0.22 + r() * 0.56; let dmin = 1e9;
        for (let y = 0; y < MH; y += 5) for (let x = 0; x < MW; x += 5) if (old[(y * MW + x) * 4 + 3]) { const d = Math.hypot((x / MW - cx) * 1.45, y / MH - cy); if (d < dmin) dmin = d; }
        if (!best || dmin > best[2]) best = [cx, cy, dmin];
      }
      const rad = Math.max(0.07, Math.min(0.24, (best ? best[2] : 0.3) * (kind === 'continent' ? 0.95 : 0.7)));
      centres = kind === 'archipelago' ? [...Array(4)].map(() => [best[0] + (r() - 0.5) * rad * 1.6, best[1] + (r() - 0.5) * rad * 1.6, rad * 0.45]) : [[best[0], best[1], rad]];
    }
    const thr = kind === 'archipelago' ? 0.5 : kind === 'continent' ? 0.47 : 0.5;
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const nx = x / MW, ny = y / MH;
      let fall = 0; for (const [cx, cy, rad] of centres) { const d = Math.hypot((nx - cx) * 1.25, ny - cy) / rad; fall = Math.max(fall, 1 - d * d); }
      const e = fbm(n, nx * 6, ny * 6) * 0.65 + Math.max(0, fall) * 0.55 - 0.08 - (add && fall <= 0 ? 1 : 0);
      elev[y * MW + x] = e;
      const was = add && old[(y * MW + x) * 4 + 3] > 0;
      const on = e > thr && x > 3 && y > 3 && x < MW - 4 && y < MH - 4;
      if (on && !was) fresh[y * MW + x] = 1;
      img.data[(y * MW + x) * 4 + 3] = on || was ? 255 : 0;
    }
    mctx.putImageData(img, 0, 0); landDirty = true; itemsDirty = true;
    // scatter: mountains on the highest ground, forests on middle ground, towns near coasts
    // Replace starts the section again (frames and fog too); Add keeps everything and selects what's new
    if (!add) { st.stamps = []; st.paths = []; st.labels = []; st.pins = []; st.boxes = []; st.fog = []; fogDirty = true; }
    const had = { stamps: new Set(st.stamps), paths: st.paths.length, labels: st.labels.length };
    const isLand = (x, y) => x >= 0 && y >= 0 && x < MW && y < MH && (add ? fresh[y * MW + x] === 1 : img.data[(y * MW + x) * 4 + 3] > 0);
    for (let i = 0; i < 2600; i++) {
      const x = Math.floor(r() * MW), y = Math.floor(r() * MH); if (!isLand(x, y)) continue;
      const e = elev[y * MW + x], f = fbm(n2, x / 40, y / 40, 3);
      if (e > thr + 0.21 && r() < 0.32) st.stamps.push({ k: 'mountain', x: x * K, y: y * K, s: 0.8 + r() * 0.6 });
      else if (e > thr + 0.14 && r() < 0.18) st.stamps.push({ k: 'hill', x: x * K, y: y * K, s: 0.8 + r() * 0.4 });
      else if (f > 0.5 && e < thr + 0.16 && r() < 0.7) st.stamps.push({ k: 'tree', x: x * K, y: y * K, s: 0.8 + r() * 0.4 });
    }
    // rivers: start high, walk downhill to the sea
    for (let k = 0; k < 4; k++) {
      let best = null; for (let t = 0; t < 400; t++) { const x = Math.floor(r() * MW), y = Math.floor(r() * MH); if (isLand(x, y) && (!best || elev[y * MW + x] > best[2])) best = [x, y, elev[y * MW + x]]; }
      if (!best) break;
      let [x, y] = best; const pts = [[x * K, y * K]];
      for (let step = 0; step < 300 && isLand(x, y); step++) {
        let nx = x, ny = y, low = elev[y * MW + x] + 0.02;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const xx = x + dx * 2, yy = y + dy * 2; if (xx < 0 || yy < 0 || xx >= MW || yy >= MH) continue; const e = elev[yy * MW + xx] + r() * 0.012; if (e < low) { low = e; nx = xx; ny = yy; } }
        if (nx === x && ny === y) break; x = nx; y = ny; pts.push([x * K, y * K]);
      }
      if (pts.length > 8) st.paths.push({ k: 'river', pts: pts.filter((_, i) => i % 2 === 0) });
    }
    // towns near the coast and a capital inland, with made-up names
    const towns = [];
    for (let t = 0; t < 3000 && towns.length < 6; t++) {
      const x = Math.floor(r() * MW), y = Math.floor(r() * MH); if (!isLand(x, y)) continue;
      const coast = !isLand(x + 6, y) || !isLand(x - 6, y) || !isLand(x, y + 6) || !isLand(x, y - 6);
      if ((coast || towns.length === 0) && towns.every(([a, b]) => Math.hypot(a - x, b - y) > 45)) towns.push([x, y]);
    }
    towns.forEach(([x, y], i) => { const nm = name(r); st.stamps.push({ k: i === 0 ? 'city' : 'town', x: x * K, y: y * K, s: 1 }); st.labels.push({ x: x * K, y: y * K + 34, text: nm, k: 'place' }); });
    for (let i = 0; i + 1 < towns.length; i += 2) { const [a, b] = towns[i], [c, d] = towns[i + 1]; st.paths.push({ k: 'road', pts: [[a * K, b * K], [(a + c) / 2 * K + (r() - 0.5) * 60, (b + d) / 2 * K + (r() - 0.5) * 60], [c * K, d * K]] }); }
    if (add) {
      // name the new land just above it (or below, if that would sit on another label)
      let x0 = MW, x1 = 0, y0 = MH, y1 = 0;
      for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (fresh[y * MW + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 >= x0) {
        const text = (kind === 'archipelago' ? 'The ' + name(r) + ' Isles' : name(r)).toUpperCase(), size = 30, wpx = text.length * size * 0.85;
        const cx = Math.min(W - wpx / 2 - 40, Math.max(wpx / 2 + 40, (x0 + x1) / 2 * K));
        const clash = y => st.labels.some(l => Math.abs(l.y - y) < 46 && Math.abs(l.x - cx) < (wpx + (l.text || '').length * (l.size || 30) * 0.7) / 2);
        const tries = [[cx, y0 * K - 34], [cx, y1 * K + 40], [cx, (y0 + y1) / 2 * K]];
        let pos = tries.find(([, y]) => y > 70 && y < H - 110 && !clash(y)) || tries[2];
        const [lx, y] = pos;
        st.labels.push({ x: lx, y, text, k: 'region', size });
      }
    } else {
      st.labels.push({ x: W / 2, y: 120, text: (kind === 'archipelago' ? 'The ' + name(r) + ' Isles' : name(r)).toUpperCase(), k: 'region' });
      const sea = 'The ' + name(r) + ' Sea'; st.labels.push({ x: Math.max(180, 70 + sea.length * 11), y: H - 140, text: sea, k: 'sea' });   // centred, so a long name (or the wider Holo lettering) mustn't run off the left edge
    }
    st.stamps.sort((a, b) => a.y - b.y);
    if (add) {
      const items = [], g = document.createElement('canvas'); g.width = MW; g.height = MH; const gx = g.getContext('2d'), gi = gx.createImageData(MW, MH);
      for (let i = 0; i < fresh.length; i++) if (fresh[i]) gi.data[i * 4 + 3] = 255;
      gx.putImageData(gi, 0, 0);
      st.stamps.forEach((s, i) => { if (!had.stamps.has(s)) items.push({ type: 'stamp', i }); });
      for (let i = had.paths; i < st.paths.length; i++) items.push({ type: 'path', i });
      for (let i = had.labels; i < st.labels.length; i++) items.push({ type: 'label', i });
      selectGroup(items, g);
    }
    changed(); schedule();
  }

  // ================================================================== RENDERING
  function renderLand(P) {
    // smooth the blocky mask into a natural coastline: scale up blurred, then cut at half
    const a = document.createElement('canvas'); a.width = W; a.height = H; const g = a.getContext('2d', { willReadFrequently: true });
    g.filter = 'blur(5px)'; g.imageSmoothingEnabled = true; g.drawImage(mask, 0, 0, W, H); g.filter = 'none';
    const id = g.getImageData(0, 0, W, H), d = id.data;
    for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 120 ? 255 : 0;
    g.putImageData(id, 0, 0);
    const tint = (src, col) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, W, H); return c; };
    const out = document.createElement('canvas'); out.width = W; out.height = H; const o = out.getContext('2d');
    // ripples in the sea, then a dark coastline, then the land
    const rip = tint(a, P.seaLine);
    for (const [blur, alpha] of [[26, 0.35], [14, 0.45]]) { o.globalAlpha = alpha; o.filter = `blur(${blur}px)`; o.drawImage(rip, 0, 0); }
    o.filter = 'none'; o.globalAlpha = 1;
    for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [0, 3], [-2, -2], [2, 2], [-2, 2], [2, -2]]) o.drawImage(tint(a, P.coast), dx, dy);
    o.drawImage(tint(a, P.land), 0, 0);
    // a little paper grain on the land
    o.globalCompositeOperation = 'source-atop'; o.globalAlpha = 0.08;
    const r = rng(st.seed || 1); o.fillStyle = P.coast; for (let i = 0; i < 9000; i++) o.fillRect(r() * W, r() * H, 1.4, 1.4);
    o.globalAlpha = 1; o.globalCompositeOperation = 'source-over';
    return out;
  }
  function stamp(g, s, P) {
    if (s.k[1] === '-') { const m = s.k[0] === 't' ? TW : s.k[0] === 'd' ? DG : null; if (m && m.stamp(g, s, P)) return; if (s.k[0] === 'm') return drawMark(g, s, P); }
    const z = s.s || 1; g.save(); g.translate(s.x, s.y); g.rotate(s.rot || 0); g.scale(z, z); g.lineWidth = 1.6; g.strokeStyle = P.ink; g.lineJoin = 'round';
    if (s.k === 'tree') { g.fillStyle = P.forest; g.beginPath(); g.moveTo(0, -12); g.quadraticCurveTo(9, -9, 7, 0); g.quadraticCurveTo(0, 4, -7, 0); g.quadraticCurveTo(-9, -9, 0, -12); g.fill(); g.stroke(); g.beginPath(); g.moveTo(0, 1); g.lineTo(0, 6); g.stroke(); }
    else if (s.k === 'mountain') { g.fillStyle = P.mountain; g.beginPath(); g.moveTo(-18, 8); g.lineTo(-2, -20); g.lineTo(18, 8); g.closePath(); g.fill(); g.stroke(); g.beginPath(); g.moveTo(-2, -20); g.lineTo(3, -6); g.lineTo(0, 8); g.stroke(); g.globalAlpha = 0.35; g.fillStyle = P.ink; g.beginPath(); g.moveTo(-2, -20); g.lineTo(18, 8); g.lineTo(3, 8); g.lineTo(3, -6); g.closePath(); g.fill(); }
    else if (s.k === 'hill') { g.beginPath(); g.moveTo(-14, 4); g.quadraticCurveTo(0, -12, 14, 4); g.stroke(); }
    else if (s.k === 'town') { g.fillStyle = P.land; g.beginPath(); g.rect(-7, -6, 14, 10); g.fill(); g.stroke(); g.beginPath(); g.moveTo(-9, -6); g.lineTo(0, -14); g.lineTo(9, -6); g.closePath(); g.fillStyle = P.pin; g.fill(); g.stroke(); }
    else if (s.k === 'city') { g.fillStyle = P.land; g.beginPath(); g.rect(-14, -10, 28, 16); g.fill(); g.stroke(); for (const x of [-14, -4, 6]) { g.beginPath(); g.rect(x, -22, 8, 12); g.fill(); g.stroke(); g.beginPath(); for (let k = 0; k < 2; k++) g.rect(x + k * 5, -26, 3, 4); g.stroke(); } g.fillStyle = P.pin; g.beginPath(); g.moveTo(0, -30); g.lineTo(0, -40); g.lineTo(8, -36); g.lineTo(0, -33); g.fill(); g.stroke(); }
    else if (s.k === 'tower') { g.fillStyle = P.land; g.beginPath(); g.moveTo(-6, 8); g.lineTo(-4, -18); g.lineTo(4, -18); g.lineTo(6, 8); g.closePath(); g.fill(); g.stroke(); g.beginPath(); g.moveTo(-6, -18); g.lineTo(0, -28); g.lineTo(6, -18); g.closePath(); g.fillStyle = P.pin; g.fill(); g.stroke(); }
    else if (s.k === 'ruin') { g.beginPath(); g.moveTo(-12, 6); g.lineTo(-12, -8); g.lineTo(-8, -12); g.lineTo(-6, -2); g.moveTo(-2, 6); g.lineTo(-2, -14); g.lineTo(3, -10); g.moveTo(6, 6); g.lineTo(6, -4); g.lineTo(11, -6); g.lineTo(12, 6); g.moveTo(-14, 6); g.lineTo(14, 6); g.stroke(); }
    g.restore();
  }
  // ---- LitRPG and game markers: a shape with a glyph, the way a game's map screen shows them
  const MARK_COL = { waypoint: '#4fb3ff', quest: '#ffc93c', dungeon: '#a77bff', safe: '#4fd18b', boss: '#ff4f6d', shop: '#ffa24f', respawn: '#7fe3ff' };
  function drawMark(g, s, P) {
    const k = s.k.slice(2), z = s.s || 1, col = MARK_COL[k] || P.pin, dark = P.mono || P.paper === '#151a24';
    g.save(); g.translate(s.x, s.y); g.rotate(s.rot || 0); g.scale(z, z); g.lineJoin = 'round'; g.lineCap = 'round';
    if (P.mono) { g.shadowColor = col; g.shadowBlur = 10; }
    g.fillStyle = dark ? 'rgba(5,10,20,0.85)' : 'rgba(255,255,255,0.9)'; g.strokeStyle = col; g.lineWidth = 2.4;
    g.beginPath();
    if (k === 'waypoint') { g.moveTo(0, -15); g.lineTo(12, 0); g.lineTo(0, 15); g.lineTo(-12, 0); g.closePath(); }
    else if (k === 'safe') { g.moveTo(0, -15); g.lineTo(12, -9); g.lineTo(11, 3); g.quadraticCurveTo(8, 11, 0, 15); g.quadraticCurveTo(-8, 11, -11, 3); g.lineTo(-12, -9); g.closePath(); }
    else if (k === 'boss') { for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + i * Math.PI / 3; g.lineTo(Math.cos(a) * 14, Math.sin(a) * 14); } g.closePath(); }
    else g.arc(0, 0, 13, 0, 7);
    g.fill(); g.stroke(); g.shadowBlur = 0;
    g.fillStyle = col; g.strokeStyle = col; g.lineWidth = 2;
    if (k === 'waypoint') { g.beginPath(); g.arc(0, 0, 3.5, 0, 7); g.fill(); }
    else if (k === 'quest') { g.font = 'bold 18px Bookhaven, Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', 0, 1); }
    else if (k === 'dungeon') { g.beginPath(); g.moveTo(-6, 7); g.lineTo(-6, -2); g.arc(0, -2, 6, Math.PI, 0); g.lineTo(6, 7); g.closePath(); g.fill(); }
    else if (k === 'safe') { g.beginPath(); g.moveTo(-5, 0); g.lineTo(-1, 5); g.lineTo(6, -5); g.stroke(); }
    else if (k === 'boss') { g.beginPath(); g.arc(0, -1, 5.5, 0, 7); g.fill(); g.fillRect(-3.5, 3, 7, 4); g.fillStyle = dark ? '#050a14' : '#fff'; g.beginPath(); g.arc(-2.2, -1.5, 1.6, 0, 7); g.arc(2.2, -1.5, 1.6, 0, 7); g.fill(); }
    else if (k === 'shop') { g.beginPath(); g.rect(-6, -2, 12, 8); g.stroke(); g.beginPath(); g.moveTo(-3, -2); g.lineTo(-3, -5); g.arc(0, -5, 3, Math.PI, 0); g.lineTo(3, -2); g.stroke(); }
    else if (k === 'respawn') { g.beginPath(); g.arc(0, 0, 6, -0.3, Math.PI * 1.55); g.stroke(); g.beginPath(); g.moveTo(5.8, -5); g.lineTo(5.8, -0.5); g.lineTo(1.6, -1.6); g.closePath(); g.fill(); }
    if (s.label) { g.rotate(-(s.rot || 0)); g.font = FONT(P, '600', 15); g.textAlign = 'center'; g.textBaseline = 'top'; g.lineWidth = 4; g.strokeStyle = dark ? '#050a14' : P.land; g.strokeText(s.label, 0, 18); g.fillStyle = P.label; g.fillText(s.label, 0, 18); }
    g.restore();
  }
  // ---- fog of war: strokes that cover or reveal, kept with the map, drawn over everything but the frame
  let fogCache = null, fogDirty = true;
  const FS = 4;   // the fog is worked out at a quarter size and drawn soft, so its edges look like cloud, not a brush
  function fogStroke(g, f) {
    if (f.all) { g.globalCompositeOperation = f.on ? 'source-over' : 'destination-out'; g.fillRect(0, 0, W / FS, H / FS); return; }
    g.globalCompositeOperation = f.on ? 'source-over' : 'destination-out'; g.lineWidth = f.w / FS; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(f.pts[0][0] / FS, f.pts[0][1] / FS); for (const q of f.pts) g.lineTo(q[0] / FS, q[1] / FS); if (f.pts.length === 1) g.lineTo(f.pts[0][0] / FS + 0.01, f.pts[0][1] / FS); g.stroke();
  }
  function drawFog(g, P, live) {
    const list = (st.fog || []).concat(live ? [live] : []);
    if (!list.length || st.fogHide) return;
    if (!fogCache) { fogCache = document.createElement('canvas'); fogCache.width = W / FS; fogCache.height = H / FS; }
    if (fogDirty || live) { const f = fogCache.getContext('2d'); f.globalCompositeOperation = 'source-over'; f.clearRect(0, 0, W / FS, H / FS); f.fillStyle = '#000'; f.strokeStyle = '#000'; for (const x of list) fogStroke(f, x); f.globalCompositeOperation = 'source-over'; fogDirty = !!live; }
    const c = document.createElement('canvas'); c.width = W / FS; c.height = H / FS; const cg = c.getContext('2d');
    cg.drawImage(fogCache, 0, 0); cg.globalCompositeOperation = 'source-in';
    const dark = P.mono || P.paper === '#151a24', base = P.mono ? '#10233b' : dark ? '#2a3141' : '#6d6a64';
    cg.fillStyle = base; cg.fillRect(0, 0, c.width, c.height);
    // a little cloud texture so it reads as fog, not paint (source-atop: only on the fog itself)
    cg.globalCompositeOperation = 'source-atop';
    const r = rng(77); cg.globalAlpha = 0.22; cg.fillStyle = P.mono ? '#24507a' : dark ? '#45506a' : '#9a968f';
    for (let i = 0; i < 160; i++) { cg.beginPath(); cg.arc(r() * c.width, r() * c.height, 6 + r() * 18, 0, 7); cg.fill(); }
    if (P.mono) { cg.globalAlpha = 0.25; cg.strokeStyle = P.coast; cg.lineWidth = 0.5; cg.beginPath(); for (let x = -c.height; x < c.width; x += 6) { cg.moveTo(x, c.height); cg.lineTo(x + c.height, 0); } cg.stroke(); }
    g.save(); g.filter = 'blur(6px)'; g.globalAlpha = 0.97; g.imageSmoothingEnabled = true; g.drawImage(c, 0, 0, W, H); g.restore();
  }
  function smoothPath(g, pts) {
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; g.quadraticCurveTo(pts[i][0], pts[i][1], mx, my); }
    const l = pts[pts.length - 1]; g.lineTo(l[0], l[1]);
  }
  // the map is drawn in two cached layers (sea + land, then everything on top) so dragging and painting stay smooth
  // the grid is one of none / hex / square (maps saved before this have true: hex on world maps, square on towns)
  const gridMode = () => st.grid === true ? (isTown() ? 'square' : 'hex') : (st.grid === 'hex' || st.grid === 'square' ? st.grid : '');
  function squareGrid(g, P) { g.save(); g.strokeStyle = P.ink; g.globalAlpha = 0.12; g.lineWidth = 1; g.beginPath(); for (let x = 0; x <= W; x += 40) { g.moveTo(x, 0); g.lineTo(x, H); } for (let y = 0; y <= H; y += 40) { g.moveTo(0, y); g.lineTo(W, y); } g.stroke(); g.restore(); }
  function renderBase(g, P) {
    if (isTown()) { T.renderBase(g, P); landDirty = false; if (!isDungeon() && gridMode() === 'hex') hexGrid(g, P); return; }
    g.fillStyle = P.sea; g.fillRect(0, 0, W, H);
    g.strokeStyle = P.seaLine; g.globalAlpha = 0.25; g.lineWidth = 1;
    const r = rng(42); for (let i = 0; i < 140; i++) { const x = r() * W, y = r() * H; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 8, y - 5, x + 16, y); g.quadraticCurveTo(x + 24, y + 5, x + 32, y); g.stroke(); }
    g.globalAlpha = 1;
    if (landDirty || !landCache) { landCache = renderLand(P); landDirty = false; }
    g.drawImage(landCache, 0, 0);
    if (P.mono && gridMode() !== 'hex') { g.strokeStyle = P.seaLine; g.globalAlpha = 0.55; g.lineWidth = 1; g.beginPath(); for (let x = 0; x <= W; x += 50) { g.moveTo(x, 0); g.lineTo(x, H); } for (let y = 0; y <= H; y += 50) { g.moveTo(0, y); g.lineTo(W, y); } g.stroke(); g.globalAlpha = 1; }
    const gm = gridMode(); if (gm === 'hex') hexGrid(g, P); else if (gm === 'square' && !P.mono) squareGrid(g, P);
  }
  function hexGrid(g, P) { g.save(); g.strokeStyle = P.ink; g.globalAlpha = 0.16; g.lineWidth = 1; const s = 40, h = s * Math.sqrt(3); for (let y = 0; y < H + h; y += h / 2) for (let x = ((y / (h / 2)) % 2) * s * 1.5; x < W + s * 3; x += s * 3) { g.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k; g.lineTo(x + s * Math.cos(a), y + s * Math.sin(a)); } g.closePath(); g.stroke(); } g.restore(); }
  function drawPath(g, p, P) {
    if (p.pts.length < 2) return;
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    if (p.k === 'river') { g.strokeStyle = P.river; g.lineWidth = 3.2; }
    else if (p.k === 'road') { g.strokeStyle = P.road; g.lineWidth = 2; g.setLineDash([7, 6]); }
    else { g.strokeStyle = P.border; g.lineWidth = 2.6; g.setLineDash([2, 7]); g.globalAlpha = 0.85; }
    smoothPath(g, p.pts); g.stroke(); g.restore();
  }
  // a label's lettering: the same font, alignment and spacing for drawing it and for measuring its box
  function labelFont(g, l, P) {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (l.k === 'region') { g.font = FONT(P, '600', LABEL_SIZE(l)); g.letterSpacing = P.mono ? '6px' : '10px'; }
    else if (l.k === 'sea') { g.font = FONT(P, 'italic', LABEL_SIZE(l)); g.letterSpacing = '3px'; }
    else { g.font = FONT(P, '', LABEL_SIZE(l)); g.letterSpacing = '0px'; }
  }
  // the box round a label's ink (before it's turned), from the lettering as drawn, so the selection fits it
  let measurer = null;
  function labelBox(l) {
    if (!measurer) measurer = document.createElement('canvas').getContext('2d');
    const g = measurer; labelFont(g, l, STYLES[st.style] || STYLES.parchment);
    const m = g.measureText(l.text || ' '), sz = LABEL_SIZE(l);
    let x0 = -m.actualBoundingBoxLeft, x1 = m.actualBoundingBoxRight, y0 = -m.actualBoundingBoxAscent, y1 = m.actualBoundingBoxDescent;
    if (!(x1 - x0 > 0) || !(y1 - y0 > 0)) { x0 = -sz / 4; x1 = sz / 4; y0 = -sz * 0.4; y1 = sz * 0.4; }   // a label of spaces, or no measuring
    return { x: l.x + x0, y: l.y + y0, w: x1 - x0, h: y1 - y0 };
  }
  function drawLabel(g, l, P) {
    g.save(); g.fillStyle = P.label; labelFont(g, l, P);
    if (l.k === 'sea') g.fillStyle = P.seaLine === P.sea ? P.label : P.coast;
    if (P.mono) { g.shadowColor = P.coast; g.shadowBlur = 6; }
    let x = l.x, y = l.y; if (l.rot) { g.translate(x, y); g.rotate(l.rot); x = 0; y = 0; }
    g.lineWidth = 4; g.strokeStyle = P.mono ? P.paper : P.land; g.globalAlpha = 0.85; if (l.k !== 'sea') g.strokeText(l.text, x, y); g.globalAlpha = 1; g.fillText(l.text, x, y); g.restore();
  }
  function drawPin(g, p, P) {
    g.save(); g.translate(p.x, p.y); g.fillStyle = P.pin; g.strokeStyle = P.ink; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(-10, -14, -10, -26, 0, -28); g.bezierCurveTo(10, -26, 10, -14, 0, 0); g.fill(); g.stroke();
    g.fillStyle = P.land; g.beginPath(); g.arc(0, -19, 4, 0, 7); g.fill();
    if (p.label) { g.font = FONT(P, '600', 17); g.textAlign = 'center'; g.lineWidth = 4; g.strokeStyle = P.land; g.strokeText(p.label, 0, 18); g.fillStyle = P.label; g.fillText(p.label, 0, 18); }
    g.restore();
  }
  // a border box at x,y,w,h in the given style; used for the map edge and for frames you draw yourself
  function drawRectFrame(g, P, x, y, w, h, f) {
    if (!f || f === 'none' || w < 2 || h < 2) return;
    g.save(); g.strokeStyle = P.ink; g.setLineDash([]);
    const gap = Math.min(8, w / 6, h / 6);
    if (f === 'simple') { g.lineWidth = 3; g.strokeRect(x, y, w, h); }
    else if (f === 'thick') { g.lineWidth = 7; g.strokeRect(x, y, w, h); }
    else { g.lineWidth = 3; g.strokeRect(x, y, w, h); g.lineWidth = 1; g.strokeRect(x + gap, y + gap, w - gap * 2, h - gap * 2); }
    if (f === 'ornate') {
      const c = Math.min(1, w / 220, h / 220);      // smaller corners on small frames
      g.fillStyle = P.ink; g.lineWidth = 1.5;
      for (const [cx, cy, sx, sy] of [[x + gap, y + gap, 1, 1], [x + w - gap, y + gap, -1, 1], [x + gap, y + h - gap, 1, -1], [x + w - gap, y + h - gap, -1, -1]]) {
        g.save(); g.translate(cx, cy); g.scale(sx * c, sy * c);
        g.beginPath(); g.moveTo(0, 0); g.lineTo(46, 0); g.moveTo(0, 0); g.lineTo(0, 46); g.stroke();
        g.beginPath(); g.arc(18, 18, 10, 0, 7); g.stroke(); g.beginPath(); g.arc(18, 18, 3.5, 0, 7); g.fill();
        g.beginPath(); g.moveTo(30, 6); g.quadraticCurveTo(44, 10, 52, 4); g.moveTo(6, 30); g.quadraticCurveTo(10, 44, 4, 52); g.stroke();
        g.restore();
      }
    }
    g.restore();
  }
  function drawFrame(g, P) {
    const f = st.frame || 'double';
    if (f === 'none') return;
    drawRectFrame(g, P, 14, 14, W - 28, H - 28, f);
    if (f === 'ornate') {
      // a scale bar along the bottom
      g.save(); g.strokeStyle = P.ink; g.lineWidth = 1.5; const x0 = 70, y0 = H - 54; for (let k = 0; k < 4; k++) { g.fillStyle = k % 2 ? P.paper : P.ink; g.fillRect(x0 + k * 40, y0, 40, 7); } g.strokeRect(x0, y0, 160, 7);
      g.fillStyle = P.ink; g.font = '14px Bookhaven, Georgia, serif'; g.textAlign = 'center'; g.fillText('0', x0, y0 - 6); g.fillText('100 leagues', x0 + 160, y0 - 6); g.restore();
    }
  }
  // skip: an item being dragged, drawn separately on top
  // skip: one thing ({ type, i }) or a group ({ type: 'group', keys }) that is drawn separately
  const skips = (skip, t, i) => !!skip && (skip.keys ? skip.keys.has(t + ':' + i) : skip.type === t && skip.i === i);
  function renderItems(g, P, skip) {
    st.paths.forEach((p, i) => { if (!skips(skip, 'path', i)) drawPath(g, p, P); });
    if (isTown()) T.renderUnder(g, P, skip);
    st.stamps.map((s, i) => [s, i]).sort((a, b) => ((a[0].z || 0) - (b[0].z || 0)) || a[0].y - b[0].y).forEach(([s, i]) => { if (!skips(skip, 'stamp', i)) stamp(g, s, P); });
    (st.boxes || []).forEach((b, i) => { if (!skips(skip, 'box', i)) drawRectFrame(g, P, b.x, b.y, b.w, b.h, b.f); });
    st.labels.forEach((l, i) => { if (!skips(skip, 'label', i)) drawLabel(g, l, P); });
    st.pins.forEach((p, i) => { if (!skips(skip, 'pin', i)) drawPin(g, p, P); });
    drawFog(g, P);
    if (st.compass) { g.save(); g.translate(W - 110, H - 120); g.strokeStyle = P.ink; g.fillStyle = P.ink; g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, 44, 0, 7); g.stroke(); for (let k = 0; k < 4; k++) { g.rotate(Math.PI / 2); g.beginPath(); g.moveTo(0, -58); g.lineTo(9, 0); g.lineTo(0, 9); g.lineTo(-9, 0); g.closePath(); k % 2 ? g.stroke() : g.fill(); } g.font = 'bold 18px Bookhaven, Georgia, serif'; g.textAlign = 'center'; g.fillText('N', 0, -64); g.restore(); }
    drawFrame(g, P);
  }
  function drawOne(g, s, P) {
    if (!s) return;
    if (s.type === 'group') { s.items.forEach(x => drawOne(g, x, P)); return; }
    if (s.type === 'stamp' && st.stamps[s.i]) stamp(g, st.stamps[s.i], P);
    if (s.type === 'path' && st.paths[s.i]) drawPath(g, st.paths[s.i], P);
    if (s.type === 'label' && st.labels[s.i]) drawLabel(g, st.labels[s.i], P);
    if (s.type === 'pin' && st.pins[s.i]) drawPin(g, st.pins[s.i], P);
    if (s.type === 'box' && st.boxes[s.i]) { const b = st.boxes[s.i]; drawRectFrame(g, P, b.x, b.y, b.w, b.h, b.f); }
    if (T && T.LISTS[s.type]) T.drawOne(g, s, P);
  }
  // for saving a picture
  function renderAll(g, P) { renderBase(g, P); renderItems(g, P); }
  // Frames, labels and moved towns can sit past the map's edge. The things on top are drawn over everything they
  // cover (up to LIM past the edge), and a picture grows to take them in, with plain paper round the map.
  const LIM = 800;
  const ptsBox = pts => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; } return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; };
  const padBox = (b, d) => ({ x: b.x - d, y: b.y - d, w: b.w + d * 2, h: b.h + d * 2 });
  function eachItem(fn) {
    for (const [t, key] of Object.entries(LIST_OF())) { const list = st[key]; if (Array.isArray(list)) for (let i = 0; i < list.length; i++) fn({ type: t, i }); }
  }
  function itemBox(s) {
    if (s.type === 'path') { const p = st.paths[s.i]; return p && p.pts.length ? padBox(ptsBox(p.pts), 6) : null; }
    if (T && T.LISTS[s.type]) { const o = (st[T.LISTS[s.type]] || [])[s.i]; return o && o.pts && o.pts.length ? padBox(ptsBox(o.pts), s.type === 'street' ? 15 : s.type === 'wall' ? 12 : 4) : null; }
    const b = bounds(s); if (!b) return null;
    if (s.type === 'pin') { const o = st.pins[s.i], lw = o && o.label ? o.label.length * 5 : 0; return { x: b.x - lw, y: b.y, w: b.w + lw * 2, h: b.h }; }
    const o = turnable(s);
    if (o && o.rot) { const r = Math.hypot(b.w, b.h) / 2 + 4, cx = b.x + b.w / 2, cy = b.y + b.h / 2; return { x: cx - r, y: cy - r, w: r * 2, h: r * 2 }; }
    return padBox(b, 6);
  }
  // forPicture: how far a saved picture reaches. Frames always count in full. Roads, rivers, streets, walls and areas
  // that run off the edge (rolled ones always do) only count once their middle is off the map, and anything else
  // has to stick out by more than a nick, so a map with nothing outside it stays exactly the map.
  function contentExtent(forPicture) {
    const e = [0, 0, W, H], f = [0, 0, W, H];
    eachItem(s => {
      const b = itemBox(s); if (!b) return;
      if (forPicture && ['path', 'street', 'wall', 'area'].includes(s.type) && inBox({ x: b.x + b.w / 2, y: b.y + b.h / 2 }, { x: 0, y: 0, w: W, h: H })) return;
      const a = forPicture && s.type === 'box' ? f : e;
      a[0] = Math.min(a[0], b.x); a[1] = Math.min(a[1], b.y); a[2] = Math.max(a[2], b.x + b.w); a[3] = Math.max(a[3], b.y + b.h);
    });
    if (forPicture) { const nick = 24; if (e[0] > -nick) e[0] = 0; if (e[1] > -nick) e[1] = 0; if (e[2] < W + nick) e[2] = W; if (e[3] < H + nick) e[3] = H; }
    const x0 = Math.max(-LIM, Math.floor(Math.min(e[0], f[0]))), y0 = Math.max(-LIM, Math.floor(Math.min(e[1], f[1]))), x1 = Math.min(W + LIM, Math.ceil(Math.max(e[2], f[2]))), y1 = Math.min(H + LIM, Math.ceil(Math.max(e[3], f[3])));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  // the whole picture at `scale` (kept under 16 million pixels, which iPhone and iPad can still draw)
  function picture(scale = 2) {
    const P = STYLES[st.style] || STYLES.parchment, e = contentExtent(true);
    const k = Math.min(scale, Math.sqrt(16e6 / (e.w * e.h)));
    const c = document.createElement('canvas'); c.width = Math.round(e.w * k); c.height = Math.round(e.h * k);
    const g = c.getContext('2d'); g.scale(k, k); g.translate(-e.x, -e.y);
    g.fillStyle = P.paper; g.fillRect(e.x, e.y, e.w, e.h);
    renderAll(g, P);
    return c;
  }

  let baseCache = null, itemsCache = null, baseKey = '', quick = null, seaCache = null, ext = { x: 0, y: 0, w: W, h: H };
  const layer = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  // while painting: a quick soft-edged land preview instead of the full coastline treatment
  function quickLand(P) {
    if (!quick) { quick = document.createElement('canvas'); quick.width = W / 2; quick.height = H / 2; }   // half size: four times less work per frame
    const g = quick.getContext('2d'), w = quick.width, h = quick.height;
    g.clearRect(0, 0, w, h); g.globalCompositeOperation = 'source-over'; g.imageSmoothingEnabled = true;
    g.drawImage(mask, 0, 0, w, h);
    g.globalCompositeOperation = 'source-in'; g.fillStyle = P.land; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'source-over';
    return quick;
  }
  function draw() {
    if (!cv) return;
    const P = STYLES[st.style] || STYLES.parchment, dpr = window.devicePixelRatio || 1;
    const key = `${st.style}|${st.grid}`;
    const painting = drawing && drawing.brush;
    if (!baseCache || landDirty && !painting || key !== baseKey) {
      if (!baseCache) baseCache = layer(); const g = baseCache.getContext('2d'); g.clearRect(0, 0, W, H); renderBase(g, P); baseKey = key;
      if (!seaCache) seaCache = layer(); const sg = seaCache.getContext('2d'); sg.fillStyle = P.sea; sg.fillRect(0, 0, W, H);
    }
    const moving = drawing && drawing.move && drawing.live && sel ? sel : null;
    if (!itemsCache || itemsDirty) {
      ext = contentExtent();
      if (!itemsCache || itemsCache.width !== ext.w || itemsCache.height !== ext.h) { itemsCache = document.createElement('canvas'); itemsCache.width = ext.w; itemsCache.height = ext.h; }
      const g = itemsCache.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, ext.w, ext.h); g.setTransform(1, 0, 0, 1, -ext.x, -ext.y);
      renderItems(g, P, moving); itemsDirty = false; itemsSkip = moving;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = P.paper; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.setTransform(cam.z * dpr, 0, 0, cam.z * dpr, cam.x * dpr, cam.y * dpr);
    if (isTown() && T.busy && tool === 'water') {
      ctx.drawImage(baseCache, 0, 0);
      const q = quickLand({ land: '#7fa7c7' }); ctx.globalAlpha = 0.7; ctx.drawImage(q, 0, 0, W, H); ctx.globalAlpha = 1;
    } else if (painting) {
      // plain sea with the live land on top; the full coastline is drawn again when you let go
      ctx.drawImage(seaCache, 0, 0); ctx.drawImage(quickLand(P), 0, 0, W, H);
    } else ctx.drawImage(baseCache, 0, 0);
    if (moving && moving.tint) { ctx.save(); ctx.globalAlpha = 0.85; ctx.imageSmoothingEnabled = true; ctx.drawImage(moving.tint, drawing.done.x, drawing.done.y, W, H); ctx.restore(); }
    ctx.drawImage(itemsCache, ext.x, ext.y);
    if (itemsSkip) drawOne(ctx, itemsSkip, P);
    // selection and brush outline
    if (sel && sel.type === 'group') drawGroupSel(ctx);
    else if (sel) {
      if (sel.type === 'path' && st.paths[sel.i]) { ctx.save(); ctx.strokeStyle = '#3d7bd9'; ctx.globalAlpha = 0.35; ctx.lineWidth = 10; ctx.lineCap = 'round'; smoothPath(ctx, st.paths[sel.i].pts); ctx.stroke(); ctx.restore(); }
      else { const b = bounds(sel), o = turnable(sel); if (b) { ctx.save(); if (o && o.rot && sel.type === 'label') { ctx.translate(o.x, o.y); ctx.rotate(o.rot); ctx.translate(-o.x, -o.y); } ctx.strokeStyle = '#3d7bd9'; ctx.setLineDash([5, 4]); ctx.lineWidth = 2; ctx.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8); ctx.restore(); } }
      const sz = sizeHandle(); if (sz) { ctx.save(); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#3d7bd9'; ctx.lineWidth = 2 / cam.z; const hs = 11 / cam.z; ctx.fillRect(sz.x - hs / 2, sz.y - hs / 2, hs, hs); ctx.strokeRect(sz.x - hs / 2, sz.y - hs / 2, hs, hs); ctx.restore(); }
      const hd = handle(); if (hd) { const o = pivotOf(sel); ctx.save(); ctx.strokeStyle = '#3d7bd9'; ctx.fillStyle = '#fff'; ctx.lineWidth = 2 / cam.z; if (!isBridge(o)) { ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(hd.x, hd.y); ctx.setLineDash([3 / cam.z, 3 / cam.z]); ctx.stroke(); ctx.setLineDash([]); } ctx.beginPath(); ctx.arc(hd.x, hd.y, 7 / cam.z, 0, 7); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(hd.x, hd.y, 3.5 / cam.z, -2.4, 1.2); ctx.stroke(); ctx.restore(); }
    }
    if (sel && sel.type === 'box' && st.boxes[sel.i]) { const b = st.boxes[sel.i], hs = 12 / cam.z; ctx.save(); ctx.fillStyle = '#3d7bd9'; ctx.fillRect(b.x + b.w - hs / 2, b.y + b.h - hs / 2, hs, hs); ctx.restore(); }
    if (drawing && drawing.path) drawPath(ctx, drawing.path, P);
    if (drawing && drawing.fog) { ctx.save(); ctx.globalAlpha = drawing.fog.on ? 0.45 : 0.6; ctx.strokeStyle = drawing.fog.on ? '#5d5a55' : '#3d7bd9'; ctx.lineWidth = drawing.fog.w; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); drawing.fog.pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); if (drawing.fog.pts.length === 1) ctx.lineTo(drawing.fog.pts[0][0] + 0.1, drawing.fog.pts[0][1]); ctx.stroke(); ctx.restore(); }
    if (drawing && drawing.box) { const b = norm(drawing.box); drawRectFrame(ctx, P, b.x, b.y, b.w, b.h, b.f); }
    if (drawing && drawing.marq) { const b = norm(drawing.marq); ctx.save(); ctx.fillStyle = 'rgba(61,123,217,0.08)'; ctx.fillRect(b.x, b.y, b.w, b.h); ctx.strokeStyle = '#3d7bd9'; ctx.lineWidth = 1.5 / cam.z; ctx.setLineDash([6 / cam.z, 4 / cam.z]); ctx.strokeRect(b.x, b.y, b.w, b.h); ctx.restore(); }
    if (isTown()) T.drawPreview(ctx, P);
    syncFrameSelect(); renderSelBar();
    if (brushOn() && hover) { ctx.save(); ctx.strokeStyle = '#3d7bd9'; ctx.lineWidth = 1.5 / cam.z; ctx.beginPath(); ctx.arc(hover.x, hover.y, brush * K / 2, 0, 7); ctx.stroke(); ctx.restore(); }
  }
  let itemsSkip = null, raf = 0;
  const redraw = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };
  let hover = null;
  const BRUSHY = ['land', 'water', 'forest', 'mountain', 'hill'];
  // tools that paint with the round brush: its outline follows the pointer over the map (a mouse, trackpad or pen
  // hovering; a finger only while drawing) and goes when the pointer leaves the map
  const brushOn = () => BRUSHY.includes(tool) || tool === 'fog' || (isTown() && T.brushy(tool));

  // ================================================================== TURNING (landmarks, symbols and labels)
  // A selected one gets a round handle above it: drag it round to turn it (snaps to 15° steps; Shift turns freely).
  // A bridge's handle sits on its end instead, so dragging it turns the bridge and makes it longer or shorter.
  const turnable = s => s && (s.type === 'stamp' ? st.stamps[s.i] : s.type === 'label' ? st.labels[s.i] : null) || null;
  const isBridge = o => !!o && o.k === 't-bridge';
  // Town areas (parks and woods, fields, market squares, graveyards) and buildings are kept as outlines (points), so
  // they turn and resize by moving their points about their middle: nothing new is saved and old maps load as they were.
  const SHAPES = ['area', 'building'];
  const shape = s => s && SHAPES.includes(s.type) && T && T.LISTS[s.type] ? ((st[T.LISTS[s.type]] || [])[s.i] || null) : null;
  const resizable = s => turnable(s) || shape(s);
  const shapeMid = o => { const b = ptsBox(o.pts); return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; };
  const shapeR = (o, c) => o.pts.reduce((m, q) => Math.max(m, Math.hypot(q[0] - c.x, q[1] - c.y)), 0);
  // the point it turns and resizes about (an outline's middle stays put while it's being turned or resized)
  const pivotOf = s => turnable(s) || (shape(s) ? (drawing && drawing.c) || shapeMid(shape(s)) : null);
  // pts0 turned by a and scaled by k about c
  function placePts(o, pts0, c, a, k) {
    const cs = Math.cos(a), sn = Math.sin(a);
    o.pts = pts0.map(([x, y]) => { const dx = (x - c.x) * k, dy = (y - c.y) * k; return [Math.round((c.x + dx * cs - dy * sn) * 10) / 10, Math.round((c.y + dx * sn + dy * cs) * 10) / 10]; });
  }
  function handle() {
    const p = !turnable(sel) && shape(sel);
    if (p) { const c = pivotOf(sel), a = (drawing && drawing.turn && drawing.a) || 0, d = ((drawing && drawing.turn && drawing.R) || shapeR(p, c)) + 22 / cam.z; return { x: c.x + Math.sin(a) * d, y: c.y - Math.cos(a) * d }; }
    const o = turnable(sel); if (!o) return null;
    const a = o.rot || 0;
    if (isBridge(o)) { const L = (o.len || 60) * (o.s || 1) / 2; return { x: o.x + Math.cos(a) * L, y: o.y + Math.sin(a) * L }; }
    const b = bounds(sel); if (!b) return null;
    const d = (sel.type === 'label' ? b.h / 2 : Math.max(b.h, b.w) / 2) + 22 / cam.z;
    return { x: o.x + Math.sin(a) * d, y: o.y - Math.cos(a) * d };
  }
  // a square handle at the bottom-right corner: drag it to make a landmark, symbol or label bigger or smaller
  function sizeHandle() {
    if (!resizable(sel)) return null;
    const b = bounds(sel); if (!b) return null;
    const o = turnable(sel), x = b.x + b.w + 4, y = b.y + b.h + 4;
    if (o && o.rot && sel.type === 'label') { const c = Math.cos(o.rot), s = Math.sin(o.rot); return { x: o.x + (x - o.x) * c - (y - o.y) * s, y: o.y + (x - o.x) * s + (y - o.y) * c }; }   // on the turned box's corner
    return { x, y };
  }
  // + and − keys, and R: an outline is resized or turned about its middle
  function scaleSel(k) { const p = shape(sel); if (p) placePts(p, p.pts, shapeMid(p), 0, k); else scaleBy(turnable(sel), k); }
  const LABEL_SIZE = l => l.size || (l.k === 'region' ? 44 : l.k === 'sea' ? 30 : 20);
  function scaleBy(o, k) {
    if (sel.type === 'label') o.size = Math.round(Math.max(8, Math.min(140, LABEL_SIZE(o) * k)));
    else o.s = Math.max(0.3, Math.min(5, +((o.s || 1) * k).toFixed(3)));
  }
  const snapAngle = (a, free) => { a = Math.atan2(Math.sin(a), Math.cos(a)); return free ? Math.round(a * 1000) / 1000 : Math.round(a / (Math.PI / 12)) * (Math.PI / 12); };
  function turnTo(p, free) {
    const sh = shape(sel);
    if (sh && drawing && drawing.pts0) { const c = drawing.c; drawing.a = snapAngle(Math.atan2(p.x - c.x, -(p.y - c.y)), free); placePts(sh, drawing.pts0, c, drawing.a, 1); return; }
    const o = turnable(sel); if (!o) return;
    const dx = p.x - o.x, dy = p.y - o.y;
    if (isBridge(o)) { o.rot = snapAngle(Math.atan2(dy, dx), free); o.len = Math.max(24, Math.min(400, Math.round(2 * Math.hypot(dx, dy) / (o.s || 1)))); }
    else o.rot = snapAngle(Math.atan2(dx, -dy), free);
    if (!o.rot) delete o.rot;
  }
  // ================================================================== HIT TESTING
  function bounds(s) {
    if (s.type === 'stamp' && st.stamps[s.i] && /^[td]-/.test(st.stamps[s.i].k)) { const o = st.stamps[s.i], m = o.k[0] === 't' ? TW : DG; if (m) return m.stampBounds(o); }
    if (s.type === 'stamp' && st.stamps[s.i] && /^m-/.test(st.stamps[s.i].k)) { const o = st.stamps[s.i], z = 16 * (o.s || 1); return { x: o.x - z, y: o.y - z, w: z * 2, h: z * 2 }; }
    if (T && T.LISTS[s.type]) return T.bounds(s);
    if (s.type === 'stamp') { const o = st.stamps[s.i]; if (!o) return null; const z = (o.s || 1) * (o.k === 'city' ? 26 : 18); return { x: o.x - z, y: o.y - z * 1.4, w: z * 2, h: z * 1.8 }; }
    if (s.type === 'pin') { const o = st.pins[s.i]; if (!o) return null; return { x: o.x - 12, y: o.y - 30, w: 24, h: 52 }; }
    if (s.type === 'box') { const o = st.boxes[s.i]; return o ? { x: o.x, y: o.y, w: o.w, h: o.h } : null; }
    if (s.type === 'label') { const o = st.labels[s.i]; return o ? labelBox(o) : null; }
    return null;
  }
  function hit(x, y) {
    const inB = b => b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
    for (let i = st.pins.length - 1; i >= 0; i--) if (inB(bounds({ type: 'pin', i }))) return { type: 'pin', i };
    for (let i = st.labels.length - 1; i >= 0; i--) { const l = st.labels[i], c = Math.cos(-(l.rot || 0)), s2 = Math.sin(-(l.rot || 0)), lx = l.x + (x - l.x) * c - (y - l.y) * s2, ly = l.y + (x - l.x) * s2 + (y - l.y) * c; const b = bounds({ type: 'label', i }); if (b && lx >= b.x && lx <= b.x + b.w && ly >= b.y && ly <= b.y + b.h) return { type: 'label', i }; }
    for (let i = st.stamps.length - 1; i >= 0; i--) if (inB(bounds({ type: 'stamp', i }))) return { type: 'stamp', i };
    for (let i = st.paths.length - 1; i >= 0; i--) if (st.paths[i].pts.some(p => Math.hypot(p[0] - x, p[1] - y) < 10)) return { type: 'path', i };
    if (isTown()) { const h = T.hit(x, y); if (h && h.type !== 'area') return h; const b = hitBox(x, y); if (b) return b; return h; }
    return hitBox(x, y);
  }
  // a fingertip is wide: on touch, also look a little way round the point pressed
  function hitAt(p, e) {
    let h = hit(p.x, p.y); if (h || !e || e.pointerType !== 'touch') return h;
    const r = 12 / cam.z;
    for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) { h = hit(p.x + dx, p.y + dy); if (h) return h; }
    return null;
  }
  function hitBox(x, y) {
    // frames: grab them by their lines (so clicking inside one still reaches what's in it)
    const near = 12 / Math.max(0.5, cam.z);
    for (let i = (st.boxes || []).length - 1; i >= 0; i--) { const b = st.boxes[i];
      const inX = x > b.x - near && x < b.x + b.w + near, inY = y > b.y - near && y < b.y + b.h + near;
      if ((inY && (Math.abs(x - b.x) < near || Math.abs(x - b.x - b.w) < near)) || (inX && (Math.abs(y - b.y) < near || Math.abs(y - b.y - b.h) < near))) return { type: 'box', i }; }
    return null;
  }

  // ================================================================== GROUPS (Select an area, and a new random town)
  // A group is several things selected together: { type: 'group', items: [{ type, i }], keys, ground }. ground (when
  // there is one) is the group's own land or water, as a mask-sized picture, so a rolled town takes its river along.
  function makeGroup(items, ground) {
    const g = { type: 'group', items, keys: new Set(items.map(s => s.type + ':' + s.i)), ground: ground || null, gb: null };
    if (ground) {
      const d = ground.getContext('2d').getImageData(0, 0, MW, MH).data; let x0 = MW, y0 = MH, x1 = -1, y1 = -1;
      for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (d[(y * MW + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 < 0) g.ground = null; else g.gb = { x: x0 * K, y: y0 * K, w: (x1 - x0 + 1) * K, h: (y1 - y0 + 1) * K };
    }
    return g;
  }
  function groupBox(g) {
    let b = g.gb ? { ...g.gb } : null;
    for (const s of g.items) { const c = itemBox(s); if (!c) continue; if (!b) b = { ...c }; else { const x1 = Math.max(b.x + b.w, c.x + c.w), y1 = Math.max(b.y + b.h, c.y + c.h); b.x = Math.min(b.x, c.x); b.y = Math.min(b.y, c.y); b.w = x1 - b.x; b.h = y1 - b.y; } }
    return b;
  }
  const inBox = (p, b) => !!b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
  function moveSel(s, dx, dy) {
    if (s.type === 'group') { s.items.forEach(x => moveSel(x, dx, dy)); return; }
    if (T && T.LISTS[s.type]) { T.moveBy(s, dx, dy); return; }
    if (s.type === 'path') { const p = st.paths[s.i]; if (p) p.pts.forEach(q => { q[0] += dx; q[1] += dy; }); return; }
    const key = { stamp: 'stamps', pin: 'pins', label: 'labels', box: 'boxes' }[s.type], o = key && st[key][s.i];
    if (o) { o.x += dx; o.y += dy; }
  }
  // the group's land or water comes off the map while it's dragged (shown as a light shape), and goes back where it's let go
  function liftGround(g) {
    mctx.globalCompositeOperation = 'destination-out'; mctx.drawImage(g.ground, 0, 0); mctx.globalCompositeOperation = 'source-over';
    const t = document.createElement('canvas'); t.width = MW; t.height = MH; const x = t.getContext('2d');
    x.drawImage(g.ground, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = isTown() ? '#7fa7c7' : (STYLES[st.style] || STYLES.parchment).land; x.fillRect(0, 0, MW, MH);
    g.tint = t; landDirty = true;
  }
  function dropGround(g, done) {
    const n = document.createElement('canvas'); n.width = MW; n.height = MH; n.getContext('2d').drawImage(g.ground, Math.round(done.x / K), Math.round(done.y / K));
    mctx.drawImage(n, 0, 0); g.ground = n; g.tint = null; if (g.gb) { g.gb.x += done.x; g.gb.y += done.y; } landDirty = true;
  }
  // a box dragged with Select an area: everything whose middle is inside it (and, if asked, the land or water in it)
  let takeGround = false;
  function groupIn(b) {
    const items = [];
    eachItem(s => { const c = itemBox(s); if (c && inBox({ x: c.x + c.w / 2, y: c.y + c.h / 2 }, b)) items.push(s); });
    let ground = null;
    if (takeGround && !isDungeon()) {
      ground = document.createElement('canvas'); ground.width = MW; ground.height = MH; const g = ground.getContext('2d');
      g.drawImage(mask, 0, 0); g.globalCompositeOperation = 'destination-in'; g.fillStyle = '#000'; g.fillRect(Math.floor(b.x / K), Math.floor(b.y / K), Math.ceil(b.w / K) + 1, Math.ceil(b.h / K) + 1);
    }
    const grp = makeGroup(items, ground);
    if (!grp.items.length && !grp.ground) return null;
    return grp.items.length === 1 && !grp.ground ? grp.items[0] : grp;
  }
  function drawGroupSel(g) {
    const z = cam.z, b = groupBox(sel); if (!b) return;
    g.save(); g.strokeStyle = '#3d7bd9'; g.lineJoin = 'round'; g.lineCap = 'round';
    for (const s of sel.items) {
      const key = LIST_OF()[s.type], o = key && st[key] && st[key][s.i]; if (!o) continue;
      if (o.pts && (s.type === 'path' || s.type === 'street' || s.type === 'wall')) { g.globalAlpha = 0.3; g.lineWidth = 7 / z + (s.type === 'street' ? 10 : 0); g.beginPath(); o.pts.forEach((q, k) => k ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.stroke(); }
      else if (o.pts) { g.globalAlpha = 0.9; g.lineWidth = 1.6 / z; g.beginPath(); o.pts.forEach((q, k) => k ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.closePath(); g.stroke(); }
      else { const c = itemBox(s); if (c) { g.globalAlpha = 0.9; g.lineWidth = 1.5 / z; g.strokeRect(c.x, c.y, c.w, c.h); } }
    }
    g.globalAlpha = 1; g.fillStyle = 'rgba(61,123,217,0.07)'; g.fillRect(b.x - 6, b.y - 6, b.w + 12, b.h + 12);
    g.lineWidth = 2 / z; g.setLineDash([7 / z, 5 / z]); g.strokeRect(b.x - 6, b.y - 6, b.w + 12, b.h + 12);
    g.restore();
  }
  function selectGroup(items, ground) {
    sel = makeGroup(items, ground);
    if (!sel.items.length && !sel.ground) sel = null;
    if (view && tool !== 'select' && tool !== 'marquee') setTool('select');
    renderSelBar();
  }
  function hasContent() { let any = false; eachItem(() => { any = true; }); return any || !!(mask && maskData()); }
  // the middle of what's on screen, on the map
  function viewCentre() {
    const s = view && view.querySelector('.mp-stage'); if (!s) return { x: W / 2, y: H / 2 };
    const r = s.getBoundingClientRect();
    return { x: Math.max(0, Math.min(W, (r.width / 2 - cam.x) / cam.z)), y: Math.max(0, Math.min(H, (r.height / 2 - cam.y) / cam.z)) };
  }

  // ================================================================== EDITING
  const world = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left - cam.x) / cam.z, y: (e.clientY - r.top - cam.y) / cam.z }; };
  function landCount() { try { const d = mctx.getImageData(0, 0, MW, MH).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 127) n++; return n; } catch { return 0; } }
  function paint(x, y, on, from) {
    mctx.globalCompositeOperation = on ? 'source-over' : 'destination-out';
    mctx.fillStyle = '#000'; mctx.strokeStyle = '#000'; mctx.lineCap = 'round'; mctx.lineWidth = brush;
    if (from) { mctx.beginPath(); mctx.moveTo(from.x / K, from.y / K); mctx.lineTo(x / K, y / K); mctx.stroke(); }   // no gaps when you move fast
    mctx.beginPath(); mctx.arc(x / K, y / K, brush / 2, 0, 7); mctx.fill();
    mctx.globalCompositeOperation = 'source-over';
  }
  const changed = () => { itemsDirty = true; fogDirty = true; redraw(); };
  function pointerDown(e) {
    if (e.button !== 0 && e.button !== 1) return;
    const p = world(e), near = (e.pointerType === 'touch' ? 22 : 12) / cam.z;
    // an outline keeps its points as they were when the drag started, and its middle, so it turns and resizes cleanly
    const outline = () => { const sh = shape(sel); if (!sh) return {}; const c = shapeMid(sh); return { c, pts0: sh.pts.map(q => q.slice()), R: shapeR(sh, c) }; };
    // a handle is only taken when the press isn't on the thing itself, or is right on the handle: on a small building
    // tapped with a finger the handles are within reach of its middle, and a tap there must select or move it, never resize
    const onSel = () => { const bb = sel && bounds(sel); return !!bb && p.x >= bb.x && p.x <= bb.x + bb.w && p.y >= bb.y && p.y <= bb.y + bb.h; };
    const grab = h => h && Math.hypot(p.x - h.x, p.y - h.y) < near && (!onSel() || Math.hypot(p.x - h.x, p.y - h.y) < 7 / cam.z);
    if (e.button === 0 && tool === 'select' && !e.altKey) { const sz = sizeHandle(), o = resizable(sel); if (sz && o && grab(sz)) { try { cv.setPointerCapture(e.pointerId); } catch {} push(); const c = pivotOf(sel); drawing = { size: true, d0: Math.max(4, Math.hypot(p.x - c.x, p.y - c.y)), s0: o.s || 1, l0: sel.type === 'label' ? LABEL_SIZE(o) : 0, ...outline() }; return; } }
    if (e.button === 0 && tool === 'select' && !e.altKey) { const hd = handle(); if (hd && grab(hd)) { try { cv.setPointerCapture(e.pointerId); } catch {} push(); drawing = { turn: true, ...outline() }; return; } }
    // Select and Select an area: a press only selects; it becomes a move once the finger or mouse has gone a few pixels
    // (so a tap never nudges anything). Pressing on any part of a selected group moves the whole group.
    const picking = (tool === 'select' || tool === 'marquee') && e.button === 0 && !e.altKey;
    const h = picking ? hitAt(p, e) : null, grp = sel && sel.type === 'group' ? sel : null;
    const inGrp = !!grp && (h ? grp.keys.has(h.type + ':' + h.i) : tool === 'marquee' && inBox(p, groupBox(grp)));
    if (picking && tool === 'marquee' && !inGrp) { try { cv.setPointerCapture(e.pointerId); } catch {} drawing = { marq: { x0: p.x, y0: p.y, x1: p.x, y1: p.y } }; sel = null; redraw(); return; }
    if (e.button === 1 || e.altKey || (tool === 'select' && !h && !inGrp)) { drawing = { pan: true, sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y }; sel = null; redraw(); return; }
    try { cv.setPointerCapture(e.pointerId); } catch {}
    // resize the selected frame by its corner
    if (sel && sel.type === 'box' && st.boxes[sel.i]) { const b = st.boxes[sel.i]; if (Math.abs(p.x - b.x - b.w) < near && Math.abs(p.y - b.y - b.h) < near) { push(); drawing = { resize: b }; return; } }
    if (picking) { if (!inGrp) sel = h; drawing = { move: true, start: p, sx: e.clientX, sy: e.clientY, slop: e.pointerType === 'touch' ? 10 : 4, live: false, done: { x: 0, y: 0 } }; redraw(); return; }
    push();
    if (tool === 'mark') { st.stamps.push({ k: 'm-' + markK, x: p.x, y: p.y, s: 1 }); sel = { type: 'stamp', i: st.stamps.length - 1 }; changed(); schedule(); return; }
    if (tool === 'fog') { drawing = { fog: { on: fogOn, w: brush * K, pts: [[p.x, p.y]] } }; if (st.fogHide) { st.fogHide = false; syncFogBar(); } changed(); return; }
    if (isTown() && T.pointerDown(p, tool)) return;
    if (tool === 'land' || tool === 'water') { drawing = { brush: true, on: tool === 'land', last: p, before: landCount() }; paint(p.x, p.y, drawing.on); redraw(); return; }
    if (['forest', 'mountain', 'hill'].includes(tool)) { drawing = { scatter: tool === 'forest' ? 'tree' : tool, last: p }; scatter(p); changed(); return; }
    if (['town', 'city', 'tower', 'ruin'].includes(tool)) { st.stamps.push({ k: tool, x: p.x, y: p.y, s: 1 }); sel = { type: 'stamp', i: st.stamps.length - 1 }; changed(); schedule(); return; }
    if (['road', 'border'].includes(tool)) { drawing = { path: { k: tool, pts: [[p.x, p.y]] } }; return; }
    if (tool === 'pin') { addPin(p); return; }
    if (tool === 'label') { addLabel(p); return; }
    if (tool === 'frame') { drawing = { box: { x0: p.x, y0: p.y, x1: p.x, y1: p.y, f: boxStyle } }; sel = null; return; }
  }
  const norm = d => ({ x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1), w: Math.abs(d.x1 - d.x0), h: Math.abs(d.y1 - d.y0), f: d.f });
  let boxStyle = 'double';
  function syncFrameSelect() {
    const s = view && $('#mp-frame', view); if (!s) return;
    const box = sel && sel.type === 'box' && st.boxes[sel.i];
    const v = box ? box.f : tool === 'frame' ? boxStyle : (st.frame || 'double');
    if (s.value !== v) s.value = v;
    s.dataset.tip = box ? 'Line style of the selected frame' : tool === 'frame' ? 'Line style for the frames you draw' : 'The border around the edge of the map';
  }
  function scatter(p) {
    const k = drawing.scatter, n = k === 'tree' ? 3 : 1, spread = brush * 1.8;
    for (let i = 0; i < n; i++) { const x = p.x + (Math.random() - 0.5) * spread, y = p.y + (Math.random() - 0.5) * spread; if (st.stamps.some(s => s.k === k && Math.hypot(s.x - x, s.y - y) < (k === 'mountain' ? 26 : 14))) continue; st.stamps.push({ k, x, y, s: 0.8 + Math.random() * 0.5 }); }
  }
  function pointerMove(e) {
    const p = world(e); hover = p;
    if (T && T.busy) { T.pointerMove(p); return; }
    if (!drawing) { if (brushOn()) redraw(); else if (tool === 'select') { const hd = handle(), sz = sizeHandle(); cv.style.cursor = sz && Math.hypot(p.x - sz.x, p.y - sz.y) < 12 / cam.z ? 'nwse-resize' : hd && Math.hypot(p.x - hd.x, p.y - hd.y) < 12 / cam.z ? 'grab' : 'default'; } return; }
    if (drawing.pan) { cam.x = drawing.cx + e.clientX - drawing.sx; cam.y = drawing.cy + e.clientY - drawing.sy; redraw(); return; }
    if (drawing.marq) { drawing.marq.x1 = p.x; drawing.marq.y1 = p.y; redraw(); return; }
    if (drawing.move && sel) {
      if (!drawing.live) {
        if (Math.hypot(e.clientX - drawing.sx, e.clientY - drawing.sy) < drawing.slop) return;
        drawing.live = true; push(); if (sel.type === 'group' && sel.ground) liftGround(sel); itemsDirty = true;
      }
      let tx = p.x - drawing.start.x, ty = p.y - drawing.start.y;
      if (sel.ground) { tx = Math.round(tx / K) * K; ty = Math.round(ty / K) * K; }   // land and water move in whole mask steps, so they stay under what's on them
      const dx = tx - drawing.done.x, dy = ty - drawing.done.y; drawing.done = { x: tx, y: ty };
      if (dx || dy) moveSel(sel, dx, dy);
      redraw(); return;                      // what's dragged is drawn on its own, over the rest, so nothing else is redrawn
    }
    if (drawing.move) return;
    if (drawing.box) { drawing.box.x1 = p.x; drawing.box.y1 = p.y; redraw(); return; }
    if (drawing.fog) { const l = drawing.fog.pts[drawing.fog.pts.length - 1]; if (Math.hypot(p.x - l[0], p.y - l[1]) > 6) { drawing.fog.pts.push([p.x, p.y]); redraw(); } return; }
    if (drawing.turn) { turnTo(p, e.shiftKey); itemsDirty = true; redraw(); return; }
    if (drawing.size && drawing.pts0) { const sh = shape(sel); if (sh) { const k = Math.hypot(p.x - drawing.c.x, p.y - drawing.c.y) / drawing.d0; placePts(sh, drawing.pts0, drawing.c, 0, Math.max(8 / Math.max(8, drawing.R), Math.min(6, k))); } itemsDirty = true; redraw(); return; }
    if (drawing.size) { const o = turnable(sel); if (o) { const k = Math.hypot(p.x - o.x, p.y - o.y) / drawing.d0; if (sel.type === 'label') o.size = Math.round(Math.max(8, Math.min(140, drawing.l0 * k))); else o.s = Math.max(0.3, Math.min(5, +(drawing.s0 * k).toFixed(3))); } itemsDirty = true; redraw(); return; }
    if (drawing.resize) { const b = drawing.resize; b.w = Math.max(30, p.x - b.x); b.h = Math.max(30, p.y - b.y); itemsDirty = true; redraw(); return; }
    if (drawing.brush) { paint(p.x, p.y, drawing.on, drawing.last); drawing.last = p; redraw(); return; }
    if (drawing.scatter) { if (Math.hypot(p.x - drawing.last.x, p.y - drawing.last.y) > (drawing.scatter === 'mountain' ? 22 : 10)) { drawing.last = p; scatter(p); changed(); } return; }
    if (drawing.path) { const l = drawing.path.pts[drawing.path.pts.length - 1]; if (Math.hypot(p.x - l[0], p.y - l[1]) > 10) { drawing.path.pts.push([p.x, p.y]); redraw(); } }
  }
  function pointerUp() {
    if (T && T.busy) { T.pointerUp(); return; }
    if (!drawing) return;
    const d = drawing; drawing = null;
    if (d.marq) { const b = norm(d.marq); sel = b.w * cam.z > 6 || b.h * cam.z > 6 ? groupIn(b) : null; redraw(); return; }
    if (d.move && !d.live) { redraw(); return; }   // a tap: selected, nothing moved, nothing to undo
    if (d.move && sel && sel.type === 'group' && sel.ground) dropGround(sel, d.done);
    if (d.brush) {
      landDirty = true;
      // water painted where there was no land changes nothing you can see: say how the tool works instead of seeming broken
      if (!d.on && Math.abs(landCount() - d.before) < 3) U.toast('That’s already water. Paint 🌊 over land to make a lake, a bay or a river.', '', 5000);
      else if (d.on && Math.abs(landCount() - d.before) < 3) U.toast('That’s already land. Paint 🟫 over the sea to add land.', '', 5000);
    }
    if (d.path) { if (d.path.pts.length >= 2) st.paths.push(d.path); else undo.pop(); }
    if (d.fog) { (st.fog = st.fog || []).push(d.fog); fogDirty = true; }
    if (d.box) { const b = norm(d.box); if (b.w > 20 && b.h > 20) { st.boxes = st.boxes || []; st.boxes.push(b); sel = { type: 'box', i: st.boxes.length - 1 }; } else undo.pop(); }
    itemsDirty = true; itemsSkip = null; redraw(); if (!d.pan) schedule();
  }
  function wheel(e) {
    e.preventDefault();
    const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    // a mouse wheel click is about 100; a trackpad sends many small steps (with Ctrl held for a pinch), so go by size
    const d = Math.max(-60, Math.min(60, e.deltaMode === 1 ? e.deltaY * 20 : e.deltaY));
    const z = Math.min(4, Math.max(minZ(), cam.z * Math.exp(-d * (e.ctrlKey ? 0.01 : 0.0019))));
    cam.x = mx - (mx - cam.x) * z / cam.z; cam.y = my - (my - cam.y) * z / cam.z; cam.z = z; redraw();
  }
  function places() { const out = []; if (!host.inBook || !S.project) return out; const r = S.project.binder.find(n => n.root && n.kind === 'places'); if (r) U.walkTree(r.children || [], n => { if (n.type === 'doc' && !n.map) out.push(n); }); return out; }
  async function addPin(p, existing) {
    const pl = places();
    const body = document.createElement('div');
    body.innerHTML = `<div class="field"><label>Name on the map</label><input type="text" id="pn-name" value="${esc(existing ? existing.label || '' : '')}" placeholder="e.g. Hollin Keep"></div>
      <div class="field" style="margin-top:10px"><label>Link to a Places sheet (optional)</label><select id="pn-link"><option value="">— none —</option>${pl.map(n => `<option value="${n.id}" ${existing && existing.placeId === n.id ? 'selected' : ''}>${esc(n.title)}</option>`).join('')}</select></div>`;
    $('#pn-link', body).onchange = e => { const n = pl.find(x => x.id === e.target.value); if (n && !$('#pn-name', body).value) $('#pn-name', body).value = n.title; };
    const ok = await U.modal({ title: existing ? 'Edit pin' : 'New pin', body, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: existing ? 'Save' : 'Add pin', value: true, kind: 'primary' }] });
    if (!ok) { if (!existing) undo.pop(); return; }
    const data = { label: $('#pn-name', body).value.trim(), placeId: $('#pn-link', body).value || null };
    if (existing) Object.assign(existing, data); else { st.pins.push({ x: p.x, y: p.y, ...data }); sel = { type: 'pin', i: st.pins.length - 1 }; }
    changed(); schedule();
  }
  async function addLabel(p, existing) {
    const body = document.createElement('div');
    body.innerHTML = `<div class="field"><label>Text</label><input type="text" id="lb-t" value="${esc(existing ? existing.text : '')}" placeholder="e.g. The Salt Flats"></div>
      <div class="field" style="margin-top:10px"><label>Kind</label><div class="chip-row" id="lb-k">${[['region', 'Region (big, spaced capitals)'], ['place', 'Place'], ['sea', 'Sea or river (italic)']].map(([v, l]) => `<button type="button" class="chip ${(existing ? existing.k : 'place') === v ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div></div>
      <div class="field" style="margin-top:10px"><label>Size</label><input type="range" id="lb-s" min="12" max="80" value="${existing ? existing.size || (existing.k === 'region' ? 44 : existing.k === 'sea' ? 30 : 20) : 20}"></div>`;
    let k = existing ? existing.k : 'place';
    $$('#lb-k .chip', body).forEach(c => c.onclick = () => { $$('#lb-k .chip', body).forEach(x => x.classList.remove('on')); c.classList.add('on'); k = c.dataset.v; $('#lb-s', body).value = k === 'region' ? 44 : k === 'sea' ? 30 : 20; });
    const ok = await U.modal({ title: existing ? 'Edit label' : 'New label', body, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'OK', value: true, kind: 'primary' }] });
    const text = $('#lb-t', body).value.trim();
    if (!ok || !text) { if (!existing) undo.pop(); return; }
    const data = { text: k === 'region' ? text.toUpperCase() : text, k, size: +$('#lb-s', body).value };
    if (existing) Object.assign(existing, data); else { st.labels.push({ x: p.x, y: p.y, ...data }); sel = { type: 'label', i: st.labels.length - 1 }; }
    changed(); schedule();
  }
  async function townFor(s) {
    let sec = s.townId && docData.sections.find(x => x.id === s.townId);
    if (!sec) {
      const lab = st.labels.filter(l => Math.hypot(l.x - s.x, l.y - s.y) < 70).sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0];
      const ok = await U.confirmBox('Make a town map?', `Adds a town map${lab ? ` for <b>${esc(lab.text)}</b>` : ''} to this map, as a new section. Double-click the ${s.k === 'city' ? 'city' : 'town'} again any time to go there.`, 'Make a town map');
      if (!ok) return;
      const here = st; sec = await addSection(s.k === 'city' ? 'city' : 'town', null, { name: lab ? lab.text : '' });
      if (!sec) return;
      s.townId = sec.id; here.townId = here.townId || null; schedule();
      return;
    }
    await switchTo(docData.sections.indexOf(sec));
  }
  function dblclick(e) {
    const p = world(e), h = hit(p.x, p.y); if (!h) return;
    if (h.type === 'stamp' && !isTown() && ['town', 'city'].includes(st.stamps[h.i].k) && T) { townFor(st.stamps[h.i]); return; }
    if (h.type === 'label') { push(); addLabel(null, st.labels[h.i]); }
    if (h.type === 'pin') { const pin = st.pins[h.i]; if (pin.placeId && host.inBook && U.findNode(pin.placeId)) { close().then(() => U.openDoc(pin.placeId)); } else { push(); addPin(null, pin); } }
  }
  // ================================================================== LAYERS: bring forward / send back
  // Things of one kind are drawn in order (landmarks: nearer the bottom of the map in front, unless you've moved one).
  const LIST_OF = () => ({ stamp: 'stamps', pin: 'pins', label: 'labels', path: 'paths', box: 'boxes', ...(T ? T.LISTS : {}) });
  function reorder(how) {
    if (!sel) return;
    const key = LIST_OF()[sel.type], list = key && st[key]; if (!list || !list[sel.i]) return;
    push();
    if (sel.type === 'stamp') {
      const o = list[sel.i], zs = list.map(x => x.z || 0);
      if (how === 'front') o.z = Math.max(...zs) + 1; else if (how === 'back') o.z = Math.min(...zs) - 1;
      else o.z = (o.z || 0) + (how === 'up' ? 1 : -1);
    } else {
      const [o] = list.splice(sel.i, 1);
      const to = how === 'front' ? list.length : how === 'back' ? 0 : Math.max(0, Math.min(list.length, sel.i + (how === 'up' ? 1 : -1)));
      list.splice(to, 0, o); sel = { type: sel.type, i: to };
    }
    itemsDirty = true; changed(); schedule(); renderSelBar();
  }
  // a small bar over the map while something is selected: layers and delete (also on right-click, and [ ] keys)
  function renderSelBar() {
    const bar = view && view.querySelector('.mp-selbar'); if (!bar) return;
    const grp = !!(sel && sel.type === 'group');
    const show = !!(sel && (tool === 'select' || tool === 'marquee') && (grp || LIST_OF()[sel.type]));
    bar.classList.toggle('hidden', !show); bar.classList.toggle('grp', grp);
    const n = bar.querySelector('.mp-selcount'); if (n) n.textContent = grp ? (sel.items.length === 1 ? '1 thing selected' : `${sel.items.length} things selected`) : '';
  }
  function removeSel() {
    if (!sel) return; push();
    if (sel.type === 'group') {
      const by = {}; sel.items.forEach(s => (by[s.type] = by[s.type] || []).push(s.i));
      for (const [t, is] of Object.entries(by)) { const list = st[LIST_OF()[t]]; if (list) is.sort((a, b) => b - a).forEach(i => list.splice(i, 1)); }
      if (sel.ground) { mctx.globalCompositeOperation = 'destination-out'; mctx.drawImage(sel.ground, 0, 0); mctx.globalCompositeOperation = 'source-over'; landDirty = true; }
      sel = null; changed(); schedule(); renderSelBar(); return;
    }
    const list = { stamp: 'stamps', pin: 'pins', label: 'labels', path: 'paths', box: 'boxes', ...(T ? T.LISTS : {}) }[sel.type];
    st[list].splice(sel.i, 1); sel = null; changed(); schedule(); renderSelBar();
  }

  // ================================================================== A PICTURE OF ANY MAP (split view)
  // Draws another map document without touching the one open on screen: its pictures are read first, then the
  // drawing swaps the map in and back out in one go, so nothing on screen or in a save can see it in between.
  async function pictures(id) {
    let data = null; try { data = JSON.parse(await bookHost.read(id) || 'null'); } catch {}
    const secs = data && Array.isArray(data.sections) ? data.sections : [{ name: 'Main map', ...(data || {}) }];
    const ready = [];
    for (const sec of secs) {
      const s = Object.assign(blank(), sec); s.boxes = s.boxes || [];
      fillKind(s);
      const mk = document.createElement('canvas'); mk.width = MW; mk.height = MH; const mg = mk.getContext('2d', { willReadFrequently: true });
      if (s.land) { const im = new Image(); im.src = s.land; await im.decode().catch(() => {}); mg.drawImage(im, 0, 0); }
      ready.push({ s, mk, mg, name: sec.name || 'Map' });
    }
    const keep = { st, mask, mctx, landCache, landDirty, itemsDirty }, out = [];
    try {
      for (const r of ready) {
        st = r.s; mask = r.mk; mctx = r.mg; landCache = null; landDirty = true; syncT(); fogDirty = true;
        out.push({ name: r.name, canvas: picture(1) });
      }
    } finally { ({ st, mask, mctx, landCache, landDirty, itemsDirty } = keep); syncT(); fogDirty = true; baseKey = ''; }
    return out;
  }

  // ================================================================== SCREEN
  async function exportPNG(copy) {
    const c = picture(2);
    // copied straight from the click (Safari only allows that), through the PC app's own clipboard on a PC or Mac
    if (copy) return window.UnwipBuild ? window.UnwipBuild.copyCanvas(c, 'Map copied. Paste it into any chapter with Ctrl+V.') : null;
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    await api.exportBinary(new Uint8Array(await blob.arrayBuffer()), host.title(nodeId) || 'Map', 'png', 'PNG picture');
  }
  function syncGridBtn() {
    const b = view && $('#mp-grid', view), sel = view && $('#mp-gridsel', view); if (!b || !sel) return;
    const dg = isDungeon();
    b.classList.toggle('hidden', !dg); sel.classList.toggle('hidden', dg);
    b.classList.toggle('on', !st.noGrid); b.textContent = '▦ Grid'; b.dataset.tip = 'The square grid on the floor (one square is a room tile)';
    sel.value = gridMode();
  }
  // how far out you can zoom: to under a third of the map's fitted size (room to see frames and towns past the edge)
  function minZ() { const st2 = view && view.querySelector('.mp-stage'); if (!st2) return 0.12; const r = st2.getBoundingClientRect(); return Math.min(0.15, Math.min(r.width / W, r.height / H) * 0.3); }
  function fit() { const r = view.querySelector('.mp-stage').getBoundingClientRect(); const z = Math.min(r.width / W, r.height / H) * 0.96; cam = { z, x: (r.width - W * z) / 2, y: (r.height - H * z) / 2 }; }
  function resize() { if (!cv) return; const r = cv.parentElement.getBoundingClientRect(), dpr = window.devicePixelRatio || 1; cv.width = r.width * dpr; cv.height = r.height * dpr; cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px'; draw(); }
  function buildTools() {
    const box = view && $('.mp-toollist', view); if (!box) return;
    const list = (isTown() ? T.TOOLS : TOOLS).slice();
    if (!list.some(t => t[0] === 'marquee')) list.splice(list.findIndex(t => t[0] === 'select') + 1, 0, ['marquee', MARQ_ICON, MARQ_TIP]);
    box.innerHTML = list.map(([t, ic, tip]) => `<button class="mp-tool" data-t="${t}" data-tip="${esc(tip)}">${ic}</button>`).join('');
    $$('.mp-tool', box).forEach(b => b.onclick = () => setTool(b.dataset.t));
    const gen = $('#mp-gen', view); if (gen && isDungeon()) { gen.textContent = '🎲 Random floor…'; gen.dataset.tip = 'Roll a random dungeon floor: rooms, corridors, stairs, doors, a boss room and loot, from fixed rules and random numbers (no AI). You can edit everything after'; }
    else if (gen) { gen.textContent = isTown() ? '🎲 Random town…' : '🎲 Random map…'; gen.dataset.tip = isTown() ? 'Roll a random village, town or city: streets, buildings, walls and water, from fixed rules and random numbers (no AI). You can edit everything after' : 'Roll a random coastline, mountains, forests, rivers and towns, like rolling dice. Made by fixed rules and random numbers on this device, no AI. You can edit everything after'; }
    const clr = $('#mp-clear', view); if (clr) clr.dataset.tip = isDungeon() ? 'Start this floor again from solid rock' : isTown() ? 'Start this town again from empty ground' : 'Start this map section again from empty sea';
  }
  let markK = 'waypoint', fogOn = true;
  function marqOpts(o) {
    o.classList.remove('hidden');
    o.innerHTML = (isDungeon() ? '' : `<button type="button" class="chip ${takeGround ? 'on' : ''}" data-tg="1" title="Also move the ${isTown() ? 'water' : 'land'} inside the box">Take the ${isTown() ? 'water' : 'land'} too</button>`) + '<span class="mp-opt-h mp-marq-h">Drag a box round things, then drag them to move them together</span>';
    const b = o.querySelector('[data-tg]'); if (b) b.onclick = () => { takeGround = !takeGround; marqOpts(o); };
  }
  function syncFogBar() { const o = view && $('#mp-opts', view); if (o && tool === 'fog') commonOpts('fog', o); }
  function commonOpts(t, o) {
    o.classList.remove('hidden');
    if (t === 'mark') o.innerHTML = MARKS.map(([v, l]) => `<button type="button" class="chip ${markK === v ? 'on' : ''}" data-mk="${v}">${l}</button>`).join('');
    else o.innerHTML = `<button type="button" class="chip ${fogOn ? 'on' : ''}" data-fog="1">Cover</button><button type="button" class="chip ${fogOn ? '' : 'on'}" data-fog="0">Reveal</button><span class="mp-opt-sep"></span><button type="button" class="chip" data-fa="cover">Cover all</button><button type="button" class="chip" data-fa="clear">Clear all fog</button><button type="button" class="chip ${st.fogHide ? '' : 'on'}" data-fa="show">${st.fogHide ? 'Fog hidden' : 'Fog shown'}</button>`;
    o.querySelectorAll('[data-mk]').forEach(b => b.onclick = () => { markK = b.dataset.mk; commonOpts(t, o); });
    o.querySelectorAll('[data-fog]').forEach(b => b.onclick = () => { fogOn = b.dataset.fog === '1'; commonOpts(t, o); });
    o.querySelectorAll('[data-fa]').forEach(b => b.onclick = () => { const a = b.dataset.fa; push(); if (a === 'cover') { st.fog = [{ all: 1, on: true }]; st.fogHide = false; } else if (a === 'clear') st.fog = []; else st.fogHide = !st.fogHide; fogDirty = true; changed(); schedule(); commonOpts(t, o); });
  }
  function setTool(t) { tool = t;
    if (sel && sel.type === 'group' && t !== 'select' && t !== 'marquee') sel = null;
    { const o = view && $('#mp-opts', view); if (o) { if (t === 'mark' || t === 'fog') commonOpts(t, o); else if (t === 'marquee') marqOpts(o); else if (isTown()) T.optionsBar(t, o); else { o.innerHTML = ''; o.classList.add('hidden'); } } } if (t === 'frame' && sel && sel.type === 'box') { sel = null; if (cv) redraw(); } $$('.mp-tool', view).forEach(b => b.classList.toggle('on', b.dataset.t === t)); cv.style.cursor = t === 'select' ? 'default' : 'crosshair'; renderSelBar(); if (cv) redraw(); $('.mp-brush', view).classList.toggle('dim', t === 'fog' ? false : isTown() ? !T.brushy(t) && t !== 'water' : !['land', 'water', 'forest', 'mountain', 'hill'].includes(t)); syncFrameSelect(); }
  // a small picture of the map, for the Build page
  function thumb() {
    if (!st || !mask) return '';
    try { const c = document.createElement('canvas'); c.width = 320; c.height = 220; const g = c.getContext('2d'); g.scale(320 / W, 220 / H); renderAll(g, STYLES[st.style] || STYLES.parchment); baseKey = ''; return c.toDataURL('image/jpeg', 0.8); } catch { return ''; }
  }
  async function open(id, h) {
    await close(true);
    // labels are drawn with the bundled fonts: load them first, or the first drawing falls back to the computer's own
    try { await Promise.all(['15px Bookhaven', '600 15px Bookhaven', 'italic 15px Bookhaven', '15px "IBM Plex Mono"', '600 15px "IBM Plex Mono"'].map(f => document.fonts.load(f))); } catch {}
    host = h || bookHost;
    nodeId = id; await load(id); edited = false; openedActive = docData.active;
    view = document.createElement('div'); view.className = 'mp-view';
    view.innerHTML = `<div class="mp-top">
        <button class="icon-btn" id="mp-close" data-tip="Close the map">${I.back}</button><b class="mp-title">${esc(host.title(id) || 'Map')}</b><span class="mp-saved" id="mp-saved">Saved</span>
        <span class="mp-sp"></span>
        ${host.inBook === false ? '<button class="st-proof rec-btn" type="button" title="Record: a replay of your writing, or a screen video (proof of writing)"></button>' : ''}
        <button class="btn small" id="mp-gen" data-tip="Roll a random coastline, mountains, forests, rivers and towns, like rolling dice. Made by fixed rules and random numbers on this device, no AI. You can edit everything after">🎲 Random map…</button>
        <select id="mp-style" data-tip="Map style">${Object.entries(STYLES).map(([k, v]) => `<option value="${k}" ${st.style === k ? 'selected' : ''}>${v.name}</option>`).join('')}</select>
        <button class="btn small ghost" id="mp-grid" data-tip="The square grid on the floor">▦ Grid</button>
        <select id="mp-gridsel" data-tip="A grid over the map: hexagons (for travel and games) or squares"><option value="">No grid</option><option value="hex">⬡ Hex grid</option><option value="square">▦ Square grid</option></select>
        <button class="btn small ghost ${st.compass ? 'on' : ''}" id="mp-compass" data-tip="Compass rose">🧭</button>
        <select id="mp-frame" data-tip="The border around the edge of the map">${Object.entries(FRAMES).map(([k, v]) => `<option value="${k}" ${(st.frame || 'double') === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <button class="btn small ghost" id="mp-clear" data-tip="Start this map section again from empty sea">Clear</button>
        <button class="icon-btn small" id="mp-undo" data-tip="Undo (Ctrl+Z)">↶</button><button class="icon-btn small" id="mp-redo" data-tip="Redo (Ctrl+Y)">↷</button>
        <button class="btn small ghost" id="mp-copy" data-tip="Copy the map as a picture, ready to paste into a chapter">Copy picture</button>
        <button class="btn small ghost" id="mp-png" data-tip="Save as a PNG picture (high resolution)">Save PNG…</button>
        <button class="btn primary small mp-end" id="mp-done" data-tip="${host.inBook === false ? 'Save and go back to Build' : 'Save and go back to your chapter'}">Done</button>
      </div>
      <div class="mp-tabs" id="mp-tabs"></div>
      <div class="mp-body"><div class="mp-tools"><div class="mp-toollist"></div>
        <div class="mp-brush" data-tip="Brush size: how big the land, water, forest and mountain brushes paint"><span class="mp-brush-ic">🖌️</span><input type="range" id="mp-size" min="4" max="60" value="${brush}" orient="vertical"><span class="mp-brush-n" id="mp-size-n">${brush}</span></div></div>
        <div class="mp-stage"><canvas></canvas><div class="mp-opts hidden" id="mp-opts"></div><div class="mp-selbar hidden"><span class="mp-selcount"></span><button type="button" class="btn small" data-layer="front" title="Bring to front (Shift+])">⇈<span class="mp-sl"> Front</span></button><button type="button" class="btn small" data-layer="up" title="Bring forward (])">↑<span class="mp-sl"> Forward</span></button><button type="button" class="btn small" data-layer="down" title="Send backward ([)">↓<span class="mp-sl"> Backward</span></button><button type="button" class="btn small" data-layer="back" title="Send to back (Shift+[)">⇊<span class="mp-sl"> Back</span></button><button type="button" class="btn small ghost" data-layer="del" title="Delete">🗑</button></div><div class="mp-hint">Scroll to zoom · drag empty space to move around · double-click a pin or label to edit it</div></div></div>`;
    host.mount(view);
    if (window.UnwipProof && window.UnwipProof.renderStatus) window.UnwipProof.renderStatus();   // fill in the Record button (or the timer if a video is going)
    cv = $('canvas', view); ctx = cv.getContext('2d');
    buildTools(); resize(); fit(); setTool('select'); syncGridBtn(); draw();
    // touch screens: one finger uses the tool, two fingers pinch to zoom and drag to move around (a stroke the first
    // finger had just started is taken back, so a pinch never leaves a stray mark)
    const touches = new Map(); let pinch = null;
    const two = () => { const [a, b] = [...touches.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
    cv.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch') {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touches.size >= 2) {
          if (!pinch) {
            const busy = !!((T && T.busy) || (drawing && !drawing.pan && !drawing.marq && !(drawing.move && !drawing.live)));
            if (T && T.busy && T.cancel) T.cancel();
            drawing = null;
            if (busy) { const last = undo.pop(); if (last) restore(last); }
            const m = two(); pinch = { d0: m.d, z0: cam.z, x0: m.x, y0: m.y, cx: cam.x, cy: cam.y }; autoFitOff();
          }
          return;
        }
      }
      if (pinch) return;
      pointerDown(e);
    });
    cv.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch' && touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch) {
        if (touches.size < 2) return;
        const m = two(), r = cv.getBoundingClientRect(), z = Math.min(4, Math.max(minZ(), pinch.z0 * m.d / pinch.d0));
        const wx = (pinch.x0 - r.left - pinch.cx) / pinch.z0, wy = (pinch.y0 - r.top - pinch.cy) / pinch.z0;
        cam.z = z; cam.x = m.x - r.left - wx * z; cam.y = m.y - r.top - wy * z; redraw(); return;
      }
      pointerMove(e);
    });
    const lift = e => { touches.delete(e.pointerId); if (e.pointerType === 'touch' && hover) { hover = null; redraw(); } if (pinch) { if (!touches.size) pinch = null; return; } pointerUp(e); };
    window.addEventListener('pointerup', lift); window.addEventListener('pointercancel', lift);
    // the brush outline goes when the pointer leaves the map (a finger has no hover, so it goes when the finger lifts)
    cv.addEventListener('pointerleave', () => { if (hover) { hover = null; redraw(); } });
    view.addEventListener('gesturestart', e => e.preventDefault());   // Safari's own page zoom
    cv.addEventListener('wheel', wheel, { passive: false }); cv.addEventListener('dblclick', dblclick);
    view.querySelector('.mp-selbar').addEventListener('click', e => { const b = e.target.closest('[data-layer]'); if (!b) return; if (b.dataset.layer === 'del') removeSel(); else reorder(b.dataset.layer); });
    cv.addEventListener('contextmenu', e => {
      const p = world(e), h = hit(p.x, p.y); if (!h || !LIST_OF()[h.type]) return;
      e.preventDefault(); sel = h; setTool('select'); redraw();
      U.showMenu(e.clientX, e.clientY, [
        { label: 'Bring to front', action: () => reorder('front') }, { label: 'Bring forward', action: () => reorder('up') },
        { label: 'Send backward', action: () => reorder('down') }, { label: 'Send to back', action: () => reorder('back') },
        { sep: true }, { label: 'Delete', danger: true, action: () => removeSel() }]);
    });
    let autoFit = true; const autoFitOff = () => { autoFit = false; };
    new ResizeObserver(() => { if (!view) return; if (autoFit) fit(); resize(); }).observe($('.mp-stage', view));
    cv.addEventListener('pointerdown', () => { autoFit = false; }); cv.addEventListener('wheel', () => { autoFit = false; });
    buildTools();
    $('#mp-size', view).oninput = e => { brush = +e.target.value; $('#mp-size-n', view).textContent = brush; redraw(); };
    $('#mp-close', view).onclick = () => close();
    $('#mp-done', view).onclick = () => close();   // the same as ‹, where the other Build editors have Done
    $('#mp-style', view).onchange = e => { push(); st.style = e.target.value; landDirty = true; changed(); schedule(); };
    // the Grid button: a hex grid on world and town maps; on a dungeon floor, its square grid on or off
    $('#mp-grid', view).onclick = () => { push(); st.noGrid = !st.noGrid; syncGridBtn(); baseKey = ''; landDirty = true; changed(); schedule(); };
    $('#mp-gridsel', view).onchange = e => { push(); st.grid = e.target.value || false; syncGridBtn(); baseKey = ''; landDirty = true; changed(); schedule(); };
    $('#mp-compass', view).onclick = e => { push(); st.compass = !st.compass; e.currentTarget.classList.toggle('on', st.compass); changed(); schedule(); };
    $('#mp-frame', view).onchange = e => {
      const v = e.target.value, box = sel && sel.type === 'box' && st.boxes[sel.i];
      if (box) { push(); if (v === 'none') { st.boxes.splice(sel.i, 1); sel = null; } else { box.f = v; boxStyle = v; } }
      else if (tool === 'frame') { if (v !== 'none') boxStyle = v; return syncFrameSelect(); }
      else { push(); st.frame = v; }
      changed(); schedule(); };
    $('#mp-clear', view).onclick = async () => {
      if (!await U.confirmBox('Clear this map?', isDungeon() ? 'Removes all rooms, corridors, features, markers, labels and pins from this floor. Undo (Ctrl+Z) brings it back.' : isTown() ? 'Removes all streets, buildings, walls, water, areas, landmarks, labels and pins from this section. Undo (Ctrl+Z) brings it back.' : 'Removes all land, forests, towns, roads, labels and pins from this section. Undo (Ctrl+Z) brings it back.', 'Clear the map')) return;
      push(); const keep = { name: st.name, style: st.style, grid: st.grid, compass: st.compass, frame: st.frame, kind: st.kind || 'world' };
      Object.keys(st).forEach(k => delete st[k]); Object.assign(st, blank(keep.style, keep.kind), keep);
      mctx.clearRect(0, 0, MW, MH); landDirty = true; sel = null; changed(); schedule();
    };
    renderTabs();
    $('#mp-undo', view).onclick = () => { if (undo.length) { redo.push(snapshot()); restore(undo.pop()); } };
    $('#mp-redo', view).onclick = () => { if (redo.length) { undo.push(snapshot()); restore(redo.pop()); } };
    $('#mp-copy', view).onclick = () => exportPNG(true);
    $('#mp-png', view).onclick = () => exportPNG(false);
    $('#mp-gen', view).onclick = async () => {
      if (isTown()) return T.randomDialog();
      let el;
      const hasLand = !!maskData();
      const kind = await U.modal({ title: 'Random map', onOpen: x => { el = x; },
        body: `<p>Rolls random land with mountains, forests, rivers, towns and made-up names, using fixed rules and random numbers (like dice), not AI. Undo brings back what was there.</p>
          <div class="chip-row" id="mp-gen-mode" style="margin-top:8px"><button type="button" class="chip ${hasLand ? 'on' : ''}" data-v="add">Add it to this map (keep what’s here)</button><button type="button" class="chip ${hasLand ? '' : 'on'}" data-v="replace">Replace this map</button></div>`,
        buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Islands', value: 'archipelago', kind: 'ghost' }, { label: 'Continent', value: 'continent', kind: 'ghost' }, { label: 'One island', value: 'island', kind: 'primary' }] });
      if (!kind) return;
      const mode = el && el.querySelector('#mp-gen-mode .chip.on');
      generate(kind, !!(mode && mode.dataset.v === 'add' && hasLand));
    };
    document.addEventListener('click', e => { const c = e.target.closest && e.target.closest('#mp-gen-mode .chip'); if (c) { c.parentElement.querySelectorAll('.chip').forEach(x => x.classList.remove('on')); c.classList.add('on'); } });
    document.addEventListener('keydown', keys, true);
    if (isDungeon()) { if (!/1/.test(st.cells || '')) hintToast = U.toast('An empty floor of solid rock. Try 🎲 Random floor… for a starting point, or drag out rooms and corridors.', '', 7000); }
    else if (isTown() ? !st.streets.length && !st.buildings.length : !st.land && !st.stamps.length) hintToast = U.toast(isTown() ? 'An empty town. Try 🎲 Random town… for a starting point, or draw streets and click between them to fill in buildings.' : 'A blank map. Try 🎲 Random map… for a starting point, or paint land with 🟫.', '', 7000);
  }
  // ---- sections: several maps inside one (the world, a region, a city…)
  function renderTabs() {
    const box = $('#mp-tabs', view); if (!box) return;
    box.innerHTML = docData.sections.map((x, i) => `<button class="mp-tab ${i === docData.active ? 'on' : ''}" data-i="${i}" data-tip="${x.kind === 'town' ? 'Town map. ' : x.kind === 'dungeon' ? 'Dungeon floor. ' : ''}Double-click to rename, right-click for more">${x.kind === 'town' ? '🏘️ ' : x.kind === 'dungeon' ? '🕳️ ' : ''}${esc(x.name || 'Map ' + (i + 1))}</button>`).join('') +
      `<button class="mp-tab add" id="mp-add-sec" data-tip="Add another map section: a region close-up, a city, another continent…">+ Section</button>`;
    $$('.mp-tab[data-i]', box).forEach(b => {
      const i = +b.dataset.i;
      b.onclick = async () => { if (i === docData.active) return; await switchTo(i); };
      b.ondblclick = () => renameSection(i);
      b.oncontextmenu = e => { e.preventDefault(); U.showMenu(e.clientX, e.clientY, [
        { label: 'Rename…', action: () => renameSection(i) },
        { label: 'Duplicate', action: () => addSection('copy', i) },
        { label: 'Move left', action: () => moveSection(i, -1) }, { label: 'Move right', action: () => moveSection(i, 1) },
        { sep: true }, { label: 'Delete this section…', action: () => deleteSection(i) }]); };
    });
    $('#mp-add-sec', box).onclick = () => addSection();
  }
  async function switchTo(i) { await useSection(i); syncControls(); renderTabs(); baseKey = ''; changed(); schedule(); }
  function syncControls() {
    const v = view; if (!v) return;
    $('#mp-style', v).value = st.style; $('#mp-frame', v).value = st.frame || 'double';
    buildTools(); setTool(tool && $$('.mp-tool', v).some(b => b.dataset.t === tool) ? tool : 'select');
    syncGridBtn(); $('#mp-compass', v).classList.toggle('on', !!st.compass);
  }
  async function renameSection(i) {
    const name = await U.promptText('Rename section', 'Name', docData.sections[i].name || ''); if (!name) return;
    docData.sections[i].name = name.trim(); renderTabs(); schedule();
  }
  function moveSection(i, d) {
    const j = i + d; if (j < 0 || j >= docData.sections.length) return;
    st.land = maskData();
    const [x] = docData.sections.splice(i, 1); docData.sections.splice(j, 0, x);
    docData.active = docData.sections.indexOf(st); renderTabs(); schedule();
  }
  async function deleteSection(i) {
    if (docData.sections.length === 1) { U.toast('A map needs at least one section. Use Clear to empty it instead.'); return; }
    if (!await U.confirmBox('Delete this section?', `“${esc(docData.sections[i].name)}” and everything on it will be removed.`, 'Delete section')) return;
    docData.sections.splice(i, 1);
    st = null; await useSection(Math.min(i, docData.sections.length - 1)); syncControls(); renderTabs(); baseKey = ''; changed(); schedule();
  }
  async function addSection(how, from, opts = {}) {
    let el;
    if (!how) {
      let kind = opts.kind || (T ? null : 'world');
      if (!kind) kind = await U.modal({ title: 'New map section', body: '<p>What kind of map?</p>', buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, ...(DG ? [{ label: '🕳️ Dungeon floor', value: 'dungeon', kind: 'ghost' }] : []), { label: '🏘️ Town or city', value: 'town', kind: 'ghost' }, { label: '🗺️ World or region', value: 'world', kind: 'primary' }] });
      if (!kind) return;
      if (kind === 'dungeon') how = await U.modal({ title: 'New dungeon floor', onOpen: x => { el = x; x.querySelector('#ms-name').value = opts.name || `Floor ${docData.sections.filter(z => z.kind === 'dungeon').length + 1}`; },
        body: '<div class="field"><label>Name</label><input id="ms-name" placeholder="e.g. Floor 2, the Cistern"></div><p class="hint" style="margin-top:8px">Start from solid rock, or roll a floor of rooms and corridors to work from (🎲 no AI).</p>',
        buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Empty', value: 'dblank', kind: 'ghost' }, { label: 'Small', value: 'dsmall', kind: 'ghost' }, { label: 'Medium', value: 'dmedium', kind: 'ghost' }, { label: 'Large', value: 'dlarge', kind: 'primary' }] });
      if (kind === 'dungeon') { if (!how) return; }
      else how = await U.modal({ title: kind === 'town' ? 'New town map' : 'New map section', onOpen: x => { el = x; if (opts.name) x.querySelector('#ms-name').value = opts.name; },
        body: `<div class="field"><label>Name</label><input id="ms-name" placeholder="${kind === 'town' ? 'e.g. Brackwell, Saltby, the Old Port' : 'e.g. The North Downs'}"></div><p class="hint" style="margin-top:8px">${kind === 'town' ? 'Start it empty, or roll a village, town or city to work from (🎲 no AI).' : 'Start it empty, or generate land to work from.'}</p>`,
        buttons: kind === 'town' ? [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Empty', value: 'tblank', kind: 'ghost' }, { label: 'Village', value: 'village', kind: 'ghost' }, { label: 'Town', value: 'town', kind: 'ghost' }, { label: 'City', value: 'city', kind: 'primary' }]
          : [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Empty', value: 'blank', kind: 'ghost' }, { label: 'Islands', value: 'archipelago', kind: 'ghost' }, { label: 'Continent', value: 'continent', kind: 'ghost' }, { label: 'One island', value: 'island', kind: 'primary' }] });
      if (!how) return;
    }
    st.land = maskData();
    const name = how === 'copy' ? `${docData.sections[from].name} (copy)` : ((el && el.querySelector('#ms-name').value.trim()) || opts.name || `Section ${docData.sections.length + 1}`);
    const townKind = ['tblank', 'village', 'town', 'city'].includes(how), dunKind = /^d(blank|small|medium|large)$/.test(how);
    const sec = how === 'copy' ? JSON.parse(JSON.stringify(docData.sections[from])) : blank(st.style, townKind ? 'town' : dunKind ? 'dungeon' : 'world');
    sec.name = name; sec.id = U.uid();
    if (how === 'copy') sec.id = U.uid();
    docData.sections.push(sec);
    await useSection(docData.sections.length - 1); syncControls(); renderTabs(); baseKey = '';
    if (dunKind) { if (how !== 'dblank') DG.generate(how.slice(1)); else { changed(); schedule(); } }
    else if (townKind) { if (how !== 'tblank') T.generate(how); else { changed(); schedule(); } }
    else if (how !== 'copy' && how !== 'blank') generate(how); else { changed(); schedule(); }
    undo = [];
    return sec;
  }
  function keys(e) {
    if (!view || document.querySelector('.modal-back')) return;
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); e.stopPropagation(); $('#mp-undo', view).click(); }
    else if (ctrl && e.key.toLowerCase() === 'y') { e.preventDefault(); e.stopPropagation(); $('#mp-redo', view).click(); }
    else if (!ctrl && !e.altKey && (e.key === ']' || e.key === '[' || e.key === '}' || e.key === '{') && sel) { e.preventDefault(); e.stopPropagation(); const fwd = e.key === ']' || e.key === '}'; reorder(e.shiftKey || e.key === '}' || e.key === '{' ? (fwd ? 'front' : 'back') : (fwd ? 'up' : 'down')); }
    else if (!ctrl && !e.altKey && (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '_') && resizable(sel)) { e.preventDefault(); e.stopPropagation(); push(); scaleSel(e.key === '-' || e.key === '_' ? 1 / 1.15 : 1.15); changed(); schedule(); }
    else if (!ctrl && !e.altKey && e.key.toLowerCase() === 'r' && resizable(sel)) { e.preventDefault(); e.stopPropagation(); push(); const step = (e.shiftKey ? -1 : 1) * Math.PI / 12, sh = shape(sel);
      if (sh) placePts(sh, sh.pts, shapeMid(sh), step, 1); else { const o = turnable(sel); o.rot = snapAngle((o.rot || 0) + step); if (!o.rot) delete o.rot; } changed(); schedule(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); e.stopPropagation(); removeSel(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (sel) { sel = null; redraw(); } else close(); }
  }
  let hintToast = null;
  async function close(quiet) {
    if (hintToast) { hintToast.remove(); hintToast = null; }
    if (!view) return;
    if (edited || saveT || (docData && docData.active !== openedActive)) await saveNow();
    document.removeEventListener('keydown', keys, true); window.removeEventListener('pointerup', pointerUp);
    view.remove(); view = null; cv = null; ctx = null; nodeId = null;
    const h = host; host = bookHost; h.unmount();
  }
  async function create(parentId) {
    let kind = 'world';
    if (TW) { kind = await U.modal({ title: 'New map', body: '<p>What kind of map?</p><p class="hint">A <b>world or region</b> map has coastlines, mountains, forests and towns. A <b>town or city</b> map has streets, buildings and walls. A <b>dungeon floor</b> is a grid of rooms and corridors, with stairs, doors and traps. One map can hold all three: add sections (floors, a city, a region) with “+ Section”.</p>', buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, ...(DG ? [{ label: '🕳️ Dungeon floor', value: 'dungeon', kind: 'ghost' }] : []), { label: '🏘️ Town or city', value: 'town', kind: 'ghost' }, { label: '🗺️ World or region', value: 'world', kind: 'primary' }] }); if (!kind) return; }
    const title = await U.promptText('New map', 'Name of the map', kind === 'town' ? 'Map of the city' : kind === 'dungeon' ? 'The dungeon' : 'Map of the world'); if (!title) return;
    // like a new document: inside the chosen folder, or (nothing chosen) at the bottom of the binder, under
    // "New — drag into place"
    const f = parentId ? U.findNode(parentId) : null;
    const node = { id: U.uid(), type: 'doc', title, words: 0, map: true, icon: '🗺️' };
    if (f) { (f.node.children = f.node.children || []).push(node); f.node.open = true; } else S.project.binder.push(node);
    await api.saveDoc(S.slug, node.id, JSON.stringify(kind === 'dungeon' ? { v: 2, active: 0, sections: [{ name: 'Floor 1', ...blank('parchment', kind) }] } : blank('parchment', kind)));
    U.scheduleMeta(); U.renderBinder();
    U.openDoc(node.id);
  }
  // what town.js needs from here
  const shade = (hex, amt) => { const n = parseInt(hex.slice(1), 16); const f = c => Math.max(0, Math.min(255, Math.round(c + (amt > 0 ? (255 - c) * amt : c * amt)))); return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map(v => v.toString(16).padStart(2, '0')).join(''); };
  const MOD = {
    W, H, MW, MH, K, STYLES, U, rng, noise2, fbm, name, shade,
    get st() { return st; }, get mask() { return mask; }, get mctx() { return mctx; }, get brush() { return brush; },
    paint: (x, y, on, from) => paint(x, y, on, from), push: () => push(), changed: () => changed(), schedule: () => schedule(), redraw: () => redraw(),
    undoPop: () => undo.pop(), select: s => { sel = s; }, skips, selectGroup, viewCentre, hasContent, landDirty: () => { landDirty = true; baseKey = ''; }, toast: (m, k) => U.toast(m, k || '', 6000)
  };
  if (window.UnwipTownFactory) TW = window.UnwipTownFactory(MOD);
  if (window.UnwipDungeonFactory) DG = window.UnwipDungeonFactory(MOD);
  T = TW;
  const bookOnly = () => { if (host.inBook) close(true); };
  U.on('leave', bookOnly); U.on('doc', bookOnly); U.on('view', bookOnly);
  // anything still waiting to be saved, saved now (Sync calls this first)
  const flush = async () => { if (view && (edited || saveT)) await saveNow(); };
  return { open, create, flush, thumb, placeName: () => name(Math.random), blank: (style, kind) => blank(style, kind), close, pictures, townGen: (k, o) => T && T.generate(k, o), picture, selectGroup, get sel() { return sel; }, get tool() { return tool; }, setTool: t => setTool(t), removeSel, fillBlock: (x, y, d) => isTown() && T.fillBlock ? T.fillBlock(x, y, d) : 0, dungeonGen: k => isDungeon() && DG.generate(k), generate: (k, add) => generate(k, add), addSection, switchTo, get state() { return st; }, get doc() { return docData; }, get cam() { return cam; }, labelBox: i => st.labels[i] ? labelBox(st.labels[i]) : null, handles: () => ({ turn: handle(), size: sizeHandle() }) };
})();
