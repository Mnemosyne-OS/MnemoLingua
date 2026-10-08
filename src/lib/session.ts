/**
 * session.ts — turning a deck and the learner's progress into today's sitting.
 *
 * Pure: every function takes a state and returns a new one. The store persists
 * whatever comes back.
 *
 * The rules a sitting keeps:
 *  - due records come first, oldest due first (`dueCards`, copied from Melete);
 *  - new cards enter at most `dailyNew` a day (doc 138 §6). A 200-phrase deck
 *    opened all at once is 200 cards due three days later, which is how people
 *    abandon a review app;
 *  - a new card enters in BOTH directions the same day, recognise first;
 *  - a record whose card is no longer playable (reported, withheld, theme
 *    unticked, no gloss) is skipped, never deleted: untick a theme and tick it
 *    back, and its history is still there;
 *  - a transparent word (jeans = le jean) is only asked the « say it » way:
 *    its recognise record exists and is skipped the same way.
 */
import { answerCard, dueCards, newCard } from './schedule';
import { dayKey } from './day';
import type { Card, Deck, DeckCard, Direction, GlossLang, LinguaState } from './types';
import { DIRECTIONS } from './types';
import type { DeckView } from './deck';

/** The scheduling record of one card in one direction. */
export function recordId(cardId: string, direction: Direction): string {
  return `${cardId}:${direction}`;
}

/** Splits a record id back. Returns null on an id this cartridge did not write. */
export function parseRecordId(id: string): { cardId: string; direction: Direction } | null {
  const at = id.lastIndexOf(':');
  if (at <= 0) return null;
  const direction = id.slice(at + 1);
  if (direction !== 'recognise' && direction !== 'produce') return null;
  return { cardId: id.slice(0, at), direction };
}

export interface QueueItem {
  record: Card;
  card: DeckCard;
  direction: Direction;
}

function usedToday(state: LinguaState, deckId: string, now: Date): number {
  const entry = state.introduced[deckId];
  return entry && entry.day === dayKey(now) ? entry.count : 0;
}

/** New cards the learner may still meet today in this deck. Never negative. */
export function newQuota(state: LinguaState, deckId: string, now: Date): number {
  return Math.max(0, state.dailyNew - usedToday(state, deckId, now));
}

/**
 * Playable cards with no record yet, capped by today's quota, taken from the
 * theme the learner has met LEAST so far (ties: deck order), in deck order
 * inside a theme.
 *
 * 🪤 Straight deck order made the first three weeks of A1 alphabetical
 * grammar words ("a, a.m., about, about, above…"). 🪤 A round robin that
 * restarted at the first theme every day was no better across days: the same
 * ten themes every morning, numbers on day 60, grammar on day 61 (measured by
 * the cold verification on the real A1). Counting what each theme has already
 * given makes every theme come round within days.
 */
export function freshCards(state: LinguaState, deck: Deck, view: DeckView, now: Date): DeckCard[] {
  const known = new Set<string>();
  for (const r of state.records) {
    if (r.courseId !== deck.id) continue;
    const parsed = parseRecordId(r.id);
    if (parsed) known.add(parsed.cardId);
  }
  const playable = new Set(view.playable.map((c) => c.id));
  const themes = deck.themes.map((t) => ({
    met: t.cards.filter((c) => known.has(c.id)).length,
    queue: t.cards.filter((c) => playable.has(c.id) && !known.has(c.id)),
  }));
  const quota = newQuota(state, deck.id, now);
  const out: DeckCard[] = [];
  while (out.length < quota) {
    let pick: (typeof themes)[number] | null = null;
    for (const t of themes) {
      if (t.queue.length === 0) continue;
      if (!pick || t.met < pick.met) pick = t;
    }
    if (!pick) break;
    out.push(pick.queue.shift()!);
    pick.met += 1;
  }
  return out;
}

/**
 * Creates the records for today's new cards and counts them against the cap.
 *
 * Called once when a sitting starts. The cap counts CARDS, not records: ten
 * new cards are twenty records, one per direction.
 */
