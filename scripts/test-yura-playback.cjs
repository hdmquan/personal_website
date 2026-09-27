// Exercise the actual event handlers without media/network access.
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = readFileSync('src/assets/js/player.js', 'utf8');
const start = source.indexOf("  audio.addEventListener('pause',");
const end = source.indexOf("  audio.addEventListener('loadedmetadata',", start);
const handlers = {};
let advances = 0, state;
const context = {
  audio: { duration: 200, currentTime: 200, ended: false, error: null,
    addEventListener: (name, fn) => { handlers[name] = fn; }, pause() {} },
  wantPlay: true, sourceLoading: false, endHandled: false, playGeneration: 1,
  playbackState: 'playing',
  sleepEndOfTrack: false, loopMode: 0, queue: [1, 2], qi: 0,
  markInterrupted() { state = 'interrupted'; }, recordPlayback() {},
  clearPlayRetry() {}, saveNowPlaying() {}, syncQFoot() {},
  setPlaybackState: value => { state = value; }, next: () => { advances++; }, toast() {},
};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);
handlers.pause();
assert.equal(advances, 0, 'pause must not advance before the native ended event');
context.sourceLoading = true; context.audio.ended = true; handlers.ended();
assert.equal(advances, 0, 'source replacement suppresses completion');
context.sourceLoading = false;
context.audio.ended = true;
handlers.ended(); handlers.ended();
assert.equal(advances, 1, 'one native end advances exactly once');
context.endHandled = false; context.audio.ended = false;
handlers.ended();
assert.equal(advances, 1, 'a stale ended event cannot skip the new track');
context.audio.error = { code: 2 };
handlers.error();
assert.equal(context.wantPlay, true, 'network errors retain playback intent for reconnect');
assert.equal(state, 'buffering');
assert.equal(advances, 1, 'network errors do not silently skip tracks');
context.wantPlay = false; context.audio.ended = true;
handlers.ended();
assert.equal(advances, 1, 'a deliberate pause is respected');
context.wantPlay = true; context.endHandled = false;
handlers.pause();
assert.equal(advances, 2, 'confirmed ended state advances without relying on proximity');
console.log('Playback regression checks passed');
