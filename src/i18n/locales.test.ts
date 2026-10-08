import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import fr from './locales/fr.json';
import es from './locales/es.json';
import { DECK_METAS, loadDeck } from '../decks';
import { posKey } from '../lib/deck';

function keys(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix];
  return Object.entries(obj).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

describe('locales', () => {
  it('fr and es carry exactly the keys of en', () => {
    const base = keys(en).sort();
    expect(keys(fr).sort()).toEqual(base);
    expect(keys(es).sort()).toEqual(base);
  });

  it('every shipped deck opens, and has a name and its themes in every locale', async () => {
    expect(DECK_METAS.length).toBeGreaterThan(0);
    for (const meta of DECK_METAS) {
      const { deck, problems } = await loadDeck(meta);
      expect(problems, meta.file).toEqual([]);
      for (const bundle of [en, fr, es]) {
        if (!deck!.level) expect((bundle.deckName as Record<string, string>)[deck!.id], deck!.id).toBeTruthy();
        for (const theme of deck!.themes) {
          expect((bundle.theme as Record<string, string>)[theme.id], theme.id).toBeTruthy();
          for (const card of theme.cards) {
            if (card.pos) expect((bundle.pos as Record<string, string>)[posKey(card.pos)], card.pos).toBeTruthy();
          }
        }
      }
    }
  });
});
