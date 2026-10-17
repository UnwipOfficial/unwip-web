// Unwip - Read aloud. The computer's own voice (Windows, iPhone and iPad all have good ones, offline) reads the chapter,
// one sentence at a time, highlighting the sentence being read. Hearing your words is the best way to catch clunky lines.
// Suggested deletions (tracked changes) and footnote marks are skipped. Typing stops it.
window.UnwipRead = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return;
  const { $, $$, S, editor, esc } = U;
  const synth = () => window.speechSynthesis;
  const LS = k => { try { return localStorage.getItem('unwip-read-' + k); } catch { return null; } };
  const SET = (k, v) => { try { localStorage.setItem('unwip-read-' + k, v); } catch {} };
  let sents = [], idx = 0, playing = false, bar = null, token = 0;
  let rate = +(LS('rate') || 1), voiceName = LS('voice') || '';

  // ---------------------------------------------------------------- the sentences on the page, as ranges
  function collect() {
    const out = [];
    for (const block of [...editor.children]) {
      if (!/^(P|H1|H2|H3|BLOCKQUOTE)$/.test(block.tagName)) continue;
      const pieces = []; let text = '';
      const w = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if (n.parentElement.closest('del.tc-del, sup.fn')) continue;
        pieces.push({ n, start: text.length }); text += n.data;
      }
      if (!text.trim()) continue;
      const re = /[^.!?…]+(?:[.!?…]+["”’)\]]*|$)\s*/g; let m;
      while ((m = re.exec(text))) {
        if (!m[0].trim()) { if (m[0] === '') re.lastIndex++; continue; }
        const a = m.index + (m[0].length - m[0].trimStart().length), b = m.index + m[0].trimEnd().length;
        const r = document.createRange(), at = off => { let p = pieces[0]; for (const q of pieces) { if (q.start <= off) p = q; else break; } return [p.n, Math.min(p.n.length, off - p.start)]; };
        try { r.setStart(...at(a)); r.setEnd(...at(b)); } catch { continue; }
        out.push({ range: r, text: text.slice(a, b).replace(/\s+([.,!?;:”’])/g, '$1').replace(/\s{2,}/g, ' '), block });
      }
    }
    return out;
  }
  // where to begin: the sentence the cursor is in (or the selection starts in)
  function startIndex() {
    const sel = getSelection();
    if (sel.rangeCount && editor.contains(sel.anchorNode)) {
      const c = sel.getRangeAt(0), n = c.startContainer, o = c.startOffset;
      const i = sents.findIndex(s => { try { return s.range.isPointInRange(n, o) || s.range.comparePoint(n, o) < 0; } catch { return false; } });
      if (i >= 0) return i;
    }
    return 0;
  }

  // ---------------------------------------------------------------- speaking
  function voice() {
    const vs = synth().getVoices();
    return vs.find(v => v.name === voiceName) || vs.find(v => /^en[-_](AU|GB)/i.test(v.lang) && /natural|online|neural/i.test(v.name)) || vs.find(v => /^en/i.test(v.lang) && v.default) || vs.find(v => /^en/i.test(v.lang)) || vs[0] || null;
  }
  // the optional natural voice (naturalvoice.js): each sentence is turned into sound, a few ahead of the one being read
  const NV = () => window.UnwipVoice;
  const natural = () => voiceName.startsWith('k:') && NV() && NV().installed;
  let audioCtx = null, source = null; const made = new Map();
  const soundFor = i => { const key = `${i}|${voiceName}|${rate}`; if (!made.has(key)) { const p = NV().speak(sents[i].text, voiceName.slice(2), rate); p.catch(() => {}); made.set(key, p); } return made.get(key); };
  function halt() { try { synth() && synth().cancel(); } catch {} if (source) { try { source.onended = null; source.stop(); } catch {} source = null; } }
  async function speakNatural(my) {
    const s = sents[idx]; highlight(s); render();
    const p = soundFor(idx); for (let j = 1; j <= 3 && idx + j < sents.length; j++) soundFor(idx + j);
    let a; const wait = setTimeout(() => { if (my === token) waitNote(true); }, 250);
    try { a = await p; } catch (e) { clearTimeout(wait); if (my !== token) return; waitNote(false); U.toast('The natural voice stopped: ' + esc(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')), 'warn', 8000); stop(); return; }
    clearTimeout(wait); waitNote(false);
    if (my !== token || !playing) return;
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') await audioCtx.resume().catch(() => {});
    const buf = audioCtx.createBuffer(1, a.audio.length, a.rate); buf.copyToChannel(a.audio instanceof Float32Array ? a.audio : new Float32Array(a.audio), 0);
    source = audioCtx.createBufferSource(); source.buffer = buf; source.connect(audioCtx.destination);
    source.onended = () => { source = null; if (my !== token || !playing) return; for (const k of made.keys()) if (+k.split('|')[0] < idx - 1) made.delete(k); idx++; speak(); };
    source.start();
  }
  const waitNote = on => { const w = bar && bar.querySelector('.ra-wait'); if (w) w.hidden = !on; };
  function speak() {
    const my = ++token;
    if (natural() && idx < sents.length) return speakNatural(my);
    if (idx >= sents.length) { stop(); U.toast('That’s the end of the chapter.'); return; }
    const s = sents[idx];
    highlight(s);
    const u = new SpeechSynthesisUtterance(s.text.replace(/[“”]/g, '"'));
    const v = voice(); if (v) { try { u.voice = v; } catch {} u.lang = v.lang; }
    u.rate = rate;
    u.onend = () => { if (my !== token || !playing) return; idx++; speak(); };
    u.onerror = e => { if (my !== token || !playing) return; if (e.error === 'interrupted' || e.error === 'canceled') return; idx++; speak(); };
    synth().speak(u);
    render();
  }
  function highlight(s) {
    try { if (window.Highlight && CSS.highlights) CSS.highlights.set('unwip-read', new Highlight(s.range)); } catch {}
    const r = s.range.getBoundingClientRect(), w = U.editorWrap.getBoundingClientRect();
    if (r.top < w.top + 60 || r.bottom > w.bottom - 120) U.editorWrap.scrollTo({ top: U.editorWrap.scrollTop + r.top - w.top - w.height * 0.35, behavior: 'smooth' });
  }
  // open the player without reading yet, so a voice and speed can be picked first; ▶ starts
  function open(from) {
    if (!S.docId) { U.toast('Open a chapter first.'); return; }
    sents = collect();
    if (!sents.length) { U.toast('Nothing to read in this chapter yet.'); return; }
    idx = from != null ? from : startIndex();
    made.clear(); playing = false; halt(); showBar(); highlight(sents[idx]); render(); prepare();
  }
  // the natural voice gets the first sentences ready while you choose
  function prepare() {
    if (!natural() || !sents.length) return;
    try { window.folio.voiceWarm && window.folio.voiceWarm().catch(() => {}); } catch {}
    for (let j = 0; j < 2 && idx + j < sents.length; j++) soundFor(idx + j);
  }
  function start(from) {
    if (!S.docId) { U.toast('Open a chapter first.'); return; }
    if (!natural() && (!synth() || !window.SpeechSynthesisUtterance)) { U.toast('This device doesn’t have a reading voice.', 'warn'); return; }
    sents = collect();
    if (!sents.length) { U.toast('Nothing to read in this chapter yet.'); return; }
    idx = from != null ? from : startIndex();
    made.clear(); playing = true; halt(); showBar(); speak();
  }
  function pause() { playing = false; token++; halt(); waitNote(false); render(); }
  function resume() { if (!sents.length) return start(); playing = true; halt(); speak(); }
  function stop() {
    playing = false; token++; halt(); made.clear();
    try { CSS.highlights.delete('unwip-read'); } catch {}
    if (bar) { bar.remove(); bar = null; }
    sents = [];
    const lb = document.getElementById('btn-listen'); if (lb) lb.classList.remove('on');
  }
  const jump = d => { idx = Math.max(0, Math.min(sents.length - 1, idx + d)); if (playing) { halt(); speak(); } else { highlight(sents[idx]); render(); } };
  const toggle = () => bar ? (playing ? pause() : resume()) : open();

  // ---------------------------------------------------------------- the little player
  const ICON = {
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/></svg>',
    prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-6 6 6 6M11 6l-6 6 6 6"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l6 6-6 6M13 6l6 6-6 6"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'
  };
  function showBar() {
    if (bar) return render();
    bar = document.createElement('div'); bar.className = 'ra-bar'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Read aloud');
    bar.innerHTML = `<button class="ra-b" data-a="prev" title="Previous sentence">${ICON.prev}</button><button class="ra-b ra-play" data-a="play"></button><button class="ra-b" data-a="next" title="Next sentence">${ICON.next}</button>
      <span class="ra-pos"></span><span class="ra-wait" hidden>Preparing the voice…</span>
      <select class="ra-rate" title="Speed">${[0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2].map(r => `<option value="${r}" ${r === rate ? 'selected' : ''}>${r}×</option>`).join('')}</select>
      <select class="ra-voice" title="Voice"></select>
      <button class="ra-b" data-a="stop" title="Stop reading (Esc)">${ICON.x}</button>`;
    document.body.appendChild(bar);
    bar.addEventListener('mousedown', e => { if (!e.target.closest('select')) e.preventDefault(); });
    bar.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (!b) return; ({ prev: () => jump(-1), next: () => jump(1), play: () => (playing ? pause() : resume()), stop })[b.dataset.a](); });
    $('.ra-rate', bar).onchange = e => { rate = +e.target.value; SET('rate', rate); if (playing) { halt(); speak(); } else prepare(); };
    $('.ra-voice', bar).onchange = async e => {
      if (e.target.value === 'help:ios') {
        fillVoices();
        U.modal({ title: 'More voices', body: '<p>Your iPhone or iPad has better voices you can download for free. Open <b>Settings › Accessibility › Read &amp; Speak › Voices</b>, choose English, and download one (Enhanced or Premium sound the most natural).</p><p class="hint">Then come back to Unwip and pick it here. If it doesn’t show up straight away, close Unwip and open it again.</p>', buttons: [{ label: 'OK', value: true, kind: 'primary' }] });
        return;
      }
      if (e.target.value === 'k:get') { // set up the natural voice first
        const was = playing; pause(); const ok = NV() && await NV().setup();
        if (ok) { voiceName = 'k:bf_emma'; SET('voice', voiceName); } fillVoices(); if (ok && was) resume(); return;
      }
      voiceName = e.target.value; SET('voice', voiceName); if (playing) { halt(); speak(); } else prepare();
    };
    fillVoices(); render();
  }
  function fillVoices() {
    if (!bar) return;
    const vs = synth() ? synth().getVoices() : [], cur = natural() ? null : voice(), sel = $('.ra-voice', bar);
    const en = vs.filter(v => /^en/i.test(v.lang)), list = en.length ? en : vs;
    const own = list.map(v => `<option value="${esc(v.name)}" ${cur && v.name === cur.name ? 'selected' : ''}>${esc(v.name.replace(/^Microsoft\s+|\s+-\s+.*$|\s*\(.*\)$/g, ''))}</option>`).join('');
    const nv = NV();
    const nat = !nv ? '' : nv.installed
      ? `<optgroup label="Natural voices (Kokoro)">${nv.VOICES.map(([id, n, acc]) => `<option value="k:${id}" ${voiceName === 'k:' + id ? 'selected' : ''}>${esc(n)} · ${esc(acc)}</option>`).join('')}</optgroup>`
      : '<option value="k:get">Natural voice… (optional download)</option>';
    // the iPhone and iPad keep their better voices as downloads in Settings; a web page can't fetch them itself
    const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const more = IOS ? '<option value="help:ios">More voices…</option>' : '';
    sel.innerHTML = (own ? `<optgroup label="This device’s voices">${own}</optgroup>` : '<option value="">Default voice</option>') + nat + more;
    sel.hidden = false;
  }
  if (window.speechSynthesis) speechSynthesis.addEventListener && speechSynthesis.addEventListener('voiceschanged', fillVoices);
  function render() {
    if (!bar) return;
    { const lb = document.getElementById('btn-listen'); if (lb) lb.classList.add('on'); }
    const p = $('.ra-play', bar); p.innerHTML = playing ? ICON.pause : ICON.play; p.title = playing ? 'Pause (F8)' : 'Read (F8)';
    $('.ra-pos', bar).textContent = sents.length ? `${idx + 1} / ${sents.length}` : '';
  }

  // stop when you start typing, change chapter or leave
  editor.addEventListener('beforeinput', () => { if (bar) stop(); });
  U.on('doc', () => { if (bar) stop(); });
  U.on('leave', () => { if (bar) stop(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'F8' && S.docId) { e.preventDefault(); toggle(); }
    else if (e.key === 'Escape' && bar && !document.querySelector('.modal-back, .cmdk-back')) stop();
  });
  return { open, start, stop, pause, resume, toggle, get playing() { return playing; }, get index() { return idx; }, get count() { return sents.length; }, sentences: () => sents.map(s => s.text) };
})();
