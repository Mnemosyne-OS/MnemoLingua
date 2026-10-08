/**
 * themeIcons.ts — one emoji per shipped theme id, drawn on its tile.
 *
 * The theme list is closed (every id has a name in each locale, locales.test),
 * so the map is too. An id added later without an icon gets the book: a tile
 * is never drawn without one.
 */
const ICONS: Record<string, string> = {
  basics: '👋', directions: '🧭', transport: '🚆', hotel: '🛎️', restaurant: '🍽️',
  shopping: '🛍️', emergency: '🚑', people: '👨‍👩‍👧', body: '🩺', food: '🥐',
  home: '🏠', clothes: '👕', town: '🏙️', school: '🎒', work: '💼', time: '🕒',
  nature: '🌦️', animals: '🦊', leisure: '🎨', feelings: '💛', actions: '🏃',
  smallwords: '🧩', numbers: '🔢', 'g-be': '🪞', 'g-present': '⏱️', 'g-can': '💪',
  'g-words': '🔤', 'g-compare': '⚖️', 'g-questions': '❓', 'g-sentences': '🔗',
  'g-past-future': '⏳', 'g-modals': '🎯',
  hiragana: '✍️', katakana: '🖌️',
  grade1: '🌱', grade2: '🌿', grade3plus: '🌳',
  'hsk-nouns': '📦', 'hsk-verbs': '🏃', 'hsk-other': '🧩',
};

export const FALLBACK_ICON = '📚';

/** The icon of a theme tile; never empty. */
export function themeIcon(id: string): string {
  return ICONS[id] ?? FALLBACK_ICON;
}
