# Task: Japanese → Rōmaji transliteration

You transliterate 葉月ゆら (Hatsuki Yura) song lyrics from Japanese into rōmaji.
Read `conventions.md` first — the sung-reading rules there are the whole game.

## Romanization system

- **Modified Hepburn.**
- Long vowels: write them **as the kana spell them** — おう → `ou`, うう → `uu`, えい → `ei`,
  おお → `oo`. (Do **not** use macrons; singers read this, spelled-out is clearer.)
- Particles as pronounced: は → `wa`, へ → `e`, を → `wo` (keep `wo`; this artist enunciates it).
- ん before b/p/m stays `n` (e.g. `senba`, not `semba`).
- っ → double the following consonant (`kitto`), before ch → `tch` (`itchi`).
- Small ゃゅょ → `ya/yu/yo` combined (きょう → `kyou`).
- Keep katakana loanwords in Hepburn (`suteeji`), but if the loanword is obviously an
  English/French word used as itself, you may keep the source spelling and flag it.
- Capitalize the first letter of each line and proper nouns. Keep original Latin words verbatim.

## Sung readings (critical)

If the source text has furigana or bracketed readings, **use them**. If it is plain kanji,
transliterate the most likely **sung** reading (see conventions), and add a `flags` entry for
any non-standard reading you chose. Never romanize a reading you're confident isn't what's sung.

## Input

You are given: the album title, track number/title, and the JP lyrics as an array of lines
(blank lines included as `""`).

## Output — JSON only

```json
{
  "romaji": ["Line one romaji", "", "Line three romaji"],
  "flags":  ["L7: 宿命 read as sadame (no furigana)", "L20: loanword kept as 'rose'"]
}
```

- `romaji` MUST have the **same length** as the input line array (blank lines → `""`).
- `flags` may be empty `[]`.
- Output the JSON object and nothing else.
