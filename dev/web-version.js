window.UNWIP_DEV = true;
(function () { const P = 'dev:', S = Storage.prototype, g = S.getItem, s = S.setItem, r = S.removeItem;
  S.getItem = function (k) { return g.call(this, P + k); }; S.setItem = function (k, v) { return s.call(this, P + k, v); }; S.removeItem = function (k) { return r.call(this, P + k); }; })();
window.UNWIP_VERSION = "0.44.93";
window.UNWIP_LATEST_NOTES = "- New: the import room. \"Import a book\" now sits in the bottom right of the main screen and opens a room of its own. It takes it one step at a time: first your book comes in exactly as it is, then you go through your manuscript, your characters, then the places and notes, and a last check shows every word came across. Split a long chapter at its headings or keep it whole, set deleted scenes aside, turn a cast list into one page per person or keep it as one document, and make pages for names that come up a lot. Stop at any step: \"Sort the rest later\" keeps your place, and the button shows what's still to sort. You can turn the guide off in the room or in Settings.\n- New: fog of war, at Focus. The Fog button beside Focus / Detail / Lore hides the book except the chapter you're on and the next one. It asks where you're starting: your \"needs doing\" list (right-click a chapter \u203a Needs doing\u2026), where you left off, or story order. \"Done for now\" moves you on and ticks the chapter off, Look up finds a character or place without lifting the fog, and the fog lifts when your list is done.\n- Each book's \u22ef menu on the main screen has Export\u2026";
if ('serviceWorker' in navigator && location.protocol === 'https:') addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
(function () {
  if (location.protocol !== 'https:') return;
  let last = 0, offered = '';
  async function check() {
    if (Date.now() - last < 60000) return; last = Date.now();
    try {
      const t = await (await fetch('web-version.js?v=' + Date.now(), { cache: 'no-store' })).text();
      const m = t.match(/UNWIP_VERSION = "([^"]+)"/); const v = m && m[1];
      const U = window.__unwip; if (!v || v === window.UNWIP_VERSION || v === offered || !U || !U.toastAction) return;
      offered = v;
      let notes = ''; try { const n = t.match(/UNWIP_LATEST_NOTES = ("(?:[^"\\]|\\.)*");/); if (n) notes = JSON.parse(n[1]); } catch (e) {}
      const go = async () => { try { await U.flushSave(); if (U.saveMetaNow) await U.saveMetaNow(); } catch (e) {} if (U.saveFailing) { U.toast('Unwip can’t update yet: some writing isn’t saved (the bar at the top says why). It updates once saving works again.', 'warn', 9000); offered = ''; return; } location.reload(); };
      if (window.UnwipUpdates && window.UnwipUpdates.notice) window.UnwipUpdates.notice({ title: 'A new version of Unwip is ready', version: v, notes, action: 'Update now', run: go });
      else U.toastAction('A new version of Unwip is ready (' + v + ').', 'Update now', go, 60000);
    } catch (e) {}
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  addEventListener('load', () => setTimeout(check, 20000)); setInterval(check, 3600000);
})();
