import { Rect } from '../entities/player';

export const TILE_SIZE = 16;
export const MAP_COLS = 32; // 32 * 16 = 512px (2x previous width)
export const MAP_ROWS = 28; // 28 * 16 = 448px (2x previous height)

export enum TileType {
  Snow = 0,
  Tree = 1,
  Road = 2,
  Thuja = 3,
  Hedge = 4,
  RoofDark = 5,
  HouseWallWindow = 6,
  HousePorch = 7,
  HouseDoor = 8,
  CabinWall = 9,
  ShedRedDoor = 10,
  BlueGarage = 11,
  PatioTable = 12,
  HouseWallPlain = 13,
  ElectricCar = 14,
  Motorcycle = 15,
}

export interface TileMap {
  cols: number;
  rows: number;
  tileSize: number;
  tiles: TileType[][];
}

// Coordinates of the Main House front entrance door on the 32x28 map
export const HOUSE_DOOR_COL = 13;
export const HOUSE_DOOR_ROW = 9;

// Starting coordinates at the bottom of the driveway, looking straight up toward the house
export const PLAYER_START_X = 14.5 * TILE_SIZE;
export const PLAYER_START_Y = 25.5 * TILE_SIZE;

// Bounding box of the visibly damaged, sparking spot on the EV charging cable (col 14, row 22)
export const DAMAGED_WIRE_HAZARD: Rect = {
  x: 14 * TILE_SIZE + 4,
  y: 22 * TILE_SIZE + 3,
  width: 14,
  height: 10,
};

/**
 * Large 32x28 Winter Rensbo Yard Layout (inspired by inspiration/map.jpeg):
 * - Snow-covered pine/birch forest along the top ridge (rows 0-2)
 * - Large 2-story Main House (13 tiles wide x 7 tiles tall: cols 4..16, rows 3..9)
 * - Two wooden guest cottages ("stugor") to the upper-right (cols 19..22 and cols 25..28, rows 5..8)
 * - Gravel terrace in front of the house (rows 10..11) feeding into the main driveway (cols 13..17, rows 12..27)
 * - Tall slender snow-capped Thuja trees lining both sides of the driveway
 * - Snow-blanketed lawn on the left with round bush, 2x2 outdoor dining patio, apple tree, and diagonal hedgerow
 * - Blue garage in the bottom-left corner (cols 2..7, rows 21..25) with wallbox EV charger at (col 7, row 22)
 * - Electric Car parked on the driveway where the road turns right (cols 17..19, rows 21..22), connected by
 *   a charging cable across row 22 with a damaged sparking hazard at (col 14, row 22)
 * - White shed with bright red double doors on the right (cols 25..29, rows 16..19), with a black motorcycle
 *   parked outside on the right side of the car (cols 25..26, row 21)
 */
