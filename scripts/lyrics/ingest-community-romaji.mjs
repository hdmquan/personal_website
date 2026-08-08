#!/usr/bin/env node
// Ingest community romaji from the two Downloads .docx (already converted to txt in scratchpad):
//   haikei.txt = 灰白Apostle #02, JP/romaji alternating
//   mahou.txt  = まほうのはな, sections "N_Title / 日本語: <jp> / Romaji: <romaji>"
// Align each to our existing jp.lines (blank stanza breaks preserved) and replace the AI romaji.
import fs from 'node:fs';

const SP = '/private/tmp/claude-501/-Users-symphie-Documents-GitHub/e73c6820-af8e-423b-928f-23e4d894fa98/scratchpad';
const LYR = 'src/assets/catalogs/lyrics.json';
const lyr = JSON.parse(fs.readFileSync(LYR, 'utf8'));
const DATE = '2026-08-08';
const CREDIT = { by: 'community transliteration', kind: 'human' };
const isRom = s => /[A-Za-z]/.test(s) && !/[぀-ヿ一-鿿]/.test(s); // Latin, no kana/kanji

// --- collect community romaji line lists, keyed by album/track ---
const jobs = [];   // {album, track, romaji:[non-empty lines], src}

// haikei: every romaji line (Latin) in order
const haikei = fs.readFileSync(`${SP}/haikei.txt`, 'utf8').split('\n').map(s => s.trim());
jobs.push({ album: '灰白Apostle', track: '02', src: '2_拝啓、お姉さま。.docx',
  romaji: haikei.filter(s => s && isRom(s)) });

// mahou: parse sections
const mahou = fs.readFileSync(`${SP}/mahou.txt`, 'utf8').split('\n').map(s => s.replace(/\s+$/, ''));
const trackByHeader = { '2': '02', '3': '03', '4': '04', '5': '05' };
let curTrack = null, inRom = false, buf = [];
const flush = () => { if (curTrack && buf.length) jobs.push({ album: 'まほうのはな', track: curTrack, src: 'Mahou no hana transliterations.docx', romaji: buf.slice() }); };
for (const line of mahou) {
  const h = line.match(/^([0-9]+)_/);
  if (h) { flush(); curTrack = trackByHeader[h[1]] || null; inRom = false; buf = []; continue; }
  if (/^Romaji:/i.test(line)) { inRom = true; continue; }
  if (/^日本語:/.test(line)) { inRom = false; continue; }
  if (inRom && line.trim()) buf.push(line.trim());
}
flush();

// --- align each community romaji list onto our jp.lines ---
let applied = 0, skipped = [];
for (const j of jobs) {
  const rec = lyr[j.album]?.[j.track];
  if (!rec?.jp?.lines) { skipped.push(`${j.album}#${j.track} (no jp)`); continue; }
  const jp = rec.jp.lines;
  const need = jp.filter(x => x.trim() !== '').length;
  if (j.romaji.length !== need) { skipped.push(`${j.album}#${j.track} (count ${j.romaji.length}≠${need} jp)`); continue; }
  const out = []; let i = 0;
  for (const line of jp) out.push(line.trim() === '' ? '' : j.romaji[i++]);
  rec.romaji = { lines: out, by: CREDIT.by, kind: CREDIT.kind, src: j.src, date: DATE };
  applied++;
  console.log(`✓ ${j.album} #${j.track} — romaji ${out.length} lines (human)`);
}
for (const s of skipped) console.log(`↷ skipped ${s} — kept AI romaji`);
fs.writeFileSync(LYR, JSON.stringify(lyr, null, 2) + '\n');
console.log(`\napplied ${applied}, skipped ${skipped.length}`);
