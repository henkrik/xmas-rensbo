import { Player, Rect, rectsIntersect } from './player';
import { isRectCollidingWithMap, TILE_SIZE, TileMap } from '../world/tilemap';
import { debugLog } from '../core/debugConsole';

export type CatMode = 'standing' | 'flee';

export interface Cat {
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  vy: number;
  maxSpeed: number;
  acceleration: number;
  deceleration: number;
  mode: CatMode;
  facing: 'left' | 'right';
  animTimer: number;
  hasBeenActivated: boolean;
  wallForceDirX: number;
  wallForceDirY: number;
}

// Window in the extra room is at cols 26..27, row 18
// Cat sits near the window (e.g. col 26.5, row 17)
export const CAT_START_X = 26.5 * TILE_SIZE;
export const CAT_START_Y = 17.0 * TILE_SIZE;

// Cat speed parameters
export const CAT_MAX_SPEED = 60; // px/s
export const CAT_ACCELERATION = 120; // snappier than dog
export const CAT_DECELERATION = 100;

// Extra room activation bounding box (cols 26..27, rows 11..17)
export const EXTRA_ROOM_BOUNDS: Rect = {
  x: 25.5 * TILE_SIZE,
  y: 11.0 * TILE_SIZE,
  width: 2.5 * TILE_SIZE,
  height: 7.0 * TILE_SIZE,
};

// Distance thresholds
export const CAT_STOP_FLEE_DISTANCE = 5.0 * TILE_SIZE; // > 5 tiles -> standing still
export const CAT_RETRIGGER_FLEE_DISTANCE = 2.0 * TILE_SIZE; // <= 2 tiles -> flee again

export function createCat(
  x: number = CAT_START_X,
  y: number = CAT_START_Y
): Cat {
  return {
    x,
    y,
    width: 10,
    height: 10,
    vx: 0,
    vy: 0,
    maxSpeed: CAT_MAX_SPEED,
    acceleration: CAT_ACCELERATION,
    deceleration: CAT_DECELERATION,
    mode: 'standing',
    facing: 'left',
    animTimer: 0,
    hasBeenActivated: false,
    wallForceDirX: 0,
    wallForceDirY: 0,
  };
}

/**
 * Updates the cat's AI, steering away from Santa, and colliding with walls/obstacles.
 */
