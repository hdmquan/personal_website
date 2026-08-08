#!/usr/bin/env node
// Map archive album folders -> yura.json titles, and build a job queue of text-lyric
// tracks (album, track#, source .txt path). No lyric content is read here; only paths.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.argv[2] || '');            // extracted-text root (…/txt/葉月ゆら)
const CAT = path.resolve('src/assets/catalogs/yura.json');
const OUT = path.resolve('scripts/lyrics/work/jobs.json');
const REPORT = path.resolve('scripts/lyrics/work/mapping-report.json');

const norm = s => (s || '').toLowerCase().normalize('NFKC')
  .replace(/[\s　]/g, '').replace(/[-–—_.,:;!?'"“”‘’()\[\]{}~〜～・「」『』【】]/g, '');

const cat = JSON.parse(fs.readFileSync(CAT, 'utf8'));
const albums = cat.albums || [];
// index: normalized title -> album (longest titles first for greedy substring match)
const byTitle = albums.map(a => ({ a, key: norm(a.title), year: String(a.year || (a.date||'').slice(0,4)) }))
  .filter(x => x.key).sort((x, y) => y.key.length - x.key.length);

function matchAlbum(folder) {
  const nf = norm(folder);
  const yr = (folder.match(/(19|20)\d{2}/) || [])[0] || '';
  // prefer a title match that also agrees on year; fall back to title-only
  let best = null;
  for (const cand of byTitle) {
    if (cand.key.length < 2) continue;
    if (nf.includes(cand.key)) {
      const yearOk = yr && cand.year && yr === cand.year;
      if (yearOk) return cand.a;               // strong match, done
      if (!best) best = cand.a;                // remember first (=longest) title-only match
    }
  }
  return best;
}

const isLyricFolder = d => /^(lyrics|歌詞|歌詞テキスト)$/i.test(d);
const looksLikeLyricTxt = f =>
  /^\d+[ _.]/.test(f) ||                       // "3_Title.txt", "05. lyrics.txt"
  /歌詞|lyric/i.test(f);
const skipTxt = f => /khinsider|readme|^info|\binfo\b|\.log$|\.cue$/i.test(f) ||
  /^[A-Z]{3,4}[-.]?\d/.test(f);                // catalog-code files (ASPA-1.txt etc.) — usually credits

const jobs = [];
const albumFolders = fs.readdirSync(ROOT, { withFileTypes: true })
  .filter(d => d.isDirectory());               // label dirs (HATU, SEFU, …)
const report = { matched: [], unmatched: [], albumsWithLyrics: 0 };

for (const label of albumFolders) {
  const labelPath = path.join(ROOT, label.name);
  for (const alb of fs.readdirSync(labelPath, { withFileTypes: true }).filter(d => d.isDirectory())) {
    const albPath = path.join(labelPath, alb.name);
    const matched = matchAlbum(alb.name);
    // gather candidate lyric txts: in a lyrics subfolder, or per-track at album root
    const files = [];
    for (const ent of fs.readdirSync(albPath, { withFileTypes: true })) {
      if (ent.isDirectory() && isLyricFolder(ent.name)) {
        for (const t of fs.readdirSync(path.join(albPath, ent.name)))
          if (t.endsWith('.txt') && !skipTxt(t)) files.push(path.join(albPath, ent.name, t));
      } else if (ent.isFile() && ent.name.endsWith('.txt') && looksLikeLyricTxt(ent.name) && !skipTxt(ent.name)) {
        files.push(path.join(albPath, ent.name));
      }
    }
    if (!files.length) continue;
    report.albumsWithLyrics++;
    if (!matched) { report.unmatched.push({ folder: alb.name, files: files.length }); continue; }
    report.matched.push({ folder: alb.name, album: matched.title, files: files.length });
    for (const f of files) {
      const base = path.basename(f, '.txt');
      const tno = (base.match(/^(\d+)/) || [])[1] || null;
      jobs.push({ album: matched.title, track: tno, file: f, srcName: path.basename(f) });
    }
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(jobs, null, 2));
fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
console.log(`jobs: ${jobs.length}  | albums w/ lyric txt: ${report.albumsWithLyrics}  | matched: ${report.matched.length}  unmatched: ${report.unmatched.length}`);
console.log('unmatched folders:', report.unmatched.map(u => u.folder).join(' | ') || '(none)');
