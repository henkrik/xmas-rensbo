export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  action: boolean;
  actionJustPressed: boolean;
}

export function createEmptyInput(): InputState {
  return {
    up: false,
    down: false,
    left: false,
    right: false,
    action: false,
    actionJustPressed: false,
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
