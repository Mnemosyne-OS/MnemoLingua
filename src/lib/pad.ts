/**
 * pad.ts — what happens on the writing pad, stroke after stroke. Pure, so the
 * rules are tested without a pointer (jsdom lays nothing out).
 *
 * The rules, as Tony asked for them (2026-10-07):
 *  - each stroke is judged against the stroke expected AT THAT POSITION in the
 *    order: drawing the right stroke at the wrong time is a miss;
 *  - a missed stroke says why (direction, start, end, shape);
 *  - after 3 misses on the same stroke, it is shown: a hint;
 *  - « Montrer l'ordre » is a hint too; « Je ne sais pas » gives up.
 *
 * Score, same scale as the eye of a word card: no miss and no hint = 1 point,
 * misses or a hint = 0.5, given up = 0. For the spacing, a character counts as
 * known when it was written without a hint: one or two misses on a stroke cost
 * points, not the box; the third shows the stroke, which is a hint.
 */
import { judgeStroke, polylineLength, type Pt, type StrokeVerdict } from './strokes';

/** What a hint costs: half of a known card. The ONE copy, read by the pad,
 *  the eye of a word card and both labels. */
export const HINT_COST = 0.5;

/** Below this length (box units, the box is 109) a touch is a tap, not a
 *  stroke: it is ignored, never counted as a miss. Without it, resting a
 *  finger three times on a touch screen drew the hint and cost the box. */
export const TAP_LENGTH = 3;

/** Misses on one stroke before it is shown. */
export const MISSES_BEFORE_HINT = 3;

export interface PadState {
  /** Index of the next stroke to draw. */
  index: number;
  /** Misses on the current stroke. */
  misses: number;
  /** Misses on the whole character. */
  total: number;
  hinted: boolean;
  gaveUp: boolean;
  /** The last miss, for the line under the pad. Null after a good stroke. */
  last: Extract<StrokeVerdict, { ok: false }>['why'] | null;
  /** The stroke the pad is showing as a hint, or 'all' for the whole order. */
  showing: number | 'all' | null;
  done: boolean;
}

/** A blank pad: first stroke expected, nothing missed. */
export const padStart = (): PadState => ({
  index: 0, misses: 0, total: 0, hinted: false, gaveUp: false, last: null, showing: null, done: false,
});

export type PadAction =
  | { type: 'stroke'; points: readonly Pt[] }
  | { type: 'showOrder' }
  | { type: 'giveUp' };

/** One step. A right stroke at the wrong place in the order is a MISS: the
 *  order is what is taught, so the stroke is judged against `strokes[index]` only. */
export function padReduce(strokes: readonly string[], s: PadState, a: PadAction): PadState {
  if (s.done) return s;
  switch (a.type) {
    case 'stroke': {
      const expected = strokes[s.index];
      if (!expected) return s;
      if (polylineLength(a.points) < TAP_LENGTH) return s;
      const v = judgeStroke(a.points, expected);
      if (v.ok) {
        const index = s.index + 1;
        return { ...s, index, misses: 0, last: null, showing: null, done: index >= strokes.length };
      }
      const misses = s.misses + 1;
      const shown = misses >= MISSES_BEFORE_HINT;
      return {
        ...s, misses, total: s.total + 1, last: v.why,
        hinted: s.hinted || shown, showing: shown ? s.index : s.showing,
      };
    }
    case 'showOrder':
      return { ...s, hinted: true, showing: 'all' };
    case 'giveUp':
      return { ...s, gaveUp: true, done: true, showing: 'all' };
  }
}

export interface PadResult { known: boolean; points: number }

/** What the finished pad is worth: `known` moves the Leitner box, `points` the sitting score. */
export function padResult(s: PadState): PadResult {
  if (s.gaveUp) return { known: false, points: 0 };
  return { known: !s.hinted, points: s.total === 0 && !s.hinted ? 1 : 1 - HINT_COST };
}
