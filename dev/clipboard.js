// Unwip - clean copy & paste.
//
// Every program puts different hidden formatting on the clipboard (Google Docs wraps
// everything in a bold tag that isn't bold, Word adds "mso" junk, etc). Instead of
// trying to tidy that HTML, Unwip reads it into a simple model:
//    blocks (paragraph / heading / quote) made of runs (text + bold, italic, font, size...)
// and then writes brand-new HTML from that model. Paste-in writes minimal HTML for the
// editor; copy-out writes fully explicit HTML that Google Docs and Word read reliably.
(function () {
  const BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'LI', 'PRE', 'TR', 'DT', 'DD', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'FIGCAPTION', 'ADDRESS', 'TITLE']);
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'META', 'LINK', 'HEAD', 'TITLE', 'NOSCRIPT', 'TEMPLATE', 'IFRAME', 'OBJECT', 'SVG', 'XML', 'O:P', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA']);
  const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'inherit', 'initial']);

  // ---- helpers ----------------------------------------------------------
  function cleanFamily(v) {
    if (!v) return null;
    const first = v.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).find(s => s && !GENERIC.has(s.toLowerCase()));
    if (!first || /^(-apple-system|BlinkMacSystemFont)$/i.test(first)) return null;
    return first;
  }
  function toPt(v) {
    if (!v) return null;
    const m = String(v).trim().match(/^([\d.]+)\s*(pt|px|em|rem|%)?$/i);
    if (!m) {
      const named = { 'xx-small': 7, 'x-small': 7.5, small: 10, medium: 12, large: 13.5, 'x-large': 18, 'xx-large': 24, 'xxx-large': 36 };
      return named[String(v).trim().toLowerCase()] || null;
    }
    const n = parseFloat(m[1]); const u = (m[2] || 'px').toLowerCase();
    let pt = u === 'pt' ? n : u === 'px' ? n * 0.75 : u === '%' ? n / 100 * 12 : n * 12;
    pt = Math.round(pt * 2) / 2;
    return pt > 3 && pt < 200 ? pt : null;
  }
  function isBlackish(c) {
    if (!c) return true;
    c = c.replace(/\s/g, '').toLowerCase();
    return /^(#000|#000000|rgb\(0,0,0\)|rgba\(0,0,0,1\)|black|windowtext|inherit|initial|currentcolor|auto|transparent|rgba\(0,0,0,0\))$/.test(c) || /^#(0[0-9a-f]){3}$/.test(c) && parseInt(c.slice(1), 16) < 0x202020;
  }
  function isNoBg(c) {
    if (!c) return true;
    c = c.replace(/\s/g, '').toLowerCase();
    return /^(transparent|white|#fff|#ffffff|rgb\(255,255,255\)|rgba\(0,0,0,0\)|inherit|initial|none|window)$/.test(c) || /^rgba\(.*,0\)$/.test(c);
  }
  function weightIsBold(w) {
    if (!w) return null;
    w = String(w).toLowerCase();
    if (w === 'bold' || w === 'bolder') return true;
    if (w === 'normal' || w === 'lighter') return false;
    const n = parseInt(w, 10);
    return isNaN(n) ? null : n >= 600;
  }
  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;'); }
  // a pasted font with Unwip's nearest built-in one behind it, then the kind of font it is: the words show in their own
  // font where the device has it, and in the closest match where it doesn't. Copying them on keeps the first name only.
  function familyWithBackup(f) {
    const near = window.FolioFonts && window.FolioFonts.nearest ? window.FolioFonts.nearest(f) : [null, 'serif'];
    return [quoteFamily(f), near[0] && `'${near[0]}'`, near[1]].filter(Boolean).join(', ');
  }
  function quoteFamily(f) { if (window.FolioFonts) f = window.FolioFonts.external(f); return /^[\w-]+$/.test(f) ? f : `'${f.replace(/'/g, '')}'`; }

  // ---- read: any HTML -> blocks/runs -------------------------------------
  function extract(root) {
    const blocks = [];
    let current = null;
    let sawBlock = false;

    function newBlock(tag, attrs) {
      current = { tag, align: attrs.align || null, indent: attrs.indent, lineHeight: attrs.lineHeight || null, runs: [] };
      blocks.push(current);
      return current;
    }
    function ensureBlock() { if (!current) newBlock('p', {}); return current; }

    function blockTagFor(el) {
      const t = el.tagName;
      if (/^H[1-3]$/.test(t)) return t.toLowerCase();
      if (/^H[4-6]$/.test(t)) return 'h3';
      if (t === 'BLOCKQUOTE') return 'blockquote';
      const cls = (el.getAttribute('class') || '');
      if (/MsoTitle/i.test(cls)) return 'h1';
      if (/MsoSubtitle/i.test(cls)) return 'h2';
      const m = cls.match(/MsoHeading(\d)/i); if (m) return 'h' + Math.min(3, +m[1]);
      return 'p';
    }
    function blockAttrs(el, inherited) {
      const st = el.style || {};
      const a = { ...inherited };
      const ta = (st.textAlign || el.getAttribute('align') || '').toLowerCase();
      if (ta === 'center' || ta === 'right' || ta === 'justify') a.align = ta;
      else if (ta === 'left' || ta === 'start') a.align = null;
      if (st.textIndent) { const pt = parseIndent(st.textIndent); if (pt !== null) a.indent = pt; }
      if (st.lineHeight && /^[\d.]+$/.test(st.lineHeight)) {
        const lh = parseFloat(st.lineHeight); if (lh >= 0.8 && lh <= 4) a.lineHeight = lh;
      } else if (st.lineHeight && /%$/.test(st.lineHeight)) {
        const lh = parseFloat(st.lineHeight) / 100; if (lh >= 0.8 && lh <= 4) a.lineHeight = lh;
      }
      return a;
    }
    function parseIndent(v) {
      const m = String(v).match(/^(-?[\d.]+)\s*(pt|px|in|cm|mm|em)?$/i);
      if (!m) return null;
      const n = parseFloat(m[1]); const u = (m[2] || 'px').toLowerCase();
      const pt = u === 'pt' ? n : u === 'px' ? n * 0.75 : u === 'in' ? n * 72 : u === 'cm' ? n * 28.35 : u === 'mm' ? n * 2.835 : n * 12;
      return Math.max(0, Math.round(pt));
    }
    function inlineState(el, s) {
      s = { ...s };
      const t = el.tagName;
      const st = el.style || {};
      const raw = el.getAttribute && (el.getAttribute('style') || '');
      if (t === 'B' || t === 'STRONG') s.bold = true;
      if (t === 'I' || t === 'EM' || t === 'CITE' || t === 'VAR') s.italic = true;
      const tc = el.classList && (el.classList.contains('tc-ins') ? 'ins' : el.classList.contains('tc-del') ? 'del' : '');
      if (t === 'U' || (t === 'INS' && !tc)) s.underline = true;
      if (t === 'S' || t === 'STRIKE' || (t === 'DEL' && !tc)) s.strike = true;
      if (tc && (window.FolioClip && window.FolioClip.keepChanges)) s.tc = { k: tc, a: el.getAttribute('data-a') || '', t: +el.getAttribute('data-t') || 0 };
      if (el.classList && el.classList.contains('cmt') && (window.FolioClip && window.FolioClip.keepChanges)) s.cmt = [...(s.cmt || []), { id: el.getAttribute('data-cid') || '', note: el.getAttribute('data-note') || '', at: el.getAttribute('data-at') || '', by: el.getAttribute('data-by') || '' }];
      if (t === 'SUP') s.sup = true;
      if (t === 'SUB') s.sub = true;
      if (t === 'FONT') {
        const face = cleanFamily(el.getAttribute('face')); if (face) s.font = face;
        const col = el.getAttribute('color'); if (col && !isBlackish(col)) s.color = col;
      }
      const wb = weightIsBold(st.fontWeight); if (wb !== null) s.bold = wb;
      if (st.fontStyle) s.italic = /italic|oblique/i.test(st.fontStyle);
      const deco = (st.textDecorationLine || st.textDecoration || '') + ' ' + (/text-decoration[^;]*/i.exec(raw) || [''])[0];
      if (/underline/i.test(deco)) s.underline = true;
      if (/line-through/i.test(deco)) s.strike = true;
      if (/text-decoration\s*:\s*none/i.test(raw)) { s.underline = false; s.strike = false; }
      const fam = cleanFamily(st.fontFamily); if (fam) s.font = fam;
      const size = toPt(st.fontSize); if (size) s.size = size;
      if (st.color) s.color = isBlackish(st.color) ? null : st.color;
      const bg = st.backgroundColor || (t === 'MARK' ? '#fff3a3' : '');
      if (bg && !BLOCK_TAGS.has(t)) s.bg = isNoBg(bg) ? null : bg;
      if (st.verticalAlign === 'super') { s.sup = true; s.sub = false; }
      if (st.verticalAlign === 'sub') { s.sub = true; s.sup = false; }
      if (st.verticalAlign === 'baseline') { s.sup = false; s.sub = false; }
      return s;
    }
    function pushText(text, s) {
      if (text && text.includes('$Scr_')) text = text.replace(/<!?\$Scr_[A-Za-z]+::\d+>/g, '');   // Scrivener's hidden style marks
      if (!text) return;
      const b = ensureBlock();
      const last = b.runs[b.runs.length - 1];
      const run = { text, tc: s.tc || null, cmt: s.cmt || null, bold: !!s.bold, italic: !!s.italic, underline: !!s.underline, strike: !!s.strike, sup: !!s.sup, sub: !!s.sub, font: s.font || null, size: s.size || null, color: s.color || null, bg: s.bg || null };
      if (last && !last.br && last.fn === undefined && !last.img && sameStyle(last, run)) last.text += text; else b.runs.push(run);
    }

    function walk(node, s, battrs, inPre) {
      if (node.nodeType === 3) {
        let text = node.nodeValue;
        if (!inPre) text = text.replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ');
        // ignore whitespace-only text between blocks
        if (!inPre && !text.trim() && (!current || !current.runs.length || isBetweenBlocks(node))) return;
        pushText(text.replace(/\u00a0/g, ' '), s);
        return;
      }
      if (node.nodeType !== 1) return;
      const el = node;
      const t = el.tagName.toUpperCase();
      if (SKIP_TAGS.has(t)) return;
      if (el.classList && el.classList.contains('tc-del') && !(window.FolioClip && window.FolioClip.keepChanges)) return;
      const raw = el.getAttribute('style') || '';
      if (/display\s*:\s*none/i.test(raw)) return;   // hidden text
      // Word's own bullet or number in front of a list line: keep it as "• " or "1. "
      if (/mso-list\s*:\s*ignore/i.test(raw)) { const g = (el.textContent || '').replace(/[\s\u00a0]+/g, ' ').trim(); if (g) pushText(/^[\dA-Za-z]{1,4}[.)]$/.test(g) ? g + ' ' : '• ', {}); return; }
      if (t === 'BR') { ensureBlock().runs.push({ br: true }); return; }
      // Unwip footnote marker: the note itself lives in data-fn
      if (t === 'SUP' && el.hasAttribute('data-fn')) { ensureBlock().runs.push({ fn: el.getAttribute('data-fn') || '', text: '' }); return; }
      // pictures: only ones already embedded (data: addresses); web links to images aren't fetched
      if (t === 'IMG') {
        const src = el.getAttribute('src') || '';
        if (/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(src)) {
          const pct = parseFloat((el.getAttribute('style') || '').match(/width:\s*([\d.]+)%/) ? RegExp.$1 : '') || 60;
          ensureBlock().runs.push({ img: src, pct: Math.min(100, Math.max(5, pct)), w: +el.getAttribute('data-w') || +el.getAttribute('width') || 0, h: +el.getAttribute('data-h') || +el.getAttribute('height') || 0, text: '' });
        }
        return;
      }
      if (t === 'HR') { sawBlock = true; newBlock('p', { align: 'center' }); pushText('* * *', {}); current = null; return; }

      if (BLOCK_TAGS.has(t) || t === 'UL' || t === 'OL' || t === 'TABLE' || t === 'TBODY' || t === 'TD' || t === 'TH') {
        const isContainer = t === 'UL' || t === 'OL' || t === 'TABLE' || t === 'TBODY' || t === 'TR' || t === 'SECTION' || t === 'ARTICLE' || (t === 'DIV' && hasBlockChild(el)) || (t === 'BLOCKQUOTE' && hasBlockChild(el));
        const attrs = blockAttrs(el, battrs);
        const st = inlineState(el, s);
        sawBlock = true;
        if (isContainer) {
          current = null;
          const tagOverride = t === 'BLOCKQUOTE' ? 'blockquote' : null;
          for (const c of el.childNodes) walk(c, st, { ...attrs, tagOverride: tagOverride || attrs.tagOverride }, inPre);
          current = null;
          return;
        }
        if (t === 'TD' || t === 'TH') { // flatten table cells into paragraphs
          current = null;
          for (const c of el.childNodes) walk(c, st, attrs, inPre);
          current = null;
          return;
        }
        let tag = blockTagFor(el);
        if (tag === 'p' && battrs.tagOverride) tag = battrs.tagOverride;
        newBlock(tag, attrs);
        // a list item keeps its bullet or number as text, since Unwip has no list formatting of its own
        if (t === 'LI') {
          const par = el.parentElement, ol = par && par.tagName === 'OL';
          const n = ol ? [...par.children].filter(c => c.tagName === 'LI').indexOf(el) + (+par.getAttribute('start') || 1) : 0;
          if (!/^\s*([•·▪◦‣\-–*]|\d+[.)])\s/.test(el.textContent || '')) pushText(ol ? `${n}. ` : '• ', {});
        }
        for (const c of el.childNodes) walk(c, st, attrs, inPre || t === 'PRE');
        current = null;
        return;
      }
      // inline element (span, b, i, a, font, google's wrapper <b>, etc)
      const st = inlineState(el, s);
      for (const c of el.childNodes) walk(c, st, battrs, inPre);
    }
    function hasBlockChild(el) {
      for (const c of el.children) if (BLOCK_TAGS.has(c.tagName.toUpperCase()) || /^(UL|OL|TABLE|HR)$/i.test(c.tagName)) return true;
      return false;
    }
    function isBetweenBlocks(node) {
      const prev = node.previousSibling, next = node.nextSibling;
      const isB = n => n && n.nodeType === 1 && (BLOCK_TAGS.has(n.tagName.toUpperCase()) || /^(UL|OL|TABLE|HR|BR)$/i.test(n.tagName));
      // a space alone inside a formatting run (<span> </span> between a bold word and the next) is a real space
      // (also when that run is wrapped in more runs: <span style="font-family…"><b> </b></span>, as Scrivener writes it)
      for (let el = node.parentNode; el && el.nodeType === 1 && /^(SPAN|B|STRONG|I|EM|U|S|FONT|A|SUP|SUB|MARK|SMALL|CODE)$/i.test(el.tagName); el = el.parentNode)
        if (el.previousSibling || el.nextSibling) return false;
      return (!prev || isB(prev)) && (!next || isB(next));
    }

    // Scrivener (and other Qt-based apps) put the main font and size on <body>, not on the text
    const rootState = root.tagName && root.tagName.toUpperCase() === 'BODY' ? inlineState(root, {}) : {};
    const rootBlock = root.tagName && root.tagName.toUpperCase() === 'BODY' ? blockAttrs(root, {}) : {};
    for (const c of root.childNodes) walk(c, rootState, rootBlock, false);
    // trim trailing <br> in blocks and leading/trailing spaces
    for (const b of blocks) {
      while (b.runs.length > 1 && b.runs[b.runs.length - 1].br) b.runs.pop();
      const first = b.runs.find(r => !r.br && r.fn === undefined && !r.img); if (first) first.text = first.text.replace(/^ +/, '');
      const lastT = [...b.runs].reverse().find(r => !r.br && r.fn === undefined && !r.img); if (lastT) lastT.text = lastT.text.replace(/ +$/, '');
    }
    return { blocks, sawBlock };
  }

  function sameStyle(a, b) {
    return (a.tc || null) === (b.tc || null) && (a.cmt || null) === (b.cmt || null) && a.bold === b.bold && a.italic === b.italic && a.underline === b.underline && a.strike === b.strike &&
      a.sup === b.sup && a.sub === b.sub && a.font === b.font && a.size === b.size && a.color === b.color && a.bg === b.bg;
  }

  function parseHTML(html) {
    // Word puts conditional comments and an <xml> island in the clipboard; strip before parsing
    html = String(html || '')
      .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<\/?o:p>/gi, '')
      .replace(/<xml>[\s\S]*?<\/xml>/gi, '');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.body;
  }

  // ---- write: blocks -> minimal HTML for the editor ----------------------
  function runsToHTML(runs, opts) {
    let out = '';
    for (const r of runs) {
      if (r.br) { out += '<br>'; continue; }
      if (r.img) { out += `<img class="doc-img" src="${r.img}" data-w="${r.w || ''}" data-h="${r.h || ''}" style="width: ${r.pct || 60}%" alt="">`; continue; }
      if (r.fn !== undefined) { out += `<sup class="fn" contenteditable="false" data-fn="${escAttr(r.fn)}">\u200b</sup>`; continue; }
      let h = esc(r.text);
      if (r.sup) h = `<sup>${h}</sup>`;
      if (r.sub) h = `<sub>${h}</sub>`;
      if (r.strike) h = `<s>${h}</s>`;
      if (r.underline) h = `<u>${h}</u>`;
      if (r.italic) h = `<i>${h}</i>`;
      if (r.bold) h = `<b>${h}</b>`;
      const css = [];
      if (r.font && !opts.dropFonts && !opts.plainRuns && r.font !== opts.docFont) css.push(`font-family: ${familyWithBackup(r.font)}`);
      if (r.size && !opts.dropFonts && !opts.plainRuns && r.size !== opts.docSize) css.push(`font-size: ${r.size}pt`);
      if (r.color && !opts.dropColors && !opts.plainRuns) css.push(`color: ${r.color}`);
      if (r.bg && !opts.dropColors) css.push(`background-color: ${r.bg}`);
      if (css.length) h = `<span style="${escAttr(css.join('; '))}">${h}</span>`;
      if (r.cmt) for (const k of r.cmt) h = `<span class="cmt" data-cid="${escAttr(k.id)}" data-note="${escAttr(k.note)}" data-at="${escAttr(k.at)}"${k.by ? ` data-by="${escAttr(k.by)}"` : ''}>${h}</span>`;
      if (r.tc && opts.keepChanges !== false) h = `<${r.tc.k} class="tc-${r.tc.k}" data-a="${escAttr(r.tc.a || '')}" data-t="${r.tc.t || ''}">${h}</${r.tc.k}>`;
      out += h;
    }
    return out;
  }

  function toEditorHTML(parsed, opts = {}) {
    const { blocks, sawBlock } = parsed;
    // pasting a few words from inside one paragraph: don't create a new paragraph
    if (!sawBlock && blocks.length <= 1) return blocks.length ? runsToHTML(blocks[0].runs, opts) : '';
    return blocks.map(b => {
      const css = [];
      if (b.align) css.push(`text-align: ${b.align}`);
      if (!opts.dropFonts && b.indent != null && opts.keepIndent) css.push(`text-indent: ${b.indent}pt`);
      if (!opts.dropFonts && b.lineHeight && opts.keepLineHeight) css.push(`line-height: ${b.lineHeight}`);
      const inner = runsToHTML(b.runs, opts) || '<br>';
      return `<${b.tag}${css.length ? ` style="${escAttr(css.join('; '))}"` : ''}>${inner}</${b.tag}>`;
    }).join('');
  }

  // ---- write: blocks -> explicit HTML for Google Docs / Word -------------
  const SCENE_BREAK = /^\s*((\*|#|~|•|·)\s*){1,5}\s*$/;
  // a LitRPG [system message]: the whole paragraph is [one message] (or [a] [b] side by side). One rule for the boxes
  // while writing (litrpg.js), the EPUB (epub.js) and the Royal Road copy (royalroad.js), so they always agree.
  const SYSMSG = /^\s*\[[^\[\]]*(\][^\[\]]*\[[^\[\]]*)*\]\s*$/;

  function toExportHTML(blocks, S, opts = {}) {
    // optional font swap (e.g. fonts Google Docs doesn't have -> closest one it does)
    const fm = opts.fontMap || {};
    const mapF = f => (f && fm[f]) || f;
    S = { ...S, font: mapF(S.font), headings: Object.fromEntries(Object.entries(S.headings).map(([k, v]) => [k, { ...v, font: mapF(v.font) }])) };
    blocks = blocks.map(b => ({ ...b, runs: b.runs.map(r => r.br ? r : { ...r, font: mapF(r.font) }) }));
    let h1Count = 0;
    // S = project style settings
    const parts = [];
    // footnotes: numbered marks, with the notes listed at the end of each chapter (and of the copy)
    let notes = [], noteTexts = [];
    const flushNotes = () => {
      if (!notes.length || opts.notes === false) { notes = []; return; }
      const ns = Math.max(8, Math.round(S.size * 0.85 * 2) / 2);
      const pcss = `font-family: ${quoteFamily(S.font)}; font-size: ${ns}pt; line-height: 1.2; margin-top: 0pt; margin-bottom: 4pt; text-indent: 0pt; text-align: left`;
      parts.push(`<p dir="ltr" style="${escAttr(pcss + '; margin-top: 18pt')}"><span style="${escAttr(`font-family: ${quoteFamily(S.font)}; font-size: ${ns}pt; font-style: italic; color: #000000`)}">Notes</span></p>`);
      notes.forEach((t, i) => parts.push(`<p dir="ltr" style="${escAttr(pcss)}"><span style="${escAttr(`font-family: ${quoteFamily(S.font)}; font-size: ${ns}pt; color: #000000`)}">${i + 1}. ${esc(t)}</span></p>`));
      noteTexts.push(...notes.map((t, i) => `[${i + 1}] ${t}`));
      notes = [];
    };
    let prevWasBreakOrHeading = true; // first paragraph of a chapter isn't indented
    for (const b of blocks) {
      if (b.newPage) prevWasBreakOrHeading = true;
      const hasImg = b.runs.some(r => r.img);
      const text = b.runs.map(r => r.br ? '\n' : r.text).join('');
      const isBreak = b.tag === 'p' && SCENE_BREAK.test(text) && text.trim().length > 0;
      const isHeading = /^h[1-3]$/.test(b.tag);
      const hs = isHeading ? S.headings[b.tag] : null;
      const font = hs ? hs.font : S.font;
      const size = hs ? hs.size : S.size;
      const css = [
        `font-family: ${quoteFamily(font)}`,
        `font-size: ${size}pt`,
        `line-height: ${b.lineHeight || (isHeading ? 1.15 : S.lineHeight)}`,
        `margin-top: ${isHeading ? hs.spaceBefore : 0}pt`,
        `margin-bottom: ${isHeading ? hs.spaceAfter : S.paraSpacing}pt`
      ];
      const align = b.align || (isBreak ? 'center' : isHeading ? hs.align : (S.justify ? 'justify' : 'left'));
      css.push(`text-align: ${align}`);
      let indent = 0;
      if (b.tag === 'p' && !isBreak && !hasImg) {
        indent = b.indent != null ? b.indent : (S.noIndentFirst && prevWasBreakOrHeading ? 0 : S.indent * 72);
      }
      if (b.tag === 'blockquote') css.push('margin-left: 36pt', 'margin-right: 36pt');
      if (b.tag === 'h1' || b.newPage) flushNotes();
      if ((b.tag === 'h1' || b.newPage) && h1Count++ > 0 && opts.pageBreaks) css.push('page-break-before: always', 'break-before: page');
      css.push(`text-indent: ${indent}pt`);
      const tag = b.tag === 'blockquote' ? 'p' : b.tag;
      const runs = b.runs.map(r => {
        if (r.br) return '<br>';
        if (r.img) return `<img src="${r.img}" alt="" style="width: ${r.pct || 60}%; max-width: 100%; height: auto; vertical-align: bottom"${r.w ? ` width="${Math.round((r.pct || 60) * 6)}"` : ''}>`;
        if (r.fn !== undefined) { if (opts.notes === false) return ''; notes.push(r.fn); return `<span style="${escAttr(`font-family: ${quoteFamily(font)}; font-size: ${Math.round(size * 0.75)}pt; vertical-align: super; color: #000000`)}">${notes.length}</span>`; }
        const rc = [
          `font-family: ${quoteFamily((!opts.plainRuns && r.font) || font)}`,
          `font-size: ${(!opts.plainRuns && r.size) || size}pt`,
          `font-weight: ${r.bold || (hs && hs.bold) ? 700 : 400}`,
          `font-style: ${r.italic || (hs && hs.italic) ? 'italic' : 'normal'}`,
          `text-decoration: ${[r.underline && 'underline', r.strike && 'line-through'].filter(Boolean).join(' ') || 'none'}`,
          `color: ${(!opts.plainRuns && r.color) || '#000000'}`,
          `vertical-align: ${r.sup ? 'super' : r.sub ? 'sub' : 'baseline'}`
        ];
        if (r.bg && !opts.plainRuns) rc.push(`background-color: ${r.bg}`);
        return `<span style="${escAttr(rc.join('; '))}">${esc(r.text)}</span>`;
      }).join('');
      // Blank lines: Google Docs throws away empty paragraphs, so give them a non-breaking space
      const blank = !hasImg && !b.runs.some(r => !r.br && r.text.length);
      const inner = blank
        ? `<span style="${escAttr(`font-family: ${quoteFamily(font)}; font-size: ${size}pt`)}">&nbsp;</span>`
        : runs;
      parts.push(`<${tag} dir="ltr" style="${escAttr(css.join('; '))}">${inner}</${tag}>`);
      if (!blank) prevWasBreakOrHeading = isBreak || isHeading;
    }
    // Same shape Google Docs uses for its own copies: no wrapping box around the paragraphs
    // (Docs drops a heading that sits first inside a wrapper), every block marked left-to-right.
    flushNotes();
    const html = `<meta charset="utf-8">${parts.join('')}`;
    const text = blocks.map(b => b.runs.map(r => r.br ? '\n' : r.text).join('')).join('\n') + (noteTexts.length ? '\n\nNotes\n' + noteTexts.join('\n') : '');
    return { html, text };
  }

  window.FolioClip = {
    // HTML from the clipboard -> clean HTML for the editor
    // a Word file with an editor's tracked changes keeps them as suggestions to accept or reject
    cleanPaste(html, opts) {
      const keep = /class="(tc-(ins|del)|cmt)"/.test(String(html || '')), was = window.FolioClip.keepChanges;
      if (keep) window.FolioClip.keepChanges = true;
      try { return toEditorHTML(extract(parseHTML(html)), opts); } finally { window.FolioClip.keepChanges = was; }
    },
    // plain text -> paragraphs
    textToHTML(text) {
      const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
      if (lines.length === 1) return esc(lines[0]);
      return lines.map(l => `<p>${esc(l) || '<br>'}</p>`).join('');
    },
    // editor DOM (or a fragment of it) -> explicit HTML + plain text for Docs / Word
    exportFrom(rootEl, settings) { return toExportHTML(extract(rootEl).blocks, settings); },
    exportFromBlocks(blocks, settings, opts) { return toExportHTML(blocks, settings, opts); },
    // Empty paragraphs used as spacing (common in drafts from Word, Docs and Scrivener) make gaps uneven.
    // Spacing should come only from Manuscript style, so: a single empty line is removed; two or more
    // empty lines in a row between paragraphs usually mean a scene change, so they become one scene break.
    dropBlankLines(html) {
      const box = document.createElement('div'); box.innerHTML = html || '';
      const kids = [...box.children];
      const blank = el => el && /^(P|DIV)$/.test(el.tagName) && !el.querySelector('img,hr,table,iframe') && !el.textContent.replace(/[\s\u00a0\u200b\ufeff]/g, '');
      const prose = el => el && el.tagName === 'P' && !blank(el) && !el.classList.contains('scene') && !SCENE_BREAK.test(el.textContent);
      let removed = 0, scenes = 0;
      for (let i = 0; i < kids.length;) {
        if (!blank(kids[i])) { i++; continue; }
        let j = i; while (j < kids.length && blank(kids[j])) j++;
        let from = i;
        if (j - i >= 2 && prose(kids[i - 1]) && prose(kids[j])) {
          const sb = kids[i]; sb.innerHTML = '* * *'; sb.className = 'scene'; sb.setAttribute('style', 'text-align: center'); scenes++; from = i + 1;
          if (sb.tagName !== 'P') { const p2 = document.createElement('p'); p2.className = 'scene'; p2.setAttribute('style', 'text-align: center'); p2.textContent = '* * *'; sb.replaceWith(p2); }
        }
        for (let k = from; k < j; k++) { kids[k].remove(); removed++; }
        i = j;
      }
      return { html: box.innerHTML.trim() || '<p><br></p>', removed, scenes };
    },
    extract, parseHTML, SCENE_BREAK, SYSMSG, quoteFamily
  };
})();
