#!/usr/bin/env node
/* Parse Suzuyo's per-track transliteration .docx (in ~/Downloads) into {jp, romaji, en}
   columns and match each to a catalog album+track by title. Reports the mapping (dry run);
   with --write, ingests into lyrics.json (romaji/en credited to Suzuyo, JP as official).

   Each docx interleaves lines: JP, then Romaji, then optionally an English line, per lyric line.
   Blank paragraphs mark stanza breaks (kept as "" across all columns). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DL = path.join(os.homedir(), 'Downloads');
const CAT = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/assets/catalogs/yura.json'), 'utf8'));
const LYR_PATH = path.join(ROOT, 'src/assets/catalogs/lyrics.json');
const DATE = '2026-08-11';

// the Aug-10 per-track batch (Abyss / Mahou / 拝啓 were ingested earlier via ingest-community-romaji.mjs)
const FILES = [
  '3_ありふれた心酔.docx', '6_ジゼル.docx', '6_Devil Doll.docx', 'Nosferatu .docx',
  'Labyrinth -死の神と少女-_.docx', '01_イヴリリスの果実.docx', '6_Oracle.docx',
  '3_ヒロイン_ ヴァイオレット.docx', '03_おそろいの秘密 -Hansel & Gretel-.docx',
  '7_テアートルの怪人.docx', 'The Cursed Doll.docx', '今は亡き、令嬢ロクサーヌ.docx',
];

const hasJP = s => /[぀-ヿ㐀-鿿]/.test(s);
const norm = s => (s || '').normalize('NFKC')
  .replace(/&|＆|\band\b/gi, '')          // "Hansel & Gretel" ≡ "Hansel and Gretel"
  .replace(/[\s　’'"”“〜～~:：・\-—–ー_/／|｜()（）\[\]［］「」『』【】,、，.。!！?？＊*＝=+]/g, '')
  .toLowerCase();

// docx paragraphs, keeping blanks as ''
function docxParas(file) {
  const xml = execSync(`unzip -p "${file}" word/document.xml`, { maxBuffer: 1 << 26 }).toString('utf8');
  return xml.split('</w:p>').map(p => {
    const t = (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map(m => m.replace(/<[^>]*>/g, '')).join('');
    return t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
  });
}

// non-lyric structural lines to drop: a title, or a section marker like "[前奏 (Intro)]", "[主歌]".
const isMarker = s => /^[\[【（(［]/.test(s) || /^[~〜～].*[~〜～]$/.test(s)
  || /^(前奏|主歌|間奏|大?サビ|[ABC]メロ|落ちサビ|Intro|Verse|Chorus|Bridge|Outro|Interlude|Pre-?Chorus)\b/i.test(s);

// interleaved JP / Romaji / (English) → three aligned columns.
// titleHint drops a leading title line; section markers and per-line double-spacing are cleaned up.
function parseColumns(paras, titleHint) {
  // 1) build an ordered item stream: content triplets + blank-run markers
  const items = [];
  let cur = null, blanks = 0;
  const flush = () => { if (cur) { items.push({ c: cur }); cur = null; } };
  for (const line of paras) {
    if (line === '') { flush(); blanks++; continue; }
    if (blanks) { items.push({ blank: blanks }); blanks = 0; }
    if (hasJP(line)) { flush(); cur = { jp: line, romaji: '', en: '' }; }
    else if (cur) { if (!cur.romaji) cur.romaji = line; else if (!cur.en) cur.en = line; else cur.romaji += ' ' + line; }
  }
  flush();
  // 2) drop the title line and section markers (they carry no real lyric)
  const want = norm(titleHint);
  let content = items.filter(it => it.c).map(it => it.c);
  content = content.filter((g, i) => {
    if (!g.jp) return false;                         // stray latin-only header/footer
    if (isMarker(g.jp)) return false;                // [前奏]/[Verse]/… markers
    if (i === 0 && norm(g.jp) === want) return false; // leading title line
    return true;
  });
  const contentSet = new Set(content);
  // 3) blank policy: if there's a blank after nearly every line, the doc is double-spaced →
  //    keep a stanza gap only where there were 2+ blanks. Otherwise single blanks ARE stanza breaks.
  const nContent = content.length;
  const runs = items.filter(it => it.blank).length;
  const perLine = nContent > 0 && runs >= nContent * 0.6;
  const jp = [], romaji = [], en = [];
  for (const it of items) {
    if (it.c) { if (!contentSet.has(it.c)) continue; jp.push(it.c.jp); romaji.push(it.c.romaji); en.push(it.c.en); }
    else if (it.blank) { const keep = perLine ? it.blank >= 2 : true; if (keep && jp.length) { jp.push(''); romaji.push(''); en.push(''); } }
  }
  while (jp.length && jp[jp.length - 1] === '') { jp.pop(); romaji.pop(); en.pop(); }
  // only a genuine full translation counts as EN — stray single English words shouldn't spawn an EN block
  const rN = romaji.filter(x => x && x.trim()).length;
  const eN = en.filter(x => x && x.trim()).length;
  const hasEn = rN > 0 && eN >= rN * 0.5;
  if (!hasEn) for (let i = 0; i < en.length; i++) en[i] = '';
  return { jp, romaji, en, hasEn };
}

function fileMeta(fn) {
  let base = fn.replace(/\.docx$/i, '').replace(/\s*\(\d+\)$/, '').trim();
  let track = null;
  const m = base.match(/^(\d{1,2})[_\s]+(.+)$/);
  if (m) { track = m[1].padStart(2, '0'); base = m[2]; }
  const title = base.replace(/_+$/, '').replace(/_/g, '・').trim();   // filename _ often stands for ・ or :
  return { track, title };
}

// find album+track by title (and track hint) across the catalog
function match(title, trackHint) {
  const want = norm(title);
  const hits = [];
  for (const a of CAT.albums) for (const t of a.tracks) {
    const nt = norm(t.title);
    if (!nt) continue;
    if (nt === want || (want.length >= 3 && (nt.includes(want) || want.includes(nt))))
      hits.push({ album: a.title, track: t.track, title: t.title, exact: nt === want });
  }
  // prefer exact, then the one matching the track-number hint
  hits.sort((x, y) => (y.exact - x.exact) || ((y.track === trackHint) - (x.track === trackHint)));
  return hits;
}

const write = process.argv.includes('--write');
const results = [];
for (const fn of FILES) {
  const full = path.join(DL, fn);
  if (!fs.existsSync(full)) { console.log(`MISSING  ${fn}`); continue; }
  const { track, title } = fileMeta(fn);
  const cols = parseColumns(docxParas(full), title);
  const hits = match(title, track);
  results.push({ fn, track, title, cols, hits });
}

// report
for (const r of results) {
  const top = r.hits[0];
  const tag = !top ? 'NOMATCH' : (r.hits.filter(h => h.exact).length > 1 ? 'AMBIG ' : 'OK    ');
  console.log(`${tag} ${r.fn}`);
  console.log(`        title="${r.title}" track#=${r.track || '-'}  lines: jp=${r.cols.jp.length} romaji=${r.cols.romaji.filter(Boolean).length} en=${r.cols.hasEn ? r.cols.en.filter(Boolean).length : 0}`);
  for (const h of r.hits.slice(0, 3)) console.log(`          -> ${h.album}  #${h.track}  "${h.title}"${h.exact ? ' [exact]' : ''}`);
}

if (write) {
  const LYR = JSON.parse(fs.readFileSync(LYR_PATH, 'utf8'));
  let n = 0;
  for (const r of results) {
    const top = r.hits[0];
    if (!top) { console.log(`skip (no match): ${r.fn}`); continue; }
    LYR[top.album] = LYR[top.album] || {};
    const rec = LYR[top.album][top.track] = LYR[top.album][top.track] || { title: top.title, flags: [] };
    // Suzuyo's JP transcribes the SUNG version (more reliable than the printed booklet) → overrides
    // official/transcription/ai; only another person's human JP is protected.
    const jpBlocked = rec.jp && rec.jp.kind === 'human' && rec.jp.by !== 'Suzuyo';
    if (r.cols.jp.some(Boolean) && !jpBlocked)
      rec.jp = { lines: r.cols.jp, by: 'Suzuyo', kind: 'human', src: r.fn, date: DATE };
    rec.romaji = { lines: r.cols.romaji, by: 'Suzuyo', kind: 'human', src: r.fn, date: DATE };
    if (r.cols.hasEn) rec.en = { lines: r.cols.en, by: 'Suzuyo', kind: 'human', src: r.fn, date: DATE };
    n++;
  }
  fs.writeFileSync(LYR_PATH, JSON.stringify(LYR, null, 2) + '\n');
  console.log(`\nwrote ${n} tracks into lyrics.json`);
}
