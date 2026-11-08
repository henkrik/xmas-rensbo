import { Cat, createCat } from '../../entities/cat';
import { Direction, Player, Rect, rectsIntersect } from '../../entities/player';
import {
  ConeOfSight,
  DEFAULT_CONE_OF_SIGHT_DISTANCE,
  DEFAULT_CONE_OF_SIGHT_FOV,
} from '../../entities/sight';
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
  [V, W, F, F, O, O, F, F, F, W, W, W, W, F, F, W, W, B, B, B, W, W, F, F, F, F, F, F, W, V, V, V], // 9: North wall of altar alcove (9..12) | Kitchen entrance (13..14)
  [V, W, F, F, F, F, F, F, F, W, O, O, W, F, F, W, W, W, B, W, W, W, W, W, F, W, W, W, W, V, V, V], // 10: Altar (10..11) | Altar east wall (12) | Kitchen entrance (13..14) | Shower door (18) | Bedroom door (24)
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
  width: 8 * TILE_SIZE,
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
  height: 5 * TILE_SIZE,
};

/** Albin walking NPC in dining room (col 7, rows 5..9). */
export const UPSTAIRS_ALBIN_START_Y = 5 * TILE_SIZE + 2;
export const UPSTAIRS_ALBIN_END_Y = 9 * TILE_SIZE + 2;
export const UPSTAIRS_ALBIN_X = 7 * TILE_SIZE + 2;
export const UPSTAIRS_ALBIN_SPEED = 15; // px/s
export const UPSTAIRS_INTRO_STATE_KEY = 'upstairsIntroTriggered';

/** Present item pickup and distracted states */
export const DIANA_PRESENT_TAKEN_KEY = 'upstairsDianaPresentTaken';
export const SIMON_PRESENT_TAKEN_KEY = 'upstairsSimonPresentTaken';
export const DIANA_DISTRACTED_KEY = 'upstairsDianaDistracted';
export const SIMON_DISTRACTED_KEY = 'upstairsSimonDistracted';

/** Diana's present on the floor in upstairs bedroom, 1 tile south of the bed (cols 25..26, row 8). */
export const UPSTAIRS_DIANA_PRESENT_BOUNDS: Rect = {
  x: 25.5 * TILE_SIZE + 2,
  y: 8 * TILE_SIZE + 4,
  width: 10,
  height: 10,
};

/** Simon's present inside the office in the southeast corner (col 24, row 17). */
export const UPSTAIRS_SIMON_PRESENT_BOUNDS: Rect = {
  x: 24 * TILE_SIZE + 3,
  y: 17 * TILE_SIZE + 3,
  width: 10,
  height: 10,
};

/** Henrik & Tanja in table room (left and right of table at cols 11..12, row 17). */
export const UPSTAIRS_HENRIK_NPC: Rect & { facing: Direction } = {
  x: 10 * TILE_SIZE + 2,
  y: 17 * TILE_SIZE + 2,
  width: 12,
  height: 12,
  facing: 'down',
};

export const UPSTAIRS_TANJA_NPC: Rect & { facing: Direction } = {
  x: 13 * TILE_SIZE + 2,
  y: 17 * TILE_SIZE + 2,
  width: 12,
  height: 12,
  facing: 'up',
};

/** Diana & Simon in living room. */
export const UPSTAIRS_DIANA_NPC: Rect & { facing: Direction } = {
  x: 5 * TILE_SIZE + 2, // 1 tile south of couch (col 5, row 12)
  y: 12 * TILE_SIZE + 2,
  width: 12,
  height: 12,
  facing: 'down',
};

export const UPSTAIRS_SIMON_NPC: Rect & { facing: Direction } = {
  x: 7 * TILE_SIZE + 2, // 1 tile south of right armchair (col 7, row 14)
  y: 14 * TILE_SIZE + 2,
  width: 12,
  height: 12,
  facing: 'left',
};

