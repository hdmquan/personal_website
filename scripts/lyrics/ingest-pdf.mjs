#!/usr/bin/env node
/* Ingest the PDF-OCR results (work/out/pdf-NN.json) into lyrics.json, mapping slug→album via
   work/pdf-tasks/run.json. jp = booklet transcription; romaji/en = AI drafts. Never overwrites an
   existing human/official/transcription block. Usage: node ingest-pdf.mjs [pdf-00 pdf-01 ...]
   (no args = all slugs in run.json that have an output file). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const LYR_PATH = path.join(ROOT, 'src/assets/catalogs/lyrics.json');
const RUN = JSON.parse(fs.readFileSync(path.join(HERE, 'work/pdf-tasks/run.json'), 'utf8'));
const bySlug = new Map(RUN.map(r => [r.slug, r]));
const AI = new Set(['ai']);
const protectedBlk = b => b && b.kind && !AI.has(b.kind);
const pad = t => String(t).padStart(2, '0');

const LYR = JSON.parse(fs.readFileSync(LYR_PATH, 'utf8'));
let slugs = process.argv.slice(2);
if (!slugs.length) slugs = RUN.map(r => r.slug).filter(s => fs.existsSync(bySlug.get(s).out));

for (const slug of slugs) {
  const r = bySlug.get(slug);
  if (!r) { console.error('  ! unknown slug', slug); continue; }
  if (!fs.existsSync(r.out)) { console.error('  ! no output for', slug, r.album); continue; }
  let data; try { data = JSON.parse(fs.readFileSync(r.out, 'utf8')); } catch { console.error('  ! bad json', slug); continue; }
  const album = r.album;
  LYR[album] = LYR[album] || {};
  let nJp = 0, nRo = 0, nEn = 0;
  for (const [tk, t] of Object.entries(data)) {
    if (!t || typeof t !== 'object') continue;
    const track = pad(tk);
    const rec = LYR[album][track] = LYR[album][track] || { title: t.title || '', flags: t.flags || [] };
    if (!rec.title && t.title) rec.title = t.title;
    const date = (t.jp && t.jp.date) || '2026-08-10';
    if (t.jp && t.jp.lines && t.jp.lines.length && !protectedBlk(rec.jp)) { rec.jp = t.jp; nJp++; }
    if (Array.isArray(t.romaji) && t.romaji.length && !protectedBlk(rec.romaji)) {
      rec.romaji = { lines: t.romaji, by: 'Claude (Opus 4.8)', kind: 'ai', src: `booklet PDF — ${album}`, date }; nRo++;
    }
    if (Array.isArray(t.en) && t.en.length && !protectedBlk(rec.en)) {
      rec.en = { lines: t.en, by: 'Claude (Opus 4.8)', kind: 'ai', src: `booklet PDF — ${album}`, date }; nEn++;
    }
  }
  console.log(`${slug}  ${album}  jp+${nJp} romaji+${nRo} en+${nEn}`);
}
fs.writeFileSync(LYR_PATH, JSON.stringify(LYR, null, 2) + '\n');
console.log(`lyrics.json now has ${Object.keys(LYR).length} albums`);