export function updateCat(
  cat: Cat,
  player: Player,
  dtSeconds: number,
  map: TileMap,
  solidObstacles: readonly Rect[] = []
): void {
  const catCenterX = cat.x + cat.width / 2;
  const catCenterY = cat.y + cat.height / 2;
  const playerCenterX = player.x + player.width / 2;
  const playerCenterY = player.y + player.height / 2;

  const dx = playerCenterX - catCenterX;
  const dy = playerCenterY - catCenterY;
  const dist = Math.hypot(dx, dy);

  const collidesAt = (testX: number, testY: number): boolean => {
    if (isRectCollidingWithMap(map, testX, testY, cat.width, cat.height)) {
      return true;
    }
    const testRect: Rect = {
      x: testX,
      y: testY,
      width: cat.width,
      height: cat.height,
    };
    return solidObstacles.some((obs) => rectsIntersect(testRect, obs));
  };

  // 1. Activation and state transition logic
  const prevMode = cat.mode;
  if (!cat.hasBeenActivated) {
    if (rectsIntersect(player, EXTRA_ROOM_BOUNDS)) {
      cat.hasBeenActivated = true;
      cat.mode = 'flee';
    }
  } else {
    // Already activated before:
    if (cat.mode === 'flee') {
      if (dist > CAT_STOP_FLEE_DISTANCE) {
        cat.mode = 'standing';
      }
    } else if (cat.mode === 'standing') {
      if (dist <= CAT_RETRIGGER_FLEE_DISTANCE) {
        cat.mode = 'flee';
      }
    }
  }

  if (cat.mode !== prevMode) {
    debugLog(`Cat state changed: ${prevMode} -> ${cat.mode}`);
  }

  // 2. Velocity and movement
  if (cat.mode === 'flee') {
    // Check surroundings by looking a few pixels (8px, half a tile) in each direction (west, north, east, south).
    // If a wall is detected in one direction, apply a force in the opposite direction.
    const lookDist = 8;
    const wallWest = collidesAt(cat.x - lookDist, cat.y);
    const wallEast = collidesAt(cat.x + lookDist, cat.y);
    const wallNorth = collidesAt(cat.x, cat.y - lookDist);
    const wallSouth = collidesAt(cat.x, cat.y + lookDist);

    let forceDirX = 0;
    let forceDirY = 0;

    if (wallWest) forceDirX += 1; // wall to west -> force east (+X)
    if (wallEast) forceDirX -= 1; // wall to east -> force west (-X)
    if (wallNorth) forceDirY += 1; // wall to north -> force south (+Y)
    if (wallSouth) forceDirY -= 1; // wall to south -> force north (-Y)

    if (forceDirX !== cat.wallForceDirX || forceDirY !== cat.wallForceDirY) {
      debugLog(
        `Cat wall force changed: (${cat.wallForceDirX}, ${cat.wallForceDirY}) -> (${forceDirX}, ${forceDirY})`
      );
      cat.wallForceDirX = forceDirX;
      cat.wallForceDirY = forceDirY;
    }

    // Run away from player (opposite direction of dx, dy)
    let ux = dist > 0.001 ? -dx / dist : -1;
    let uy = dist > 0.001 ? -dy / dist : 0;

    const targetVx = ux * cat.maxSpeed;
    const targetVy = uy * cat.maxSpeed;

    const dvx = targetVx - cat.vx;
    const dvy = targetVy - cat.vy;
    const dvLen = Math.hypot(dvx, dvy);
    const maxDeltaV = cat.acceleration * dtSeconds;

    if (dvLen <= maxDeltaV || dvLen === 0) {
      cat.vx = targetVx;
      cat.vy = targetVy;
    } else {
      cat.vx += (dvx / dvLen) * maxDeltaV;
      cat.vy += (dvy / dvLen) * maxDeltaV;
    }

    // Apply wall avoidance force (same strength as regular running acceleration)
    if (forceDirX !== 0 || forceDirY !== 0) {
      const forceLen = Math.hypot(forceDirX, forceDirY);
      const normFx = forceDirX / forceLen;
      const normFy = forceDirY / forceLen;
      cat.vx += normFx * cat.acceleration * dtSeconds;
      cat.vy += normFy * cat.acceleration * dtSeconds;
    }

    if (Math.abs(cat.vx) > 2) {
      cat.facing = cat.vx < 0 ? 'left' : 'right';
    } else if (Math.abs(dx) > 0.5) {
      cat.facing = dx > 0 ? 'left' : 'right'; // looking away from player
    }
  } else {
    // Standing mode: reset wall force to (0, 0)
    if (cat.wallForceDirX !== 0 || cat.wallForceDirY !== 0) {
      debugLog(
        `Cat wall force changed: (${cat.wallForceDirX}, ${cat.wallForceDirY}) -> (0, 0)`
      );
      cat.wallForceDirX = 0;
      cat.wallForceDirY = 0;
    }

    // Decelerate to 0
    const speed = Math.hypot(cat.vx, cat.vy);
    const maxDrop = cat.deceleration * dtSeconds;
    if (speed <= maxDrop) {
      cat.vx = 0;
      cat.vy = 0;
    } else {
      cat.vx -= (cat.vx / speed) * maxDrop;
      cat.vy -= (cat.vy / speed) * maxDrop;
    }
  }

  if (cat.vx !== 0 || cat.vy !== 0) {
    cat.animTimer += dtSeconds;

    const nextX = cat.x + cat.vx * dtSeconds;
    if (!collidesAt(nextX, cat.y)) {
      cat.x = nextX;
    } else {
      cat.vx = 0;
    }

    const nextY = cat.y + cat.vy * dtSeconds;
    if (!collidesAt(cat.x, nextY)) {
      cat.y = nextY;
    } else {
      cat.vy = 0;
    }
  }
}
