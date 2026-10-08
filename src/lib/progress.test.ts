import { describe, expect, it, vi } from 'vitest';
import a1 from '../decks/en/a1.json';
import manifest from '../../mnemo-plugin.json';
import { isTransparent, parseDeck, viewDeck } from './deck';
import { PLUGIN_ID } from './host';
import { DECK_METAS, loadDeck } from '../decks';
import { cardCount, cardsDueTomorrow, nextReview, playableRecordsOf } from './progress';
import { freshCards, introduce, reportCard, setDailyNew, toggleTheme } from './session';
import { emptyState, type Card } from './types';

function rec(cardId: string, dir: 'recognise' | 'produce', dueAt: string): Card {
  return { id: `${cardId}:${dir}`, courseId: 'd', front: '', back: '', box: 2, dueAt, reps: 1, lapses: 0, lastSeenAt: null };
}

const NOW = new Date(2026, 9, 6, 10, 0, 0);

describe('counts are in cards, not records', () => {
  it('ten phrases studied in both directions are ten cards, not twenty', () => {
    const records = Array.from({ length: 10 }, (_, i) => [rec(`c${i}`, 'recognise', '2026-10-07'), rec(`c${i}`, 'produce', '2026-10-07')]).flat();
    expect(cardCount(records)).toBe(10);
    expect(cardsDueTomorrow(records, NOW)).toBe(10);
  });

  it('names the real day of the next review instead of saying tomorrow', () => {
    const records = [rec('a', 'recognise', '2026-10-09'), rec('a', 'produce', '2026-10-09'), rec('b', 'recognise', '2026-10-12')];
    expect(nextReview(records, NOW)).toEqual({ inDays: 3, cards: 1 });
    expect(nextReview([], NOW)).toBeNull();
  });
});

describe('the counts read only playable cards', () => {
  it('leaves out an unticked theme and a reported card', () => {
    const deck = parseDeck(a1).deck!;
    const [t1, t2] = deck.themes;
    // Recognise records of transparent words are never counted (deck.test),
    // so this test picks cards that are not.
    const opaque = (cards: typeof t1.cards) => cards.filter((c) => !isTransparent(c, 'fr'));
    const c1 = opaque(t1!.cards)[0]!.id;
    const c2 = opaque(t1!.cards)[1]!.id;
    const c3 = opaque(t2!.cards)[0]!.id;
    let state = { ...emptyState(), records: [c1, c2, c3].map((id) => ({ ...rec(id, 'recognise', '2026-10-07'), courseId: deck.id })) };
    expect(cardCount(playableRecordsOf(state, deck, 'fr'))).toBe(3);
    state = toggleTheme(state, deck, t2!.id);
    state = reportCard(state, deck.id, c2, NOW);
    expect(playableRecordsOf(state, deck, 'fr').map((r) => r.id)).toEqual([`${c1}:recognise`]);
  });
});

describe('new cards across days, on the real A1', () => {
  it('every A1 theme has come round within three days at ten a day', () => {
    const deck = parseDeck(a1).deck!;
    const view = viewDeck(deck, 'fr');
    let state = emptyState();
    const met = new Set<string>();
    const themeOf = new Map(deck.themes.flatMap((t) => t.cards.map((c) => [c.id, t.id] as const)));
    for (let day = 0; day < 3; day++) {
      const now = new Date(2026, 9, 6 + day, 10);
      const fresh = freshCards(state, deck, view, now);
      expect(fresh).toHaveLength(10);
      for (const c of fresh) met.add(themeOf.get(c.id)!);
      state = introduce(state, deck, fresh, now);
    }
    expect(met.size).toBe(deck.themes.length);
  });

  it('the daily setting is kept within 1 to 100', () => {
    expect(setDailyNew(emptyState(), 0).dailyNew).toBe(1);
    expect(setDailyNew(emptyState(), 250).dailyNew).toBe(100);
    expect(setDailyNew(emptyState(), 15).dailyNew).toBe(15);
  });
});

describe('the cartridge name', () => {
  it('the id the SDK sends is the name in the manifest (the host drops any other, silently)', () => {
    expect(PLUGIN_ID).toBe(manifest.name);
  });
});

describe('loadDeck', () => {
  it('turns a deck that never arrives into a named problem instead of a hang', async () => {
    vi.useFakeTimers();
    try {
      const meta = DECK_METAS.find((m) => m.id === 'en-b1')!;
      const pending = loadDeck(meta, 15_000, () => new Promise<never>(() => undefined));
      await vi.advanceTimersByTimeAsync(15_001);
      expect(await pending).toEqual({ deck: null, problems: ['DECK_TIMEOUT after 15000 ms'] });
    } finally {
      vi.useRealTimers();
    }
  });

  it('refuses a deck whose id is not the one its file name gives', async () => {
    const meta = DECK_METAS.find((m) => m.id === 'en-a1')!;
    expect((await loadDeck(meta, 15_000, () => Promise.resolve({ ...a1, id: 'en-a2' }))).deck).toBeNull();
  });

  it('draws the tabs from the file names: levels first, in order, then topic decks', () => {
    expect(DECK_METAS.map((m) => [m.id, m.level ?? null])).toEqual([
      ['en-a1', 'A1'], ['en-a2', 'A2'], ['en-b1', 'B1'], ['zh-hsk1', null], ['ja-kana', null], ['ja-kanji-n5', null], ['en-travel', null],
    ]);
  });

  it('names a file that is not shipped', async () => {
    const result = await loadDeck({ file: './en/zz.json', id: 'en-zz', lang: 'en', name: 'zz' });
    expect(result).toEqual({ deck: null, problems: ['no file ./en/zz.json'] });
  });
});
