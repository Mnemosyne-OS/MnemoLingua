import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const host = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }));
vi.mock('./lib/host', () => ({ readState: host.read, writeState: host.write, hasHost: () => true }));

const decks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('./decks', () => ({
  DECK_METAS: [
    { file: './en/travel.json', id: 'en-travel', lang: 'en', name: 'travel' },
    { file: './en/other.json', id: 'en-other', lang: 'en', name: 'other', level: 'B2' },
  ],
  loadDeck: decks.load,
}));

import App from './App';
import travel from './decks/en/travel.json';
import { setLang } from './i18n/useI18n';
import { parseDeck } from './lib/deck';
import { __setStateForTests } from './lib/store';
import { emptyState } from './lib/types';

beforeEach(() => {
  host.read.mockReset().mockResolvedValue({ state: { ...emptyState(), glossLang: 'fr' }, updatedAt: 'x' });
  host.write.mockReset().mockResolvedValue({ success: true });
  decks.load.mockReset();
  __setStateForTests(emptyState(), false);
});

describe('a deck that fails to load', () => {
  it('says so and loads again when the learner asks', async () => {
    decks.load
      .mockResolvedValueOnce({ deck: null, problems: ['DECK_TIMEOUT after 15000 ms'] })
      .mockResolvedValueOnce(parseDeck(travel));
    setLang('en');
    render(<App />);
    fireEvent.click(await screen.findByText('Try again'));
    expect(await screen.findByText('Today: 0 to review, 10 new')).toBeInTheDocument();
    expect(decks.load).toHaveBeenCalledTimes(2);
  });
});

describe('a deck on its way', () => {
  it('says it is opening, not that it is damaged', async () => {
    decks.load.mockReturnValue(new Promise(() => undefined));
    setLang('en');
    render(<App />);
    expect(await screen.findByText('Opening the deck…')).toBeInTheDocument();
    expect(screen.queryByText('Try again')).not.toBeInTheDocument();
  });

  it('is loaded once: coming back to its tab does not load it again', async () => {
    decks.load.mockResolvedValue(parseDeck(travel));
    setLang('en');
    render(<App />);
    await screen.findByText('Today: 0 to review, 10 new');
    fireEvent.click(screen.getByText('Level B2'));
    fireEvent.click(screen.getByText('Travel'));
    await screen.findByText('Today: 0 to review, 10 new');
    expect(decks.load.mock.calls.map(([m]) => m.id)).toEqual(['en-travel', 'en-other']);
  });
});
