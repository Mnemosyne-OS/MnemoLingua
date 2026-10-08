import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const host = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }));
vi.mock('./lib/host', () => ({ readState: host.read, writeState: host.write, hasHost: () => true, openExternal: vi.fn() }));

import App from './App';
import { setLang } from './i18n/useI18n';
import { __setStateForTests } from './lib/store';
import { __resetStrokeCacheForTests } from './lib/strokeCache';
import { emptyState } from './lib/types';

const SVG = '<svg><g kvg:element="x"><path id="kvg:03042-s1" d="M10,10c10,0,30,0,60,0"/></g></svg>';

beforeEach(() => {
  host.read.mockReset().mockResolvedValue(null);
  host.write.mockReset().mockResolvedValue({ success: true });
  __setStateForTests(emptyState(), false);
  __resetStrokeCacheForTests();
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('the way into the kana (doc 138 §13)', () => {
  it('asks before fetching anything, then the learner downloads the strokes and the deck opens', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(SVG)));
    vi.stubGlobal('fetch', fetchMock);
    setLang('en');
    render(<App />);
    fireEvent.click(await screen.findByText('Japanese'));
    expect(await screen.findByText('Download the strokes')).toBeInTheDocument();
    expect(screen.getByText(/92 files/)).toBeInTheDocument();
    expect(screen.getByText(/KanjiVG/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Download the strokes'));
    expect(await screen.findByText('Today: 0 to review, 10 new')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(92);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toMatch(/^https:\/\/raw\.githubusercontent\.com\/KanjiVG\/kanjivg\/r20260714\/kanji\/[0-9a-f]{5}\.svg$/);
  });

  it('names the files that failed, and the retry fetches only those', async () => {
    let n = 0;
    const fetchMock = vi.fn(() => Promise.resolve(++n <= 2 ? new Response('', { status: 503 }) : new Response(SVG)));
    vi.stubGlobal('fetch', fetchMock);
    setLang('en');
    render(<App />);
    fireEvent.click(await screen.findByText('Japanese'));
    fireEvent.click(await screen.findByText('Download the strokes'));
    expect(await screen.findByText(/2 file\(s\) could not be downloaded/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Try again (2 files)'));
    expect(await screen.findByText('Today: 0 to review, 10 new')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(94);
  });

  it('the English decks need no download', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    setLang('fr');
    render(<App />);
    expect(await screen.findByText("Aujourd'hui : 0 à revoir, 10 nouvelle(s)")).toBeInTheDocument();
    expect(screen.queryByText('Télécharger les tracés')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('the way into the kanji (doc 138 §15)', () => {
  // 45 kanji of the old level 4, in KANJIDIC2's shape.
  const chars = Array.from({ length: 45 }, (_, i) => String.fromCodePoint(0x4e00 + i));
  const xml = '<kanjidic2>' + chars.map((c, i) =>
    `<character><literal>${c}</literal><misc><grade>${i < 20 ? 1 : 2}</grade><jlpt>4</jlpt></misc>` +
    `<reading_meaning><rmgroup><reading r_type="ja_on">イチ</reading><meaning>m${i}</meaning><meaning m_lang="fr">s${i}</meaning></rmgroup></reading_meaning></character>`).join('') + '</kanjidic2>';

  it('one press downloads the dictionary, then the strokes of the kanji it names, and the deck opens', async () => {
    const fetchMock = vi.fn((url: string) => Promise.resolve(
      url.includes('kanjidic2') ? new Response(gzipSync(Buffer.from(xml, 'utf8'))) : new Response(SVG),
    ));
    vi.stubGlobal('fetch', fetchMock);
    setLang('fr');
    render(<App />);
    fireEvent.click(await screen.findByText('Japonais'));
    fireEvent.click(await screen.findByText('Kanji N5'));
    expect(await screen.findByText(/Le dictionnaire KANJIDIC2 \(EDRDG\)/)).toBeInTheDocument();
    expect(screen.getByText(/ancien niveau 4 du JLPT/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Télécharger le dictionnaire et les tracés'));
    expect(await screen.findByText("Aujourd'hui : 0 à revoir, 10 nouvelle(s)")).toBeInTheDocument();
    const urls = fetchMock.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(urls[0]).toBe('http://www.edrdg.org/kanjidic/kanjidic2.xml.gz');
    expect(urls.filter((u) => u.includes('KanjiVG'))).toHaveLength(45);
    expect(screen.getByText(/Sens et lectures : KANJIDIC2/)).toBeInTheDocument();
    expect(screen.getByText('Kanji de 1re année')).toBeInTheDocument();
  });

  it('a dictionary that does not arrive is named, and nothing else is fetched', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('', { status: 503 })));
    vi.stubGlobal('fetch', fetchMock);
    setLang('fr');
    render(<App />);
    fireEvent.click(await screen.findByText('Japonais'));
    fireEvent.click(await screen.findByText('Kanji N5'));
    fireEvent.click(await screen.findByText('Télécharger le dictionnaire et les tracés'));
    expect(await screen.findByText(/Le dictionnaire n'a pas pu être téléchargé \(HTTP 503\)/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('the way into Chinese (doc 138 §16)', () => {
  const words = Array.from({ length: 60 }, (_, i) => ({
    simplified: String.fromCodePoint(0x4e00 + i) + (i % 2 ? String.fromCodePoint(0x4f00 + i) : ''),
    pos: ['n'],
    forms: [{ transcriptions: { pinyin: 'yī' }, meanings: [`m${i}`] }],
  }));
  const HZ = JSON.stringify({ strokes: ['M 0 0 Z'], medians: [[[121, 393], [920, 401]]] });

  it('one press downloads the HSK list, then the strokes of every character of its words', async () => {
    const fetchMock = vi.fn((url: string) => Promise.resolve(
      url.includes('complete-hsk-vocabulary') ? new Response(JSON.stringify(words)) : new Response(HZ),
    ));
    vi.stubGlobal('fetch', fetchMock);
    setLang('fr');
    render(<App />);
    fireEvent.click(await screen.findByText('Chinois'));
    expect(await screen.findByText(/écrites pour MnemoLingua/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Télécharger la liste et les tracés'));
    // The fake words are mostly outside our table (only 一 is in it), so few
    // have French: the deck still opens, on the French it has.
    expect(await screen.findByText(/Aujourd'hui : 0 à revoir/)).toBeInTheDocument();
    expect(screen.queryByText('Dans quelle langue veux-tu les traductions ?')).not.toBeInTheDocument();
    const urls = fetchMock.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(urls[0]).toContain('/7ac65bf1a6387d35f1ade478906172a19311c7f9/wordlists/exclusive/old/1.json');
    // 60 words, 30 of them two characters: 90 characters, each fetched once.
    expect(urls.filter((u) => u.includes('hanzi-writer-data'))).toHaveLength(90);
  });
});

