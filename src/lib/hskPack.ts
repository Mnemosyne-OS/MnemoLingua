/**
 * hskPack.ts — a Chinese deck built from an HSK word list the LEARNER
 * downloads (doc 138 §16), the same way the kanji deck is built from
 * KANJIDIC2. Nothing of it is shipped.
 *
 * The list is complete-hsk-vocabulary (MIT), pinned to a commit, whose
 * meanings come from CC-CEDICT (CC BY-SA). Its words carry the simplified
 * form, the pinyin and the English meanings. No open source reachable from
 * the cartridge gives French or Spanish meanings (CFDICT has no CORS copy), and
 * CC-CEDICT's first sense is often not the one HSK 1 teaches (本 « root », 块
 * « lump »). So the deck file ships a table WE wrote, one line per word in
 * three languages (doc 138 §18), and the screen says it is not reviewed yet.
 *
 * A card is a WORD (爸爸, 你好), so writing it is writing each of its
 * characters in turn; the strokes are downloaded per character.
 */
import type { Deck, DeckCard, HskPack } from './types';

export const HSK_LIST = {
  name: 'complete-hsk-vocabulary',
  author: 'drkameleon',
  meaningsFrom: 'CC-CEDICT',
  commit: '7ac65bf1a6387d35f1ade478906172a19311c7f9',
  licence: 'MIT',
  meaningsLicence: 'CC BY-SA 4.0',
  home: 'https://github.com/drkameleon/complete-hsk-vocabulary',
  /** Measured on 2026-10-07 (Content-Length of the old level 1 list). */
  sizeKb: 149,
} as const;

/** The list of one level, pinned to the commit. */
export function hskUrl(pack: HskPack): string {
  return `https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/${HSK_LIST.commit}/wordlists/exclusive/${pack.list}/${pack.level}.json`;
}

export const HSK_TIMEOUT_MS = 30_000;

/** Below this, the file is not a level. */
const MIN_WORDS = 50;

export interface HskWord {
  word: string;
  pinyin: string;
  meanings: string[];
  /** The list's part-of-speech codes (n, v, …), for the themes. */
  pos: string[];
}

interface HskForm { pinyin: string; meanings: string[] }

