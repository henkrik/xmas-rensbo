export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  action: boolean;
  actionJustPressed: boolean;
  pointerClick?: { worldX: number; worldY: number } | null;
}

export function createEmptyInput(): InputState {
  return {
    up: false,
    down: false,
    left: false,
    right: false,
    action: false,
    actionJustPressed: false,
    pointerClick: null,
  };
}

const KEY_TO_BUTTON: Record<
  string,
  'up' | 'down' | 'left' | 'right' | 'action'
> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyZ: 'action',
  z: 'action',
  Z: 'action',
};

export function applyKeyEvent(
  state: InputState,
  codeOrKey: string,
  isPressed: boolean
): boolean {
  const btn = KEY_TO_BUTTON[codeOrKey];
  if (!btn) {
    return false;
  }
  if (btn === 'action') {
    if (isPressed && !state.action) {
      state.actionJustPressed = true;
    }
    state.action = isPressed;
  } else {
    state[btn] = isPressed;
  }
  return true;
}

export function consumeActionPress(state: InputState): boolean {
  if (state.actionJustPressed) {
    state.actionJustPressed = false;
    return true;
  }
  return false;
}

export function attachKeyboardListeners(
  target: Window,
  state: InputState
): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    if (applyKeyEvent(state, e.code || e.key, true)) {
      e.preventDefault();
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    if (applyKeyEvent(state, e.code || e.key, false)) {
      e.preventDefault();
    }
  };

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);

  return () => {
    target.removeEventListener('keydown', onKeyDown);
    target.removeEventListener('keyup', onKeyUp);
  };
}

export interface PointerControlsOptions {
  canvas: HTMLCanvasElement;
  input: InputState;
  getCamera: () => { x: number; y: number };
  getPlayerCenter: () => { x: number; y: number };
}

/**
 * Attaches pointer/touch listeners to enable moving by holding/pressing
 * in a direction relative to Santa, and interacting by tapping/clicking near objects or dialogue.
 */
export function attachPointerListeners(
  options: PointerControlsOptions
): () => void {
  const { canvas, input, getCamera, getPlayerCenter } = options;

  let activePointerId: number | null = null;
  let pointerDownTime = 0;
  let startClientX = 0;
  let startClientY = 0;

  const toWorldCoords = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasX = (clientX - rect.left) * scaleX;
    const canvasY = (clientY - rect.top) * scaleY;
    const camera = getCamera();
    return {
      worldX: canvasX + camera.x,
      worldY: canvasY + camera.y,
      canvasX,
      canvasY,
    };
  };

  const updateDirectionalMovement = (clientX: number, clientY: number) => {
    const world = toWorldCoords(clientX, clientY);
    const player = getPlayerCenter();
    const dx = world.worldX - player.x;
    const dy = world.worldY - player.y;
    const dist = Math.hypot(dx, dy);

    // Deadzone of 6px around Santa's center to prevent jittering when finger is directly on Santa
    if (dist < 6) {
      input.left = false;
      input.right = false;
      input.up = false;
      input.down = false;
      return;
    }

    // 8-way directional deadband
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    input.left = dx < 0 && (absDx > absDy * 0.4);
    input.right = dx > 0 && (absDx > absDy * 0.4);
    input.up = dy < 0 && (absDy > absDx * 0.4);
    input.down = dy > 0 && (absDy > absDx * 0.4);
  };

  const clearMovement = () => {
    input.left = false;
    input.right = false;
    input.up = false;
    input.down = false;
  };

  const onPointerDown = (e: PointerEvent) => {
    activePointerId = e.pointerId;
    pointerDownTime = performance.now();
    startClientX = e.clientX;
    startClientY = e.clientY;

    // Start moving immediately towards finger/mouse
    updateDirectionalMovement(e.clientX, e.clientY);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (activePointerId !== e.pointerId) return;

    updateDirectionalMovement(e.clientX, e.clientY);
  };

  const onPointerUp = (e: PointerEvent) => {
    if (activePointerId !== e.pointerId) return;
    activePointerId = null;
    clearMovement();

    const duration = performance.now() - pointerDownTime;
    const moveDist = Math.hypot(e.clientX - startClientX, e.clientY - startClientY);

    // If it's a tap/click (not a long-press walk drag):
    // Duration under 400ms and didn't drag far across the screen
    if (duration < 400 && moveDist < 16) {
      const { worldX, worldY } = toWorldCoords(e.clientX, e.clientY);
      input.pointerClick = { worldX, worldY };
    }
  };

  const onPointerCancel = (e: PointerEvent) => {
    if (activePointerId !== e.pointerId) return;
    activePointerId = null;
    clearMovement();
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerCancel);

  // Prevent default touch gestures (like pull-to-refresh or panning) on the canvas
  canvas.style.touchAction = 'none';

  return () => {
    canvas.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
  };
}
