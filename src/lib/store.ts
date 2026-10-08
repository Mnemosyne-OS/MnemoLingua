/**
 * store.ts — the learner's progress, held in the host's durable state (doc 73).
 *
 * The durable state is ungated and survives the iframe's origin changing, but
 * it is capped at 256 KB. That cap decides the on-disk shape:
 *
 *  - in memory a record is Melete's `Card` (so `schedule.ts` stays a verbatim
 *    copy), about 130 bytes once serialised;
 *  - on disk (format 3) a CARD is one entry under its deck, both directions
 *    in one base-36 string `"box.day.reps.lapses.box.day.reps.lapses"`. `day`
 *    counts days from DAY_ZERO. `front`/`back` are always empty and
 *    `lastSeenAt` is not read by anything, so neither is written. Formats 1
 *    (whole `Card` objects) and 2 (one array per record) are still read.
 *
 * Measured (doc 138 §12.8): every playable card of A1 + A2 + B1 learned, at
 * the largest values, weighs ~165 KB in format 3, 64 % of the budget, under
 * the warning line. Format 1 would not have held A1 alone.
 *
 * Two rules copied from Melete, where both were paid for:
 *  1. **Nothing is written before something is read.** A mutation that lands
 *     while the first `state.get` is in flight would persist an empty progress
 *     over a real one.
 *  2. **The host answers an ENVELOPE** `{ state, updatedAt }`. Handing the
 *     envelope to `hydrate` as if it were the state reads as "nothing saved",
 *     and the next save writes that nothing over the real progress.
 *
 * 🎭 An unreadable saved state is NOT a fresh start: `load` reports it, and the
 * store refuses to save over it. A save that would not fit is REFUSED and said,
 * never truncated.
 */
import { addDays, daysBetween } from './day';
import { DEFAULT_DAILY_NEW, emptyState, type Card, type CardReport, type GlossLang, type LeitnerBox, type LinguaState } from './types';
import { readState, writeState } from './host';
import { log } from './log';

/** The host's hard cap (main/state/cartridgeState.ts MAX_BYTES). */
export const STATE_BUDGET = 256 * 1024;

/** The host weighs `{ id, state, updatedAt }`, not the state alone (measured
 *  +88 bytes). Refusing with room to spare keeps "a change that does not fit
 *  is not applied" true at the edge. */
const ENVELOPE_MARGIN = 512;

/** Past this share of the budget the screen warns. */
export const BUDGET_WARN = 0.8;

/** Day numbers on disk count from here. Any earlier day is stored as 0, which
 *  is in the past, so the card comes back today: never lost. */
export const DAY_ZERO = '2026-01-01';

export type LoadOutcome = 'fresh' | 'read' | 'unreadable';

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** What the host will count against its budget: UTF-8 bytes of the JSON. */
export function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

/** The stored blob inside the host's envelope, or null when there is none. */
export function stateOf(answer: unknown): unknown {
  if (!isObj(answer)) return null;
  return 'state' in answer && 'updatedAt' in answer ? answer.state : null;
}

// ── Format 2 (05/10, still read) ────────────────────────────────────────────

const SUFFIX_IN: Record<string, string> = { r: 'recognise', p: 'produce' };

function unpackId(id: string): string {
  const at = id.lastIndexOf(':');
  const long = at > 0 ? SUFFIX_IN[id.slice(at + 1)] : undefined;
  return long ? `${id.slice(0, at)}:${long}` : id;
}

// ── Format 3 (on disk since 06/10) ──────────────────────────────────────────
//
// One entry per CARD, both directions in one base-36 string:
//   "<cardId>": "box.day.reps.lapses.box.day.reps.lapses"   (recognise, produce)
// A direction the card has no record for is written with box 0 and skipped on
// read. Measured with the real ids, every A1 + A2 + B1 card learned: 274 KB in
// format 2 (over the host's 256 KB), 162 KB in format 3.

const B36 = (n: number): string => n.toString(36);

function packHalf(r: Card | undefined): string {
  if (!r) return '0.0.0.0';
  const day = Math.max(0, daysBetween(DAY_ZERO, r.dueAt));
  return [r.box, Number.isFinite(day) ? day : 0, r.reps, r.lapses].map(B36).join('.');
}

