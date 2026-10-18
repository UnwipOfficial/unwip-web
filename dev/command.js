// Unwip - "Find anything" (Ctrl+K). One box that runs any action, opens any chapter or sheet,
// and answers "how do I…" from Help. Every feature is reachable without hunting for its button.
window.UnwipCommand = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return;
  const { $, $$, S, esc } = U;
  const click = sel => () => { const b = $(sel); if (b) b.click(); };
  const needDoc = () => !!(S.project && S.docId);
  const inProject = () => !!S.project;
  const detailed = fn => () => { if (U.level() < 1) U.setMode('detailed'); fn(); };
  const side = tab => () => window.UnwipSide && window.UnwipSide.open(tab);
  // on a phone some bigger tools stay on the iPad and computer (like Scrivener's iPhone app)
  const desk = avail => () => !document.documentElement.classList.contains('m-phone') && avail();
  // Lore needs a bigger screen: phones go up to Detail (app.js level() caps there too)
  const roomy = avail => () => !window.matchMedia('(max-width: 720px)').matches && avail();

  // [label, extra words people might type, shortcut, run, available?]
  const ACTIONS = () => [
    ['Take a snapshot', 'save version backup copy', 'Ctrl+Shift+S', () => U.takeSnapshot(''), needDoc],
    ['Build: maps, magic, runes, sigils, arms, insignia and sheets (without leaving this book)', 'build world map dungeon magic system rune runes sigil arms coat heraldry insignia emblem logo character sheet worldbuilding', '', () => window.UnwipBuild && window.UnwipBuild.fromBook(), inProject],
    ['Record (proof of writing)', 'record replay screen video recording timelapse proof human written no ai authorship creator', '', () => window.UnwipProof && window.UnwipProof.open(), inProject],
    ['Screen video: pause or resume', 'pause resume screen video recording recorder stop break', '', () => { const P = window.UnwipProof; if (!P) return; if (P._V.rec) P.pauseVideo(!P._V.paused); else P.open(); }, inProject],
    ['Replay: watch how this book was written', 'replay playback recording proof timelapse report', '', () => window.UnwipProof && window.UnwipProof.recordings(), inProject],
    ['Snapshots of this chapter', 'versions history compare restore', '', side('snapshots'), needDoc],
    ['Revise', 'highlights hard sentences adverbs passive grammar readability check', 'F7', () => U.setRevise(!S.revise), needDoc],
    ['Comments & footnotes', 'notes margin', '', side('comments'), needDoc],
    ['Manuscript style', 'font size spacing indent headings look', '', side('style'), inProject],
    ['Track changes (on / off)', 'suggest suggestions suggesting edits editor review word', 'Ctrl+Shift+E', () => window.UnwipTrack && window.UnwipTrack.toggle(), () => inProject() && !!window.UnwipTrack],
    ['Review suggestions', 'tracked changes accept reject editor', '', side('changes'), needDoc],
    ['Read aloud', 'listen speak voice hear text to speech tts read out', 'F8', () => window.UnwipRead && window.UnwipRead.toggle(), needDoc],
    ['Send to a beta reader', 'beta reader editor critique partner word share feedback', '', () => window.UnwipReader && window.UnwipReader.send(), inProject],
    ['Bring in a reader’s feedback', 'beta reader editor word comments tracked changes import feedback', '', () => window.UnwipReader && window.UnwipReader.receive(), inProject],
    ['Add a comment', 'note remark', 'Ctrl+Alt+M', click('#btn-comment'), needDoc],
    ['Insert a footnote', 'note reference', 'Ctrl+Alt+F', click('#btn-footnote'), needDoc],
    ['Insert a picture', 'image photo illustration', '', click('#btn-image'), needDoc],
    ['Insert a scene break', 'divider asterisks * * *', '', click('#btn-scene'), needDoc],
    ['Clear formatting', 'remove styles plain', '', click('#btn-clear'), needDoc],
    ['Start a writing sprint', 'timer timed session pomodoro', '', click('#btn-sprint'), desk(inProject)],
    ['Spark: ideas to get going', 'stuck writers block blank procrastinating prompts story starters help', '', click('#btn-stuck'), inProject],
    ['Copy for Docs', 'clipboard google docs word paste', 'Ctrl+Shift+C', click('#btn-copy-docs'), needDoc],
    ['Copy for Royal Road', 'royal road rr web serial litrpg blue box system messages tables html paste chapter', '', () => window.UnwipRR && window.UnwipRR.open(), needDoc],
    ['Preview & page counts', 'pages paperback kindle', '', () => U.openPreview(), desk(inProject)],
    ['Export a print-ready PDF', 'paperback print kdp interior', '', () => U.openPreview('paperback'), desk(inProject)],
    ['Export an EPUB e-book', 'kindle kdp apple books kobo ebook', '', () => U.openPreview('ebook'), desk(inProject)],
    ['Export a Word document', 'docx microsoft editor agent', '', () => U.openPreview('docs'), desk(inProject)],
    ['Split view', 'side by side two documents', 'Ctrl+\\', click('#btn-split'), desk(needDoc)],
    ['Writer mode', 'full screen distraction free focus', 'F11', () => U.setWriter(true), needDoc],
    ['Find in this chapter', 'search text', 'Ctrl+F', () => U.openFind(), needDoc],
    ['Search the whole book', 'find replace everywhere', 'Ctrl+Shift+F', () => U.openSearch('search'), inProject],
    ['Find and replace', 'replace all rename', '', () => U.openSearch('replace'), inProject],
    ['LitRPG ledger: stats, skills and items', 'litrpg gamelit stats stat sheet level skills items quests titles system messages drift check', '', () => window.UnwipLedger && window.UnwipLedger.open(), inProject],
    ['Interview a character', 'character interview questions voice spark stuck notes villain love interest backstory', '', () => window.UnwipStuck && window.UnwipStuck.open('interview'), inProject],
    ['My interview questions (write your own)', 'interview questions customise customize edit my own character villain love interest', '', () => window.UnwipStuck && window.UnwipStuck.editInterview(), () => true],
    ['Character sheet', 'character sheet gear equipment slots inventory stats skills lore litrpg rpg', '', () => { const U2 = window.__unwip; if (U2.level() < 2) U2.setMode('lore'); window.UnwipCharSheet && window.UnwipCharSheet.open(U2.S.docId); }, roomy(() => !!(S.project && S.docId && window.UnwipCharSheet && window.UnwipCharSheet.isChar(S.docId)))],
    ['Name ideas (name generator)', 'name generator names random character first middle last surname handle no ai', '', () => window.UnwipNames && window.UnwipNames.open(window.__unwip.S.docId ? { onUse: n => window.UnwipNames.useOnSheet(n), useLabel: 'Use on this sheet' } : {}), () => true],
    ['Continuity pass', 'continuity consistency scaling level stats changed rename retcon go through each check every place', '', () => window.UnwipContinuity && window.UnwipContinuity.open(), inProject],
    ['Split this chapter at the cursor', 'divide break', 'Ctrl+Shift+K', () => U.splitAtCursor(), needDoc],
    ['Remove empty lines in this chapter', 'blank lines spacing tidy clean', '', () => U.tidyBlankLines(S.docId), needDoc],
    ['Word frequency & name check', 'overused words analysis repeated', '', () => { U.setRevise(true); setTimeout(click('#rp-analysis'), 200); }, needDoc],
    ['New document', 'chapter page file add', 'Ctrl+N', click('#btn-add-doc'), inProject],
    ['New folder', 'part group', '', click('#btn-add-folder'), inProject],
    ['New map', 'world map draw generate', '', click('#btn-add-map'), inProject],
    ['New template section', 'factions magic creatures monsters sheets', '', () => U.templateGallery(), inProject],
    ['Bring in chapters', 'import word docx google docs files', '', () => { const b = $('#btn-new'); if (b) b.click(); }, inProject],
    ['Focus level', 'focused mode simple calm less just write', '', () => U.setMode('focused'), inProject],
    ['Detail level', 'detailed mode more planning outline corkboard build', '', () => U.setMode('detailed'), inProject],
    ['Character sheets (every character)', 'character sheets all characters gear lore list', '', () => { if (U.level() < 2) U.setMode('lore'); window.UnwipCharSheet && window.UnwipCharSheet.browse(); }, roomy(inProject)],
    ['Open World: magic, runes, sigils and insignia', 'open world magic system rune runes sigil insignia emblem lore deep end', '', () => { if (U.level() < 2) U.setMode('lore'); window.UnwipBuild && window.UnwipBuild.fromBook('world'); }, roomy(inProject)],
    ['Add the selected words to a character, place or thing page', 'add to character page place item notes quote selection', '', () => { if (U.level() < 1) U.setMode('detailed'); window.UnwipAddTo && window.UnwipAddTo.toPage(window.UnwipAddTo.picked()); }, roomy(inProject)],
    ['Always correct this word…', 'autocorrect typo spelling replace always correct', '', () => window.UnwipAutocorrect && window.UnwipAutocorrect.always(), inProject],
    ['Your corrections (autocorrect)…', 'autocorrect typo spelling list corrections never', '', () => window.UnwipAutocorrect && window.UnwipAutocorrect.manage(), () => true],
    ['Link a map or picture to this page', 'map picture link place character page build coat of arms sigil', '', () => { if (U.level() < 1) U.setMode('detailed'); window.UnwipPageLinks && window.UnwipPageLinks.link(); }, inProject],
    ['Make a timeline event from the selected words', 'timeline event add selection happened', '', () => { if (U.level() < 1) U.setMode('detailed'); window.UnwipAddTo && window.UnwipAddTo.toEvent(window.UnwipAddTo.picked()); }, roomy(inProject)],
    ['Story Bible: add the selected words as a fact', 'story bible fact pin add note continuity series', '', () => { if (U.level() < 2) U.setMode('lore'); window.UnwipBible && window.UnwipBible.addFact(getSelection().toString()); }, roomy(inProject)],
    ['Lore level', 'lore unhinged deep end character sheets niche everything', '', () => U.setMode('lore'), roomy(inProject)],
    ['Outline', 'plan synopsis list', '', detailed(() => U.setView('outline')), inProject],
    ['Corkboard', 'cards index plan', '', detailed(() => U.setView('cork')), desk(inProject)],
    ['Moodboard', 'images inspiration pictures', '', detailed(() => U.setView('mood')), desk(inProject)],
    ['Timeline', 'events days dates', '', detailed(() => U.setView('timeline')), desk(inProject)],
    ['Insights: pacing and characters', 'chapter length dialogue scenes pov point of view character tracker appearances chart', '', detailed(() => U.setView('insights')), desk(inProject)],
    ['Writing goals', 'target daily words deadline', '', () => U.goalsDialog(), desk(inProject)],
    ['Report a problem', 'bug broken not working feedback help crash error send support', '', () => window.UnwipAbout && window.UnwipAbout.report(), () => !!window.UnwipAbout],
    ['Bigger page', 'zoom in page size larger text font bigger eyes', 'Ctrl+Alt+=', () => window.UnwipLook && window.UnwipLook.pageZoom(1), inProject],
    ['Smaller page', 'zoom out page size smaller', 'Ctrl+Alt+−', () => window.UnwipLook && window.UnwipLook.pageZoom(-1), inProject],
    ['Page at normal size (100%)', 'zoom reset page size', 'Ctrl+Alt+0', () => window.UnwipLook && window.UnwipLook.pageZoom(0), inProject],
    ['Your rights', 'rights own ownership copyright commercial sell licence license credit attribution reuse assets symbols', '', () => window.UnwipAbout && window.UnwipAbout.rights(), () => !!window.UnwipAbout],
    ['Open-source licences', 'licenses licences fonts ofl harper electron chromium credits copyright', '', () => window.UnwipAbout && window.UnwipAbout.licenses(), () => !!window.UnwipAbout],
    ['About Unwip', 'version credits licences licenses privacy ai no ai', '', () => window.UnwipAbout && window.UnwipAbout.about(), () => !!window.UnwipAbout],
    ['Sprint history', 'sprints wpm words per minute speed average best runs timer delete', '', () => window.UnwipSprints && window.UnwipSprints.open(), () => !!window.UnwipSprints],
    ['Writing history', 'calendar heatmap streak days stats statistics time of day best times words per day month progress log', '', () => window.UnwipHistory && window.UnwipHistory.open(), () => !!window.UnwipHistory],
    ['Dialogue view: only the dialogue', 'speech quotes conversation talking lines who speaks narration dim', 'Ctrl+Shift+D', () => window.UnwipDialogue && window.UnwipDialogue.toggle('dialogue'), needDoc],
    ['Narration view: only the narration', 'description prose without dialogue dim quotes', '', () => window.UnwipDialogue && window.UnwipDialogue.toggle('narration'), needDoc],
    ['Your world’s calendar', 'calendar months moons seasons week days year era fantasy dates reckoning timeline', '', async () => { if (window.UnwipCalendar && await window.UnwipCalendar.setup() && U.refreshPlanView) U.refreshPlanView(); }, () => inProject() && !!window.UnwipCalendar],
    ['Turn a list into separate sheets', 'split characters cast list into sheets one per character scrivener import convert names npc places races', '', () => window.UnwipSheets && window.UnwipSheets.convert(U.S.docId ? [U.S.docId] : []), () => inProject() && !!window.UnwipSheets && !!U.S.docId],
    ['Natural voice for Read aloud', 'kokoro tts voice read aloud natural speech download text to speech', '', () => window.UnwipVoice && window.UnwipVoice.setup(), () => !!window.UnwipVoice],
    ['Font for the whole book', 'font typeface change all chapters whole book every document default font palatino garamond times', '', () => window.UnwipBookFont && window.UnwipBookFont.open(), () => inProject() && !!window.UnwipBookFont],
    ['Export as a folder of chapter files', 'export folder chapters word docx markdown md files scrivener backup move leave locked in', '', () => window.UnwipExportFolder && window.UnwipExportFolder.open(), () => inProject() && !!window.UnwipExportFolder],
    ['Import from Scrivener', 'scrivener scriv import bring in project move from scrivener', '', () => U.importScrivener(), () => true],
    ['Tidy chapter titles typed into the text', 'chapter title twice double duplicate heading typed chapter 1 fix titles names', '', () => window.UnwipTitles && window.UnwipTitles.fixExisting(), () => inProject() && !!window.UnwipTitles],
    ['What I’ve used (private tally of buttons and menus)', 'used usage clutter tally count buttons menus what have i used never used', '', () => window.UnwipUsage && window.UnwipUsage.open(), () => !!window.UnwipUsage],
    ['One Word file for Vellum or Atticus', 'export vellum atticus word docx one file book formatting heading 1 import', '', () => window.UnwipExportFolder && window.UnwipExportFolder.oneWord(), () => inProject() && !!window.UnwipExportFolder],
    ['No hard feelings: take your book to Scrivener', 'export scrivener scriv leave move out take my book export everything word markdown backup no hard feelings', '', () => window.UnwipSendOut ? window.UnwipSendOut.open() : window.UnwipNoHardFeelings && window.UnwipNoHardFeelings.open(), () => inProject() && !!window.UnwipNoHardFeelings],
    ['Connections web', 'relationships relations family tree links connected rival ally sibling map of characters places items graph web', '', () => window.UnwipLinks && window.UnwipLinks.web(), () => inProject() && !!window.UnwipLinks],
    ['Connect this sheet to another', 'relationship link rival ally sibling member of lives in born in owns connection', '', () => window.UnwipLinks && window.UnwipLinks.connect(U.S.docId), () => { if (!inProject() || !window.UnwipLinks || !U.S.docId) return false; const r = U.rootOf(U.S.docId) || {}; return ['characters', 'places', 'items'].includes(r.kind) || !!r.custom; }],
    ['Series bible', 'series sequel book 2 shared characters places items share across books trilogy', '', () => window.UnwipSeries && window.UnwipSeries.open(), () => inProject() && !!window.UnwipSeries],
    ['Sync with Dropbox now', 'dropbox sync cloud phone pc upload download', '', () => window.UnwipDropbox.connected() ? window.UnwipDropbox.sync() : window.UnwipDropbox.connect(), () => !!window.UnwipDropbox],
    ['Backups', 'restore recover', '', () => window.UnwipSync && window.UnwipSync.backupsDialog(S.slug, S.project.title), inProject],
    ['Themes & colours', 'dark mode appearance look', '', () => window.UnwipLook && window.UnwipLook.openThemes(), () => true],
    ['Typing feel', 'typewriter animation sound', '', () => window.UnwipLook && window.UnwipLook.openTyping(), () => true],
    ['Settings', 'preferences options spelling language', '', () => U.openSettings(), () => true],
    ['Help', 'how to guide shortcuts keys', 'F1', () => window.UnwipHelp && window.UnwipHelp.open(), () => true],
    ['Keyboard shortcuts', 'keys hotkeys', '', () => window.UnwipHelp && window.UnwipHelp.open('shortcut'), () => true],
    ['Take the tour', 'tutorial walkthrough', '', () => window.UnwipIntro && window.UnwipIntro.tour(), inProject],
    ['Back to your books', 'library home main screen', '', () => U.showLibrary(), inProject]
  ];

  // ---------------------------------------------------------------- matching
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  function score(q, label, extra) {
    if (!q) return 1;
    const L = norm(label), E = norm(extra), words = q.split(/\s+/).filter(Boolean);
    let total = 0;
    for (const w of words) {
      if (L.startsWith(w)) total += 10;
      else if (new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(L)) total += 7;
      else if (L.includes(w)) total += 4;
      else if (new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(E)) total += 3;
      else return 0;
    }
    return total + (L.length < 22 ? 1 : 0);
  }
  function results(qRaw) {
    const q = norm(qRaw).trim();
    const groups = [];
    const acts = ACTIONS().filter(a => a[4]()).map(a => ({ s: score(q, a[0], a[1]), label: a[0], key: a[2], run: a[3], ic: 'act' })).filter(x => x.s > 0);
    acts.sort((a, b) => b.s - a.s);
    if (acts.length) groups.push(['Actions', q ? acts.slice(0, 6) : acts.slice(0, 8)]);
    if (q && S.project) {
      const docs = [];
      U.walkTree(S.project.binder, n => {
        if (n.root || n.type !== 'doc') return;
        const rt = U.rootOf(n.id); if (!rt || rt.kind === 'trash') return;
        const s = score(q, n.title || 'Untitled', `${rt.title || ''} ${n.synopsis || ''}`);
        if (s > 0) docs.push({ s, label: n.title || 'Untitled', sub: rt.kind === 'manuscript' ? (n.synopsis || '').slice(0, 60) : rt.title, run: () => { if (S.view !== 'write') U.setView('write'); U.openDoc(n.id); }, ic: n.map ? 'map' : 'doc' });
      });
      docs.sort((a, b) => b.s - a.s);
      if (docs.length) groups.push(['Chapters & sheets', docs.slice(0, 5)]);
    }
    // typing a word also offers to look for it in your writing
    const raw = String(qRaw || '').trim();
    if (raw.length >= 2 && S.project) {
      const txt = [];
      if (S.docId) {
        const ed = U.editor, n = ed ? ed.textContent.toLowerCase().split(raw.toLowerCase()).length - 1 : 0;
        txt.push({ label: `Find “${raw}” in this chapter`, sub: n ? `${n} match${n === 1 ? '' : 'es'}` : 'No matches in this chapter', run: () => { U.openFind(); const fi = document.getElementById('find-input'); if (fi) { fi.value = raw; fi.dispatchEvent(new Event('input', { bubbles: true })); } }, ic: 'find' });
      }
      txt.push({ label: `Search the whole book for “${raw}”`, sub: 'Every chapter, with find and replace', run: () => U.openSearch('search', raw), ic: 'find' });
      // a word that isn't an action or a chapter name: looking for it in your writing comes first
      const best = Math.max(0, ...acts.map(a => a.s), ...((groups.find(g => g[0] === 'Chapters & sheets') || [0, []])[1].map(d => d.s)));
      if (best < 10) groups.unshift(['Your writing', txt]); else groups.push(['Your writing', txt]);
    }
    if (q && window.UnwipHelp) {
      const help = window.UnwipHelp.TOPICS.map(t => ({ s: score(q, t[1], `${t[0]} ${t[2]}`), label: t[1], sub: t[2].length > 70 ? t[2].slice(0, 68) + '…' : t[2], run: () => window.UnwipHelp.open(t[1]), ic: 'help' })).filter(x => x.s > 0);
      help.sort((a, b) => b.s - a.s);
      if (help.length) groups.push(['Help', help.slice(0, 3)]);
    }
    return groups;
  }

  // ---------------------------------------------------------------- the box
  const ICON = {
    act: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 3L5 14h6l-1 7 8-11h-6z"/></svg>',
    doc: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/></svg>',
    map: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/></svg>',
    find: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    help: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 114 2c-1 .6-1.5 1.2-1.5 2.5M12 17h.01"/></svg>'
  };
  let back = null, items = [], pick = 0;
  function open(preset = '') {
    if (back) { $('input', back).focus(); return; }
    back = document.createElement('div'); back.className = 'cmdk-back';
    back.innerHTML = `<div class="cmdk" role="dialog" aria-label="Find anything">
      <label class="cmdk-in"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        <input type="text" id="cmdk-q" placeholder="Find an action, a chapter, help, or words in your writing…" autocomplete="off" spellcheck="false" value="${esc(preset)}"><kbd>Esc</kbd></label>
      <div class="cmdk-list" id="cmdk-list" role="listbox"></div>
      <div class="cmdk-foot"><span>↑ ↓ to move</span><span>Enter to run</span><span class="cmdk-try">Try “epub”, “map”, a chapter name, or any word to find it in your book</span></div></div>`;
    document.body.appendChild(back);
    const q = $('#cmdk-q', back), list = $('#cmdk-list', back);
    const draw = () => {
      const groups = results(q.value);
      items = []; let h = '';
      for (const [name, xs] of groups) {
        h += `<div class="cmdk-grp">${esc(name)}</div>`;
        for (const x of xs) { h += `<button class="cmdk-item" data-i="${items.length}" role="option"><span class="cmdk-ic">${ICON[x.ic] || ICON.act}</span><span class="cmdk-t"><b>${esc(x.label)}</b>${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</span>${x.key ? `<kbd>${esc(x.key)}</kbd>` : ''}</button>`; items.push(x); }
      }
      list.innerHTML = h || `<p class="cmdk-none">Nothing matches “${esc(q.value)}”. Try fewer letters, or press F1 for Help.</p>`;
      pick = 0; mark();
      $$('.cmdk-item', list).forEach(b => { b.onmousemove = () => { pick = +b.dataset.i; mark(false); }; b.onclick = () => run(+b.dataset.i); });
    };
    const mark = (scroll = true) => $$('.cmdk-item', list).forEach(b => { const on = +b.dataset.i === pick; b.classList.toggle('on', on); if (on && scroll) b.scrollIntoView({ block: 'nearest' }); });
    q.addEventListener('input', draw);
    q.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); pick = Math.min(items.length - 1, pick + 1); mark(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); pick = Math.max(0, pick - 1); mark(); }
      else if (e.key === 'Enter') { e.preventDefault(); run(pick); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    });
    back.addEventListener('mousedown', e => { if (e.target === back) close(); });
    draw(); q.focus(); q.select();
  }
  function close() { if (!back) return; back.remove(); back = null; }
  function run(i) {
    const x = items[i]; if (!x) return;
    close();
    if (S.docId && U.restoreRange) U.restoreRange();
    setTimeout(() => { try { x.run(); } catch (e) { console.warn(e); } }, 10);
  }

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
      if (document.querySelector('.modal-back, .pv-back, #intro')) return;
      e.preventDefault(); e.stopPropagation(); back ? close() : open();
    }
  }, true);

  // a one-time tip in the first week, so people know the box exists
  U.on('project', () => {
    const st = S.settings || {};
    if (st.cmdkTipSeen || document.documentElement.classList.contains('m-phone')) return;
    setTimeout(() => {
      U.toast('Tip: press <b>Ctrl+K</b> (or the magnifying glass) to find any action, chapter or help topic.', '', 9000);
      U.api.setSettings({ cmdkTipSeen: true }).then(x => { S.settings = x; }).catch(() => {});
    }, 4000);
  });

  return { open, close, results };
})();
