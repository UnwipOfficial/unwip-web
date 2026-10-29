// Unwip - on a Mac, the app's own words read like a Mac app: ⌘K instead of Ctrl+K, "this Mac" instead of
// "this PC", "Show in Finder". Only Unwip's buttons, menus, tips and messages are changed - never your writing.
// The keys (⌘ for Ctrl) also on an iPad, iPhone or a Mac's browser, where ⌘ is the key that works (sweep, 29 Oct:
// those said Ctrl); the PC words ("this Mac", Finder) only in the Mac app.
(function () {
  'use strict';
  if (!window.folio) return;
  const macApp = window.folio.platform === 'darwin';
  const appleWeb = !window.folio.platform && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');
  if (!macApp && !appleWeb) return;
  const MOD = { Ctrl: '⌘', Alt: '⌥', Shift: '⇧' };
  const ORDER = ['⌥', '⇧', '⌘'];           // the order Mac menus show them in
  const keys = s => s.replace(/\b((?:(?:Ctrl|Alt|Shift)\+)+)/g, (_m, mods) => {
    const sym = mods.split('+').filter(Boolean).map(m => MOD[m]);
    return ORDER.filter(x => sym.includes(x)).join('');
  });
  const WORDS = [
    [/\bThis PC\b/g, 'This Mac'], [/\bthis PC\b/g, 'this Mac'], [/\byour other PCs\b/g, 'your other Macs'], [/\bother PCs\b/g, 'other computers'],
    [/\bShow in folder\b/g, 'Show in Finder'], [/\bthe Recycle Bin\b/g, 'the Bin'], [/\bWindows language settings\b/g, 'Mac’s language settings']
  ];
  const NEEDLE = macApp ? /Ctrl\+|Alt\+|Shift\+|this PC|This PC|other PCs|Show in folder|Recycle Bin|Windows language/ : /Ctrl\+|Alt\+|Shift\+/;
  const fix = s => { let t = keys(s); if (macApp) for (const [re, w] of WORDS) t = t.replace(re, w); return t; };
  // never inside the writing itself, or anywhere you type
  const mine = n => { const el = n.nodeType === 1 ? n : n.parentElement; return !el || el.closest('#editor, [contenteditable="true"], textarea, input, .pv-viewport, #reader, .reader'); };
  const ATTRS = ['title', 'data-tip', 'aria-label', 'placeholder'];
  function fixNode(root) {
    if (!root || mine(root)) return;
    if (root.nodeType === 3) { if (NEEDLE.test(root.nodeValue)) { const v = fix(root.nodeValue); if (v !== root.nodeValue) root.nodeValue = v; } return; }
    if (root.nodeType !== 1) return;
    const els = [root, ...root.querySelectorAll('[title], [data-tip], [aria-label], [placeholder]')];
    for (const el of els) { if (mine(el)) continue; for (const a of ATTRS) { const v = el.getAttribute(a); if (v && NEEDLE.test(v)) el.setAttribute(a, fix(v)); } }
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: t => NEEDLE.test(t.nodeValue) && !mine(t) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
    const hits = []; while (tw.nextNode()) hits.push(tw.currentNode);
    for (const t of hits) { const v = fix(t.nodeValue); if (v !== t.nodeValue) t.nodeValue = v; }
  }
  const start = () => {
    fixNode(document.body);
    new MutationObserver(list => {
      for (const m of list) {
        if (m.type === 'attributes') { const v = m.target.getAttribute(m.attributeName); if (v && NEEDLE.test(v) && !mine(m.target)) m.target.setAttribute(m.attributeName, fix(v)); }
        else if (m.type === 'characterData') fixNode(m.target);
        else m.addedNodes.forEach(fixNode);
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  window.UnwipMacWords = { fix };
})();
