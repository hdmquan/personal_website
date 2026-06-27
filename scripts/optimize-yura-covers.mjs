#!/usr/bin/env node
/**
 * Optimize the 葉月ゆら cover art for LCP.
 *
 * The shelf displays covers at ~160px (mobile) / ~300px (desktop), but R2 serves
 * full-size JPEGs (~200KB each). This downloads each cover, re-encodes it to a
 * small AVIF (with a WebP fallback) at a sensible size, and rewrites the catalog
 * to point at the optimized files.
 *
 * It does NOT need your R2 credentials for the default (local) mode — it writes the
 * optimized files into the site's own assets so they ship from the same origin as
 * the page (which also removes the cross-origin connection from the LCP path).
 * Pass --upload to push to R2 instead (requires the env vars listed below).
 *
 * Usage:
 *   npm i -D sharp                 # one-time
 *   node scripts/optimize-yura-covers.mjs            # dry run: report only
 *   node scripts/optimize-yura-covers.mjs --write    # encode locally + rewrite catalog
 *   node scripts/optimize-yura-covers.mjs --write --upload   # encode + push to R2
 *
 * R2 upload env (only with --upload):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 *   R2_PUBLIC_BASE  (e.g. https://pub-xxxx.r2.dev)  — the public URL the bucket serves
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const WRITE  = process.argv.includes('--write');
const UPLOAD = process.argv.includes('--upload');

const SIZE = 512;          // longest edge in px (covers retina at the grid's display size)
const AVIF_QUALITY = 50;
const WEBP_QUALITY = 62;

const CATALOG = join(ROOT, 'src/assets/catalogs/yura.json');
const LOCAL_DIR = join(ROOT, 'src/assets/images/yura/covers');   // shipped by 11ty passthrough
const LOCAL_URL_PREFIX = '/assets/images/yura/covers';

// Reuse each cover's existing unique filename stem (covers/<name>.jpg → <name>) so the
// optimized keys are guaranteed unique and 1:1 with the originals. Falls back to the index.
const stemFor = (a, i) => {
  const fromPath = (a.cover || a.cover_url || '').split('/').pop()?.replace(/\.[a-z0-9]+$/i, '');
  return (fromPath && decodeURIComponent(fromPath)) || `cover-${i}`;
};

async function main() {
  const sharp = (await import('sharp').catch(() => {
    console.error('Missing dependency: run  npm i -D sharp');
    process.exit(1);
  })).default;

  const cat = JSON.parse(await readFile(CATALOG, 'utf8'));
  const albums = cat.albums || [];
  console.log(`${albums.length} covers · target ${SIZE}px AVIF q${AVIF_QUALITY}${WRITE ? '' : '  (dry run — pass --write to apply)'}`);

  if (WRITE) await mkdir(LOCAL_DIR, { recursive: true });

  let s3 = null, putObject = null;
  if (UPLOAD) {
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3').catch(() => {
      console.error('Missing dependency for --upload: run  npm i -D @aws-sdk/client-s3');
      process.exit(1);
    });
    s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
    });
    putObject = (Key, Body, ContentType) =>
      s3.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET, Key, Body, ContentType, CacheControl: 'public, max-age=31536000, immutable' }));
  }

  let totalIn = 0, totalOut = 0, done = 0;
  for (let i = 0; i < albums.length; i++) {
    const a = albums[i];
    const src = a.cover_url;
    if (!src) continue;
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      totalIn += buf.length;

      const base = stemFor(a, i);
      const img = sharp(buf).resize(SIZE, SIZE, { fit: 'cover' });
      const avif = await img.clone().avif({ quality: AVIF_QUALITY }).toBuffer();
      const webp = await img.clone().webp({ quality: WEBP_QUALITY }).toBuffer();
      totalOut += avif.length;

      if (WRITE) {
        const enc = encodeURIComponent(`${base}.avif`);   // URL-safe; S3 key stays raw
        if (UPLOAD) {
          await putObject(`covers-opt/${base}.avif`, avif, 'image/avif');
          await putObject(`covers-opt/${base}.webp`, webp, 'image/webp');
          a.cover_url = `${process.env.R2_PUBLIC_BASE}/covers-opt/${enc}`;
        } else {
          await writeFile(join(LOCAL_DIR, `${base}.avif`), avif);
          await writeFile(join(LOCAL_DIR, `${base}.webp`), webp);
          a.cover_url = `${LOCAL_URL_PREFIX}/${enc}`;
        }
      }
      done++;
      if (done % 10 === 0 || done === albums.length) process.stdout.write(`  ${done}/${albums.length}\r`);
    } catch (e) {
      console.warn(`\n  ! ${a.title}: ${e.message}`);
    }
  }

  console.log(`\nencoded ${done} · ${(totalIn / 1e6).toFixed(1)}MB → ${(totalOut / 1e6).toFixed(1)}MB (${Math.round((1 - totalOut / totalIn) * 100)}% smaller)`);

  if (WRITE) {
    await writeFile(CATALOG, JSON.stringify(cat, null, 2));
    console.log(`catalog rewritten → ${CATALOG}`);
    console.log(UPLOAD ? 'covers uploaded to R2 under covers-opt/' : `covers written to ${LOCAL_DIR}`);
  }
}

main();
