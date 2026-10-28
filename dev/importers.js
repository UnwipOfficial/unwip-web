// Unwip - importers: Word (.docx) and Scrivener (.scriv) projects.
window.FolioImport = (function () {
  'use strict';
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');   // also used inside attributes (comments)
  const qf = f => /^[\w-]+$/.test(f) ? f : `'${f.replace(/'/g, '')}'`;

  // ---------------------------------------------------------------- unzip (for .docx)
  async function unzip(bytes) {
    bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('This file is not a valid Word document.');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const out = {};
    const dec = new TextDecoder();
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const local = dv.getUint32(p + 42, true);
      const name = dec.decode(bytes.subarray(p + 46, p + 46 + nlen));
      p += 46 + nlen + xlen + clen;
      const lnlen = dv.getUint16(local + 26, true), lxlen = dv.getUint16(local + 28, true);
      const data = bytes.subarray(local + 30 + lnlen + lxlen, local + 30 + lnlen + lxlen + csize);
      out[name] = async () => {
        if (method === 0) return data;
        const ds = new DecompressionStream('deflate-raw');
        const buf = await new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer();
        return new Uint8Array(buf);
      };
    }
    return out;
  }

  // ---------------------------------------------------------------- .docx -> HTML
  async function docxToHTML(bytes) {
    const zip = await unzip(bytes);
    const text = async name => zip[name] ? new TextDecoder().decode(await zip[name]()) : null;
    const docXml = await text('word/document.xml');
    if (!docXml) throw new Error('No document text found in this Word file.');
    const parse = s => new DOMParser().parseFromString(s, 'application/xml');
    const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const kids = (el, name) => el ? [...el.childNodes].filter(n => n.localName === name) : [];
    const kid = (el, name) => kids(el, name)[0] || null;
    const val = el => el ? (el.getAttributeNS(W, 'val') ?? el.getAttribute('w:val')) : null;
    const onOff = el => el && !['0', 'false', 'off', 'none'].includes(String(val(el) ?? 'true'));

    // styles: names (for headings) and fonts / sizes
    const styles = {}; let defFont = null, defSize = null;
    const stylesXml = await text('word/styles.xml');
    if (stylesXml) {
      const sd = parse(stylesXml);
      const rd = sd.getElementsByTagNameNS(W, 'rPrDefault')[0];
      if (rd) { const rpr = kid(rd, 'rPr'); const f = kid(rpr, 'rFonts'); if (f) defFont = f.getAttributeNS(W, 'ascii') || null; const sz = kid(rpr, 'sz'); if (sz) defSize = +val(sz) / 2; }
      for (const st of sd.getElementsByTagNameNS(W, 'style')) {
        const id = st.getAttributeNS(W, 'styleId');
        const rpr = kid(st, 'rPr'), ppr = kid(st, 'pPr');
        const f = kid(rpr, 'rFonts');
        styles[id] = {
          name: val(kid(st, 'name')) || id, basedOn: val(kid(st, 'basedOn')),
          font: f ? f.getAttributeNS(W, 'ascii') : null, size: kid(rpr, 'sz') ? +val(kid(rpr, 'sz')) / 2 : null,
          bold: kid(rpr, 'b') ? onOff(kid(rpr, 'b')) : null, italic: kid(rpr, 'i') ? onOff(kid(rpr, 'i')) : null,
          align: ppr && kid(ppr, 'jc') ? val(kid(ppr, 'jc')) : null, numPr: ppr ? kid(ppr, 'numPr') : null
        };
      }
    }
    const styleProp = (id, prop, depth = 0) => { const s = styles[id]; if (!s || depth > 8) return null; return s[prop] ?? styleProp(s.basedOn, prop, depth + 1); };
    const normalFont = styleProp('Normal', 'font') || defFont, normalSize = styleProp('Normal', 'size') || defSize;

    const doc = parse(docXml);
    const body = doc.getElementsByTagNameNS(W, 'body')[0];
    let html = '';
    const paras = body.getElementsByTagNameNS(W, 'p');
    // pictures: relationship id -> media file
    const rels = {}; const relXml = await text('word/_rels/document.xml.rels');
    if (relXml) for (const r of parse(relXml).getElementsByTagName('Relationship')) rels[r.getAttribute('Id')] = r.getAttribute('Target');
    const picCache = {};
    const picture = async rid => {
      const t = rels[rid]; if (!t) return '';
      const name = 'word/' + t.replace(/^\.?\//, '').replace(/^word\//, '');
      if (picCache[name] != null) return picCache[name];
      const ext = (name.split('.').pop() || '').toLowerCase(); const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }[ext];
      if (!mime || !zip[name]) return (picCache[name] = '');
      try {
        const bytes = await zip[name]();
        const p = window.UnwipImages ? await window.UnwipImages.shrink(new Blob([bytes], { type: mime })) : null;
        return (picCache[name] = p ? `<img class="doc-img" src="${p.src}" data-w="${p.w}" data-h="${p.h}" style="width: 60%" alt="">` : '');
      } catch { return (picCache[name] = ''); }
    };
    // a reader's Word comments: id -> { by, at, note }
    const wcomments = {};
    const cXml = await text('word/comments.xml');
    if (cXml) for (const c of parse(cXml).getElementsByTagNameNS(W, 'comment')) {
      const id = c.getAttributeNS(W, 'id') || c.getAttribute('w:id');
      wcomments[id] = { by: c.getAttributeNS(W, 'author') || c.getAttribute('w:author') || 'Reader', at: c.getAttributeNS(W, 'date') || c.getAttribute('w:date') || '',
        note: [...c.getElementsByTagNameNS(W, 'p')].map(p => [...p.getElementsByTagNameNS(W, 't')].map(t => t.textContent).join('')).join('\n').trim() };
    }
    const activeC = new Set();
    let sectionBreak = false;
    // lists: Unwip has no list formatting, so each list line keeps its bullet or number as text ("• ", "3. ", "b) ")
    const numFmt = {}, absOf = {}, counters = {};
    const nXml = await text('word/numbering.xml');
    if (nXml) {
      const nd = parse(nXml);
      for (const a of nd.getElementsByTagNameNS(W, 'abstractNum')) { const aid = a.getAttributeNS(W, 'abstractNumId') || a.getAttribute('w:abstractNumId'); for (const l of kids(a, 'lvl')) numFmt[aid + ':' + (l.getAttributeNS(W, 'ilvl') || l.getAttribute('w:ilvl'))] = { fmt: val(kid(l, 'numFmt')) || 'decimal', text: val(kid(l, 'lvlText')) || '%1.', start: +val(kid(l, 'start')) || 1 }; }
      for (const n of nd.getElementsByTagNameNS(W, 'num')) absOf[n.getAttributeNS(W, 'numId') || n.getAttribute('w:numId')] = val(kid(n, 'abstractNumId'));
    }
    const roman = n => { let r = '', v = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]; for (const [k, s] of v) while (n >= k) { r += s; n -= k; } return r; };
    const fmtNum = (n, f) => f === 'lowerLetter' ? String.fromCharCode(96 + ((n - 1) % 26) + 1) : f === 'upperLetter' ? String.fromCharCode(64 + ((n - 1) % 26) + 1) : f === 'lowerRoman' ? roman(n) : f === 'upperRoman' ? roman(n).toUpperCase() : String(n);
    function listMark(ppr, sid) {
      const np = (ppr && kid(ppr, 'numPr')) || (sid ? styleProp(sid, 'numPr') : null); if (!np) return '';
      const numId = val(kid(np, 'numId')), ilvl = +val(kid(np, 'ilvl')) || 0;
      if (!numId || numId === '0') return '';
      const L = numFmt[absOf[numId] + ':' + ilvl] || { fmt: 'bullet' };
      if (L.fmt === 'bullet' || L.fmt === 'none') return L.fmt === 'none' ? '' : '• ';
      const key = numId + ':' + ilvl; counters[key] = (counters[key] || (L.start - 1)) + 1;
      for (const k of Object.keys(counters)) if (k.startsWith(numId + ':') && +k.split(':')[1] > ilvl) delete counters[k];   // a sub-list starts again
      return L.text.replace(/%(\d)/g, (_, d) => fmtNum(counters[numId + ':' + (+d - 1)] || 1, (numFmt[absOf[numId] + ':' + (+d - 1)] || L).fmt)) + ' ';
    }
    for (const p of paras) {
      const ppr = kid(p, 'pPr');
      const sid = ppr ? val(kid(ppr, 'pStyle')) : null;
      const sname = (sid && styles[sid] ? styles[sid].name : sid || '').toLowerCase();
      let tag = 'p';
      const hm = sname.match(/heading\s*(\d)/);
      if (hm) tag = 'h' + Math.min(3, +hm[1]); else if (sname === 'title') tag = 'h1'; else if (sname === 'subtitle') tag = 'h2'; else if (/quote/.test(sname)) tag = 'blockquote';
      const jc = (ppr && kid(ppr, 'jc') ? val(kid(ppr, 'jc')) : null) || (sid ? styleProp(sid, 'align') : null);
      const align = jc === 'center' ? 'center' : jc === 'right' || jc === 'end' ? 'right' : jc === 'both' ? 'justify' : null;
      const pageBreakBefore = (ppr && kid(ppr, 'pageBreakBefore')) || sectionBreak;
      sectionBreak = !!(ppr && kid(ppr, 'sectPr'));
      let inner = esc(listMark(ppr, sid));
      const runs = [];
      // collect runs (also inside hyperlinks / smart tags)
      // tracked changes from an editor (w:ins / w:del) come in as suggestions
      const tcOf = new Map(); let anchor = null;
      (function collect(el, tc) { for (const c of el.childNodes) {
        if (c.localName === 'r') { runs.push(c); if (tc) tcOf.set(c, tc); }
        else if (c.localName === 'commentRangeStart' || c.localName === 'commentRangeEnd') runs.push(c);
        else if (c.localName === 'bookmarkStart') { const nm = c.getAttributeNS(W, 'name') || c.getAttribute('w:name') || ''; if (/^unwip_/.test(nm)) anchor = nm.slice(6); }
        else if (c.localName === 'ins' || c.localName === 'del') collect(c, { k: c.localName, a: c.getAttributeNS(W, 'author') || c.getAttribute('w:author') || 'Editor', t: Date.parse(c.getAttributeNS(W, 'date') || c.getAttribute('w:date') || '') || 0 });
        else if (['hyperlink', 'smartTag', 'sdt', 'sdtContent', 'fldSimple'].includes(c.localName)) collect(c, tc);
      } })(p, null);
      let hasPageBreak = false, breakAfter = false;
      for (const r of runs) {
        if (r.localName !== 'r') { const cid = r.getAttributeNS(W, 'id') || r.getAttribute('w:id'); if (r.localName === 'commentRangeStart') activeC.add(cid); else activeC.delete(cid); continue; }
        const rpr = kid(r, 'rPr');
        const rs = rpr ? val(kid(rpr, 'rStyle')) : null;
        const bold = rpr && kid(rpr, 'b') ? onOff(kid(rpr, 'b')) : (rs && styleProp(rs, 'bold')) || false;
        const italic = rpr && kid(rpr, 'i') ? onOff(kid(rpr, 'i')) : (rs && styleProp(rs, 'italic')) || false;
        const underline = rpr && kid(rpr, 'u') && val(kid(rpr, 'u')) !== 'none';
        const strike = rpr && kid(rpr, 'strike') && onOff(kid(rpr, 'strike'));
        const va = rpr && kid(rpr, 'vertAlign') ? val(kid(rpr, 'vertAlign')) : null;
        const fEl = rpr && kid(rpr, 'rFonts');
        const font = (fEl && fEl.getAttributeNS(W, 'ascii')) || (sid && styleProp(sid, 'font')) || normalFont;
        const size = rpr && kid(rpr, 'sz') ? +val(kid(rpr, 'sz')) / 2 : (sid && styleProp(sid, 'size')) || normalSize;
        let t = '';
        for (const c of r.childNodes) {
          if (c.localName === 'drawing' || c.localName === 'pict') {
            const blip = c.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'blip')[0] || c.getElementsByTagNameNS('urn:schemas-microsoft-com:vml', 'imagedata')[0];
            const rid = blip && (blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed') || blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
            if (rid) { const im = await picture(rid); if (im) { inner += im; } }
            continue;
          }
          if (c.localName === 't' || (c.localName === 'delText' && tcOf.get(r))) t += esc(c.textContent);
          else if (c.localName === 'tab') t += ' ';
          else if (c.localName === 'br') { if ((c.getAttributeNS(W, 'type') || c.getAttribute('w:type')) === 'page') { if (inner || t) breakAfter = true; else hasPageBreak = true; } else t += '<br>'; }
          else if (c.localName === 'noBreakHyphen') t += '-';
          else if (c.localName === 'sym') t += '';
        }
        if (!t) continue;
        if (va === 'superscript') t = `<sup>${t}</sup>`; if (va === 'subscript') t = `<sub>${t}</sub>`;
        if (strike) t = `<s>${t}</s>`; if (underline) t = `<u>${t}</u>`; if (italic) t = `<i>${t}</i>`; if (bold) t = `<b>${t}</b>`;
        const css = []; if (font) css.push(`font-family:${qf(font)}`); if (size) css.push(`font-size:${size}pt`);
        let piece = css.length ? `<span style="${css.join(';')}">${t}</span>` : t;
        const tc = tcOf.get(r); if (tc) piece = `<${tc.k} class="tc-${tc.k}" data-a="${esc(tc.a)}" data-t="${tc.t || ''}">${piece}</${tc.k}>`;
        for (const cid of activeC) { const c = wcomments[cid]; if (c) piece = `<span class="cmt" data-cid="w${esc(cid)}" data-note="${esc(c.note)}" data-at="${esc(c.at)}" data-by="${esc(c.by)}">${piece}</span>`; }
        inner += piece;
      }
      html += `<${tag}${anchor ? ` data-anchor="${esc(anchor)}"` : ''}${align ? ` style="text-align:${align}"` : ''}${pageBreakBefore || hasPageBreak ? ' data-break="1"' : ''}${breakAfter ? ' data-break-after="1"' : ''}>${inner.replace(/^ +/, '') || '<br>'}</${tag}>`;
    }
    return html;
  }

  // split imported HTML into chapters at Heading 1 or "Chapter …" lines
  function splitChapters(html) {
    const div = document.createElement('div'); div.innerHTML = html;
    const chapters = []; let cur = null;
    for (const el of [...div.children]) {
      const t = el.textContent.trim();
      const isHead = el.tagName === 'H1' || (/^(chapter|prologue|epilogue|part)\b/i.test(t) && t.length < 90 && (el.tagName !== 'P' || el.style.textAlign === 'center' || el.querySelector('b') || t.split(/\s+/).length <= 8));
      if (isHead) { cur = { title: t || 'Chapter', html: '' }; chapters.push(cur); continue; }
      if (!cur) { if (!t) continue; cur = { title: 'Opening', html: '' }; chapters.push(cur); }
      cur.html += el.outerHTML;
    }
    return chapters;
  }

  // ---------------------------------------------------------------- Scrivener
  // returns { binder: [Unwip root folders], docs: {id: html}, report }
  // where a top-level Scrivener folder goes when nobody has said otherwise
  function guessTarget(type, title) {
    const t = (title || '').toLowerCase();
    if (type === 'DraftFolder') return 'manuscript';
    if (type === 'ResearchFolder') return 'research';
    if (type === 'TrashFolder') return 'trash';
    if (/character|cast|people/.test(t)) return 'characters';
    if (/place|location|setting|world/.test(t)) return 'places';
    if (/^items?$|objects|artifacts|artefacts/.test(t)) return 'items';
    if (/note|idea|scrap|misc|to ?do|plan|outline|brainstorm|inbox/.test(t)) return 'notes';
    // any other top-level folder ("Skills & Abilities", "Magic System") is the writer's own: it keeps its own section
    return type === 'Folder' ? 'new' : 'notes';
  }
  // A short fingerprint of a paragraph's words, so the empty lines that followed it in Scrivener can be put back
  // after the same paragraph when the book goes back to Scrivener, even if other paragraphs have changed since.
  function paraKey(text) {
    const t = String(text || '').replace(/[\u00a0\u200b]/g, ' ').replace(/\s+/g, ' ').trim(); if (!t) return '';
    let h = 0x811c9dc5; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(36);
  }
  // what a Scrivener document looked like before Unwip tidied it: the first line's size, weight and alignment
  // (a typed chapter title, usually), and which paragraphs had empty lines after them
  function rawLook(html) {
    if (!html) return null;
    const d = document.createElement('div'); d.innerHTML = html;
    const blocks = [...d.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote')].filter(b => !b.querySelector('p, li'));
    const full = b => !!((b.textContent || '').replace(/[\u00a0\u200b]/g, ' ').trim() || b.querySelector('img'));
    const out = {}, gaps = {};
    const first = blocks.findIndex(full);
    if (first >= 0) {
      const b = blocks[first], spans = [...b.querySelectorAll('[style*="font-size"]')];
      const size = Math.max(0, ...spans.map(x => parseFloat(x.style.fontSize) * (/px$/.test(x.style.fontSize) ? 0.75 : 1)).filter(x => x > 0));
      const txt = b.textContent.trim(), boldTxt = [...b.querySelectorAll('b, strong')].map(x => x.textContent).join('').trim();
      out.t = { s: size || 0, b: boldTxt.length >= txt.length * 0.8 ? 1 : 0, a: (b.style.textAlign || '').slice(0, 1) || 'l' };
      let n = 0; for (let j = first + 1; j < blocks.length && !full(blocks[j]); j++) n++;
      out.t.n = n;
    }
    for (let i = 0; i < blocks.length; i++) {
      if (!full(blocks[i])) continue;
      let n = 0, j = i + 1; for (; j < blocks.length && !full(blocks[j]); j++) n++;
      if (n && j < blocks.length) { const k = paraKey(blocks[i].textContent); if (k) gaps[k] = Math.max(gaps[k] || 0, n); }
    }
    const g = Object.entries(gaps).map(([k, n]) => n > 1 ? `${k}:${n}` : k);
    if (g.length) out.g = g;
    return out.t || out.g ? out : null;
  }
  // The project's binder: the .scrivx file, or, if that's damaged, Scrivener's own spare copy (newest first)
  function binderOf(data) {
    const tryParse = t => { if (!t) return null; const x = new DOMParser().parseFromString(t, 'application/xml'); return !x.querySelector('parsererror') && x.querySelector('Binder') ? x : null; };
    const main = tryParse(data.scrivx); if (main) return { xml: main, spare: null };
    for (const sp of (data.spares || []).slice().sort((a, b) => (b.at || 0) - (a.at || 0))) { const x = tryParse(sp.xml); if (x) return { xml: x, spare: sp }; }
    throw new Error('This Scrivener project’s main file (the .scrivx inside it) is damaged, and there was no spare copy to use. Try opening it in Scrivener first, which can often repair it, or use one of Scrivener’s automatic backups (File › Back Up › Show Backup Folder).');
  }
  // step 1 of importing: read the structure only (nothing is converted or changed) for the preview screen
  function scrivenerScan(data) {
    const B = binderOf(data), xml = B.xml;
    const top = xml.querySelector('Binder');
    const count = el => { let docs = 0, folders = 0, pics = 0, other = 0; for (const b of el.querySelectorAll('BinderItem')) { const ty = b.getAttribute('Type'); if (/Folder/.test(ty)) folders++; else if (ty === 'Image') pics++; else if (['PDF', 'WebArchive', 'Media'].includes(ty)) other++; else docs++; } return { docs, folders, pics, other }; };
    const groups = [...top.children].filter(c => c.tagName === 'BinderItem').map(item => {
      const type = item.getAttribute('Type'), title = ((item.querySelector(':scope > Title') || {}).textContent || 'Untitled').trim();
      const c = count(item); if (!/Folder/.test(type)) { if (type === 'Image') c.pics++; else if (['PDF', 'WebArchive', 'Media'].includes(type)) c.other++; else c.docs++; }
      return { key: item.getAttribute('UUID') || item.getAttribute('ID'), title, type, ...c, guess: guessTarget(type, title) };
    });
    // things Unwip doesn't bring across, named so nobody wonders where they went
    const notImported = ['compile settings'];
    if (xml.querySelector('Collections Collection')) notImported.push('collections and saved searches');
    if (xml.querySelector('Keywords Keyword, KeywordSettings Keyword')) notImported.push('keywords');
    if (xml.querySelector('CustomMetaDataSettings MetaDataField')) notImported.push('custom metadata');
    if (xml.querySelector('ProjectTargets, Targets')) notImported.push('word count targets');
    notImported.push('snapshots', 'document links and bookmarks', 'Scrivener-only styles');
    const pdfs = groups.reduce((a, g) => a + g.other, 0); if (pdfs) notImported.push(`${pdfs} PDF, web page or media file${pdfs === 1 ? '' : 's'}`);
    const labels = [...xml.querySelectorAll('LabelSettings Labels Label')].map(l => l.textContent.trim()).filter(n => n && !/^no label$/i.test(n));
    const statuses = [...xml.querySelectorAll('StatusSettings StatusItems Status')].map(l => l.textContent.trim()).filter(n => n && !/^no status$/i.test(n));
    const prop = sel => ((xml.querySelector(sel) || {}).textContent || '').trim();
    return { groups, notImported, labels, statuses, projectTitle: prop('ProjectProperties ProjectTitle'), author: prop('ProjectProperties FullName'), spare: B.spare ? { name: B.spare.name, at: B.spare.at } : null };
  }

  function scrivener(data, uid, opts = {}) {
    const xml = binderOf(data).xml;
    // Scrivener only writes <IncludeInCompile>Yes</IncludeInCompile> on what goes in the book, so in a project that uses
    // it, a manuscript item without it was unticked there and is left out of the book here too
    const usesInclude = [...xml.querySelectorAll('IncludeInCompile')].some(e => /^yes$/i.test(e.textContent.trim()));
    const report = { documents: 0, folders: 0, skipped: [], empty: 0, withNotes: 0, missing: [], unreadable: [], trashMissing: [] };
    const docs = {};
    const noteDocs = [];
    const labels = {}, statuses = {};
    const labelColor = {};
    for (const l of xml.querySelectorAll('LabelSettings Labels Label')) {
      labels[l.getAttribute('ID')] = l.textContent.trim();
      const c = (l.getAttribute('Color') || '').trim().split(/\s+/).map(Number);   // "0.7 0.85 0.63" (0-1) in Scrivener
      if (c.length >= 3 && c.every(x => !isNaN(x))) labelColor[l.getAttribute('ID')] = `rgb(${c.slice(0, 3).map(x => Math.round((x <= 1 ? x * 255 : x))).join(',')})`;
    }
    for (const s of xml.querySelectorAll('StatusSettings StatusItems Status')) statuses[s.getAttribute('ID')] = s.textContent.trim();
    // keep Scrivener's own status names (with colours from a matching palette), so nothing gets renamed
    const PALETTE = ['#9b968d', '#d39b2a', '#4a7fd0', '#7a5cc7', '#3f9a5a', '#c0392b', '#1f7a8c', '#b5651d'];
    const statusList = Object.entries(statuses).filter(([, n]) => n && !/^no status$/i.test(n)).map(([id, name], i) => ({ id: 's' + id, name, color: /done|final|complete/i.test(name) ? '#3f9a5a' : /to ?do/i.test(name) ? '#9b968d' : /first draft/i.test(name) ? '#d39b2a' : /revis/i.test(name) ? '#4a7fd0' : PALETTE[(i + 3) % PALETTE.length] }));

    // Scrivener's statuses have no colours of their own; the colour a writer sees next to them is the label the
    // chapters carry, and each status tends to go with one label ("Amazon Ready" chapters labelled Gold). So each status
    // takes the colour of the label most of its chapters have, when most of them agree (beta, 28 Oct)
    const statusLabels = {};
    const roots = { manuscript: [], characters: [], places: [], items: [], notes: [], research: [], trash: [] };
    const rtfToHTML = rtf => rtf ? window.FolioRTF.toHTML(rtf) : '';
    // Scrivener's paragraph layout, from the RTF itself: line spacing (\\slN\\slmult1, in 240ths of a line) and the
    // first-line indent (\\fiN, in twips), whichever is used most
    const lsCount = {}, fiCount = {};
    const layoutOf = rtf => { for (const m of rtf.matchAll(/\\sl(\d+)\\slmult1/g)) lsCount[m[1]] = (lsCount[m[1]] || 0) + 1; for (const m of rtf.matchAll(/\\fi(\d+)/g)) fiCount[m[1]] = (fiCount[m[1]] || 0) + 1; };
    const clean = html => html ? window.FolioClip.cleanPaste(html, {}) : '';
    const clean2 = (html, docFont, docSize) => html ? window.FolioClip.cleanPaste(html, { docFont, docSize }) : '';
    const textOf = html => { const d = document.createElement('div'); d.innerHTML = html; return d.textContent.trim(); };

    // where each item was in Scrivener (sx on the node): its id, its parent's id and place, its type, title and icon
    // exactly as they were, so "No hard feelings" can put the binder back the way it came (Unwip itself never uses it)
    const idOf = el => el ? (el.getAttribute('UUID') || el.getAttribute('ID') || '') : '';
    const origin = item => {
      const parent = item.parentElement && item.parentElement.tagName === 'Children' ? item.parentElement.parentElement : null;
      const sibs = item.parentElement ? [...item.parentElement.children].filter(c => c.tagName === 'BinderItem') : [];
      const meta = item.querySelector(':scope > MetaData'), ic = meta && meta.querySelector('IconFileName');
      return { u: idOf(item), p: idOf(parent), i: sibs.indexOf(item), t: item.getAttribute('Type') || 'Text', ti: (item.querySelector(':scope > Title') || {}).textContent || '', ...(ic && ic.textContent.trim() ? { ic: ic.textContent.trim() } : {}) };
    };
    function convert(item) {
      const type = item.getAttribute('Type');
      const sx = origin(item);
      // Scrivener 3 on Mac keeps text under the UUID, Scrivener on Windows (and older Mac versions) under the number ID
      const key = data.files[item.getAttribute('UUID')] ? item.getAttribute('UUID') : item.getAttribute('ID');
      const title = (item.querySelector(':scope > Title') || {}).textContent || 'Untitled';
      const childrenEl = item.querySelector(':scope > Children');
      const children = childrenEl ? [...childrenEl.children].filter(c => c.tagName === 'BinderItem').map(convert).filter(Boolean) : [];
      const f = data.files[key] || {};
      const meta = item.querySelector(':scope > MetaData');
      const statusId = meta && meta.querySelector('StatusID') ? meta.querySelector('StatusID').textContent.trim() : null;
      const synopsis = (f.synopsis || '').trim();
      const notesHTML = clean(rtfToHTML(f.notes));
      const iconEl = meta && meta.querySelector('IconFileName');
      const iconM = iconEl && /^\{(.+)\}$/.exec(iconEl.textContent.trim());   // emoji icons look like {🚧}
      if (type === 'Image' && f.image) {   // a picture in the binder becomes a document showing that picture
        const id = uid(); docs[id] = `<p style="text-align: center"><img class="doc-img" src="${f.image}" style="width: 100%" alt=""></p>`;
        report.documents++; report.images = (report.images || 0) + 1;
        return { node: { id, type: 'doc', title, words: 0, icon: '🖼️', sx, ...(synopsis ? { synopsis } : {}) }, type };
      }
      if (['Image', 'PDF', 'WebArchive', 'Media'].includes(type)) { report.skipped.push(`${title} (${type === 'WebArchive' ? 'web page' : type.toLowerCase()})`); return null; }
      const bodyHTML = rtfToHTML(f.content);   // cleaned at the end, once the project's main font is known
      // a text document whose file is missing, or isn't readable RTF, is named in the report rather than quietly empty
      if (!/Folder/.test(type) && !['Image', 'PDF', 'WebArchive', 'Media'].includes(type)) {
        // something in Scrivener's own Trash often has no text file left (Scrivener tidies deleted items): that's
        // expected, so it's mentioned quietly and the document still goes to Unwip's Trash
        const inTrash = !!(item.parentElement && item.parentElement.closest && item.parentElement.closest('BinderItem[Type="TrashFolder"]'));
        if (f.content == null && !(item.querySelector(':scope > Children'))) (inTrash ? (report.trashMissing = report.trashMissing || []) : report.missing).push(title);
        else if (f.content && !/^\s*\{\\rtf/.test(f.content)) report.unreadable.push(title);
      }
      if (f.content) layoutOf(f.content);
      const look = rawLook(bodyHTML);
      const hasText = !!textOf(bodyHTML);
      const isFolder = /Folder/.test(type) || (children.length > 0);
      const extra = {};
      if (synopsis) extra.synopsis = synopsis;
      if (statusId && statusList.some(x => x.id === 's' + statusId)) extra.status = 's' + statusId;
      const labelId = meta && meta.querySelector('LabelID') ? meta.querySelector('LabelID').textContent.trim() : null;
      if (labelId && labels[labelId] && !/^no label$/i.test(labels[labelId]) && labelId !== '-1') extra.label = { n: labels[labelId], c: labelColor[labelId] || '#9b968d' };
      if (extra.status && extra.label && labelColor[labelId]) { const t = statusLabels[extra.status] = statusLabels[extra.status] || {}; t[labelColor[labelId]] = (t[labelColor[labelId]] || 0) + 1; }
      if (iconM && [...iconM[1]].length <= 4) extra.icon = iconM[1];
      if (usesInclude && type !== 'DraftFolder' && item.parentElement && item.parentElement.closest('BinderItem[Type="DraftFolder"]')) {
        const inc = meta && meta.querySelector(':scope > IncludeInCompile');
        if (!inc || !/^yes$/i.test(inc.textContent.trim())) { extra.noBook = true; report.leftOutOfBook = (report.leftOutOfBook || 0) + 1; }
      }
      const sv = look ? { sv: look } : {};
      if (notesHTML && textOf(notesHTML)) { const nid = uid(); docs[nid] = notesHTML; noteDocs.push({ id: nid, type: 'doc', title: `${title} (notes)`, words: 0, sx: { notesOf: sx.u } }); report.withNotes++; }
      if (isFolder) {
        report.folders++;
        const node = { id: uid(), type: 'folder', title, open: false, children, ...extra, sx };
        // a folder with text of its own: the text becomes the folder's first page here, and goes back into the folder there
        if (hasText) { const id = uid(); docs[id] = bodyHTML; node.children.unshift({ node: { id, type: 'doc', title, words: 0, ...sv, ...(extra.noBook ? { noBook: true } : {}), sx: { own: sx.u } }, type: 'Text' }); report.documents++; }
        return { node, type };
      }
      const id = uid();
      docs[id] = bodyHTML || '<p><br></p>';
      if (!hasText) report.empty++;
      report.documents++;
      return { node: { id, type: 'doc', title, words: 0, ...extra, ...sv, sx, ...(opts.keepKeys ? { _key: key } : {}) }, type };
    }
    // unwrap {node, type} recursively
    const unwrap = r => { if (!r) return null; const n = r.node; if (n.children) n.children = n.children.map(unwrap).filter(Boolean); return n; };

    const top = xml.querySelector('Binder');
    if (!top) throw new Error('Could not read this Scrivener project.');
    const newSections = [], placed = [];
    for (const item of [...top.children].filter(c => c.tagName === 'BinderItem')) {
      const key = item.getAttribute('UUID') || item.getAttribute('ID');
      const type = item.getAttribute('Type'), title = ((item.querySelector(':scope > Title') || {}).textContent || 'Untitled').trim();
      const target = (opts.map && opts.map[key]) || guessTarget(type, title);
      if (target === 'skip') { report.left = (report.left || []).concat(title); continue; }
      const r = convert(item); if (!r) continue;
      const node = unwrap(r);
      const inner = node.type === 'folder' ? node.children : [node];
      placed.push({ title, target });
      if (target === 'new') newSections.push({ title, children: inner });
      // the special folders (and folders whose name says what they hold) give their contents; anything else keeps its folder
      else if (['manuscript', 'research', 'trash'].includes(target) && /Folder$/.test(type) && type !== 'Folder') roots[target].push(...inner);
      else if (['characters', 'places', 'items'].includes(target) || (['manuscript', 'research'].includes(target) && guessTarget(type, title) === target) || (target === 'notes' && /^notes?$/i.test(title))) roots[target].push(...inner);
      else roots[target].push(node);
    }
    report.placed = placed;
    // the top of Scrivener's binder, in order (Draft, Research, Trash and the folders beside them)
    const tops = [...top.children].filter(c => c.tagName === 'BinderItem').map(origin);
    if (noteDocs.length) roots.notes.push({ id: uid(), type: 'folder', title: 'Document notes from Scrivener', open: false, children: noteDocs });
    // the font and size used most in the manuscript become the project's style, so they don't need repeating on every word
    const tally = {}, sizes = {};
    for (const html of Object.values(docs)) {
      for (const m of html.matchAll(/<span style="([^"]*)">([^<]*)/g)) {
        const fam = /font-family:\s*'?([^;']+)'?/.exec(m[1]), sz = /font-size:\s*([\d.]+)pt/.exec(m[1]), w = m[2].length;
        if (fam) tally[fam[1].trim()] = (tally[fam[1].trim()] || 0) + w;
        if (sz) sizes[sz[1]] = (sizes[sz[1]] || 0) + w;
      }
    }
    for (const s of statusList) {
      const t = statusLabels[s.id]; if (!t) continue;
      const all = Object.values(t).reduce((a, b) => a + b, 0), [c, n] = Object.entries(t).sort((a, b) => b[1] - a[1])[0];
      const hex = (/^rgb\((\d+),(\d+),(\d+)\)$/.exec(c) || []).slice(1).map(x => (+x).toString(16).padStart(2, '0')).join('');
      if ((n >= 2 ? n / all > 0.5 : all === 1) && hex.length === 6) s.color = '#' + hex;   // (the status colour picker takes #rrggbb)
    }
    const top1 = o => Object.entries(o).sort((a, b) => b[1] - a[1])[0];
    const docFont = (top1(tally) || [])[0] || null, docSize = top1(sizes) ? +top1(sizes)[0] : null;
    for (const id of Object.keys(docs)) docs[id] = clean2(docs[id], docFont, docSize) || '<p><br></p>';
    const most = o => { const e = Object.entries(o).sort((a, b) => b[1] - a[1])[0]; return e ? +e[0] : null; };
    const sl = most(lsCount), fi = most(fiCount);
    const layout = { ...(docSize ? { size: docSize } : {}), ...(sl ? { lineHeight: Math.round(sl / 240 * 100) / 100 } : {}), ...(fi != null ? { indent: Math.round(fi / 1440 * 100) / 100 } : {}) };
    return { roots, docs, report, labels, statuses, statusList, docFont, docSize, newSections, layout, tops };
  }

  return { docxToHTML, splitChapters, scrivener, scrivenerScan, guessTarget, unzip, paraKey, rawLook };
})();
