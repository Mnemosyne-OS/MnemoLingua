import { describe, expect, it, vi } from 'vitest';
import { downloadStrokes, judgeStroke, parseKanjiVg, pathPoints, svgUrl } from './strokes';
import { padReduce, padResult, padStart, MISSES_BEFORE_HINT } from './pad';

// The three strokes of あ, from KanjiVG r20260714 (© Ulrich Apel, CC BY-SA 3.0).
const A = [
  'M31.01,33c0.88,0.88,2.75,1.82,5.25,1.75c8.62-0.25,20-2.12,29.5-4.25c1.51-0.34,4.62-0.88,6.62-0.5',
  'M49.76,17.62c0.88,1,1.82,3.26,1.38,5.25c-3.75,16.75-6.25,38.13-5.13,53.63c0.41,5.7,1.88,10.88,3.38,13.62',
  'M65.63,44.12c0.75,1.12,1.16,4.39,0.5,6.12c-4.62,12.26-11.24,23.76-25.37,35.76c-6.86,5.83-15.88,3.75-16.25-8.38c-0.34-10.87,13.38-23.12,32.38-26.74c12.42-2.37,27,1.38,30.5,12.75c4.05,13.18-3.76,26.37-20.88,30.49',
];
const SVG = `<svg><g id="kvg:StrokePaths_03042"><g id="kvg:03042" kvg:element="あ">
<path id="kvg:03042-s1" d="${A[0]}"/>
<g><path id="kvg:03042-s3" d="${A[2]}"/></g>
<path id="kvg:03042-s2" d="${A[1]}"/>
</g></g></svg>`;

describe('reading KanjiVG', () => {
  it('names the file by the code point, pinned to a release', () => {
    expect(svgUrl('あ')).toBe('https://raw.githubusercontent.com/KanjiVG/kanjivg/r20260714/kanji/03042.svg');
  });

  it('orders the strokes by their number, never by where they sit in the file', () => {
    expect(parseKanjiVg(SVG)).toEqual(A);
  });

  it('refuses a file with a hole in the order or no stroke at all', () => {
    expect(parseKanjiVg(SVG.replace(/<path id="kvg:03042-s2"[^>]*>/, ''))).toBeNull();
    expect(parseKanjiVg('<svg></svg>')).toBeNull();
  });

  it('follows relative curves: the first stroke of あ goes left to right', () => {
    const pts = pathPoints(A[0]!);
    expect(pts[0]).toEqual({ x: 31.01, y: 33 });
    expect(pts[pts.length - 1]!.x).toBeCloseTo(72.5, 0);
  });
});

describe('judging a stroke', () => {
  const traced = (d: string) => pathPoints(d);

  it('accepts the stroke itself, and a hand a little off it', () => {
    expect(judgeStroke(traced(A[0]!), A[0]!)).toEqual({ ok: true });
    const shaky = traced(A[1]!).map((p, k) => ({ x: p.x + 3 + 2 * Math.sin(k / 4), y: p.y + 2 }));
    expect(judgeStroke(shaky, A[1]!)).toEqual({ ok: true });
  });

  it('refuses the right stroke drawn the other way round, and says so', () => {
    expect(judgeStroke([...traced(A[0]!)].reverse(), A[0]!)).toEqual({ ok: false, why: 'reversed' });
    expect(judgeStroke([...traced(A[1]!)].reverse(), A[1]!)).toEqual({ ok: false, why: 'reversed' });
  });

  it('refuses another stroke of the same character', () => {
    expect(judgeStroke(traced(A[1]!), A[0]!).ok).toBe(false);
    expect(judgeStroke(traced(A[2]!), A[1]!).ok).toBe(false);
  });

  it('refuses a dot where a stroke was expected', () => {
    expect(judgeStroke([{ x: 31, y: 33 }, { x: 33, y: 33 }], A[0]!)).toEqual({ ok: false, why: 'tooShort' });
  });
});

describe('the pad', () => {
  const draw = (k: number) => ({ type: 'stroke' as const, points: pathPoints(A[k]!) });

  it('a character written in order, without a miss, is known and worth 1', () => {
    let s = padStart();
    for (const k of [0, 1, 2]) s = padReduce(A, s, draw(k));
    expect(s.done).toBe(true);
    expect(padResult(s)).toEqual({ known: true, points: 1 });
  });

  it('the right stroke at the wrong time is a miss: the order is what is taught', () => {
    const s = padReduce(A, padStart(), draw(1));
    expect(s.index).toBe(0);
    expect(s.total).toBe(1);
  });

  it('shows the stroke after three misses, and the character is then half known', () => {
    let s = padStart();
    for (let k = 0; k < MISSES_BEFORE_HINT; k++) s = padReduce(A, s, draw(2));
    expect(s.showing).toBe(0);
    expect(s.hinted).toBe(true);
    for (const k of [0, 1, 2]) s = padReduce(A, s, draw(k));
    expect(padResult(s)).toEqual({ known: false, points: 0.5 });
  });

  it('a miss without a hint costs half a point, not the box', () => {
    let s = padReduce(A, padStart(), draw(1));
    for (const k of [0, 1, 2]) s = padReduce(A, s, draw(k));
    expect(padResult(s)).toEqual({ known: true, points: 0.5 });
  });

  it('giving up shows the whole order and earns nothing', () => {
    const s = padReduce(A, padStart(), { type: 'giveUp' });
    expect(s).toMatchObject({ done: true, showing: 'all' });
    expect(padResult(s)).toEqual({ known: false, points: 0 });
  });
});

describe('the download', () => {
  it('keeps what arrived and names what did not, with its reason', async () => {
    const fetchImpl = vi.fn((url: string) => Promise.resolve(
      url.endsWith('03042.svg') ? new Response(SVG) : new Response('nope', { status: 404 }),
    )) as unknown as typeof fetch;
    const progress: number[] = [];
    const r = await downloadStrokes(['あ', 'い'], { fetchImpl, onProgress: (p) => progress.push(p.done) });
    expect(r.strokes).toEqual({ あ: A });
    expect(r.failed).toEqual([{ char: 'い', error: 'HTTP 404' }]);
    expect(progress.sort()).toEqual([1, 2]);
  });

  it('names a file that never arrives instead of waiting for it', async () => {
    const fetchImpl = vi.fn((_: string, init?: RequestInit) => new Promise<Response>((_r, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal!.reason as Error));
    })) as unknown as typeof fetch;
    const r = await downloadStrokes(['あ'], { fetchImpl, timeoutMs: 20 });
    expect(r.failed).toEqual([{ char: 'あ', error: 'TIMEOUT' }]);
  });
});
