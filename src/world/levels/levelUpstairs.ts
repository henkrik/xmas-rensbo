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
 * - Dining Room (cols 3..8, rows 4..11, WoodFloor):
 *   Cupboard against west wall (col 4, rows 6..8), long wooden kitchen table (cols 6..7, rows 5..9).
 * - Living Room (cols 3..8, rows 12..20, WoodFloor):
 *   Colorful couch (cols 5..7, row 13) flanked by two matching colorful armchairs (col 4, row 14 & col 8, row 14),
 *   Xmas Tree in south-west corner (cols 4..5, rows 17..19), and two south windows (row 20).
 * - The Kitchen (cols 9..14, rows 4..10, WoodFloor):
 *   North wall (row 4) has 3 windows looking out where another Santa runs east-to-west on first entry;
 *   Kitchen island in center (cols 11..12, rows 6..7), stove & sink on east wall (col 14, rows 5..8),
 *   counter bar on south-west (cols 9..10, row 9), and The Altar just south (cols 9..10, row 11).
 * - Table Room (cols 9..14, rows 15..22, WoodFloor):
 *   Door at (col 10, row 15), big wooden kitchen table in center (cols 11..13, rows 18..19), 3 south windows.
 * - Staircase (cols 15..18, rows 15..20):
 *   Player spawns here and can walk downstairs back to `level-basement`.
 * - Shower (cols 15..20, rows 4..10, BathroomTileFloor):
 *   Closed door at (col 17, row 10); hidden until opened. Shower, drain, sink (col 16, rows 7..8), toilet (col 19, row 8).
 * - The Bedroom (cols 20..27, rows 4..10, WoodFloor):
 *   Closed door at (col 22, row 10); hidden until opened. Double bed on east wall (cols 24..26, rows 5..8).
 * - The Office (cols 19..24, rows 15..22, WoodFloor):
 *   Closed door at (col 21, row 15); hidden until opened. Desk, corner PC desk & chair (cols 20..22, rows 17..21).
 * - Hallway & Extra Room (cols 13..29, rows 11..19, WoodFloor):
 *   Hallway reaches the Extra Room (cols 25..28, rows 11..18) directly without a wall or door in-between.
 */
export const UPSTAIRS_TILES: TileType[][] = [
  //0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31
  [V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V], // 0
  [V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V], // 1
  [V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V], // 2: Exterior strip north of kitchen windows
  [V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V], // 3
  [V, V, V, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, V, V, V, V], // 4: North wall (Dining | Kitchen windows | Shower | Bedroom)
  [V, V, V, W, F, F, O, O, F, F, F, F, F, F, O, W, B, B, B, B, W, F, F, F, O, O, O, W, V, V, V, V], // 5: Dining table (6..7) | Kitchen | Shower | Bed (24..26)
  [V, V, V, W, O, F, O, O, F, F, F, O, O, F, O, W, B, B, B, B, W, F, F, F, O, O, O, W, V, V, V, V], // 6: Cupboard (4) | Kitchen Island (11..12) | Bed (24..26)
  [V, V, V, W, O, F, O, O, F, F, F, O, O, F, O, W, O, B, B, B, W, F, F, F, O, O, O, W, V, V, V, V], // 7: Cupboard (4) | Kitchen Island (11..12) | Shower sink (16)
  [V, V, V, W, O, F, O, O, F, F, F, F, F, F, O, W, O, B, B, O, W, F, F, F, O, O, O, W, V, V, V, V], // 8: Cupboard (4) | Dining table (6..7) | Toilet (19) | Bed
  [V, V, V, W, F, F, O, O, F, O, O, F, F, F, W, W, B, B, B, B, W, F, F, F, F, F, F, W, V, V, V, V], // 9: Kitchen bar (9..10)
  [V, V, V, W, F, F, F, F, F, W, W, F, F, F, W, W, W, B, W, W, W, W, F, W, W, W, W, W, W, W, V, V], // 10: Kitchen arch (11..13) | Shower door (17) | Bedroom door (22)
  [V, V, V, W, F, F, F, F, F, O, O, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, W, V, V], // 11: The Altar (9..10) | Hallway -> Extra Room (25..28)
  [V, V, V, W, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, W, V, V], // 12
  [V, V, V, W, F, O, O, O, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, W, V, V], // 13: Colorful Couch (5..7)
  [V, V, V, W, O, F, F, F, O, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, W, V, V], // 14: Colorful Armchairs (4 & 8)
  [V, V, V, W, F, F, F, F, F, W, F, W, W, W, W, T, T, T, T, W, W, F, W, W, W, F, F, F, F, W, V, V], // 15: Table room door (10) | Stairs (15..18) | Office door (21)
  [V, V, V, W, F, F, F, F, F, W, F, F, F, F, W, T, T, T, T, W, F, F, F, W, W, F, F, F, F, W, V, V], // 16
  [V, V, V, W, O, O, F, F, F, W, F, F, F, F, W, T, T, T, T, W, O, F, F, W, W, F, F, F, F, W, V, V], // 17: Xmas Tree (4..5) | Office desk (20)
  [V, V, V, W, O, O, F, F, F, W, F, O, O, O, W, T, T, T, T, W, O, F, F, W, W, F, F, F, F, W, V, V], // 18: Xmas Tree | Second kitchen table (11..13)
  [V, V, V, W, O, O, F, F, F, W, F, O, O, O, W, T, T, T, T, W, F, F, F, W, W, W, W, W, W, W, V, V], // 19: Extra room south wall (windows at 25..28)
  [V, V, V, W, W, W, W, W, W, W, F, F, F, F, W, W, W, W, W, W, O, O, O, W, V, V, V, V, V, V, V, V], // 20: Living room south wall | Office PC & chair (20..22)
  [V, V, V, V, V, V, V, V, V, W, F, F, F, F, W, V, V, V, V, W, O, O, F, W, V, V, V, V, V, V, V, V], // 21
  [V, V, V, V, V, V, V, V, V, W, W, W, W, W, W, V, V, V, V, W, W, W, W, W, V, V, V, V, V, V, V, V], // 22: Table room south windows | Office south window
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
  y: 15 * TILE_SIZE + 2,
  facing: 'up' as Direction,
};

