#!/usr/bin/env node
/* Mine per-track staff (作詞 lyrics / 作曲 music / 編曲 arrange / vocal / chorus / illust)
   from meriole's per-track JP .docx packages already downloaded under /tmp/mall.
   Emits scripts/credits/meriole-staff.json  { "<album>": { "<track>": {staff}, ... } }.
   Vocals default to 葉月ゆら (she is the vocalist) unless the booklet says otherwise. */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = '/tmp/mall';
// folder key -> catalog album title
const ALBUM = {
  garnet: 'Garnet Bride',
  mistletoe: 'Mistletoe -黄昏の妖精歌-',
  labellaluna: 'ばらいろのあくむ',
  lafata: 'La Fata',
};
// JP staff label -> role key
const LABELS = [
  [/作詞|作词|[Ll]yrics?/, 'lyrics'],
  [/作曲|[Cc]omposition|[Mm]usic/, 'music'],
  [/編曲|[Aa]rrange/, 'arrange'],
  [/[Vv]ocals?|歌|唄|ヴォーカル|ボーカル/, 'vocals'],
  [/[Cc]horus|コーラス|合唱/, 'chorus'],
];

function docxText(f) {
  try {
    const xml = execSync(`unzip -p "${f}" word/document.xml`, { maxBuffer: 1 << 24 }).toString('utf8');
    return xml.split('</w:p>').map(p =>
      (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map(m => m.replace(/<[^>]*>/g, '')).join('')
    ).map(s => s.trim()).filter(Boolean);
  } catch { return []; }
}

// pull "名前 (所属)" -> keep name, drop parenthetical circle into a note pool
function cleanName(v) {
  return v.replace(/[（(].*?[)）]\s*$/, '').trim();
}
function parseStaffLine(line, staff, circles) {
  // "作曲：荒芳樹 (趣味工房にんじんわいん)"  /  "作詞：葉月ゆら"
  const m = line.match(/^\s*([^:：]+)[：:]\s*(.+)$/);
  if (!m) return false;
  const label = m[1].trim();
  let val = m[2].trim();
  let role = null;
  for (const [re, r] of LABELS) if (re.test(label)) { role = r; break; }
  if (!role) return false;
  const cm = val.match(/[（(]([^)）]+)[)）]/);
  if (cm) circles.add(cm[1].trim());
  const names = val.split(/[、,／\/&＆]|\s+and\s+/).map(cleanName).filter(Boolean);
  if (!names.length) return false;
  staff[role] = staff[role] || [];
  for (const n of names) if (!staff[role].includes(n)) staff[role].push(n);
  return true;
}

const out = {};
for (const [key, album] of Object.entries(ALBUM)) {
  const dir = path.join(SRC, key);
  if (!fs.existsSync(dir)) continue;
  const files = execSync(`find "${dir}" -iname "*JP*.docx" ! -name "~*"`, { maxBuffer: 1 << 24 })
    .toString().split('\n').map(s => s.trim()).filter(Boolean);
  out[album] = out[album] || {};
  for (const f of files) {
    const base = path.basename(f);
    const tm = base.match(/^(\d{1,2})\b/);
    if (!tm) continue;
    const track = tm[1].padStart(2, '0');
    const lines = docxText(f);
    const staff = {};
    const circles = new Set();
    for (const ln of lines) parseStaffLine(ln, staff, circles);
    if (!Object.keys(staff).length) continue;
    if (!staff.vocals) staff.vocals = ['葉月ゆら'];       // she is the vocalist
    if (circles.size) staff.circle = [...circles];
    out[album][track] = staff;
  }
}
const dst = path.join(ROOT, 'scripts/credits/meriole-staff.json');
fs.writeFileSync(dst, JSON.stringify(out, null, 2) + '\n');
for (const [alb, tr] of Object.entries(out)) console.log(`${alb}: ${Object.keys(tr).length} tracks`);
console.log('wrote', dst);
