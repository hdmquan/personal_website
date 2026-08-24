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
    // OG share pages: social crawlers can't see the SPA's #hash routes, so emit a real static
    // page per album + per track carrying that album's cover as og:image, which then redirects a
    // human visitor into the player. Also injects share_slug into the catalog for the copy-link UI.
    try { buildSharePages(catDir, outDir); } catch (e) { console.warn('[catalog-build] share pages skipped —', e.message); }
    minifyJSONFile(path.join(catDir, 'yura.json'));
    minifyJSONFile(path.join(catDir, 'album-notes.json'));
    // stamp the service worker with a unique build id so every deploy ships a byte-changed worker
    // → the browser detects the update and the page reloads to the new code (see player.js).
    const sw = path.join(outDir, 'sw.js');
    if (fs.existsSync(sw)) fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8').replace(/__BUILD__/g, String(Date.now())));
  } catch (e) { console.warn('[catalog-build] skipped —', e.message); }
}

// ── OG share-page generation ─────────────────────────────────────────────
const SITE = 'https://alan-huynh.is-a.dev';
const R2 = 'https://pub-35c05111c2ae48c18bfe65c07895af75.r2.dev';
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r2cover = cover => R2 + '/' + String(cover || '').split('/').map(encodeURIComponent).join('/');

