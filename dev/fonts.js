// Unwip - fonts: publishing favourites, installed fonts, imported font files, Google Docs check.
window.FolioFonts = (function () {
  // Fonts commonly used for manuscripts and book interiors.
  // (Lora and Libre Baskerville aren't here: Unwip has them as Larkspur and Bookhaven. If they're installed on this
  // computer they still show under "All installed fonts".)
  const FAVOURITES = [
    'Times New Roman', 'Garamond', 'EB Garamond', 'Georgia', 'Palatino Linotype', 'Book Antiqua',
    'Baskerville Old Face', 'Caslon', 'Adobe Caslon Pro', 'Minion Pro', 'Sabon',
    'Crimson Pro', 'Crimson Text', 'Merriweather', 'Literata', 'Cambria', 'Constantia',
    'Courier New', 'Courier Prime', 'Arial', 'Calibri', 'Segoe UI', 'Larkspur', 'Bookhaven', 'Cinzel', 'Oswald'
  ];
  // fonts that come with Unwip (SIL Open Font License). Larkspur and Bookhaven are our cuts of Lora and Libre Baskerville:
  // the licence reserves those names for the untouched originals, so modified copies must carry other names.
  const BUNDLED = ['EB Garamond', 'Larkspur', 'Bookhaven', 'Crimson Pro', 'Cinzel', 'Oswald'];
  const RENAMED = { 'lora': 'Larkspur', 'libre baskerville': 'Bookhaven' };                 // settings saved before the rename
  const ORIGINAL = { 'larkspur': 'Lora', 'bookhaven': 'Libre Baskerville',                  // what Word and Google Docs know them as
    // free look-alikes (same letter widths) of the standard fonts: files say the standard name, which every agent's computer has
    'tinos': 'Times New Roman', 'liberation serif': 'Times New Roman', 'times': 'Times New Roman',
    'cousine': 'Courier New', 'liberation mono': 'Courier New', 'courier': 'Courier New',
    'arimo': 'Arial', 'liberation sans': 'Arial', 'carlito': 'Calibri', 'caladea': 'Cambria',
    'palatino': 'Palatino Linotype' };   // the iPhone's name for it; Word on a PC knows it as Palatino Linotype
  const alias = f => (f && !installedHas(f) && RENAMED[String(f).toLowerCase()]) || f;
  const external = f => (f && ORIGINAL[String(f).toLowerCase()]) || f;
  const installedHas = f => !!(installed && installed.has && installed.has(f));
  // Always shown even if detection fails (these ship with Windows)
  const WINDOWS_CORE = ['Times New Roman', 'Georgia', 'Palatino Linotype', 'Book Antiqua', 'Cambria', 'Constantia', 'Courier New', 'Arial', 'Calibri', 'Segoe UI', 'Garamond'];

  // Fonts Google Docs has built in or can add from its "More fonts" list.
  const DOCS_FONTS = new Set([
    'Arial', 'Calibri', 'Cambria', 'Comic Sans MS', 'Courier New', 'Georgia', 'Impact', 'Times New Roman', 'Trebuchet MS', 'Verdana',
    'EB Garamond', 'Cormorant Garamond', 'Libre Baskerville', 'Baskervville', 'Lora', 'Merriweather', 'Crimson Text', 'Crimson Pro',
    'Literata', 'Spectral', 'Source Serif 4', 'Source Serif Pro', 'PT Serif', 'Noto Serif', 'Playfair Display', 'Alegreya', 'Cardo',
    'Old Standard TT', 'Domine', 'Vollkorn', 'Gentium Book Plus', 'Libre Caslon Text', 'Courier Prime', 'Roboto', 'Open Sans', 'Lato',
    'Montserrat', 'Raleway', 'Poppins', 'Inter', 'Nunito', 'Roboto Slab', 'Roboto Mono', 'Oswald', 'Cinzel', 'IM Fell English',
    'Amiri', 'Bitter', 'Arvo', 'Cormorant', 'Newsreader', 'Fraunces', 'Gelasio', 'Tinos', 'Arimo', 'Cousine', 'Caladea', 'Carlito'
  ]);
  // Closest font Google Docs has (all are Google Fonts that Docs can display)
  const DOCS_SUBSTITUTES = {
    'garamond': 'EB Garamond', 'sabon': 'EB Garamond', 'adobe garamond pro': 'EB Garamond',
    'palatino linotype': 'Gentium Book Plus', 'palatino': 'Gentium Book Plus', 'book antiqua': 'Gentium Book Plus',
    'baskerville old face': 'Libre Baskerville', 'baskerville': 'Libre Baskerville',
    'caslon': 'Libre Caslon Text', 'adobe caslon pro': 'Libre Caslon Text',
    'larkspur': 'Lora', 'bookhaven': 'Libre Baskerville',
    'minion pro': 'Crimson Pro', 'constantia': 'Lora', 'segoe ui': 'Open Sans', 'helvetica': 'Arial'
  };

  let installed = null;      // Set of family names on this PC
  let imported = [];         // [{family, file}]
  let loading = null;

  async function loadInstalled() {
    if (installed) return installed;
    if (loading) return loading;
    loading = (async () => {
      const set = new Set();
      try {
        if (window.queryLocalFonts) {
          const fonts = await window.queryLocalFonts();
          for (const f of fonts) set.add(f.family);
        }
      } catch (e) { /* permission or API not available */ }
      installed = set;
      return set;
    })();
    return loading;
  }

  function familyFromFile(file) {
    return file.replace(/\.(ttf|otf|woff2?)$/i, '')
      .replace(/[-_](Regular|Italic|Bold|BoldItalic|Medium|Light|SemiBold|Book|Roman|VariableFont.*|wght.*)$/i, '')
      .replace(/[-_]+/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .trim();
  }
  function styleFromFile(file) {
    const f = file.toLowerCase();
    return {
      weight: /bold|black|heavy/.test(f) ? '700' : '400',
      style: /italic|oblique/.test(f) ? 'italic' : 'normal'
    };
  }

  async function loadImported(list) {
    imported = [];
    for (const { file, data } of list || []) {
      const family = familyFromFile(file);
      const { weight, style } = styleFromFile(file);
      try {
        const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
        const face = new FontFace(family, bytes.buffer, { weight, style });
        await face.load();
        document.fonts.add(face);
        if (!imported.find(i => i.family === family)) imported.push({ family, file });
      } catch (e) { console.warn('Font failed to load', file, e); }
    }
    return imported;
  }

  // Quick check whether a font is usable on this PC (falls back to a measuring test)
  const canvas = document.createElement('canvas').getContext('2d');
  function measured(family) {
    const sample = 'mmmmmmmmmmlliWWQ@#0123456789';
    canvas.font = '40px monospace'; const a = canvas.measureText(sample).width;
    canvas.font = `40px '${family}', monospace`; const b = canvas.measureText(sample).width;
    canvas.font = '40px serif'; const c = canvas.measureText(sample).width;
    canvas.font = `40px '${family}', serif`; const d = canvas.measureText(sample).width;
    return a !== b || c !== d;
  }
  // Fonts that come with iPhones, iPads and Macs (only the ones this device really has are shown)
  const APPLE = ['American Typewriter', 'Athelas', 'Avenir', 'Avenir Next', 'Baskerville', 'Bodoni 72', 'Bodoni 72 Oldstyle', 'Bradley Hand',
    'Chalkboard SE', 'Chalkduster', 'Charter', 'Cochin', 'Copperplate', 'Courier New', 'Didot', 'Futura', 'Georgia', 'Gill Sans', 'Helvetica',
    'Helvetica Neue', 'Hoefler Text', 'Iowan Old Style', 'Marker Felt', 'Menlo', 'Noteworthy', 'Optima', 'Palatino', 'Papyrus', 'Rockwell',
    'Savoye LET', 'Seravek', 'Snell Roundhand', 'Superclarendon', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'Zapfino', 'Arial'];
  // the same font under its Windows and Apple names: the phone list shows the Apple one
  const SAME = { 'Palatino Linotype': 'Palatino', 'Book Antiqua': 'Palatino' };
  // fonts for this device's font list: Unwip's own, any you imported, then what the device has
  function deviceFonts() {
    const own = BUNDLED.slice(), imp = imported.map(i => i.family);
    const here = [...new Set([...FAVOURITES, ...APPLE])].filter(f => !own.includes(f) && !imp.includes(f) && !SAME[f] && (installedHas(f) || measured(f)));
    return { own, imp, here: here.sort((a, b) => a.localeCompare(b)) };
  }
  // Text set in Palatino on one device shows in Palatino on the other, even though Windows and Apple name it differently.
  (function aliases() {
    const pc = /Electron/.test(navigator.userAgent);
    const face = (fam, w, st, names) => `@font-face{font-family:'${fam}';font-weight:${w};font-style:${st};src:${names.map(n => `local('${n}')`).join(',')}}`;
    const css = pc
      ? (measured('Palatino') ? '' : [face('Palatino', 400, 'normal', ['Palatino Linotype', 'PalatinoLinotype-Roman', 'Book Antiqua']), face('Palatino', 700, 'normal', ['Palatino Linotype Bold', 'PalatinoLinotype-Bold', 'Book Antiqua Bold']),
         face('Palatino', 400, 'italic', ['Palatino Linotype Italic', 'PalatinoLinotype-Italic', 'Book Antiqua Italic']), face('Palatino', 700, 'italic', ['Palatino Linotype Bold Italic', 'PalatinoLinotype-BoldItalic', 'Book Antiqua Bold Italic'])].join(''))
      : ['Palatino Linotype', 'Book Antiqua'].filter(f => !measured(f)).map(f => [face(f, 400, 'normal', ['Palatino-Roman', 'Palatino']), face(f, 700, 'normal', ['Palatino-Bold', 'Palatino Bold']),
         face(f, 400, 'italic', ['Palatino-Italic', 'Palatino Italic']), face(f, 700, 'italic', ['Palatino-BoldItalic', 'Palatino Bold Italic'])].join('')).join('');
    if (css) { const st = document.createElement('style'); st.textContent = css; (document.head || document.documentElement).appendChild(st); }
  })();
  function isAvailable(family) {
    if (BUNDLED.includes(family)) return true;
    if (imported.some(i => i.family === family)) return true;
    if (installed && installed.size) return installed.has(family);
    return WINDOWS_CORE.includes(family) || measured(family);
  }

  // The nearest font Unwip has built in, as a backup for pasted words whose font this device may not have (owner,
  // 3 Nov: words copied from another app keep their own font's name, and where it isn't installed they show in the
  // closest match instead of the browser's default). Known families by name, then a guess from the name's words.
  // Returns [built-in font or null, generic family].
  const NEAR = [
    [/garamond|sabon|bembo|jenson|caslon|granjon|janson|minion|adobe text|goudy/, 'EB Garamond', 'serif'],
    [/trajan|cinzel|copperplate|perpetua titling/, 'Cinzel', 'serif'],
    [/courier|consolas|menlo|monaco|lucida console|source code|fira code|jetbrains|plex mono|typewriter|mono/, 'IBM Plex Mono', 'monospace'],
    [/baskerville|bookhaven|georgia|charter|cambria|constantia|hoefler|iowan|didot|bodoni|merriweather|athelas/, 'Bookhaven', 'serif'],
    [/palatino|book antiqua|\blora\b|larkspur|cochin|sylfaen|calisto|century schoolbook|bookman/, 'Larkspur', 'serif'],
    [/times|crimson|liberation serif|tinos|nimbus roman|cormorant|spectral|source serif|noto serif|pt serif/, 'Crimson Pro', 'serif'],
    [/oswald|impact|bebas|league gothic|franklin gothic|haettenschweiler|condensed|narrow/, 'Oswald', 'sans-serif'],
    [/arial|helvetica|calibri|segoe|verdana|tahoma|roboto|open sans|inter\b|avenir|futura|gill sans|trebuchet|lato|montserrat|sans|grotesk|gothic|aptos|seravek|optima/, null, 'sans-serif'],
    [/script|hand|brush|chancery|zapfino|snell|comic|marker|chalk|noteworthy|bradley/, null, 'cursive'],
  ];
  function nearest(family) {
    const f = String(family || '').toLowerCase();
    if (!f) return [null, 'serif'];
    for (const [re, own, generic] of NEAR) if (re.test(f)) return [own && own.toLowerCase() === f ? null : own, generic];
    return [null, 'serif'];
  }

  function docsCheck(families) {
    const problems = [];
    for (const f of new Set(families.filter(Boolean))) {
      if (!DOCS_FONTS.has(external(f))) problems.push({ font: f, suggestion: DOCS_SUBSTITUTES[f.toLowerCase()] || null });
    }
    return problems;
  }

  return {
    FAVOURITES, BUNDLED, alias, external, loadInstalled, loadImported, isAvailable, docsCheck, nearest,
    canShow: f => BUNDLED.includes(f) || imported.some(i => i.family === f) || installedHas(f) || measured(f),
    deviceFonts, SAME,
    get imported() { return imported; },
    get installed() { return installed; }
  };
})();