/** What is written: the state with its records packed per deck and per card. */
export function serialise(state: LinguaState): Record<string, unknown> {
  const records: Record<string, Record<string, { r?: Card; p?: Card }>> = {};
  let unwritable = 0;
  for (const r of state.records) {
    const at = r.id.lastIndexOf(':');
    const dir = at > 0 ? r.id.slice(at + 1) : '';
    // Only a format 1 record with a malformed id can land here: format 3 has
    // no place for it, and losing it unsaid would read as progress vanishing.
    if (dir !== 'recognise' && dir !== 'produce') { unwritable += 1; continue; }
    const entry = ((records[r.courseId] ??= {})[r.id.slice(0, at)] ??= {});
    if (dir === 'recognise') entry.r = r; else entry.p = r;
  }
  if (unwritable > 0) log.warn('store', 'records with no direction in their id are not written', { unwritable });
  const packed: Record<string, Record<string, string>> = {};
  for (const [deck, cards] of Object.entries(records)) {
    for (const [card, e] of Object.entries(cards)) (packed[deck] ??= {})[card] = `${packHalf(e.r)}.${packHalf(e.p)}`;
  }
  return {
    version: 3,
    themes: state.themes,
    records: packed,
    introduced: state.introduced,
    dailyNew: state.dailyNew,
    reports: state.reports,
    glossLang: state.glossLang,
  };
}

function isBox(v: unknown): v is LeitnerBox {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5;
}

function count(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null;
}

/** Format 1 (lot 1, 05/10) wrote whole `Card` objects in an array. */
function readRecordsV1(raw: unknown): { records: Card[]; dropped: number } {
  const records: Card[] = [];
  let dropped = 0;
  for (const r of Array.isArray(raw) ? raw : []) {
    if (!isObj(r) || typeof r.id !== 'string' || typeof r.courseId !== 'string' || !isBox(r.box)
      || count(r.reps) === null || count(r.lapses) === null) { dropped += 1; continue; }
    const dueAt = typeof r.dueAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.dueAt) ? r.dueAt : DAY_ZERO;
    records.push({ id: r.id, courseId: r.courseId, front: '', back: '', box: r.box, dueAt, reps: r.reps as number, lapses: r.lapses as number, lastSeenAt: null });
  }
  return { records, dropped };
}

function readRecordsV2(raw: unknown): { records: Card[]; dropped: number } {
  const records: Card[] = [];
  let dropped = 0;
  if (!isObj(raw)) return { records, dropped };
  for (const [deckId, byCard] of Object.entries(raw)) {
    if (!isObj(byCard)) { dropped += 1; continue; }
    for (const [id, p] of Object.entries(byCard)) {
      if (!Array.isArray(p) || !isBox(p[0]) || count(p[2]) === null || count(p[3]) === null) { dropped += 1; continue; }
      // An unreadable day comes back today rather than vanishing.
      const day = count(p[1]) ?? 0;
      records.push({ id: unpackId(id), courseId: deckId, front: '', back: '', box: p[0], dueAt: addDays(DAY_ZERO, day), reps: p[2] as number, lapses: p[3] as number, lastSeenAt: null });
    }
  }
  return { records, dropped };
}

function readRecordsV3(raw: unknown): { records: Card[]; dropped: number } {
  const records: Card[] = [];
  let dropped = 0;
  if (!isObj(raw)) return { records, dropped };
  for (const [deckId, byCard] of Object.entries(raw)) {
    if (!isObj(byCard)) { dropped += 1; continue; }
    for (const [cardId, packed] of Object.entries(byCard)) {
      // Strict: parseInt('zz!', 36) reads 'zz' and ignores the rest, which
      // would turn a corrupted day into a real one.
      const parts = typeof packed === 'string'
        ? packed.split('.').map((x) => (/^[0-9a-z]+$/.test(x) ? parseInt(x, 36) : NaN))
        : [];
      if (parts.length !== 8) { dropped += 1; continue; }
      (['recognise', 'produce'] as const).forEach((direction, i) => {
        const [box, day, reps, lapses] = parts.slice(i * 4, i * 4 + 4);
        if (box === 0) return; // no record for this direction
        if (!isBox(box) || count(reps) === null || count(lapses) === null) { dropped += 1; return; }
        // An unreadable day comes back today rather than vanishing.
        records.push({
          id: `${cardId}:${direction}`, courseId: deckId, front: '', back: '', box,
          dueAt: addDays(DAY_ZERO, count(day) ?? 0), reps: reps!, lapses: lapses!, lastSeenAt: null,
        });
      });
    }
  }
  return { records, dropped };
}

/**
 * Reads a saved blob. `null` (never saved) is a fresh start; anything that is
 * not a format 1, 2 or 3 state is `unreadable`. Inside a readable state a single
 * bad record is DROPPED and counted rather than failing the whole load.
 */
