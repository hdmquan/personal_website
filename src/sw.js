/* Fan-archive service worker.
   - Precache the app shell so the player is installable and launches offline.
   - Same-origin static (css/js/fonts/icons): stale-while-revalidate — instant from cache, refreshed
     in the background so a redeploy shows up on the next load.
   - Same-origin data (catalog + lyrics shards) and page navigations: network-first with a cache
     fallback — fresh when online, still works offline.
   - R2 covers (cross-origin images): cache-first with an LRU cap, so re-browsing the shelf across
     sessions doesn't re-download artwork (big mobile-data saving). Audio is never cached — it streams
     via range requests and would blow the storage quota. */
const SHELL_C = 'fa-shell-v2';
const DATA_C  = 'fa-data-v2';
const IMG_C   = 'fa-img-v2';
const IMG_MAX = 240;                          // ~most of the discography's covers, LRU-trimmed
const SHELL = ['/assets/css/root.css', '/assets/css/yura.css', '/assets/js/player.js'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(SHELL_C).then(c => c.addAll(SHELL).catch(() => {})));
});
self.addEventListener('activate', e => {
  const keep = new Set([SHELL_C, DATA_C, IMG_C]);
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => !keep.has(k)).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function trimCache(name, max) {
  const c = await caches.open(name);
  const keys = await c.keys();                // insertion order → oldest first
  for (const req of keys.slice(0, keys.length - max)) await c.delete(req);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);

  // Cross-origin: only cover images get cached (cache-first + LRU). Audio / Last.fm / fonts → network.
  if (u.origin !== location.origin) {
    if (req.destination === 'image') {
      e.respondWith((async () => {
        const c = await caches.open(IMG_C);
        const hit = await c.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res && (res.ok || res.type === 'opaque')) { c.put(req, res.clone()); trimCache(IMG_C, IMG_MAX); }
          return res;
        } catch (err) { return hit || Response.error(); }
      })());
    }
    return;
  }

  // Same-origin data + navigations → network-first (stay fresh), fall back to cache when offline.
  if (req.mode === 'navigate' || u.pathname.startsWith('/assets/catalogs/')) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        const c = await caches.open(DATA_C); c.put(req, res.clone());
        return res;
      } catch (err) { return (await caches.match(req)) || Response.error(); }
    })());
    return;
  }

  // Same-origin static → stale-while-revalidate.
  e.respondWith((async () => {
    const c = await caches.open(SHELL_C);
    const hit = await c.match(req);
    const net = fetch(req).then(res => { if (res && res.ok) c.put(req, res.clone()); return res; }).catch(() => null);
    return hit || (await net) || Response.error();
  })());
});
