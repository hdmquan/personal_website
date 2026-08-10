#!/usr/bin/env node
/* Ingest one or more OCR results (work/ocr-removed/<id>.json, or work/out/<id>.json for fresh
   runs) into lyrics.json, one album at a time. jp is the booklet transcription (block kept
   as-is); romaji/en are AI drafts (raw arrays → wrapped into {kind:'ai'} blocks). Never
   overwrites an existing human/official block for a language (community work wins).

   Usage: node ingest-ocr.mjs ocr-03 [ocr-16 ...]         (reads ocr-removed first, then out)
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const LYR_PATH = path.join(ROOT, 'src/assets/catalogs/lyrics.json');
const IDX = JSON.parse(fs.readFileSync(path.join(HERE, 'work/ocr-tasks/index.json'), 'utf8'));
const byId = new Map(IDX.map(e => [e.id, e]));

function loadResult(id) {
  for (const dir of ['work/ocr-removed', 'work/out']) {
    const p = path.join(HERE, dir, id + '.json');
    if (fs.existsSync(p)) return { data: JSON.parse(fs.readFileSync(p, 'utf8')), from: dir };
  }
  return null;
}
const AI_KINDS = new Set(['ai']);                 // may overwrite these; keep human/official/transcription
const isProtected = b => b && b.kind && !AI_KINDS.has(b.kind);
const pad = t => String(t).padStart(2, '0');

const LYR = JSON.parse(fs.readFileSync(LYR_PATH, 'utf8'));
const ids = process.argv.slice(2);
if (!ids.length) { console.error('usage: node ingest-ocr.mjs <task-id> [...]'); process.exit(1); }

for (const id of ids) {
  const meta = byId.get(id);
  if (!meta) { console.error(`  ! unknown task ${id}`); continue; }
  const res = loadResult(id);
  if (!res) { console.error(`  ! no result file for ${id} (${meta.album})`); continue; }
  const album = meta.album;
  const src = `booklet scan — ${album}`;
  LYR[album] = LYR[album] || {};
  let nJp = 0, nRo = 0, nEn = 0, skip = 0;
  for (const [tk, t] of Object.entries(res.data)) {
    if (!t || typeof t !== 'object') continue;
    const track = pad(tk);
    const rec = LYR[album][track] = LYR[album][track] || { title: t.title || '', flags: t.flags || [] };
    if (!rec.title && t.title) rec.title = t.title;
    // jp — booklet transcription block (already a {lines,by,kind,src,date})
    if (t.jp && t.jp.lines && t.jp.lines.length && !isProtected(rec.jp)) { rec.jp = t.jp; nJp++; }
    else if (isProtected(rec.jp)) skip++;
    const date = (t.jp && t.jp.date) || '2026-08-07';
    // romaji / en — AI drafts (raw arrays → blocks); don't clobber a human block
    if (Array.isArray(t.romaji) && t.romaji.length && !isProtected(rec.romaji)) {
      rec.romaji = { lines: t.romaji, by: 'Claude (Opus 4.8)', kind: 'ai', src: `OCR draft — ${album}`, date }; nRo++;
    }
    if (Array.isArray(t.en) && t.en.length && !isProtected(rec.en)) {
      rec.en = { lines: t.en, by: 'Claude (Opus 4.8)', kind: 'ai', src: `OCR draft — ${album}`, date }; nEn++;
    }
  }
  console.log(`${id}  ${album}  [${res.from}]  jp+${nJp} romaji+${nRo} en+${nEn}${skip ? ` (kept ${skip} protected)` : ''}`);
}
fs.writeFileSync(LYR_PATH, JSON.stringify(LYR, null, 2) + '\n');
console.log(`lyrics.json now has ${Object.keys(LYR).length} albums`);
