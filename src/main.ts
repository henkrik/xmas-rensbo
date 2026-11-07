import { loadAllAssets } from './assets';
import {
  attachKeyboardListeners,
  attachPointerListeners,
  computeViewportLayout,
  createEmptyInput,
  createVirtualJoystick,
} from './core/input';
import { attachDebugConsole } from './core/debugConsole';
import { computeCamera, renderGame } from './rendering/renderer';
import { createGameState, updateGameState } from './world/gameState';

export function detectIsLandscape(): boolean {
  if (typeof window === 'undefined') return false;

  // 1. screen.orientation API (modern standard)
  if (typeof screen !== 'undefined' && screen.orientation?.type) {
    if (screen.orientation.type.startsWith('landscape')) return true;
    if (screen.orientation.type.startsWith('portrait')) return false;
  }

  // 2. window.orientation (iOS Safari legacy standard: 90 or -90 is landscape)
  if (typeof window.orientation === 'number') {
    if (Math.abs(window.orientation) === 90) return true;
    if (window.orientation === 0 || window.orientation === 180) return false;
  }

  // 3. CSS media query matching (evaluated by CSS engine in real-time)
  if (typeof window.matchMedia === 'function') {
    const m = window.matchMedia('(orientation: landscape)');
    if (m && typeof m.matches === 'boolean') {
      return m.matches;
    }
  }

  // 4. Fallback to window dimensions
  return window.innerWidth > window.innerHeight;
}

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

  let lastLayoutKey = '';
  let lastIsLandscape: boolean | null = null;

  const applyViewportLayout = (force = false): void => {
    if (typeof window === 'undefined') return;

    if (window.scrollX !== 0 || window.scrollY !== 0) {
      window.scrollTo(0, 0);
    }

    const isLandscape = detectIsLandscape();

    const vv = window.visualViewport;
    const rawW = Math.round(vv ? vv.width : window.innerWidth);
    const rawH = Math.round(vv ? vv.height : window.innerHeight);

    // Compute layout using detectIsLandscape to ensure horizontal and vertical axes
    // are correctly mapped regardless of delayed browser viewport updates
    const layout = computeViewportLayout(rawW, rawH, isLandscape);

    const layoutKey = `${layout.isLandscape}-${layout.containerWidth}-${layout.containerHeight}-${layout.canvasWidth}-${layout.canvasHeight}`;
    if (!force && layoutKey === lastLayoutKey) {
      return;
    }
    lastLayoutKey = layoutKey;

    if (lastIsLandscape !== null && lastIsLandscape !== layout.isLandscape) {
      joystick?.reset();
    }
    lastIsLandscape = layout.isLandscape;

    if (gameContainer) {
      gameContainer.style.left = '0px';
      gameContainer.style.top = '0px';
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
    // Re-apply across mobile browser rotation animation phases
    setTimeout(() => applyViewportLayout(true), 50);
    setTimeout(() => applyViewportLayout(true), 150);
    setTimeout(() => applyViewportLayout(true), 300);
    setTimeout(() => applyViewportLayout(true), 500);
  };

  // WebKit (Safari, and Chrome/Firefox on iOS) sometimes keeps the *portrait* layout viewport
  // width after rotating to landscape, so pages only use the left part of the screen until reload.
  // Re-writing the viewport <meta> with a changed (but visually harmless) argument forces WebKit
  // to re-parse it and recompute the layout viewport for the new orientation.
  const viewportMeta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  const baseViewportContent = viewportMeta?.content ?? '';
  const nudgeViewportMeta = (): void => {
    if (!viewportMeta || !baseViewportContent) return;
    const nudged = /maximum-scale=[\d.]+/.test(baseViewportContent)
      ? baseViewportContent.replace(/maximum-scale=[\d.]+/, 'maximum-scale=1.001')
      : `${baseViewportContent}, maximum-scale=1.001`;
    viewportMeta.content = nudged;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        viewportMeta.content = baseViewportContent;
        onOrientationOrResize();
      });
    });
  };

  const onOrientationChange = (): void => {
    onOrientationOrResize();
    // iOS fires orientation events before the rotation animation finishes, so nudge twice
    nudgeViewportMeta();
    setTimeout(nudgeViewportMeta, 350);
  };

  applyViewportLayout(true);
  window.addEventListener('resize', onOrientationOrResize);
  window.addEventListener('orientationchange', onOrientationChange);
  window.addEventListener('scroll', () => applyViewportLayout(false), { passive: true });
  window.visualViewport?.addEventListener('resize', onOrientationOrResize);
  window.visualViewport?.addEventListener('scroll', () => applyViewportLayout(false));
  if (typeof screen !== 'undefined' && screen.orientation?.addEventListener) {
    screen.orientation.addEventListener('change', onOrientationChange);
  }

  if (new URLSearchParams(window.location.search).has('debug')) {
    attachDebugConsole(document.getElementById('viewport-frame'));
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
