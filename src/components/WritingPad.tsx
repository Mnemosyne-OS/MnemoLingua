/**
 * WritingPad.tsx — a character drawn from its strokes, and the pad on which
 * the learner draws it (doc 138 §13).
 *
 * The character is drawn from the downloaded strokes, never from a font: a
 * French Windows does not always have a Japanese one, and the stroke IS what
 * is taught. Mouse, pen and touch all arrive as pointer events; the pad
 * captures the pointer so a stroke that leaves the box is still one stroke.
 *
 * The rules live in lib/pad.ts; this file only turns pointers into points.
 */
import { useEffect, useReducer, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useI18n } from '../i18n/useI18n';
import { demoMs, HINT_COST, padReduce, padResult, padStart, STROKE_DRAW_S, STROKE_GAP_S, wordResult, type PadResult } from '../lib/pad';
import { BOX, type Pt } from '../lib/strokes';
import { small } from '../styles';

/** The character drawn from its strokes, one after the other when `animate`. */
export function Glyph({ strokes, size = 160, animate = false, label }: {
  strokes: readonly string[]; size?: number; animate?: boolean; label?: string;
}): JSX.Element {
  return (
    <svg viewBox={`0 0 ${BOX} ${BOX}`} width={size} height={size} role="img" aria-label={label} className="ml-glyph">
      {strokes.map((d, k) => (
        <path
          key={`${k}-${animate ? 'a' : 's'}`}
          d={d}
          pathLength={1}
          className={animate ? 'ml-stroke ml-stroke-draw' : 'ml-stroke'}
          style={animate ? { animationDelay: `${k * STROKE_GAP_S}s`, animationDuration: `${STROKE_DRAW_S}s` } : undefined}
        />
      ))}
    </svg>
  );
}

const PAD = 300;


