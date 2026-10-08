/**
 * packs.ts — the one place that knows every kind of pack deck (doc 138 §15,
 * §16). The download hook asks it four things and never looks at a source.
 */
import { buildHskDeck, downloadHsk, hskProblem, type HskWord } from './hskPack';
import { buildPackDeck, downloadKanjidic, packProblem, parseKanjidic, type KanjiEntry } from './kanjiPack';
import type { Deck, DeckPack } from './types';

/** The cache key of a pack's downloaded data. `kanjidic2@jlpt4` is the key
 *  the first release wrote; it is unchanged. */
export function packKey(pack: DeckPack): string {
  return pack.source === 'kanjidic2' ? `kanjidic2@jlpt${pack.jlpt}` : `hsk-${pack.list}@${pack.level}`;
}

/** Downloads and reads a pack's data. Rejects with a named reason. */
export async function fetchPack(pack: DeckPack, signal: AbortSignal): Promise<unknown[]> {
  if (pack.source === 'kanjidic2') return parseKanjidic(await downloadKanjidic({ signal }), pack.jlpt);
  return downloadHsk(pack, { signal });
}

/** Why the data is not a real level, or null. */
export function packDataProblem(pack: DeckPack, entries: readonly unknown[]): string | null {
  return pack.source === 'kanjidic2' ? packProblem(entries as KanjiEntry[]) : hskProblem(entries as HskWord[]);
}

/** The deck, made from the data. */
export function buildFromPack(base: Deck, pack: DeckPack, entries: readonly unknown[]): Deck {
  return pack.source === 'kanjidic2'
    ? buildPackDeck(base, pack, entries as KanjiEntry[])
    : buildHskDeck(base, pack, entries as HskWord[]);
}
