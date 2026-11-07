import { loadAllAssets } from './assets';
import {
  attachKeyboardListeners,
  attachPointerListeners,
  computeViewportLayout,
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
  const gameContainer = document.getElementById('game-container');
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

  let lastVw = 0;
  let lastVh = 0;
  let lastOffsetLeft = 0;
  let lastOffsetTop = 0;
  let lastIsLandscape: boolean | null = null;

  const applyViewportLayout = (force = false): void => {
    if (typeof window === 'undefined') return;

    if (window.scrollX !== 0 || window.scrollY !== 0) {
      window.scrollTo(0, 0);
    }

    const vv = window.visualViewport;
    const vw = Math.round(vv ? vv.width : window.innerWidth);
    const vh = Math.round(vv ? vv.height : window.innerHeight);
    const offsetLeft = Math.round(vv ? vv.offsetLeft : 0);
    const offsetTop = Math.round(vv ? vv.offsetTop : 0);

    if (
      !force &&
      vw === lastVw &&
      vh === lastVh &&
      offsetLeft === lastOffsetLeft &&
      offsetTop === lastOffsetTop
    ) {
      return;
    }

    lastVw = vw;
    lastVh = vh;
    lastOffsetLeft = offsetLeft;
    lastOffsetTop = offsetTop;

    const layout = computeViewportLayout(vw, vh);

    if (lastIsLandscape !== null && lastIsLandscape !== layout.isLandscape) {
      joystick?.reset();
    }
    lastIsLandscape = layout.isLandscape;

    if (gameContainer) {
      gameContainer.style.left = `${offsetLeft}px`;
      gameContainer.style.top = `${offsetTop}px`;
      gameContainer.style.width = `${layout.containerWidth}px`;
      gameContainer.style.height = `${layout.containerHeight}px`;
    }

    canvas.style.width = `${layout.canvasWidth}px`;
    canvas.style.height = `${layout.canvasHeight}px`;

    if (joystickContainer) {
      joystickContainer.style.width = `${layout.joystickSize}px`;
      joystickContainer.style.height = `${layout.joystickSize}px`;
      joystickContainer.style.left = `${layout.joystickLeft}px`;
      joystickContainer.style.top = `${layout.joystickTop}px`;
      joystickContainer.style.right = 'auto';
      joystickContainer.style.bottom = 'auto';
      joystickContainer.style.transform = 'none';
    }

    if (mobileActionBtn) {
      mobileActionBtn.style.left = `${layout.actionBtnLeft}px`;
      mobileActionBtn.style.right = 'auto';
      if (layout.actionBtnTop !== null) {
        mobileActionBtn.style.top = `${layout.actionBtnTop}px`;
        mobileActionBtn.style.bottom = 'auto';
        mobileActionBtn.style.transform = 'translateY(-50%)';
      } else {
        mobileActionBtn.style.top = 'auto';
        mobileActionBtn.style.bottom = `${layout.actionBtnBottom ?? 24}px`;
        mobileActionBtn.style.transform = 'none';
      }
    }
  };

  const onOrientationOrResize = (): void => {
    applyViewportLayout(true);
    // Re-apply after mobile browser rotation animation settles
    setTimeout(() => applyViewportLayout(true), 60);
    setTimeout(() => applyViewportLayout(true), 180);
    setTimeout(() => applyViewportLayout(true), 350);
  };

  applyViewportLayout(true);
  window.addEventListener('resize', onOrientationOrResize);
  window.addEventListener('orientationchange', onOrientationOrResize);
  window.addEventListener('scroll', () => applyViewportLayout(false), { passive: true });
  window.visualViewport?.addEventListener('resize', onOrientationOrResize);
  window.visualViewport?.addEventListener('scroll', () => applyViewportLayout(false));
  if (typeof screen !== 'undefined' && screen.orientation?.addEventListener) {
    screen.orientation.addEventListener('change', onOrientationOrResize);
  }

  attachKeyboardListeners(window, input, {
    onToggleJoystick: () => {
      joystick?.toggle();
      applyViewportLayout(true);
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
    applyViewportLayout(false);

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
