window.UNWIP_DEV = true;
(function () { const P = 'dev:', S = Storage.prototype, g = S.getItem, s = S.setItem, r = S.removeItem;
  S.getItem = function (k) { return g.call(this, P + k); }; S.setItem = function (k, v) { return s.call(this, P + k, v); }; S.removeItem = function (k) { return r.call(this, P + k); }; })();
window.UNWIP_VERSION = "0.45.0";
window.UNWIP_LATEST_NOTES = "Import room fixes from the iPhone list.\n- Manuscript: moving a chapter with \u2191 or \u2193 keeps your place in the list instead of jumping back to the top. You can also drag a chapter by its \u2261 to anywhere in the list, with a finger or the mouse.\n- Choosing where a document goes no longer jumps straight to the next one. It shows the result (\"Now in Places\", with that section's list and this document marked), and Next document moves you on when you're ready.\n- Each step shows how far you are (\"Document 2 of 6 \u00b7 1 done\") with a small bar, and ticks the ones you've done.\n- Pressing Next: Places and the rest (or Check it over) while some documents haven't been looked at gives a gentle reminder first, with \"Look at the next one\" or \"Move on anyway\".\n- \"+ New section\u2026\" under Where does it go? makes a section of your own (Factions, Magic, anything) and puts the document straight in it.\n- A list like \"Name - who they are\" is offered one page per person even when it's already in Characters, and lists of places or things are offered one page each too. A single character's sheet (Name, Age, Hair\u2026) isn't mistaken for a list.";
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
