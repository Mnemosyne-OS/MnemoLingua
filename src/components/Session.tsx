/**
 * Session.tsx — one sitting of review.
 *
 * Same contract as Melete's Review: the queue is a SNAPSHOT taken at mount. A
 * queue derived from "what is due now" would shrink under the learner's hands
 * as answers move due dates. A missed card goes to the back of THIS sitting:
 * seeing it again a few cards later is where re-learning happens.
 *
 * "This card is wrong" removes the card from the sitting in both directions
 * and reports it. The learner is the first person to review these decks, so
 * the button is the deck's error log.
 *
 * The 🔊 reads the language learned with a system voice in THAT language,
 * whatever language the app runs in (speech.ts). It is offered only on text
 * already on screen: on the « say it » side the word appears with the answer.
 *
 * A NEW character or word (kana, kanji, Chinese) is not asked: you cannot read
 * a sign you have never seen (Tony, 2026-10-07, on 爸爸 met cold: « arrivé
 * directement là-dessus c'est compliqué »). It is SHOWN first, drawn stroke by
 * stroke with its meaning and reading, and « Got it » moves on; it counts as
 * met, not as a point. Its « write » side comes later in the same sitting.
 *
 * Keys: Space shows the answer, 1 = didn't know, 2 = knew it. On the
 * writing pad there is no flip: Space or Enter moves on once it is written. Typing in a
 * field never triggers them.
 *
 * Points belong to the sitting only: a known card is worth 1, 0.5 when its
 * situation sentence was opened first (the eye), a missed card 0. They are
 * never written, and the spacing ignores them: a card known with the sentence
 * still climbs its box.
 */
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/useI18n';
import { maskExample, posKey } from '../lib/deck';
import { speak, useSpeaker } from '../lib/speech';
import { HINT_COST, type PadResult } from '../lib/pad';
import { kunToRomaji, onToRomaji } from '../lib/romaji';
import { Glyph, WordPad } from './WritingPad';
import type { QueueItem } from '../lib/session';
import type { GlossLang } from '../lib/types';
import { h2, lede, small } from '../styles';

interface Props {
  queue: QueueItem[];
  /** The learner's language: the gloss shown is in it. */
  lang: GlossLang;
  /** Display name of the language being learned, already translated. */
  learningName: string;
  /** BCP-47 code of the language being learned, for `lang` attributes. */
  targetLang: string;
  /** Cards due tomorrow, read when the sitting ends. */
  tomorrow: () => number;
  onAnswer: (item: QueueItem, correct: boolean) => void;
  onReport: (item: QueueItem) => void;
  onLeave: () => void;
  /** The downloaded strokes of a glyph card's character (doc 138 §13). */
  strokesOf?: (char: string) => readonly string[] | undefined;
}

