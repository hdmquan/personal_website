#!/usr/bin/env node
/* QA helper: dump one album's jp/romaji/en blocks (with kind/by) for quality review. Read-only.
   Usage: node scripts/lyrics/qa-dump.mjs "<album title>" */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const L = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/assets/catalogs/lyrics.json'), 'utf8'));
const alb = process.argv.slice(2).join(' ');
const tracks = L[alb];
if (!tracks) { console.error('no such album:', alb); process.exit(1); }
for (const [tk, rec] of Object.entries(tracks)) {
  console.log(`\n===== ${alb} #${tk} — ${rec.title || ''} =====`);
  for (const lang of ['jp', 'romaji', 'en']) {
    const b = rec[lang];
    if (!b || !b.lines || !b.lines.length) { console.log(`--- ${lang}: (none) ---`); continue; }
    console.log(`--- ${lang} [${b.kind}/${b.by}]  ${b.lines.length} lines ---`);
    b.lines.forEach((l, i) => console.log(String(i).padStart(2, ' '), l));
  }
}
