// assemble.mjs — builds src/decks/en/<level>.json from a level's verified
// batches (default A1, from scripts/a1).
//
// 🚨 A level ships whole or not at all (doc 138 §12.4): the script REFUSES to
// write the deck while any batch is missing a file, while any batch failed its
// decoy control, or while any A1 entry has no card. A half-built A1 would read
// as a finished level.
//
// A card a pass disagreed with is written as `to-review`: it is never shown,
// and the deck screen counts it.
//
// Usage: node scripts/a1/assemble.mjs [--level A2 --dir scripts/a2] [--checked-at YYYY-MM-DD]
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUND_NUMBERS, englishValue, frenchNumber, spanishNumber } from './numbers.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const fail = (msg) => { console.error(`REFUSED: ${msg}`); process.exit(2); };

const TOPICS = ['smallwords', 'people', 'body', 'food', 'home', 'clothes', 'town', 'transport', 'school',
  'work', 'time', 'nature', 'animals', 'leisure', 'shopping', 'feelings', 'actions'];
const GRAMMAR = ['g-be', 'g-present', 'g-past-future', 'g-can', 'g-modals', 'g-words', 'g-compare', 'g-questions', 'g-sentences'];

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const checkedAt = arg('--checked-at', new Date().toISOString().slice(0, 10));
const LEVEL = arg('--level', 'A1');
const levelDir = arg('--dir', here);

const { entries, numbers } = read(join(levelDir, 'entries.json'));
const batchDir = join(levelDir, 'batches');
const cardsByTopic = new Map([...TOPICS, 'numbers', ...GRAMMAR].map((t) => [t, []]));
const covered = new Set();
const phraseSeen = new Map();
let toReview = 0;

for (const name of readdirSync(batchDir).sort()) {
  const dir = join(batchDir, name);
  for (const f of ['entries.json', 'written.json', 'verdicts.json']) {
    if (!existsSync(join(dir, f))) fail(`batch ${name} has no ${f}`);
  }
  const verdicts = read(join(dir, 'verdicts.json'));
  if (verdicts.decoys.caught !== verdicts.decoys.total) fail(`batch ${name} failed its decoy control`);
  const batchEntries = new Map(read(join(dir, 'entries.json')).map((e) => [e.id, e]));

  for (const c of read(join(dir, 'written.json'))) {
    const e = batchEntries.get(c.id);
    const v = verdicts.cards[c.id];
    if (!e || !v) fail(`batch ${name}: card ${c.id} has no entry or no verdict`);
    if (!cardsByTopic.has(c.topic)) fail(`batch ${name}: card ${c.id} has topic "${c.topic}", not in the closed list`);
    // 🪤 Two grammar points can produce the SAME sentence ("I like reading
    // books." for A1 101 and 112): the learner would study it twice. The
    // second one is withdrawn, named.
    const duplicateOf = !c.gloss ? phraseSeen.get(c.example) : undefined;
    if (!c.gloss && !duplicateOf) phraseSeen.set(c.example, c.id);
    if (duplicateOf) console.log(`withdrawn as a duplicate of ${duplicateOf}: ${c.id}`);
    const check = v.check === 'two-pass' && !duplicateOf ? 'two-pass' : 'to-review';
    if (check === 'to-review') toReview += 1;
    const card = c.gloss
      ? {
        id: c.id, kind: 'word', target: e.headword, pos: e.pos,
        ...(e.variants ? { variants: e.variants } : {}),
        gloss: c.gloss, example: { target: c.example, gloss: c.exampleGloss }, check,
      }
      : { id: c.id, kind: 'phrase', target: c.example, gloss: c.exampleGloss, check };
    cardsByTopic.get(c.topic).push(card);
    covered.add(c.id);
  }
}

const missing = entries.filter((e) => !covered.has(e.id));
if (missing.length) fail(`${missing.length} ${LEVEL} words have no card yet (first: ${missing.slice(0, 5).map((e) => e.id).join(', ')})`);

for (const n of numbers) {
  const value = englishValue(n.headword);
  const round = ROUND_NUMBERS[n.headword];
  if (value === null && !round) fail(`number word not understood: ${n.headword}`);
  cardsByTopic.get('numbers').push({
    id: n.id, kind: 'word', target: n.headword, pos: 'number',
    gloss: round ?? { fr: frenchNumber(value), es: spanishNumber(value) }, check: 'computed',
  });
}
const numberValue = (w) => englishValue(w) ?? { hundred: 100, thousand: 1000, million: 1e6 }[w];
cardsByTopic.get('numbers').sort((a, b) => numberValue(a.target) - numberValue(b.target));

const themes = [...cardsByTopic].filter(([, cards]) => cards.length).map(([id, cards]) => ({ id, cards }));
const deck = {
  id: `en-${LEVEL.toLowerCase()}`, lang: 'en', level: LEVEL, version: 1, reviewedBy: null, reviewedAt: null, checkedAt,
  source: {
    name: 'CEFR-J Wordlist 1.5 and Grammar Profile, Tono Laboratory, Tokyo University of Foreign Studies',
    url: 'http://www.cefr-j.org/',
    terms: 'free for research and commercial use when cited',
  },
  themes,
};
writeFileSync(join(here, '..', '..', 'src', 'decks', 'en', `${LEVEL.toLowerCase()}.json`), JSON.stringify(deck, null, 1) + '\n');
const total = themes.reduce((n, t) => n + t.cards.length, 0);
console.log(`${LEVEL} deck: ${total} cards in ${themes.length} themes, ${toReview} to-review, checked ${checkedAt}`);
