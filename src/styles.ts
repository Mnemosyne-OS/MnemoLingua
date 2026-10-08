/**
 * styles.ts — the few inline styles left, on the host's own tokens. The
 * glass (hover, focus, blur, the tiles, the pad) lives in app.css, which
 * inline styles cannot express.
 *
 * Colors come from `var(--…)` because the host pushes its live palette into
 * the frame (`onHostConfig`), so a cartridge that hardcodes hex drifts the
 * moment the user changes their accent. Every fallback after a comma is what
 * the cartridge looks like in the half-second before that arrives, and when it
 * is opened standalone during development.
 *
 * Spacing is the 8pt grid; sizes come from the type scale (12 · 14 · 17 · 21 ·
 * 27 · 34) and nowhere else.
 *
 * 🚨 No `opacity` on text, ever. It composites the text against whatever is
 * behind it, which in a themed shell is not the color anyone checked for
 * contrast. Muted text uses a muted TOKEN.
 */
import type { CSSProperties } from 'react';

export const T = {
  text: 'var(--text-primary, #ece9f5)',
  muted: 'var(--text-muted, #9490a6)',
  accent: 'var(--accent, #7c6bf5)',
  raised: 'var(--bg-surface, #1e1b28)',
  border: 'var(--border-subtle, #2a2735)',
  good: 'var(--accent-green, #3fbf87)',
  bad: 'var(--accent-red, #e0616f)',
  warn: 'var(--accent-amber, #e0a54a)',
} as const;

export const h2: CSSProperties = { fontSize: '21px', fontWeight: 600, margin: 0 };
export const lede: CSSProperties = { fontSize: '14px', lineHeight: 1.6, color: T.muted, margin: 0, maxWidth: '62ch' };
export const small: CSSProperties = { fontSize: '12px', color: T.muted, margin: 0 };

/** A block that names a limitation rather than a failure. */
export const noticeBox: CSSProperties = {
  border: `1px solid ${T.border}`,
  borderLeft: `3px solid ${T.warn}`,
  borderRadius: '10px',
  padding: '12px 14px',
  background: T.raised,
  fontSize: '13px',
  lineHeight: 1.6,
  color: T.text,
};

/** A block that names a failure, with the next step in it. */
export const errorBox: CSSProperties = {
  ...noticeBox,
  borderLeftColor: T.bad,
};
