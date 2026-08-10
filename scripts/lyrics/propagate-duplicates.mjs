#!/usr/bin/env node
/* Many songs recur across the catalog — best-of compilations (Enchanté), game/Taiko versions,
   re-releases, "Full Version"s. When the SAME song already has lyrics on one album, copy those
   lyrics onto its other appearances (matched by title, ignoring version/instrumental suffixes).
   Adds a `flags` note recording the source so it's traceable. Never overwrites existing lyrics.
   Usage: node propagate-duplicates.mjs            # preview
          node propagate-duplicates.mjs --write    # apply */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CAT = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/assets/catalogs/yura.json'), 'utf8'));
const LYR_PATH = path.join(ROOT, 'src/assets/catalogs/lyrics.json');
const LYR = JSON.parse(fs.readFileSync(LYR_PATH, 'utf8'));

// strip version markers + punctuation so "UFO☆UFO -ボクのともだち-" == "Ufo☆Ufo -ボクのともだち-",
// and "薔薇と弾丸(ノーマルver)" core == "薔薇と弾丸(アレンジver)" core == "薔薇と弾丸".
const core = s => (s || '').normalize('NFKC')
  .replace(/\[[^\]]*\]|\([^)]*ver[^)]*\)|[-‐-—~〜][^-~〜]*version[^-~〜]*[-‐-—~〜]?|full\s*version|instrumental|オリジナル|ノーマル|アレンジ|remix|ver\.?/gi, '')
  .replace(/[\s　’'"”“〜～~:：・\-—–ー_/／|｜()（）\[\]［］「」『』【】,、，.。!！?？＊*＆&＝=+☆★]/g, '')
  .toLowerCase();

const hasLyr = (alb, tk) => LYR[alb]?.[tk]?.jp?.lines?.length;
const rank = b => ({ human: 3, official: 3, transcription: 2, ai: 1 }[b?.jp?.kind] || 0);

// index: core title -> best existing source {album, track, rec}
const src = new Map();
for (const a of CAT.albums) for (const t of a.tracks) {
  if (t.instrumental || !hasLyr(a.title, t.track)) continue;
  const k = core(t.title); if (!k) continue;
  const rec = LYR[a.title][t.track];
  const cur = src.get(k);
  if (!cur || rank(rec) > rank(cur.rec)) src.set(k, { album: a.title, track: t.track, title: t.title, rec });
}

const write = process.argv.includes('--write');
const rows = []; let n = 0;
for (const a of CAT.albums) for (const t of a.tracks) {
  if (t.instrumental || hasLyr(a.title, t.track)) continue;
  const k = core(t.title);
  // guard: a short all-Latin title (e.g. "Nightmare", "Alice") is too generic to trust as the
  // same song across albums — only propagate those when the title carries Japanese or is long.
  if (k && !/[぀-ヿ㐀-鿿]/.test(k) && k.length <= 10) continue;
  const s = src.get(k); if (!s) continue;
  if (s.album === a.title) continue;
  rows.push(`${a.title} #${t.track} "${t.title}"  <=  ${s.album} #${s.track}`);
  if (write) {
    LYR[a.title] = LYR[a.title] || {};
    const rec = LYR[a.title][t.track] = LYR[a.title][t.track] || { title: t.title, flags: [] };
    for (const lang of ['jp', 'romaji', 'en']) if (s.rec[lang]) rec[lang] = JSON.parse(JSON.stringify(s.rec[lang]));
    rec.flags = [...new Set([...(rec.flags || []), `same recording as ${s.album}`])];
  }
  n++;
}
if (write) fs.writeFileSync(LYR_PATH, JSON.stringify(LYR, null, 2) + '\n');
console.log(rows.sort().join('\n'));
console.log(`\n=== ${write ? 'copied' : 'would copy'} lyrics onto ${n} duplicate-song tracks ===`);
