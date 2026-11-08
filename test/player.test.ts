import { describe, expect, it } from 'vitest';
import {
  CAT_RETRIGGER_FLEE_DISTANCE,
  CAT_START_X,
  CAT_START_Y,
  EXTRA_ROOM_BOUNDS,
} from '../src/entities/cat';
import { debugConsole, debugLog } from '../src/core/debugConsole';
import {
  applyKeyEvent,
  computeViewportLayout,
  createEmptyInput,
  createVirtualJoystick,
} from '../src/core/input';
import {
  DOG_AGGRO_DISTANCE,
  DOG_DEAGGRO_DISTANCE,
  DOG_START_X,
  DOG_START_Y,
} from '../src/entities/dog';
import {
  createPlayer,
  FOOTPRINT_DURATION_SECONDS,
  updatePlayer,
} from '../src/entities/player';
import { ConeOfSight, LineOfSight } from '../src/entities/sight';
import { HIT_BLINK_DURATION_SECONDS } from '../src/entities/snowball';
import { drawPixelText, measurePixelText } from '../src/rendering/pixelFont';
import { wrapTextLines } from '../src/rendering/renderer';
import {
  createGameState,
  loadLevel,
  parseLevelQueryParam,
  resetAfterSnowballHit,
  updateGameState,
} from '../src/world/gameState';
import {
  BASEMENT_BATHROOM_DOOR_BOUNDS,
  BASEMENT_FIREPLACE_SPAWN,
  BASEMENT_FRONT_DOOR_BOUNDS,
  BASEMENT_HALL_NORTH_DOOR_BOUNDS,
  BASEMENT_STAIRS_SPAWN,
  BASEMENT_STAIRS_TRIGGER_BOUNDS,
  LevelBasement,
  USED_STAIRS_STATE_KEY,
} from '../src/world/levels/levelBasement';
import {
  ARJAN_KEY_STATE_KEY,
  KITCHEN_ROSANNA_STATE_KEY,
  KITCHEN_TRIGGER_BOUNDS,
  LevelUpstairs,
  UPSTAIRS_ALBIN_START_Y,
  UPSTAIRS_BEDROOM_DOOR_BOUNDS,
  UPSTAIRS_BEDROOM_HIDDEN_MASK,
  UPSTAIRS_COMPUTER_BOUNDS,
  UPSTAIRS_CUPBOARD_BOUNDS,
  UPSTAIRS_OFFICE_DOOR_BOUNDS,
  UPSTAIRS_OFFICE_HIDDEN_MASK,
  UPSTAIRS_SHOWER_DOOR_BOUNDS,
  UPSTAIRS_STAIRS_SPAWN,
  UPSTAIRS_STAIRS_TRIGGER_BOUNDS,
  UPSTAIRS_TABLE_ROOM_DOOR_BOUNDS,
  UPSTAIRS_TABLE_ROOM_HIDDEN_MASKS,
} from '../src/world/levels/levelUpstairs';
import {
  LevelPeople,
  PEOPLE_NAMES,
  PEOPLE_PLAYER_SPAWN,
} from '../src/world/levels/levelPeople';
import {
  CLIMB_DURATION_SECONDS,
  DAMAGED_WIRE_HAZARD,
  ELECTROCUTION_DURATION_SECONDS,
  GROUND_LADDER_BOUNDS,
  HOUSE_DOOR_COL,
  HOUSE_DOOR_ROW,
  HOUSE_WEST_LADDER_SPOT,
  LADDER_BOTTOM_Y,
  MAP_COLS,
  MAP_ROWS,
  MOTORCYCLE_CRASH_X,
  MOTORCYCLE_START_X,
  MOTORCYCLE_START_Y,
  PLAYER_START_X,
  PLAYER_START_Y,
  ROOF_MAX_X,
  ROOF_MIN_X,
  ROOF_WALK_Y,
  STARTER_MAP,
  TILE_SIZE,
  TileType,
} from '../src/world/tilemap';

