// prepare.mjs — turns the CEFR-J word list into the A1 entries the writing
// passes work from (doc 138 §12).
//
// Source: CEFR-J Wordlist 1.5, Tono Laboratory, Tokyo University of Foreign
// Studies, via github.com/openlanguageprofiles/olp-en-cefrj (copied next to
// this script with its README, which carries the terms of use: free for
// research and commercial use, provided the dataset is cited).
//
// What it decides, so the passes do not:
//  - one entry per (headword, part of speech): "answer" the noun and "answer"
//    the verb are two cards, told apart by their example sentence;
//  - a slashed headword shows its FIRST spelling and keeps the rest as
//    variants (airplane/aeroplane);
//  - numbers are set apart: they are computed, never written by a model
//    (doc 138 §3.4b).
//
// Usage: node scripts/a1/prepare.mjs [--level A2 --out scripts/a2]
//        → writes <out>/entries.json (default: A1 into scripts/a1)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const LEVEL = arg('--level', 'A1');
const OUT = arg('--out', here);

/** Slashes that are not spelling variants: the second form is the word. */
const DISPLAY_OVERRIDE = { 'short/shorts': ['shorts'] };

/** One CSV line, with RFC 4180 quoting ("a, b" and "" for a quote). */
function splitLine(line) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { cells.push(cell); cell = ''; }
    else cell += ch;
  }
  if (quoted) throw new Error(`unterminated quote: ${line}`);
  cells.push(cell);
  return cells;
}

function readCsv(path) {
  const lines = readFileSync(path, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
  const head = splitLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitLine(line);
    return Object.fromEntries(head.map((h, j) => [h, cells[j] ?? '']));
  });
}

const POS_SHORT = {
  noun: 'n', verb: 'v', adjective: 'adj', adverb: 'adv', pronoun: 'pron', determiner: 'det',
  preposition: 'prep', number: 'num', conjunction: 'conj', 'be-verb': 'be', 'modal auxiliary': 'modal',
  interjection: 'interj', 'do-verb': 'do', 'have-verb': 'have', 'infinitive-to': 'to',
};

function slug(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const rows = readCsv(join(here, 'cefrj-vocabulary-profile-1.5.csv')).filter((r) => r.CEFR === LEVEL);

const seen = new Set();
const entries = [];
const numbers = [];
for (const r of rows) {
  const short = POS_SHORT[r.pos];
  if (!short) throw new Error(`unknown part of speech: ${r.pos}`);
  const [display, ...variants] = DISPLAY_OVERRIDE[r.headword] ?? r.headword.split('/').map((s) => s.trim()).filter(Boolean);
  const id = `${slug(display)}-${short}`;
  if (seen.has(id)) throw new Error(`duplicate id ${id}`);
  seen.add(id);
  const entry = { id, headword: display, pos: r.pos, ...(variants.length ? { variants } : {}) };
  (r.pos === 'number' ? numbers : entries).push(entry);
}

writeFileSync(join(OUT, 'entries.json'), JSON.stringify({ entries, numbers }, null, 1) + '\n');
console.log(`${LEVEL}: ${rows.length} rows → ${entries.length} word entries + ${numbers.length} numbers`);
