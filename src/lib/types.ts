/**
 * types.ts — the shapes MnemoLingua reads (decks) and writes (progress).
 *
 * Two halves that must never be confused:
 *  - a DECK is shipped inside the cartridge, read-only, one JSON per language
 *    learned (doc 138 §3.5). Its card ids are a contract: progress points at
 *    them, so a new deck version that renames an id erases that card's history.
 *  - the PROGRESS is what the learner did. It lives in the host's durable state
 *    (doc 73), keyed on this cartridge's name.
 */

// ── Decks ───────────────────────────────────────────────────────────────────

/** Languages a gloss (the translation shown to the learner) can be written in. */
export type GlossLang = 'en' | 'fr' | 'es';

/**
 * How a card was checked before it shipped (doc 138 §3.4b). Earned, never
 * written by hand: `to-review` means a pass disagreed, and such a card is
 * never shown.
 */
export type CheckState = 'computed' | 'reference' | 'cross-checked' | 'two-pass' | 'to-review';

export const CHECK_STATES: readonly CheckState[] = ['computed', 'reference', 'cross-checked', 'two-pass', 'to-review'];

/** Words and phrases. A `glyph` is one written character (あ) whose strokes
 *  are drawn, not read from a font: its target IS the character, its gloss the
 *  reading. A `form` card (go → went / gone) is not built yet. */
export type CardKind = 'word' | 'phrase' | 'glyph';

/** A sentence that fixes WHICH sense of a word the card teaches. A bare
 *  "about" or "answer" cannot be learned; "about" in "a book about cats" can. */
export interface CardExample {
  target: string;
  gloss: Partial<Record<GlossLang, string>>;
}

export interface DeckCard {
  id: string;
  kind: CardKind;
  /** In the language being learned. */
  target: string;
  /** In the learner's language. A missing gloss is COUNTED, never replaced. */
  gloss: Partial<Record<GlossLang, string>>;
  check: CheckState;
  /** Part of speech, as the source word list gives it. */
  pos?: string;
  /** Other accepted spellings (aeroplane for airplane). Shown, never asked. */
  variants?: string[];
  example?: CardExample;
  /** A kanji's readings, as KANJIDIC2 writes them: on'yomi in katakana,
   *  kun'yomi in hiragana with a dot before the okurigana. */
  readings?: { on: string[]; kun: string[] };
}

/** Where a deck's word list comes from. Shown under the deck: citing it is
 *  the condition of use of the CEFR-J list. */
export interface DeckSource {
  name: string;
  url: string;
  terms: string;
}

export interface DeckTheme {
  id: string;
  cards: DeckCard[];
}

/** Which dataset a pack deck is made from, and which part of it. */
export interface DeckPack {
  source: 'kanjidic2';
  /** The OLD four-level JLPT level (4 = the list N5 grew from). */
  jlpt: number;
}

export interface Deck {
  id: string;
  /** The language being learned. */
  lang: string;
  version: number;
  /** Null until a native speaker has read the deck. Never filled by a pass. */
  reviewedBy: string | null;
  reviewedAt: string | null;
  /** The day the automatic passes last ran over this file. */
  checkedAt: string;
  /** CEFR level (A1…C2) when the deck is a level. Absent for a topic deck. */
  level?: string;
  source?: DeckSource;
  /** Present on a deck whose cards come from a dataset the LEARNER downloads
   *  (doc 138 §15). Its file then has no themes: they are built from the data. */
  pack?: DeckPack;
  themes: DeckTheme[];
}

// ── Progress ────────────────────────────────────────────────────────────────

/** Recognise: see the English, say what it means. Produce: see your language,
 *  say it in English. Each direction keeps its own box (doc 138 §3.3). */
export type Direction = 'recognise' | 'produce';

export const DIRECTIONS: readonly Direction[] = ['recognise', 'produce'];

export type LeitnerBox = 1 | 2 | 3 | 4 | 5;

/**
 * One scheduling record. Same shape as Melete's `Card`, so `schedule.ts` is
 * copied without a change: `id` is `<deckCardId>:<direction>` and `courseId`
 * holds the deck id. `front`/`back` are left empty on purpose — the text is
 * always read from the deck, so a corrected deck corrects every record.
 */
export interface Card {
  id: string;
  courseId: string;
  front: string;
  back: string;
  quote?: string;
  box: LeitnerBox;
  /** Local day key the record comes back. */
  dueAt: string;
  reps: number;
  lapses: number;
  lastSeenAt: string | null;
}

/** "This card is wrong", pressed by the learner. The card leaves review until
 *  the report is withdrawn. */
export interface CardReport {
  cardId: string;
  deckId: string;
  at: string;
}

export interface LinguaState {
  version: 1;
  /** Themes the learner ticked, per deck. Absent deck = every theme. */
  themes: Record<string, string[]>;
  records: Card[];
  /** New cards introduced on `day`, PER DECK: ten new travel phrases must
   *  not leave the A1 deck at "0 new" with no reason given. */
  introduced: Record<string, { day: string; count: number }>;
  /** New cards a day. 10 by default (doc 138 §6). */
  dailyNew: number;
  reports: CardReport[];
  /**
   * The language the learner wants translations in. Null until chosen.
   * 🚨 NOT the app's language: someone learning English may run the app in
   * English, and a deck of English has no English translations.
   */
  glossLang: GlossLang | null;
}

export const DEFAULT_DAILY_NEW = 10;

export function emptyState(): LinguaState {
  return {
    version: 1,
    themes: {},
    records: [],
    introduced: {},
    dailyNew: DEFAULT_DAILY_NEW,
    reports: [],
    glossLang: null,
  };
}
