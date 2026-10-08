/**
 * deck.ts — reading a shipped deck, and deciding which of its cards a learner
 * may see.
 *
 * Three rules, each one a way a language deck lies if it is missing:
 *  1. A card a verification pass disagreed with (`to-review`) is never shown.
 *     A wrong travel phrase gets said to a stranger (doc 138 §3.4).
 *  2. A card with no gloss in the learner's language is never shown with
 *     another language's gloss instead. It is COUNTED, so the deck can say how
 *     many cards it does not have for you.
 *  3. A card the learner reported as wrong leaves review until the report is
 *     withdrawn.
 */
import { CHECK_STATES, type CardExample, type CheckState, type Deck, type DeckCard, type DeckSource, type DeckTheme, type GlossLang, type DeckPack } from './types';

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const GLOSS_LANGS: readonly GlossLang[] = ['en', 'fr', 'es'];

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function nonEmpty(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function readGloss(raw: Record<string, unknown>, where: string, problems: string[]): Partial<Record<GlossLang, string>> {
  const gloss: Partial<Record<GlossLang, string>> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!GLOSS_LANGS.includes(k as GlossLang)) { problems.push(`${where}: unknown gloss language ${k}`); continue; }
    if (!nonEmpty(v)) { problems.push(`${where}: empty gloss ${k}`); continue; }
    gloss[k as GlossLang] = v;
  }
  return gloss;
}

function readPack(raw: unknown, problems: string[]): DeckPack | undefined {
  if (raw === undefined) return undefined;
  if (isObj(raw) && raw.source === 'kanjidic2' && typeof raw.jlpt === 'number' && Number.isInteger(raw.jlpt) && raw.jlpt >= 1 && raw.jlpt <= 4) {
    return { source: 'kanjidic2', jlpt: raw.jlpt };
  }
  problems.push('bad pack');
  return undefined;
}

function readSource(raw: unknown, problems: string[]): DeckSource | undefined {
  if (raw === undefined) return undefined;
  if (isObj(raw) && nonEmpty(raw.name) && nonEmpty(raw.url) && nonEmpty(raw.terms)) {
    return { name: raw.name, url: raw.url, terms: raw.terms };
  }
  problems.push('bad source');
  return undefined;
}

/**
 * Validates a deck file. Returns the deck and every problem found; a deck with
 * ANY problem is refused whole (`deck: null`), because a half-read deck would
 * show some themes and silently drop others.
 *
 * The drift test runs this over every shipped deck, so a broken file fails the
 * suite instead of reaching a learner.
 */
