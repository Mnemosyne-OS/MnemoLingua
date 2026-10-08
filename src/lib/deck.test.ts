import { describe, expect, it } from 'vitest';
import travel from '../decks/en/travel.json';
import a1 from '../decks/en/a1.json';
import a2 from '../decks/en/a2.json';
import b1 from '../decks/en/b1.json';
import { glossLangs, isTransparent, maskExample, parseDeck, resolveGlossLang, viewDeck } from './deck';
import { buildQueue, introduce } from './session';
import { playableRecordsOf } from './progress';
import { emptyState, type Deck, type DeckCard } from './types';

function deck(cards: Deck['themes'][number]['cards'], extraTheme = false): Deck {
  const themes = [{ id: 'a', cards }];
  if (extraTheme) themes.push({ id: 'b', cards: [{ id: 'b1', kind: 'phrase', target: 'Hi', gloss: { fr: 'Salut' }, check: 'two-pass' }] });
  return { id: 'd', lang: 'en', version: 1, reviewedBy: null, reviewedAt: null, checkedAt: '2026-10-05', themes };
}

describe('the shipped decks', () => {
  it('the travel deck parses with no problem', () => {
    const { deck: parsed, problems } = parseDeck(travel);
    expect(problems).toEqual([]);
    expect(parsed).not.toBeNull();
  });

  it('no shipped card claims a check it cannot have earned yet', () => {
    // Tatoeba cross-checking is not built: a "cross-checked" card in lot 1
    // would be a state written by hand, not earned (doc 138 §3.4b).
    const { deck: parsed } = parseDeck(travel);
    const states = new Set(parsed!.themes.flatMap((t) => t.cards.map((c) => c.check)));
    expect(states.has('cross-checked')).toBe(false);
    expect(parsed!.reviewedBy).toBeNull();
  });

  it('every travel card has a French and a Spanish gloss', () => {
    const { deck: parsed } = parseDeck(travel);
    for (const t of parsed!.themes) for (const c of t.cards) {
      expect(c.gloss.fr, c.id).toBeTruthy();
      expect(c.gloss.es, c.id).toBeTruthy();
    }
  });
});

describe('parseDeck', () => {
  const ok = { id: 'd', lang: 'en', version: 1, checkedAt: '2026-10-05', themes: [{ id: 'a', cards: [{ id: 'x', kind: 'phrase', target: 'Hi', gloss: { fr: 'Salut' }, check: 'two-pass' }] }] };

  it('refuses a duplicate card id, even across themes', () => {
    const raw = { ...ok, themes: [...ok.themes, { id: 'b', cards: ok.themes[0]!.cards }] };
    const { deck: parsed, problems } = parseDeck(raw);
    expect(parsed).toBeNull();
    expect(problems.join()).toMatch(/duplicate id/);
  });

  it('refuses an unknown check state rather than guessing one', () => {
    const raw = { ...ok, themes: [{ id: 'a', cards: [{ ...ok.themes[0]!.cards[0]!, check: 'verified' }] }] };
    expect(parseDeck(raw).deck).toBeNull();
  });

  it('refuses an empty gloss instead of keeping a blank card', () => {
    const raw = { ...ok, themes: [{ id: 'a', cards: [{ ...ok.themes[0]!.cards[0]!, gloss: { fr: '  ' } }] }] };
    expect(parseDeck(raw).deck).toBeNull();
  });
});

