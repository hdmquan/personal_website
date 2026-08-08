#!/usr/bin/env node
// Coverage report: lyrics.json vs the catalog. Vocal tracks only (instrumentals excluded).
import fs from 'node:fs';
const cat = JSON.parse(fs.readFileSync('src/assets/catalogs/yura.json', 'utf8'));
const lyr = fs.existsSync('src/assets/catalogs/lyrics.json')
  ? JSON.parse(fs.readFileSync('src/assets/catalogs/lyrics.json', 'utf8')) : {};

let totVocal = 0, totJp = 0, totRo = 0, totEn = 0;
const rows = [];
for (const a of (cat.albums || [])) {
  const vocal = (a.tracks || []).filter(t => !t.instrumental);
  if (!vocal.length) continue;
  const L = lyr[a.title] || {};
  let jp = 0, ro = 0, en = 0;
  for (const t of vocal) {
    const rec = L[String(t.track)];
    if (rec?.jp?.lines?.length) jp++;
    if (rec?.romaji?.lines?.length) ro++;
    if (rec?.en?.lines?.length) en++;
  }
  totVocal += vocal.length; totJp += jp; totRo += ro; totEn += en;
  rows.push({ album: a.title, year: a.year, vocal: vocal.length, jp, ro, en });
}
const done = rows.filter(r => r.jp === r.vocal);
const partial = rows.filter(r => r.jp > 0 && r.jp < r.vocal);
const none = rows.filter(r => r.jp === 0);

const pct = (n, d) => d ? (100 * n / d).toFixed(1) + '%' : '—';
console.log(`ALBUMS: ${rows.length} with vocals  |  VOCAL TRACKS: ${totVocal}`);
console.log(`JP:     ${totJp}/${totVocal} (${pct(totJp, totVocal)})`);
console.log(`Romaji: ${totRo}/${totVocal} (${pct(totRo, totVocal)})`);
console.log(`English:${totEn}/${totVocal} (${pct(totEn, totVocal)})`);
console.log(`\nAlbums with lyrics (${done.length}):`);
for (const r of done.sort((a, b) => a.year - b.year)) console.log(`  ✓ ${r.album} (${r.year}) ${r.jp}/${r.vocal}`);
if (partial.length) { console.log(`\nPartial (${partial.length}):`); for (const r of partial) console.log(`  ~ ${r.album} (${r.year}) ${r.jp}/${r.vocal}`); }
console.log(`\nNo lyrics yet (${none.length} albums, ${none.reduce((n, r) => n + r.vocal, 0)} vocal tracks) — OCR/booklet queue.`);
