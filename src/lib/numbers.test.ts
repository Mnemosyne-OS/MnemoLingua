import { describe, expect, it } from 'vitest';
// The number words are computed by the build script, not shipped as code:
// this test pins the function the A1 deck's number cards come from.
import { englishValue, frenchNumber, spanishNumber } from '../../scripts/a1/numbers.mjs';

describe('frenchNumber', () => {
  it.each([
    [1, 'un'], [16, 'seize'], [17, 'dix-sept'], [20, 'vingt'], [21, 'vingt et un'], [22, 'vingt-deux'],
    [70, 'soixante-dix'], [71, 'soixante et onze'], [77, 'soixante-dix-sept'], [80, 'quatre-vingts'],
    [81, 'quatre-vingt-un'], [90, 'quatre-vingt-dix'], [91, 'quatre-vingt-onze'], [99, 'quatre-vingt-dix-neuf'],
  ])('%i → %s', (n, word) => expect(frenchNumber(n)).toBe(word));
});

describe('spanishNumber', () => {
  it.each([
    [1, 'uno'], [16, 'dieciséis'], [20, 'veinte'], [21, 'veintiuno'], [22, 'veintidós'], [30, 'treinta'],
    [31, 'treinta y uno'], [70, 'setenta'], [99, 'noventa y nueve'],
  ])('%i → %s', (n, word) => expect(spanishNumber(n)).toBe(word));

  it('refuses what it does not cover instead of inventing it', () => {
    expect(() => spanishNumber(100)).toThrow(RangeError);
    expect(() => frenchNumber(-1)).toThrow(RangeError);
  });
});

describe('englishValue', () => {
  it('reads every number word of the A1 list', () => {
    expect(englishValue('twelve')).toBe(12);
    expect(englishValue('ninety')).toBe(90);
    expect(englishValue('hundred')).toBeNull();
  });
});
