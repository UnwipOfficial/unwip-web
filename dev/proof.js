// Unwip - Proof of writing. Two ways for writers to show how a book was written:
//   Replay        Unwip notes every change made in the book while it's on (typing, deleting, pasting, with the time).
//                 Small files, kept with the book. Play it back, save a report anyone can open (it carries the replay
//                 and shows what was typed and what was pasted), or turn it into a timelapse video.
//   Screen video  Records Unwip's window as a video file, like a screen recorder. Big files, so it says so first.
// Nothing is uploaded anywhere: recordings stay with the book (and in Dropbox if the book is there).
window.UnwipProof = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return;
  const { $, $$, S, api, esc, fmt } = U;
  const editor = U.editor;

  // ================================================================== THE REPLAY ENGINE
  // Pure functions (no outside references): the app uses them, and the saved report carries copies of them.
  // An event is [t (ms from the session start), doc id, kind, position, characters removed, text inserted, duration]
  // kinds: b = the chapter as it was when recording began, r = the chapter had changed while not being watched,
  //        t = typed, e = erased with the keyboard, p = pasted, d = dropped in, c = cut, u = undo/redo,
  //        x = changed by one of Unwip's tools (find & replace and the like)
  function pfPrep(sessions, gap) {
    const GAP = gap || 3000, ev = [], titles = {};
    let vt = 0, prevEnd = null;
    sessions.slice().sort((a, b) => a.started - b.started).forEach((s, si) => {
      Object.assign(titles, s.titles || {});
      for (const e of s.ev || []) {
        const at = s.started + e[0], dur = e[6] || 0;
        if (prevEnd != null) vt += Math.min(Math.max(0, at - prevEnd), GAP);
        ev.push({ at: at, vt: vt, doc: e[1], k: e[2], pos: e[3], del: e[4], ins: e[5] || '', dur: dur, s: si });
        vt += dur; prevEnd = at + dur;
      }
    });
    return { ev: ev, total: vt, titles: titles };
  }
  function pfApply(docs, e) {
    if (e.k === 'b' || e.k === 'r') { docs[e.doc] = e.ins; return; }
    const t = docs[e.doc] || '';
    docs[e.doc] = t.slice(0, e.pos) + e.ins + t.slice(e.pos + e.del);
  }
  function pfWords(s) { return (String(s).match(/[A-Za-z0-9À-ɏЀ-ӿ']+/g) || []).length; }
  function pfStats(sessions) {
    const all = { typedWords: 0, typedChars: 0, pastedWords: 0, pastedChars: 0, pastes: [], erased: 0, tools: 0, toolChars: 0, resync: 0, active: 0, sessions: [] };
    sessions.slice().sort((a, b) => a.started - b.started).forEach(s => {
      const r = { id: s.id, started: s.started, ended: s.started, device: s.device || '', active: 0, typedWords: 0, typedChars: 0, pastedWords: 0, pastedChars: 0, pastes: 0, erased: 0, tools: 0, resync: 0, docs: {} };
      let prevEnd = null, typed = '', lastDoc = null, lastEnd = -1;
      for (const e of s.ev || []) {
        const at = s.started + e[0], dur = e[6] || 0, k = e[2], ins = e[5] || '';
        if (prevEnd != null) r.active += Math.min(Math.max(0, at - prevEnd), 120000);
        r.active += dur; prevEnd = at + dur; r.ended = Math.max(r.ended, at + dur);
        if (k !== 'b') r.docs[e[1]] = 1;
        if (k === 't') { r.typedChars += ins.length; typed += (e[1] === lastDoc && e[3] === lastEnd ? '' : ' ') + ins; lastDoc = e[1]; lastEnd = e[3] + ins.length; r.erased += e[4]; }
        else if (k === 'e' || k === 'c') r.erased += e[4];
        else if (k === 'p' || k === 'd') { r.pastes++; r.pastedChars += ins.length; r.pastedWords += pfWords(ins); all.pastes.push({ at: at, doc: e[1], chars: ins.length, words: pfWords(ins), kind: k, preview: ins.slice(0, 160) }); }
        else if (k === 'x') { r.tools++; all.toolChars += ins.length; }
        else if (k === 'r') r.resync++;
      }
      r.typedWords = pfWords(typed);
      ['typedWords', 'typedChars', 'pastedWords', 'pastedChars', 'erased', 'resync', 'active'].forEach(f => all[f] += r[f]);
      all.tools += r.tools; r.chapters = Object.keys(r.docs).length;
      all.sessions.push(r);
    });
    return all;
  }
  // the text around the writing point, as paragraphs, with the newest change marked and a caret after it
  function pfView(text, pos, len, kind) {
    const e = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    pos = Math.max(0, Math.min(pos, text.length)); len = Math.max(0, Math.min(len, text.length - pos));
    const paras = text.split('\n'); let off = 0, at = 0;
    for (let i = 0; i < paras.length; i++) { if (pos <= off + paras[i].length) { at = i; break; } off += paras[i].length + 1; at = i; }
    const from = Math.max(0, at - 30), to = Math.min(paras.length, at + 12);
    let o = 0; for (let i = 0; i < from; i++) o += paras[i].length + 1;
    let html = from > 0 ? '<p class="pf-more">…</p>' : '';
    for (let i = from; i < to; i++) {
      const p = paras[i], a = o, b = o + p.length; let inner;
      const ms = Math.max(pos, a), me = Math.min(pos + len, b), caret = pos + len;
      if (caret >= a && caret <= b) {
        const mark = len && me > ms ? '<span class="pf-mark pf-' + kind + '">' + e(p.slice(ms - a, me - a)) + '</span>' : '';
        inner = e(p.slice(0, (mark ? ms : caret) - a)) + mark + '<span class="pf-caret" id="pf-caret"></span>' + e(p.slice(caret - a));
      } else if (len && me > ms) inner = e(p.slice(0, ms - a)) + '<span class="pf-mark pf-' + kind + '">' + e(p.slice(ms - a, me - a)) + '</span>' + e(p.slice(me - a));
      else inner = e(p);
      html += '<p>' + (inner || '<br>') + '</p>';
      o = b + 1;
    }
    if (to < paras.length) html += '<p class="pf-more">…</p>';
    return html;
  }
  // a player in any element: play / pause, speed, a slider through the whole replay, the chapter and the time
  function pfPlayer(root, sessions, F) {
    const data = F.pfPrep(sessions), ev = data.ev;
    root.innerHTML = '<div class="pf-top"><b class="pf-ch"></b><span class="pf-when"></span><span class="pf-wc"></span></div>' +
      '<div class="pf-page"><div class="pf-text"></div></div>' +
      '<div class="pf-ctrl"><button class="pf-play" type="button">▶ Play</button><select class="pf-speed"><option value="1">1×</option><option value="4">4×</option><option value="16" selected>16×</option><option value="64">64×</option><option value="256">256×</option></select>' +
      '<input class="pf-seek" type="range" min="0" max="1000" value="0"><span class="pf-time"></span></div>' +
      '<div class="pf-legend"><span><i class="pf-key pf-t"></i>typed</span><span><i class="pf-key pf-p"></i>pasted or dropped in</span><span><i class="pf-key pf-x"></i>changed by an Unwip tool</span><span class="pf-note">Pauses longer than 3 seconds are shortened.</span></div>';
    const q = c => root.querySelector(c);
    if (!ev.length) { q('.pf-text').innerHTML = '<p>Nothing was written while this was recording.</p>'; return { stop: function () {} }; }
    const KF = []; { const d = {}; for (let i = 0; i < ev.length; i++) { if (i % 400 === 0) KF.push({ i: i, docs: Object.assign({}, d) }); F.pfApply(d, ev[i]); } }
    let docs = {}, i = 0, vnow = 0, playing = false, last = 0, raf = 0;
    const fmtT = ms => { const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
    function seek(v) {
      vnow = Math.max(0, Math.min(v, data.total));
      let k = KF[0]; for (const f of KF) { if (f.i < ev.length && ev[f.i].vt <= vnow) k = f; else break; }
      docs = Object.assign({}, k.docs); i = k.i;
      while (i < ev.length && ev[i].vt + ev[i].dur <= vnow) F.pfApply(docs, ev[i++]);
      draw();
    }
    function draw() {
      const e = i < ev.length && ev[i].vt <= vnow ? ev[i] : ev[Math.max(0, i - 1)];
      let text, pos, len = 0, kind = e.k === 'd' ? 'p' : e.k;
      if (e === ev[i] && e.k === 't' && e.dur) {           // part-way through a run of typing
        const n = Math.ceil(e.ins.length * Math.min(1, (vnow - e.vt) / e.dur)), t = docs[e.doc] || '';
        text = t.slice(0, e.pos) + e.ins.slice(0, n) + t.slice(e.pos + e.del); pos = e.pos + n;
      } else {
        text = docs[e.doc] || '';
        if (e.k === 'b' || e.k === 'r') pos = 0;
        else if (kind === 'p' || kind === 'x' || kind === 'u') { pos = e.pos; len = e.ins.length; }
        else pos = e.pos + e.ins.length;
      }
      q('.pf-text').innerHTML = F.pfView(text, pos, len, kind);
      q('.pf-ch').textContent = data.titles[e.doc] || 'Chapter';
      q('.pf-when').textContent = new Date(e.at).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
      q('.pf-wc').textContent = F.pfWords(text).toLocaleString() + ' words';
      q('.pf-seek').value = String(Math.round(1000 * vnow / Math.max(1, data.total)));
      q('.pf-time').textContent = fmtT(vnow) + ' / ' + fmtT(data.total);
      const c = root.querySelector('#pf-caret'), page = q('.pf-page');
      if (c && page) { const r = c.getBoundingClientRect(), pr = page.getBoundingClientRect(); if (r.top < pr.top + 40 || r.bottom > pr.bottom - 60) page.scrollTop += r.top - pr.top - pr.height * 0.55; }
    }
    function tick(ts) {
      if (!playing) return;
      const dt = last ? Math.min(250, ts - last) : 0; last = ts;
      vnow += dt * +q('.pf-speed').value;
      while (i < ev.length && ev[i].vt + ev[i].dur <= vnow) F.pfApply(docs, ev[i++]);
      if (vnow >= data.total) { vnow = data.total; playing = false; q('.pf-play').textContent = '↺ Again'; }
      draw();
      if (playing) raf = requestAnimationFrame(tick);
    }
    q('.pf-play').onclick = () => {
      if (playing) { playing = false; q('.pf-play').textContent = '▶ Play'; return; }
      if (vnow >= data.total) seek(0);
      playing = true; last = 0; q('.pf-play').textContent = '❚❚ Pause'; raf = requestAnimationFrame(tick);
    };
    q('.pf-seek').oninput = e => seek(data.total * e.target.value / 1000);
    seek(0);
    return { stop: function () { playing = false; cancelAnimationFrame(raf); } };
  }
  const ENGINE = { pfPrep, pfApply, pfWords, pfStats, pfView, pfPlayer };

  // ================================================================== RECORDING A REPLAY
  // the chapter as plain text, a line per paragraph (a typed space at the end of a line is briefly a no-break space: same thing)
  const textOf = root => { const out = []; for (const el of root.children) out.push(el.textContent); return out.join('\n').replace(/\u00a0/g, ' '); };
  const deviceName = () => api.web ? (/iPhone/.test(navigator.userAgent) ? 'iPhone' : /iPad/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1) ? 'iPad' : 'Browser') : (api.platform === 'darwin' ? 'Mac' : 'PC');
  const R = { on: false, slug: null, sess: null, last: {}, cur: null, kind: null, kindAt: 0, data: '', dirty: false, timer: 0, lastAt: 0 };
  const onFor = slug => !!(((S.settings || {}).proofOn || {})[slug]);
  const stamp = d => { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
  function newSession() {
    const now = new Date();
    R.sess = { v: 1, id: `${stamp(now)}-${deviceName()}`.replace(/[^\w-]/g, ''), book: S.project ? S.project.title : '', device: deviceName(), app: window.UNWIP_VERSION || '', started: now.getTime(), titles: {}, ev: [] };
    R.last = {}; R.cur = null; R.dirty = false; R.lastAt = Date.now();
  }
  function push(e) {
    const s = R.sess, L = s.ev[s.ev.length - 1];
    // keep the file small: a run of typing (or of backspacing) in one place is stored as one change
    if (L && L[1] === e[1] && L[2] === e[2] && e[0] - (L[0] + (L[6] || 0)) < 2000) {
      if (e[2] === 't' && L[4] === 0 && e[4] === 0 && e[3] === L[3] + L[5].length) { L[5] += e[5]; L[6] = e[0] - L[0]; R.dirty = true; return; }
      if (e[2] === 'e' && !e[5] && !L[5] && e[3] + e[4] === L[3]) { L[3] = e[3]; L[4] += e[4]; L[6] = e[0] - L[0]; R.dirty = true; return; }
    }
    s.ev.push(e); R.dirty = true;
  }
  function watchDoc() {
    if (!R.on || !S.docId || !editor) return;
    if (!R.sess || Date.now() - R.lastAt > 30 * 60000 && R.sess.ev.length) { flush(); newSession(); }
    const id = S.docId, text = textOf(editor), f = U.findNode(id);
    R.sess.titles[id] = f ? f.node.title || 'Untitled' : 'Untitled';
    if (R.last[id] !== text) { push([Date.now() - R.sess.started, id, R.last[id] == null ? 'b' : 'r', 0, 0, text, 0]); R.last[id] = text; }
    R.cur = id;
  }
  function onBeforeInput(e) {
    const t = e.inputType || '';
    R.kind = /^insertFromPaste/.test(t) ? 'p' : t === 'insertFromDrop' ? 'd' : t === 'deleteByCut' ? 'c' : /^history/.test(t) ? 'u' : /^delete/.test(t) ? 'e' : 't';
    R.data = e.data || ''; R.kindAt = Date.now();
  }
  // typing caught at the key as well, because some of Unwip's typing helpers put the letters in themselves
  function onKeyDown(e) {
    if (e.isComposing) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && /^[zy]$/i.test(e.key)) { R.kind = 'u'; R.data = ''; }
    else if (mod || e.altKey && e.key.length !== 1) return;
    else if (e.key === 'Backspace' || e.key === 'Delete') { R.kind = 'e'; R.data = ''; }
    else if (e.key.length === 1 || e.key === 'Enter' || e.key === 'Tab') { R.kind = 't'; R.data = e.key === 'Enter' ? '\n' : e.key === 'Tab' ? '\t' : e.key; }
    else return;
    R.kindAt = Date.now();
  }
  function onInput() {
    if (!R.on || !R.sess || !S.docId) return;
    if (Date.now() - R.lastAt > 30 * 60000 && R.sess.ev.some(x => x[2] !== 'b')) { flush(); newSession(); watchDoc(); return; }   // a long break: a new session
    if (R.cur !== S.docId || R.last[S.docId] == null) { watchDoc(); return; }
    const id = S.docId, a = R.last[id], b = textOf(editor);
    if (a === b) return;
    let p = 0; const n = Math.min(a.length, b.length);
    while (p < n && a.charCodeAt(p) === b.charCodeAt(p)) p++;
    let s = 0; while (s < n - p && a.charCodeAt(a.length - 1 - s) === b.charCodeAt(b.length - 1 - s)) s++;
    const del = a.length - p - s, ins = b.slice(p, b.length - s);
    let kind = (Date.now() - R.kindAt < 600 && R.kind) || 'x';
    if (kind === 't' && ins.length > R.data.length + 3) kind = 'x';       // more appeared than was typed: one of Unwip's tools
    if (kind === 'e' && ins.length) kind = 'x';
    push([Date.now() - R.sess.started, id, kind, p, del, ins, 0]);
    R.last[id] = b; R.lastAt = Date.now();
    if (kind !== 't' && kind !== 'e') { R.kind = null; R.kindAt = 0; }
  }
  async function flush() {
    if (!R.sess || !R.dirty || !R.slug) return;
    R.dirty = false;
    const s = R.sess;
    if (!s.ev.some(e => e[2] !== 'b')) { R.dirty = true; return; }   // nothing written yet: no file
    try { await api.proofWrite(R.slug, s.id, JSON.stringify(s)); } catch (e) { R.dirty = true; console.error('proof', e); }
  }
  function start() {
    if (!S.slug) return;
    R.on = true; R.slug = S.slug; newSession(); R.lastAt = Date.now(); watchDoc();
    clearInterval(R.timer); R.timer = setInterval(flush, 15000);
    renderStatus();
  }
  async function stop() { if (R.on) await flush(); R.on = false; R.sess = null; clearInterval(R.timer); renderStatus(); }
  // switched on from the main screen, for any book: it starts when that book is opened
  async function setReplayFor(slug, on) {
    const map = { ...((S.settings || {}).proofOn || {}) }; if (on) map[slug] = true; else delete map[slug];
    S.settings = await api.setSettings({ proofOn: map });
  }
  async function setReplay(on) {
    const map = { ...((S.settings || {}).proofOn || {}) }; if (on) map[S.slug] = true; else delete map[S.slug];
    S.settings = await api.setSettings({ proofOn: map });
    if (on) start(); else await stop();
  }
  if (editor) {
    editor.addEventListener('keydown', onKeyDown, true);
    editor.addEventListener('beforeinput', onBeforeInput, true);
    editor.addEventListener('paste', () => { R.kind = 'p'; R.kindAt = Date.now(); }, true);
    editor.addEventListener('drop', () => { R.kind = 'd'; R.kindAt = Date.now(); }, true);
    editor.addEventListener('cut', () => { R.kind = 'c'; R.kindAt = Date.now(); }, true);
    editor.addEventListener('input', onInput);
  }
  U.on('project', () => { remindHidden = null; stop().then(() => { if (onFor(S.slug)) start(); }); renderRemind(); });
  U.on('doc', () => setTimeout(watchDoc, 0));
  U.on('leave', () => { stop(); setTimeout(renderRemind, 0); });   // a screen video keeps going: it isn't about one book
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  window.addEventListener('beforeunload', () => { flush(); });

  // ================================================================== STATUS BAR
  let btn = null;
  function renderStatus() {
    // the main menu, Build and Play have their own Record button: it only ever shows the screen video (Replay is
    // for the writing inside a book)
    document.querySelectorAll('.rec-btn').forEach(b => {
      b.classList.toggle('on', !!V.rec); b.classList.toggle('paused', !!V.paused);
      b.innerHTML = V.rec ? `<i class="pf-dot${V.paused ? ' off' : ''}"></i>${V.paused ? 'Paused · ' : ''}${clock(recorded())}` : '<i class="pf-dot off"></i><span class="rb-label">Record</span>';
      b.title = V.rec ? (V.paused ? 'The screen video is paused. Click to resume or stop.' : 'Recording a screen video. Click to pause or stop.') : 'Record: a video of your screen, as proof of writing (also works in Build and Play)';
    });
    // phones: a small Record button at the bottom of the book's list (the status bar it normally sits in is hidden)
    const bf = document.getElementById('bf-proof');
    if (bf) { bf.classList.toggle('on', R.on || !!V.rec); bf.innerHTML = `<i class="pf-dot${R.on || V.rec ? '' : ' off'}"></i>`; bf.title = R.on ? 'Replay is recording this book. Tap to change.' : 'Record: a replay of this book (proof of writing)'; }
    btn = btn || document.getElementById('st-proof'); if (!btn) return;
    btn.classList.toggle('on', R.on || !!V.rec);
    btn.classList.toggle('paused', !!V.paused);
    if (V.rec) btn.innerHTML = `<i class="pf-dot${V.paused ? ' off' : ''}"></i>${V.paused ? 'Paused · ' : ''}${clock(recorded())} · ${size(V.bytes)}`;
    else btn.innerHTML = R.on ? '<i class="pf-dot"></i>Replay on' : '<i class="pf-dot off"></i>Record';
    btn.title = V.rec ? (V.paused ? 'The screen video is paused. Click to resume or stop.' : 'Recording a screen video. Click to pause or stop.') : R.on ? 'Replay is recording your writing in this book. Click for Record.' : 'Record: a replay of your writing, or a screen video (proof of writing)';
    renderRemind();
  }
  // time actually recorded (pauses left out)
  const recorded = () => Date.now() - V.started - V.pausedFor - (V.paused ? Date.now() - V.pausedAt : 0);
  function pauseVideo(on) {
    if (!V.rec || on === V.paused) return;
    try { if (on) V.rec.pause(); else V.rec.resume(); } catch (e) { console.error('video pause', e); return; }
    if (on) { V.paused = true; V.pausedAt = Date.now(); }
    else { V.paused = false; V.pausedFor += Date.now() - V.pausedAt; }
    renderStatus();
  }

  // ---- the "not recording" reminder (a setting per book): a big red pill while the screen isn't being recorded
  const remindOn = slug => !!(((S.settings || {}).proofRemind || {})[slug]);
  let remindEl = null, remindHidden = null;
  function renderRemind() {
    const ws = document.getElementById('workspace');
    const show = canVideo() && S.slug && remindOn(S.slug) && remindHidden !== S.slug && ws && !ws.classList.contains('hidden') && (!V.rec || V.paused);
    document.body.classList.toggle('pf-alert', !!show && !V.paused);
    document.body.classList.toggle('pf-alert-paused', !!show && !!V.paused);
    if (!show) { if (remindEl) remindEl.classList.add('hidden'); return; }
    if (!remindEl) {
      remindEl = document.createElement('div'); remindEl.className = 'pf-remind';
      remindEl.addEventListener('click', e => {
        const b = e.target.closest('button') || remindEl.querySelector('[data-act=resume], [data-act=start]'); if (!b) return;
        if (b.dataset.act === 'resume') pauseVideo(false);
        else if (b.dataset.act === 'start') open();
        else if (b.dataset.act === 'hide') { remindHidden = S.slug; renderRemind(); U.toast('Hidden until you next open this book. Turn the reminder off in Proof of writing (the Record button in the bottom bar).', '', 7000); }
      });
      document.body.appendChild(remindEl);
    }
    const html = V.paused
      ? `<i class="pf-dot off"></i><span class="pf-rt"><b>Recording paused</b><small>You’re writing in “${esc(S.project ? S.project.title : '')}”. Click to resume.</small></span><button class="btn small primary" data-act="resume">Resume</button><button class="icon-btn" data-act="hide" title="Hide until I reopen this book">✕</button>`
      : `<i class="pf-dot"></i><span class="pf-rt"><b>Not recording</b><small>You’re writing in “${esc(S.project ? S.project.title : '')}”. Click to start recording.</small></span><button class="btn small primary" data-act="start">Start screen video</button><button class="icon-btn" data-act="hide" title="Hide until I reopen this book">✕</button>`;
    remindEl.classList.toggle('paused', !!V.paused);
    if (remindEl.dataset.h !== html) { remindEl.innerHTML = html; remindEl.dataset.h = html; }
    remindEl.classList.remove('hidden');
  }
  async function setRemind(on) {
    const map = { ...((S.settings || {}).proofRemind || {}) }; if (on) map[S.slug] = true; else delete map[S.slug];
    S.settings = await api.setSettings({ proofRemind: map });
    if (on && remindHidden === S.slug) remindHidden = null;
    renderRemind();
  }
  const clock = ms => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const size = b => b >= 1e9 ? (b / 1e9).toFixed(2) + ' GB' : b >= 1e7 ? Math.round(b / 1e6) + ' MB' : (b / 1e6).toFixed(1) + ' MB';

  // ================================================================== THE PROOF OF WRITING SCREEN
  const QUALITY = [
    { id: 'small', label: 'Small', bps: 800e3, fps: 10, note: 'fine for showing the writing' },
    { id: 'standard', label: 'Standard', bps: 2e6, fps: 15, note: 'sharp text, smooth enough' },
    { id: 'sharp', label: 'Sharp', bps: 5e6, fps: 30, note: 'for YouTube and big screens' }
  ];
  const perHour = q => q.bps / 8 * 3600;      // bytes an hour, at most
  const canVideo = () => !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia && window.MediaRecorder);

  async function open() {
    const inBook = !!S.slug;   // from the main menu, Build or Play: just the screen video (Replay belongs to a book)
    if (V.rec) {
      const canPause = typeof V.rec.pause === 'function';
      const go = await U.modal({ title: V.paused ? 'Screen video paused' : 'Screen video recording',
        body: `<p>${V.paused ? 'Paused at' : 'Recording for'} <b>${clock(recorded())}</b> (${size(V.bytes)}).${V.paused ? ' Nothing is recorded while it’s paused.' : ' Pause it for a break: nothing is recorded until you resume, and it’s still one video.'}</p>`,
        buttons: [{ label: 'Cancel', value: null, kind: 'ghost' }, ...(canPause ? [{ label: V.paused ? '⏺ Resume' : '❚❚ Pause', value: 'pause' }] : []), { label: 'Stop and save', value: 'stop', kind: 'primary' }] });
      if (go === 'pause') pauseVideo(!V.paused); else if (go === 'stop') stopVideo();
      return;
    }
    const list = inBook ? await api.proofList(S.slug).catch(() => []) : [];
    const books = inBook ? [] : await api.listProjects().catch(() => []);
    const info = !api.web && api.videoInfo ? await api.videoInfo().catch(() => null) : null;
    let qi = 1;
    const body = document.createElement('div'); body.className = 'pf-dialog';
    const draw = () => {
      const q = QUALITY[qi], hour = perHour(q);
      body.innerHTML = `
        <p class="pf-lead">Show how you wrote it: a replay of your writing, or a video of your screen.</p>
        ${inBook ? '' : `<div class="pf-card"><h3>Replay <span class="pf-tag">small files</span></h3>
          <p>A record of every change you make in a book, with the time: typing, deleting and pasting. Play it back, save a report, or turn it into a timelapse video. It works on every device, phones and iPads too. Switch it on for a book here; it records whenever that book is open.</p>
          ${books.length ? `<div class="pf-books">${books.map(b => `<label class="switch-line"><input type="checkbox" data-book="${esc(b.slug)}"${onFor(b.slug) ? ' checked' : ''}> <b>${esc(b.title || b.slug)}</b></label>`).join('')}</div>` : '<p class="pf-small">No books yet. Start one, then switch Replay on for it here or inside the book.</p>'}</div>
          ${canVideo() ? '<p class="pf-small">A screen video keeps recording as you move between your books, Build and Play.</p>' : ''}`}
        <div class="pf-card${inBook ? '' : ' hidden'}">
          <h3>Replay <span class="pf-tag">small files</span></h3>
          <p>While it’s on, Unwip notes every change you make in this book, with the time: typing, deleting and pasting. Play it back, save a report anyone can open that shows what was typed and what was pasted, or turn it into a timelapse video. A long writing day is about 1 MB.</p>
          <div class="pf-row">
            <label class="switch-line"><input type="checkbox" id="pf-replay"${R.on ? ' checked' : ''}> <b>Record a replay of this book</b></label>
            <button class="btn" id="pf-list"${list.length ? '' : ' disabled'}>Recordings (${list.length})</button>
          </div>
        </div>
        <div class="pf-card">
          <h3>Screen video <span class="pf-tag warn">big files</span></h3>
          ${canVideo() ? `
          <p>Records Unwip’s window as a video, like a screen recorder.${api.web ? ' Your browser will ask what to share: choose this tab or window.' : ''}</p>
          <div class="pf-warn"><b>⚠ Screen videos get big.</b> At ${q.label} quality, up to <b>${size(hour)} for every hour</b> you record: a 3-hour session can be <b>${size(hour * 3)}</b>. Make sure there’s room before a long session${api.web ? '' : ', and stop it when you’re done'}.</div>
          <div class="pf-q">${QUALITY.map((x, j) => `<label><input type="radio" name="pf-q" value="${j}"${j === qi ? ' checked' : ''}> <b>${x.label}</b> · up to ${size(perHour(x))}/hour · ${x.note}</label>`).join('')}</div>
          ${info && info.free != null ? `<p class="pf-small">Free space: <b>${size(info.free)}</b>, about ${Math.max(0, Math.floor(info.free / hour))} hours at this quality. Videos are saved in <b>${esc(info.folder)}</b>.${api.platform === 'darwin' ? ' The first time, your Mac may ask you to allow screen recording for Unwip.' : ''}</p>` : ''}
          ${api.web ? `<p class="pf-small">${window.showSaveFilePicker ? 'You’ll choose where to save it first, and it’s written there as you go.' : 'This browser keeps the video in memory until you stop, then downloads it, so keep browser recordings short (under about 30 minutes).'}</p>` : ''}
          <div class="pf-row"><button class="btn primary" id="pf-video">⏺ Start screen video</button></div>
          ${inBook ? '' : '<span hidden>'}<label class="switch-line pf-remind-set"><input type="checkbox" id="pf-remind"${remindOn(S.slug) ? ' checked' : ''}> Remind me when this book isn’t being recorded <span class="pf-small">(a red “Not recording” sign stays on screen until you start or resume a screen video)</span></label>${inBook ? '' : '</span>'}`
          : `<p>${/iPhone|iPad/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent)) ? 'iPhones and iPads don’t let web apps record the screen. Use the built-in recorder instead: open Control Centre and tap <b>Screen Recording</b> (add it in Settings › Control Centre if it isn’t there). Replay works here.' : 'This browser can’t record the screen. Replay above still works.'}</p>`}
        </div>
        <p class="pf-small">Nothing is uploaded anywhere. Replays stay with the book (and in Dropbox if the book is there); videos stay where you save them.</p>`;
      $$('[data-book]', body).forEach(c => c.onchange = async () => { await setReplayFor(c.dataset.book, c.checked); U.toast(c.checked ? 'Replay is on for that book: it records whenever the book is open.' : 'Replay is off for that book.'); });
      if (inBook) $('#pf-replay', body).onchange = async e => { await setReplay(e.target.checked); U.toast(e.target.checked ? 'Replay is on for this book: everything you write from now is recorded.' : 'Replay is off for this book.'); };
      if (inBook) $('#pf-list', body).onclick = () => { closeDlg(); recordings(); };
      $$('input[name="pf-q"]', body).forEach(r => r.onchange = () => { qi = +r.value; draw(); });
      const vb = $('#pf-video', body); if (vb) vb.onclick = () => { closeDlg(); startVideo(QUALITY[qi], info); };
      const rm = $('#pf-remind', body); if (rm) rm.onchange = () => setRemind(rm.checked);
    };
    let closeDlg = () => {};
    draw();
    await U.modal({ title: 'Record: proof of writing', body, wide: true, buttons: [{ label: 'Close', value: true, kind: 'ghost' }], onOpen: back => { closeDlg = () => { const b = back.querySelector('.m-foot .btn'); if (b) b.click(); }; } });
  }

  // ---- the recordings: one row a session, totals at the top
  async function loadSessions(slug) {
    const list = await api.proofList(slug).catch(() => []), out = [];
    for (const f of list) { try { const t = await api.proofRead(slug, f.name); if (t) out.push(JSON.parse(t)); } catch {} }
    if (R.on && R.slug === slug && R.sess && R.sess.ev.some(e => e[2] !== 'b') && !out.some(s => s.id === R.sess.id)) out.push(JSON.parse(JSON.stringify(R.sess)));
    else if (R.on && R.slug === slug && R.sess) { const i = out.findIndex(s => s.id === R.sess.id); if (i >= 0) out[i] = JSON.parse(JSON.stringify(R.sess)); }
    return out.sort((a, b) => a.started - b.started);
  }
  const dur = ms => { const m = Math.round(ms / 60000); if (!m) return 'under a minute'; return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };
  const share = st => { const t = st.typedWords + st.pastedWords; return t ? Math.round(100 * st.typedWords / t) : 100; };
  async function recordings() {
    await flush();
    const sessions = await loadSessions(S.slug);
    if (!sessions.length) { U.toast('No replays yet. Turn on Replay and write; it’s saved as you go.'); return; }
    const st = pfStats(sessions);
    const body = document.createElement('div'); body.className = 'pf-dialog';
    body.innerHTML = `
      <div class="pf-sum">
        <div><b>${fmt(st.typedWords)}</b><span>words typed</span></div>
        <div><b>${fmt(st.pastedWords)}</b><span>words pasted (${st.pastes.length} paste${st.pastes.length === 1 ? '' : 's'})</span></div>
        <div><b>${share(st)}%</b><span>of new words typed</span></div>
        <div><b>${dur(st.active)}</b><span>writing time, ${st.sessions.length} session${st.sessions.length === 1 ? '' : 's'}</span></div>
      </div>
      <table class="pf-table"><thead><tr><th>When</th><th>Writing time</th><th>Typed</th><th>Pasted</th><th>Chapters</th><th></th></tr></thead><tbody>
      ${st.sessions.map((r, j) => `<tr><td>${new Date(r.started).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}<small>${esc(r.device)}</small></td><td>${dur(r.active)}</td><td>${fmt(r.typedWords)} words</td><td>${r.pastes ? `${fmt(r.pastedWords)} words (${r.pastes})` : '–'}</td><td>${r.chapters}</td>
        <td class="pf-acts"><button class="btn small" data-play="${j}">▶ Play</button><button class="btn small" data-vid="${j}" title="Save this session as a video, at real speed or faster">🎬 Video</button><button class="icon-btn small" data-del="${j}" title="Delete this recording">✕</button></td></tr>`).join('')}
      </tbody></table>
      ${st.resync ? `<p class="pf-small">${st.resync} time${st.resync === 1 ? '' : 's'} a chapter had changed while Replay wasn’t watching it (written with Replay off, in another window or on another device); the replay jumps to the new text there and the report says so.</p>` : ''}`;
    const go = await U.modal({ title: `Replays of “${S.project.title}”`, body, wide: true,
      onOpen: back => {
        $$('[data-play]', back).forEach(b => b.onclick = () => { back.querySelector('.m-foot .btn').click(); play([sessions[+b.dataset.play]]); });
        $$('[data-vid]', back).forEach(b => b.onclick = () => { back.querySelector('.m-foot .btn').click(); timelapse([sessions[+b.dataset.vid]], 'speed'); });
        $$('[data-del]', back).forEach(b => b.onclick = async () => {
          const s = sessions[+b.dataset.del];
          if (!await U.confirmBox('Delete this recording?', `The replay from ${new Date(s.started).toLocaleString()} will be deleted. Your writing isn’t touched.`, 'Delete', true)) return;
          if (R.sess && R.sess.id === s.id) { newSession(); R.cur = null; }
          await api.proofDelete(S.slug, s.id); back.querySelector('.m-foot .btn').click(); recordings();
        });
      },
      buttons: [{ label: 'Close', value: null, kind: 'ghost' }, { label: 'Make a video…', value: 'video' }, { label: 'Save a report…', value: 'report' }, { label: '▶ Play all', value: 'play', kind: 'primary' }] });
    if (go === 'play') play(sessions);
    else if (go === 'report') saveReport(sessions);
    else if (go === 'video') timelapse(sessions);
  }

  // ---- the player
  function play(sessions) {
    const back = document.createElement('div'); back.className = 'pf-back';
    back.innerHTML = `<div class="pf-shell"><div class="pf-head"><b>Replay · ${esc(S.project ? S.project.title : '')}</b><button class="icon-btn" title="Close (Esc)">✕</button></div><div class="pf-root"></div></div>`;
    document.body.appendChild(back);
    const p = pfPlayer($('.pf-root', back), sessions, ENGINE);
    const close = () => { p.stop(); back.remove(); document.removeEventListener('keydown', key, true); };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } else if (e.key === ' ' && e.target.tagName !== 'SELECT') { e.preventDefault(); $('.pf-play', back).click(); } };
    document.addEventListener('keydown', key, true);
    $('.pf-head .icon-btn', back).onclick = close;
  }

  // ---- the report: one file anyone can open in a browser, with the numbers and the replay itself
  async function saveReport(sessions) {
    const st = pfStats(sessions), title = S.project.title;
    const data = JSON.stringify(sessions);
    let fp = '';
    try { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data)); fp = [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join(''); } catch {}
    const row = r => `<tr><td>${new Date(r.started).toLocaleString()}<br><small>${esc(r.device)}</small></td><td>${dur(r.active)}</td><td>${fmt(r.typedWords)}</td><td>${fmt(r.pastedWords)} (${r.pastes})</td><td>${fmt(r.erased)}</td><td>${r.chapters}</td></tr>`;
    const titles = Object.assign({}, ...sessions.map(s => s.titles || {}));
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Proof of writing: ${esc(title)}</title>
<style>${REPORT_CSS}</style></head><body><main>
<p class="brand">unwip · Proof of writing</p>
<h1>${esc(title)}</h1>
<p class="sub">A record of how this book was written, made by Unwip as the writing happened. Report saved ${new Date().toLocaleString()}.</p>
<div class="sum"><div><b>${fmt(st.typedWords)}</b><span>words typed</span></div><div><b>${fmt(st.pastedWords)}</b><span>words pasted or dropped in (${st.pastes.length})</span></div><div><b>${share(st)}%</b><span>of new words were typed</span></div><div><b>${dur(st.active)}</b><span>writing time over ${st.sessions.length} session${st.sessions.length === 1 ? '' : 's'}</span></div></div>
<h2>Watch it being written</h2><div id="player" class="pf-root"></div>
<h2>Sessions</h2><table><thead><tr><th>Started</th><th>Writing time</th><th>Words typed</th><th>Words pasted (pastes)</th><th>Characters deleted</th><th>Chapters</th></tr></thead><tbody>${st.sessions.map(row).join('')}</tbody></table>
<h2>Every paste</h2>${st.pastes.length ? `<table><thead><tr><th>When</th><th>Chapter</th><th>Size</th><th>Starts with</th></tr></thead><tbody>${st.pastes.map(p => `<tr><td>${new Date(p.at).toLocaleString()}</td><td>${esc(titles[p.doc] || '')}</td><td>${fmt(p.words)} words</td><td class="pv">${esc(p.preview)}${p.chars > 160 ? '…' : ''}</td></tr>`).join('')}</tbody></table>` : '<p>Nothing was pasted or dropped in while recording.</p>'}
<h2>About this record</h2>
<p>While Replay was on, Unwip noted every change to the book with the time it happened: what was typed, deleted, pasted or dropped in, and what Unwip’s own tools (like find and replace) changed. Pauses longer than 3 seconds are shortened in the player. ${st.resync ? `${st.resync} time${st.resync === 1 ? '' : 's'}, a chapter had changed while Replay wasn’t watching it (written with Replay off, in another window or on another device); the replay jumps to the new text at those points. ` : ''}</p>
<p>What it shows is how the words arrived on the page. It can’t, by itself, prove who was typing or where ideas came from.</p>
${fp ? `<p class="fp">Fingerprint of the recorded data (SHA-256): <code>${fp}</code></p>` : ''}
</main>
<script>${Object.values(ENGINE).map(f => f.toString()).join('\n')}
var SESSIONS = ${data.replace(/</g, '\\u003c')};
pfPlayer(document.getElementById('player'), SESSIONS, { pfPrep: pfPrep, pfApply: pfApply, pfWords: pfWords, pfView: pfView });
<\/script></body></html>`;
    await api.exportBinary(new TextEncoder().encode(html), `Proof of writing - ${title}`, 'html', 'Proof of writing report');
  }

  // ---- timelapse: the replay drawn into a video
  function videoType() {
    // MP4 (H.264) first: Windows' Media Player, QuickTime and phones all play it, and it's written in self-contained
    // pieces, so a recording cut off (the app closed mid-recording) still plays. WebM only where MP4 can't be recorded.
    for (const t of ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) return t;
    return '';
  }
  // a video of the replay: a timelapse squeezed into a set length, or at the replay's own speed (1× is as it was
  // typed, with long pauses cut down to 3 seconds, the same as the player)
  const vlen = ms => { const m = Math.round(ms / 60000); return ms < 60000 ? (n => `${n} second${n === 1 ? '' : 's'}`)(Math.max(1, Math.round(ms / 1000))) : m < 60 ? `${m} minute${m === 1 ? '' : 's'}` : `${Math.floor(m / 60)} h ${m % 60} min`; };
  async function timelapse(sessions, pick) {
    const type = videoType();
    if (!type || !HTMLCanvasElement.prototype.captureStream) { U.toast('This browser can’t make videos. Try Unwip on a computer.', 'warn', 7000); return; }
    const total0 = pfPrep(sessions).total;
    const body = document.createElement('div'); body.className = 'pf-dialog';
    const speeds = [1, 2, 4, 16];
    body.innerHTML = `<p>Turns the replay into a video you can share, with the words appearing as they were written.</p>
      <div class="pf-q"><b>As it was written</b>${speeds.map(x => `<label><input type="radio" name="tl-len" value="x${x}"${pick === 'speed' && x === 1 ? ' checked' : ''}> ${x === 1 ? 'Real speed (1×)' : x + '× speed'} · ${vlen(total0 / x)}</label>`).join('')}</div>
      <div class="pf-q"><b>Timelapse</b>${[30, 60, 180].map(s => `<label><input type="radio" name="tl-len" value="${s}"${pick !== 'speed' && s === 60 ? ' checked' : ''}> ${s < 60 ? s + ' seconds' : s / 60 + ' minute' + (s > 60 ? 's' : '')}</label>`).join('')}</div>
      <div class="pf-q"><b>Shape</b><label><input type="radio" name="tl-shape" value="wide" checked> Wide (YouTube, computers)</label><label><input type="radio" name="tl-shape" value="tall"> Tall (TikTok, Reels, Shorts)</label></div>
      <p class="pf-small">Pauses longer than 3 seconds are cut down to 3, like in the player. The video is made in real time, so a 20-minute video takes 20 minutes to make: keep Unwip open and in front while it’s made (a hidden window draws fewer pictures, so the video gets jumpy). You can stop part-way and keep what’s made so far. They’re small files, a few MB a minute.</p>
      <p class="pf-warn hidden" id="tl-long"><b>That’s a long video.</b> It’s kept in memory until it’s saved, so for anything over an hour, make it from one session at a time (the 🎬 button next to each one in the list).</p>`;
    const longWarn = () => { const v = ($('input[name="tl-len"]:checked', body) || {}).value || ''; $('#tl-long', body).classList.toggle('hidden', !(v[0] === 'x' && total0 / +v.slice(1) > 3600000)); };
    $$('input[name="tl-len"]', body).forEach(r => r.onchange = longWarn); longWarn();
    const ok = await U.modal({ title: 'Make a video of the replay', body, wide: true, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Make the video', value: true, kind: 'primary' }] });
    if (!ok) return;
    const lenV = ($('input[name="tl-len"]:checked', body) || {}).value || '60', speed = lenV[0] === 'x' ? +lenV.slice(1) : 0;
    const secs = speed ? Math.max(3, total0 / 1000 / speed) : +lenV || 60, tall = (($('input[name="tl-shape"]:checked', body) || {}).value) === 'tall';
    const W = tall ? 1080 : 1920, H = tall ? 1920 : 1080;
    const data = pfPrep(sessions), ev = data.ev;
    if (!ev.length) return;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
    const stream = cv.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: speed ? 2e6 : 4e6 });
    const parts = []; rec.ondataavailable = e => { if (e.data && e.data.size) parts.push(e.data); };
    const prog = document.createElement('div'); prog.className = 'pf-prog';
    prog.innerHTML = `<b>Making your ${speed ? 'video' : 'timelapse'}…</b><span class="pf-left"></span><div class="pf-bar"><i></i></div>${speed ? '<button class="btn small" data-keep>Stop and save</button>' : ''}<button class="btn small" data-cancel>Cancel</button>`;
    document.body.appendChild(prog);
    let cancelled = false, cut = false;
    $('[data-cancel]', prog).onclick = () => { cancelled = true; };
    const keep = $('[data-keep]', prog); if (keep) keep.onclick = () => { cut = true; };
    const book = S.project ? S.project.title : '';
    const ink = '#26231e', paper = '#fbf8f1', accent = '#34528a', pasteBg = 'rgba(238,96,56,.22)';
    const F = tall ? 44 : 40, LH = Math.round(F * 1.55), PAD = tall ? 90 : 220, TOP = tall ? 260 : 210, BOT = tall ? 240 : 150;
    const font = `${F}px "EB Garamond", Georgia, serif`;
    // paragraphs → lines, remembering where each line starts in the text. A paragraph is only measured once (most of
    // the book doesn't change from one frame to the next), so long chapters don't slow the video down.
    const wrapped = new Map();
    function wrapPara(p, width) {
      let got = wrapped.get(p); if (got) return got;
      got = []; let i = 0;
      while (i < p.length) {
        let j = p.length;
        if (g.measureText(p.slice(i, j)).width > width) {
          let lo = i + 1, hi = p.length;
          while (lo < hi) { const m = (lo + hi + 1) >> 1; if (g.measureText(p.slice(i, m)).width <= width) lo = m; else hi = m - 1; }
          j = lo; const sp = p.lastIndexOf(' ', j); if (sp > i) j = sp + 1;
        }
        got.push([i, j]); i = j;
      }
      if (wrapped.size > 4000) wrapped.clear();
      wrapped.set(p, got); return got;
    }
    function wrap(text, width) {
      const lines = []; let off = 0;
      for (const p of text.split('\n')) {
        if (!p) { lines.push({ s: '', a: off }); off += 1; continue; }
        for (const [i, j] of wrapPara(p, width)) lines.push({ s: p.slice(i, j), a: off + i });
        off += p.length + 1;
      }
      return lines;
    }
    const docs = {}; let i = 0;
    const total = data.total, frames = secs * 30;
    // The video records in real time, so each picture is drawn for the moment it's due on the clock (if drawing ever
    // falls behind, frames are skipped rather than the whole video stretching out longer and slower than chosen).
    rec.start(1000);
    const t0 = performance.now();
    let leftAt = 0;
    for (let fr = 0; fr <= frames && !cancelled && !cut;) {
      const vnow = total * fr / frames;
      while (i < ev.length && ev[i].vt + ev[i].dur <= vnow) pfApply(docs, ev[i++]);
      const e = i < ev.length && ev[i].vt <= vnow ? ev[i] : ev[Math.max(0, i - 1)];
      let text = docs[e.doc] || '', pos = text.length, len = 0, kind = e.k;
      if (e === ev[i] && e.k === 't' && e.dur) { const n = Math.ceil(e.ins.length * Math.min(1, (vnow - e.vt) / e.dur)); text = text.slice(0, e.pos) + e.ins.slice(0, n) + text.slice(e.pos + e.del); pos = e.pos + n; }
      else if (e.k !== 'b' && e.k !== 'r') { pos = e.pos + e.ins.length; len = e.ins.length; }
      // page
      g.fillStyle = paper; g.fillRect(0, 0, W, H);
      g.fillStyle = accent; g.font = `600 ${tall ? 34 : 28}px system-ui, sans-serif`; g.fillText(book, PAD, tall ? 120 : 90);
      g.fillStyle = '#7a746a'; g.font = `${tall ? 30 : 24}px system-ui, sans-serif`;
      g.fillText(`${data.titles[e.doc] || ''}  ·  ${new Date(e.at).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}`, PAD, tall ? 170 : 130);
      g.font = font;
      const lines = wrap(text, W - PAD * 2);
      let cl = lines.length - 1; for (let k = 0; k < lines.length; k++) { if (lines[k].a <= pos) cl = k; else break; }
      const rows = Math.floor((H - TOP - BOT) / LH), first = Math.max(0, cl - Math.floor(rows * 0.7));
      for (let k = first; k < Math.min(lines.length, first + rows); k++) {
        const L = lines[k], y = TOP + (k - first) * LH;
        if ((kind === 'p' || kind === 'd' || kind === 'x') && len) {   // pasted text gets a highlight
          const a = Math.max(pos - len, L.a), b = Math.min(pos, L.a + L.s.length);
          if (b > a) { const x1 = PAD + g.measureText(L.s.slice(0, a - L.a)).width, x2 = PAD + g.measureText(L.s.slice(0, b - L.a)).width; g.fillStyle = kind === 'x' ? 'rgba(52,82,138,.18)' : pasteBg; g.fillRect(x1, y - F, x2 - x1, LH * 0.85); }
        }
        g.fillStyle = ink; g.fillText(L.s, PAD, y);
        if (k === cl) { const x = PAD + g.measureText(L.s.slice(0, Math.max(0, pos - L.a))).width; if (fr % 30 < 20) { g.fillStyle = accent; g.fillRect(x + 2, y - F + 6, 3, F); } }
      }
      // footer
      g.fillStyle = '#7a746a'; g.font = `${tall ? 30 : 24}px system-ui, sans-serif`;
      g.fillText(`${pfWords(text).toLocaleString()} words`, PAD, H - (tall ? 120 : 70));
      const tag = 'Written in Unwip'; g.fillText(tag, W - PAD - g.measureText(tag).width, H - (tall ? 120 : 70));
      $('.pf-bar i', prog).style.width = Math.round(100 * fr / frames) + '%';
      if (performance.now() - leftAt > 1000) { leftAt = performance.now(); const left = (frames - fr) / 30 * 1000; $('.pf-left', prog).textContent = left > 60000 ? `about ${vlen(left)} left` : ''; }
      const due = t0 + (fr + 1) * 1000 / 30, now = performance.now();
      if (due > now) await new Promise(r => setTimeout(r, due - now)); else await new Promise(r => setTimeout(r, 0));
      fr = fr >= frames ? frames + 1 : Math.min(frames, Math.max(fr + 1, Math.floor((performance.now() - t0) * 30 / 1000)));
    }
    await new Promise(r => { rec.onstop = r; rec.stop(); });
    stream.getTracks().forEach(t => t.stop());
    prog.remove();
    if (cancelled) { U.toast(speed ? 'Video cancelled.' : 'Timelapse cancelled.'); return; }
    const blob = new Blob(parts, { type: type.split(';')[0] });
    const day = new Date(sessions[0].started).toLocaleDateString('en-CA');
    await api.exportBinary(await seekable(new Uint8Array(await blob.arrayBuffer()), type), speed ? `Replay ${speed}x - ${book} ${day}${sessions.length > 1 ? ' (' + sessions.length + ' sessions)' : ''}` : `Timelapse - ${book}`, /mp4/.test(type) ? 'mp4' : 'webm', 'Video');
  }

  // a recorded WebM gets its length and an index, so players can skip through it (left as it was if that fails)
  async function seekable(bytes, type) {
    if (!/webm/.test(type) || !window.UnwipWebm) return bytes;
    try { return await window.UnwipWebm.fixBytes(bytes); } catch (e) { console.error('webm fix', e); return bytes; }
  }

  // ================================================================== SCREEN VIDEO
  const V = { rec: null, stream: null, started: 0, bytes: 0, writer: null, parts: null, path: '', timer: 0, type: '', book: '', paused: false, pausedAt: 0, pausedFor: 0 };
  async function startVideo(q, info) {
    if (!canVideo()) return;
    const type = videoType(); if (!type) { U.toast('This computer can’t record video here.', 'warn'); return; }
    const ext = /mp4/.test(type) ? 'mp4' : 'webm';
    V.book = S.project ? S.project.title : 'Unwip';
    const name = `${V.book} ${new Date().toLocaleDateString('en-CA')} ${new Date().toTimeString().slice(0, 5).replace(':', '.')}`;
    let stream;
    try { if (api.videoArm) await api.videoArm(); stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: q.fps }, audio: false, preferCurrentTab: true, selfBrowserSurface: 'include' }); }
    catch (e) { console.error('screen video', e && (e.name + ': ' + e.message)); U.toast(api.platform === 'darwin' ? 'Unwip couldn’t record the screen. On a Mac, allow it in System Settings › Privacy & Security › Screen Recording, then try again.' : 'The screen video didn’t start.', 'warn', 9000); return; }
    // where the video goes: straight to a file as it records
    V.writer = null; V.parts = null; V.path = '';
    try {
      if (!api.web) { const r = await api.videoBegin(name, ext); V.path = r.path; }
      else if (window.showSaveFilePicker) { const h = await window.showSaveFilePicker({ suggestedName: name + '.' + ext, types: [{ description: 'Video', accept: { [type.split(';')[0]]: ['.' + ext] } }] }); V.writer = await h.createWritable(); V.path = h.name; }
      else V.parts = [];
    } catch (e) { stream.getTracks().forEach(t => t.stop()); if (e && e.name !== 'AbortError') U.toast('Couldn’t start the video file: ' + esc(e.message || e), 'warn'); return; }
    V.stream = stream; V.bytes = 0; V.type = type; V.started = Date.now(); V.paused = false; V.pausedFor = 0;
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: q.bps });
    let queue = Promise.resolve();
    rec.ondataavailable = e => {
      if (!e.data || !e.data.size) return;
      const blob = e.data;
      queue = queue.then(async () => {
        if (V.parts) { V.parts.push(blob); V.bytes += blob.size; return; }
        if (V.writer) { await V.writer.write(blob); V.bytes += blob.size; return; }
        const r = await api.videoChunk(await blob.arrayBuffer());
        if (r && r.ok) { V.bytes = r.bytes; if (r.free != null && r.free < 1.5e9 && V.rec) { U.toast('Your disk is nearly full, so the screen video was stopped and saved.', 'warn', 12000); stopVideo(); } }
      }).catch(err => console.error('video chunk', err));
    };
    rec.onstop = () => { queue.then(finishVideo); };
    stream.getVideoTracks()[0].addEventListener('ended', () => stopVideo());
    rec.start(4000);
    V.rec = rec;
    V.timer = setInterval(renderStatus, 1000);
    renderStatus();
    U.toast(`Screen video recording. Click the timer (<b>${clock(0)}</b>) at any time to pause or stop. It keeps going in other books, Build and Play.`, '', 6000);
  }
  // web: a screen video lives in memory until it's stopped, so closing the tab first would lose it: the browser asks
  window.addEventListener('beforeunload', e => { if (V.rec && V.parts) { e.preventDefault(); e.returnValue = ''; } });
  function stopVideo() { if (V.rec && V.rec.state !== 'inactive') { try { V.rec.stop(); } catch {} } if (V.stream) V.stream.getTracks().forEach(t => t.stop()); }
  async function finishVideo() {
    clearInterval(V.timer);
    const was = { bytes: V.bytes, path: V.path, secs: Math.round(recorded() / 1000) };
    V.rec = null; V.stream = null; V.paused = false;
    try {
      if (V.parts) { const blob = new Blob(V.parts, { type: V.type.split(';')[0] }); V.parts = null; await api.exportBinary(await seekable(new Uint8Array(await blob.arrayBuffer()), V.type), `${V.book} screen video`, /mp4/.test(V.type) ? 'mp4' : 'webm', 'Video'); }
      else if (V.writer) { await V.writer.close(); V.writer = null; U.toast(`Screen video saved: ${esc(was.path)} (${size(was.bytes)}).`, '', 8000); }
      else { if (was.bytes > 50e6) U.toast(`Finishing the video so you can skip through it (${size(was.bytes)})…`, '', 8000); const r = await api.videoEnd(); if (r) U.toastAction(`Screen video saved (${size(r.bytes)}, ${clock(was.secs * 1000)}).`, api.platform === 'darwin' ? 'Show in Finder' : 'Show in folder', () => api.videoReveal(r.path), 15000); }
    } catch (e) { U.toast('The video couldn’t be finished: ' + esc(e.message || e), 'warn', 9000); }
    renderStatus();
  }

  // the button in the bottom bar
  document.addEventListener('click', e => { if (e.target.closest('#st-proof, .rec-btn, #bf-proof')) open(); });
  renderStatus();

  const REPORT_CSS = `
