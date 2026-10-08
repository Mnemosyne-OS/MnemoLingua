/**
 * decks/index.ts — every deck shipped in the cartridge, loaded on demand.
 *
 * Adding a deck is adding a JSON file under `decks/<lang>/<name>.json`: no
 * code. The FILE NAME is the contract the tabs are drawn from before any deck
 * is loaded: `<lang>-<name>` is the deck id and a CEFR name (`a1`…`c2`) is its
 * level. A loaded deck whose id disagrees with its file is refused, named.
 *
 * On demand because the levels are big: A1 + A2 + B1 in the bundle would be
 * ~1.8 MB parsed at every open for a learner who studies one of them.
 *
 * Order: levels first (A1, A2, …), then topic decks by name.
 */
import { parseDeck } from '../lib/deck';
import { log } from '../lib/log';
import type { Deck } from '../lib/types';

export interface DeckMeta {
  file: string;
  id: string;
  lang: string;
  name: string;
  /** "A1"…"C2" when the file is a level. */
  level?: string;
}

export type LoadedDeck = { deck: Deck; problems: string[] } | { deck: null; problems: string[] };

const loaders = import.meta.glob<unknown>('./*/*.json', { import: 'default' });

function metaOf(file: string): DeckMeta | null {
  // Two or three letters: ISO 639-1 (en, ja, la) or 639-3 for a language that
  // has no two-letter code (grc Ancient Greek, egy Egyptian).
  const m = /^\.\/([a-z]{2,3})\/([a-z0-9-]+)\.json$/.exec(file);
  if (!m) {
    log.error('deck', 'a deck file name does not follow <lang>/<name>.json', { file });
    return null;
  }
  const [, lang, name] = m as unknown as [string, string, string];
  return { file, id: `${lang}-${name}`, lang, name, ...(/^[abc][12]$/.test(name) ? { level: name.toUpperCase() } : {}) };
}

function order(a: DeckMeta, b: DeckMeta): number {
  const la = a.level ?? '~';
  const lb = b.level ?? '~';
  if (la !== lb) return la < lb ? -1 : 1;
  return a.name < b.name ? -1 : 1;
}

export const DECK_METAS: DeckMeta[] = Object.keys(loaders)
  .map(metaOf)
  .filter((m): m is DeckMeta => m !== null)
  .sort(order);

/** How long a deck may take to arrive before the screen says it did not. */
export const DECK_LOAD_TIMEOUT_MS = 15_000;

/** Loads and validates one deck. Never rejects, never hangs: a failure or a
 *  deck that does not arrive in time is a named problem. */
export async function loadDeck(
  meta: DeckMeta,
  timeoutMs = DECK_LOAD_TIMEOUT_MS,
  /** Test seam: replaces the bundler's loader for this file. */
  loaderOverride?: () => Promise<unknown>,
): Promise<LoadedDeck> {
  const loader = loaderOverride ?? loaders[meta.file];
  if (!loader) return { deck: null, problems: [`no file ${meta.file}`] };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`DECK_TIMEOUT after ${timeoutMs} ms`)), timeoutMs);
    });
    const { deck, problems } = parseDeck(await Promise.race([loader(), timeout]));
    if (deck && deck.id !== meta.id) return { deck: null, problems: [`id ${deck.id} does not match ${meta.file}`] };
    if (!deck) log.error('deck', 'a shipped deck failed validation', { file: meta.file, problems });
    return deck ? { deck, problems } : { deck: null, problems };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    log.error('deck', 'a deck could not be loaded', { file: meta.file, detail });
    return { deck: null, problems: [detail] };
  } finally {
    clearTimeout(timer);
  }
}