export const STARTER_MAP: TileMap = {
  cols: MAP_COLS,
  rows: MAP_ROWS,
  tileSize: TILE_SIZE,
  tiles: [
    //0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 0
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 1
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 2
    [1, 1, 0, 0, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1], // 3
    [1, 1, 0, 0, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1], // 4
    [1, 0, 0, 0, 5, 5, 5, 5, 5, 7, 7, 7, 5, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 1], // 5
    [1, 0, 0, 0, 13, 6, 6, 13, 13, 7, 7, 7, 13, 6, 6, 13, 13, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 1], // 6
    [1, 0, 0, 0, 13, 13, 13, 13, 13, 7, 7, 7, 13, 13, 13, 13, 13, 0, 0, 9, 9, 9, 9, 0, 0, 9, 9, 9, 9, 0, 0, 1], // 7
    [1, 0, 0, 0, 13, 6, 6, 13, 13, 7, 7, 7, 13, 13, 6, 6, 13, 0, 0, 9, 9, 9, 9, 0, 0, 9, 9, 9, 9, 0, 0, 1], // 8
    [1, 0, 0, 0, 13, 13, 13, 13, 13, 7, 7, 7, 13, 8, 13, 13, 13, 0, 0, 0, 0, 0, 0, 4, 4, 0, 0, 0, 0, 0, 0, 1], // 9
    [1, 0, 0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0, 3, 0, 0, 4, 4, 0, 0, 0, 0, 0, 0, 0, 1], // 10
    [1, 0, 0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 11
    [1, 0, 0, 0, 0, 4, 4, 0, 0, 0, 0, 0, 2, 2, 2, 2, 2, 2, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 12
    [1, 0, 0, 0, 0, 4, 4, 0, 0, 0, 0, 0, 3, 2, 2, 2, 2, 2, 3, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 13
    [1, 0, 0, 0, 0, 0, 0, 12, 12, 0, 0, 0, 3, 2, 2, 2, 2, 2, 3, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 1], // 14
    [1, 0, 0, 0, 0, 0, 0, 12, 12, 0, 0, 0, 0, 2, 2, 2, 2, 2, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 1], // 15
    [1, 0, 0, 0, 4, 4, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 5, 5, 5, 5, 5, 0, 1], // 16
    [1, 0, 0, 0, 0, 4, 4, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 5, 5, 5, 5, 5, 0, 1], // 17
    [1, 0, 0, 0, 0, 0, 4, 4, 0, 0, 0, 0, 3, 2, 2, 2, 2, 2, 3, 0, 3, 0, 0, 0, 0, 10, 10, 10, 10, 10, 0, 1], // 18
    [1, 0, 0, 0, 0, 0, 0, 4, 4, 0, 0, 0, 3, 2, 2, 2, 2, 2, 3, 0, 3, 0, 0, 0, 0, 10, 10, 10, 10, 10, 0, 1], // 19
    [1, 0, 0, 0, 0, 0, 0, 0, 4, 4, 0, 0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0, 0, 0, 1], // 20
    [1, 0, 5, 5, 5, 5, 5, 5, 0, 4, 4, 0, 0, 2, 2, 2, 2, 14, 14, 14, 2, 2, 2, 2, 2, 15, 15, 2, 0, 0, 0, 1], // 21: Blue garage roof | Electric Car (17..19) | Motorcycle (25..26)
    [1, 0, 5, 5, 5, 5, 5, 5, 0, 0, 0, 0, 0, 2, 2, 2, 2, 14, 14, 14, 2, 2, 2, 2, 2, 2, 2, 2, 0, 0, 0, 1], // 22: Charging wire cols 8..16 -> Car (17..19)
    [1, 0, 11, 11, 11, 11, 11, 11, 0, 0, 0, 0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0, 0, 0, 0, 0, 1], // 23
    [1, 0, 11, 11, 11, 11, 11, 11, 0, 0, 0, 0, 0, 2, 2, 2, 2, 2, 4, 4, 4, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 24
    [1, 0, 11, 11, 11, 11, 11, 11, 0, 0, 0, 0, 0, 2, 2, 2, 2, 0, 4, 4, 4, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 25
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 26
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 27
  ],
};

export const WALKABLE_TILES: ReadonlySet<TileType> = new Set([
  TileType.Snow,
  TileType.Road,
]);

export function isSolidTile(map: TileMap, col: number, row: number): boolean {
  if (col < 0 || col >= map.cols || row < 0 || row >= map.rows) {
    return true;
  }
  return !WALKABLE_TILES.has(map.tiles[row][col]);
}

export function isRectCollidingWithMap(
  map: TileMap,
  x: number,
  y: number,
  width: number,
  height: number
): boolean {
  const startCol = Math.floor(x / map.tileSize);
  const endCol = Math.floor((x + width - 0.001) / map.tileSize);
  const startRow = Math.floor(y / map.tileSize);
  const endRow = Math.floor((y + height - 0.001) / map.tileSize);

  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      if (isSolidTile(map, c, r)) {
        return true;
      }
    }
  }
  return false;
}
