/* ===========================================================================
   Shared fan-archive player engine.
   Used by both /yura/ and /krikkrak/ — design/layout live in each page's
   own HTML + CSS; this file is the behaviour only.

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
  let queue = [];
  let qi = -1;
  let shuffle = false;
  let seeking = false;
  let wantPlay = false;         // user *intends* playback (for interruption resume)
  let excludeInst = false;      // skip instrumental tracks in auto-generated queues
  let loopMode = 0;             // 0 = off, 1 = loop all, 2 = loop one
  let sleepTimer = null, sleepEndOfTrack = false;   // sleep timer (queue panel)
  let queueMode = 'album';      // 'album' (continue to next album on end) | 'all'
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
    save('np', { q: queue.map(x => [x.ai, x.ti]), qi, mode: queueMode, t: Math.floor(audio.currentTime || 0) });
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
    routeFromHash();
    restoreNowPlaying();
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
    queueMode = np.mode === 'all' ? 'all' : 'album';
    loadCurrent(false, np.t || 0);   // restore paused at saved position; user taps play to resume
  }

  /* ── Shelf rendering ───────────────────────────── */
  let sortMode = 'new', filter = '', yearFilter = '', genreFilter = '';
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
        <p class="alb-sub">${esc(a.year)} · ${ (a.tracks||[]).length } tracks</p>
      </button>`;
    }).join('');
    if (!idx.length) shelf.innerHTML = '<p class="empty">No matches.</p>';
  }

  shelf.addEventListener('click', e => {
    const card = e.target.closest('.alb-card');
    if (!card) return;
    if (e.target.closest('.alb-play')) { playAlbumFrom(+card.dataset.ai, 0, false, true); return; }
    openAlbumView(+card.dataset.ai);
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
        <h2>${esc(a.title)}</h2>
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
    if (li) { playAlbumFrom(+li.dataset.ai, +li.dataset.ti, false, false); return; }
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

  function playAlbumFrom(ai, ti, shuffled, respectFilter) {
    shuffle = !!shuffled; queueMode = 'album';
    queue = buildQueue(ai, respectFilter);
    // Album-level Play/Shuffle pass ti=0; if track 0 is filtered out (e.g. it's an instrumental
    // and instrumentals are hidden) we just start at the first surviving track — NOT rebuild the
    // queue unfiltered, which would re-add every instrumental. A direct track click stays playable
    // because it already passes respectFilter=false (its queue is unfiltered). Only fall back to
    // the full album if the filter leaves nothing to play.
    if (!queue.length) queue = buildQueue(ai, false);
    if (shuffle) shuf(queue);
    qi = queue.findIndex(q => q.ti === ti);
    if (qi < 0) qi = 0;
    syncShuffleBtn();
    loadCurrent(true);
  }

  // Turning instrumentals OFF must also drop them from whatever is queued right now, not just
  // future plays. Keep the current track if it's vocal; if it's itself an instrumental, advance
  // to the next vocal. Leaves the queue alone if removing instrumentals would empty it.
  function pruneInstFromQueue() {
    if (!excludeInst || !queue.length) return;
    const pruned = queue.filter(x => !x.inst);
    if (pruned.length === queue.length || !pruned.length) return;
    const cur = queue[qi];
    if (cur && !cur.inst) {                       // current track survives → keep playing it
      queue = pruned;
      qi = queue.findIndex(x => x.ai === cur.ai && x.ti === cur.ti);
      if (qi < 0) qi = 0;
      renderQueue(); saveNowPlaying();
    } else {                                      // current track is an instrumental being removed
      let target = null;
      for (let j = qi + 1; j < queue.length; j++) if (!queue[j].inst) { target = queue[j]; break; }
      if (!target) target = pruned[0];
      queue = pruned;
      qi = queue.findIndex(x => x.ai === target.ai && x.ti === target.ti);
      if (qi < 0) qi = 0;
      renderQueue(); loadCurrent(true);
    }
  }

  function shuffleAll() {
    const q = [];
    ALB.forEach((a, ai) => (a.tracks||[]).forEach((t, ti) => {
      if (genreFilter && !(t.genres||[]).includes(genreFilter)) return;
      if (excludeInst && t.instrumental) return;
      q.push({ ai, ti, inst: !!t.instrumental });
    }));
    if (!q.length) return;
    queue = shuf(q); qi = 0; shuffle = true; queueMode = 'all'; syncShuffleBtn();
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
    setPct(0); setBuf(0);
    document.title = a.title + ' | ' + (ART.name || '');
    applyMarquee();
    if (autoplay) {
      wantPlay = true; audio.play().catch(()=>{});
      if (window.Scrobbler && window.Scrobbler.enabled) window.Scrobbler.playing(scrobbleMeta);   // now-playing ping
    }
    setMediaSession(a, t);
    highlightPlaying();
    renderQueue();
    saveNowPlaying();
  }

  function stopPlayback() { queue = []; qi = -1; wantPlay = false; queueMode = 'album'; setPlayingUI(false); document.title = DEFAULT_TITLE; renderQueue(); save('np', null); }

  function next() {
    if (qi < queue.length - 1) { qi++; loadCurrent(true); return; }
    if (loopMode === 1) { qi = 0; loadCurrent(true); return; }            // loop all → wrap
    if (queueMode === 'album') {                                          // continuous: next album in current sort order
      const order = sortedIndices(), cur = queue[qi] ? queue[qi].ai : openAlbum;
      const pos = order.indexOf(cur);
      for (let k = pos + 1; k < order.length; k++) {
        const nq = buildQueue(order[k], true);
        if (nq.length) { queue = nq; qi = 0; shuffle = false; syncShuffleBtn(); loadCurrent(true); return; }
      }
    }
    stopPlayback();
  }
  function prev() { if (audio.currentTime > 3) { audio.currentTime = 0; return; } if (qi > 0) { qi--; loadCurrent(true); } }

  /* ── Audio events ──────────────────────────────── */
  audio.addEventListener('play',  () => setPlayingUI(true));
  audio.addEventListener('pause', () => {
    setPlayingUI(false); saveNowPlaying();
    // Some browsers pause at the very end instead of firing 'ended' (media control then sticks at
    // the end). If we still intend to play and we're at the end, treat it as a finished track.
    const d = effectiveDur();
    if (wantPlay && !endHandled && d && audio.currentTime >= d - 1) handleEnd();
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
    updatePositionState();
    if (window.Scrobbler && window.Scrobbler.enabled) window.Scrobbler.tick(scrobbleMeta, audio.currentTime, audio.duration);
    if ((npSaveT = (npSaveT + 1) % 20) === 0) saveNowPlaying();   // persist position ~every 20 ticks
  });
  audio.addEventListener('progress', () => {
    if (audio.buffered.length && audio.duration)
      setBuf(audio.buffered.end(audio.buffered.length-1) / audio.duration * 100);
  });

  function setPct(p){ npFill.style.width=p+'%'; npThumb.style.left=p+'%'; npSeek.setAttribute('aria-valuenow', Math.round(p)); }
  function setBuf(p){ npBuf.style.width=p+'%'; }
  function setPlayingUI(playing) {
    npPlay.classList.toggle('playing', playing);
    npPlay.querySelector('.i-play').style.display  = playing ? 'none' : '';
    npPlay.querySelector('.i-pause').style.display = playing ? '' : 'none';
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
  function syncShuffleBtn() { const b = document.getElementById('np-shuffle'); if (b) b.classList.toggle('on', shuffle); }
  function toggleShuffle() {
    shuffle = !shuffle; syncShuffleBtn();
    if (queue.length) {
      const cur = queue[qi];
      if (shuffle) {
        shuf(queue);
        const k = queue.findIndex(q => q.ai === cur.ai && q.ti === cur.ti);
        [queue[0], queue[k]] = [queue[k], queue[0]]; qi = 0;
      } else {
        queue.sort((a, b) => a.ai === b.ai ? a.ti - b.ti : a.ai - b.ai);   // restore source order
        qi = queue.findIndex(q => q.ai === cur.ai && q.ti === cur.ti);
      }
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
  function syncLoopBtn() { if (!loopBtn) return; loopBtn.classList.toggle('on', loopMode > 0); loopBtn.classList.toggle('one', loopMode === 2);
    loopBtn.setAttribute('aria-label', ['Loop off','Loop all','Loop one'][loopMode]); loopBtn.title = ['Loop off','Loop all','Loop one'][loopMode]; }
  loopBtn?.addEventListener('click', () => { loopMode = (loopMode + 1) % 3; syncLoopBtn(); syncQFoot(); saveSettings(); });

  /* volume */
  const volSlider = $('#np-vol-slider');
  function applyVol(v){ audio.volume = v/100; audio.muted = v==0;
    volSlider.style.background = `linear-gradient(90deg, var(--accent) ${v}%, var(--panel-inset) ${v}%)`; }
  applyVol(85);
  volSlider.addEventListener('input', () => { applyVol(+volSlider.value); saveSettings(); });
  $('#np-mute').addEventListener('click', () => { audio.muted = !audio.muted; npBar.classList.toggle('muted', audio.muted); saveSettings(); });

  /* ── Queue panel (Spotify-style: pinned now-playing + reorderable/removable upcoming) ── */
  const queuePanel = document.getElementById('queue-panel'), queueList = document.getElementById('queue-list'),
        qNow = document.getElementById('q-now'), qSub = document.getElementById('q-sub'), qTimerPop = document.getElementById('q-timer-pop');

  const qCover = a => a && a.cover_url
    ? `<img class="q-cover" src="${esc(a.cover_url)}" alt="" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'"/>`
    : '<span class="q-cover"></span>';

  function renderQueue() {
    if (!queueList) return;
    const cur = queue[qi];
    if (qSub) qSub.textContent = cur ? ('Playing · ' + (ALB[cur.ai] ? ALB[cur.ai].title : '')) : '';
    if (qNow) {
      if (cur) { const a = ALB[cur.ai], t = a.tracks[cur.ti];
        qNow.innerHTML = `<div class="q-now-row">${qCover(a)}<span class="q-meta"><span class="q-t">${esc(disp(t))}</span><span class="q-a">${esc(a.title)}</span></span><span class="q-now-ic"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span></div>`;
      } else qNow.innerHTML = '';
    }
    const up = []; for (let i = qi + 1; i < queue.length; i++) up.push(i);
    if (!up.length) { queueList.innerHTML = '<li class="q-empty">Nothing queued next</li>'; syncQFoot(); return; }
    queueList.innerHTML = up.map(i => {
      const q = queue[i], a = ALB[q.ai], t = a.tracks[q.ti];
      return `<li class="q-item" data-i="${i}">
        <div class="q-del" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M9 6V4h6v2M7 6l1 14h8l1-14"/></svg></div>
        <div class="q-row">${qCover(a)}<span class="q-meta"><span class="q-t">${esc(disp(t))}</span><span class="q-a">${esc(a.title)}</span></span>
          <button class="q-handle" aria-label="Drag to reorder" tabindex="-1"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9h16M4 15h16"/></svg></button></div>
      </li>`;
    }).join('');
    syncQFoot();
  }

  // upcoming-only edits keep qi fixed (everything acted on is after the current track)
  function removeFromQueue(i) { if (i <= qi || i >= queue.length) return; queue.splice(i, 1); renderQueue(); saveNowPlaying(); }

  document.getElementById('queue-btn')?.addEventListener('click', () => {
    if (!queuePanel) return; queuePanel.hidden = !queuePanel.hidden;
    document.getElementById('queue-btn').classList.toggle('on', !queuePanel.hidden);
    if (!queuePanel.hidden) renderQueue();
  });
  document.getElementById('queue-close')?.addEventListener('click', () => {
    if (queuePanel) { queuePanel.hidden = true; document.getElementById('queue-btn')?.classList.remove('on'); }
  });

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
    queue.splice(qi + 1, order.length, ...order);   // replace the upcoming slice with the new order
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
  npCover.addEventListener('click', jumpToCurrent);
  $('.np-main')?.addEventListener('click', jumpToCurrent);

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
  function routeFromHash() {
    const m = location.hash.match(/a=(\d+)/);
    if (m && ALB[+m[1]]) openAlbumView(+m[1]);
  }
  window.addEventListener('hashchange', () => {
    const m = location.hash.match(/a=(\d+)/);
    if (m && ALB[+m[1]]) { if (openAlbum !== +m[1]) openAlbumView(+m[1]); }
    else if (view === 'album') backToShelf();
  });

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
      case 'Escape': if (view === 'album') backToShelf(); break;
    }
  });
})();
