# Lyrics pipeline

Collect Japanese lyrics for the discography, then fill romaji + English — first with an AI
pass (clearly attributed, meant to be replaced), later with human contributions. Every block
carries its author so the app can credit it and mark machine vs. human work.

- **Schema:** `SCHEMA.md` — the shape of `src/assets/catalogs/lyrics.json`.
- **Prompts:** `prompts/` — `conventions.md` (read first), `romaji.md`, `translate-en.md`,
  `community-task-template.md` (hand one to a volunteer per track).

## Where the Japanese comes from

1. **Text lyrics already in the archive** — recent HATU/SEFU albums ship a `歌詞/` (or
   `Lyrics/`) folder of per-track `.txt` files. These need no OCR. Highest-yield source.
2. **Booklet scans** — older albums only have booklet images. The Japanese has to be
   transcribed from the scan (OCR or by eye). Slower; queue these.
3. **Pre-made translation sets** — e.g. the Gothika `.docx` set already has JP + romaji +
   FR + EN; parse straight into the schema with the original translator credited.

Nothing here is scraped from the open web — only the community archive material.

## Pipeline stages

```
extract  →  ingest JP  →  (AI or human) romaji + EN  →  lyrics.json  →  app
```

1. **extract** — `extract-sources.mjs` pulls only text + booklet images out of the Drive
   zips (never the FLAC audio) into a working tree, and maps each archive album folder onto
   its `yura.json` album title.
2. **ingest JP** — `ingest-text-lyrics.mjs` parses the `歌詞/*.txt` files into `lyrics.json`
   as `jp` blocks (`kind: "transcription"`, credited to the archive uploader).
3. **fill** — `build-work-queue.mjs` lists every track that has `jp` but is missing `romaji`
   or `en`, and writes one prompt file per job under `work/`. An AI pass (Claude) or a human
   (via `community-task-template.md`) produces the block; results are merged back into
   `lyrics.json` with attribution.

## Attribution rule

- AI-produced blocks: `by: "Claude (Opus 4.8)"`, `kind: "ai"` — placeholder, replace later.
- Human blocks: `by: "<their handle>"`, `kind: "human"` (or `transcription` for typed JP).
- Official booklet text: `kind: "official"`.

The app shows `by` at the end of each language's lyrics, and can style `kind: "ai"` as a
machine draft.

## Copyright

Lyrics are © their rights holders. This archive is a fan/community effort; hosting and
distribution are the site owner's decision. A copyright/credits page in the app is planned
(not built yet). Keep `src` provenance on every block.
