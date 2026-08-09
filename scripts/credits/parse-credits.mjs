#!/usr/bin/env node
/* Parse the free-text `credit` strings on catalog tracks into a structured
   `staff` object { vocals, chorus, lyrics, music, arrange, remix, circle, notes }.
   Conservative: only emits roles it can confidently attribute; always keeps the
   original `credit` string verbatim as a human-readable fallback. Idempotent.

   Usage:
     node parse-credits.mjs           # preview parses to stdout, no write
     node parse-credits.mjs --write   # write staff back into yura.json
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CAT = path.join(ROOT, 'src/assets/catalogs/yura.json');

// role phrase (lowercased) -> canonical role key. Longer phrases first.
const ROLE_MAP = [
  ['radio performance', 'vocals'],
  ['lead vocals', 'vocals'],
  ['lead vocal', 'vocals'],
  ['guest vocal', 'vocals'],
  ['duet vocals', 'vocals'],
  ['duet vocal', 'vocals'],
  ['ensemble vocals', 'vocals'],
  ['co-lyrics', 'lyrics'],
  ['composed', 'music'],
  ['composition', 'music'],
  ['arrangement', 'arrange'],
  ['arrange', 'arrange'],
  ['vocals', 'vocals'],
  ['vocal', 'vocals'],
  ['chorus', 'chorus'],
  ['lyrics', 'lyrics'],
  ['music', 'music'],
  ['remix', 'remix'],
  ['circle', 'circle'],
];
const ROLE_WORDS = ROLE_MAP.map(r => r[0]);
const CONNECTORS = /^(?:and|&|\/|,|with|feat\.?|featuring)\b/i;

// split a name segment into individual names
function splitNames(s) {
  return s
    .split(/\s+and\s+|\s*&\s*|\s*,\s*|\s*\/\s*/i)
    .map(x => x.trim())
    .filter(Boolean);
}

// pull a leading run of role words (joined by connectors) off the front of a clause.
// returns { roles:[...], rest:string } or null if no role word leads.
function leadingRoles(clause) {
  let s = clause.trim();
  const roles = [];
  let matchedAny = false;
  for (;;) {
    const low = s.toLowerCase();
    let hit = null;
    for (const [phrase, role] of ROLE_MAP) {
      if (low.startsWith(phrase) && /[\s;:]|$/.test(low.slice(phrase.length, phrase.length + 1))) {
        hit = { phrase, role };
        break;
      }
    }
    if (!hit) break;
    roles.push(hit.role);
    matchedAny = true;
    s = s.slice(hit.phrase.length).trim();
    // consume a connector so "composition and lyrics" keeps grabbing roles
    const cm = s.match(CONNECTORS);
    if (cm) {
      const after = s.slice(cm[0].length).trim();
      // only treat as role-connector if another role word follows immediately
      const low2 = after.toLowerCase();
      if (ROLE_WORDS.some(w => low2.startsWith(w))) { s = after; continue; }
    }
    break;
  }
  if (!matchedAny) return null;
  return { roles: [...new Set(roles)], rest: s };
}

function parseCredit(credit) {
  const staff = {};
  const notes = [];
  const clauses = credit.split(';').map(c => c.trim()).filter(Boolean);
  for (const clause of clauses) {
    const lr = leadingRoles(clause);
    if (!lr) { notes.push(clause); continue; }
    let { roles, rest } = lr;
    // strip a leading "as"/"with" alias marker: "Vocals as マリン"
    let alias = false;
    const am = rest.match(/^(as)\s+/i);
    if (am) { alias = true; rest = rest.slice(am[0].length).trim(); }
    // pull trailing parenthetical into notes, keep the name before it
    let paren = null;
    const pm = rest.match(/\s*\(([^)]*)\)\s*$/);
    if (pm) { paren = pm[1].trim(); rest = rest.slice(0, pm.index).trim(); }
    // clean leading noise off the name segment ("with 翡翠", "credited to 祇羽", "by X").
    // a leading "with" on a performer role means Yura sang *with* a companion.
    const companion = /^with\s+/i.test(rest) && roles.some(r => r === 'vocals' || r === 'chorus');
    rest = rest.replace(/^(?:with|and|&|,|credited to|to|by)\s+/i, '').trim();
    let names = splitNames(rest);
    if (companion && !names.includes('葉月ゆら')) names.unshift('葉月ゆら');
    // bare performer role with no name on a Yura release -> she is the performer
    if (!names.length && roles.every(r => r === 'vocals' || r === 'chorus' || r === 'lyrics')) {
      names = ['葉月ゆら'];
    }
    if (!names.length) {
      if (paren) notes.push(paren);
      continue;
    }
    for (const role of roles) {
      staff[role] = staff[role] || [];
      for (const n of names) if (!staff[role].includes(n)) staff[role].push(n);
    }
    if (paren) notes.push(paren);
    if (alias && names.length) notes.push('performs as ' + names.join(', '));
  }
  if (notes.length) staff.notes = notes.join('; ');
  return Object.keys(staff).length ? staff : null;
}

// ---- run ----
const cat = JSON.parse(fs.readFileSync(CAT, 'utf8'));
const write = process.argv.includes('--write');
let parsed = 0, total = 0, empties = 0;
const preview = [];
for (const alb of cat.albums) {
  for (const t of alb.tracks || []) {
    if (!t.credit) continue;
    total++;
    const staff = parseCredit(t.credit);
    if (staff) {
      parsed++;
      if (write) t.staff = staff; else preview.push([alb.title, t.track, t.credit, staff]);
    } else {
      empties++;
      if (!write) preview.push([alb.title, t.track, t.credit, null]);
    }
  }
}
if (write) {
  fs.writeFileSync(CAT, JSON.stringify(cat, null, 2) + '\n');
  console.log(`wrote staff to ${parsed}/${total} credited tracks (${empties} unparsed)`);
} else {
  for (const [alb, tr, cr, st] of preview) {
    console.log(`\n${alb} #${tr}\n  raw: ${cr}\n  ->  ${st ? JSON.stringify(st, null, 0) : '(no structured roles)'}`);
  }
  console.log(`\n=== ${parsed}/${total} parsed, ${empties} unparsed ===`);
}
