/**
 * strokes.ts — the strokes of a written character: where they come from, how
 * they are read, and how a stroke drawn by the learner is judged.
 *
 * The data is KanjiVG (CC BY-SA 3.0), and the LEARNER downloads it, from the
 * cartridge, by a gesture (doc 138 §13): it is never shipped in the bundle.
 * One small SVG per character on raw.githubusercontent.com (CORS open), pinned
 * to a release tag so every learner draws the same strokes.
 *
 * A KanjiVG stroke is a CENTRELINE (`fill:none`, drawn with a pen width), so
 * the path itself is what the finger should follow: no outline, no separate
 * median. Coordinates live in a 109 × 109 box.
 */

export const KANJIVG = {
  name: 'KanjiVG',
  author: 'Ulrich Apel',
  tag: 'r20260714',
  licence: 'CC BY-SA 3.0',
  licenceUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
  home: 'https://kanjivg.tagaini.net/',
} as const;

/** The box every KanjiVG coordinate lives in. */
export const BOX = 109;

/** File of one character: its code point, five lower-case hex digits. */
export function svgUrl(char: string): string {
  const cp = char.codePointAt(0)?.toString(16).padStart(5, '0') ?? '';
  return `https://raw.githubusercontent.com/KanjiVG/kanjivg/${KANJIVG.tag}/kanji/${cp}.svg`;
}

/**
 * The stroke paths of a KanjiVG file, in writing order. The order is read from
 * the `-sN` id, never from the position in the file: a stroke inside a nested
 * group comes later in the text than its number says. Null when the file has
 * no stroke, or a number is missing (a stroke order with a hole is not one).
 */
export function parseKanjiVg(svg: string): string[] | null {
  const found = new Map<number, string>();
  const re = /<path\b[^>]*\bid="kvg:[0-9a-f]+(?:-[a-z0-9]+)*-s(\d+)"[^>]*\bd="([^"]+)"/gi;
  for (const m of svg.matchAll(re)) found.set(Number(m[1]), m[2]!);
  // Some files write `d` before `id`.
  const re2 = /<path\b[^>]*\bd="([^"]+)"[^>]*\bid="kvg:[0-9a-f]+(?:-[a-z0-9]+)*-s(\d+)"/gi;
  for (const m of svg.matchAll(re2)) if (!found.has(Number(m[2]))) found.set(Number(m[2]), m[1]!);
  if (found.size === 0) return null;
  const out: string[] = [];
  for (let n = 1; n <= found.size; n++) {
    const d = found.get(n);
    if (!d) return null;
    out.push(d);
  }
  return out;
}

// ── Where strokes come from: one source per written language ────────────

/** One dataset of strokes the learner can download. Everything the setup
 *  screen and the credit line say about it is read from here. */
export interface StrokeSource {
  id: string;
  name: string;
  author: string;
  /** The pinned release: part of the cache key, never mixed with another. */
  tag: string;
  licence: string;
  licenceUrl: string;
  home: string;
  /** Average file size, for the size announced before the button. */
  kbPerFile: number;
  url(char: string): string;
  parse(text: string): string[] | null;
}

/** KanjiVG, for Japanese. 2,1 KB a file: the mean of the 92 kana files,
 *  measured on 2026-10-07. */
export const KANJIVG_SOURCE: StrokeSource = {
  id: 'kanjivg', ...KANJIVG, licenceUrl: KANJIVG.licenceUrl, kbPerFile: 2.1, url: svgUrl, parse: parseKanjiVg,
};

/**
 * hanzi-writer-data, for Chinese: one JSON per character on jsDelivr (CORS
 * open), pinned to 2.0.1. Its strokes are filled OUTLINES plus a MEDIAN per
 * stroke; the median is the centreline, the same thing a KanjiVG path is, so
 * only the medians are kept (`medianPath`). Graphics derived from Arphic
 * fonts, under the Arphic Public License.
 */
export const HANZI_SOURCE: StrokeSource = {
  id: 'hanzi-writer-data',
  name: 'hanzi-writer-data',
  author: 'Make Me a Hanzi, David Chanin',
  tag: '2.0.1',
  licence: 'Arphic Public License',
  licenceUrl: 'https://github.com/chanind/hanzi-writer-data/blob/master/ARPHICPL.TXT',
  home: 'https://github.com/chanind/hanzi-writer-data',
  // Estimated from 我 (2 476 bytes), not measured on the whole list.
  kbPerFile: 2.5,
  url: (char) => `https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/${encodeURIComponent(char)}.json`,
  parse: parseHanziWriter,
};

/** The stroke source of a language, or null when it has none. */
export function strokeSourceFor(lang: string): StrokeSource {
  return lang === 'zh' ? HANZI_SOURCE : KANJIVG_SOURCE;
}

/**
 * A hanzi-writer median (points in a 1024 box with the y axis pointing UP,
 * baseline at 900) as an SVG path in the 109 box KanjiVG uses, smoothed with
 * quadratic curves through the midpoints so it reads as a brush stroke.
 */
