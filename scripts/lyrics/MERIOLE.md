# Meriole (Rorendor) — "Musical Tales of Yura Hatsuki"

The single biggest English source. Confirmed via her own return post + the Wayback index.

- **Old blog (closed):** `musicaltalesofyurahatsuki.wordpress.com` — **~40 albums / 173 song
  translations** (JP + English; later posts also French). Full modern discography 2013–2020.
  Deleted, but **fully archived** on the Wayback Machine and — being WordPress — harvestable.
  - Enumerate: `curl "http://web.archive.org/cdx/search/cdx?url=musicaltalesofyurahatsuki.wordpress.com*&fl=original&collapse=urlkey"`
  - Snapshot she linked: https://web.archive.org/web/20210825000545/https://musicaltalesofyurahatsuki.wordpress.com/tag/translation/
  - Harvest list of all 273 posts: `work/meriole-posts.txt` (prefix each with `https://web.archive.org/web/2021/`).
- **New blog (active):** https://www.tumblr.com/rorendor — resumed 2024+, bilingual FR/EN, new format.
  Has so far: Gothika ~赤羊音戯箱~, Garnet Bride, Mistletoe (黄昏の妖精歌), La Fata, 清風明月/La Bella Luna.
  Enumerate via the v1 API: `curl "https://rorendor.tumblr.com/api/read/json?num=50&start=0"`.
- Her note: early translations were rough (she's not a native English speaker); later ones solid.
  She's actively re-translating now — **coordinate with her** (X: @Rorendor) before mass-reusing,
  both for quality (prefer her newer versions) and credit/permission.
- Also linked Yura's OFFICIAL sites: https://hatukiyura.booth.pm/ , http://hatukiyura.sakura.ne.jp/

## rorendor downloads (full-translation packages — JP + Romaji + FR + ENG)

Each rorendor post is an announcement; the actual translation is a MediaFire `.7z`/`.docx`
(same format as the Gothika set). Download → drop in ~/Downloads → ingest (extract docx,
parse JP/romaji/EN, credit meriole). Verified 2026-08-09:

- **Garnet Bride** (✓ catalog): https://www.mediafire.com/file/6okoy9pdm02ctjh/ ….7z
- **Mistletoe -黄昏の妖精歌-** (✓): https://www.mediafire.com/file/0vwi27pw7nsmir7/ ….7z
- **La Fata** (✓, 2 tracks so far): https://www.mediafire.com/file/ct3sux8708dxcmn/ (track2 嘘吐きのエインセル .docx) · https://www.mediafire.com/file/j2rm066b45e2d6r/ (track5 友情 .docx)
- **Gothika ~赤羊音戯箱~** (already ingested): https://www.mediafire.com/file/ryvp11t037ygffr/ ….7z
- 清風明月 / La Bella Luna (not in catalog): https://www.mediafire.com/file/ohk7499r8fufnwq/ ….7z

Note: the full lyric text is NOT inline in the Tumblr post (only a sample stanza + links), so
the Tumblr can't be scraped directly — the files are the payload. New albums appear as she
posts them; re-run the rorendor v1 API to list: `curl "https://rorendor.tumblr.com/api/read/json?num=50"`.
