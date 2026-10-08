import { describe, expect, it } from 'vitest';
import manifest from '../../mnemo-plugin.json';
import { CHECK_EVERY_MS, compareVersions, fetchPublishedVersion, msUntilNextCheck, RUNNING_VERSION, updateStateOf } from './update';

describe('the update check', () => {
  it('runs the version of the manifest it was built with', () => {
    expect(RUNNING_VERSION).toBe(manifest.version);
  });

  it('compares versions by number, never as text', () => {
    expect(compareVersions('0.10.0', '0.9.0')).toBe(1);
    expect(compareVersions('0.2.1', '0.2.1')).toBe(0);
    expect(compareVersions('0.2.0', '0.2.1')).toBe(-1);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('next', '0.2.1')).toBe(0);
  });

  it('names a newer published version, and nothing for an older or equal one', () => {
    expect(updateStateOf('0.3.0', '0.2.1')).toEqual({ kind: 'newer', version: '0.3.0' });
    expect(updateStateOf('0.2.1', '0.2.1')).toEqual({ kind: 'current' });
    expect(updateStateOf('0.2.0', '0.2.1')).toEqual({ kind: 'current' });
  });

  it('a check that fails is unknown, never « up to date »', async () => {
    const refused = (() => Promise.resolve(new Response('', { status: 404 }))) as unknown as typeof fetch;
    const offline = (() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch;
    const garbage = (() => Promise.resolve(new Response('{"name":"x"}'))) as unknown as typeof fetch;
    for (const f of [refused, offline, garbage]) {
      expect(updateStateOf(await fetchPublishedVersion(f))).toEqual({ kind: 'unknown' });
    }
  });

  it('reads the published version from the manifest on the repo', async () => {
    let asked = '';
    const ok = ((url: string) => { asked = url; return Promise.resolve(new Response('{"version":"9.9.9"}')); }) as unknown as typeof fetch;
    expect(await fetchPublishedVersion(ok)).toBe('9.9.9');
    expect(asked).toBe('https://raw.githubusercontent.com/Mnemosyne-OS/MnemoLingua/main/mnemo-plugin.json');
  });

  it('asks at most once a day, counting a failed attempt too', () => {
    const now = 1_000_000_000_000;
    expect(CHECK_EVERY_MS).toBe(24 * 60 * 60 * 1000);
    expect(msUntilNextCheck(null, now)).toBe(0);
    expect(msUntilNextCheck({ attemptAt: now - 60_000, published: null }, now)).toBe(CHECK_EVERY_MS - 60_000);
    expect(msUntilNextCheck({ attemptAt: now - CHECK_EVERY_MS - 1, published: '0.2.1' }, now)).toBe(0);
    // A clock set back or a stamp from the future is not a reason to wait a day more.
    expect(msUntilNextCheck({ attemptAt: now + 5_000_000, published: null }, now)).toBe(0);
  });
});

