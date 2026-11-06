import { loadAllAssets } from './assets';
import {
  attachKeyboardListeners,
  attachPointerListeners,
  createEmptyInput,
  createVirtualJoystick,
} from './core/input';
import { computeCamera, renderGame } from './rendering/renderer';
import { createGameState, updateGameState } from './world/gameState';

function getActionLabel(promptText: string): string {
  // Strip "Z: " prefix if present and return concise action
  const clean = promptText.replace(/^Z:\s*/i, '').trim();
  if (!clean) return 'Action';
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

async function startGame(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  if (!canvas) {
    throw new Error('Could not find #game-canvas element');
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get 2D rendering context');
  }

  const joystickContainer = document.getElementById('virtual-joystick-container');
  const joystickStick = document.getElementById('virtual-joystick-stick');
  const mobileActionBtn = document.getElementById('mobile-action-btn') as HTMLButtonElement | null;

  const assets = await loadAllAssets();
  const input = createEmptyInput();

  // Detect mobile / touch device by default
  const isMobileDevice =
    typeof window !== 'undefined' &&
    ('ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      window.matchMedia('(pointer: coarse)').matches);

  let joystick: ReturnType<typeof createVirtualJoystick> | null = null;
  if (joystickContainer && joystickStick) {
    joystick = createVirtualJoystick({
      container: joystickContainer,
      stick: joystickStick,
      input,
    });

    if (isMobileDevice) {
      joystick.show();
    } else {
      joystick.hide();
    }
  }

  attachKeyboardListeners(window, input, {
    onToggleJoystick: () => {
      joystick?.toggle();
    },
  });

  const state = createGameState({
    isMobile: isMobileDevice,
    showIntroDialogue: true,
  });
  state.joystickActive = isMobileDevice;

  if (mobileActionBtn) {
    mobileActionBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      input.actionJustPressed = true;
      input.action = true;
    });
    mobileActionBtn.addEventListener('pointerup', () => {
      input.action = false;
    });
    mobileActionBtn.addEventListener('pointercancel', () => {
      input.action = false;
    });
  }

  attachPointerListeners({
    canvas,
    input,
    getCamera: () => {
      const mapWidthPx = state.map.cols * state.map.tileSize;
      const mapHeightPx = state.map.rows * state.map.tileSize;
      return computeCamera(
        state.player.x,
        state.player.y,
        state.player.width,
        state.player.height,
        canvas.width,
        canvas.height,
        mapWidthPx,
        mapHeightPx
      );
    },
    isJoystickActive: () => joystick?.isPointerActive() ?? false,
    isDialogueActive: () => state.activeDialogue !== null,
  });

  let lastTimestamp: number | null = null;

  function frame(now: number): void {
    const dtSeconds =
      lastTimestamp === null
        ? 0
        : Math.max(0, Math.min((now - lastTimestamp) / 1000, 0.1));
    lastTimestamp = now;

    // Track joystick active state in game state so renderer & entities (like dog speed) adapt
    const isJoystickShown = joystick?.isVisible() ?? false;
    state.joystickActive = isJoystickShown;

    updateGameState(state, input, dtSeconds);
    renderGame(ctx!, state, assets);

    // Sync mobile action button visibility and text with nearby interactable
    if (mobileActionBtn) {
      if (isJoystickShown && state.nearbyInteractable) {
        mobileActionBtn.textContent = getActionLabel(state.nearbyInteractable.promptText);
        mobileActionBtn.style.display = 'block';
      } else {
        mobileActionBtn.style.display = 'none';
      }
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

startGame().catch((err) => {
  console.error('Failed to start Xmas Rensbo:', err);
});