describe('Player walking & 2x Rensbo map layout', () => {
  it('uses a 32x28 map (2x width and height) with a large 13x7 main house and parked black motorcycle', () => {
    expect(MAP_COLS).toBe(32);
    expect(MAP_ROWS).toBe(28);
    expect(STARTER_MAP.tiles.length).toBe(28);
    expect(STARTER_MAP.tiles[0].length).toBe(32);

    // Verify the main house spans cols 4..16 (13 tiles wide) and rows 3..9 (7 tiles tall)
    expect(STARTER_MAP.tiles[3][4]).toBe(TileType.RoofDark);
    expect(STARTER_MAP.tiles[3][16]).toBe(TileType.RoofDark);
    expect(STARTER_MAP.tiles[HOUSE_DOOR_ROW][HOUSE_DOOR_COL]).toBe(
      TileType.HouseDoor
    );

    // Verify the black motorcycle is parked on the right side of the electric car, outside the red-door shed
    expect(STARTER_MAP.tiles[21][25]).toBe(TileType.Motorcycle);
    expect(STARTER_MAP.tiles[21][26]).toBe(TileType.Motorcycle);
  });

  it('moves the player in all four directions using arrow keys', () => {
    const player = createPlayer(PLAYER_START_X, PLAYER_START_Y);
    const input = createEmptyInput();

    // Walk up the gravel road
    const startY = player.y;
    applyKeyEvent(input, 'ArrowUp', true);
    updatePlayer(player, input, 0.2, STARTER_MAP);
    expect(player.y).toBeLessThan(startY);
    expect(player.facing).toBe('up');
    expect(player.isMoving).toBe(true);
    applyKeyEvent(input, 'ArrowUp', false);

    // Walk right
    const startX = player.x;
    applyKeyEvent(input, 'ArrowRight', true);
    updatePlayer(player, input, 0.2, STARTER_MAP);
    expect(player.x).toBeGreaterThan(startX);
    expect(player.facing).toBe('right');
    applyKeyEvent(input, 'ArrowRight', false);

    // Stop moving when keys are released
    updatePlayer(player, input, 0.2, STARTER_MAP);
    expect(player.isMoving).toBe(false);
  });

  it('leaves footprints on snow tiles (but not road tiles) that fade after 3 seconds', () => {
    const state = createGameState();
    const input = createEmptyInput();

    // Walk up on the gravel road (TileType.Road) -> no footprints should be left
    input.up = true;
    updateGameState(state, input, 0.2);
    expect(state.footprints.length).toBe(0);

    // Move Santa onto the snow lawn on the left (col 10, row 16 -> TileType.Snow) and walk
    state.player.x = 10 * TILE_SIZE;
    state.player.y = 16 * TILE_SIZE;
    updateGameState(state, input, 0.2);
    expect(state.footprints.length).toBeGreaterThan(0);
    expect(state.footprints[0].maxAge).toBe(FOOTPRINT_DURATION_SECONDS);

    // Stop walking and advance just under 3 seconds -> footprint is still visible (fading)
    input.up = false;
    updateGameState(state, input, 2.5);
    expect(state.footprints.length).toBeGreaterThan(0);

    // Advance past 3.0 seconds total -> footprints completely fade out and are removed
    updateGameState(state, input, 0.6);
    expect(state.footprints.length).toBe(0);
  });

  it('allows walking straight up the driveway to the main house when not hit by a snowball', () => {
    const player = createPlayer(13 * TILE_SIZE + 2, PLAYER_START_Y);
    const input = createEmptyInput();
    input.up = true;

    // Walk straight up for 4 seconds to reach the main house door at row 9
    for (let i = 0; i < 80; i++) {
      updatePlayer(player, input, 0.05, STARTER_MAP);
    }

    // Player should stop at row 10 right in front of the house door (row 9, col 13)
    const finalRow = Math.floor(player.y / TILE_SIZE);
    expect(finalRow).toBe(10);
  });

  it('resets the map and makes Santa blink when hit by a snowball on the driveway', () => {
    const state = createGameState();
    const input = createEmptyInput();

    // Place Santa directly in the snowball throwers' line of fire on the driveway (row 16, col 15)
    state.player.x = 15 * TILE_SIZE;
    state.player.y = 16 * TILE_SIZE + 2;

    // Advance time in small steps until a thrown snowball crosses the driveway and hits Santa
    for (let i = 0; i < 40; i++) {
      updateGameState(state, input, 0.05);
      if (state.player.blinkTimer > 0) {
        break;
      }
    }

    // Santa should be reset to the starting position at the bottom of the road and blinking
    expect(state.player.x).toBe(PLAYER_START_X);
    expect(state.player.y).toBe(PLAYER_START_Y);
    expect(state.player.blinkTimer).toBe(HIT_BLINK_DURATION_SECONDS);
    expect(state.snowballs.length).toBe(0);
  });

  it('plays a 1.25-second electrocution animation before resetting the map and making Santa blink when stepping on the sparking EV charging wire', () => {
    const state = createGameState();
    const input = createEmptyInput();

    // Verify the electric car is parked on the driveway at cols 17..19, rows 21..22
    expect(STARTER_MAP.tiles[21][17]).toBe(TileType.ElectricCar);
    expect(STARTER_MAP.tiles[22][19]).toBe(TileType.ElectricCar);

    // Position Santa just below the damaged sparking section of the charging wire and walk up into it
    state.player.x = DAMAGED_WIRE_HAZARD.x;
    state.player.y = DAMAGED_WIRE_HAZARD.y + DAMAGED_WIRE_HAZARD.height + 2;
    input.up = true;

    updateGameState(state, input, 0.1);

    // Santa should enter the 1.25-second electrocution animation right at the wire before the map resets
    expect(state.electrocutionTimer).toBe(ELECTROCUTION_DURATION_SECONDS);
    expect(state.player.y).not.toBe(PLAYER_START_Y);

    // Partway through the 1.25-second electrocution animation, Santa is still being zapped at the wire
    updateGameState(state, input, 0.6);
    expect(state.electrocutionTimer).toBeCloseTo(0.65, 5);
    expect(state.player.y).not.toBe(PLAYER_START_Y);

    // Once the full 1.25 seconds complete, the map resets and Santa spawns at the start blinking
    updateGameState(state, input, 0.65);
    expect(state.electrocutionTimer).toBe(0);
    expect(state.player.x).toBe(PLAYER_START_X);
    expect(state.player.y).toBe(PLAYER_START_Y);
    expect(state.player.blinkTimer).toBe(HIT_BLINK_DURATION_SECONDS);
  });

  it('has a dog on the east snow field that waits, chases with red hearts when close, can be dodged or blocked, and resets Santa if caught', () => {
    const state = createGameState();
    const input = createEmptyInput();

    // Dog starts in waiting mode on the east snow field between the guest cottages and red-door shed
    expect(state.dog.x).toBe(DOG_START_X);
    expect(state.dog.y).toBe(DOG_START_Y);
    expect(state.dog.mode).toBe('waiting');
    expect(state.dog.hearts.length).toBe(0);

    // Move Santa within aggro distance on the east snow field
    state.player.x = DOG_START_X - (DOG_AGGRO_DISTANCE - 16);
    state.player.y = DOG_START_Y;
    updateGameState(state, input, 0.1);

    expect(state.dog.mode).toBe('chasing');
    expect(state.dog.hearts.length).toBeGreaterThan(0);
    // Gradual acceleration: after 0.1s the dog is moving toward Santa but hasn't hit maxSpeed yet
    expect(state.dog.vx).toBeLessThan(0);
    expect(Math.abs(state.dog.vx)).toBeLessThan(state.dog.maxSpeed);

    // Move Santa far away (beyond de-aggro distance) -> dog returns to waiting mode and decelerates
    state.player.x = DOG_START_X - (DOG_DEAGGRO_DISTANCE + 32);
    updateGameState(state, input, 0.1);
    expect(state.dog.mode).toBe('waiting');

    // Now place Santa close to the dog and stand still -> dog accelerates and inevitably catches Santa
    state.dog.x = DOG_START_X;
    state.dog.y = DOG_START_Y;
    state.dog.vx = 0;
    state.dog.vy = 0;
    state.player.x = DOG_START_X - 48;
    state.player.y = DOG_START_Y;

    for (let i = 0; i < 40; i++) {
      updateGameState(state, input, 0.05);
      if (state.player.blinkTimer > 0) {
        break;
      }
    }

    expect(state.player.x).toBe(PLAYER_START_X);
    expect(state.player.y).toBe(PLAYER_START_Y);
    expect(state.player.blinkTimer).toBe(HIT_BLINK_DURATION_SECONDS);
    expect(state.dog.mode).toBe('waiting');
  });

  it('supports inspecting the west house spot, picking up the ladder next to the dog, placing & climbing it to the roof, and walking east/west between ladder and chimney', () => {
    const state = createGameState();
    const input = createEmptyInput();

    // 1. Before acquiring the ladder, the snow-free spot on the west side of the house shows "Inspect"
    state.player.x = HOUSE_WEST_LADDER_SPOT.x + 2;
    state.player.y = HOUSE_WEST_LADDER_SPOT.y + 4;
    updateGameState(state, input, 0.01);
    expect(state.nearbyInteractable?.promptText).toBe('Inspect');

    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);
    expect(state.activeDialogue?.lines[0]).toBe(
      "Hmm.. looks like there is a chimney up there, but I can't reach it"
    );

    // Close the inspection dialogue
    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);
    expect(state.activeDialogue).toBeNull();

    // 2. Walk over the ladder on the ground next to the dog (non-colliding) and pick it up with "Pick up"
    state.dog.x = 29 * TILE_SIZE; // keep dog slightly to the right while testing pickup
    state.player.x = GROUND_LADDER_BOUNDS.x;
    state.player.y = GROUND_LADDER_BOUNDS.y;
    input.right = true;
    updateGameState(state, input, 0.05);
    input.right = false;
    // Verify Santa moved freely over the ground ladder without collision
    expect(state.player.x).toBeGreaterThan(GROUND_LADDER_BOUNDS.x);
    expect(state.nearbyInteractable?.promptText).toBe('Pick up');

    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);
    expect(state.hasLadder).toBe(true);
    expect(state.nearbyInteractable).toBeNull();

    // 3. Return to the west side of the main house -> "Place ladder"
    state.player.x = HOUSE_WEST_LADDER_SPOT.x + 2;
    state.player.y = HOUSE_WEST_LADDER_SPOT.y + 4;
    updateGameState(state, input, 0.01);
    expect(state.nearbyInteractable?.promptText).toBe('Place ladder');

    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);
    expect(state.hasLadder).toBe(false);
    expect(state.ladderPlaced).toBe(true);
    expect(state.nearbyInteractable?.promptText).toBe('Climb ladder');

    // 4. Press Z to climb the ladder -> Santa slides up onto the roof
    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);
    expect(state.climbing).not.toBeNull();
    expect(state.climbing?.direction).toBe('up');

    // Advance partway through the climb -> Santa is sliding upward
    updateGameState(state, input, CLIMB_DURATION_SECONDS * 0.5);
    expect(state.player.y).toBeLessThan(LADDER_BOTTOM_Y);
    expect(state.player.y).toBeGreaterThan(ROOF_WALK_Y);

    // Finish climbing onto the roof
    updateGameState(state, input, CLIMB_DURATION_SECONDS * 0.6);
    expect(state.climbing).toBeNull();
    expect(state.isOnRoof).toBe(true);
    expect(state.player.y).toBe(ROOF_WALK_Y);
    expect(state.nearbyInteractable?.promptText).toBe('Climb down ladder');

    // 5. On the roof, Santa cannot walk north or south
    input.up = true;
    updateGameState(state, input, 0.2);
    input.up = false;
    expect(state.player.y).toBe(ROOF_WALK_Y);

    input.down = true;
    updateGameState(state, input, 0.2);
    input.down = false;
    expect(state.player.y).toBe(ROOF_WALK_Y);

    // 6. Walk east along the roof to the chimney -> "Climb down chimney"
    input.right = true;
    for (let i = 0; i < 60; i++) {
      updateGameState(state, input, 0.05);
    }
    input.right = false;
    expect(state.player.x).toBe(ROOF_MAX_X);
    expect(state.nearbyInteractable?.promptText).toBe('Climb down chimney');

    // 7. Walk west back to the ladder and climb down first
    input.left = true;
    for (let i = 0; i < 60; i++) {
      updateGameState(state, input, 0.05);
    }
    input.left = false;
    expect(state.player.x).toBe(ROOF_MIN_X);
    expect(state.nearbyInteractable?.promptText).toBe('Climb down ladder');

    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);
    expect(state.climbing?.direction).toBe('down');

    updateGameState(state, input, CLIMB_DURATION_SECONDS + 0.05);
    expect(state.climbing).toBeNull();
    expect(state.isOnRoof).toBe(false);
    expect(state.player.y).toBe(LADDER_BOTTOM_Y);

    // 8. Climb back up to the roof, walk to the chimney, and press Z to enter level-basement!
    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);
    updateGameState(state, input, CLIMB_DURATION_SECONDS + 0.05);
    expect(state.isOnRoof).toBe(true);

    input.right = true;
    for (let i = 0; i < 60; i++) {
      updateGameState(state, input, 0.05);
    }
    input.right = false;
    expect(state.nearbyInteractable?.promptText).toBe('Climb down chimney');

    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);
    expect(state.currentLevelId).toBe('level-basement');
    expect(state.player.x).toBe(BASEMENT_FIREPLACE_SPAWN.x);
    expect(state.player.y).toBe(BASEMENT_FIREPLACE_SPAWN.y);
  });

  it('lets Santa "Z: drive" the motorcycle east into the trees where it crashes and Santa spawns next to it blinking without resetting the map', () => {
    const state = createGameState();
    const input = createEmptyInput();

    // Suppose Santa already picked up the ladder (to verify the map state does not reset on crash!)
    state.hasLadder = true;

    // Position Santa just above the parked motorcycle (cols 25..26, row 20)
    state.player.x = MOTORCYCLE_START_X + 4;
    state.player.y = MOTORCYCLE_START_Y - state.player.height - 2;

    updateGameState(state, input, 0.01);
    expect(state.nearbyInteractable?.promptText).toBe('Drive');

    // Press Z to drive the motorcycle
    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);

    expect(state.motorcycle.status).toBe('driving');

    // Advance partway -> motorcycle and Santa drive east
    updateGameState(state, input, 0.15);
    expect(state.motorcycle.x).toBeGreaterThan(MOTORCYCLE_START_X);
    expect(state.motorcycle.x).toBeLessThan(MOTORCYCLE_CRASH_X);

    // Advance until it hits the eastern trees and crashes
    for (let i = 0; i < 20; i++) {
      updateGameState(state, input, 0.05);
      if (state.motorcycle.status === 'crashed') {
        break;
      }
    }

    expect(state.motorcycle.status).toBe('crashed');
    expect(state.motorcycle.x).toBe(MOTORCYCLE_CRASH_X);
    // Santa spawns next to the crashed motorcycle blinking, and the map does NOT reset
    expect(state.player.x).toBe(MOTORCYCLE_CRASH_X - state.player.width - 4);
    expect(state.player.y).toBe(MOTORCYCLE_START_Y + 2);
    expect(state.player.blinkTimer).toBe(HIT_BLINK_DURATION_SECONDS);
    expect(state.hasLadder).toBe(true);
    expect(state.nearbyInteractable).toBeNull();
  });

  it('shows "Talk to Sylvester" and "Talk to Annelotte" near the snowball throwers with portraits and dialogue', () => {
    const state = createGameState();
    const input = createEmptyInput();

    // 1. Position Santa right below the left snowball thrower (Sylvester)
    const sylvester = state.throwers[0];
    state.player.x = sylvester.x;
    state.player.y = sylvester.y + sylvester.height + 2;

    updateGameState(state, input, 0.01);
    expect(state.nearbyInteractable).not.toBeNull();
    expect(state.nearbyInteractable?.promptText).toBe('Talk to Sylvester');
    expect(state.nearbyInteractable?.speakerPortrait).toBe('Sylvester');

    // Press Z to talk to Sylvester
    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);

    expect(state.activeDialogue).not.toBeNull();
    expect(state.activeDialogue?.speakerPortrait).toBe('Sylvester');
    expect(state.activeDialogue?.lines[state.activeDialogue.currentIndex]).toBe(
      'Watch out! Annelotte is crazy!'
    );

    // Press Z again to close the single-line dialogue
    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);

    expect(state.activeDialogue).toBeNull();

    // 2. Position Santa right below the right snowball thrower (Annelotte)
    const annelotte = state.throwers[1];
    state.player.x = annelotte.x;
    state.player.y = annelotte.y + annelotte.height + 2;

    updateGameState(state, input, 0.01);
    expect(state.nearbyInteractable).not.toBeNull();
    expect(state.nearbyInteractable?.promptText).toBe('Talk to Annelotte');
    expect(state.nearbyInteractable?.speakerPortrait).toBe('Annelotte');

    // Press Z to talk to Annelotte
    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);

    expect(state.activeDialogue).not.toBeNull();
    expect(state.activeDialogue?.speakerPortrait).toBe('Annelotte');
    expect(state.activeDialogue?.lines[state.activeDialogue.currentIndex]).toBe(
      "It's good to talk about your feelings... how does a snowball in your face feel?"
    );

    // Press Z again to close the dialogue
    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);

    expect(state.activeDialogue).toBeNull();
  });

  it('shows "Open door" at the main house door and advances through the two dialogue lines with Z', () => {
    const state = createGameState();
    const input = createEmptyInput();

    // Position Santa right in front of the house door (col 13, row 10, just below row 9 door)
    state.player.x = HOUSE_DOOR_COL * TILE_SIZE + 2;
    state.player.y = (HOUSE_DOOR_ROW + 1) * TILE_SIZE + 2;

    updateGameState(state, input, 0.01);
    expect(state.nearbyInteractable).not.toBeNull();
    expect(state.nearbyInteractable?.promptText).toBe('Open door');

    // Press Z to try opening the locked door
    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);

    expect(state.activeDialogue).not.toBeNull();
    expect(state.activeDialogue?.lines[state.activeDialogue.currentIndex]).toBe(
      "It's locked."
    );

    // Press Z again -> Santa responds "There has to be another way into the house..."
    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);

    expect(state.activeDialogue).not.toBeNull();
    expect(state.activeDialogue?.lines[state.activeDialogue.currentIndex]).toBe(
      'There has to be another way into the house...'
    );

    // Press Z a third time -> closes the dialogue box
    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);

    expect(state.activeDialogue).toBeNull();
  });

  it('clamps negative dtSeconds on cached tab refresh so elapsedTime never goes negative', () => {
    const state = createGameState();
    const input = createEmptyInput();

    updateGameState(state, input, -0.004);
    expect(state.elapsedTime).toBeGreaterThanOrEqual(0);
  });

  it('allows mobile pointer clicks to interact with nearby objects and advance dialogue', () => {
    const state = createGameState();
    const input = createEmptyInput();

    // Position Santa right in front of the house door
    state.player.x = HOUSE_DOOR_COL * TILE_SIZE + 2;
    state.player.y = (HOUSE_DOOR_ROW + 1) * TILE_SIZE + 2;

    updateGameState(state, input, 0.01);
    expect(state.nearbyInteractable?.id).toBe('house-door');

    // Click near the door with touch/mouse
    input.pointerClick = {
      worldX: HOUSE_DOOR_COL * TILE_SIZE + 6,
      worldY: HOUSE_DOOR_ROW * TILE_SIZE + 6,
    };

    updateGameState(state, input, 0.01);
    expect(state.activeDialogue).not.toBeNull();
    expect(state.activeDialogue?.lines[0]).toBe("It's locked.");

    // Click anywhere on screen to advance dialogue
    input.pointerClick = { worldX: 100, worldY: 100 };
    updateGameState(state, input, 0.01);
    expect(state.activeDialogue?.currentIndex).toBe(1);

    // Click again to close dialogue
    input.pointerClick = { worldX: 100, worldY: 100 };
    updateGameState(state, input, 0.01);
    expect(state.activeDialogue).toBeNull();
  });

  it('keeps dog max speed at half-speed (37 px/s) on both keyboard and joystick mode', () => {
    const state = createGameState();
    const input = createEmptyInput();

    // Aggro dog on east snow field
    state.dog.x = DOG_START_X;
    state.dog.y = DOG_START_Y;
    state.player.x = DOG_START_X - (DOG_AGGRO_DISTANCE - 16);
    state.player.y = DOG_START_Y;

    // Normal keyboard mode
    state.joystickActive = false;
    for (let i = 0; i < 20; i++) {
      updateGameState(state, input, 0.05);
      expect(Math.abs(state.dog.vx)).toBeLessThanOrEqual(37.01);
    }
    expect(Math.abs(state.dog.vx)).toBeGreaterThan(30);

    // Reset and test in Joystick mode
    state.dog.x = DOG_START_X;
    state.dog.y = DOG_START_Y;
    state.dog.vx = 0;
    state.dog.vy = 0;
    state.player.x = DOG_START_X - (DOG_AGGRO_DISTANCE - 16);
    state.player.y = DOG_START_Y;
    state.joystickActive = true;

    for (let i = 0; i < 20; i++) {
      updateGameState(state, input, 0.05);
      expect(Math.abs(state.dog.vx)).toBeLessThanOrEqual(37.01);
    }
    expect(Math.abs(state.dog.vx)).toBeGreaterThan(30);
  });

  it('shows desktop and mobile tutorial dialogues on initial load and clears them on reset', () => {
    // Desktop initial state
    const desktopState = createGameState({ isMobile: false, showIntroDialogue: true });
    expect(desktopState.activeDialogue).not.toBeNull();
    expect(desktopState.activeDialogue?.lines[0]).toBe(
      'Use the arrow keys to move around and Z to interact. Press Z to close this window and start playing.'
    );
    expect(desktopState.activeDialogue?.lines[1]).toBe(
      'Good luck!\nChristmas depends on you...'
    );
    expect(desktopState.activeDialogue?.currentIndex).toBe(0);

    const input = createEmptyInput();
    // Press Z to advance to line 2
    input.actionJustPressed = true;
    updateGameState(desktopState, input, 0.016);
    expect(desktopState.activeDialogue?.currentIndex).toBe(1);

    // Press Z again to close dialogue
    input.actionJustPressed = true;
    updateGameState(desktopState, input, 0.016);
    expect(desktopState.activeDialogue).toBeNull();

    // Mobile initial state
    const mobileState = createGameState({ isMobile: true, showIntroDialogue: true });
    expect(mobileState.activeDialogue).not.toBeNull();
    expect(mobileState.activeDialogue?.lines[0]).toBe(
      'Use the virtual joystick to move around. To interact with things, move close enough to it and an interaction button will appear. Click anywhere to close this window and start playing.'
    );
    expect(mobileState.activeDialogue?.lines[1]).toBe(
      'Good luck!\nChristmas depends on you...'
    );

    // Click anywhere to advance to line 2
    input.pointerClick = { worldX: 100, worldY: 100 };
    updateGameState(mobileState, input, 0.016);
    expect(mobileState.activeDialogue?.currentIndex).toBe(1);

    // Click anywhere again to close dialogue
    input.pointerClick = { worldX: 100, worldY: 100 };
    updateGameState(mobileState, input, 0.016);
    expect(mobileState.activeDialogue).toBeNull();

    // When damage reset occurs, activeDialogue must remain null (not reset to intro dialogue)
    resetAfterSnowballHit(mobileState);
    expect(mobileState.activeDialogue).toBeNull();
  });

  it('breaks dialogue lines on explicit newline characters', () => {
    const mockCtx = {
      measureText: (str: string) => ({ width: str.length * 6 }),
    } as unknown as CanvasRenderingContext2D;

    const wrapped = wrapTextLines(
      mockCtx,
      'Good luck!\nChristmas depends on you...',
      220
    );

    expect(wrapped).toEqual(['Good luck!', 'Christmas depends on you...']);
  });

  it('slides slippery against obstacles when colliding at subtle angles', () => {
    // Place Santa right next to the left wall of the main house (house starts at col 4)
    // House wall is col 4 -> x = 4 * 16 = 64. Santa width = 12.
    // Santa at x = 52, y = 140 (house door is row 9 = 144, wall at 140)
    const player = createPlayer(52, 140);
    const input = createEmptyInput();

    // Player moves mostly right into the house wall, but slightly down (e.g. angle ~11 degrees)
    // dx = 0.98, dy = 0.20
    input.moveVector = { x: 0.98, y: 0.2 };

    const initialY = player.y;
    // Update player for several frames
    for (let i = 0; i < 10; i++) {
      updatePlayer(player, input, 0.05, STARTER_MAP);
    }

    // Santa is blocked in X by the house wall (cannot move past x = 52)
    expect(player.x).toBeLessThanOrEqual(52.01);
    // Santa slid downwards in Y along the wall rather than being completely stuck!
    expect(player.y).toBeGreaterThan(initialY);
  });

  it('provides analog moveVector with [0, 1] clamped speed scaling', () => {
    const input = createEmptyInput();
    const listeners: Record<string, (e: unknown) => void> = {};
    const container = {
      getBoundingClientRect: () => ({ left: 100, top: 100, width: 200, height: 200 }),
      addEventListener: (evt: string, cb: (e: unknown) => void) => { listeners[evt] = cb; },
      removeEventListener: () => {},
      style: {},
    } as unknown as HTMLElement;
    const stick = { style: { transform: '' } } as unknown as HTMLElement;

    createVirtualJoystick({ container, stick, input });

    // Center is (200, 200). maxRadius is 200/2 * 0.72 = 72.

    // 1. Move halfway (dx = 36, dy = 0) -> intensity = 36 / 72 = 0.5 (50% speed)
    listeners['pointerdown']?.({
      pointerId: 1,
      clientX: 236,
      clientY: 200,
      preventDefault: () => {},
    });
    expect(input.right).toBe(true);
    expect(input.moveVector).not.toBeNull();
    expect(input.moveVector?.x).toBeCloseTo(0.5, 2);
    expect(input.moveVector?.y).toBe(0);

    // 2. Move at max border (dx = 72, dy = 0) -> intensity = 1.0 (100% speed)
    listeners['pointerdown']?.({
      pointerId: 1,
      clientX: 272,
      clientY: 200,
      preventDefault: () => {},
    });
    expect(input.moveVector?.x).toBeCloseTo(1.0, 2);

    // 3. Move FAR outside (dx = 300, dy = 0) -> intensity must stay 1.0 (100% speed), NOT slow down!
    listeners['pointerdown']?.({
      pointerId: 1,
      clientX: 500,
      clientY: 200,
      preventDefault: () => {},
    });
    expect(input.moveVector?.x).toBeCloseTo(1.0, 2);

    // 4. Subtle angle (dx = 100, dy = 10) outside circle: maintains 100% speed and subtle Y deflection
    listeners['pointerdown']?.({
      pointerId: 1,
      clientX: 300,
      clientY: 210,
      preventDefault: () => {},
    });
    expect(input.right).toBe(true);
    expect(input.down).toBe(true);
    expect(input.moveVector?.x).toBeGreaterThan(0.95);
    expect(input.moveVector?.y).toBeGreaterThan(0.05);
  });

  it('renders unaliased integer pixels with drop shadow via pixel font', () => {
    const filledRects: Array<{ x: number; y: number; w: number; h: number; color: string }> = [];
    let curColor = '';

    const mockCtx = {
      save: () => {},
      restore: () => {},
      set fillStyle(val: string) { curColor = val; },
      fillRect: (x: number, y: number, w: number, h: number) => {
        filledRects.push({ x, y, w, h, color: curColor });
      },
    } as unknown as CanvasRenderingContext2D;

    drawPixelText(mockCtx, 'Hi!', 10, 20, '#ffffff', '#000000');

    expect(filledRects.length).toBeGreaterThan(0);
    // Every pixel must be exact 1x1 integer pixels (completely unaliased)
    for (const r of filledRects) {
      expect(Number.isInteger(r.x)).toBe(true);
      expect(Number.isInteger(r.y)).toBe(true);
      expect(r.w).toBe(1);
      expect(r.h).toBe(1);
      expect(['#ffffff', '#000000']).toContain(r.color);
    }

    // Width measurement is proportional and positive
    expect(measurePixelText('Hi!')).toBeGreaterThan(0);
    expect(measurePixelText('W')).toBeGreaterThan(measurePixelText('I'));
  });

  it('recomputes layout across portrait and landscape orientations so everything fits and centers', () => {
    // 1. Mobile Portrait (390x844)
    const portrait = computeViewportLayout(390, 844);
    expect(portrait.isLandscape).toBe(false);
    expect(portrait.containerWidth).toBe(390);
    expect(portrait.containerHeight).toBe(844);
    expect(portrait.canvasWidth).toBeLessThanOrEqual(390 - 24);
    expect(portrait.canvasHeight).toBeLessThanOrEqual(844 - 24);
    // Joystick is horizontally centered and bottom-aligned in portrait
    expect(portrait.joystickSize).toBe(195);
    expect(portrait.joystickLeft).toBe(Math.round((390 - 195) / 2));
    expect(portrait.joystickTop).toBe(844 - 195);
    expect(portrait.actionBtnLeft).toBe(20);
    expect(portrait.actionBtnBottom).toBe(24);
    expect(portrait.actionBtnTop).toBeNull();

    // 2. Rotate to Mobile Landscape (844x390)
    const landscape = computeViewportLayout(844, 390);
    expect(landscape.isLandscape).toBe(true);
    expect(landscape.containerWidth).toBe(844);
    expect(landscape.containerHeight).toBe(390);
    expect(landscape.canvasWidth).toBeLessThanOrEqual(844 - 24);
    expect(landscape.canvasHeight).toBeLessThanOrEqual(390 - 24);
    // Joystick is aligned to the right of the long side and vertically centered in landscape
    expect(landscape.joystickSize).toBe(195);
    expect(landscape.joystickLeft).toBe(844 - 195);
    expect(landscape.joystickTop).toBe(Math.round((390 - 195) / 2));
    // Action button is on the left of the long side, vertically centered
    expect(landscape.actionBtnLeft).toBe(20);
    expect(landscape.actionBtnTop).toBe(Math.round(390 / 2));
    expect(landscape.actionBtnBottom).toBeNull();
    // 3. Stale browser dimensions during rotation animation (axes swapped relative to orientation)
    // Mobile rotates to landscape, but browser still reports 390x844:
    const staleLandscape = computeViewportLayout(390, 844, true);
    expect(staleLandscape.isLandscape).toBe(true);
    expect(staleLandscape.containerWidth).toBe(844);
    expect(staleLandscape.containerHeight).toBe(390);
    expect(staleLandscape.joystickLeft).toBe(844 - 195);
    expect(staleLandscape.joystickTop).toBe(Math.round((390 - 195) / 2));

    // Mobile rotates to portrait, but browser still reports 844x390:
    const stalePortrait = computeViewportLayout(844, 390, false);
    expect(stalePortrait.isLandscape).toBe(false);
    expect(stalePortrait.containerWidth).toBe(390);
    expect(stalePortrait.containerHeight).toBe(844);
    expect(stalePortrait.joystickLeft).toBe(Math.round((390 - 195) / 2));
    expect(stalePortrait.joystickTop).toBe(844 - 195);
  });

  it('supports level-basement mechanics: fireplace spawn, locked doors, openable bathroom door, stairs transition, and persistent player.states', () => {
    const state = createGameState({ initialLevelId: 'level-basement' });
    const input = createEmptyInput();

    // 1. Player starts with a Map in `player.states` and spawns next to the fireplace in the library
    expect(state.player.states).toBeInstanceOf(Map);
    expect(state.currentLevelId).toBe('level-basement');
    expect(state.player.x).toBe(BASEMENT_FIREPLACE_SPAWN.x);
    expect(state.player.y).toBe(BASEMENT_FIREPLACE_SPAWN.y);

    // 2. Both locked doors in the basement hallway show "It's locked."
    state.player.x = BASEMENT_HALL_NORTH_DOOR_BOUNDS.x + 2;
    state.player.y = BASEMENT_HALL_NORTH_DOOR_BOUNDS.y + TILE_SIZE + 2;
    updateGameState(state, input, 0.01);
    expect(state.nearbyInteractable?.id).toBe('basement-hall-north-door');

    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);
    expect(state.activeDialogue?.lines[0]).toBe("It's locked.");

    // Close dialogue
    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);
    expect(state.activeDialogue).toBeNull();

    // Check front door on south wall of hallway
    state.player.x = BASEMENT_FRONT_DOOR_BOUNDS.x + 2;
    state.player.y = BASEMENT_FRONT_DOOR_BOUNDS.y - state.player.height - 2;
    updateGameState(state, input, 0.01);
    expect(state.nearbyInteractable?.id).toBe('basement-front-door');

    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);
    expect(state.activeDialogue?.lines[0]).toBe("It's locked.");

    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);

    // 3. Bathroom door is initially closed and collidable (blocks walking into bathroom)
    state.player.x = BASEMENT_BATHROOM_DOOR_BOUNDS.x + 2;
    state.player.y = BASEMENT_BATHROOM_DOOR_BOUNDS.y + TILE_SIZE + 1;
    input.up = true;
    updateGameState(state, input, 0.2);
    input.up = false;
    // Blocked by closed bathroom door at row 9 (y = 9 * 16 = 144 -> player stops at y = 160)
    expect(state.player.y).toBeGreaterThanOrEqual(
      BASEMENT_BATHROOM_DOOR_BOUNDS.y + BASEMENT_BATHROOM_DOOR_BOUNDS.height - 0.01
    );
    expect(state.nearbyInteractable?.id).toBe('basement-bathroom-door');
    expect(state.nearbyInteractable?.promptText).toBe('Open door');

    // Open the bathroom door -> deletes the door and triggers toilet cutscene
    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);
    expect(state.levels['level-basement'].doors.length).toBe(0);

    // Toilet cutscene is active, locking player movement while exclamation mark blinks
    const basement = state.levels['level-basement'] as LevelBasement;
    expect(basement.toiletCutscene?.active).toBe(true);
    input.up = true;
    updateGameState(state, input, 0.35);
    input.up = false;
    expect(state.player.isMoving).toBe(false);

    // Advance 2 seconds -> dialogue opens
    updateGameState(state, input, 2.0);
    expect(state.activeDialogue).not.toBeNull();
    expect(state.activeDialogue?.lines[0]).toBe(
      "What are you doing here?? I know you see me when I'm sleeping but this is not okay."
    );
    expect(state.activeDialogue?.speakerPortrait).toBe('Hanneloes');

    // Close dialogue with KeyZ -> reloads level-basement and triggers damage blink
    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);
    expect(state.activeDialogue).toBeNull();
    expect(state.currentLevelId).toBe('level-basement');
    expect(state.player.blinkTimer).toBeGreaterThan(0);

    // Now that the event triggered, door remains open and player can walk around
    state.player.x = BASEMENT_BATHROOM_DOOR_BOUNDS.x + 2;
    state.player.y = BASEMENT_BATHROOM_DOOR_BOUNDS.y + TILE_SIZE + 1;
    input.up = true;
    updateGameState(state, input, 0.35);
    input.up = false;
    expect(state.player.y).toBeLessThan(BASEMENT_BATHROOM_DOOR_BOUNDS.y);

    // 4. Walk halfway up the stairs -> collide with invisible box & interact with "Walk upstairs"
    state.player.x = BASEMENT_STAIRS_TRIGGER_BOUNDS.x - state.player.width - 1;
    state.player.y = BASEMENT_STAIRS_TRIGGER_BOUNDS.y + 8;
    input.right = true;
    updateGameState(state, input, 0.2);
    input.right = false;
    expect(state.player.x).toBeLessThanOrEqual(
      BASEMENT_STAIRS_TRIGGER_BOUNDS.x - state.player.width + 0.01
    );
    expect(state.nearbyInteractable?.id).toBe('basement-stairs-up');
    expect(state.nearbyInteractable?.promptText).toBe('Walk upstairs');

    // Press Z to walk upstairs -> records `usedStairs` in `player.states` and loads `level-upstairs`
    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);
    expect(state.currentLevelId).toBe('level-upstairs');
    expect(state.player.states.get(USED_STAIRS_STATE_KEY)).toBe(true);
    expect(state.player.x).toBe(UPSTAIRS_STAIRS_SPAWN.x);
    expect(state.player.y).toBe(UPSTAIRS_STAIRS_SPAWN.y);

    // 5. Walk back downstairs from `level-upstairs` -> spawns Santa on the stairs in `level-basement` (not by the fireplace!)
    state.player.x = UPSTAIRS_STAIRS_TRIGGER_BOUNDS.x + 8;
    state.player.y = UPSTAIRS_STAIRS_TRIGGER_BOUNDS.y - state.player.height - 1;
    updateGameState(state, input, 0.01);
    expect(state.nearbyInteractable?.id).toBe('upstairs-stairs-down');
    expect(state.nearbyInteractable?.promptText).toBe('Walk downstairs');

    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);
    expect(state.currentLevelId).toBe('level-basement');
    expect(state.player.x).toBe(BASEMENT_STAIRS_SPAWN.x);
    expect(state.player.y).toBe(BASEMENT_STAIRS_SPAWN.y);
  });

  it('supports level-upstairs closed doors, open hallway to extra room, and the one-time Kitchen Rosanna Santa cutscene', () => {
    const state = createGameState({ initialLevelId: 'level-upstairs' });
    const input = createEmptyInput();
    const upstairs = state.levels['level-upstairs'];

    // 1. Shower, Bedroom, Office, and Table Room doors start closed
    expect(upstairs.doors.map((d) => d.id)).toEqual([
      'upstairs-shower-door',
      'upstairs-bedroom-door',
      'upstairs-office-door',
      'upstairs-table-room-door',
    ]);

    // Fog-of-war masks validation:
    // Office fog-of-war covers the southern wall (rows 14..18 -> height: 5 tiles)
    const officeDoor = upstairs.doors.find((d) => d.id === 'upstairs-office-door')!;
    expect(officeDoor.hiddenRegions[0].height).toBe(5 * TILE_SIZE);
    expect(officeDoor.hiddenRegions[0]).toEqual(UPSTAIRS_OFFICE_HIDDEN_MASK);

    // Bedroom fog-of-war covers the eastern wall (cols 21..28 -> width: 8 tiles)
    const bedroomDoor = upstairs.doors.find((d) => d.id === 'upstairs-bedroom-door')!;
    expect(bedroomDoor.hiddenRegions[0].width).toBe(8 * TILE_SIZE);
    expect(bedroomDoor.hiddenRegions[0]).toEqual(UPSTAIRS_BEDROOM_HIDDEN_MASK);

    // Table Room fog-of-war:
    // West wall fog starts at row 18 (row 17 west corner uncovered)
    // East wall fog starts at row 19 (row 18 east corner uncovered)
    const tableRoomDoor = upstairs.doors.find((d) => d.id === 'upstairs-table-room-door')!;
    expect(tableRoomDoor.hiddenRegions).toEqual(UPSTAIRS_TABLE_ROOM_HIDDEN_MASKS);
    expect(tableRoomDoor.hiddenRegions.length).toBe(3);

    // Opening office door without key gives locked dialogue:
    state.player.x = UPSTAIRS_OFFICE_DOOR_BOUNDS.x + 2;
    state.player.y = UPSTAIRS_OFFICE_DOOR_BOUNDS.y - 14;
    updateGameState(state, input, 0.01);
    expect(state.nearbyInteractable?.id).toBe('upstairs-office-door');
    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);
    expect(state.activeDialogue?.lines[0]).toBe(
      'The office is locked... hmm, where would Arjan hide a key?'
    );
    // Dismiss dialogue
    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);
    expect(upstairs.doors.some((d) => d.id === 'upstairs-office-door')).toBe(true);

    // Inspect cupboard next to dining table -> finds Arjan's key
    state.player.x = UPSTAIRS_CUPBOARD_BOUNDS.x + TILE_SIZE + 2;
    state.player.y = UPSTAIRS_CUPBOARD_BOUNDS.y + 4;
    updateGameState(state, input, 0.01);
    expect(state.nearbyInteractable?.id).toBe('upstairs-dining-cupboard');
    expect(state.nearbyInteractable?.promptText).toBe('Inspect');
    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);
    expect(state.activeDialogue?.lines[0]).toBe(
      "You found a hidden compartment containing a key... it's Arjan's key!"
    );
    expect(state.player.states.get(ARJAN_KEY_STATE_KEY)).toBe(true);
    // Dismiss dialogue
    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);

    // With the key, the office door opens
    state.player.x = UPSTAIRS_OFFICE_DOOR_BOUNDS.x + 2;
    state.player.y = UPSTAIRS_OFFICE_DOOR_BOUNDS.y - 14;
    updateGameState(state, input, 0.01);
    expect(state.nearbyInteractable?.id).toBe('upstairs-office-door');
    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);
    expect(upstairs.doors.some((d) => d.id === 'upstairs-office-door')).toBe(false);

    // Open other doors: shower, bedroom, table room
    for (const [doorId, bounds, offsetY] of [
      ['upstairs-shower-door', UPSTAIRS_SHOWER_DOOR_BOUNDS, TILE_SIZE + 2],
      ['upstairs-bedroom-door', UPSTAIRS_BEDROOM_DOOR_BOUNDS, TILE_SIZE + 2],
      ['upstairs-table-room-door', UPSTAIRS_TABLE_ROOM_DOOR_BOUNDS, -14],
    ] as const) {
      state.player.x = bounds.x + 2;
      state.player.y = bounds.y + offsetY;
      updateGameState(state, input, 0.01);
      expect(state.nearbyInteractable?.id).toBe(doorId);
      expect(state.nearbyInteractable?.promptText).toBe('Open door');

      applyKeyEvent(input, 'KeyZ', true);
      updateGameState(state, input, 0.01);
      applyKeyEvent(input, 'KeyZ', false);
    }

    expect(upstairs.doors.length).toBe(0);

    // Inspect PC in the office -> "Start PC" and 3 dialogue messages
    state.player.x = UPSTAIRS_COMPUTER_BOUNDS.x + 2;
    state.player.y = UPSTAIRS_COMPUTER_BOUNDS.y + TILE_SIZE + 2;
    updateGameState(state, input, 0.01);
    expect(state.nearbyInteractable?.id).toBe('upstairs-office-pc');
    expect(state.nearbyInteractable?.promptText).toBe('Start PC');

    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);
    expect(state.activeDialogue?.lines).toEqual([
      'Hmm... is this where Arjan pretends to work? It\'s just a bunch of pictures of Anne-Marie.',
      'Hey there\'s actually a python script here, shall we run it?',
      'You are now addicted to Olexa\'s text-based christmas adventure.',
    ]);
    expect(state.activeDialogue?.currentIndex).toBe(0);

    // Advance dialogue
    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);
    expect(state.activeDialogue?.currentIndex).toBe(1);

    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);
    expect(state.activeDialogue?.currentIndex).toBe(2);

    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);
    expect(state.activeDialogue).toBeNull();

    // 2. Hallway connects directly to the Extra Room on the east without any wall or door blocking it
    state.player.x = 23 * TILE_SIZE;
    state.player.y = 12 * TILE_SIZE;
    input.right = true;
    for (let i = 0; i < 20; i++) {
      updateGameState(state, input, 0.05);
    }
    input.right = false;
    expect(state.player.x).toBeGreaterThan(26 * TILE_SIZE);

    // 3. Walking into The Kitchen triggers the one-time Rosanna Santa event
    expect(state.player.states.get(KITCHEN_ROSANNA_STATE_KEY)).toBeUndefined();
    state.player.x = 13 * TILE_SIZE;
    state.player.y = KITCHEN_TRIGGER_BOUNDS.y + 8;
    updateGameState(state, input, 0.05);

    expect(state.player.states.get(KITCHEN_ROSANNA_STATE_KEY)).toBe(true);
    expect(upstairs.rosannaCutscene?.active).toBe(true);
    const initialOtherSantaX = upstairs.rosannaCutscene!.santaX;

    // While the other Santa runs west-to-east outside the north windows, the player cannot move
    const lockedPlayerX = state.player.x;
    const lockedPlayerY = state.player.y;
    input.left = true;
    input.down = true;
    updateGameState(state, input, 0.3);
    input.left = false;
    input.down = false;
    expect(state.player.x).toBe(lockedPlayerX);
    expect(state.player.y).toBe(lockedPlayerY);
    expect(upstairs.rosannaCutscene!.santaX).toBeGreaterThan(initialOtherSantaX);

    // Advance until the other Santa finishes running east and is out of sight
    for (let i = 0; i < 40; i++) {
      updateGameState(state, input, 0.05);
      if (!upstairs.rosannaCutscene) {
        break;
      }
    }

    expect(upstairs.rosannaCutscene).toBeNull();
    expect(state.activeDialogue).not.toBeNull();
    expect(state.activeDialogue?.lines[0]).toBe('... Rosanna???');

    // Close the "... Rosanna???" dialogue -> player regains control and can move again!
    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);
    expect(state.activeDialogue).toBeNull();

    input.down = true;
    updateGameState(state, input, 0.2);
    input.down = false;
    expect(state.player.y).toBeGreaterThan(lockedPlayerY);
    // Does not re-trigger on subsequent movement in the kitchen
    expect(upstairs.rosannaCutscene).toBeNull();
  });

  it('logs level transitions and custom messages via debugLog and DebugConsole', () => {
    debugConsole.clear();
    const state = createGameState();
    expect(debugConsole.getLines()).toContain('Loaded level: level-outside');

    loadLevel(state, 'level-basement');
    expect(debugConsole.getLines()).toContain('Loaded level: level-basement');

    loadLevel(state, 'level-upstairs');
    expect(debugConsole.getLines()).toContain('Loaded level: level-upstairs');

    debugLog('Custom debug test');
    expect(debugConsole.getLines()).toContain('Custom debug test');
  });

  it('supports overriding the starting level via ?level=X URL argument', () => {
    // 1. URL search parsing behavior
    expect(parseLevelQueryParam('?level=outdoors')).toBe('level-outside');
    expect(parseLevelQueryParam('?level=outside')).toBe('level-outside');
    expect(parseLevelQueryParam('?level=basement')).toBe('level-basement');
    expect(parseLevelQueryParam('?level=upstairs')).toBe('level-upstairs');
    expect(parseLevelQueryParam('?level=UNKNOWN')).toBe('level-outside');
    expect(parseLevelQueryParam('')).toBe('level-outside');
    expect(parseLevelQueryParam(null)).toBe('level-outside');
    expect(parseLevelQueryParam('basement')).toBe('level-basement');
    expect(parseLevelQueryParam('upstairs')).toBe('level-upstairs');
    expect(parseLevelQueryParam('outdoors')).toBe('level-outside');

    // 2. Starting at basement spawns at the fireplace
    const basementState = createGameState({
      initialLevelId: parseLevelQueryParam('?level=basement'),
      showIntroDialogue: false,
    });
    expect(basementState.currentLevelId).toBe('level-basement');
    expect(basementState.player.x).toBe(BASEMENT_FIREPLACE_SPAWN.x);
    expect(basementState.player.y).toBe(BASEMENT_FIREPLACE_SPAWN.y);

    // 3. Starting upstairs spawns at the staircase
    const upstairsState = createGameState({
      initialLevelId: parseLevelQueryParam('?level=upstairs'),
      showIntroDialogue: false,
    });
    expect(upstairsState.currentLevelId).toBe('level-upstairs');
    expect(upstairsState.player.x).toBe(UPSTAIRS_STAIRS_SPAWN.x);
    expect(upstairsState.player.y).toBe(UPSTAIRS_STAIRS_SPAWN.y);

    // 4. Player can walk freely along the hallway from the staircase
    const input = createEmptyInput();
    input.left = true;
    for (let i = 0; i < 20; i++) {
      updateGameState(upstairsState, input, 0.05);
    }
    input.left = false;
    expect(upstairsState.player.x).toBeLessThan(UPSTAIRS_STAIRS_SPAWN.x);
  });

  it('allows walking freely along row 5 north of the shortened dining table upstairs', () => {
    const state = createGameState({
      initialLevelId: 'level-upstairs',
      showIntroDialogue: false,
    });
    const input = createEmptyInput();

    // Start player at col 3, row 5
    state.player.x = 3 * TILE_SIZE;
    state.player.y = 5 * TILE_SIZE;

    // Walk east across row 5 all the way to col 8 past the table (cols 4..5, rows 6..9)
    input.right = true;
    for (let i = 0; i < 30; i++) {
      updateGameState(state, input, 0.05);
    }
    input.right = false;

    expect(state.player.x).toBeGreaterThan(7 * TILE_SIZE);
    expect(Math.round(state.player.y)).toBe(5 * TILE_SIZE);
  });

  it('initializes debugMode based on options and supports basement toilet/dog bowl collision updates', () => {
    const normalState = createGameState();
    expect(normalState.debugMode).toBe(false);

    const debugState = createGameState({ debug: true });
    expect(debugState.debugMode).toBe(true);

    const basement = debugState.levels['level-basement'];
    // Col 21, Row 9 is the toilet on the east wall (solid)
    expect(basement.map.tiles[9][21]).toBe(TileType.FurnitureSolid);

    // Col 18, Row 14 is the dog bowl tile (walkable StoneTileFloor)
    expect(basement.map.tiles[14][18]).toBe(TileType.StoneTileFloor);
  });

  it('updates the upstairs altar alcove walls and kitchen entrance walkability', () => {
    const state = createGameState({
      initialLevelId: 'level-upstairs',
      showIntroDialogue: false,
    });
    const upstairs = state.levels['level-upstairs'];

    // Row 9 (north & northwest & northeast of altar): cols 9..12 are wall tiles
    expect(upstairs.map.tiles[9][9]).toBe(TileType.InteriorWall);
    expect(upstairs.map.tiles[9][10]).toBe(TileType.InteriorWall);
    expect(upstairs.map.tiles[9][11]).toBe(TileType.InteriorWall);
    expect(upstairs.map.tiles[9][12]).toBe(TileType.InteriorWall);

    // Row 10: col 12 (east of altar) is a wall tile
    expect(upstairs.map.tiles[10][12]).toBe(TileType.InteriorWall);
    // Altar itself at cols 10..11, row 10
    expect(upstairs.map.tiles[10][10]).toBe(TileType.FurnitureSolid);
    expect(upstairs.map.tiles[10][11]).toBe(TileType.FurnitureSolid);

    // Kitchen entrance is 2 tiles wide at cols 13..14
    expect(upstairs.map.tiles[10][13]).toBe(TileType.WoodFloor);
    expect(upstairs.map.tiles[10][14]).toBe(TileType.WoodFloor);
    expect(upstairs.map.tiles[9][13]).toBe(TileType.WoodFloor);
    expect(upstairs.map.tiles[9][14]).toBe(TileType.WoodFloor);

    // Walking up through the kitchen entrance from hallway (row 11) to kitchen (row 8)
    const input = createEmptyInput();
    state.player.x = 13.5 * TILE_SIZE;
    state.player.y = 11 * TILE_SIZE;
    input.up = true;
    for (let i = 0; i < 20; i++) {
      updateGameState(state, input, 0.05);
    }
    input.up = false;
    expect(state.player.y).toBeLessThan(9 * TILE_SIZE);
  });

  it('manages black cat AI in the extra room: starts standing still, flees when player enters room, stops when > 5 tiles, reflee when <= 2 tiles, cannot cross walls', () => {
    const state = createGameState({
      initialLevelId: 'level-upstairs',
      showIntroDialogue: false,
    });
    const input = createEmptyInput();
    const upstairs = state.levels['level-upstairs'];
    const cat = upstairs.cat;

    // 1. Initial position near extra room window, standing still, not activated
    expect(cat.x).toBe(CAT_START_X);
    expect(cat.y).toBe(CAT_START_Y);
    expect(cat.mode).toBe('standing');
    expect(cat.hasBeenActivated).toBe(false);

    // Player walking in hallway outside extra room does not activate the cat
    state.player.x = 22 * TILE_SIZE;
    state.player.y = 12 * TILE_SIZE;
    updateGameState(state, input, 0.1);
    expect(cat.mode).toBe('standing');
    expect(cat.hasBeenActivated).toBe(false);

    debugConsole.clear();

    // 2. Player enters the extra room -> cat enters "flee" mode and flees away from player
    state.player.x = EXTRA_ROOM_BOUNDS.x + 4;
    state.player.y = EXTRA_ROOM_BOUNDS.y + 4;
    updateGameState(state, input, 0.1);

    expect(cat.hasBeenActivated).toBe(true);
    expect(cat.mode).toBe('flee');
    expect(cat.vx).not.toBe(0);
    expect(debugConsole.getLines()).toContain('Cat state changed: standing -> flee');

    // 3. Cat runs away and cannot pass through outer east wall (col 28) or south wall (row 18)
    for (let i = 0; i < 40; i++) {
      updateGameState(state, input, 0.05);
    }
    // Cat ran and stayed within map bounds without walking through walls
    expect(cat.x).toBeLessThan(28 * TILE_SIZE);
    expect(cat.y).toBeLessThan(18 * TILE_SIZE);
    expect(
      debugConsole.getLines().some((line) => line.startsWith('Cat wall force changed:'))
    ).toBe(true);

    // 4. If player moves far away (> 5 tiles distance from cat), cat goes back to "standing still"
    state.player.x = 10 * TILE_SIZE;
    state.player.y = 10 * TILE_SIZE;
    // Advance enough time for cat deceleration to bring velocity to 0
    for (let i = 0; i < 30; i++) {
      updateGameState(state, input, 0.05);
    }
    expect(cat.mode).toBe('standing');
    expect(cat.vx).toBe(0);
    expect(cat.vy).toBe(0);
    expect(debugConsole.getLines()).toContain('Cat state changed: flee -> standing');
    expect(cat.wallForceDirX).toBe(0);
    expect(cat.wallForceDirY).toBe(0);

    // 5. If player approaches within 2 tiles distance, cat enters "flee" mode again
    state.player.x = cat.x - (CAT_RETRIGGER_FLEE_DISTANCE - 4);
    state.player.y = cat.y;
    updateGameState(state, input, 0.05);
    expect(cat.mode).toBe('flee');
    expect(cat.vx).not.toBe(0);
    expect(debugConsole.getLines()).toContain('Cat state changed: standing -> flee');
  });

  it('calculates LineOfSight and ConeOfSight bounding boxes and triggers detection callbacks', () => {
    // 1. LineOfSight unit test without map:
    // Starts at (100, 100), facing east (direction = 0), distance = 50
    const los = new LineOfSight({ x: 100, y: 100 }, 0, 50);
    expect(los.n).toBe(10);
    expect(los.boxes.length).toBe(10);
    for (let i = 0; i < 10; i++) {
      expect(los.boxes[i].x).toBeCloseTo(100 + (50 / 10) * i);
      expect(los.boxes[i].y).toBeCloseTo(100);
      expect(los.boxes[i].width).toBe(4);
      expect(los.boxes[i].height).toBe(4);
      // Getter points(i) returns center of box
      expect(los.points(i).x).toBeCloseTo(100 + (50 / 10) * i + 2);
      expect(los.points(i).y).toBeCloseTo(100 + 2);
    }

    // LineOfSight with wall collision stop:
    // A mock map where column 3 is a wall
    const mockMap = {
      cols: 10,
      rows: 10,
      tileSize: 16,
      tiles: Array.from({ length: 10 }, () =>
        Array.from({ length: 10 }, (_, col) => (col === 3 ? 21 : 16))
      ),
    };
    // Starting at x = 16 (col 1), going east: box 0 (x=16, col 1), box 1 (x=32, col 2), box 2 (x=48, col 3 = wall!)
    // Box 2 collides with wall, so box 3+ should not be spawned.
    const losWithWall = new LineOfSight({ x: 16, y: 16 }, 0, 160, mockMap as any);
    expect(losWithWall.n).toBe(3); // boxes 0, 1, 2 spawned; box 2 hit wall, so box 3 was not spawned

    let losDetectedCount = 0;
    const unsubLos = los.onDetection(() => {
      losDetectedCount++;
    });

    const player = createPlayer(0, 0);
    // Player far away -> no detection
    player.x = 20;
    player.y = 20;
    expect(los.checkDetection(player)).toBe(false);
    expect(losDetectedCount).toBe(0);

    // Player collides with box 4 at x = 120, y = 100
    player.x = 118;
    player.y = 98;
    expect(los.checkDetection(player)).toBe(true);
    expect(losDetectedCount).toBe(1);

    // Unsubscribe
    unsubLos();
    expect(los.checkDetection(player)).toBe(true);
    expect(losDetectedCount).toBe(1);

    // 2. ConeOfSight unit test:
    // 5 lines: -fov/2, -fov/4, forward, +fov/4, +fov/2
    const fov = (60 * Math.PI) / 180;
    const cone = new ConeOfSight({ x: 200, y: 200 }, 0, 60, fov);
    expect(cone.lines.length).toBe(5);
    expect(cone.getAllBoxes().length).toBe(50);
    expect(cone.sightPolygon.length).toBe(6); // position + 5 line tips

    let coneDetectedCount = 0;
    cone.onDetection(() => {
      coneDetectedCount++;
    });

    // Player far away
    player.x = 0;
    player.y = 0;
    expect(cone.checkDetection(player)).toBe(false);
    expect(coneDetectedCount).toBe(0);

    // Player inside +fov/2 line at 30 degrees (last line: index 4)
    const boxOnPlusLine = cone.lines[4].boxes[5];
    player.x = boxOnPlusLine.x;
    player.y = boxOnPlusLine.y;
    expect(cone.checkDetection(player)).toBe(true);
    expect(coneDetectedCount).toBe(1);
  });

  it('rotates the basement window NPC cone of sight and damages Santa upon detection with "Intruder!!!" dialogue', () => {
    const state = createGameState({ initialLevelId: 'level-basement' });
    const input = createEmptyInput();
    const basement = state.levels['level-basement'];

    // 1. Initially looking north (-Math.PI / 2 radians, or 90 degrees absolute)
    expect(basement.npcSightAngle).toBeCloseTo(-Math.PI / 2);
    // Distance increased by +50%: 5 tiles * 1.5 = 7.5 tiles
    expect(basement.coneOfSight.distance).toBe(7.5 * 16);
    expect(basement.coneOfSight.lines.length).toBe(5);
    expect(basement.coneOfSight.sightPolygon.length).toBe(6);

    // Every 2 seconds it deletes old cone of sight and spawns new one +45 degrees
    updateGameState(state, input, 1.0);
    expect(basement.npcSightAngle).toBeCloseTo(-Math.PI / 2);

    updateGameState(state, input, 1.1); // total 2.1s
    expect(basement.npcSightAngle).toBeCloseTo(-Math.PI / 2 + Math.PI / 4);

    updateGameState(state, input, 2.0); // total 4.1s
    expect(basement.npcSightAngle).toBeCloseTo(-Math.PI / 2 + (2 * Math.PI) / 4);

    // 2. Test player detection: place Santa in the NPC's cone of sight
    const targetBox = basement.coneOfSight.getAllBoxes()[5];
    state.player.x = targetBox.x - 2;
    state.player.y = targetBox.y - 2;
    updateGameState(state, input, 0.01);

    expect(state.activeDialogue).not.toBeNull();
    expect(state.activeDialogue?.lines[0]).toBe(
      "You're not supposed to be here! Check-mate."
    );
    expect(state.activeDialogue?.speakerPortrait).toBe('Arjan');
    expect(basement.intruderDetected).toBe(true);

    // 3. Closing the dialogue triggers player damage (reloads level-basement and starts blinking)
    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);

    expect(state.activeDialogue).toBeNull();
    expect(state.currentLevelId).toBe('level-basement');
    expect(state.player.blinkTimer).toBeGreaterThan(0);
  });

  it('supports the people level (?level=people), spawning 11 NPCs and talking to each with their portrait', () => {
    // 1. Parsing query parameter ?level=people
    expect(parseLevelQueryParam('?level=people')).toBe('level-people');
    expect(parseLevelQueryParam('people')).toBe('level-people');

    // 2. Load level-people
    const state = createGameState({ initialLevelId: 'level-people' });
    const input = createEmptyInput();
    const peopleLevel = state.levels['level-people'] as LevelPeople;

    expect(state.currentLevelId).toBe('level-people');
    expect(state.player.x).toBe(PEOPLE_PLAYER_SPAWN.x);
    expect(state.player.y).toBe(PEOPLE_PLAYER_SPAWN.y);

    // 3. Exactly 11 NPCs matching inspiration person names
    expect(peopleLevel.npcs.length).toBe(11);
    expect(peopleLevel.npcs.map((npc) => npc.name)).toEqual([...PEOPLE_NAMES]);

    // 4. Test walking up to Henrik and talking to him
    const henrikNpc = peopleLevel.npcs.find((n) => n.name === 'Henrik')!;
    state.player.x = henrikNpc.bounds.x;
    state.player.y = henrikNpc.bounds.y + henrikNpc.bounds.height + 2;
    updateGameState(state, input, 0.01);

    expect(state.nearbyInteractable?.id).toBe('person-henrik');
    expect(state.nearbyInteractable?.promptText).toBe('Talk to Henrik');
    expect(state.nearbyInteractable?.speakerPortrait).toBe('Henrik');

    // Press Z to talk
    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);

    expect(state.activeDialogue).not.toBeNull();
    expect(state.activeDialogue?.lines[0]).toBe('Henrik says hello.');
    expect(state.activeDialogue?.speakerPortrait).toBe('Henrik');

    // Dismiss dialogue
    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);
    expect(state.activeDialogue).toBeNull();

    // 5. Test talking to Olexa
    const olexaNpc = peopleLevel.npcs.find((n) => n.name === 'Olexa')!;
    state.player.x = olexaNpc.bounds.x;
    state.player.y = olexaNpc.bounds.y + olexaNpc.bounds.height + 2;
    updateGameState(state, input, 0.01);

    expect(state.nearbyInteractable?.id).toBe('person-olexa');
    expect(state.nearbyInteractable?.speakerPortrait).toBe('Olexa');

    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);

    expect(state.activeDialogue?.lines[0]).toBe('Olexa says hello.');
    expect(state.activeDialogue?.speakerPortrait).toBe('Olexa');
  });

  it('detects Santa in basement Olexa cone of sight and damages player upon detection', () => {
    const state = createGameState({
      initialLevelId: 'level-basement',
      showIntroDialogue: false,
    });
    const input = createEmptyInput();
    const basement = state.levels['level-basement'] as LevelBasement;

    // Olexa is 1 tile south of the chess board, cone of sight looking north (-Math.PI / 2)
    expect(basement.olexaConeOfSight.lines.length).toBe(5);
    expect(basement.olexaConeOfSight.direction).toBeCloseTo(-Math.PI / 2);

    // Place Santa inside Olexa's cone of sight (north of Olexa)
    const olexaTargetBox = basement.olexaConeOfSight.getAllBoxes()[5];
    state.player.x = olexaTargetBox.x - 2;
    state.player.y = olexaTargetBox.y - 2;
    updateGameState(state, input, 0.01);

    expect(state.activeDialogue).not.toBeNull();
    expect(state.activeDialogue?.lines[0]).toBe(
      'Nobody believed me when I said you were real...'
    );
    expect(state.activeDialogue?.speakerPortrait).toBe('Olexa');
    expect(basement.intruderDetected).toBe(true);

    // Close dialogue with KeyZ -> reloads level-basement and starts blinking
    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);

    expect(state.activeDialogue).toBeNull();
    expect(state.currentLevelId).toBe('level-basement');
    expect(state.player.blinkTimer).toBeGreaterThan(0);
  });

  it('patrols upstairs Albin in dining room with reversing cone of sight and damages Santa on detection', () => {
    const state = createGameState({
      initialLevelId: 'level-upstairs',
      showIntroDialogue: false,
    });
    const input = createEmptyInput();
    const upstairs = state.levels['level-upstairs'] as LevelUpstairs;

    expect(upstairs.albinY).toBe(UPSTAIRS_ALBIN_START_Y);
    expect(upstairs.albinDir).toBe(1); // Walking south
    expect(upstairs.albinCone.direction).toBeCloseTo(Math.PI / 2);

    // Advance 3 seconds: Albin moves at 30 px/s, travels > 64px, reaches end, reverses to walking north (-Math.PI / 2)
    updateGameState(state, input, 3.0);
    expect(upstairs.albinDir).toBe(-1);
    expect(upstairs.albinCone.direction).toBeCloseTo(-Math.PI / 2);

    // Place Santa in Albin's cone of sight
    const targetBox = upstairs.albinCone.getAllBoxes()[5];
    state.player.x = targetBox.x - 2;
    state.player.y = targetBox.y - 2;
    updateGameState(state, input, 0.01);

    expect(state.activeDialogue).not.toBeNull();
    expect(state.activeDialogue?.lines[0]).toBe(
      'I was looking for Rosanna... but instead I found you!!'
    );
    expect(state.activeDialogue?.speakerPortrait).toBe('Albin');
    expect(upstairs.intruderDetected).toBe(true);

    // Dismiss dialogue -> damages Santa & reloads level-upstairs
    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);

    expect(state.activeDialogue).toBeNull();
    expect(state.currentLevelId).toBe('level-upstairs');
    expect(state.player.blinkTimer).toBeGreaterThan(0);
  });

  it('handles upstairs Henrik and Tanja in table room after opening door', () => {
    // 1. When table room door is closed, Henrik does not detect player
    const state = createGameState({
      initialLevelId: 'level-upstairs',
      showIntroDialogue: false,
    });
    const input = createEmptyInput();
    const upstairs = state.levels['level-upstairs'] as LevelUpstairs;

    // Henrik starts facing south (Math.PI / 2)
    expect(upstairs.henrikAngle).toBeCloseTo(Math.PI / 2);

    // Place Santa where Henrik would see him if door was open
    const targetBoxClosed = upstairs.henrikCone.getAllBoxes()[5];
    state.player.x = targetBoxClosed.x - 2;
    state.player.y = targetBoxClosed.y - 2;
    updateGameState(state, input, 0.01);
    expect(state.activeDialogue).toBeNull(); // Door is closed, inactive

    // 2. Open table room door
    const tableRoomDoor = upstairs.doors.find(
      (d) => d.id === 'upstairs-table-room-door'
    )!;
    state.player.x = tableRoomDoor.bounds.x + 2;
    state.player.y = tableRoomDoor.bounds.y - 10;
    updateGameState(state, input, 0.01);
    expect(state.nearbyInteractable?.id).toBe('upstairs-table-room-door');

    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);
    expect(
      upstairs.doors.some((d) => d.id === 'upstairs-table-room-door')
    ).toBe(false);

    // 3. Henrik rotates 45 degrees counter-clockwise every 3 seconds
    updateGameState(state, input, 1.5);
    expect(upstairs.henrikAngle).toBeCloseTo(Math.PI / 2);
    updateGameState(state, input, 1.6); // Total 3.1s -> rotates by -Math.PI / 4
    expect(upstairs.henrikAngle).toBeCloseTo(Math.PI / 2 - Math.PI / 4);

    // 4. Henrik detects Santa
    const henrikBox = upstairs.henrikCone.getAllBoxes()[5];
    state.player.x = henrikBox.x - 2;
    state.player.y = henrikBox.y - 2;
    updateGameState(state, input, 0.01);

    expect(state.activeDialogue).not.toBeNull();
    expect(state.activeDialogue?.lines[0]).toBe(
      'Santa? Perfect you can play with Asta!!'
    );
    expect(state.activeDialogue?.speakerPortrait).toBe('Henrik');

    // Dismiss dialogue -> damages Santa & reloads
    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);
    expect(state.currentLevelId).toBe('level-upstairs');
    expect(state.player.blinkTimer).toBeGreaterThan(0);

    // 5. Tanja detection (always facing north)
    const state2 = createGameState({
      initialLevelId: 'level-upstairs',
      showIntroDialogue: false,
    });
    const upstairs2 = state2.levels['level-upstairs'] as LevelUpstairs;
    // Open door
    upstairs2.doors = upstairs2.doors.filter(
      (d) => d.id !== 'upstairs-table-room-door'
    );
    expect(upstairs2.tanjaCone.direction).toBeCloseTo(-Math.PI / 2);

    const tanjaBox = upstairs2.tanjaCone.getAllBoxes()[5];
    state2.player.x = tanjaBox.x - 2;
    state2.player.y = tanjaBox.y - 2;
    updateGameState(state2, input, 0.01);

    expect(state2.activeDialogue).not.toBeNull();
    expect(state2.activeDialogue?.lines[0]).toBe(
      'I like your suit, red like the color of wine.'
    );
    expect(state2.activeDialogue?.speakerPortrait).toBe('Tanja');
  });

  it('detects Santa in upstairs living room via Diana and Simon lines of sight', () => {
    // 1. Diana detection (looking south)
    const stateDiana = createGameState({
      initialLevelId: 'level-upstairs',
      showIntroDialogue: false,
    });
    const input = createEmptyInput();
    const upstairsDiana = stateDiana.levels['level-upstairs'] as LevelUpstairs;

    const dianaBox = upstairsDiana.dianaLine.boxes[3];
    stateDiana.player.x = dianaBox.x - 2;
    stateDiana.player.y = dianaBox.y - 2;
    updateGameState(stateDiana, input, 0.01);

    expect(stateDiana.activeDialogue).not.toBeNull();
    expect(stateDiana.activeDialogue?.lines[0]).toBe(
      'Do you have any destilleries on the North pole?'
    );
    expect(stateDiana.activeDialogue?.speakerPortrait).toBe('Diana');

    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(stateDiana, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);
    expect(stateDiana.currentLevelId).toBe('level-upstairs');
    expect(stateDiana.player.blinkTimer).toBeGreaterThan(0);

    // 2. Simon detection (looking west)
    const stateSimon = createGameState({
      initialLevelId: 'level-upstairs',
      showIntroDialogue: false,
    });
    const upstairsSimon = stateSimon.levels['level-upstairs'] as LevelUpstairs;

    // In Simon's line of sight east of Diana's column (col 6, index 1)
    const simonBox = upstairsSimon.simonLine.boxes[1];
    stateSimon.player.x = simonBox.x - 2;
    stateSimon.player.y = simonBox.y - 2;
    updateGameState(stateSimon, input, 0.01);

    expect(stateSimon.activeDialogue).not.toBeNull();
    expect(stateSimon.activeDialogue?.lines[0]).toBe(
      'If I knew you were around here, I would have moved back to Sweden a long time ago.'
    );
    expect(stateSimon.activeDialogue?.speakerPortrait).toBe('Simon');

    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(stateSimon, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);
    expect(stateSimon.currentLevelId).toBe('level-upstairs');
    expect(stateSimon.player.blinkTimer).toBeGreaterThan(0);
  });

  it('handles upstairs Anne-Marie in bedroom after opening door', () => {
    const state = createGameState({
      initialLevelId: 'level-upstairs',
      showIntroDialogue: false,
    });
    const input = createEmptyInput();
    const upstairs = state.levels['level-upstairs'] as LevelUpstairs;

    // 1. Inactive when door is closed
    const targetBoxClosed = upstairs.anneMarieCone.getAllBoxes()[5];
    state.player.x = targetBoxClosed.x - 2;
    state.player.y = targetBoxClosed.y - 2;
    updateGameState(state, input, 0.01);
    expect(state.activeDialogue).toBeNull();

    // 2. Open bedroom door
    upstairs.doors = upstairs.doors.filter(
      (d) => d.id !== 'upstairs-bedroom-door'
    );

    // 3. Rotates 45 degrees (+Math.PI / 4) every 3 seconds
    expect(upstairs.anneMarieAngle).toBeCloseTo(-Math.PI / 2);
    updateGameState(state, input, 3.1);
    expect(upstairs.anneMarieAngle).toBeCloseTo(-Math.PI / 2 + Math.PI / 4);

    // 4. Detects Santa
    const targetBoxOpen = upstairs.anneMarieCone.getAllBoxes()[5];
    state.player.x = targetBoxOpen.x - 2;
    state.player.y = targetBoxOpen.y - 2;
    updateGameState(state, input, 0.01);

    expect(state.activeDialogue).not.toBeNull();
    expect(state.activeDialogue?.lines[0]).toBe(
      'What a coincidence, I was just reading a story about you.'
    );
    expect(state.activeDialogue?.speakerPortrait).toBe('Anne-Marie');

    // Dismiss dialogue -> damages Santa & reloads
    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);
    expect(state.currentLevelId).toBe('level-upstairs');
    expect(state.player.blinkTimer).toBeGreaterThan(0);
  });
});
