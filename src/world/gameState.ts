import { consumeActionPress, InputState } from '../core/input';
import { createDog, Dog, updateDog } from '../entities/dog';
import {
  createPlayer,
  Footprint,
  Player,
  rectsIntersect,
  updateFootprints,
  updatePlayer,
} from '../entities/player';
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
  DAMAGED_WIRE_HAZARD,
  PLAYER_START_X,
  PLAYER_START_Y,
  STARTER_MAP,
  TileMap,
} from './tilemap';

export interface GameState {
  map: TileMap;
  player: Player;
  footprints: Footprint[];
  dog: Dog;
  throwers: SnowballThrower[];
  snowballs: Snowball[];
  interactables: Interactable[];
  nearbyInteractable: Interactable | null;
  activeDialogue: DialogueState | null;
  elapsedTime: number;
}

export function createGameState(map: TileMap = STARTER_MAP): GameState {
  const player = createPlayer(PLAYER_START_X, PLAYER_START_Y);
  const footprints: Footprint[] = [];
  const dog = createDog();
  const throwers = createDrivewayThrowers();
  const snowballs: Snowball[] = [];
  const interactables = buildInteractables(throwers);

  return {
    map,
    player,
    footprints,
    dog,
    throwers,
    snowballs,
    interactables,
    nearbyInteractable: null,
    activeDialogue: null,
    elapsedTime: 0,
  };
}

/**
 * Resets the map state when Santa takes damage (from a snowball, the sparking EV wire, or the loving dog):
 * - Teleports Santa back to the bottom of the driveway facing up
 * - Starts Santa's blinking timer
 * - Resets the dog, snowball throwers, footprints, and flying snowballs
 */
export function resetAfterSnowballHit(state: GameState): void {
  state.player.x = PLAYER_START_X;
  state.player.y = PLAYER_START_Y;
  state.player.facing = 'up';
  state.player.isMoving = false;
  state.player.walkTimer = 0;
  state.player.blinkTimer = HIT_BLINK_DURATION_SECONDS;
  state.player.footprintSpawnTimer = 0;
  state.player.nextFootprintFoot = 'left';

  state.footprints = [];
  state.dog = createDog();
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
  state.elapsedTime += dtSeconds;
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

  // Update snow footprints (spawns on snow tiles only and fades out over 3 seconds)
  updateFootprints(state.footprints, state.player, state.map, dtSeconds);

  // Check if Santa stepped on the visibly damaged, sparking EV charging cable
  if (rectsIntersect(state.player, DAMAGED_WIRE_HAZARD)) {
    resetAfterSnowballHit(state);
    return;
  }

  // Update the dog on the east snow field
  const caughtByDog = updateDog(
    state.dog,
    state.player,
    dtSeconds,
    state.map,
    state.throwers
  );
  if (caughtByDog) {
    resetAfterSnowballHit(state);
    return;
  }

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
