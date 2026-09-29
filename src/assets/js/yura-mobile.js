/* Best-effort zoom suppression for the archive. OS-level magnification remains OS-controlled. */
(() => {
  if (!window.matchMedia('(any-pointer: coarse)').matches) return;
  const preventZoom = e => { if (e.cancelable) e.preventDefault(); };
  document.addEventListener('gesturestart', preventZoom, { passive: false });
  document.addEventListener('gesturechange', preventZoom, { passive: false });
  const preventPinch = e => { if (e.touches.length > 1) preventZoom(e); };
  document.addEventListener('touchstart', preventPinch, { passive: false });
  document.addEventListener('touchmove', preventPinch, { passive: false });
  document.addEventListener('dblclick', e => {
    // Preserve native text selection/editing. Ordinary clicks and one-finger scrolling are untouched.
    if (!e.target.closest('input, textarea, [contenteditable]')) preventZoom(e);
  }, { passive: false });
})();
