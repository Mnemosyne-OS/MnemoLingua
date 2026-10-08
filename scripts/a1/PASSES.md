# The A1 passes

How every A1 card is made and checked (doc 138 §3.4b, §12). The same three
prompts run on every batch; only the file paths change.

## 1. Writing

Input: a batch of `entries.json` items `{id, headword, pos, variants?, sourceTopics?}`.
Output per entry: `{id, example, gloss: {fr, es}, exampleGloss: {fr, es}, topic}`.

- `example`: one English sentence using the headword AS THAT PART OF SPEECH,
  at most 10 words, A1 vocabulary, mostly present simple, meaning obvious.
- `gloss`: the word in the sense of the example, 1 to 4 words, nouns with
  their definite article, verbs in the infinitive.
- `topic`: one id of the closed list (people, body, food, home, clothes, town,
  transport, school, work, time, nature, animals, leisure, shopping, feelings,
  actions, smallwords). Anything else is refused by the assembler.

## 2. Blind translation

A second model gets `{id, headword, pos, example}` only (never the glosses)
and writes its own `gloss` and `exampleGloss` in French and Spanish.

## 3. Judge

A third model gets, per card and per language, the English headword, its part
of speech, the English example, and two candidate word glosses and two
candidate example glosses labelled A and B in a random order. It judges:

- the ENGLISH example: correct, natural, A1, uses the word as that part of
  speech (one verdict per card);
- each candidate gloss, separately: correct and natural for that sense.

A card ships as `two-pass` only if the English example and OUR glosses (the
writing pass) are all judged correct. Otherwise it is `to-review` and never
shown.

## Control

Each batch's judge run also judges a control copy with errors planted in
both the English and the glosses. A batch whose control is not caught in full
does not ship. The planted errors change from batch to batch.

## Numbers

Never written by a model: `numbers.mjs` computes the French and Spanish words,
tested in `src/lib/numbers.test.ts`. Their check state is `computed`.
