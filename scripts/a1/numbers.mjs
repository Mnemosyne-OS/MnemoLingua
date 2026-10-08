// numbers.mjs — number words in French and Spanish, computed (doc 138 §3.4b:
// a model never writes a number). Covers 0 to 99, which is what A1 needs.
//
// The traps a model gets wrong and this does not: French 71 is
// "soixante et onze" and 80 is "quatre-vingts" (plural s), 81 is
// "quatre-vingt-un" (no "et", no s); Spanish 21–29 are single words
// ("veintiuno", "veintidós"), and 31+ are "treinta y uno".

const FR_UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
  'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
const FR_TENS = { 2: 'vingt', 3: 'trente', 4: 'quarante', 5: 'cinquante', 6: 'soixante' };

/** French, 1990 spelling not applied (hyphens only under 100, as taught). */
export function frenchNumber(n) {
  if (!Number.isInteger(n) || n < 0 || n > 99) throw new RangeError(`out of range: ${n}`);
  if (n < 20) return FR_UNITS[n];
  const tens = Math.floor(n / 10);
  const unit = n % 10;
  if (tens === 7) return unit === 1 ? 'soixante et onze' : `soixante-${FR_UNITS[10 + unit]}`;
  if (tens === 8) return unit === 0 ? 'quatre-vingts' : `quatre-vingt-${FR_UNITS[unit]}`;
  if (tens === 9) return `quatre-vingt-${FR_UNITS[10 + unit]}`;
  if (unit === 0) return FR_TENS[tens];
  if (unit === 1) return `${FR_TENS[tens]} et un`;
  return `${FR_TENS[tens]}-${FR_UNITS[unit]}`;
}

const ES_UNITS = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
  'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve',
  'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis',
  'veintisiete', 'veintiocho', 'veintinueve'];
const ES_TENS = { 3: 'treinta', 4: 'cuarenta', 5: 'cincuenta', 6: 'sesenta', 7: 'setenta', 8: 'ochenta', 9: 'noventa' };

export function spanishNumber(n) {
  if (!Number.isInteger(n) || n < 0 || n > 99) throw new RangeError(`out of range: ${n}`);
  if (n < 30) return ES_UNITS[n];
  const tens = Math.floor(n / 10);
  const unit = n % 10;
  return unit === 0 ? ES_TENS[tens] : `${ES_TENS[tens]} y ${ES_UNITS[unit]}`;
}

const EN_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const EN_TENS = { 2: 'twenty', 3: 'thirty', 4: 'forty', 5: 'fifty', 6: 'sixty', 7: 'seventy', 8: 'eighty', 9: 'ninety' };

/** The value of an English number word from the A1 list, or null. */
export function englishValue(word) {
  const i = EN_WORDS.indexOf(word);
  if (i >= 0) return i;
  const t = Object.entries(EN_TENS).find(([, w]) => w === word);
  return t ? Number(t[0]) * 10 : null;
}

/** The big round numbers of A2. A fixed table, not a model: these are facts. */
export const ROUND_NUMBERS = {
  hundred: { fr: 'cent', es: 'cien' },
  thousand: { fr: 'mille', es: 'mil' },
  million: { fr: 'un million', es: 'un millón' },
};