// ── Human-readable album slugs ───────────────────────────────────────────
// Yura's own site uses the lowercased album name as the directory (/oracle/, /witchcraft/),
// so mirror that. Latin (or latin-containing) titles slugify directly; pure-Japanese titles —
// and a few messy mixed ones where the latin fragment is a poor name — use a hand-checked
// Hepburn-romaji override. buildSharePages dedupes with a numeric suffix as a safety net.
const SLUG_OVERRIDE = {
  'はつ恋': 'hatsukoi',
  'ばらいろのあくむ': 'barairo-no-akumu',
  'まおうのしろ': 'maou-no-shiro',
  'まほうのはな': 'mahou-no-hana',
  'まぼろしせかい': 'maboroshi-sekai',
  'まよなかのうた': 'mayonaka-no-uta',
  'やみのものがたり': 'yami-no-monogatari',
  'サロン・ド・シャノワール': 'salon-de-chat-noir',
  'ヴァルプルギスの夜の夢': 'walpurgis-no-yoru-no-yume',
  '夜想陽炎': 'yasou-kagerou',
  '夢幻妖夜行': 'mugen-youyakou',
  '夢、麗しく闇を奏でる': 'yume-uruwashiku-yami-wo-kanaderu',
  '妖華語り': 'youka-gatari',
  '宵闇恋想奇譚': 'yoiyami-rensou-kitan',
  '少女と儚き薔薇の葬列': 'shoujo-to-hakanaki-bara-no-souretsu',
  '少女と背徳の欠片': 'shoujo-to-haitoku-no-kakera',
  '少女の秘密と鍵穴': 'shoujo-no-himitsu-to-kagiana',
  '幻恋楼閣談集': 'genren-roukaku-danshuu',
  '東方幻想奇談 ～闇色硝子～': 'touhou-gensou-kidan-yamiiro-garasu',
  '東方来夢来人': 'touhou-raimuraito',
  '東方来夢来人Ⅱ～ポップン・ティアラ～': 'touhou-raimuraito-2-poppun-tiara',
  '流転の巫女 ～魂ノ緒～': 'ruten-no-miko-tama-no-o',
  '竜と炎の物語': 'ryuu-to-honou-no-monogatari',
  '紅夜に詠う少女の禁忌': 'kouya-ni-utau-shoujo-no-kinki',
  '罪に濡れた魔女': 'tsumi-ni-nureta-majo',
  '聖童話工房': 'sei-douwa-koubou',
  '蒼炎の姫君': 'souen-no-himegimi',
  '虚構の楽園': 'kyokou-no-rakuen',
  '蜜薬ランガージュ': 'mitsuyaku-langage',
  '金魚恋想歌': 'kingyo-rensouka',
  '闇童話工房': 'yami-douwa-koubou',
  '君のいる景色': 'kimi-no-iru-keshiki',
  '東方万能飲薬': 'touhou-bannou-inyaku',
  '東方年柄年中': 'touhou-nengaranenjuu',
  'だってしょうがないじゃない': 'datte-shouganai-janai',
  'もじもじ ちびっ子魔法学園 ～痛くしちゃイヤだョ～': 'mojimoji-chibikko-mahou-gakuen',
  // messy mixed titles whose auto-extracted latin fragment is a poor slug
  'ゆらわーるど -Honey Bee-': 'yura-world-honey-bee',
  'CRギンギラパラダイス クジラッキーと砂漠の国': 'cr-gingira-paradise',
  '10年後の君へのアンチテーゼ (ODORIKO Records)': '10-nengo-no-kimi-e-no-antithese',
  '残念な姉とのラブコメディ Original Soundtrack': 'zannen-na-ane-original-soundtrack',
  // `album` field variants (differ from display `title` by a comma / tilde) — buildSharePages keys on `album`
  '夢麗しく闇を奏でる': 'yume-uruwashiku-yami-wo-kanaderu',
  '東方来夢来人Ⅱ ポップン・ティアラ': 'touhou-raimuraito-2-poppun-tiara',
};
function slugifyLatin(name) {
  return String(name).replace(/[～〜~]/g, ' ').replace(/&/g, ' and ')
    .replace(/[^\x00-\x7F]/g, ' ')                 // drop non-ASCII (Japanese) runs
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
// name → slug; falls back to the stable hash only if a title yields no usable latin/romaji.
const albumSlug = name => SLUG_OVERRIDE[name] || slugifyLatin(name) || shardId(name);

function sharePage({ title, desc, img, url, type, redirect }) {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Yura Archive</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:site_name" content="Yura Archive">
<meta property="og:type" content="${type}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:image:width" content="500">
<meta property="og:image:height" content="500">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(img)}">
<meta http-equiv="refresh" content="0; url=${esc(redirect)}">
<script>location.replace(${JSON.stringify(redirect)});</script>
</head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:#191e1a;color:#eae6df">
<p>Opening <a style="color:#c9a86a" href="${esc(redirect)}">${esc(title)}</a> in Yura Archive…</p>
</body>
</html>
`;
}

function buildSharePages(catDir, outDir) {
  const catPath = path.join(catDir, 'yura.json');
  if (!fs.existsSync(catPath)) return;
  const cat = JSON.parse(fs.readFileSync(catPath, 'utf8'));
  const albums = cat.albums || cat;
  let nA = 0, nT = 0;
  const usedSlugs = new Set();
  albums.forEach((a, ai) => {
    const name = a.album || a.title || '';
    let slug = albumSlug(name);
    if (usedSlugs.has(slug)) { let n = 2; while (usedSlugs.has(`${slug}-${n}`)) n++; slug = `${slug}-${n}`; }
    usedSlugs.add(slug);
    a.share_slug = slug;
    const img = r2cover(a.cover);
    const aDir = path.join(outDir, 'yura', 'a', slug);
    fs.mkdirSync(aDir, { recursive: true });
    fs.writeFileSync(path.join(aDir, 'index.html'), sharePage({
      title: name, desc: `${(a.tracks || []).length} tracks · ${a.year || ''}`.trim().replace(/·\s*$/, '').trim(),
      img, url: `${SITE}/yura/a/${slug}`, type: 'music.album', redirect: `/yura/#a=${ai}`,
    }));
    nA++;
    (a.tracks || []).forEach((t, ti) => {
      const tDir = path.join(outDir, 'yura', 't', slug, String(ti));
      fs.mkdirSync(tDir, { recursive: true });
      fs.writeFileSync(path.join(tDir, 'index.html'), sharePage({
        title: `${t.title} · ${name}`, desc: `from ${name}${a.year ? ` (${a.year})` : ''}`,
        img, url: `${SITE}/yura/t/${slug}/${ti}`, type: 'music.song', redirect: `/yura/#np=${ai}.${ti}`,
      }));
      nT++;
    });
  });
  fs.writeFileSync(catPath, JSON.stringify(cat));   // persist share_slug (re-minified by the caller)
  console.log(`[catalog-build] share pages → ${nA} albums + ${nT} tracks`);
}

module.exports = { build, shardId, buildSharePages };
