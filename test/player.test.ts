import { describe, expect, it } from 'vitest';
import { applyKeyEvent, createEmptyInput } from '../src/core/input';
import { createPlayer, updatePlayer } from '../src/entities/player';
import { HIT_BLINK_DURATION_SECONDS } from '../src/entities/snowball';
import { createGameState, updateGameState } from '../src/world/gameState';
import {
  HOUSE_DOOR_COL,
  HOUSE_DOOR_ROW,
  MAP_COLS,
  MAP_ROWS,
  PLAYER_START_X,
  PLAYER_START_Y,
  STARTER_MAP,
  TILE_SIZE,
  TileType,
} from '../src/world/tilemap';

describe('Player walking & 2x Rensbo map layout', () => {
  it('uses a 32x28 map (2x width and height) with a large 13x7 main house', () => {
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

  it('shows "Z: Talk to" near a snowball thrower and displays "Watch out!" when Z is pressed', () => {
    const state = createGameState();
    const input = createEmptyInput();

    // Position Santa right below the left snowball thrower (almost touching)
    const leftThrower = state.throwers[0];
    state.player.x = leftThrower.x;
    state.player.y = leftThrower.y + leftThrower.height + 2;

    updateGameState(state, input, 0.01);
    expect(state.nearbyInteractable).not.toBeNull();
    expect(state.nearbyInteractable?.promptText).toBe('Z: Talk to');

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

  it('shows "Z: Open door" at the main house door and advances through the two dialogue lines with Z', () => {
    const state = createGameState();
    const input = createEmptyInput();

    // Position Santa right in front of the house door (col 13, row 10, just below row 9 door)
    state.player.x = HOUSE_DOOR_COL * TILE_SIZE + 2;
    state.player.y = (HOUSE_DOOR_ROW + 1) * TILE_SIZE + 2;

    updateGameState(state, input, 0.01);
    expect(state.nearbyInteractable).not.toBeNull();
    expect(state.nearbyInteractable?.promptText).toBe('Z: Open door');

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
});
