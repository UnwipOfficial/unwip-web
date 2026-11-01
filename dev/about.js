// Unwip - About, "Report a problem", and the no-AI note on the main screen.
// The report holds the version, the device, recent errors and sync status: never any of your writing.
window.UnwipAbout = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return;
  const { S, api, esc } = U;
  const SUPPORT = window.UNWIP_SUPPORT || '';
  // Unwip Dev (the test copy) says so everywhere, so it's never mistaken for the real thing
  (async () => {
    let dev = !!window.UNWIP_DEV;
    if (!dev && api && !api.web) try { dev = (await api.updateState()).flavor === 'dev'; } catch {}
    if (!dev) return;
    document.documentElement.classList.add('flavor-dev');
    const b = document.querySelector('.lib-head .brand'); if (b && !b.querySelector('.dev-tag')) b.insertAdjacentHTML('beforeend', '<span class="dev-tag" title="This is Unwip Dev, the test copy. It has its own books, separate from the normal Unwip.">DEV</span>');
    const fix = () => { if (!/^\[DEV\]/.test(document.title)) document.title = '[DEV] ' + document.title; };
    fix(); new MutationObserver(fix).observe(document.querySelector('title'), { childList: true });
  })();           // where "Email it" goes (set when the app is built)

  // ---------------------------------------------------------------- remember recent errors (in memory and on this device)
  const LOG_KEY = 'unwip-errlog';
  let log = []; try { log = JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch {}
  function note(kind, msg) {
    msg = scrub(String(msg || '')).replace(/\s+/g, ' ').slice(0, 300);
    if (!msg || /ResizeObserver loop/.test(msg)) return;
    const last = log[log.length - 1]; if (last && last.m === msg) { last.n = (last.n || 1) + 1; last.t = Date.now(); }
    else log.push({ t: Date.now(), k: kind, m: msg });
    log = log.slice(-30); try { localStorage.setItem(LOG_KEY, JSON.stringify(log)); } catch {}
  }
  addEventListener('error', e => note('error', `${e.message} (${String(e.filename || '').split('/').pop()}:${e.lineno})`));
  addEventListener('unhandledrejection', e => note('promise', e.reason && (e.reason.stack || e.reason.message) || e.reason));
  const warn0 = console.warn.bind(console), err0 = console.error.bind(console);
  // only words and error messages are noted, never whole objects (one could hold settings or a sign-in)
  const said = x => x && x.message ? x.message : typeof x === 'string' ? x : typeof x === 'number' || typeof x === 'boolean' ? String(x) : `[${x === null ? 'null' : typeof x}]`;
  console.warn = (...a) => { try { note('warn', a.map(said).join(' ')); } catch {} warn0(...a); };
  console.error = (...a) => { try { note('error', a.map(said).join(' ')); } catch {} err0(...a); };

  async function version() {
    if (window.UNWIP_VERSION) return window.UNWIP_VERSION;
    try { const s = await api.updateState(); return s.current || '?'; } catch { return '?'; }
  }
  const device = () => {
    const ua = navigator.userAgent;
    const web = !!(api && api.web);
    const kind = /iPhone/.test(ua) ? 'iPhone' : /iPad|Macintosh.*Mobile|Macintosh.*Safari.*Version/.test(ua) && 'ontouchend' in document ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'Other';
    const os = (/OS (\d+[_\d]*)/.exec(ua) || /Windows NT ([\d.]+)/.exec(ua) || [])[1] || '';
    return `${kind}${os ? ' ' + os.replace(/_/g, '.') : ''}, ${web ? (navigator.standalone || matchMedia('(display-mode: standalone)').matches ? 'Home Screen app' : 'browser') : 'PC app'}, ${innerWidth}×${innerHeight}`;
  };

  // Anything that could say who you are or what you write is taken out before it's kept or sent: file paths (they
  // name you, your computer and your books; only Unwip's own file names like project.json are kept), email addresses,
  // and the bit of text a "not valid JSON" error quotes. Runs when an error is noted and again on the finished report.
  const SAFE_NAME = /^(?:project\.json|[\w-]{6,}\.(?:html|json)|[\w.-]+\.js(?::\d+){0,2}|app\.asar)$/;
  const URLP = /file:\/\/\/?[^\s'"()]+/g;
  const PATH = /(?:[A-Za-z]:[\\/]|\\\\|\/\/[^\s/]+\/|~[\\/]|\/(?:Users|home|private|var|tmp|Volumes|mnt|media|run|storage|sdcard|data|opt|root|srv|Library)\/)[^\n]*?(?=['"](?:[\s,;:)\]}]|$)|\s+->|$)/gm;
  const keepName = p => { const last = p.replace(/[\\/]+$/, '').split(/[\\/]/).pop(); return '…' + (SAFE_NAME.test(last) ? (p.includes('\\') ? '\\' : '/') + last : ''); };
  // Dropbox paths start at the Dropbox folder (/Apps/Unwip/The Book/…), so they don't match the computer paths above
  const DBXP = /(?:^|(?<=[\s'"(:]))\/(?:Apps|Unwip)\/[^\n]*?(?=['"](?:[\s,;:)\]}]|$)|\s+->|$)/gm;
  function scrub(t) {
    t = String(t == null ? '' : t);
    t = t.replace(URLP, keepName);
    t = t.replace(DBXP, keepName);
    t = t.replace(/(?:%[0-9A-Fa-f]{2})+/g, m => { try { return decodeURIComponent(m); } catch { return m; } });
    t = t.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]');
    t = t.replace(/"[^"]{0,60}"\.\.\.(?= is not valid JSON)/g, '"…"').replace(/(Unexpected token '?.'?, )"[^"]*"/g, '$1"…"');
    return t.replace(PATH, keepName);
  }
  // and the names of your books, chapters and sheets (and the short names their folders use), wherever an error
  // happened to mention one
  function namesOf(projects) {
    const out = new Set();
    for (const p of projects) { if (p.title) out.add(p.title); if (p.slug) out.add(p.slug); }
    if (S.project) { if (S.project.title) out.add(S.project.title); if (S.slug) out.add(S.slug); U.walkTree(S.project.binder || [], n => { if (n.title) out.add(n.title); }); }
    return [...out].map(x => String(x).trim()).filter(x => x.length >= 3 && !/^(chapter|scene|notes?|draft|manuscript|characters|places|items|research|untitled|new)\s*\d*$/i.test(x)).sort((a, b) => b.length - a.length);
  }
  function hideNames(t, names) {
    for (const n of names) { const re = new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'); t = t.replace(re, '[name]'); }
    return t;
  }
  async function reportText(what) {
    let projects = [];
    try { projects = await api.listProjects(); } catch {}
    const names = namesOf(projects), hidePaths = m => hideNames(scrub(m), names);
    const D = window.UnwipDropbox;
    const lines = [
      `Unwip ${await version()}`,
      `Device: ${device()}`,
      `When: ${new Date().toString().replace(/ GMT.*/, '')}`,
      `Projects: ${projects.length} (${projects.reduce((a, p) => a + (p.words || 0), 0).toLocaleString()} words in total)`,
      S.project ? `Open: a project with ${(S.project.binder || []).reduce((a, r) => a + (r.children || []).length, 0)} top-level items, ${S.mode || ''} mode, view ${S.view || 'write'}` : 'Open: main screen',
      D ? `Dropbox: ${D.connected() ? 'connected' : 'not connected'}${D.lastError ? ` · last problem: ${hidePaths(D.lastError)}` : ''}` : '',
      '',
      'What happened:',
      what || '(not filled in)',
      '',
      `Recent errors (${log.length}):`,
      ...(log.length ? log.slice(-15).map(e => `${new Date(e.t).toLocaleString()} [${e.k}] ${hidePaths(e.m)}${e.n > 1 ? ` ×${e.n}` : ''}`) : ['none'])
    ];
    return lines.filter(x => x !== '').join('\n').replace(/\nWhat happened:/, '\n\nWhat happened:').replace(/\nRecent errors/, '\n\nRecent errors');
  }

  async function report(prefill) {
    const body = document.createElement('div'); body.className = 'rep';
    body.innerHTML = `<p>Something not working, or confusing? Say what you were doing and what went wrong. Unwip adds the details that help fix it: the version, your device and any recent errors. <b>None of your writing is included.</b></p>
      <div class="field"><label>What happened?</label><textarea id="rep-what" rows="4" placeholder="e.g. I pressed Copy for Docs in chapter 3 and nothing was copied"></textarea></div>
      <details class="rep-details"><summary>See exactly what will be sent</summary><pre id="rep-pre"></pre></details>`;
    const pre = body.querySelector('#rep-pre'), what = body.querySelector('#rep-what');
    if (typeof prefill === 'string') what.value = prefill;   // (a click handler can pass in the click itself)
    const refresh = async () => { pre.textContent = await reportText(what.value.trim()); };
    what.addEventListener('input', () => { clearTimeout(what._t); what._t = setTimeout(refresh, 300); });
    await refresh();
    const v = await U.modal({ title: 'Report a problem', body, wide: true, onOpen: () => setTimeout(() => what.focus(), 50),
      buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Copy report', kind: 'ghost', onClick: () => U.copyText(pre.textContent).then(ok => U.toast(ok ? 'Report copied. Paste it into an email or message.' : 'Couldn’t copy. Select the text under “See exactly what will be sent” and copy it.', ok ? '' : 'warn')) }, { label: 'Email it…', value: 'mail', kind: 'primary' }] });
    if (!v) return;
    const text = await reportText(what.value.trim());
    // (Copy report copies straight from its button, inside the click, and leaves this window open)
    const subj = `Unwip problem: ${(what.value.trim().split('\n')[0] || 'report').slice(0, 60)}`;
    // which email to send it with: Gmail or Outlook in the browser, or the email app on this device. Remembered.
    let via = ''; try { via = localStorage.getItem('unwip-report-via') || ''; } catch {}
    const pick = document.createElement('div');
    pick.innerHTML = `<p>Send it with:</p><div class="rep-via">
      <button class="btn" type="button" data-via="gmail"><b>Gmail</b><span>opens in your browser</span></button>
      <button class="btn" type="button" data-via="outlook"><b>Outlook.com</b><span>Hotmail and Live too, in your browser</span></button>
      <button class="btn" type="button" data-via="app"><b>Email app</b><span>the one set up on this ${api.web ? 'device' : (api.platform === 'darwin' ? 'Mac' : 'PC')}</span></button></div>
      <p class="about-small">Or press Back and use Copy report to paste it anywhere you like.</p>`;
    pick.querySelectorAll('[data-via]').forEach(b => { if (b.dataset.via === via) b.classList.add('primary'); });
    let picked = null;
    await U.modal({ title: 'Email the report', body: pick, buttons: [{ label: 'Back', value: false, kind: 'ghost' }],
      onOpen: back => back.querySelectorAll('[data-via]').forEach(b => { b.onclick = () => { picked = b.dataset.via; back.querySelector('.m-foot button').click(); }; }) });
    via = picked;
    if (!via) return report(what.value);   // Back: the report again, with what they typed
    try { localStorage.setItem('unwip-report-via', via); } catch {}
    const to = SUPPORT, bodyText = text.slice(0, 1800), q = encodeURIComponent;
    const url = via === 'gmail' ? `https://mail.google.com/mail/?view=cm&fs=1&to=${q(to)}&su=${q(subj)}&body=${q(bodyText)}`
      : via === 'outlook' ? `https://outlook.live.com/mail/0/deeplink/compose?to=${q(to)}&subject=${q(subj)}&body=${q(bodyText)}`
      : `mailto:${q(to)}?subject=${q(subj)}&body=${q(bodyText)}`;
    if (via === 'app' && api.web) location.href = url; else window.open(url, '_blank');   // the PC hands links to your browser or email app
    if (text.length > 1800) { if (await U.copyText(text)) U.toast('The full report was also copied, in case the email cuts it short.'); }
  }

  // ---------------------------------------------------------------- About
  const NO_AI = 'Unwip doesn’t use AI. Nothing in it writes, rewrites, suggests or draws for you. Spelling and grammar checks follow fixed rules, Insights simply counts, name suggestions come from your own sheets, and random maps are rolled from fixed rules and random numbers, like dice. All of it runs on your own device.';
  async function about() {
    const v = await version();
    const body = document.createElement('div'); body.className = 'about';
    body.innerHTML = `
      <div class="about-head"><b>Unwip</b> <span>version ${esc(v)}</span></div>
      <p class="about-slogan">Write to finish.</p>
      <h4>From the developer</h4>
      <div class="about-note"><p>I built Unwip, with the help of AI coding tools, to fix the headaches I kept running into as a writer: formatting that fell apart on the way between programs, syncing I couldn’t trust, and work that one app wouldn’t open properly in another.</p>
        <p>At the same time, AI was being added to everything, including the places where we write. I wanted an app that gives you full control of your work and keeps it private.</p></div>
      <h4>No AI inside</h4><p>${NO_AI}</p>
      <p class="about-small">The one optional exception, and only if you choose it: the <b>natural voice</b> for Read aloud is a small speech model (machine learning) that you download separately. It only reads your words aloud, can’t write, change or suggest anything, and runs on your device. Unwip works fully without it.${window.UnwipVoice ? ' <button class="link-btn" type="button" id="ab-voice">About the natural voice…</button>' : ''}</p>
      <h4>Your writing stays yours</h4><p>Your books are saved on your device. If you connect Dropbox, they’re copied to <b>your own</b> Dropbox and nowhere else. Unwip has no account, no server of its own and no tracking. Reports you send with “Report a problem” contain no writing.</p>
      <h4>Your rights</h4><p>What you make with Unwip is yours, to use anywhere, including in work you sell. Remix Unwip’s built-in artwork into your own work as you like; just don’t sell or give away the built-in artwork on its own. The details are under Your rights.</p>
      <h4>Thank you</h4>
      <p>Unwip is built with free and open-source fonts and software, used under their licences: the fonts EB Garamond, Crimson Pro, Cinzel and Oswald, Larkspur (our cut of Lora) and Bookhaven (our cut of Libre Baskerville) and IBM Plex Mono, the Build symbols from game-icons.net, the WordNet dictionary, mp4-muxer (for replay videos)${api.web ? '' : ', the Harper grammar checker, and Electron and Chromium, which run the PC app'}. The full licence texts are under Open-source licences.</p>
      <h4>Trademarks</h4>
      <p class="about-small">Scrivener, Microsoft Word, Google Docs, Dropbox, OneDrive, Kindle, Apple Books, Kobo and other product names mentioned in Unwip belong to their owners. They’re named only to say what Unwip works with; Unwip isn’t made by, endorsed by or connected to any of them.</p>
      <div class="sy-moves"><button class="btn" type="button" id="ab-rights">Your rights…</button><button class="btn" type="button" id="ab-lic">Open-source licences…</button><button class="btn" type="button" id="ab-report">Report a problem…</button><button class="btn" type="button" id="ab-usage">What I’ve used…</button></div>`;
    { const vb = body.querySelector('#ab-voice'); if (vb) vb.onclick = () => { const x = body.closest('.modal-back'); const b = x && x.querySelector('.m-foot button'); if (b) b.click(); window.UnwipVoice.setup(); }; }
    body.querySelector('#ab-rights').onclick = () => { const x = body.closest('.modal-back'); const b = x && x.querySelector('.m-foot button'); if (b) b.click(); rights(); };
    body.querySelector('#ab-lic').onclick = () => { const x = body.closest('.modal-back'); const b = x && x.querySelector('.m-foot button'); if (b) b.click(); licenses(); };
    body.querySelector('#ab-usage').onclick = () => { const x = body.closest('.modal-back'); const b = x && x.querySelector('.m-foot button'); if (b) b.click(); window.UnwipUsage && window.UnwipUsage.open(); };
    body.querySelector('#ab-report').onclick = () => { const x = body.closest('.modal-back'); const b = x && x.querySelector('.m-foot button'); if (b) b.click(); report(); };
    await U.modal({ title: 'About Unwip', body, buttons: [{ label: 'Close', value: true, kind: 'primary' }] });
  }

  // ---------------------------------------------------------------- your rights (plain English; also on the website)
  const RIGHTS = [
    ['What you make is yours', 'Unwip claims no ownership of anything you write or make with it: your books, notes, maps, coats of arms, rune alphabets, sigils, insignia, magic systems, stat systems, character sheets and every file you export. Your work stays on your device, and in your own Dropbox if you connect it. Unwip has no account and never uploads it.'],
    ['Use it anywhere, including commercially', 'Use what you make in anything, including work you sell: books, covers, maps, games, art and merchandise. Unwip’s built-in shapes, symbols, fonts and styles can be part of it, changed and remixed however you like. You don’t need to credit Unwip.'],
    ['What you can’t do', 'Don’t sell, share or give away Unwip’s built-in artwork on its own, as itself: for example as a symbol or stamp pack, brushes, clip art, stock images or templates made of it with little or no change of your own, and don’t use it to build a competing asset pack or tool. Once it’s part of something you made, that’s up to you.'],
    ['Other people’s work inside Unwip', 'Some fonts, symbols, the word games’ dictionary and parts of the software were made by others and are used under their own licences (Open-source licences lists them all with their notices). Those licences come first, and some allow more than this page does. The animal and object symbols from game-icons.net are free to use, even commercially, but ask for a short credit when you publish a picture that uses them, for example on your book’s copyright page: “Symbols by Lorc and Delapouite, game-icons.net, CC BY 3.0”. Build shows the exact line for each picture.'],
    ['Check your own use', 'Coats of arms, sigils, runes, insignia and names you make with Unwip, including with its random buttons, can look like real arms, national or official emblems, trademarks or names by coincidence. Before you use one publicly, especially commercially, check it doesn’t copy someone else’s.'],
    ['Record (proof of writing)', 'Replay and screen videos show how words arrived on the page. They’re a record for you and your readers, not legal proof of authorship.'],
    ['No guarantee', 'Unwip is provided as it is. As far as the law where you live allows, Unwip doesn’t promise that its built-in artwork is free of anyone else’s rights, and isn’t responsible for how you use what you make. Nothing here takes away rights you have under your local consumer law (for example the Australian Consumer Law, or consumer law in the EU and UK).']
  ];
  async function rights() {
    const body = document.createElement('div'); body.className = 'about rights';
    body.innerHTML = RIGHTS.map(([h, t]) => `<h4>${esc(h)}</h4><p>${esc(t)}</p>`).join('') + '<div class="sy-moves"><button class="btn" type="button" id="rt-lic">Open-source licences…</button></div>';
    body.querySelector('#rt-lic').onclick = () => { const x = body.closest('.modal-back'); const b = x && x.querySelector('.m-foot button'); if (b) b.click(); licenses(); };
    await U.modal({ title: 'Your rights', body, buttons: [{ label: 'Close', value: true, kind: 'primary' }] });
  }

  // ---------------------------------------------------------------- open-source licences (the full texts)
  const FONTS = [
    ['EB Garamond', 'OFL-EBGaramond.txt'], ['Larkspur', 'OFL-larkspur.txt', 'A modified version of Lora, renamed because “Lora” is a Reserved Font Name.'],
    ['Bookhaven', 'OFL-bookhaven.txt', 'A modified version of Libre Baskerville, renamed because “Libre Baskerville” is a Reserved Font Name.'],
    ['Crimson Pro', 'OFL-crimsonpro.txt'], ['Cinzel', 'OFL-cinzel.txt'], ['Oswald', 'OFL-oswald.txt'],
    ['IBM Plex Mono', 'OFL-ibmplexmono.txt', 'The latin set only (from Fontsource), used for the system-style text in Build pictures.']
  ];
  async function readText(rel) {
    if (api.licenseText) return api.licenseText(rel);
    try { const r = await fetch(rel); return r.ok ? r.text() : null; } catch { return null; }
  }
  async function licenses() {
    const items = [];
    for (const [name, file, note] of FONTS) {
      const t = await readText('fonts/' + file); if (!t) continue;
      const copy = (t.split('\n').find(l => /^Copyright/i.test(l)) || '').trim();
      items.push({ name, kind: 'Font · SIL Open Font License 1.1', copy, note, text: t });
    }
    if (window.UnwipSymbolData) items.push({ name: 'Symbols in Build (game-icons.net)', kind: 'Animals and objects · Creative Commons Attribution 3.0',
      copy: 'By Lorc, Delapouite, Caro Asercion, Carl Olsen and Faithtoken, from game-icons.net.',
      note: 'The lions, crows, dragons and other animal and object symbols in coats of arms, sigils and insignia, drawn in the colours you pick. If you publish a picture that uses them, credit the artist, for example “Symbols by Lorc, game-icons.net, CC BY 3.0” (Build shows the exact line for each picture).',
      text: 'Icons from https://game-icons.net by Lorc, Delapouite, Caro Asercion, Carl Olsen and Faithtoken,\nlicensed under Creative Commons Attribution 3.0 Unported (CC BY 3.0):\nhttps://creativecommons.org/licenses/by/3.0/\n\nYou are free to share and adapt them for any purpose, even commercially,\nas long as you give appropriate credit, provide a link to the licence, and indicate if changes were made.' });
    const wn = await readText('vendor/WORDNET-LICENSE.txt');
    if (wn) items.push({ name: 'WordNet 3.0', kind: 'Word games in Play · WordNet licence', copy: 'WordNet 3.0 Copyright 2006 by Princeton University. All rights reserved.', note: 'The words, meanings and other words for each one in Play’s word games and thesaurus. Rude and offensive words, and names, were left out.', text: wn });
    const setup = await readText('vendor/SETUP-NOTICES.txt');
    if (setup && !api.web) items.push({ name: 'Libraries in the Windows setup program', kind: '0BSD, ISC and BSD 3-Clause', copy: 'winres (Thomas Combeléran), resize (Jan Schlicht) and the Go image libraries (The Go Authors).', text: setup });
    const mux = await readText('vendor/mp4-muxer/LICENSE');
    if (mux) items.push({ name: 'mp4-muxer 5.2.1', kind: 'Record › videos · MIT License', copy: (mux.split('\n').find(l => /^Copyright/i.test(l)) || '').trim(), note: 'Puts the frames of a replay video together into an MP4 file, so videos can be made faster than they play. Included unmodified.', text: mux });
    const harper = await readText('vendor/harper/LICENSE');
    if (harper) items.push({ name: 'Harper 2.10.0', kind: 'Grammar checker · Apache License 2.0', copy: 'By Automattic and the Harper contributors (github.com/Automattic/harper). Included unmodified.', note: 'Harper is built together with 252 smaller open-source libraries and the Rust standard library. Their notices are listed next.', text: harper });
    if (harper) items.push({ name: 'Libraries inside Harper', kind: 'MIT, Apache 2.0, Unicode, Zlib, MPL 2.0 and others', copy: 'The Rust libraries compiled into Harper, each with its version, licence, source and authors, followed by every licence text in full.', lazy: 'vendor/harper/THIRD-PARTY-NOTICES.txt' });
    if (window.UnwipVoice) items.push({ name: 'Natural voice (optional download)', kind: 'Not included in Unwip', note: window.UnwipVoice.SOURCES, text: 'Unwip doesn’t include or distribute the natural voice. If you choose to download it, it comes from its own public sources:\n\n• Kokoro-82M voice model, by hexgrad (Apache License 2.0): huggingface.co/hexgrad/Kokoro-82M, converted by onnx-community\n• kokoro-js 1.2.1, by Xenova (Apache License 2.0): github.com/hexgrad/kokoro\n• Transformers.js 3.5.1, by Hugging Face (Apache License 2.0): github.com/huggingface/transformers.js\n• ONNX Runtime Web, by Microsoft (MIT License): github.com/microsoft/onnxruntime\n• phonemizer.js (Apache License 2.0) with eSpeak NG (GNU GPL 3.0 or later): github.com/espeak-ng/espeak-ng, where its source code is available\n\nTheir licences apply to those files.' });
    if (api.engineLicenses) {
      const e = await api.engineLicenses().catch(() => null);
      if (e && e.license) items.push({ name: `Electron ${e.electron}`, kind: 'Runs the PC app · MIT License', copy: (e.license.split('\n').find(l => /^Copyright/i.test(l)) || '').trim(), text: e.license, chromium: e.chromium, chrome: e.chrome });
    }
    const body = document.createElement('div'); body.className = 'lic';
    body.innerHTML = `<p>Unwip includes the open-source work below. Thank you to everyone who made it. Each licence lets Unwip include it, as long as these notices go along with it.</p>
      ${items.map((it, i) => `<details class="lic-item"><summary><b>${esc(it.name)}</b> <span>${esc(it.kind)}</span></summary>
        ${it.copy ? `<p class="lic-copy">${esc(it.copy)}</p>` : ''}${it.note ? `<p class="lic-note">${esc(it.note)}</p>` : ''}
        ${it.chromium !== undefined ? `<p class="lic-note">Electron includes Chromium ${esc(it.chrome || '')} and its components, each under its own open-source licence. ${it.chromium ? '<button class="link-btn" type="button" data-chromium>Open the Chromium licences</button>' : ''}</p>` : ''}
        <pre>${it.lazy ? 'Loading…' : esc(it.text)}</pre></details>`).join('')}
      <p class="about-small">Spell checking uses the spell checker built into ${api.web ? 'your browser' : 'Chromium'}.</p>`;
    // the long Harper list is only read when it's opened
    body.querySelectorAll('.lic-item').forEach((d, i) => { const it = items[i]; if (!it.lazy) return;
      d.addEventListener('toggle', async () => { if (!d.open || it.text) return; it.text = (await readText(it.lazy)) || 'Couldn’t read the notices file.'; d.querySelector('pre').textContent = it.text; }); });
    const cb = body.querySelector('[data-chromium]'); if (cb) cb.onclick = () => api.openChromiumLicenses();
    await U.modal({ title: 'Open-source licences', body, wide: true, buttons: [{ label: 'Close', value: true, kind: 'primary' }] });
  }

  // ---------------------------------------------------------------- the note on the main screen
  function footer() {
    const home = document.getElementById('write-home'); if (!home || home.querySelector('.lib-foot')) return;
    const f = document.createElement('footer'); f.className = 'lib-foot';
    f.innerHTML = `<div class="noai"><span class="noai-badge">No AI</span><span>Unwip doesn’t use AI to write, edit, suggest or draw, maps included. Checks, insights and random maps follow fixed rules on your device.</span></div>
      <div class="lib-links"><button class="link-btn" type="button" data-a="about">About Unwip</button><span>·</span><button class="link-btn" type="button" data-a="report">Report a problem</button></div>`;
    f.querySelector('[data-a="about"]').onclick = about;
    f.querySelector('[data-a="report"]').onclick = report;
    home.appendChild(f);
  }
  footer();

  // a library folder set up by a newer Unwip (on the PC; the phone checks this in Dropbox itself)
  async function layoutCheck() {
    if (!api.libraryLayout) return;
    try {
      const L = await api.libraryLayout();
      const bar = document.getElementById('layout-warn'); if (bar) bar.remove();
      if (L && L.layout > 2) {
        const b = document.createElement('div'); b.id = 'layout-warn'; b.className = 'sy-warn';
        b.innerHTML = `Your books were moved to a new folder layout by a newer version of Unwip on another device. <b>Update Unwip on this PC</b> (Settings › Check for updates) before writing here, so nothing gets out of step.`;
        const home = document.getElementById('write-home'); if (home) home.prepend(b);
      }
    } catch {}
  }
  U.on('library', layoutCheck); layoutCheck();

  return { about, report, licenses, rights, RIGHTS, note, log: () => log.slice() };
})();
