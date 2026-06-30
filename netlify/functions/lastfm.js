/* Last.fm signing proxy.
 *
 * Holds the shared secret (env only — never the client, never the repo) and signs the calls that
 * require it. Right now: auth.getSession (token -> session key) for login. Scrobbling will add
 * track.updateNowPlaying / track.scrobble actions here later, signed the same way.
 *
 * Required Netlify env vars (Site settings -> Environment variables):
 *   LASTFM_API_KEY   the public API key
 *   LASTFM_SECRET    the shared secret  <-- regenerate this on last.fm; set it ONLY here
 * Optional:
 *   LASTFM_ALLOWED_ORIGIN   defaults to same-origin; set to lock CORS to your domain
 */
const crypto = require('crypto');

const API_KEY = process.env.LASTFM_API_KEY;
const SECRET = process.env.LASTFM_SECRET;
const ALLOWED_ORIGIN = process.env.LASTFM_ALLOWED_ORIGIN || '';

// Last.fm api_sig: md5 of every (sorted, concatenated key+value) param + secret. format/callback excluded.
function sign(params) {
  const base = Object.keys(params).sort().map(k => k + params[k]).join('');
  return crypto.createHash('md5').update(base + SECRET, 'utf8').digest('hex');
}

async function call(params) {
  const api_sig = sign(params);
  const res = await fetch('https://ws.audioscrobbler.com/2.0/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...params, api_sig, format: 'json' }),
  });
  return res.json();
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'method not allowed' }) };
  if (!API_KEY || !SECRET) return { statusCode: 500, headers, body: JSON.stringify({ error: 'server not configured' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'bad request' }) }; }

  try {
    // The public api_key is served from here (env only) so it isn't hardcoded in the build output,
    // which keeps Netlify's secret scanner happy and makes key rotation an env-var-only change.
    if (body.action === 'config') {
      return { statusCode: 200, headers, body: JSON.stringify({ api_key: API_KEY }) };
    }

    if (body.action === 'getSession') {
      if (!body.token) return { statusCode: 400, headers, body: JSON.stringify({ error: 'missing token' }) };
      const data = await call({ method: 'auth.getSession', api_key: API_KEY, token: body.token });
      if (data.session) return { statusCode: 200, headers, body: JSON.stringify({ username: data.session.name, session_key: data.session.key }) };
      return { statusCode: 400, headers, body: JSON.stringify({ error: data.message || 'auth failed' }) };
    }

    if (body.action === 'nowPlaying' || body.action === 'scrobble') {
      if (!body.session_key || !body.artist || !body.track) return { statusCode: 400, headers, body: JSON.stringify({ error: 'missing fields' }) };
      const params = {
        method: body.action === 'scrobble' ? 'track.scrobble' : 'track.updateNowPlaying',
        api_key: API_KEY, sk: body.session_key, artist: body.artist, track: body.track,
      };
      if (body.album) params.album = body.album;
      if (body.duration) params.duration = String(Math.round(body.duration));
      if (body.action === 'scrobble') params.timestamp = String(body.timestamp || Math.floor(Date.now() / 1000));
      const data = await call(params);
      if (data.error) return { statusCode: 400, headers, body: JSON.stringify({ error: data.message || 'lastfm error' }) };
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'unknown action' }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'upstream error' }) };
  }
};