export function parseDeck(raw: unknown): { deck: Deck | null; problems: string[] } {
  const problems: string[] = [];
  if (!isObj(raw)) return { deck: null, problems: ['not an object'] };

  if (!nonEmpty(raw.id)) problems.push('missing id');
  if (!nonEmpty(raw.lang)) problems.push('missing lang');
  if (typeof raw.version !== 'number' || !Number.isInteger(raw.version) || raw.version < 1) problems.push('bad version');
  if (!nonEmpty(raw.checkedAt)) problems.push('missing checkedAt');
  const reviewedBy = raw.reviewedBy ?? null;
  const reviewedAt = raw.reviewedAt ?? null;
  if (reviewedBy !== null && !nonEmpty(reviewedBy)) problems.push('bad reviewedBy');
  if (reviewedAt !== null && !nonEmpty(reviewedAt)) problems.push('bad reviewedAt');
  const pack = readPack(raw.pack, problems);
  // A pack deck ships no cards: they come from the learner's download.
  if (!Array.isArray(raw.themes) || (raw.themes.length === 0 && !pack)) problems.push('no themes');
  if (raw.level !== undefined && !LEVELS.includes(raw.level as string)) problems.push('bad level');
  const source = readSource(raw.source, problems);

  const seenThemes = new Set<string>();
  const seenCards = new Set<string>();
  const themes: DeckTheme[] = [];

  for (const [ti, t] of (Array.isArray(raw.themes) ? raw.themes : []).entries()) {
    if (!isObj(t) || !nonEmpty(t.id)) { problems.push(`theme #${ti}: missing id`); continue; }
    if (seenThemes.has(t.id)) problems.push(`theme ${t.id}: duplicate id`);
    seenThemes.add(t.id);
    if (!Array.isArray(t.cards) || t.cards.length === 0) { problems.push(`theme ${t.id}: no cards`); continue; }

    const cards: DeckCard[] = [];
    for (const [ci, c] of t.cards.entries()) {
      const where = `theme ${t.id} card #${ci}`;
      if (!isObj(c) || !nonEmpty(c.id)) { problems.push(`${where}: missing id`); continue; }
      if (seenCards.has(c.id)) problems.push(`card ${c.id}: duplicate id`);
      seenCards.add(c.id);
      if (c.kind !== 'word' && c.kind !== 'phrase' && c.kind !== 'glyph') problems.push(`card ${c.id}: bad kind`);
      if (!nonEmpty(c.target)) problems.push(`card ${c.id}: missing target`);
      if (!CHECK_STATES.includes(c.check as CheckState)) problems.push(`card ${c.id}: bad check state`);
      if (!isObj(c.gloss)) { problems.push(`card ${c.id}: missing gloss`); continue; }

      const gloss = readGloss(c.gloss, `card ${c.id}`, problems);
      const card: DeckCard = { id: c.id, kind: c.kind as DeckCard['kind'], target: String(c.target), gloss, check: c.check as CheckState };
      if (c.pos !== undefined) {
        if (nonEmpty(c.pos)) card.pos = c.pos; else problems.push(`card ${c.id}: bad pos`);
      }
      if (c.variants !== undefined) {
        if (Array.isArray(c.variants) && c.variants.every(nonEmpty)) card.variants = c.variants;
        else problems.push(`card ${c.id}: bad variants`);
      }
      if (c.example !== undefined) {
        if (isObj(c.example) && nonEmpty(c.example.target) && isObj(c.example.gloss)) {
          const example: CardExample = { target: c.example.target, gloss: readGloss(c.example.gloss, `card ${c.id} example`, problems) };
          card.example = example;
        } else problems.push(`card ${c.id}: bad example`);
      }
      cards.push(card);
    }
    themes.push({ id: t.id, cards });
  }

  if (problems.length > 0) return { deck: null, problems };
  return {
    deck: {
      id: String(raw.id),
      lang: String(raw.lang),
      version: raw.version as number,
      reviewedBy: reviewedBy as string | null,
      reviewedAt: reviewedAt as string | null,
      checkedAt: String(raw.checkedAt),
      ...(typeof raw.level === 'string' ? { level: raw.level } : {}),
      ...(source ? { source } : {}),
      ...(pack ? { pack } : {}),
      themes,
    },
    problems,
  };
}

export interface DeckView {
  /** Cards the learner may study, in deck order, within the ticked themes. */
  playable: DeckCard[];
  /** Withheld because a verification pass disagreed. */
  withheld: number;
  /** Withheld because there is no gloss in the learner's language. */
  noGloss: number;
  /** Withheld because the learner reported them. */
  reported: number;
  /** Playable word cards whose translation is the same word (jeans = le jean):
   *  asking what they mean is no question, so only « say it » is asked. */
  transparent?: ReadonlySet<string>;
}

/** Articles a gloss starts with, dropped before comparing it to the word. */
const ARTICLES = /^(?:l'|le |la |les |un |une |des |el |los |las |unos |unas |to )/;

function bare(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)/g, '').trim().replace(ARTICLES, '').replace(/[^a-z]/g, '');
}

/** One edit at most (insert, delete, substitute) between two strings. */
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/**
 * A word you understand without having learned it: one of its translations is
 * the same word, accents and article aside, give or take one letter on words of
 * five letters or more (musician = le musicien, jeans = le jean). Asked on
 * 2026-10-07: those recognise questions were too easy to teach anything.
 * Phrases are never transparent: a sentence is not a cognate.
 */
export function isTransparent(card: DeckCard, lang: GlossLang): boolean {
  if (card.kind !== 'word') return false;
  const gloss = card.gloss[lang];
  if (!gloss) return false;
  const word = bare(card.target);
  if (!word) return false;
  return gloss.split(/[,;/]/).map(bare).some((g) => g !== '' && (g === word || (word.length >= 5 && withinOneEdit(g, word)) || g + 's' === word || word + 's' === g));
}

/**
 * The cards a learner can study now.
 *
 * `themes` undefined means "every theme" (nothing ticked yet is the first-run
 * state, and an empty first screen would read as an empty deck). An EMPTY array
 * means the learner unticked everything, and is honoured.
 */
export function viewDeck(
  deck: Deck,
  lang: GlossLang,
  opts: { themes?: string[] | undefined; reportedIds?: ReadonlySet<string> } = {},
): DeckView {
  const view: DeckView = { playable: [], withheld: 0, noGloss: 0, reported: 0 };
  const transparent = new Set<string>();
  const ticked = opts.themes ? new Set(opts.themes) : null;
  for (const theme of deck.themes) {
    if (ticked && !ticked.has(theme.id)) continue;
    for (const card of theme.cards) {
      if (card.check === 'to-review') { view.withheld += 1; continue; }
      if (!card.gloss[lang]) { view.noGloss += 1; continue; }
      if (opts.reportedIds?.has(card.id)) { view.reported += 1; continue; }
      view.playable.push(card);
      if (isTransparent(card, lang)) transparent.add(card.id);
    }
  }
  view.transparent = transparent;
  return view;
}

