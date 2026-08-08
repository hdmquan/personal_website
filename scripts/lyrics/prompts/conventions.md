# Shared conventions for 葉月ゆら (Hatsuki Yura) lyrics work

These apply to **both** the romaji and the English tasks. They exist because this artist's
catalog is gothic / fantasy / fairy-tale doujin music with heavy wordplay, and a naive pass
gets a lot wrong.

## The core problem: sung readings ≠ dictionary readings

Hatsuki Yura's lyrics constantly use **ateji / gikun** — a kanji written but a *different*
word sung. The booklet furigana (small kana above the kanji) is the source of truth for what
is actually sung. When you only have the plain text (no furigana), you must infer the sung
reading from context and flag it.

Common patterns to watch for:
- 運命 sung as **sadame**, not *unmei*
- 永遠 sung as **towa** / **toki**, not *eien*
- 少女 sung as **ko**, 世界 as **せかい/sekai** but sometimes as a foreign gloss
- A kanji compound with katakana furigana giving an **English or French** reading
  (e.g. 薔薇 glossed as "rose", 月 as "luna"). If the furigana is a foreign word, the **sung**
  line is that foreign word.

**Rule:** transliterate/interpret what is *sung*. If you cannot tell and have no furigana,
pick the most likely sung reading, keep the line count, and add a `flags` note like
`"L12: 運命 read as sadame? no furigana in source"`.

## Structure & alignment

- Preserve **line breaks** exactly as in the JP source. One JP line → one output line.
- Preserve **blank lines** (stanza breaks) as empty strings.
- Repeated refrains are written out each time they appear (do not collapse).
- Leave **English/French/Latin** words that appear in the original as-is.
- Do **not** add title lines, credits, romanization keys, or commentary into `lines`.
  Those go in `flags` or the block's `by`/`src`, never in the lyric body.

## Names & proper nouns

- Keep character/place names as the booklet spells them in Latin script if it gives one.
- If only kanji/kana, romanize the name (romaji task) and keep it as a name (EN task) —
  do not translate names into common nouns unless the lyric is clearly using the literal
  meaning.

## Uncertainty is data, not something to hide

Anywhere you guessed, merged, or couldn't parse, record it in `flags`. A flagged line a human
can fix beats a confident wrong line. Never silently drop or pad content to make it look clean.

## Output contract

You return **JSON only**, matching the schema the task prompt gives you. No prose around it.
`lines` is an array of strings, one per displayed line, blank lines included as `""`.
