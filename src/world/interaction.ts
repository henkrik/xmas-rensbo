import { Player, Rect } from '../entities/player';
import { SnowballThrower } from '../entities/snowball';
import {
  GROUND_LADDER_BOUNDS,
  HOUSE_DOOR_COL,
  HOUSE_DOOR_ROW,
  HOUSE_WEST_LADDER_SPOT,
  ROOF_CHIMNEY_BOUNDS,
  ROOF_LADDER_BOUNDS,
  TILE_SIZE,
} from './tilemap';

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

export interface LadderInteractionOptions {
  hasLadder?: boolean;
  ladderPlaced?: boolean;
  isOnRoof?: boolean;
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
  throwers: readonly SnowballThrower[],
  options: LadderInteractionOptions = {}
): Interactable[] {
  const {
    hasLadder = false,
    ladderPlaced = false,
    isOnRoof = false,
  } = options;

  if (isOnRoof) {
    return [
      {
        id: 'roof-ladder',
        bounds: { ...ROOF_LADDER_BOUNDS },
        promptText: 'Z: Climb down ladder',
        dialogueLines: [],
      },
      {
        id: 'roof-chimney',
        bounds: { ...ROOF_CHIMNEY_BOUNDS },
        promptText: 'Z: Climb down chimney',
        dialogueLines: [],
      },
    ];
  }

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

  if (!hasLadder && !ladderPlaced) {
    list.push({
      id: 'ground-ladder',
      bounds: { ...GROUND_LADDER_BOUNDS },
      promptText: 'Z: Pick up',
      dialogueLines: [],
    });
    list.push({
      id: 'house-west-inspect',
      bounds: { ...HOUSE_WEST_LADDER_SPOT },
      promptText: 'Z: Inspect',
      dialogueLines: [
        "Hmm.. looks like there is a chimney up there, but I can't reach it",
      ],
    });
  } else if (hasLadder && !ladderPlaced) {
    list.push({
      id: 'house-west-place-ladder',
      bounds: { ...HOUSE_WEST_LADDER_SPOT },
      promptText: 'Z: Place ladder',
      dialogueLines: [],
    });
  } else if (ladderPlaced) {
    list.push({
      id: 'house-west-climb-ladder',
      bounds: { ...HOUSE_WEST_LADDER_SPOT },
      promptText: 'Z: Climb ladder',
      dialogueLines: [],
    });
  }

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
