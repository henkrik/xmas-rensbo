import { Direction, Player, Rect } from '../../entities/player';
import { Interactable } from '../interaction';
import { MAP_COLS, MAP_ROWS, TILE_SIZE, TileMap, TileType } from '../tilemap';
import { CollidableDoor, GameLevel, LevelId, LevelTransitionContext } from './types';

const V = TileType.VoidBlack;
const W = TileType.InteriorWall;
const F = TileType.WoodFloor;
const S = TileType.StoneTileFloor;
const B = TileType.BathroomTileFloor;
const T = TileType.StairsFloor;
const O = TileType.FurnitureSolid;

/**
 * 32x28 Tile Matrix for `level-basement` (based on inspiration/level-basement.jpg):
 * - West wing (cols 3..14):
 *   - The Library (rows 3..12, WoodFloor): Bookshelf on north wall (rows 3..4, cols 4..13),
 *     neutral couch on west side (cols 4..5, rows 6..10), stack of wood on east side (cols 12..13, rows 5..7),
 *     and The Fireplace (cols 11..14, rows 9..12).
 *   - Basement Living Room (rows 13..23, WoodFloor): Neutral couch (cols 6..10, rows 14..15),
 *     chess board table (cols 7..9, rows 18..19), extra big south windows (row 23, cols 5..8 & 10..13),
 *     and a character standing by the south window looking out.
 * - East wing (cols 15..29):
 *   - Passageway & Basement Hallway (StoneTileFloor - reddish-orangish stone tiles):
 *     Locked door on north corridor wall (cols 16..17, row 12), coat hangers on west wall (col 19, rows 18..20),
 *     and locked Front Door on south wall (cols 21..22, row 23).
 *   - Basement Bathroom (cols 19..25, rows 3..9, BathroomTileFloor):
 *     Closed collidable door at (col 22, row 9); hidden in black until door is opened & deleted.
 *     Sink on west wall (col 20, rows 5..6), toilet on east wall (col 24, row 5).
 *   - Stairs (cols 25..29, rows 13..18):
 *     Lower walkable steps (cols 25..26, rows 14..17) and invisible trigger box halfway up (cols 27..28, rows 14..17).
 */
