// Unwip - Import a Scrivener project straight from Dropbox (iPhone / iPad / web version).
// A phone can't pick a .scriv folder in the Files app, so Unwip asks Dropbox for it directly. This uses its own,
// separate Dropbox permission that can only READ (it's asked for the first time you import, and is never used for
// syncing). The project is fetched as one download and read here; nothing in Dropbox is changed.
window.UnwipDropboxImport = (function () {
  'use strict';
  const F = window.folio;
  if (!F || !F.web || !F.__fs) return null;
  const KEY = window.UNWIP_DROPBOX_IMPORT_KEY || '';
  const FS = F.__fs, STATE = 'app/dropbox-import.json';
  const API = 'https://api.dropboxapi.com/2', CONTENT = 'https://content.dropboxapi.com/2';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const headerJSON = o => JSON.stringify(o).replace(/[\u007f-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  // signing in is shared with sync's (dropbox.js, loaded first): PKCE, the Dropbox page, swapping the code
  const SI = (window.UnwipDropbox && window.UnwipDropbox.signIn) || null;
  if (!SI) return null;
  const { b64url, standalone, redirectUri } = SI;
  // back from Dropbox's sign-in page (read now, before anything tidies the address)
  const back = new URLSearchParams(location.search);
  let st = null;
  const load = async () => { if (!st) st = await FS.json(STATE, {}); return st; };
  const save = () => FS.write(STATE, JSON.stringify(st));
  const ready = () => !!KEY;

  async function token() {
    await load();
    if (st.access && st.exp > Date.now() + 60000) return st.access;
    if (!st.refresh) return null;
    const r = await SI.refreshRequest(KEY, st.refresh);
    if (!r.ok) {
      // only Dropbox saying the sign-in is no good any more (400 invalid_grant, 401) means signing in again; "busy" (429)
      // or a hiccup (5xx) used to throw the sign-in away too, so the import asked to sign in again after a bad moment
      if (r.status === 400 || r.status === 401) { st = {}; await save(); return null; }
      throw new Error('Dropbox is busy right now, so the import can’t start. Try again in a minute. You’re still signed in.');
    }
    const j = await r.json(); st.access = j.access_token; st.exp = Date.now() + (j.expires_in || 14400) * 1000; await save();
    return st.access;
  }
  async function call(url, opts) {
    const t = await token(); if (!t) throw new Error('NEEDS_SIGN_IN');
    for (let attempt = 0; ; attempt++) {
      const r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + t } });
      if ((r.status === 429 || r.status >= 500) && attempt < 5) { await new Promise(res => setTimeout(res, 1000 * 2 ** attempt)); continue; }
      return r;
    }
  }
  const rpc = (p, body) => call(API + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  // ---- signing in (once): read-only access to Dropbox
  async function signIn(after) {
    const U = window.__unwip;
    const { v, c } = await SI.pkce();
    const state = 'imp_' + b64url(crypto.getRandomValues(new Uint8Array(12)));
    const intro = `<p>To bring in a Scrivener project, Unwip needs to <b>read</b> it from your Dropbox. This is a separate, read-only permission: it can look at your Dropbox and download a project, but can’t change or delete anything. It’s only used when you import.</p>`;
    if (standalone()) {
      const url = SI.authorizeURL(KEY, c);
      const body = document.createElement('div');
      body.innerHTML = intro + `<ol class="dbx-steps"><li>Tap <b>Open Dropbox</b>. Sign in and tap <b>Allow</b>.</li><li>Dropbox shows a code. Copy it.</li><li>Come back here and paste it below.</li></ol>
        <p><a class="btn primary dbx-open" href="${url}" target="_blank" rel="noopener">Open Dropbox</a></p>
        <div class="field"><input type="text" id="dbi-code" placeholder="Paste the code from Dropbox" autocomplete="off" autocapitalize="off" spellcheck="false"></div>`;
      const ok = await U.modal({ title: 'Read your Dropbox', body, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Continue', value: true, kind: 'primary' }] });
      const code = ok && body.querySelector('#dbi-code').value.trim();
      return code ? finish(code, v, null) : false;
    }
    const go = await U.modal({ title: 'Read your Dropbox', body: intro + '<p>Dropbox will ask you to allow it, then bring you straight back here.</p>', buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Continue to Dropbox', value: true, kind: 'primary' }] });
    if (!go) return false;
    sessionStorage.setItem('unwip-dbx-imp', JSON.stringify({ v, state, after: after || '' }));
    location.href = SI.authorizeURL(KEY, c, { redirect_uri: redirectUri(), state });
    return false;
  }
  async function finish(code, verifier, redirect) {
    const r = await SI.exchange(KEY, code, verifier, redirect);
    if (!r.ok) { window.__unwip.toast('Dropbox didn’t accept that. Try again (the code only works once, for a few minutes).', 'warn', 9000); return false; }
    const j = await r.json(); await load();
    Object.assign(st, { access: j.access_token, refresh: j.refresh_token, exp: Date.now() + (j.expires_in || 14400) * 1000 });
    await save(); return true;
  }

  // ---- choosing the project: a small Dropbox browser, Scrivener projects marked
  async function list(path) {
    let r = await rpc('/files/list_folder', { path, recursive: false, include_deleted: false, limit: 2000 });
    if (!r.ok) throw await problem(r, 'list that folder');
    let j = await r.json(); const out = [...j.entries];
    while (j.has_more) { r = await rpc('/files/list_folder/continue', { cursor: j.cursor }); if (!r.ok) break; j = await r.json(); out.push(...j.entries); }
    return out;
  }
  // what Dropbox said was wrong, in words (and a fresh sign-in when that's the fix)
  async function problem(r, what) {
    let t = ''; try { t = await r.text(); } catch {}
    let j = null; try { j = JSON.parse(t); } catch {}
    const sum = (j && (j.error_summary || (j.error && j.error['.tag']))) || t || '';
    console.warn('Dropbox import:', r.status, t.slice(0, 300));
    if (/missing_scope|required scope/i.test(sum)) { st = {}; await save(); return new Error('Unwip’s Dropbox app is missing its read permissions. On dropbox.com/developers/apps › your Unwip Import app › Permissions, tick files.metadata.read and files.content.read and press Submit. Then import again (Dropbox will ask you to allow it once more).'); }
    if (r.status === 401 || /invalid_access_token|expired_access_token|malformed/i.test(sum)) { st = {}; await save(); return new Error('NEEDS_SIGN_IN'); }
    if (/disabled|app_id/i.test(sum)) return new Error('Dropbox says Unwip’s import app is turned off or not set up yet (' + sum.slice(0, 120) + ').');
    return new Error(`Dropbox couldn’t ${what} (${r.status}${sum ? ': ' + String(sum).slice(0, 160) : ''}).`);
  }
  async function exists(path) { const r = await rpc('/files/get_metadata', { path }); return r.ok; }
  async function browse() {
    const U = window.__unwip;
    let path = (await exists('/Apps/Scrivener')) ? '/Apps/Scrivener' : '';
    const body = document.createElement('div'); body.className = 'dbi';
    let resolveDone; const done = new Promise(r => { resolveDone = r; });
    const draw = async () => {
      body.innerHTML = '<p class="hint">Looking in Dropbox…</p>';
      let items;
      try { items = await list(path); } catch (e) { if (e.message === 'NEEDS_SIGN_IN') return resolveDone({ signIn: true }); body.innerHTML = `<p class="hint">${esc(e.message)}</p>`; return; }
      const folders = items.filter(e => e['.tag'] === 'folder').sort((a, b) => a.name.localeCompare(b.name));
      const projects = folders.filter(f => /\.scriv$/i.test(f.name)), others = folders.filter(f => !/\.scriv$/i.test(f.name));
      const crumbs = path.split('/').filter(Boolean);
      body.innerHTML = `<div class="dbi-path"><button class="link-btn" data-go="">Dropbox</button>${crumbs.map((c, i) => ` › <button class="link-btn" data-go="/${esc(crumbs.slice(0, i + 1).join('/'))}">${esc(c)}</button>`).join('')}</div>
        ${projects.length ? `<div class="dbi-h">Scrivener projects</div><div class="dbi-list">${projects.map(f => `<button class="dbi-row dbi-proj" data-pick="${esc(f.path_lower)}" data-name="${esc(f.name)}"><span class="dbi-ic">📘</span><span>${esc(f.name.replace(/\.scriv$/i, ''))}</span><span class="dbi-go">Import</span></button>`).join('')}</div>` : ''}
        ${others.length ? `<div class="dbi-h">Folders</div><div class="dbi-list">${others.map(f => `<button class="dbi-row" data-go="${esc(f.path_display)}"><span class="dbi-ic">📁</span><span>${esc(f.name)}</span><span class="dbi-go">›</span></button>`).join('')}</div>` : ''}
        ${!projects.length && !others.length ? '<p class="hint">No folders or Scrivener projects here.</p>' : ''}`;
      body.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { path = b.dataset.go; draw(); });
      body.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => resolveDone({ path: b.dataset.pick, name: b.dataset.name }));
    };
    const m = U.modal({ title: 'Import from Dropbox', body, wide: true, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }] }).then(() => resolveDone(null));
    draw();
    const pick = await done;
    document.querySelectorAll('.modal-back').forEach(mb => { if (mb.contains(body)) { const b = mb.querySelector('.m-foot .btn'); if (b) b.click(); } });
    await m;
    return pick;
  }
  // the whole project in one download (Dropbox zips the folder), read the same way as everywhere else
  async function fetchProject(pick) {
    const U = window.__unwip;
    U.toast(`Fetching “${esc(pick.name.replace(/\.scriv$/i, ''))}” from Dropbox…`, '', 4000);
    const r = await call(CONTENT + '/files/download_zip', { method: 'POST', headers: { 'Dropbox-API-Arg': headerJSON({ path: pick.path }) } });
    if (!r.ok) throw r.status === 409 ? new Error('Dropbox couldn’t pack that project (it may be too big, or still syncing). Try again in a minute.') : await problem(r, 'download that project');
    return F.__readScrivZip(new Uint8Array(await r.arrayBuffer()), pick.name);
  }
  // the import's first step: returns the project's files, or null
  async function pickProject() {
    await load();
    if (!(await token())) { if (!(await signIn('scriv'))) return null; }
    try { const pick = await browse(); if (pick && pick.signIn) { if (await signIn('scriv')) return pickProject(); return null; } return pick ? await fetchProject(pick) : null; }
    catch (e) { if (e.message === 'NEEDS_SIGN_IN') { if (await signIn('scriv')) return pickProject(); return null; } throw e; }
  }
  async function forget() { await load(); try { await rpc('/auth/token/revoke', null); } catch {} st = {}; await save(); }

  // came back from Dropbox's sign-in: finish, then carry on with the import
  (async () => {
    if (!back.get('code') || !/^imp_/.test(back.get('state') || '')) return;
    const saved = JSON.parse(sessionStorage.getItem('unwip-dbx-imp') || 'null'); sessionStorage.removeItem('unwip-dbx-imp');
    history.replaceState(null, '', location.pathname);
    if (!saved || saved.state !== back.get('state')) return;
    const ok = await finish(back.get('code'), saved.v, redirectUri());
    if (ok && saved.after === 'scriv') setTimeout(() => window.UnwipScriv && window.UnwipScriv.start({ fromDropbox: true }), 1500);
  })();

  return { ready, pickProject, forget };
})();