/** The pad: turns pointer strokes into points for lib/pad.ts and reports once, when done. */
export function WritingPad({ strokes, label, onDone, demo = false }: {
  strokes: readonly string[];
  /** The character's name for screen readers (its reading). */
  label: string;
  onDone: (r: PadResult) => void;
  /**
   * The beginner's help (Tony, 2026-10-08: « on voit le sigle se dessiner et
   * ensuite c'est à l'humain »): the character draws itself first, stroke by
   * stroke, then it vanishes and the pad is the learner's. Free, never a hint:
   * it is how a new character is taught. « Watch again » replays it.
   */
  demo?: boolean;
}): JSX.Element {
  const { t, lang } = useI18n();
  const [state, dispatch] = useReducer(
    (s: ReturnType<typeof padStart>, a: Parameters<typeof padReduce>[2]) => padReduce(strokes, s, a),
    undefined,
    padStart,
  );
  const [live, setLive] = useState<Pt[]>([]);
  const drawing = useRef<Pt[] | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const reported = useRef(false);
  // A counter, not a boolean: « watch again » must restart the animation.
  const [demoRun, setDemoRun] = useState(demo ? 1 : 0);
  const [demoing, setDemoing] = useState(demo);
  useEffect(() => {
    if (demoRun === 0) return;
    setDemoing(true);
    const timer = setTimeout(() => setDemoing(false), demoMs(strokes.length));
    return () => clearTimeout(timer);
  }, [demoRun, strokes.length]);

  // Reported once, after the render that shows the finished character.
  useEffect(() => {
    if (state.done && !reported.current) {
      reported.current = true;
      onDone(padResult(state));
    }
  }, [state, onDone]);

  const toBox = (e: ReactPointerEvent): Pt | null => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0) return null;
    return { x: ((e.clientX - r.left) / r.width) * BOX, y: ((e.clientY - r.top) / r.height) * BOX };
  };

  const down = (e: ReactPointerEvent<SVGSVGElement>): void => {
    if (state.done || demoing) return;
    const p = toBox(e);
    if (!p) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = [p];
    setLive([p]);
  };
  const move = (e: ReactPointerEvent<SVGSVGElement>): void => {
    if (!drawing.current) return;
    const p = toBox(e);
    if (!p) return;
    drawing.current.push(p);
    setLive([...drawing.current]);
  };
  const up = (): void => {
    const pts = drawing.current;
    drawing.current = null;
    setLive([]);
    if (pts) dispatch({ type: 'stroke', points: pts });
  };

  const drawn = strokes.slice(0, state.index);
  const showing = state.showing === 'all' ? strokes : state.showing !== null ? [strokes[state.showing]!] : [];
  const showOffset = state.showing === 'all' ? 0 : state.index;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', width: '100%' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${BOX} ${BOX}`}
        className="ml-pad"
        style={{ width: `min(${PAD}px, 100%)`, aspectRatio: '1' }}
        role="img"
        aria-label={t('write.padLabel', { name: label })}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <line x1={BOX / 2} y1={4} x2={BOX / 2} y2={BOX - 4} className="ml-pad-guide" />
        <line x1={4} y1={BOX / 2} x2={BOX - 4} y2={BOX / 2} className="ml-pad-guide" />
        {demoing && strokes.map((d, k) => (
          <path
            key={`demo-${demoRun}-${k}`}
            d={d}
            pathLength={1}
            className="ml-stroke ml-stroke-demo ml-stroke-draw"
            style={{ animationDelay: `${k * STROKE_GAP_S}s`, animationDuration: `${STROKE_DRAW_S}s` }}
          />
        ))}
        {showing.map((d, k) => (
          <path
            key={`hint-${state.total}-${k}-${String(state.showing)}`}
            d={d}
            pathLength={1}
            className="ml-stroke ml-stroke-hint ml-stroke-draw"
            style={{ animationDelay: `${k * STROKE_GAP_S}s`, animationDuration: `${STROKE_DRAW_S}s` }}
            data-stroke={showOffset + k + 1}
          />
        ))}
        {drawn.map((d, k) => <path key={k} d={d} className="ml-stroke" />)}
        {state.done && state.gaveUp && strokes.map((d, k) => <path key={`g${k}`} d={d} className="ml-stroke" />)}
        {live.length > 1 && (
          <polyline points={live.map((p) => `${p.x},${p.y}`).join(' ')} className="ml-stroke ml-stroke-live" />
        )}
      </svg>

      <p role="status" style={{ ...small, minHeight: '20px', textAlign: 'center' }}>
        {demoing
          ? t('write.watch')
          : state.done
          ? (state.gaveUp ? t('write.gaveUp') : state.total === 0 && !state.hinted ? t('write.perfect') : t('write.finished'))
          : state.last
            ? t(`write.why.${state.last}`, { n: state.index + 1 })
            : demo && state.index === 0 && state.total === 0
              ? t('write.yourTurn', { total: strokes.length })
              : t('write.strokeOf', { n: state.index + 1, total: strokes.length })}
      </p>

      {!state.done && !demoing && (
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {demo && <button className="ml-btn ml-btn-ghost" onClick={() => setDemoRun((n) => n + 1)}>{t('write.watchAgain')}</button>}
          {/* In box 1 « watch again » shows the same drawing for free: offering
              « show the order » beside it would sell it for half a point. */}
          {!demo && <button className="ml-btn ml-btn-ghost" onClick={() => dispatch({ type: 'showOrder' })}>{t('write.showOrder', { n: new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(HINT_COST) })}</button>}
          <button className="ml-btn ml-btn-ghost" onClick={() => dispatch({ type: 'giveUp' })}>{t('write.giveUp')}</button>
        </div>
      )}
    </div>
  );
}

/**
 * A word on the pad (爸爸, 你好): one pad per character, in order, the
 * characters already written drawn small beside it. A single character is the
 * plain pad.
 */
export function WordPad({ strokes, label, onDone, demo = false }: {
  /** The strokes of each character of the word, in order. */
  strokes: readonly (readonly string[])[];
  label: string;
  onDone: (r: PadResult) => void;
  /** Each character draws itself before the learner writes it (WritingPad). */
  demo?: boolean;
}): JSX.Element {
  const { t } = useI18n();
  const [results, setResults] = useState<PadResult[]>([]);
  const index = results.length;
  const finish = (r: PadResult): void => {
    const next = [...results, r];
    setResults(next);
    if (next.length === strokes.length) onDone(wordResult(next));
  };
  if (strokes.length === 1) return <WritingPad strokes={strokes[0]!} label={label} onDone={onDone} demo={demo} />;
  const current = strokes[Math.min(index, strokes.length - 1)]!;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '100%' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        {strokes.map((s, k) => (
          <span key={k} className={k === index ? 'ml-word-slot ml-word-slot-on' : 'ml-word-slot'}>
            {k < index ? <Glyph strokes={s} size={44} /> : <span aria-hidden="true">{k + 1}</span>}
          </span>
        ))}
      </div>
      {index < strokes.length ? (
        <>
          <p style={small}>{t('write.charOf', { n: index + 1, total: strokes.length })}</p>
          <WritingPad key={index} strokes={current} label={label} onDone={finish} demo={demo} />
        </>
      ) : (
        <div style={{ display: 'flex', gap: '8px' }}>
          {strokes.map((s, k) => <Glyph key={k} strokes={s} size={110} />)}
        </div>
      )}
    </div>
  );
}

