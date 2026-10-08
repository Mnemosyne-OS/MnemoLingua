/**
 * kanjiPack.ts — a kanji deck built from KANJIDIC2, which the LEARNER
 * downloads (doc 138 §15). Nothing of it is shipped: the deck file only says
 * which level to take, and the cards are made from the download.
 *
 * KANJIDIC2 (EDRDG, CC BY-SA 4.0) gives, per kanji, the meanings in English,
 * French and Spanish, the readings, the school grade and the JLPT level. Its
 * JLPT field is the OLD four-level test: level 4 is the list the N5 grew from,
 * and the screen says so instead of calling it the official N5 list (there has
 * been none since 2010).
 *
 * 🪤 Served with CORS only over plain HTTP (the HTTPS endpoint sends no
 * Access-Control header, measured 2026-10-07), and the file changes every day,
 * so it cannot be pinned by a hash: what arrives is checked for its SHAPE
 * (enough kanji of the level, each with a meaning) before it becomes a deck.
 */
import type { Deck, DeckCard, DeckPack, GlossLang } from './types';

export const KANJIDIC2 = {
  name: 'KANJIDIC2',
  author: 'EDRDG',
  url: 'http://www.edrdg.org/kanjidic/kanjidic2.xml.gz',
  home: 'https://www.edrdg.org/wiki/index.php/KANJIDIC_Project',
  licence: 'CC BY-SA 4.0',
  licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  /** Measured on 2026-10-07 (Content-Length). */
  sizeKb: 1454,
} as const;

/** How long the dictionary may take to arrive. */
export const PACK_TIMEOUT_MS = 60_000;

/** Below this many kanji at a level, the file is not what it should be. */
const MIN_KANJI = 40;

export interface KanjiEntry {
  char: string;
  grade: number | null;
  on: string[];
  kun: string[];
  meanings: Partial<Record<GlossLang, string[]>>;
}

const LANGS: GlossLang[] = ['en', 'fr', 'es'];

function decode(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

/**
 * The kanji of one old JLPT level. A regex over each <character> block, not a
 * DOM: the file is ~15 MB of XML and only a few dozen entries are wanted.
 */
export function parseKanjidic(xml: string, jlpt: number): KanjiEntry[] {
  const out: KanjiEntry[] = [];
  for (const block of xml.split('<character>').slice(1)) {
    if (!new RegExp(`<jlpt>${jlpt}</jlpt>`).test(block)) continue;
    const char = /<literal>([^<]+)<\/literal>/.exec(block)?.[1];
    if (!char) continue;
    const grade = Number(/<grade>(\d+)<\/grade>/.exec(block)?.[1] ?? NaN);
    const on = [...block.matchAll(/<reading r_type="ja_on">([^<]+)<\/reading>/g)].map((m) => m[1]!);
    const kun = [...block.matchAll(/<reading r_type="ja_kun">([^<]+)<\/reading>/g)].map((m) => m[1]!);
    const meanings: Partial<Record<GlossLang, string[]>> = {};
    for (const m of block.matchAll(/<meaning(?: m_lang="([a-z]+)")?>([^<]+)<\/meaning>/g)) {
      const lang = (m[1] ?? 'en') as GlossLang;
      if (!LANGS.includes(lang)) continue;
      (meanings[lang] ??= []).push(decode(m[2]!));
    }
    out.push({ char, grade: Number.isFinite(grade) ? grade : null, on, kun, meanings });
  }
  return out;
}

/** The themes a pack deck is cut into: the school year a kanji is taught. */
export function packTheme(grade: number | null): string {
  return grade === 1 ? 'grade1' : grade === 2 ? 'grade2' : 'grade3plus';
}

/**
 * The deck, made from the entries. Card ids are `kanji-<char>`, so progress
 * survives a new download. A meaning missing in a language stays missing (the
 * card is counted as « no translation yet »), never filled from English.
 */
export function buildPackDeck(base: Deck, pack: DeckPack, entries: readonly KanjiEntry[]): Deck {
  const themes = new Map<string, DeckCard[]>();
  for (const e of entries) {
    const gloss: Partial<Record<GlossLang, string>> = {};
    for (const l of LANGS) {
      const m = e.meanings[l];
      if (m && m.length > 0) gloss[l] = m.slice(0, 3).join(', ');
    }
    const card: DeckCard = {
      id: `kanji-${e.char}`, kind: 'glyph', target: e.char, pos: 'kanji', gloss, check: 'reference',
      readings: { on: e.on, kun: e.kun },
    };
    const th = packTheme(e.grade);
    themes.set(th, [...(themes.get(th) ?? []), card]);
  }
  const order = ['grade1', 'grade2', 'grade3plus'];
  return {
    ...base,
    pack,
    themes: order.filter((id) => themes.has(id)).map((id) => ({ id, cards: themes.get(id)! })),
  };
}

/** Checks that a parsed level is a real one before it becomes a deck. */
export function packProblem(entries: readonly KanjiEntry[]): string | null {
  if (entries.length < MIN_KANJI) return `ONLY_${entries.length}_KANJI`;
  const noMeaning = entries.filter((e) => !e.meanings.en?.length).length;
  if (noMeaning > entries.length / 10) return `NO_MEANING_${noMeaning}`;
  return null;
}

/** Downloads and unzips the dictionary. Rejects with a named reason. */
export async function downloadKanjidic(opts: { signal?: AbortSignal; fetchImpl?: typeof fetch; timeoutMs?: number } = {}): Promise<string> {
  const deadline = AbortSignal.timeout(opts.timeoutMs ?? PACK_TIMEOUT_MS);
  const signal = opts.signal ? AbortSignal.any([opts.signal, deadline]) : deadline;
  const res = await (opts.fetchImpl ?? fetch)(KANJIDIC2.url, { signal });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const stream = res.body.pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}
