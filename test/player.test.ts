import { describe, expect, it } from 'vitest';
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
  USED_STAIRS_STATE_KEY,
} from '../src/world/levels/levelBasement';
import {
  KITCHEN_ROSANNA_STATE_KEY,
  KITCHEN_TRIGGER_BOUNDS,
  UPSTAIRS_BEDROOM_DOOR_BOUNDS,
  UPSTAIRS_BEDROOM_HIDDEN_MASK,
  UPSTAIRS_OFFICE_DOOR_BOUNDS,
  UPSTAIRS_OFFICE_HIDDEN_MASK,
  UPSTAIRS_SHOWER_DOOR_BOUNDS,
  UPSTAIRS_STAIRS_SPAWN,
  UPSTAIRS_STAIRS_TRIGGER_BOUNDS,
  UPSTAIRS_TABLE_ROOM_DOOR_BOUNDS,
  UPSTAIRS_TABLE_ROOM_HIDDEN_MASKS,
} from '../src/world/levels/levelUpstairs';
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

  it('shows "Talk to" near a snowball thrower and displays "Watch out!" when Z is pressed', () => {
    const state = createGameState();
    const input = createEmptyInput();

    // Position Santa right below the left snowball thrower (almost touching)
    const leftThrower = state.throwers[0];
    state.player.x = leftThrower.x;
    state.player.y = leftThrower.y + leftThrower.height + 2;

    updateGameState(state, input, 0.01);
    expect(state.nearbyInteractable).not.toBeNull();
    expect(state.nearbyInteractable?.promptText).toBe('Talk to');

    // Press Z to talk
    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);

    expect(state.activeDialogue).not.toBeNull();
    expect(state.activeDialogue?.lines[state.activeDialogue.currentIndex]).toBe(
      'Watch out!'
    );

    // Press Z again to close the single-line dialogue
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

    // Open the bathroom door -> deletes the door and allows walking freely into the bathroom
    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);
    expect(state.levels['level-basement'].doors.length).toBe(0);

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

    // 1. Shower, Bedroom, Office, and Table Room doors start closed and are deleted when opened
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

    for (const [doorId, bounds, offsetY] of [
      ['upstairs-shower-door', UPSTAIRS_SHOWER_DOOR_BOUNDS, TILE_SIZE + 2],
      ['upstairs-bedroom-door', UPSTAIRS_BEDROOM_DOOR_BOUNDS, TILE_SIZE + 2],
      ['upstairs-office-door', UPSTAIRS_OFFICE_DOOR_BOUNDS, -14],
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

    // 4. Player can walk past the armchairs to reach the Christmas tree in the living room
    const input = createEmptyInput();
    upstairsState.player.x = 6 * TILE_SIZE;
    upstairsState.player.y = 12 * TILE_SIZE; // next to couch
    input.down = true;
    for (let i = 0; i < 20; i++) {
      updateGameState(upstairsState, input, 0.05);
    }
    input.down = false;
    input.left = true;
    for (let i = 0; i < 20; i++) {
      updateGameState(upstairsState, input, 0.05);
    }
    input.left = false;
    // Christmas tree is at cols 2..3, rows 14..16 (x = 32..64)
    expect(upstairsState.player.x).toBeLessThan(4.5 * TILE_SIZE);
    expect(upstairsState.player.y).toBeGreaterThan(13 * TILE_SIZE);
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
});
