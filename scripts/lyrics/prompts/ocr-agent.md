# OCR agent instructions (one album from booklet scans)

You OCR and translate one 葉月ゆら (Hatsuki Yura) album's lyrics from booklet SCAN images.

1. Read the guideline files in full: `scripts/lyrics/prompts/conventions.md`,
   `romaji.md`, `translate-en.md` (same directory as this file).

2. Read your task spec (path given to you). It has: `album`, `year`, `outPath`,
   `catalogTracks` [{n,title,instrumental}], and `images` (absolute paths to booklet pages).

3. VIEW every image in `images` with the Read tool. They are booklet pages — lyrics are
   often printed over dark artwork; read carefully, brighten/zoom by re-reading if needed.
   The booklet prints the **sung reading** as furigana or inline parentheses
   (e.g. 男爵(バロン), 自鳴琴(オルゴール)) — USE those for the romaji; this is the whole point of
   working from scans instead of plain text. Some pages are art-only, tracklist, or credits —
   skip those.

   **If the booklet has NO printed lyrics at all** (art/illustration only): write an empty
   JSON object `{}` to `outPath` and report "no printed lyrics" — do not invent anything.

4. For each VOCAL track whose lyrics appear in the booklet:
   - `jp`: transcribe the Japanese EXACTLY as printed — one array entry per line, blank line
     = "". Keep parenthetical furigana glosses inline as printed. DROP the track-header line
     (number/title + 作詞/作曲/編曲 credits).
   - `romaji`: the sung reading (use the furigana). Same number of lines as `jp`.
   - `en`: English translation. Same number of lines as `jp`.
   - Track number from the booklet header/order; match the title to `catalogTracks`; use the
     catalog title. Exclude instrumental tracks.

5. Write ONE valid UTF-8 JSON file (Write tool) to `outPath`:
   ```json
   {
     "<track#>": {
       "title": "<catalog title>",
       "jp":     { "lines": ["line",""], "by": "official booklet · OCR: Claude (Opus 4.8)", "kind": "transcription", "src": "booklet scan — <album>", "date": "2026-08-07" },
       "romaji": ["line",""],
       "en":     ["line",""],
       "flags":  ["notes"]
     }
   }
   ```
   `jp.lines` / `romaji` / `en` MUST be equal length per track. No instrumental-only tracks.

6. Return ONLY a short summary: track numbers written, line counts, which pages had lyrics vs
   art, anything illegible/uncertain, or "no printed lyrics". DO NOT put lyric text in your reply.

IMPORTANT — avoid collisions: many OCR agents run in parallel and SHARE the scratchpad
directory. If you write ANY temporary/helper file (e.g. a Python script to brighten/crop a
scan), put it under a path unique to your task, e.g. `scripts/lyrics/work/tmp/<your spec id>/…`
(create the dir). NEVER write to a generic shared name like `scratchpad/build.py` — another
agent will overwrite it and corrupt your run. Prefer transcribing directly without helper files.

Quality bar: the booklet furigana gives the real sung readings — use them and flag anything you
can't read. Gothic / dark-fairy-tale; faithful to the imagery first, then poetic. The `jp` is an
OCR transcription (human audio-check later); romaji/en are AI drafts.
