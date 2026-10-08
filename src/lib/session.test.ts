import { describe, expect, it } from 'vitest';
import { viewDeck } from './deck';
import {
  applyAnswer, buildQueue, freshCards, introduce, newQuota, parseRecordId, recordId, reportCard,
  reportedIds, setThemes, toggleTheme, withdrawReport,
} from './session';
import { emptyState, type Deck, type DeckCard } from './types';

const AT = new Date(2026, 9, 5, 10, 0, 0);
const NEXT_DAY = new Date(2026, 9, 6, 10, 0, 0);

function cards(n: number): DeckCard[] {
  return Array.from({ length: n }, (_, i) => ({ id: `c${i}`, kind: 'phrase' as const, target: `T${i}`, gloss: { fr: `F${i}` }, check: 'two-pass' as const }));
}

function deck(n: number): Deck {
  return { id: 'd', lang: 'en', version: 1, reviewedBy: null, reviewedAt: null, checkedAt: '2026-10-05', themes: [{ id: 'a', cards: cards(n) }, { id: 'b', cards: [{ id: 'z', kind: 'phrase', target: 'Z', gloss: { fr: 'Z' }, check: 'two-pass' }] }] };
}

describe('record ids', () => {
  it('round-trips, even when the card id itself contains a colon', () => {
    expect(parseRecordId(recordId('a:b', 'produce'))).toEqual({ cardId: 'a:b', direction: 'produce' });
    expect(parseRecordId('nonsense')).toBeNull();
    expect(parseRecordId('x:sideways')).toBeNull();
  });
});

describe('the daily cap on new cards', () => {
  it('lets in at most dailyNew new cards, one theme at a time', () => {
    const d = deck(30);
    const fresh = freshCards(emptyState(), d, viewDeck(d, 'fr'), AT);
    expect(fresh).toHaveLength(10);
    // Theme b has one card: it comes second, not after the 30 cards of a.
    expect(fresh.slice(0, 3).map((c) => c.id)).toEqual(['c0', 'z', 'c1']);
  });

  it('counts each deck on its own: a full day in one deck leaves the other open', () => {
    const d = deck(30);
    const other = { ...d, id: 'other' };
    const s = introduce(emptyState(), other, cards(10), AT);
    expect(newQuota(s, 'other', AT)).toBe(0);
    expect(newQuota(s, 'd', AT)).toBe(10);
  });

  it('counts cards already introduced today, and resets the next day', () => {
    const d = deck(30);
    const s = introduce(emptyState(), d, cards(7), AT);
    expect(newQuota(s, 'd', AT)).toBe(3);
    expect(freshCards(s, d, viewDeck(d, 'fr'), AT)).toHaveLength(3);
    expect(newQuota(s, 'd', NEXT_DAY)).toBe(10);
  });

  it('counts CARDS, not records: one card is two records, one per direction', () => {
    const s = introduce(emptyState(), deck(5), cards(2), AT);
    expect(s.records).toHaveLength(4);
    expect(s.introduced.d!.count).toBe(2);
  });

  it('never goes negative when the cap is lowered under what was already introduced', () => {
    const s = { ...introduce(emptyState(), deck(20), cards(10), AT), dailyNew: 4 };
    expect(newQuota(s, 'd', AT)).toBe(0);
  });
});

describe('buildQueue', () => {
  it('shows a new card in the recognise direction before the produce one', () => {
    const d = deck(3);
    const s = introduce(emptyState(), d, cards(3), AT);
    const q = buildQueue(s, d, viewDeck(d, 'fr'), AT);
    expect(q).toHaveLength(6);
    const firstProduce = q.findIndex((i) => i.direction === 'produce');
    expect(q.slice(0, firstProduce).every((i) => i.direction === 'recognise')).toBe(true);
    expect(q.slice(firstProduce).every((i) => i.direction === 'produce')).toBe(true);
  });

  it('skips the records of an unticked theme but keeps their history', () => {
    const d = deck(2);
    let s = introduce(emptyState(), d, [...cards(2), d.themes[1]!.cards[0]!], AT);
    s = toggleTheme(s, d, 'b');
    expect(s.themes.d).toEqual(['a']);
    const q = buildQueue(s, d, viewDeck(d, 'fr', { themes: s.themes.d }), AT);
    expect(q.some((i) => i.card.id === 'z')).toBe(false);
    expect(s.records.some((r) => r.id.startsWith('z:'))).toBe(true);
  });

  it('drops a reported card from the queue, and puts it back when the report is withdrawn', () => {
    const d = deck(2);
    let s = introduce(emptyState(), d, cards(2), AT);
    s = reportCard(s, d.id, 'c0', AT);
    s = reportCard(s, d.id, 'c0', AT);
    expect(s.reports).toHaveLength(1);
    const view = (st: typeof s) => viewDeck(d, 'fr', { reportedIds: reportedIds(st, d.id) });
    expect(buildQueue(s, d, view(s), AT).some((i) => i.card.id === 'c0')).toBe(false);
    s = withdrawReport(s, d.id, 'c0');
    expect(buildQueue(s, d, view(s), AT).some((i) => i.card.id === 'c0')).toBe(true);
  });
});

describe('applyAnswer', () => {
  it('moves only the answered direction', () => {
    const d = deck(1);
    let s = introduce(emptyState(), d, cards(1), AT);
    s = applyAnswer(s, recordId('c0', 'recognise'), true, AT);
    expect(s.records.find((r) => r.id === 'c0:recognise')!.box).toBe(2);
    expect(s.records.find((r) => r.id === 'c0:produce')!.box).toBe(1);
  });

  it('leaves the state alone for an id it does not know', () => {
    const s = introduce(emptyState(), deck(1), cards(1), AT);
    expect(applyAnswer(s, 'ghost:recognise', true, AT)).toBe(s);
  });
});

describe('setThemes', () => {
  it('ticks exactly the given themes and drops ids the deck does not have', () => {
    const d = deck(3);
    const ids = d.themes.map((t) => t.id);
    expect(setThemes(emptyState(), d, []).themes[d.id]).toEqual([]);
    expect(setThemes(emptyState(), d, [...ids, 'gone']).themes[d.id]).toEqual(ids);
  });
});
