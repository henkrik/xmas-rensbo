import { Player, Rect, rectsIntersect } from './player';
import { isRectCollidingWithMap, TILE_SIZE, TileMap } from '../world/tilemap';

export type DogMode = 'waiting' | 'chasing';

export interface DogHeart {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  maxAge: number;
}

export interface Dog {
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  vy: number;
  maxSpeed: number;
  acceleration: number;
  deceleration: number;
  mode: DogMode;
  facing: 'left' | 'right';
  animTimer: number;
  heartSpawnTimer: number;
  hearts: DogHeart[];
}

// East snow field between the two northern guest cottages (rows 5..8) and southern red-door tool shed (rows 16..19)
export const DOG_START_X = 26.5 * TILE_SIZE;
export const DOG_START_Y = 12.5 * TILE_SIZE;

// Half-speed (37 px/s) across all platforms (desktop & mobile)
export const DOG_MAX_SPEED = 37;
// Gradual acceleration/deceleration so the player can sidestep-dodge a charge,
// but will inevitably be caught if standing still
export const DOG_ACCELERATION = 95;
export const DOG_DECELERATION = 90;

export const DOG_AGGRO_DISTANCE = 6.5 * TILE_SIZE;
export const DOG_DEAGGRO_DISTANCE = 10.5 * TILE_SIZE;

export function createDog(
  x: number = DOG_START_X,
  y: number = DOG_START_Y
): Dog {
  return {
    x,
    y,
    width: 12,
    height: 12,
    vx: 0,
    vy: 0,
    maxSpeed: DOG_MAX_SPEED,
    acceleration: DOG_ACCELERATION,
    deceleration: DOG_DECELERATION,
    mode: 'waiting',
    facing: 'left',
    animTimer: 0,
    heartSpawnTimer: 0,
    hearts: [],
  };
}

/**
 * Updates the dog's waiting/chasing AI, gradual velocity steering, obstacle collision,
 * and floating love hearts. Returns true if the dog catches (collides with) Santa.
 */
export function updateDog(
  dog: Dog,
  player: Player,
  dtSeconds: number,
  map: TileMap,
  solidObstacles: readonly Rect[] = [],
  speedMultiplier: number = 1.0
): boolean {
  const dogCenterX = dog.x + dog.width / 2;
  const dogCenterY = dog.y + dog.height / 2;
  const playerCenterX = player.x + player.width / 2;
  const playerCenterY = player.y + player.height / 2;

  const dx = playerCenterX - dogCenterX;
  const dy = playerCenterY - dogCenterY;
  const dist = Math.hypot(dx, dy);

  if (dog.mode === 'waiting' && dist <= DOG_AGGRO_DISTANCE) {
    dog.mode = 'chasing';
    dog.heartSpawnTimer = 0;
  } else if (dog.mode === 'chasing' && dist >= DOG_DEAGGRO_DISTANCE) {
    dog.mode = 'waiting';
  }

  const effectiveMaxSpeed = dog.maxSpeed * speedMultiplier;

  if (dog.mode === 'chasing') {
    const ux = dist > 0.001 ? dx / dist : 0;
    const uy = dist > 0.001 ? dy / dist : 0;
    const targetVx = ux * effectiveMaxSpeed;
    const targetVy = uy * effectiveMaxSpeed;

    const dvx = targetVx - dog.vx;
    const dvy = targetVy - dog.vy;
    const dvLen = Math.hypot(dvx, dvy);
    const maxDeltaV = dog.acceleration * dtSeconds;

    if (dvLen <= maxDeltaV || dvLen === 0) {
      dog.vx = targetVx;
      dog.vy = targetVy;
    } else {
      dog.vx += (dvx / dvLen) * maxDeltaV;
      dog.vy += (dvy / dvLen) * maxDeltaV;
    }

    if (Math.abs(dog.vx) > 2) {
      dog.facing = dog.vx < 0 ? 'left' : 'right';
    } else if (Math.abs(dx) > 0.5) {
      dog.facing = dx < 0 ? 'left' : 'right';
    }
  } else {
    const speed = Math.hypot(dog.vx, dog.vy);
    const maxDrop = dog.deceleration * dtSeconds;
    if (speed <= maxDrop) {
      dog.vx = 0;
      dog.vy = 0;
    } else {
      dog.vx -= (dog.vx / speed) * maxDrop;
      dog.vy -= (dog.vy / speed) * maxDrop;
    }
  }

  const collidesAt = (testX: number, testY: number): boolean => {
    if (isRectCollidingWithMap(map, testX, testY, dog.width, dog.height)) {
      return true;
    }
    const testRect: Rect = {
      x: testX,
      y: testY,
      width: dog.width,
      height: dog.height,
    };
    return solidObstacles.some((obs) => rectsIntersect(testRect, obs));
  };

  if (dog.vx !== 0 || dog.vy !== 0) {
    dog.animTimer += dtSeconds;

    const nextX = dog.x + dog.vx * dtSeconds;
    if (!collidesAt(nextX, dog.y)) {
      dog.x = nextX;
    } else {
      dog.vx = 0;
    }

    const nextY = dog.y + dog.vy * dtSeconds;
    if (!collidesAt(dog.x, nextY)) {
      dog.y = nextY;
    } else {
      dog.vy = 0;
    }
  }

  // Update floating red love hearts
  for (let i = dog.hearts.length - 1; i >= 0; i--) {
    const h = dog.hearts[i];
    h.age += dtSeconds;
    h.x += h.vx * dtSeconds;
    h.y += h.vy * dtSeconds;
    if (h.age >= h.maxAge) {
      dog.hearts.splice(i, 1);
    }
  }

  if (dog.mode === 'chasing') {
    dog.heartSpawnTimer -= dtSeconds;
    while (dog.heartSpawnTimer <= 0) {
      const phase = dog.hearts.length + Math.floor(dog.animTimer * 10);
      const offsetX = ((phase % 3) - 1) * 4;
      dog.hearts.push({
        x: dog.x + dog.width / 2 + offsetX,
        y: dog.y - 2,
        vx: offsetX * 2.5,
        vy: -16,
        age: 0,
        maxAge: 0.85,
      });
      dog.heartSpawnTimer += 0.22;
    }
  }

  return rectsIntersect(dog, player);
}