describe('viewDeck', () => {
  it('never shows a card a verification pass disagreed with, and counts it', () => {
    const v = viewDeck(deck([
      { id: 'a1', kind: 'phrase', target: 'Hi', gloss: { fr: 'Salut' }, check: 'two-pass' },
      { id: 'a2', kind: 'phrase', target: 'Bye', gloss: { fr: 'Au revoir' }, check: 'to-review' },
    ]), 'fr');
    expect(v.playable.map((c) => c.id)).toEqual(['a1']);
    expect(v.withheld).toBe(1);
  });

  it('never falls back to another language when the learner has no gloss', () => {
    const v = viewDeck(deck([{ id: 'a1', kind: 'phrase', target: 'Hi', gloss: { fr: 'Salut' }, check: 'two-pass' }]), 'es');
    expect(v.playable).toEqual([]);
    expect(v.noGloss).toBe(1);
  });

  it('leaves out a reported card and counts it', () => {
    const v = viewDeck(deck([{ id: 'a1', kind: 'phrase', target: 'Hi', gloss: { fr: 'Salut' }, check: 'two-pass' }]), 'fr', { reportedIds: new Set(['a1']) });
    expect(v.playable).toEqual([]);
    expect(v.reported).toBe(1);
  });

  it('reads no ticked themes as every theme, and an empty list as none', () => {
    const d = deck([{ id: 'a1', kind: 'phrase', target: 'Hi', gloss: { fr: 'Salut' }, check: 'two-pass' }], true);
    expect(viewDeck(d, 'fr').playable).toHaveLength(2);
    expect(viewDeck(d, 'fr', { themes: [] }).playable).toHaveLength(0);
    expect(viewDeck(d, 'fr', { themes: ['b'] }).playable.map((c) => c.id)).toEqual(['b1']);
  });
});

describe('the translation language', () => {
  const d = deck([{ id: 'a1', kind: 'phrase', target: 'Hi', gloss: { fr: 'Salut', es: 'Hola', en: 'Hi' }, check: 'two-pass' }]);

  it('never offers the language the deck teaches', () => {
    expect(glossLangs(d)).toEqual(['fr', 'es']);
  });

  it('takes the app language, then the saved choice, and otherwise asks', () => {
    expect(resolveGlossLang(d, 'es', 'fr')).toBe('fr');
    expect(resolveGlossLang(d, 'es', 'en')).toBe('es');
    expect(resolveGlossLang(d, null, 'fr')).toBe('fr');
    expect(resolveGlossLang(d, null, 'en')).toBeNull();
    const englishOnly = { ...d, lang: 'zh', themes: [{ id: 't', cards: [{ id: 'x', kind: 'glyph' as const, target: '我', gloss: { en: 'I' }, check: 'reference' as const }] }] };
    expect(resolveGlossLang(englishOnly, 'fr', 'fr')).toBe('en');
  });
});

describe('the A1 deck', () => {
  const { deck: parsed, problems } = parseDeck(a1);

  it('opens, is the A1 level, and cites its word list (the condition of use)', () => {
    expect(problems).toEqual([]);
    expect(parsed!.level).toBe('A1');
    expect(parsed!.source?.name).toMatch(/CEFR-J/);
    expect(parsed!.reviewedBy).toBeNull();
  });

  it('every A1 word of the source has its card, and numbers are computed', () => {
    const cards = parsed!.themes.flatMap((t) => t.cards);
    expect(cards.filter((c) => c.kind === 'word' && c.pos !== 'number')).toHaveLength(1137);
    const numbers = parsed!.themes.find((t) => t.id === 'numbers')!.cards;
    expect(numbers).toHaveLength(27);
    expect(numbers.every((c) => c.check === 'computed')).toBe(true);
    expect(numbers.find((c) => c.target === 'seventy')!.gloss.fr).toBe('soixante-dix');
  });

  it('every word card carries an example sentence with both translations', () => {
    for (const c of parsed!.themes.flatMap((t) => t.cards)) {
      if (c.kind !== 'word' || c.pos === 'number') continue;
      expect(c.example?.target, c.id).toBeTruthy();
      expect(c.example?.gloss.fr, c.id).toBeTruthy();
      expect(c.example?.gloss.es, c.id).toBeTruthy();
    }
  });

  it('no card claims a check nothing ran', () => {
    const states = new Set(parsed!.themes.flatMap((t) => t.cards.map((c) => c.check)));
    expect(states.has('cross-checked')).toBe(false);
    expect(states.has('reference')).toBe(false);
  });
});