/** One sitting over a snapshot of the queue (see the file header). */
export function Session({ queue: initial, lang, learningName, targetLang, tomorrow, onAnswer, onReport, onLeave, strokesOf }: Props): JSX.Element {
  const { t, lang: uiLang } = useI18n();
  const [queue, setQueue] = useState<QueueItem[]>(() => initial);
  const [total] = useState(() => initial.length);
  const [flipped, setFlipped] = useState(false);
  const [seen, setSeen] = useState(0);
  const [missed, setMissed] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [hinted, setHinted] = useState(false);
  /** A glyph written on the pad, waiting for « Continue ». */
  const [written, setWritten] = useState<PadResult | null>(null);
  const speaker = useSpeaker(targetLang);
  const say = (text: string): JSX.Element | null => speaker.kind === 'ready'
    ? <SpeakButton label={t('session.listen')} onClick={() => speak(text, speaker.voice)} />
    : null;
  const [points, setPoints] = useState(0);
  const num = (n: number): string => new Intl.NumberFormat(uiLang, { maximumFractionDigits: 1 }).format(n);

  const item = queue[0] ?? null;

  /** `earned` is given by the pad; a flip card earns 1, or less after the eye. */
  const answer = (correct: boolean, earned?: number): void => {
    if (!item) return;
    setSeen((n) => n + 1);
    if (!correct) setMissed((n) => n + 1);
    setPoints((n) => n + (earned ?? (correct ? (hinted ? 1 - HINT_COST : 1) : 0)));
    setHinted(false);
    setWritten(null);
    setNotice(null);
    onAnswer(item, correct);
    setFlipped(false);
    setQueue((q) => {
      const [head, ...rest] = q;
      return correct || !head ? rest : [...rest, head];
    });
  };

  // The listener is registered once and reads the latest handlers through a
  // ref: re-registering on every render would race the key that caused it.
  const onPad = item?.card.kind === 'glyph' && item.direction === 'produce';
  // Only a sign that can be DRAWN is shown as new: without its strokes the
  // card says they are missing, and « Got it » would mark it met unseen.
  const learning = item?.card.kind === 'glyph' && item.direction === 'recognise' && item.record.reps === 0
    && !!strokesOf && [...item.card.target].every((c) => strokesOf(c) !== undefined);
  /** A new sign was shown: it is met (the box moves on), never scored. */
  const learnNext = (): void => {
    if (!item) return;
    onAnswer(item, true);
    setFlipped(false);
    setNotice(null);
    setQueue((q) => q.slice(1));
  };
  const keys = useRef({ flipped, answer, show: () => setFlipped(true), active: !!item, onPad, written, learning, learnNext });
  keys.current = { flipped, answer, show: () => setFlipped(true), active: !!item, onPad, written, learning, learnNext };
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const k = keys.current;
      if (!k.active || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      if (k.learning) {
        if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); k.learnNext(); }
        return;
      }
      if (k.onPad) {
        // The pad has no flip: Space moves on once the character is written.
        if (k.written && (e.code === 'Space' || e.key === 'Enter')) { e.preventDefault(); k.answer(k.written.known, k.written.points); }
        return;
      }
      if (!k.flipped && e.code === 'Space') { e.preventDefault(); k.show(); return; }
      if (k.flipped && (e.key === '1' || e.key === 'ArrowLeft')) { e.preventDefault(); k.answer(false); return; }
      if (k.flipped && (e.key === '2' || e.key === 'ArrowRight')) { e.preventDefault(); k.answer(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!item) {
    return (
      <section className="ml-glass ml-card" style={{ justifyContent: 'center', gap: '16px' }}>
        <span className="ml-celebrate" aria-hidden="true">🎉</span>
        <p style={{ ...small, fontSize: '14px' }}>{t('session.great')}</p>
        <h2 style={{ ...h2, fontSize: '27px' }}>{t('session.done')}</h2>
        <p style={lede}>{t('session.summary', { seen, missed })}</p>
        <p style={{ ...lede, fontSize: '17px' }}>{t('session.score', { n: num(points), max: num(seen) })}</p>
        <p style={lede}>{t('session.tomorrow', { n: tomorrow() })}</p>
        <button className="ml-btn ml-btn-primary" style={{ marginTop: '8px' }} onClick={onLeave}>{t('session.back')}</button>
      </section>
    );
  }

  const gloss = item.card.gloss[lang] ?? '';
  const front = item.direction === 'recognise' ? item.card.target : gloss;
  const back = item.direction === 'recognise' ? gloss : item.card.target;
  const isNew = item.record.reps === 0;
  const isGlyph = item.card.kind === 'glyph';
  // A kanji's readings in romaji: a Japanese font is not guaranteed (romaji.ts).
  const readings = item.card.readings && (item.card.readings.on.length > 0 || item.card.readings.kun.length > 0)
    ? t('session.readings', {
      list: [
        item.card.readings.on.length > 0 ? `${t('session.onLabel')} ${item.card.readings.on.map(onToRomaji).join(', ')}` : '',
        item.card.readings.kun.length > 0 ? `${t('session.kunLabel')} ${item.card.readings.kun.slice(0, 4).map(kunToRomaji).join(', ')}` : '',
      ].filter(Boolean).join(' · '),
    })
    : item.card.pinyin ? t('session.pinyin', { pinyin: item.card.pinyin }) : null;
  // One list of strokes per character: a Chinese card is a word (爸爸).
  const perChar = isGlyph ? [...item.card.target].map((c) => strokesOf?.(c)) : [];
  const glyphStrokes = perChar.length > 0 && perChar.every((s) => s !== undefined)
    ? perChar as readonly (readonly string[])[]
    : undefined;
  const masked = maskExample(item.card);
  const exampleGloss = item.card.example?.gloss[lang];
  const produceHint = masked
    ? { text: masked, lang: targetLang }
    : exampleGloss ? { text: exampleGloss, lang } : null;
  // A missed card goes back in the queue, so the queue can outgrow the start.
  const done = total > 0 ? Math.max(0, Math.min(1, (total - queue.length) / total)) : 0;

  const report = (): void => {
    onReport(item);
    setFlipped(false);
    setHinted(false);
    setWritten(null);
    setNotice(t('session.reported'));
    setQueue((q) => q.filter((x) => x.card.id !== item.card.id));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', maxWidth: '680px', margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        <span style={small}>{t('session.left', { n: queue.length })}</span>
        <div className="ml-progress" style={{ flex: 1 }} aria-hidden="true">
          <span style={{ width: `${Math.round(done * 100)}%` }} />
        </div>
        <span className="ml-pill">{t('session.points', { n: num(points) })}</span>
        <span className={isNew ? 'ml-pill ml-pill-new' : 'ml-pill'}>{isNew ? t('session.new') : t('session.box', { n: item.record.box })}</span>
      </div>

      <section className="ml-glass ml-card">
        <span style={small}>
          {isGlyph
            ? (learning ? t('write.discover') : item.direction === 'recognise' ? t('write.read') : t('write.write'))
            : item.direction === 'recognise' ? t('session.recognise') : t('session.produce', { lang: learningName })}
        </span>
        {isGlyph && item.direction === 'recognise' && !glyphStrokes ? (
          <p role="alert" style={{ ...small, marginTop: '16px' }}>{t('write.noStrokes')}</p>
        ) : isGlyph && item.direction === 'recognise' && glyphStrokes ? (
          // Drawn from its strokes, never a font (WritingPad.tsx). No 🔊 here:
          // hearing « あ » IS its reading, the answer.
          <div role="img" aria-label={t('write.glyphLabel')} style={{ marginTop: '16px', display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
            {glyphStrokes.map((s, k) => <Glyph key={k} strokes={s} size={glyphStrokes.length > 2 ? 110 : 160} animate={learning} />)}
          </div>
        ) : (
          <p lang={item.direction === 'recognise' ? targetLang : lang} className="ml-front">
            {front}
            {item.direction === 'recognise' && !isGlyph && say(item.card.target)}
          </p>
        )}
        {item.card.pos && (
          // Without it "about" the adverb and "about" the preposition show the
          // SAME front, and the learner answers for the other one.
          <span className="ml-pill">{t(`pos.${posKey(item.card.pos)}`)}</span>
        )}
        {onPad && !glyphStrokes && <p role="alert" style={small}>{t('write.noStrokes')}</p>}
        {onPad && glyphStrokes && (
          <div style={{ marginTop: '16px', width: '100%' }}>
            <WordPad
              key={`${item.record.id}#${seen}`}
              strokes={glyphStrokes}
              label={gloss}
              onDone={setWritten}
              // A character still in box 1 (new, or missed last time) is
              // drawn for the learner first: watch, then write.
              demo={item.record.box === 1}
            />
            {written && say(item.card.target) && <p style={{ ...small, textAlign: 'center' }}>{say(item.card.target)}</p>}
            {written && readings && <p style={{ ...small, textAlign: 'center', marginTop: '4px' }}>{readings}</p>}
          </div>
        )}
        {!flipped && item.direction === 'produce' && produceHint && (
          // « un, une » alone asks for a, an or one; the example with the word
          // blanked asks for one of them (Tony, 2026-10-06). When the word
          // cannot be found in its example (an irregular form), the translated
          // example is shown instead: it fixes the sense without the answer.
          <p lang={produceHint.lang} style={{ ...small, fontSize: '17px', lineHeight: 1.5, marginTop: '16px' }}>
            {produceHint.text}
          </p>
        )}
        {!flipped && item.direction === 'recognise' && item.card.example && (hinted ? (
          // The sentence is the situation: « a » alone is a letter, « I have a
          // dog. » is a word to understand (Tony, 2026-10-07). Only the
          // sentence in the language learned: its translation is the answer.
          // Hidden behind the eye, and opening it costs half a point.
          <p lang={targetLang} style={{ ...small, fontSize: '17px', lineHeight: 1.5, marginTop: '16px' }}>
            {item.card.example.target}
            {say(item.card.example.target)}
          </p>
        ) : (
          <button className="ml-btn ml-btn-ghost" style={{ marginTop: '16px' }} onClick={() => setHinted(true)}>
            <EyeIcon />
            <span>{t('session.showSentence')}</span>
            <span className="ml-kbd" aria-hidden="true">{t('session.hintCost', { n: num(HINT_COST) })}</span>
          </button>
        ))}
        {(flipped || learning) && (
          <div className="ml-back">
            <p lang={item.direction === 'recognise' ? lang : targetLang} style={{ fontSize: '27px', lineHeight: 1.4, margin: 0, fontWeight: 600 }}>
              {back}
              {(item.direction === 'produce' || isGlyph) && say(item.card.target)}
            </p>
            {readings && <p style={{ ...small, fontSize: '14px' }}>{readings}</p>}
            {item.card.variants && item.card.variants.length > 0 && (
              <p lang={targetLang} style={small}>{t('session.variants', { list: item.card.variants.join(', ') })}</p>
            )}
            {item.card.example && (
              <div className="ml-example">
                <p lang={targetLang} style={{ margin: 0, fontSize: '17px', lineHeight: 1.5 }}>{item.card.example.target}{say(item.card.example.target)}</p>
                {item.card.example.gloss[lang] && (
                  <p lang={lang} style={{ ...small, marginTop: '4px', fontSize: '14px' }}>{item.card.example.gloss[lang]}</p>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {learning ? (
        <button className="ml-btn ml-btn-primary" onClick={learnNext}>
          <span>{t('write.gotIt')}</span>
          <kbd className="ml-kbd" aria-hidden="true" style={{ color: 'inherit', borderColor: 'currentColor', background: 'transparent' }}>{t('session.keySpace')}</kbd>
        </button>
      ) : onPad ? (
        written && (
          <button className="ml-btn ml-btn-primary" onClick={() => answer(written.known, written.points)}>
            <span>{t('write.next')}</span>
            <kbd className="ml-kbd" aria-hidden="true" style={{ color: 'inherit', borderColor: 'currentColor', background: 'transparent' }}>{t('session.keySpace')}</kbd>
          </button>
        )
      ) : flipped ? (
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="ml-btn ml-btn-bad" style={{ flex: 1, padding: '16px' }} onClick={() => answer(false)}>
            <span>{t('session.didNotKnow')}</span>
            <kbd className="ml-kbd" aria-hidden="true">1</kbd>
          </button>
          <button className="ml-btn ml-btn-good" style={{ flex: 1, padding: '16px' }} onClick={() => answer(true)}>
            <span>{t('session.knew')}</span>
            <kbd className="ml-kbd" aria-hidden="true">2</kbd>
          </button>
        </div>
      ) : (
        <button className="ml-btn ml-btn-primary" onClick={() => setFlipped(true)}>
          <span>{t('session.show')}</span>
          <kbd className="ml-kbd" aria-hidden="true" style={{ color: 'inherit', borderColor: 'currentColor', background: 'transparent' }}>{t('session.keySpace')}</kbd>
        </button>
      )}

      {notice && <p role="status" style={small}>{notice}</p>}
      {speaker.kind === 'none' && <p style={small}>{t('session.noVoice', { lang: learningName })}</p>}

      <div style={{ display: 'flex', gap: '12px' }}>
        <button className="ml-btn ml-btn-ghost" onClick={onLeave}>{t('session.leave')}</button>
        <div style={{ flex: 1 }} />
        <button className="ml-btn ml-btn-ghost ml-btn-warn" onClick={report}>{t('session.report')}</button>
      </div>
    </div>
  );
}


function EyeIcon(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function SpeakButton({ label, onClick }: { label: string; onClick: () => void }): JSX.Element {
  return (
    <button className="ml-speak" aria-label={label} title={label} onClick={onClick}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M11 5 6 9H2v6h4l5 4V5z" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        <path d="M19 5a10 10 0 0 1 0 14" />
      </svg>
    </button>
  );
}
