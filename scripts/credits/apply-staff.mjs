#!/usr/bin/env node
/* Apply a mined staff map { "<album>": { "<track>": {staff} } } into the catalog,
   writing track.staff only where the track has none yet. Track keys are matched to
   the catalog's own zero-padded value, with unpadded / position fallbacks.
   Idempotent. Usage: node apply-staff.mjs meriole-staff.json [more.json ...] [--write] */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CAT = path.join(ROOT, 'src/assets/catalogs/yura.json');
const args = process.argv.slice(2);
const write = args.includes('--write');
const files = args.filter(a => a !== '--write');

const cat = JSON.parse(fs.readFileSync(CAT, 'utf8'));
const byTitle = new Map(cat.albums.map(a => [a.title, a]));

let applied = 0, skipped = 0, missAlbum = 0, missTrack = 0;
for (const f of files) {
  const abs = path.isAbsolute(f) ? f : path.join(ROOT, 'scripts/credits', f);
  const map = JSON.parse(fs.readFileSync(abs, 'utf8'));
  for (const [album, tracks] of Object.entries(map)) {
    const alb = byTitle.get(album);
    if (!alb) { missAlbum++; console.warn('  ! album not in catalog:', album); continue; }
    for (const [tk, staff] of Object.entries(tracks)) {
      const t = alb.tracks.find(x => x.track === tk)
        || alb.tracks.find(x => String(Number(x.track)) === String(Number(tk)))
        || alb.tracks[Number(tk) - 1];
      if (!t) { missTrack++; console.warn(`  ! ${album} #${tk} not found`); continue; }
      if (t.staff) { skipped++; continue; }
      if (write) t.staff = staff;
      applied++;
    }
  }
}
if (write) fs.writeFileSync(CAT, JSON.stringify(cat, null, 2) + '\n');
console.log(`${write ? 'applied' : 'would apply'} ${applied}, skipped ${skipped} (already had staff), missAlbum ${missAlbum}, missTrack ${missTrack}`);