describe('the A2 deck', () => {
  const { deck: parsed, problems } = parseDeck(a2);
  const cards = parsed?.themes.flatMap((t) => t.cards) ?? [];

  it('opens, is the A2 level, and cites its word list', () => {
    expect(problems).toEqual([]);
    expect(parsed!.level).toBe('A2');
    expect(parsed!.source?.name).toMatch(/CEFR-J/);
  });

  it('every A2 word has its card, and the round numbers come from the fixed table', () => {
    expect(cards.filter((c) => c.kind === 'word' && c.pos !== 'number')).toHaveLength(1408);
    const numbers = cards.filter((c) => c.pos === 'number');
    expect(numbers.map((c) => c.target)).toEqual(['hundred', 'thousand', 'million']);
    expect(numbers.every((c) => c.check === 'computed')).toBe(true);
    expect(numbers.find((c) => c.target === 'hundred')!.gloss).toEqual({ fr: 'cent', es: 'cien' });
  });

  it('no card id is shared with A1, so the two levels keep separate progress', () => {
    const a1ids = new Set(parseDeck(a1).deck!.themes.flatMap((t) => t.cards.map((c) => c.id)));
    expect(parsed!.id).not.toBe('en-a1');
    // Same ids would still be safe (progress is keyed by deck), but a word
    // appearing in both levels would be a duplicate the learner studies twice.
    expect(cards.filter((c) => a1ids.has(c.id))).toEqual([]);
  });
});

describe('maskExample', () => {
  const card = (target: string, example: string, variants?: string[]) => ({
    id: target, kind: 'word' as const, target, gloss: { fr: 'x' }, check: 'two-pass' as const,
    ...(variants ? { variants } : {}), example: { target: example, gloss: { fr: 'x' } },
  });

  it('blanks the word and its regular forms, never part of another word', () => {
    expect(maskExample(card('play', 'She is playing in the park.'))).toBe('She is ___ in the park.');
    expect(maskExample(card('city', 'Big cities are noisy.'))).toBe('Big ___ are noisy.');
    expect(maskExample(card('a', 'I have a cat and an apple.'))).toBe('I have ___ cat and an apple.');
    expect(maskExample(card('stop', 'The bus stopped.'))).toBe('The bus ___.');
    expect(maskExample(card('at', 'The cat is at home.'))).toBe('The cat is ___ home.');
  });

  it('blanks a contraction glued to its word, and a variant spelling', () => {
    expect(maskExample(card("'m", "I'm Tom."))).toBe('I___ Tom.');
    expect(maskExample(card('color', 'My favourite colour is blue.', ['colour']))).toBe('My favourite ___ is blue.');
  });

  it("blanks a comparative only on an adjective, and leaves n't to the word before it", () => {
    expect(maskExample({ ...card('print', 'Can you print my ticket on your printer?'), pos: 'verb' }))
      .toBe('Can you ___ my ticket on your printer?');
    expect(maskExample({ ...card('big', 'My dog is bigger than yours.'), pos: 'adjective' })).toBe('My dog is ___ than yours.');
    expect(maskExample(card('can', "I can swim, but I can't ski."))).toBe("I ___ swim, but I can't ski.");
    expect(maskExample(card('victim', "The victim's car was red."))).toBe("The ___'s car was red.");
  });

  it('returns null rather than guess an irregular form', () => {
    expect(maskExample(card('lose', 'I lost my keys.'))).toBeNull();
  });

  it('leaves almost no two cards of a level asking the same produce question', () => {
    // Measured 2026-10-06. A1: 6 (burger/hamburger, holiday/vacation, this
    // is/it is), 159 before masking. A2: 0, 133 before. B1: 8 in French, 10 in
    // Spanish: synonyms written with the same sentence (basin/bowl…), where
    // either answer is right.
    const ceilings = [[a1, 6, 6], [a2, 0, 0], [b1, 8, 10]] as const;
    for (const [raw, fr, es] of ceilings) {
      const cards = parseDeck(raw).deck!.themes.flatMap((t) => t.cards).filter((c) => c.check !== 'to-review');
      for (const [lang, ceiling] of [['fr', fr], ['es', es]] as const) {
        const seen = new Map<string, number>();
        for (const c of cards) {
          const k = `${c.gloss[lang]}|${c.pos ?? ''}|${maskExample(c) ?? c.example?.gloss[lang] ?? ''}`;
          seen.set(k, (seen.get(k) ?? 0) + 1);
        }
        expect([...seen.values()].filter((n) => n > 1).reduce((a, n) => a + n, 0)).toBeLessThanOrEqual(ceiling);
      }
    }
  }, 30_000); // parses three full decks: ~0.8 s alone, past 5 s under a loaded full run
});

