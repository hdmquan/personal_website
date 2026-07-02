#!/usr/bin/env node
/* Keep the Decap "Album Notes" album dropdown in sync with the catalog.
 * Runs at build time (see package.json "build") so the option list never drifts —
 * no manual re-run. Rewrites only the block between the <album-options> markers. */
import { readFile, writeFile } from 'node:fs/promises';

const CONFIG = new URL('../src/admin/config.yml', import.meta.url);
const CATALOG = new URL('../src/assets/catalogs/yura.json', import.meta.url);
const START = /(^[ \t]*# <album-options>.*$)/m;
const END = /^[ \t]*# <\/album-options>.*$/m;

const cfg = await readFile(CONFIG, 'utf8');
const cat = JSON.parse(await readFile(CATALOG, 'utf8'));

const s = cfg.match(START), e = cfg.match(END);
if (!s || !e) { console.error('album-options markers not found in config.yml'); process.exit(1); }

const options = cat.albums.map(a => `                    - ${JSON.stringify(a.title)}`).join('\n');
const startIdx = s.index + s[0].length;              // just after the start marker line
const endLineEnd = e.index + e[0].length;            // end of the end marker line (rebuilt clean)
const next = cfg.slice(0, startIdx) + '\n' + options + '\n              # </album-options>' + cfg.slice(endLineEnd);

if (next !== cfg) { await writeFile(CONFIG, next); console.log(`synced ${cat.albums.length} album options into Decap config`); }
else console.log('Decap album options already in sync');
