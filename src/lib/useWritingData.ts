/**
 * useWritingData — what a deck needs from the learner's downloads before it
 * can open (doc 138 §13 and §15): the strokes of its characters (KanjiVG),
 * and for a pack deck the dictionary its cards are made from (KANJIDIC2).
 *
 * Read from this computer when the deck opens; what is missing goes through
 * StrokeSetup, and is fetched only when the learner presses its button. One
 * press does everything that is missing, in order: the dictionary first (it
 * says which kanji there are), then their strokes.
 *
 * 🎭 What the screen can be told, never merged: still reading this computer;
 * something to download (and what); downloading (the dictionary, then N of M
 * files); some files failed (named); the dictionary failed (its reason); and
 * « downloaded but this computer cannot keep it », a banner, not a failure.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SetupPhase } from '../components/StrokeSetup';
import { buildPackDeck, downloadKanjidic, packProblem, parseKanjidic, type KanjiEntry } from './kanjiPack';
import { log } from './log';
import { strokeCache } from './strokeCache';
import { downloadStrokes } from './strokes';
import type { Deck } from './types';

/** Characters of a deck whose strokes are drawn (glyph cards). */
export function glyphChars(deck: Deck): string[] {
  return [...new Set(deck.themes.flatMap((th) => th.cards.filter((c) => c.kind === 'glyph').map((c) => c.target)))];
}

const packKey = (deck: Deck): string | null => (deck.pack ? `${deck.pack.source}@jlpt${deck.pack.jlpt}` : null);

export type WritingGate =
  | { kind: 'none' }
  | { kind: 'checking' }
  | { kind: 'setup'; needsPack: boolean; strokesMissing: number | null; phase: SetupPhase };

export interface WritingData {
  /** The deck to show: the file itself, or the pack deck once built. Null
   *  while a pack deck has no dictionary yet. */
  deck: Deck | null;
  strokes: Record<string, string[]>;
  gate: WritingGate;
  cacheProblem: string | null;
  download: () => void;
  cancel: () => void;
}

const errText = (err: unknown): string => {
  const name = (err as { name?: unknown } | null)?.name;
  return name === 'TimeoutError' ? 'TIMEOUT' : err instanceof Error ? err.message : String(err);
};