export function introduce(state: LinguaState, deck: Deck, cards: DeckCard[], now: Date): LinguaState {
  if (cards.length === 0) return state;
  const today = dayKey(now);
  const records: Card[] = [];
  for (const card of cards) {
    for (const direction of DIRECTIONS) {
      records.push(newCard({ id: recordId(card.id, direction), courseId: deck.id, front: '', back: '' }, now));
    }
  }
  return {
    ...state,
    records: [...state.records, ...records],
    introduced: { ...state.introduced, [deck.id]: { day: today, count: usedToday(state, deck.id, now) + cards.length } },
  };
}

/**
 * Today's queue: due records whose card is still playable.
 *
 * Within the same due day, recognise comes before produce, so a card met for
 * the first time is read before it has to be said.
 */
export function buildQueue(state: LinguaState, deck: Deck, view: DeckView, now: Date): QueueItem[] {
  const playable = new Map(view.playable.map((c) => [c.id, c]));
  const mine = state.records.filter((r) => r.courseId === deck.id);
  const items: QueueItem[] = [];
  for (const record of dueCards(mine, now)) {
    const parsed = parseRecordId(record.id);
    if (!parsed) continue;
    const card = playable.get(parsed.cardId);
    if (!card) continue;
    if (parsed.direction === 'recognise' && view.transparent?.has(card.id)) continue;
    items.push({ record, card, direction: parsed.direction });
  }
  // A stable sort keeps dueCards' order; only the direction is reordered.
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => {
      if (a.item.record.dueAt !== b.item.record.dueAt) return a.i - b.i;
      if (a.item.direction !== b.item.direction) return a.item.direction === 'recognise' ? -1 : 1;
      return a.i - b.i;
    })
    .map(({ item }) => item);
}

/** Applies one answer to the stored record. Unknown id = state unchanged. */
export function applyAnswer(state: LinguaState, id: string, correct: boolean, now: Date): LinguaState {
  const at = state.records.findIndex((r) => r.id === id);
  if (at < 0) return state;
  const records = state.records.slice();
  const current = records[at];
  if (!current) return state;
  records[at] = answerCard(current, correct, now);
  return { ...state, records };
}

/** "This card is wrong." Idempotent: reporting twice keeps one report. */
export function reportCard(state: LinguaState, deckId: string, cardId: string, now: Date): LinguaState {
  if (state.reports.some((r) => r.deckId === deckId && r.cardId === cardId)) return state;
  return { ...state, reports: [...state.reports, { deckId, cardId, at: now.toISOString() }] };
}

/** Puts a reported card back into review, with its history intact. */
export function withdrawReport(state: LinguaState, deckId: string, cardId: string): LinguaState {
  return { ...state, reports: state.reports.filter((r) => !(r.deckId === deckId && r.cardId === cardId)) };
}

/** Cards of a deck the learner reported as wrong. */
export function reportedIds(state: LinguaState, deckId: string): Set<string> {
  return new Set(state.reports.filter((r) => r.deckId === deckId).map((r) => r.cardId));
}

/** Ticks or unticks a theme. The first change starts from "every theme". */
export function toggleTheme(state: LinguaState, deck: Deck, themeId: string): LinguaState {
  const current = state.themes[deck.id] ?? deck.themes.map((t) => t.id);
  const next = current.includes(themeId) ? current.filter((id) => id !== themeId) : [...current, themeId];
  return { ...state, themes: { ...state.themes, [deck.id]: next } };
}

/** Ticks exactly these themes of the deck (« all » / « none »). Ids the deck
 *  does not have are dropped: a stale id would be counted as ticked forever. */
export function setThemes(state: LinguaState, deck: Deck, themeIds: string[]): LinguaState {
  const known = new Set(deck.themes.map((t) => t.id));
  return { ...state, themes: { ...state.themes, [deck.id]: themeIds.filter((id) => known.has(id)) } };
}

/** Records the learner's translation language. Progress is untouched: a
 *  record belongs to a card, not to the language it was shown in. */
export function setGlossLang(state: LinguaState, lang: GlossLang): LinguaState {
  return { ...state, glossLang: lang };
}

/** New cards a day, as the learner set it. Kept within 1..100. */
export function setDailyNew(state: LinguaState, n: number): LinguaState {
  return { ...state, dailyNew: Math.min(100, Math.max(1, Math.round(n))) };
}
