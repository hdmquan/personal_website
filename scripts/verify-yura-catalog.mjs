#!/usr/bin/env node

import { readFile } from 'node:fs/promises';

const catalogPath = new URL('../src/assets/catalogs/yura.json', import.meta.url);
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const covers = [...new Set(catalog.albums.map(item => item.cover_url).filter(Boolean))];
const preserved = catalog.albums
  .filter(item => item.external_archive || item.archive_collab)
  .flatMap(item => item.tracks.map(track => track.url));

async function check(url, expectedType) {
  const response = await fetch(url, { method: 'HEAD' });
  const type = response.headers.get('content-type') || '';
  return { url, ok: response.ok && type.startsWith(expectedType), status: response.status, type };
}

async function checkAll(urls, expectedType, concurrency = 12) {
  const failures = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
    while (next < urls.length) {
      const index = next++;
      const result = await check(urls[index], expectedType);
      if (!result.ok) failures.push(result);
    }
  }));
  return failures;
}

const coverFailures = await checkAll(covers, 'image/');
const audioFailures = await checkAll(preserved, 'audio/');
console.log(`${covers.length} cover URLs checked · ${coverFailures.length} failures`);
console.log(`${preserved.length} preserved single/other audio URLs checked · ${audioFailures.length} failures`);
for (const failure of [...coverFailures, ...audioFailures]) console.error(failure);
if (coverFailures.length || audioFailures.length) process.exitCode = 1;
