import { InputState } from '../core/input';
import { isRectCollidingWithMap, TileMap } from '../world/tilemap';

export type Direction = 'up' | 'down' | 'left' | 'right';

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
