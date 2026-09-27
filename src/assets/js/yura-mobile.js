/* App-style gestures, scoped to the Yura page. Single-finger scrolling and text editing remain native. */
(() => {
  if (!window.matchMedia('(pointer: coarse)').matches) return;
  document.addEventListener('gesturestart', e => e.preventDefault(), { passive: false });
  document.addEventListener('gesturechange', e => e.preventDefault(), { passive: false });
  document.addEventListener('touchmove', e => {
    if (e.touches.length > 1) e.preventDefault();
  }, { passive: false });
})();
