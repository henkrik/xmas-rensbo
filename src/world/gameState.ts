import { debugLog } from '../core/debugConsole';
import { consumeActionPress, InputState } from '../core/input';
import { updateCat } from '../entities/cat';
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
  DialogueState,
  findNearbyInteractable,
  Interactable,
} from './interaction';
import { LevelBasement } from './levels/levelBasement';
import {
  ClimbingState,
  createMotorcycle,
  LevelOutside,
  MotorcycleState,
  MotorcycleStatus,
} from './levels/levelOutside';
import { LevelUpstairs } from './levels/levelUpstairs';
import { GameLevel, LevelId, LevelTransitionContext } from './levels/types';
import {
  CLIMB_DURATION_SECONDS,
  DAMAGED_WIRE_HAZARD,
  ELECTROCUTION_DURATION_SECONDS,
  LADDER_BOTTOM_Y,
  LADDER_CLIMB_X,
  MOTORCYCLE_CRASH_X,
  MOTORCYCLE_SPEED,
  MOTORCYCLE_START_Y,
  PLAYER_START_X,
  PLAYER_START_Y,
  ROOF_MAX_X,
  ROOF_MIN_X,
  ROOF_WALK_Y,
  STARTER_MAP,
  TileMap,
} from './tilemap';

export { createMotorcycle };
export type { ClimbingState, MotorcycleState, MotorcycleStatus };

export interface LevelRegistry {
  'level-outside': LevelOutside;
  'level-basement': LevelBasement;
  'level-upstairs': LevelUpstairs;
}

export interface GameState {
  currentLevelId: LevelId;
  levels: LevelRegistry;
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
  joystickActive: boolean;
  interactables: Interactable[];
  nearbyInteractable: Interactable | null;
  activeDialogue: DialogueState | null;
  elapsedTime: number;
  debugMode: boolean;
}

function syncOutsideToLevel(state: GameState): void {
  const outside = state.levels['level-outside'];
  outside.dog = state.dog;
  outside.motorcycle = state.motorcycle;
  outside.throwers = state.throwers;
  outside.snowballs = state.snowballs;
  outside.hasLadder = state.hasLadder;
  outside.ladderPlaced = state.ladderPlaced;
  outside.isOnRoof = state.isOnRoof;
  outside.climbing = state.climbing;
  outside.electrocutionTimer = state.electrocutionTimer;
}

function syncLevelToOutside(state: GameState): void {
  const outside = state.levels['level-outside'];
  state.dog = outside.dog;
  state.motorcycle = outside.motorcycle;
  state.throwers = outside.throwers;
  state.snowballs = outside.snowballs;
  state.hasLadder = outside.hasLadder;
  state.ladderPlaced = outside.ladderPlaced;
  state.isOnRoof = outside.isOnRoof;
  state.climbing = outside.climbing;
  state.electrocutionTimer = outside.electrocutionTimer;
}

export function getActiveLevel(state: GameState): GameLevel {
  return state.levels[state.currentLevelId];
}

export function refreshInteractables(state: GameState): void {
  if (state.currentLevelId === 'level-outside') {
    syncOutsideToLevel(state);
  }
  const activeLevel = getActiveLevel(state);
  state.interactables = activeLevel.getInteractables();

  const isBusyOutside =
    state.currentLevelId === 'level-outside' &&
    (state.climbing !== null ||
      state.motorcycle.status === 'driving' ||
      state.electrocutionTimer > 0);

  const isBusyUpstairs =
    state.currentLevelId === 'level-upstairs' &&
    state.levels['level-upstairs'].rosannaCutscene?.active === true;

  state.nearbyInteractable =
    isBusyOutside || isBusyUpstairs
      ? null
      : findNearbyInteractable(state.player, state.interactables);
}

/**
 * Transitions the game to `levelId`, preserving the persistent `state.player`
 * (and `state.player.states` Map), spawning the player at the level's entry point,
 * and logging `"Loaded level: <levelId>"` to the debug console.
 */
export function loadLevel(state: GameState, levelId: LevelId): void {
  if (state.currentLevelId === 'level-outside') {
    state.isOnRoof = false;
    state.climbing = null;
    syncOutsideToLevel(state);
  }

  state.currentLevelId = levelId;
  const nextLevel = state.levels[levelId];
  state.map = nextLevel.map;
  state.footprints = [];
  state.nearbyInteractable = null;
  state.activeDialogue = null;

  nextLevel.enter(state.player);
  refreshInteractables(state);
  debugLog(`Loaded level: ${levelId}`);
}

