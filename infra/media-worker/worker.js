/* Cloudflare Worker — CORS + range media proxy for the 葉月ゆら R2 bucket.

   The Netlify site can't read R2 bytes for offline caching because the public r2.dev URL sends no
   CORS headers. This Worker (deployed on the same Cloudflare account as the bucket, so R2 egress
   stays free) reads objects straight from the R2 binding and returns them WITH CORS + byte-range
   support, which is exactly what the player's offline download / auto-cache needs.

   The audio is public, so Access-Control-Allow-Origin: * is fine and keeps origin config zero-touch.
   Deploy: see README.md. After deploying, put the worker URL in src/yura.html (__ARTIST__.media). */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, ETag',
  'Access-Control-Max-Age': '86400',
};

function parseRange(h) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(h).trim());
  if (!m) return null;
  const s = m[1] === '' ? undefined : +m[1];
  const e = m[2] === '' ? undefined : +m[2];
  if (s === undefined && e !== undefined) return { suffix: e };            // bytes=-N (last N bytes)
  if (s !== undefined && e !== undefined) return { offset: s, length: e - s + 1 };
  if (s !== undefined) return { offset: s };                                // bytes=N-
  return null;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'GET' && request.method !== 'HEAD')
      return new Response('Method Not Allowed', { status: 405, headers: CORS });

    const key = decodeURIComponent(new URL(request.url).pathname.replace(/^\/+/, ''));
    if (!key) return new Response('Not found', { status: 404, headers: CORS });

    const rangeHeader = request.headers.get('Range');
    const parsed = rangeHeader ? parseRange(rangeHeader) : null;
    const obj = await env.MEDIA.get(key, parsed ? { range: parsed } : undefined);
    if (!obj) return new Response('Not found', { status: 404, headers: CORS });

    const headers = new Headers(CORS);
    obj.writeHttpMetadata(headers);                 // Content-Type + any stored metadata
    headers.set('ETag', obj.httpEtag);
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    const size = obj.size;                          // full object size (even for a ranged get)
    const body = request.method === 'HEAD' ? null : obj.body;

    if (parsed && obj.range) {
      const start = obj.range.offset || 0;
      const length = obj.range.length != null ? obj.range.length : (size - start);
      headers.set('Content-Range', `bytes ${start}-${start + length - 1}/${size}`);
      headers.set('Content-Length', String(length));
      return new Response(body, { status: 206, headers });
    }
    headers.set('Content-Length', String(size));
    return new Response(body, { status: 200, headers });
  },
};
