import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { pickVoice, type VoiceInfo } from '../lib/speech';
import { Session } from './Session';
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
  function kana(direction: 'recognise' | 'produce'): QueueItem {
    return {
      card: { id: 'hira-a', kind: 'glyph', target: 'あ', pos: 'hiragana', gloss: { fr: 'a' }, check: 'reference' },
      direction,
      record: { id: `hira-a:${direction}`, courseId: 'ja-kana', front: '', back: '', box: 1, dueAt: '2026-10-07', reps: 0, lapses: 0, lastSeenAt: null },
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

  it('asks to write it on the pad, with no flip to cheat with', () => {
    installSynth([]);
    mountKana([kana('produce')]);
    expect(screen.getByRole('img', { name: 'Cadre où écrire a' })).toBeInTheDocument();
    expect(screen.queryByText('Voir la réponse')).not.toBeInTheDocument();
    expect(screen.getByText('Trait 1 sur 2')).toBeInTheDocument();
  });
});
