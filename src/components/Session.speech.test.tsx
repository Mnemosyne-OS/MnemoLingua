import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { pickVoice, type VoiceInfo } from '../lib/speech';
import { Session } from './Session';
import { demoMs } from '../lib/pad';
import { setLang } from '../i18n/useI18n';
import type { QueueItem } from '../lib/session';

const v = (name: string, lang: string, localService = true): VoiceInfo => ({ name, lang, localService });

describe('pickVoice', () => {
  it('takes a voice of the language learned, never one of the app language', () => {
    const voices = [v('Hortense', 'fr-FR'), v('Zira', 'en-US')];
    expect(pickVoice(voices, 'en')?.name).toBe('Zira');
  });

  it('prefers the main variant, then a local voice', () => {
    expect(pickVoice([v('Hazel', 'en-GB'), v('Zira', 'en-US')], 'en')?.name).toBe('Zira');
    expect(pickVoice([v('Online', 'en-US', false), v('Local', 'en-US')], 'en')?.name).toBe('Local');
    expect(pickVoice([v('Hazel', 'en_GB')], 'en')?.name).toBe('Hazel');
  });

  it('says there is none rather than reading English with a French voice', () => {
    expect(pickVoice([v('Hortense', 'fr-FR')], 'en')).toBeNull();
  });
});

