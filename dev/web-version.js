window.UNWIP_DEV = true;
(function () { const P = 'dev:', S = Storage.prototype, g = S.getItem, s = S.setItem, r = S.removeItem;
  S.getItem = function (k) { return g.call(this, P + k); }; S.setItem = function (k, v) { return s.call(this, P + k, v); }; S.removeItem = function (k) { return r.call(this, P + k); }; })();
window.UNWIP_VERSION = "0.44.95";
window.UNWIP_LATEST_NOTES = "- New: Send a book out. The button in the bottom right of the main screen is now Import / Export. Send a book out takes it a step at a time: pick the book and where it's going (Scrivener, Word, Google Docs, Obsidian or a Markdown folder), then the shape it arrives in. For Scrivener that's as Unwip has it, as it came in (for books brought in from Scrivener), or chapters only. For Word it's one file, a file per chapter, or a file for Vellum or Atticus.\n- Before anything is saved, \"What changes on the way out\" lists what travels in a different form, each with a tick box: character sheet gear as a list on each character's page, the Story Bible as one document, maps as pictures, comments in Scrivener's notes (or a Comments file), and in Obsidian the first mention of each character or place becomes a [[link]].\n- The last step counts the words in your manuscript here and the words that went out, so you can see every one made it.\n- Inside a book, Export \u203a No hard feelings\u2026 opens the same steps with that book already picked. Your book in Unwip never changes.";
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
