// Unwip - "No hard feelings": take your book back out, as a real Scrivener project (or a folder of Word or
// Markdown files, or a full Unwip backup). Leaving is fine; your work is yours.
// The Scrivener project uses the same layout Scrivener 3 for Windows opens (and Scrivener 1 and 2, and Mac,
// which offers to update it): a .scriv folder with a .scrivx binder file and one RTF file per document.
window.UnwipNoHardFeelings = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return;
  const { S, api, esc, $ } = U;

  // ------------------------------------------------------------------ HTML -> RTF
  const rtfText = t => {
    let out = '';
    for (const ch of t) {
      const c = ch.codePointAt(0);
      if (ch === '\\' || ch === '{' || ch === '}') out += '\\' + ch;
      else if (ch === '\t') out += '\\tab ';
      else if (c < 128) out += ch === '\n' ? ' ' : ch;
      else if (c <= 0xFFFF) out += `\\u${c > 32767 ? c - 65536 : c}?`;
      else { const s = ch; for (let i = 0; i < s.length; i++) { const u = s.charCodeAt(i); out += `\\u${u > 32767 ? u - 65536 : u}?`; } }
    }
    return out;
  };
  function picture(img) {
    const m = /^data:image\/(png|jpe?g);base64,(.*)$/i.exec(img.getAttribute('src') || ''); if (!m) return '';
    const bin = atob(m[2]); let hex = ''; for (let i = 0; i < bin.length; i++) { hex += bin.charCodeAt(i).toString(16).padStart(2, '0'); if (i % 64 === 63) hex += '\n'; }
    const w = +img.dataset.w || img.naturalWidth || 600, h = +img.dataset.h || img.naturalHeight || 400;
    const goalW = Math.round(Math.min(w, 600) * 15), goalH = Math.round(goalW * (h / (w || 1)));
    return `{\\pict${/png/i.test(m[1]) ? '\\pngblip' : '\\jpegblip'}\\picw${w}\\pich${h}\\picwgoal${goalW}\\pichgoal${goalH}\n${hex}}`;
  }
  // inline content of one paragraph
  function inline(node, notes) {
    let out = '';
    node.childNodes.forEach(n => {
      if (n.nodeType === 3) { out += rtfText(n.data.replace(/ /g, ' ')); return; }
      if (n.nodeType !== 1) return;
      const t = n.tagName, cl = n.classList;
      if (cl.contains('tc-del') || t === 'DEL') return;                         // a suggested deletion isn't part of the text
      if (t === 'BR') { out += '\\line '; return; }
      if (t === 'IMG') { out += picture(n); return; }
      if (t === 'SUP' && n.hasAttribute('data-fn')) { out += `{\\super\\chftn}{\\footnote\\pard\\plain{\\super\\chftn} ${rtfText(n.getAttribute('data-fn') || '')}}`; return; }
      const st = n.style || {}; let on = '';
      if (t === 'B' || t === 'STRONG' || st.fontWeight === 'bold' || +st.fontWeight >= 600) on += '\\b';
      if (t === 'I' || t === 'EM' || st.fontStyle === 'italic') on += '\\i';
      if (t === 'U' || /underline/.test(st.textDecoration || '')) on += '\\ul';
      if (t === 'S' || t === 'STRIKE' || /line-through/.test(st.textDecoration || '')) on += '\\strike';
      if (t === 'SUP') on += '\\super'; if (t === 'SUB') on += '\\sub';
      if (st.fontSize) { const pt = parseFloat(st.fontSize) * (/px$/.test(st.fontSize) ? 0.75 : 1); if (pt > 0) on += `\\fs${Math.round(pt * 2)}`; }
      out += on ? `{${on} ${inline(n, notes)}}` : inline(n, notes);
    });
    return out;
  }
  // opts.gaps: { paragraph fingerprint: how many empty lines followed it in Scrivener } (see importers.js rawLook)
  function htmlToRTF(html, style, opts = {}) {
    const gaps = opts.gaps || null, key = window.FolioImport && window.FolioImport.paraKey;
    const d = document.createElement('div'); d.innerHTML = html || '';
    const font = (style && style.font) || 'Times New Roman', size = Math.round(((style && style.size) || 12) * 2);
    const indent = Math.round(((style && style.indent) != null ? style.indent : 0.5) * 1440), line = Math.round(((style && style.lineHeight) || 1.5) * 240);
    const blocks = [];
    const walk = el => [...el.children].forEach(c => { if (/^(DIV|UL|OL|SECTION)$/.test(c.tagName) && c.querySelector('p,h1,h2,h3,li,blockquote')) walk(c); else blocks.push(c); });
    walk(d);
    let out = `{\\rtf1\\ansi\\ansicpg1252\\uc1\\deff0{\\fonttbl{\\f0\\froman\\fcharset0 ${rtfText(font)};}}{\\colortbl;\\red0\\green0\\blue0;}\n`;
    let first = true;
    for (const b of blocks) {
      const text = (b.textContent || '').trim(), isScene = b.classList.contains('scene') || /^([*#~]\s*){1,5}$/.test(text);
      const align = (b.style && b.style.textAlign) || '';
      const al = align === 'center' || isScene ? '\\qc' : align === 'right' ? '\\qr' : align === 'justify' ? '\\qj' : '\\ql';
      const h = /^H([1-3])$/.exec(b.tagName);
      if (h) { out += `\\pard\\plain\\f0\\fs${size + (4 - h[1]) * 6}\\b\\sb240\\sa120${al} ${inline(b)}\\b0\\par\n`; first = true; continue; }
      const fi = first || isScene || !text || /^(center|right)$/.test(align) ? 0 : indent;
      out += `\\pard\\plain\\f0\\fs${size}\\sl${line}\\slmult1\\fi${fi}${al}${b.tagName === 'BLOCKQUOTE' ? '\\li720\\ri720' : ''}${b.tagName === 'LI' ? '\\li360' : ''} ${b.tagName === 'LI' ? '\\bullet\\tab ' : ''}${inline(b)}\\par\n`;
      // the empty lines that followed this paragraph in Scrivener go back after it
      const g = gaps && text && key ? gaps[key(b.textContent)] : 0;
      for (let k = 0; k < (g || 0); k++) out += `\\pard\\plain\\f0\\fs${size}\\sl${line}\\slmult1\\fi${indent}\\ql \\par\n`;
      first = isScene ? true : (text ? false : first);
    }
    return out + '}';
  }

  // ------------------------------------------------------------------ building the .scriv folder
  const FRONT = /^\s*(title|title page|half[- ]title|front matter|copyright|dedication|epigraph|contents)\s*$/i;
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); })).toUpperCase();
  const xml = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function stamp(t) {
    const d = t ? new Date(t) : new Date(), p = n => String(n).padStart(2, '0'), o = -d.getTimezoneOffset();
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} ${o >= 0 ? '+' : '-'}${p(Math.floor(Math.abs(o) / 60))}${p(Math.abs(o) % 60)}`;
  }
  const rgb01 = c => { const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(c || '') || /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c || ''); if (!m) return '0.749996 0.910002 0.979995'; const v = m[0].startsWith('rgb') ? [m[1], m[2], m[3]].map(Number) : [m[1], m[2], m[3]].map(x => parseInt(x, 16)); return v.map(x => (x / 255).toFixed(6)).join(' '); };

  // ------------------------------------------------------------------ putting Scrivener's binder back as it was
  // An imported book remembers where each item was in Scrivener (node.sx: its id, its parent's id and place, title and
  // icon; project.scrivOrigin: the top of the binder). Every item that's still here goes back under its old parent, in
  // its old place, with its old id. Things made here go next to the item before them in Unwip's binder (or into the
  // Draft, Research or Trash for those sections; a section of Unwip's own with nothing from Scrivener becomes a folder
  // of its own). Something moved to Unwip's Trash goes to Scrivener's Trash. Returns the top level as a list of v.
  const isUUID = u => /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(u || '');
  function restoreTree(P) {
    const tops = (P.scrivOrigin && P.scrivOrigin.tops) || [];
    const byU = new Map(), own = new Map(), notes = new Map(), parentOf = new Map(), order = new Map(), rootOfN = new Map();
    let k = 0;
    const walk = (list, parent, root) => { for (const n of list || []) { order.set(n, k++); parentOf.set(n, parent); rootOfN.set(n, root);
      const sx = n.sx || {};
      if (sx.own) own.set(sx.own, n); else if (sx.notesOf) (notes.get(sx.notesOf) || notes.set(sx.notesOf, []).get(sx.notesOf)).push(n); else if (sx.u && !byU.has(sx.u)) byU.set(sx.u, n);
      if (n.children) walk(n.children, n, root); } };
    for (const r of P.binder) if (r.kind !== 'conflicts') walk(r.children, r, r);
    const topOf = t => tops.find(x => x.t === t);
    const draft = topOf('DraftFolder') || { u: 'draft', t: 'DraftFolder', ti: 'Draft', i: 0, p: '' };
    const research = topOf('ResearchFolder') || { u: 'research', t: 'ResearchFolder', ti: 'Research', i: tops.length, p: '' };
    const trash = topOf('TrashFolder') || { u: 'trash', t: 'TrashFolder', ti: 'Trash', i: tops.length + 1, p: '' };
    const allTops = [...tops]; for (const x of [draft, research, trash]) if (!allTops.includes(x)) allTops.push(x);
    // the virtual folders: each top Scrivener had that isn't an item here any more
    const V = new Map();   // key -> v
    const vOf = (key, extra) => V.get(key) || V.set(key, { kids: [], ...extra }).get(key);
    const topKey = t => byU.has(t.u) ? byU.get(t.u) : 'C:' + t.u;
    for (const t of allTops) if (!byU.has(t.u)) vOf('C:' + t.u, { n: null, id: isUUID(t.u) ? t.u.toUpperCase() : uuid(), type: t.t, title: t.ti || 'Untitled', icon: t.ic, folder: true, sx: { u: t.u, p: '', i: t.i } });
    const inTrash = n => (rootOfN.get(n) || {}).kind === 'trash';
    // a section of Unwip's: the Scrivener folder most of its items came from, or a new folder named after it
    const sectionKey = r => {
      if (r.kind === 'manuscript') return topKey(draft); if (r.kind === 'research') return topKey(research); if (r.kind === 'trash') return topKey(trash);
      const count = {}; for (const c of r.children || []) { const p = c.sx && c.sx.p; if (p && allTops.some(t => t.u === p)) count[p] = (count[p] || 0) + 1; }
      const best = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
      if (best) return topKey(allTops.find(t => t.u === best[0]));
      return vOf('NEW:' + r.id, { n: null, id: uuid(), type: 'Folder', title: r.title, folder: true, sx: { p: '', i: research.i - 0.5 } }) && 'NEW:' + r.id;
    };
    const keyOfParent = p => (p.root ? sectionKey(p) : p);
    const want = new Map();
    for (const n of order.keys()) {
      const sx = n.sx || {}; if (sx.own || sx.notesOf) continue;
      // the folder Unwip made for document notes: they go back onto their documents, so the folder isn't needed
      if (!sx.u && n.type === 'folder' && (n.children || []).length && n.children.every(c => c.sx && c.sx.notesOf)) continue;
      let d = null;
      if (sx.u) {
        if (sx.p === '') d = 'TOP';
        else if (byU.has(sx.p)) d = byU.get(sx.p);
        else if (allTops.some(t => t.u === sx.p)) d = 'C:' + sx.p;
      }
      if (!d) d = keyOfParent(parentOf.get(n));
      // moved to the Trash here: Scrivener's Trash, unless it was in there already
      if (inTrash(n) && !(d === topKey(trash) || (typeof d === 'object' && inTrash(d)))) d = topKey(trash);
      want.set(n, d);
    }
    // never inside itself (a folder moved into one of its own pages here): then it stays where Unwip has it
    for (const n of want.keys()) { let d = want.get(n), steps = 0; while (typeof d === 'object' && d && steps++ < 999) { if (d === n) { want.set(n, keyOfParent(parentOf.get(n)) === n ? 'TOP' : keyOfParent(parentOf.get(n))); break; } d = want.get(d); } }
    // every item here as a v, its children gathered under it
    const vn = new Map();
    for (const n of want.keys()) { const sx = n.sx || {}; vn.set(n, { n, id: isUUID(sx.u) ? sx.u.toUpperCase() : uuid(), type: n.map ? null : (n.type === 'folder' ? (sx.t === 'Text' ? 'Text' : sx.t && /Folder/.test(sx.t) && !/^(Draft|Research|Trash)Folder$/.test(sx.t) ? sx.t : 'Folder') : 'Text'), title: sx.ti != null && sx.tn === n.title ? sx.ti : null, icon: sx.ic, folder: n.type === 'folder', kids: [], sx }); }
    const holder = d => d === 'TOP' ? null : typeof d === 'string' ? V.get(d) : vn.get(d);
    const top = [];
    for (const [n, d] of [...want.entries()].sort((a, b) => order.get(a[0]) - order.get(b[0]))) { const h = holder(d), v = vn.get(n); if (h) { h.kids.push(v); h.folder = true; } else top.push(v); }
    for (const v of V.values()) top.push(v);   // Scrivener's own top folders, and new ones for sections of Unwip's
    // own text and notes
    for (const v of [...vn.values(), ...V.values()]) { const u = v.sx && v.sx.u; if (u && own.has(u)) { v.own = own.get(u); v.folder = true; } if (u && notes.has(u)) v.notes = notes.get(u); }
    // order: Scrivener's order among the things that were there; anything new goes after the one before it here
    const sortKids = (list, parentU) => {
      let last = -1, j = 0;
      const keyed = list.map(v => { const same = v.sx && v.sx.u !== undefined && v.sx.p === parentU && v.sx.i >= 0; if (same) { last = v.sx.i; return [v.sx.i, v]; } return [last + 0.001 * (++j), v]; });
      keyed.sort((a, b) => a[0] - b[0]); list.length = 0; list.push(...keyed.map(x => x[1]));
      for (const v of list) if (v.kids.length) sortKids(v.kids, v.sx && v.sx.u);
    };
    for (const v of [...vn.values(), ...V.values()]) if (v.kids.length) sortKids(v.kids, v.sx && v.sx.u);
    top.sort((a, b) => ((a.sx && a.sx.p === '' ? a.sx.i : 1e6) - (b.sx && b.sx.p === '' ? b.sx.i : 1e6)));
    return top;
  }

  async function buildScriv(name, onStep, opts = {}) {
    const P = S.project, files = [], docsOut = [];
    const stamped = stamp();
    let anyTT = false; U.walkTree(P.binder, n => { if (n.tt) anyTT = true; });
    // statuses and labels
    const statuses = (P.statuses && P.statuses.length ? P.statuses : [{ id: 'todo', name: 'To Do' }, { id: 'draft', name: 'First Draft' }, { id: 'revised', name: 'Revised Draft' }, { id: 'final', name: 'Final Draft' }]);
    const statusId = new Map(statuses.map((s, i) => [s.id, i]));
    const labels = []; U.walkTree(P.binder, n => { if (n.label && n.label.n && !labels.some(l => l.n === n.label.n)) labels.push(n.label); });
    const labelId = new Map(labels.map((l, i) => [l.n, i]));
    let mapsSkipped = 0, pics = 0;
    // what was written for each document (its id -> words), so Send out can prove nothing was left behind
    const wrote = new Map(), Clip = window.FolioClip;
    const wordsOf = html => { try { return countWords(Clip.extract(Clip.parseHTML(html || '')).blocks); } catch { return 0; } };
    // v: where it goes when the binder is put back as it was in Scrivener (see restoreTree): its id there, its type,
    // title and icon, what's inside it, a folder's own text and the document notes. n is null for a folder only
    // Scrivener had (Draft, Research, Trash, or a folder whose contents went into Characters here).
    async function item(n, inDraft, depth, v) {
      n = n || { type: 'folder', title: v.title, children: [] };
      const id = (v && v.id) || uuid(), isFolder = v ? v.folder : n.type === 'folder';
      const meta = [];
      if (n.label && labelId.has(n.label.n)) meta.push(`<LabelID>${labelId.get(n.label.n)}</LabelID>`);
      if (n.status && statusId.has(n.status)) meta.push(`<StatusID>${statusId.get(n.status)}</StatusID>`);
      if (inDraft && !n.noBook) meta.push('<IncludeInCompile>Yes</IncludeInCompile>');   // left out of the book: unticked in Scrivener
      // the icon: Scrivener's own (a picture icon, or an emoji Unwip couldn't show) goes back as it was, unless it was changed here
      const sx = n.sx || {}, iconWas = sx.ic ? (/^\{(.+)\}$/.exec(sx.ic) || [])[1] : null;
      if (v && v.icon && (!n.icon || n.icon === iconWas || !n.sx)) meta.push(`<IconFileName>${xml(v.icon)}</IconFileName>`);
      else if (n.icon && !/^[a-z]+$/i.test(n.icon)) meta.push(`<IconFileName>{${xml(n.icon)}}</IconFileName>`);
      else if (sx.ic && !n.icon) meta.push(`<IconFileName>${xml(sx.ic)}</IconFileName>`);
      let type = (v && v.type) || (isFolder ? 'Folder' : 'Text'), kids = '';
      if (n.map && opts.noMaps) return '';
      if (n.map) {
        // a map comes across as a picture of it
        const pic = window.UnwipMaps && window.UnwipMaps.pictures ? await window.UnwipMaps.pictures(n.id).catch(() => []) : [];
        if (pic.length) { const b64 = pic[0].canvas.toDataURL('image/png').split(',')[1]; const bin = atob(b64), arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); files.push({ name: `Files/Data/${id}/content.png`, data: arr }); type = 'Image'; pics++; }
        else { mapsSkipped++; return ''; }
      } else if (!isFolder) {
        let html = n.id === S.docId ? U.editor.innerHTML : await U.api.loadDoc(S.slug, n.id).catch(() => '');
        // suggested changes are decided in the copy, as chosen in the summary (the book here keeps them)
        html = opts.tcm === 'reject' ? U.rejectChanges(html) : U.acceptChanges(html);
        if (n.id) wrote.set(n.id, wordsOf(html));
        if (opts.notesFor) { const c = opts.notesFor(html); if (c) (v || (v = { kids: [] })).cmt = c; }
        if (opts.addHTML) html += opts.addHTML(n) || '';
        // a chapter whose title was typed into its text in Scrivener gets that line back (see titles.js)
        // remembered typed titles go back exactly; a book with none remembered gets each chapter's name typed in
        const line = !opts.restore || !inDraft ? '' : n.tt && n.tt.line ? n.tt.line : (anyTT || FRONT.test(n.title || '') ? '' : (n.title || ''));
        // the typed title looks as it did in Scrivener when Unwip remembered that (size, bold, alignment and the
        // empty lines under it); otherwise like Unwip's own chapter title
        const t0 = opts.look && n.sv && n.sv.t && n.sv.t.s ? n.sv.t : null, h1 = (P.style.headings && P.style.headings.h1) || { size: 18, bold: true, align: 'center' };
        const tl = t0 ? { s: t0.s, b: t0.b, a: { c: 'center', r: 'right', j: 'justify' }[t0.a] || 'left', n: t0.n || 1 } : { s: h1.size || 18, b: h1.bold ? 1 : 0, a: h1.align || 'center', n: 1 };
        const typed = line ? `<p style="text-align: ${tl.a}"><span style="font-size: ${tl.s}pt">${tl.b ? '<b>' : ''}${esc(line)}${tl.b ? '</b>' : ''}</span></p>${'<p><br></p>'.repeat(Math.min(6, tl.n))}` : '';
        const gaps = opts.look && P.style.blankLines !== 'keep' && n.sv && n.sv.g ? Object.fromEntries(n.sv.g.map(x => { const [k, c] = x.split(':'); return [k, +c || 1]; })) : null;
        files.push({ name: `Files/Data/${id}/content.rtf`, data: htmlToRTF(typed + html, opts.look && P.scrivLayout ? { ...P.style, ...P.scrivLayout } : P.style, { gaps }) });
        docsOut.push(n.title); if (onStep) onStep(docsOut.length);
      }
      // a folder's own text (it was a page at the top of the folder here) and the document notes go back where they were
      if (v && v.own) {
        let html = v.own.id === S.docId ? U.editor.innerHTML : await U.api.loadDoc(S.slug, v.own.id).catch(() => '');
        html = opts.tcm === 'reject' ? U.rejectChanges(html) : U.acceptChanges(html);
        wrote.set(v.own.id, wordsOf(html));
        if (opts.notesFor) { const c = opts.notesFor(html); if (c) v.cmt = (v.cmt || '') + c; }
        files.push({ name: `Files/Data/${id}/content.rtf`, data: htmlToRTF(html, P.style) }); docsOut.push(v.own.title); if (onStep) onStep(docsOut.length);
      }
      // document notes, and the comments on its text (Send out: "comments go into the document's notes")
      if ((v && v.notes && v.notes.length) || (v && v.cmt)) {
        let html = ''; for (const d of (v.notes || [])) { const h = await U.api.loadDoc(S.slug, d.id).catch(() => ''); wrote.set(d.id, wordsOf(h)); html += h; }
        if (v.cmt) html += v.cmt;
        files.push({ name: `Files/Data/${id}/notes.rtf`, data: htmlToRTF(html, P.style) });
      }
      if (n.synopsis) files.push({ name: `Files/Data/${id}/synopsis.txt`, data: n.synopsis });
      if (v) for (const k of v.kids) kids += await item(k.n, inDraft || k.type === 'DraftFolder', depth + 1, k);
      else if (isFolder) for (const c of n.children || []) kids += await item(c, inDraft, depth + 1);
      const pad = '    '.repeat(depth + 2);
      // the title: as it was in Scrivener, unless it was renamed here (tidying a typed title on the way in isn't renaming)
      const title = v && v.title != null ? v.title : opts.restore && inDraft && n.tt && n.tt.was ? n.tt.was : (n.title || 'Untitled');
      return `${pad}<BinderItem UUID="${id}" Type="${type}" Created="${stamp(n.created || P.created)}" Modified="${stamp(n.mod)}">\n${pad}    <Title>${xml(title)}</Title>\n${pad}    ${meta.length ? `<MetaData>${meta.join('')}</MetaData>` : '<MetaData/>'}\n${kids ? `${pad}    <Children>\n${kids}${pad}    </Children>\n` : ''}${pad}</BinderItem>\n`;
    }
    const root = k => P.binder.find(r => r.kind === k) || { children: [] };
    const sect = async (r, type, id, inDraft, title) => {
      let kids = ''; for (const c of r.children || []) kids += await item(c, inDraft, 1);
      return `        <BinderItem UUID="${uuid()}" Type="${type}" Created="${stamped}" Modified="${stamped}">\n            <Title>${xml(title)}</Title>\n            <MetaData/>\n${kids ? `            <Children>\n${kids}            </Children>\n` : ''}        </BinderItem>\n`;
    };
    // extra documents Unwip makes on the way out (Send out's Story Bible document), at the top of the binder
    const extras = async () => { let x = ''; for (const e of opts.extra || []) { const id = uuid(); files.push({ name: `Files/Data/${id}/content.rtf`, data: htmlToRTF(e.html, P.style) }); docsOut.push(e.title);
      x += `        <BinderItem UUID="${id}" Type="Text" Created="${stamped}" Modified="${stamped}">\n            <Title>${xml(e.title)}</Title>\n            <MetaData/>\n        </BinderItem>\n`; } return x; };
    let binder = '';
    if (opts.structure && P.scrivOrigin) { for (const v of restoreTree(P)) { if (v.type === 'TrashFolder') binder += await extras(); binder += await item(v.n, v.type === 'DraftFolder', 0, v); } }
    else if (opts.flat) {
      // chapters only: every chapter of the manuscript in story order, straight in the Draft, no folders
      const flat = []; U.walkTree(root('manuscript').children || [], n => { if (n.type !== 'folder') flat.push(n); });
      binder = await sect({ children: flat }, 'DraftFolder', 0, true, 'Draft');
      binder += await sect({ children: [] }, 'ResearchFolder', 1, false, 'Research');
      binder += await sect({ children: [] }, 'TrashFolder', 2, false, 'Trash');
    }
    else {
    binder = await sect(root('manuscript'), 'DraftFolder', 0, true, 'Draft');
    // everything else in the order of your binder, each section as a top-level folder
    for (const r of P.binder) {
      if (['manuscript', 'research', 'trash', 'conflicts'].includes(r.kind)) continue;
      if (!(r.children || []).length) continue;
      let kids = ''; for (const c of r.children) kids += await item(c, false, 1);
      binder += `        <BinderItem UUID="${uuid()}" Type="Folder" Created="${stamped}" Modified="${stamped}">\n            <Title>${xml(r.title)}</Title>\n            <MetaData/>\n            <Children>\n${kids}            </Children>\n        </BinderItem>\n`;
    }
    binder += await extras();
    binder += await sect(root('research'), 'ResearchFolder', 1, false, 'Research');
    binder += await sect(root('trash'), 'TrashFolder', 2, false, 'Trash');
    }
    const scrivx = `<?xml version="1.0" encoding="UTF-8"?>
