// Unwip - the welcome setup (first launch, or Settings › Help) and the guided tour.
// The setup asks what you've written with before and sets Unwip up to feel familiar:
// layout (clean page / writer's desk / distraction-free), how the book is organised,
// look, font and goal. It can build an example project laid out the way you chose.
window.UnwipIntro = (function () {
  'use strict';
  const U = window.__unwip;
  const { $, $$, esc, S, api } = U;

  // ================================================================== WHERE YOU'RE COMING FROM
  const FROM = {
    scrivener: {
      name: 'Scrivener', icon: '📚', blurb: 'Binder, corkboard, compile',
      layout: 'desk', structure: 'scenes', font: 'Times New Roman', para: 'book',
      map: [['Binder', 'Binder (left side)'], ['Corkboard & Outliner', 'Detail level › Corkboard and Outline'], ['Labels & Status', 'Status (right-click a document)'],
        ['Compile', 'Export (PDF, e-book, Word)'], ['Snapshots', 'Snapshots (camera button)'], ['Composition mode', 'Writer mode'], ['Book targets', 'Goals & sprints']],
      tip: 'Your Scrivener projects can come straight across, with folders, synopses, labels, icons and pictures.'
    },
    docs: {
      name: 'Google Docs', icon: '📄', blurb: 'One long document in the browser',
      layout: 'page', structure: 'chapters', font: 'Arial', para: 'blocks',
      map: [['One long document', 'One page per chapter in the Binder, so nothing gets lost scrolling'], ['Headings / outline', 'The Binder'], ['Comments', 'Comments (speech bubble)'],
        ['Version history', 'Snapshots, plus automatic backups'], ['Sharing with readers', 'Copy for Google Docs puts your book back into Docs in one go']],
      tip: 'Paste a chapter in and the formatting is cleaned up for you. "Copy for Docs" goes the other way.'
    },
    word: {
      name: 'Microsoft Word', icon: '📝', blurb: 'A .docx file on your computer',
      layout: 'page', structure: 'chapters', font: 'Calibri', para: 'blocks',
      map: [['Navigation pane', 'The Binder'], ['Comments & footnotes', 'Comments and footnotes, kept in Word exports'], ['Styles', 'Text style (Aa) for the whole book'],
        ['Save As…', 'Saves itself every few seconds'], ['Export to PDF', 'Export › PDF, Word or e-book']],
      tip: 'Bring a Word document in and Unwip splits it into chapters at the headings.'
    },
    obsidian: {
      name: 'Obsidian or Markdown', icon: '🗂️', blurb: 'A vault of Markdown notes',
      layout: 'page', structure: 'chapters', font: 'Georgia', para: 'blocks',
      map: [['Your vault', 'One book, with your sub-folders as folders in the Binder'], ['Markdown symbols', 'Formatting you can see: Ctrl+I for italics, Ctrl+B for bold'],
        ['[[Links]] and tags', 'Plain words in the book; Characters and Places sheets sit alongside'], ['Notes beside the draft', 'Notes and Research, outside the Manuscript'],
        ['Plain files you own', 'Export › a folder of Markdown files, any time']],
      tip: 'Bring your vault in as a book: chapter 2 comes before chapter 10, and HTML like <u> becomes real formatting.'
    },
    hemingway: {
      name: 'An editing or style checker', icon: '✂️', blurb: 'Tightening and readability',
      layout: 'calm', structure: 'chapters', font: 'Georgia', para: 'book',
      map: [['Highlighted problems', 'Revise (repeated words, adverbs, long sentences, filler)'], ['Readability', 'Revise › readability score'],
        ['Write mode', 'Writer mode with typewriter scrolling'], ['Word counts', 'Live counts, goals and progress']],
      tip: 'Revise highlights things to look at, but never changes your words for you. No AI anywhere.'
    },
    new: {
      name: 'Nothing yet / pen & paper', icon: '🌱', blurb: 'Starting fresh',
      layout: 'page', structure: 'chapters', font: 'Georgia', para: 'book',
      map: [['A notebook', 'One page per chapter, with Notes and Characters alongside'], ['Losing work', 'Saves itself, plus backups'], ['Not knowing what next', 'Spark and Play give you a push']],
      tip: 'Take the tour at the end: it points at each button and says what it does.'
    }
  };
  const LAYOUTS = {
    page: { name: 'Clean page', like: 'Feels like Google Docs or Word', desc: 'A list of chapters and a page. Everything else stays out of the way until you want it.', mode: 'focused' },
    desk: { name: 'Writer’s desk', like: 'Feels like Scrivener', desc: 'Binder, corkboard, outline, statuses and timeline: the whole book laid out.', mode: 'detailed' },
    calm: { name: 'Distraction-free', like: 'Feels like a distraction-free writing app', desc: 'Just your words, full screen, with the current line kept in the middle.', mode: 'focused', writer: true }
  };
  const STRUCT = {
    chapters: { name: 'Chapters', desc: 'Each chapter is one page.', tree: ['Chapter 1', 'Chapter 2', 'Chapter 3'] },
    scenes: { name: 'Chapters with scenes', desc: 'Each chapter is a folder; scenes inside it are easy to move around.', tree: ['▾ Chapter 1', '  Scene: 3 May, Bistritz', '  Scene: The Borgo Pass', '▾ Chapter 2', '  Scene: 8 May'] },
    parts: { name: 'Parts, chapters, scenes', desc: 'For longer books split into parts or acts.', tree: ['▾ Part One', '  ▾ Chapter 1', '    Scene', '    Scene', '  ▸ Chapter 2', '▸ Part Two'] }
  };
  const THEME_PICKS = ['paper', 'sepia', 'mint', 'night', 'midnight', 'forest'];
  const FONT_PICKS = ['Times New Roman', 'Georgia', 'Garamond', 'Palatino Linotype', 'Calibri', 'Arial', 'Courier New'];
  const GOALS = [[0, 'No goal'], [250, '250'], [500, '500'], [1000, '1,000'], [1667, '1,667 (NaNo)'], [2000, '2,000']];
  const SAMPLE = 'It was on the dark side of twilight when we got to Bistritz, which is a very interesting old place.';
  const SAMPLE2 = '“Welcome to my house! Enter freely and of your own will!” He made no motion of stepping to meet me, but stood like a statue, as though his gesture of welcome had fixed him into stone.';

  // ================================================================== THE SETUP
  let ans = null, step = 0, root = null;
  // Two screens: where you're coming from (which sets everything else), then getting your book in.
  // "Change layout, font or colours…" adds the detailed screens for anyone who wants them.
  const steps = () => ans.custom ? ['from', 'layout', 'structure', 'look', 'goal', 'ready'] : ['from', 'ready'];

  function start() {
    const look = window.UnwipLook ? window.UnwipLook.look : {};
    ans = { from: S.settings.from || '', layout: '', structure: '', theme: (look.theme && look.theme !== 'system') ? look.theme : 'paper',
      font: '', para: '', goal: S.settings.dailyGoal || 0, author: S.settings.author || '', example: true, action: '' };
    step = 0;
    if (root) root.remove();
    root = document.createElement('div'); root.id = 'intro';
    document.body.appendChild(root);
    render();
  }
  function close() { if (root) { root.classList.add('out'); const r = root; setTimeout(() => r.remove(), 250); root = null; } }

  function choose(list, cur, key, extra = () => '') {
    return list.map(([id, title, sub]) => `<button class="in-choice${cur === id ? ' on' : ''}" data-${key}="${id}">${extra(id)}<b>${title}</b>${sub ? `<span>${sub}</span>` : ''}</button>`).join('');
  }
  function layoutPreview(id) {
    if (id === 'page') return `<div class="in-mini"><i class="b"></i><i class="p"></i></div>`;
    if (id === 'desk') return `<div class="in-mini"><i class="b"></i><i class="c"><s></s><s></s><s></s><s></s></i><i class="n"></i></div>`;
    return `<div class="in-mini dark"><i class="p wide"></i></div>`;
  }

  function render() {
    const f = FROM[ans.from] || null;
    const STEPS = steps(), name = STEPS[step];
    let h = '';
    if (name === 'from') h = `
      <div class="in-hello">${($('.brand-wordmark') || {}).outerHTML || '<b>unwip</b>'}<span class="in-slogan">Write to finish</span></div>
      <h2>Welcome. What have you written with before?</h2>
      <p class="in-lead">Pick one and Unwip sets itself up to feel familiar: layout, font and how books are organised. No account, no AI, and it works offline.</p>
      <div class="in-grid">${choose(Object.entries(FROM).map(([id, x]) => [id, x.name, x.blurb]), ans.from, 'from', id => `<em>${FROM[id].icon}</em>`)}</div>
      ${f ? `<div class="in-map"><h3>Coming from ${esc(f.name)}: where things are</h3><table>${f.map.map(([a, b]) => `<tr><td>${esc(a)}</td><td>→</td><td>${esc(b)}</td></tr>`).join('')}</table><p>${esc(f.tip)}</p></div>` : ''}
      <p class="in-custom"><button class="link-btn" type="button" id="in-custom">${ans.custom ? 'Use the simple setup instead' : 'Change layout, font or colours…'}</button></p>`;
    else if (name === 'layout') h = `
      <h2>Which layout would you like?</h2>
      <p class="in-lead">${f ? `We’ve picked the one closest to ${esc(f.name)}. ` : ''}Switch any time with the Focus / Detail / Lore buttons at the top.</p>
      <div class="in-grid three">${Object.entries(LAYOUTS).map(([id, l]) => `<button class="in-choice tall${ans.layout === id ? ' on' : ''}" data-layout="${id}">${layoutPreview(id)}<b>${l.name}</b><span class="in-like">${l.like}</span><span>${l.desc}</span></button>`).join('')}</div>`;
    else if (name === 'structure') h = `
      <h2>How do you like to organise a book?</h2>
      <p class="in-lead">This shapes the example project and how chapter titles come out in exports. You can mix and match later.</p>
      <div class="in-grid three">${Object.entries(STRUCT).map(([id, x]) => `<button class="in-choice tall${ans.structure === id ? ' on' : ''}" data-structure="${id}"><pre class="in-tree">${x.tree.map(esc).join('\n')}</pre><b>${x.name}</b><span>${x.desc}</span></button>`).join('')}</div>`;
    else if (name === 'look') h = `
      <h2>Pick a look</h2>
      <p class="in-lead">Colours apply everywhere. The font and paragraphs are for new books and the example; books you already have keep their own (change those any time in Manuscript style).</p>
      <div class="in-row"><label>Colours</label><div class="in-chips">${THEME_PICKS.map(t => { const th = window.UnwipLook.THEMES[t]; return `<button class="in-sw${ans.theme === t ? ' on' : ''}" data-theme="${t}" title="${th.name}"><i style="background:${th.sw[0]}"><s style="background:${th.sw[1]}"></s><u style="background:${th.sw[2]}"></u></i>${th.name}</button>`; }).join('')}</div></div>
      <div class="in-row"><label>Writing font</label><div class="in-chips">${FONT_PICKS.map(x => `<button class="in-chip${ans.font === x ? ' on' : ''}" data-font="${esc(x)}" style="font-family:'${esc(x)}'">${esc(x)}</button>`).join('')}</div></div>
      <div class="in-row"><label>Paragraphs</label><div class="in-chips">
        <button class="in-chip${ans.para === 'book' ? ' on' : ''}" data-para="book">Indented, like a printed book</button>
        <button class="in-chip${ans.para === 'blocks' ? ' on' : ''}" data-para="blocks">Spaced blocks, like Docs and Word</button></div></div>
      <div class="in-sample ${ans.para}" style="font-family:'${esc(ans.font)}'"><p>${SAMPLE}</p><p>${SAMPLE2}</p></div>`;
    else if (name === 'goal') h = `
      <h2>A daily goal?</h2>
      <p class="in-lead">Shown as a quiet progress ring while you write. Plenty of people pick none.</p>
      <div class="in-chips big">${GOALS.map(([v, l]) => `<button class="in-chip${+ans.goal === v ? ' on' : ''}" data-goal="${v}">${l}${v ? ' words' : ''}</button>`).join('')}</div>
      <div class="in-row"><label>Your name, as it goes on title pages and exports</label><input id="in-author" class="in-input" placeholder="e.g. Ima Novelist" value="${esc(ans.author)}"></div>`;
    else if (name === 'ready') {
      const actions = [];
      if (ans.from === 'scrivener') actions.push(['scriv', '📚 Bring in my Scrivener project', 'Pick the .scriv folder. Everything comes across as a new book.']);
      if (ans.from === 'docs') actions.push(['paste', '📋 Paste my book from Google Docs', 'Select all in Docs, copy, paste. Unwip finds the chapters for you.']);
      if (ans.from === 'obsidian') actions.push(['vault', '🗂️ Bring in my Obsidian vault', 'Pick the vault folder (or any folder of chapter files). Sub-folders come too.']);
      if (ans.from !== 'scrivener') actions.push(['files', ans.from === 'word' ? '📝 Bring in my Word files' : '📁 Bring in my book from files', 'One file or one per chapter: Word, LibreOffice, RTF, text or Markdown. Chapters are found automatically.']);
      h = `
      <h2>${ans.custom ? 'All set' : 'Bring your book in'}</h2>
      ${ans.custom ? '' : `<p class="in-lead">Set up like ${esc((FROM[ans.from] || FROM.new).name)}. Change any of this later in Settings.</p>`}
      <ul class="in-summary">
        <li><b>Layout</b> ${esc(LAYOUTS[ans.layout].name)}</li>
        <li><b>Books organised as</b> ${esc(STRUCT[ans.structure].name.toLowerCase())}</li>
        <li><b>Look</b> ${esc(window.UnwipLook.THEMES[ans.theme].name)}, ${esc(ans.font)}, ${ans.para === 'book' ? 'indented paragraphs' : 'spaced paragraphs'}</li>
        <li><b>Daily goal</b> ${ans.goal ? fmtN(ans.goal) + ' words' : 'none'}</li>
      </ul>
      <h3 class="in-h3">What would you like to start with?</h3>
      <div class="in-grid">${choose([
        ['example', '🦇 An example book: Dracula', 'The opening chapters of Bram Stoker’s Dracula, laid out the way you chose: diary entries, letters, characters, places and a timeline. Change anything you like.'],
        ...actions,
        ['blank', '📖 A blank book', 'Name it and start writing.']
      ], ans.action, 'action')}</div>`;
    }
    const canNext = name === 'goal' || name === 'look' ||
      (name === 'from' && ans.from) || (name === 'layout' && ans.layout) || (name === 'structure' && ans.structure) || (name === 'ready' && ans.action);
    root.innerHTML = `<div class="in-card">
      <div class="in-top"><div class="in-dots">${STEPS.map((_, i) => `<i class="${i === step ? 'on' : i < step ? 'done' : ''}"></i>`).join('')}</div><button class="in-skip" id="in-skip">Skip setup</button></div>
      <div class="in-body">${h}</div>
      <div class="in-foot">${step ? '<button class="btn ghost" id="in-back">Back</button>' : '<span></span>'}
        ${name === 'ready'
          ? `<div class="in-end"><button class="btn" id="in-go" ${canNext ? '' : 'disabled'}>Start writing</button><button class="btn primary" id="in-tour" ${canNext ? '' : 'disabled'}>Start with a quick tour</button></div>`
          : `<button class="btn primary" id="in-next" ${canNext ? '' : 'disabled'}>Next</button>`}</div>
    </div>`;
    wire();
  }
  const fmtN = n => (+n).toLocaleString();

  function pickFrom(id) {
    const f = FROM[id]; ans.from = id;
    ans.layout = f.layout; ans.structure = f.structure; ans.font = f.font; ans.para = f.para;
  }
  function wire() {
    const r = root;
    $$('[data-from]', r).forEach(b => b.onclick = () => { pickFrom(b.dataset.from); render(); });
    $$('[data-layout]', r).forEach(b => b.onclick = () => { ans.layout = b.dataset.layout; render(); });
    $$('[data-structure]', r).forEach(b => b.onclick = () => { ans.structure = b.dataset.structure; render(); });
    $$('[data-theme]', r).forEach(b => b.onclick = () => { ans.theme = b.dataset.theme; window.UnwipLook.setTheme(ans.theme); render(); });
    $$('[data-font]', r).forEach(b => b.onclick = () => { ans.font = b.dataset.font; render(); });
    $$('[data-para]', r).forEach(b => b.onclick = () => { ans.para = b.dataset.para; render(); });
    $$('[data-goal]', r).forEach(b => b.onclick = () => { ans.goal = +b.dataset.goal; render(); });
    $$('[data-action]', r).forEach(b => b.onclick = () => { ans.action = b.dataset.action; render(); });
    const au = $('#in-author', r); if (au) au.oninput = () => { ans.author = au.value; };
    const cu = $('#in-custom', r); if (cu) cu.onclick = () => { if (!ans.from) pickFrom('new'); ans.custom = !ans.custom; if (ans.custom) step = 1; render(); };
    $('#in-skip', r).onclick = skip;
    const back = $('#in-back', r); if (back) back.onclick = () => { step--; render(); };
    const next = $('#in-next', r); if (next) next.onclick = () => {
      if (!ans.layout) { const keep = ans.from; pickFrom(keep || 'new'); ans.from = keep; }
      step++; render();
    };
    const go = $('#in-go', r); if (go) go.onclick = () => finish(false);
    const tr = $('#in-tour', r); if (tr) tr.onclick = () => finish(true);
  }
  async function skip() {
    S.settings = await api.setSettings({ onboarded: true });   // skipped: the main screen keeps offering it
    close(); settleButton();
    const list = await api.listProjects();
    if (!list.length) U.toast('Click “New book” to start your first one. Settings › Help has the setup and a tour.', '', 7000);
  }

  async function finish(withTour) {
    const f = FROM[ans.from] || FROM.new, L = LAYOUTS[ans.layout];
    const style = { font: ans.font, ...(ans.para === 'blocks'
      ? { indent: 0, paraSpacing: 8, lineHeight: ans.font === 'Arial' ? 1.15 : 1.3, noIndentFirst: true }
      : { indent: 0.5, paraSpacing: 0, lineHeight: 1.5, noIndentFirst: true }),
      size: ans.font === 'Arial' ? 11 : ans.font === 'Calibri' ? 11 : 12 };
    S.settings = await api.setSettings({ onboarded: true, settledIn: true, from: ans.from || 'new', defaultStyle: style, dailyGoal: +ans.goal || 0,
      author: (ans.author || '').trim(), layout: ans.layout, structure: ans.structure });
    window.UnwipLook.setTheme(ans.theme);
    U.setMode(L.mode);
    close(); settleButton();
    let opened = false;
    if (ans.action === 'scriv') { await U.importScrivener(); opened = !!S.slug; }
    else if (ans.action === 'paste' || ans.action === 'files' || ans.action === 'vault') {
      const BI = window.UnwipBookImport, after = withTour ? () => setTimeout(tour, 500) : null;
      if (ans.action === 'paste') BI.fromPaste({ onDone: after }); else if (ans.action === 'vault') BI.fromFolder({ onDone: after }); else BI.fromFiles({ onDone: after });
      return;
    }
    else if (ans.action === 'example') { await makeExample(); opened = true; }
    else {
      const title = await U.promptText('Your book', 'Title (you can change it later)', '');
      if (title) { const slug = await api.createProject(title, blankTemplate()); await U.openProject(slug, { skipCheck: true }); opened = true; }
    }
    if (window.UnwipStart && !withTour) setTimeout(() => window.UnwipStart.safety(), 2500);   // phone/iPad: keep writing safe
    if (!opened) { U.showLibrary(); return; }
    if (withTour) { writerAfterTour = !!L.writer; setTimeout(tour, 500); }
    else if (L.writer) setTimeout(() => { U.setWriter(true); U.toast('This is Writer mode: just the page. Press Esc or F11 to see everything else.', '', 7000); }, 800);
  }

  // ================================================================== EXAMPLE PROJECT
  // The opening chapters of Dracula (Bram Stoker, 1897, public domain): told in dated diary entries, letters and a
  // newspaper cutting, so it shows off the binder, corkboard, timeline and formatting. The text is in example-text.js.
  const P = s => s.split('\n\n').map(x => `<p>${x}</p>`).join('');
  const SCENE_BREAK = '<p class="scene" style="text-align: center">* * *</p>';
  const LOG = P(`[Not typed up yet. That’s what the “To do” status is for.]

Next: the captain’s log of the Demeter, found on board and read at the inquest. Day by day from 6 July, as the crew go missing one by one.

– Keep it in the captain’s voice: short, dated entries.
– Add each day to the Timeline as you go.`);
  const START_HERE = name => {
    const f = FROM[ans.from] || FROM.new;
    return `<p>This example book is the opening of <i>Dracula</i> by Bram Stoker (1897), shortened in places. It’s long out of copyright, so it’s yours to click around in and change. Delete it from the main screen (right-click its card) when you’re done.</p>
<p>Stoker told the story in diary entries, letters and newspaper cuttings, each one dated, which is why it makes a good example: every entry is its own scene in the Binder, every scene has a card on the corkboard, and the dates are already on the Timeline.</p>
<h2>Coming from ${esc(f.name)}</h2>
<ul>${f.map.map(([a, b]) => `<li><b>${esc(a)}</b> → ${esc(b)}</li>`).join('')}</ul>
<p>${esc(f.tip)}</p>
<h2>Things to try</h2>
<ul>
<li>Open <b>${name}</b> in the Binder on the left and just type. It saves itself.</li>
<li>Drag a scene in the Binder to reorder it.</li>
<li>Click <b>Detail</b> at the top for the corkboard, outline, statuses and the <b>Timeline</b>${ans.layout === 'desk' ? ' (you’re already in Detail)' : ''}. The Timeline shows each entry on its date.</li>
<li>Open <b>Jonathan Harker</b> under Characters to see a character sheet.</li>
<li>Select a word and add a comment, or put a footnote in.</li>
<li>Try <b>Revise</b> on a scene to see repeated words and long sentences (Stoker has plenty).</li>
<li>Press <b>Read aloud</b> to hear a letter read out.</li>
<li>Click <b>Record</b> at the bottom, write a few lines in “The Demeter’s log”, then play them back.</li>
<li>Click <b>Build</b> at the top and paint a map of the road to the Borgo Pass, or draw a rune alphabet for the Count’s old books.</li>
<li>Export the book as a PDF or e-book to see the chapter titles come out properly.</li>
</ul>
<p>Settings › Help runs the setup and the tour again.</p>`;
  };
  const sheet = (fields, parts) => fields.map(([k, v]) => `<p><b>${k}:</b> ${v}</p>`).join('') + parts.map(([h, t]) => `<h2>${h}</h2><p>${t}</p>`).join('');
  const CHARS = [
    ['Jonathan Harker', sheet([['Full name', 'Jonathan Harker'], ['Role', 'Main character'], ['Age', 'Young; newly qualified']],
      [['Appearance', 'An English solicitor’s clerk, travelling with a notebook he keeps in shorthand.'], ['Personality', 'Careful, polite and observant. Notes down recipes for Mina, and the trains that run late.'], ['Backstory', 'Sent by his employer, Mr. Hawkins, to help a Transylvanian count buy a house in England.'], ['Notes', 'Tells the first four chapters through his journal.']])],
    ['Mina Murray', sheet([['Full name', 'Wilhelmina “Mina” Murray'], ['Role', 'Main character'], ['Age', 'Young; engaged to Jonathan']],
      [['Personality', 'Clear-headed and practical. Learning shorthand and typewriting so she can help Jonathan with his work.'], ['Backstory', 'An assistant schoolmistress, and Lucy’s closest friend.'], ['Notes', 'Her journal and letters carry the story once it moves to Whitby.']])],
    ['Lucy Westenra', sheet([['Full name', 'Lucy Westenra'], ['Role', 'Supporting character'], ['Age', 'Nineteen']],
      [['Personality', 'Warm, playful and much admired. Sleepwalks.'], ['Notes', 'Writes to Mina about her suitors.']])],
    ['Count Dracula', sheet([['Full name', 'Count Dracula'], ['Aliases', 'The Count'], ['Role', 'Antagonist']],
      [['Appearance', 'A tall old man, clean shaven save for a long white moustache, dressed in black. Very pale; hands as cold as ice.'], ['Personality', 'Courtly and hospitable, and never seen to eat.'], ['Notes', 'Is buying a house in England. Why?']])]
  ];
  const PLACES = [
    ['Castle Dracula', sheet([['Name', 'Castle Dracula'], ['Region', 'The Carpathian mountains, beyond the Borgo Pass'], ['Type', 'Castle']],
      [['Description', 'A vast ruined castle on the edge of a precipice. Doors, doors, doors everywhere, and all of them locked and bolted.'], ['Notes', 'No mirrors anywhere in the castle.']])],
    ['Whitby', sheet([['Name', 'Whitby'], ['Region', 'The Yorkshire coast, England'], ['Type', 'Harbour town']],
      [['Description', 'A harbour town with a ruined abbey on the East Cliff and a churchyard full of sailors’ graves.'], ['Notes', 'Where Mina and Lucy spend the summer, and where the storm comes in.']])]
  ];

  function blankTemplate() {
    const t = U.newProjectTemplate();
    const ms = t.binder[0];
    if (ans.structure === 'scenes' || ans.structure === 'parts') {
      const scene = { id: U.uid(), type: 'doc', title: 'Scene 1', words: 0 };
      let ch = { id: U.uid(), type: 'folder', title: 'Chapter 1', holds: 'scenes', open: true, children: [scene] };
      if (ans.structure === 'parts') ch = { id: U.uid(), type: 'folder', title: 'Part One', holds: 'chapters', open: true, children: [ch] };
      ms.children = [ch]; t.lastDoc = scene.id;
    }
    return t;
  }

  async function makeExample() {
    const X = window.UnwipExampleText;
    const t = U.newProjectTemplate();
    const docs = {};
    const doc = (title, html, extra = {}) => { const id = U.uid(); docs[id] = html; return { id, type: 'doc', title, words: U.countWords(html.replace(/<[^>]+>/g, ' ')), ...extra }; };
    const desk = ans.layout === 'desk' || ans.from === 'scrivener';
    const st = s => desk ? { status: s } : {};
    // the chapters, each a list of scenes: [title, text, synopsis, status, date of the entry]
    const CH = [
      ['Jonathan Harker’s Journal', 'Jonathan travels east to meet his client, Count Dracula.', [
        ['3 May, Bistritz', X.bistritz, 'Trains, paprika and a letter of welcome from the Count.', 'final', '1893-05-03'],
        ['4 May', X.may4, 'The landlady begs him not to go, and gives him her crucifix.', 'revised', '1893-05-04'],
        ['The Borgo Pass', X.borgo, 'No one is expected at the pass, until a calèche comes out of the dark.', 'revised', '1893-05-04']]],
      ['At the Castle', 'A courteous host, and a castle with no way out.', [
        ['5 May, Castle Dracula', X.castle, '“Welcome to my house! Enter freely and of your own will!”', 'revised', '1893-05-05'],
        ['8 May', X.mirror, 'No reflection in the shaving glass. Every door is locked.', 'draft', '1893-05-08']]],
      ['Letters', 'Mina and Lucy write to each other.', [
        ['Mina to Lucy', X.mina, 'Mina is learning shorthand, and wants all of Lucy’s news.', 'draft', '1893-05-09'],
        ['Lucy to Mina', X.lucy, 'Lucy writes about Mr. Holmwood.', 'draft', '1893-05-10']]],
      ['Whitby', 'A summer by the sea, and a ship in a storm.', [
        ['24 July, Whitby', X.whitby, 'Mina arrives, and meets an old man in the churchyard.', 'draft', '1893-07-24'],
        ['Cutting from The Dailygraph', X.cutting, 'A sudden storm drives a ship into the harbour, steered by a dead man.', 'draft', '1893-08-08'],
        ['The Demeter’s log', LOG, 'The captain’s log: what happened on board.', 'todo', '']]]
    ];
    const EVENT = { '3 May, Bistritz': 'Jonathan reaches Bistritz', '4 May': 'The landlady’s crucifix', 'The Borgo Pass': 'Met at the Borgo Pass',
      '5 May, Castle Dracula': 'Arrives at Castle Dracula', '8 May': 'No reflection in the mirror', 'Mina to Lucy': 'Mina writes to Lucy',
      'Lucy to Mina': 'Lucy writes back', '24 July, Whitby': 'Mina arrives in Whitby', 'Cutting from The Dailygraph': 'A ship runs aground in the storm' };
    const events = [], ids = {};
    const COLOURS = { Jonathan: '#4a7fd0', Mina: '#3f9a5a', Lucy: '#c2577a', Ship: '#6b6b6b' };
    const who = title => /Lucy to/.test(title) ? ['Lucy Westenra'] : /Mina|Whitby/.test(title) ? ['Mina Murray'] : /Dailygraph|Demeter/.test(title) ? [] : ['Jonathan Harker'];
    let ms;
    const sceneDoc = ([title, html, synopsis, status]) => doc(title, html, { synopsis, ...st(status) });
    if (ans.structure === 'chapters') {
      ms = CH.map(([title, synopsis, scenes]) => {
        const d = doc(title, scenes.map(x => x[1]).join(SCENE_BREAK), { synopsis, ...st(scenes.some(x => x[3] === 'todo') ? 'draft' : scenes[0][3]) });
        scenes.forEach(x => { ids[x[0]] = d.id; });
        return d;
      });
    } else {
      const chs = CH.map(([title, synopsis, scenes], i) => ({ id: U.uid(), type: 'folder', title: `Chapter ${i + 1}`, holds: 'scenes', open: i < 2, synopsis: `${title}. ${synopsis}`,
        children: scenes.map(x => { const d = sceneDoc(x); ids[x[0]] = d.id; return d; }) }));
      ms = ans.structure === 'parts'
        ? [{ id: U.uid(), type: 'folder', title: 'Part One: Transylvania', holds: 'chapters', open: true, children: chs.slice(0, 2) },
           { id: U.uid(), type: 'folder', title: 'Part Two: England', holds: 'chapters', open: true, children: chs.slice(2) }]
        : chs;
    }
    // the timeline: every dated entry on its day (Stoker never gives the year; most readers place it in 1893)
    for (const [, , scenes] of CH) for (const [title, , synopsis, , date] of scenes) {
      if (!date) continue;
      const chars = who(title), key = /Dailygraph/.test(title) ? 'Ship' : chars[0] ? chars[0].split(' ')[0] : 'Ship';
      events.push({ id: U.uid(), title: EVENT[title] || title, date, chars, chapterId: ids[title], color: COLOURS[key] || '#6b6b6b', note: synopsis });
    }
    events.push({ id: U.uid(), title: 'The Demeter sails from Varna', date: '1893-07-06', chars: [], color: COLOURS.Ship, note: 'From the captain’s log, not written yet.' });
    t.timeline = { mode: 'dates', lanes: 'single', events, zoom: 70, filter: '' };
    const firstName = ans.structure === 'chapters' ? '“Jonathan Harker’s Journal”' : '“3 May, Bistritz”';
    const byKind = k => t.binder.find(n => n.kind === k);
    byKind('manuscript').children = ms;
    byKind('characters').children = CHARS.map(([n, h]) => doc(n, h));
    byKind('places').children = PLACES.map(([n, h]) => doc(n, h));
    const start = doc('Start here', START_HERE(firstName), { icon: '👋' });
    byKind('notes').children = [start];
    byKind('notes').open = true;
    t.lastDoc = start.id;
    t.goals = { daily: +ans.goal || 0, total: 160000, deadline: '' };
    const slug = await api.createProject('Dracula (example)', t);
    for (const [id, html] of Object.entries(docs)) await api.saveDoc(slug, id, html);
    await U.openProject(slug, { skipCheck: true });
  }

  // ================================================================== THE TOUR
  // A spotlight that walks round the main buttons. Steps whose button isn't on screen are skipped.
  const MAIN_TOUR = [
    ['#binder-tree', 'The Binder', 'Your whole book: the Manuscript (what gets exported), plus Characters, Places, Notes and Research. Drag to reorder; right-click anything for more.',
      { scrivener: 'Same idea as Scrivener’s Binder. Only the Manuscript is exported, like “Include in compile”.', docs: 'Instead of one long document, each chapter gets its own page here.', word: 'Like Word’s Navigation pane, but each chapter is its own page.', obsidian: 'Like your vault’s file list, but in reading order, and only the Manuscript is exported.' },
      'In the example, every diary entry and letter in Dracula is its own scene.'],
    ['#editor', 'The page', 'Just write. Unwip saves every few seconds, keeps backups, and cleans up anything you paste in.',
      { docs: 'Pasting from Google Docs keeps italics and bold but drops the clutter.', word: 'Pasting from Word keeps italics and bold but drops the clutter.', obsidian: 'No Markdown symbols here: Ctrl+I and Ctrl+B (or the buttons above) give italics and bold you can see, and they export cleanly.' }],
    ['#mode-switch', 'Focus, Detail or Lore', 'Focus is a clean page. Detail adds the corkboard, outline, status labels, moodboard, timeline and Build. Lore adds Character sheets and Open World under the views on the left.',
      { scrivener: 'Detail is where the Corkboard, Outliner and labels live.' },
      'Try the Timeline in Detail: each of Dracula’s dated entries sits on its day.'],
    ['#btn-writer', 'Writer mode', 'Full screen, nothing but the page. Typewriter scrolling keeps your line in the middle.',
      { hemingway: 'This is the distraction-free mode. Settings › Typewriter adds focus dimming and sounds.', scrivener: 'Like Composition mode.' }],
    ['#btn-new', 'New', 'Add a scene, chapter, folder or map, or a template section like Factions, Magic or Monsters where every entry starts from the same sheet.'],
    ['#btn-cmdk', 'Go to or do', 'Press Ctrl+K (or this button) and type what you want: “snapshot”, “epub”, “timeline”, a chapter or a character. Every feature is in there, at every level. To find words in your book, use the magnifying glass at the bottom left.'],
    ['#btn-stuck', 'Spark and Sprints', 'Spark has six small tools for a blank page or a slow day. Sprint, next to it, is a timed burst of writing with a word target.'],
    ['#btn-build-book', 'Build', 'Maps, magic systems, rune alphabets, sigils, coats of arms, insignia and LitRPG stat systems, open beside your chapter. Anything you make can go straight into the book.',
      null, 'Try a map: paint the land yourself, or roll a random world, town or dungeon floor to start from.'],
    ['#btn-revise', 'Revise', 'Highlights repeated words, adverbs, long sentences and filler for you to look at, without AI. It never changes anything by itself.',
      { hemingway: 'This is the readability checker, without any AI.' }],
    ['#btn-listen', 'Read aloud', 'Hear the chapter read out from where your cursor is. Clunky sentences are easier to hear than to see. F8 starts and stops it.'],
    ['#btn-snap', 'Snapshots', 'Save a copy of a chapter before a big rewrite, and compare or go back later.',
      { scrivener: 'Same as Scrivener’s Snapshots.', docs: 'Like Version history, but you choose the moments.' }],
    ['#btn-export-more', 'Export', 'Every way to get your book out: Copy for Docs (Ctrl+Shift+C) and Copy for Royal Road, page previews, a print-ready PDF, an e-book, Word, a file per chapter, and No hard feelings for moving to another app.'],
    ['#st-proof', 'Record', 'Proof of writing. Turn on Replay and Unwip notes how the words went in, so you can play your writing back or share a report showing it’s your own work. It stays on your device.'],
    ['#btn-help', 'Help', 'What every button does, and all the keyboard shortcuts. Press F1 any time.'],
    ['#btn-settings', 'Settings', 'Themes (from plain paper to Witch, Infernal and game-system looks), fonts, typing sounds, LitRPG tools, syncing, backups and updates. Help in here runs this tour again.'],
    ['#btn-library', 'All your books', 'Back to the main screen. That’s where the tour goes next.'],
    // on the main screen (the tour takes you there, and back again if you go Back)
    ['#lib-tabs [data-tab="write"]|#project-grid', 'Your books', 'Every book, today’s words and your goal. Import… brings in a Scrivener project, a Word file or a folder of chapters.', null, null, { lib: 'write' }],
    ['#lib-mode', 'Levels', 'Focus is just your books. Detail unlocks Play and Build here, and planning tools inside a book. Lore adds character sheets and the Open World tab. Switching never changes your books.', null, null, { lib: 'write' }],
    ['#lib-tabs [data-tab="play"]', 'Play', 'Warm-ups, story dice, a style mimic, and exercises with rules Unwip checks as you write (no adverbs, only dialogue…). Nothing here touches your books.', null, null, { lib: 'play' }],
    ['#lib-tabs [data-tab="build"]', 'Build', 'Everything you build lives here, for all your books: maps, coats of arms and stat systems. Link any of them into any book.', null, null, { lib: 'build' }],
    ['#lib-tabs [data-tab="world"]', 'Open World', 'The deep end, at the Lore level: the Story Bible for each series or book (everyone and everything in it, where they turn up, facts, threads and a glossary), and magic systems, rune alphabets, sigils and insignia.', null, null, { lib: 'world' }],
    ['#library .dbx-pill', 'Sync', 'Connect Dropbox to have the same books on your PC, Mac, iPhone and iPad. Changes go both ways, and nothing is saved over: if two devices change the same chapter, both versions are kept.', null, null, { lib: 'write' }]
  ];
  // After an import (beta, 20 Oct): a short look round the parts made from it. Same spotlight as the main tour; each
  // stop can do something first (open a character so Appears in is there to point at). Shown once.
  const firstIn = kind => { const r = S.project && S.project.binder.find(x => x.kind === kind); let id = null; if (r) U.walkTree(r.children || [], n => { if (!id && n.type === 'doc' && !n.map) id = n.id; }); return id; };
  const toList = async () => { if (window.UnwipMobile && document.body.classList.contains('phone') || matchMedia('(max-width: 640px)').matches) { try { window.UnwipMobile.showBinder(); } catch {} } await new Promise(r => setTimeout(r, 200)); };
  const IMPORT_TOUR = [
    ['.tree-row[data-id="root-characters"]', 'Your characters live here', 'Each person you made a page for is in Characters. Open one to see their sheet.', null, null, { before: toList, need: () => firstIn('characters') }],
    ['#sheet-links .sl-app|#sheet-links', 'Where they turn up', 'Appears in lists every chapter that mentions them, by name, first name, surname or an alias. Click one to jump there, then ← Back to come back.', null, null,
      { before: async () => { const id = firstIn('characters'); if (id && S.docId !== id) await U.openDoc(id, { from: 'list', focus: false }); if (window.UnwipMobile && matchMedia('(max-width: 640px)').matches) { try { window.UnwipMobile.showPage(); } catch {} } await new Promise(r => setTimeout(r, 700)); }, need: () => firstIn('characters') }],
    ['.tree-row[data-id="root-places"]|.tree-row[data-id="root-items"]', 'Places and items work the same', 'Make a page in Places or Items and Unwip finds every chapter they’re in.', null, null, { before: toList }],
    ['.tree-row[data-id="root-notes"]', 'The rest of what came in', 'Anything not sorted is in Notes. Carry on sorting any time from Import / Export on the main screen.', null, null, { before: toList }]
  ];
  let TOUR = MAIN_TOUR, tourEnd = 'That’s the tour. Happy writing!';
  async function importTour() {
    if (!S.slug || (S.settings && S.settings.importTourSeen)) return false;
    S.settings = await api.setSettings({ importTourSeen: Date.now() });
    tour(IMPORT_TOUR); return true;
  }
  let tEls = null;
  // really on screen: has a size, isn't hidden, and isn't tucked under something else (e.g. a squeezed toolbar)
  function visible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0) || getComputedStyle(el).visibility === 'hidden') return false;
    const x = Math.min(innerWidth - 1, Math.max(0, r.left + Math.min(r.width / 2, 12))), y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
    if (x < 0 || y < 0 || r.left >= innerWidth || r.top >= innerHeight) return false;
    const hit = document.elementsFromPoint(x, y).find(h => !h.closest('.tour-card, .tour-spot'));
    return !!hit && (el === hit || el.contains(hit) || hit.contains(el));
  }
  // a step can name several places; the first one actually showing is used
  const target = sel => sel.split('|').map(x => $(x)).find(visible) || null;
  // The tour walks round a real book. With none open, it uses the example (Dracula), and if that was deleted it's
  // made again from the copy inside Unwip, laid out the way the welcome setup chose.
  const EXAMPLE = /^Dracula \(example\)/;
  async function tourExample() {
    let list = []; try { list = await api.listProjects(); } catch {}
    const ex = list.find(p => EXAMPLE.test(p.title || ''));
    if (ex) await U.openProject(ex.slug, { skipCheck: true });
    else {
      const st = S.settings || {};
      ans = { from: st.from || 'new', layout: st.layout || 'page', structure: st.structure || 'scenes', goal: st.dailyGoal || 0 };
      await makeExample();
    }
    setTimeout(tour, 500);
  }
  function tour(steps) {
    if (!S.slug) { tourExample(); return; }
    if (document.body.classList.contains('writer')) U.setWriter(false);
    endTour();
    if (steps === IMPORT_TOUR) { TOUR = IMPORT_TOUR; tourEnd = 'That’s it. Happy writing!'; }
    tEls = { shade: document.createElement('div'), card: document.createElement('div') };
    tEls.shade.className = 'tour-spot'; tEls.card.className = 'tour-card';
    document.body.append(tEls.shade, tEls.card);
    curIdx = -1; tourSlug = S.slug; bookShown = TOUR === IMPORT_TOUR ? TOUR.filter(x => !(x[5] && x[5].need) || x[5].need()) : TOUR.filter(x => !isLib(x) && target(x[0])); showStep(1);
    // the person left the screen the tour is on (opened another book, went home): the tour ends
    clearInterval(tourWatch); tourWatch = setInterval(() => {
      if (moving || curIdx < 0) return;
      const lib = document.getElementById('library'), onLib = !!lib && !lib.classList.contains('hidden');
      if (isLib(TOUR[curIdx]) ? !onLib : (!S.slug || onLib)) { endTour(); curIdx = -1; }
    }, 300);
    document.addEventListener('keydown', tourKey, true);
    window.addEventListener('resize', placeStep);
  }
  function tourKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endTour(); }
    else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); showStep(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); showStep(-1); }
  }
  let tourWatch = null, writerAfterTour = false, tourSlug = null, bookShown = [], moving = false;
  const isLib = st => !!(st && st[5] && st[5].lib);
  // between the book and the main screen: go there, or back to the book the tour started in
  async function moveTo(lib) {
    if (lib) { await U.leaveProject(); await U.showLibrary(); }
    else if (tourSlug) await U.openProject(tourSlug, { skipCheck: true });
    await new Promise(r => setTimeout(r, 450));
  }
  function endTour() {
    clearInterval(tourWatch);
    TOUR = MAIN_TOUR; tourEnd = 'That’s the tour. Happy writing!';
    if (!tEls) return;
    // picked Distraction-free in the setup, then took the tour: go into Writer mode once the tour is over
    if (writerAfterTour) { writerAfterTour = false; if (S.slug) setTimeout(() => { U.setWriter(true); U.toast('This is Writer mode, the layout you picked: just the page. Press Esc or F11 to see everything else.', '', 7000); }, 300); }
    tEls.shade.remove(); tEls.card.remove(); tEls = null;
    document.removeEventListener('keydown', tourKey, true);
    window.removeEventListener('resize', placeStep);
  }
  let curIdx = -1;
  async function showStep(dir) {
    if (moving || !tEls) return;
    moving = true;   // the tour's own screen changes mustn't count as the person leaving
    try { await stepTo(dir); } finally { moving = false; }
  }
  async function stepTo(dir) {
    let i = curIdx < 0 ? 0 : curIdx + dir;
    const here = () => { const lib = document.getElementById('library'); return !!lib && !lib.classList.contains('hidden'); };
    for (;;) {
      if (i < 0) return;
      if (i >= TOUR.length) { const bye = tourEnd; endTour(); curIdx = -1; U.toast(bye); return; }
      const st = TOUR[i];
      if (st[5] && st[5].need && !st[5].need()) { i += dir || 1; continue; }
      if (st[5] && st[5].before) { if (tEls) { tEls.card.style.visibility = 'hidden'; tEls.shade.style.visibility = 'hidden'; } await st[5].before(); if (!tEls) return; tEls.card.style.visibility = ''; tEls.shade.style.visibility = ''; }
      if (isLib(st) !== here()) {   // this step is on the other screen: go there first
        if (tEls) { tEls.card.style.visibility = 'hidden'; tEls.shade.style.visibility = 'hidden'; }
        await moveTo(isLib(st));
        if (!tEls) return;
        tEls.card.style.visibility = ''; tEls.shade.style.visibility = '';
      }
      // the import tour points at binder rows that can be scrolled out of sight: bring them into view first
      if (TOUR === IMPORT_TOUR) { const q = st[0].split('|').map(x => document.querySelector(x)).find(Boolean); if (q) { q.scrollIntoView({ block: 'nearest' }); await new Promise(r => setTimeout(r, 150)); } }
      if (isLib(st)) { if (window.UnwipPlay) window.UnwipPlay.setTab(st[5].lib); await new Promise(r => setTimeout(r, 120)); }
      if (target(st[0])) break;
      i += dir || 1;
    }
    curIdx = i;
    const [sel, title, text, alt, inExample] = TOUR[i];
    const isEx = /\(example\)$/.test((S.project && S.project.title) || '') || (isLib(TOUR[i]) && tourSlug);
    const extra = (inExample && isEx) ? inExample : alt && alt[S.settings.from];
    const shown = TOUR === IMPORT_TOUR ? bookShown : bookShown.concat(TOUR.filter(x => isLib(x) && x[0].split('|').some(q => document.querySelector(q))));   // a step can name several places to point at, split by |
    const n = Math.max(1, shown.indexOf(TOUR[i]) + 1);
    tEls.card.innerHTML = `<div class="tour-n">${n} of ${shown.length}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${extra ? `<p class="tour-alt">${esc(extra)}</p>` : ''}
      <div class="tour-foot"><button class="btn ghost small" data-t="end">End tour</button><span></span>${n > 1 ? '<button class="btn small" data-t="back">Back</button>' : ''}<button class="btn primary small" data-t="next">${n === shown.length ? 'Finish' : 'Next'}</button></div>`;
    tEls.card.onclick = e => { const b = e.target.closest('[data-t]'); if (!b) return; if (b.dataset.t === 'end') { endTour(); curIdx = -1; } else showStep(b.dataset.t === 'next' ? 1 : -1); };
    placeStep();
  }
  function placeStep() {
    if (!tEls || curIdx < 0) return;
    const el = target(TOUR[curIdx][0]); if (!el) return; const r = el.getBoundingClientRect();
    const pad = 6, W = innerWidth, H = innerHeight;
    // big targets (the page, the binder) get a spotlight trimmed to the screen
    const box = { l: Math.max(4, r.left - pad), t: Math.max(4, r.top - pad), r: Math.min(W - 4, r.right + pad), b: Math.min(H - 4, r.bottom + pad) };
    Object.assign(tEls.shade.style, { left: box.l + 'px', top: box.t + 'px', width: (box.r - box.l) + 'px', height: (box.b - box.t) + 'px' });
    const c = tEls.card, cw = c.offsetWidth, ch = c.offsetHeight;
    let x, y;
    if (box.b + ch + 14 < H) { y = box.b + 12; x = box.l + (box.r - box.l) / 2 - cw / 2; }          // below
    else if (box.t - ch - 14 > 0) { y = box.t - ch - 12; x = box.l + (box.r - box.l) / 2 - cw / 2; } // above
    else if (box.r + cw + 14 < W) { x = box.r + 12; y = box.t + 20; }                                   // right
    else { x = box.l + (box.r - box.l) / 2 - cw / 2; y = box.t + (box.b - box.t) / 2 - ch / 2; }       // inside (big area)
    c.style.left = Math.max(10, Math.min(W - cw - 10, x)) + 'px';
    c.style.top = Math.max(10, Math.min(H - ch - 10, y)) + 'px';
  }

  // ================================================================== ON THE MAIN SCREEN
  // "Let's get you settled in" until the welcome setup has been done once, then "Take a tour".
  function settleButton() {
    const right = document.querySelector('#library .lib-head-right'); if (!right) return;
    let b = document.getElementById('btn-settle');
    if (!b) { b = document.createElement('button'); b.id = 'btn-settle'; b.type = 'button'; right.insertBefore(b, right.firstChild); }
    const settled = !!(S.settings && S.settings.settledIn);
    b.className = 'btn ' + (settled ? 'settle-tour' : 'primary settle-new');
    b.textContent = settled ? 'Take a tour' : 'Set up Unwip';
    b.title = settled ? 'A quick walk round the buttons, in the example book' : 'Tell Unwip what you wrote with before, and bring your book in';
    b.onclick = () => settled ? tourExample() : start();
  }
  settleButton();
  setTimeout(settleButton, 1500);   // once the settings have loaded

  // the example book on its own (for screenshots and tests): scenes in chapters, laid out for a Scrivener user
  const example = async (o = {}) => { ans = { from: 'scrivener', layout: 'desk', structure: 'scenes', goal: 1000, ...o }; await makeExample(); };
  return { start, tour, tourExample, endTour, example, settleButton, importTour };
})();
