/**
 * update.ts — is a newer MnemoLingua published than the one running?
 *
 * A cartridge left open on the plateau never hears that the Hub has an update
 * (Tony, 2026-10-07: « si elle reste ouverte ici personne ne sait »). The host
 * gives a cartridge no « update available » nor « open the Hub » action, so
 * the cartridge reads its own manifest on its public repo (raw.githubusercontent,
 * CORS open) at most ONCE A DAY (Tony, 2026-10-07), across closing and
 * reopening the window, and SAYS what it found.
 *
 * 🎭 Three answers, never two: newer (a version is named), up to date, and
 * unknown (offline, refused, unreadable). Unknown shows nothing extra: the
 * badge keeps the running version, and a failed check is logged, never shown
 * as « up to date ».
 */
import { useEffect, useState } from 'react';
import manifest from '../../mnemo-plugin.json';
import { log } from './log';

/** The version running, read from the manifest the bundle was built with. */
export const RUNNING_VERSION: string = manifest.version;

export const REPO_URL = 'https://github.com/Mnemosyne-OS/MnemoLingua';
const MANIFEST_URL = 'https://raw.githubusercontent.com/Mnemosyne-OS/MnemoLingua/main/mnemo-plugin.json';

/** At most one request in this long, whether the window stays open or is
 *  reopened: the time of the last ATTEMPT is remembered, a failed one too. */
export const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;

/** Where the last attempt is remembered. A per-viewer convenience: lost, it
 *  costs one more request, never a wrong answer. */
const MEMO_KEY = 'mnemo-lingua:update-check';

export interface CheckMemo {
  /** When the last request was made (ms). */
  attemptAt: number;
  /** The last version READ; a failed attempt keeps the one before. */
  published: string | null;
}

/** How long to wait before the next request: 0 = now. */
export function msUntilNextCheck(memo: CheckMemo | null, now: number): number {
  if (!memo || !Number.isFinite(memo.attemptAt) || memo.attemptAt > now) return 0;
  return Math.max(0, memo.attemptAt + CHECK_EVERY_MS - now);
}

function readMemo(): CheckMemo | null {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(MEMO_KEY) ?? 'null');
    if (typeof raw !== 'object' || raw === null) return null;
    const { attemptAt, published } = raw as { attemptAt?: unknown; published?: unknown };
    if (typeof attemptAt !== 'number') return null;
    return { attemptAt, published: typeof published === 'string' ? published : null };
  } catch (err) {
    log.warn('update', 'the last check could not be read', { error: String(err) });
    return null;
  }
}

function writeMemo(memo: CheckMemo): void {
  try {
    localStorage.setItem(MEMO_KEY, JSON.stringify(memo));
  } catch (err) {
    log.warn('update', 'the last check could not be kept', { error: String(err) });
  }
}

const CHECK_TIMEOUT_MS = 15_000;

/** 1 when a > b, -1 when a < b, 0 when equal or unreadable. Numeric parts only. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/).map(Number);
  const pb = b.split(/[.-]/).map(Number);
  if (pa.some(Number.isNaN) || pb.some(Number.isNaN)) return 0;
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

export type UpdateState =
  | { kind: 'unknown' }
  | { kind: 'current' }
  | { kind: 'newer'; version: string };

/** The published version, or null when it cannot be read. Never rejects. */
export async function fetchPublishedVersion(fetchImpl: typeof fetch = fetch): Promise<string | null> {
  try {
    const res = await fetchImpl(MANIFEST_URL, { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS), cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body: unknown = await res.json();
    const v = (body as { version?: unknown } | null)?.version;
    if (typeof v !== 'string') throw new Error('NO_VERSION');
    return v;
  } catch (err) {
    log.warn('update', 'could not read the published version', { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/** What the published version says about the running one. */
export function updateStateOf(published: string | null, running = RUNNING_VERSION): UpdateState {
  if (published === null) return { kind: 'unknown' };
  return compareVersions(published, running) > 0 ? { kind: 'newer', version: published } : { kind: 'current' };
}

/** The answer: the remembered one at once, a request when a day has passed. */
export function useUpdateCheck(enabled: boolean): UpdateState {
  const [state, setState] = useState<UpdateState>({ kind: 'unknown' });
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const memo = readMemo();
    if (memo?.published) setState(updateStateOf(memo.published));
    const check = (): void => {
      const before = readMemo();
      writeMemo({ attemptAt: Date.now(), published: before?.published ?? null });
      void fetchPublishedVersion().then((v) => {
        // An unreadable check keeps what was known: a newer version found
        // yesterday is still newer when the network drops.
        if (v !== null) writeMemo({ attemptAt: Date.now(), published: v });
        if (alive && v !== null) setState(updateStateOf(v));
        if (alive) timer = setTimeout(check, CHECK_EVERY_MS);
      });
    };
    timer = setTimeout(check, msUntilNextCheck(memo, Date.now()));
    return () => { alive = false; clearTimeout(timer); };
  }, [enabled]);
  return state;
}
