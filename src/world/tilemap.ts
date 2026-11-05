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

/**
 * Large 32x28 Rensbo Yard Layout (inspired by inspiration/map.jpeg):
 * - Dense pine forest along the top ridge (rows 0-2)
 * - Significantly larger Main House (13 tiles wide x 7 tiles tall: cols 4..16, rows 3..9)
 *   - 3 rows of pitched dark charcoal roofing (rows 3..5) with upper porch gable at cols 9..11
 *   - 2-story light-grey facade (rows 6..9) with multiple windows, 3-tile wide double-story white veranda (cols 9..11),
 *     and front entrance door with Christmas wreath at col 13, row 9
 * - Two guest cottages ("stugor") to the upper-right (cols 19..22 and cols 25..28, rows 5..8)
 * - Gravel terrace in front of the house (rows 10..11) feeding into the main driveway (cols 13..16, rows 12..27)
 * - Tall slender Thuja trees lining both sides of the driveway, with a gap at row 16 for the snowball throwers' line of fire
 * - Lawn on the left with round bush, 2x2 outdoor dining patio (cols 7..8, rows 14..15), and diagonal hedge row
 * - Blue garage in the bottom-left corner (cols 2..8, rows 21..25)
 * - White shed with bright red double doors on the right (cols 25..29, rows 16..19)
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
    [1, 1, 0, 0, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1], // 3: House top roof ridge
    [1, 1, 0, 0, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1], // 4: House middle roof
    [1, 0, 0, 0, 5, 5, 5, 5, 5, 7, 7, 7, 5, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 1], // 5: House lower roof + gable | Cottage roofs
    [1, 0, 0, 0, 13, 6, 6, 13, 13, 7, 7, 7, 13, 6, 6, 13, 13, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 1], // 6: House upper story windows & balcony
    [1, 0, 0, 0, 13, 13, 13, 13, 13, 7, 7, 7, 13, 13, 13, 13, 13, 0, 0, 9, 9, 9, 9, 0, 0, 9, 9, 9, 9, 0, 0, 1], // 7: House mid facade | Cottage walls
    [1, 0, 0, 0, 13, 6, 6, 13, 13, 7, 7, 7, 13, 13, 6, 6, 13, 0, 0, 9, 9, 9, 9, 0, 0, 9, 9, 9, 9, 0, 0, 1], // 8: House lower windows & porch
    [1, 0, 0, 0, 13, 13, 13, 13, 13, 7, 7, 7, 13, 8, 13, 13, 13, 0, 0, 0, 0, 0, 0, 4, 4, 0, 0, 0, 0, 0, 0, 1], // 9: House ground floor & Door (col 13, row 9)
    [1, 0, 0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0, 3, 0, 0, 4, 4, 0, 0, 0, 0, 0, 0, 0, 1], // 10: Gravel terrace in front of house
    [1, 0, 0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 11: Gravel terrace
    [1, 0, 0, 0, 0, 4, 4, 0, 0, 0, 0, 0, 2, 2, 2, 2, 2, 2, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 12: Bush by house | Upper driveway
    [1, 0, 0, 0, 0, 4, 4, 0, 0, 0, 0, 0, 3, 2, 2, 2, 2, 2, 3, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 13: Bush | Thujas flanking driveway
    [1, 0, 0, 0, 0, 0, 0, 12, 12, 0, 0, 0, 3, 2, 2, 2, 2, 2, 3, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 1], // 14: Patio table | Driveway
    [1, 0, 0, 0, 0, 0, 0, 12, 12, 0, 0, 0, 0, 2, 2, 2, 2, 2, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 1], // 15: Patio table | Driveway
    [1, 0, 0, 0, 4, 4, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 5, 5, 5, 5, 5, 0, 1], // 16: Snowball throwers at col 12 & col 18! | Shed roof
    [1, 0, 0, 0, 0, 4, 4, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 5, 5, 5, 5, 5, 0, 1], // 17: Diagonal hedge | Driveway | Shed roof
    [1, 0, 0, 0, 0, 0, 4, 4, 0, 0, 0, 0, 3, 2, 2, 2, 2, 2, 3, 0, 3, 0, 0, 0, 0, 10, 10, 10, 10, 10, 0, 1], // 18: Hedge | Thujas | Red-door shed wall
    [1, 0, 0, 0, 0, 0, 0, 4, 4, 0, 0, 0, 3, 2, 2, 2, 2, 2, 3, 0, 3, 0, 0, 0, 0, 10, 10, 10, 10, 10, 0, 1], // 19: Hedge | Thujas | Red-door shed wall
    [1, 0, 0, 0, 0, 0, 0, 0, 4, 4, 0, 0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0, 0, 0, 1], // 20: Lower gravel courtyard expands toward shed
    [1, 0, 5, 5, 5, 5, 5, 5, 0, 4, 4, 0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0, 0, 0, 1], // 21: Blue garage roof | Courtyard
    [1, 0, 5, 5, 5, 5, 5, 5, 0, 0, 4, 4, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0, 0, 0, 1], // 22: Blue garage roof | Courtyard
    [1, 0, 11, 11, 11, 11, 11, 11, 0, 0, 0, 4, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0, 0, 0, 0, 0, 1], // 23: Blue garage wall | Courtyard
    [1, 0, 11, 11, 11, 11, 11, 11, 0, 0, 0, 0, 0, 2, 2, 2, 2, 2, 4, 4, 4, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 24: Blue garage doors | Road | Foreground bushes
    [1, 0, 11, 11, 11, 11, 11, 11, 0, 0, 0, 0, 0, 2, 2, 2, 2, 0, 4, 4, 4, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 25: Santa starts at col 14.5, row 25.5!
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 26: Road entrance
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 27: Bottom tree border with road gate
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
