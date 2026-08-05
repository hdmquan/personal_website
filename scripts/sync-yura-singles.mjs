#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const required = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_BASE'];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing ${name}`);
}

const catalogPath = new URL('../src/assets/catalogs/yura.json', import.meta.url);
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const singles = catalog.albums.filter(release => release.virtual_single);
const endpoint = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
const scratch = await mkdtemp(join(tmpdir(), 'yura-singles-'));

const run = (command, args) => {
  const env = command === 'aws' ? {
    ...process.env,
    AWS_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    AWS_DEFAULT_REGION: 'auto',
  } : process.env;
  const result = spawnSync(command, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', env });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
};

try {
  for (let index = 0; index < singles.length; index++) {
    const release = singles[index];
    const track = release.tracks[0];
    const input = join(scratch, `${index}-source.mp3`);
    const output = join(scratch, `${index}-128.mp3`);
    const response = await fetch(track.url);
    if (!response.ok) throw new Error(`Download ${response.status}: ${track.url}`);
    await writeFile(input, Buffer.from(await response.arrayBuffer()));

    run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', input,
      '-map', '0:a:0', '-vn', '-map_metadata', '0', '-codec:a', 'libmp3lame', '-b:a', '128k', '-id3v2_version', '3', output]);
    const bitrate = Number(run('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=bit_rate',
      '-of', 'default=noprint_wrappers=1:nokey=1', output]));
    if (!Number.isFinite(bitrate) || bitrate > 129000) throw new Error(`Unexpected bitrate ${bitrate}: ${release.title}`);

    const sourceName = basename(track.file || `${track.track} ${track.title}.mp3`);
    const key = `singles/${release.source_release}/${sourceName}`;
    run('aws', ['s3api', 'put-object', '--endpoint-url', endpoint, '--bucket', process.env.R2_BUCKET,
      '--key', key, '--body', output, '--content-type', 'audio/mpeg',
      '--cache-control', 'public, max-age=31536000, immutable']);

    track.file = key;
    track.url = `${process.env.R2_PUBLIC_BASE}/${key.split('/').map(encodeURIComponent).join('/')}`;
    console.log(`${index + 1}/${singles.length}  ${release.source_release} · ${release.title}  ${Math.round(bitrate / 1000)} kbps`);
  }

  await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + '\n');
} finally {
  await rm(scratch, { recursive: true, force: true });
}
