/**
 * host.ts — the one door between MnemoLingua and the shell.
 *
 * Lot 1 needs exactly two host actions, both ungated (doc 73): read and write
 * this cartridge's durable state. No vault, no model, no network.
 */
import { MnemoCartridgeSDK } from '../sdk/mnemo-sdk';

/** Must match "name" in mnemo-plugin.json — the host keys the durable state on
 *  it. 🚨 Renaming later orphans every learner's progress (no migration). */
export const PLUGIN_ID = '@mnemosyne-plugins/mnemo-lingua';

export const sdk = new MnemoCartridgeSDK(PLUGIN_ID);

/** True when this page is running inside the Mnemosyne shell at all. Opened
 *  standalone in a browser (dev), every action rejects immediately — a state
 *  the UI must NAME rather than show as a failure. */
export function hasHost(): boolean {
  return typeof window !== 'undefined' && window.parent !== window;
}

/** The durable blob, inside the host's `{ state, updatedAt }` envelope. */
export function readState(): Promise<unknown> {
  return sdk.invoke<unknown>('state.get');
}

/** Replaces the durable blob. The host refuses past 256 KB. */
export function writeState(state: unknown): Promise<unknown> {
  return sdk.invoke('state.set', { state });
}

/** Opens a link in the system browser (ungated). A link inside the frame
 *  would navigate the cartridge away from itself. */
export function openExternal(url: string): Promise<unknown> {
  return sdk.invoke('shell.openExternal', { url });
}
