# Song staff credits

Per-track staff (作詞 lyrics / 作曲 music / 編曲 arrange / vocal / chorus / remix / circle) stored on
catalog tracks and shown in the now-playing **Credits** block.

## Schema

On each track in `src/assets/catalogs/yura.json`:

```jsonc
"staff": {
  "lyrics":  ["葉月ゆら"],   // 作詞
  "music":   ["Drop"],        // 作曲 / composition
  "arrange": ["アメディオ"],  // 編曲 / arrangement
  "vocals":  ["葉月ゆら"],    // 歌 / vocal (defaults to 葉月ゆら)
  "chorus":  ["..."],         // コーラス
  "remix":   ["..."],
  "circle":  ["IOSYS"],       // doujin circle / label
  "notes":   "free text"      // anything unstructured
}
```

All roles optional; arrays of names in their original script. The legacy free-text `credit` string
is kept as a verbatim fallback — the player shows structured `staff` when present, otherwise `credit`.

## Pipelines (idempotent)

| script | source → output |
| --- | --- |
| `parse-credits.mjs [--write]` | the 113 free-text `credit` strings → structured `staff` in the catalog |
| `mine-meriole.mjs` | meriole per-track JP `.docx` (`~/Downloads/meriole/*.7z` → `/tmp/mall`) → `meriole-staff.json` |
| `apply-staff.mjs <map.json> [--write]` | merge a `{album:{track:staff}}` map into the catalog, only where a track has no staff yet |

`apply-staff.mjs` matches track keys to the catalog's own zero-padded value (with unpadded / position
fallbacks) and is verified against instrumental flags so interlude tracks never get credited.

## Web / Wayback harvest

`web-targets.json` lists lyrics albums still missing staff. A harvest agent fills `web-staff.json`
from VGMdb (primary, structured), BOOTH/official, community blogs, and the Wayback Machine — factual
credits only, never lyrics. Merge with `apply-staff.mjs web-staff.json --write`.

## Display

`player.js` → `creditsHTML()` builds the `.np-credits` block inside `renderInto()`; it renders in the
now-playing lyrics view regardless of language or whether lyrics exist. Styles: `.np-credits*` in
`yura.css`.
