export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  action: boolean;
  actionJustPressed: boolean;
  pointerClick?: { worldX: number; worldY: number } | null;
  moveVector?: { x: number; y: number } | null;
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
    moveVector: null,
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

export interface KeyboardListenersOptions {
  onToggleJoystick?: () => void;
}

export function applyKeyEvent(
  state: InputState,
  codeOrKey: string,
  isPressed: boolean,
  options?: KeyboardListenersOptions
): boolean {
  if (isPressed && (codeOrKey === 'KeyJ' || codeOrKey === 'j' || codeOrKey === 'J')) {
    options?.onToggleJoystick?.();
    return true;
  }

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
  state: InputState,
  options?: KeyboardListenersOptions
): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    if (applyKeyEvent(state, e.code || e.key, true, options)) {
      e.preventDefault();
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    if (applyKeyEvent(state, e.code || e.key, false, options)) {
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
  isJoystickActive?: () => boolean;
  isDialogueActive?: () => boolean;
}

/**
 * Attaches pointer/touch listeners on canvas to enable tapping/clicking near objects or dialogue.
 */
export function attachPointerListeners(
  options: PointerControlsOptions
): () => void {
  const { canvas, input, getCamera, isJoystickActive, isDialogueActive } = options;

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

  const onPointerDown = (e: PointerEvent) => {
    const isTargetCanvas = e.target === canvas || canvas.contains(e.target as Node);
    const dialogueActive = isDialogueActive?.() ?? false;

    // Only accept events outside canvas if dialogue is active
    if (!isTargetCanvas && !dialogueActive) return;

    // If virtual joystick is being used or handle is active, don't conflict unless dialogue is active
    if (isJoystickActive?.() && !dialogueActive) return;

    // Prevent browser selection / drag triggers when rapidly clicking
    e.preventDefault();

    activePointerId = e.pointerId;
    pointerDownTime = performance.now();
    startClientX = e.clientX;
    startClientY = e.clientY;
  };

  const onPointerUp = (e: PointerEvent) => {
    if (activePointerId !== e.pointerId) return;
    activePointerId = null;

    const duration = performance.now() - pointerDownTime;
    const moveDist = Math.hypot(e.clientX - startClientX, e.clientY - startClientY);

    // If it's a tap/click:
    // Duration under 400ms and didn't drag far across the screen
    if (duration < 400 && moveDist < 16) {
      const { worldX, worldY } = toWorldCoords(e.clientX, e.clientY);
      input.pointerClick = { worldX, worldY };
    }
  };

  const onPointerCancel = (e: PointerEvent) => {
    if (activePointerId !== e.pointerId) return;
    activePointerId = null;
  };

  window.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerCancel);

  // Prevent default touch gestures (like pull-to-refresh or panning) on the canvas
  canvas.style.touchAction = 'none';

  return () => {
    window.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
  };
}

export interface VirtualJoystickOptions {
  container: HTMLElement;
  stick: HTMLElement;
  input: InputState;
  targetWindow?: EventTarget;
}

export interface VirtualJoystickController {
  show: () => void;
  hide: () => void;
  toggle: () => void;
  reset: () => void;
  isVisible: () => boolean;
  isPointerActive: () => boolean;
  destroy: () => void;
}

export interface ViewportLayout {
  isLandscape: boolean;
  containerWidth: number;
  containerHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  joystickSize: number;
  joystickLeft: number;
  joystickTop: number;
  actionBtnLeft: number;
  actionBtnTop: number | null;
  actionBtnBottom: number | null;
}

/**
 * Computes exact pixel layout for the game container, canvas, virtual joystick, and action button
 * for any viewport dimensions (desktop, mobile portrait, and mobile landscape).
 *
 * If isLandscapeOverride is specified (e.g. from device orientation APIs), it ensures
 * the horizontal axis (width) maps to the long side in landscape, and the short side in portrait,
 * preventing any axis confusion during mobile orientation transitions.
 */
