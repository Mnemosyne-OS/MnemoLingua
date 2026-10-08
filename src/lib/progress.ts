/**
 * progress.ts — the numbers the screens show about what is due, in CARDS.
 *
 * 🚨 A card has two scheduling records (recognise, produce). Counting records
 * told a learner who had studied 10 phrases that 20 were waiting (cold
 * verification, 2026-10-06). Every count here is of distinct cards.
 *
 * Every count also reads only PLAYABLE cards: a card from an unticked theme,
 * a reported card or a withdrawn card is not waiting for anyone.
 */
import { addDays, dayKey, daysBetween } from './day';
import { reportedIds, parseRecordId } from './session';
import { viewDeck } from './deck';
import type { Card, Deck, GlossLang, LinguaState } from './types';

/** Distinct cards behind a set of records. */
export function cardCount(records: Card[]): number {
  const ids = new Set<string>();
  for (const r of records) {
    const p = parseRecordId(r.id);
    if (p) ids.add(p.cardId);
  }
  return ids.size;
}

/** The deck's records whose card the learner can study now. */
export function playableRecordsOf(state: LinguaState, deck: Deck, lang: GlossLang): Card[] {
  const view = viewDeck(deck, lang, { themes: state.themes[deck.id], reportedIds: reportedIds(state, deck.id) });
  const ids = new Set(view.playable.map((c) => c.id));
  return state.records.filter((r) => {
    const p = parseRecordId(r.id);
    // A transparent word's recognise record is never asked (session.ts), so
    // counting it would announce reviews that never come.
    return r.courseId === deck.id && p !== null && ids.has(p.cardId)
      && !(p.direction === 'recognise' && view.transparent?.has(p.cardId));
  });
}

/** Cards due by tomorrow, as the learner will find them when they come back. */
export function cardsDueTomorrow(records: Card[], now: Date): number {
  const tomorrow = addDays(dayKey(now), 1);
  return cardCount(records.filter((r) => r.dueAt <= tomorrow));
}

/**
 * The next day after today with something due, and how many cards then.
 * Null when nothing is scheduled at all. The screen names the DAY count:
 * "tomorrow" for a review three days away was a promise the app broke.
 */
export function nextReview(records: Card[], now: Date): { inDays: number; cards: number } | null {
  const today = dayKey(now);
  let best: string | null = null;
  for (const r of records) if (r.dueAt > today && (best === null || r.dueAt < best)) best = r.dueAt;
  if (best === null) return null;
  const day = best;
  return { inDays: daysBetween(today, day), cards: cardCount(records.filter((r) => r.dueAt === day)) };
}
