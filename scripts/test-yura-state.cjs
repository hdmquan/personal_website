const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('src/assets/js/player.js', 'utf8');
function section(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert(a >= 0 && b > a, 'player test boundary exists');
  return source.slice(a, b);
}
const c = { shuffle: false, loopMode: 0, excludeInst: true, genreFilter: '',
  ALB: [{ tracks: [{ instrumental: true }, {}, {}] }], sortedIndices: () => [0],
  syncShuffleBtn() {}, loadCurrent() {}, Q_AHEAD: 30, Q_BEHIND: 30,
  queue: [], stream: [], qi: 0, streamStart: 0,
  renderQueue() {}, saveNowPlaying() {}, syncQFoot() {}, saveSettings() {} };
vm.createContext(c);
vm.runInContext(section('  function shuf(', '  // Turning instrumentals off'), c);
for (const shuffle of [false, true]) {
  c.shuffled = shuffle;
  vm.runInContext('playAlbumFrom(0, 0, shuffled, true)', c);
  assert(c.queue.length > 0);
  assert(c.queue.every(x => !x.inst), 'album playback never reinserts excluded instrumental');
}
c.excludeInst = false;
vm.runInContext('setWindow([{ai:0,ti:0},{ai:0,ti:2}],0)', c);
vm.runInContext(section('  function toggleShuffle()', "  $('#np-shuffle').addEventListener"), c);
vm.runInContext('toggleShuffle(); toggleShuffle()', c);
assert(!c.stream.some(x => x.ti === 1), 'shuffle roundtrip preserves removal');
assert.deepEqual(Array.from(c.stream, x => x.ti), [0, 2]);

async function scrobbles() {
  const calls = [], data = new Map([['fa:yura:lastfm', JSON.stringify({session_key:'test',username:'test'})]]);
  let now = 0;
  const ctx = { localStorage: { getItem: k => data.get(k) || null, setItem: (k,v) => data.set(k,v) },
    window: {addEventListener() {}}, performance: {now: () => now}, setTimeout() {},
    fetch: async (url, options) => { calls.push(JSON.parse(options.body)); return {ok:true,json:async()=>({accepted:1})}; } };
  vm.createContext(ctx);
  const code = fs.readFileSync('src/assets/js/lastfm.js','utf8');
  vm.runInContext(code.slice(0, code.indexOf('\n(function () {', code.indexOf('(function () {') + 1)), ctx);
  const s = ctx.window.Scrobbler, m = {artist:'test',track:'test',duration:200,startedAt:1};
  s.track(m); s.tick(m,0,200,true);
  now = 1000; s.suspend(); s.tick(m,101,200,true);
  assert.equal(calls.length,0,'seek past halfway does not scrobble');
  for(let i=1;i<=99;i++) {now+=1000;s.tick(m,101+i,200,true);}
  assert.equal(calls.length,0,'99 seconds is below threshold');
  now+=1000;s.tick(m,201,200,true);
  assert.equal(calls.length,1,'actual listening reaches threshold');
  await new Promise(resolve => setImmediate(resolve));
  now+=1000;s.tick(m,202,200,true);
  assert.equal(calls.length,1,'successful submission is not duplicated');
  s.enabled=false;s.track({...m,startedAt:2});now+=300000;s.tick(m,300,400,true);
  assert.equal(calls.length,1,'disconnected integration stays quiet');
}
scrobbles().then(()=>console.log('Queue and listening-time regression checks passed'));

async function proxyFailures() {
  const ctx = {require, process: {env: {LASTFM_API_KEY:'test',LASTFM_SECRET:'test'}}, exports: {},
    URLSearchParams, AbortSignal, fetch: async () => ({json:async()=>({error:16,message:'temporarily unavailable'})})};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('netlify/functions/lastfm.js','utf8'),ctx);
  const event = {httpMethod:'POST',body:JSON.stringify({action:'scrobble',session_key:'test',artist:'test',track:'test'})};
  assert.equal((await ctx.exports.handler(event)).statusCode,503,'transient upstream failure is retryable');
  ctx.fetch=async()=>({json:async()=>({error:9,message:'expired'})});
  assert.equal((await ctx.exports.handler(event)).statusCode,401,'expired session requests reauthentication');
  assert.equal((await ctx.exports.handler({...event,body:'null'})).statusCode,400,'invalid JSON shape is rejected');
  console.log('Last.fm proxy regression checks passed');
}
proxyFailures();
