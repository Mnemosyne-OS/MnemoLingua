/**
 * speech.ts — the pronunciation, with the voices the system already has.
 *
 * The voice is chosen by the language LEARNED, never by the app's language: an
 * app in French reads its English word with an English voice, because the
 * language travels with each utterance (`utterance.lang` + the voice picked
 * for it). Offline, free, no permission.
 *
 * 🎭 Three states, never two: the list is still loading (Chromium fills it
 * asynchronously and sometimes never announces it), the machine has no voice
 * in that language (said, never a silent button), or a voice.
 */
import { useEffect, useState } from 'react';
import { log } from './log';

export interface VoiceInfo { name: string; lang: string; localService: boolean }

export type SpeakerState =
  | { kind: 'loading' }
  | { kind: 'none' }
  | { kind: 'ready'; voice: VoiceInfo };

/** How long to wait for a list that is never announced. */
const VOICES_WAIT_MS = 1500;

/**
 * The best installed voice for a language: the main regional variant first
 * (en-US, fr-FR, es-ES), then any variant, a local voice before a network one
 * (a network voice goes silent offline). Null when there is none.
 */
export function pickVoice(voices: readonly VoiceInfo[], lang: string): VoiceInfo | null {
  const base = lang.toLowerCase().split('-')[0] ?? '';
  const main: Record<string, string> = { en: 'en-us', fr: 'fr-fr', es: 'es-es', de: 'de-de', pt: 'pt-br', it: 'it-it', ja: 'ja-jp', zh: 'zh-cn' };
  const mine = voices.filter((v) => v.lang.toLowerCase().replace('_', '-').split('-')[0] === base);
  if (mine.length === 0) return null;
  const rank = (v: VoiceInfo): number =>
    (v.lang.toLowerCase().replace('_', '-') === main[base] ? 0 : 2) + (v.localService ? 0 : 1);
  return [...mine].sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

function synth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
}

/** The voice for `lang`, followed as the system list fills. */
export function useSpeaker(lang: string): SpeakerState {
  const [state, setState] = useState<SpeakerState>({ kind: 'loading' });
  useEffect(() => {
    const s = synth();
    if (!s) { setState({ kind: 'none' }); return; }
    let settled = false;
    const read = (final: boolean): void => {
      const voices = s.getVoices();
      const voice = pickVoice(voices, lang);
      if (voice) { settled = true; setState({ kind: 'ready', voice }); return; }
      if (final || voices.length > 0) {
        settled = true;
        log.info('speech', 'no voice for the language learned', { lang, voices: voices.length });
        setState({ kind: 'none' });
      }
    };
    const onChange = (): void => read(false);
    s.addEventListener('voiceschanged', onChange);
    read(false);
    const timer = setTimeout(() => { if (!settled) read(true); }, VOICES_WAIT_MS);
    return () => {
      clearTimeout(timer);
      s.removeEventListener('voiceschanged', onChange);
      s.cancel();
    };
  }, [lang]);
  return state;
}

/** Says `text` in the voice's language, cutting off whatever was playing. */
export function speak(text: string, voice: VoiceInfo): void {
  const s = synth();
  if (!s || !text) return;
  s.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = voice.lang;
  const real = s.getVoices().find((v) => v.name === voice.name && v.lang === voice.lang);
  if (real) u.voice = real;
  u.rate = 0.9;
  u.onerror = (e) => {
    // « interrupted » / « canceled » is the next card cutting this one off.
    if (e.error !== 'interrupted' && e.error !== 'canceled') log.error('speech', 'utterance failed', { error: e.error });
  };
  s.speak(u);
}
