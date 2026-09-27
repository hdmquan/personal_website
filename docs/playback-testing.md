# Mobile playback verification

Run `npm test` and `npm run build` before deploying. The recovery tests simulate media faults; they do not reproduce an operating system suspending or terminating a browser.

## Real-device release checks

Record phone model, OS and browser versions, Safari/Chrome tab versus installed app, and whether battery saving is enabled.

1. Play 30 tracks with the app visible, then repeat with the screen locked. Note whether any stop happens during a track or at its boundary.
2. Interrupt playback with another app's audio. Stop that audio. Try the system Play control, then return to the archive and tap Play. Verify the same track and position resume.
3. Pause from the lock screen, wait at least 30 seconds, and resume. Confirm that deliberate pauses do not automatically restart on returning to the archive.
4. Disconnect the network at track start, middle, and just before the end. Reconnect. Confirm no skipped track, duplicate advancement, or position reset.
5. Repeat with a downloaded album offline and seek within tracks.
6. If playback fails, return to the catalogue and select Settings → Download playback report before reloading. If a restart was necessary, the report can include the previous saved interruption/failure snapshot.

The report contains a bounded local event history, browser information, playback position, connectivity, visibility, and numeric media errors. It excludes track names, media URLs, and Last.fm credentials. No report is uploaded automatically. Verify file export on the target device; the desktop in-app browser did not expose a download-completion event during testing.

## Platform boundary

Media Session metadata and handlers do not force iOS to route system Play to this page. If another app receives the command, JavaScript in this player cannot intercept it. Audio Session interruption detection is used only when supported. Unknown external pauses wait for explicit play or a return to the foreground, instead of repeatedly competing for audio focus.

A native playback layer is a separate architecture decision: iOS AVAudioSession/AVPlayer and Android Media3 MediaSessionService can manage lifecycle and interruptions outside the web page. A WebView wrapper alone does not provide that layer.
