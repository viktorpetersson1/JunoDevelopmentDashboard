/**
 * Kill-switch service worker.
 *
 * Atlas never intentionally registered a service worker, but some users
 * (Viktor included) have a stale SW stuck in their browser from a much
 * earlier deploy that we no longer ship. The stale SW intercepts every
 * navigation and serves outdated HTML referencing JS chunks that no
 * longer exist, producing a bare "Not Found" response. Manually clearing
 * site data fixes it for the session, but on the next visit the cycle
 * restarts.
 *
 * This file is the permanent fix:
 *   1. The browser checks for SW updates on every navigation (or hourly,
 *      whichever is sooner). It will fetch /sw.js.
 *   2. CF Pages serves THIS file — a tiny SW that, when installed:
 *        a. skipWaiting() so it activates immediately
 *        b. unregister() itself
 *        c. delete every cache it can reach
 *        d. navigate all controlled clients to refresh them
 *   3. After one cycle, the browser has no SW + no caches. Atlas runs
 *      directly off CF Pages without an intermediary.
 *
 * Belt + braces: app/layout.tsx ALSO emits an inline kill script in
 * <head> that runs on every HTML load and force-unregisters any SW the
 * normal way (via the page context, in case the stale SW returns this
 * file's URL but caches it forever).
 *
 * Once we're confident every user has run through the kill cycle, this
 * file can be deleted. For now: leave it in place indefinitely.
 */

self.addEventListener('install', (event) => {
  // Activate as fast as possible so the kill logic runs without waiting
  // for the page to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Delete every cache the browser exposes to this SW.
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch (_e) {
        // best-effort
      }
      // Unregister ourselves.
      try {
        await self.registration.unregister();
      } catch (_e) {
        // best-effort
      }
      // Reload every controlled tab so they re-fetch HTML directly from
      // the network (no SW interception this time).
      try {
        const clients = await self.clients.matchAll({ type: 'window' });
        for (const client of clients) {
          // navigate() exists on WindowClient. Use the current URL so the
          // user lands where they were.
          if ('navigate' in client && typeof client.navigate === 'function') {
            await client.navigate(client.url);
          }
        }
      } catch (_e) {
        // best-effort
      }
    })()
  );
});

// Fetch handler is intentionally absent. With no fetch handler the browser
// bypasses the SW for network requests, which is exactly what we want
// during the brief window before unregister() takes effect.
