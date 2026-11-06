import { InputState } from '../core/input';
import { isRectCollidingWithMap, TileMap, TileType } from '../world/tilemap';

export type Direction = 'up' | 'down' | 'left' | 'right';

export const FOOTPRINT_DURATION_SECONDS = 3.0;
export const FOOTPRINT_STEP_INTERVAL_SECONDS = 0.14;

export interface Footprint {
  x: number;
  y: number;
  age: number;
  maxAge: number;
  foot: 'left' | 'right';
  facing: Direction;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Player {
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  facing: Direction;
  isMoving: boolean;
  walkTimer: number;
  blinkTimer: number;
  footprintSpawnTimer: number;
  nextFootprintFoot: 'left' | 'right';
}

export function createPlayer(x: number, y: number): Player {
  return {
    x,
    y,
    width: 12,
    height: 12,
    speed: 75, // pixels per second
    facing: 'up',
    isMoving: false,
    walkTimer: 0,
    blinkTimer: 0,
    footprintSpawnTimer: 0,
    nextFootprintFoot: 'left',
  };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function isPlayerOnSnowTile(player: Player, map: TileMap): boolean {
  const footCenterX = player.x + player.width / 2;
  const footCenterY = player.y + player.height - 2;
  const col = Math.floor(footCenterX / map.tileSize);
  const row = Math.floor(footCenterY / map.tileSize);
  if (col < 0 || col >= map.cols || row < 0 || row >= map.rows) {
    return false;
  }
  return map.tiles[row][col] === TileType.Snow;
}

export function updateFootprints(
  footprints: Footprint[],
  player: Player,
  map: TileMap,
  dtSeconds: number
): void {
  for (let i = footprints.length - 1; i >= 0; i--) {
    footprints[i].age += dtSeconds;
    if (footprints[i].age >= footprints[i].maxAge) {
      footprints.splice(i, 1);
    }
  }

  if (player.isMoving && isPlayerOnSnowTile(player, map)) {
    player.footprintSpawnTimer -= dtSeconds;
    while (player.footprintSpawnTimer <= 0) {
      const foot = player.nextFootprintFoot;
      const baseX = player.x + player.width / 2;
      const baseY = player.y + player.height - 1;

      const isVertical = player.facing === 'up' || player.facing === 'down';
      const fx = isVertical ? baseX + (foot === 'left' ? -3 : 1) : baseX - 1;
      const fy = isVertical ? baseY - 1 : baseY + (foot === 'left' ? -2 : 1);

      footprints.push({
        x: Math.round(fx),
        y: Math.round(fy),
        age: 0,
        maxAge: FOOTPRINT_DURATION_SECONDS,
        foot,
        facing: player.facing,
      });

      player.nextFootprintFoot = foot === 'left' ? 'right' : 'left';
      player.footprintSpawnTimer += FOOTPRINT_STEP_INTERVAL_SECONDS;
    }
  } else {
    player.footprintSpawnTimer = 0;
  }
}

export function updatePlayer(
  player: Player,
  input: InputState,
  dtSeconds: number,
  map: TileMap,
  solidObstacles: readonly Rect[] = []
): void {
  if (player.blinkTimer > 0) {
    player.blinkTimer = Math.max(0, player.blinkTimer - dtSeconds);
  }

  let dx = 0;
  let dy = 0;

  if (input.left) dx -= 1;
  if (input.right) dx += 1;
  if (input.up) dy -= 1;
  if (input.down) dy += 1;

  if (dx === 0 && dy === 0) {
    player.isMoving = false;
    player.walkTimer = 0;
    return;
  }

  player.isMoving = true;
  player.walkTimer += dtSeconds;

  if (dy < 0) player.facing = 'up';
  else if (dy > 0) player.facing = 'down';
  else if (dx < 0) player.facing = 'left';
  else if (dx > 0) player.facing = 'right';

  // Normalize diagonal speed so diagonal movement isn't faster
  const length = Math.hypot(dx, dy);
  const moveX = (dx / length) * player.speed * dtSeconds;
  const moveY = (dy / length) * player.speed * dtSeconds;

  const collidesAt = (testX: number, testY: number): boolean => {
    if (isRectCollidingWithMap(map, testX, testY, player.width, player.height)) {
      return true;
    }
    const testRect: Rect = {
      x: testX,
      y: testY,
      width: player.width,
      height: player.height,
    };
    return solidObstacles.some((obs) => rectsIntersect(testRect, obs));
  };

  // Axis-separated collision check so the player slides smoothly along walls
  const nextX = player.x + moveX;
  if (!collidesAt(nextX, player.y)) {
    player.x = nextX;
  }

  const nextY = player.y + moveY;
  if (!collidesAt(player.x, nextY)) {
    player.y = nextY;
  }
}
