/* Fan-archive service worker.

   Static + data + covers (unchanged from v2):
   - App shell (css/js) precached; static assets stale-while-revalidate.
   - Catalog / lyrics shards / navigations: network-first with cache fallback.
   - R2 covers (cross-origin images): cache-first + LRU, so re-browsing doesn't re-download art.

   Audio (offline playback) — the new part:
   - Two caches: SAVED (explicit per-album downloads written by the page; never auto-evicted) and
     AUTO (opportunistic cache-on-play, LRU-capped). Both are served back with correct byte-range
     (206) responses so seeking works, including on iOS Safari.
   - We only touch audio when the media request is in CORS mode (the page sets crossorigin only after
     it has probed that the R2 media sends CORS headers). Until then audio just streams — nothing here
     runs for it, so behaviour is exactly as before.
   - Auto-cache is gated by a flag the page posts in (persisted so a worker restart recovers it), and
     it reuses the STREAMING bytes (tee) — playing a track caches it with no extra R2 request. */
const SHELL_C = 'fa-shell-v2';
const DATA_C  = 'fa-data-v2';
const IMG_C   = 'fa-img-v2';
const AUDIO_SAVED = 'fa-audio-saved-v1';   // explicit downloads — kept until the user removes them
const AUDIO_AUTO  = 'fa-audio-auto-v1';    // cache-on-play — LRU-trimmed
const IMG_MAX   = 240;
const AUDIO_MAX = 80;                        // cap for the opportunistic cache only
const CFG_URL = 'https://fa.config/autocache';   // synthetic key that persists the auto-cache flag
const SHELL = ['/assets/css/root.css', '/assets/css/yura.css', '/assets/js/player.js'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(SHELL_C).then(c => c.addAll(SHELL).catch(() => {})));
});
self.addEventListener('activate', e => {
  const keep = new Set([SHELL_C, DATA_C, IMG_C, AUDIO_SAVED, AUDIO_AUTO]);
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => !keep.has(k)).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// ── auto-cache flag (page → SW), persisted in the AUTO cache so a restart recovers it ──
let autoCache = null;
async function getAutoCache() {
  if (autoCache !== null) return autoCache;
  try { const r = await (await caches.open(AUDIO_AUTO)).match(CFG_URL); autoCache = r ? (await r.text()) === '1' : false; }
  catch (e) { autoCache = false; }
  return autoCache;
}
self.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type === 'autocache') {
    autoCache = !!d.on;
    e.waitUntil(caches.open(AUDIO_AUTO).then(c => c.put(CFG_URL, new Response(autoCache ? '1' : '0'))));
  }
});

async function trimCache(name, max) {
  const c = await caches.open(name);
  const keys = (await c.keys()).filter(r => r.url !== CFG_URL);   // never trim the config entry
  for (const req of keys.slice(0, keys.length - max)) await c.delete(req);
}

const isAudio = (req, u) => req.destination === 'audio' || /\.(mp3|m4a|aac|ogg|opus|flac|wav)(\?|$)/i.test(u.pathname);

// Build a 206 (or full 200) response from a cached full-file response, honouring the Range header.
async function rangeResponse(fullRes, range) {
  if (!range) return fullRes;
  const buf = await fullRes.clone().arrayBuffer();
  const size = buf.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
  let start = m[1] === '' || m[1] == null ? NaN : +m[1];
  let end   = m[2] === '' || m[2] == null ? NaN : +m[2];
  if (isNaN(start)) { if (!isNaN(end)) { start = Math.max(0, size - end); end = size - 1; } else { start = 0; end = size - 1; } }
  else if (isNaN(end)) end = size - 1;
  end = Math.min(end, size - 1);
  if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes' } });
  const h = new Headers();
  h.set('Content-Type', fullRes.headers.get('Content-Type') || 'audio/mpeg');
  h.set('Content-Length', String(end - start + 1));
  h.set('Content-Range', `bytes ${start}-${end}/${size}`);
  h.set('Accept-Ranges', 'bytes');
  return new Response(buf.slice(start, end + 1), { status: 206, statusText: 'Partial Content', headers: h });
}

// Normalise any full-file response (200, or a 206 that covers the whole file) into a cacheable 200.
async function toFull200(res) {
  const buf = await res.clone().arrayBuffer();
  const h = new Headers();
  h.set('Content-Type', res.headers.get('Content-Type') || 'audio/mpeg');
  h.set('Content-Length', String(buf.byteLength));
  h.set('Accept-Ranges', 'bytes');
  return new Response(buf, { status: 200, headers: h });
}
function coversWholeFile(res) {
  if (res.status === 200) return true;
  const cr = res.headers.get('Content-Range');
  const mm = cr && /^bytes 0-(\d+)\/(\d+)$/.exec(cr);
  return !!(mm && (+mm[1]) === (+mm[2] - 1));
}

async function handleAudio(e) {
  const req = e.request;
  const url = req.url;
  const range = req.headers.get('range');
  // 1) already cached (saved or auto) → serve with range support
  for (const name of [AUDIO_SAVED, AUDIO_AUTO]) {
    const c = await caches.open(name);
    const hit = await c.match(url, { ignoreVary: true });
    if (hit) return rangeResponse(hit, range);
  }
  // 2) miss → network. Auto-cache the streamed bytes (no extra request) when it's a full-file fetch.
  const wantCache = await getAutoCache();
  const fullReq = !range || /^bytes=0-\s*$/.test(range.trim());
  let net;
  try { net = await fetch(req); } catch (err) { return fetch(req).catch(() => Response.error()); }
  if (wantCache && fullReq && net && (net.status === 200 || net.status === 206) && coversWholeFile(net)) {
    const forCache = net.clone();
    e.waitUntil((async () => {
      try { const c = await caches.open(AUDIO_AUTO); await c.put(url, await toFull200(forCache)); await trimCache(AUDIO_AUTO, AUDIO_MAX); } catch (err) {}
    })());
  }
  return net;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);

  // Cross-origin: audio (CORS mode only) → offline handler; cover images → cache-first LRU; else network.
  if (u.origin !== location.origin) {
    if (isAudio(req, u)) { if (req.mode === 'cors') { e.respondWith(handleAudio(e)); } return; }
    if (req.destination === 'image') {
      e.respondWith((async () => {
        const saved = await (await caches.open(AUDIO_SAVED)).match(req, { ignoreVary: true });   // offline album covers
        if (saved) return saved;
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

  // Same-origin data + navigations → network-first; other static → stale-while-revalidate.
  if (req.mode === 'navigate' || u.pathname.startsWith('/assets/catalogs/')) {
    e.respondWith((async () => {
      try { const res = await fetch(req); const c = await caches.open(DATA_C); c.put(req, res.clone()); return res; }
      catch (err) { return (await caches.match(req)) || Response.error(); }
    })());
    return;
  }
  e.respondWith((async () => {
    const c = await caches.open(SHELL_C);
    const hit = await c.match(req);
    const net = fetch(req).then(res => { if (res && res.ok) c.put(req, res.clone()); return res; }).catch(() => null);
    return hit || (await net) || Response.error();
  })());
});
