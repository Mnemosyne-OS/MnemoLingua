/**
 * romaji.ts — a kana reading written in modified Hepburn.
 *
 * Readings are shown in romaji because a Japanese font is not guaranteed on
 * the machine (a French Windows may have none), and a reading in empty boxes
 * teaches nothing. Kanjidic's conventions are kept: an on'yomi in capitals
 * (SUI), a kun'yomi in lower case with its okurigana in brackets (a(geru)),
 * and the `-` that marks a prefix or a suffix.
 */

const BASE: Record<string, string> = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o',
  か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko', が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go',
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so', ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
  た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to', だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no',
  は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho', ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
  ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo',
  や: 'ya', ゆ: 'yu', よ: 'yo',
  ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro',
  わ: 'wa', ゐ: 'i', ゑ: 'e', を: 'o', ん: 'n', ゔ: 'vu',
  ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o',
};

/** きゃ → kya, しゃ → sha, ちゃ → cha, じゃ → ja. */
const YOON: Record<string, string> = { ゃ: 'a', ゅ: 'u', ょ: 'o' };

/** Katakana to hiragana: the same table serves both. */
function toHiragana(ch: string): string {
  const c = ch.codePointAt(0) ?? 0;
  return c >= 0x30a1 && c <= 0x30f6 ? String.fromCodePoint(c - 0x60) : ch;
}

/** Romaji of a kana string; a character it does not know is kept as is. */
export function kanaToRomaji(kana: string): string {
  const chars = [...kana].map(toHiragana);
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    const next = chars[i + 1];
    if (ch === 'っ') {
      // Doubles the next consonant: きって → kitte, まっちゃ → matcha.
      const r = next ? BASE[next] ?? '' : '';
      out += r.startsWith('ch') ? 't' : r.charAt(0);
      continue;
    }
    if (ch === 'ー') { out += out.slice(-1); continue; }
    if (ch === 'ん' && next && /^[aiueoy]/.test(BASE[next] ?? '')) { out += "n'"; continue; }
    const r = BASE[ch];
    if (r === undefined) { out += ch; continue; }
    if (next && YOON[next] && r.endsWith('i') && r.length > 1) {
      const stem = r.slice(0, -1);
      out += (/^(sh|ch|j)$/.test(stem) ? stem : `${stem}y`) + YOON[next];
      i++;
      continue;
    }
    out += r;
  }
  return out;
}

/** An on'yomi as Kanjidic writes it in katakana → SUI. */
export function onToRomaji(on: string): string {
  return kanaToRomaji(on).toUpperCase();
}

/** A kun'yomi with its okurigana after the dot → a(geru); `-` kept. */
export function kunToRomaji(kun: string): string {
  const [stem = '', okuri] = kun.split('.');
  return okuri ? `${kanaToRomaji(stem)}(${kanaToRomaji(okuri)})` : kanaToRomaji(stem);
}
