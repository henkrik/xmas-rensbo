import { Direction, Player, Rect, rectsIntersect } from '../../entities/player';
import { Interactable } from '../interaction';
import { MAP_COLS, MAP_ROWS, TILE_SIZE, TileMap, TileType } from '../tilemap';
import { CollidableDoor, GameLevel, LevelId, LevelTransitionContext } from './types';

const V = TileType.VoidBlack;
const W = TileType.InteriorWall;
const F = TileType.WoodFloor;
const B = TileType.BathroomTileFloor;
const T = TileType.StairsFloor;
const O = TileType.FurnitureSolid;

/**
 * 32x28 Tile Matrix for `level-upstairs` (based on inspiration/level-upstairs.jpg):
 * - Dining Room (cols 2..8, rows 4..10, WoodFloor):
 *   Cupboard against west wall (col 3, rows 6..7), long wooden dining table (cols 5..6, rows 5..9),
 *   with extra open distance (cols 7..9) between the dining table and the kitchen.
 * - Living Room (cols 2..9, rows 11..17, WoodFloor):
 *   Moved north so its south wall is at row 17 (leaving breathing room next to the Table Room at rows 13..20).
 *   Colorful couch (cols 5..7, row 11) and matching colorful armchairs (col 3, row 12 & col 8, row 13)
 *   leave a wide open path (cols 4..7, rows 12..16) so the player can easily reach the Xmas Tree (cols 3..4, rows 14..16).
 * - The Kitchen (cols 9..15, rows 4..10, WoodFloor):
 *   Kitchen island shifted west (cols 10..11, rows 6..7), stove & sink on east wall (col 15, rows 5..8),
 *   counter bar on south-west (cols 9..11, row 9), and The Altar at (cols 10..11, row 10).
 * - Narrow Hallway (cols 9..27, rows 11..12, WoodFloor):
 *   2 tiles tall along the Y-axis, extending seamlessly east into the narrower Extra Room (cols 26..27, rows 11..17).
 * - Table Room (cols 9..14, rows 13..20, WoodFloor):
 *   Door at (col 11, row 13), second wooden kitchen table (cols 11..12, rows 16..17), 3 south windows (row 20).
 * - Staircase (cols 15..18, rows 13..18):
 *   Player spawns at top of stairs (row 13) and can walk downstairs at (rows 16..17).
 * - Shower (cols 16..20, rows 4..10, BathroomTileFloor):
 *   Closed door at (col 18, row 10); hidden until opened.
 * - The Bedroom (cols 20..27, rows 4..10, WoodFloor):
 *   Closed door at (col 23, row 10); hidden until opened. Normal 2x2 double bed at (cols 25..26, rows 6..7).
 * - Wider Office (cols 19..25, rows 13..20, WoodFloor):
 *   Closed door at (col 21, row 13); hidden until opened. 5 interior columns wide (cols 20..24).
 */
