import { describe, expect, it } from 'vitest';
import { applyKeyEvent, createEmptyInput } from '../src/core/input';
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
import { createGameState, resetAfterSnowballHit, updateGameState } from '../src/world/gameState';
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

    // Pressing Z at the chimney is a placeholder and does nothing for now
    applyKeyEvent(input, 'KeyZ', true);
    updateGameState(state, input, 0.01);
    applyKeyEvent(input, 'KeyZ', false);
    expect(state.isOnRoof).toBe(true);
    expect(state.activeDialogue).toBeNull();

    // 7. Walk west back to the ladder and climb down
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

  it('halves dog max speed in joystick mode', () => {
    const state = createGameState();
    const input = createEmptyInput();

    // Aggro dog on east snow field
    state.dog.x = DOG_START_X;
    state.dog.y = DOG_START_Y;
    state.player.x = DOG_START_X - (DOG_AGGRO_DISTANCE - 16);
    state.player.y = DOG_START_Y;

    // Normal keyboard mode
    state.joystickActive = false;
    updateGameState(state, input, 0.5);
    expect(state.dog.vx).toBeLessThan(-30);
    expect(Math.abs(state.dog.vx)).toBeGreaterThan(37); // > halved max speed

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
  });

  it('shows desktop and mobile tutorial dialogues on initial load and clears them on reset', () => {
    // Desktop initial state
    const desktopState = createGameState({ isMobile: false, showIntroDialogue: true });
    expect(desktopState.activeDialogue).not.toBeNull();
    expect(desktopState.activeDialogue?.lines[0]).toBe(
      'Use the arrow keys to move around and Z to interact. Press Z to close this window and start playing.'
    );
    expect(desktopState.activeDialogue?.lines[1]).toBe(
      'Good luck! Christmas depends on you...'
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
      'Good luck! Christmas depends on you...'
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
});
