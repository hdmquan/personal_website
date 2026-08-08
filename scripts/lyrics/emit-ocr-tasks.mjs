#!/usr/bin/env node
// Build OCR task specs (one per scan-only album) + an index mapping output file -> album.
import fs from 'node:fs';
import path from 'node:path';

const SCANROOT = path.resolve(process.argv[2] || '');       // …/scratchpad/scans/葉月ゆら
const q = JSON.parse(fs.readFileSync('scripts/lyrics/work/scan-queue.json', 'utf8'));
const cat = JSON.parse(fs.readFileSync('src/assets/catalogs/yura.json', 'utf8'));
const TASKDIR = path.resolve('scripts/lyrics/work/ocr-tasks');
const OUTDIR = path.resolve('scripts/lyrics/work/out');
fs.mkdirSync(TASKDIR, { recursive: true });

// locate an album folder anywhere under SCANROOT/<label>/<folder>
const labels = fs.readdirSync(SCANROOT, { withFileTypes: true }).filter(d => d.isDirectory());
function findAlbumDir(folder) {
  for (const l of labels) {
    const p = path.join(SCANROOT, l.name, folder);
    if (fs.existsSync(p)) return p;
  }
  return null;
}
const imageExt = /\.(jpe?g|png|tiff?)$/i;
const artName = /(^|\/)(folder|cover|back|front|disk|disc|obi|thumbs)\b/i;
function imagesIn(dir) {
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const fp = path.join(d, e.name);
      if (e.isDirectory()) walk(fp);
      else if (imageExt.test(e.name)) out.push(fp);
    }
  })(dir);
  return out.sort();
}

const index = {};   // outfile basename -> album title
const list = [];
let n = 0;
for (const row of q.queue) {
  n++;
  const id = 'ocr-' + String(n).padStart(2, '0');
  const outFile = `${id}.json`;
  const outPath = path.join(OUTDIR, outFile);
  index[outFile] = row.album;
  // resumable: skip if already produced (also honor the manual proof file)
  const dir = findAlbumDir(row.folder);
  const a = cat.albums.find(x => x.title === row.album);
  const catalogTracks = (a?.tracks || []).map(t => ({ n: t.track, title: t.title, instrumental: !!t.instrumental }));
  const imgs = dir ? imagesIn(dir).filter(f => !artName.test(f)) : [];
  const spec = { id, album: row.album, year: a?.year || null, albumDir: dir, images: imgs, outPath, catalogTracks };
  fs.writeFileSync(path.join(TASKDIR, `${id}.json`), JSON.stringify(spec, null, 2));
  list.push({ id, album: row.album, dir: !!dir, images: imgs.length, outExists: fs.existsSync(outPath) });
}
// include the proof file's mapping
index['ocr-gothika2.json'] = 'Gothika 2 ~御伽影牢館~';
fs.writeFileSync(path.join(TASKDIR, 'ocr-index.json'), JSON.stringify(index, null, 2));
fs.writeFileSync(path.join(TASKDIR, 'index.json'), JSON.stringify(list, null, 2));
const noDir = list.filter(x => !x.dir);
console.log(`OCR specs: ${list.length}  | with image dir: ${list.filter(x => x.dir).length}  | missing dir: ${noDir.length}`);
console.log(`avg images/album: ${(list.reduce((s, x) => s + x.images, 0) / list.length).toFixed(1)}`);
if (noDir.length) console.log('MISSING DIRS:', noDir.map(x => x.album).join(' | '));
