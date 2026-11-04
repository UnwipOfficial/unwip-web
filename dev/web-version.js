window.UNWIP_DEV = true;
(function () { const P = 'dev:', S = Storage.prototype, g = S.getItem, s = S.setItem, r = S.removeItem;
  S.getItem = function (k) { return g.call(this, P + k); }; S.setItem = function (k, v) { return s.call(this, P + k, v); }; S.removeItem = function (k) { return r.call(this, P + k); }; })();
window.UNWIP_VERSION = "0.48.8";
window.UNWIP_LATEST_NOTES = "- Dictate: talk instead of typing. Switch it on with the Dictate button next to Record, the mic beside Read aloud, Dictate on the phone's formatting row, or F9, then use your device's own dictation (the mic on the iPhone or iPad keyboard, the mic key or Fn twice on a Mac, Windows+H on a PC). While it's on, the button, a bar along the top of the page and the cursor turn raspberry, so a screen video shows it, and the words you say get a faint underline until you switch it off. The underline is never saved. Unwip doesn't listen itself: there's still no AI in Unwip.\n- Replay: with Dictate on, a replay marks the dictated stretches (under the slider, and with a Dictated badge while they play), and the recordings list and the report count dictated words apart from typed ones. Timelapse videos show the badge too.\n- Split view: a wide picture now fits inside the pane. Before, it showed full size and the pane scrolled sideways.\n- Help: two topics pointed to Settings sections that don't exist. Fonts are in Settings \u203a Appearance, and backups are in the book's \u22ef \u203a Backups\u2026 on the main screen.";
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
      const go = () => U.safeRestart ? U.safeRestart(() => location.reload()) : location.reload();
      if (window.UnwipUpdates && window.UnwipUpdates.notice) window.UnwipUpdates.notice({ title: 'A new version of Unwip is ready', version: v, notes, action: 'Update now', run: go });
      else U.toastAction('A new version of Unwip is ready (' + v + ').', 'Update now', go, 60000);
    } catch (e) {}
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  addEventListener('load', () => setTimeout(check, 20000)); setInterval(check, 3600000);
})();