export const UPSTAIRS_TILES: TileType[][] = [
  //0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31
  [V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V], // 0
  [V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V], // 1
  [V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V], // 2: Exterior strip north of kitchen windows
  [V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V], // 3
  [V, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, V, V, V], // 4: North wall (Dining | Kitchen windows | Shower | Bedroom with window at 24..25)
  [V, W, F, F, F, F, F, F, F, F, F, F, F, F, F, O, W, B, B, B, W, W, F, F, F, F, F, F, W, V, V, V], // 5: Shortened dining table walk path (4..5) | Shower (17..19) | Bedroom (22..27)
  [V, W, O, F, O, O, F, F, F, F, O, O, F, F, F, O, W, B, B, B, W, W, F, F, F, F, O, O, W, V, V, V], // 6: Cupboard (2) | Dining Table (4..5) | Island (10..11) | Bed (26..27)
  [V, W, O, F, O, O, F, F, F, F, O, O, F, F, F, O, W, O, B, B, W, W, F, F, F, F, O, O, W, V, V, V], // 7: Cupboard (2) | Dining Table (4..5) | Shower sink (17) | Bed (26..27)
  [V, W, F, F, O, O, F, F, F, F, F, F, F, F, F, O, W, O, B, O, W, W, F, F, F, F, F, F, W, V, V, V], // 8: Dining table (4..5) | Shower sink (17) & toilet (19) | Bedroom
  [V, W, F, F, O, O, F, F, F, O, O, O, F, F, F, W, W, B, B, B, W, W, F, F, F, F, F, F, W, V, V, V], // 9: Kitchen bar (9..11)
  [V, W, F, F, F, F, F, F, F, W, O, O, F, F, F, W, W, W, B, W, W, W, W, W, F, W, W, W, W, V, V, V], // 10: Altar (10..11) | Arch (12..14) | Shower door (18) | Bedroom door (24)
  [V, W, F, F, O, O, O, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, W, V, V, V], // 11: Colorful Couch (4..6) | Narrow Hallway (rows 11..12) -> Extra Room (26..27)
  [V, W, O, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, W, V, V, V], // 12: Left Colorful Armchair (2) | Narrow Hallway (rows 11..12)
  [V, W, F, F, F, F, F, O, F, F, F, F, F, F, W, T, T, T, T, W, W, F, W, W, W, W, F, F, W, V, V, V], // 13: Right Armchair (7) | Open breathing room (8..13) | Stairs (15..18) | Office door (21)
  [V, W, O, O, F, F, F, F, F, F, F, F, F, F, W, T, T, T, T, W, F, F, F, F, F, W, F, F, W, V, V, V], // 14: Xmas Tree (2..3) | Stairs | Aligned Office (20..24) | Extra Room (26..27)
  [V, W, O, O, F, F, F, F, F, W, W, F, W, W, W, T, T, T, T, W, O, F, F, F, F, W, F, F, W, V, V, V], // 15: Xmas Tree (2..3) | Table Room door (11) | Office side desk (20)
  [V, W, O, O, F, F, F, F, F, W, F, F, F, F, W, T, T, T, T, W, O, O, O, F, F, W, F, F, W, V, V, V], // 16: Xmas Tree (2..3) | Table Room floor | Stairs trigger (15..18) | Office PC desk (20..22)
  [V, W, W, W, W, W, W, W, W, W, F, O, O, F, W, T, T, T, T, W, O, O, O, F, F, W, F, F, W, V, V, V], // 17: Living Room south wall (3..4, 6..7) | Office PC desk/chair (20..22)
  [V, V, V, V, V, V, V, V, V, W, F, O, O, F, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, V, V, V], // 18: Aligned South Wall across Stairs (15..18), Office (19..25 with window), Extra Room (26..28)
  [V, V, V, V, V, V, V, V, V, W, F, F, F, F, W, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V], // 19: Table Room floor | Void under aligned office
  [V, V, V, V, V, V, V, V, V, W, F, F, F, F, W, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V], // 20: Table Room floor
  [V, V, V, V, V, V, V, V, V, W, W, W, W, W, W, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V], // 21: Table Room south wall (windows at 10..13)
  [V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V], // 22
  [V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V], // 23
  [V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V], // 24
  [V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V], // 25
  [V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V], // 26
  [V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V], // 27
];

export const UPSTAIRS_MAP: TileMap = {
  cols: MAP_COLS,
  rows: MAP_ROWS,
  tileSize: TILE_SIZE,
  tiles: UPSTAIRS_TILES,
};

/** Player spawns by the stairs when arriving in `level-upstairs`. */
export const UPSTAIRS_STAIRS_SPAWN = {
  x: 16 * TILE_SIZE + 2,
  y: 13 * TILE_SIZE + 2,
  facing: 'up' as Direction,
};

