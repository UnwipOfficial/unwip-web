window.UNWIP_DEV = true;
(function () { const P = 'dev:', S = Storage.prototype, g = S.getItem, s = S.setItem, r = S.removeItem;
  S.getItem = function (k) { return g.call(this, P + k); }; S.setItem = function (k, v) { return s.call(this, P + k, v); }; S.removeItem = function (k) { return r.call(this, P + k); }; })();
window.UNWIP_VERSION = "0.45.7";
window.UNWIP_LATEST_NOTES = "- Back to where you were: follow a link (a name, Appears in, a map pin, a search result) and a \"\u2190 Back to \u2026\" chip shows at the top of the page. It takes you back to the same spot, and Forward goes again. Hover it on a computer to jump back several pages. Alt+\u2190 / Alt+\u2192 (Cmd+[ / Cmd+] on a Mac) and a mouse's back and forward buttons do the same.\n- Import: chapter names keep numbers that are part of the name, so \"3.3-001 - Crash and Burn\" no longer comes in as \"3-001\".\n- Import: \"Anything else to bring in?\" adds a folder of notes, research or world-building kept apart from your chapters. They go into Notes, ready to sort.\n- Import: Markdown with Pandoc styling marks for Word (::: {custom-style=\u2026} lines, [words]{.underline}) gets a \"Tidy away\" tick. The ::: lines go, the words inside stay, and {.underline} becomes real underlining.\n- Import: the Characters step shows every name it found. The surest come first, the rest are under \"More names, less sure\", and there's a reminder that you can make a page for anyone later.\n- After an import, a short look round shows where your characters are, where they turn up, and where everything else went. It shows once.\n- Import / Export now also sits next to New book on a computer.\n- A book no longer closes as \"deleted on another device\" when Dropbox only swaps its file for a moment, and the message only says it's in Deleted books when it really is.\n- iPhone: the Bring in your book screen fits the width, and the \u2715 no longer covers Cancel.";
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
