#!/usr/bin/env node
/* Ingest a whole-album Suzuyo transliteration .docx sectioned as
   "N_Title / 日本語: <jp> / Romaji: <romaji> [/ English: <en>]" per track.
   Overlays Suzuyo's HUMAN romaji (and English if present) onto the album; sets JP only if the
   track has none yet. Never downgrades an existing human/official block. Blank lines = stanza gaps.
   Usage: node ingest-suzuyo-album.mjs "<~/Downloads/xxx.docx>" "<Album title>" */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LYR_PATH = path.join(ROOT, 'src/assets/catalogs/lyrics.json');
const [docxArg, album] = process.argv.slice(2);
if (!docxArg || !album) { console.error('usage: node ingest-suzuyo-album.mjs <docx> <album>'); process.exit(1); }
const docx = docxArg.replace(/^~/, os.homedir());
const DATE = '2026-08-11';

// docx paragraphs (keep blanks)
const xml = execSync(`unzip -p "${docx}" word/document.xml`, { maxBuffer: 1 << 26 }).toString('utf8');
const paras = xml.split('</w:p>').map(p =>
  (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map(m => m.replace(/<[^>]*>/g, '')).join('')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim());

// split into per-track sections
const tracks = {};
let cur = null, mode = null;
const trim = arr => { while (arr.length && arr[0] === '') arr.shift(); while (arr.length && arr[arr.length - 1] === '') arr.pop(); return arr; };
for (const line of paras) {
  const h = line.match(/^(\d{1,2})[_\s]\s*(.+)$/);
  if (h) { cur = { n: h[1].padStart(2, '0'), title: h[2].trim(), jp: [], romaji: [], en: [] }; tracks[cur.n] = cur; mode = null; continue; }
  if (!cur) continue;
  if (/^日本語[:：]?$/.test(line)) { mode = 'jp'; continue; }
  if (/^(ローマ字|romaji)[:：]?$/i.test(line)) { mode = 'romaji'; continue; }
  if (/^(english|英語)[:：]?$/i.test(line)) { mode = 'en'; continue; }
  if (mode) cur[mode].push(line);
}

const LYR = JSON.parse(fs.readFileSync(LYR_PATH, 'utf8'));
LYR[album] = LYR[album] || {};
const protectedBlk = b => b && b.kind && b.kind !== 'ai';
// Suzuyo's JP is a by-ear transcription of what's actually SUNG (the singer often departs from the
// printed booklet), so it's treated as the more reliable source: it overrides official/transcription/ai
// JP. Only another person's HUMAN JP is protected (a re-run by Suzuyo still refreshes her own).
const jpBlocked = b => b && b.kind === 'human' && b.by !== 'Suzuyo';
let nJp = 0, nRo = 0, nEn = 0;
for (const t of Object.values(tracks)) {
  ['jp', 'romaji', 'en'].forEach(k => trim(t[k]));
  if (!t.romaji.length && !t.jp.length) continue;
  const rec = LYR[album][t.n] = LYR[album][t.n] || { title: t.title, flags: [] };
  if (!rec.title) rec.title = t.title;
  if (t.jp.length && !jpBlocked(rec.jp)) { rec.jp = { lines: t.jp, by: 'Suzuyo', kind: 'human', src: path.basename(docx), date: DATE }; nJp++; }
  if (t.romaji.length && (!rec.romaji || !protectedBlk(rec.romaji))) { rec.romaji = { lines: t.romaji, by: 'Suzuyo', kind: 'human', src: path.basename(docx), date: DATE }; nRo++; }
  if (t.en.length && (!rec.en || !protectedBlk(rec.en))) { rec.en = { lines: t.en, by: 'Suzuyo', kind: 'human', src: path.basename(docx), date: DATE }; nEn++; }
}
fs.writeFileSync(LYR_PATH, JSON.stringify(LYR, null, 2) + '\n');
console.log(`${album}: tracks ${Object.keys(tracks).join(',')} | jp+${nJp} romaji(Suzuyo)+${nRo} en+${nEn}`);
