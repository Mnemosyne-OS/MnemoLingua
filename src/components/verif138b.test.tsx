/**
 * verif138b — the rules the second verification pass (2026-10-08) found held
 * by no test, and the defects it found, each with the test that would fail.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Session } from './Session';
import { DeckScreen } from './DeckScreen';
import { setLang } from '../i18n/useI18n';
import { demoMs } from '../lib/pad';
import { updateStateOf } from '../lib/update';
import { cleanMeanings } from '../lib/kanjiPack';
import { chooseForm, parseHsk } from '../lib/hskPack';
import { pathPoints } from '../lib/strokes';
import type { QueueItem } from '../lib/session';
import type { Deck } from '../lib/types';
import type { DeckView } from '../lib/deck';

const S = ['M10,50c20,0,60,0,90,0'];

function card(over: Partial<QueueItem['record']> = {}, target = '一'): QueueItem {
  return {
    card: { id: `kanji-${target}`, kind: 'glyph', target, gloss: { fr: 'un' }, check: 'reference' },
    direction: 'produce',
    record: { id: `kanji-${target}:produce`, courseId: 'ja-kanji-n5', front: '', back: '', box: 1, dueAt: '2026-10-08', reps: 1, lapses: 0, lastSeenAt: null, ...over },
  };
}

function mountSession(q: QueueItem[], strokesOf: (c: string) => readonly string[] | undefined = () => S) {
  setLang('fr');
  vi.stubGlobal('speechSynthesis', { getVoices: () => [], speak: vi.fn(), cancel: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() });
  render(<Session queue={q} lang="fr" learningName="japonais" targetLang="ja" tomorrow={() => 0} onAnswer={() => undefined} onReport={() => undefined} onLeave={() => undefined} strokesOf={strokesOf} />);
}

/** Draws a stroke on the pad with the pointer, in box coordinates. jsdom lays
 *  nothing out, so the pad is given a 109 × 109 box at the origin. */