const RARE = /^(surname|variant of|old variant|used in|abbr\.|see |\(archaic\)|archaic|\(old\))/i;
const OLD = /\((old|archaic|literary|classical)\)/i;
const GRAMMAR = /particle|marker|\(negative|classifier|\(pronoun\)|interrogative/i;

/**
 * Hand choices where the rules below pick the wrong reading of an HSK 1 word,
 * found by reading all 150 on 2026-10-07. They only CHOOSE among the list's
 * own forms and meanings: no meaning is written here.
 */
const PREFERRED: Record<string, { pinyin?: string; meaning?: number }> = {
  哪: { pinyin: 'nǎ' },
  回: { meaning: 1 },
  钱: { meaning: 1 },
};

/**
 * The form a beginner is learning. The list puts rare readings first (都 as
 * « surname Du », 读 as « comma », 东西 as « east and west »), so: a proper
 * noun (capital pinyin) or a « variant / surname / used in » sense loses, a
 * sense marked old loses, a grammar word wins (了 le, 吗 ma, 没 méi), then the
 * form with the most senses, then the list's order.
 */
export function chooseForm(word: string, forms: readonly HskForm[]): { pinyin: string; meaning: string } | null {
  if (forms.length === 0) return null;
  const pref = PREFERRED[word];
  const score = (f: HskForm): number =>
    (/^[A-Z]/.test(f.pinyin) ? 10 : 0) + (RARE.test(f.meanings[0] ?? '') ? 5 : 0)
    + (f.meanings.slice(0, 3).some((m) => OLD.test(m)) ? 3 : 0) - (GRAMMAR.test(f.meanings[0] ?? '') ? 3 : 0);
  const ranked = forms
    .map((f, i) => ({ f, i }))
    .sort((x, y) => score(x.f) - score(y.f) || y.f.meanings.length - x.f.meanings.length || x.i - y.i);
  const chosen = (pref?.pinyin ? ranked.find((r) => r.f.pinyin === pref.pinyin) : undefined) ?? ranked[0]!;
  const meaning = chosen.f.meanings[pref?.meaning ?? 0] ?? chosen.f.meanings[0]!;
  return { pinyin: chosen.f.pinyin, meaning };
}

/** The words of one level file. A word without a form or a meaning is left out. */
export function parseHsk(raw: unknown): HskWord[] {
  if (!Array.isArray(raw)) return [];
  const out: HskWord[] = [];
  for (const w of raw) {
    if (typeof w !== 'object' || w === null) continue;
    const word = (w as { simplified?: unknown }).simplified;
    const rawForms = (w as { forms?: unknown }).forms;
    const forms: HskForm[] = [];
    for (const f of Array.isArray(rawForms) ? rawForms : []) {
      const form = f as { transcriptions?: { pinyin?: unknown }; meanings?: unknown } | null;
      const pinyin = form?.transcriptions?.pinyin;
      const meanings = Array.isArray(form?.meanings) ? form.meanings.filter((m): m is string => typeof m === 'string') : [];
      if (typeof pinyin === 'string' && meanings.length > 0) forms.push({ pinyin, meanings });
    }
    const chosen = typeof word === 'string' && word ? chooseForm(word, forms) : null;
    if (typeof word !== 'string' || !chosen) continue;
    const pos = Array.isArray((w as { pos?: unknown }).pos) ? ((w as { pos: unknown[] }).pos.filter((p): p is string => typeof p === 'string')) : [];
    out.push({ word, pinyin: chosen.pinyin, meanings: [chosen.meaning], pos });
  }
  return out;
}

/** The theme of a word: what it mostly is (a noun, a verb, the rest). */
export function hskTheme(pos: readonly string[]): string {
  const first = pos[0] ?? '';
  return first.startsWith('n') ? 'hsk-nouns' : first.startsWith('v') ? 'hsk-verbs' : 'hsk-other';
}

/**
 * A short gloss: the first meaning, cut at its first two senses. CC-CEDICT's
 * measure words (`CL:個|个[ge4]`) and pinyin in brackets (`[wei4]`) are
 * dictionary notation, not a meaning a learner should read.
 */
export function shortGloss(meanings: readonly string[]): string {
  const senses = meanings[0]!.split(';')
    .map((s) => s.replace(/\S*\[[a-z]+\d?(?: [a-z]+\d?)*\]/gi, '').trim())
    .filter((s) => s && !/^CL:/.test(s));
  return senses.slice(0, 2).join('; ') || meanings[0]!;
}

export function buildHskDeck(base: Deck, pack: HskPack, words: readonly HskWord[]): Deck {
  const themes = new Map<string, DeckCard[]>();
  for (const w of words) {
    // Our table first (the sense HSK 1 teaches, in three languages); the
    // list's CC-CEDICT meaning only as the English of a word it lacks.
    const card: DeckCard = {
      id: `hsk-${w.word}`, kind: 'glyph', target: w.word,
      gloss: { en: shortGloss(w.meanings), ...pack.glosses?.[w.word] }, check: 'reference', pinyin: w.pinyin,
    };
    const th = hskTheme(w.pos);
    themes.set(th, [...(themes.get(th) ?? []), card]);
  }
  const order = ['hsk-nouns', 'hsk-verbs', 'hsk-other'];
  return { ...base, pack, themes: order.filter((id) => themes.has(id)).map((id) => ({ id, cards: themes.get(id)! })) };
}

export function hskProblem(words: readonly HskWord[]): string | null {
  return words.length < MIN_WORDS ? `ONLY_${words.length}_WORDS` : null;
}

export async function downloadHsk(pack: HskPack, opts: { signal?: AbortSignal; fetchImpl?: typeof fetch; timeoutMs?: number } = {}): Promise<HskWord[]> {
  const deadline = AbortSignal.timeout(opts.timeoutMs ?? HSK_TIMEOUT_MS);
  const signal = opts.signal ? AbortSignal.any([opts.signal, deadline]) : deadline;
  const res = await (opts.fetchImpl ?? fetch)(hskUrl(pack), { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseHsk(await res.json());
}