/** Anne-Marie in bedroom (north of door below window). */
export const UPSTAIRS_ANNE_MARIE_NPC: Rect & { facing: Direction } = {
  x: 24 * TILE_SIZE + 2,
  y: 5 * TILE_SIZE + 2,
  width: 12,
  height: 12,
  facing: 'up',
};
export const UPSTAIRS_CUPBOARD_BOUNDS: Rect = {
  x: 2 * TILE_SIZE,
  y: 6 * TILE_SIZE,
  width: TILE_SIZE,
  height: 2 * TILE_SIZE,
};

/** Computer on desk in the office (col 21, row 16). */
export const UPSTAIRS_COMPUTER_BOUNDS: Rect = {
  x: 21 * TILE_SIZE,
  y: 16 * TILE_SIZE,
  width: TILE_SIZE,
  height: TILE_SIZE,
};

export const ARJAN_KEY_STATE_KEY = 'upstairsArjanKey';

/** Closed collidable door to the room with the second kitchen table. */
export const UPSTAIRS_TABLE_ROOM_DOOR_BOUNDS: Rect = {
  x: 11 * TILE_SIZE,
  y: 15 * TILE_SIZE,
  width: TILE_SIZE,
  height: TILE_SIZE,
};

/**
 * Fog-of-war masks for the southern-most room (Table Room).
 * Leaves uncovered:
 * - West wall tiles down through row 17 (rows 15..17, leaving the row 17 corner with the living room wall uncovered).
 * - East wall tiles down through row 18 (rows 15..18, leaving the row 18 corner with the stairs wall uncovered).
 * Fog on the west wall starts 1 tile further down (at row 18).
 * Fog on the east wall starts 1 tile further down (at row 19).
 * Covers the rest of the room interior, south wall, and remaining west/east walls.
 */
export const UPSTAIRS_TABLE_ROOM_HIDDEN_MASKS: readonly Rect[] = [
  // Rows 16..17: interior cols 10..13 (excluding west wall col 9 & east wall col 14)
  {
    x: 10 * TILE_SIZE,
    y: 16 * TILE_SIZE,
    width: 4 * TILE_SIZE,
    height: 2 * TILE_SIZE,
  },
  // Row 18: west wall col 9 + interior cols 10..13 (starts west wall fog at row 18, excluding east wall col 14)
  {
    x: 9 * TILE_SIZE,
    y: 18 * TILE_SIZE,
    width: 5 * TILE_SIZE,
    height: 1 * TILE_SIZE,
  },
  // Rows 19..21: full width cols 9..14 (starts east wall fog at row 19, full width for south wall)
  {
    x: 9 * TILE_SIZE,
    y: 19 * TILE_SIZE,
    width: 6 * TILE_SIZE,
    height: 3 * TILE_SIZE,
  },
];