function installSynth(voices: { name: string; lang: string; localService: boolean }[]) {
  const spoken: { text: string; lang: string }[] = [];
  const synth = {
    getVoices: () => voices,
    speak: (u: { text: string; lang: string }) => spoken.push({ text: u.text, lang: u.lang }),
    cancel: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal('speechSynthesis', synth);
  vi.stubGlobal('SpeechSynthesisUtterance', class { text: string; lang = ''; voice: unknown = null; rate = 1; onerror: unknown = null; constructor(t: string) { this.text = t; } });
  return spoken;
}

function card(direction: 'recognise' | 'produce'): QueueItem {
  return {
    card: { id: 'dog', kind: 'word', target: 'dog', gloss: { fr: 'le chien' }, check: 'two-pass' },
    direction,
    record: { id: `dog:${direction}`, courseId: 'd', front: '', back: '', box: 1, dueAt: '2026-10-07', reps: 0, lapses: 0, lastSeenAt: null },
  };
}

function mount(q: QueueItem[]) {
  setLang('fr');
  render(<Session queue={q} lang="fr" learningName="anglais" targetLang="en" tomorrow={() => 0} onAnswer={() => undefined} onReport={() => undefined} onLeave={() => undefined} />);
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('the 🔊 in a sitting', () => {
  it('reads the English word in an English voice while the app is in French', () => {
    const spoken = installSynth([v('Hortense', 'fr-FR'), v('Zira', 'en-US')]);
    mount([card('recognise')]);
    fireEvent.click(screen.getByLabelText('Écouter'));
    expect(spoken).toEqual([{ text: 'dog', lang: 'en-US' }]);
  });

  it('never offers the English word on the « say it » side before the answer', () => {
    installSynth([v('Zira', 'en-US')]);
    mount([card('produce')]);
    expect(screen.queryByLabelText('Écouter')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Voir la réponse'));
    expect(screen.getByLabelText('Écouter')).toBeInTheDocument();
  });

  it('says so when the computer has no English voice', () => {
    vi.useFakeTimers();
    installSynth([v('Hortense', 'fr-FR')]);
    mount([card('recognise')]);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByText(/Aucune voix en anglais/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Écouter')).not.toBeInTheDocument();
  });
});

describe('a kana card', () => {
  const A = ['M31,33c10,0,30,-2,42,-3', 'M50,18c2,20,-4,50,0,72'];
  function kana(direction: 'recognise' | 'produce', reps = 1): QueueItem {
    return {
      card: { id: 'hira-a', kind: 'glyph', target: 'あ', pos: 'hiragana', gloss: { fr: 'a' }, check: 'reference' },
      direction,
      record: { id: `hira-a:${direction}`, courseId: 'ja-kana', front: '', back: '', box: 2, dueAt: '2026-10-07', reps, lapses: 0, lastSeenAt: null },
    };
  }
  function mountKana(q: QueueItem[]) {
    setLang('fr');
    render(<Session queue={q} lang="fr" learningName="japonais" targetLang="ja" tomorrow={() => 0} onAnswer={() => undefined} onReport={() => undefined} onLeave={() => undefined} strokesOf={(c) => (c === 'あ' ? A : undefined)} />);
  }

  it('draws the character from its strokes, and keeps the 🔊 for after the answer: hearing it IS the reading', () => {
    installSynth([v('Haruka', 'ja-JP')]);
    mountKana([kana('recognise')]);
    expect(screen.getByRole('img', { name: 'Le caractère à lire' }).querySelectorAll('path')).toHaveLength(2);
    expect(screen.queryByLabelText('Écouter')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Voir la réponse'));
    expect(screen.getByLabelText('Écouter')).toBeInTheDocument();
  });

  it('a NEW sign is shown with its answer first, never asked cold, and earns no point', () => {
    installSynth([v('Haruka', 'ja-JP')]);
    const onAnswer = vi.fn();
    setLang('fr');
    render(<Session queue={[kana('recognise', 0), kana('produce', 0)]} lang="fr" learningName="japonais" targetLang="ja" tomorrow={() => 0} onAnswer={onAnswer} onReport={() => undefined} onLeave={() => undefined} strokesOf={(c) => (c === 'あ' ? A : undefined)} />);
    expect(screen.getByText('Nouveau : regarde-le, il reviendra.')).toBeInTheDocument();
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.queryByText('Voir la réponse')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("C'est vu, suivant"));
    expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({ direction: 'recognise' }), true);
    expect(screen.getByText('0 pt(s)')).toBeInTheDocument();
    // Its write side comes next, in the same sitting.
    expect(screen.getByRole('img', { name: 'Cadre où écrire a' })).toBeInTheDocument();
  });

  it('asks to write it on the pad, with no flip to cheat with', () => {
    installSynth([]);
    mountKana([kana('produce')]);
    expect(screen.getByRole('img', { name: 'Cadre où écrire a' })).toBeInTheDocument();
    expect(screen.queryByText('Voir la réponse')).not.toBeInTheDocument();
    expect(screen.getByText('Trait 1 sur 2')).toBeInTheDocument();
  });
});

describe('a Chinese word on the pad', () => {
  const S = ['M10,50c20,0,60,0,90,0'];
  function word(): QueueItem {
    return {
      card: { id: 'hsk-爸爸', kind: 'glyph', target: '爸爸', gloss: { en: 'dad' }, pinyin: 'bàba', check: 'reference' },
      direction: 'produce',
      record: { id: 'hsk-爸爸:produce', courseId: 'zh-hsk1', front: '', back: '', box: 2, dueAt: '2026-10-07', reps: 0, lapses: 0, lastSeenAt: null },
    };
  }
  it('is written character after character, and its pinyin shows once written', () => {
    installSynth([]);
    const onAnswer = vi.fn();
    setLang('fr');
    render(<Session queue={[word()]} lang="en" learningName="chinois" targetLang="zh" tomorrow={() => 0} onAnswer={onAnswer} onReport={() => undefined} onLeave={() => undefined} strokesOf={() => S} />);
    expect(screen.getByText('Caractère 1 sur 2')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Je ne sais pas'));
    expect(screen.getByText('Caractère 2 sur 2')).toBeInTheDocument();
    expect(screen.queryByText('Continuer')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Je ne sais pas'));
    expect(screen.getByText('Pinyin : bàba')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Continuer'));
    expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({ direction: 'produce' }), false);
  });
});

describe('the beginner help on the pad', () => {
  const S = ['M10,50c20,0,60,0,90,0', 'M50,10c0,20,0,60,0,90'];
  function boxOne(): QueueItem {
    return {
      card: { id: 'kanji-十', kind: 'glyph', target: '十', gloss: { fr: 'dix' }, check: 'reference' },
      direction: 'produce',
      record: { id: 'kanji-十:produce', courseId: 'ja-kanji-n5', front: '', back: '', box: 1, dueAt: '2026-10-07', reps: 1, lapses: 0, lastSeenAt: null },
    };
  }

  it('in box 1 the character draws itself first, then the pad belongs to the learner, and it can be watched again for free', () => {
    vi.useFakeTimers();
    installSynth([]);
    setLang('fr');
    render(<Session queue={[boxOne()]} lang="fr" learningName="japonais" targetLang="ja" tomorrow={() => 0} onAnswer={() => undefined} onReport={() => undefined} onLeave={() => undefined} strokesOf={() => S} />);
    expect(screen.getByText('Regarde le tracé…')).toBeInTheDocument();
    expect(screen.queryByText('Je ne sais pas')).not.toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(demoMs(2) + 10); });
    expect(screen.getByText('À toi : 2 trait(s), dans le même ordre.')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Revoir le tracé'));
    expect(screen.getByText('Regarde le tracé…')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(demoMs(2) + 10); });
    // Watching is not a hint: no half point is taken for it.
    fireEvent.click(screen.getByText('Je ne sais pas'));
    expect(screen.getByText('0 pt(s)')).toBeInTheDocument();
  });

  it('past box 1 the pad belongs to the learner at once', () => {
    installSynth([]);
    setLang('fr');
    render(<Session queue={[{ ...boxOne(), record: { ...boxOne().record, box: 2 } }]} lang="fr" learningName="japonais" targetLang="ja" tomorrow={() => 0} onAnswer={() => undefined} onReport={() => undefined} onLeave={() => undefined} strokesOf={() => S} />);
    expect(screen.queryByText('Regarde le tracé…')).not.toBeInTheDocument();
    expect(screen.getByText('Trait 1 sur 2')).toBeInTheDocument();
  });
});

