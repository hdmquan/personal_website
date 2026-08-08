#!/usr/bin/env node
// Turn jobs.json into one self-contained task spec per album for a translation agent.
import fs from 'node:fs';
import path from 'node:path';

const jobs = JSON.parse(fs.readFileSync('scripts/lyrics/work/jobs.json', 'utf8'));
const cat = JSON.parse(fs.readFileSync('src/assets/catalogs/yura.json', 'utf8'));
const albums = cat.albums || [];
const TASKDIR = path.resolve('scripts/lyrics/work/tasks');
const OUTDIR = path.resolve('scripts/lyrics/work/out');
fs.mkdirSync(TASKDIR, { recursive: true });
fs.mkdirSync(OUTDIR, { recursive: true });

const byAlbum = {};
for (const j of jobs) (byAlbum[j.album] ??= []).push(j);

let idx = 0; const list = [];
for (const [album, ts] of Object.entries(byAlbum)) {
  idx++;
  const a = albums.find(x => x.title === album);
  const catalogTracks = (a?.tracks || []).map(t => ({
    n: t.track, title: t.title, instrumental: !!t.instrumental,
  }));
  const files = ts.map(t => ({ track: t.track ? Number(t.track) : null, path: t.file, srcName: t.srcName }))
    .sort((x, y) => (x.track || 99) - (y.track || 99));
  const id = String(idx).padStart(2, '0');
  const spec = {
    id, album, year: a?.year || null,
    outPath: path.join(OUTDIR, `${id}.json`),
    catalogTracks, files,
  };
  const specPath = path.join(TASKDIR, `${id}.json`);
  fs.writeFileSync(specPath, JSON.stringify(spec, null, 2));
  list.push({ id, album, tracks: files.length, specPath, outPath: spec.outPath });
}
fs.writeFileSync(path.join(TASKDIR, 'index.json'), JSON.stringify(list, null, 2));
for (const l of list) console.log(`${l.id}  ${l.album.padEnd(28)} ${l.tracks} tracks  spec=${l.specPath}`);
