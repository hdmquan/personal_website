#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const required = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_BASE'];
for (const name of required) if (!process.env[name]) throw new Error(`Missing ${name}`);

// Use the item's current primary data node directly. The archive.org redirector can select a
// stalled shard for these older MP3s and leave curl connected without transferring bytes.
const IA = 'https://ia601508.us.archive.org/17/items/hatsukiyura/';
const research = '/Users/symphie/Documents/GitHub/yura-research';
const releases = [
  {
    title: 'Clepsydra -Vocal CD-', album: 'Clepsydra -Vocal CD-', artist: '清風明月', year: '2008', date: '2008-12-15',
    cover: `${research}/assets/covers/guest/TMCD-003.jpg`, catalog: 'TMCD-003',
    files: [
      '1. Santuario ~Prelude~ .mp3', '2. Clepsydra ~Opening theme of clepsydra~.mp3',
      '3. Fairyland th 13 ~ Ending theme of clepsydra ~.mp3', '4. Santuario ~Clepsydra remix ~ .mp3',
      '5. Aphradisiac ~ aphrodisiac ~ .mp3', '6. Clepsydra ~intrumental~ .mp3',
      '7. Fairyland th 13 ~ intrumental~ .mp3', '8. Clepsydra remix ～instrumental~.mp3',
      '9. Aphradisiac ~intrumental~.mp3',
    ],
    path: 'Clepsydra - Vocal CD',
  },
  {
    title: 'Lost Omen', album: 'Lost Omen', artist: 'Label Liberta', year: '2008', date: '2008-10-13',
    cover: `${research}/assets/covers/094_Lost_Omen.jpg`, catalog: 'Label Liberta',
    files: [
      '1. Kei.mp3', '2. Tsukamenu Taiyou [vo. Arai Kazuhiro].mp3',
      '3. Hagoromo [vo. au, Hoshimi Aoto].mp3', '4. Rapunzel.mp3',
      '5. One Thousand and One [vo. Nagi Kaiji, Hoshimi Aoto].mp3', '6. Gense no Yume ~Cantarella~.mp3',
      '7. Cantarella [vo. Hoshimi Aoto].mp3', '8. Tsukiyo no Akai Kutsu [vo. au].mp3', '9. Kae.mp3',
    ],
    path: 'Label Liberta - Lost Omen',
  },
];

const catalogPath = new URL('../src/assets/catalogs/yura.json', import.meta.url);
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
catalog.albums = catalog.albums.filter(item => !item.archive_collab);
const endpoint = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
const scratch = await mkdtemp(join(tmpdir(), 'yura-collabs-'));
const awsEnv = { ...process.env, AWS_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION: 'auto' };

const run = (command, args, env = process.env) => {
  const result = spawnSync(command, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', env });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
};
const publicUrl = key => `${process.env.R2_PUBLIC_BASE}/${key.split('/').map(encodeURIComponent).join('/')}`;
try {
  for (const release of releases) {
    const coverKey = `covers/others/${release.title}.jpg`;
    run('aws', ['s3api', 'put-object', '--endpoint-url', endpoint, '--bucket', process.env.R2_BUCKET,
      '--key', coverKey, '--body', release.cover, '--content-type', 'image/jpeg',
      '--cache-control', 'public, max-age=31536000, immutable'], awsEnv);
    const tracks = [];
    for (let index = 0; index < release.files.length; index++) {
      const filename = release.files[index];
      const input = join(scratch, `${release.catalog}-${index}-source.mp3`);
      const output = join(scratch, `${release.catalog}-${index}-128.mp3`);
      const source = IA + [release.path, filename].map(encodeURIComponent).join('/');
      // archive.org occasionally returns a transient 500 from one download shard to Node's fetch.
      // curl follows the shard redirect and retries transport/5xx failures reliably.
      run('curl', ['-L', '--fail', '--silent', '--show-error', '--connect-timeout', '15', '--max-time', '240',
        '--retry', '6', '--retry-all-errors',
        '--output', input, source]);
      run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-map', '0:a:0', '-vn',
        '-map_metadata', '0', '-codec:a', 'libmp3lame', '-b:a', '128k', '-id3v2_version', '3', output]);
      const duration = Math.round(Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1', output])));
      const bitrate = Number(run('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=bit_rate',
        '-of', 'default=noprint_wrappers=1:nokey=1', output]));
      if (bitrate > 129000) throw new Error(`Unexpected bitrate ${bitrate}: ${filename}`);
      const key = `others/${release.title}/${filename}`;
      run('aws', ['s3api', 'put-object', '--endpoint-url', endpoint, '--bucket', process.env.R2_BUCKET,
        '--key', key, '--body', output, '--content-type', 'audio/mpeg',
        '--cache-control', 'public, max-age=31536000, immutable'], awsEnv);
      tracks.push({ track: String(index + 1).padStart(2, '0'), title: filename.replace(/^\d+\.\s*/, '').replace(/\.mp3$/i, ''),
        instrumental: /intrumental|instrumental/i.test(filename), file: key, url: publicUrl(key), dur: duration, genres: [] });
      console.log(`${release.title} ${index + 1}/${release.files.length} · ${Math.round(bitrate / 1000)} kbps`);
    }
    catalog.albums.push({ album: release.album, title: release.title, artist: release.artist, year: release.year,
      date: release.date, catalog: release.catalog, cover: coverKey, cover_url: publicUrl(coverKey),
      release_types: ['others'], archive_collab: true, tracks });
  }
  catalog.release_counts.others = catalog.albums.filter(a => (a.release_types || []).includes('others')).length;
  delete catalog.release_counts.collab;
  await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + '\n');
} finally {
  await rm(scratch, { recursive: true, force: true });
}
