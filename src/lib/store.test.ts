import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyState } from './types';

const host = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }));
vi.mock('./host', () => ({ readState: host.read, writeState: host.write, hasHost: () => true }));

import { STATE_BUDGET, byteLength, getState, hydrate, load, mutate, serialise, stateOf, __setStateForTests } from './store';
import type { Card } from './types';

beforeEach(() => {
  host.read.mockReset();
  host.write.mockReset();
  host.write.mockResolvedValue({ success: true });
  __setStateForTests(emptyState(), false);
});

describe('hydrate', () => {
  it('reads nothing saved as a fresh start', () => {
    expect(hydrate(null).outcome).toBe('fresh');
  });

  it('reads a foreign or future blob as unreadable, never as fresh', () => {
    expect(hydrate({ version: 4 }).outcome).toBe('unreadable');
    expect(hydrate('garbage').outcome).toBe('unreadable');
  });

  it('drops a broken record and counts it, keeping the rest', () => {
    const good = { id: 'c0:recognise', courseId: 'd', front: '', back: '', box: 2, dueAt: '2026-10-06', reps: 1, lapses: 0, lastSeenAt: null };
    const { state, droppedRecords } = hydrate({ version: 1, records: [good, { id: 3 }] });
    expect(state.records).toHaveLength(1);
    expect(droppedRecords).toBe(1);
  });

  it('brings a record with an unreadable due day back today instead of losing it', () => {
    const r = { id: 'c0:recognise', courseId: 'd', front: '', back: '', box: 4, dueAt: 'soon', reps: 3, lapses: 0, lastSeenAt: null };
    expect(hydrate({ version: 1, records: [r] }).state.records[0]!.dueAt <= '2026-01-01').toBe(true);
  });
});

describe('stateOf', () => {
  it('unwraps the host envelope', () => {
    expect(stateOf({ state: { version: 1 }, updatedAt: 'x' })).toEqual({ version: 1 });
    expect(stateOf(null)).toBeNull();
  });
});

describe('the write guard', () => {
  it('refuses to write before the first read has answered', async () => {
    const out = await mutate((s) => ({ ...s, dailyNew: 5 }));
    expect(out.ok).toBe(false);
    expect(host.write).not.toHaveBeenCalled();
  });

  it('refuses to write over an unreadable saved state', async () => {
    host.read.mockResolvedValue({ state: { version: 9 }, updatedAt: 'x' });
    expect(await load()).toBe('unreadable');
    const out = await mutate((s) => ({ ...s, dailyNew: 5 }));
    expect(out.ok).toBe(false);
    expect(host.write).not.toHaveBeenCalled();
  });

  it('writes once a readable state was read', async () => {
    host.read.mockResolvedValue({ state: { version: 1, records: [] }, updatedAt: 'x' });
    expect(await load()).toBe('read');
    expect((await mutate((s) => ({ ...s, dailyNew: 5 }))).ok).toBe(true);
    expect(host.write).toHaveBeenCalledTimes(1);
    expect(getState().dailyNew).toBe(5);
  });

  it('says so when the host refuses the write', async () => {
    host.read.mockResolvedValue(null);
    await load();
    host.write.mockRejectedValue(new Error('STATE_TOO_LARGE'));
    expect(await mutate((s) => s)).toEqual({ ok: false, error: 'STATE_TOO_LARGE' });
  });
});

function synthetic(n: number): Card[] {
  const out: Card[] = [];
  for (let i = 0; i < n; i++) {
    for (const d of ['recognise', 'produce'] as const) {
      out.push({ id: `word${i}-noun:${d}`, courseId: 'en-a1', front: '', back: '', box: 3, dueAt: '2027-03-14', reps: 12, lapses: 2, lastSeenAt: '2027-03-01T10:00:00.000Z' });
    }
  }
  return out;
}

