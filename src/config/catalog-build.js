/* Build-time catalog optimizer — invoked from the eleventy `after` hook (see .eleventy.js).

   1) Lyrics sharding: the master lyrics.json is multiple MB and the player used to fetch ALL of it
      on every page load. We split it into one small shard per album (public/assets/catalogs/lyrics/
      <id>.json) plus a tiny index (title → id), so the player loads lyrics lazily — one album at a
      time, only when a track is actually played/opened. The multi-MB monolith is removed from the
      deploy so it never ships.
   2) Minify: the served catalog JSON is whitespace-minified (the source copies stay pretty for git
      diffs; only the built public/ copies are minified).

   Everything here is best-effort: any error is logged and swallowed so a data hiccup can never break
   the site build. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// stable per-album shard id (independent of object order, so shard URLs are cache-stable across builds)
const shardId = title => crypto.createHash('sha1').update(String(title)).digest('hex').slice(0, 10);

function minifyJSONFile(p) {
  try {
    if (!fs.existsSync(p)) return;
    fs.writeFileSync(p, JSON.stringify(JSON.parse(fs.readFileSync(p, 'utf8'))));
  } catch (e) { console.warn('[catalog-build] minify skipped', path.basename(p), '—', e.message); }
}

function build(outDir) {
  const catDir = path.join(outDir, 'assets/catalogs');
  try {
    const monolith = path.join(catDir, 'lyrics.json');
    // prefer the freshly-copied public/ monolith; fall back to the source if passthrough hasn't run
    const srcLyrics = fs.existsSync(monolith)
      ? monolith
      : path.join(__dirname, '..', 'assets/catalogs/lyrics.json');
    if (fs.existsSync(srcLyrics)) {
      const LYR = JSON.parse(fs.readFileSync(srcLyrics, 'utf8'));
      const outLyr = path.join(catDir, 'lyrics');
      fs.mkdirSync(outLyr, { recursive: true });
      const index = {};
      for (const [title, block] of Object.entries(LYR)) {
        if (!block || !Object.keys(block).length) continue;   // skip albums with no lyrics
        const id = shardId(title);
        index[title] = id;
        fs.writeFileSync(path.join(outLyr, id + '.json'), JSON.stringify(block));
      }
      fs.writeFileSync(path.join(outLyr, 'index.json'), JSON.stringify(index));
      if (fs.existsSync(monolith)) fs.rmSync(monolith);       // drop the multi-MB monolith from the deploy
      console.log(`[catalog-build] lyrics → ${Object.keys(index).length} album shards + index`);
    }
    minifyJSONFile(path.join(catDir, 'yura.json'));
    minifyJSONFile(path.join(catDir, 'album-notes.json'));
    // stamp the service worker with a unique build id so every deploy ships a byte-changed worker
    // → the browser detects the update and the page reloads to the new code (see player.js).
    const sw = path.join(outDir, 'sw.js');
    if (fs.existsSync(sw)) fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8').replace(/__BUILD__/g, String(Date.now())));
  } catch (e) { console.warn('[catalog-build] skipped —', e.message); }
}

module.exports = { build, shardId };
