import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildPackDeck, downloadKanjidic, packProblem, parseKanjidic, type KanjiEntry } from './kanjiPack';
import { kanaToRomaji, kunToRomaji, onToRomaji } from './romaji';
import { parseDeck } from './deck';
import n5 from '../decks/ja/kanji-n5.json';

/** Two entries in KANJIDIC2's own shape (EDRDG, CC BY-SA 4.0). */
const XML = `<?xml version="1.0"?><kanjidic2><header/>
<character><literal>水</literal><misc><grade>1</grade><stroke_count>4</stroke_count><jlpt>4</jlpt></misc>
<reading_meaning><rmgroup><reading r_type="pinyin">shui3</reading><reading r_type="ja_on">スイ</reading><reading r_type="ja_kun">みず</reading><reading r_type="ja_kun">みず-</reading>
<meaning>water</meaning><meaning m_lang="fr">eau</meaning><meaning m_lang="es">agua</meaning><meaning m_lang="pt">água</meaning></rmgroup></reading_meaning></character>
<character><literal>上</literal><misc><grade>1</grade><jlpt>4</jlpt></misc>
<reading_meaning><rmgroup><reading r_type="ja_on">ジョウ</reading><reading r_type="ja_kun">うえ</reading><reading r_type="ja_kun">あ.げる</reading>
<meaning>above</meaning><meaning>up</meaning><meaning m_lang="fr">dessus</meaning></rmgroup></reading_meaning></character>
<character><literal>亜</literal><misc><grade>8</grade><jlpt>1</jlpt></misc>
<reading_meaning><rmgroup><meaning>Asia</meaning></rmgroup></reading_meaning></character>
</kanjidic2>`;

describe('romaji of a reading', () => {
  it('writes on in capitals and kun with its okurigana in brackets', () => {
    expect(onToRomaji('スイ')).toBe('SUI');
    expect(onToRomaji('ジョウ')).toBe('JOU');
    expect(kunToRomaji('あ.げる')).toBe('a(geru)');
    expect(kunToRomaji('みず-')).toBe('mizu-');
  });

  it('handles the small tsu, the yoon, the long mark and the n before a vowel', () => {
    expect(kanaToRomaji('きって')).toBe('kitte');
    expect(kanaToRomaji('まっちゃ')).toBe('matcha');
    expect(kanaToRomaji('しゃしん')).toBe('shashin');
    expect(kanaToRomaji('きゃく')).toBe('kyaku');
    expect(kanaToRomaji('コーヒー')).toBe('koohii');
    expect(kanaToRomaji('きんえん')).toBe("kin'en");
  });
});

describe('the KANJIDIC2 pack', () => {
  it('takes only the level asked for, with meanings in en, fr and es, and the readings', () => {
    const e = parseKanjidic(XML, 4);
    expect(e.map((k) => k.char)).toEqual(['水', '上']);
    expect(e[0]).toEqual({ char: '水', grade: 1, on: ['スイ'], kun: ['みず', 'みず-'], meanings: { en: ['water'], fr: ['eau'], es: ['agua'] } });
  });

  it('a meaning missing in a language stays missing, never filled from English', () => {
    const deck = buildPackDeck(parseDeck(n5).deck!, { source: 'kanjidic2', jlpt: 4 }, parseKanjidic(XML, 4));
    const up = deck.themes[0]!.cards.find((c) => c.target === '上')!;
    expect(up.gloss).toEqual({ en: 'above, up', fr: 'dessus' });
    expect(up.id).toBe('kanji-上');
    expect(up.kind).toBe('glyph');
    expect(up.readings).toEqual({ on: ['ジョウ'], kun: ['うえ', 'あ.げる'] });
  });

  it('the shipped file is a pack deck with no card of its own', () => {
    const { deck, problems } = parseDeck(n5);
    expect(problems).toEqual([]);
    expect(deck!.pack).toEqual({ source: 'kanjidic2', jlpt: 4 });
    expect(deck!.themes).toEqual([]);
  });

  it('refuses a file that is not a level: too few kanji, or no meanings', () => {
    expect(packProblem(parseKanjidic(XML, 4))).toBe('ONLY_2_KANJI');
    const many: KanjiEntry[] = Array.from({ length: 50 }, (_, i) => ({ char: String(i), grade: 1, on: [], kun: [], meanings: {} }));
    expect(packProblem(many)).toBe('NO_MEANING_50');
    expect(packProblem(many.map((k) => ({ ...k, meanings: { en: ['x'] } })))).toBeNull();
  });

  it('unzips what it downloads', async () => {
    const fetchImpl = (() => Promise.resolve(new Response(gzipSync(Buffer.from(XML, 'utf8'))))) as unknown as typeof fetch;
    expect(parseKanjidic(await downloadKanjidic({ fetchImpl }), 4)).toHaveLength(2);
  });

  it('names an HTTP refusal', async () => {
    const fetchImpl = (() => Promise.resolve(new Response('', { status: 503 }))) as unknown as typeof fetch;
    await expect(downloadKanjidic({ fetchImpl })).rejects.toThrow('HTTP 503');
  });
});