/** Invisible collision box halfway down the staircase to walk back downstairs to `level-basement`. */
export const UPSTAIRS_STAIRS_TRIGGER_BOUNDS: Rect = {
  x: 15 * TILE_SIZE,
  y: 16 * TILE_SIZE,
  width: 4 * TILE_SIZE,
  height: 2 * TILE_SIZE,
};

/** Closed collidable door to the Shower (bathroom tiles inside). */
export const UPSTAIRS_SHOWER_DOOR_BOUNDS: Rect = {
  x: 18 * TILE_SIZE,
  y: 10 * TILE_SIZE,
  width: TILE_SIZE,
  height: TILE_SIZE,
};

export const UPSTAIRS_SHOWER_HIDDEN_MASK: Rect = {
  x: 17 * TILE_SIZE,
  y: 4 * TILE_SIZE,
  width: 4 * TILE_SIZE,
  height: 6 * TILE_SIZE,
};

/** Closed collidable door to The Bedroom. */
export const UPSTAIRS_BEDROOM_DOOR_BOUNDS: Rect = {
  x: 24 * TILE_SIZE,
  y: 10 * TILE_SIZE,
  width: TILE_SIZE,
  height: TILE_SIZE,
};

export const UPSTAIRS_BEDROOM_HIDDEN_MASK: Rect = {
  x: 21 * TILE_SIZE,
  y: 4 * TILE_SIZE,
  width: 7 * TILE_SIZE,
  height: 6 * TILE_SIZE,
};

/** Closed collidable door to The Office. */
export const UPSTAIRS_OFFICE_DOOR_BOUNDS: Rect = {
  x: 21 * TILE_SIZE,
  y: 13 * TILE_SIZE,
  width: TILE_SIZE,
  height: TILE_SIZE,
};

export const UPSTAIRS_OFFICE_HIDDEN_MASK: Rect = {
  x: 20 * TILE_SIZE,
  y: 14 * TILE_SIZE,
  width: 5 * TILE_SIZE,
  height: 4 * TILE_SIZE,
};

/** Closed collidable door to the room with the second kitchen table. */
export const UPSTAIRS_TABLE_ROOM_DOOR_BOUNDS: Rect = {
  x: 11 * TILE_SIZE,
  y: 15 * TILE_SIZE,
  width: TILE_SIZE,
  height: TILE_SIZE,
};

export const UPSTAIRS_TABLE_ROOM_HIDDEN_MASK: Rect = {
  x: 9 * TILE_SIZE,
  y: 16 * TILE_SIZE,
  width: 6 * TILE_SIZE,
  height: 6 * TILE_SIZE,
};

/** Trigger region inside "The Kitchen" (cols 9..15, rows 5..8, triggered 1 tile further north). */
export const KITCHEN_TRIGGER_BOUNDS: Rect = {
  x: 9 * TILE_SIZE,
  y: 5 * TILE_SIZE,
  width: 6 * TILE_SIZE,
  height: 3.5 * TILE_SIZE,
};

export const KITCHEN_ROSANNA_STATE_KEY = 'kitchenRosannaEventTriggered';
export const ROSANNA_SANTA_START_X = 8.0 * TILE_SIZE;
export const ROSANNA_SANTA_END_X = 14.5 * TILE_SIZE;
export const ROSANNA_SANTA_Y = 2.5 * TILE_SIZE;
export const ROSANNA_SANTA_SPEED = 56; // px per second running west-to-east outside north windows

export interface RosannaCutsceneState {
  active: boolean;
  santaX: number;
  santaY: number;
  walkTimer: number;
  elapsed: number;
}

export class LevelUpstairs implements GameLevel {
  public readonly id: LevelId = 'level-upstairs';
  public readonly map: TileMap = UPSTAIRS_MAP;
  public doors: CollidableDoor[];
  public rosannaCutscene: RosannaCutsceneState | null = null;

