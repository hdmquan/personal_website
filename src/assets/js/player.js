/* ===========================================================================
   Shared fan-archive player engine.
   Design/layout live in the page's own HTML + CSS; this file is the behaviour only.

   Page contract (elements this engine requires):
     #shelf #album-view #album-head #track-list #stat-line #stat-info #stat-tip
     #shelf-controls #search #year-filter .seg-btn
     #yura-page #yura-hero #home-btn #back-btn #dark-toggle #kb-hint
     #np-bar #np-cover #np-title #np-meta #np-seek (+buf/fill/thumb/tip)
     #np-play #np-prev #np-next #np-shuffle #np-mute #np-vol-slider
   Config: window.__ARTIST__ = { name, mediaArtist, catalog }
   ======================================================================== */
(function () {
  'use strict';
  const ART = window.__ARTIST__ || {};
  // Same-origin catalog copy (R2 sends no CORS headers, so a cross-origin fetch
  // is blocked). Audio/cover URLs inside still point at R2 and load as media.
  const CATALOG = ART.catalog;

  /* ── State ─────────────────────────────────────── */
  let ALB = [];
  let view = 'shelf';
  let openAlbum = -1;
  let queue = [];               // the live window: capped history · now · upcoming
  let qi = -1;
  let stream = [];              // full ordered backing list (sort order, or shuffled) the window slides over
  let streamStart = 0;         // index in `stream` of queue[0]
  const Q_AHEAD = 30, Q_BEHIND = 30;   // rolling window — keep ~30 upcoming (auto-extend) and ~30 played
  let shuffle = false;
  let seeking = false;
  let wantPlay = false;         // user *intends* playback (for interruption resume)
  let excludeInst = false;      // skip instrumental tracks in auto-generated queues
  let loopMode = 0;             // 0 = off, 1 = loop all, 2 = loop one
  let sleepTimer = null, sleepEndOfTrack = false;   // sleep timer (queue panel)
  let queueMode = 'album';      // 'album' (continue to next album on end) | 'all'
  let npScreen = false;         // the full-screen now-playing view is open (own route #np=ai.ti)
  let pendingSeek = null;       // currentTime to apply once metadata loads (restore)
  let shelfScroll = 0;          // remember scroll when entering an album

  const SLUG = (location.pathname.match(/\/([^/]+)\//) || [])[1] || 'player';
  const LS = 'fa:' + SLUG;      // localStorage namespace, per artist
  const DEFAULT_TITLE = document.title;

  const audio = new Audio();
  audio.preload = 'none';
  audio.volume = 0.85;

  /* ── Persistence ───────────────────────────────── */
  const save = (k, v) => { try { localStorage.setItem(LS + ':' + k, JSON.stringify(v)); } catch (e) {} };
  const load = (k) => { try { return JSON.parse(localStorage.getItem(LS + ':' + k)); } catch (e) { return null; } };
  function saveSettings() { save('settings', { vol: Math.round(audio.volume * 100), muted: audio.muted, shuffle, loopMode, excludeInst }); }
  let npSaveT = 0;
  function saveNowPlaying() {
    if (!queue.length || qi < 0) { save('np', null); return; }
    save('np', { q: queue.map(x => [x.ai, x.ti]), qi, sh: shuffle, t: Math.floor(audio.currentTime || 0) });
  }

  /* ── Elements ──────────────────────────────────── */
  const $ = s => document.querySelector(s);
  const shelf = $('#shelf'), albumView = $('#album-view'), albumHead = $('#album-head'),
        trackList = $('#track-list'), statLine = $('#stat-line'), controls = $('#shelf-controls'),
        searchEl = $('#search');
  const npBar = $('#np-bar'), npCover = $('#np-cover'), npTitle = $('#np-title'),
        npTitleIn = $('#np-title-in'), npMeta = $('#np-meta'), npTip = $('#np-seek-tip'),
        npSeek = $('#np-seek'), npFill = $('#np-seek-fill'), npThumb = $('#np-seek-thumb'),
        npBuf = $('#np-seek-buf'), npPlay = $('#np-play'), kbHint = $('#kb-hint');

  const fmt = s => { s = Math.max(0, Math.floor(s||0)); return Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); };
  const fmtLong = s => { s = Math.floor(s||0); const h = Math.floor(s/3600), m = Math.round((s%3600)/60); return h ? h+' hr '+m+' min' : m+' min'; };
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fmtDate = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso)); return m ? (+m[3]) + ' ' + MON[+m[2]-1] + ' ' + m[1] : String(iso); };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const disp = t => t.instrumental ? t.title.replace(/\s*\[Instrumental\]\s*$/i, '') : t.title;
  const COPY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  // per-album purchase / source link (round icon) — only if the catalog provides one
  function buyLink(a) {
    const url = a.booth_url || a.source_url; if (!url) return '';
    const label = a.booth_url ? 'Buy on BOOTH' : 'Official page';
    return `<a class="ah-buy" href="${esc(url)}" target="_blank" rel="noopener" aria-label="${label}" title="${label}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
    </a>`;
  }

  /* ── Boot ──────────────────────────────────────── */
  renderSkeleton();
  // CMS-managed album notes (optional) → shown on the album page in place of the track count
  let NOTES = {};
  fetch('/assets/catalogs/album-notes.json')
    .then(r => (r.ok ? r.json() : {}))
    .then(n => { NOTES = n || {}; if (view === 'album' && openAlbum >= 0) openAlbumView(openAlbum); })
    .catch(() => {});

  // Per-track lyrics (optional) → shown in the now-playing lyrics view. Keyed album title → track number,
  // each language an attributed block { lines, by, kind, src }. See scripts/lyrics/SCHEMA.md.
  let LYRICS = {};
  fetch('/assets/catalogs/lyrics.json')
    .then(r => (r.ok ? r.json() : {}))
    .then(n => { LYRICS = n || {}; renderLyrics(); })
    .catch(() => {});

  fetch(CATALOG).then(r => r.json()).then(data => {
    ALB = data.albums || [];
    const s = data.stats || {};
    const tracks = s.tracks != null ? s.tracks : data.track_count;
    const vocal  = s.vocal_tracks, mins = s.vocal_minutes;
    let txt = tracks + ' tracks';
    if (vocal != null) txt += ' · ' + vocal + ' non-instrumental';
    if (mins  != null) txt += ' · ' + mins.toLocaleString() + ' min';
    statLine.textContent = txt;
    if (s.calculated_at) {
      const info = $('#stat-info'), tip = $('#stat-tip');
      tip.textContent = 'Last calculated ' + fmtDate(s.calculated_at);
      info.title = 'Last calculated ' + fmtDate(s.calculated_at);
      info.hidden = false;
    }
    buildFilters();
    controls.hidden = false;
    restoreSettings();
    renderShelf();
    restoreNowPlaying();
    applyRoute();
  }).catch(() => { statLine.textContent = 'failed to load catalog'; shelf.innerHTML = '<p class="empty">failed to load.</p>'; });

  function restoreSettings() {
    const s = load('settings'); if (!s) return;
    if (typeof s.vol === 'number') { volSlider.value = s.vol; applyVol(s.vol); }
    if (s.muted) { audio.muted = true; npBar.classList.add('muted'); }
    excludeInst = !!s.excludeInst; syncInstBtn();
    loopMode = s.loopMode|0; syncLoopBtn();
    // shuffle flag is restored together with the saved queue below
    shuffle = !!s.shuffle; syncShuffleBtn();
  }
  function restoreNowPlaying() {
    const np = load('np'); if (!np || !np.q || !np.q.length) return;
    queue = np.q.filter(([ai, ti]) => ALB[ai] && ALB[ai].tracks[ti]).map(([ai, ti]) => ({ ai, ti, inst: !!ALB[ai].tracks[ti].instrumental }));
    if (!queue.length) return;
    qi = Math.min(Math.max(np.qi|0, 0), queue.length - 1);
    shuffle = !!np.sh; syncShuffleBtn();
    // Rebuild the backing stream so playback can auto-extend past the saved window. When shuffled
    // (order can't be reproduced) the saved window itself becomes the stream.
    const cur = queue[qi];
    if (!shuffle) {
      const s = eligibleStream(); const idx = s.findIndex(x => keyOf(x) === keyOf(cur));
      if (idx >= 0 && idx - qi >= 0) { stream = s; streamStart = idx - qi; } else { stream = queue.slice(); streamStart = 0; }
    } else { stream = queue.slice(); streamStart = 0; }
    loadCurrent(false, np.t || 0);   // restore paused at saved position; user taps play to resume
  }

  /* ── Shelf rendering ───────────────────────────── */
  let sortMode = 'new', filter = '', yearFilter = '', genreFilter = '', releaseType = 'albums';
  const albGenres = a => a.genres || [];                    // album-level top-level genres
  const trkHasGenre = t => !genreFilter || (t.genres||[]).includes(genreFilter);
  function buildFilters() {
    const ysel = $('#year-filter');
    const years = [...new Set(ALB.map(a => String(a.year)).filter(Boolean))].sort((a, b) => b - a);
    ysel.insertAdjacentHTML('beforeend', years.map(y => `<option value="${y}">${y}</option>`).join(''));
    ysel.addEventListener('change', () => { yearFilter = ysel.value; updateFilterBadge(); renderShelf(); });

    const gsel = $('#genre-filter');
    if (gsel) {
      const freq = {};                                       // count by album presence
      ALB.forEach(a => albGenres(a).forEach(g => { freq[g] = (freq[g]||0) + 1; }));
      const genres = Object.keys(freq).sort((a, b) => freq[b] - freq[a]);
      gsel.insertAdjacentHTML('beforeend', genres.map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join(''));
      gsel.addEventListener('change', () => { genreFilter = gsel.value; updateFilterBadge(); if (view === 'album') openAlbumView(openAlbum); renderShelf(); });
    }

    const fbtn = $('#filter-btn'), fpop = $('#filter-pop');
    fbtn?.addEventListener('click', e => {
      e.stopPropagation(); const open = fpop.hidden; fpop.hidden = !open; fbtn.setAttribute('aria-expanded', String(open));
      if (open) {   // opening the filter → close the sort dropdown so only one shows at a time
        const sp = document.getElementById('sort-pop'), sb = document.getElementById('sort-btn');
        if (sp) sp.classList.remove('open'); if (sb) sb.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('click', e => { if (fpop && !fpop.hidden && !e.target.closest('.filter-wrap')) { fpop.hidden = true; fbtn.setAttribute('aria-expanded', 'false'); } });
  }
  function updateFilterBadge() {
    const b = $('#filter-badge'), fbtn = $('#filter-btn');
    const active = !!(yearFilter || genreFilter);
    if (b) b.hidden = !active;            // small accent dot on the FAB
    fbtn?.classList.toggle('active', active);
  }
  function sortedIndices() {
    let idx = ALB.map((_, i) => i);
    idx = idx.filter(i => (ALB[i].release_types || ['albums']).includes(releaseType));
    if (yearFilter) idx = idx.filter(i => String(ALB[i].year) === yearFilter);
    if (genreFilter) idx = idx.filter(i => albGenres(ALB[i]).includes(genreFilter));
    if (filter) {
      const f = filter.toLowerCase();
      idx = idx.filter(i => {
        const a = ALB[i];
        if (a.title.toLowerCase().includes(f)) return true;
        return (a.tracks || []).some(t => t.title.toLowerCase().includes(f));
      });
    }
    idx.sort((x, y) => {
      const a = ALB[x], b = ALB[y];
      if (sortMode === 'az') return a.title.localeCompare(b.title);
      const da = a.date || a.year, db = b.date || b.year;
      return sortMode === 'old' ? (da < db ? -1 : 1) : (da > db ? -1 : 1);
    });
    return idx;
  }

  function renderSkeleton(n = 18) {
    shelf.innerHTML = Array.from({length:n}, () => `
      <div class="alb-card skel" aria-hidden="true">
        <div class="alb-cover sk"></div>
        <p class="alb-title sk-line"></p>
        <p class="alb-sub sk-line short"></p>
      </div>`).join('');
  }

  function renderShelf() {
    const idx = sortedIndices();
    shelf.innerHTML = idx.map((i, pos) => {
      const a = ALB[i];
      // Above-the-fold covers must not be lazy — the LCP element lives here. Eager-load the
      // first rows and prioritise the very first so the LCP image starts fetching immediately.
      const eager = pos < 8;
      return `<button class="alb-card" data-ai="${i}">
        <div class="alb-cover sk">
          <img src="${esc(a.cover_url)}" alt="" loading="${eager ? 'eager' : 'lazy'}" fetchpriority="${pos < 4 ? 'high' : 'auto'}" decoding="async" width="300" height="300"
               onload="this.classList.add('loaded')" onerror="this.style.visibility='hidden'"/>
          <span class="alb-play"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>
        </div>
        <p class="alb-title">${esc(a.title)}</p>
        <p class="alb-sub">${esc(a.year)}${a.source_release ? ' · ' + esc(a.source_release) : ' · ' + (a.tracks||[]).length + ' tracks'}</p>
      </button>`;
    }).join('');
    if (!idx.length) shelf.innerHTML = '<p class="empty">No matches.</p>';
    requestAnimationFrame(syncShelfTitleHeights);
  }

  /* Keep metadata aligned without reserving two lines in rows where every title fits on one.
     Grid items cannot share an intrinsic inner-row height, so group the rendered cards by their
     physical row and apply that row's tallest clamped title height to its neighbours. */
  function syncShelfTitleHeights() {
    const cards = Array.from(shelf.querySelectorAll('.alb-card:not(.skel)'));
    const rows = new Map();
    cards.forEach(card => { const title = card.querySelector('.alb-title'); if (title) title.style.minHeight = ''; });
    cards.forEach(card => {
      const title = card.querySelector('.alb-title');
      if (!title) return;
      const row = Math.round(card.offsetTop);
      if (!rows.has(row)) rows.set(row, []);
      rows.get(row).push(title);
    });
    rows.forEach(titles => {
      const height = Math.max(...titles.map(title => title.getBoundingClientRect().height));
      titles.forEach(title => { title.style.minHeight = `${height}px`; });
    });
  }

  let shelfResizeFrame = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(shelfResizeFrame);
    shelfResizeFrame = requestAnimationFrame(syncShelfTitleHeights);
  });

  shelf.addEventListener('click', e => {
    const card = e.target.closest('.alb-card');
    if (!card) return;
    const album = ALB[+card.dataset.ai];
    if (album.card_mode === 'track') { playAlbumFrom(+card.dataset.ai, 0, false, true); return; }
    if (e.target.closest('.alb-play')) { playAlbumFrom(+card.dataset.ai, 0, false, true); return; }
    openAlbumView(+card.dataset.ai);
  });

  /* ── Release type tabs ─────────────────────────── */
  const releaseTabs = Array.from(document.querySelectorAll('.release-tab'));
  function selectReleaseType(next, focusTab) {
    if (!['albums', 'others'].includes(next)) return;
    releaseType = next;
    releaseTabs.forEach(tab => {
      const selected = tab.dataset.releaseType === next;
      tab.classList.toggle('active', selected);
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focusTab) tab.focus();
    });
    renderShelf();
  }
  releaseTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectReleaseType(tab.dataset.releaseType, false));
    tab.addEventListener('keydown', e => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      let next = index;
      if (e.key === 'ArrowLeft') next = (index - 1 + releaseTabs.length) % releaseTabs.length;
      if (e.key === 'ArrowRight') next = (index + 1) % releaseTabs.length;
      if (e.key === 'Home') next = 0;
      if (e.key === 'End') next = releaseTabs.length - 1;
      selectReleaseType(releaseTabs[next].dataset.releaseType, true);
    });
  });

  /* ── Sort + search ─────────────────────────────── */
  document.querySelectorAll('.seg-btn').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.seg-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); sortMode = b.dataset.sort; renderShelf();
  }));
  let st;
  searchEl.addEventListener('input', () => { clearTimeout(st); st = setTimeout(() => { filter = searchEl.value.trim(); renderShelf(); }, 120); });

  /* ── Album view ────────────────────────────────── */
  function openAlbumView(ai) {
    if (view === 'shelf') shelfScroll = window.scrollY;   // remember for restore
    openAlbum = ai; view = 'album';
    const a = ALB[ai];
    location.hash = 'a=' + ai;
    const shown = (a.tracks||[]).map((t, ti) => ({ t, ti })).filter(({ t }) => trkHasGenre(t));
    const secs = shown.reduce((n, { t }) => n + (t.dur||0), 0);
    albumHead.innerHTML = `
      <div class="ah-cover sk"><img src="${esc(a.cover_url)}" alt="" decoding="async" onload="this.classList.add('loaded')" onerror="this.style.visibility='hidden'"/></div>
      <div class="ah-info">
        <span class="ah-year">${esc(fmtDate(a.date || a.year))}</span>
        <h2 class="ah-title">${esc(a.title)}<button class="copy-inline" data-copy="album" type="button" aria-label="Copy album name" title="Copy album name">${COPY_SVG}</button></h2>
        ${ NOTES[a.title]
            ? `<div class="ah-note">${NOTES[a.title]}</div>`
            : `<p class="ah-count">${shown.length} tracks${secs ? ' · ' + fmtLong(secs) : ''}${genreFilter ? ' · ' + esc(genreFilter) : ''}</p>` }
        <div class="ah-actions">
          <button class="btn-ext btn-ext-play" id="play-all"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> Play</button>
          <button class="btn-ext" id="shuffle-all"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3h5v5M21 3l-7 7M4 20l7-7M16 21h5v-5M4 4l16 16"/></svg> Shuffle</button>
          ${buyLink(a)}
        </div>
      </div>`;
    trackList.innerHTML = shown.map(({ t, ti }) => `
      <li class="trk${t.instrumental ? ' is-inst' : ''}" data-ai="${ai}" data-ti="${ti}">
        <span class="trk-slot">
          <span class="trk-num">${esc(t.track)}</span>
          <span class="trk-ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>
        </span>
        <span class="trk-title">${esc(disp(t))}${t.instrumental ? '<em class="inst">INST</em>' : ''}</span>
        <button class="copy-inline trk-copy" data-copy="track" type="button" aria-label="Copy track name" title="Copy track name">${COPY_SVG}</button>
        ${t.dur ? `<span class="trk-dur">${fmt(t.dur)}</span>` : '<span class="trk-dur"></span>'}
      </li>`).join('');
    shelf.hidden = true; document.querySelector('#yura-hero').hidden = true;
    document.querySelector('#home-btn').hidden = true;
    albumView.hidden = false;
    // jump instantly — behavior:'instant' overrides html{scroll-behavior:smooth}, which would
    // otherwise animate up from wherever the (much taller) shelf was scrolled to.
    window.scrollTo({ top: 0, behavior: 'instant' });
    highlightPlaying();
  }

  function backToShelf() {
    view = 'shelf'; openAlbum = -1; location.hash = '';
    albumView.hidden = true; shelf.hidden = false; document.querySelector('#yura-hero').hidden = false;
    document.querySelector('#home-btn').hidden = false;
    window.scrollTo({ top: shelfScroll, behavior: 'instant' });   // restore shelf position instantly
  }
  $('#back-btn').addEventListener('click', backToShelf);

  albumView.addEventListener('click', e => {
    if (e.target.closest('.ah-buy')) return;   // let the buy link navigate
    const li = e.target.closest('.trk');
    if (li) { playAlbumFrom(+li.dataset.ai, +li.dataset.ti, false, true); return; }
    if (e.target.closest('#play-all')) playAlbumFrom(openAlbum, 0, false, true);
    if (e.target.closest('#shuffle-all')) playAlbumFrom(openAlbum, 0, true, true);
  });

  /* ── Queue + playback ──────────────────────────── */
  function shuf(arr) { for (let i=arr.length-1;i>0;i--){const j=(Math.random()*(i+1))|0;[arr[i],arr[j]]=[arr[j],arr[i]];} return arr; }
  function buildQueue(ai, respectFilter) {
    let q = (ALB[ai].tracks||[]).map((t, ti) => ({ ai, ti, inst: !!t.instrumental }));
    if (genreFilter) q = q.filter(x => (ALB[ai].tracks[x.ti].genres||[]).includes(genreFilter));
    if (respectFilter && excludeInst) q = q.filter(x => !x.inst);
    return q;
  }
  // The whole discography as one flat track list, in the current sort/filter order — the backing
  // list a queue slides over so playback continues seamlessly past the end of an album.
  function eligibleStream() {
    const s = [];
    sortedIndices().forEach(ai => buildQueue(ai, true).forEach(x => s.push(x)));
    return s;
  }
  // Point the window at `startIdx` in `full`: current at qi=0, ~Q_AHEAD upcoming, no history yet.
  function setWindow(full, startIdx) {
    stream = full; streamStart = Math.max(0, Math.min(startIdx, full.length - 1));
    queue = stream.slice(streamStart, streamStart + 1 + Q_AHEAD); qi = 0;
  }
  // After qi moves: top up the upcoming side to ~Q_AHEAD and trim history to ~Q_BEHIND.
  function reconcileWindow() {
    if (!stream.length) return;
    const target = Math.min(stream.length - streamStart, qi + 1 + Q_AHEAD);
    while (queue.length < target) queue.push(stream[streamStart + queue.length]);
    if (qi > Q_BEHIND) { const r = qi - Q_BEHIND; queue.splice(0, r); streamStart += r; qi -= r; }
  }
  const keyOf = x => x.ai + '.' + x.ti;

  function playAlbumFrom(ai, ti, shuffled, respectFilter) {
    shuffle = !!shuffled;
    const track = (ALB[ai] && ALB[ai].tracks[ti]) ? { ai, ti, inst: !!ALB[ai].tracks[ti].instrumental } : null;
    if (shuffle) {                                   // shuffle button on an album → that album, shuffled
      let q = buildQueue(ai, respectFilter); if (!q.length) q = buildQueue(ai, false);
      shuf(q);
      if (track) { const k = q.findIndex(x => x.ti === ti); if (k > 0) { q.splice(k, 1); q.unshift(track); } else if (k < 0) q.unshift(track); }
      setWindow(q, 0);
    } else {                                          // normal → continuous stream in sort order from here
      const s = eligibleStream();
      let idx = s.findIndex(x => x.ai === ai && x.ti === ti);
      if (idx < 0 && track) { let ins = s.findIndex(y => y.ai === ai); if (ins < 0) ins = 0; s.splice(ins, 0, track); idx = ins; }
      setWindow(s, idx < 0 ? 0 : idx);
    }
    syncShuffleBtn();
    loadCurrent(true);
  }

  // Turning instrumentals off drops them from the live window/stream too; if the current track was
  // an instrumental, resume at the nearest surviving track.
  function pruneInstFromQueue() {
    if (!excludeInst || !queue.length) return;
    const cur = queue[qi];
    let target = cur;
    if (cur && cur.inst) {
      target = null;
      for (let j = qi + 1; j < queue.length; j++) if (!queue[j].inst) { target = queue[j]; break; }
      if (!target) for (let j = qi - 1; j >= 0; j--) if (!queue[j].inst) { target = queue[j]; break; }
    }
    const s = shuffle ? stream.filter(x => !x.inst) : eligibleStream();
    let idx = target ? s.findIndex(x => keyOf(x) === keyOf(target)) : -1;
    setWindow(s, idx < 0 ? 0 : idx);
    if (cur && !cur.inst) { renderQueue(); saveNowPlaying(); } else loadCurrent(true);
  }

  function shuffleAll() {
    const s = eligibleStream(); if (!s.length) return;
    shuf(s); shuffle = true; syncShuffleBtn();
    setWindow(s, 0);
    loadCurrent(true);
  }

  let scrobbleMeta = null;
  let curDur = 0;          // catalog duration of the current track (authoritative when audio.duration is flaky)
  let endHandled = false;  // a track advances exactly once (native 'ended' OR our fallback)
  let endTimer = null;     // watchdog armed near the end in case 'ended' never fires (iOS streamed audio)
  function clearEndTimer() { if (endTimer) { clearTimeout(endTimer); endTimer = null; } }
  function loadCurrent(autoplay, startAt) {
    const q = queue[qi]; if (!q) return;
    const a = ALB[q.ai], t = a.tracks[q.ti];
    curDur = t.dur || 0; endHandled = false; clearEndTimer();
    // scrobble metadata for the new track (no-op unless a Last.fm session is connected).
    // a.artist overrides the default vocalist for circle/collab releases (e.g. La Bella Luna) so
    // scrobbles match how Last.fm catalogues them and pick up the right page + cover art.
    scrobbleMeta = { artist: a.artist || ART.mediaArtist || ART.name || '', track: t.title, album: a.album || a.title, duration: t.dur || 0, startedAt: Math.floor(Date.now() / 1000) };
    if (window.Scrobbler && window.Scrobbler.enabled) window.Scrobbler.track(scrobbleMeta);
    audio.src = t.url;            // setting src + play → R2 streams via range, no full download
    pendingSeek = (startAt && startAt > 0) ? startAt : null;
    npBar.classList.add('show');
    (npTitleIn || npTitle).textContent = disp(t) + (t.instrumental ? ' (inst)' : '');
    npMeta.textContent = a.title + ' · ' + a.year;
    npCover.querySelector('img')?.remove();
    const img = document.createElement('img'); img.src = a.cover_url; img.alt = ''; img.className = 'np-cover-img';
    npCover.prepend(img);
    // Mirror into the expanded now-playing sheet's hero (optional elements — no-op if absent).
    const heroImg = $('#np-hero-img'); if (heroImg && heroImg.src !== a.cover_url) { heroImg.classList.remove('loaded'); heroImg.src = a.cover_url; }
    const heroT = $('#np-hero-title'); if (heroT) heroT.textContent = disp(t) + (t.instrumental ? ' (inst)' : '');
    const heroA = $('#np-hero-artist'); if (heroA) heroA.textContent = a.artist || ART.name || '';
    const npFrom = $('#np-from'); if (npFrom) npFrom.textContent = a.title;
    const np2c = $('#np2-cur'); if (np2c) np2c.textContent = '0:00';
    const np2d = $('#np2-dur'); if (np2d) np2d.textContent = fmt(t.dur || 0);
    setPct(0); setBuf(0);
    document.title = DEFAULT_TITLE + ' | ' + a.title;
    applyMarquee();
    if (autoplay) {
      wantPlay = true; audio.play().catch(()=>{});
      if (window.Scrobbler && window.Scrobbler.enabled) window.Scrobbler.playing(scrobbleMeta);   // now-playing ping
    }
    setMediaSession(a, t);
    highlightPlaying();
    renderQueue();
    renderLyrics();
    renderInfo();
    saveNowPlaying();
    // Keep the URL pointing at the current track so it stays shareable; replaceState avoids
    // history spam on auto-advance and doesn't re-fire the router.
    if (npScreen) { const h = trackHash(); if (location.hash.slice(1) !== h) history.replaceState(null, '', '#' + h); }
  }

  function stopPlayback() { queue = []; qi = -1; stream = []; streamStart = 0; wantPlay = false; setPlayingUI(false); document.title = DEFAULT_TITLE; renderQueue(); save('np', null); }

  /* ── Lyrics ─────────────────────────────────────────
     Render the current track's lyrics into the mobile (#np-lyrics-scroll) and web
     (#np-sheet-lyrics) views. Data is optional; absent → the existing empty-state shows.
     Language (jp/romaji/en) is shared across both floating .np-lang pills. */
  let curLang = 'jp';
  function lyricsRec() {
    const q = queue[qi]; if (!q) return null;
    const a = ALB[q.ai]; if (!a) return null;
    const t = a.tracks[q.ti]; if (!t) return null;
    const alb = LYRICS[a.title]; if (!alb) return null;
    // keys match the catalog's own track value ("02"); fall back to unpadded / position
    return alb[t.track] || alb[String(Number(t.track))] || alb[String(q.ti + 1)] || null;
  }
  function lyricsBody(container) {
    let b = container.querySelector('.np-lyrics-body');
    if (!b) {
      b = document.createElement('div'); b.className = 'np-lyrics-body';
      const pill = container.querySelector('.np-lang');
      if (pill) container.insertBefore(b, pill); else container.appendChild(b);
    }
    return b;
  }
  // Per-song staff, rendered under the lyrics (independent of language / lyric availability).
  // Roles come from the catalog track's structured `staff`; falls back to the raw `credit` string.
  const STAFF_ROLES = [['lyrics','Lyrics'],['music','Music'],['arrange','Arrange'],['vocals','Vocals'],['chorus','Chorus'],['remix','Remix'],['circle','Circle']];
  function curTrack() { const q = queue[qi]; if (!q) return null; const a = ALB[q.ai]; if (!a) return null; return a.tracks[q.ti] || null; }
  function creditsHTML() {
    const t = curTrack(); if (!t) return '';
    const s = t.staff;
    const rows = [];
    if (s) {
      for (const [k, label] of STAFF_ROLES) {
        if (s[k] && s[k].length) rows.push(`<div class="np-cr-row"><span class="np-cr-role">${label}</span><span class="np-cr-name">${esc(s[k].join(' · '))}</span></div>`);
      }
      if (s.notes) rows.push(`<div class="np-cr-note">${esc(s.notes)}</div>`);
    } else if (t.credit) {
      rows.push(`<div class="np-cr-note">${esc(t.credit)}</div>`);
    }
    if (!rows.length) return '';
    return `<div class="np-credits"><div class="np-cr-h">Credits</div>${rows.join('')}</div>`;
  }
  function renderInto(container) {
    if (!container) return;
    const empty = container.querySelector('.np-lyrics-empty');
    const body = lyricsBody(container);
    const rec = lyricsRec();
    const blk = rec && rec[curLang];
    if (!blk || !blk.lines || !blk.lines.length) {
      body.hidden = true; body.innerHTML = '';
      if (empty) empty.hidden = false;
    } else {
      if (empty) empty.hidden = true;
      body.hidden = false;
      const rows = blk.lines.map(l => l === '' ? '<span class="ll-gap"></span>' : `<span class="ll">${esc(l)}</span>`).join('');
      // "By: <author>" — plus "· edited by <editors>" once a proofreader/editor is credited
      // (e.g. Suzuyo editing meriole's older transliterations). `editors` is an optional string[].
      const eds = Array.isArray(blk.editors) ? blk.editors.filter(Boolean) : [];
      let credit = `By: <span>${esc(blk.by || 'unknown')}</span>`;
      if (eds.length) credit += ` · edited by <span>${esc(eds.join(', '))}</span>`;
      body.innerHTML = `<div class="np-lyrics-lines">${rows}</div><div class="np-lyrics-credit">${credit}</div>`;
    }
    // credits used to live under the lyrics — they now render in the Info panel (renderInfo)
    const cw = container.querySelector('.np-credits-wrap'); if (cw) cw.remove();
  }
  function renderLyrics() { renderInto($('#np-lyrics-scroll')); renderInto($('#np-sheet-lyrics')); }

  // Info panel — track metadata + the song staff credits. Rendered into the mobile Info view
  // (#np-info-scroll, opened by the top-right Info button) and the web Info tab (#np-sheet-info-scroll).
  function infoHTML() {
    const q = queue[qi]; if (!q) return '';
    const a = ALB[q.ai]; if (!a) return '';
    const t = a.tracks[q.ti]; if (!t) return '';
    const genres = (t.genres && t.genres.length ? t.genres : a.genres) || [];
    const rows = [];
    rows.push(`<div class="np-info-row"><span class="np-info-k">Album</span><span class="np-info-v">${esc(a.title)}</span></div>`);
    if (a.year) rows.push(`<div class="np-info-row"><span class="np-info-k">Year</span><span class="np-info-v">${esc(a.year)}</span></div>`);
    rows.push(`<div class="np-info-row"><span class="np-info-k">Track</span><span class="np-info-v">${Number(t.track) || t.track} of ${a.tracks.length}</span></div>`);
    if (t.dur) rows.push(`<div class="np-info-row"><span class="np-info-k">Duration</span><span class="np-info-v">${fmt(t.dur)}</span></div>`);
    if (genres.length) rows.push(`<div class="np-info-row"><span class="np-info-k">Genre</span><span class="np-info-v">${esc(genres.join(' · '))}</span></div>`);
    const head = `<div class="np-info-hd"><div class="np-info-title">${esc(disp(t))}${t.instrumental ? ' <span class="np-info-inst">(inst)</span>' : ''}</div>`
      + `<div class="np-info-artist">${esc(a.artist || ART.name || '')}</div></div>`;
    return `<div class="np-info">${head}<div class="np-info-meta">${rows.join('')}</div>${creditsHTML()}</div>`;
  }
  function renderInfo() {
    const html = infoHTML();
    const m = $('#np-info-scroll'); if (m) m.innerHTML = html;
    const w = $('#np-sheet-info-scroll'); if (w) w.innerHTML = html;
  }
  // Language switch — keep both pills (mobile + web) in sync and re-render.
  Array.prototype.forEach.call(document.querySelectorAll('.np-lang-btn'), function (b) {
    b.addEventListener('click', function () {
      curLang = b.dataset.lang || 'jp';
      Array.prototype.forEach.call(document.querySelectorAll('.np-lang-btn'), function (x) {
        var on = x.dataset.lang === curLang;
        x.classList.toggle('active', on); x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1;
      });
      renderLyrics();
    });
  });

  function next() {
    if (stream.length && streamStart + qi + 1 < stream.length) { qi++; reconcileWindow(); loadCurrent(true); return; }
    if (loopMode === 1 && stream.length) { setWindow(stream, 0); loadCurrent(true); return; }   // loop all → wrap
    stopPlayback();
  }
  function prev() { if (audio.currentTime > 3) { audio.currentTime = 0; return; } if (qi > 0) { qi--; reconcileWindow(); loadCurrent(true); } }

  /* ── Audio events ──────────────────────────────── */
  audio.addEventListener('play',  () => setPlayingUI(true));
  audio.addEventListener('pause', () => {
    setPlayingUI(false); saveNowPlaying();
    // Some browsers pause at the very end instead of firing 'ended' (media control then sticks at
    // the end). Require the REAL finite duration here — during a track change audio.duration is
    // NaN, so a stale currentTime can't be mistaken for "at the end" and skip the new track.
    if (wantPlay && !endHandled && isFinite(audio.duration) && audio.duration > 0 && audio.currentTime >= audio.duration - 1) handleEnd();
  });
  function handleEnd() {
    if (endHandled) return;
    endHandled = true; clearEndTimer();
    if (sleepEndOfTrack) { sleepEndOfTrack = false; syncQFoot(); wantPlay = false; audio.pause(); return; }  // sleep: stop after this track
    if (loopMode === 2) { endHandled = false; audio.currentTime = 0; audio.play().catch(()=>{}); return; }  // loop one
    next();
  }
  audio.addEventListener('ended', handleEnd);
  audio.addEventListener('error', () => { if (queue.length && qi < queue.length - 1) { toast('Track unavailable — skipping'); next(); } });
  audio.addEventListener('loadedmetadata', () => {
    if (pendingSeek != null) { try { audio.currentTime = pendingSeek; } catch (e) {} pendingSeek = null; }
    updatePositionState();
  });
  audio.addEventListener('timeupdate', () => {
    // Safety net: iOS often doesn't fire 'ended' for streamed audio, so a track can stall at the
    // end and never advance. Once we're at the very end, let the native 'ended' win if it fires;
    // otherwise this watchdog advances ~2s later (only while playback is intended, so a deliberate
    // pause near the end is respected).
    const dur = (isFinite(audio.duration) && audio.duration > 0) ? audio.duration : curDur;
    if (dur > 2 && !endHandled && !endTimer && audio.currentTime >= dur - 0.25) {
      endTimer = setTimeout(() => {
        endTimer = null;
        const d = (isFinite(audio.duration) && audio.duration > 0) ? audio.duration : curDur;
        if (!endHandled && wantPlay && d && audio.currentTime >= d - 0.6) handleEnd();
      }, 2000);
    }
    if (seeking || !audio.duration) return;
    setPct(audio.currentTime / audio.duration * 100);
    const c2 = document.getElementById('np2-cur'), d2 = document.getElementById('np2-dur');
    if (c2) c2.textContent = fmt(audio.currentTime);
    if (d2) d2.textContent = fmt(effectiveDur());
    updatePositionState();
    if (window.Scrobbler && window.Scrobbler.enabled) window.Scrobbler.tick(scrobbleMeta, audio.currentTime, audio.duration);
    if ((npSaveT = (npSaveT + 1) % 20) === 0) saveNowPlaying();   // persist position ~every 20 ticks
  });
  audio.addEventListener('progress', () => {
    if (audio.buffered.length && audio.duration)
      setBuf(audio.buffered.end(audio.buffered.length-1) / audio.duration * 100);
  });

  /* Stall recovery: if playback should be running but currentTime hasn't advanced for a while
     (e.g. the network dropped near the end and the last bytes never arrived, or after a reconnect),
     advance when we're at the end, otherwise nudge playback to resume. */
  let lastCT = -1, lastCTAt = Date.now();
  setInterval(() => {
    if (!wantPlay || !queue.length) { lastCT = audio.currentTime; lastCTAt = Date.now(); return; }
    if (Math.abs(audio.currentTime - lastCT) > 0.1) { lastCT = audio.currentTime; lastCTAt = Date.now(); return; }  // progressing
    if (Date.now() - lastCTAt < 8000) return;                 // give a reconnect a few seconds first
    lastCTAt = Date.now();
    const d = effectiveDur();
    if (d && audio.currentTime >= d - 3) handleEnd();          // stuck at/near the end → move on
    else audio.play().catch(() => {});                         // buffering / interrupted mid-track → nudge resume
  }, 2500);

  function setPct(p){ npFill.style.width=p+'%'; npThumb.style.left=p+'%'; npSeek.setAttribute('aria-valuenow', Math.round(p));
    const f=document.getElementById('np2-fill'), th=document.getElementById('np2-thumb');
    if(f) f.style.width=p+'%'; if(th) th.style.left=p+'%'; }
  function setBuf(p){ npBuf.style.width=p+'%'; }
  function setPlayingUI(playing) {
    npPlay.classList.toggle('playing', playing);
    npPlay.querySelector('.i-play').style.display  = playing ? 'none' : '';
    npPlay.querySelector('.i-pause').style.display = playing ? '' : 'none';
    const p2 = document.getElementById('np2-play');
    if (p2) { p2.classList.toggle('playing', playing);
      p2.querySelector('.i-play').style.display = playing ? 'none' : '';
      p2.querySelector('.i-pause').style.display = playing ? '' : 'none'; }
    npBar.classList.toggle('is-playing', playing);
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
    highlightPlaying();
  }

  function highlightPlaying() {
    document.querySelectorAll('.trk.playing').forEach(el => el.classList.remove('playing'));
    document.querySelectorAll('.alb-card.playing').forEach(el => el.classList.remove('playing'));
    const playAll = document.getElementById('play-all');
    const q = queue[qi];
    const isPlaying = q && !audio.paused;
    if (playAll) playAll.classList.toggle('lit', !!(isPlaying && q.ai === openAlbum));
    if (!q) return;
    if (view === 'album' && q.ai === openAlbum) {
      const li = trackList.querySelector(`.trk[data-ti="${q.ti}"]`);
      if (li) li.classList.toggle('playing', true), li.classList.toggle('paused', !isPlaying);
    }
  }

  /* ── NP controls ───────────────────────────────── */
  function togglePlay() {
    if (!queue.length) return;
    if (audio.paused) { wantPlay = true; audio.play(); }
    else { wantPlay = false; audio.pause(); }
  }
  npPlay.addEventListener('click', togglePlay);
  $('#np-next').addEventListener('click', next);
  $('#np-prev').addEventListener('click', prev);
  function syncShuffleBtn() { const b = document.getElementById('np-shuffle'); if (b) b.classList.toggle('on', shuffle);
    document.getElementById('np2-shuffle')?.classList.toggle('on', shuffle); }
  function toggleShuffle() {
    shuffle = !shuffle; syncShuffleBtn();
    if (queue.length && stream.length) {
      const cur = queue[qi];
      const played = queue.slice(0, qi);                                  // keep what's already been played
      const seen = new Set(queue.slice(0, qi + 1).map(keyOf));
      let rest = eligibleStream().filter(x => !seen.has(keyOf(x)));       // everything not yet played, in sort order
      if (shuffle) shuf(rest);                                            // ...shuffled, or left in order
      stream = played.concat([cur], rest); streamStart = 0; qi = played.length;
      queue = stream.slice(0, qi + 1 + Q_AHEAD); reconcileWindow();
      renderQueue(); saveNowPlaying();
    }
    syncQFoot(); saveSettings();
  }
  $('#np-shuffle').addEventListener('click', toggleShuffle);

  /* ── Shuffle-all, instrumental toggle, loop (optional buttons) ── */
  document.getElementById('shuffle-all-btn')?.addEventListener('click', shuffleAll);

  const instEl = document.getElementById('inst-toggle');     // checkbox switch inside the filter popover
  function syncInstBtn() {
    document.body.classList.toggle('inst-off', excludeInst);  // greys + disables instrumental rows
    if (instEl && 'checked' in instEl) instEl.checked = !excludeInst;   // checked = instrumentals shown
  }
  instEl?.addEventListener('change', () => {
    excludeInst = !instEl.checked; syncInstBtn(); saveSettings();
    if (view === 'album') openAlbumView(openAlbum);           // re-render in case nothing else triggers it
    pruneInstFromQueue();                                     // drop instrumentals from the live queue too
  });
  syncInstBtn();

  const loopBtn = document.getElementById('np-loop');
  function syncLoopBtn() {
    const l2 = document.getElementById('np2-loop');
    if (l2) { l2.classList.toggle('on', loopMode > 0); l2.classList.toggle('one', loopMode === 2); }
    if (!loopBtn) return; loopBtn.classList.toggle('on', loopMode > 0); loopBtn.classList.toggle('one', loopMode === 2);
    loopBtn.setAttribute('aria-label', ['Loop off','Loop all','Loop one'][loopMode]); loopBtn.title = ['Loop off','Loop all','Loop one'][loopMode]; }
  loopBtn?.addEventListener('click', () => { loopMode = (loopMode + 1) % 3; syncLoopBtn(); syncQFoot(); saveSettings(); });

  /* volume */
  const volSlider = $('#np-vol-slider');
  function applyVol(v){ audio.volume = v/100; audio.muted = v==0;
    volSlider.style.background = `linear-gradient(90deg, var(--accent) ${v}%, var(--panel-inset) ${v}%)`; }
  applyVol(85);
  volSlider.addEventListener('input', () => { applyVol(+volSlider.value); saveSettings(); });
  $('#np-mute').addEventListener('click', () => { audio.muted = !audio.muted; npBar.classList.toggle('muted', audio.muted); saveSettings(); });

  /* ── In-screen (full player) transport — mirrors the mini-bar; every element optional ── */
  $('#np2-play')?.addEventListener('click', togglePlay);
  $('#np2-prev')?.addEventListener('click', prev);
  $('#np2-next')?.addEventListener('click', next);
  $('#np2-shuffle')?.addEventListener('click', toggleShuffle);
  $('#np2-loop')?.addEventListener('click', () => { loopMode = (loopMode + 1) % 3; syncLoopBtn(); syncQFoot(); saveSettings(); });
  const np2Seek = $('#np2-seek'), np2Fill = $('#np2-fill'), np2Thumb = $('#np2-thumb');
  if (np2Seek) {
    const to = cx => { const r = np2Seek.getBoundingClientRect(); const p = Math.min(1, Math.max(0, (cx - r.left) / r.width));
      if (np2Fill) np2Fill.style.width = (p*100) + '%'; if (np2Thumb) np2Thumb.style.left = (p*100) + '%';
      np2Seek.setAttribute('aria-valuenow', Math.round(p*100)); return p; };
    np2Seek.addEventListener('pointerdown', e => { if (!effectiveDur()) return; seeking = true; try { np2Seek.setPointerCapture(e.pointerId); } catch (_) {} to(e.clientX); });
    np2Seek.addEventListener('pointermove', e => { if (seeking) to(e.clientX); });
    np2Seek.addEventListener('pointerup', e => { if (!seeking) return; const p = to(e.clientX); seeking = false; applySeek(p * effectiveDur()); });
  }

  /* ── Queue panel (Spotify-style: pinned now-playing + reorderable/removable upcoming) ── */
  const queuePanel = document.getElementById('queue-panel'), queueList = document.getElementById('queue-list'),
        qNow = document.getElementById('q-now'), qSub = document.getElementById('q-sub'), qTimerPop = document.getElementById('q-timer-pop');

  const qCover = a => a && a.cover_url
    ? `<img class="q-cover" src="${esc(a.cover_url)}" alt="" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'"/>`
    : '<span class="q-cover"></span>';
  // instrumental versions share a title with their vocal track — mark them so the queue reads clearly
  const qName = t => esc(disp(t)) + (t.instrumental ? ' <em class="q-inst">inst</em>' : '');

  const qHistory = document.getElementById('q-history');
  function renderQueue() {
    if (!queueList) return;
    const cur = queue[qi];
    if (qSub) qSub.textContent = cur ? ('Playing · ' + (ALB[cur.ai] ? ALB[cur.ai].title : '')) : '';
    // played history (above the now-playing) — dimmed, tap to jump back; not reorderable
    if (qHistory) {
      let h = '';
      for (let i = 0; i < qi; i++) { const q = queue[i], a = ALB[q.ai], t = a.tracks[q.ti];
        h += `<li class="q-item q-played" data-i="${i}"><div class="q-row">${qCover(a)}<span class="q-meta"><span class="q-t">${qName(t)}</span><span class="q-a">${esc(a.title)}</span></span></div></li>`;
      }
      qHistory.innerHTML = h;
    }
    if (qNow) {
      if (cur) { const a = ALB[cur.ai], t = a.tracks[cur.ti];
        qNow.innerHTML = `<div class="q-now-row">${qCover(a)}<span class="q-meta"><span class="q-t">${qName(t)}</span><span class="q-a">${esc(a.title)}</span></span><span class="q-now-ic"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span></div>`;
      } else qNow.innerHTML = '';
    }
    const up = []; for (let i = qi + 1; i < queue.length; i++) up.push(i);
    if (!up.length) { queueList.innerHTML = '<li class="q-empty">Nothing queued next</li>'; syncQFoot(); return; }
    queueList.innerHTML = up.map(i => {
      const q = queue[i], a = ALB[q.ai], t = a.tracks[q.ti];
      return `<li class="q-item" data-i="${i}">
        <div class="q-del" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M9 6V4h6v2M7 6l1 14h8l1-14"/></svg></div>
        <div class="q-row">${qCover(a)}<span class="q-meta"><span class="q-t">${qName(t)}</span><span class="q-a">${esc(a.title)}</span></span>
          <button class="q-handle" aria-label="Drag to reorder" tabindex="-1"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9h16M4 15h16"/></svg></button></div>
      </li>`;
    }).join('');
    syncQFoot();
  }

  // upcoming-only edits keep qi fixed (everything acted on is after the current track); mirror to the stream
  function removeFromQueue(i) { if (i <= qi || i >= queue.length) return;
    queue.splice(i, 1); if (stream.length) stream.splice(streamStart + i, 1);
    reconcileWindow(); renderQueue(); saveNowPlaying(); }
  // tap a played track (history) → jump back to it
  qHistory?.addEventListener('click', e => { const li = e.target.closest('.q-item'); if (!li) return;
    qi = +li.dataset.i; reconcileWindow(); loadCurrent(true); });

  const queueBtn = document.getElementById('queue-btn');
  const queueOpen = () => !!queuePanel && queuePanel.classList.contains('open');
  // The now-playing screen is a real route: #np=<album>.<track> (shareable per track).
  function trackHash() { const q = queue[qi]; return q ? ('np=' + q.ai + '.' + q.ti) : 'np'; }
  function openQueue(pushHash) {
    if (!queuePanel || !queue.length) return;
    renderQueue(); queuePanel.classList.add('open'); queueBtn?.classList.add('on'); document.body.classList.add('np-open');
    npScreen = true;
    // open on the player view, at rest (full player, queue hidden until swiped up), queue tab (not lyrics)
    queuePanel.classList.remove('show-lyrics');
    // keep the web Up-next/Lyrics tab buttons in sync with the panel reset (else "Lyrics" stays
    // highlighted while the queue is shown after switching tracks — desktop bug)
    queuePanel.querySelectorAll('.np-tab[data-webtab]').forEach(function (t) {
      var on = t.dataset.webtab === 'upnext';
      t.classList.toggle('active', on); t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
    });
    document.getElementById('np-view-player')?.classList.remove('q-up');
    const qs = document.getElementById('np-queue-scroll'); if (qs) qs.scrollTop = 0;
    document.getElementById('np-seg-song')?.click();
    // start the queue at the currently-playing track (web/tablet show it immediately; mobile re-anchors on swipe-up)
    requestAnimationFrame(() => window.__npAnchorQueue && window.__npAnchorQueue());
    if (pushHash) { const h = trackHash(); if (location.hash.slice(1) !== h) location.hash = h; }   // history entry → Back closes
  }
  function closeQueue(popHash) {
    if (!queuePanel) return;
    queuePanel.classList.remove('open'); queueBtn?.classList.remove('on'); document.body.classList.remove('np-open');
    document.getElementById('np-view-player')?.classList.remove('q-up');
    npScreen = false;
    if (popHash && /^#np/.test(location.hash)) location.hash = (view === 'album' && openAlbum >= 0) ? ('a=' + openAlbum) : '';
  }
  // The queue button opens the now-playing screen AND rides straight up into the queue
  // (the grip's reveal animation), rather than landing at rest. rAF so the q-up transition plays.
  queueBtn?.addEventListener('click', e => {
    e.stopPropagation();
    if (queueOpen()) { closeQueue(true); return; }
    openQueue(true);
    requestAnimationFrame(() => requestAnimationFrame(() => window.__npEnterQueue && window.__npEnterQueue()));
  });
  document.getElementById('queue-close')?.addEventListener('click', () => closeQueue(true));

  /* tap an upcoming item → jump to it (suppressed right after a swipe/drag) */
  let suppressClick = false;
  queueList?.addEventListener('click', e => {
    if (suppressClick || e.target.closest('.q-handle')) return;
    const li = e.target.closest('.q-item'); if (!li) return;
    qi = +li.dataset.i; loadCurrent(true);
  });

  /* swipe-left to remove (on the row); the handle is reserved for reordering */
  let swipe = null;
  queueList?.addEventListener('pointerdown', e => {
    if (e.target.closest('.q-handle')) return;
    const row = e.target.closest('.q-row'), item = e.target.closest('.q-item');
    if (!row || !item) return;
    swipe = { item, row, x0: e.clientX, y0: e.clientY, dx: 0, active: false, decided: false, id: e.pointerId };
  });
  queueList?.addEventListener('pointermove', e => {
    if (!swipe || e.pointerId !== swipe.id) return;
    const dx = e.clientX - swipe.x0, dy = e.clientY - swipe.y0;
    if (!swipe.decided) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      swipe.decided = true; swipe.active = Math.abs(dx) > Math.abs(dy);   // horizontal → swipe, else let it scroll
      if (swipe.active) { swipe.row.style.transition = 'none'; try { queueList.setPointerCapture(e.pointerId); } catch (_) {} }
    }
    if (!swipe.active) return;
    swipe.dx = Math.min(0, dx);
    swipe.row.style.transform = `translateX(${swipe.dx}px)`;
  });
  function endSwipe(e) {
    if (!swipe || (e && e.pointerId !== swipe.id)) return;
    const s = swipe; swipe = null;
    if (!s.active) return;
    suppressClick = true; setTimeout(() => { suppressClick = false; }, 320);
    s.row.style.transition = '';
    if (s.dx < -s.row.offsetWidth * 0.4) { s.row.style.transform = 'translateX(-100%)'; setTimeout(() => removeFromQueue(+s.item.dataset.i), 160); }
    else s.row.style.transform = '';
  }
  queueList?.addEventListener('pointerup', endSwipe);
  queueList?.addEventListener('pointercancel', endSwipe);

  /* drag the handle to reorder (live) */
  let drag = null;
  queueList?.addEventListener('pointerdown', e => {
    const handle = e.target.closest('.q-handle'); if (!handle) return;
    e.preventDefault();
    drag = { item: handle.closest('.q-item'), id: e.pointerId };
    drag.item.classList.add('dragging');
    try { queueList.setPointerCapture(e.pointerId); } catch (_) {}
  });
  // FLIP: slide a displaced neighbour from its old spot to its new one instead of jumping
  function flipSwap(sibling, move) {
    const y0 = sibling.getBoundingClientRect().top;
    move();
    const dy = y0 - sibling.getBoundingClientRect().top;
    if (!dy) return;
    sibling.style.transition = 'none'; sibling.style.transform = `translateY(${dy}px)`;
    requestAnimationFrame(() => { sibling.style.transition = 'transform .2s ease'; sibling.style.transform = ''; });
  }
  queueList?.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const y = e.clientY, prev = drag.item.previousElementSibling, nextEl = drag.item.nextElementSibling;
    if (prev && y < prev.getBoundingClientRect().top + prev.offsetHeight / 2) flipSwap(prev, () => queueList.insertBefore(drag.item, prev));
    else if (nextEl && y > nextEl.getBoundingClientRect().top + nextEl.offsetHeight / 2) flipSwap(nextEl, () => queueList.insertBefore(nextEl, drag.item));
  });
  function endDrag(e) {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    const d = drag; drag = null; d.item.classList.remove('dragging');
    suppressClick = true; setTimeout(() => { suppressClick = false; }, 320);
    const order = [...queueList.querySelectorAll('.q-item')].map(li => queue[+li.dataset.i]);
    queue.splice(qi + 1, order.length, ...order);                        // replace the upcoming slice
    if (stream.length) stream.splice(streamStart + qi + 1, order.length, ...order);   // keep the stream in sync
    renderQueue(); saveNowPlaying();
  }
  queueList?.addEventListener('pointerup', endDrag);
  queueList?.addEventListener('pointercancel', endDrag);

  /* ── Footer: shuffle / repeat / timer ── */
  function syncQFoot() {
    const sh = document.getElementById('q-shuffle'), rp = document.getElementById('q-repeat'),
          rl = document.getElementById('q-repeat-lbl'), tm = document.getElementById('q-timer'), tl = document.getElementById('q-timer-lbl');
    if (sh) sh.classList.toggle('on', shuffle);
    if (rp) rp.classList.toggle('on', loopMode > 0);
    if (rl) rl.textContent = ['Repeat', 'Repeat all', 'Repeat one'][loopMode];
    const on = !!sleepTimer || sleepEndOfTrack;
    if (tm) tm.classList.toggle('on', on);
    if (tl) tl.textContent = on ? 'Timer on' : 'Timer';
  }
  document.getElementById('q-shuffle')?.addEventListener('click', toggleShuffle);   // on = shuffled · off = source order
  document.getElementById('q-repeat')?.addEventListener('click', () => { loopMode = (loopMode + 1) % 3; syncLoopBtn(); syncQFoot(); saveSettings(); });

  function setSleep(v) {
    clearTimeout(sleepTimer); sleepTimer = null; sleepEndOfTrack = false;
    if (v === 'track') sleepEndOfTrack = true;
    else if (v > 0) sleepTimer = setTimeout(() => { sleepTimer = null; wantPlay = false; audio.pause(); toast('Sleep timer — paused'); syncQFoot(); }, v * 60000);
    syncQFoot();
  }
  document.getElementById('q-timer')?.addEventListener('click', e => { e.stopPropagation(); if (qTimerPop) qTimerPop.hidden = !qTimerPop.hidden; });
  qTimerPop?.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const v = b.dataset.min; setSleep(v === 'track' ? 'track' : +v); qTimerPop.hidden = true; });
  document.addEventListener('click', e => { if (qTimerPop && !qTimerPop.hidden && !e.target.closest('.q-timer-wrap')) qTimerPop.hidden = true; });

  /* ── Marquee long now-playing title ────────────── */
  function applyMarquee() {
    if (!npTitleIn) return;
    npTitleIn.classList.remove('marquee'); npTitleIn.style.removeProperty('--shift');
    requestAnimationFrame(() => {
      const over = npTitleIn.scrollWidth - npTitle.clientWidth;
      if (over > 6) { npTitleIn.style.setProperty('--shift', '-' + over + 'px'); npTitleIn.classList.add('marquee'); }
    });
  }

  /* ── Tap the now-playing bar → jump to that album/track ── */
  function jumpToCurrent() {
    const q = queue[qi]; if (!q) return;
    openAlbumView(q.ai);
    const li = trackList.querySelector(`.trk[data-ti="${q.ti}"]`);
    if (li) li.scrollIntoView({ block: 'center' });
  }
  // Tapping the mini-player opens the now-playing screen (its own route, YouTube-Music style).
  npCover.addEventListener('click', () => openQueue(true));
  $('.np-main')?.addEventListener('click', () => openQueue(true));
  // "Jump to this album" moves onto the screen's album line, preserving the old behaviour.
  $('#np-hero-sub')?.addEventListener('click', () => { closeQueue(true); jumpToCurrent(); });

  /* ── Toast ─────────────────────────────────────── */
  let toastT;
  function toast(msg) {
    let el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2600);
  }

  /* seek (click + drag) */
  // Prefer the real audio duration; fall back to the catalog's when it's Infinity/0 (some streams).
  function effectiveDur() { return (isFinite(audio.duration) && audio.duration > 0) ? audio.duration : curDur; }
  // Seek, then confirm it landed — iOS streamed audio sometimes ignores the first currentTime set
  // (UI jumps but playback stays put). If it didn't take, re-apply once.
  function applySeek(sec) {
    const dur = effectiveDur();
    if (!dur) return;
    const target = Math.max(0, Math.min(sec, dur - 0.1));
    try { audio.currentTime = target; } catch (e) {}
    const t = setTimeout(() => {
      if (Math.abs(audio.currentTime - target) > 1.5) { try { audio.currentTime = target; } catch (e) {} }
    }, 350);
    audio.addEventListener('seeked', () => clearTimeout(t), { once: true });
  }
  function seekTo(clientX) {
    const r = npSeek.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    setPct(p*100);
    npTip.hidden = false;
    npTip.textContent = fmt(p * effectiveDur());
    npTip.style.left = (p*100) + '%';
    return p;
  }
  npSeek.addEventListener('pointerdown', e => { if (!effectiveDur()) return; seeking = true; npBar.classList.add('seeking'); npSeek.setPointerCapture(e.pointerId); seekTo(e.clientX); });
  npSeek.addEventListener('pointermove', e => { if (seeking) seekTo(e.clientX); });
  npSeek.addEventListener('pointerup',   e => { if (!seeking) return; const p = seekTo(e.clientX); seeking = false; npBar.classList.remove('seeking'); npTip.hidden = true; applySeek(p * effectiveDur()); });

  /* ── Media Session (lock screen / AirPods) ─────── */
  function updatePositionState() {
    const ms = navigator.mediaSession;
    if (!ms || !ms.setPositionState || !audio.duration || !isFinite(audio.duration)) return;
    try {
      ms.setPositionState({ duration: audio.duration,
        position: Math.min(audio.currentTime, audio.duration), playbackRate: audio.playbackRate || 1 });
    } catch (e) {}
  }
  function setMediaSession(a, t) {
    if (!('mediaSession' in navigator)) return;
    const art = a.cover_url;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: disp(t) + (t.instrumental ? ' (inst)' : ''), artist: ART.mediaArtist || ART.name || '', album: a.title,
      artwork: ['256x256','512x512','1000x1000'].map(s => ({ src: art, sizes: s, type: 'image/jpeg' }))
    });
    const set = (action, fn) => { try { navigator.mediaSession.setActionHandler(action, fn); } catch (e) {} };
    set('play',  () => { wantPlay = true; audio.play(); });
    set('pause', () => { wantPlay = false; audio.pause(); });
    set('nexttrack', next);
    set('previoustrack', prev);
    set('seekto', e => { applySeek(e.seekTime); updatePositionState(); });   // lock-screen / Control Center scrubber
    updatePositionState();
  }

  /* ── iOS: best-effort resume after an audio interruption ──────────────
     When another app grabs audio focus, Safari pauses us and does NOT
     auto-resume. If the user still intends playback, retry when the page
     becomes visible/focused again. iOS may still block this without a
     gesture, so it is best-effort and silently no-ops on failure. */
  function tryResume() { if (wantPlay && audio.paused && audio.src) audio.play().catch(()=>{}); }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tryResume(); });
  window.addEventListener('focus', tryResume);
  window.addEventListener('pageshow', tryResume);
  let rzT; window.addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(applyMarquee, 150); });

  /* ── Routing ───────────────────────────────────── */
  // Load a specific track paused (autoplay is blocked before a user gesture) — for shared #np links.
  function cueTrack(ai, ti) {
    const track = (ALB[ai] && ALB[ai].tracks[ti]) ? { ai, ti, inst: !!ALB[ai].tracks[ti].instrumental } : null;
    const s = eligibleStream();
    let idx = s.findIndex(x => x.ai === ai && x.ti === ti);
    if (idx < 0 && track) { let ins = s.findIndex(y => y.ai === ai); if (ins < 0) ins = 0; s.splice(ins, 0, track); idx = ins; }
    shuffle = false; syncShuffleBtn();
    setWindow(s, idx < 0 ? 0 : idx);
    loadCurrent(false);
  }
  function applyRoute() {
    const h = location.hash;
    const npm = h.match(/^#np(?:=(\d+)\.(\d+))?/);
    if (npm) {                                   // now-playing screen (optionally a specific shared track)
      if (npm[1] != null) {
        const ai = +npm[1], ti = +npm[2], cur = queue[qi];
        if (!(cur && cur.ai === ai && cur.ti === ti) && ALB[ai] && ALB[ai].tracks[ti]) cueTrack(ai, ti);
      }
      queue.length ? openQueue(false) : closeQueue(false);
      return;
    }
    if (npScreen) closeQueue(false);             // navigated away from #np → leave the screen
    const m = h.match(/a=(\d+)/);
    if (m && ALB[+m[1]]) { if (openAlbum !== +m[1] || view !== 'album') openAlbumView(+m[1]); }
    else if (view === 'album') backToShelf();
  }
  window.addEventListener('hashchange', applyRoute);

  /* ── Dark mode ─────────────────────────────────── */
  $('#dark-toggle').addEventListener('click', () => {
    const d = document.body.classList.toggle('dark-mode');
    localStorage.setItem('theme', d ? 'dark' : 'light');
  });

  /* ── Keyboard ──────────────────────────────────── */
  let hintT; function hint(){ kbHint.classList.add('show'); clearTimeout(hintT); hintT=setTimeout(()=>kbHint.classList.remove('show'),2200); }
  document.addEventListener('keydown', e => {
    const tag = document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') { if (e.key === 'Escape') document.activeElement.blur(); return; }
    switch (e.key) {
      case ' ': e.preventDefault(); togglePlay(); hint(); break;
      case 'ArrowRight': if (effectiveDur()) { applySeek(audio.currentTime + 10); hint(); } break;
      case 'ArrowLeft':  if (effectiveDur()) { applySeek(audio.currentTime - 10); hint(); } break;
      case 'n': case 'N': next(); hint(); break;
      case 'p': case 'P': prev(); hint(); break;
      case 'm': case 'M': audio.muted = !audio.muted; npBar.classList.toggle('muted', audio.muted); hint(); break;
      case '/': e.preventDefault(); if (view==='shelf') searchEl.focus(); hint(); break;
      case 'Escape': if (npScreen) closeQueue(true); else if (view === 'album') backToShelf(); break;
    }
  });

  /* ── Copy toolkit ──────────────────────────────────
     Long-press (mobile) or right-click (desktop) on any track/album surface → a small menu with
     copy actions. In album view, desktop hover also shows an inline copy button on the album name
     and each track; clicking the album name copies it too. Clipboard has a legacy fallback. */
  (function(){
    const hoverCapable = !!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches);

    // clipboard (secure-context API + execCommand fallback for http/file)
    function copyText(text){
      if (!text) return;
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => toast('Copied'), () => legacyCopy(text));
      } else legacyCopy(text);
    }
    function legacyCopy(text){
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
        document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
        const ok = document.execCommand('copy'); document.body.removeChild(ta);
        toast(ok ? 'Copied' : 'Copy failed');
      } catch (_) { toast('Copy failed'); }
    }
    // toast
    let toastEl, toastTimer;
    function toast(msg){
      if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'copy-toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
      toastEl.textContent = msg;
      requestAnimationFrame(() => toastEl.classList.add('show'));
      clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1400);
    }

    // text builders (read live state)
    // copy uses the FULL title (keeps the "[Instrumental]" suffix) — disp() strips it for display only
    const trackName = (ai, ti) => { const a = ALB[ai], t = a && a.tracks && a.tracks[ti]; return t ? t.title : ''; };
    const albumName = ai => { const a = ALB[ai]; return a ? a.title : ''; };
    function albumDetail(ai){
      const a = ALB[ai]; if (!a) return '';
      const date = fmtDate(a.date || a.year) || '';
      const lines = (a.tracks || []).map((t, i) => `${t.track != null && t.track !== '' ? t.track : (i + 1)}. ${t.title}`);
      return [a.title, date, '', ...lines].join('\n').replace(/\n{3,}/g, '\n\n');
    }

    // resolve a DOM node to a copy target
    function resolve(el){
      if (!el || !el.closest) return null;
      const trk = el.closest('.trk');
      if (trk && trk.dataset.ai != null) return { kind: 'track', ai: +trk.dataset.ai, ti: +trk.dataset.ti };
      const card = el.closest('.alb-card');
      if (card && card.dataset.ai != null && !card.classList.contains('skel')) return { kind: 'album', ai: +card.dataset.ai };
      const qi2 = el.closest('#queue-list .q-item, #q-history .q-item');
      if (qi2 && qi2.dataset.i != null && queue[+qi2.dataset.i]) { const q = queue[+qi2.dataset.i]; return { kind: 'track', ai: q.ai, ti: q.ti }; }
      if (el.closest('#q-now, #np-hero, #np-view-player .np-nowinfo, #np-bar')) { const q = queue[qi]; if (q) return { kind: 'track', ai: q.ai, ti: q.ti }; }
      if (view === 'album' && openAlbum >= 0 && el.closest('#album-view')) return { kind: 'album', ai: openAlbum, inAlbumView: true };
      return null;
    }
    function itemsFor(t){
      if (!t || !ALB[t.ai]) return [];
      if (t.kind === 'track') return [{ label: 'Copy Name', run: () => copyText(trackName(t.ai, t.ti)) }];
      if (t.inAlbumView) return [
        { label: 'Copy album name', run: () => copyText(albumName(t.ai)) },
        { label: 'Copy album detail', run: () => copyText(albumDetail(t.ai)) },
      ];
      return [{ label: 'Copy Name', run: () => copyText(albumName(t.ai)) }];
    }

    // menu element
    let menuEl, autoTimer = null;
    function hideMenu(){
      if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
      if (menuEl && !menuEl.hidden) { menuEl.hidden = true; menuEl.innerHTML = ''; menuEl._items = null; }
    }
    function showMenu(x, y, items, viaTouch){
      if (!items.length) return;
      if (!menuEl) { menuEl = document.createElement('div'); menuEl.className = 'ctx-menu'; menuEl.setAttribute('role', 'menu'); menuEl.hidden = true; document.body.appendChild(menuEl); }
      menuEl._items = items;
      menuEl.innerHTML = items.map((it, i) => `<button class="ctx-item" type="button" role="menuitem" data-i="${i}">${esc(it.label)}</button>`).join('');
      // measure while invisible, position, THEN reveal — so it never paints at the wrong spot first
      menuEl.style.visibility = 'hidden';
      menuEl.hidden = false;
      const mw = menuEl.offsetWidth, mh = menuEl.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
      // touch opens the menu just above the finger (with a gap) so a straight lift dismisses and you
      // must drag onto an item to pick it; mouse opens at the cursor.
      let px = viaTouch ? (x - mw / 2) : x;
      let py = viaTouch ? (y - mh - 14 >= 8 ? y - mh - 14 : y + 14) : y;
      menuEl.style.left = Math.max(8, Math.min(px, vw - mw - 8)) + 'px';
      menuEl.style.top  = Math.max(8, Math.min(py, vh - mh - 8)) + 'px';
      menuEl.style.visibility = '';
      if (!viaTouch) {                                   // mouse/keyboard: focus + auto-dismiss after 5s
        const first = menuEl.querySelector('.ctx-item'); if (first) first.focus();
        autoTimer = setTimeout(hideMenu, 5000);
      }
    }
    // highlight the item under a point while dragging; return it
    function itemAt(x, y){
      if (!menuEl || menuEl.hidden) return null;
      const el = document.elementFromPoint(x, y), it = el && el.closest ? el.closest('.ctx-item') : null;
      menuEl.querySelectorAll('.ctx-item').forEach(b => b.classList.toggle('active', b === it));
      return it;
    }
    function runItem(it){
      const items = menuEl && menuEl._items, idx = it ? +it.dataset.i : -1;
      hideMenu();
      if (items && idx >= 0 && items[idx]) items[idx].run();
    }

    // track the pointer type so a touch long-press (which ALSO fires contextmenu on Android / device
    // emulation) doesn't double-trigger the menu — the touch flow owns it there.
    let lastTouch = false;
    document.addEventListener('pointerdown', e => { lastTouch = e.pointerType === 'touch'; }, true);

    // right-click (mouse) — click an item; auto-dismisses after 5s
    document.addEventListener('contextmenu', e => {
      if (lastTouch || lpOpen) {                    // touch long-press handles its own menu
        if (itemsFor(resolve(e.target)).length) e.preventDefault();   // still suppress the native menu
        return;
      }
      const items = itemsFor(resolve(e.target));
      if (!items.length) { hideMenu(); return; }   // let the native menu show elsewhere
      e.preventDefault();
      showMenu(e.clientX, e.clientY, items, false);
    });

    // long-press (touch) — hold to open, drag onto an item, lift to choose (lift with nothing under
    // the finger just dismisses). The menu lives only for the duration of the hold.
    let lpTimer = null, lpXY = null, lpOpen = false, suppressTap = false;
    const clearLP = () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } lpXY = null; };
    document.addEventListener('touchstart', e => {
      clearLP();
      if (lpOpen) { lpOpen = false; hideMenu(); }
      if (e.touches.length !== 1) return;
      const items = itemsFor(resolve(e.target));
      if (!items.length) return;
      const tch = e.touches[0]; lpXY = { x: tch.clientX, y: tch.clientY };
      lpTimer = setTimeout(() => {
        lpTimer = null; lpOpen = true; suppressTap = true;
        if (navigator.vibrate) { try { navigator.vibrate(8); } catch (_) {} }
        showMenu(lpXY.x, lpXY.y, items, true);
      }, 450);
    }, { passive: true });
    document.addEventListener('touchmove', e => {
      if (lpOpen) { if (e.cancelable) e.preventDefault(); const tch = e.touches[0]; if (tch) itemAt(tch.clientX, tch.clientY); return; }
      if (!lpXY) return;
      const tch = e.touches[0];
      if (Math.abs(tch.clientX - lpXY.x) > 10 || Math.abs(tch.clientY - lpXY.y) > 10) clearLP();
    }, { passive: false });   // non-passive so scroll is locked while dragging in the menu
    document.addEventListener('touchend', e => {
      if (lpOpen) {
        lpOpen = false;
        const tch = e.changedTouches && e.changedTouches[0];
        const el = tch ? document.elementFromPoint(tch.clientX, tch.clientY) : null;
        runItem(el && el.closest ? el.closest('.ctx-item') : null);
        return;
      }
      clearLP();
    }, { passive: true });
    document.addEventListener('touchcancel', () => { clearLP(); if (lpOpen) { lpOpen = false; hideMenu(); } }, { passive: true });
    // swallow the click/tap that fires right after a long-press so it doesn't play/open
    document.addEventListener('click', e => {
      if (suppressTap) { suppressTap = false; e.stopPropagation(); e.preventDefault(); }
    }, true);

    // menu interactions (mouse) + dismissal
    document.addEventListener('click', e => {
      if (!menuEl || menuEl.hidden) return;
      const it = e.target.closest('.ctx-item');
      if (it) { runItem(it); return; }
      if (!e.target.closest('.ctx-menu')) hideMenu();
    });
    // don't let incidental scroll (iOS URL-bar animation, momentum) dismiss the touch menu mid-hold
    window.addEventListener('scroll', () => { if (!lpOpen) hideMenu(); }, true);
    window.addEventListener('resize', () => { if (!lpOpen) hideMenu(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') hideMenu(); });

    // inline copy buttons + click-to-copy the album name (album view; capture so it beats play)
    albumView.addEventListener('click', e => {
      const cb = e.target.closest('.copy-inline');
      if (cb) {
        e.preventDefault(); e.stopPropagation();
        if (cb.dataset.copy === 'album') copyText(albumName(openAlbum));
        else { const trk = cb.closest('.trk'); if (trk) copyText(trackName(+trk.dataset.ai, +trk.dataset.ti)); }
        return;
      }
      if (hoverCapable && e.target.closest('.ah-title')) { e.stopPropagation(); copyText(albumName(openAlbum)); }
    }, true);
  })();
})();