export function computeViewportLayout(
  vw: number,
  vh: number,
  isLandscapeOverride?: boolean
): ViewportLayout {
  const dim1 = Math.max(1, Math.round(vw));
  const dim2 = Math.max(1, Math.round(vh));
  const isLandscape =
    typeof isLandscapeOverride === 'boolean'
      ? isLandscapeOverride
      : dim1 > dim2;

  const longSide = Math.max(dim1, dim2);
  const shortSide = Math.min(dim1, dim2);

  // In landscape mode, the horizontal axis is the long side and vertical axis is the short side.
  // In portrait mode, the horizontal axis is the short side and vertical axis is the long side.
  const safeVw = isLandscape ? longSide : shortSide;
  const safeVh = isLandscape ? shortSide : longSide;

  const pad = 24;
  const availW = Math.max(64, safeVw - pad);
  const availH = Math.max(64, safeVh - pad);

  const aspect = 256 / 224;
  const canvasWidth = Math.floor(Math.min(availW, availH * aspect));
  const canvasHeight = Math.floor(Math.min(availH, availW / aspect));

  const maxAllowedJoy = Math.max(80, shortSide - 16);
  const joystickSize = Math.round(
    Math.min(maxAllowedJoy, Math.max(120, Math.min(320, shortSide * 0.5)))
  );

  if (isLandscape) {
    return {
      isLandscape: true,
      containerWidth: safeVw,
      containerHeight: safeVh,
      canvasWidth,
      canvasHeight,
      joystickSize,
      joystickLeft: safeVw - joystickSize,
      joystickTop: Math.round((safeVh - joystickSize) / 2),
      actionBtnLeft: 20,
      actionBtnTop: Math.round(safeVh / 2),
      actionBtnBottom: null,
    };
  }

  return {
    isLandscape: false,
    containerWidth: safeVw,
    containerHeight: safeVh,
    canvasWidth,
    canvasHeight,
    joystickSize,
    joystickLeft: Math.round((safeVw - joystickSize) / 2),
    joystickTop: safeVh - joystickSize,
    actionBtnLeft: 20,
    actionBtnTop: null,
    actionBtnBottom: 24,
  };
}

export function createVirtualJoystick(
  options: VirtualJoystickOptions
): VirtualJoystickController {
  const { container, stick, input } = options;

  let activePointerId: number | null = null;
  let isDragging = false;

  const resetStick = () => {
    stick.style.transform = 'translate(0px, 0px)';
    input.left = false;
    input.right = false;
    input.up = false;
    input.down = false;
    input.moveVector = null;
  };

  const handlePointer = (clientX: number, clientY: number) => {
    const rect = container.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const dist = Math.hypot(dx, dy);

    // Max movement radius for the stick inside the base circle
    // Container radius minus half of stick radius
    const maxRadius = (rect.width / 2) * 0.72;

    const dirX = dist > 0 ? dx / dist : 0;
    const dirY = dist > 0 ? dy / dist : 0;
    const clampedDist = Math.min(dist, maxRadius);
    const intensity = clampedDist / maxRadius; // [0, 1] clamped distance from center divided by max travel radius

    stick.style.transform = `translate(${(dirX * clampedDist).toFixed(1)}px, ${(dirY * clampedDist).toFixed(1)}px)`;

    // Deadzone of 15% to prevent small thumb rests from triggering motion
    const deadzone = maxRadius * 0.15;
    if (dist < deadzone) {
      input.left = false;
      input.right = false;
      input.up = false;
      input.down = false;
      input.moveVector = null;
      return;
    }

    // Direction vector scaled by [0, 1] clamped distance from center:
    // - Whenever pointer is at or outside the circle (clampedDist == maxRadius), intensity is 1.0 (100% speed)
    // - When pointer is halfway, intensity is 0.5 (50% speed)
    input.moveVector = {
      x: dirX * intensity,
      y: dirY * intensity,
    };

    // Digital directional booleans without any restrictive angle deadbands
    input.left = dirX < 0;
    input.right = dirX > 0;
    input.up = dirY < 0;
    input.down = dirY > 0;
  };

  const onPointerDown = (e: PointerEvent) => {
    activePointerId = e.pointerId;
    isDragging = true;
    e.preventDefault();
    handlePointer(e.clientX, e.clientY);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!isDragging || e.pointerId !== activePointerId) return;
    e.preventDefault();
    handlePointer(e.clientX, e.clientY);
  };

  const onPointerUp = (e: PointerEvent) => {
    if (e.pointerId !== activePointerId) return;
    activePointerId = null;
    isDragging = false;
    resetStick();
  };

  const onPointerCancel = (e: PointerEvent) => {
    if (e.pointerId !== activePointerId) return;
    activePointerId = null;
    isDragging = false;
    resetStick();
  };

  const win = options.targetWindow ?? (typeof window !== 'undefined' ? window : null);

  container.addEventListener('pointerdown', onPointerDown);
  win?.addEventListener('pointermove', onPointerMove as EventListener);
  win?.addEventListener('pointerup', onPointerUp as EventListener);
  win?.addEventListener('pointercancel', onPointerCancel as EventListener);

  return {
    show: () => {
      container.style.display = 'flex';
    },
    hide: () => {
      container.style.display = 'none';
      activePointerId = null;
      isDragging = false;
      resetStick();
    },
    toggle: () => {
      if (container.style.display === 'none') {
        container.style.display = 'flex';
      } else {
        container.style.display = 'none';
        activePointerId = null;
        isDragging = false;
        resetStick();
      }
    },
    reset: () => {
      activePointerId = null;
      isDragging = false;
      resetStick();
    },
    isVisible: () => container.style.display !== 'none',
    isPointerActive: () => isDragging,
    destroy: () => {
      container.removeEventListener('pointerdown', onPointerDown);
      win?.removeEventListener('pointermove', onPointerMove as EventListener);
      win?.removeEventListener('pointerup', onPointerUp as EventListener);
      win?.removeEventListener('pointercancel', onPointerCancel as EventListener);
    },
  };
}
