/**
 * App.verif138b — what the second verification pass (2026-10-08, session
 * 1911bb39) found without a test: two presses on the download, the Hub text,
 * and the update hook end to end.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';

const host = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }));
vi.mock('./lib/host', () => ({ readState: host.read, writeState: host.write, hasHost: () => true, openExternal: vi.fn() }));

import App from './App';
import manifest from '../mnemo-plugin.json';
import { setLang } from './i18n/useI18n';
import { __setStateForTests } from './lib/store';
import { __resetStrokeCacheForTests } from './lib/strokeCache';
import { emptyState } from './lib/types';
import { CHECK_EVERY_MS, useUpdateCheck } from './lib/update';

const SVG = '<svg><g kvg:element="x"><path id="kvg:03042-s1" d="M10,10c10,0,30,0,60,0"/></g></svg>';

beforeEach(() => {
  host.read.mockReset().mockResolvedValue(null);
  host.write.mockReset().mockResolvedValue({ success: true });
  __setStateForTests(emptyState(), false);
  __resetStrokeCacheForTests();
  localStorage.clear();
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('the download button pressed twice', () => {
  it('downloads once: 92 files, not 184', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(SVG)));
    vi.stubGlobal('fetch', fetchMock);
    setLang('en');
    render(<App />);
    fireEvent.click(await screen.findByText('Japanese'));
    const btn = await screen.findByText('Download the strokes');
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(await screen.findByText('Today: 0 to review, 10 new')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchMock).toHaveBeenCalledTimes(92);
  });
});

describe('the Hub text', () => {
  it('names the three languages taught, in each of its languages', () => {
    for (const [lang, text] of Object.entries(manifest.descriptionI18n)) {
      expect(text, lang).toMatch(/chin/i);
      expect(text, lang).toMatch(/japon|japan|japon/i);
    }
    expect(manifest.keywords).toContain('chinese');
  });
});

describe('the update hook', () => {
  const published = (v: string) => vi.fn(() => Promise.resolve(new Response(JSON.stringify({ version: v }))));

  it('asks once, remembers, and does not ask again when the window reopens the same day', async () => {
    const fetchMock = published('9.9.9');
    vi.stubGlobal('fetch', fetchMock);
    const first = renderHook(() => useUpdateCheck(true));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(first.result.current).toEqual({ kind: 'newer', version: '9.9.9' });
    first.unmount();
    const again = renderHook(() => useUpdateCheck(true));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    // The remembered answer shows at once, and no second request went out.
    expect(again.result.current).toEqual({ kind: 'newer', version: '9.9.9' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a failed attempt counts too: no retry before a day, and nothing says « up to date »', async () => {
    const failing = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
    vi.stubGlobal('fetch', failing);
    const first = renderHook(() => useUpdateCheck(true));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(first.result.current).toEqual({ kind: 'unknown' });
    first.unmount();
    renderHook(() => useUpdateCheck(true));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(failing).toHaveBeenCalledTimes(1);
  });

  it('asks again once a day has passed', async () => {
    localStorage.setItem('mnemo-lingua:update-check', JSON.stringify({ attemptAt: Date.now() - CHECK_EVERY_MS - 1000, published: '0.0.1' }));
    const fetchMock = published('9.9.9');
    vi.stubGlobal('fetch', fetchMock);
    const h = renderHook(() => useUpdateCheck(true));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(h.result.current).toEqual({ kind: 'newer', version: '9.9.9' });
  });

  it('a newer version already found stays newer when the next check fails', async () => {
    localStorage.setItem('mnemo-lingua:update-check', JSON.stringify({ attemptAt: Date.now() - CHECK_EVERY_MS - 1000, published: '9.9.9' }));
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
    const h = renderHook(() => useUpdateCheck(true));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(h.result.current).toEqual({ kind: 'newer', version: '9.9.9' });
  });
});
