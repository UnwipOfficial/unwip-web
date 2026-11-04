// Unwip - Writing history. A calendar of every day you wrote (across all your books), words per day, month and
// book, your streaks, how long you spend writing, and the times of day (and days of the week) your words come.
// Only words you type count, the same as goals: pasting and big deletions are left out.
window.UnwipHistory = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return;
  const { $, S, api, esc, fmt } = U;
  const key = d => d.toLocaleDateString('en-CA');
  const DAY = 86400000;

  async function gather() {
    let list = [];
    try { list = await api.listProjects(); } catch {}
    // the open book's numbers are newer in memory than on disk
    if (S.project && S.slug) {
      const st = S.project.stats || {};
      const mine = { slug: S.slug, title: S.project.title, days: st.days || {}, hours: st.hours || {}, mins: st.mins || {} };
      const i = list.findIndex(p => p.slug === S.slug);
      if (i >= 0) list[i] = { ...list[i], ...mine }; else list.push(mine);
    }
    return list.map(p => ({ slug: p.slug, title: p.title || p.slug, days: p.days || {}, hours: p.hours || {}, mins: p.mins || {} }));
  }

  function build(projects, range) {
    const end = new Date(); end.setHours(12, 0, 0, 0);
    let from, to;
    if (range === 'last') { to = new Date(end); from = new Date(end.getTime() - 364 * DAY); }
    else { from = new Date(+range, 0, 1, 12); to = new Date(+range, 11, 31, 12); if (to > end) to = new Date(end); }
    return { from, to, days: daysIn(projects, from, to) };
  }
  function daysIn(projects, from, to) {
    const days = [];
    for (let t = from.getTime(); t <= to.getTime() + 1000; t += DAY) {
      const d = new Date(t), k = key(d);
      const per = projects.map(p => Math.max(0, p.days[k] || 0));
      days.push({ k, d, words: per.reduce((a, b) => a + b, 0), per, mins: projects.reduce((a, p) => a + (p.mins[k] || 0), 0) });
    }
    return days;
  }

  function heatmap(days) {
    const vals = days.map(x => x.words).filter(Boolean).sort((a, b) => a - b);
    const q = f => vals.length ? vals[Math.min(vals.length - 1, Math.floor(vals.length * f))] : 0;
    const cuts = [q(0.25), q(0.5), q(0.75)];
    const lvl = w => !w ? 0 : w <= cuts[0] ? 1 : w <= cuts[1] ? 2 : w <= cuts[2] ? 3 : 4;
    // columns are weeks starting Monday
    const first = days[0].d, pad = (first.getDay() + 6) % 7;
    const cells = Array(pad).fill(null).concat(days);
    const weeks = []; for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    let lastMonth = -1;
    const months = weeks.map(w => { const d = w.find(Boolean); if (!d) return ''; const m = d.d.getMonth(); if (m === lastMonth) return ''; lastMonth = m; return d.d.toLocaleDateString(undefined, { month: 'short' }); });
    const todayK = key(new Date());
    return `<div class="hm" style="--weeks:${weeks.length}">
      <div class="hm-months">${months.map(m => `<span>${m}</span>`).join('')}</div>
      <div class="hm-body">
        <div class="hm-wd"><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span><span>Sun</span></div>
        <div class="hm-grid">${weeks.map(w => `<div class="hm-col">${Array.from({ length: 7 }, (_, i) => { const x = w[i];
          if (!x) return '<i class="hm-c none"></i>';
          return `<i class="hm-c l${lvl(x.words)} ${x.k === todayK ? 'today' : ''}" data-k="${x.k}" title="${x.d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}: ${x.words ? fmt(x.words) + ' words' : 'no writing'}${x.mins ? ` · ${dur(x.mins)}` : ''}"></i>`; }).join('')}</div>`).join('')}</div>
      </div>
      <div class="hm-key">Less <i class="hm-c l0"></i><i class="hm-c l1"></i><i class="hm-c l2"></i><i class="hm-c l3"></i><i class="hm-c l4"></i> More</div>
    </div>`;
  }
  const dur = m => m < 60 ? `${m} min` : m >= 600 ? `${fmt(Math.round(m / 60))} h` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
  const hourName = h => { const x = ((h % 24) + 24) % 24; return x === 0 ? 'midnight' : x === 12 ? 'noon' : x < 12 ? `${x} am` : `${x - 12} pm`; };

  function bars(items, { cls = '', fmtV = fmt, best = true } = {}) {
    const max = Math.max(1, ...items.map(x => x.v));
    const top = best ? Math.max(...items.map(x => x.v)) : -1;
    return `<div class="hb ${cls}">${items.map(x => `<div class="hb-col ${x.v && x.v === top ? 'top' : ''}" title="${esc(x.title || x.label)}: ${fmtV(x.v)}"><i style="height:${Math.max(x.v ? 3 : 0, x.v / max * 100)}%"></i><span>${esc(x.label)}</span></div>`).join('')}</div>`;
  }

  function content(projects, range) {
    const { days } = build(projects, range);
    const written = days.filter(x => x.words > 0);
    const total = written.reduce((a, x) => a + x.words, 0);
    const mins = days.reduce((a, x) => a + x.mins, 0);
    const bestDay = written.reduce((a, x) => (!a || x.words > a.words ? x : a), null);
    const allSets = projects.map(p => p.days);
    const st = U.streaks(allSets);
    // longest run inside this range
    let run = 0, longest = 0; for (const x of days) { if (x.words > 0) { run++; longest = Math.max(longest, run); } else run = 0; }

    // time of day: from every book, all time (the hours are only kept as totals)
    const hours = Array.from({ length: 24 }, (_, h) => projects.reduce((a, p) => a + Math.max(0, p.hours[h] || 0), 0));
    const hoursTotal = hours.reduce((a, b) => a + b, 0);
    let bw = 0, bwAt = 0; for (let h = 0; h < 24; h++) { const v = hours[h] + hours[(h + 1) % 24]; if (v > bw) { bw = v; bwAt = h; } }
    const morning = hours.slice(5, 12).reduce((a, b) => a + b, 0), afternoon = hours.slice(12, 17).reduce((a, b) => a + b, 0),
      evening = hours.slice(17, 22).reduce((a, b) => a + b, 0), night = hours.slice(22).concat(hours.slice(0, 5)).reduce((a, b) => a + b, 0);
    const parts = [['a morning writer', morning], ['an afternoon writer', afternoon], ['an evening writer', evening], ['a night owl', night]].sort((a, b) => b[1] - a[1]);

    const wd = [0, 0, 0, 0, 0, 0, 0]; for (const x of days) wd[(x.d.getDay() + 6) % 7] += x.words;
    const wdNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const wdBest = wd.indexOf(Math.max(...wd));

    const months = []; for (const x of days) { const k = x.k.slice(0, 7); let m = months[months.length - 1]; if (!m || m.k !== k) months.push(m = { k, d: x.d, v: 0 }); m.v += x.words; }
    const books = projects.map((p, i) => ({ title: p.title, v: days.reduce((a, x) => a + x.per[i], 0) })).filter(b => b.v > 0).sort((a, b) => b.v - a.v);
    const bmax = Math.max(1, ...books.map(b => b.v));
    const kfmt = v => v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'k' : String(v);

    return `
      <div class="hi-cards">
        <div class="hi-card"><b>${fmt(total)}</b><span>words written</span></div>
        <div class="hi-card"><b>${written.length}</b><span>days you wrote<small>${days.length ? Math.round(written.length / days.length * 100) : 0}% of days</small></span></div>
        <div class="hi-card"><b>${written.length ? fmt(Math.round(total / written.length)) : '–'}</b><span>words on a writing day</span></div>
        <div class="hi-card"><b>${bestDay ? fmt(bestDay.words) : '–'}</b><span>best day${bestDay ? `<small>${bestDay.d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</small>` : ''}</span></div>
        <div class="hi-card flame"><b>${st.current}</b><span>day streak<small>best ever ${st.best} · this period ${longest}</small></span></div>
        <div class="hi-card"><b>${mins ? dur(mins) : '–'}</b><span>time writing${mins ? `<small>about ${fmt(Math.round(total / (mins / 60)))} words an hour</small>` : '<small>counted from now on</small>'}</span></div>
      </div>
      <div class="hi-sec"><h3>Every day</h3>${heatmap(days)}<div class="hi-day" id="hi-day">Click a day to see what you wrote.</div></div>
      <div class="hi-two">
        <div class="hi-sec"><h3>Time of day</h3>
          ${hoursTotal ? `<p class="hi-say">You’re ${parts[0][0]}. Most words come between <b>${hourName(bwAt)}</b> and <b>${hourName(bwAt + 2)}</b>.</p>
          ${bars(hours.map((v, h) => ({ v, label: h % 3 === 0 ? (h === 0 ? '12a' : h === 12 ? '12p' : h < 12 ? h + 'a' : (h - 12) + 'p') : '', title: `${hourName(h)} to ${hourName(h + 1)}` })), { cls: 'hb-hours' })}`
          : `<p class="hi-say muted">This fills in as you write: from now on Unwip notes the hour your words come in.</p>`}
        </div>
        <div class="hi-sec"><h3>Day of the week</h3>
          ${total ? `<p class="hi-say">Your best day is <b>${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][wdBest]}</b>.</p>` : '<p class="hi-say muted">Nothing written in this period yet.</p>'}
          ${bars(wd.map((v, i) => ({ v, label: wdNames[i] })), { cls: 'hb-wd' })}
        </div>
      </div>
      <div class="hi-sec"><h3>By month</h3>${bars(months.map(m => ({ v: m.v, label: m.d.toLocaleDateString(undefined, { month: 'short' }), title: m.d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) })), { cls: 'hb-months', fmtV: v => fmt(v) + ' words' })}
        <div class="hb-vals">${months.map(m => `<span>${m.v ? kfmt(m.v) : ''}</span>`).join('')}</div></div>
      ${books.length ? `<div class="hi-sec"><h3>By book</h3><div class="hi-books">${books.map(b => `<div class="hi-book"><span>${esc(b.title)}</span><i><em style="width:${b.v / bmax * 100}%"></em></i><b>${fmt(b.v)}</b></div>`).join('')}</div></div>` : ''}`;
  }

  async function open() {
    const projects = await gather();
    const years = new Set();
    for (const p of projects) for (const k of Object.keys(p.days)) if ((p.days[k] || 0) > 0) years.add(k.slice(0, 4));
    years.add(String(new Date().getFullYear()));
    const ys = [...years].sort().reverse();
    const body = document.createElement('div'); body.className = 'hi';
    body.innerHTML = `<div class="hi-view"><div class="hi-range"><button data-r="last" class="on">Last 12 months</button>${ys.map(y => `<button data-r="${y}">${y}</button>`).join('')}</div><div class="hi-main"></div></div>`;
    let range = 'last', foot = null;
    const panel = copyPanel(projects, ys, () => range, on => {
      body.querySelector('.hi-view').classList.toggle('hidden', on);
      if (foot) foot.querySelectorAll('.btn').forEach(b => { if (b.textContent === 'Copy…') b.classList.toggle('hidden', on); });
      const m = body.closest('.m-body'); if (m) m.scrollTop = 0;
    });
    body.appendChild(panel);
    const draw = () => {
      body.querySelector('.hi-main').innerHTML = content(projects, range);
      body.querySelectorAll('.hi-range button').forEach(b => b.classList.toggle('on', b.dataset.r === range));
      requestAnimationFrame(() => { const hm = body.querySelector('.hm'); if (hm) hm.scrollLeft = hm.scrollWidth; });
      body.querySelectorAll('.hm-c[data-k]').forEach(c => c.onclick = () => {
        body.querySelectorAll('.hm-c.sel').forEach(x => x.classList.remove('sel')); c.classList.add('sel');
        const k = c.dataset.k, d = new Date(k + 'T12:00:00');
        const per = projects.map(p => ({ t: p.title, v: Math.max(0, p.days[k] || 0) })).filter(x => x.v).sort((a, b) => b.v - a.v);
        const m = projects.reduce((a, p) => a + (p.mins[k] || 0), 0);
        body.querySelector('#hi-day').innerHTML = `<b>${d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</b> · ` +
          (per.length ? per.map(x => `${esc(x.t)}: ${fmt(x.v)} words`).join(' · ') + (m ? ` · ${dur(m)} writing` : '') : 'no writing this day');
      });
    };
    body.querySelectorAll('.hi-range button').forEach(b => b.onclick = () => { range = b.dataset.r; draw(); });
    draw();
    await U.modal({ title: 'Writing history', body, wide: true, onOpen: back => { foot = back.querySelector('.m-foot'); },
      buttons: [{ label: 'Copy…', kind: '', onClick: () => panel.show() }, { label: 'Done', value: true, kind: 'primary' }] });
  }

  // ================================================================== COPY YOUR DAYS (owner, 4 Nov)
  // A list for a message or Discord, a table for Excel or Google Sheets, or a picture of the grid. Only dates and
  // numbers go out; books are named only when "Split by book" is ticked. Everything that copies or shares runs inside
  // the click itself (Safari only allows it there), so the picture is made ready while you look at the preview.
  const longDate = d => d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const shortDate = d => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const plural = (n, w) => `${fmt(n)} ${w}${n === 1 ? '' : 's'}`;
  const cell = s => String(s).replace(/[\t\r\n]+/g, ' ');
  const csvCell = s => /[",\n\r]/.test(s = String(s)) ? '"' + s.replace(/"/g, '""') + '"' : s;

  function span(which, pick = {}) {
    const end = new Date(); end.setHours(12, 0, 0, 0);
    if (which === 'week') return [new Date(end.getTime() - ((U.weekSoFar ? U.weekSoFar() : 1) - 1) * DAY), end];
    if (which === 'month') return [new Date(end.getFullYear(), end.getMonth(), 1, 12), end];
    if (which === 'last') return [new Date(end.getTime() - 364 * DAY), end];
    if (which === 'pick') {
      let a = new Date((pick.from || '') + 'T12:00:00'), b = new Date((pick.to || '') + 'T12:00:00');
      if (isNaN(a)) a = new Date(end); if (isNaN(b)) b = new Date(end);
      if (b > end) b = new Date(end); if (a > b) [a, b] = [b, a];
      if (b - a > 3660 * DAY) a = new Date(b.getTime() - 3660 * DAY);   // ten years is plenty
      return [a, b];
    }
    const y = +which; let b = new Date(y, 11, 31, 12); if (b > end) b = new Date(end);
    return [new Date(y, 0, 1, 12), b];
  }

  // o: { which, pick, skipEmpty, totals, byBook } → the days and the three kinds of text
  function copyData(projects, o) {
    const [from, to] = span(o.which, o.pick);
    const all = daysIn(projects, from, to);
    const written = all.filter(x => x.words > 0);
    const rows = o.skipEmpty ? written : all;
    const total = written.reduce((a, x) => a + x.words, 0);
    const best = written.reduce((a, x) => (!a || x.words > a.words ? x : a), null);
    const books = projects.map((p, i) => ({ title: p.title || 'Untitled', i, v: all.reduce((a, x) => a + x.per[i], 0) })).filter(b => b.v > 0);
    const byBook = !!o.byBook && books.length > 0;

    // the list
    const dates = rows.map(x => longDate(x.d)), wide = Math.max(0, ...dates.map(s => s.length)) + 3;
    const nums = rows.map(x => fmt(x.words)), numW = Math.max(0, ...nums.map(s => s.length));
    const L = [`Writing days, ${shortDate(from)} to ${shortDate(to)}`];
    rows.forEach((x, j) => {
      let line = dates[j].padEnd(wide) + nums[j].padStart(numW);
      if (byBook) { const per = books.filter(b => x.per[b.i] > 0).map(b => `${b.title} ${fmt(x.per[b.i])}`); if (per.length) line += `  (${per.join(', ')})`; }
      L.push(line);
    });
    if (!rows.length) L.push('No words written in these days.');
    if (o.totals && written.length) {
      L.push(`Total: ${plural(total, 'word')} on ${plural(written.length, 'day')}`);
      L.push(`Best day: ${fmt(best.words)} (${best.d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })})`);
      if (byBook) for (const b of books) L.push(`${b.title}: ${plural(b.v, 'word')}`);
    }
    const list = L.join('\n');

    // the table (tabs paste as columns in Excel and Google Sheets) and the same as a .csv file
    const head = ['Date'].concat(byBook ? books.map(b => b.title).concat('Total') : ['Words']);
    const body = rows.map(x => [x.k].concat(byBook ? books.map(b => x.per[b.i]).concat(x.words) : [x.words]));
    if (o.totals) body.push(['Total'].concat(byBook ? books.map(b => b.v).concat(total) : [total]));
    const grid = [head].concat(body);
    const tsv = grid.map(r => r.map(cell).join('\t')).join('\n');
    const csv = grid.map(r => r.map(csvCell).join(',')).join('\r\n');

    return { from, to, all, rows, written, total, best, books, list, tsv, csv };
  }

  // the picture: the totals and the grid of days, in this device's own colours, drawn at twice the size for sharpness
  function picture(data) {
    const cs = getComputedStyle(document.documentElement), v = (n, d) => cs.getPropertyValue(n).trim() || d;
    const paper = v('--paper', '#fffefb'), ink = v('--text', '#25231f'), accent = v('--accent', '#34528a'), muted = v('--muted', '#77736b'), line = v('--line', '#ddd8cf');
    const font = v('--ui', 'system-ui, sans-serif');
    const days = data.all, pad = (days[0].d.getDay() + 6) % 7, weeks = Math.ceil((pad + days.length) / 7);
    const c = weeks <= 6 ? 30 : weeks <= 27 ? 18 : 12, g = Math.max(2, Math.round(c / 5));
    const vals = data.written.map(x => x.words).sort((a, b) => a - b);
    const q = f => vals.length ? vals[Math.min(vals.length - 1, Math.floor(vals.length * f))] : 0;
    const cuts = [q(0.25), q(0.5), q(0.75)];
    const lvl = w => !w ? 0 : w <= cuts[0] ? 1 : w <= cuts[1] ? 2 : w <= cuts[2] ? 3 : 4;
    const P = 36, left = 40, gridW = weeks * (c + g) - g, top = 112;
    const W = Math.max(560, P + left + gridW + P), H = top + 7 * (c + g) - g + 58;
    const cv = document.createElement('canvas'); cv.width = W * 2; cv.height = H * 2;
    const x = cv.getContext('2d'); x.scale(2, 2);
    x.fillStyle = paper; x.fillRect(0, 0, W, H);
    x.fillStyle = ink; x.font = `600 24px ${font}`; x.textBaseline = 'alphabetic';
    const n = data.written.length;
    x.fillText(`${plural(data.total, 'word')} · ${plural(n, 'writing day')}${data.best ? ` · best ${fmt(data.best.words)}` : ''}`, P, 50);
    x.fillStyle = muted; x.font = `15px ${font}`;
    x.fillText(`${shortDate(data.from)} to ${shortDate(data.to)}`, P, 76);
    // month names over the first week of each month, weekday names down the side
    x.font = `12px ${font}`; let lastM = -1;
    for (let w = 0; w < weeks; w++) {
      const d = days[Math.max(0, w * 7 - pad)]; if (!d) continue;
      const m = d.d.getMonth(); if (m === lastM) continue; lastM = m;
      x.fillText(d.d.toLocaleDateString(undefined, { month: 'short' }), P + left + w * (c + g), top - 10);
    }
    x.textBaseline = 'middle';
    [['Mon', 0], ['Wed', 2], ['Fri', 4], ['Sun', 6]].forEach(([s, r]) => x.fillText(s, P, top + r * (c + g) + c / 2));
    const rr = (px, py) => { x.beginPath(); if (x.roundRect) x.roundRect(px, py, c, c, Math.max(2, c / 4)); else x.rect(px, py, c, c); x.fill(); };
    days.forEach((d, j) => {
      const at = pad + j, px = P + left + Math.floor(at / 7) * (c + g), py = top + (at % 7) * (c + g), l = lvl(d.words);
      x.globalAlpha = 1; x.fillStyle = paper; rr(px, py);
      if (l) { x.fillStyle = accent; x.globalAlpha = [0, 0.28, 0.5, 0.75, 1][l]; } else { x.fillStyle = line; x.globalAlpha = 0.7; }
      rr(px, py);
    });
    x.globalAlpha = 1; x.fillStyle = muted; x.font = `12px ${font}`; x.textAlign = 'right'; x.textBaseline = 'alphabetic';
    x.fillText('Made with Unwip', W - P, H - 18);
    return cv;
  }

  function copyPanel(projects, ys, nowRange, toggle) {
    let saved = {}; try { saved = JSON.parse(localStorage.getItem('unwip-history-copy') || '{}') || {}; } catch {}
    const today = key(new Date()), monthAgo = key(new Date(Date.now() - 30 * DAY));
    const o = { which: 'last', as: ['list', 'table', 'picture'].includes(saved.as) ? saved.as : 'list', skipEmpty: saved.skipEmpty !== false, totals: saved.totals !== false, byBook: false, pick: { from: monthAgo, to: today } };
    const WH = [['week', 'This week'], ['month', 'This month'], ['last', 'Last 12 months']].concat(ys.map(y => [y, y])).concat([['pick', 'Pick dates…']]);
    const share = !!navigator.share && !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
    const el = document.createElement('div'); el.className = 'hc hidden'; el.setAttribute('data-own-enter', '');
    el.innerHTML = `<div class="hc-sub">Which days</div>
      <div class="hc-chips">${WH.map(([k, t]) => `<button type="button" data-w="${k}">${esc(t)}</button>`).join('')}</div>
      <div class="hc-pick hidden"><label>From <input type="date" class="hc-from" value="${o.pick.from}" max="${today}"></label><label>To <input type="date" class="hc-to" value="${o.pick.to}" max="${today}"></label></div>
      <div class="hc-sub">Copy it as</div>
      <div class="hc-as">
        <label class="hc-opt"><input type="radio" name="hc-as" value="list"><span><b>A list</b><small>For a message, Discord or a post. One day per line.</small></span></label>
        <label class="hc-opt"><input type="radio" name="hc-as" value="table"><span><b>A table</b><small>Pastes into Excel or Google Sheets as columns.</small></span></label>
        <label class="hc-opt"><input type="radio" name="hc-as" value="picture"><span><b>A picture of the grid</b><small>The coloured days and the totals, ready to post.</small></span></label>
      </div>
      <div class="hc-ticks">
        <label class="hc-ck hc-t"><input type="checkbox" class="hc-skip"> Leave out days with no words</label>
        <label class="hc-ck"><input type="checkbox" class="hc-tot"> Add the totals at the end</label>
        <label class="hc-ck hc-t"><input type="checkbox" class="hc-book"> Split by book (puts the books’ names in the copy)</label>
      </div>
      <div class="hc-sub">What you’ll copy</div>
      <div class="hc-pv"></div>
      <div class="hc-btns"><button type="button" class="btn hc-back">Back</button><button type="button" class="btn hc-save">Save as file…</button>${share ? '<button type="button" class="btn hc-share">Share…</button>' : ''}<button type="button" class="btn primary hc-copy">Copy</button></div>`;
    const q = s => el.querySelector(s);
    let data = null, canvas = null, file = null, made = 0;
    const keep = () => { try { localStorage.setItem('unwip-history-copy', JSON.stringify({ as: o.as, skipEmpty: o.skipEmpty, totals: o.totals })); } catch {} };
    const draw = () => {
      el.querySelectorAll('.hc-chips button').forEach(b => b.classList.toggle('on', b.dataset.w === o.which));
      q('.hc-pick').classList.toggle('hidden', o.which !== 'pick');
      el.querySelectorAll('input[name=hc-as]').forEach(r => { r.checked = r.value === o.as; r.closest('.hc-opt').classList.toggle('on', r.checked); });
      q('.hc-skip').checked = o.skipEmpty; q('.hc-tot').checked = o.totals; q('.hc-book').checked = o.byBook;
      el.querySelectorAll('.hc-t').forEach(t => t.classList.toggle('hidden', o.as === 'picture'));
      q('.hc-ticks').classList.toggle('hidden', o.as === 'picture');   // the picture always has its totals and no names
      data = copyData(projects, o); canvas = null; file = null;
      const pv = q('.hc-pv'); pv.innerHTML = '';
      if (o.as === 'picture') {
        canvas = picture(data); canvas.className = 'hc-pic'; pv.appendChild(canvas);
        const mine = ++made;   // a file ready for Share…, which has to happen inside the tap
        if (share) canvas.toBlob(b => { if (b && mine === made) file = new File([b], 'Writing days.png', { type: 'image/png' }); }, 'image/png');
      } else {
        const pre = document.createElement('pre'); pre.className = 'hc-text' + (o.as === 'table' ? ' tab' : '');
        pre.textContent = o.as === 'table' ? data.tsv : data.list; pv.appendChild(pre);
      }
      q('.hc-copy').textContent = o.as === 'picture' ? 'Copy picture' : 'Copy';
    };
    const done = () => U.toast(`Copied ${plural(data.rows.length, 'day')}.`);
    el.querySelectorAll('.hc-chips button').forEach(b => b.onclick = () => { o.which = b.dataset.w; draw(); });
    el.querySelectorAll('input[name=hc-as]').forEach(r => r.onchange = () => { o.as = r.value; keep(); draw(); });
    q('.hc-skip').onchange = e => { o.skipEmpty = e.target.checked; keep(); draw(); };
    q('.hc-tot').onchange = e => { o.totals = e.target.checked; keep(); draw(); };
    q('.hc-book').onchange = e => { o.byBook = e.target.checked; draw(); };   // never remembered: names stay out unless asked for each time
    q('.hc-from').onchange = e => { o.pick.from = e.target.value; draw(); };
    q('.hc-to').onchange = e => { o.pick.to = e.target.value; draw(); };
    q('.hc-back').onclick = () => { el.classList.add('hidden'); toggle(false); };
    q('.hc-copy').onclick = () => {
      if (o.as === 'picture') {
        const B = window.UnwipBuild;
        if (B && canvas) B.copyCanvas(canvas, 'Picture copied. Paste it into a post or message.'); else U.toast('Couldn’t copy the picture here. Try Save as file.', 'warn');
        return;
      }
      U.copyText(o.as === 'table' ? data.tsv : data.list).then(ok => ok ? done() : U.toast('Couldn’t copy here. Try Save as file.', 'warn'));
    };
    const sb = q('.hc-share');
    if (sb) sb.onclick = () => {
      let p;
      try {
        if (o.as === 'picture') {
          if (!file || (navigator.canShare && !navigator.canShare({ files: [file] }))) { U.toast('The picture is still being made. Try again in a moment.'); return; }
          p = navigator.share({ files: [file], title: 'Writing days' });
        } else p = navigator.share({ text: o.as === 'table' ? data.tsv : data.list });
      } catch { p = Promise.reject(); }
      p.catch(e => { if (!e || e.name !== 'AbortError') U.toast('Couldn’t share from here. Try Copy instead.', 'warn'); });
    };
    q('.hc-save').onclick = async () => {
      const name = `Writing days ${key(data.from)} to ${key(data.to)}`;
      try {
        if (o.as === 'picture') await api.exportBinary(await window.UnwipBuild.canvasBytes(canvas), name, 'png', 'PNG picture');
        else if (o.as === 'table') await api.exportBinary(new TextEncoder().encode('﻿' + data.csv), name, 'csv', 'CSV spreadsheet');
        else await api.exportBinary(new TextEncoder().encode(data.list), name, 'txt', 'Text file');
      } catch { U.toast('Couldn’t save the file.', 'warn'); }
    };
    el.show = () => { const r = nowRange(); o.which = r === 'last' ? 'last' : r; el.classList.remove('hidden'); toggle(true); draw(); };
    return el;
  }

  return { open, build, gather, copyData, picture, span };
})();
