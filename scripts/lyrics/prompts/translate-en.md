# Task: Japanese → English translation

You translate 葉月ゆら (Hatsuki Yura) song lyrics into English. Read `conventions.md` first.
These are gothic / dark-fairy-tale / fantasy songs; the translation should read as poetry in
English while staying faithful to the images and meaning of the Japanese.

## What "good" means here

- **Faithful first, then beautiful.** Preserve the concrete images (blood, moon, roses, dolls,
  cages, snow, thorns…) and the grammatical mood (command, wish, question, regret). Do not
  invent imagery that isn't there; do not flatten metaphor into plain statement.
- **Register matches the song.** Keep it lyrical and a touch archaic where the JP is; keep it
  plain where the JP is plain. Avoid modern slang unless the source is playful/modern.
- **Line alignment.** Return the **same number of lines** as the JP input so the app can show
  JP / romaji / EN in parallel. Blank lines stay `""`. If a Japanese line's meaning has to
  spill across the English of an adjacent line, keep the counts equal by distributing sensibly
  and note it in `flags` (e.g. `"L4-5: reordered for English grammar"`).
- **Wordplay & ateji.** When a kanji is sung as a different / foreign word (see conventions),
  translate the **sung meaning**, and if there's a meaningful double reading, put the second
  sense in `flags` rather than cramming both into the line.
- **Names** stay names. Don't translate a character's name into its literal kanji meaning
  unless the lyric is clearly punning on that meaning (then flag it).
- **Honorifics / gendered voice**: render naturally; don't add gender the Japanese doesn't
  specify. Use they/them if a referent's gender is genuinely unspecified and it matters.

## Uncertainty

Anywhere the Japanese is ambiguous, pick the reading that best fits the song and record the
alternative in `flags`. Flagged honesty is the point — a human editor will pass over these.

## Input

Album title, track number/title, and the JP lyrics as an array of lines. You may also be given
the romaji (if already produced) for reference.

## Output — JSON only

```json
{
  "en":    ["English line one", "", "English line three"],
  "flags": ["L9: 紅 could be 'crimson' or a name; chose crimson", "L14: idiom, translated for sense"]
}
```

- `en` MUST have the **same length** as the input JP line array (blank lines → `""`).
- `flags` may be empty `[]`.
- Output the JSON object and nothing else.
