/**
 * verif.probe — probes written by the verification pass of 2026-10-07
 * (session 1911bb39) for rules the shipped suite never exercised. Part of the
 * suite since; the ones that documented a defect now hold its fix.
 */
import { describe, expect, it } from 'vitest';
import { isTransparent } from './deck';
import { padReduce, padResult, padStart } from './pad';
import { pathPoints } from './strokes';
import { hydrate, serialise } from './store';
import { emptyState, type Card, type DeckCard } from './types';

const A = [
  'M31.01,33c0.88,0.88,2.75,1.82,5.25,1.75c8.62-0.25,20-2.12,29.5-4.25c1.51-0.34,4.62-0.88,6.62-0.5',
  'M49.76,17.62c0.88,1,1.82,3.26,1.38,5.25c-3.75,16.75-6.25,38.13-5.13,53.63c0.41,5.7,1.88,10.88,3.38,13.62',
  'M65.63,44.12c0.75,1.12,1.16,4.39,0.5,6.12c-4.62,12.26-11.24,23.76-25.37,35.76c-6.86,5.83-15.88,3.75-16.25-8.38c-0.34-10.87,13.38-23.12,32.38-26.74c12.42-2.37,27,1.38,30.5,12.75c4.05,13.18-3.76,26.37-20.88,30.49',
];

describe('a glyph is never transparent', () => {
  it('the kana « a » whose reading is « a » keeps its reading question', () => {
    const kana: DeckCard = { id: 'hira-a', kind: 'glyph', target: 'あ', pos: 'hiragana', gloss: { fr: 'a', en: 'a', es: 'a' }, check: 'reference' };
    expect(isTransparent(kana, 'fr')).toBe(false);
    // The same text as a WORD card would be: that is what the kind guard holds.
    expect(isTransparent({ ...kana, kind: 'word', target: 'a' }, 'fr')).toBe(true);
  });
});

describe("« Montrer l'ordre » is a hint", () => {
  it('a character written perfectly after asking for the order is half known, not known', () => {
    let s = padReduce(A, padStart(), { type: 'showOrder' });
    for (const k of [0, 1, 2]) s = padReduce(A, s, { type: 'stroke', points: pathPoints(A[k]!) });
    expect(s.done).toBe(true);
    expect(padResult(s)).toEqual({ known: false, points: 0.5 });
  });

  it('a tap is not a stroke: three taps neither miss nor reveal anything', () => {
    let s = padStart();
    for (let k = 0; k < 3; k++) s = padReduce(A, s, { type: 'stroke', points: [{ x: 50, y: 50 }, { x: 51, y: 50 }] });
    expect(s).toMatchObject({ index: 0, total: 0, hinted: false, showing: null, last: null });
  });

  it('a short real stroke is still a miss', () => {
    const s = padReduce(A, padStart(), { type: 'stroke', points: [{ x: 31, y: 33 }, { x: 37, y: 33 }] });
    expect(s).toMatchObject({ total: 1, last: 'tooShort' });
  });
});

describe('format 3: a card learned in one direction only', () => {
  it('reads back without counting the missing direction as a dropped record', () => {
    const only: Card = { id: 'jeans:produce', courseId: 'd', front: '', back: '', box: 2, dueAt: '2026-10-09', reps: 1, lapses: 0, lastSeenAt: null };
    const { state, droppedRecords } = hydrate(serialise({ ...emptyState(), records: [only] }));
    expect(state.records.map((r) => r.id)).toEqual(['jeans:produce']);
    expect(droppedRecords).toBe(0);
  });
});
