// Fault injection against the production transport functions, with a deterministic media element.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('src/assets/js/player.js', 'utf8');
function section(start, end) {
  const a=source.indexOf(start), b=source.indexOf(end,a);
  assert(a>=0 && b>a, 'production function boundaries exist');
  return source.slice(a,b);
}
let plays=0, loads=0, advances=0, timer=0;
const timers=new Map(), events=[];
const c={
  audio:{src:'test.mp3',paused:true,ended:false,currentTime:87,readyState:2,error:null,seeking:false,
    play(){plays++;this.paused=false;return Promise.resolve();},
    load(){loads++;this.error=null;this.paused=true;}, pause(){this.paused=true;}},
  navigator:{onLine:true,audioSession:{state:'active'}}, document:{hidden:false},
  queue:[{}], wantPlay:true, interrupted:false, sourceLoading:false, playbackState:'paused',
  playGeneration:0, playAttempt:null, playAttemptTimer:null, playRetry:null, playFailures:0,
  stallRecoveries:0, pendingSeek:null, lastCT:87, lastCTAt:0, seeking:false,
  setTimeout(fn){timers.set(++timer,fn);return timer;}, clearTimeout(id){timers.delete(id);},
  setInterval(fn){c.watchdog=fn;}, window:{addEventListener(){}},
  Date:{now:()=>20000}, Promise,
  recordPlayback(e){events.push(e);}, setPlaybackState(s){c.playbackState=s;},
  activateOSAudio(){}, reassertMediaSession(){}, saveNowPlaying(){}, toast(){},
  handleEnd(){advances++;}
};
vm.createContext(c);
vm.runInContext(section('  function clearPlayRetry()', '  // Local, bounded diagnostics'),c);
vm.runInContext(section('  function cancelPlayAttempt()', '  function beginScrobbleCycle()'),c);
vm.runInContext(section('  function requestPlayback(', '  function loadCurrent('),c);
vm.runInContext(section('  function resumePlayback(', "  npPlay.addEventListener"),c);
const watchdog=section('  setInterval(() => {\n    if (!wantPlay', '  function setPct(');
vm.runInContext(watchdog,c);
async function run(){
  c.markInterrupted();
  assert.equal(c.playbackState,'interrupted');
  c.document.hidden=true;
  for(let i=0;i<30;i++) c.watchdog();
  assert.equal(plays,0,'interruption does not fight background audio focus');
  assert.equal(loads,0,'interruption does not reload the resource');
  assert.equal(c.wantPlay,true,'interruption retains listener intent');
  c.document.hidden=false;c.navigator.audioSession.state='interrupted';c.resumePlayback();await Promise.resolve();
  assert.equal(plays,1,'explicit resume makes a fresh play request');
  assert.equal(loads,0,'normal resume reuses the buffered media');
  c.navigator.audioSession.state='active';
  assert.equal(c.audio.currentTime,87);
  c.pausePlayback();
  assert.equal(c.wantPlay,false,'user pause cancels automatic resume');
  c.watchdog();assert.equal(plays,1);

  c.audio.error={code:2};c.playbackState='failed';c.resumePlayback();
  assert.equal(loads,1,'retry reloads a failed media resource');
  assert.equal(c.pendingSeek,87,'retry preserves position');
  assert.equal(plays,2,'reload initiates playback without waiting for a polling interval');

  c.audio.paused=true;c.playAttempt=new Promise(()=>{});c.playbackState='interrupted';
  c.resumePlayback();assert.equal(plays,3,'a hung promise cannot block explicit play');
  c.pausePlayback();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(c.wantPlay,false,'late promise resolution does not undo user pause');

  c.sourceLoading=false;c.interrupted=false;c.wantPlay=true;c.audio.paused=false;
  c.audio.currentTime=199.9;c.audio.duration=200;c.audio.ended=false;c.lastCT=199.9;c.lastCTAt=0;
  c.watchdog();assert.equal(advances,0,'near-end stall never advances the queue');
  assert.equal(loads,2,'stalled media is repaired on the same track');
  c.sourceLoading=false;c.lastCTAt=0;c.audio.ended=true;c.watchdog();
  assert.equal(advances,1,'confirmed completion advances');
  console.log('Interruption, explicit retry, hung-promise and stall recovery checks passed');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
