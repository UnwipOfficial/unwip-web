// Unwip - phones and tablets.
// On a phone (narrow screen) Unwip works as screens you move between, like most iPhone writing apps:
//   1. Chapters  - the binder as a full screen, with a toolbar along the bottom
//   2. Page      - one chapter, "‹ Manuscript" to go back, ∧ ∨ to step through chapters, tools along the bottom
//   3. Typing    - undo / redo / word count / Done at the top, and a formatting row sitting on the keyboard
// Tablets and computers keep the normal layout (touch screens just get bigger targets and tap-for-tips).
window.UnwipMobile = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return;
  const { $, $$, S, editor, esc } = U;
  const phone = window.matchMedia('(max-width: 720px)');
  const root = document.documentElement;
  const ws = $('#workspace');
  const svg = (d, w = 22) => `<svg viewBox="0 0 24 24" width="${w}" height="${w}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const IC = {
    back: svg('<path d="M15 5l-7 7 7 7"/>', 24), up: svg('<path d="M6 15l6-6 6 6"/>'), down: svg('<path d="M6 9l6 6 6-6"/>'),
    undo: svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>'), redo: svg('<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 000 12h3"/>'),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'), more: svg('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'),
    aa: svg('<path d="M3 19l5-13 5 13M4.8 14.5h6.4"/><path d="M15 12.5a3 3 0 116 0V19M21 16.2c-1 1.8-6 2.6-6-.3 0-2 3-2.2 6-2"/>'),
    note: svg('<path d="M5 5h14v10H9l-4 4z"/>'), scene: svg('<path d="M5 12h.01M12 12h.01M19 12h.01"/>', 22), keyboard: svg('<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"/>')
  };

  // ------------------------------------------------------------------ screen 1: chapters (the binder, full screen)
  const binder = $('#binder');
  const bhead = document.createElement('div'); bhead.className = 'm-bhead';
  bhead.innerHTML = `<button class="m-icon" id="m-lib" aria-label="Back to your books">${IC.back}</button><div class="m-btitle" id="m-btitle"></div><button class="m-link" id="m-continue" hidden>Continue</button>`;
  binder.insertBefore(bhead, binder.firstChild);
  $('#m-lib').onclick = () => $('#btn-library').click();
  $('#m-continue').onclick = () => showPage();

  // ------------------------------------------------------------------ screen 2: the page
  const phead = document.createElement('header'); phead.className = 'm-phead';
  phead.innerHTML = `
    <div class="m-read">
      <button class="m-back" id="m-back">${IC.back}<span id="m-back-label">Chapters</span></button>
      <div class="m-ptitle" id="m-ptitle"></div>
      <button class="m-icon" id="m-prev" aria-label="Previous chapter">${IC.up}</button><button class="m-icon" id="m-next" aria-label="Next chapter">${IC.down}</button>
    </div>
    <div class="m-edit">
      <button class="m-icon" id="m-undo" aria-label="Undo">${IC.undo}</button><button class="m-icon" id="m-redo" aria-label="Redo">${IC.redo}</button>
      <div class="m-wc" id="m-wc"></div>
      <button class="m-icon" id="m-find" aria-label="Find">${IC.search}</button><button class="m-done" id="m-done">Done</button>
    </div>`;
  ws.insertBefore(phead, ws.firstChild);
  const pfoot = document.createElement('nav'); pfoot.className = 'm-pfoot';
  pfoot.innerHTML = `
    <button class="m-tab revise" id="m-revise"><span>Revise</span></button>
    <button class="m-tab stuck" id="m-stuck"><span>Spark</span></button>
    <button class="m-tab" id="m-build"><span>Build</span></button>
    <button class="m-icon" id="m-cmdk" aria-label="Find anything">${IC.search}</button>
    <button class="m-icon" id="m-notes" aria-label="Comments &amp; footnotes">${IC.note}</button>
    <button class="m-icon" id="m-style" aria-label="Manuscript style">${IC.aa}</button>
    <button class="m-icon" id="m-more" aria-label="More">${IC.more}</button>`;
  ws.appendChild(pfoot);
  const click = sel => { const el = $(sel); if (el) el.click(); };
  // after "Open beside" (split view) on a phone, ‹ goes back to the chapter you came from
  $('#m-back').onclick = async () => {
    editor.blur();
    const back = S.phoneReturn && U.findNode(S.phoneReturn) ? S.phoneReturn : null; S.phoneReturn = null;
    if (back && !document.querySelector('#workspace .mp-view')) { await U.openDoc(back); showPage(); return; }
    showBinder();
  };
  $('#m-revise').onclick = () => click('#btn-revise');
  $('#m-cmdk').onclick = () => window.UnwipCommand && window.UnwipCommand.open();
  $('#m-stuck').onclick = () => click('#btn-stuck');
  $('#m-build').onclick = () => window.UnwipBuild && window.UnwipBuild.fromBook();
  $('#m-notes').onclick = () => click('#btn-notes');
  $('#m-style').onclick = () => click('#btn-style');
  $('#m-more').onclick = e => {
    const r = e.currentTarget.getBoundingClientRect();
    U.showMenu(Math.max(8, r.right - 250), r.top - 8, [
      { label: 'Export… (PDF, EPUB, Word, Scrivener)', action: () => click('#btn-export') },   // the PC's Export button is in the top bar, which a phone hides
      { label: 'Copy for Docs', action: () => click('#btn-copy-docs') },
      { label: 'Snapshots (saved versions)', action: () => window.UnwipSide && window.UnwipSide.open('snapshots') },
      { label: 'Read aloud', action: () => window.UnwipRead && window.UnwipRead.open() },
      { label: 'Dialogue view', action: () => window.UnwipDialogue && window.UnwipDialogue.toggle('dialogue') },
      { label: 'Find in this chapter', action: () => click('#m-find') },
      { label: 'Writer mode', action: () => click('#btn-writer') },
      { label: window.UnwipProof && window.UnwipProof.isOn() ? 'Record (Replay is on)' : 'Record (proof of writing)', action: () => window.UnwipProof && window.UnwipProof.open() },
      { sep: true },
      { label: 'Help', action: () => window.UnwipHelp && window.UnwipHelp.open() }
    ], { up: true });
    // keep the menu above the bottom bar
    requestAnimationFrame(() => { const m = $('#menu'); if (m) { const h = m.offsetHeight; m.style.top = Math.max(8, r.top - h - 8) + 'px'; } });
  };

  // chapters in binder order, for ∧ ∨
  function siblings() {
    if (!S.project || !S.docId) return [];
    const rt = U.rootOf(S.docId); const out = [];
    U.walkTree([rt], n => { if (n.type === 'doc' && !n.map) out.push(n.id); });
    return out;
  }
  const step = d => { const l = siblings(), i = l.indexOf(S.docId); if (i >= 0 && l[i + d]) U.openDoc(l[i + d], { from: 'list' }).then(refreshHead); };
  $('#m-prev').onclick = () => step(-1);
  $('#m-next').onclick = () => step(1);

  // ------------------------------------------------------------------ screen 3: typing
  const mark = (sel, on) => root.classList.toggle(sel, on);
  $('#m-done').onclick = () => { editor.blur(); getSelection().removeAllRanges(); mark('m-editing', false); };
  const cmd = c => { try { document.execCommand(c); } catch {} U.scheduleSave(); U.updateCountsSoon(); fmtState(); };
  $('#m-undo').onclick = () => cmd('undo');
  $('#m-redo').onclick = () => cmd('redo');
  $('#m-find').onclick = () => { const k = new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true }); document.dispatchEvent(k); };

  // the formatting row that sits on top of the keyboard
  const fbar = document.createElement('div'); fbar.className = 'm-fbar';
  fbar.innerHTML = `
    <button data-c="bold" aria-label="Bold"><b>B</b></button><button data-c="italic" aria-label="Italic"><i>I</i></button>
    <button data-c="underline" aria-label="Underline"><u>U</u></button><button data-c="strikeThrough" aria-label="Strikethrough"><s>S</s></button>
    <span class="m-fsep"></span>
    <button data-b="p" class="m-fwide">Body</button><button data-b="h1" class="m-fwide">Title</button><button data-b="h2" class="m-fwide">H2</button>
    <button data-x="font" class="m-fwide m-faa" aria-label="Font and size">Aa</button>
    <span class="m-fsep"></span>
    <button data-x="scene" aria-label="Scene break">${IC.scene}</button><button data-x="comment" aria-label="Add a comment">${IC.note}</button><button data-x="hide" aria-label="Hide keyboard">${IC.keyboard}</button>`;
  document.body.appendChild(fbar);
  // buttons on the keyboard row must not take the cursor away from the page (that would close the keyboard)
  const act = b => {
    if (b.dataset.c) cmd(b.dataset.c);
    else if (b.dataset.b) { const sel = $('#sel-block'); if (sel) { sel.value = b.dataset.b; sel.dispatchEvent(new Event('change', { bubbles: true })); } setTimeout(fmtState, 30); }
    else if (b.dataset.x === 'scene') click('#btn-scene');
    else if (b.dataset.x === 'comment') click('#btn-comment');
    else if (b.dataset.x === 'hide') $('#m-done').click();
    else if (b.dataset.x === 'font') toggleFontSheet();
  };
  // Aa: font and size for the selected words (or what you type next), in a sheet above the keyboard row
  const fsheet = document.createElement('div'); fsheet.className = 'm-fsheet'; fsheet.hidden = true;
  document.body.appendChild(fsheet);
  const curFont = () => { const v = ($('#sel-font') || {}).value; return v && v !== '__import' ? v : ''; };
  const curSize = () => parseFloat(($('#sel-size') || {}).value) || 12;
  const SIZES = [8, 9, 10, 10.5, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];
  // the phone's own list: your starred fonts, Unwip's fonts, imported ones, then the ones this iPhone or iPad has
  function fontGroups() {
    const F = window.FolioFonts; if (!F || !F.deviceFonts) return [];
    const d = F.deviceFonts(), favs = ((S.settings || {}).fontFavs || []).filter(f => F.canShow(f) || F.SAME[f]).map(f => F.SAME[f] || f);
    const g = [['★ Your favourites', [...new Set(favs)]], ['Unwip’s book fonts', d.own], ['Imported', d.imp], ['On this device', d.here]].filter(x => x[1].length);
    const f = curFont(), shown = F.SAME[f] || f;
    if (f && !g.some(x => x[1].includes(shown))) g.unshift(['', [f]]);   // the font you're in, even if this device can't show it
    return g;
  }
  function drawFontSheet() {
    const f = curFont(), z = curSize();
    fsheet.innerHTML = `<div class="m-fs-size"><span>Size</span><button data-z="-1" aria-label="Smaller">A−</button><b>${z} pt</b><button data-z="1" aria-label="Bigger">A+</button><button data-z="x" class="m-fs-done">Done</button></div>
      <div class="m-fs-list">${fontGroups().map(([label, names]) => (label ? `<div class="m-fs-group">${U.esc(label)}</div>` : '') + names.map(n => {
        const on = n === f || (window.FolioFonts.SAME[f] === n);
        const away = on && n === f && !window.FolioFonts.canShow(n) && !window.FolioFonts.SAME[f];
        return `<button data-f="${U.esc(n)}" class="${on ? 'on' : ''}" style="font-family:'${U.esc(n)}'">${U.esc(n)}${on ? ` <span>${away ? 'on your PC ' : ''}✓</span>` : ''}</button>`;
      }).join('')).join('')}</div>`;
  }
  function setSel(id, v) { const el = $(id); if (!el) return; el.value = String(v); el.dispatchEvent(new Event('change', { bubbles: true })); }
  function toggleFontSheet(open) {
    open = open == null ? fsheet.hidden : open;
    fsheet.hidden = !open; fbar.querySelector('.m-faa').classList.toggle('on', open);
    if (open) { try { U.refreshToolbar(); } catch {} drawFontSheet(); const on = $('.m-fs-list .on', fsheet); if (on) on.scrollIntoView({ block: 'center' }); }
  }
  const sheetAct = b => {
    if (b.dataset.f) { setSel('#sel-font', b.dataset.f); setTimeout(drawFontSheet, 30); }
    else if (b.dataset.z === 'x') toggleFontSheet(false);
    else if (b.dataset.z) { const z = curSize(); const i = SIZES.findIndex(v => v >= z); const n = b.dataset.z === '1' ? SIZES[Math.min(SIZES.length - 1, SIZES[i] > z ? i : i + 1)] : SIZES[Math.max(0, (i < 0 ? SIZES.length : i) - 1)]; setSel('#sel-size', n); setTimeout(drawFontSheet, 30); }
  };
  // like the row: a tap counts only if your finger didn't slide, and it never takes the cursor off the page
  let sy = 0, smoved = false;
  fsheet.addEventListener('touchstart', e => { sy = e.touches[0].clientY; smoved = false; }, { passive: true });
  fsheet.addEventListener('touchmove', e => { if (Math.abs(e.touches[0].clientY - sy) > 8) smoved = true; }, { passive: true });
  fsheet.addEventListener('touchend', e => { const b = e.target.closest('button'); if (b) e.preventDefault(); if (b && !smoved) sheetAct(b); }, { passive: false });
  fsheet.addEventListener('mousedown', e => { e.preventDefault(); const b = e.target.closest('button'); if (b) sheetAct(b); });
  document.addEventListener('selectionchange', () => { if (!fsheet.hidden) { clearTimeout(fsheet.t); fsheet.t = setTimeout(() => { try { U.refreshToolbar(); } catch {} drawFontSheet(); }, 150); } });
  // the row scrolls sideways (like Scrivener's), so a tap only counts if your finger didn't slide
  let tx = 0, moved = false;
  fbar.addEventListener('touchstart', e => { tx = e.touches[0].clientX; moved = false; }, { passive: true });
  fbar.addEventListener('touchmove', e => { if (Math.abs(e.touches[0].clientX - tx) > 8) moved = true; }, { passive: true });
  fbar.addEventListener('touchend', e => { const b = e.target.closest('button'); e.preventDefault(); if (b && !moved) act(b); }, { passive: false });
  const fadeEdges = () => { const max = fbar.scrollWidth - fbar.clientWidth; fbar.classList.toggle('more-r', fbar.scrollLeft < max - 4); fbar.classList.toggle('more-l', fbar.scrollLeft > 4); };
  fbar.addEventListener('scroll', fadeEdges, { passive: true }); addEventListener('resize', fadeEdges); setTimeout(fadeEdges, 300);
  fbar.addEventListener('mousedown', e => { e.preventDefault(); const b = e.target.closest('button'); if (b) act(b); });
  function fmtState() {
    for (const b of $$('[data-c]', fbar)) { let on = false; try { on = document.queryCommandState(b.dataset.c); } catch {} b.classList.toggle('on', on); }
    const blk = U.currentBlock && U.currentBlock(getSelection().anchorNode);
    const tag = blk ? blk.tagName.toLowerCase() : 'p';
    for (const b of $$('[data-b]', fbar)) b.classList.toggle('on', b.dataset.b === tag);
  }
  document.addEventListener('selectionchange', () => { if (root.classList.contains('m-editing')) fmtState(); });
  // keep the row glued to the top of the keyboard as it opens, closes and the page scrolls
  const vv = window.visualViewport;
  // With a keyboard plugged in (or Bluetooth), the iPhone shows only its floating ^ v ✓ bar and doesn't tell the page
  // it's there: the page stays full height, so our row ended up underneath it. While you're typing and no on-screen
  // keyboard is open, lift the row above that bar.
  const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const HW_BAR = 66;
  let lift = 0;   // how far the row sits above the bottom of the screen (keyboard + room for the iPhone's bar)
  function placeBar() {
    if (!vv) return;
    let kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop, window.__kbTest || 0);   // (__kbTest: a pretend keyboard for the checks)
    const hw = IOS && kb < 30 && document.activeElement === editor && root.classList.contains('m-editing');
    root.classList.toggle('m-hwkb', hw);
    // Since iOS 26 the ^ v ✓ bar can also float over the page above the on-screen keyboard, without the page being told
    // (beta, 22 Oct: it covered the row while typing). On an iPhone or iPad the row always leaves room for it while you
    // type, with either keyboard; when iOS doesn't show the bar, that's a small gap above the keyboard.
    if (IOS && document.activeElement === editor && root.classList.contains('m-editing')) kb += HW_BAR;
    lift = kb;
    fbar.style.transform = `translateY(${-kb}px)`;
    root.style.setProperty('--m-kb', kb + 'px');
  }
  if (vv) { vv.addEventListener('resize', placeBar); vv.addEventListener('scroll', placeBar); }
  // coming back to the app (or the cursor coming back to the page) doesn't always tell the page the keyboard is back
  // (beta, 22 Oct): place the row again then, and once more after the keyboard has finished sliding in
  const replace = () => { placeBar(); setTimeout(placeBar, 350); setTimeout(placeBar, 800); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) replace(); });
  window.addEventListener('pageshow', replace); window.addEventListener('focus', replace);
  editor.addEventListener('focus', replace);
  // ---- the page follows the cursor while you type (beta, 22 Oct): the iPhone keyboard doesn't shrink the page, and the
  // chapter scrolls in its own box, so iOS never scrolled it: the words ran on behind the keyboard and the row above
  // it. After each change, if the cursor is below what you can see (above the keyboard and the formatting row) or above
  // the top bar, the chapter scrolls to keep it in view, with a little room to spare.
  const wrapEl = document.getElementById('editor-wrap');
  function caretBox() {
    const s = getSelection(); if (!s.rangeCount || !editor.contains(s.anchorNode)) return null;
    const r = s.getRangeAt(0).cloneRange(); r.collapse(false);
    const rs = r.getClientRects(); let b = rs.length ? rs[rs.length - 1] : null;
    if (!b || !b.height) { const n = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement; b = n && n.getBoundingClientRect(); }
    return b && b.height ? b : null;
  }
  let followRaf = 0;
  function followCaret() {
    cancelAnimationFrame(followRaf);
    followRaf = requestAnimationFrame(() => {
      if (!phone.matches || document.activeElement !== editor || !wrapEl) return;
      if (U.typewriterActive && U.typewriterActive()) return;   // typewriter scrolling keeps its own place
      const b = caretBox(); if (!b) return;
      placeBar();
      const kb = Math.max(lift, vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0, window.__kbTest || 0);
      const bar = root.classList.contains('m-editing') && fbar.offsetHeight ? fbar.offsetHeight : 0;
      // room below the last line as tall as the keyboard and the row, or there's nothing to scroll into (a phone's page
      // has hardly any space under its last line)
      const pad = kb ? (kb + bar + 60) + 'px' : ''; if (wrapEl.style.paddingBottom !== pad) wrapEl.style.paddingBottom = pad;
      const bottom = window.innerHeight - kb - bar - 16, head = $('.m-phead'), top = Math.max(wrapEl.getBoundingClientRect().top, head ? head.getBoundingClientRect().bottom : 0) + 8;
      if (b.bottom > bottom) wrapEl.scrollTop += b.bottom - bottom + 24;
      else if (b.top < top) wrapEl.scrollTop -= top - b.top + 24;
    });
  }
  editor.addEventListener('input', followCaret);
  editor.addEventListener('keyup', e => { if (/^(Arrow|Enter|Backspace|Delete)/.test(e.key)) followCaret(); });
  if (vv) vv.addEventListener('resize', followCaret);
  // Dialogs and text boxes: the iPhone keyboard doesn't shrink the page, so a dialog centred on the whole screen ends
  // up half behind the keyboard and its ^ v ✓ bar. Dialogs are fitted to the part you can still see, and the box
  // you tap into is brought up into view.
  function fitVisible() {
    if (!vv) return;
    root.style.setProperty('--vv-h', vv.height + 'px');
    root.style.setProperty('--vv-top', vv.offsetTop + 'px');
    root.classList.toggle('m-kb-open', window.innerHeight - vv.height > 120);
  }
  if (vv) { vv.addEventListener('resize', fitVisible); vv.addEventListener('scroll', fitVisible); fitVisible(); }
  document.addEventListener('focusin', e => {
    const t = e.target; if (!vv || t === editor || !t.matches || !t.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea, select')) return;
    // only for an on-screen keyboard, and never once you scroll yourself: Settings focuses its first box, and on a PC
    // scrolling down straight after opening it was pulled back up to that box
    if (!(window.matchMedia && matchMedia('(pointer: coarse)').matches)) return;
    let n = 0, moved = false;
    const stop = () => { moved = true; };
    addEventListener('wheel', stop, { once: true, passive: true }); addEventListener('touchmove', stop, { once: true, passive: true });
    (function check() {
      if (moved) return;
      fitVisible();
      const r = t.getBoundingClientRect(), bottom = vv.offsetTop + vv.height - 12;
      if (r.bottom > bottom || r.top < vv.offsetTop) t.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (++n < 6) setTimeout(check, 150);   // the keyboard (and its bar) arrive in steps
    })();
  });
  // the iPhone doesn't always tell us the keyboard's final height the first time it opens (its ^ v ✓ bar arrives late),
  // so keep re-measuring for a couple of seconds after the keyboard comes up
  let settleUntil = 0;
  function settleBar() {
    const go = !settleUntil || Date.now() > settleUntil; settleUntil = Date.now() + 2000;
    if (!go) return;
    (function tick() { placeBar(); if (Date.now() < settleUntil && root.classList.contains('m-editing')) requestAnimationFrame(tick); else settleUntil = 0; })();
  }
  editor.addEventListener('focus', settleBar); editor.addEventListener('pointerup', settleBar);
  // typing mode only when you tap into the page (or type on a keyboard), not when Unwip moves the cursor itself
  let tappedAt = 0;
  let tappedAnyAt = 0;
  document.addEventListener('pointerdown', e => { tappedAnyAt = Date.now(); tappedAt = editor.contains(e.target) ? Date.now() : 0; }, true);
  const startEditing = () => { if (!phone.matches || root.classList.contains('m-editing')) return; mark('m-editing', true); placeBar(); settleBar(); fmtState(); refreshHead(); setTimeout(fadeEdges, 50); };
  editor.addEventListener('focus', () => { if (Date.now() - tappedAt < 1500) startEditing(); });
  editor.addEventListener('pointerup', () => { if (document.activeElement === editor) startEditing(); });
  editor.addEventListener('keydown', startEditing);
  editor.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== editor) { mark('m-editing', false); toggleFontSheet(false); placeBar(); } }, 120));
  // The iPhone's ^ and v buttons jump to the next box on the page. Behind the chapter that's the synopsis line under
  // the title (Detail), which could be squashed flat, so you were left typing into a box you couldn't see with no way
  // back. While you're writing, a jump like that (no tap, no key pressed) goes straight back to the page.
  let lastKey = 0;
  document.addEventListener('keydown', () => { lastKey = Date.now(); }, true);   // Tab, Ctrl+F and the like are yours
  document.addEventListener('focusin', e => {
    if (!phone.matches || e.target === editor || !root.classList.contains('m-editing')) return;
    if (e.relatedTarget !== editor) return;
    if (Date.now() - tappedAnyAt < 800 || Date.now() - lastKey < 800) return;
    if (!e.target.matches || !e.target.matches('input, textarea, select, [contenteditable="true"]')) return;
    setTimeout(() => { try { editor.focus({ preventScroll: true }); } catch { editor.focus(); } }, 0);
  });
  let wordsT = null;   // counting a long chapter on every key is slow on a phone: count once typing pauses
  editor.addEventListener('input', () => { if (phone.matches) { clearTimeout(wordsT); wordsT = setTimeout(refreshWords, 250); } });

  // ------------------------------------------------------------------ moving between screens
  function refreshWords() { const n = U.countWords(editor.innerText || ''); $('#m-wc').textContent = `${n.toLocaleString()} word${n === 1 ? '' : 's'}`; }
  function refreshHead() {
    if (!S.project) return;
    $('#m-btitle').textContent = S.project.title || '';
    const mapF = document.querySelector('#workspace .mp-view') && S.selectedId && U.findNode(S.selectedId);
    const f = mapF && mapF.node.map ? mapF : S.docId && U.findNode(S.docId);
    $('#m-ptitle').textContent = S.view && S.view !== 'write' ? (VIEW_NAMES[S.view] || '') : f ? (f.node.title || 'Untitled') : '';
    const parent = f && f.parent ? f.parent : null;
    const backTo = S.phoneReturn && U.findNode(S.phoneReturn);
    $('#m-back-label').textContent = backTo ? (backTo.node.title || 'Back').slice(0, 16) : parent ? (parent.root && parent.kind === 'manuscript' ? 'Chapters' : parent.title || 'Back') : 'Chapters';
    const l = siblings(), i = l.indexOf(S.docId);
    $('#m-prev').disabled = i <= 0; $('#m-next').disabled = i < 0 || i >= l.length - 1;
    $('#m-continue').hidden = !S.docId;
    $('#m-continue').textContent = f ? `${(f.node.title || 'Untitled').slice(0, 18)}${(f.node.title || '').length > 18 ? '…' : ''} ›` : 'Continue';
    refreshWords();
    const rv = $('#btn-revise'); $('#m-revise').classList.toggle('on', !!(rv && rv.classList.contains('on')));
    const sk = $('#btn-stuck'); $('#m-stuck').classList.toggle('nudge', !!(sk && sk.classList.contains('nudge')));
  }
  function showBinder() { mark('m-view-page', false); mark('m-view-binder', true); refreshHead(); }
  function showPage() { mark('m-view-binder', false); mark('m-view-page', true); refreshHead(); }
  // tapping a document in the chapter list opens its page; folders open and close
  document.addEventListener('click', e => {
    if (!phone.matches || (window.UnwipBinderEdit && window.UnwipBinderEdit.on)) return;   // Edit: a tap ticks, it doesn't open
    const row = e.target.closest('#binder-tree .tree-row');
    if (!row || e.target.closest('.tr-chev, .tr-add, input.rename')) return;
    if (S.longPress && Date.now() - S.longPress < 1500) return;   // the end of a press-and-hold opens the menu, not the page
    const f = U.findNode(row.dataset.id); if (!f) return;
    S.phoneReturn = null;   // picked from the list yourself: ‹ goes back to the list
    if (f.node.type === 'doc') { if (S.view !== 'write') U.setView('write'); setTimeout(showPage, 60); }
  }, true);   // before the row's own click: opening a map redraws the list, and the tapped row was gone by the time this ran
  // Detail level: Outline, Corkboard, Moodboard and Timeline open as a screen of their own
  const VIEW_NAMES = { outline: 'Outline' };
  // Corkboard, Moodboard and Timeline (plus sprints, goals and split view) stay on the iPad and computer
  const PHONE_VIEWS = ['write', 'outline'];
  const keepPhoneView = () => { if (phone.matches && S.project && S.view && !PHONE_VIEWS.includes(S.view)) U.setView('write'); };
  document.addEventListener('click', e => {
    if (!phone.matches) return;
    const b = e.target.closest('#plan-nav button'); if (!b) return;
    setTimeout(() => { if (b.dataset.v === 'write') { if (S.docId) showPage(); } else showPage(); }, 30);
  });
  // opening a card on the corkboard or a row in the outline goes to that chapter's page
  U.on('view', v => { if (phone.matches && !PHONE_VIEWS.includes(v)) { keepPhoneView(); return; } mark('m-plan', phone.matches && v !== 'write'); refreshHead(); });
  // a project opened from the main screen starts on its chapter list; Continue / Recently updated go straight to the page
  U.on('project', () => { if (!phone.matches) return; showBinder(); setTimeout(() => { if (S.lastPlace && S.lastPlace.slug === S.slug && S._continuing) showPage(); }, 0); });
  U.on('leave', () => { S.phoneReturn = null; mark('m-view-page', false); mark('m-view-binder', false); mark('m-editing', false); });
  setInterval(() => { if (phone.matches && S.project) refreshHead(); }, 1500);
  // Continue and Recently updated on the main screen mean "take me to the page"
  document.addEventListener('click', e => { if (e.target.closest('#btn-continue, .lr-item')) { S._continuing = true; setTimeout(() => { S._continuing = false; if (phone.matches && S.docId) showPage(); }, 1500); } }, true);

  // side panels (Revise, comments) cover the page on a phone; tap outside to close
  const shade = document.createElement('div'); shade.className = 'm-shade'; ($('#workspace .main') || document.body).appendChild(shade);
  const watchPanels = () => {
    const open = phone.matches && $$('.revise-panel').some(p => !p.classList.contains('hidden') && p.offsetParent !== null && p.id !== 'pl-side');
    root.classList.toggle('m-panel-open', open);
  };
  new MutationObserver(watchPanels).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
  shade.addEventListener('click', () => { const rp = $('#revise-panel'); if (rp && !rp.classList.contains('hidden')) click('#rp-close'); const np = $('#notes-panel'); if (np && !np.classList.contains('hidden')) click('#btn-notes'); });

  // save straight away when the app is put in the background (phones may close it without warning)
  document.addEventListener('visibilitychange', () => { if (document.hidden && S.slug) { try { U.flushSave(); U.noteLastPlace && U.noteLastPlace(true); } catch {} } });
  window.addEventListener('pagehide', () => { if (S.slug) { try { U.flushSave(); } catch {} } });

  // ------------------------------------------------------------------ a way out of every full-screen view
  // On a phone some views' own close buttons sit under the system bars or off the edge, so while one is open
  // a round ✕ floats in the top corner. It uses the view's own close, so nothing is lost. Not in Build: its top bar
  // already has ‹ and Done on screen, and the ✕ would sit on top of Done.
  const OUT = [
    ['.pv-back', '#pv-close'], ['.help-back', '#help-x'], ['.mp-view', '#mp-close'], ['#bi', '#bi [data-x]'],
    ['body.writer', null], ['.messy-pill', '.messy-pill button']
  ];
  const xbtn = document.createElement('button');
  xbtn.className = 'm-escape'; xbtn.setAttribute('aria-label', 'Close'); xbtn.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  document.body.appendChild(xbtn);
  const topOpen = () => { for (let i = OUT.length - 1; i >= 0; i--) { const [sel, btn] = OUT[i]; if (sel === 'body.writer' ? document.body.classList.contains('writer') : [...document.querySelectorAll(sel)].some(el => el.getClientRects().length > 0 && !el.closest('#build-screen'))) return OUT[i]; } return null; };
  function closeTop() {
    const t = topOpen(); if (!t) return;
    const [sel, btn] = t;
    if (sel === 'body.writer') { U.setWriter(false); return; }
    const b = btn && document.querySelector(btn);
    if (b) { b.click(); return; }
    const k = { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true };
    (document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', k));
    document.dispatchEvent(new KeyboardEvent('keydown', k));
  }
  xbtn.onclick = closeTop;
  setInterval(() => { const on = phone.matches || root.classList.contains('touch-device') ? !!topOpen() : false; xbtn.classList.toggle('show', on); }, 400);

  const sync = () => {
    root.classList.toggle('m-phone', phone.matches);
    if (!phone.matches) { ['m-view-page', 'm-view-binder', 'm-editing', 'm-panel-open'].forEach(c => root.classList.remove(c)); }
    else { keepPhoneView(); if (S.project && !root.classList.contains('m-view-page')) showBinder(); }
  };
  phone.addEventListener('change', sync); sync();
  return { showBinder, showPage };
})();