/** Invisible collision box halfway down the staircase to walk back downstairs to `level-basement`. */
export const UPSTAIRS_STAIRS_TRIGGER_BOUNDS: Rect = {
  x: 15 * TILE_SIZE,
  y: 18 * TILE_SIZE,
  width: 4 * TILE_SIZE,
  height: 2 * TILE_SIZE,
};

/** Closed collidable door to the Shower (bathroom tiles inside). */
export const UPSTAIRS_SHOWER_DOOR_BOUNDS: Rect = {
  x: 17 * TILE_SIZE,
  y: 10 * TILE_SIZE,
  width: TILE_SIZE,
  height: TILE_SIZE,
};

export const UPSTAIRS_SHOWER_HIDDEN_MASK: Rect = {
  x: 15 * TILE_SIZE,
  y: 4 * TILE_SIZE,
  width: 6 * TILE_SIZE,
  height: 6 * TILE_SIZE,
};

/** Closed collidable door to The Bedroom. */
export const UPSTAIRS_BEDROOM_DOOR_BOUNDS: Rect = {
  x: 22 * TILE_SIZE,
  y: 10 * TILE_SIZE,
  width: TILE_SIZE,
  height: TILE_SIZE,
};

export const UPSTAIRS_BEDROOM_HIDDEN_MASK: Rect = {
  x: 20 * TILE_SIZE,
  y: 4 * TILE_SIZE,
  width: 8 * TILE_SIZE,
  height: 6 * TILE_SIZE,
};

/** Closed collidable door to The Office. */
export const UPSTAIRS_OFFICE_DOOR_BOUNDS: Rect = {
  x: 21 * TILE_SIZE,
  y: 15 * TILE_SIZE,
  width: TILE_SIZE,
  height: TILE_SIZE,
};

export const UPSTAIRS_OFFICE_HIDDEN_MASK: Rect = {
  x: 19 * TILE_SIZE,
  y: 16 * TILE_SIZE,
  width: 6 * TILE_SIZE,
  height: 7 * TILE_SIZE,
};

/** Closed collidable door to the room with the second kitchen table. */
export const UPSTAIRS_TABLE_ROOM_DOOR_BOUNDS: Rect = {
  x: 10 * TILE_SIZE,
  y: 15 * TILE_SIZE,
  width: TILE_SIZE,
  height: TILE_SIZE,
};

export const UPSTAIRS_TABLE_ROOM_HIDDEN_MASK: Rect = {
  x: 9 * TILE_SIZE,
  y: 16 * TILE_SIZE,
  width: 6 * TILE_SIZE,
  height: 7 * TILE_SIZE,
};

/** Trigger region inside "The Kitchen" (cols 9..14, rows 5..9). */
export const KITCHEN_TRIGGER_BOUNDS: Rect = {
  x: 9 * TILE_SIZE,
  y: 5 * TILE_SIZE,
  width: 5 * TILE_SIZE,
  height: 4.8 * TILE_SIZE,
};

export const KITCHEN_ROSANNA_STATE_KEY = 'kitchenRosannaEventTriggered';
export const ROSANNA_SANTA_START_X = 14.2 * TILE_SIZE;
export const ROSANNA_SANTA_END_X = 8.2 * TILE_SIZE;
export const ROSANNA_SANTA_Y = 2.5 * TILE_SIZE;
export const ROSANNA_SANTA_SPEED = 56; // px per second running east-to-west outside north windows

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
      this.rosannaCutscene.santaX -= ROSANNA_SANTA_SPEED * dtSeconds;

      if (this.rosannaCutscene.santaX <= ROSANNA_SANTA_END_X) {
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
