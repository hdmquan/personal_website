# Lyrics — overnight run (2026-08-07 → 08)

## TL;DR
- The 14 Google Drive zips (~19 GB) finished downloading. I extracted only the text +
  scan material (never the FLAC), inventoried all 107 album folders, and found that the
  **recent HATU/SEFU albums ship `歌詞/Lyrics` text files** — real Japanese lyrics, no OCR.
- Built the whole **lyrics pipeline + schema + prompts** you asked for, then ran the
  **jp→romaji + jp→English AI pass via agents** over every text-lyric track found.
- **Result: 13 albums, 65 tracks** with Japanese + Rōmaji + English, each block
  **attributed** (JP = official booklet; romaji/EN = "Claude (Opus 4.8) · AI draft").
  Includes the **Gothika** set (9 tracks) which is fully **human** (JP + romaji + EN all
  from the community translation set, no AI needed there).
- **Wired the player** to render lyrics with the language switcher + the author credit at
  the end — verified working in the browser. **Committed locally but NOT pushed** — it's a
  UI change; please review and push yourself.

## What's where
- `src/assets/catalogs/lyrics.json` — the data the app reads (album → track → jp/romaji/en block).
- `scripts/lyrics/SCHEMA.md` — the schema, incl. the attribution fields (`by`, `kind`).
- `scripts/lyrics/prompts/` — the prompts that make this repeatable:
  - `conventions.md` (the sung-reading / ateji rules — read first)
  - `romaji.md`, `translate-en.md` (the AI/human task prompts)
  - `community-task-template.md` — hand ONE of these to a volunteer per track (1 file, 1 task).
- `scripts/lyrics/*.mjs` — `map-and-queue` → `emit-tasks` → (agents) → `merge` → `coverage` / `scan-queue`.
- `scripts/lyrics/work/` — intermediate (jobs, per-album task specs, raw agent output). Regenerable.

## Coverage
- **65 / 927 vocal tracks (7%)** have JP+romaji+EN right now (13 albums, incl. Gothika 9/10).
- Each of those 12 albums is **5/7 (or 3/5, 4/6)** — the archive's `歌詞` folders only held
  tracks 2–6, so **track 1 and the last vocal track of each are still missing** (they're in
  the booklet scans, not the text files).
- **160 albums (847 vocal tracks) have no text lyrics** — their lyrics live only in booklet
  **scan images**. `scripts/lyrics/work/scan-queue.json` lists the 63 albums (~480 tracks)
  whose booklets I can see in the archive, ranked by page count. That's the OCR phase.

## Quality notes (the AI pass is a *draft*)
- Every agent flagged its guesses (kept in each track's `flags`): ateji/sung readings with no
  furigana (運命→sadame vs unmei, 永遠→towa vs eien…), foreign glosses, wordplay, Shift-JIS
  re-decodes. These are honest markers for a human editor, not silent errors.
- The "secret text" (しーくれっとてきすと) bonus files were correctly skipped — they're Yura's
  liner messages, not lyrics.

## Decisions for you
1. **Review + push** the player change (yura.css / player.js / lyrics.json). Dev server is
   still up at http://localhost:8080 — play an Achroite/Abyss/Labyrinth track → Lyrics.
2. **OCR phase go/no-go.** I did NOT mass-OCR the 480 scan-tracks unattended — quality from
   scans needs your eye and it's a lot of compute. Say the word and I'll run the same
   agent pipeline with a vision step over `scan-queue.json`.
3. **Attribution defaults** — JP is credited "official booklet", the Gothika EN as
   "community (Gothika translation set)" (no author metadata in the files — correct it if you
   know them; you mentioned meriole/tumblr). AI blocks are "Claude (Opus 4.8)".
4. Copyright/credits page — untouched, as you said. Ready when you are.

## Re-run cheatsheet
```bash
node scripts/lyrics/map-and-queue.mjs <extracted-text-root>   # rebuild job queue
node scripts/lyrics/emit-tasks.mjs                            # per-album task specs
# (run translation agents over scripts/lyrics/work/tasks/*.json)
node scripts/lyrics/merge.mjs                                 # assemble lyrics.json (idempotent)
node scripts/lyrics/coverage.mjs                              # coverage report
```
