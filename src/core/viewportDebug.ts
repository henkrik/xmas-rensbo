/**
 * Debug mode (enabled with `?debug` in the URL).
 *
 * Gives the full-window `#viewport-frame` wrapper a green border and prints, once per second,
 * the frame's own measured size next to what the browser reports for the window/screen.
 * If the green border does not reach the screen edges after rotating, the browser (user agent)
 * is reporting a stale layout viewport — not our layout code.
 */
export function attachViewportDebugOverlay(
  frame: HTMLElement | null,
  gameContainer: HTMLElement | null
): () => void {
  if (!frame) return () => {};

  frame.classList.add('debug');
  const el = document.createElement('pre');
  el.id = 'viewport-debug-text';
  frame.appendChild(el);

  const update = (): void => {
    const frameRect = frame.getBoundingClientRect();
    const vv = window.visualViewport;
    const de = document.documentElement;
    const rect = gameContainer?.getBoundingClientRect();
    const legacyOrientation = (window as unknown as { orientation?: number }).orientation;
    el.textContent = [
      `FRAME: ${frameRect.width.toFixed(1)} x ${frameRect.height.toFixed(1)} @ (${frameRect.left.toFixed(0)}, ${frameRect.top.toFixed(0)})`,
      `orientation: ${screen.orientation?.type ?? 'n/a'} (legacy: ${legacyOrientation ?? 'n/a'})`,
      `inner: ${window.innerWidth} x ${window.innerHeight}`,
      `docEl client: ${de.clientWidth} x ${de.clientHeight}`,
      vv
        ? `visualViewport: ${vv.width.toFixed(1)} x ${vv.height.toFixed(1)} @${vv.scale.toFixed(3)}`
        : 'visualViewport: n/a',
      `screen: ${screen.width} x ${screen.height} dpr ${window.devicePixelRatio}`,
      rect
        ? `game-container: ${rect.width.toFixed(0)} x ${rect.height.toFixed(0)} @ (${rect.left.toFixed(0)}, ${rect.top.toFixed(0)})`
        : 'game-container: n/a',
      `updated: ${new Date().toLocaleTimeString()}`,
    ].join('\n');
  };

  update();
  const id = window.setInterval(update, 1000);
  return () => {
    window.clearInterval(id);
    el.remove();
    frame.classList.remove('debug');
  };
}
