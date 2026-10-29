// Unwip - the LitRPG ledger. Reads every [system message] in the manuscript, chapter by chapter, and keeps the books:
//   - Stats: every [Strength: 14], [HP: 40/50], [Level: 7] or "Level Up! … Level 8", followed through the chapters, with
//     a little graph each, and warnings when one goes backwards or jumps with no level-up or [+2 Strength] to explain it
//   - Skills, spells, items, titles, quests…: everything [Acquired / Obtained / Received / Earned], with the chapter it
//     first turns up in, and a note if it's mentioned in the story before then (often foreshadowing, sometimes a slip)
// Nothing is changed in the book; it only reads. Status blocks starting [Status: Name] or [Name: Ace] count for that
// character; stats anywhere else count for the main character.
window.UnwipLedger = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return null;
  const { $, $$, esc, fmt, S } = U;

  const KINDS = { skill: 'Skills', spell: 'Spells', ability: 'Abilities', perk: 'Perks', trait: 'Traits', item: 'Items', title: 'Titles', class: 'Classes', achievement: 'Achievements', quest: 'Quests' };
  const RESOURCE = /^(hp|mp|sp|health|mana|stamina|energy|xp|exp|experience|gold|coins?|credits?|hunger|thirst|durability)$/i;
  // stats that count even on their own line, outside a status block ([Strength: 14] in the middle of a scene). Any
  // other "[Label: number]" outside a status block is usually a message (a [New Balance: 1,680], a [Cost: 10]), so it
  // only counts as a stat in a block of three or more, or if a status block somewhere uses the same label.
  const KNOWN = /^(level|lvl|lv|hp|mp|sp|health|mana|stamina|energy|xp|exp|experience|strength|str|agility|agi|dexterity|dex|constitution|con|vitality|vit|endurance|end|intelligence|int|wisdom|wis|charisma|cha|luck|luk|perception|per|willpower|wil|spirit|spi|speed|spd|defen[cs]e|def|attack|atk|armou?r|magic|mag|resistance|res|free points|stat points|unspent points|skill points|attribute points)$/i;
  // [Status: Name]: the name must look like a name (Greg, Mina Harker, Ace of Spades), not a mood or a description
  // ("[Status: feeling victorious over older sister]" is a joke status, not a character)
  const NAMEISH = s => { const w = s.trim().split(/\s+/); return w.length <= 4 && /^\p{Lu}/u.test(w[0]) && w.every(x => /^\p{Lu}/u.test(x) || /^(of|the|de|da|di|von|van|du|le|la|al|bin|ibn|and)$/.test(x)); };
  const GET = /^(?:new\s+)?(skill|spell|ability|perk|trait|item|title|class|achievement|quest)\b([^:]*):\s*(.+)$/i;

  const chapters = () => { const out = [], r = U.findNode('root-manuscript'); if (r) U.walkTree(r.node.children || [], n => { if (n.type === 'doc') out.push(n); }); return out; };
  async function paras(ch) {
    const html = ch.id === S.docId ? U.editor.innerHTML : await U.api.loadDoc(S.slug, ch.id).catch(() => '');
    const div = document.createElement('div'); div.innerHTML = html || '';
    div.querySelectorAll('del.tc-del, sup.fn').forEach(x => x.remove());
    return [...div.querySelectorAll('p, h1, h2, h3, li, blockquote, div')].filter(el => !el.querySelector('p, div, li')).map(el => (el.textContent || '').replace(/ /g, ' '));
  }
  const keyOf = s => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const nice = s => s.trim().replace(/\s+/g, ' ');
  const num = s => +String(s).replace(/,/g, '');

  async function scan() {
    const chs = chapters(), events = [], stats = new Map(), got = new Map(), prose = [], later = [];
    const addLater = (_stats, ...a) => later.push(a);
    let order = 0, main = '';   // the main character: the first one named in a status block
    for (let ci = 0; ci < chs.length; ci++) {
      const ps = await paras(chs[ci]); let who = '', proseText = '', pending = [];
      // the end of a group of [messages]: loose numbers count if the group looks like a status block
      const flush = () => { const many = pending.length >= 3; for (const a of pending) (many || KNOWN.test(keyOf(a[1])) ? add : addLater)(stats, ...a); pending = []; };
      for (const t of ps) {
        const msgs = [...t.matchAll(/\[([^\[\]]{1,300})\]/g)].map(m => m[1].trim());
        if (!msgs.length) { flush(); who = ''; proseText += ' ' + t; continue; }
        const outside = t.replace(/\[[^\[\]]*\]/g, ' '); if (outside.trim().length > 20) proseText += ' ' + outside;
        for (const m of msgs) {
          order++;
          let g;
          if ((g = /^(?:status|character|name)\s*[:\-–—]\s*([^:\d][^:]{0,40})$/i.exec(m)) && !/\d/.test(g[1])) { if (NAMEISH(g[1])) { flush(); who = nice(g[1]); if (!main) main = who; } continue; }
          if (/^status$/i.test(m)) continue;
          if ((g = GET.exec(m))) {
            const kind = g[1].toLowerCase(), rest = g[2].toLowerCase(), name = nice(g[3].replace(/[.!]+$/, ''));
            if (!name || name.length > 60) continue;
            const k = kind + '|' + keyOf(name);
            if (!got.has(k)) got.set(k, { kind, name, ch: ci, text: m, done: null, who: who || main });   // who: for character sheets
            if (kind === 'quest' && /complet|finish|done/.test(rest + ' ' + m.toLowerCase())) got.get(k).done = ci;
            continue;
          }
          // level ups
          if ((g = /level\s*up\b.*?\blevel\s+(\d+)/i.exec(m)) || (g = /\b(?:reached|now|is now)\s+level\s+(\d+)/i.exec(m))) { events.push({ ci, order, kind: 'levelup', who }); add(stats, who || main, 'Level', num(g[1]), null, ci, order, m); continue; }
          if (/level\s*up/i.test(m)) { events.push({ ci, order, kind: 'levelup', who }); continue; }
          // +2 Strength / Strength +2 / Strength increased by 2
          for (const d of m.matchAll(/([+\-−]\s?\d+)\s+([A-Za-z][A-Za-z '’]{1,24})|([A-Za-z][A-Za-z '’]{1,24}?)\s*([+\-−]\s?\d+)(?![\d/])|([A-Za-z][A-Za-z '’]{1,24}?)\s+(?:increased|raised|went up)\s+by\s+(\d+)/g)) {
            const label = nice(d[2] || d[3] || d[5]); if (!label) continue;
            events.push({ ci, order, kind: 'delta', who: who || main, stat: keyOf(label) });
          }
          // Label: 14  /  HP: 40/50
          for (const s of m.matchAll(/([A-Za-z][A-Za-z '’\-]{0,24}?)\s*:\s*([+\-]?\d[\d,]*(?:\.\d+)?)(?:\s*\/\s*(\d[\d,]*))?(?![\d.])/g)) {
            const label = nice(s[1]); if (!label || /^(chapter|day|year|page|time|floor)$/i.test(label)) continue;
            if (who) add(stats, who, label, num(s[2]), s[3] != null ? num(s[3]) : null, ci, order, m);
            else pending.push([main, label, num(s[2]), s[3] != null ? num(s[3]) : null, ci, order, m]);
          }
        }
      }
      flush();
      prose.push(proseText);
    }
    // loose numbers whose label a real status block also uses ("Gold" in a block, then [Gold: 40] on its own) count too
    const blockLabels = new Set([...stats.values()].map(st => st.key));
    for (const a of later.sort((x, y) => x[5] - y[5])) if (blockLabels.has(keyOf(a[1]))) add(stats, ...a);
    if (later.length) for (const st of stats.values()) st.values.sort((x, y) => x.order - y.order);
    // what to check
    const flags = [];
    // a level-up explains a stat going up; only a [-2 Strength] style message explains one going down
    const explained = (who, stat, fromOrder, toOrder, down) => events.some(e => e.order > fromOrder && e.order <= toOrder && (!down && e.kind === 'levelup' && (!e.who || !who || e.who === who) || e.kind === 'delta' && e.stat === stat));
    for (const st of stats.values()) {
      const v = st.values; if (v.length < 2) continue;
      const res = RESOURCE.test(st.key);
      for (let i = 1; i < v.length; i++) {
        const a = v[i - 1], b = v[i];
        const A = res ? a.max : a.v, B = res ? b.max : b.v;
        if (A == null || B == null || A === B) continue;
        if (st.key === 'level') {
          if (B < A) flags.push({ type: 'down', st, a, b, msg: `${st.label}${st.who ? ` (${st.who})` : ''} went down from ${A} to ${B}` });
          else if (B - A > 1 && !events.some(e => e.kind === 'levelup' && e.order > a.order && e.order < b.order)) flags.push({ type: 'jump', st, a, b, msg: `${st.label}${st.who ? ` (${st.who})` : ''} went from ${A} to ${B} with no level-up message in between` });
          continue;
        }
        if (B < A) { if (!explained(st.who, st.key, a.order, b.order, true)) flags.push({ type: 'down', st, a, b, msg: `${res ? 'Max ' : ''}${st.label}${st.who ? ` (${st.who})` : ''} went down from ${A} to ${B}, with nothing in between to say why` }); }
        else if (!explained(st.who, st.key, a.order, b.order)) flags.push({ type: 'jump', st, a, b, msg: `${res ? 'Max ' : ''}${st.label}${st.who ? ` (${st.who})` : ''} went up from ${A} to ${B} with no level-up or [+${B - A} ${st.label}] in between` });
      }
    }
    // mentioned before it's acquired (whole words, 4 letters or more)
    for (const g of got.values()) {
      if (g.ch === 0 || g.name.length < 4 || g.kind === 'quest') continue;
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${g.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu');
      const early = prose.slice(0, g.ch).findIndex(t => re.test(t));
      if (early >= 0) { g.early = early; flags.push({ type: 'early', g, msg: `“${g.name}” is mentioned in ${chs[early].title || 'chapter ' + (early + 1)}, before it’s ${g.kind === 'item' ? 'obtained' : 'acquired'} in ${chs[g.ch].title || 'chapter ' + (g.ch + 1)}`, ci: early }); }
    }
    return { chs, stats: [...stats.values()].filter(s => s.values.length), got: [...got.values()], flags };
  }
  function add(stats, who, label, v, max, ci, order, text) {
    const k = (who || '') + '|' + keyOf(label);
    if (!stats.has(k)) stats.set(k, { who, label, key: keyOf(label), values: [] });
    const st = stats.get(k), last = st.values[st.values.length - 1];
    if (last && last.ci === ci && last.v === v && last.max === max) return;   // the same value again in the same chapter
    st.values.push({ ci, order, v, max, text });
  }

  // ---- going to a place in the book
  async function goTo(ci, text) {
    const chs = chapters(), ch = chs[ci]; if (!ch) return;
    $$('.modal-back').forEach(m => { const b = m.querySelector('.m-foot .btn'); if (b) b.click(); });
    U.setView && U.setView('write');
    await U.openDoc(ch.id); await new Promise(r => setTimeout(r, 80));
    if (!text) return;
    const tw = document.createTreeWalker(U.editor, NodeFilter.SHOW_TEXT); let n;
    while ((n = tw.nextNode())) { const i = n.nodeValue.indexOf(text); if (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + text.length); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); const rect = r.getBoundingClientRect(), w = U.editorWrap.getBoundingClientRect(); U.editorWrap.scrollTop += rect.top - w.top - w.height * 0.35; return; } }
  }

  // ---- the panel
  function spark(st, n) {
    const vals = st.values.map(x => (RESOURCE.test(st.key) && x.max != null ? x.max : x.v)); const lo = Math.min(...vals), hi = Math.max(...vals), W = 160, H = 34;
    const X = ci => n > 1 ? 4 + ci / (n - 1) * (W - 8) : W / 2, Y = v => hi === lo ? H / 2 : H - 4 - (v - lo) / (hi - lo) * (H - 8);
    const pts = st.values.map((x, i) => [X(x.ci), Y(vals[i])]);
    return `<svg class="lg-spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><polyline fill="none" stroke="currentColor" stroke-width="1.6" points="${pts.map(p => p.join(',')).join(' ')}"/>${pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="2.2" fill="currentColor"/>`).join('')}</svg>`;
  }
  async function open() {
    if (!S.project) { U.toast('Open a book first: the ledger reads its chapters.'); return; }
    await U.flushSave();
    const body = document.createElement('div'); body.className = 'lg';
    body.innerHTML = '<p class="hint">Reading the book…</p>';
    let tab = 'check', R = null;
    const chName = ci => (R.chs[ci] && R.chs[ci].title) || `Chapter ${ci + 1}`;
    const draw = () => {
      const groups = {}; for (const g of R.got) (groups[g.kind] = groups[g.kind] || []).push(g);
      const who = [...new Set(R.stats.map(s => s.who))];
      body.innerHTML = `
        <div class="lg-tabs" role="tablist">${[['check', `To check${R.flags.length ? ` (${R.flags.length})` : ''}`], ['stats', `Stats (${R.stats.length})`], ['got', `Skills & items (${R.got.length})`]].map(([k, l]) => `<button type="button" class="chip ${tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
        <div class="lg-body">${
          tab === 'check' ? (R.flags.length ? `<p class="hint">Not always mistakes (a curse can lower a stat, a skill can be foreshadowed), but worth a look. Click one to go there.</p><div class="lg-list">${R.flags.map((f, i) => `<button type="button" class="lg-flag ${f.type}" data-flag="${i}"><span>${f.type === 'early' ? '👁' : f.type === 'down' ? '↓' : '↑'}</span><span>${esc(f.msg)}<small>${f.type === 'early' ? '' : esc(chName(f.a.ci)) + ' → ' + esc(chName(f.b.ci))}</small></span></button>`).join('')}</div>`
            : R.stats.length || R.got.length ? '<p class="lg-ok">✓ Nothing to check: every stat change has a level-up or a [+N] to explain it, and nothing turns up before it’s acquired.</p>' : emptyHelp())
          : tab === 'stats' ? (R.stats.length ? who.map(w => `${who.length > 1 || w ? `<h4>${esc(w || 'Main character')}</h4>` : ''}<table class="lg-table"><tbody>${R.stats.filter(s => s.who === w).map((st, i) => `<tr><th>${esc(st.label)}</th><td>${spark(st, R.chs.length)}</td><td class="lg-vals">${st.values.map(v => `<button type="button" class="link-btn" data-go="${v.ci}" data-text="${esc('[' + v.text + ']')}" title="${esc(chName(v.ci))}">${v.max != null ? `${fmt(v.v)}/${fmt(v.max)}` : fmt(v.v)}</button>`).join(' → ')}</td></tr>`).join('')}</tbody></table>`).join('') : emptyHelp())
          : (R.got.length ? Object.entries(groups).map(([k, list]) => `<h4>${esc(KINDS[k] || k)}</h4><table class="lg-table"><tbody>${list.map(g => `<tr><th>${esc(g.name)}${g.kind === 'quest' ? (g.done != null ? ' <span class="lg-done">✓ complete</span>' : ' <span class="lg-open">open</span>') : ''}</th><td><button type="button" class="link-btn" data-go="${g.ch}" data-text="${esc('[' + g.text + ']')}">${esc(chName(g.ch))}</button>${g.done != null && g.done !== g.ch ? ` → done in ${esc(chName(g.done))}` : ''}${g.early != null ? ` <span class="lg-warn" title="Mentioned before this">👁 ${esc(chName(g.early))}</span>` : ''}</td></tr>`).join('')}</tbody></table>`).join('') : emptyHelp())
        }</div>`;
      $$('[data-tab]', body).forEach(b => b.onclick = () => { tab = b.dataset.tab; draw(); });
      $$('[data-go]', body).forEach(b => b.onclick = () => goTo(+b.dataset.go, b.dataset.text));
      $$('[data-flag]', body).forEach(b => b.onclick = () => { const f = R.flags[+b.dataset.flag]; if (f.type === 'early') goTo(f.ci, f.g.name); else goTo(f.b.ci, '[' + f.b.text + ']'); });
    };
    const emptyHelp = () => `<p class="hint">No system messages found yet. The ledger reads anything in square brackets, like <b>[Strength: 14]</b>, <b>[HP: 40/50]</b>, <b>[Level Up! You are now Level 7]</b>, <b>[+2 Agility]</b>, <b>[New Skill Acquired: Shadow Step]</b>, <b>[Item Obtained: Rusty Key]</b> or <b>[Quest Complete: The Lost Cat]</b>. Put stats in a block that starts <b>[Status: Ace]</b> to keep them for one character.</p>`;
    const p = U.modal({ title: 'LitRPG ledger', body, wide: true, buttons: [{ label: 'Close', value: null, kind: 'primary' }] });
    try { R = await scan(); draw(); } catch (e) { console.error(e); body.innerHTML = '<p class="hint">Something went wrong reading the book.</p>'; }
    await p;
  }
  // in the Revise panel and Ctrl+K
  { const b = document.getElementById('rp-ledger'); if (b) b.onclick = () => open(); }
  return { open, scan };
})();
