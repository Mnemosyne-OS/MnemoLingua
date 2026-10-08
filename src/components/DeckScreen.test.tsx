import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { DeckScreen } from './DeckScreen';
import { setLang } from '../i18n/useI18n';
import type { Deck } from '../lib/types';
import type { DeckView } from '../lib/deck';

const deck: Deck = {
  id: 'd', lang: 'en', version: 1, reviewedBy: null, reviewedAt: null, checkedAt: '2026-10-05',
  themes: [{ id: 'basics', cards: [{ id: 'a', kind: 'phrase', target: 'Hi', gloss: { fr: 'Salut' }, check: 'two-pass' }] }],
};
const view: DeckView = { playable: deck.themes[0]!.cards, withheld: 0, noGloss: 0, reported: 0 };

function mount(over: Partial<Parameters<typeof DeckScreen>[0]> = {}) {
  setLang('en');
  render(
    <DeckScreen
      deck={deck} view={view} ticked={undefined} dueCount={0} freshCount={1} next={null} canSave
      reports={[]} targetOf={(id) => id} onToggle={() => undefined} onStart={() => undefined}
      onPutBack={() => undefined} title="Travel" dailyNew={10} onDailyNew={() => undefined}
      {...over}
    />,
  );
}

describe('DeckScreen', () => {
  it('never says a deck was read by a person while no name is in the file', () => {
    mount();
    expect(screen.getByText(/Not yet read by a native speaker/)).toBeInTheDocument();
    expect(screen.queryByText(/^Read by/)).not.toBeInTheDocument();
  });

  it('names the person once a native speaker has read it', () => {
    mount({ deck: { ...deck, reviewedBy: 'Ana', reviewedAt: '2026-11-01' } });
    expect(screen.getByText('Read by Ana on 2026-11-01.')).toBeInTheDocument();
  });

  it('offers no session over unreadable progress', () => {
    mount({ canSave: false });
    expect(screen.queryByText('Start the session')).not.toBeInTheDocument();
  });

  it('says the deck has nothing in your language rather than an empty list', () => {
    mount({ view: { playable: [], withheld: 0, noGloss: 1, reported: 0 } });
    expect(screen.getByText('This deck has no translations in your language yet.')).toBeInTheDocument();
  });

  it('gives the real day and the card count of the next review', () => {
    mount({ freshCount: 0, next: { inDays: 3, cards: 10 } });
    expect(screen.getByText('Nothing to review today. Next review in 3 day(s): 10 card(s).')).toBeInTheDocument();
  });

  it('draws each theme as a switch tile that says whether it is on', () => {
    const onToggle = vi.fn();
    mount({ ticked: [], onToggle });
    const tile = screen.getByRole('button', { name: /Basics|basics/i });
    expect(tile).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(tile);
    expect(onToggle).toHaveBeenCalledWith('basics');
  });

  it('switches every theme on or off in one press', () => {
    const onSetThemes = vi.fn();
    mount({ ticked: ['basics'], onSetThemes });
    fireEvent.click(screen.getByText('None'));
    expect(onSetThemes).toHaveBeenLastCalledWith([]);
    fireEvent.click(screen.getByText('All'));
    expect(onSetThemes).toHaveBeenLastCalledWith(['basics']);
  });

  it('a hand reference table says what it is, never that automatic passes checked it', () => {
    const kana: Deck = { ...deck, id: 'ja-kana', lang: 'ja', themes: [{ id: 'hiragana', cards: [{ id: 'hira-a', kind: 'glyph', target: 'あ', gloss: { fr: 'a' }, check: 'reference' }] }] };
    mount({ deck: kana });
    expect(screen.getByText(/^Reference table/)).toBeInTheDocument();
    expect(screen.queryByText(/automatic passes/)).not.toBeInTheDocument();
  });

  it('credits the strokes on the deck itself once they are drawn, and only on a writing deck', () => {
    const kana: Deck = { ...deck, id: 'ja-kana', lang: 'ja', themes: [{ id: 'hiragana', cards: [{ id: 'hira-a', kind: 'glyph', target: 'あ', gloss: { fr: 'a' }, check: 'reference' }] }] };
    mount({ deck: kana });
    expect(screen.getByText(/Strokes: KanjiVG \(Ulrich Apel\).*CC BY-SA 3\.0/)).toBeInTheDocument();
  });

  it('says nothing about strokes on a word deck', () => {
    mount();
    expect(screen.queryByText(/KanjiVG/)).not.toBeInTheDocument();
  });

  it('a writing deck explains itself, open the first time; a word deck does not', () => {
    const zh: Deck = { ...deck, id: 'zh-hsk1', lang: 'zh', themes: [{ id: 'hsk-nouns', cards: [{ id: 'hsk-爸爸', kind: 'glyph', target: '爸爸', gloss: { fr: 'papa' }, check: 'reference' }] }] };
    const { unmount } = render(<></>);
    unmount();
    mount({ deck: zh, firstTime: true });
    expect(screen.getByText('How it works').closest('details')).toHaveAttribute('open');
    expect(screen.getByText(/Pinyin writes the sound/)).toBeInTheDocument();
  });

  it('a word deck has no such panel', () => {
    mount();
    expect(screen.queryByText('How it works')).not.toBeInTheDocument();
  });
});
