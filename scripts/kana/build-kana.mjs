// Builds src/decks/ja/kana.json: the 46 hiragana and 46 katakana with their
// modified Hepburn reading. Our own table, no download: the STROKES are not in
// the deck, the learner downloads them from KanjiVG inside the cartridge
// (doc 138 §13). Run: node scripts/kana/build-kana.mjs
import { writeFileSync } from 'node:fs';

const ROWS = [
  ['a', 'あ', 'ア'], ['i', 'い', 'イ'], ['u', 'う', 'ウ'], ['e', 'え', 'エ'], ['o', 'お', 'オ'],
  ['ka', 'か', 'カ'], ['ki', 'き', 'キ'], ['ku', 'く', 'ク'], ['ke', 'け', 'ケ'], ['ko', 'こ', 'コ'],
  ['sa', 'さ', 'サ'], ['shi', 'し', 'シ'], ['su', 'す', 'ス'], ['se', 'せ', 'セ'], ['so', 'そ', 'ソ'],
  ['ta', 'た', 'タ'], ['chi', 'ち', 'チ'], ['tsu', 'つ', 'ツ'], ['te', 'て', 'テ'], ['to', 'と', 'ト'],
  ['na', 'な', 'ナ'], ['ni', 'に', 'ニ'], ['nu', 'ぬ', 'ヌ'], ['ne', 'ね', 'ネ'], ['no', 'の', 'ノ'],
  ['ha', 'は', 'ハ'], ['hi', 'ひ', 'ヒ'], ['fu', 'ふ', 'フ'], ['he', 'へ', 'ヘ'], ['ho', 'ほ', 'ホ'],
  ['ma', 'ま', 'マ'], ['mi', 'み', 'ミ'], ['mu', 'む', 'ム'], ['me', 'め', 'メ'], ['mo', 'も', 'モ'],
  ['ya', 'や', 'ヤ'], ['yu', 'ゆ', 'ユ'], ['yo', 'よ', 'ヨ'],
  ['ra', 'ら', 'ラ'], ['ri', 'り', 'リ'], ['ru', 'る', 'ル'], ['re', 'れ', 'レ'], ['ro', 'ろ', 'ロ'],
  // を is said « o » today; « wo » is how it is typed and told apart from お.
  ['wa', 'わ', 'ワ'], ['wo', 'を', 'ヲ'], ['n', 'ん', 'ン'],
];
if (ROWS.length !== 46) throw new Error(`expected 46 kana, got ${ROWS.length}`);

const card = (script, romaji, ch) => ({
  id: `${script === 'hiragana' ? 'hira' : 'kata'}-${romaji}`,
  kind: 'glyph',
  target: ch,
  pos: script,
  gloss: { en: romaji, fr: romaji, es: romaji },
  check: 'reference',
});

const deck = {
  id: 'ja-kana',
  lang: 'ja',
  version: 1,
  reviewedBy: null,
  reviewedAt: null,
  checkedAt: '2026-10-07',
  themes: [
    { id: 'hiragana', cards: ROWS.map(([r, h]) => card('hiragana', r, h)) },
    { id: 'katakana', cards: ROWS.map(([r, , k]) => card('katakana', r, k)) },
  ],
};
writeFileSync(new URL('../../src/decks/ja/kana.json', import.meta.url), JSON.stringify(deck, null, 1) + '\n');
console.log('kana.json: 92 cards');
