/**
 * Session.verif — probes of the verification pass of 2026-10-07 (session
 * 1911bb39): the CABLE between the writing pad and the sitting, which the
 * shipped suite never exercises (jsdom lays nothing out, so no stroke can be
 * drawn; « Je ne sais pas » reaches the same cable without a pointer).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Session } from './Session';
import { setLang } from '../i18n/useI18n';
import type { QueueItem } from '../lib/session';

const A = ['M31,33c10,0,30,-2,42,-3', 'M50,18c2,20,-4,50,0,72'];

function kana(id: string, direction: 'recognise' | 'produce'): QueueItem {
  return {
    card: { id, kind: 'glyph', target: id === 'hira-a' ? 'あ' : 'い', pos: 'hiragana', gloss: { fr: id === 'hira-a' ? 'a' : 'i' }, check: 'reference' },
    direction,
    record: { id: `${id}:${direction}`, courseId: 'ja-kana', front: '', back: '', box: 2, dueAt: '2026-10-07', reps: 0, lapses: 0, lastSeenAt: null },
  };
}

function mount(q: QueueItem[], strokesOf: (c: string) => readonly string[] | undefined = () => A) {
  setLang('fr');
  const onAnswer = vi.fn();
  vi.stubGlobal('speechSynthesis', { getVoices: () => [], speak: vi.fn(), cancel: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() });
  render(<Session queue={q} lang="fr" learningName="japonais" targetLang="ja" tomorrow={() => 0} onAnswer={onAnswer} onReport={() => undefined} onLeave={() => undefined} strokesOf={strokesOf} />);
  return { onAnswer };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('the pad and the sitting', () => {
  it('giving up on the pad reaches the scheduler as « not known », and the character comes back in the sitting', () => {
    const { onAnswer } = mount([kana('hira-a', 'produce'), kana('hira-i', 'produce')]);
    expect(screen.getByText('Trait 1 sur 2')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Je ne sais pas'));
    expect(screen.getByText('Voici comment il s’écrit.'.replace('’', "'"))).toBeInTheDocument();
    fireEvent.click(screen.getByText('Continuer'));
    expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({ card: expect.objectContaining({ id: 'hira-a' }) }), false);
    // Next card, then the missed one again at the end of the sitting.
    expect(screen.getByRole('img', { name: 'Cadre où écrire i' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('Je ne sais pas'));
    fireEvent.click(screen.getByText('Continuer'));
    expect(screen.getByRole('img', { name: 'Cadre où écrire a' })).toBeInTheDocument();
    expect(screen.getByText('0 pt(s)')).toBeInTheDocument();
  });

  it('Space does nothing on the pad until the character is written, then moves on', () => {
    const { onAnswer } = mount([kana('hira-a', 'produce')]);
    fireEvent.keyDown(window, { code: 'Space', key: ' ' });
    expect(onAnswer).not.toHaveBeenCalled();
    expect(screen.queryByText('Voir la réponse')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Je ne sais pas'));
    fireEvent.keyDown(window, { code: 'Space', key: ' ' });
    expect(onAnswer).toHaveBeenCalledTimes(1);
  });

  it('a kana whose strokes are missing on the « write » side is SAID, and on the « read » side falls back to a font (asymmetry, reported)', () => {
    mount([kana('hira-a', 'produce')], () => undefined);
    expect(screen.getByRole('alert')).toHaveTextContent(/Les tracés de ce caractère manquent/);
    expect(screen.queryByText('Continuer')).not.toBeInTheDocument();
  });

  it('the « read » side without strokes says so too, and never falls back to a font (doc 138 §13.1)', () => {
    mount([kana('hira-a', 'recognise')], () => undefined);
    expect(screen.getByRole('alert')).toHaveTextContent(/Les tracés de ce caractère manquent/);
    expect(screen.queryByText('あ')).not.toBeInTheDocument();
  });

  it('a written character is never shown under the pad as font text', () => {
    mount([kana('hira-a', 'produce')]);
    fireEvent.click(screen.getByText('Je ne sais pas'));
    expect(screen.queryByText('あ')).not.toBeInTheDocument();
  });
});
