#!/usr/bin/env node
// From the archive manifest, find albums whose lyrics live only in booklet SCANS
// (images), map them to the catalog, and exclude albums already covered by text lyrics.
// Produces the OCR work queue for phase 2.
import fs from 'node:fs';
import path from 'node:path';

const MAN = process.argv[2];                 // octal-escaped `bsdtar tf` manifest
const raw = fs.readFileSync(MAN, 'latin1');  // keep bytes; escapes are \ooo octal
// decode bsdtar's \ooo octal escapes back into a real UTF-8 string, per line
function decode(line) {
  const bytes = [];
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\' && /[0-7]/.test(line[i + 1] || '')) {
      bytes.push(parseInt(line.slice(i + 1, i + 4), 8)); i += 3;
    } else bytes.push(line.charCodeAt(i) & 0xff);
  }
  return Buffer.from(bytes).toString('utf8');
}

const cat = JSON.parse(fs.readFileSync('src/assets/catalogs/yura.json', 'utf8'));
const lyr = fs.existsSync('src/assets/catalogs/lyrics.json')
  ? JSON.parse(fs.readFileSync('src/assets/catalogs/lyrics.json', 'utf8')) : {};
const norm = s => (s || '').toLowerCase().normalize('NFKC')
  .replace(/[\s　]/g, '').replace(/[-–—_.,:;!?'"“”‘’()\[\]{}~〜～・「」『』【】]/g, '');
const byTitle = (cat.albums || []).map(a => ({ a, key: norm(a.title), year: String(a.year || '') }))
  .filter(x => x.key.length > 1).sort((x, y) => y.key.length - x.key.length);
function matchAlbum(folder) {
  const nf = norm(folder), yr = (folder.match(/(19|20)\d{2}/) || [])[0] || '';
  let best = null;
  for (const c of byTitle) if (nf.includes(c.key)) { if (yr && c.year === yr) return c.a; if (!best) best = c.a; }
  return best;
}

// count booklet-ish images per depth-3 album folder (exclude obvious cover art & thumbs)
const artOnly = /(^|\/)(folder|cover|back|front|thumbs)\b|\.db$/i;
const imgExt = /\.(jpg|jpeg|png|tif|tiff)$/i;
const perFolder = {};
for (const line of raw.split('\n')) {
  if (!line || line.startsWith('##########')) continue;
  const p = decode(line.trim());
  const parts = p.split('/');
  if (parts.length < 4) continue;                 // 葉月ゆら/LABEL/ALBUM/file
  const folder = parts.slice(0, 3).join('/');
  const file = parts.slice(3).join('/');
  (perFolder[folder] ??= { imgs: 0, art: 0 });
  if (imgExt.test(file)) { if (artOnly.test(file)) perFolder[folder].art++; else perFolder[folder].imgs++; }
}

const rows = [];
for (const [folder, c] of Object.entries(perFolder)) {
  if (c.imgs < 2) continue;                        // needs a few pages to hold lyrics
  const albName = folder.split('/')[2];
  const a = matchAlbum(albName);
  const title = a?.title || null;
  const vocals = a ? (a.tracks || []).filter(t => !t.instrumental).length : null;
  const covered = title && lyr[title] ? Object.keys(lyr[title]).length : 0;
  rows.push({ folder: albName, album: title, year: a?.year || null, scans: c.imgs, vocals, coveredTracks: covered });
}
rows.sort((x, y) => y.scans - x.scans);
const queue = rows.filter(r => r.album && r.coveredTracks === 0);       // scans, no text lyrics yet
const unmatched = rows.filter(r => !r.album);

fs.writeFileSync('scripts/lyrics/work/scan-queue.json', JSON.stringify({ queue, alreadyText: rows.filter(r => r.coveredTracks > 0), unmatched }, null, 2));
console.log(`albums with booklet scans (>=2 pages): ${rows.length}`);
console.log(`  already have text lyrics: ${rows.filter(r => r.coveredTracks > 0).length}`);
console.log(`  OCR queue (scans, no text yet): ${queue.length}  → ${queue.reduce((n, r) => n + (r.vocals || 0), 0)} vocal tracks`);
console.log(`  unmatched to catalog: ${unmatched.length}`);
console.log('\nTop OCR-queue albums by page count:');
for (const r of queue.slice(0, 20)) console.log(`  ${String(r.scans).padStart(2)}pg  ${r.album} (${r.year})  ${r.vocals} vocal`);
