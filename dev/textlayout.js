// Unwip - text layout for the whole book (owner, 7 Nov): line spacing, first-line indent, space after paragraphs,
// justify and no indent after headings, with the same boxes as the side panel's Style and a live example beside them
// (the opening of Dracula, in the book's own font and size). For this book, new books too, or every book.
// Only the book's style changes: chapters themselves are never touched.
window.UnwipTextLayout = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return;
  const { S, api, esc, $ } = U;
  const KEYS = ['lineHeight', 'indent', 'paraSpacing', 'justify', 'noIndentFirst'];
  const EXAMPLE = [
    '3 May. Bistritz. Left Munich at 8:35 P.M., on 1st May, arriving at Vienna early next morning; should have arrived at 6:46, but train was an hour late. Buda-Pesth seems a wonderful place, from the glimpse which I got of it from the train and the little I could walk through the streets.',
    'The impression I had was that we were leaving the West and entering the East; the most western of splendid bridges over the Danube, which is here of noble width and depth, took us among the traditions of Turkish rule.',
    '*',
    'We left in pretty good time, and came after nightfall to Klausenburgh. Here I stopped for the night at the Hotel Royale.'];
  const pick = st => { const o = {}; for (const k of KEYS) o[k] = st[k]; return o; };

  function form(st) {
    const opt = (vals, cur) => vals.map(([v, l]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${l}</option>`).join('');
    const lh = [[1, 'Single'], [1.15, '1.15'], [1.5, '1.5'], [2, 'Double']].concat([1, 1.15, 1.5, 2].includes(+st.lineHeight) ? [] : [[st.lineHeight, String(st.lineHeight)]]).sort((a, b) => a[0] - b[0]);
    const body = document.createElement('div'); body.className = 'tl';
    body.innerHTML = `
      <p class="hint">Sets how the text sits on the page in “${esc(S.project.title || 'this book')}”: every chapter, sheet and note. The words stay as they are.</p>
      <div class="tl-grid">
        <div class="tl-set">
          <div class="field"><label>Line spacing</label><select id="tl-lh">${opt(lh, st.lineHeight)}</select></div>
          <div class="field"><label>First-line indent (inches)</label><input type="number" id="tl-indent" min="0" max="2" step="0.05" value="${st.indent}"></div>
          <div class="field"><label>Space after paragraphs (pt)</label><input type="number" id="tl-pspace" min="0" max="36" step="1" value="${st.paraSpacing}"></div>
          <label class="check"><input type="checkbox" id="tl-justify" ${st.justify ? 'checked' : ''}><span>Justify text</span></label>
          <label class="check"><input type="checkbox" id="tl-nofirst" ${st.noIndentFirst ? 'checked' : ''}><span>No indent after headings and scene breaks</span></label>
          <div class="tl-scope"><b>Use it for</b>
            <label class="check"><input type="radio" name="tl-scope" value="book" checked><span>This book</span></label>
            <label class="check"><input type="radio" name="tl-scope" value="default"><span>This book, and every new book from now on</span></label>
            <label class="check"><input type="radio" name="tl-scope" value="all"><span>Every book I have, and every new one<small>Books open on another device are skipped.</small></span></label>
          </div>
        </div>
        <div class="tl-prev" id="tl-prev" aria-label="Example"></div>
      </div>`;
    const read = () => ({ lineHeight: +$('#tl-lh', body).value, indent: Math.max(0, Math.min(2, +$('#tl-indent', body).value || 0)), paraSpacing: Math.max(0, Math.min(36, +$('#tl-pspace', body).value || 0)),
      justify: $('#tl-justify', body).checked, noIndentFirst: $('#tl-nofirst', body).checked });
    // the example: the book's own font and size, laid out as chosen
    const draw = () => {
      const o = read(), prev = $('#tl-prev', body); let after = true;
      prev.style.fontFamily = `'${st.font}', Georgia, serif`; prev.style.fontSize = st.size + 'pt';
      prev.innerHTML = `<h3 style="font-family:'${esc((st.headings && st.headings.h1 && st.headings.h1.font) || st.font)}', Georgia, serif">Chapter I</h3>` + EXAMPLE.map(t => {
        if (t === '*') { after = true; return '<p class="tl-brk">* * *</p>'; }
        const ind = after && o.noIndentFirst ? 0 : o.indent; after = false;
        return `<p style="line-height:${o.lineHeight};text-indent:${ind}in;margin:0 0 ${o.paraSpacing}pt;text-align:${o.justify ? 'justify' : 'left'}">${esc(t)}</p>`;
      }).join('');
    };
    body.addEventListener('input', draw); body.addEventListener('change', draw);
    return { body, read, draw };
  }

  async function open() {
    if (!S.project) return U.toast('Open a book first.');
    const st = S.project.style, f = form(st);
    const ok = await U.modal({ title: 'Text layout', body: f.body, wide: true, onOpen: f.draw,
      buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Use this layout', value: true, kind: 'primary' }] });
    if (!ok) return;
    const o = f.read(), scope = f.body.querySelector('[name="tl-scope"]:checked').value;
    const before = JSON.parse(JSON.stringify(st));
    U.applyStyleNow(Object.assign(JSON.parse(JSON.stringify(st)), o));
    if (scope !== 'book') {
      const d = (S.settings && S.settings.defaultStyle) || {};
      S.settings = await api.setSettings({ defaultStyle: Object.assign(JSON.parse(JSON.stringify(d)), o) });
    }
    let others = 0; const skipped = [];
    if (scope === 'all') {
      const list = await api.listProjects().catch(() => []);
      for (const p of list) {
        if (p.slug === S.slug) continue;
        try {
          const busy = api.othersOpen ? await api.othersOpen(p.slug).catch(() => null) : null;
          if (busy && busy.length) { skipped.push(p.title || p.slug); continue; }
          const proj = await api.openProject(p.slug); if (!proj || !proj.style) continue;
          const was = JSON.stringify(pick(proj.style)); Object.assign(proj.style, o);
          if (JSON.stringify(pick(proj.style)) === was) continue;
          await api.saveProjectMeta(p.slug, proj); others++;
        } catch (e) { skipped.push(p.title || p.slug); }
      }
    }
    const msg = `New text layout for this book${scope === 'default' ? ', and new books will have it too' : ''}${scope === 'all' ? `, and ${others === 1 ? '1 other book' : `${others} other books`}` : ''}${skipped.length ? ` (${skipped.length} open elsewhere, left as they were)` : ''}.`;
    U.toastAction(msg, 'Undo', () => {
      U.applyStyleNow(Object.assign(JSON.parse(JSON.stringify(S.project.style)), pick(before)));
      U.toast(scope === 'all' ? 'This book is back as it was. Other books keep the new layout.' : 'Text layout undone.');
    }, 15000);
  }

  return { open, form, EXAMPLE };
})();