export interface CreateGameStateOptions {
  map?: TileMap;
  isMobile?: boolean;
  showIntroDialogue?: boolean;
  initialLevelId?: LevelId;
  debug?: boolean;
}

/**
 * Parses the `?level=X` URL query parameter, mapping:
 * - 'outdoors' / 'outside' / 'level-outside' -> 'level-outside' (default)
 * - 'basement' / 'level-basement' -> 'level-basement'
 * - 'upstairs' / 'level-upstairs' -> 'level-upstairs'
 *
 * Accepts either the entire search string (e.g. `window.location.search`)
 * or the raw parameter value (e.g. `new URLSearchParams(location.search).get('level')`).
 */
export function parseLevelQueryParam(
  searchOrParam: string | null | undefined
): LevelId {
  if (!searchOrParam) {
    return 'level-outside';
  }
  let val = searchOrParam.trim();
  if (val.startsWith('?')) {
    const params = new URLSearchParams(val);
    val = params.get('level') ?? '';
  }
  const normalized = val.toLowerCase().trim();
  if (normalized === 'basement' || normalized === 'level-basement') {
    return 'level-basement';
  }
  if (normalized === 'upstairs' || normalized === 'level-upstairs') {
    return 'level-upstairs';
  }
  if (
    normalized === 'outdoors' ||
    normalized === 'outside' ||
    normalized === 'level-outside'
  ) {
    return 'level-outside';
  }
  return 'level-outside';
}

export function createIntroDialogue(isMobile: boolean): DialogueState {
  const firstLine = isMobile
    ? 'Use the virtual joystick to move around. To interact with things, move close enough to it and an interaction button will appear. Click anywhere to close this window and start playing.'
    : 'Use the arrow keys to move around and Z to interact. Press Z to close this window and start playing.';

  return {
    lines: [firstLine, 'Good luck!\nChristmas depends on you...'],
    currentIndex: 0,
  };
}

export function createGameState(
  mapOrOptions: TileMap | CreateGameStateOptions = STARTER_MAP
): GameState {
  let map: TileMap = STARTER_MAP;
  let isMobile = false;
  let showIntroDialogue = false;
  let initialLevelId: LevelId = 'level-outside';
  let debugMode = false;

  if (mapOrOptions && 'cols' in mapOrOptions && 'rows' in mapOrOptions) {
    map = mapOrOptions as TileMap;
  } else if (mapOrOptions && typeof mapOrOptions === 'object') {
    const opts = mapOrOptions as CreateGameStateOptions;
    if (opts.map) map = opts.map;
    if (opts.isMobile !== undefined) isMobile = opts.isMobile;
    if (opts.showIntroDialogue !== undefined) {
      showIntroDialogue = opts.showIntroDialogue;
    }
    if (opts.initialLevelId) {
      initialLevelId = opts.initialLevelId;
    }
    if (opts.debug !== undefined) {
      debugMode = opts.debug;
    }
  }

  const player = createPlayer(PLAYER_START_X, PLAYER_START_Y);
  const levelOutside = new LevelOutside(map);
  const levelBasement = new LevelBasement();
  const levelUpstairs = new LevelUpstairs();

  const levels: LevelRegistry = {
    'level-outside': levelOutside,
    'level-basement': levelBasement,
    'level-upstairs': levelUpstairs,
  };

  const activeLevel = levels[initialLevelId];
  activeLevel.enter(player);

  const state: GameState = {
    currentLevelId: initialLevelId,
    levels,
    map: activeLevel.map,
    player,
    footprints: [],
    dog: levelOutside.dog,
    motorcycle: levelOutside.motorcycle,
    throwers: levelOutside.throwers,
    snowballs: levelOutside.snowballs,
    hasLadder: levelOutside.hasLadder,
    ladderPlaced: levelOutside.ladderPlaced,
    isOnRoof: levelOutside.isOnRoof,
    climbing: levelOutside.climbing,
    electrocutionTimer: levelOutside.electrocutionTimer,
    joystickActive: false,
    interactables: activeLevel.getInteractables(),
    nearbyInteractable: null,
    activeDialogue: showIntroDialogue ? createIntroDialogue(isMobile) : null,
    elapsedTime: 0,
    debugMode,
  };

  debugLog(`Loaded level: ${initialLevelId}`);
  return state;
}

