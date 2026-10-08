/**
 * hostUpdate.ts — the version and the update, as the HOST answers them
 * (doc 142, SDK 0.5.0).
 *
 * A host from 1.7.x onward posts `version` (the installed manifest) and
 * `update` (its once-a-day check, the same one the Hub runs) in
 * MNEMO_CONFIG_UPDATE. That answer wins. The cartridge's own GitHub check
 * (update.ts) stays for an older host only, and starts when the host has
 * said nothing about a version after HOST_WAIT_MS.
 *
 * 🎭 The host posts ONCE, after its checks: installed list, catalog and repo
 * each have a 15 s deadline, so a silent host can take up to ~45 s before
 * it speaks. Waiting less would run both checks on a host that does answer.
 */
import { useEffect, useState } from 'react';
import { onHostConfig, type MnemoHostConfig, type MnemoUpdateState } from '../sdk/mnemo-sdk';
import { RUNNING_VERSION, useUpdateCheck, type UpdateState } from './update';

/** How long the host gets to say which version it installed. */
export const HOST_WAIT_MS = 50_000;

export interface HostFacts {
  version?: string;
  update?: MnemoUpdateState;
}

/** Keeps what the host already said: a message without the fields (the zoom,
 *  the theme) never erases a version or an answer. */
export function foldHost(prev: HostFacts, cfg: MnemoHostConfig): HostFacts {
  const next = { ...prev };
  if (typeof cfg.version === 'string') next.version = cfg.version;
  if (cfg.update) next.update = cfg.update;
  return next;
}

/** The host's answer in this cartridge's terms. Absent or `unknown` draws
 *  nothing extra, never « up to date ». */
export function stateFromHost(update: MnemoUpdateState | undefined): UpdateState {
  if (!update || update.state === 'unknown') return { kind: 'unknown' };
  if (update.state === 'current') return { kind: 'current' };
  return { kind: 'newer', version: update.latestVersion, ...(update.critical ? { critical: true } : {}) };
}

export interface LinguaUpdate {
  /** The version to show in the badge. */
  running: string;
  state: UpdateState;
  /** true = the host answered: the update is offered in its Hub. */
  viaHost: boolean;
}

/** The host's answer when it gives one, the GitHub check otherwise. */
export function useLinguaUpdate(enabled: boolean): LinguaUpdate {
  const [host, setHost] = useState<HostFacts>({});
  const [hostSilent, setHostSilent] = useState(false);
  const spoke = host.version !== undefined;

  useEffect(() => {
    if (!enabled) return;
    // apply: false — main.tsx already applies the host's look.
    return onHostConfig((cfg) => setHost((prev) => foldHost(prev, cfg)), { apply: false });
  }, [enabled]);

  useEffect(() => {
    if (!enabled || spoke) return;
    const timer = setTimeout(() => setHostSilent(true), HOST_WAIT_MS);
    return () => clearTimeout(timer);
  }, [enabled, spoke]);

  const fromRepo = useUpdateCheck(enabled && hostSilent && !spoke);
  if (spoke) return { running: host.version ?? RUNNING_VERSION, state: stateFromHost(host.update), viaHost: true };
  return { running: RUNNING_VERSION, state: fromRepo, viaHost: false };
}