describe('the B1 deck', () => {
  const { deck: parsed, problems } = parseDeck(b1);
  const cards = parsed?.themes.flatMap((t) => t.cards) ?? [];

  it('opens, is the B1 level, and cites its word list', () => {
    expect(problems).toEqual([]);
    expect(parsed!.level).toBe('B1');
    expect(parsed!.source?.name).toMatch(/CEFR-J/);
  });

  it('every B1 word of the source has its card, each with an example', () => {
    const words = cards.filter((c) => c.kind === 'word');
    expect(words).toHaveLength(2446);
    expect(words.every((c) => c.example?.target && c.example.gloss.fr && c.example.gloss.es)).toBe(true);
  });

  it('teaches no word A1 or A2 already teach (same spelling, same part of speech)', () => {
    // By id this would flag « march » (to walk, B1) against « March » (the
    // month, A1): one slug, two words. Progress is kept per deck, so a shared
    // id is harmless; a shared WORD would be studied twice.
    const key = (c: { target: string; pos?: string | undefined }) => `${c.target}|${c.pos ?? ''}`;
    const lower = new Set([a1, a2].flatMap((raw) => parseDeck(raw).deck!.themes.flatMap((t) => t.cards.map(key))));
    expect(cards.filter((c) => lower.has(key(c)))).toEqual([]);
  });
});

describe('transparent words', () => {
  const w = (target: string, fr: string, kind: 'word' | 'phrase' = 'word'): DeckCard =>
    ({ id: target, kind, target, gloss: { fr }, check: 'two-pass' });

  it('knows a word whose translation is the same word, article, accent, plural and one letter aside', () => {
    expect(isTransparent(w('jeans', 'le jean'), 'fr')).toBe(true);
    expect(isTransparent(w('pizza', 'la pizza'), 'fr')).toBe(true);
    expect(isTransparent(w('musician', 'le musicien'), 'fr')).toBe(true);
    expect(isTransparent(w('nationality', 'la nationalité'), 'fr')).toBe(true);
    expect(isTransparent(w('hospital', "l'hôpital"), 'fr')).toBe(true);
    expect(isTransparent(w('house', 'la maison'), 'fr')).toBe(false);
    expect(isTransparent(w('me', 'me, moi'), 'fr')).toBe(true);
  });

  it('never calls a different word, a short near-miss or a phrase transparent', () => {
    expect(isTransparent(w('dog', 'le chien'), 'fr')).toBe(false);
    expect(isTransparent(w('pain', 'la douleur'), 'fr')).toBe(false);
    expect(isTransparent(w('car', 'le cas'), 'fr')).toBe(false);
    expect(isTransparent(w('Taxi!', 'Taxi !', 'phrase'), 'fr')).toBe(false);
    expect(isTransparent(w('jeans', ''), 'fr')).toBe(false);
  });

  it('is asked only the « say it » way, and the counts agree', () => {
    const deck: Deck = { id: 'd', lang: 'en', version: 1, reviewedBy: null, reviewedAt: null, checkedAt: '2026-10-07',
      themes: [{ id: 't', cards: [w('jeans', 'le jean'), w('dog', 'le chien')] }] };
    const at = new Date(2026, 9, 7, 10);
    const view = viewDeck(deck, 'fr');
    const state = introduce(emptyState(), deck, view.playable, at);
    const queue = buildQueue(state, deck, view, at).map((i) => `${i.card.id}:${i.direction}`);
    expect(queue).toEqual(['dog:recognise', 'jeans:produce', 'dog:produce']);
    const counted = playableRecordsOf(state, deck, 'fr').map((r) => r.id).sort();
    expect(counted).toEqual(['dog:produce', 'dog:recognise', 'jeans:produce']);
  });
});
