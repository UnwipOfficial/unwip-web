// Unwip - bulleted and numbered lists, the way plain-text writing apps do them: a "• " or "1. " at the start of a
// paragraph. Every export (Word, Scrivener, e-book, Markdown, PDF) already carries paragraphs, so a list goes
// everywhere the book goes, exactly as it looks.
//   - type "- " or "* " at the start of a line for a bullet, "1. " for a numbered list
//   - Enter carries the list on (the next number, or another bullet); Enter on an empty item ends the list
//   - Backspace straight after the marker takes the marker away; straight after "- " became a bullet, it puts the "- " back
//   - the list buttons (and Ctrl+Shift+8 / Ctrl+Shift+7) turn the chosen paragraphs into a list, or back
window.UnwipLists = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return null;
  const editor = U.editor; if (!editor) return null;
  const BULLET = '• ';
  const NUM = /^(\d{1,3})([.)])[ \u00a0]/;   // (a browser types a non-breaking space at the end of a line)
  const BUL = /^[•◦▪‣·][ \u00a0]/;

  const blockOf = node => { while (node && node !== editor) { if (node.nodeType === 1 && /^(P|H[1-6]|BLOCKQUOTE|LI|DIV)$/.test(node.tagName) && node.parentNode === editor) return node; node = node.parentNode; } return null; };
  const marker = el => { const t = (el && el.textContent) || ''; let m; if ((m = BUL.exec(t))) return { kind: 'b', len: m[0].length, text: m[0] }; if ((m = NUM.exec(t))) return { kind: 'n', len: m[0].length, n: +m[1], sep: m[2], text: m[0] }; return null; };
  // a range over the first `len` characters of a paragraph
  function startRange(el, len) {
    const r = document.createRange(), w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n, left = len, first = null;
    while ((n = w.nextNode())) { if (!first) { first = n; r.setStart(n, 0); } if (n.length >= left) { r.setEnd(n, left); return r; } left -= n.length; }
    if (first) { r.setEnd(first, first.length); return r; }
    r.setStart(el, 0); r.setEnd(el, 0); return r;
  }
  function caretAtStart(el) { const r = document.createRange(), w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), t = w.nextNode(); if (t) r.setStart(t, 0); else r.setStart(el, 0); r.collapse(true); return r; }
  // text replacement through the editor itself, so Undo puts it back
  function replaceAt(range, text) {
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
    if (text) document.execCommand('insertText', false, text); else if (!range.collapsed) document.execCommand('delete');
  }
  const caretOffsetIn = el => { const sel = getSelection(); if (!sel.rangeCount) return -1; const r = sel.getRangeAt(0); if (!el.contains(r.startContainer)) return -1; const pre = document.createRange(); pre.selectNodeContents(el); pre.setEnd(r.startContainer, r.startOffset); return pre.toString().length; };

  // ---- the buttons: the chosen paragraphs become a list, or stop being one
  function toggle(kind) {
    const sel = getSelection(); if (!sel.rangeCount || !editor.contains(sel.anchorNode)) { editor.focus(); return; }
    const r = sel.getRangeAt(0);
    const a = blockOf(r.startContainer), b = blockOf(r.endContainer) || a; if (!a) return;
    const blocks = []; for (let el = a; el; el = el.nextElementSibling) { blocks.push(el); if (el === b) break; }
    const allThis = blocks.every(el => { const m = marker(el); return m && m.kind === kind; });
    let n = 1;
    if (!allThis && kind === 'n') { const prev = a.previousElementSibling, pm = marker(prev); if (pm && pm.kind === 'n') n = pm.n + 1; }
    U.S.programmatic = true;
    try {
      for (const el of blocks) {
        const m = marker(el);
        if (!allThis && !(el.textContent || '').slice(m ? m.len : 0).trim() && blocks.length > 1) continue;   // blank lines inside a selection don't become items
        if (allThis) { if (m) replaceAt(startRange(el, m.len), ''); continue; }
        const want = kind === 'b' ? BULLET : `${n++}. `;
        if (m) replaceAt(startRange(el, m.len), want); else replaceAt(caretAtStart(el), want);
      }
    } finally { U.S.programmatic = false; }
    // the cursor goes to the end of the last item
    const last = blocks[blocks.length - 1], end = document.createRange(); end.selectNodeContents(last); end.collapse(false); sel.removeAllRanges(); sel.addRange(end);
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // ---- typing
  // Enter on an item: an empty item ends the list; otherwise the new paragraph gets the next marker
  let carry = null;
  editor.addEventListener('keydown', e => {
    if (e.defaultPrevented || e.isComposing) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.shiftKey && !e.altKey && (e.code === 'Digit8' || e.code === 'Digit7')) { e.preventDefault(); toggle(e.code === 'Digit8' ? 'b' : 'n'); return; }
    const sel = getSelection(); if (!sel.rangeCount || !sel.isCollapsed) return;
    const el = blockOf(sel.anchorNode), m = marker(el); if (!m) return;
    const at = caretOffsetIn(el);
    if (e.key === 'Enter' && !e.shiftKey && !mod) {
      if ((el.textContent || '').trim().length <= m.text.trim().length && at >= m.len - 1) {   // an empty item: the list ends here
        e.preventDefault(); U.S.programmatic = true; try { replaceAt(startRange(el, m.len), ''); } finally { U.S.programmatic = false; }
        editor.dispatchEvent(new Event('input', { bubbles: true })); return;
      }
      if (at >= m.len) carry = m.kind === 'b' ? BULLET : `${m.n + 1}${m.sep} `;
    } else if (e.key === 'Backspace' && !mod && at === m.len) { e.preventDefault(); backAtMarker(el, m); }
  }, true);
  // an iPhone or iPad keyboard may not say which key it was, so a backspace there is caught as it's about to delete
  editor.addEventListener('beforeinput', e => {
    if (e.inputType !== 'deleteContentBackward') return;
    const sel = getSelection(); if (!sel.rangeCount || !sel.isCollapsed) return;
    const el = blockOf(sel.anchorNode), m = marker(el); if (!m || caretOffsetIn(el) !== m.len) return;
    e.preventDefault(); backAtMarker(el, m);
  }, true);
  // Backspace straight after the marker: a bullet that "- " or "* " just turned into goes back to what was typed
  // (like a phone's autocorrect), otherwise the marker goes
  let auto = null;
  function backAtMarker(el, m) {
    const undo = auto && auto.el === el && m.kind === 'b' ? auto.typed : ''; auto = null;
    U.S.programmatic = true; try { replaceAt(startRange(el, m.len), undo); } finally { U.S.programmatic = false; }
    if (undo) { const r = startRange(el, undo.length); r.collapse(false); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
    // a numbered item taken out of the list: the ones after it move up to close the gap (3. becomes 2.)
    if (m.kind === 'n') { const nx = el.nextElementSibling; if (isNum(nx)) renumberRun(nx, m.n); }
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }
  editor.addEventListener('input', e => {
    if (!U.S.programmatic) auto = null;   // anything typed after the bullet keeps it
    if (e.inputType === 'insertParagraph' && carry) {
      const want = carry; carry = null;
      const sel = getSelection(); const el = sel.rangeCount && blockOf(sel.anchorNode);
      if (el && !marker(el)) { U.S.programmatic = true; try { replaceAt(caretAtStart(el), want); } finally { U.S.programmatic = false; } }
      // the rest of the list renumbers after an item is added in the middle
      if (el && /^\d/.test(want)) renumberFrom(el);
      return;
    }
    carry = null;
    // an item deleted (or two merged): the numbered list it was in counts up 1, 2, 3 again from its first number
    if (/^delete/.test(e.inputType || '')) {
      const sel = getSelection(); const el = sel.rangeCount && blockOf(sel.anchorNode);
      if (el && isNum(el)) { let first = el; while (isNum(first.previousElementSibling)) first = first.previousElementSibling; renumberRun(first, marker(first).n); }
      return;
    }
    // "- " or "* " at the start of a paragraph becomes a bullet
    if (e.inputType === 'insertText' && (e.data === ' ' || e.data === '\u00a0')) {
      const sel = getSelection(); if (!sel.rangeCount) return;
      const el = blockOf(sel.anchorNode); if (!el) return;
      const t = el.textContent || '';
      if (/^[-*][ \u00a0]/.test(t) && caretOffsetIn(el) === 2) { U.S.programmatic = true; try { replaceAt(startRange(el, 2), BULLET); } finally { U.S.programmatic = false; } auto = { el, typed: t.slice(0, 2) }; }
    }
  });
  const isNum = el => { const m = el && marker(el); return !!(m && m.kind === 'n'); };
  // number a run of numbered items n, n+1, n+2… (only the ones that are wrong change; the cursor stays put)
  function renumberRun(first, n) {
    const sel = getSelection(), keep = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    let el = first, guard = 0, changed = false;
    U.S.programmatic = true;
    try {
      while (isNum(el) && guard++ < 500) { const m = marker(el); if (m.n !== n) { replaceAt(startRange(el, m.len), `${n}${m.sep} `); changed = true; } n++; el = el.nextElementSibling; }
    } finally { U.S.programmatic = false; }
    if (keep) { sel.removeAllRanges(); sel.addRange(keep); }
    return changed;
  }
  // numbers after an inserted item move up by one, while the list goes on
  function renumberFrom(el) {
    let m = marker(el); if (!m || m.kind !== 'n') return;
    let n = m.n, next = el.nextElementSibling, guard = 0;
    const sel = getSelection(), keep = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    U.S.programmatic = true;
    try {
      while (next && guard++ < 500) {
        const nm = marker(next); if (!nm || nm.kind !== 'n') break;
        if (nm.n !== n + 1) replaceAt(startRange(next, nm.len), `${n + 1}${nm.sep} `);
        n++; next = next.nextElementSibling;
      }
    } finally { U.S.programmatic = false; }
    if (keep) { sel.removeAllRanges(); sel.addRange(keep); }
  }

  // ---- the toolbar buttons (in index.html, so the toolbar can tuck them away on a narrow window)
  for (const [id, kind] of [['btn-bullets', 'b'], ['btn-numbers', 'n']]) { const b = document.getElementById(id); if (b) { b.addEventListener('mousedown', e => e.preventDefault()); b.onclick = () => toggle(kind); } }
  return { toggle, marker };
})();
