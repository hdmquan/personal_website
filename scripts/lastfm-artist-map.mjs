#!/usr/bin/env node
/* Cross-reference each catalog album against Last.fm to find the artist it's actually catalogued
 * under (so scrobbles link to the right page + cover art). Tries a set of candidate artists per
 * album, scores each by how "real" the Last.fm entry is (mbid / listeners / non-placeholder art),
 * and writes a draft map. Albums with no confident match are listed as UNKNOWN for human review.
 *
 *   LASTFM_API_KEY=<key> node scripts/lastfm-artist-map.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';

const KEY = process.env.LASTFM_API_KEY;
if (!KEY) { console.error('set LASTFM_API_KEY'); process.exit(1); }

// Last.fm's default "no image" placeholder hash — treat as "no art".
const PLACEHOLDER = '2a96cbd8b46e442fc41c2b86b821562f';
const CANDIDATES = ['La Bella Luna', '葉月ゆら'];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function albumInfo(artist, album) {
  const u = `https://ws.audioscrobbler.com/2.0/?method=album.getinfo&artist=${encodeURIComponent(artist)}&album=${encodeURIComponent(album)}&api_key=${KEY}&format=json&autocorrect=1`;
  try {
    const d = await (await fetch(u)).json();
    if (!d.album) return null;
    const a = d.album;
    const img = (a.image || []).map(i => i['#text']).filter(Boolean).pop() || '';
    const hasArt = img && !img.includes(PLACEHOLDER);
    const listeners = +(a.listeners || 0), playcount = +(a.playcount || 0);
    const real = !!a.mbid || listeners > 0 || hasArt;
    return { artist: a.artist, name: a.name, mbid: a.mbid || '', listeners, playcount, hasArt, real };
  } catch (e) { return null; }
}

const cat = JSON.parse(await readFile(new URL('../src/assets/catalogs/yura.json', import.meta.url)));
const out = [], unknown = [], ambiguous = [];

for (let i = 0; i < cat.albums.length; i++) {
  const title = cat.albums[i].title;
  const results = [];
  for (const c of CANDIDATES) {
    const r = await albumInfo(c, title);
    if (r && r.real) results.push({ candidate: c, ...r });
    await sleep(220);
  }
  let pick = null, flag = '';
  if (results.length === 1) pick = results[0];
  else if (results.length > 1) {
    // both have entries — prefer the one that actually has cover art, then listeners.
    results.sort((a, b) => (b.hasArt - a.hasArt) || (b.listeners - a.listeners));
    pick = results[0];
    // only a genuine conflict if BOTH have art (real duplicate pages) — those need a human call.
    if (results.filter(r => r.hasArt).length > 1) {
      flag = 'conflict';
      ambiguous.push({ title, options: results.map(r => `${r.candidate} (L${r.listeners}${r.hasArt ? ',art' : ''})`) });
    }
  }
  if (!pick) { unknown.push(title); out.push({ title, artist: null, art: false }); }
  else out.push({ title, artist: pick.candidate, art: pick.hasArt, listeners: pick.listeners, flag });
  process.stdout.write(`  ${i + 1}/${cat.albums.length}\r`);
}

const byArtist = {};
for (const o of out) byArtist[o.artist || 'UNKNOWN'] = (byArtist[o.artist || 'UNKNOWN'] || 0) + 1;
const noArt = out.filter(o => o.artist && !o.art).map(o => o.title);

await writeFile(new URL('./artist-map.draft.json', import.meta.url), JSON.stringify({ map: out, unknown, ambiguous }, null, 2));
console.log('\n=== by artist ==='); console.log(byArtist);
console.log(`\nmatched but NO art on Last.fm (${noArt.length}):`); noArt.forEach(t => console.log('  ·', t));
console.log(`\nAMBIGUOUS — listed under both (${ambiguous.length}):`); ambiguous.forEach(a => console.log('  ·', a.title, '→', a.options.join('  |  ')));
console.log(`\nUNKNOWN — no confident match (${unknown.length}):`); unknown.forEach(t => console.log('  ·', t));
console.log('\ndraft → scripts/artist-map.draft.json');