export function medianPath(points: readonly (readonly number[])[]): string | null {
  const pts = points
    .filter((p) => p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .map((p) => ({ x: (p[0]! * BOX) / 1024, y: ((900 - p[1]!) * BOX) / 1024 }));
  if (pts.length < 2) return null;
  const f = (n: number): string => (Math.round(n * 100) / 100).toString();
  let d = `M${f(pts[0]!.x)},${f(pts[0]!.y)}`;
  for (let k = 1; k < pts.length - 1; k++) {
    const mid = { x: (pts[k]!.x + pts[k + 1]!.x) / 2, y: (pts[k]!.y + pts[k + 1]!.y) / 2 };
    d += `Q${f(pts[k]!.x)},${f(pts[k]!.y)},${f(mid.x)},${f(mid.y)}`;
  }
  d += `L${f(pts[pts.length - 1]!.x)},${f(pts[pts.length - 1]!.y)}`;
  return d;
}

/** The strokes of a hanzi-writer-data file, in writing order. Null when the
 *  file is not one, or a stroke has no usable median. */
export function parseHanziWriter(text: string): string[] | null {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return null; }
  if (typeof raw !== 'object' || raw === null) return null;
  const medians = (raw as { medians?: unknown }).medians;
  if (!Array.isArray(medians) || medians.length === 0) return null;
  const out: string[] = [];
  for (const m of medians) {
    if (!Array.isArray(m)) return null;
    const d = medianPath(m as number[][]);
    if (!d) return null;
    out.push(d);
  }
  return out;
}

// ── Geometry ────────────────────────────────────────────────────────────────

export interface Pt { x: number; y: number }

/**
 * Points along an SVG path: M, L, H, V, C, S, Q, T, Z, absolute and relative —
 * what KanjiVG writes (M c C s S l). Each curve is cut into a few segments,
 * enough to measure, not to draw. Written by hand because jsdom has no
 * `getPointAtLength`, and the matcher must be testable.
 */
export function pathPoints(d: string, perCurve = 12): Pt[] {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? [];
  const pts: Pt[] = [];
  let i = 0;
  let cmd = '';
  let x = 0; let y = 0; let sx = 0; let sy = 0;
  let cx = 0; let cy = 0; // last control point, for S / T
  let prev = '';
  const num = (): number => Number(tokens[i++]);
  const cubic = (x1: number, y1: number, x2: number, y2: number, ex: number, ey: number): void => {
    for (let k = 1; k <= perCurve; k++) {
      const t = k / perCurve; const u = 1 - t;
      pts.push({
        x: u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * ex,
        y: u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * ey,
      });
    }
    cx = x2; cy = y2; x = ex; y = ey;
  };
  const quad = (x1: number, y1: number, ex: number, ey: number): void => {
    for (let k = 1; k <= perCurve; k++) {
      const t = k / perCurve; const u = 1 - t;
      pts.push({ x: u * u * x + 2 * u * t * x1 + t * t * ex, y: u * u * y + 2 * u * t * y1 + t * t * ey });
    }
    cx = x1; cy = y1; x = ex; y = ey;
  };
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i]!)) cmd = tokens[i++]!;
    else if (!cmd) { i++; continue; }
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0; const oy = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case 'M': {
        x = ox + num(); y = oy + num(); sx = x; sy = y; pts.push({ x, y });
        cmd = rel ? 'l' : 'L'; // extra pairs after M are line-tos
        break;
      }
      case 'L': x = ox + num(); y = oy + num(); pts.push({ x, y }); break;
      case 'H': x = ox + num(); pts.push({ x, y }); break;
      case 'V': y = oy + num(); pts.push({ x, y }); break;
      case 'C': {
        const x1 = ox + num(); const y1 = oy + num(); const x2 = ox + num(); const y2 = oy + num();
        cubic(x1, y1, x2, y2, ox + num(), oy + num());
        break;
      }
      case 'S': {
        const smooth = /[CS]/i.test(prev);
        const x1 = smooth ? 2 * x - cx : x; const y1 = smooth ? 2 * y - cy : y;
        const x2 = ox + num(); const y2 = oy + num();
        cubic(x1, y1, x2, y2, ox + num(), oy + num());
        break;
      }
      case 'Q': {
        const x1 = ox + num(); const y1 = oy + num();
        quad(x1, y1, ox + num(), oy + num());
        break;
      }
      case 'T': {
        const smooth = /[QT]/i.test(prev);
        quad(smooth ? 2 * x - cx : x, smooth ? 2 * y - cy : y, ox + num(), oy + num());
        break;
      }
      case 'Z': x = sx; y = sy; pts.push({ x, y }); break;
      default: i++; // an arc or unknown command: skip its token, never loop
    }
    prev = cmd;
  }
  return pts.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
}

function dist(a: Pt, b: Pt): number { return Math.hypot(a.x - b.x, a.y - b.y); }

export function polylineLength(pts: readonly Pt[]): number {
  let len = 0;
  for (let k = 1; k < pts.length; k++) len += dist(pts[k - 1]!, pts[k]!);
  return len;
}

