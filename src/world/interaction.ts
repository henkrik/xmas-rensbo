import { Player, Rect } from '../entities/player';
import { SnowballThrower } from '../entities/snowball';
import { HOUSE_DOOR_COL, HOUSE_DOOR_ROW, TILE_SIZE } from './tilemap';

export interface Interactable {
  id: string;
  bounds: Rect;
  promptText: string; // e.g., "Z: Talk to" or "Z: Open door"
  dialogueLines: string[];
}

export interface DialogueState {
  lines: string[];
  currentIndex: number;
}

/**
 * Maximum gap (in pixels) between the player's collision box and an interactable's bounds
 * to be considered "close enough to almost be touching".
 */
export const INTERACTION_MAX_GAP_PX = 6;

export function rectEdgeDistance(a: Rect, b: Rect): number {
  const dx = Math.max(0, b.x - (a.x + a.width), a.x - (b.x + b.width));
  const dy = Math.max(0, b.y - (a.y + a.height), a.y - (b.y + b.height));
  return Math.hypot(dx, dy);
}

export function buildInteractables(
  throwers: readonly SnowballThrower[]
): Interactable[] {
  const list: Interactable[] = throwers.map((t) => ({
    id: t.id,
    bounds: { x: t.x, y: t.y, width: t.width, height: t.height },
    promptText: 'Z: Talk to',
    dialogueLines: ['Watch out!'],
  }));

  list.push({
    id: 'house-door',
    bounds: {
      x: HOUSE_DOOR_COL * TILE_SIZE,
      y: HOUSE_DOOR_ROW * TILE_SIZE,
      width: TILE_SIZE,
      height: TILE_SIZE,
    },
    promptText: 'Z: Open door',
    dialogueLines: [
      "It's locked.",
      'There has to be another way into the house...',
    ],
  });

  return list;
}

export function findNearbyInteractable(
  player: Player,
  interactables: readonly Interactable[],
  maxGapPx: number = INTERACTION_MAX_GAP_PX
): Interactable | null {
  let closest: Interactable | null = null;
  let bestDist = Infinity;

  for (const item of interactables) {
    const dist = rectEdgeDistance(player, item.bounds);
    if (dist <= maxGapPx && dist < bestDist) {
      bestDist = dist;
      closest = item;
    }
  }

  return closest;
}