export function useWritingData(raw: Deck | null): WritingData {
  const [strokes, setStrokes] = useState<Record<string, string[]>>({});
  // Each answer is keyed on the deck it was read for: an answer for another
  // deck would open this one for a frame.
  const [packFor, setPackFor] = useState<{ deckId: string; entries: KanjiEntry[] | null } | null>(null);
  const [missingFor, setMissingFor] = useState<{ deckId: string; list: string[] } | null>(null);
  const [phase, setPhase] = useState<SetupPhase>({ kind: 'intro' });
  const [cacheProblem, setCacheProblem] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const rawId = raw?.id ?? null;
  const key = raw ? packKey(raw) : null;

  // 1. The dictionary of a pack deck, from this computer.
  useEffect(() => {
    if (!raw || !key) return;
    let alive = true;
    strokeCache().readPack(key)
      .then((entries) => { if (alive) setPackFor({ deckId: raw.id, entries: Array.isArray(entries) ? entries as KanjiEntry[] : null }); })
      .catch((err: unknown) => {
        log.warn('pack', 'this computer cannot keep the dictionary', { error: errText(err) });
        if (!alive) return;
        setCacheProblem(errText(err));
        setPackFor({ deckId: raw.id, entries: null });
      });
    return () => { alive = false; };
  }, [raw, key]);

  const packEntries = raw && key && packFor?.deckId === raw.id ? packFor.entries : undefined;
  const deck = useMemo<Deck | null>(() => {
    if (!raw) return null;
    if (!raw.pack) return raw;
    return packEntries ? buildPackDeck(raw, raw.pack, packEntries) : null;
  }, [raw, packEntries]);

  // 2. The strokes of the deck's characters, from this computer.
  const chars = useMemo(() => (deck ? glyphChars(deck) : []), [deck]);
  const setMissing = useCallback((deckId: string, list: string[]) => setMissingFor({ deckId, list }), []);
  useEffect(() => {
    if (!deck) return;
    if (chars.length === 0) { setMissing(deck.id, []); return; }
    let alive = true;
    strokeCache().read(chars)
      .then(({ found, missing }) => {
        if (!alive) return;
        setStrokes((s) => ({ ...s, ...found }));
        setMissing(deck.id, missing);
      })
      .catch((err: unknown) => {
        log.warn('strokes', 'this computer cannot keep the strokes', { error: errText(err) });
        if (!alive) return;
        setCacheProblem(errText(err));
        setMissing(deck.id, chars);
      });
    return () => { alive = false; };
  }, [deck, chars, setMissing]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const missing = deck && missingFor?.deckId === deck.id ? missingFor.list : null;

  const fetchStrokes = async (deckId: string, todo: string[], signal: AbortSignal): Promise<void> => {
    if (todo.length === 0) { setMissing(deckId, []); setPhase({ kind: 'intro' }); return; }
    setPhase({ kind: 'downloading', done: 0, total: todo.length });
    const { strokes: got, failed } = await downloadStrokes(todo, { signal, onProgress: (p) => setPhase({ kind: 'downloading', ...p }) });
    // What arrived is kept even when the learner cancelled: it is the same
    // data, and throwing it away makes the next press fetch it again.
    if (Object.keys(got).length > 0) {
      try { await strokeCache().write(got); } catch (err) {
        log.warn('strokes', 'downloaded but not kept', { error: errText(err) });
        setCacheProblem(errText(err));
      }
      setStrokes((s) => ({ ...s, ...got }));
    }
    setMissing(deckId, todo.filter((c) => !got[c]));
    setPhase(signal.aborted ? { kind: 'intro' } : failed.length > 0 ? { kind: 'failed', failed } : { kind: 'intro' });
  };

  const download = (): void => {
    if (!raw) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const run = async (): Promise<void> => {
      let target = deck;
      if (raw.pack && key && !packEntries) {
        setPhase({ kind: 'packing' });
        let entries: KanjiEntry[];
        try {
          entries = parseKanjidic(await downloadKanjidic({ signal: ctrl.signal }), raw.pack.jlpt);
          const problem = packProblem(entries);
          if (problem) throw new Error(problem);
        } catch (err) {
          if (ctrl.signal.aborted) { setPhase({ kind: 'intro' }); return; }
          log.error('pack', 'the dictionary did not arrive', { error: errText(err) });
          setPhase({ kind: 'packFailed', error: errText(err) });
          return;
        }
        try { await strokeCache().writePack(key, entries); } catch (err) {
          log.warn('pack', 'downloaded but not kept', { error: errText(err) });
          setCacheProblem(errText(err));
        }
        setPackFor({ deckId: raw.id, entries });
        target = buildPackDeck(raw, raw.pack, entries);
      }
      if (!target) return;
      const all = glyphChars(target);
      const known = await strokeCache().read(all).catch(() => ({ found: {}, missing: all }));
      setStrokes((s) => ({ ...s, ...known.found }));
      await fetchStrokes(target.id, known.missing, ctrl.signal);
    };
    void run().catch((err: unknown) => {
      log.error('setup', 'the download stopped', { error: errText(err) });
      setPhase({ kind: 'packFailed', error: errText(err) });
    });
  };

  let gate: WritingGate = { kind: 'none' };
  if (raw?.pack && packEntries === undefined) gate = { kind: 'checking' };
  else if (raw?.pack && packEntries === null) gate = { kind: 'setup', needsPack: true, strokesMissing: null, phase };
  else if (deck && chars.length > 0 && missing === null) gate = { kind: 'checking' };
  else if (missing && missing.length > 0) gate = { kind: 'setup', needsPack: false, strokesMissing: missing.length, phase };

  return { deck: rawId ? deck : null, strokes, gate, cacheProblem, download, cancel: () => abortRef.current?.abort() };
}
