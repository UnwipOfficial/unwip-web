// Unwip - Dropbox for the iPhone / iPad (web) version.
// The PC keeps its library in Dropbox/Unwip (the Dropbox app syncs it). Here, with no Dropbox app to lean on,
// Unwip talks to Dropbox itself and keeps the same files in step:
//   Unwip/<project>/project.json, docs/<id>.html, media/…, snapshots/…   (backups stay on each device)
// Rules: nothing is ever thrown away. If a chapter was changed on both devices, the Dropbox version is used
// and this device's version is kept as a snapshot ("changed on two devices"), so it can be compared and restored.
window.UnwipDropbox = (function () {
  'use strict';
  const F = window.folio;
  if (!F || !F.web || !F.__fs) return null;
  const FS = F.__fs, emit = F.__emit, DEVICE = F.__device || 'phone';
  const KEY = window.UNWIP_DROPBOX_KEY || '';
  const API = 'https://api.dropboxapi.com/2', CONTENT = 'https://content.dropboxapi.com/2';
  // the books live straight in Unwip's own Dropbox folder (Dropbox/Apps/Unwip). Older versions used a folder
  // inside it (Apps/Unwip/Unwip); flatten() moves anything there up a level, inside Dropbox, before each sync.
  const REMOTE = '', OLD = '/Unwip', LOCAL = 'Unwip/', STATE = 'app/dropbox.json';
  const CONFLICT = /\(([^()]*?)(?:['’]s)?\s*conflicted copy[^()]*\)/i;

  // which files travel: the project, its chapters, pictures and snapshots (not backups, not deleted projects), and Build
  const shaped = rel => {
    if (CONFLICT.test(rel)) return false;
    const m = /^([^/]+)\/(.+)$/.exec(rel); if (!m) return false;
    if (m[1].toLowerCase() === '_build') return /^items\/[\w-]+\.json$/.test(m[2]);   // Build: the world's maps, magic, runes and arms
    if (m[1].toLowerCase() === '_settings') return m[2].toLowerCase() === 'shared.json';   // settings shared between devices
    if (m[1].startsWith('_')) return false;
    if (/(^|\/)(desktop\.ini|thumbs\.db|\.ds_store|icon\r|~\$[^/]*|\.[^/]*)$/i.test(m[2])) return false;   // system files Dropbox won't store
    return /^project\.json$|^docs\/[\w-]+\.html$|^media\/[^/]+$|^snapshots\/[\w-]+\/[^/]+$|^proof\/[\w-]+\.json$/.test(m[2]);
  };
  const tracked = rel => shaped(rel) && !(st && [...(st.localOnly || []), ...(st.removedHere || [])].some(n => n.toLowerCase() === rel.split('/')[0].toLowerCase()));
  const isText = rel => /\.(html|json)$/.test(rel);

  // ---------------------------------------------------------------- state (kept on this device only)
  let st = null;
  async function load() { if (!st) { st = await FS.json(STATE, {}); st.records = st.records || {}; st.localOnly = st.localOnly || []; st.removedHere = st.removedHere || []; } return st; }
  const persist = () => rawWrite(STATE, JSON.stringify(st));
  const rawWrite = (p, d) => origWrite(p, d), rawRemove = p => origRemove(p);
  const connected = () => !!(st && st.refresh);

  // every save marks the file as changed, and a sync follows a few seconds later
  const origWrite = FS.write, origRemove = FS.remove;
  const dirty = new Set();
  const dropping = new Set();   // books being deleted everywhere (lowercase names): a running sync stops uploading them
  const changed = p => {
    if (!p.startsWith(LOCAL)) return; const rel = p.slice(LOCAL.length); dirty.add(rel.toLowerCase());
    if (tracked(rel) && st) {
      const book = rel.split('/')[0], waiting = st.waiting || [];
      if (!st.pending || !waiting.includes(book)) { st.pending = true; st.waiting = [...new Set([...waiting, book])]; persist(); renderSoon(); bookMarks(); }
    }
    soon();
  };
  // the main screen marks books with changes not yet in Dropbox
  let marksT = null;
  const bookMarks = () => { clearTimeout(marksT); marksT = setTimeout(() => { const lib = document.getElementById('library'); if (lib && !lib.classList.contains('hidden') && window.__unwip && !window.__unwip.S.slug) window.__unwip.showLibrary(); }, 400); };
  FS.write = async (p, d) => { const r = await origWrite(p, d); changed(p); return r; };
  FS.remove = async (p) => { const r = await origRemove(p); changed(p); return r; };
  let soonT = null, firstDirtyAt = 0;
  // syncing by itself is a choice (Settings › Where your books live); otherwise it's the Sync button, with a ⚠
  // when another device has changed something
  const auto = () => !!(st && st.auto);
  let news = false;
  // an import writes a book file by file: syncing waits until it's finished, then sends the whole book in one go
  // (it used to start part-way, finish, and start again, so the "left" count went down and back up)
  let holds = 0, heldBack = false;
  async function hold(fn) {
    holds++;
    try { return await fn(); }
    finally { if (--holds === 0 && heldBack) { heldBack = false; firstDirtyAt = 0; soon(); } }
  }
  function soon() {
    if (!connected() || !auto()) return;
    if (holds) { heldBack = true; return; }
    if (!firstDirtyAt) firstDirtyAt = Date.now();
    clearTimeout(soonT);
    const wait = Date.now() - firstDirtyAt > 20000 ? 0 : 4000;   // a pause in typing, or at least every 20 seconds
    soonT = setTimeout(() => { firstDirtyAt = 0; sync({ quiet: true }); }, wait);
  }

  // ---------------------------------------------------------------- talking to Dropbox
  const b64url = a => btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const headerJSON = o => JSON.stringify(o).replace(/[\u007f-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  async function token() {
    if (st.access && st.exp > Date.now() + 60000) return st.access;
    const r = await refreshRequest(KEY, st.refresh);
    if (!r.ok) { if (r.status === 400 || r.status === 401) { st.broken = true; await persist(); } throw new Error('Dropbox sign-in has expired'); }
    const j = await r.json(); st.access = j.access_token; st.exp = Date.now() + (j.expires_in || 14400) * 1000; st.broken = false; await persist();
    return st.access;
  }
  // Dropbox asks apps to slow down when lots of files move at once (429) and sometimes has a moment (5xx);
  // a phone connection can also drop. Wait as asked and try again, rather than giving up on the whole sync.
  const sleep = ms => new Promise(res => setTimeout(res, ms));
  async function call(url, opts, attempt = 0) {
    const t = await token();
    let r;
    try { r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + t } }); }
    catch (e) { if (attempt < 4) { await sleep(1000 * 2 ** attempt); return call(url, opts, attempt + 1); } throw new Error('No connection to Dropbox'); }
    if (r.status === 401 && attempt === 0) { st.exp = 0; return call(url, opts, 1); }
    if ((r.status === 429 || r.status >= 500) && attempt < 8) {
      const after = +(r.headers.get('Retry-After') || 0);
      if (progress) { progress.waiting = true; renderSoon(); }
      await sleep(Math.min(60000, after ? after * 1000 : 1500 * 2 ** Math.min(attempt, 5)));
      if (progress) progress.waiting = false;
      return call(url, opts, attempt + 1);
    }
    return r;
  }
  const rpc = (path, body) => call(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  async function listAll(path, recursive, onPage) {
    let r = await rpc('/files/list_folder', { path, recursive, include_deleted: false, limit: 2000 });
    if (r.status === 409) return [];                         // the folder isn't there yet
    if (!r.ok) throw new Error('Dropbox list failed (' + r.status + ')');
    let j = await r.json(); const out = [...j.entries]; onPage && onPage(out.length);
    while (j.has_more) { r = await rpc('/files/list_folder/continue', { cursor: j.cursor }); if (!r.ok) throw new Error('Dropbox list failed'); j = await r.json(); out.push(...j.entries); onPage && onPage(out.length); }
    return out;
  }
  async function download(pathLower) {
    const r = await call(CONTENT + '/files/download', { method: 'POST', headers: { 'Dropbox-API-Arg': headerJSON({ path: pathLower }) } });
    if (!r.ok) throw new Error('Dropbox download failed (' + r.status + ')');
    return new Uint8Array(await r.arrayBuffer());
  }
  // Dropbox lets an account write one thing at a time (several at once and it answers "too many write operations",
  // which is the "Dropbox busy, waiting…"). Reading can go several at once; writing queues up here.
  let writeQ = Promise.resolve();
  const oneWrite = f => { const p = writeQ.then(f, f); writeQ = p.catch(() => {}); return p; };
  const upload = (rel, bytes, rev) => oneWrite(() => uploadNow(rel, bytes, rev));
  async function uploadNow(rel, bytes, rev) {
    const mode = rev ? { '.tag': 'update', update: rev } : rev === null ? 'overwrite' : 'add';
    const r = await call(CONTENT + '/files/upload', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': headerJSON({ path: `${REMOTE}/${rel}`, mode, autorename: false, mute: true }) }, body: bytes });
    if (r.status === 409) {
      let why = ''; try { why = JSON.stringify(await r.json()); } catch {}
      return /conflict/.test(why) || !why ? { conflict: true } : { refused: why };   // refused: a name Dropbox won't take, or no room
    }
    if (!r.ok) throw new Error('Dropbox upload failed (' + r.status + ')');
    return r.json();
  }
  const remove = rel => oneWrite(() => rpc('/files/delete_v2', { path: `${REMOTE}/${rel}` }));

  // Dropbox's own fingerprint of a file, so unchanged files are never sent twice
  async function contentHash(bytes) {
    const B = 4 * 1024 * 1024, parts = [];
    for (let i = 0; i < bytes.length; i += B) parts.push(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.subarray(i, i + B))));
    const all = new Uint8Array(parts.length * 32); parts.forEach((p, i) => all.set(p, i * 32));
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', all))].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  const asBytes = v => v == null ? null : typeof v === 'string' ? new TextEncoder().encode(v) : v instanceof Uint8Array ? v : new Uint8Array(v);

  // ---------------------------------------------------------------- the sync itself
  let running = null, lastError = '', progress = null, renderT = 0;
  // the pill and Settings card follow along, at most a few times a second
  const renderSoon = () => { if (!renderT) renderT = setTimeout(() => { renderT = 0; render(); }, 250); };
  // what the sync is doing right now, in words
  function progressText(short) {
    const p = progress; if (!p) return 'Syncing…';
    if (p.phase === 'move') return short ? `Moving… ${p.moved || 0}` : `Moving books in Dropbox… ${p.moved || 0} moved`;
    if (p.phase === 'list') return short ? `Checking… ${(p.found || 0).toLocaleString()}` : `Checking Dropbox… ${(p.found || 0).toLocaleString()} files`;
    const left = Math.max(0, p.todo - p.done);
    if (p.waiting) return short ? 'Dropbox busy, waiting…' : 'Dropbox asked Unwip to slow down for a moment, carrying on shortly…';
    if (short) return left ? `Syncing… ${left.toLocaleString()} left` : 'Syncing…';
    const xfer = (p.down || p.up) ? ` (↓${p.down || 0} ↑${p.up || 0})` : '';
    return left ? `Syncing… ${left.toLocaleString()} file${left === 1 ? '' : 's'} left${xfer}` : 'Syncing… finishing';
  }
  function sync(opts = {}) {
    if (!connected() || !KEY) return Promise.resolve(false);
    if (running) { running.again = true; return running.p; }
    running = { again: false };
    running.p = (async () => {
      try { if (window.__unwip && window.__unwip.flushAll) await window.__unwip.flushAll(); } catch {}   // what's still being saved goes up too
      // "again" is for something saved or clashing mid-sync. A few rounds settle it; more than that and something is
      // stuck, so stop and let the next sync carry on rather than going round and round (which also wears out Dropbox's patience)
      try { let rounds = 0; do { running.again = false; await syncOnce(opts); } while (running.again && ++rounds < 3); lastError = ''; return true; }
      catch (e) { lastError = e.message || String(e); console.warn('Dropbox sync:', e); return false; }
      finally { running = null; render(); }
    })();
    render();
    return running.p;
  }
  async function flatten() {
    const top = await listAll(OLD, false);
    if (!top.length || top.some(e => e.name.toLowerCase() === 'project.json')) return;   // nothing to move (or it's a book called Unwip)
    progress = { phase: 'move', moved: 0 }; renderSoon();
    const there = new Set((await listAll('', false)).map(e => e.name.toLowerCase()));
    const move = (from, to, autorename) => rpc('/files/move_v2', { from_path: from, to_path: to, autorename: !!autorename, allow_ownership_transfer: false });
    for (const e of top) {
      if (e.name.toLowerCase() === 'unwip') continue;
      if (!there.has(e.name.toLowerCase())) {
        const r = await move(e.path_lower, '/' + e.name);
        if (r.ok) { progress.moved++; renderSoon(); continue; }
        if (r.status !== 409) throw new Error('Dropbox move failed (' + r.status + ')');
        // 409 is either "already there" or "too many files to move in one go": both are handled file by file below
      }
      // already there (e.g. written by an older version after the move): bring over what's missing, keep clashes aside
      for (const f of await listAll(e.path_lower, true)) {
        if (f['.tag'] !== 'file') continue;
        const rel = f.path_display.slice(OLD.length + 1);
        const r = await move(f.path_lower, '/' + rel);
        if (r.ok) { progress.moved++; renderSoon(); }
        if (r.status === 409) await move(f.path_lower, `/${rel.split('/')[0]}/backups/sync-conflicts/${Date.now()} ${rel.split('/').pop()}`, true);
      }
    }
    if (!(await listAll(OLD, true)).some(x => x['.tag'] === 'file')) await rpc('/files/delete_v2', { path: OLD });
    else throw new Error('Some files could not be moved out of the old Unwip folder yet');
  }
  // which folder layout the books in Dropbox use. A version of Unwip that doesn't know the layout stops syncing
  // and asks to be updated, instead of guessing (an older version guessing is what empties a phone).
  const LAYOUT = 2, LAYOUT_FILE = '/.unwip-layout.json';
  async function layoutGuard() {
    const r = await call(CONTENT + '/files/download', { method: 'POST', headers: { 'Dropbox-API-Arg': headerJSON({ path: LAYOUT_FILE }) } });
    if (r.ok) {
      let j = {}; try { j = JSON.parse(await r.text()); } catch {}
      if ((j.layout || 0) > LAYOUT) { st.needsUpdate = true; throw new Error('Your books in Dropbox were set up by a newer version of Unwip. Update this one (close and reopen it) to keep syncing.'); }
      st.needsUpdate = false;
      return j.layout === LAYOUT;
    }
    if (r.status !== 409) throw new Error('Dropbox check failed (' + r.status + ')');
    return false;
  }
  async function writeLayout() {
    const body = new TextEncoder().encode(JSON.stringify({ layout: LAYOUT, note: 'Written by Unwip. Tells older versions of Unwip to update before syncing.', by: window.UNWIP_VERSION || '' }, null, 1));
    await call(CONTENT + '/files/upload', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': headerJSON({ path: LAYOUT_FILE, mode: 'overwrite', mute: true }) }, body });
  }
  async function syncOnce(opts) {
    await load();
    const marked = await layoutGuard();
    await flatten();
    if (!marked) await writeLayout();
    progress = { phase: 'list', found: 0 }; renderSoon();
    const changedNow = new Set(dirty); dirty.clear();
    // what's in Dropbox
    const remote = {};
    const all = await remoteFiles(), orphan = bookless(all);
    for (const [k, v] of Object.entries(all)) if (tracked(v.rel) && !orphan(k)) remote[k] = { ...v };
    // a whole project deleted on this device stays in Dropbox (and on the PC); it just stops syncing here
    const hereList = (await FS.list('Unwip')).dirs;
    const hereDirs = new Set(hereList.map(x => x.toLowerCase()));
    // "removed here" means a book deleted on this device, so it isn't fetched back. If a book of that name is on this
    // device again (imported or made again), it's a book to sync, not a deleted one.
    const hereNow = new Set();
    for (const d of hereList) if (await FS.exists(LOCAL + d + '/project.json').catch(() => false)) hereNow.add(d.toLowerCase());
    if ((st.removedHere || []).some(n => hereNow.has(n.toLowerCase()))) { st.removedHere = st.removedHere.filter(n => !hereNow.has(n.toLowerCase())); await persist(); }
    for (const k of Object.keys(st.records)) {
      const m = /^([^/]+)\/project\.json$/.exec(k);
      if (m && !hereDirs.has(m[1])) {
        const name = (remote[k] && remote[k].rel.split('/')[0]) || m[1];
        st.removedHere = [...new Set([...(st.removedHere || []), name])];
        for (const r of Object.keys(st.records)) if (r.startsWith(m[1] + '/')) delete st.records[r];
        for (const r of Object.keys(remote)) if (r.startsWith(m[1] + '/')) delete remote[r];
      }
    }
    // what's here
    const local = {};
    for (const p of await FS.keys(LOCAL)) { const rel = p.slice(LOCAL.length); if (tracked(rel)) local[rel.toLowerCase()] = { rel }; }
    await binDeletedElsewhere(remote, local);
    const keys = [...new Set([...Object.keys(remote), ...Object.keys(local), ...Object.keys(st.records)])]
      .sort((a, b) => (/^[^/]+\/project\.json$/.test(b) ? 1 : 0) - (/^[^/]+\/project\.json$/.test(a) ? 1 : 0) || (/\/docs\//.test(b) ? 1 : 0) - (/\/docs\//.test(a) ? 1 : 0));
    // "left" counts only files with something to do: unchanged ones on both sides are skipped in a moment and used to
    // make the number jump up at the start of every sync
    const idle = k => { const rec = st.records[k]; return !!(local[k] && remote[k] && rec && rec.hash && !changedNow.has(k) && rec.rev === remote[k].rev); };
    const todo = keys.filter(k => !idle(k) && !dropping.has(k.split('/')[0])).length; let done = 0; progress = { phase: 'files', done, todo, down: 0, up: 0 }; renderSoon();
    const touched = new Set();
    const one = async k => {
      if (dropping.has(k.split('/')[0])) return;   // a book being deleted everywhere: the rest of its upload is skipped
      const R = remote[k], L = local[k], rec = st.records[k];
      if (idle(k)) return;   // nothing happened on either side
      progress.done = Math.min(todo, ++done); renderSoon();
      if (done % 40 === 0) { await persist(); if (touched.size) { tell(touched); touched.clear(); } }   // a closed app or lost signal picks up from here
      let lb = null, lh = null;
      if (L) {
        if (rec && rec.hash && !changedNow.has(k) && R && rec.rev === R.rev) return;   // nothing happened on either side
        lb = asBytes(await FS.read(LOCAL + L.rel)); lh = await contentHash(lb);
      }
      if (R && L) {
        if (lh === R.hash) { st.records[k] = { rev: R.rev, hash: lh, ...shapeOf(k, lb) }; return; }
        const remoteChanged = !rec || rec.rev !== R.rev, localChanged = !rec || rec.hash !== lh;
        if (localChanged && !remoteChanged) { await push(k, L.rel, lb, lh, rec.rev); return; }
        await pull(k, R, touched, localChanged && remoteChanged ? lb : null);
      } else if (R && !L) {
        if (rec && rec.rev === R.rev) { await remove(R.rel); delete st.records[k]; }      // deleted here: delete there too (Dropbox keeps it 30 days)
        else await pull(k, R, touched);
      } else if (L && !R) {
        if (!rec && st.refused && st.refused[k] === lh) return;   // a file Dropbox wouldn't take, unchanged since
        if (rec && rec.hash === lh) { await rawRemove(LOCAL + L.rel); delete st.records[k]; touched.add(L.rel); }   // deleted on the other device
        else await push(k, L.rel, lb, lh, undefined);
      } else delete st.records[k];
    };
    // Each book's project file goes first, on its own (so another device never sees chapters it can't place yet);
    // the rest go a few at a time. One at a time, a big book on a phone took minutes: each file is its own trip to
    // Dropbox. Four at once is well inside what Dropbox allows, and a "slow down" from Dropbox is waited out as before.
    const first = keys.filter(k => /^[^/]+\/project\.json$/.test(k)), rest = keys.filter(k => !/^[^/]+\/project\.json$/.test(k));
    for (const k of first) await one(k);
    let next = 0;
    const worker = async () => { while (next < rest.length) await one(rest[next++]); };
    await Promise.all([worker(), worker(), worker(), worker()]);
    st.last = Date.now(); progress = null; news = false; newsBooks = new Set();
    if (!dirty.size) { st.pending = false; st.waiting = []; } else st.waiting = [...new Set([...dirty].map(r => r.split('/')[0]))];
    bookMarks();
    await persist();
    if (touched.size) tell(touched);
  }
  // what's in Dropbox. The first time, everything is listed; after that Dropbox is only asked what changed since
  // (much quicker on a phone, and no "Checking… 2,000" every time)
  function applyEntries(cache, entries) {
    for (const e of entries) {
      const k = e.path_lower.slice(REMOTE.length + 1);
      if (e['.tag'] === 'deleted') { delete cache[k]; for (const x of Object.keys(cache)) if (x.startsWith(k + '/')) delete cache[x]; continue; }
      if (e['.tag'] !== 'file') continue;
      const rel = e.path_display.slice(REMOTE.length + 1);
      if (shaped(rel)) cache[k] = { rel, rev: e.rev, hash: e.content_hash, lower: e.path_lower }; else delete cache[k];
    }
  }
  async function remoteFiles() {
    if (st.cursor && st.remote) {
      const cache = { ...st.remote };
      let r = await rpc('/files/list_folder/continue', { cursor: st.cursor });
      if (r.ok) {
        let j = await r.json(); applyEntries(cache, j.entries);
        while (j.has_more) { r = await rpc('/files/list_folder/continue', { cursor: j.cursor }); if (!r.ok) throw new Error('Dropbox list failed (' + r.status + ')'); j = await r.json(); applyEntries(cache, j.entries); }
        st.remote = cache; st.cursor = j.cursor; return cache;
      }
      if (r.status !== 409) throw new Error('Dropbox list failed (' + r.status + ')');   // 409: Dropbox wants a fresh start
    }
    const cache = {};
    let r = await rpc('/files/list_folder', { path: REMOTE, recursive: true, include_deleted: false, limit: 2000 });
    if (r.status === 409) { st.remote = {}; st.cursor = null; return {}; }
    if (!r.ok) throw new Error('Dropbox list failed (' + r.status + ')');
    let j = await r.json(), n = j.entries.length; applyEntries(cache, j.entries); progress.found = n; renderSoon();
    while (j.has_more) { r = await rpc('/files/list_folder/continue', { cursor: j.cursor }); if (!r.ok) throw new Error('Dropbox list failed'); j = await r.json(); applyEntries(cache, j.entries); n += j.entries.length; progress.found = n; renderSoon(); }
    st.remote = cache; st.cursor = j.cursor; return cache;
  }
  // files in Dropbox that belong to no book (a book deleted on a PC whose last few files hadn't gone yet) are left alone
  const bookless = cache => { const books = new Set(Object.keys(cache).filter(k => /^[^/]+\/project\.json$/.test(k)).map(k => k.split('/')[0])); return k => !k.startsWith('_build/') && !k.startsWith('_settings/') && !books.has(k.split('/')[0]); };
  // which books are different in Dropbox from what this device last synced? Same content under a new version number
  // isn't a change. ("_build" stands for the Build pieces.)
  let newsBooks = new Set();
  function changedBooks(cache) {
    const orphan = bookless(cache), out = new Set();
    for (const [k, R] of Object.entries(cache)) {
      if (!tracked(R.rel) || orphan(k)) continue;
      const rec = st.records[k];
      if (!rec || (rec.rev !== R.rev && rec.hash !== R.hash)) out.add(k.split('/')[0]);
    }
    for (const k of Object.keys(st.records)) if (!cache[k] && tracked(k)) out.add(k.split('/')[0]);   // deleted on another device
    return out;
  }
  // ask Dropbox what changed since the last look (brings nothing in). true when the answer is fresh.
  let lookP = null;
  function look() {
    if (lookP) return lookP;
    lookP = (async () => {
      if (!connected() || !st.cursor || !st.remote) return false;
      try {
        const cache = { ...st.remote };
        let r = await rpc('/files/list_folder/continue', { cursor: st.cursor });
        if (r.status === 409) { news = true; newsBooks = new Set(['*']); render(); return true; }   // Dropbox wants a fresh start: treat everything as changed
        if (!r.ok) return false;
        let j = await r.json(); applyEntries(cache, j.entries);
        while (j.has_more) { r = await rpc('/files/list_folder/continue', { cursor: j.cursor }); if (!r.ok) return false; j = await r.json(); applyEntries(cache, j.entries); }
        if (running) return false;
        st.remote = cache; st.cursor = j.cursor; await persist();
        const before = [...newsBooks].join('|');
        newsBooks = changedBooks(cache); news = newsBooks.size > 0;
        if ([...newsBooks].join('|') !== before) bookMarks();
        lastError = ''; render(); return true;
      } catch (e) { return false; }
    })().finally(() => { lookP = null; });
    return lookP;
  }
  // has another device changed anything since the last sync?
  async function check() {
    if (!connected() || running || !st.cursor || !st.remote || auto()) return news;
    await look();
    return news;
  }
  async function push(k, rel, bytes, hash, rev) {
    if (progress) progress.up++;
    const res = await upload(rel, bytes, rev);
    if (res.refused) { st.refused = { ...(st.refused || {}), [k]: hash }; console.warn('Dropbox would not take a file', String(res.refused).slice(0, 80)); return; }   // not tried again until it changes
    if (res.conflict) { st.records[k] = { rev: 'conflict', hash: '' }; running && (running.again = true); dirty.add(k); return; }
    st.records[k] = { rev: res.rev, hash: res.content_hash || hash, ...shapeOf(k, bytes) };
  }
  // for a project file, remember how its binder looked when last in step with Dropbox
  const shapeOf = (k, bytes) => { if (!/^[^/]+\/project\.json$/.test(k)) return {}; const t = new TextDecoder().decode(bytes); return { shape: binderShape(t), extra: extrasOf(t) }; };
  // the other things a person writes that live in the project file: the timeline, continuity notes, links, and the
  // character sheets kept on binder entries (gear by chapter)
  const sheetsOf = p => { const out = []; const walk = l => (l || []).forEach(n => { if (n.csheet) out.push([n.id, n.csheet]); if (n.children) walk(n.children); }); walk(p.binder); return out.length ? out : null; };
  const extrasOf = json => { try { const p = JSON.parse(json); const t = p.timeline || {}; return JSON.stringify([t.events || null, t.calendar || null, (p.continuity && p.continuity.facts) || null, p.links || null, sheetsOf(p), p.bible || null]); } catch { return null; } };
  async function pull(k, R, touched, mine) {
    if (progress) progress.down++;
    const b = await download(R.lower);
    const localRel = R.rel;   // Dropbox's spelling of the name
    // the shared settings changed here and elsewhere: merge them (the newest change of each setting wins) and send
    // the merged file back, rather than keeping a copy beside it
    if (/^_settings\/shared\.json$/i.test(localRel) && (mine || dirty.has(k))) {
      const now = await FS.read(LOCAL + localRel), here = now != null ? now : (mine ? new TextDecoder().decode(mine) : '{}');
      const P = t => { try { const j = JSON.parse(t); return j && j.keys ? j : { keys: {} }; } catch { return { keys: {} }; } };
      const out = { v: 1, keys: { ...P(new TextDecoder().decode(b)).keys } };
      for (const [key, e] of Object.entries(P(here).keys)) if (!out.keys[key] || (e.at || 0) > (out.keys[key].at || 0)) out.keys[key] = e;
      await origWrite(LOCAL + localRel, JSON.stringify(out));
      st.records[k] = { rev: R.rev, hash: R.hash }; dirty.add(k); running && (running.again = true);
      touched.add(localRel); return;
    }
    if (mine) await keepMine(localRel, mine, b);
    // saved here while this sync was busy fetching it: keep that version too rather than writing over it
    if (dirty.has(k)) { const now = await FS.read(LOCAL + localRel); if (now != null && (!mine || await contentHash(asBytes(now)) !== await contentHash(mine))) await keepMine(localRel, asBytes(now), b); }
    await rawWrite(LOCAL + localRel, isText(localRel) ? new TextDecoder().decode(b) : b);
    st.records[k] = { rev: R.rev, hash: R.hash, ...shapeOf(k, b) };
    touched.add(localRel);
  }
  // both devices changed the same file: Dropbox's version wins, and this device's is kept beside it as
  // "name (iPad's conflicted copy DATE)", the way Dropbox does it on a PC. Chapters then show up in the project's
  // Conflicted copies section (on every device, once it syncs), and a binder clash gets the compare window.
  // the parts of a binder a person would notice: what's in it, in what order, with which names and notes
  const binderShape = json => { try { const p = JSON.parse(json); const walk = l => (l || []).map(n => [n.id, n.type, n.title || '', n.synopsis || '', n.status || '', n.label ? n.label.n : '', n.icon || '', n.noBook ? 1 : 0, n.type === 'folder' ? walk(n.children) : 0]); return JSON.stringify([p.title, walk(p.binder)]); } catch { return null; } };
  async function keepMine(rel, bytes, theirs) {
    // a Build piece changed on both devices: keep this device's version as its own piece, next to the other one
    const bm = /^_build\/items\/([\w-]+)\.json$/i.exec(rel);
    if (bm) {
      try {
        const mine = JSON.parse(new TextDecoder().decode(bytes)), other = theirs ? JSON.parse(new TextDecoder().decode(theirs)) : null;
        if (other && JSON.stringify({ ...mine, updated: 0, thumb: '' }) === JSON.stringify({ ...other, updated: 0, thumb: '' })) return;
        const id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        mine.id = id; mine.title = `${mine.title || 'Untitled'} (${DEVICE}’s version)`;
        await origWrite(`${LOCAL}_Build/items/${id}.json`, JSON.stringify(mine)); dirty.add(`_build/items/${id}.json`);
        try { window.__unwip.toast(`“${esc(mine.title)}”: it was changed on two devices, so both versions are kept in Build.`, 'warn', 9000); } catch {}
      } catch {}
      return;
    }
    // two devices both saving the project file is normal (it also holds where each was reading, word counts and the
    // like); only a real difference in the binder is worth asking about
    if (/^[^/]+\/project\.json$/.test(rel) && theirs) {
      const a = binderShape(new TextDecoder().decode(bytes)), b = binderShape(new TextDecoder().decode(theirs)), rec = st.records[rel.toLowerCase()];
      // the timeline, continuity notes and links changed here (since the last sync) and differently there: keep both
      const xa = extrasOf(new TextDecoder().decode(bytes)), xb = extrasOf(new TextDecoder().decode(theirs));
      const extrasClash = xa !== xb && !(rec && rec.extra && xa === rec.extra);
      if (!extrasClash && a && (a === b || (rec && rec.shape && a === rec.shape))) return;   // the same binder, or this device didn't change it since the last sync
    }
    const ts = Date.now(), day = new Date(ts).toLocaleDateString('en-CA');
    const m = /^(.*\/)?([^/]+?)(\.[^./]+)$/.exec(rel);
    let name = `${m[1] || ''}${m[2]} (${DEVICE.replace(/[()]/g, '')}'s conflicted copy ${day})${m[3]}`;
    if (await FS.exists(LOCAL + name)) name = name.replace(/\)(\.[^./]+)$/, ` ${ts})$1`);
    await rawWrite(LOCAL + name, isText(rel) ? new TextDecoder().decode(bytes) : bytes);
    const d = /^([^/]+)\/(docs\/[\w-]+\.html|project\.json)$/.exec(rel);
    if (d) conflicts.push({ slug: d[1] });
  }
  const conflicts = [];
  // let the open project know what arrived (reloads the chapter or binder, same as on the PC)
  function tell(touched) {
    for (const rel of touched) {
      const b = /^_build\/items\/([\w-]+)\.json$/i.exec(rel); if (b) { emit('build', { id: b[1] }); continue; }
      if (/^_settings\/shared\.json$/i.test(rel)) { emit('prefs', {}); continue; }
      const m = /^([^/]+)\/(project\.json|docs\/([\w-]+)\.html)$/.exec(rel); if (!m) continue;
      emit('external', { slug: m[1], file: m[2], id: m[3] || null });
    }
    try { const U = window.__unwip; if (U && !U.S.slug && !document.getElementById('library').classList.contains('hidden')) U.showLibrary(); } catch {}
    if (conflicts.length) {
      const slugs = [...new Set(conflicts.map(c => c.slug))]; conflicts.length = 0;
      for (const slug of slugs) emit('external', { slug, file: 'conflict', id: null });   // the open project sorts them out
    }
  }

  // ---------------------------------------------------------------- two devices on one project
  let presT = 0, folderCache = { slug: null, at: 0, entries: [] };
  async function folder(slug) {
    if (folderCache.slug === slug && Date.now() - folderCache.at < 25000) return folderCache.entries;
    const entries = await listAll(`${REMOTE}/${slug}`, false).catch(() => []);
    folderCache = { slug, at: Date.now(), entries }; return entries;
  }
  const mine = `.open-on-${DEVICE.replace(/[^\w-]/g, '')}.json`;
  const origPresence = F.presence, origOthers = F.othersOpen, origReq = F.requestTakeover, origCheck = F.checkTakeover;
  // One at a time, in order: a "still here" upload that was already on its way when the book was closed used to land
  // after the removal and bring the note back, so other devices thought the book was still open for two minutes.
  // `want` is what was asked for last; a queued upload for a book that has since been closed is skipped.
  let presQ = Promise.resolve();
  const want = {};
  F.presence = (slug, on) => {
    if (!connected()) return origPresence(slug, on);
    want[slug] = !!on;
    presQ = presQ.then(async () => {
      try {
        if (on) { if (!want[slug] || Date.now() - presT < 60000) return; presT = Date.now(); await upload(`${slug}/${mine}`, asBytes(JSON.stringify({ device: DEVICE, at: Date.now() })), null); }
        else { presT = 0; await remove(`${slug}/${mine}`); }
      } catch {}
    });
    return presQ.then(() => true);
  };
  F.othersOpen = async slug => {
    if (!connected()) return origOthers(slug);
    folderCache.at = 0;
    return (await folder(slug)).filter(e => /^\.open-on-.+\.json$/.test(e.name) && e.name !== mine && Date.now() - Date.parse(e.server_modified) < 120000)
      .map(e => ({ device: e.name.replace(/^\.open-on-|\.json$/g, ''), at: Date.parse(e.server_modified) }));
  };
  F.requestTakeover = async (slug, on) => {
    if (!connected()) return origReq(slug, on);
    try { if (on) await upload(`${slug}/.takeover.json`, asBytes(JSON.stringify({ by: DEVICE, at: Date.now() })), null); else await remove(`${slug}/.takeover.json`); } catch {}
    return true;
  };
  F.checkTakeover = async slug => {
    if (!connected()) return origCheck(slug);
    const e = (await folder(slug)).find(x => x.name === '.takeover.json');
    if (!e || Date.now() - Date.parse(e.server_modified) > 180000) return null;
    try { const t = JSON.parse(new TextDecoder().decode(await download(e.path_lower))); return t.by !== DEVICE ? t : null; } catch { return null; }
  };

  // ---------------------------------------------------------------- where books go, and deleting them
  const origCreate = F.createProject, origDelete = F.deleteProject, origRestore = F.restoreDeleted;
  const inDropbox = slug => connected() && !st.localOnly.some(x => x.toLowerCase() === String(slug).toLowerCase());
  // on the main screen, books in Dropbox come first, then the ones kept on this device only
  const origList = F.listProjects;
  F.listProjects = async () => { const waiting = new Set(((st && st.waiting) || []).map(x => x.toLowerCase())); return (await origList()).map(p => ({ ...p, ...(inDropbox(p.slug) ? { place: 'Dropbox', placeRank: 0, placePath: 'dropbox', unsynced: waiting.has(String(p.slug).toLowerCase()) ? DEVICE : '', elsewhere: !auto() && (newsBooks.has('*') || newsBooks.has(String(p.slug).toLowerCase())) } : { place: `This ${DEVICE}`, placeRank: 3, placePath: 'local' }) })); };
  F.projectPlaces = async () => connected() ? [{ path: 'dropbox', label: 'Dropbox', note: 'also on your PC and other devices', main: true }, { path: 'local', label: `This ${DEVICE} only`, note: 'not synced' }] : [];
  F.createProject = async (title, template, place) => {
    const slug = await origCreate(title, template);
    if (st && st.removedHere) { st.removedHere = st.removedHere.filter(x => x.toLowerCase() !== String(slug).toLowerCase()); await persist(); }
    if (place === 'local' && connected()) { st.localOnly = [...new Set([...st.localOnly, slug])]; await persist(); }
    return slug;
  };
  // moving a book in or out of Dropbox on this device
  F.moveProject = async (slug, place) => {
    if (!connected()) throw new Error('Connect Dropbox first.');
    const low = String(slug).toLowerCase();
    if (place === 'dropbox') { st.localOnly = st.localOnly.filter(x => x.toLowerCase() !== low); st.removedHere = (st.removedHere || []).filter(x => x.toLowerCase() !== low); await persist(); await sync(); return slug; }
    // out of Dropbox: keep it here only, and move Dropbox's copy to its Deleted books (so the PC has it there)
    await sync().catch(() => {});
    st.localOnly = [...new Set([...st.localOnly, slug])];
    for (const k of Object.keys(st.records)) if (k.startsWith(low + '/')) delete st.records[k];
    await persist();
    const r = await rpc('/files/move_v2', { from_path: `${REMOTE}/${slug}`, to_path: `${REMOTE}/_Deleted/${Date.now()} ${slug}`, autorename: true, allow_ownership_transfer: false });
    if (!r.ok && r.status !== 409) throw new Error('It’s kept on this device only now, but Dropbox couldn’t be told (' + r.status + ').');
    return slug;
  };
  F.deleteChoices = async slug => inDropbox(slug) ? { note: `It’s also in Dropbox. Delete it on this ${DEVICE} only (it stays on your PC and other devices), or everywhere (they keep it in their Deleted books).`, buttons: [`This ${DEVICE} only`, 'Everywhere'] } : null;
  F.deleteProject = async (slug, opts = {}) => {
    const synced = inDropbox(slug), low = String(slug).toLowerCase();
    if (synced && opts.how === 1) {
      // deleted everywhere: nothing of it needs to reach Dropbox first. A sync that's still uploading it (a big book
      // just imported) skips the rest of it, and only the files already on their way are waited for (seconds, not minutes)
      dropping.add(low);
      try { if (running) await running.p.catch(() => {}); } catch {}
    } else if (synced) {
      // deleted on this device only: the other devices keep it, so Dropbox gets the latest of it first
      if (running && window.__unwip) window.__unwip.toast('Sending this book’s latest changes to Dropbox first, so your other devices keep it. It’s deleted here as soon as that’s done.');
      await sync().catch(() => {});
    }
    try { await origDelete(slug); } finally { if (!(synced && opts.how === 1)) dropping.delete(low); }
    if (synced && opts.how === 1) {
      const pre = String(slug).toLowerCase() + '/';
      for (const k of Object.keys(st.records)) if (k.startsWith(pre)) delete st.records[k];
      await persist();
      const r = await rpc('/files/move_v2', { from_path: `${REMOTE}/${slug}`, to_path: `${REMOTE}/_Deleted/${Date.now()} ${slug}`, autorename: true, allow_ownership_transfer: false });
      dropping.delete(low);
      if (!r.ok && r.status !== 409) throw new Error('Deleted here, but Dropbox couldn’t be told (' + r.status + '). Try again later from Deleted books.');
    }
    st.localOnly = st.localOnly.filter(x => x.toLowerCase() !== String(slug).toLowerCase()); await persist();
    return true;
  };
  // bringing back a book deleted on this device only: Dropbox still has it, up to date, so it comes from there
  F.restoreDeleted = async id => {
    const name = String(id).replace(/^\d{12,}\s/, ''), here = (st.removedHere || []).find(x => x.toLowerCase() === name.toLowerCase());
    if (here && connected()) { st.removedHere = st.removedHere.filter(x => x !== here); await persist(); await F.purgeDeleted(id); await sync(); return here; }
    return origRestore(id);
  };
  // a whole book deleted on another device: keep this device's copy in Deleted books before it goes from here
  async function binDeletedElsewhere(remote, local) {
    const gone = [];
    for (const k of Object.keys(st.records)) {
      const m = /^([^/]+)\/project\.json$/.exec(k); if (!m || remote[k] || !local[k]) continue;
      const slug = local[k].rel.split('/')[0], U = window.__unwip;
      let wasOpen = false; try { if (U && U.S.slug && U.S.slug.toLowerCase() === slug.toLowerCase()) { wasOpen = true; await U.leaveProject(); } } catch {}
      const title = ((await FS.json(`${LOCAL}${slug}/project.json`, {})) || {}).title || slug;
      const to = `${LOCAL}_Deleted/${Date.now()} ${slug}`;
      await FS.copyTree(`${LOCAL}${slug}`, to); await rawWrite(`${to}/.deleted.json`, JSON.stringify({ title, at: Date.now(), by: 'another device' }));
      await FS.removeTree(`${LOCAL}${slug}`);
      for (const r of Object.keys(st.records)) if (r.startsWith(m[1] + '/')) delete st.records[r];
      for (const r of Object.keys(local)) if (r.startsWith(m[1] + '/')) delete local[r];
      gone.push(title);
      if (wasOpen) try { U.showLibrary(); } catch {}
    }
    if (gone.length) {
      await persist();
      try { const U = window.__unwip; if (!U.S.slug) U.showLibrary(); U.toast(`${gone.map(t => `“${esc(t)}”`).join(', ')} ${gone.length === 1 ? 'was' : 'were'} deleted on another device. ${gone.length === 1 ? 'It’s' : 'They’re'} in Deleted books here too, to bring back if you need.`, 'warn', 12000); } catch {}
    }
    return gone;
  }

  // ---------------------------------------------------------------- connecting
  const standalone = () => !!(navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches));
  const redirectUri = () => location.origin + location.pathname.replace(/index\.html$/, '');
  async function pkce() {
    const v = b64url(crypto.getRandomValues(new Uint8Array(48)));
    const c = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v))));
    return { v, c };
  }
  // signing in to Dropbox, shared with the Scrivener import's own read-only sign-in (dbximport.js): the page to send
  // you to, and swapping its code (or a refresh token) for a sign-in. Checked by tests/sync/dbxsignin.py.
  const authorizeURL = (key, challenge, extra) => 'https://www.dropbox.com/oauth2/authorize?' + new URLSearchParams({ client_id: key, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', token_access_type: 'offline', ...(extra || {}) });
  const tokenRequest = params => fetch('https://api.dropboxapi.com/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });
  const exchange = (key, code, verifier, redirect) => tokenRequest({ code, grant_type: 'authorization_code', client_id: key, code_verifier: verifier, ...(redirect ? { redirect_uri: redirect } : {}) });
  const refreshRequest = (key, refresh) => tokenRequest({ grant_type: 'refresh_token', refresh_token: refresh, client_id: key });
  // on a Home Screen app, Dropbox can't send you back into the app, so it shows a code to copy instead
  async function connect() {
    const U = window.__unwip;
    if (!KEY) { setupNeeded(); return; }
    const { v, c } = await pkce(); const state = b64url(crypto.getRandomValues(new Uint8Array(12)));
    if (standalone()) {
      // a Home Screen app may only open another page from a direct tap, so this is a real link to tap
      const url = authorizeURL(KEY, c);
      const body = document.createElement('div');
      body.innerHTML = `<ol class="dbx-steps"><li>Tap <b>Open Dropbox</b>. Sign in and tap <b>Allow</b>.</li><li>Dropbox shows a code. Copy it.</li><li>Come back here and paste it below.</li></ol>
        <p><a class="btn primary dbx-open" href="${url}" target="_blank" rel="noopener">Open Dropbox</a></p>
        <div class="field"><input type="text" id="dbx-code" placeholder="Paste the code from Dropbox" autocomplete="off" autocapitalize="off" spellcheck="false"></div>`;
      const ok = await U.modal({ title: 'Connect Dropbox', body, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Connect', value: true, kind: 'primary' }] });
      const code = ok && body.querySelector('#dbx-code').value.trim();
      if (code) await finish(code, v, null);
    } else {
      sessionStorage.setItem('unwip-dbx', JSON.stringify({ v, state }));
      location.href = authorizeURL(KEY, c, { redirect_uri: redirectUri(), state });
    }
  }
  async function finish(code, verifier, redirect) {
    const U = window.__unwip;
    const r = await exchange(KEY, code, verifier, redirect);
    if (!r.ok) { U.toast('Dropbox didn’t accept that. Try connecting again (the code only works once, for a few minutes).', 'warn', 9000); return; }
    const j = await r.json();
    await load();
    Object.assign(st, { access: j.access_token, refresh: j.refresh_token, exp: Date.now() + (j.expires_in || 14400) * 1000, account: j.account_id, broken: false, records: {}, since: Date.now() });
    await persist();
    try { const a = await (await rpc('/users/get_current_account', null)).json(); st.email = a.email; st.name = a.name && a.name.display_name; await persist(); } catch {}
    await firstSync();
  }
  // the first time: projects only on this device can go up to Dropbox, or stay here
  async function firstSync() {
    const U = window.__unwip;
    const here = (await FS.list('Unwip')).dirs.filter(d => !d.startsWith('_'));
    const there = new Set((await listAll(REMOTE, false).catch(() => [])).filter(e => e['.tag'] === 'folder').map(e => e.name.toLowerCase()));
    const onlyHere = here.filter(d => !there.has(d.toLowerCase()));
    if (onlyHere.length) {
      const body = document.createElement('div');
      body.innerHTML = `<p>${onlyHere.length === 1 ? 'This project is' : 'These projects are'} only on this ${esc(DEVICE)}:</p><ul class="dbx-list">${onlyHere.map(d => `<li><label class="check"><input type="checkbox" value="${esc(d)}" checked> ${esc(d)}</label></li>`).join('')}</ul>
        <p class="sy-note">Ticked ones are added to Dropbox, so they’ll show up on your PC too. Unticked ones stay on this ${esc(DEVICE)} only.</p>`;
      await U.modal({ title: 'Add these to Dropbox?', body, buttons: [{ label: 'Continue', value: true, kind: 'primary' }] });
      st.localOnly = [...body.querySelectorAll('input:not(:checked)')].map(i => i.value);
      await persist();
    }
    const bar = document.createElement('div');
    bar.innerHTML = `<div class="dbx-first"><span class="sy-spin"></span><div><b>Bringing your books from Dropbox…</b><span id="dbx-prog">Starting</span></div></div>`;
    const p = U.modal({ title: 'Connected to Dropbox', body: bar, buttons: [{ label: 'Carry on in the background', value: true, kind: 'ghost' }] });
    const tick = setInterval(() => { const el = bar.querySelector('#dbx-prog'); if (el && progress) el.textContent = progressText(); }, 300);
    const ok = await sync();
    clearInterval(tick);
    document.querySelectorAll('.modal-back').forEach(m => { if (m.contains(bar)) { const b = m.querySelector('.btn'); if (b) b.click(); } });
    await p;
    U.toast(ok ? 'Dropbox is connected. Your books are in step with your PC.' : 'Connected, but the first sync hit a problem: ' + lastError, ok ? '' : 'warn', 9000);
    try { if (!U.S.slug) U.showLibrary(); } catch {}
  }
  async function disconnect() {
    const U = window.__unwip;
    const ok = await U.modal({ title: 'Disconnect Dropbox?', body: `<p>Your books stay on this ${esc(DEVICE)} and in Dropbox. They just stop syncing until you connect again.</p>`, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Disconnect', value: true, kind: 'primary' }] });
    if (!ok) return;
    try { await rpc('/auth/token/revoke', null); } catch {}
    st = { records: {}, localOnly: [], removedHere: [] }; await persist(); render();
  }
  function setupNeeded() {
    // Unwip Dev (the test copy) is kept away from real books on purpose: say so, instead of a setup step that never comes
    if (window.UNWIP_DEV) return window.__unwip.modal({ title: 'Dropbox is off in Unwip Dev', body: `<p>Unwip Dev is the test copy of Unwip. So that testing can never change your real books, it doesn’t connect to Dropbox, and its books stay on this device.</p><p>For your real books, use the normal Unwip. To try something on a real book here, bring a copy in with Import.</p>`, buttons: [{ label: 'OK', value: true, kind: 'primary' }] });
    window.__unwip.modal({ title: 'Dropbox needs one setup step', body: `<p>Before this version can reach your Dropbox, Unwip has to be registered with Dropbox (a free, two-minute step on dropbox.com). Once that’s done, this button will connect straight away.</p>`, buttons: [{ label: 'OK', value: true, kind: 'primary' }] });
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------------------------------------------------------------- what you see: a status pill on the main screen and a Settings card
  const ago = t => { if (!t) return 'not yet'; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(t).toLocaleDateString(); };
  function statusText(short) {
    if (!KEY && window.UNWIP_DEV) return { cls: 'off', text: short ? 'Off' : 'Dropbox is off in Dev' };
    if (!st || !connected()) return { cls: 'off', text: 'Connect Dropbox' };
    if (st.broken) return { cls: 'warn', text: 'Dropbox: sign in again' };
    if (st.needsUpdate && !running) return { cls: 'warn', text: short ? 'Update Unwip to sync' : 'Update Unwip to keep syncing (close and reopen it)' };
    if (running) return { cls: 'busy', text: progressText(short) };
    if (lastError) return { cls: 'warn', text: navigator.onLine === false ? (auto() ? 'Offline · will sync later' : 'Offline') : 'Dropbox: couldn’t sync' };
    if (!auto() && news) return { cls: 'news', text: short ? 'Changed elsewhere · Sync' : 'Changed on another device. Sync to bring it in.' };
    if (!auto() && st.pending) return { cls: 'pending', text: short ? 'Not synced · Sync' : 'Changes on this device aren’t in Dropbox yet.' };
    return { cls: 'ok', text: `Synced ${ago(st.last)}` };
  }
  const CLOUD = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 9.2 4.4 4.4 0 0 0 7 18z"/></svg>';
  function render() {
    const head = document.querySelector('.lib-head-right'); if (!head) return;
    let pill = document.getElementById('dbx-pill');
    if (!pill) { pill = document.createElement('button'); pill.id = 'dbx-pill'; pill.className = 'dbx-pill'; head.insertBefore(pill, head.firstChild); pill.onclick = pillClick; }
    const s = statusText(true);
    const mark = s.cls === 'news' ? '<b class="dbx-warn">⚠</b>' : s.cls === 'pending' ? '<i class="dbx-dot"></i>' : '';
    pill.className = 'dbx-pill ' + s.cls; pill.innerHTML = CLOUD + mark + `<span>${esc(s.text)}</span>`;
    // in the writing screen, a small cloud button beside the book's name (same states, tap to sync)
    const tb = document.querySelector('#workspace .tb-left');
    let mini = document.getElementById('dbx-mini');
    if (tb && connected() && !mini) { mini = document.createElement('button'); mini.id = 'dbx-mini'; mini.className = 'icon-btn dbx-mini'; tb.appendChild(mini); mini.onclick = pillClick; }
    if (mini) { if (!connected()) mini.remove(); else { mini.className = 'icon-btn dbx-mini ' + s.cls; mini.innerHTML = CLOUD + mark; mini.title = statusText().text + (running ? '' : ' Tap to sync.'); } }
    pill.title = connected() ? `Dropbox${st.email ? ' · ' + st.email : ''}. Tap to sync now.` : 'Keep your books in step with your PC through Dropbox';
    const card = document.getElementById('dbx-card'); if (card) fillCard(card);
  }
  function pillClick() { if (!connected() || st.broken) connect(); else sync(); }
  function fillCard(card) {
    const s = statusText();
    card.innerHTML = connected()
      ? `<div class="sy-cur"><span class="sy-ic">📦</span><div><b>Dropbox</b> <em class="sy-badge">${st.broken ? 'sign in again' : 'connected'}</em><span class="sy-path">${esc(st.email || 'Connected')} · ${esc(s.text)}</span></div></div>
         ${lastError ? `<p class="sy-note">Last problem: ${esc(lastError)}</p>` : ''}
         ${st.localOnly.length ? `<p class="sy-note">Kept on this ${esc(DEVICE)} only: ${st.localOnly.map(esc).join(', ')}</p>` : ''}
         ${st.removedHere.length ? `<p class="sy-note">Deleted on this ${esc(DEVICE)} but still in Dropbox: ${st.removedHere.map(esc).join(', ')}. <button class="link-btn" type="button" data-dbx="restore">Bring back</button></p>` : ''}
         <label class="check sy-auto"><input type="checkbox" id="dbx-auto" ${auto() ? 'checked' : ''}><span>Sync by itself while I write. Off: tap <b>Sync</b> when you want to, and a ⚠ shows when another device has changed something.</span></label>
         <div class="sy-moves"><button class="btn primary" type="button" data-dbx="${st.broken ? 'connect' : 'sync'}">${st.broken ? 'Sign in to Dropbox again' : 'Sync now'}</button><button class="btn ghost" type="button" data-dbx="off">Disconnect</button></div>
         <p class="sy-note sy-alert hidden" id="dbx-empty">No books in your Dropbox yet. Unwip uses the folder <b>Dropbox › Apps › Unwip</b>. If your PC or Mac keeps its books somewhere else (like Dropbox › Unwip), open Settings there › Where your books live › <b>Sync with Dropbox (shared with the phone and iPad)</b>, then tap Sync now here.</p>
         <p class="sy-note">Chapters, the binder, pictures and snapshots sync with the Unwip folder in your Dropbox (Dropbox › Apps › Unwip), the same one your PC or Mac uses (there: Settings › Where your books live › Sync with Dropbox (shared with the phone and iPad)). If a chapter is changed on both at once, nothing is lost: the other version goes into Snapshots.</p>`
      : `<div class="sy-cur"><span class="sy-ic">📱</span><div><b>On this ${esc(DEVICE)} only</b><span class="sy-path">Saved inside this app. Connect Dropbox to work on the same books as your PC.</span></div></div>
         <div class="sy-moves"><button class="btn primary" type="button" data-dbx="connect">Connect Dropbox</button></div>`;
    const restore = async () => { st.removedHere = []; await persist(); sync(); };
    card.querySelectorAll('[data-dbx]').forEach(b => b.onclick = () => ({ connect, sync, off: disconnect, restore })[b.dataset.dbx]());
    const empty = card.querySelector('#dbx-empty');
    if (empty) FS.list('Unwip').then(l => { if (!l.dirs.some(d => !d.startsWith('_'))) empty.classList.remove('hidden'); }).catch(() => {});
    const ac = card.querySelector('#dbx-auto'); if (ac) ac.onchange = async () => { st.auto = ac.checked; await persist(); if (st.auto) sync(); else check(); render(); };
  }

  // ---------------------------------------------------------------- opening a book: bring in other devices' changes first
  // Like Scrivener: if another device changed the book, sync before it opens, so you never write in an old copy.
  // Without a connection, say so (once per book while offline) and let you choose.
  const offlineWarned = new Set();
  window.addEventListener('online', () => offlineWarned.clear());
  async function waitFor(text, promise) {
    const U = window.__unwip, body = document.createElement('div');
    body.innerHTML = `<div class="sy-wait"><span class="sy-spin"></span><div><b>${esc(text)}</b><span>${esc(progressText(false))}</span></div></div>`;
    const tick = setInterval(() => { const sp = body.querySelector('.sy-wait span:last-child'); if (sp) sp.textContent = progressText(false); }, 400);
    let back = null;
    const asked = U.modal({ title: 'One moment', body, onOpen: b => { back = b; }, buttons: [{ label: 'Open without waiting', value: 'skip', kind: 'ghost' }] });
    const r = await Promise.race([promise.then(v => ({ v })), asked.then(v => ({ skip: v === 'skip' || v === null }))]);
    clearInterval(tick); if (back && back.isConnected) back.remove();
    return r;
  }
  async function openGate(slug) {
    if (!connected() || !inDropbox(slug)) return true;
    const U = window.__unwip, key = String(slug).toLowerCase();
    const title = (((await FS.json(`${LOCAL}${slug}/project.json`, null)) || {}).title) || slug;
    if (running) { const r = await waitFor('Finishing the sync first…', running.p); if (r.skip) return true; }
    const online = navigator.onLine !== false;
    const fresh = online && (st.cursor ? await look() : false);
    const needs = !st.cursor || newsBooks.has('*') || newsBooks.has(key);
    if (online && (fresh || !st.cursor) && needs) {
      const r = await waitFor(`Bringing in changes to “${title}” from your other devices…`, sync());
      if (r.skip || r.v) return true;
      return !!(await U.modal({ title: 'Couldn’t sync first', body: `<p>“${esc(title)}” was changed on another device, and those changes couldn’t be brought in just now${lastError ? ` (${esc(lastError)})` : ''}.</p><p>If you write in it now, you may have two versions to choose between later.</p>`,
        buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Open anyway', value: true, kind: 'primary' }] }));
    }
    if (fresh) return true;                                   // checked, and nothing new for this book
    if (offlineWarned.has(key)) return true;
    offlineWarned.add(key);
    return !!(await U.modal({ title: online ? 'Couldn’t check Dropbox' : 'You’re offline', body: `<p>Unwip can’t reach Dropbox right now, so if “${esc(title)}” was changed on another device, those changes aren’t on this ${esc(DEVICE)} yet.</p><p>You can still write. If the other device changed it too, you’ll get both versions to choose between when you’re back online.</p>`,
      buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Open anyway', value: true, kind: 'primary' }] }));
  }
  window.UnwipOpenGate = openGate;

  // ---------------------------------------------------------------- start up
  (async () => {
    await load();
    // back from Dropbox's sign-in page
    const q = new URLSearchParams(location.search);
    if (q.get('code') && /^imp_/.test(q.get('state') || '')) { /* back from the import's own sign-in: dbximport.js finishes it */ }
    else if (q.get('code')) {
      const saved = JSON.parse(sessionStorage.getItem('unwip-dbx') || 'null'); sessionStorage.removeItem('unwip-dbx');
      history.replaceState(null, '', location.pathname);
      if (saved && q.get('state') === saved.state) setTimeout(() => finish(q.get('code'), saved.v, redirectUri()), 800);
    } else if (q.get('error')) history.replaceState(null, '', location.pathname);
    render();
    const wake = () => { if (!connected()) return render(); if (auto()) sync({ quiet: true }); else check(); };
    if (connected()) setTimeout(wake, 1500);
    setInterval(() => { if (!document.hidden) wake(); else render(); }, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
    window.addEventListener('online', wake);
    try {
      const U = window.__unwip;
      // leaving a book with changes that only this device has: say so, once
      U.on('leave', () => { if (connected() && !auto() && st.pending) setTimeout(() => U.toastAction(`Some changes are only on this ${DEVICE} so far.`, 'Sync now', () => sync()), 400); render(); });
      // opening a book when another device has changed things: offer to bring them in first
      U.on('project', async () => { render(); if (connected() && !auto() && (news || await check())) U.toastAction('Another device has changed things since you last synced.', 'Sync now', () => sync(), 15000); });
    } catch {}
    setTimeout(safariWarning, 5000);
  })();

  // Safari on an iPhone or iPad clears a website's saved data after 7 days without a visit (a Home Screen app is
  // exempt). With no Dropbox copy that would be the whole library, so say so, now and then, until one is set up.
  async function safariWarning() {
    try {
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
      if (!ios || standalone() || connected()) return;
      const last = +(localStorage.getItem('unwip-safari-warned') || 0); if (Date.now() - last < 14 * 86400000) return;
      if (!(await F.listProjects()).length) return;
      if (document.getElementById('library').classList.contains('hidden')) return setTimeout(safariWarning, 60000);   // wait for the main screen, not over a chapter
      localStorage.setItem('unwip-safari-warned', String(Date.now()));
      const U = window.__unwip, msg = `Safari can clear what a website has saved if it isn’t opened for 7 days, and your books are saved in Safari. To keep them safe${KEY ? ', connect Dropbox' : ''}, and add Unwip to your Home Screen (the Share button, then “Add to Home Screen”). A book written in Safari stays in Safari: the Home Screen app starts empty, so bring books across with Dropbox or a backup file.`;
      if (KEY) U.toastAction(msg, 'Connect Dropbox', () => connect(), 12000); else U.toast(msg, 'warn', 12000);
    } catch {}
  }

  return { connect, disconnect, sync, check, render, fillCard, hold, get progress() { return progress; }, connected: () => connected(), get state() { return st; }, get lastError() { return lastError; }, hasKey: !!KEY,
    signIn: { b64url, standalone, redirectUri, pkce, authorizeURL, exchange, refreshRequest } };
})();
