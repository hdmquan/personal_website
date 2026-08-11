# Media Worker — CORS + range proxy for the R2 audio

The site is on Netlify but the audio lives in Cloudflare R2. Offline playback needs to *read* the
audio bytes, which the public `pub-…​.r2.dev` URL blocks (no CORS). This tiny Cloudflare Worker sits
in front of the R2 bucket (bound directly, so R2 egress stays free) and serves objects with CORS +
byte-range support. Cross-origin to the Netlify site, but the player already handles that.

## Deploy (one time)

From this folder, with the Cloudflare account that owns the `hatsuki-yura` bucket:

```bash
npx wrangler login
npx wrangler deploy
```

That prints a URL like `https://hatsuki-yura-media.<your-subdomain>.workers.dev`.

Quick check (should return `206` + an `access-control-allow-origin: *` header):

```bash
curl -sI -H "Range: bytes=0-1" "https://hatsuki-yura-media.<your-subdomain>.workers.dev/audio/<any-file>.mp3" | grep -iE "http/|access-control-allow-origin|content-range"
```

## Turn it on in the player

Put the Worker origin into `src/yura.html`, in the `__ARTIST__` config:

```js
window.__ARTIST__ = { name: "葉月ゆら", mediaArtist: "葉月ゆら", catalog: "/assets/catalogs/yura.json",
  media: "https://hatsuki-yura-media.<your-subdomain>.workers.dev" };
```

On the next deploy the player routes audio through the Worker, the CORS probe passes, and the
Download / auto-cache UI switches on automatically. Leave `media` empty (or omit it) to keep audio
streaming straight from R2 with offline disabled — nothing else changes.

## Notes
- Worker free tier is 100k requests/day; offline caching means repeat plays are served from the
  device, not the Worker. If it ever needs more, Workers Paid is $5/mo for 10M requests.
- Responses are `Cache-Control: immutable`, so browsers/edge cache aggressively.
- The Worker only reads (`GET`/`HEAD`); it never writes to the bucket.