export const BASEMENT_TILES: TileType[][] = [
  //0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31
  [V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V], // 0
  [V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V], // 1
  [V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V], // 2
  [V, V, V, W, W, W, W, W, W, W, W, W, W, W, W, V, V, V, V, W, W, W, W, W, W, W, V, V, V, V, V, V], // 3: Library Bookshelf top | Bathroom north wall
  [V, V, V, W, W, W, W, W, W, W, W, W, W, W, W, V, V, V, V, W, B, B, B, B, B, W, V, V, V, V, V, V], // 4: Library Bookshelf base | Bathroom
  [V, V, V, W, F, F, F, F, F, F, F, F, O, O, W, V, V, V, V, W, O, B, B, B, O, W, V, V, V, V, V, V], // 5: Wood stack (12..13) | Bathroom sink (20) & toilet (24)
  [V, V, V, W, O, O, F, F, F, F, F, F, O, O, W, V, V, V, V, W, O, B, B, B, B, W, V, V, V, V, V, V], // 6: Library couch (4..5) | Wood stack (12..13)
  [V, V, V, W, O, O, F, F, F, F, F, F, O, O, W, V, V, V, V, W, B, B, B, B, B, W, V, V, V, V, V, V], // 7
  [V, V, V, W, O, O, F, F, F, F, F, F, F, F, W, V, V, V, V, W, B, B, B, B, B, W, V, V, V, V, V, V], // 8
  [V, V, V, W, O, O, F, F, F, F, F, O, O, O, W, V, V, V, W, W, W, W, B, W, W, W, V, V, V, V, V, V], // 9: Fireplace (11..13) | Bathroom door at col 22
  [V, V, V, W, O, O, F, F, F, F, F, O, O, O, W, V, V, V, W, S, S, S, S, S, S, W, V, V, V, V, V, V], // 10: Fireplace | Upper Hallway
  [V, V, V, W, F, F, F, F, F, F, F, O, O, O, W, V, V, V, W, S, S, S, S, S, S, W, V, V, V, V, V, V], // 11
  [V, V, V, W, F, F, F, F, F, F, F, O, O, O, W, W, W, W, W, S, S, S, S, S, S, W, V, V, V, V, V, V], // 12: Corridor north wall (Locked door at 16..17)
  [V, V, V, W, F, F, F, F, F, F, F, F, F, F, F, S, S, S, S, S, S, S, S, S, S, W, W, W, W, W, V, V], // 13: Wood->Stone threshold at col 15 | Stairs north wall
  [V, V, V, W, F, F, O, O, O, O, O, F, F, F, F, S, S, S, S, S, S, S, S, S, S, T, T, T, T, W, V, V], // 14: Living room couch (6..10) | Stairs (25..28)
  [V, V, V, W, F, F, O, O, O, O, O, F, F, F, F, S, S, S, S, S, S, S, S, S, S, T, T, T, T, W, V, V], // 15
  [V, V, V, W, F, F, F, F, F, F, F, F, F, F, F, S, S, S, S, S, S, S, S, S, S, T, T, T, T, W, V, V], // 16
  [V, V, V, W, F, F, F, F, F, F, F, F, F, F, W, W, W, W, W, S, S, S, S, S, S, T, T, T, T, W, V, V], // 17
  [V, V, V, W, F, F, F, O, O, O, F, F, F, F, W, V, V, V, W, O, S, S, S, S, S, W, W, W, W, W, V, V], // 18: Chess board (7..9) | Coat hangers (19)
  [V, V, V, W, F, F, F, O, O, O, F, F, F, F, W, V, V, V, W, O, S, S, S, S, S, W, V, V, V, V, V, V], // 19
  [V, V, V, W, F, F, F, F, F, F, F, F, F, F, W, V, V, V, W, O, S, S, S, S, S, W, V, V, V, V, V, V], // 20
  [V, V, V, W, F, F, F, F, F, F, F, F, F, F, W, V, V, V, W, S, S, S, S, S, S, W, V, V, V, V, V, V], // 21: Window-gazing NPC at col 11.5, row 21
  [V, V, V, W, F, F, F, F, F, F, F, F, F, F, W, V, V, V, W, S, S, S, S, S, S, W, V, V, V, V, V, V], // 22
  [V, V, V, W, W, W, W, W, W, W, W, W, W, W, W, V, V, V, W, W, W, W, W, W, W, W, V, V, V, V, V, V], // 23: Big south windows (5..8, 10..13) | Front door (21..22)
  [V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V], // 24
  [V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V], // 25
  [V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V], // 26
  [V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V], // 27
];

export const BASEMENT_MAP: TileMap = {
  cols: MAP_COLS,
  rows: MAP_ROWS,
  tileSize: TILE_SIZE,
  tiles: BASEMENT_TILES,
};

/** Spawn next to "the fireplace" inside "the library" when arriving via the chimney. */
export const BASEMENT_FIREPLACE_SPAWN = {
  x: 9.5 * TILE_SIZE,
  y: 10.5 * TILE_SIZE,
  facing: 'left' as Direction,
};

/** Spawn on the stairs when returning to `level-basement` after having used the stairs. */
export const BASEMENT_STAIRS_SPAWN = {
  x: 25.5 * TILE_SIZE,
  y: 15.5 * TILE_SIZE,
  facing: 'left' as Direction,
};

/** Character standing by the extra big south windows in the basement living room, looking out. */
export const BASEMENT_WINDOW_NPC: Rect & { facing: Direction } = {
  x: 11 * TILE_SIZE + 2,
  y: 21 * TILE_SIZE + 2,
  width: 12,
  height: 12,
  facing: 'down',
};

/** Locked door on the north wall of the basement hallway corridor. */
export const BASEMENT_HALL_NORTH_DOOR_BOUNDS: Rect = {
  x: 16 * TILE_SIZE,
  y: 12 * TILE_SIZE,
  width: 2 * TILE_SIZE,
  height: TILE_SIZE,
};

