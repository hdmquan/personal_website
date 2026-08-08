#!/usr/bin/env node
// Assemble scripts/lyrics/work/out/*.json (per-album agent output) into the app's
// src/assets/catalogs/lyrics.json, wrapping each language in an attributed block.
// Idempotent: rebuilds from whatever out/*.json exist. Preserves any pre-existing
// human/official blocks already in lyrics.json (never overwrites a non-ai block with ai).
import fs from 'node:fs';
import path from 'node:path';

const DATE = '2026-08-07';
const OUTDIR = path.resolve('scripts/lyrics/work/out');
const INDEX = path.resolve('scripts/lyrics/work/tasks/index.json');
const LYR = path.resolve('src/assets/catalogs/lyrics.json');

const idIndex = JSON.parse(fs.readFileSync(INDEX, 'utf8'));   // [{id, album, outPath}]
const idToAlbum = Object.fromEntries(idIndex.map(x => [x.id, x.album]));
// preformed files (already-attributed blocks, e.g. human sets) -> album title
const PREFORMED = { 'gothika.json': 'Gothika ～赤羊音戯箱～' };
// OCR outputs (jp = preformed OCR block, romaji/en = ai arrays) -> album title
const OCR_INDEX_PATH = 'scripts/lyrics/work/ocr-tasks/ocr-index.json';
const ocrIndex = fs.existsSync(OCR_INDEX_PATH) ? JSON.parse(fs.readFileSync(OCR_INDEX_PATH, 'utf8')) : {};

// catalog track keys are zero-padded strings ("02"); agents key by "2". Normalize each
// track number to the catalog's exact `.track` value so the player can look it up directly.
const CAT = JSON.parse(fs.readFileSync('src/assets/catalogs/yura.json', 'utf8'));
const trackKeyMap = {};   // album -> { <numeric>: <catalog .track string> }
for (const a of (CAT.albums || [])) {
  const m = {}; for (const t of (a.tracks || [])) if (t.track != null) m[Number(t.track)] = t.track;
  trackKeyMap[a.title] = m;
}
const catKey = (album, tno) => (trackKeyMap[album] && trackKeyMap[album][Number(tno)]) || String(tno);

const existing = fs.existsSync(LYR) ? JSON.parse(fs.readFileSync(LYR, 'utf8')) : {};
const out = existing;   // merge in place, preserve human work

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function block(lines, by, kind, src) {
  return { lines, by, kind, src, date: DATE };
}
// only replace a block if the target is empty or itself an ai placeholder
function place(track, lang, blk) {
  const cur = track[lang];
  if (!cur || cur.kind === 'ai' || !cur.lines?.length) track[lang] = blk;
}

// a language field may be a raw array (AI batch) or a preformed {lines,by,kind,src,date} block
const lines = v => Array.isArray(v) ? v : (v && Array.isArray(v.lines) ? v.lines : null);

let albums = new Set(), tracks = 0, files = 0;
for (const f of fs.readdirSync(OUTDIR).filter(x => x.endsWith('.json'))) {
  const album = PREFORMED[f] || ocrIndex[f] || idToAlbum[f.replace('.json', '')];
  if (!album) { console.warn(`! no album mapping for ${f} — skipped`); continue; }
  let data;
  try { data = JSON.parse(fs.readFileSync(path.join(OUTDIR, f), 'utf8')); }
  catch (e) { console.warn(`! bad JSON ${f}: ${e.message}`); continue; }
  files++;
  out[album] ??= {};
  albums.add(album);
  for (const [tno, t] of Object.entries(data)) {
    const jp = lines(t.jp), ro = lines(t.romaji), en = lines(t.en);
    const L = jp?.length || 0;
    if (!L) continue;
    if ((ro && ro.length !== L) || (en && en.length !== L)) {
      console.warn(`! ${album} #${tno}: length mismatch jp=${L} romaji=${ro?.length} en=${en?.length} — skipped`);
      continue;
    }
    const key = catKey(album, tno);
    const rec = out[album][key] ??= { title: t.title };
    rec.title = t.title || rec.title;
    // JP: use preformed block if given, else wrap as official booklet text
    place(rec, 'jp', t.jp?.lines ? t.jp : block(jp, 'official booklet', 'official', `archive text lyrics (${album})`));
    if (ro) place(rec, 'romaji', t.romaji?.lines ? t.romaji : block(ro, 'Claude (Opus 4.8)', 'ai', 'jp→romaji AI pass'));
    if (en) place(rec, 'en',     t.en?.lines     ? t.en     : block(en, 'Claude (Opus 4.8)', 'ai', 'jp→en AI pass'));
    if (t.flags?.length) rec.flags = t.flags;
    tracks++;
  }
}

fs.writeFileSync(LYR, JSON.stringify(out, null, 2) + '\n');
const totAlbums = Object.keys(out).length;
const totTracks = Object.values(out).reduce((n, a) => n + Object.keys(a).length, 0);
console.log(`merged ${files} album files, ${tracks} tracks this run`);
console.log(`lyrics.json now: ${totAlbums} albums, ${totTracks} tracks -> ${LYR}`);