export const UPSTAIRS_TABLE_ROOM_HIDDEN_MASK: Rect =
  UPSTAIRS_TABLE_ROOM_HIDDEN_MASKS[0];

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
  public cat: Cat;

  // Upstairs NPCs
  public albinY: number = UPSTAIRS_ALBIN_START_Y;
  public albinDir: 1 | -1 = 1; // 1 = walking down (south), -1 = walking up (north)
  public albinCone: ConeOfSight;

  public readonly henrikNpc = { ...UPSTAIRS_HENRIK_NPC };
  public henrikAngle: number = Math.PI / 2; // Facing south initially
  public henrikTimer: number = 0;
  public henrikCone: ConeOfSight;

  public readonly tanjaNpc = { ...UPSTAIRS_TANJA_NPC };
  public tanjaCone: ConeOfSight;

  public readonly dianaNpc = { ...UPSTAIRS_DIANA_NPC };
  public dianaCone: ConeOfSight | null = null;

  public readonly simonNpc = { ...UPSTAIRS_SIMON_NPC };
  public simonCone: ConeOfSight | null = null;

  public readonly anneMarieNpc = { ...UPSTAIRS_ANNE_MARIE_NPC };
  public anneMarieAngle: number = -Math.PI / 2; // Facing north initially
  public anneMarieTimer: number = 0;
  public anneMarieCone: ConeOfSight;

  public intruderDetected: boolean = false;

  constructor() {
    this.cat = createCat();
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
        hiddenRegions: UPSTAIRS_TABLE_ROOM_HIDDEN_MASKS.map((r) => ({ ...r })),
      },
    ];

    this.albinCone = new ConeOfSight(
      { x: UPSTAIRS_ALBIN_X + TILE_SIZE / 2, y: this.albinY + TILE_SIZE / 2 },
      Math.PI / 2, // south
      undefined,
      this.map
    );

    this.henrikCone = new ConeOfSight(
      { x: this.henrikNpc.x + TILE_SIZE / 2, y: this.henrikNpc.y + TILE_SIZE / 2 },
      this.henrikAngle,
      undefined,
      this.map
    );

    this.tanjaCone = new ConeOfSight(
      { x: this.tanjaNpc.x + TILE_SIZE / 2, y: this.tanjaNpc.y + TILE_SIZE / 2 },
      -Math.PI / 2, // north
      undefined,
      this.map
    );

    // Diana faces the Christmas tree (down-left) with a 50% wider field of view
    const dianaTreeAngle = Math.atan2(
      15.5 * TILE_SIZE - (this.dianaNpc.y + TILE_SIZE / 2),
      3.0 * TILE_SIZE - (this.dianaNpc.x + TILE_SIZE / 2)
    );
    this.dianaCone = new ConeOfSight(
      { x: this.dianaNpc.x + TILE_SIZE / 2, y: this.dianaNpc.y + TILE_SIZE / 2 },
      dianaTreeAngle,
      DEFAULT_CONE_OF_SIGHT_DISTANCE,
      this.map,
      DEFAULT_CONE_OF_SIGHT_FOV * 1.5
    );

    // Simon faces the Christmas tree (left / slightly down-left) with a 50% wider field of view
    const simonTreeAngle = Math.atan2(
      15.5 * TILE_SIZE - (this.simonNpc.y + TILE_SIZE / 2),
      3.0 * TILE_SIZE - (this.simonNpc.x + TILE_SIZE / 2)
    );
    this.simonCone = new ConeOfSight(
      { x: this.simonNpc.x + TILE_SIZE / 2, y: this.simonNpc.y + TILE_SIZE / 2 },
      simonTreeAngle,
      DEFAULT_CONE_OF_SIGHT_DISTANCE,
      this.map,
      DEFAULT_CONE_OF_SIGHT_FOV * 1.5
    );

    this.anneMarieCone = new ConeOfSight(
      { x: this.anneMarieNpc.x + TILE_SIZE / 2, y: this.anneMarieNpc.y + TILE_SIZE / 2 },
      this.anneMarieAngle,
      undefined,
      this.map
    );
  }

  public enter(player: Player): void {
    player.x = UPSTAIRS_STAIRS_SPAWN.x;
    player.y = UPSTAIRS_STAIRS_SPAWN.y;
    player.facing = UPSTAIRS_STAIRS_SPAWN.facing;
    player.isMoving = false;
    player.walkTimer = 0;

    // Reset Upstairs sight & timers
    this.intruderDetected = false;
    this.albinY = UPSTAIRS_ALBIN_START_Y;
    this.albinDir = 1;
    this.albinCone = new ConeOfSight(
      { x: UPSTAIRS_ALBIN_X + TILE_SIZE / 2, y: this.albinY + TILE_SIZE / 2 },
      Math.PI / 2,
      undefined,
      this.map
    );

    this.henrikAngle = Math.PI / 2;
    this.henrikTimer = 0;
    this.henrikCone = new ConeOfSight(
      { x: this.henrikNpc.x + TILE_SIZE / 2, y: this.henrikNpc.y + TILE_SIZE / 2 },
      this.henrikAngle,
      undefined,
      this.map
    );

    this.tanjaCone = new ConeOfSight(
      { x: this.tanjaNpc.x + TILE_SIZE / 2, y: this.tanjaNpc.y + TILE_SIZE / 2 },
      -Math.PI / 2,
      undefined,
      this.map
    );

    if (!player.states.get(DIANA_DISTRACTED_KEY)) {
      const dianaTreeAngle = Math.atan2(
        15.5 * TILE_SIZE - (this.dianaNpc.y + TILE_SIZE / 2),
        3.0 * TILE_SIZE - (this.dianaNpc.x + TILE_SIZE / 2)
      );
      this.dianaCone = new ConeOfSight(
        { x: this.dianaNpc.x + TILE_SIZE / 2, y: this.dianaNpc.y + TILE_SIZE / 2 },
        dianaTreeAngle,
        DEFAULT_CONE_OF_SIGHT_DISTANCE,
        this.map,
        DEFAULT_CONE_OF_SIGHT_FOV * 1.5
      );
    } else {
      this.dianaCone = null;
    }

    if (!player.states.get(SIMON_DISTRACTED_KEY)) {
      const simonTreeAngle = Math.atan2(
        15.5 * TILE_SIZE - (this.simonNpc.y + TILE_SIZE / 2),
        3.0 * TILE_SIZE - (this.simonNpc.x + TILE_SIZE / 2)
      );
      this.simonCone = new ConeOfSight(
        { x: this.simonNpc.x + TILE_SIZE / 2, y: this.simonNpc.y + TILE_SIZE / 2 },
        simonTreeAngle,
        DEFAULT_CONE_OF_SIGHT_DISTANCE,
        this.map,
        DEFAULT_CONE_OF_SIGHT_FOV * 1.5
      );
    } else {
      this.simonCone = null;
    }

    this.anneMarieAngle = -Math.PI / 2;
    this.anneMarieTimer = 0;
    this.anneMarieCone = new ConeOfSight(
      { x: this.anneMarieNpc.x + TILE_SIZE / 2, y: this.anneMarieNpc.y + TILE_SIZE / 2 },
      this.anneMarieAngle,
      undefined,
      this.map
    );
  }

  public getSolidObstacles(): readonly Rect[] {
    return [
      UPSTAIRS_STAIRS_TRIGGER_BOUNDS,
      { x: UPSTAIRS_ALBIN_X, y: this.albinY, width: 12, height: 12 },
      this.henrikNpc,
      this.tanjaNpc,
      this.dianaNpc,
      this.simonNpc,
      this.anneMarieNpc,
      ...this.doors.map((d) => d.bounds),
    ];
  }

  public getInteractables(player?: Player): Interactable[] {
    const list: Interactable[] = [
      {
        id: 'upstairs-stairs-down',
        bounds: { ...UPSTAIRS_STAIRS_TRIGGER_BOUNDS },
        promptText: 'Walk downstairs',
        dialogueLines: [],
      },
      {
        id: 'upstairs-dining-cupboard',
        bounds: { ...UPSTAIRS_CUPBOARD_BOUNDS },
        promptText: 'Inspect',
        dialogueLines: [],
      },
      {
        id: 'upstairs-office-pc',
        bounds: { ...UPSTAIRS_COMPUTER_BOUNDS },
        promptText: 'Start PC',
        dialogueLines: [
          'Hmm... is this where Arjan pretends to work? It\'s just a bunch of pictures of Anne-Marie.',
          'Hey there\'s actually a python script here, shall we run it?',
          'You are now addicted to Olexa\'s text-based christmas adventure.',
        ],
      },
    ];

    // Diana's Present in bedroom (if not already taken)
    if (!player?.states.get(DIANA_PRESENT_TAKEN_KEY)) {
      list.push({
        id: 'upstairs-diana-present',
        bounds: { ...UPSTAIRS_DIANA_PRESENT_BOUNDS },
        promptText: "Take Diana's Present",
        dialogueLines: [],
      });
    }

    // Simon's Present in office (if not already taken)
    if (!player?.states.get(SIMON_PRESENT_TAKEN_KEY)) {
      list.push({
        id: 'upstairs-simon-present',
        bounds: { ...UPSTAIRS_SIMON_PRESENT_BOUNDS },
        promptText: "Take Simon's Present",
        dialogueLines: [],
      });
    }

    // Diana NPC interaction (Inspect or Give present)
    if (!player?.states.get(DIANA_DISTRACTED_KEY)) {
      const hasDianaPresent = Boolean(player?.states.get(DIANA_PRESENT_TAKEN_KEY));
      list.push({
        id: 'upstairs-diana-npc',
        bounds: { ...this.dianaNpc },
        promptText: hasDianaPresent ? 'Give present' : 'Inspect',
        dialogueLines: [],
      });
    }

    // Simon NPC interaction (Inspect or Give present)
    if (!player?.states.get(SIMON_DISTRACTED_KEY)) {
      const hasSimonPresent = Boolean(player?.states.get(SIMON_PRESENT_TAKEN_KEY));
      list.push({
        id: 'upstairs-simon-npc',
        bounds: { ...this.simonNpc },
        promptText: hasSimonPresent ? 'Give present' : 'Inspect',
        dialogueLines: [],
      });
    }

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
    if (interactableId === 'upstairs-dining-cupboard') {
      player.states.set(ARJAN_KEY_STATE_KEY, true);
      ctx.openDialogue([
        "You found a hidden compartment containing a key... it's Arjan's key!",
      ]);
      return true;
    }

    if (interactableId === 'upstairs-diana-present') {
      player.states.set(DIANA_PRESENT_TAKEN_KEY, true);
      ctx.openDialogue(["You picked up Diana's Present."]);
      return true;
    }

    if (interactableId === 'upstairs-simon-present') {
      player.states.set(SIMON_PRESENT_TAKEN_KEY, true);
      ctx.openDialogue(["You picked up Simon's present."]);
      return true;
    }

    if (interactableId === 'upstairs-diana-npc') {
      const hasDianaPresent = Boolean(player.states.get(DIANA_PRESENT_TAKEN_KEY));
      if (hasDianaPresent) {
        player.states.set(DIANA_DISTRACTED_KEY, true);
        this.dianaCone = null;
        ctx.openDialogue(
          [
            'Hmm? A present...?',
            "Diana is completely distracted. They won't stop me reaching the tree now.",
          ],
          undefined,
          'Diana'
        );
      } else {
        ctx.openDialogue([
          'Hmm... I have to find something to distract Diana with...',
        ]);
      }
      return true;
    }

    if (interactableId === 'upstairs-simon-npc') {
      const hasSimonPresent = Boolean(player.states.get(SIMON_PRESENT_TAKEN_KEY));
      if (hasSimonPresent) {
        player.states.set(SIMON_DISTRACTED_KEY, true);
        this.simonCone = null;
        ctx.openDialogue(
          [
            'Hmm? A present...?',
            "Simon is completely distracted. They won't stop me reaching the tree now.",
          ],
          undefined,
          'Simon'
        );
      } else {
        ctx.openDialogue([
          'Hmm... I have to find something to distract Simon with...',
        ]);
      }
      return true;
    }

    const doorIdx = this.doors.findIndex((d) => d.id === interactableId);
    if (doorIdx !== -1) {
      const door = this.doors[doorIdx];
      if (door.id === 'upstairs-office-door') {
        const hasKey = Boolean(player.states.get(ARJAN_KEY_STATE_KEY));
        if (!hasKey) {
          ctx.openDialogue([
            'The office is locked... hmm, where would Arjan hide a key?',
          ]);
          return true;
        }
      }

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

  /**
   * Updates all Upstairs NPCs movement, rotation, and line/cone of sight detection.
   */
  public updateNpcSight(
    dtSeconds: number,
    player: Player,
    ctx: LevelTransitionContext
  ): void {
    if (this.intruderDetected) {
      return;
    }

    // 1. Albin walks up and down in dining room (col 7, rows 5..9)
    this.albinY += this.albinDir * UPSTAIRS_ALBIN_SPEED * dtSeconds;
    if (this.albinDir === 1 && this.albinY >= UPSTAIRS_ALBIN_END_Y) {
      this.albinY = UPSTAIRS_ALBIN_END_Y;
      this.albinDir = -1; // change to walking north
    } else if (this.albinDir === -1 && this.albinY <= UPSTAIRS_ALBIN_START_Y) {
      this.albinY = UPSTAIRS_ALBIN_START_Y;
      this.albinDir = 1; // change to walking south
    }

    // Cone faces north (-PI/2) when walking north, south (PI/2) when walking south
    const albinAngle = this.albinDir === 1 ? Math.PI / 2 : -Math.PI / 2;
    this.albinCone = new ConeOfSight(
      { x: UPSTAIRS_ALBIN_X + TILE_SIZE / 2, y: this.albinY + TILE_SIZE / 2 },
      albinAngle,
      undefined,
      this.map
    );

    if (this.albinCone.checkDetection(player)) {
      this.triggerDetection(
        ctx,
        player,
        'Albin',
        'I was looking for Rosanna... but instead I found you!!'
      );
      return;
    }

    // 2. Henrik & Tanja in table room (only if table room door is opened!)
    const isTableRoomDoorOpen = !this.doors.some(
      (d) => d.id === 'upstairs-table-room-door'
    );
    if (isTableRoomDoorOpen) {
      this.henrikTimer += dtSeconds;
      if (this.henrikTimer >= 1.0) {
        this.henrikTimer -= 1.0;
        // rotates 45 degrees counter-clockwise (-PI/4)
        this.henrikAngle -= Math.PI / 4;
        this.henrikCone = new ConeOfSight(
          { x: this.henrikNpc.x + TILE_SIZE / 2, y: this.henrikNpc.y + TILE_SIZE / 2 },
          this.henrikAngle,
          undefined,
          this.map
        );
      }

      if (this.henrikCone.checkDetection(player)) {
        this.triggerDetection(
          ctx,
          player,
          'Henrik',
          'Santa? Perfect you can play with Asta!!'
        );
        return;
      }

      if (this.tanjaCone.checkDetection(player)) {
        this.triggerDetection(
          ctx,
          player,
          'Tanja',
          'I like your suit, red like the color of wine.'
        );
        return;
      }
    }

    // 3. Diana & Simon in living room
    if (this.dianaCone && this.dianaCone.checkDetection(player)) {
      this.triggerDetection(
        ctx,
        player,
        'Diana',
        'Do you have any destilleries on the North pole?'
      );
      return;
    }

    if (this.simonCone && this.simonCone.checkDetection(player)) {
      this.triggerDetection(
        ctx,
        player,
        'Simon',
        'If I knew you were around here, I would have moved back to Sweden a long time ago.'
      );
      return;
    }

    // 4. Anne-Marie in bedroom (only if bedroom door is open!)
    const isBedroomDoorOpen = !this.doors.some(
      (d) => d.id === 'upstairs-bedroom-door'
    );
    if (isBedroomDoorOpen) {
      this.anneMarieTimer += dtSeconds;
      if (this.anneMarieTimer >= 1.0) {
        this.anneMarieTimer -= 1.0;
        // rotates 45 degrees
        this.anneMarieAngle += Math.PI / 4;
        this.anneMarieCone = new ConeOfSight(
          { x: this.anneMarieNpc.x + TILE_SIZE / 2, y: this.anneMarieNpc.y + TILE_SIZE / 2 },
          this.anneMarieAngle,
          undefined,
          this.map
        );
      }

      if (this.anneMarieCone.checkDetection(player)) {
        this.triggerDetection(
          ctx,
          player,
          'Anne-Marie',
          'What a coincidence, I was just reading a story about you.'
        );
        return;
      }
    }
  }

  private triggerDetection(
    ctx: LevelTransitionContext,
    player: Player,
    speaker: string,
    dialogue: string
  ): void {
    this.intruderDetected = true;
    player.isMoving = false;
    ctx.openDialogue(
      [dialogue],
      () => {
        ctx.loadLevel('level-upstairs');
        player.blinkTimer = 2.0; // HIT_BLINK_DURATION_SECONDS
      },
      speaker
    );
  }
}
