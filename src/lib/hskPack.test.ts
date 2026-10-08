import { describe, expect, it } from 'vitest';
import { buildHskDeck, chooseForm, downloadHsk, hskProblem, hskUrl, parseHsk, shortGloss } from './hskPack';
import { HANZI_SOURCE, judgeStroke, medianPath, parseHanziWriter, pathPoints, strokeSourceFor } from './strokes';
import { parseDeck } from './deck';
import { glyphChars } from './useWritingData';
import { wordResult } from '../components/WritingPad';
import hsk1 from '../decks/zh/hsk1.json';

// The median of 一, from hanzi-writer-data 2.0.1 (Arphic Public License).
const YI = { strokes: ['M 0 0 Z'], medians: [[[121, 393], [193, 372], [417, 402], [827, 434], [920, 401]]] };

describe('hanzi-writer strokes', () => {
  it('turns a median (1024 box, y up) into a path of the 109 box, left to right for 一', () => {
    const pts = pathPoints(medianPath(YI.medians[0]!)!);
    expect(pts[0]!.x).toBeCloseTo(12.9, 0);
    expect(pts[0]!.y).toBeCloseTo(53.9, 0);
    expect(pts[pts.length - 1]!.x).toBeCloseTo(97.9, 0);
  });

  it('reads one path per median, and refuses a file that is not one', () => {
    expect(parseHanziWriter(JSON.stringify(YI))).toHaveLength(1);
    expect(parseHanziWriter('not json')).toBeNull();
    expect(parseHanziWriter(JSON.stringify({ medians: [] }))).toBeNull();
    expect(parseHanziWriter(JSON.stringify({ medians: [[[1, 2]]] }))).toBeNull();
  });

  it('the judge holds on a Chinese stroke: right way accepted, reversed refused', () => {
    const d = parseHanziWriter(JSON.stringify(YI))![0]!;
    expect(judgeStroke(pathPoints(d), d)).toEqual({ ok: true });
    expect(judgeStroke([...pathPoints(d)].reverse(), d)).toEqual({ ok: false, why: 'reversed' });
  });

  it('Chinese draws from hanzi-writer-data, pinned, one file per character', () => {
    expect(strokeSourceFor('zh')).toBe(HANZI_SOURCE);
    expect(strokeSourceFor('ja').id).toBe('kanjivg');
    expect(HANZI_SOURCE.url('我')).toBe('https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/%E6%88%91.json');
  });
});

const LIST = [
  { simplified: '爸爸', pos: ['n'], forms: [{ transcriptions: { pinyin: 'bàba' }, meanings: ['(informal) father; CL:個|个[ge4],位[wei4]'] }] },
  { simplified: '爱', pos: ['v', 'vn'], forms: [{ transcriptions: { pinyin: 'ài' }, meanings: ['to love; to be fond of; to like', 'affection'] }] },
  { simplified: '不', pos: ['d'], forms: [{ transcriptions: { pinyin: 'bù' }, meanings: ['no; not so'] }] },
  { simplified: '', forms: [] },
];

describe('the HSK pack', () => {
  it('reads word, pinyin and meanings, and leaves out a word with none', () => {
    expect(parseHsk(LIST).map((w) => w.word)).toEqual(['爸爸', '爱', '不']);
  });

  it('a card is a word in English only: no meaning is made up in another language', () => {
    const deck = buildHskDeck(parseDeck(hsk1).deck!, { source: 'hsk', list: 'old', level: 1 }, parseHsk(LIST));
    const dad = deck.themes.find((t) => t.id === 'hsk-nouns')!.cards[0]!;
    expect(dad).toMatchObject({ id: 'hsk-爸爸', kind: 'glyph', target: '爸爸', pinyin: 'bàba', gloss: { en: '(informal) father' } });
    expect(Object.keys(dad.gloss)).toEqual(['en']);
    expect(deck.themes.map((t) => t.id)).toEqual(['hsk-nouns', 'hsk-verbs', 'hsk-other']);
  });

  it('the strokes to fetch are the CHARACTERS of the words, each once', () => {
    const deck = buildHskDeck(parseDeck(hsk1).deck!, { source: 'hsk', list: 'old', level: 1 }, parseHsk(LIST));
    expect(glyphChars(deck)).toEqual(['爸', '爱', '不']);
  });

  it('the list is pinned to a commit', () => {
    expect(hskUrl({ source: 'hsk', list: 'old', level: 1 })).toBe(
      'https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/7ac65bf1a6387d35f1ade478906172a19311c7f9/wordlists/exclusive/old/1.json');
  });

  it('refuses a list that is not a level', async () => {
    expect(hskProblem(parseHsk(LIST))).toBe('ONLY_3_WORDS');
    const fetchImpl = (() => Promise.resolve(new Response('', { status: 404 }))) as unknown as typeof fetch;
    await expect(downloadHsk({ source: 'hsk', list: 'old', level: 1 }, { fetchImpl })).rejects.toThrow('HTTP 404');
  });
});

describe('choosing the reading a beginner learns', () => {
  // The list's own forms, in its own order (complete-hsk-vocabulary, old/1).
  it('a surname, a variant or a sense marked old never wins', () => {
    expect(chooseForm('都', [
      { pinyin: 'Dū', meanings: ['surname Du'] },
      { pinyin: 'dōu', meanings: ['all; both; entirely', '(used for emphasis) even', 'already'] },
      { pinyin: 'dū', meanings: ['capital city', 'metropolis'] },
    ])).toEqual({ pinyin: 'dōu', meaning: 'all; both; entirely' });
    expect(chooseForm('年', [
      { pinyin: 'Nián', meanings: ['surname Nian'] },
      { pinyin: 'nián', meanings: ['year'] },
      { pinyin: 'nián', meanings: ['grain', 'harvest (old)'] },
    ])?.meaning).toBe('year');
  });

  it('a grammar word wins over a rarer reading with more senses', () => {
    expect(chooseForm('了', [
      { pinyin: 'liǎo', meanings: ['to finish', 'to understand', 'to know'] },
      { pinyin: 'le', meanings: ['(completed action marker)', '(modal particle)'] },
    ])?.pinyin).toBe('le');
  });

  it('the hand table picks among the own forms of the list and senses, never writes one', () => {
    expect(chooseForm('哪', [
      { pinyin: 'nǎ', meanings: ['how', 'which'] },
      { pinyin: 'na', meanings: ['(emphatic sentence-final particle)', 'x'] },
    ])?.pinyin).toBe('nǎ');
    expect(chooseForm('钱', [{ pinyin: 'qián', meanings: ['coin', 'money'] }])?.meaning).toBe('money');
  });
});

describe('the short gloss', () => {
  it('drops the measure words and the bracketed pinyin of CC-CEDICT', () => {
    expect(shortGloss(['to see; to meet; CL:次[ci4]'])).toBe('to see; to meet');
    expect(shortGloss(['variant of 喫[chi1]'])).toBe('variant of');
    expect(shortGloss(['to love; to be fond of; to like'])).toBe('to love; to be fond of');
  });
});

describe('a word on the pad', () => {
  it('is known only when every character is, and earns the mean of their points', () => {
    expect(wordResult([{ known: true, points: 1 }, { known: true, points: 1 }])).toEqual({ known: true, points: 1 });
    expect(wordResult([{ known: true, points: 1 }, { known: false, points: 0.5 }])).toEqual({ known: false, points: 0.75 });
    expect(wordResult([])).toEqual({ known: false, points: 0 });
  });
});