/** `n` points evenly spaced along a polyline. */
export function resample(pts: readonly Pt[], n = 32): Pt[] {
  if (pts.length === 0) return [];
  if (pts.length === 1) return Array.from({ length: n }, () => ({ ...pts[0]! }));
  const total = polylineLength(pts);
  if (total === 0) return Array.from({ length: n }, () => ({ ...pts[0]! }));
  const step = total / (n - 1);
  const out: Pt[] = [{ ...pts[0]! }];
  let acc = 0;
  for (let k = 1; k < pts.length && out.length < n; k++) {
    let a = pts[k - 1]!; const b = pts[k]!;
    let seg = dist(a, b);
    while (acc + seg >= step && out.length < n) {
      const t = (step - acc) / seg;
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      out.push(p);
      a = p; seg = dist(a, b); acc = 0;
    }
    acc += seg;
  }
  while (out.length < n) out.push({ ...pts[pts.length - 1]! });
  return out;
}

function meanDistance(a: readonly Pt[], b: readonly Pt[]): number {
  let sum = 0;
  for (let k = 0; k < a.length; k++) sum += dist(a[k]!, b[k]!);
  return sum / a.length;
}

// ── Judging one stroke ──────────────────────────────────────────────────────

/** Tolerances in KanjiVG units (the box is 109 wide). A finger on a trackpad
 *  is not a brush: these are loose on purpose, and tight on what is taught —
 *  where the stroke starts, where it goes, and that it is THIS stroke. */
export const TOLERANCE = { start: 22, end: 22, mean: 16, minLength: 0.35, maxLength: 2.4 } as const;

export type StrokeVerdict =
  | { ok: true }
  | { ok: false; why: 'tooShort' | 'reversed' | 'shape' | 'start' | 'end' };

/**
 * Is `drawn` (box coordinates) the stroke `expected` (an SVG path)? Four
 * things are checked, in the order a teacher would name them: the stroke was
 * drawn at all, it goes the right WAY, it starts and ends where it should, and
 * its shape follows the path.
 */
export function judgeStroke(drawn: readonly Pt[], expected: string): StrokeVerdict {
  const want = pathPoints(expected);
  const wantLen = polylineLength(want);
  const gotLen = polylineLength(drawn);
  if (drawn.length < 2 || gotLen < wantLen * TOLERANCE.minLength || gotLen < 4) return { ok: false, why: 'tooShort' };
  const a = resample(drawn);
  const b = resample(want);
  const forward = meanDistance(a, b);
  const backward = meanDistance(a, [...b].reverse());
  // Drawn the other way round: the shape fits only when read backwards.
  if (backward + 4 < forward && backward <= TOLERANCE.mean) return { ok: false, why: 'reversed' };
  if (dist(a[0]!, b[0]!) > TOLERANCE.start) return { ok: false, why: 'start' };
  if (dist(a[a.length - 1]!, b[b.length - 1]!) > TOLERANCE.end) return { ok: false, why: 'end' };
  if (forward > TOLERANCE.mean || gotLen > wantLen * TOLERANCE.maxLength) return { ok: false, why: 'shape' };
  return { ok: true };
}

// ── The download, by the learner ────────────────────────────────────────────

export interface DownloadProgress { done: number; total: number }

export interface DownloadResult {
  strokes: Record<string, string[]>;
  /** Characters that did not arrive, each with the reason. */
  failed: { char: string; error: string }[];
}

/** How long one file may take before it is named as failed. */
export const FILE_TIMEOUT_MS = 15_000;

/**
 * Fetches the strokes of `chars`, a few at a time. Never rejects: a file that
 * fails or does not arrive is listed with its reason, and the others are kept.
 */
export async function downloadStrokes(
  chars: readonly string[],
  opts: {
    onProgress?: (p: DownloadProgress) => void;
    signal?: AbortSignal;
    fetchImpl?: typeof fetch;
    concurrency?: number;
    timeoutMs?: number;
    source?: StrokeSource;
  } = {},
): Promise<DownloadResult> {
  const source = opts.source ?? KANJIVG_SOURCE;
  const doFetch = opts.fetchImpl ?? fetch;
  const strokes: Record<string, string[]> = {};
  const failed: { char: string; error: string }[] = [];
  let next = 0;
  let done = 0;
  const one = async (char: string): Promise<void> => {
    const deadline = AbortSignal.timeout(opts.timeoutMs ?? FILE_TIMEOUT_MS);
    const signal = opts.signal ? AbortSignal.any([opts.signal, deadline]) : deadline;
    try {
      const res = await doFetch(source.url(char), { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = source.parse(await res.text());
      if (!parsed) throw new Error('NO_STROKES');
      strokes[char] = parsed;
    } catch (err) {
      // A deadline arrives as a DOMException, which is not always an Error.
      const name = (err as { name?: unknown } | null)?.name;
      failed.push({ char, error: name === 'TimeoutError' ? 'TIMEOUT' : err instanceof Error ? err.message : String(err) });
    } finally {
      done += 1;
      opts.onProgress?.({ done, total: chars.length });
    }
  };
  const worker = async (): Promise<void> => {
    while (next < chars.length) {
      if (opts.signal?.aborted) return;
      await one(chars[next++]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 6, chars.length) }, worker));
  return { strokes, failed };
}
