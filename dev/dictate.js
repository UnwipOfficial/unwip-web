// Unwip - Dictation mode (owner, 5 Nov). The listening is the device's own: Unwip has no AI, so it never turns speech
// into words itself. On an iPhone, iPad or Mac in Safari (and the web version there), tapping Dictate starts Apple's
// speech recognition through the browser (the same one the keyboard's mic uses; the device asks for the microphone the
// first time) and the words go in at the cursor. Elsewhere (the PC and Mac apps, other browsers) it's the device's own
// dictation by hand: Windows+H on a PC, the mic key or Fn twice on a Mac. What Unwip adds is the mode: switched on by the writer, it shows in raspberry (Record is red, Revise purple)
// on the Dictate pill, a bar along the top of the page and the cursor, so a screen video shows it; words that arrive
// while it's on get a faint underline until it's switched off (a highlight only, never saved or exported); and a
// replay counts them as dictated (proof.js kind 'v').
window.UnwipDictate = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return;
  const { $, $$, S, api } = U;
  const editor = U.editor;
  const D = { on: false, since: 0, timer: 0, ranges: [], hl: null, inType: '', inData: '', rec: null, live: false, fails: 0, saved: null, box: null };

  const ua = navigator.userAgent || '';
  const ios = /iPhone|iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const mac = !ios && (api.platform === 'darwin' || /Macintosh/.test(ua));
  const win = !ios && !mac && (api.platform === 'win32' || /Windows/.test(ua));
  // Apple's speech recognition, through Safari. Not in the PC or Mac app (Electron has the name but no service behind it)
  // or Chrome and Edge (they send the audio to Google): there the device's own dictation stays the way in.
  // (__dictateSR: a stand-in recogniser for the checks)
  const SR = () => window.__dictateSR || ((api.web && (ios || (/Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|Edg\/|Firefox/.test(ua)))) ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null);
  function how() {
    if (D.live) return 'Listening: talk, and your words go in at the cursor. Tap Dictating when you’re done.';
    if (ios) return 'Tap the mic on your keyboard and start talking. Tap Dictating when you’re done.';
    if (mac) return 'Start your Mac’s dictation (the mic key, or press Fn twice) and start talking. Click Dictating when you’re done.';
    if (win) return 'Press Windows+H to start Windows voice typing, then start talking. Click Dictating when you’re done.';
    return 'Start your device’s dictation (the mic on the keyboard) and start talking. Tap Dictating when you’re done.';
  }
  const clock = ms => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  // ---- the underline on words said in this stretch
  function hlSet() {
    try {
      if (!window.CSS || !CSS.highlights || typeof Highlight === 'undefined') return;
      if (!D.hl) D.hl = new Highlight();
      D.hl.clear(); for (const r of D.ranges) D.hl.add(r);
      if (D.ranges.length) CSS.highlights.set('dictated', D.hl); else CSS.highlights.delete('dictated');
    } catch {}
  }
  function clearMarks() { D.ranges = []; hlSet(); }
  if (editor) {
    editor.addEventListener('beforeinput', e => {
      D.inType = e.inputType || '';
      D.inData = e.data != null ? e.data : (e.dataTransfer && e.dataTransfer.getData ? e.dataTransfer.getData('text/plain') : '') || '';
    }, true);
    editor.addEventListener('input', e => {
      if (!D.on) return;
      const t = e.inputType || D.inType;
      if (!/^insert(Text|ReplacementText|CompositionText|FromDictation|FromComposition)?$/.test(t)) return;
      const n = (e.data != null ? e.data : D.inData || '').length;
      const sel = getSelection(); if (!n || !sel.rangeCount || !sel.isCollapsed) return;
      const node = sel.anchorNode, off = sel.anchorOffset;
      if (!node || node.nodeType !== 3 || off < n || !editor.contains(node)) return;
      try {
        const r = document.createRange(); r.setStart(node, off - n); r.setEnd(node, off);
        // a word typed straight after the last one extends it rather than adding another mark
        const L = D.ranges[D.ranges.length - 1];
        if (L && L.endContainer === node && L.endOffset === off - n) L.setEnd(node, off); else D.ranges.push(r);
        if (D.ranges.length > 400) D.ranges.shift();
        hlSet();
      } catch {}
    });
  }

  // ---- on and off
  function render() {
    const on = D.on, t = on ? clock(Date.now() - D.since) : '';
    document.documentElement.classList.toggle('dictating', on);
    $$('.dict-btn').forEach(b => {
      b.classList.toggle('on', on);
      b.innerHTML = `${window.ICONS ? window.ICONS.mic : ''}<span>${on ? `Dictating · ${t}` : 'Dictate'}</span>`;
      b.title = on ? 'Dictating: click to stop (F9)' : 'Dictate: talk instead of typing, with your device’s own dictation (F9)';
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const tb = $('#btn-dict'); if (tb) { tb.classList.toggle('on', on); tb.setAttribute('aria-pressed', on ? 'true' : 'false'); tb.title = on ? 'Stop dictating (F9)' : 'Dictate: talk instead of typing, with your device’s own dictation (F9)'; }
    $$('.m-fdict').forEach(b => { b.classList.toggle('on', on); b.innerHTML = `${window.ICONS ? window.ICONS.mic : ''}<span>${on ? 'Dictating' : 'Dictate'}</span>`; });
  }
  // ---- listening (Apple devices)
  const sp = () => { const sel = getSelection(); if (sel.rangeCount && editor.contains(sel.anchorNode)) D.saved = sel.getRangeAt(0).cloneRange(); };
  function preview(text) {
    if (!D.box) { D.box = document.createElement('div'); D.box.className = 'dict-live'; D.box.setAttribute('aria-live', 'polite'); document.body.appendChild(D.box); }
    D.box.hidden = !D.on || !D.live; D.box.textContent = text || 'Listening…';
  }
  // the words go in where the cursor is, as typing would (so Undo, autocorrect, word counts and a replay all see them)
  function put(text) {
    text = String(text || '').replace(/\s+/g, ' ').trim(); if (!text) return;
    try {
      if (document.activeElement !== editor) editor.focus({ preventScroll: true });
      const sel = getSelection();
      if (!(sel.rangeCount && editor.contains(sel.anchorNode)) && D.saved) { sel.removeAllRanges(); sel.addRange(D.saved); }
      if (!(sel.rangeCount && editor.contains(sel.anchorNode))) return;
      // what comes before the cursor in this paragraph (the cursor can sit between elements, not only in text)
      const r = sel.getRangeAt(0); let before = '';
      try { let blk = r.startContainer.nodeType === 3 ? r.startContainer.parentNode : r.startContainer; while (blk && blk.parentNode !== editor && blk !== editor) blk = blk.parentNode;
        if (blk && blk !== editor) { const b = document.createRange(); b.setStart(blk, 0); b.setEnd(r.startContainer, r.startOffset); before = b.toString(); } } catch {}
      const needSpace = before && !/[\s (“"‘'\[—-]$/.test(before) && !/^[.,;:!?…)”’\]]/.test(text);
      const startOfSentence = !before.trim() || /[.!?…]["”’)\]]?\s*$/.test(before);
      if (startOfSentence) text = text.charAt(0).toUpperCase() + text.slice(1);
      D.inType = 'insertText'; D.inData = (needSpace ? ' ' : '') + text;
      document.execCommand('insertText', false, D.inData);
      sp();
    } catch (e) { console.error('dictate', e); }
  }
  function listen() {
    const R = SR(); if (!R) return false;
    let rec;
    try { rec = new R(); } catch { return false; }
    rec.lang = navigator.language || 'en-AU'; rec.continuous = true; rec.interimResults = true;
    rec.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i], t = res[0] ? res[0].transcript : '';
        if (res.isFinal) put(t); else interim += t;
      }
      D.fails = 0; preview(interim.trim());
    };
    rec.onerror = e => {
      const k = e && e.error;
      if (k === 'not-allowed' || k === 'service-not-allowed') {
        D.live = false; stop();
        U.toast(ios ? 'Dictate needs the microphone. Allow it for this site in Settings › Apps › Safari › Microphone (or tap Allow when asked), then tap Dictate again.' : 'Dictate needs the microphone. Allow it for this site in the browser’s settings, then click Dictate again.', 'warn', 12000);
      } else if (k === 'audio-capture') { D.live = false; stop(); U.toast('No microphone was found.', 'warn'); }
      else if (k === 'network') { D.fails++; }
    };
    // iOS stops listening after a pause or about a minute; while Dictate is on it starts again
    rec.onend = () => {
      if (!D.on || D.rec !== rec) return;
      if (++D.fails > 4) { D.live = false; render(); preview(); U.toast('Dictate stopped listening. Tap Dictating, then Dictate, to start again.', 'warn', 9000); return; }
      setTimeout(() => { if (D.on && D.rec === rec) try { rec.start(); } catch { } }, 250);
    };
    try { rec.start(); } catch { return false; }
    D.rec = rec; D.live = true; D.fails = 0; preview();
    return true;
  }
  function start() {
    if (D.on) return;
    if (!S.docId) { U.toast('Open a chapter first, then switch on Dictate.'); return; }
    D.on = true; D.since = Date.now(); clearMarks();
    clearInterval(D.timer); D.timer = setInterval(render, 1000);
    // the device's dictation types where the cursor is, so the page keeps it
    try { if (document.activeElement !== editor) editor.focus({ preventScroll: true }); } catch {}
    sp();
    // straight from the tap: Safari only starts listening (and asks for the microphone) inside one
    listen();
    render();
    let seen = 0; try { seen = +localStorage.getItem(D.live ? 'unwip-dictate-tips-live' : 'unwip-dictate-tips') || 0; } catch {}
    if (seen < 3) { U.toast(how(), '', 9000); try { localStorage.setItem(D.live ? 'unwip-dictate-tips-live' : 'unwip-dictate-tips', String(seen + 1)); } catch {} }
    U.emit && U.emit('dictate', true);
  }
  function stop() {
    if (!D.on) return;
    D.on = false; clearInterval(D.timer);
    const r = D.rec; D.rec = null; D.live = false;
    if (r) { try { r.onend = null; r.stop(); } catch {} }
    clearMarks(); preview(); render();
    U.emit && U.emit('dictate', false);
  }
  const toggle = () => D.on ? stop() : start();

  // ---- where it lives: next to Record in the status bar, beside Read aloud in the toolbar, the phone's format row
  const pill = document.createElement('button');
  pill.type = 'button'; pill.className = 'st-btn dict-btn'; pill.id = 'st-dict';
  const proof = $('#st-proof'); if (proof) proof.after(pill);
  pill.addEventListener('mousedown', e => e.preventDefault());   // the page keeps the cursor
  pill.addEventListener('click', toggle);
  const tb = $('#btn-dict');
  if (tb) { tb.addEventListener('mousedown', e => e.preventDefault()); tb.addEventListener('click', toggle); }
  document.addEventListener('keydown', e => { if (e.key === 'F9' && !e.ctrlKey && !e.metaKey && !e.altKey && S.docId) { e.preventDefault(); toggle(); } });
  document.addEventListener('selectionchange', () => { if (D.on) sp(); });
  if (U.on) {
    U.on('leave', stop); U.on('project', stop);
    U.on('doc', () => { if (D.on) clearMarks(); });
  }
  render();

  return { toggle, start, stop, how, get on() { return D.on; }, get listening() { return D.live; }, get marks() { return D.ranges.length; } };
})();
