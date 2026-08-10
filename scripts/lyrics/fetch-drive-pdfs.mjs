#!/usr/bin/env node
/* Match catalog albums that still lack lyrics to the community sheet's Drive folders
   (drive-links.json = {sheetAlbumName: folderUrl}), find each folder's "<Album>.pdf" via the
   public embeddedfolderview endpoint, and download it to /tmp/lyricpdfs/<catalogTitle>.pdf.
   No auth needed — folders are link-shared. Prints a manifest {catalogTitle: pdfPath}. */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const CAT = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/assets/catalogs/yura.json'), 'utf8'));
const LYR = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/assets/catalogs/lyrics.json'), 'utf8'));
const LINKS = JSON.parse(fs.readFileSync('/tmp/drive-links.json', 'utf8'));
const OUT = '/tmp/lyricpdfs';
fs.mkdirSync(OUT, { recursive: true });

const norm = s => (s || '').normalize('NFKC')
  .replace(/[\s　’'"”“〜～~:：・\-—–ー_/／|｜()（）\[\]［］「」『』【】,、，.。!！?？＊*＆&＝=+Ⅱ]/gi, '')
  .replace(/\bii\b/gi, '').toLowerCase();

// which catalog albums still have zero lyric tracks (3+ vocal tracks only)
const missing = [];
for (const a of CAT.albums) {
  const voc = a.tracks.filter(t => !t.instrumental);
  if (voc.length < 3) continue;
  const have = voc.filter(t => (LYR[a.title]?.[t.track]?.jp?.lines?.length)).length;
  if (have === 0) missing.push(a.title);
}

// build a normalized index of the sheet's drive links
const linkIdx = new Map();
for (const [name, url] of Object.entries(LINKS)) linkIdx.set(norm(name), url);
const findFolder = title => {
  const n = norm(title);
  if (linkIdx.has(n)) return linkIdx.get(n);
  for (const [k, url] of linkIdx) if (k && (k.includes(n) || n.includes(k)) && Math.abs(k.length - n.length) <= 4) return url;
  // looser: the catalog title (if reasonably long) sits inside a multi-line sheet key
  // like "Carnaval Papillon\n夢、麗しく闇を奏でる"
  if (n.length >= 5) for (const [k, url] of linkIdx) if (k.includes(n)) return url;
  return null;
};

const curl = (url, out) => {
  try { execSync(`curl -sL --max-time 40 ${out ? `-o "${out}"` : ''} "${url}"`, { stdio: out ? 'ignore' : 'pipe', maxBuffer: 1 << 26 }); return out ? true : execSync(`curl -sL --max-time 40 "${url}"`, { maxBuffer: 1 << 26 }).toString(); }
  catch { return null; }
};

const manifest = {}, report = [];
for (const title of missing) {
  const dstExist = path.join(OUT, title.replace(/[\/]/g, '_') + '.pdf');
  if (fs.existsSync(dstExist) && fs.readFileSync(dstExist).slice(0, 5).toString() === '%PDF-') { manifest[title] = dstExist; report.push(`HAVE       ${title}`); continue; }
  const folder = findFolder(title);
  if (!folder) { report.push(`NO FOLDER  ${title}`); continue; }
  const fid = (folder.match(/folders\/([\w-]+)/) || [])[1];
  const html = curl(`https://drive.google.com/embeddedfolderview?id=${fid}#list`);
  if (!html) { report.push(`FETCH FAIL ${title}`); continue; }
  // pair each file id (file/d/<id>) with its title
  const entries = [];
  const re = /file\/d\/([\w-]+)\/view[\s\S]*?flip-entry-title">([^<]+)/g;
  let m; while ((m = re.exec(html))) entries.push({ id: m[1], name: m[2] });
  const pdf = entries.find(e => /\.pdf$/i.test(e.name.trim()));
  if (!pdf) { report.push(`NO PDF     ${title}  (files: ${entries.length})`); continue; }
  const dst = path.join(OUT, title.replace(/[\/]/g, '_') + '.pdf');
  const ok = curl(`https://drive.google.com/uc?export=download&id=${pdf.id}`, dst);
  if (ok && fs.existsSync(dst) && fs.readFileSync(dst).slice(0, 5).toString() === '%PDF-') {
    manifest[title] = dst; report.push(`OK         ${title}  <- ${pdf.name}`);
  } else { report.push(`DL FAIL    ${title}  (${pdf.name})`); }
}
fs.writeFileSync('/tmp/pdf-manifest.json', JSON.stringify(manifest, null, 2));
console.log(report.sort().join('\n'));
console.log(`\n=== ${Object.keys(manifest).length}/${missing.length} PDFs downloaded ===`);
