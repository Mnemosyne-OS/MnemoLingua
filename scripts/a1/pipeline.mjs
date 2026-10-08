// pipeline.mjs — the mechanical half of the A1 passes (PASSES.md). The models
// write and judge; this script prepares what they read and reads what they
// wrote, so no verdict is ever decided by hand.
//
//   node pipeline.mjs blind   <entries.json> <written.json> <blind-input.json>
//   node pipeline.mjs judge   <entries.json> <written.json> <blind.json> <judge-input.json> <key.json> <seed> [<pool-entries.json> <pool-written.json>]
//   node pipeline.mjs verdict <judge-input.json> <key.json> <judge-out.json> <verdicts.json>
//
// The control is INSIDE the judge's file: six decoy cards per batch, built by
// swapping a card's example, gloss or example gloss with another card's, so
// each decoy is wrong for certain. 🪤 Decoys are built from a POOL batch that
// is not being judged: a decoy copied from a card of the same batch shows up
// as a duplicate headword, and the pilot's judge noticed exactly that. A batch
// whose decoys are not all caught does not ship (`verdict` exits 2).
import { readFileSync, writeFileSync } from 'node:fs';

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const write = (p, v) => writeFileSync(p, JSON.stringify(v, null, 1) + '\n');

/** Deterministic PRNG, so a batch's decoys can be rebuilt from its seed. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LANGS = ['fr', 'es'];

function blind(entriesPath, writtenPath, outPath) {
  const entries = new Map(read(entriesPath).map((e) => [e.id, e]));
  const written = read(writtenPath);
  write(outPath, written.map((c) => {
    const e = entries.get(c.id);
    if (!e) throw new Error(`no entry for ${c.id}`);
    return { id: c.id, headword: e.headword, pos: e.pos, example: c.example };
  }));
  console.log(`blind input: ${written.length} cards (no glosses)`);
}

function judge(entriesPath, writtenPath, blindPath, outPath, keyPath, seedArg, poolEntriesPath, poolWrittenPath) {
  const entries = new Map(read(entriesPath).map((e) => [e.id, e]));
  const written = read(writtenPath);
  const blindOut = read(blindPath);
  const rand = rng(Number(seedArg));
  const rows = [];
  const key = {};

  for (const c of written) {
    const e = entries.get(c.id);
    const b = blindOut[c.id];
    if (!e || !b) throw new Error(`missing entry or blind translation for ${c.id}`);
    const row = { id: c.id, headword: e.headword, pos: e.pos, example: c.example };
    key[c.id] = { decoy: null };
    for (const l of LANGS) {
      const oursFirst = rand() < 0.5;
      // A grammar card is a sentence: it has no word gloss to judge.
      row[l] = {
        ...(c.gloss ? {
          wordA: oursFirst ? c.gloss[l] : b.gloss[l],
          wordB: oursFirst ? b.gloss[l] : c.gloss[l],
        } : {}),
        exampleA: oursFirst ? c.exampleGloss[l] : b.exampleGloss[l],
        exampleB: oursFirst ? b.exampleGloss[l] : c.exampleGloss[l],
      };
      key[c.id][l] = oursFirst ? 'A' : 'B';
    }
    rows.push(row);
  }

  // Six decoys: two wrong examples, two wrong word glosses, two wrong example
  // glosses, each taken from another card so it is certainly wrong.
  const kinds = written[0]?.gloss
    ? ['example', 'example', 'word', 'word', 'exampleGloss', 'exampleGloss']
    : ['example', 'example', 'example', 'exampleGloss', 'exampleGloss', 'exampleGloss'];
  const poolEntries = poolEntriesPath ? new Map(read(poolEntriesPath).map((e) => [e.id, e])) : null;
  const pool = poolWrittenPath ? read(poolWrittenPath).filter((c) => !entries.has(c.id)) : null;
  if (!pool) console.warn('⚠ no pool batch: decoys are copies of this batch cards and show up as duplicates');
  const source = pool ?? written;
  // Six DISTINCT base cards: two decoys built from the same card are two rows
  // with the same headword, which the judge noticed (batch 11, grammar g1).
  const usedBase = new Set();
  kinds.forEach((kind, i) => {
    let a = source[Math.floor(rand() * source.length)];
    while (usedBase.has(a.id)) a = source[Math.floor(rand() * source.length)];
    usedBase.add(a.id);
    const ae = (poolEntries ?? entries).get(a.id);
    // 🪤 A swapped example that still contains the headword is not certainly
    // wrong (B1 batch 06: card « a » got another sentence with « a » in it, and
    // the judge rightly called the English fine). Such a b is skipped.
    const escaped = ae.headword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const word = new RegExp(`(?<![A-Za-z])${escaped}(?![A-Za-z])`, 'i');
    let b = source[Math.floor(rand() * source.length)];
    let tries = 0;
    while (b.id === a.id || (kind === 'example' && word.test(b.example))) {
      if (++tries > 1000) throw new Error(`no decoy source for ${a.id}: every sentence contains « ${ae.headword} »`);
      b = source[Math.floor(rand() * source.length)];
    }
    const base = { id: a.id, headword: ae.headword, pos: ae.pos, example: a.example };
    for (const l of LANGS) {
      base[l] = { ...(a.gloss ? { wordA: a.gloss[l], wordB: a.gloss[l] } : {}), exampleA: a.exampleGloss[l], exampleB: a.exampleGloss[l] };
    }
    if (!key[a.id]) key[a.id] = { decoy: null, fr: 'A', es: 'A' };
    const decoy = JSON.parse(JSON.stringify(base));
    decoy.id = `x${String(i + 1).padStart(2, '0')}-${a.id}`;
    const lang = LANGS[i % 2];
    const slot = key[a.id][lang];
    if (kind === 'example') decoy.example = b.example;
    if (kind === 'word') decoy[lang][`word${slot}`] = b.gloss[lang];
    if (kind === 'exampleGloss') decoy[lang][`example${slot}`] = b.exampleGloss[lang];
    key[decoy.id] = { ...key[a.id], decoy: { kind, lang } };
    rows.splice(Math.floor(rand() * (rows.length + 1)), 0, decoy);
  });

  // Every row gets an opaque id, decoys included: an id that says "decoy" or
  // names the card would let the judge tell them apart.
  const opaque = rows.map((row, i) => {
    const rid = `r${String(i + 1).padStart(3, '0')}`;
    key[rid] = { ...key[row.id], cardId: row.id };
    delete key[row.id];
    return { ...row, id: rid };
  });

  write(outPath, opaque);
  write(keyPath, key);
  console.log(`judge input: ${rows.length} rows (${written.length} cards + 6 decoys)`);
}

const ok = (v) => v === 'ok';

function verdict(inputPath, keyPath, judgePath, outPath) {
  const rows = read(inputPath);
  const key = read(keyPath);
  const judged = read(judgePath);
  const cards = {};
  let caught = 0;
  const missedDecoys = [];

  for (const row of rows) {
    const j = judged[row.id];
    if (!j) throw new Error(`the judge skipped ${row.id}`);
    const k = key[row.id];
    if (k.decoy) {
      const { kind, lang } = k.decoy;
      const slot = k[lang];
      const flagged = kind === 'example' ? !ok(j.english)
        : kind === 'word' ? !ok(j[lang][`word${slot}`])
          : !ok(j[lang][`example${slot}`]);
      if (flagged) caught += 1; else missedDecoys.push(k.cardId);
      continue;
    }
    const problems = [];
    if (!ok(j.english)) problems.push(`english: ${j.english}`);
    for (const l of LANGS) {
      const slot = k[l];
      if (row[l].wordA !== undefined && !ok(j[l][`word${slot}`])) problems.push(`${l} word: ${j[l][`word${slot}`]}`);
      if (!ok(j[l][`example${slot}`])) problems.push(`${l} example: ${j[l][`example${slot}`]}`);
    }
    cards[k.cardId] = { check: problems.length ? 'to-review' : 'two-pass', problems };
  }

  const toReview = Object.values(cards).filter((c) => c.check === 'to-review').length;
  write(outPath, { decoys: { caught, total: 6, missed: missedDecoys }, toReview, cards });
  console.log(`decoys caught ${caught}/6, cards ${Object.keys(cards).length}, to-review ${toReview}`);
  if (caught < 6) {
    console.error(`CONTROL FAILED: decoys not caught: ${missedDecoys.join(', ')}. This batch does not ship.`);
    process.exit(2);
  }
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'blind') blind(...args);
else if (cmd === 'judge') judge(...args);
else if (cmd === 'verdict') verdict(...args);
else { console.error('usage: blind | judge | verdict'); process.exit(1); }
