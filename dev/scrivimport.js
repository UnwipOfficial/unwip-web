// Unwip - bringing a Scrivener project in, in three steps:
//  1. Scan: read the project (nothing in it is changed, ever).
//  2. Preview and map: Scrivener's folders on the left, where each will land in Unwip on the right, with a tick
//     box and a choice for each, a before-and-after look at a chapter, and what isn't brought across.
//  3. Import into a new book, then a short report. Your choices for folder names are remembered.
window.UnwipScriv = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return;
  const { S, api, esc, $, $$ } = U;
  const FI = window.FolioImport, Clip = window.FolioClip;
  const TARGETS = [['manuscript', 'Manuscript'], ['characters', 'Characters'], ['places', 'Places'], ['items', 'Items'], ['notes', 'Notes'], ['research', 'Research'], ['new', 'A new section'], ['trash', 'Trash']];
  const ICON = { DraftFolder: '📖', ResearchFolder: '🔬', TrashFolder: '🗑️', Folder: '📁', Text: '📄' };
  const nameKey = t => (t || '').trim().toLowerCase();
  const htmlText = h => { const d = document.createElement('div'); d.innerHTML = h || ''; return d.textContent || ''; };
  const errText = e => String((e && e.message) || e || '').replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

  let blankChoice = 'keep';
  async function start(opts = {}) {
    // ---- 1. scan
    let data;
    // a phone or iPad can't pick a .scriv folder: the project comes straight from Dropbox (or, failing that, a zip)
    const touch = api.web && (/iPhone|iPad|iPod|Android/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1));
    const DI = window.UnwipDropboxImport;
    let how = opts.fromDropbox ? 'dropbox' : null;
    if (touch && !how) {
      how = await U.modal({ title: 'Import from Scrivener', body: `<p>${DI && DI.ready() ? 'Pick the Scrivener project straight from your Dropbox. Nothing there is changed.' : 'On an iPhone or iPad, Unwip reads a zip of your Scrivener project (Apple doesn’t let web apps open the .scriv folder itself).'}</p>
        ${DI && DI.ready() ? `<p class="sim-small">A project kept only on this ${/iPad/.test(navigator.userAgent) ? 'iPad' : 'iPhone'} in Scrivener? Use Scrivener’s own Sync with Dropbox first, so it’s in Dropbox, then pick it here.</p>`
          : window.UNWIP_DEV ? '<p class="sim-small">Picking a project straight from Dropbox isn’t on in Unwip Dev yet. The normal Unwip (unwip.app) can.</p>' : ''}
        ${DI && DI.ready() ? '' : `<ol class="sim-steps"><li>In the <b>Files</b> app, press and hold the <b>.scriv</b> project and choose <b>Compress</b>.</li><li>Come back here, tap <b>Choose the zip</b> and pick it.</li></ol>`}`,
        buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, ...(DI && DI.ready() ? [{ label: 'Choose from Dropbox…', value: 'dropbox', kind: 'primary' }] : [{ label: 'Choose the zip…', value: 'zip', kind: 'primary' }])] });
      if (!how) return;
    }
    if (how === 'dropbox') {
      try { data = await DI.pickProject(); } catch (e) { return U.toast(esc(errText(e) || 'Could not open that project.'), 'warn', 9000); }
      if (!data) return;
    } else
    try { data = await api.importScrivener(); } catch (e) { return U.toast(esc(errText(e) || 'Could not open that project.'), 'warn', 7000); }
    if (!data) return;
    if (data.mobilePending) U.toast('This project has changes from Scrivener on an iPhone or iPad that Scrivener on your computer hasn’t taken in yet, so they won’t come across. To include them, open the project in Scrivener on your computer first, close it, then import again.', 'warn', 14000);
    let scan, conv;
    try {
      scan = FI.scrivenerScan(data);
      conv = FI.scrivener(data, U.uid, { keepKeys: true });     // a first conversion, for the before-and-after look
    } catch (e) { return U.toast(esc(errText(e)), 'warn', 12000); }
    const remembered = (S.settings && S.settings.scrivMap) || {};
    const rows = scan.groups.map(g => {
      const mem = remembered[nameKey(g.title)];
      return { ...g, target: mem || g.guess, on: g.type !== 'TrashFolder' || g.docs > 0, mem: !!mem && mem !== g.guess };
    });
    // ---- 2. preview and map
    for (;;) {
      const v = await mapScreen(data, scan, conv, rows);
      if (!v) return;
      if (v.preview) { await previewScreen(data, conv, rows.titles); continue; }
      return importNow(data, rows, v);
    }
  }

  function countText(g) {
    const parts = [];
    if (g.docs) parts.push(`${g.docs} document${g.docs === 1 ? '' : 's'}`);
    if (g.pics) parts.push(`${g.pics} picture${g.pics === 1 ? '' : 's'}`);
    if (g.other) parts.push(`${g.other} other file${g.other === 1 ? '' : 's'} (not imported)`);
    return parts.join(', ') || 'empty';
  }
  // chapters that start with their title typed in (checked on the Draft's chapters)
  function titleScan(roots, docs) {
    const items = []; U.walkTree(roots.manuscript || [], n => { if (n.type === 'doc' && docs[n.id]) items.push({ node: n, html: docs[n.id] }); });
    return { hits: window.UnwipTitles ? window.UnwipTitles.scan(items) : [], total: items.length };
  }
  async function mapScreen(data, scan, conv, rows) {
    const { hits: titleHits, total: titleTotal } = titleScan(conv.roots, conv.docs);
    const body = document.createElement('div'); body.className = 'sim';
    const pf = U.placeField ? await U.placeField('sim-place') : { html: '', read: async () => null };
    body.innerHTML = `
      <p class="hint">Step 2 of 3. Here’s what’s in <b>${esc(data.name)}</b> and where each part will go. Change anything with the lists on the right, or untick what you don’t want. Your Scrivener project isn’t changed, and everything goes into a <b>new</b> Unwip project.</p>
      <div class="sim-grid">
        <div class="sim-h">Scrivener: ${esc(data.name)}</div><div></div><div class="sim-h">Unwip</div>
        ${rows.map((r, i) => `
          <label class="sim-l ${r.on ? '' : 'off'}"><input type="checkbox" data-on="${i}" ${r.on ? 'checked' : ''}><span class="sim-ic">${ICON[r.type] || '📄'}</span><span><b>${esc(r.title)}</b><small>${esc(countText(r))}</small></span></label>
          <div class="sim-arrow">→</div>
          <div class="sim-r"><select data-t="${i}" ${r.on ? '' : 'disabled'}>${TARGETS.map(([k, l]) => `<option value="${k}" ${k === r.target ? 'selected' : ''}>${k === 'new' ? `A new section “${esc(r.title)}”` : l}</option>`).join('')}</select>${r.mem ? '<small class="sim-mem" title="You chose this last time for a folder with this name">remembered</small>' : ''}</div>`).join('')}
      </div>
      <p class="sim-not"><b>Not imported:</b> ${esc(scan.notImported.join(', '))}.</p>
      ${titleHits.length && window.UnwipTitles ? window.UnwipTitles.choiceHTML(titleHits, titleTotal, 'sim-tt') : titleTotal ? `<p class="sim-small"><b>Chapter titles:</b> ${titleTotal === 1 ? 'your chapter doesn’t start with its title' : `none of the ${titleTotal} chapters start with their title`} typed into the text, so there’s nothing to tidy. Unwip shows each chapter’s binder name as its heading.</p>` : ''}
      <div class="sim-foot">
        <div class="field"><label>New book name</label><input type="text" id="sim-name" value="${esc(data.name)}"></div>${pf.html}
        <div class="field"><label>Empty lines between paragraphs</label><select id="sim-blank"><option value="keep">Keep them where they are, as in Scrivener</option><option value="tidy">Take them out (Unwip spaces paragraphs itself; two or more in a row become a scene break)</option></select></div>
        <label class="check"><input type="checkbox" id="sim-mem" checked><span>Remember these choices for folders with the same names</span></label>
        <p class="sim-small">Comes across: text with its formatting, folders and order, synopses, document notes, ${scan.labels.length ? 'labels, ' : ''}${scan.statuses.length ? 'status, ' : ''}icons and pictures${conv.docFont ? `, and your main font (${esc(conv.docFont)}${conv.docSize ? ' ' + conv.docSize + 'pt' : ''})` : ''}.</p>
      </div>`;
    $('#sim-blank', body).value = rows.blank || 'keep';
    if (rows.titles) { const r = body.querySelector(`[name="sim-tt"][value="${rows.titles}"]`); if (r) r.checked = true; }
    body.querySelectorAll('[data-on]').forEach(c => c.onchange = () => { const r = rows[+c.dataset.on]; r.on = c.checked; c.closest('.sim-l').classList.toggle('off', !r.on); body.querySelector(`[data-t="${c.dataset.on}"]`).disabled = !r.on; });
    body.querySelectorAll('[data-t]').forEach(s => s.onchange = () => { rows[+s.dataset.t].target = s.value; });
    const hasDraft = Object.keys(conv.docs).length > 0;
    const v = await U.modal({ title: 'Import from Scrivener', body, wide: true, buttons: [
      { label: 'Cancel', value: false, kind: 'ghost' },
      ...(hasDraft ? [{ label: 'Show a chapter before and after…', value: 'preview', kind: 'ghost' }] : []),
      { label: 'Import into a new book', value: 'go', kind: 'primary' }] });
    if (!v) return null;
    const name = $('#sim-name', body).value.trim() || data.name, mem = $('#sim-mem', body).checked;
    const tt = body.querySelector('[name="sim-tt"]:checked'); rows.titles = tt ? tt.value : 'leave';
    rows.blank = blankChoice = $('#sim-blank', body).value;
    if (v === 'preview') return { preview: true };
    return { name, mem, titles: rows.titles, blank: rows.blank, place: await pf.read(body) };
  }

  // the same chapter as Scrivener had it, and as it will look in Unwip
  // shows a chapter with the choices made on the list applied: typed titles and empty lines
  async function previewScreen(data, conv, titles) {
    const chapters = [];
    U.walkTree(conv.roots.manuscript || [], n => { if (n.type === 'doc' && conv.docs[n.id] && htmlText(conv.docs[n.id]).trim()) chapters.push(n); });
    if (!chapters.length) { U.toast('There are no chapters with text to show.'); return; }
    const body = document.createElement('div'); body.className = 'simp';
    const font = conv.docFont || (S.settings && S.settings.defaultStyle && S.settings.defaultStyle.font) || 'Times New Roman', size = conv.docSize || 12;
    body.innerHTML = `
      <div class="field"><label>Chapter</label><select id="simp-ch">${chapters.map((c, i) => `<option value="${i}">${esc(c.title || 'Untitled')}</option>`).join('')}</select></div>
      <div class="simp-cols">
        <div><div class="simp-h">Before: as Scrivener had it</div><div class="simp-page simp-before"></div></div>
        <div><div class="simp-h">After: in Unwip (${esc(font)} ${size}pt)</div><div class="simp-page simp-after" style="font-family:'${esc(font)}', Georgia, serif; font-size:${size}pt${conv.layout && conv.layout.lineHeight ? `; line-height:${conv.layout.lineHeight}` : ''}"></div></div>
      </div>
      <p class="sim-small simp-note"></p>
      <p class="sim-small">${blankChoice === 'tidy' ? 'Empty lines used as spacing are removed (the space between paragraphs comes from Manuscript style), and leftover' : 'Empty lines stay where you typed them. Leftover'} fonts are folded into one main font. Bold, italics, scene breaks and pictures stay.</p>`;
    // start on a real chapter rather than a title page
    const firstReal = Math.max(0, chapters.findIndex(c => U.countWords(htmlText(conv.docs[c.id])) > 300));
    const show = () => {
      const n = chapters[+$('#simp-ch', body).value];
      const f = data.files[n._key] || {};
      $('.simp-before', body).innerHTML = f.content ? window.FolioRTF.toHTML(f.content) : conv.docs[n.id];
      // the same steps the import takes, in the same order: typed titles first, then empty lines
      let html = conv.docs[n.id], heading = n.title || '', note = '';
      const found = window.UnwipTitles ? window.UnwipTitles.find(n.title, html) : null;
      if (found && titles === 'typed') { html = found.html; heading = found.typed; note = `The typed title “${found.line}” becomes the chapter’s name and comes out of the text.`; }
      else if (found && titles === 'binder') { html = found.html; note = `The typed title “${found.line}” comes out of the text; the chapter keeps its binder name.`; }
      else if (found) note = 'Typed titles are left as they are, so this chapter shows its title twice: once as its name, once in the text.';
      if (blankChoice === 'tidy') html = Clip.dropBlankLines(html).html;
      $('.simp-after', body).innerHTML = `<h1 class="simp-title">${esc(heading)}</h1>` + html;
      $('.simp-note', body).textContent = note;
      $('.simp-before', body).scrollTop = 0; $('.simp-after', body).scrollTop = 0;
    };
    await U.modal({ title: 'Before and after', body, wide: true, onOpen: () => { $('#simp-ch', body).value = String(firstReal); $('#simp-ch', body).onchange = show; show(); }, buttons: [{ label: 'Back to the list', value: true, kind: 'primary' }] });
  }

  // ---- 3. import into a new project
  // Dropbox waits until the whole book is written (app.js holdSync)
  async function importNow(data, rows, v) {
    const map = {}; for (const r of rows) map[r.key] = r.on ? r.target : 'skip';
    if (v.mem) {
      const memo = { ...((S.settings && S.settings.scrivMap) || {}) };
      for (const r of rows) { if (!r.on) continue; if (r.target !== r.guess) memo[nameKey(r.title)] = r.target; else delete memo[nameKey(r.title)]; }
      S.settings = await api.setSettings({ scrivMap: memo });
    }
    U.toast('Importing…', '', 2500);
    let res; try { res = FI.scrivener(data, U.uid, { map }); } catch (e) { return U.toast(esc(errText(e)), 'warn', 12000); }
    try { const sc = FI.scrivenerScan(data); if (sc.spare) res.spareUsed = `${sc.spare.name}${sc.spare.at ? ', saved ' + new Date(sc.spare.at).toLocaleString() : ''}`; } catch {}
    // typed chapter titles, as chosen
    let tidied = 0;
    if (v.titles && v.titles !== 'leave' && window.UnwipTitles) {
      const { hits } = titleScan(res.roots, res.docs);
      tidied = window.UnwipTitles.apply(hits, v.titles); for (const h of hits) res.docs[h.node.id] = h.newHTML;
    }
    const tpl = U.newProjectTemplate();
    for (const r of tpl.binder) { r.children = res.roots[r.kind] || []; r.open = r.kind === 'manuscript'; }
    for (const ns of res.newSections || []) {
      const k = 'custom-' + U.uid(), t = ns.title;
      tpl.binder.splice(tpl.binder.findIndex(x => x.kind === 'trash'), 0, { id: 'root-' + k, type: 'folder', kind: k, root: true, custom: true, open: false, children: ns.children, title: t, singular: t.replace(/ies$/i, 'y').replace(/(?<!s)s$/i, ''), fields: ['Name', 'Aliases'], sections: ['Description', 'Notes'], icon: '🗂️' });
    }
    tpl.importedFrom = 'Scrivener';
    // how Scrivener's binder was laid out, so No hard feelings can put it back (and the titles as Unwip has them now,
    // to tell a chapter renamed here from one only tidied on the way in)
    if (res.tops) tpl.scrivOrigin = { tops: res.tops, at: Date.now() };
    U.walkTree(Object.values(res.roots).flat().concat(...(res.newSections || []).map(x => x.children)), n => { if (n.sx && n.sx.u) n.sx.tn = n.title; });
    tpl.style = { ...(tpl.style || {}), blankLines: v.blank === 'tidy' ? 'tidy' : 'keep' };
    // the book's own title and author from Scrivener, for the title page
    { const sc = FI.scrivenerScan(data); if (sc.projectTitle || sc.author) tpl.book = { ...(tpl.book || {}), ...(sc.projectTitle ? { title: sc.projectTitle } : {}), ...(sc.author ? { author: sc.author } : {}) }; }
    if (res.statusList && res.statusList.length) tpl.statuses = res.statusList;
    if (res.docFont || res.docSize) tpl.style = { ...(tpl.style || {}), ...(res.docFont ? { font: res.docFont } : {}), ...(res.docSize ? { size: res.docSize } : {}) };
    // Scrivener's line spacing and first-line indent too, and remembered as they were, so going back puts them back
    const L = res.layout || {};
    if (L.lineHeight >= 1 && L.lineHeight <= 3) tpl.style = { ...(tpl.style || {}), lineHeight: L.lineHeight };
    if (L.indent >= 0 && L.indent <= 1.5) tpl.style = { ...(tpl.style || {}), indent: L.indent };
    if (Object.keys(L).length) tpl.scrivLayout = L;
    let slug = null;
    try {
    slug = await api.createProject(v.name, tpl, v.place);
    const project = await api.openProject(slug);
    const ids = Object.keys(res.docs);
    if (window.UnwipImages) for (const id of ids) {
      if (!/<img [^>]*src="data:image/.test(res.docs[id]) || res.docs[id].length < 600000) continue;
      const box = document.createElement('div'); box.innerHTML = res.docs[id];
      for (const img of box.querySelectorAll('img.doc-img')) { try { const p = await window.UnwipImages.shrinkDataURL(img.src); img.src = p.src; img.dataset.w = p.w; img.dataset.h = p.h; } catch {} }
      res.docs[id] = box.innerHTML;
    }
    // empty lines used as spacing go (but a title page keeps its own spacing)
    const front = new Set(); U.walkTree(Object.values(res.roots).flat(), n => { if (n.type === 'doc' && /^\s*(title|title page|half[- ]title|front matter|copyright|dedication)\s*$/i.test(n.title || '')) front.add(n.id); });
    if (v.blank === 'tidy') for (const id of ids) if (!front.has(id)) res.docs[id] = Clip.dropBlankLines(res.docs[id]).html;
    for (const id of ids) await api.saveDoc(slug, id, res.docs[id]);
    U.walkTree(project.binder, n => { delete n._key; if (n.type === 'doc' && res.docs[n.id]) n.words = U.countWords(htmlText(res.docs[n.id])); });
    project.totalWords = 0;
    await api.saveProjectMeta(slug, project);
    } catch (e) {
      // stopped partway (a full disk, say): the half-made book goes, so it's never mistaken for the real thing
      if (slug) await api.deleteProject(slug).catch(() => {});
      await U.modal({ title: 'The import stopped', body: `<p>Unwip couldn’t finish bringing in “${esc(data.name)}”: ${esc(errText(e))}.</p><p>${/ENOSPC|no space|quota/i.test(errText(e)) ? 'Your disk looks full. Free up some space and try again.' : 'Nothing was kept from this attempt, and your Scrivener project is untouched. Try again; if it happens again, use Help › Report a problem.'}</p>`, buttons: [{ label: 'OK', value: true, kind: 'primary' }] });
      return;
    }
    await U.openProject(slug);
    S.project.totalWords = U.manuscriptWords(); U.scheduleMeta();
    const r = res.report, where = Object.fromEntries(TARGETS);
    await U.modal({ title: 'Import finished', body: `<div class="import-report">
        <p><b>${r.documents}</b> documents and <b>${r.folders}</b> folders from “${esc(data.name)}” are in the new project “${esc(v.name)}”. Your Scrivener project is untouched.</p>
        ${v.place === 'local' && api.moveProject ? `<p class="ir-warn"><b>Kept on this device only</b>, so it won’t sync to your other devices. To sync it, use ⋯ › Move to… › Dropbox on its card on the main screen.</p>` : ''}
        ${(() => { const k = window.UnwipBookImport && window.UnwipBookImport.keptIn(Object.values(res.docs)); return k ? `<p><b>${U.fmt(k.words)}</b> words${k.kept.length ? `, with ${k.kept.join(', ')}` : ''}.</p>` : ''; })()}
        <ul>
          ${(r.placed || []).map(p => `<li>${esc(p.title)} → ${p.target === 'new' ? `a new section, “${esc(p.title)}”` : esc(where[p.target] || p.target)}</li>`).join('')}
          ${tidied ? `<li>${tidied} chapter title${tidied === 1 ? ' was' : 's were'} typed into the text; ${v.titles === 'typed' ? (tidied === 1 ? 'it’s now the chapter’s name' : 'they’re now the chapter names') : 'the binder names were kept'} and the typed line${tidied === 1 ? ' was' : 's were'} taken out, so nothing shows twice.</li>` : ''}
          ${r.withNotes ? `<li>Notes from ${r.withNotes} documents are in Notes › Document notes from Scrivener.</li>` : ''}
          ${res.docFont ? `<li>Your main font, ${esc(res.docFont)}${res.docSize ? ` ${res.docSize}pt` : ''}, is this project’s manuscript style. To change it everywhere, use Manuscript style › Font for the whole book.</li>` : ''}
          ${r.images ? `<li>${r.images} picture${r.images > 1 ? 's' : ''} came across.</li>` : ''}
          ${(() => { const n = r.empty - (r.missing || []).length - (r.unreadable || []).length - (r.trashMissing || []).length; return n > 0 ? `<li>${n === 1 ? '1 document was' : `${n} documents were`} empty in Scrivener and came across empty.</li>` : ''; })()}
          ${(r.trashMissing || []).length ? `<li>${r.trashMissing.length === 1 ? '1 deleted document' : `${r.trashMissing.length} deleted documents`} in Scrivener’s Trash had no text left, which is normal for deleted things. ${r.trashMissing.length === 1 ? 'It’s' : 'They’re'} in Unwip’s Trash, empty.</li>` : ''}
          ${(r.missing || []).length ? `<li class="ir-warn">${r.missing.length === 1 ? '1 document’s text file was' : `${r.missing.length} documents’ text files were`} missing from the Scrivener project, so ${r.missing.length === 1 ? 'it came' : 'they came'} across empty: ${esc(r.missing.slice(0, 8).join(', '))}${r.missing.length > 8 ? ` and ${r.missing.length - 8} more` : ''}. If they have text in Scrivener, it may still be syncing (Dropbox) there.</li>` : ''}
          ${(r.unreadable || []).length ? `<li class="ir-warn">${r.unreadable.length === 1 ? '1 document' : `${r.unreadable.length} documents`} couldn’t be read (the file is damaged): ${esc(r.unreadable.slice(0, 8).join(', '))}. ${r.unreadable.length === 1 ? 'It came' : 'They came'} across empty; Scrivener’s backups may have ${r.unreadable.length === 1 ? 'it' : 'them'}.</li>` : ''}
          ${res.spareUsed ? `<li class="ir-warn">The project’s main file was damaged, so Unwip used Scrivener’s own spare copy of the binder (${esc(res.spareUsed)}). Check the newest chapters are there.</li>` : ''}
          ${(r.left || []).length ? `<li>Left out, as you chose: ${esc(r.left.join(', '))}.</li>` : ''}
          ${r.skipped.length ? `<li>Not imported (Unwip doesn’t hold these yet): ${esc(r.skipped.slice(0, 8).join(', '))}${r.skipped.length > 8 ? ` and ${r.skipped.length - 8} more` : ''}.</li>` : ''}
          <li>Not imported: compile settings, collections, keywords, custom metadata, snapshots, links and Scrivener-only styles.</li>
        </ul></div>`, buttons: [{ label: 'Start writing', value: true, kind: 'primary' }] });
    // guided: sorting starts (its Characters step offers one page per person); otherwise the old offer
    if (window.UnwipImportRoom && await window.UnwipImportRoom.afterImport({ from: 'Scrivener' })) return;
    if (window.UnwipSheets) await window.UnwipSheets.offerAfterImport().catch(() => {});
  }
  { const raw = importNow; importNow = (...a) => (U.holdSync ? U.holdSync(() => raw(...a)) : raw(...a)); }

  return { start, TARGETS, _test: { importNow } };
})();
