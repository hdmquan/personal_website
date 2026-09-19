/* Top-left button: Last.fm connect, and a back-to-top chevron once scrolled.
 *
 * At the top the button is the Last.fm control — logged out it follows the icon colour and a click
 * sends you to Last.fm; logged in it goes red and a click opens a small sign-out confirm. Once you
 * scroll past the hero it morphs into a "^" that scrolls back to the top.
 *
 * Login: Last.fm sends the listener back with ?token=…; the token is exchanged for a session key by
 * the signing function (/.netlify/functions/lastfm) so the shared secret never touches the client.
 */
/* Scrobbler — player.js calls into this on track/playback events. Everything is gated by
 * `enabled` (a live Last.fm session): when logged out nothing here runs and no requests fire,
 * so there's zero scrobble cost for anonymous listeners. The signing function adds the secret. */
(function () {
  var FN = '/.netlify/functions/lastfm';
  var LS = 'fa:yura:lastfm';
  var OUTBOX = LS + ':outbox';
  var MAX_OUTBOX = 100;
  function session() { try { return JSON.parse(localStorage.getItem(LS)); } catch (e) { return null; } }
  function getOutbox() { try { var q = JSON.parse(localStorage.getItem(OUTBOX)); return Array.isArray(q) ? q : []; } catch (e) { return []; } }
  function setOutbox(q) { try { localStorage.setItem(OUTBOX, JSON.stringify(q)); } catch (e) {} }
  function post(payload) {
    var s = session(); if (!s) return Promise.reject(new Error('not connected'));
    payload.session_key = s.session_key;
    return fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), keepalive: true })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (data) {
        if (r.ok) return data;
        var err = new Error(data.error || 'Last.fm rejected the scrobble');
        err.status = r.status; err.code = data.code; err.permanent = r.status >= 400 && r.status < 500;
        throw err;
      }); });
  }
  var curKey = null, scrobbled = false, sending = false, retryTimer = null;
  function key(m) { return m ? (m.artist + '' + m.track + '' + (m.startedAt || 0)) : null; }
  function scheduleDrain() {
    if (retryTimer) return;
    retryTimer = setTimeout(function () { retryTimer = null; drain(); }, 15000);
  }
  // Store pending scrobbles before sending. A request may be cancelled when a mobile browser is
  // backgrounded; retaining it means the next visit retries instead of silently losing the listen.
  function drain() {
    if (sending || !session()) return;
    var q = getOutbox(), item = q[0];
    if (!item) return;
    // Never submit queued plays to a different account after a re-login.
    if (item.account && item.account !== session().username) {
      setOutbox(q.filter(function (x) { return x.id !== item.id; })); drain(); return;
    }
    sending = true;
    var succeeded = false;
    post(item.payload).then(function (data) {
      if (item.payload.action === 'scrobble' && data && data.accepted === 0) {
        var ignored = new Error('Last.fm ignored this scrobble'); ignored.permanent = true; throw ignored;
      }
      succeeded = true;
      q = getOutbox().filter(function (x) { return x.id !== item.id; });
      setOutbox(q);
      if (item.id === curKey) scrobbled = true;
    }).catch(function (err) {
      // A bad timestamp/session/metadata item can never succeed by retrying and must not block
      // every later listen in the FIFO. Transient network/upstream failures stay durable.
      if (err && err.permanent) {
        setOutbox(getOutbox().filter(function (x) { return x.id !== item.id; }));
        if (err.status === 401 || err.status === 403 || err.code === 9) window.dispatchEvent(new Event('lastfm:reauth'));
      } else scheduleDrain();
    }).then(function () {
      sending = false;
      if (succeeded && getOutbox().length) drain();
    });
  }
  function enqueue(m) {
    var id = key(m), q = getOutbox();
    if (!q.some(function (x) { return x.id === id; })) {
      q.push({ id: id, account: (session() || {}).username || '', payload: { action: 'scrobble', artist: m.artist, track: m.track, album: m.album, duration: m.duration, timestamp: m.startedAt || Math.floor(Date.now() / 1000) } });
      if (q.length > MAX_OUTBOX) q.splice(0, q.length - MAX_OUTBOX);
      setOutbox(q);
    }
    drain();
  }

  var S = {
    enabled: !!session(),
    refresh: function () { S.enabled = !!session(); if (S.enabled) drain(); },
    track: function (m) { curKey = key(m); scrobbled = false; },        // new track loaded
    playing: function (m) {                                             // playback started → now-playing ping
      if (key(m) !== curKey) { curKey = key(m); scrobbled = false; }
      post({ action: 'nowPlaying', artist: m.artist, track: m.track, album: m.album, duration: m.duration }).catch(function () {});
    },
    tick: function (m, cur, dur) {                                      // Last.fm rule: >30s, played ≥half or 4min
      if (scrobbled || !m) return;
      dur = dur || m.duration || 0;
      if (dur > 30 && cur >= Math.min(dur / 2, 240)) {
        enqueue(m);
      }
    },
  };
  window.Scrobbler = S;
  window.addEventListener('online', drain);
  drain();
})();

