// Unwip - turn a list document ("Main Cast": a bold name, then a description, for each person) into
// one sheet per entry, so each character, place or item gets its own sheet with name suggestions,
// connections and "Appears in". Headings in the list ("Dwarves:") become folders. Rule-based, no AI:
// it only reads the bold names and the punctuation after them, and shows everything before changing anything.
window.UnwipSheets = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return;
  const { S, $, esc } = U;
  const SHEET_KINDS = new Set(['characters', 'places', 'items']);
  const isSheetRoot = r => r && (SHEET_KINDS.has(r.kind) || r.custom);
  const SEP = /^\s*(?:[:：]|[-–—]+|=|\|)\s*/;

  // ------------------------------------------------------------------ reading a list
  const isBold = el => { for (let e = el; e && e.nodeType === 1 && e.tagName !== 'P' && !/^H\d$|^LI$/.test(e.tagName); e = e.parentElement) { if (/^(B|STRONG)$/.test(e.tagName)) return true; const w = e.style && e.style.fontWeight; if (w && (w === 'bold' || +w >= 600)) return true; } return false; };
  // the bold text a paragraph starts with
  function leadOf(p) {
    if (/^H[1-6]$/.test(p.tagName)) return p.textContent;
    let lead = '', done = false;
    const walk = n => {
      if (done) return;
      if (n.nodeType === 3) { const t = n.textContent; if (!t) return; if (isBold(n.parentElement)) lead += t; else if (t.trim()) done = true; else lead += t; return; }
      if (n.nodeType === 1 && n.tagName === 'BR') { if (lead.trim()) done = true; return; }
      n.childNodes.forEach(walk);
    };
    walk(p);
    return lead;
  }
  // the paragraph's HTML without its first `count` characters (the name and the colon after it)
  function rest(p, count) {
    const c = p.cloneNode(true); let left = count;
    const tw = document.createTreeWalker(c, NodeFilter.SHOW_TEXT); const kill = [];
    while (left > 0 && tw.nextNode()) { const t = tw.currentNode, n = t.textContent.length; if (n <= left) { kill.push(t); left -= n; } else { t.textContent = t.textContent.slice(left); left = 0; } }
    kill.forEach(t => t.remove());
    // the separator, then empty wrappers left behind
    const first = document.createTreeWalker(c, NodeFilter.SHOW_TEXT); while (first.nextNode()) { const t = first.currentNode; const s = t.textContent.replace(SEP, '').replace(/^\s+/, ''); if (s !== t.textContent || !t.textContent.trim()) { t.textContent = s; if (s) break; } else break; }
    c.querySelectorAll('b, strong, span, u, i, em').forEach(e => { if (!e.textContent.trim() && !e.querySelector('img')) e.remove(); });
    return c.innerHTML.trim();
  }
  // "Victoria aka VQ-T071A", "Peekaboo(Peek)", "Mara “the Ash Witch” Vell"
  function splitName(raw) {
    let name = raw.replace(/\s+/g, ' ').trim().replace(/[\s:：\-–—=|]+$/, '').trim(); const aliases = [];
    const aka = name.match(/^(.+?)\s*(?:,\s*)?\b(?:aka|a\.k\.a\.?|also known as|alias|or)\b\.?\s+(.+)$/i);
    if (aka) { name = aka[1].trim(); aliases.push(...aka[2].split(/\s*(?:,|\/|\bor\b)\s*/i)); }
    const par = name.match(/^(.+?)\s*\(([^)]+)\)\s*(.*)$/);
    // "Peekaboo (Peek)" is a nickname; "Beatrice (new one)" is a note that tells two people apart, so it stays in the name
    if (par && /^\p{Lu}|^\d/u.test(par[2].trim())) { name = (par[1] + (par[3] ? ' ' + par[3] : '')).trim(); aliases.push(...par[2].split(/\s*[,/]\s*/)); }
    else if (par) name = `${par[1].trim()} (${par[2].trim()})${par[3] ? ' ' + par[3] : ''}`;
    const q = name.match(/^(.*?)\s*[“"']([^”"']+)[”"']\s*(.*)$/);
    if (q && q[1] && q[3]) { name = (q[1] + ' ' + q[3]).trim(); aliases.push(q[2]); }
    return { name, aliases: aliases.map(a => a.trim()).filter(a => a && a !== name) };
  }
  // a whole document -> [{ group, entries: [{ name, aliases, html, text }] }] plus anything that isn't part of an entry
  // A list of abilities written as system messages: [Name: what it does] lines, the lines of one ability together and
  // an empty line (or a ——— line) before the next. Like the system boxes in Copy for Royal Road, lines next to each
  // other belong together, so each group is one sheet, named by its first [message]. A [Note: …] on its own after
  // an ability stays with that ability. (Read as bold names, every bracket line used to become its own sheet.)
  const BR = /^\s*\[/, SEPLINE = /^\s*([—–\-_=*~•·\/]\s*){2,}$/;
  // the sheet's name: "[Sir Charge: Extract coins…]" -> Sir Charge; "[Unique Passive: Show me the Money]" -> Show me the
  // Money (a kind of ability, then its name); "[Unique Skill]" then "[Conversion: …]" -> Conversion; "[Creature Comforts]"
  // as it is
  const KIND = /^(unique |new |hidden |legendary |rare |special )?(passive|active|skill|ability|abilities|spell|function|trait|perk|title|class|skill acquired|skill unlocked|ability unlocked)s?( (unlocked|acquired|gained|learned))?$/i;
  const msg = t => ((t.match(/^\s*\[([^\]]*)\]/) || [])[1] || t.replace(/^\s*\[/, '')).replace(/\s+/g, ' ').trim();
  function abilityName(lines) {
    const m = msg(lines[0]), i = m.indexOf(':');
    const before = i > 0 ? m.slice(0, i).trim() : m, after = i > 0 ? m.slice(i + 1).trim() : '';
    let name;
    if (i < 0 && KIND.test(m) && lines[1] && BR.test(lines[1])) return abilityName(lines.slice(1));
    if (i > 0 && KIND.test(before) && after && after.split(/\s+/).length <= 8) name = after;
    else if (i > 0 && before.split(/\s+/).length <= 6) name = before;
    else name = m;
    return name.replace(/^[“"']|[”"']$/g, '').slice(0, 80) || 'Untitled';
  }
  function parseAbilities(blocks) {
    const groups = [{ group: '', entries: [] }], leftover = [];
    let cur = [];
    const textOf = b => b.textContent.replace(/\u00a0/g, ' ').trim();
    const end = () => {
      if (!cur.length) return;
      const first = textOf(cur[0]), html = cur.map(b => b.outerHTML).join(''), text = cur.map(textOf).join(' ');
      const g = groups[groups.length - 1], last = g.entries[g.entries.length - 1];
      if (BR.test(first) && !(/^\s*\[\s*(side )?note\b/i.test(first) && last)) {
        g.entries.push({ name: abilityName(cur.map(textOf)), aliases: [], html, text });
      } else if (last) { last.html += html; last.text += ' ' + text; }
      else leftover.push(html);
      cur = [];
    };
    for (const b of blocks) {
      const t = textOf(b);
      if (!t || SEPLINE.test(t)) { end(); continue; }
      // a heading (or a short bold line that isn't a [message]) starts a group of its own
      if (/^H[1-6]$/.test(b.tagName) || (!BR.test(t) && t.length <= 60 && t.split(/\s+/).length <= 7 && leadOf(b).trim() === t && !cur.length)) { end(); groups.push({ group: t.replace(/[\s:：]+$/, ''), entries: [] }); continue; }
      cur.push(b);
    }
    end();
    const out = groups.filter(g => g.entries.length);
    return { groups: out, count: out.reduce((a, g) => a + g.entries.length, 0), leftover, abilities: true };
  }
  function parse(html) {
    const d = document.createElement('div'); d.innerHTML = html || '';
    // lines kept apart by line breaks inside one paragraph (common from Scrivener, and Markdown with single line breaks)
    // are lines of their own (beta, 20 Oct: "Debra - …<br>Stacey - …<br>Emilie - …" read as one entry, so no list)
    for (const p of [...d.querySelectorAll('p')]) {
      if (!p.querySelector('br') || p.querySelector('p, li')) continue;
      const parts = p.innerHTML.split(/<br\s*\/?>/i);
      if (parts.filter(h => h.replace(/<[^>]+>/g, '').replace(/&nbsp;|\u00a0/g, ' ').trim()).length < 2) continue;
      p.replaceWith(...parts.map(h => { const q = document.createElement('p'); q.innerHTML = h; return q; }));
    }
    const blocks = [...d.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li')].filter(b => !b.querySelector('p, li'));
    { const lines = blocks.map(b => b.textContent.trim()).filter(Boolean), br = lines.filter(t => BR.test(t)).length;
      if (br >= 3 && br >= lines.length * 0.5) return parseAbilities(blocks); }
    const items = [];
    for (const b of blocks) {
      const text = b.textContent.replace(/ /g, ' ').trim(); if (!text) continue;
      const lead = leadOf(b), lt = lead.trim();
      // a whole line in [brackets] is a system message, not a name (beta, 20 Oct: "[Confirm Cost to Level 10]" was
      // offered as a person's page)
      if (/^\s*\[[^\]]*\]\s*$/.test(text)) { items.push({ k: 'more', html: b.outerHTML }); continue; }
      if (lt && lt.length <= 80 && lt.split(/\s+/).length <= 9) {
        const after = text.slice(text.indexOf(lt) + lt.length).trim();
        if (!after || /^[:：\-–—=|]*$/.test(after)) { items.push({ k: 'head', name: lt.replace(/[\s:：\-–—=|]+$/, ''), colon: /[:：]\s*$/.test(lt + after), heading: /^H/.test(b.tagName) }); continue; }
        items.push({ k: 'entry', ...splitName(lt), html: rest(b, lead.length), text: after.replace(SEP, '') });
        continue;
      }
      // plain "Name - description" or "Name: description" lines (only used when the list has no bold names at all)
      const m = text.match(/^([\p{Lu}][^:：\-–—]{0,38}?)\s*(?:[:：]|\s[-–—]\s)\s*(.+)$/u);
      items.push(m && m[1].split(/\s+/).length <= 5 ? { k: 'plain', ...splitName(m[1]), html: esc(m[2]), text: m[2], raw: b.outerHTML } : { k: 'more', html: b.outerHTML });
    }
    const bold = items.some(x => x.k === 'entry');
    const groups = [{ group: '', entries: [] }], leftover = [];
    for (let i = 0; i < items.length; i++) {
      let x = items[i];
      if (x.k === 'plain') x = bold ? { k: 'more', html: x.raw } : { ...x, k: 'entry' };
      if (x.k === 'head') {
        // a heading is a group when entries follow it; otherwise it's a name with nothing written yet (unless it ends with “:”)
        let j = i + 1; while (j < items.length && items[j].k === 'more') j++;
        const nextIsEntry = j < items.length && (items[j].k === 'entry' || (items[j].k === 'plain' && !bold));
        if (nextIsEntry) groups.push({ group: x.name, entries: [] });
        else if (!x.colon && !x.heading) groups[groups.length - 1].entries.push({ name: splitName(x.name).name, aliases: splitName(x.name).aliases, html: '', text: '' });
        continue;
      }
      if (x.k === 'entry') { groups[groups.length - 1].entries.push({ name: x.name, aliases: x.aliases, html: x.html ? `<p>${x.html}</p>` : '', text: x.text }); continue; }
      const g = groups[groups.length - 1], last = g.entries[g.entries.length - 1];
      if (last) { last.html += x.html; last.text += ' ' + (x.html.replace(/<[^>]+>/g, '')); } else leftover.push(x.html);
    }
    const out = groups.filter(g => g.entries.length);
    return { groups: out, count: out.reduce((a, g) => a + g.entries.length, 0), leftover };
  }

  // ------------------------------------------------------------------ making the sheets
  function sheetHTML(root, e) {
    const sh = U.sheetFor(root) || { fields: ['Name', 'Aliases'], sections: ['Description', 'Notes'] };
    const age = (e.text.match(/\b(\d{1,4})\s*(?:years?|yrs?)\s*old\b/i) || [])[1];
    const val = f => /^(full name|name)$/i.test(f) ? esc(e.name) : /^alias/i.test(f) ? esc(e.aliases.join(', ')) : /^age$/i.test(f) && age ? age : '';
    // the description goes under a "Description" heading when the sheet has one, otherwise straight after the fields
    const di = sh.sections.findIndex(x => /^(description|about|overview|summary)$/i.test(x.trim()));
    return sh.fields.map(f => `<p><b>${esc(f)}:</b> ${val(f)}</p>`).join('')
      + (e.html && di < 0 ? e.html : '')
      + sh.sections.map((x, i) => `<h2>${esc(x)}</h2>${i === di && e.html ? e.html : '<p><br></p>'}`).join('');
  }
  const synopsisOf = t => { t = (t || '').replace(/\s+/g, ' ').trim(); if (t.length <= 140) return t; const s = t.slice(0, 140); const cut = Math.max(s.lastIndexOf('. '), s.lastIndexOf(', ')); return (cut > 60 ? s.slice(0, cut) : s.slice(0, s.lastIndexOf(' '))) + '…'; };

  // which section new sheets go in, for a document that isn't in one already
  function guessRoot(title, groups) {
    const roots = S.project.binder.filter(isSheetRoot), t = (title + ' ' + groups.map(g => g.group).join(' ')).toLowerCase();
    const by = k => roots.find(r => r.kind === k);
    const custom = roots.find(r => r.custom && t.includes((r.singular || r.title || '').toLowerCase().replace(/s$/, '')));
    if (custom) return custom;
    if (/place|location|city|cities|town|region|kingdom|land|world/.test(t)) return by('places');
    if (/item|object|weapon|artifact|artefact|potion|gear/.test(t)) return by('items');
    if (/race|species|faction|guild|group|monster|creature|class|skill|spell/.test(t)) return null;
    return by('characters');
  }

  async function convert(ids) {
    await U.flushSave();
    const lists = [];
    for (const id of ids) {
      const f = U.findNode(id); if (!f || f.node.type !== 'doc' || f.node.map) continue;
      const html = id === S.docId ? U.editor.innerHTML : await U.api.loadDoc(S.slug, id).catch(() => '');
      const r = parse(html); if (r.count < 2) continue;
      const root = U.rootOf(id);
      lists.push({ id, node: f.node, r, root: isSheetRoot(root) ? root : guessRoot(f.node.title, r.groups) || 'new', inSheet: isSheetRoot(root), keepGroups: true });
    }
    if (!lists.length) {
      return U.modal({ title: 'Turn into separate sheets', body: `<p>Unwip couldn’t find a list of names in ${ids.length === 1 ? 'this document' : 'these documents'}.</p><p class="hint">It looks for lines that start with a name in <b>bold</b>, followed by a description, like:<br><b>Mara Vell:</b> smuggler, 30, owes everyone money<br>or plain lines like “Mara Vell - smuggler”. Headings on their own line (“Dwarves:”) become folders.</p>` });
    }
    const roots = S.project.binder.filter(isSheetRoot);
    const body = document.createElement('div'); body.className = 'tsh';
    const skip = new Set();
    const draw = () => {
      const total = lists.reduce((a, L) => a + L.r.groups.reduce((b, g, gi) => b + g.entries.filter((e, ei) => !skip.has(`${L.id}:${gi}:${ei}`)).length, 0), 0);
      body.innerHTML = `<p class="hint">Each name becomes its own sheet, with the name and aliases filled in and the description underneath. Headings become folders. Untick anything that isn’t a ${lists.length === 1 && lists[0].root && lists[0].root !== 'new' ? esc((lists[0].root.singular || lists[0].root.title).toLowerCase().replace(/s$/, '')) : 'separate entry'}.</p>
        ${lists.map((L, li) => `<div class="tsh-doc">
          <div class="tsh-dh"><b>${esc(L.node.title)}</b>
            <label>into <select data-root="${li}">${roots.map(r => `<option value="${esc(r.id)}" ${L.root && L.root !== 'new' && r.id === L.root.id ? 'selected' : ''}>${esc(r.title)}</option>`).join('')}<option value="new" ${L.root === 'new' ? 'selected' : ''}>A new section called “${esc(L.node.title)}”</option></select></label></div>
          ${L.r.groups.map((g, gi) => `<div class="tsh-g">${g.group ? `<div class="tsh-gh">📁 ${esc(g.group)}</div>` : ''}
            ${g.entries.map((e, ei) => { const k = `${L.id}:${gi}:${ei}`; return `<label class="tsh-e ${skip.has(k) ? 'off' : ''}"><input type="checkbox" data-k="${esc(k)}" ${skip.has(k) ? '' : 'checked'}><span class="tsh-n"><b>${esc(e.name)}</b>${e.aliases.length ? ` <span class="tsh-a">(also ${esc(e.aliases.join(', '))})</span>` : ''}</span><span class="tsh-d">${esc(synopsisOf(e.text) || 'no description')}</span></label>`; }).join('')}</div>`).join('')}
          ${L.r.leftover.length ? `<p class="tsh-left">${L.r.leftover.length} line${L.r.leftover.length === 1 ? '' : 's'} before the first name stay in the original.</p>` : ''}
        </div>`).join('')}
        <label class="check tsh-opt"><input type="checkbox" id="tsh-groups" ${lists[0].keepGroups ? 'checked' : ''}><span>Turn headings into folders</span></label>
        <label class="check tsh-opt"><input type="checkbox" id="tsh-trash" ${body.dataset.keep ? '' : 'checked'}><span>Move the original ${lists.length === 1 ? 'list' : 'lists'} to the Trash (you can get ${lists.length === 1 ? 'it' : 'them'} back from there)</span></label>
        <p class="tsh-sum"><b>${total}</b> sheet${total === 1 ? '' : 's'} will be made.</p>`;
      body.querySelectorAll('[data-k]').forEach(c => c.onchange = () => { c.checked ? skip.delete(c.dataset.k) : skip.add(c.dataset.k); const y = body.closest('.m-body'), top = y && y.scrollTop; draw(); if (y) y.scrollTop = top; });
      body.querySelectorAll('[data-root]').forEach(s => s.onchange = () => { lists[+s.dataset.root].root = s.value === 'new' ? 'new' : roots.find(r => r.id === s.value); });
      $('#tsh-groups', body).onchange = e => lists.forEach(L => L.keepGroups = e.target.checked);
      $('#tsh-trash', body).onchange = e => { body.dataset.keep = e.target.checked ? '' : '1'; };
    };
    draw();
    const ok = await U.modal({ title: lists.length === 1 ? `Turn “${lists[0].node.title}” into sheets` : `Turn ${lists.length} lists into sheets`, body, wide: true,
      buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Make the sheets', value: true, kind: 'primary' }] });
    if (!ok) return;
    // a list of races, factions or monsters gets its own template section, named after the list
    for (const L of lists) if (L.root === 'new') {
      const k = 'custom-' + U.uid(), t = L.node.title.trim() || 'Entries';
      const node = { id: 'root-' + k, type: 'folder', kind: k, root: true, custom: true, open: true, children: [], title: t, singular: t.replace(/ies$/i, 'y').replace(/(?<!s)s$/i, ''), fields: ['Name', 'Aliases'], sections: ['Description', 'Notes'], icon: '🗂️' };
      S.project.binder.splice(S.project.binder.findIndex(x => x.kind === 'trash'), 0, node);
      L.root = node; L.inSheet = false; L.newRoot = node;
    }
    const toTrash = !body.dataset.keep;
    const undo = [];
    let made = 0;
    convert.last = [];   // what was made, by plain ids, so the import room can change it back later (beta, 20 Oct)
    for (const L of lists) {
      const f = U.findNode(L.id); if (!f) continue;
      const folder = { id: U.uid(), type: 'folder', title: L.node.title, open: true, children: [] };
      if (L.newRoot) folder.children = L.newRoot.children;   // a new section named after the list needs no extra folder inside it
      for (let gi = 0; gi < L.r.groups.length; gi++) {
        const g = L.r.groups[gi];
        const keep = g.entries.filter((e, ei) => !skip.has(`${L.id}:${gi}:${ei}`)); if (!keep.length) continue;
        let into = folder.children;
        if (g.group && L.keepGroups) { const sub = { id: U.uid(), type: 'folder', title: g.group, open: false, children: [] }; folder.children.push(sub); into = sub.children; }
        for (const e of keep) {
          const n = { id: U.uid(), type: 'doc', title: e.name, words: 0 };
          const syn = synopsisOf(e.text); if (syn) n.synopsis = syn;
          const html = sheetHTML(L.root, e);
          await U.api.saveDoc(S.slug, n.id, html);
          n.words = U.countWords(e.text || '');
          into.push(n); made++; (L.pages = L.pages || []).push(n.id);
        }
      }
      // the new folder takes the list's place when it was already in that section, otherwise it goes at the end of the section
      const sameRoot = L.inSheet && U.rootOf(L.id) === L.root;
      if (L.newRoot) { /* the entries are already in the new section */ } else if (sameRoot) f.list.splice(f.index + 1, 0, folder); else L.root.children.push(folder);
      L.root.open = true;
      undo.push({ folder, id: L.id, newRoot: L.newRoot });
      { const o = U.findNode(L.id); convert.last.push({ id: L.id, folder: L.newRoot ? null : folder.id, newRoot: L.newRoot ? L.newRoot.id : null, pages: L.pages || [], parent: o && o.parent ? o.parent.id : null, index: o ? o.index : 0 }); }
      if (toTrash) { const t = U.findNode(L.id); undo[undo.length - 1].from = { list: t.list, index: t.index }; t.list.splice(t.index, 1); U.findNode('root-trash').node.children.push(t.node); if (L.id === S.docId) S.docId = null; }
    }
    U.scheduleMeta(); U.renderBinder(); if (U.scheduleNames) U.scheduleNames(0);
    const first = undo[0] && undo[0].folder;
    const firstDoc = first && (first.children.find(c => c.type === 'doc') || (first.children[0] && first.children[0].children && first.children[0].children[0]));
    if (firstDoc) await U.openDoc(firstDoc.id, { focus: false });   // before the Undo offer: opening a document clears older offers
    U.toastAction(`Made ${made} sheet${made === 1 ? '' : 's'}.`, 'Undo', () => {
      for (const u of undo) {
        const fo = U.findNode(u.folder.id); if (fo) fo.list.splice(fo.index, 1);
        if (u.newRoot) { const i = S.project.binder.indexOf(u.newRoot); if (i >= 0) S.project.binder.splice(i, 1); }
        if (u.from) { const t = U.findNode(u.id); if (t) { t.list.splice(t.index, 1); u.from.list.splice(Math.min(u.from.index, u.from.list.length), 0, t.node); } }
      }
      U.scheduleMeta(); U.renderBinder(); if (U.scheduleNames) U.scheduleNames(0);
    }, 10000);
    return made;
  }

  // lists in the sheet sections of a just-imported project, worth offering to turn into sheets
  async function findLists() {
    const out = [];
    for (const root of S.project.binder.filter(isSheetRoot)) {
      const walk = async ns => { for (const n of ns) { if (n.type === 'doc' && !n.map) { const r = parse(await U.api.loadDoc(S.slug, n.id).catch(() => '')); if (r.count >= 3) out.push({ id: n.id, title: n.title, count: r.count }); } if (n.children) await walk(n.children); } };
      await walk(root.children || []);
    }
    return out;
  }
  async function offerAfterImport() {
    const found = await findLists(); if (!found.length) return;
    const n = found.reduce((a, x) => a + x.count, 0);
    const v = await U.modal({ title: 'Make a sheet for each character?', body: `<p>${found.length === 1 ? `“${esc(found[0].title)}” lists` : `${found.length} documents (${found.slice(0, 4).map(x => `“${esc(x.title)}”`).join(', ')}${found.length > 4 ? '…' : ''}) list`} about <b>${n}</b> characters, places or items, several to a document.</p>
      <p>In Unwip each one works best as its own sheet: its name is suggested as you type, it can be connected to others, and it shows which chapters mention it. You’ll see everything before it changes.</p>`,
      buttons: [{ label: 'Not now', value: false, kind: 'ghost' }, { label: 'Show me', value: true, kind: 'primary' }] });
    if (v) return convert(found.map(x => x.id));
  }

  // what each page would look like if this list were turned into sheets (nothing is made): the section they'd go in,
  // and for each entry its name, the heading it's under, and the page as the section's sheet would start it
  function preview(id, html) {
    const f = U.findNode(id); if (!f) return null;
    const r = parse(html); if (r.count < 2) return null;
    const here = U.rootOf(id), root = isSheetRoot(here) ? here : (guessRoot(f.node.title, r.groups) || null);
    const items = []; for (const g of r.groups) for (const e of g.entries) items.push({ name: e.name, group: g.group, html: sheetHTML(root || here, e) });
    return { section: root ? root.title : `a new section called “${f.node.title}”`, items };
  }
  return { parse, convert, findLists, offerAfterImport, splitName, preview };
})();
