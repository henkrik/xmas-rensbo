import { consumeActionPress, InputState } from '../core/input';
import { createPlayer, Player, updatePlayer } from '../entities/player';
import {
  createDrivewayThrowers,
  HIT_BLINK_DURATION_SECONDS,
  Snowball,
  SnowballThrower,
  updateSnowballFight,
} from '../entities/snowball';
import {
  buildInteractables,
  DialogueState,
  findNearbyInteractable,
  Interactable,
} from './interaction';
import {
  PLAYER_START_X,
  PLAYER_START_Y,
  STARTER_MAP,
  TileMap,
} from './tilemap';

export interface GameState {
  map: TileMap;
  player: Player;
  throwers: SnowballThrower[];
  snowballs: Snowball[];
  interactables: Interactable[];
  nearbyInteractable: Interactable | null;
  activeDialogue: DialogueState | null;
}

export function createGameState(map: TileMap = STARTER_MAP): GameState {
  const player = createPlayer(PLAYER_START_X, PLAYER_START_Y);
  const throwers = createDrivewayThrowers();
  const snowballs: Snowball[] = [];
  const interactables = buildInteractables(throwers);

  return {
    map,
    player,
    throwers,
    snowballs,
    interactables,
    nearbyInteractable: null,
    activeDialogue: null,
  };
}

/**
 * Resets the map state when Santa gets hit by a snowball:
 * - Teleports Santa back to the bottom of the driveway facing up
 * - Starts Santa's blinking timer
 * - Resets snowball throwers and clears flying snowballs
 */
export function resetAfterSnowballHit(state: GameState): void {
  state.player.x = PLAYER_START_X;
  state.player.y = PLAYER_START_Y;
  state.player.facing = 'up';
  state.player.isMoving = false;
  state.player.walkTimer = 0;
  state.player.blinkTimer = HIT_BLINK_DURATION_SECONDS;

  state.throwers = createDrivewayThrowers();
  state.snowballs = [];
  state.interactables = buildInteractables(state.throwers);
  state.nearbyInteractable = null;
  state.activeDialogue = null;
}

export function updateGameState(
  state: GameState,
  input: InputState,
  dtSeconds: number
): void {
  const zPressed = consumeActionPress(input);

  // If a dialogue box is currently open, pressing Z advances or closes it
  if (state.activeDialogue) {
    state.player.isMoving = false;
    if (zPressed) {
      state.activeDialogue.currentIndex += 1;
      if (
        state.activeDialogue.currentIndex >= state.activeDialogue.lines.length
      ) {
        state.activeDialogue = null;
      }
    }
    return;
  }

  // Move player (throwers act as solid obstacles so Santa doesn't walk right through them)
  updatePlayer(state.player, input, dtSeconds, state.map, state.throwers);

  // Update snowball fight on the driveway
  const hitBySnowball = updateSnowballFight(
    state.throwers,
    state.snowballs,
    state.player,
    dtSeconds
  );
  if (hitBySnowball) {
    resetAfterSnowballHit(state);
    return;
  }

  // Check if Santa is close enough to an interactable object to show the Z prompt
  state.nearbyInteractable = findNearbyInteractable(
    state.player,
    state.interactables
  );

  if (zPressed && state.nearbyInteractable) {
    state.activeDialogue = {
      lines: state.nearbyInteractable.dialogueLines,
      currentIndex: 0,
    };
  }
}