(function () {
  var FN = '/.netlify/functions/lastfm';
  var LS = 'fa:yura:lastfm';
  var SCROLL_AT = 400;

  var btn = document.getElementById('home-btn');
  var pop = document.getElementById('lastfm-pop');
  var userEl = document.getElementById('lastfm-user');
  var signout = document.getElementById('lastfm-signout');
  if (!btn) return;

  function getSession() { try { return JSON.parse(localStorage.getItem(LS)); } catch (e) { return null; } }
  function setSession(s) {
    if (s) localStorage.setItem(LS, JSON.stringify(s)); else { localStorage.removeItem(LS); localStorage.removeItem(LS + ':outbox'); }
    if (window.Scrobbler) window.Scrobbler.refresh();   // toggle scrobbling with login state
    render();
  }

  function render() {
    var s = getSession();
    btn.classList.toggle('connected', !!s);
    if (s && userEl) userEl.textContent = s.username;
    if (!s) setPop(false);
    syncLabel();
  }
  // label depends on both scroll state and login state
  function syncLabel() {
    var label = btn.classList.contains('to-top') ? 'Back to top'
      : (getSession() ? ('Last.fm: ' + getSession().username) : 'Connect Last.fm');
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
  }

  function login() {
    // fetch the public key from the function (it lives in env, not the build) then redirect
    fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'config' }) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.api_key) location.href = 'https://www.last.fm/api/auth/?api_key=' + d.api_key + '&cb=' + encodeURIComponent(location.origin + location.pathname);
      })
      .catch(function () {});
  }
  function exchange(token) {
    fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'getSession', token: token }) })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (d && d.session_key) setSession({ session_key: d.session_key, username: d.username }); })
      .catch(function () {});
  }

  // ── sign-out confirm popover ──
  function setPop(open) {
    if (!pop) return;
    pop.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  }
  if (signout) signout.addEventListener('click', function () { setSession(null); });
  // A revoked/expired session is not recoverable through retries. Make the disconnected state
  // visible immediately so the next play can be authorized again instead of silently queuing.
  window.addEventListener('lastfm:reauth', function () { setSession(null); });
  document.addEventListener('click', function (e) {
    if (pop && !pop.hidden && !e.target.closest('#lastfm-pop') && !e.target.closest('#home-btn')) setPop(false);
  });

  // ── one button, two jobs ──
  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (btn.classList.contains('to-top')) {                 // scrolled → back to top
      var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
      return;
    }
    if (getSession()) setPop(pop ? pop.hidden : false);     // at top, logged in → toggle sign-out
    else login();                                           // at top, logged out → go to Last.fm
  });

  // ── auth callback ──
  var m = location.search.match(/[?&]token=([^&]+)/);
  if (m) {
    exchange(decodeURIComponent(m[1]));
    history.replaceState(null, '', location.pathname + location.hash);
  }

  // ── scroll: swap to the chevron ──
  function syncScroll() {
    var scrolled = window.scrollY > SCROLL_AT;
    btn.classList.toggle('to-top', scrolled);
    if (scrolled) setPop(false);                            // hide the sign-out confirm when it becomes "^"
    syncLabel();
  }
  window.addEventListener('scroll', syncScroll, { passive: true });

  render();
  syncScroll();
})();
