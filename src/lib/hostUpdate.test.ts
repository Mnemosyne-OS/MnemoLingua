/**
 * The host's answer wins; the GitHub check runs only for a host that never
 * names a version (doc 142, SDK 0.5.0). The host is played by a message on
 * `window`: in a test window.parent === window, the shape the SDK accepts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { foldHost, HOST_WAIT_MS, stateFromHost, useLinguaUpdate } from './hostUpdate';
import { RUNNING_VERSION } from './update';

function host(data: Record<string, unknown>): void {
  act(() => { window.dispatchEvent(new MessageEvent('message', { data: { type: 'MNEMO_CONFIG_UPDATE', ...data }, source: window })); });
}

describe('stateFromHost and foldHost', () => {
  it('newer, critical, current; unknown and absent are never « up to date »', () => {
    expect(stateFromHost({ state: 'newer', latestVersion: '0.3.0', checkedAt: 'x' })).toEqual({ kind: 'newer', version: '0.3.0' });
    expect(stateFromHost({ state: 'newer', latestVersion: '0.3.0', checkedAt: 'x', critical: true })).toEqual({ kind: 'newer', version: '0.3.0', critical: true });
    expect(stateFromHost({ state: 'current', checkedAt: 'x' })).toEqual({ kind: 'current' });
    expect(stateFromHost({ state: 'unknown', reason: 'HTTP_404' })).toEqual({ kind: 'unknown' });
    expect(stateFromHost(undefined)).toEqual({ kind: 'unknown' });
  });

  it('a message without the fields (the zoom alone) keeps what the host said', () => {
    const known = foldHost({}, { version: '0.2.6', update: { state: 'current', checkedAt: 'x' } });
    expect(foldHost(known, { zoom: 0.5 })).toEqual(known);
  });
});

describe('useLinguaUpdate', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    fetchMock.mockReset().mockResolvedValue(new Response('{"version":"9.9.9"}'));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('the host answers: its version and its update, and GitHub is never asked', async () => {
    const { result } = renderHook(() => useLinguaUpdate(true));
    host({ version: '0.2.6', update: { state: 'newer', latestVersion: '0.3.0', checkedAt: 'x' } });
    expect(result.current).toEqual({ running: '0.2.6', state: { kind: 'newer', version: '0.3.0' }, viaHost: true });
    await act(async () => { await vi.advanceTimersByTimeAsync(HOST_WAIT_MS * 2); });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a host that names a version and no update (a dev copy) still wins', async () => {
    const { result } = renderHook(() => useLinguaUpdate(true));
    host({ version: '0.2.6' });
    await act(async () => { await vi.advanceTimersByTimeAsync(HOST_WAIT_MS * 2); });
    expect(result.current).toEqual({ running: '0.2.6', state: { kind: 'unknown' }, viaHost: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('an older host says nothing: the GitHub check starts after the wait, not before', async () => {
    const { result } = renderHook(() => useLinguaUpdate(true));
    host({ lang: 'fr' });
    await act(async () => { await vi.advanceTimersByTimeAsync(HOST_WAIT_MS - 1); });
    expect(fetchMock).not.toHaveBeenCalled();
    // The wait ends, then the check runs on its own next tick.
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current).toEqual({ running: RUNNING_VERSION, state: { kind: 'newer', version: '9.9.9' }, viaHost: false });
  });

  it('a host answer that comes late replaces the GitHub one', async () => {
    const { result } = renderHook(() => useLinguaUpdate(true));
    await act(async () => { await vi.advanceTimersByTimeAsync(HOST_WAIT_MS); });
    host({ version: '0.2.6', update: { state: 'current', checkedAt: 'x' } });
    expect(result.current).toEqual({ running: '0.2.6', state: { kind: 'current' }, viaHost: true });
  });

  it('disabled (tests, no host): nothing is asked', async () => {
    renderHook(() => useLinguaUpdate(false));
    await act(async () => { await vi.advanceTimersByTimeAsync(HOST_WAIT_MS * 2); });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
