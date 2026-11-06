import { loadAllAssets } from './assets';
import { attachKeyboardListeners, createEmptyInput } from './core/input';
import { renderGame } from './rendering/renderer';
import { createGameState, updateGameState } from './world/gameState';

async function startGame(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  if (!canvas) {
    throw new Error('Could not find #game-canvas element');
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get 2D rendering context');
  }

  const assets = await loadAllAssets();
  const input = createEmptyInput();
  attachKeyboardListeners(window, input);

  const state = createGameState();

  let lastTimestamp: number | null = null;

  function frame(now: number): void {
    const dtSeconds =
      lastTimestamp === null
        ? 0
        : Math.max(0, Math.min((now - lastTimestamp) / 1000, 0.1));
    lastTimestamp = now;

    updateGameState(state, input, dtSeconds);
    renderGame(ctx!, state, assets);

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

startGame().catch((err) => {
  console.error('Failed to start Xmas Rensbo:', err);
});
