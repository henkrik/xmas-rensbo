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
}

export interface VirtualJoystickController {
  show: () => void;
  hide: () => void;
  toggle: () => void;
  isVisible: () => boolean;
  isPointerActive: () => boolean;
  destroy: () => void;
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

    let clampedX = dx;
    let clampedY = dy;
    if (dist > maxRadius) {
      clampedX = (dx / dist) * maxRadius;
      clampedY = (dy / dist) * maxRadius;
    }

    stick.style.transform = `translate(${clampedX.toFixed(1)}px, ${clampedY.toFixed(1)}px)`;

    // Deadzone of 15% to prevent small thumb rests from triggering motion
    const deadzone = maxRadius * 0.15;
    if (dist < deadzone) {
      input.left = false;
      input.right = false;
      input.up = false;
      input.down = false;
      return;
    }

    // 8-directional movement deadband
    const absX = Math.abs(clampedX);
    const absY = Math.abs(clampedY);

    input.left = clampedX < 0 && absX > absY * 0.38;
    input.right = clampedX > 0 && absX > absY * 0.38;
    input.up = clampedY < 0 && absY > absX * 0.38;
    input.down = clampedY > 0 && absY > absX * 0.38;
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

  container.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerCancel);

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
    isVisible: () => container.style.display !== 'none',
    isPointerActive: () => isDragging,
    destroy: () => {
      container.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
    },
  };
}