<ScrivenerProject Template="No" Version="2.0" Identifier="${uuid()}" Creator="Unwip" Device="Unwip" Modified="${stamped}" ModID="${uuid()}">
    <Binder>
${binder}    </Binder>
    <LabelSettings>
        <Title>Label</Title>
        <DefaultLabelID>-1</DefaultLabelID>
        <Labels>
            <Label ID="-1">No Label</Label>
${labels.map((l, i) => `            <Label ID="${i}" Color="${rgb01(l.c)}">${xml(l.n)}</Label>`).join('\n')}
        </Labels>
    </LabelSettings>
    <StatusSettings>
        <Title>Status</Title>
        <DefaultStatusID>-1</DefaultStatusID>
        <StatusItems>
            <Status ID="-1">No Status</Status>
${statuses.map((s, i) => `            <Status ID="${i}">${xml(s.name)}</Status>`).join('\n')}
        </StatusItems>
    </StatusSettings>
    <ProjectProperties>
        <ProjectTitle>${xml((P.book && P.book.title) || P.title || name)}</ProjectTitle>
        <FullName>${xml((P.book && P.book.author) || (S.settings && S.settings.author) || '')}</FullName>
    </ProjectProperties>
</ScrivenerProject>
`;
    // the other files Scrivener expects in a project: its settings, a styles list and a fingerprint of each document
    const bookTitle = (P.book && P.book.title) || P.title || name, author = (P.book && P.book.author) || (S.settings && S.settings.author) || '';
    const ini = s => String(s || '').replace(/[\r\n]+/g, ' ');
    files.unshift(
      { name: `${name}.scrivx`, data: scrivx }, { name: 'Files/version.txt', data: '23' },
      { name: 'Files/styles.xml', data: '<?xml version="1.0" encoding="UTF-8"?>\n<Styles>\n</Styles>\n' },
      { name: 'Snapshots/', dir: true, data: new Uint8Array(0) },
      { name: 'Settings/ui.ini', data: '[General]\nexpandedBinderItems=\nfirstEditorSource=\nsecondEditorSource=\ninspectorMode=0\n\n[Inspector]\nmode=0\n' },
      { name: 'Settings/compile.ini', data: `[General]\noutputType=-1\n\n[Content]\nDocumentSet=0\n\n[MetaData]\ntitle=${ini(bookTitle)}\nauthors=${ini(author)}\nlanguageCode=en\n` });
    return { files: files.map(f => ({ name: f.name, dir: !!f.dir, data: typeof f.data === 'string' ? new TextEncoder().encode(f.data) : f.data })), docs: docsOut.length, mapsSkipped, pics, wrote };
  }

  // the words in a list of blocks (the same count Send out uses for the book itself)
  // (Unwip's own word count: "don't" and "well-known" are one word each, as in the chapter list)
  function countWords(blocks) { let n = 0; for (const b of blocks || []) n += (b.runs || []).map(r => r.br ? ' ' : r.text || '').join('').match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)?.length || 0; return n; }
  async function saveScriv(safe, res) {
    if (api.exportScriv) return api.exportScriv(safe, res.files);
    const zip = window.FolioEPUB.zip(res.files.map(f => ({ name: `${safe}.scriv/${f.name}`, data: f.data })));
    const p = await api.exportBinary(zip, safe + '.scriv', 'zip', 'Scrivener project (zip)');
    return p ? safe + '.scriv (in a .zip: unzip it, then open it in Scrivener)' : null;
  }

  // ------------------------------------------------------------------ the window
  async function open() {
    if (!S.project) return U.toast('Open the book you want to take with you first.');
    await U.flushSave();
    let hasTyped = false, hasLook = !!S.project.scrivLayout; U.walkTree(S.project.binder, n => { if (n.tt) hasTyped = true; if (n.sv) hasLook = true; });
    const L = S.project.scrivLayout || {};
    const body = document.createElement('div'); body.className = 'nhf';
    const title = S.project.title || 'My book';
    body.innerHTML = `
      <p class="nhf-lead">No hard feelings. Taking your book somewhere else should be easy. Pick how you’d like “${esc(title)}” packed up. Nothing in Unwip is changed or removed.</p>
      <label class="nhf-opt"><input type="radio" name="nhf" value="scriv" checked><span><b>A Scrivener project</b><small>Opens in Scrivener 3 for Windows (tested). Scrivener on Mac should open it too, but that’s not yet tested by beta testers. Your manuscript becomes the Draft; characters, places, notes and other sections become folders; research and trash go to Scrivener’s own. Text with its formatting, footnotes, pictures, synopses, status, labels and icons come across, and maps as pictures.</small></span></label>
      <label class="nhf-opt"><input type="radio" name="nhf" value="one"><span><b>One Word file for Vellum or Atticus</b><small>Your manuscript as a single Word file, laid out the way those apps import a book: each chapter title a Heading 1, scene breaks as ***, no stray blank lines. <i class="untested">Should work, but not yet tested by beta testers.</i></small></span></label>
      <label class="nhf-opt"><input type="radio" name="nhf" value="docx"><span><b>A folder of Word files</b><small>One per chapter, in folders like your binder, numbered “01 - Chapter One” so they stay in order. For Word, Google Docs, Ulysses and almost anything else. <i class="untested">Should work, but not yet tested by beta testers.</i></small></span></label>
      <label class="nhf-opt"><input type="radio" name="nhf" value="md"><span><b>A folder of Markdown files</b><small>For Obsidian, iA Writer, Bear, Notion and plain-text apps. <i class="untested">Should work, but not yet tested by beta testers.</i></small></span></label>
      <label class="nhf-opt"><input type="radio" name="nhf" value="backup"><span><b>A full Unwip backup</b><small>Everything exactly as it is here, in one file, in case you ever come back.</small></span></label>
      ${hasTyped
        ? `<label class="check nhf-tt"><input type="checkbox" id="nhf-tt" checked><span>Put the typed chapter titles back at the top of each chapter, as they were in Scrivener<small>When this book came in, Unwip took the titles typed into the text (“Chapter 1: …”) out, because it shows chapter names as headings itself. This puts each original line, and the chapter’s old binder name, back.</small></span></label>`
        : `<label class="check nhf-tt"><input type="checkbox" id="nhf-tt"><span>Type each chapter’s name at the top of its text<small>Your chapters don’t have their titles typed into the text. Scrivener adds titles itself when it compiles, so leave this off unless you want them typed in.</small></span></label>`}
      ${S.project.scrivOrigin ? `<label class="check nhf-tt"><input type="checkbox" id="nhf-struct" checked><span>Put everything back where it was in Scrivener<small>The same folders, order, names and icons as when this book came in. Things you added in Unwip go next to the item before them; things you deleted stay out (or go in Scrivener’s Trash if they’re in Unwip’s). Off: Unwip’s own layout, with Characters, Places and the rest as folders.</small></span></label>` : ''}
      ${hasLook ? `<label class="check nhf-tt"><input type="checkbox" id="nhf-look" checked><span>Put back how it looked in Scrivener<small>Title lines at their old size, the empty lines between paragraphs where you had them${L.lineHeight ? `, and Scrivener’s ${L.lineHeight}× line spacing` : ''}${L.size ? ` at ${L.size}pt` : ''}. Untick to use Unwip’s layout instead.</small></span></label>` : ''}
      <p class="sim-small">Next you’ll see exactly what’s going and what isn’t, before anything is saved.</p>`;
    if (open.last) { const r = body.querySelector(`[name="nhf"][value="${open.last}"]`); if (r) r.checked = true; }
    const ok = await U.modal({ title: 'No hard feelings: take your book with you', body, wide: true, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Next', value: true, kind: 'primary' }] });
    if (!ok) return;
    const how = open.last = body.querySelector('[name="nhf"]:checked').value;
    const XF = window.UnwipExportFolder;
    if (how === 'docx' || how === 'md') return XF && XF.open({ fmt: how, what: 'all' });
    if (how === 'one') return XF && XF.oneWord();
    if (how === 'backup') { try { const p = await api.backupExport(S.slug); if (p) U.toast('Full backup saved.'); } catch (e) { U.toast('Couldn’t save the backup.', 'warn'); } return; }
    // the summary: what's going, what isn't, and what to do with suggested changes
    const restore = !!(body.querySelector('#nhf-tt') || {}).checked, look = !!(body.querySelector('#nhf-look') || {}).checked, structure = !!(body.querySelector('#nhf-struct') || {}).checked;
    const t = await XF.tally(S.project.binder);
    const sum = document.createElement('div'); sum.className = 'nhf';
    sum.innerHTML = `<p class="nhf-lead">Here’s what goes into the Scrivener project. ${structure ? 'Everything goes back into the folders it came from in Scrivener, in the same order, with its old name and icon.' : 'Your manuscript becomes the Draft; characters, places, notes and other sections become folders; research and trash go to Scrivener’s own.'}</p>${XF.summaryHTML(t, 'scriv')}`;
    const go = await U.modal({ title: 'Before you pack it up', body: sum, wide: true, buttons: [{ label: 'Back', value: 'back', kind: 'ghost' }, { label: 'Pack it up', value: true, kind: 'primary' }] });
    if (go === 'back') return open();
    if (go !== true) return;
    const tcm = XF.changesChoice(sum);
    const safe = (title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '') || 'My book').slice(0, 80);
    U.toast('Packing it up…', '', 3000);
    let res;
    try { res = await buildScriv(safe, null, { restore, tcm, look, structure }); } catch (e) { return U.toast('Couldn’t make the Scrivener project: ' + esc(String(e.message || e)), 'warn', 8000); }
    try {
      const where = await saveScriv(safe, res);
      if (!where) return;
      window.UnwipStart && window.UnwipStart.done('export');
      await U.modal({ title: 'Packed up', body: `<p>“${esc(where)}” is ready: ${res.docs} document${res.docs === 1 ? '' : 's'}${res.pics ? ` and ${res.pics} map${res.pics === 1 ? '' : 's'} as pictures` : ''}.</p>
        <p>In Scrivener, choose <b>File › Open</b> and pick it. It may take a moment to rebuild its search index the first time.</p>
        <p class="sim-small">Your book is still here in Unwip, untouched. All the best with it.</p>`, buttons: [{ label: 'Close', value: true, kind: 'primary' }] });
    } catch (e) { U.toast('Couldn’t save it: ' + esc(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')), 'warn', 8000); }
  }

  return { open, htmlToRTF, buildScriv, restoreTree, saveScriv, countWords };
})();
