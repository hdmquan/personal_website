#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';

const catalogPath = new URL('../src/assets/catalogs/yura.json', import.meta.url);
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));

// yura.json is the artist-led album catalogue. Units and co-billed projects remain
// albums here. Only external archive releases use the separate "Others" shelf.
catalog.albums = catalog.albums.filter(release => !release.virtual_single);
for (const release of catalog.albums) {
  release.release_types = release.archive_collab ? ['others'] : ['albums'];
  delete release.card_mode;
  delete release.source_release;
  delete release.virtual_single;
}

catalog.release_counts = {
  albums: catalog.albums.filter(release => release.release_types.includes('albums')).length,
  singles: 0,
  others: catalog.albums.filter(release => release.release_types.includes('others')).length,
};
delete catalog.release_counts.collab;

await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + '\n');
console.log(catalog.release_counts);
