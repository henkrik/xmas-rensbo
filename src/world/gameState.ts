import { consumeActionPress, InputState } from '../core/input';
import { createDog, Dog, updateDog } from '../entities/dog';
import {
  createPlayer,
  Footprint,
  Player,
  Rect,
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
  CLIMB_DURATION_SECONDS,
  DAMAGED_WIRE_HAZARD,
  ELECTROCUTION_DURATION_SECONDS,
  LADDER_BOTTOM_Y,
  LADDER_CLIMB_X,
  MOTORCYCLE_CRASH_X,
  MOTORCYCLE_SPEED,
  MOTORCYCLE_START_X,
  MOTORCYCLE_START_Y,
  PLAYER_START_X,
  PLAYER_START_Y,
  ROOF_MAX_X,
  ROOF_MIN_X,
  ROOF_WALK_Y,
  STARTER_MAP,
  TILE_SIZE,
  TileMap,
} from './tilemap';

export interface ClimbingState {
  direction: 'up' | 'down';
  progress: number;
}

export type MotorcycleStatus = 'parked' | 'driving' | 'crashed';

export interface MotorcycleState extends Rect {
  status: MotorcycleStatus;
}

export function createMotorcycle(): MotorcycleState {
  return {
    x: MOTORCYCLE_START_X,
    y: MOTORCYCLE_START_Y,
    width: TILE_SIZE * 2,
    height: TILE_SIZE,
    status: 'parked',
  };
}

export interface GameState {
  map: TileMap;
  player: Player;
  footprints: Footprint[];
  dog: Dog;
  motorcycle: MotorcycleState;
  throwers: SnowballThrower[];
  snowballs: Snowball[];
  hasLadder: boolean;
  ladderPlaced: boolean;
  isOnRoof: boolean;
  climbing: ClimbingState | null;
  electrocutionTimer: number;
  interactables: Interactable[];
  nearbyInteractable: Interactable | null;
  activeDialogue: DialogueState | null;
  elapsedTime: number;
}

function refreshInteractables(state: GameState): void {
  state.interactables = buildInteractables(state.throwers, {
    hasLadder: state.hasLadder,
    ladderPlaced: state.ladderPlaced,
    isOnRoof: state.isOnRoof,
    motorcycleStatus: state.motorcycle.status,
  });
  state.nearbyInteractable =
    state.climbing ||
    state.motorcycle.status === 'driving' ||
    state.electrocutionTimer > 0
      ? null
      : findNearbyInteractable(state.player, state.interactables);
}