:root{--ink:#25231f;--muted:#6f6a62;--line:#dcd7cd;--paper:#fffefb;--bg:#f4f2ed;--accent:#34528a}
@media (prefers-color-scheme: dark){:root{--ink:#e7e4dd;--muted:#a19d95;--line:#34353b;--paper:#25262a;--bg:#1b1c1f;--accent:#8aa6dc}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:900px;margin:0 auto;padding:40px 18px 60px}
.brand{color:var(--muted);font-weight:600;letter-spacing:.02em;margin:0}
h1{font-family:Georgia,serif;font-weight:500;font-size:38px;margin:6px 0 4px}
h2{font-family:Georgia,serif;font-weight:500;font-size:24px;margin:36px 0 10px}
.sub,.fp{color:var(--muted)} .fp code{font-size:12px;word-break:break-all}
.sum{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:20px}
.sum div{background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:12px}
.sum b{display:block;font-size:24px} .sum span{color:var(--muted);font-size:14px}
table{width:100%;border-collapse:collapse;background:var(--paper);border:1px solid var(--line);border-radius:10px;overflow:hidden;font-size:14px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top} th{color:var(--muted);font-weight:600}
td.pv{font-family:Georgia,serif;color:var(--muted)} small{color:var(--muted)}
@media (max-width:640px){.sum{grid-template-columns:1fr 1fr} table{display:block;overflow-x:auto}}
${PLAYER_CSS()}`;
  function PLAYER_CSS() { return `
.pf-root{background:var(--paper);border:1px solid var(--line);border-radius:12px;overflow:hidden;display:flex;flex-direction:column}
.pf-top{display:flex;gap:14px;align-items:baseline;padding:10px 16px;border-bottom:1px solid var(--line);font-size:14px;flex-wrap:wrap}
.pf-top .pf-when,.pf-top .pf-wc{color:var(--muted)} .pf-top .pf-wc{margin-left:auto}
.pf-page{height:min(56vh,520px);overflow:auto;padding:10px 26px;scroll-behavior:auto}
.pf-text{font:19px/1.6 Georgia,"EB Garamond",serif} .pf-text p{margin:0 0 .6em} .pf-more{color:var(--muted)}
.pf-caret{display:inline-block;width:2px;height:1.1em;background:var(--accent);vertical-align:text-bottom;margin:0 -1px;animation:pfb 1s steps(1) infinite}
@keyframes pfb{50%{opacity:0}}
.pf-mark.pf-p,.pf-mark.pf-d{background:rgba(238,96,56,.25);border-radius:3px} .pf-mark.pf-x,.pf-mark.pf-u{background:rgba(52,82,138,.18);border-radius:3px}
.pf-ctrl{display:flex;gap:10px;align-items:center;padding:10px 16px;border-top:1px solid var(--line);flex-wrap:wrap}
.pf-ctrl button,.pf-ctrl select{font:inherit;font-size:14px;padding:6px 12px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--ink);cursor:pointer}
.pf-seek{flex:1;min-width:140px;accent-color:var(--accent)} .pf-time{font-size:13px;color:var(--muted);font-variant-numeric:tabular-nums}
.pf-legend{display:flex;gap:16px;flex-wrap:wrap;padding:0 16px 10px;font-size:12px;color:var(--muted)}
.pf-key{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:5px;vertical-align:-1px;border:1px solid var(--line)}
.pf-key.pf-p{background:rgba(238,96,56,.35)} .pf-key.pf-x{background:rgba(52,82,138,.25)} .pf-key.pf-t{background:var(--paper)} .pf-note{margin-left:auto}`; }
  // the app's own copy of the player styles
  { const st = document.createElement('style'); st.textContent = PLAYER_CSS().replace(/var\(--ink\)/g, 'var(--text)'); document.head.appendChild(st); }

  return { open, renderStatus, recordings, play, setReplay, setRemind, pauseVideo, isOn: () => R.on, flush, stopVideo, saveReport, timelapse, startVideo, loadSessions, QUALITY, _engine: ENGINE, _R: R, _V: V };
})();