/**
 * Resets the outdoor map state when Santa takes damage (from a snowball, the sparking EV wire, or the loving dog):
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
  syncOutsideToLevel(state);
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
  if (input.moveVector) {
    dx = input.moveVector.x;
  } else {
    if (input.left) dx -= 1;
    if (input.right) dx += 1;
  }

  player.y = ROOF_WALK_Y;

  if (Math.abs(dx) < 0.001) {
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

function updateOutsideLevel(
  state: GameState,
  input: InputState,
  dtSeconds: number
): boolean {
  // If Santa is currently being electrocuted on the sparking wire
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
    return true;
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
    return true;
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
    return true;
  }

  if (state.isOnRoof) {
    updateRoofMovement(state.player, input, dtSeconds);
    for (let i = state.footprints.length - 1; i >= 0; i--) {
      state.footprints[i].age += dtSeconds;
      if (state.footprints[i].age >= state.footprints[i].maxAge) {
        state.footprints.splice(i, 1);
      }
    }
    return false;
  }

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
    return true;
  }

  // Update the dog on the east snow field (constant half-speed across all platforms)
  const caughtByDog = updateDog(
    state.dog,
    state.player,
    dtSeconds,
    state.map,
    solidObstacles
  );
  if (caughtByDog) {
    resetAfterSnowballHit(state);
    return true;
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
    return true;
  }

  return false;
}

export function updateGameState(
  state: GameState,
  input: InputState,
  dtSeconds: number
): void {
  const safeDt = Math.max(0, dtSeconds);
  state.elapsedTime += safeDt;
  dtSeconds = safeDt;
  const zPressed = consumeActionPress(input);

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
        const onClose = state.activeDialogue.onClose;
        state.activeDialogue = null;
        if (onClose) {
          onClose();
        }
      }
    }
    return;
  }

  const transitionCtx: LevelTransitionContext = {
    loadLevel: (nextId: LevelId) => loadLevel(state, nextId),
    openDialogue: (lines: string[], onClose?: () => void) => {
      state.activeDialogue = { lines, currentIndex: 0, onClose };
    },
  };

  if (state.currentLevelId === 'level-outside') {
    const handledEarly = updateOutsideLevel(state, input, dtSeconds);
    if (handledEarly) {
      return;
    }
  } else if (state.currentLevelId === 'level-basement') {
    const basement = state.levels['level-basement'];
    const movementLocked = basement.updateCutscene(
      dtSeconds,
      state.player,
      transitionCtx
    );
    if (movementLocked) {
      refreshInteractables(state);
      return;
    }
    updatePlayer(
      state.player,
      input,
      dtSeconds,
      basement.map,
      basement.getSolidObstacles()
    );
  } else if (state.currentLevelId === 'level-upstairs') {
    const upstairs = state.levels['level-upstairs'];
    // Check if the Kitchen Rosanna cutscene is active or just triggered
    const movementLocked = upstairs.updateCutscene(
      dtSeconds,
      state.player,
      transitionCtx
    );
    if (movementLocked) {
      refreshInteractables(state);
      return;
    }
    updatePlayer(
      state.player,
      input,
      dtSeconds,
      upstairs.map,
      upstairs.getSolidObstacles()
    );
    // Update the black cat in the extra room
    updateCat(
      upstairs.cat,
      state.player,
      dtSeconds,
      upstairs.map,
      upstairs.getSolidObstacles()
    );
    // Re-check right after moving in case this step crossed into the kitchen
    if (upstairs.updateCutscene(0, state.player, transitionCtx)) {
      refreshInteractables(state);
      return;
    }
  }

  // Check if Santa is close enough to an interactable object to show the Z prompt
  refreshInteractables(state);

  // If the player clicked with mouse/finger, check if they clicked near the interactable object
  let pointerInteracted = false;
  if (pointerClick && state.nearbyInteractable) {
    const b = state.nearbyInteractable.bounds;
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
    const target = state.nearbyInteractable;
    if (state.currentLevelId === 'level-outside') {
      syncOutsideToLevel(state);
    }

    const activeLevel = getActiveLevel(state);
    const prevLevelId = state.currentLevelId;
    const handledByLevel = activeLevel.handleInteraction(
      target.id,
      state.player,
      transitionCtx
    );

    if (handledByLevel) {
      if (
        prevLevelId === 'level-outside' &&
        state.currentLevelId === 'level-outside'
      ) {
        syncLevelToOutside(state);
      }
      refreshInteractables(state);
    } else if (target.dialogueLines.length > 0) {
      state.activeDialogue = {
        lines: target.dialogueLines,
        currentIndex: 0,
      };
    }
  }
}
