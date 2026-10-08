# B1 writing pass — instructions

You write flashcards for learners of English at CEFR level B1 (they already know A1 and A2). The learners speak French (France) or Spanish (Spain).

## Word batches (folders 01 to 26)

Read `NN/entries.json`: entries `{id, headword, pos, variants?, sourceTopics?}`. Read no other file in the batches folder.

For EACH entry produce one card:

- `id`: unchanged.
- `example`: one English sentence that uses the headword AS THAT PART OF SPEECH. Natural, correct, at most 14 words, vocabulary up to B1. Any tense is fine. The sentence must make the meaning of the word clear. No idioms or slang. Use the headword's own spelling, and prefer the headword's base form (or a regular -s/-ed/-ing form) so it can be found in the sentence. End with proper punctuation.
- `gloss`: `{"fr": ..., "es": ...}` the translation of the headword IN THE SENSE OF YOUR EXAMPLE, 1 to 4 words. Nouns with their definite article ("le chien", "l'école"; "el perro", "la casa"). Verbs in the infinitive.
- `exampleGloss`: `{"fr": ..., "es": ...}` a natural translation of the example, as a native of France / Spain would say it (no word-for-word calques, correct gender agreement and tenses).
- `topic`: exactly ONE id from this closed list: people, body, food, home, clothes, town, transport, school, work, time, nature, animals, leisure, shopping, feelings (feelings, personality, adjectives describing things and people), actions (common verbs), smallwords (articles, pronouns, prepositions, conjunctions, auxiliaries, question words, very common adverbs). `sourceTopics`, when present, is a hint; follow it unless it clearly does not fit. Abstract nouns go where they fit best (e.g. "economy" → work, "opinion" → feelings).

Write `NN/written.json`: a JSON array, same order, one card per entry, UTF-8, keys exactly `id, example, gloss, exampleGloss, topic`. Check it parses and has one card per entry.

## Grammar batches (g1, g2)

Read `gN/entries.json`: entries `{id, headword, pos, theme}`. `headword` names a B1 grammar point from the CEFR-J Grammar Profile; `pos` gives its sentence type when there is one (AFF. DEC. = affirmative statement, NEG. DEC. = negative statement, NEG. IMP = negative command, SUBORDINATE CLAUSE = the point is in a subordinate clause). Entries come in pairs (`-a`, `-b`) for the same point.

For EACH entry:

- `id`: unchanged.
- `example`: one English sentence that clearly shows that grammar point (in that sentence type). Natural, correct, at most 14 words, vocabulary up to B1. The `-a` and `-b` sentences of a pair must be DIFFERENT (different subject or situation), and no sentence may repeat another entry's sentence.
- `exampleGloss`: `{"fr", "es"}` a natural translation as a native would say it.
- `topic`: copy the entry's `theme` exactly.

Write `gN/written.json`: JSON array, same order, keys exactly `id, example, exampleGloss, topic`.
