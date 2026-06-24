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

  const audio = new Audio();
  audio.preload = 'none';
  audio.volume = 0.85;

  /* ── Elements ──────────────────────────────────── */
  const $ = s => document.querySelector(s);
  const shelf = $('#shelf'), albumView = $('#album-view'), albumHead = $('#album-head'),
        trackList = $('#track-list'), statLine = $('#stat-line'), controls = $('#shelf-controls'),
        searchEl = $('#search');
  const npBar = $('#np-bar'), npCover = $('#np-cover'), npTitle = $('#np-title'),
        npMeta = $('#np-meta'), npTip = $('#np-seek-tip'),
        npSeek = $('#np-seek'), npFill = $('#np-seek-fill'), npThumb = $('#np-seek-thumb'),
        npBuf = $('#np-seek-buf'), npPlay = $('#np-play'), kbHint = $('#kb-hint');

  const fmt = s => { s = Math.max(0, Math.floor(s||0)); return Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); };
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fmtDate = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso)); return m ? (+m[3]) + ' ' + MON[+m[2]-1] + ' ' + m[1] : String(iso); };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const disp = t => t.instrumental ? t.title.replace(/\s*\[Instrumental\]\s*$/i, '') : t.title;

  /* ── Boot ──────────────────────────────────────── */
  renderSkeleton();
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
    buildYearFilter();
    controls.hidden = false;
    renderShelf();
    routeFromHash();
  }).catch(() => { statLine.textContent = 'failed to load catalog'; shelf.innerHTML = '<p class="empty">failed to load.</p>'; });

  /* ── Shelf rendering ───────────────────────────── */
  let sortMode = 'new', filter = '', yearFilter = '';
  function buildYearFilter() {
    const sel = $('#year-filter');
    const years = [...new Set(ALB.map(a => String(a.year)).filter(Boolean))].sort((a, b) => b - a);
    sel.insertAdjacentHTML('beforeend', years.map(y => `<option value="${y}">${y}</option>`).join(''));
    sel.addEventListener('change', () => { yearFilter = sel.value; renderShelf(); });
  }
  function sortedIndices() {
    let idx = ALB.map((_, i) => i);
    if (yearFilter) idx = idx.filter(i => String(ALB[i].year) === yearFilter);
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
    shelf.innerHTML = idx.map(i => {
      const a = ALB[i];
      return `<button class="alb-card" data-ai="${i}">
        <div class="alb-cover sk">
          <img src="${esc(a.cover_url)}" alt="" loading="lazy" decoding="async" width="300" height="300"
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
    if (e.target.closest('.alb-play')) { playAlbumFrom(+card.dataset.ai, 0, false); return; }
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
    openAlbum = ai; view = 'album';
    const a = ALB[ai];
    location.hash = 'a=' + ai;
    albumHead.innerHTML = `
      <div class="ah-cover sk"><img src="${esc(a.cover_url)}" alt="" decoding="async" onload="this.classList.add('loaded')" onerror="this.style.visibility='hidden'"/></div>
      <div class="ah-info">
        <span class="ah-year">${esc(fmtDate(a.date || a.year))}</span>
        <h2>${esc(a.title)}</h2>
        <p class="ah-count">${(a.tracks||[]).length} tracks</p>
        <div class="ah-actions">
          <button class="btn-ext btn-ext-play" id="play-all"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> Play</button>
          <button class="btn-ext" id="shuffle-all"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3h5v5M21 3l-7 7M4 20l7-7M16 21h5v-5M4 4l16 16"/></svg> Shuffle</button>
        </div>
      </div>`;
    trackList.innerHTML = (a.tracks||[]).map((t, ti) => `
      <li class="trk" data-ai="${ai}" data-ti="${ti}">
        <span class="trk-slot">
          <span class="trk-num">${esc(t.track)}</span>
          <span class="trk-ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>
        </span>
        <span class="trk-title">${esc(disp(t))}${t.instrumental ? '<em class="inst">INST</em>' : ''}</span>
      </li>`).join('');
    shelf.hidden = true; document.querySelector('#yura-hero').hidden = true;
    document.querySelector('#home-btn').hidden = true;
    albumView.hidden = false;
    window.scrollTo(0, 0);
    highlightPlaying();
  }

  function backToShelf() {
    view = 'shelf'; openAlbum = -1; location.hash = '';
    albumView.hidden = true; shelf.hidden = false; document.querySelector('#yura-hero').hidden = false;
    document.querySelector('#home-btn').hidden = false;
  }
  $('#back-btn').addEventListener('click', backToShelf);

  albumView.addEventListener('click', e => {
    const li = e.target.closest('.trk');
    if (li) { playAlbumFrom(+li.dataset.ai, +li.dataset.ti); return; }
    if (e.target.closest('#play-all')) playAlbumFrom(openAlbum, 0, false);
    if (e.target.closest('#shuffle-all')) playAlbumFrom(openAlbum, 0, true);
  });

  /* ── Queue + playback ──────────────────────────── */
  function buildQueue(ai) { return (ALB[ai].tracks||[]).map((_, ti) => ({ ai, ti })); }

  function playAlbumFrom(ai, ti, shuf) {
    shuffle = !!shuf;
    queue = buildQueue(ai);
    if (shuffle) {
      for (let i = queue.length - 1; i > 0; i--) { const j = (Math.random()*(i+1))|0; [queue[i],queue[j]]=[queue[j],queue[i]]; }
      qi = queue.findIndex(q => q.ti === ti);
      if (qi < 0) qi = 0;
    } else qi = ti;
    document.getElementById('np-shuffle').classList.toggle('on', shuffle);
    loadCurrent(true);
  }

  function loadCurrent(autoplay) {
    const q = queue[qi]; if (!q) return;
    const a = ALB[q.ai], t = a.tracks[q.ti];
    audio.src = t.url;            // setting src + play → R2 streams via range, no full download
    npBar.classList.add('show');
    npTitle.textContent = disp(t) + (t.instrumental ? ' (inst)' : '');
    npMeta.textContent = a.title + ' · ' + a.year;
    npCover.querySelector('img')?.remove();
    const img = document.createElement('img'); img.src = a.cover_url; img.alt = ''; img.className = 'np-cover-img';
    npCover.prepend(img);
    setPct(0); setBuf(0);
    if (autoplay) { wantPlay = true; audio.play().catch(()=>{}); }
    setMediaSession(a, t);
    highlightPlaying();
  }

  function next() { if (qi < queue.length - 1) { qi++; loadCurrent(true); } else { queue=[]; qi=-1; wantPlay=false; setPlayingUI(false); } }
  function prev() { if (audio.currentTime > 3) { audio.currentTime = 0; return; } if (qi > 0) { qi--; loadCurrent(true); } }

  /* ── Audio events ──────────────────────────────── */
  audio.addEventListener('play',  () => setPlayingUI(true));
  audio.addEventListener('pause', () => setPlayingUI(false));
  audio.addEventListener('ended', next);
  audio.addEventListener('loadedmetadata', updatePositionState);
  audio.addEventListener('timeupdate', () => {
    if (seeking || !audio.duration) return;
    setPct(audio.currentTime / audio.duration * 100);
    updatePositionState();
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
  $('#np-shuffle').addEventListener('click', () => {
    shuffle = !shuffle; document.getElementById('np-shuffle').classList.toggle('on', shuffle);
    if (queue.length) { const cur = queue[qi];
      queue = buildQueue(cur.ai);
      if (shuffle) { for (let i=queue.length-1;i>0;i--){const j=(Math.random()*(i+1))|0;[queue[i],queue[j]]=[queue[j],queue[i]];}
        const k = queue.findIndex(q=>q.ti===cur.ti); [queue[0],queue[k]]=[queue[k],queue[0]]; qi=0; }
      else qi = cur.ti;
    }
  });

  /* volume */
  const volSlider = $('#np-vol-slider');
  function applyVol(v){ audio.volume = v/100; audio.muted = v==0;
    volSlider.style.background = `linear-gradient(90deg, var(--accent) ${v}%, var(--panel-inset) ${v}%)`; }
  applyVol(85);
  volSlider.addEventListener('input', () => applyVol(+volSlider.value));
  $('#np-mute').addEventListener('click', () => { audio.muted = !audio.muted; npBar.classList.toggle('muted', audio.muted); });

  /* seek (click + drag) */
  function seekTo(clientX) {
    const r = npSeek.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    setPct(p*100);
    npTip.hidden = false;
    npTip.textContent = fmt(p * (audio.duration||0));
    npTip.style.left = (p*100) + '%';
    return p;
  }
  npSeek.addEventListener('pointerdown', e => { if (!audio.duration) return; seeking = true; npBar.classList.add('seeking'); npSeek.setPointerCapture(e.pointerId); seekTo(e.clientX); });
  npSeek.addEventListener('pointermove', e => { if (seeking) seekTo(e.clientX); });
  npSeek.addEventListener('pointerup',   e => { if (!seeking) return; const p = seekTo(e.clientX); audio.currentTime = p * audio.duration; seeking = false; npBar.classList.remove('seeking'); npTip.hidden = true; });

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
    set('seekto', e => {
      if (e.fastSeek && 'fastSeek' in audio) audio.fastSeek(e.seekTime);
      else audio.currentTime = e.seekTime;
      updatePositionState();
    });
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
      case 'ArrowRight': if (audio.duration) { audio.currentTime = Math.min(audio.currentTime+10, audio.duration); hint(); } break;
      case 'ArrowLeft':  if (audio.duration) { audio.currentTime = Math.max(audio.currentTime-10, 0); hint(); } break;
      case 'n': case 'N': next(); hint(); break;
      case 'p': case 'P': prev(); hint(); break;
      case 'm': case 'M': audio.muted = !audio.muted; npBar.classList.toggle('muted', audio.muted); hint(); break;
      case '/': e.preventDefault(); if (view==='shelf') searchEl.focus(); hint(); break;
      case 'Escape': if (view === 'album') backToShelf(); break;
    }
  });
})();