export function hydrate(raw: unknown): { state: LinguaState; outcome: LoadOutcome; droppedRecords: number } {
  if (raw === null || raw === undefined) return { state: emptyState(), outcome: 'fresh', droppedRecords: 0 };
  if (!isObj(raw) || (raw.version !== 1 && raw.version !== 2 && raw.version !== 3)) return { state: emptyState(), outcome: 'unreadable', droppedRecords: 0 };

  const reader = raw.version === 1 ? readRecordsV1 : raw.version === 2 ? readRecordsV2 : readRecordsV3;
  const { records, dropped } = reader(raw.records);

  const themes: Record<string, string[]> = {};
  if (isObj(raw.themes)) {
    for (const [deck, ids] of Object.entries(raw.themes)) {
      if (Array.isArray(ids)) themes[deck] = ids.filter((x): x is string => typeof x === 'string');
    }
  }

  const reports: CardReport[] = Array.isArray(raw.reports)
    ? raw.reports.filter((r): r is CardReport => isObj(r) && typeof r.cardId === 'string' && typeof r.deckId === 'string' && typeof r.at === 'string')
    : [];

  // Per deck since 05/10. The earlier single counter (`{day, count}`) did not
  // say which deck it counted, so it is dropped: at worst one more batch of
  // new cards on the day of the update.
  const introduced: LinguaState['introduced'] = {};
  if (isObj(raw.introduced) && !('day' in raw.introduced)) {
    for (const [deckId, v] of Object.entries(raw.introduced)) {
      if (isObj(v) && typeof v.day === 'string' && count(v.count) !== null) introduced[deckId] = { day: v.day, count: v.count as number };
    }
  }

  const dailyNew = typeof raw.dailyNew === 'number' && Number.isInteger(raw.dailyNew) && raw.dailyNew >= 1 && raw.dailyNew <= 100
    ? raw.dailyNew
    : DEFAULT_DAILY_NEW;

  const glossLang: GlossLang | null = raw.glossLang === 'en' || raw.glossLang === 'fr' || raw.glossLang === 'es' ? raw.glossLang : null;

  return { state: { version: 1, themes, records, introduced, dailyNew, reports, glossLang }, outcome: 'read', droppedRecords: dropped };
}

// ── The live store ──────────────────────────────────────────────────────────

let current: LinguaState = emptyState();
let writable = false;
let lastBytes = 0;
/** Records of the saved progress that could not be read, at the last load. */
let lastDropped = 0;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((fn) => fn());
}

/** The current progress, for `useSyncExternalStore`. */
export function getState(): LinguaState {
  return current;
}

/** Share of the host's budget the last save (or load) weighed, 0..1. */
/**
 * How many saved records could not be read at load. They are not in the state,
 * so the next save leaves them out for good: the screen must say so, a log
 * line is not enough (found by the cold check of 2026-10-07).
 */
export function droppedOnLoad(): number {
  return lastDropped;
}

export function budgetUsed(): number {
  return lastBytes / STATE_BUDGET;
}

/** Calls `fn` after every change; returns the unsubscribe. */
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Reads the durable blob once. A rejection propagates: the UI shows it and
 *  the store stays read-only. */
export async function load(): Promise<LoadOutcome> {
  const { state, outcome, droppedRecords } = hydrate(stateOf(await readState()));
  current = state;
  lastDropped = droppedRecords;
  writable = outcome !== 'unreadable';
  lastBytes = byteLength(serialise(state));
  log.info('store', `state ${outcome}`, { records: state.records.length, reports: state.reports.length, droppedRecords, bytes: lastBytes });
  if (outcome === 'unreadable') log.error('store', 'saved progress is unreadable — saving is disabled so it is not overwritten');
  emit();
  return outcome;
}

export interface SaveOutcome {
  ok: boolean;
  error?: string;
}

/**
 * Applies a change and persists it. The screen updates at once; the write's
 * outcome is returned so a failure can be shown. A state that would not fit is
 * NOT applied: refusing the answer is better than the host refusing every
 * answer after it.
 */
export async function mutate(fn: (s: LinguaState) => LinguaState): Promise<SaveOutcome> {
  if (!writable) {
    log.warn('store', 'a write was refused: progress was not read, or is unreadable');
    return { ok: false, error: 'NOT_LOADED' };
  }
  const next = fn(current);
  const payload = serialise(next);
  const bytes = byteLength(payload);
  if (bytes + ENVELOPE_MARGIN > STATE_BUDGET) {
    log.error('store', 'over the host budget — change refused', { bytes, budget: STATE_BUDGET });
    return { ok: false, error: 'STATE_TOO_LARGE' };
  }
  current = next;
  lastBytes = bytes;
  emit();
  try {
    await writeState(payload);
    return { ok: true };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    log.error('store', 'the host refused the write', { detail, bytes });
    return { ok: false, error: detail };
  }
}

/** Test seam — start from a known state without a host. */
export function __setStateForTests(state: LinguaState, isWritable = true): void {
  lastDropped = 0;
  current = state;
  writable = isWritable;
  lastBytes = byteLength(serialise(state));
  emit();
}
