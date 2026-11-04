// Unwip - Dictation mode (owner, 5 Nov). The listening is the device's own dictation (the mic on the iPhone or iPad
// keyboard, the mic key or Fn twice on a Mac, Windows+H on a PC): Unwip has no AI, so it never turns speech into words
// itself. What Unwip adds is the mode: switched on by the writer, it shows in raspberry (Record is red, Revise purple)
// on the Dictate pill, a bar along the top of the page and the cursor, so a screen video shows it; words that arrive
// while it's on get a faint underline until it's switched off (a highlight only, never saved or exported); and a
// replay counts them as dictated (proof.js kind 'v').
window.UnwipDictate = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return;
  const { $, $$, S, api } = U;
  const editor = U.editor;
  const D = { on: false, since: 0, timer: 0, ranges: [], hl: null, inType: '', inData: '' };

  const ua = navigator.userAgent || '';
  const ios = /iPhone|iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const mac = !ios && (api.platform === 'darwin' || /Macintosh/.test(ua));
  const win = !ios && !mac && (api.platform === 'win32' || /Windows/.test(ua));
  function how() {
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
  function start() {
    if (D.on) return;
    if (!S.docId) { U.toast('Open a chapter first, then switch on Dictate.'); return; }
    D.on = true; D.since = Date.now(); clearMarks();
    clearInterval(D.timer); D.timer = setInterval(render, 1000);
    render();
    // the device's dictation types where the cursor is, so the page keeps it
    try { if (document.activeElement !== editor) editor.focus({ preventScroll: true }); } catch {}
    let seen = 0; try { seen = +localStorage.getItem('unwip-dictate-tips') || 0; } catch {}
    if (seen < 3) { U.toast(how(), '', 9000); try { localStorage.setItem('unwip-dictate-tips', String(seen + 1)); } catch {} }
    U.emit && U.emit('dictate', true);
  }
  function stop() {
    if (!D.on) return;
    D.on = false; clearInterval(D.timer); clearMarks(); render();
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
  if (U.on) {
    U.on('leave', stop); U.on('project', stop);
    U.on('doc', () => { if (D.on) clearMarks(); });
  }
  render();

  return { toggle, start, stop, how, get on() { return D.on; }, get marks() { return D.ranges.length; } };
})();