export function createGameState(map: TileMap = STARTER_MAP): GameState {
  const player = createPlayer(PLAYER_START_X, PLAYER_START_Y);
  const footprints: Footprint[] = [];
  const dog = createDog();
  const motorcycle = createMotorcycle();
  const throwers = createDrivewayThrowers();
  const snowballs: Snowball[] = [];
  const interactables = buildInteractables(throwers, {
    hasLadder: false,
    ladderPlaced: false,
    isOnRoof: false,
    motorcycleStatus: motorcycle.status,
  });

  return {
    map,
    player,
    footprints,
    dog,
    motorcycle,
    throwers,
    snowballs,
    hasLadder: false,
    ladderPlaced: false,
    isOnRoof: false,
    climbing: null,
    electrocutionTimer: 0,
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
 * - Resets the dog, motorcycle, ladder state, snowball throwers, footprints, and flying snowballs
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
  state.motorcycle = createMotorcycle();
  state.throwers = createDrivewayThrowers();
  state.snowballs = [];
  state.hasLadder = false;
  state.ladderPlaced = false;
  state.isOnRoof = false;
  state.climbing = null;
  state.electrocutionTimer = 0;
  state.activeDialogue = null;
  refreshInteractables(state);
}

function updateRoofMovement(
  player: Player,
  input: InputState,
  dtSeconds: number
): void {
  if (player.blinkTimer > 0) {
    player.blinkTimer = Math.max(0, player.blinkTimer - dtSeconds);
  }

  // On the roof, Santa can only walk west (left) or east (right); north/south movement is disabled
  let dx = 0;
  if (input.left) dx -= 1;
  if (input.right) dx += 1;

  player.y = ROOF_WALK_Y;

  if (dx === 0) {
    player.isMoving = false;
    player.walkTimer = 0;
    return;
  }

  player.isMoving = true;
  player.walkTimer += dtSeconds;
  player.facing = dx < 0 ? 'left' : 'right';

  const nextX = player.x + dx * player.speed * dtSeconds;
  player.x = Math.max(ROOF_MIN_X, Math.min(ROOF_MAX_X, nextX));
}

export function updateGameState(
  state: GameState,
  input: InputState,
  dtSeconds: number
): void {
  const safeDt = Math.max(0, dtSeconds);
  state.elapsedTime += safeDt;
  dtSeconds = safeDt;
  let zPressed = consumeActionPress(input);

  // Consume any pointer/touch click
  const pointerClick = input.pointerClick;
  if (pointerClick) {
    input.pointerClick = null;
  }

  // If a dialogue box is currently open, pressing Z or clicking the screen advances or closes it
  if (state.activeDialogue) {
    state.player.isMoving = false;
    if (zPressed || pointerClick) {
      state.activeDialogue.currentIndex += 1;
      if (
        state.activeDialogue.currentIndex >= state.activeDialogue.lines.length
      ) {
        state.activeDialogue = null;
      }
    }
    return;
  }

  // If Santa is currently being electrocuted on the sparking wire (3-second cartoony skeleton animation)
  if (state.electrocutionTimer > 0) {
    state.player.isMoving = false;
    state.player.walkTimer = 0;
    state.electrocutionTimer = Math.max(
      0,
      state.electrocutionTimer - dtSeconds
    );
    if (state.electrocutionTimer <= 0) {
      resetAfterSnowballHit(state);
    }
    return;
  }

  // If Santa is riding the motorcycle straight east into the trees
  if (state.motorcycle.status === 'driving') {
    state.motorcycle.x = Math.min(
      MOTORCYCLE_CRASH_X,
      state.motorcycle.x + MOTORCYCLE_SPEED * dtSeconds
    );
    state.player.x = state.motorcycle.x + 8;
    state.player.y = state.motorcycle.y - 2;
    state.player.facing = 'right';
    state.player.isMoving = true;
    state.player.walkTimer += dtSeconds;

    if (state.motorcycle.x >= MOTORCYCLE_CRASH_X) {
      state.motorcycle.x = MOTORCYCLE_CRASH_X;
      state.motorcycle.status = 'crashed';
      // Spawn Santa right next to the crashed motorcycle, blinking, without resetting the map!
      state.player.x = MOTORCYCLE_CRASH_X - state.player.width - 4;
      state.player.y = MOTORCYCLE_START_Y + 2;
      state.player.isMoving = false;
      state.player.walkTimer = 0;
      state.player.blinkTimer = HIT_BLINK_DURATION_SECONDS;
    }

    refreshInteractables(state);
    return;
  }

  // If Santa is currently sliding up or down the ladder
  if (state.climbing) {
    state.climbing.progress = Math.min(
      1,
      state.climbing.progress + dtSeconds / CLIMB_DURATION_SECONDS
    );
    state.player.x = LADDER_CLIMB_X;
    state.player.isMoving = true;
    state.player.walkTimer += dtSeconds;

    if (state.climbing.direction === 'up') {
      state.player.facing = 'up';
      state.player.y =
        LADDER_BOTTOM_Y +
        (ROOF_WALK_Y - LADDER_BOTTOM_Y) * state.climbing.progress;
      if (state.climbing.progress >= 1) {
        state.player.y = ROOF_WALK_Y;
        state.player.isMoving = false;
        state.isOnRoof = true;
        state.climbing = null;
      }
    } else {
      state.player.facing = 'down';
      state.player.y =
        ROOF_WALK_Y +
        (LADDER_BOTTOM_Y - ROOF_WALK_Y) * state.climbing.progress;
      if (state.climbing.progress >= 1) {
        state.player.y = LADDER_BOTTOM_Y;
        state.player.isMoving = false;
        state.isOnRoof = false;
        state.climbing = null;
      }
    }

    refreshInteractables(state);
    return;
  }

  if (state.isOnRoof) {
    updateRoofMovement(state.player, input, dtSeconds);
    // Continue aging any existing footprints on the snow below
    for (let i = state.footprints.length - 1; i >= 0; i--) {
      state.footprints[i].age += dtSeconds;
      if (state.footprints[i].age >= state.footprints[i].maxAge) {
        state.footprints.splice(i, 1);
      }
    }
  } else {
    const solidObstacles: Rect[] = [...state.throwers, state.motorcycle];

    // Move player on the ground
    updatePlayer(state.player, input, dtSeconds, state.map, solidObstacles);

    // Update snow footprints (spawns on snow tiles only and fades out over 3 seconds)
    updateFootprints(state.footprints, state.player, state.map, dtSeconds);

    // Check if Santa stepped on the visibly damaged, sparking EV charging cable
    if (rectsIntersect(state.player, DAMAGED_WIRE_HAZARD)) {
      state.electrocutionTimer = ELECTROCUTION_DURATION_SECONDS;
      state.player.isMoving = false;
      state.player.walkTimer = 0;
      state.nearbyInteractable = null;
      state.activeDialogue = null;
      return;
    }

    // Update the dog on the east snow field
    const caughtByDog = updateDog(
      state.dog,
      state.player,
      dtSeconds,
      state.map,
      solidObstacles
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
  }

  // Check if Santa is close enough to an interactable object to show the Z prompt
  refreshInteractables(state);

  // If the player clicked with mouse/finger, check if they clicked near the interactable object
  let pointerInteracted = false;
  if (pointerClick && state.nearbyInteractable) {
    const b = state.nearbyInteractable.bounds;
    // Allow clicking anywhere near the object (within 24px of bounds)
    const clickMargin = 24;
    const clickedNearObject =
      pointerClick.worldX >= b.x - clickMargin &&
      pointerClick.worldX <= b.x + b.width + clickMargin &&
      pointerClick.worldY >= b.y - clickMargin &&
      pointerClick.worldY <= b.y + b.height + clickMargin;

    if (clickedNearObject) {
      pointerInteracted = true;
    }
  }

  if ((zPressed || pointerInteracted) && state.nearbyInteractable) {
    const id = state.nearbyInteractable.id;
    if (id === 'motorcycle') {
      state.motorcycle.status = 'driving';
      state.player.x = state.motorcycle.x + 8;
      state.player.y = state.motorcycle.y - 2;
      state.player.facing = 'right';
      state.player.isMoving = true;
      state.nearbyInteractable = null;
    } else if (id === 'ground-ladder') {
      state.hasLadder = true;
      refreshInteractables(state);
    } else if (id === 'house-west-place-ladder') {
      state.hasLadder = false;
      state.ladderPlaced = true;
      refreshInteractables(state);
    } else if (id === 'house-west-climb-ladder') {
      state.climbing = { direction: 'up', progress: 0 };
      state.player.x = LADDER_CLIMB_X;
      state.player.y = LADDER_BOTTOM_Y;
      state.player.facing = 'up';
      state.nearbyInteractable = null;
    } else if (id === 'roof-ladder') {
      state.climbing = { direction: 'down', progress: 0 };
      state.player.x = LADDER_CLIMB_X;
      state.player.y = ROOF_WALK_Y;
      state.player.facing = 'down';
      state.nearbyInteractable = null;
    } else if (id === 'roof-chimney') {
      // Placeholder: "Z: Climb down chimney" does nothing for now
    } else if (state.nearbyInteractable.dialogueLines.length > 0) {
      state.activeDialogue = {
        lines: state.nearbyInteractable.dialogueLines,
        currentIndex: 0,
      };
    }
  }
}
