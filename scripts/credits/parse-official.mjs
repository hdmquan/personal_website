#!/usr/bin/env node
/* Parse the pre-fetched official-site album pages (/tmp/hy_pages/<slug>.txt) into
   structured staff, aligned to catalog tracks by TITLE. Uses slug-map.json (album->slug)
   and all-remaining.json (album->vocal tracks needing staff).
   Output: web-staff-auto.json  { album: { track: staff }, _sources, _circle-ish via circle role }.
   Never guesses names — only what the page states; vocals default to 葉月ゆら (album vocalist). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PAGES = '/tmp/hy_pages';
const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/credits/slug-map.json'), 'utf8'));
const work = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/credits/all-remaining.json'), 'utf8'));

// aggressive normalize for title matching: NFKD-fold (fullwidth→ascii, strip accents é→e),
// drop the word "and"/"＆", whitespace, and decorative punctuation/brackets — so catalog
// "深哀 クロの魔女とクロい猫" matches "深哀 〜クロの魔女とクロい猫〜" and "Ｔ_Ｔ" matches "T_T".
const norm = s => (s || '')
  .normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/&|＆|\band\b/gi, '')
  .replace(/[\s　]+/g, '')
  .replace(/[’'"”“〜～~:：・\-—–ー_/／|｜()（）\[\]［］「」『』【】,、，.。!！?？＊*＝=+]/g, '')
  .toLowerCase();

// a page line that starts a track: "1 : fleur" / "1.眠れる森の王子" / "01. entrance：降誕" /
// "Ⅰ，魔笛の男Ⅰ" / "[1] TRICK or TREAT" / "［１］title"
const TRACK_RE = /^\s*(?:[MmＭ]|track|Track|No\.?)?\s*[\[［]?\s*(\d{1,2}|[０-９]{1,2}|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+|[IVXLC]{1,5})\s*[\.:：，、）\)\]］]\s*(\S.*)$/;
// a line that carries credits (has a role label + fullwidth/halfwidth colon)
const hasCredit = l => /[：:]/.test(l) && /(作詞|作曲|編曲|作編曲|[Vv]ocal|ボーカル|歌|[Cc]horus|コーラス)/.test(l);

function rolesOf(label) {
  const r = new Set();
  if (/Special\s*Vocal/i.test(label)) return r;        // guest feature → handled as note elsewhere
  if (label.includes('作詞')) r.add('lyrics');
  if (label.includes('作編曲')) { r.add('music'); r.add('arrange'); }
  if (label.includes('作曲')) r.add('music');
  if (label.includes('編曲')) r.add('arrange');
  if (/[Vv]ocal|ボーカル|(^|[^作])歌/.test(label)) r.add('vocals');
  if (/[Cc]horus|コーラス/.test(label)) r.add('chorus');
  return r;
}
function splitNames(v) {
  return v.split(/[,，、\/／･]| and /i)
    // a following role-label sometimes glues onto a name with no space ("天音（…）MIX：Est") — cut it off
    .map(s => s.replace(/(MIX|Mix|Guitar|Bass|Vocal|Chorus|コーラス|ギター|ベース|作詞|作曲|編曲)\s*[：:].*$/,''))
    .map(s => s.replace(/^[\s：:・,、，.。]+|[\s：:・,、，]+$/g, '').trim())
    .filter(Boolean);
}
// parse one credit line into {role: [names]} plus notes[]
function parseCreditLine(line, staff, notes) {
  // segments separated by fullwidth space or 2+ spaces
  const segs = line.split(/[　]+|\s{2,}/).map(s => s.trim()).filter(Boolean);
  for (const seg of segs) {
    const m = seg.match(/^([^：:]+)[：:]\s*(.+)$/);
    if (!m) continue;
    const label = m[1].trim();
    const val = m[2].trim();
    if (/Special\s*Vocal/i.test(label)) { notes.push('Special Vocal: ' + val); continue; }
    const roles = rolesOf(label);
    // non-role labels (Guitar/Bass/MIX/Mastering/シナリオ/…) → note, don't fabricate roles
    if (!roles.size) { if (/[A-Za-zぁ-んァ-ヶ一-龠]/.test(val)) notes.push(label + ': ' + val); continue; }
    const names = splitNames(val).map(n => (n === 'ゆら' || n === '葉月') ? '葉月ゆら' : n);   // short form on old pages
    for (const role of roles) { staff[role] = staff[role] || []; for (const n of names) if (!staff[role].includes(n)) staff[role].push(n); }
  }
}

// extract page blocks: [{title, creditLines:[...]}]
function blocks(txt) {
  const lines = txt.split('\n');
  const out = [];
  let cur = null;
  for (const ln of lines) {
    const tm = ln.match(TRACK_RE);
    if (tm && !hasCredit(ln.replace(TRACK_RE, ''))) {
      // a title line (may also carry inline credits after the title)
      cur = { title: tm[2].replace(/[：:].*(作詞|作曲|編曲).*/,'').trim(), creditLines: [] };
      out.push(cur);
      // if the title line itself has trailing credits, capture them
      if (hasCredit(ln)) cur.creditLines.push(ln);
    } else if (cur && hasCredit(ln)) {
      cur.creditLines.push(ln);
    }
  }
  return out;
}

const result = {}; const sources = {};
let report = [];
for (const [album, meta] of Object.entries(work)) {
  const slug = map[album]?.slug;
  const ratio = map[album] ? map[album].score / Math.max(1, map[album].ntracks) : 0;
  if (!slug || ratio < 0.5) { report.push(`SKIP  ${album} (no confident page)`); continue; }
  const file = path.join(PAGES, slug + '.txt');
  if (!fs.existsSync(file)) { report.push(`SKIP  ${album} (page missing)`); continue; }
  const bl = blocks(fs.readFileSync(file, 'utf8'));
  const alb = {}; let matched = 0;
  for (const trk of meta.tracks) {
    const want = norm(trk.t);
    // best matching block by normalized title (exact, else containment)
    let b = bl.find(x => norm(x.title) === want)
      || bl.find(x => want && (norm(x.title).includes(want) || want.includes(norm(x.title))) && norm(x.title).length >= 2);
    if (!b || !b.creditLines.length) continue;
    const staff = {}; const notes = [];
    for (const cl of b.creditLines) parseCreditLine(cl, staff, notes);
    if (!Object.keys(staff).length) continue;
    if (!staff.vocals) staff.vocals = ['葉月ゆら'];
    if (notes.length) staff.notes = notes.join('; ');
    alb[trk.n] = staff; matched++;
  }
  if (matched) { result[album] = alb; sources[album] = `http://hatukiyura.sakura.ne.jp/${slug}/`; }
  report.push(`${matched === meta.tracks.length ? 'OK  ' : 'PART'} ${matched}/${meta.tracks.length} ${album} [${slug}]`);
}
result._sources = sources;
fs.writeFileSync(path.join(ROOT, 'scripts/credits/web-staff-auto.json'), JSON.stringify(result, null, 2) + '\n');
report.sort();
console.log(report.join('\n'));
const done = Object.keys(result).filter(k => k !== '_sources').length;
console.log(`\n=== ${done} albums parsed ===`);
