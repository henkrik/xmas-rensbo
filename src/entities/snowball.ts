import { Player, rectsIntersect } from './player';
import { TILE_SIZE } from '../world/tilemap';

export interface SnowballThrower {
  id: string;
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  facing: 'left' | 'right';
  targetX: number;
  throwInterval: number;
  throwTimer: number;
}

export interface Snowball {
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  vy: number;
  targetX: number;
}

export const SNOWBALL_SPEED = 110; // pixels per second
export const THROW_INTERVAL_SECONDS = 2.4;
export const HIT_BLINK_DURATION_SECONDS = 2.0;

/**
 * Creates the two people standing on opposite sides of the gravel driveway
 * (row 16, cols 12 and 18) throwing snowballs across the road.
 */
export function createDrivewayThrowers(): SnowballThrower[] {
  const rowY = 16 * TILE_SIZE + 2;
  const leftX = 12 * TILE_SIZE + 2;
  const rightX = 18 * TILE_SIZE + 2;

  return [
    {
      id: 'thrower-sylvester',
      name: 'Sylvester',
      x: leftX,
      y: rowY,
      width: 12,
      height: 12,
      facing: 'right',
      targetX: rightX,
      throwInterval: THROW_INTERVAL_SECONDS,
      // Throw shortly after level starts/resets
      throwTimer: 0.6,
    },
    {
      id: 'thrower-annelotte',
      name: 'Annelotte',
      x: rightX,
      y: rowY,
      width: 12,
      height: 12,
      facing: 'left',
      targetX: leftX,
      throwInterval: THROW_INTERVAL_SECONDS,
      // Staggered so they alternate throwing back and forth across the driveway
      throwTimer: 1.8,
    },
  ];
}

export function spawnSnowballFromThrower(thrower: SnowballThrower): Snowball {
  const dir = thrower.facing === 'right' ? 1 : -1;
  return {
    x: thrower.facing === 'right' ? thrower.x + thrower.width : thrower.x - 6,
    y: thrower.y + 3,
    width: 6,
    height: 6,
    vx: dir * SNOWBALL_SPEED,
    vy: 0,
    targetX: thrower.targetX,
  };
}

/**
 * Updates thrower timers, spawns/moves snowballs, and checks if any snowball hits the player.
 * Returns true if the player was hit on this frame.
 */
export function updateSnowballFight(
  throwers: SnowballThrower[],
  snowballs: Snowball[],
  player: Player,
  dtSeconds: number
): boolean {
  for (const thrower of throwers) {
    thrower.throwTimer -= dtSeconds;
    if (thrower.throwTimer <= 0) {
      thrower.throwTimer += thrower.throwInterval;
      snowballs.push(spawnSnowballFromThrower(thrower));
    }
  }

  for (let i = snowballs.length - 1; i >= 0; i--) {
    const sb = snowballs[i];
    sb.x += sb.vx * dtSeconds;
    sb.y += sb.vy * dtSeconds;

    // Check if the snowball hit Santa
    if (rectsIntersect(sb, player)) {
      return true;
    }

    // Remove snowball once it reaches the other thrower
    if (
      (sb.vx > 0 && sb.x >= sb.targetX) ||
      (sb.vx < 0 && sb.x + sb.width <= sb.targetX + 12)
    ) {
      snowballs.splice(i, 1);
    }
  }

  return false;
}
