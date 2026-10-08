/**
 * App.verif — probes of the verification pass of 2026-10-07 (session
 * 1911bb39): the stroke cache that cannot be opened, and a download the
 * learner cancels. Neither has a test in the shipped suite.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const host = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }));
vi.mock('./lib/host', () => ({ readState: host.read, writeState: host.write, hasHost: () => true, openExternal: vi.fn() }));

import App from './App';
import { setLang } from './i18n/useI18n';
import { __setStateForTests } from './lib/store';
import { __resetStrokeCacheForTests, strokeCache } from './lib/strokeCache';
import { emptyState } from './lib/types';

const SVG = '<svg><g kvg:element="x"><path id="kvg:03042-s1" d="M10,10c10,0,30,0,60,0"/></g></svg>';

/** An IndexedDB whose open() fails: the real idbStrokeCache path, not the memory fallback. */
function brokenIndexedDb() {
  return {
    open: () => {
      const r: { onsuccess: null | (() => void); onerror: null | (() => void); onupgradeneeded: null | (() => void); error: Error; result: unknown } =
        { onsuccess: null, onerror: null, onupgradeneeded: null, error: new Error('QuotaExceededError'), result: undefined };
      setTimeout(() => r.onerror?.(), 0);
      return r;
    },
  };
}

beforeEach(() => {
  host.read.mockReset().mockResolvedValue(null);
  host.write.mockReset().mockResolvedValue({ success: true });
  __setStateForTests(emptyState(), false);
  __resetStrokeCacheForTests();
});
afterEach(() => { vi.unstubAllGlobals(); __resetStrokeCacheForTests(); });

describe('a stroke cache that cannot be opened', () => {
  it('is not « nothing downloaded »: the download is offered, and after it the banner says the strokes could not be kept', async () => {
    vi.stubGlobal('indexedDB', brokenIndexedDb());
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(SVG))));
    setLang('fr');
    render(<App />);
    fireEvent.click(await screen.findByText('Japonais'));
    expect(await screen.findByText('Télécharger les tracés')).toBeInTheDocument();
    expect(screen.getByText(/ne peut pas garder les tracés/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Télécharger les tracés'));
    expect(await screen.findByText("Aujourd'hui : 0 à revoir, 10 nouvelle(s)")).toBeInTheDocument();
    expect(screen.getByText(/ne peut pas garder les tracés \(QuotaExceededError\)/)).toBeInTheDocument();
  });
});

describe('a download the learner cancels', () => {
  it('goes back to the offer and keeps what had arrived: the next press asks only for the rest', async () => {
    let n = 0;
    const pending: Array<(r: Response) => void> = [];
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
      n++;
      if (n <= 6) resolve(new Response(SVG)); // the first wave arrives
      else { pending.push(resolve); init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))); }
    }));
    vi.stubGlobal('fetch', fetchMock);
    setLang('fr');
    render(<App />);
    fireEvent.click(await screen.findByText('Japonais'));
    fireEvent.click(await screen.findByText('Télécharger les tracés'));
    await screen.findByText('Annuler');
    await waitFor(() => expect(n).toBeGreaterThan(6));
    fireEvent.click(screen.getByText('Annuler'));
    expect(await screen.findByText('Télécharger les tracés')).toBeInTheDocument();
    // The six that arrived are kept: 86 left, not 92.
    expect(screen.getByText(/86 fichiers/)).toBeInTheDocument();
    // And they are KEPT, not just counted: the cache has them.
    const { found } = await strokeCache().read([...'あいうえおか']);
    expect(Object.keys(found)).toHaveLength(6);
  });
});

describe('saved answers that cannot be read', () => {
  it('are said on screen, with what the next save does to them, never only logged', async () => {
    const good = { id: 'x:recognise', courseId: 'en-a1', box: 2, reps: 1, lapses: 0, dueAt: '2027-01-01' };
    const bad = { id: 'y:recognise', courseId: 'en-a1', box: 9, reps: 1, lapses: 0 };
    host.read.mockResolvedValue({ state: { ...emptyState(), version: 1, glossLang: 'fr', records: [good, bad, bad] }, updatedAt: 'x' });
    setLang('fr');
    render(<App />);
    expect(await screen.findByText(/2 réponse\(s\) de ta progression enregistrée n'ont pas pu être relues/)).toBeInTheDocument();
  });

  it('nothing is said when every answer reads back', async () => {
    host.read.mockResolvedValue({ state: { ...emptyState(), glossLang: 'fr' }, updatedAt: 'x' });
    setLang('fr');
    render(<App />);
    await screen.findByText(/Aujourd'hui/);
    expect(screen.queryByText(/n'ont pas pu être relues/)).not.toBeInTheDocument();
  });
});

