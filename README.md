# MnemoLingua

A Mnemosyne OS cartridge for learning a language with ready-made decks.

The English decks, with French and Spanish translations:

- **English, level A1**: 1 266 cards in 25 themes. Every A1 word of the
  CEFR-J word list (1 137 words, each with an example sentence that fixes its
  sense), the 27 number words, and 102 sentences for 51 A1 grammar points.
  14 cards a pass disagreed with are withdrawn and never shown.
- **English, level A2**: 1 467 cards in 24 themes. Every A2 word of the
  CEFR-J list (1 408 words, each with an example sentence), the 3 round
  numbers (from a fixed table), and 56 sentences for 28 A2 grammar points.
  15 cards a pass disagreed with are withdrawn.
- **English, level B1**: 2 524 cards in 23 themes. Every B1 word of the
  CEFR-J list (2 446 words, each with an example sentence) and 78 sentences
  for 39 B1 grammar points. 35 cards a pass disagreed with are withdrawn.
- **Travel**: 58 phrases in seven themes (the basics, finding your way,
  transport, hotel, restaurant, shopping and paying, emergencies).

The Japanese decks, written by hand:

- **Kana**: the 46 hiragana and the 46 katakana, with their Hepburn reading.
- **Kanji N5**: the kanji of the old JLPT level 4, the list N5 grew from.
  Each one has its meaning in English, French or Spanish and its readings.

You draw each character stroke by stroke, with a mouse, a pen or a finger.
The app checks each stroke: its direction, where it starts and ends, its
shape, and its place in the order. After three misses on a stroke, the right
stroke draws itself.

You download the Japanese data once, from a screen in the cartridge. The
screen names each source and its licence before you press the button.

- The strokes come from [KanjiVG](https://kanjivg.tagaini.net/) by Ulrich
  Apel, release r20260714, CC BY-SA 3.0.
- The kanji meanings and readings come from
  [KANJIDIC2](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project) by the
  EDRDG, CC BY-SA 4.0.

The cartridge ships none of this data. It stays on your computer.

## How it works

- Pick the themes you want. New cards come in at 10 a day.
- Each card is reviewed in two directions, each with its own progress:
  - **recognise**: you see the English and say what it means;
  - **produce**: you see your language and say it in English.
- After each card you answer "I knew it" or "I didn't know". A card you
  missed comes back at the end of the same session, then follows five
  Leitner boxes (0, 1, 3, 7 and 21 days).
- "This card is wrong" takes the card out of review and lists it under the
  deck, where it can be put back.

The speaker button reads a word with a voice installed on your computer, in the
language you learn. Progress is kept in the host's durable state for this
cartridge. The English decks work offline from the start. The Japanese decks
work offline after their download.

## How the deck was checked

No native speaker has read this deck yet, and the app says so on screen.
Each phrase went through three passes, kept in `verification/`:

1. a model wrote the phrase and its French and Spanish translations;
2. a second model translated the English on its own, without seeing the first
   translations (`blind-pass.json`);
3. a third model compared both translations without knowing which was which,
   and judged each one (`judge-pass.json`, `compare-key.json`).

The judge found no error in the real deck. To check that it can say no, the
same prompt was run on a control copy with six planted errors (left for
right, leaves for arrives, cheap for expensive, a misspelling, a wrong word,
an over-familiar line to the police): it caught 6 out of 6 and raised no
false alarm on the other 226 (`control-*.json`).

A card is shipped as `two-pass` only if its translations were judged correct.
A card a pass disagrees with is marked `to-review` and is never shown. All
three passes are models, so they can share the same blind spot: use the
"This card is wrong" button.

### The level decks

`scripts/a1/` holds the source lists and the scripts; `scripts/a1/` and
`scripts/a2/` hold every batch's files for their level.
`PASSES.md` describes the passes. Numbers are computed by `numbers.mjs`, never
written by a model. Each of the 13 batches (11 of words, 2 of grammar) hid six
decoy cards among the real ones, taken from another batch; every batch caught
6 out of 6 (A2: 17 batches, 102 decoys; B1: 28 batches, 168 decoys, one
batch judged twice, see doc 138 §12.8), and `assemble.mjs` refuses to build
a deck otherwise.

Decks load on demand: each one is its own file in the build, opened the
first time its tab is.

Word list: CEFR-J Wordlist 1.5 and Grammar Profile, Tono Laboratory, Tokyo
University of Foreign Studies (http://www.cefr-j.org/), free for research and
commercial use when cited.

## Development

The port is declared in three places that must agree: `apps/dev-ports.json`,
`vite.config.ts` and `mnemo-plugin.json` (`pnpm check:ports`).

`package.json.draft` becomes `package.json` at the next `pnpm install` run
with the app closed. Until then the cartridge appears in the app but cannot
be opened.

## Licence

MIT. See [LICENSE](LICENSE). `src/lib/schedule.ts` and `src/lib/day.ts` are
copied from the Melete cartridge (MIT).