function trace(d: string): void {
  const pad = screen.getByRole('img', { name: /Cadre où écrire/ });
  pad.getBoundingClientRect = () => ({ left: 0, top: 0, width: 109, height: 109, right: 109, bottom: 109, x: 0, y: 0, toJSON: () => ({}) });
  (pad as unknown as { setPointerCapture: () => void }).setPointerCapture = () => undefined;
  const pts = pathPoints(d);
  fireEvent.pointerDown(pad, { clientX: pts[0]!.x, clientY: pts[0]!.y, pointerId: 1 });
  for (const p of pts.slice(1)) fireEvent.pointerMove(pad, { clientX: p.x, clientY: p.y, pointerId: 1 });
  fireEvent.pointerUp(pad, { pointerId: 1 });
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('watching the drawing is not a hint (doc 138 §20)', () => {
  it('watched twice, then written without a fault: perfect, and a full point', () => {
    vi.useFakeTimers();
    mountSession([card()]);
    act(() => { vi.advanceTimersByTime(demoMs(1) + 10); });
    fireEvent.click(screen.getByText('Revoir le tracé'));
    act(() => { vi.advanceTimersByTime(demoMs(1) + 10); });
    trace(S[0]!);
    expect(screen.getByText('Parfait, sans une faute !')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Continuer'));
    expect(screen.getByText('Score : 1 sur 1')).toBeInTheDocument();
  });

  it('the pen is ignored while the character draws itself', () => {
    vi.useFakeTimers();
    mountSession([card()]);
    trace(S[0]!);
    act(() => { vi.advanceTimersByTime(demoMs(1) + 10); });
    // Nothing was recorded during the drawing: the pad still waits for stroke 1.
    expect(screen.getByText('À toi : 1 trait(s), dans le même ordre.')).toBeInTheDocument();
  });

  it('in box 1 « show the order » is not offered beside the free « watch again »; from box 2 it is', () => {
    vi.useFakeTimers();
    mountSession([card()]);
    act(() => { vi.advanceTimersByTime(demoMs(1) + 10); });
    expect(screen.queryByText(/Montrer l'ordre/)).not.toBeInTheDocument();
  });

  it('from box 2 « show the order » is there, and no free drawing', () => {
    mountSession([card({ box: 2 })]);
    expect(screen.getByText(/Montrer l'ordre/)).toBeInTheDocument();
    expect(screen.queryByText('Revoir le tracé')).not.toBeInTheDocument();
  });
});

describe('a new sign without its strokes', () => {
  it('is not marked seen: the alert shows, and no « Got it »', () => {
    mountSession([{ ...card({ reps: 0 }), direction: 'recognise' }], () => undefined);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText("C'est vu, suivant")).not.toBeInTheDocument();
  });
});

describe('the deck screen', () => {
  const zh: Deck = {
    id: 'zh-hsk1', lang: 'zh', version: 1, reviewedBy: null, reviewedAt: null, checkedAt: '2026-10-07',
    pack: { source: 'hsk', list: 'old', level: 1 },
    themes: [{ id: 'hsk-nouns', cards: [{ id: 'hsk-爸爸', kind: 'glyph', target: '爸爸', gloss: { fr: 'papa' }, check: 'reference' }] }],
  };
  const view: DeckView = { playable: zh.themes[0]!.cards, withheld: 0, noGloss: 0, reported: 0 };
  function mountDeck(firstTime: boolean) {
    setLang('fr');
    render(<DeckScreen deck={zh} view={view} ticked={undefined} dueCount={0} freshCount={1} next={null} canSave dailyNew={10}
      onDailyNew={() => undefined} reports={[]} targetOf={(id) => id} onToggle={() => undefined} onStart={() => undefined}
      onPutBack={() => undefined} title="HSK 1" firstTime={firstTime} />);
  }

  it('the check line of the Chinese deck says the translations are ours, never « meanings from the list »', () => {
    mountDeck(true);
    expect(screen.getByText(/^Liste de mots téléchargée, traductions écrites pour MnemoLingua/)).toBeInTheDocument();
    expect(screen.queryByText(/Sens tirés de complete-hsk-vocabulary/)).not.toBeInTheDocument();
  });

  it('« how it works » is folded once a card of the deck has been met', () => {
    mountDeck(false);
    expect(screen.getByText('Comment ça marche').closest('details')).not.toHaveAttribute('open');
  });
});

describe('the data rules', () => {
  it('a published version that is not plain numbers is unknown, never « up to date »', () => {
    for (const v of ['next', '0.3.0-beta.1', '']) expect(updateStateOf(v, '0.2.3'), v).toEqual({ kind: 'unknown' });
  });

  it('cleanMeanings drops the radical NUMBER, never a real meaning « radical »', () => {
    expect(cleanMeanings(['root', 'radical (chemistry)'])).toEqual(['root', 'radical (chemistry)']);
    expect(cleanMeanings(['radical gauche d’un kanji'])).toEqual(['radical gauche d’un kanji']);
    expect(cleanMeanings(['un', 'radical un (no. 1)'])).toEqual(['un']);
  });

  it('pinyin is written as one word, the way it is learned', () => {
    const w = parseHsk([{ simplified: '爸爸', pos: ['n'], forms: [{ transcriptions: { pinyin: 'bà ba' }, meanings: ['dad'] }] }]);
    expect(w[0]!.pinyin).toBe('bàba');
  });

  it('a capital pinyin loses on its own, even with an ordinary meaning', () => {
    expect(chooseForm('张', [
      { pinyin: 'Zhāng', meanings: ['to open', 'to spread'] },
      { pinyin: 'zhāng', meanings: ['to open', 'to spread'] },
    ])?.pinyin).toBe('zhāng');
  });

  it('a « surname » sense loses on its own, even in lower case', () => {
    expect(chooseForm('都', [
      { pinyin: 'dū', meanings: ['surname Du', 'x', 'y'] },
      { pinyin: 'dōu', meanings: ['all'] },
    ])?.pinyin).toBe('dōu');
  });
});