describe('the on-disk format', () => {
  it('round-trips a state through format 2', () => {
    const state = { ...emptyState(), records: synthetic(3), glossLang: 'fr' as const };
    const back = hydrate(JSON.parse(JSON.stringify(serialise(state)))).state;
    expect(back.records.map((r) => [r.id, r.courseId, r.box, r.dueAt, r.reps, r.lapses]))
      .toEqual(state.records.map((r) => [r.id, r.courseId, r.box, r.dueAt, r.reps, r.lapses]));
    expect(back.glossLang).toBe('fr');
  });

  it('still reads the format 1 progress written by the first version', () => {
    const v1 = { version: 1, records: [{ id: 'b01:recognise', courseId: 'en-travel', front: '', back: '', box: 2, dueAt: '2026-10-06', reps: 1, lapses: 0, lastSeenAt: null }] };
    const { state, outcome } = hydrate(v1);
    expect(outcome).toBe('read');
    expect(state.records[0]).toMatchObject({ id: 'b01:recognise', courseId: 'en-travel', box: 2, dueAt: '2026-10-06' });
  });

  it('fits the whole A1 level (1 164 cards, both directions) well inside the budget', () => {
    const bytes = byteLength(serialise({ ...emptyState(), records: synthetic(1164) }));
    expect(bytes).toBeLessThan(STATE_BUDGET * 0.4);
  });

  it('fits A1 and A2 together (2 733 cards, both directions) under the warning line', () => {
    const bytes = byteLength(serialise({ ...emptyState(), records: synthetic(2733) }));
    expect(bytes).toBeLessThan(STATE_BUDGET * 0.8);
  });

  it('refuses a change that would not fit, and keeps the state as it was', async () => {
    host.read.mockResolvedValue(null);
    await load();
    const out = await mutate((s) => ({ ...s, records: synthetic(12000) }));
    expect(out).toEqual({ ok: false, error: 'STATE_TOO_LARGE' });
    expect(getState().records).toHaveLength(0);
    expect(host.write).not.toHaveBeenCalled();
  });
});

describe('the margin kept for the host envelope', () => {
  // The host stores { state, updatedAt }: a state that fits only to the byte
  // would be refused there, with a worse message than ours.
  const padded = (bytes: number) => {
    const base = byteLength(serialise(emptyState()));
    return { ...emptyState(), themes: { pad: ['x'.repeat(bytes - base - 10)] } };
  };

  it('refuses a state that fits the budget but not the envelope around it', async () => {
    host.read.mockResolvedValue(null);
    await load();
    const s = padded(STATE_BUDGET - 100);
    expect(byteLength(serialise(s))).toBeLessThan(STATE_BUDGET);
    expect(await mutate(() => s)).toEqual({ ok: false, error: 'STATE_TOO_LARGE' });
  });

  it('accepts a state that leaves the envelope its room', async () => {
    host.read.mockResolvedValue(null);
    await load();
    expect((await mutate(() => padded(STATE_BUDGET - 1024))).ok).toBe(true);
  });
});

describe('the daily counter', () => {
  it('drops the old single counter, which did not say which deck it counted', () => {
    expect(hydrate({ version: 2, introduced: { day: '2026-10-05', count: 10 } }).state.introduced).toEqual({});
    expect(hydrate({ version: 2, introduced: { 'en-a1': { day: '2026-10-05', count: 4 } } }).state.introduced)
      .toEqual({ 'en-a1': { day: '2026-10-05', count: 4 } });
  });
});

describe('format 2, a record with an unreadable day', () => {
  it('comes back today instead of vanishing', () => {
    const raw = { version: 2, records: { 'en-a1': { 'apple-n:r': [3, 'soon', 2, 0] } } };
    const { state, droppedRecords } = hydrate(raw);
    expect(droppedRecords).toBe(0);
    expect(state.records[0]!.dueAt <= '2026-01-01').toBe(true);
  });
});

describe('format 3 (one entry per card)', () => {
  it('a card with only one direction recorded keeps that one and invents nothing', () => {
    const state = { ...emptyState(), records: synthetic(1).filter((r) => r.id.endsWith(':recognise')) };
    const back = hydrate(JSON.parse(JSON.stringify(serialise(state)))).state.records;
    expect(back.map((r) => r.id)).toEqual(['word0-noun:recognise']);
  });

  it('an unreadable day comes back today, a broken entry is dropped and counted', () => {
    const raw = { version: 3, records: { 'en-b1': { 'a-n': '3.zz!.2.0.3.c5.2.0', 'b-n': 'nonsense' } } };
    const { state, droppedRecords } = hydrate(raw);
    expect(droppedRecords).toBe(1);
    expect(state.records.find((r) => r.id === 'a-n:recognise')!.dueAt <= '2026-01-01').toBe(true);
    expect(state.records.find((r) => r.id === 'a-n:produce')!.dueAt).toBe('2027-03-14');
  });

  it('every A1, A2 and B1 card learned (5 179 cards) stays under the warning line', () => {
    const bytes = byteLength(serialise({ ...emptyState(), records: synthetic(5179) }));
    expect(bytes).toBeLessThan(STATE_BUDGET * 0.8);
  });
});
