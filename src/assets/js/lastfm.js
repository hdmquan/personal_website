/* Top-left button: Last.fm connect, and a back-to-top chevron once scrolled.
 *
 * At the top the button is the Last.fm control — logged out it follows the icon colour and a click
 * sends you to Last.fm; logged in it goes red and a click opens a small sign-out confirm. Once you
 * scroll past the hero it morphs into a "^" that scrolls back to the top.
 *
 * Login: Last.fm sends the listener back with ?token=…; the token is exchanged for a session key by
 * the signing function (/.netlify/functions/lastfm) so the shared secret never touches the client.
 */
(function () {
  var API_KEY = '3d4428c58350f5e4a0d38e4b9602919c';   // public key (used in the auth redirect)
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
    if (s) localStorage.setItem(LS, JSON.stringify(s)); else localStorage.removeItem(LS);
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
    location.href = 'https://www.last.fm/api/auth/?api_key=' + API_KEY + '&cb=' + encodeURIComponent(location.origin + location.pathname);
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