/** Locked front door on the south wall of the basement hallway. */
export const BASEMENT_FRONT_DOOR_BOUNDS: Rect = {
  x: 21 * TILE_SIZE,
  y: 23 * TILE_SIZE,
  width: 2 * TILE_SIZE,
  height: TILE_SIZE,
};

/** Collidable door to the basement bathroom (deleted when opened). */
export const BASEMENT_BATHROOM_DOOR_BOUNDS: Rect = {
  x: 22 * TILE_SIZE,
  y: 9 * TILE_SIZE,
  width: TILE_SIZE,
  height: TILE_SIZE,
};

/** Black fog-of-war mask hiding the entire basement bathroom until its door is opened. */
export const BASEMENT_BATHROOM_HIDDEN_MASK: Rect = {
  x: 19 * TILE_SIZE,
  y: 3 * TILE_SIZE,
  width: 7 * TILE_SIZE,
  height: 6 * TILE_SIZE,
};

/** Invisible collision box halfway up the stairs that offers "Walk upstairs". */
export const BASEMENT_STAIRS_TRIGGER_BOUNDS: Rect = {
  x: 27 * TILE_SIZE,
  y: 14 * TILE_SIZE,
  width: 2 * TILE_SIZE,
  height: 4 * TILE_SIZE,
};

export const USED_STAIRS_STATE_KEY = 'usedStairs';

export class LevelBasement implements GameLevel {
  public readonly id: LevelId = 'level-basement';
  public readonly map: TileMap = BASEMENT_MAP;
  public doors: CollidableDoor[];
  public readonly windowNpc = { ...BASEMENT_WINDOW_NPC };

  constructor() {
    this.doors = [
      {
        id: 'basement-bathroom-door',
        bounds: { ...BASEMENT_BATHROOM_DOOR_BOUNDS },
        hiddenRegions: [{ ...BASEMENT_BATHROOM_HIDDEN_MASK }],
      },
    ];
  }

  public enter(player: Player): void {
    const hasUsedStairs = Boolean(player.states.get(USED_STAIRS_STATE_KEY));
    if (hasUsedStairs) {
      player.x = BASEMENT_STAIRS_SPAWN.x;
      player.y = BASEMENT_STAIRS_SPAWN.y;
      player.facing = BASEMENT_STAIRS_SPAWN.facing;
    } else {
      player.x = BASEMENT_FIREPLACE_SPAWN.x;
      player.y = BASEMENT_FIREPLACE_SPAWN.y;
      player.facing = BASEMENT_FIREPLACE_SPAWN.facing;
    }
    player.isMoving = false;
    player.walkTimer = 0;
  }

  public getSolidObstacles(): readonly Rect[] {
    return [
      this.windowNpc,
      BASEMENT_STAIRS_TRIGGER_BOUNDS,
      ...this.doors.map((d) => d.bounds),
    ];
  }

  public getInteractables(): Interactable[] {
    const list: Interactable[] = [
      {
        id: 'basement-hall-north-door',
        bounds: { ...BASEMENT_HALL_NORTH_DOOR_BOUNDS },
        promptText: 'Open door',
        dialogueLines: ["It's locked."],
      },
      {
        id: 'basement-front-door',
        bounds: { ...BASEMENT_FRONT_DOOR_BOUNDS },
        promptText: 'Open door',
        dialogueLines: ["It's locked."],
      },
      {
        id: 'basement-stairs-up',
        bounds: { ...BASEMENT_STAIRS_TRIGGER_BOUNDS },
        promptText: 'Walk upstairs',
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
    player: Player,
    ctx: LevelTransitionContext
  ): boolean {
    // Check if interacting with a closed collidable door (e.g. bathroom door) -> delete the door!
    const doorIdx = this.doors.findIndex((d) => d.id === interactableId);
    if (doorIdx !== -1) {
      this.doors.splice(doorIdx, 1);
      return true;
    }

    if (interactableId === 'basement-stairs-up') {
      player.states.set(USED_STAIRS_STATE_KEY, true);
      ctx.loadLevel('level-upstairs');
      return true;
    }

    return false;
  }
}