  constructor() {
    this.doors = [
      {
        id: 'upstairs-shower-door',
        bounds: { ...UPSTAIRS_SHOWER_DOOR_BOUNDS },
        hiddenRegions: [{ ...UPSTAIRS_SHOWER_HIDDEN_MASK }],
      },
      {
        id: 'upstairs-bedroom-door',
        bounds: { ...UPSTAIRS_BEDROOM_DOOR_BOUNDS },
        hiddenRegions: [{ ...UPSTAIRS_BEDROOM_HIDDEN_MASK }],
      },
      {
        id: 'upstairs-office-door',
        bounds: { ...UPSTAIRS_OFFICE_DOOR_BOUNDS },
        hiddenRegions: [{ ...UPSTAIRS_OFFICE_HIDDEN_MASK }],
      },
      {
        id: 'upstairs-table-room-door',
        bounds: { ...UPSTAIRS_TABLE_ROOM_DOOR_BOUNDS },
        hiddenRegions: [{ ...UPSTAIRS_TABLE_ROOM_HIDDEN_MASK }],
      },
    ];
  }

  public enter(player: Player): void {
    player.x = UPSTAIRS_STAIRS_SPAWN.x;
    player.y = UPSTAIRS_STAIRS_SPAWN.y;
    player.facing = UPSTAIRS_STAIRS_SPAWN.facing;
    player.isMoving = false;
    player.walkTimer = 0;
  }

  public getSolidObstacles(): readonly Rect[] {
    return [
      UPSTAIRS_STAIRS_TRIGGER_BOUNDS,
      ...this.doors.map((d) => d.bounds),
    ];
  }

  public getInteractables(): Interactable[] {
    const list: Interactable[] = [
      {
        id: 'upstairs-stairs-down',
        bounds: { ...UPSTAIRS_STAIRS_TRIGGER_BOUNDS },
        promptText: 'Walk downstairs',
        dialogueLines: [],
      },
    ];

    for (const door of this.doors) {
      list.push({
        id: door.id,
        bounds: { ...door.bounds },
        promptText: 'Open door',
        dialogueLines: [],
      });
    }

    return list;
  }

  public handleInteraction(
    interactableId: string,
    _player: Player,
    ctx: LevelTransitionContext
  ): boolean {
    const doorIdx = this.doors.findIndex((d) => d.id === interactableId);
    if (doorIdx !== -1) {
      this.doors.splice(doorIdx, 1);
      return true;
    }

    if (interactableId === 'upstairs-stairs-down') {
      ctx.loadLevel('level-basement');
      return true;
    }

    return false;
  }

  /**
   * Updates the one-time Kitchen Rosanna cutscene event.
   * Returns true if player movement is currently locked by the active cutscene.
   */
  public updateCutscene(
    dtSeconds: number,
    player: Player,
    ctx: LevelTransitionContext
  ): boolean {
    if (this.rosannaCutscene?.active) {
      player.isMoving = false;
      player.walkTimer = 0;
      player.facing = 'up';

      this.rosannaCutscene.elapsed += dtSeconds;
      this.rosannaCutscene.walkTimer += dtSeconds;
      this.rosannaCutscene.santaX += ROSANNA_SANTA_SPEED * dtSeconds;

      if (this.rosannaCutscene.santaX >= ROSANNA_SANTA_END_X) {
        this.rosannaCutscene.active = false;
        this.rosannaCutscene = null;
        ctx.openDialogue(['... Rosanna???']);
      }
      return true;
    }

    // Check if the player just walked into the kitchen for the first time
    if (
      !player.states.get(KITCHEN_ROSANNA_STATE_KEY) &&
      rectsIntersect(player, KITCHEN_TRIGGER_BOUNDS)
    ) {
      player.states.set(KITCHEN_ROSANNA_STATE_KEY, true);
      player.isMoving = false;
      player.walkTimer = 0;
      player.facing = 'up';
      this.rosannaCutscene = {
        active: true,
        santaX: ROSANNA_SANTA_START_X,
        santaY: ROSANNA_SANTA_Y,
        walkTimer: 0,
        elapsed: 0,
      };
      return true;
    }

    return false;
  }
}
