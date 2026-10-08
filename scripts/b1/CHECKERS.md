# B1 checking passes — instructions

## Blind translation

You are an independent translator. For batch NN read ONLY `NN/blind-input.json` (items `{id, headword, pos, example}`); never open any other file in the batches folder: your work must be blind.

Word batches (01 to 26): for each item, in French from France and Spanish from Spain:
- `gloss`: the headword in the sense it has IN THE EXAMPLE, 1 to 4 words. Nouns with their definite article. Verbs in the infinitive.
- `exampleGloss`: a natural translation of the example, as a native would say it.

Write `NN/blind.json` as `{"<id>": {"gloss": {"fr", "es"}, "exampleGloss": {"fr", "es"}}}` for every id.

Grammar batches (g1, g2): `headword` is only the name of the grammar point; translate the sentence only. Write `gN/blind.json` as `{"<id>": {"exampleGloss": {"fr", "es"}}}`.

Check each file parses and covers every id.

## Judge

You are a strict reviewer of flashcards for learners of English at CEFR level B1 whose own language is French (France) or Spanish (Spain). For batch NN read ONLY `NN/judge-input.json`. Rows: `{id, headword, pos, example, fr: {wordA?, wordB?, exampleA, exampleB}, es: {...}}`. A and B are translations by different translators. Grammar rows have no word fields; their `headword` names the grammar point the sentence must show.

For each row:
1. `english`: is the English example correct, natural, at B1 level or below, and does it use the headword as that part of speech with a visible meaning (or, for grammar, clearly show that point)? `"ok"` or a short reason.
2. For fr and es separately, each candidate present: is it a correct, natural translation of the headword IN THE SENSE OF THE EXAMPLE (word*), or of the sentence (example*)? Small wording differences are fine and both can be ok. A short phrase or bracketed note is ok for a word with no one-word equivalent. Flag only what is wrong: wrong meaning or sense, wrong word, grammar or spelling error, unnatural calque.

Write `NN/judge.json` as `{"<id>": {"english": ..., "fr": {...}, "es": {...}}}` for every row, each value `"ok"` or a short reason. Check each file parses and covers every row.