/** Every card of a deck by id, for resolving a progress record back to text. */
export function indexDeck(deck: Deck): Map<string, DeckCard> {
  const map = new Map<string, DeckCard>();
  for (const t of deck.themes) for (const c of t.cards) map.set(c.id, c);
  return map;
}

/** Languages this deck carries translations in, never the language it teaches. */
export function glossLangs(deck: Deck): GlossLang[] {
  const present = new Set<GlossLang>();
  for (const t of deck.themes) for (const c of t.cards) for (const k of Object.keys(c.gloss)) present.add(k as GlossLang);
  return GLOSS_LANGS.filter((l) => present.has(l) && l !== deck.lang);
}

/**
 * The translation language to use: the learner's choice when the deck has it,
 * else the app's language when the deck has it, else null and the screen ASKS.
 * It never picks a language on the learner's behalf when the app's own one is
 * not available: guessing French for a Spanish speaker is worse than a question.
 */
export function resolveGlossLang(deck: Deck, chosen: GlossLang | null, uiLang: GlossLang): GlossLang | null {
  const available = glossLangs(deck);
  if (chosen && available.includes(chosen)) return chosen;
  if (available.includes(uiLang)) return uiLang;
  return null;
}

/** A part of speech as a locale key ("modal auxiliary" → "modal_auxiliary"). */
export function posKey(pos: string): string {
  return pos.toLowerCase().replace(/[^a-z]+/g, '_');
}

/** The blank that replaces the word in a masked example. */
const BLANK = '___';

/**
 * The spellings a word may take in its own example: the word, its variants,
 * and the regular endings (plays, played, playing, bigger, cities, stopped).
 * Irregular forms (lost, went) are not guessed: such an example is not masked.
 */
function surfaceForms(word: string, pos?: string): string[] {
  const w = word.toLowerCase();
  const out = new Set([w]);
  // -er/-est are comparatives: on a verb or a noun they make ANOTHER word
  // (print → printer, A2 « Can you print … on your printer? » got two blanks).
  const ends = pos === 'adjective' || pos === 'adverb'
    ? ['s', 'es', 'ed', 'd', 'ing', 'er', 'est', 'ly']
    : ['s', 'es', 'ed', 'd', 'ing', 'ly'];
  for (const end of ends) out.add(w + end);
  if (w.endsWith('e')) { out.add(`${w.slice(0, -1)}ing`); out.add(`${w.slice(0, -1)}ed`); }
  if (w.endsWith('y')) { out.add(`${w.slice(0, -1)}ies`); out.add(`${w.slice(0, -1)}ied`); }
  const last = w.slice(-1);
  if (/[bdgmnprt]/.test(last)) {
    out.add(`${w}${last}ing`); out.add(`${w}${last}ed`);
    if (ends.includes('er')) { out.add(`${w}${last}er`); out.add(`${w}${last}est`); }
  }
  return [...out];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The example with the card's word blanked out, or null when the word cannot
 * be found in it.
 *
 * Used on the front of a PRODUCE card (Tony, 2026-10-06): « un, une » alone
 * asks for a, an or one; « I have ___ dog. » asks for one of them. 🎭 null is
 * not a failure: the card then shows its translated example instead, and an
 * irregular form is never blanked by a guess that could blank the wrong word.
 */
export function maskExample(card: DeckCard): string | null {
  if (!card.example) return null;
  const words = [card.target, ...(card.variants ?? [])].flatMap((w) => surfaceForms(w, card.pos));
  // Longest first, so "playing" is blanked whole instead of "play" + "ing".
  // A contraction ('m, 're, 's) is glued to the word before it, so it takes
  // no left boundary; every other form must start a word.
  const alternatives = [...new Set(words)]
    .sort((a, b) => b.length - a.length)
    .map((w) => (w.startsWith("'") ? escapeRegExp(w) : `(?<![A-Za-z])${escapeRegExp(w)}`));
  // « n't » belongs to the word before it: « can't » is not « can » + « 't »
  // (A1 « I ___ swim, but I ___'t ski. »). « victim's » still blanks « victim ».
  const re = new RegExp(`(?:${alternatives.join('|')})(?![A-Za-z]|'t(?![A-Za-z]))`, 'gi');
  const masked = card.example.target.replace(re, BLANK);
  return masked === card.example.target ? null : masked;
}
