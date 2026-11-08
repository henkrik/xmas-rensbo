import { Player, Rect } from '../entities/player';
import { SnowballThrower } from '../entities/snowball';
import {
  GROUND_LADDER_BOUNDS,
  HOUSE_DOOR_COL,
  HOUSE_DOOR_ROW,
  HOUSE_WEST_LADDER_SPOT,
  MOTORCYCLE_START_X,
  MOTORCYCLE_START_Y,
  ROOF_CHIMNEY_BOUNDS,
  ROOF_LADDER_BOUNDS,
  TILE_SIZE,
} from './tilemap';

export interface Interactable {
  id: string;
  bounds: Rect;
  promptText: string; // e.g., "Z: Talk to" or "Z: Open door"
  dialogueLines: string[];
  speakerPortrait?: string; // name of person for portrait display, e.g. "Henrik"
}

export interface DialogueState {
  lines: string[];
  currentIndex: number;
  onClose?: () => void;
  speakerPortrait?: string;
  unclosable?: boolean;
}

export interface LadderInteractionOptions {
  hasLadder?: boolean;
  ladderPlaced?: boolean;
  isOnRoof?: boolean;
  motorcycleStatus?: 'parked' | 'driving' | 'crashed';
  alexNpc?: Rect;
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
    motorcycleStatus = 'parked',
    alexNpc,
  } = options;

  if (isOnRoof) {
    return [
      {
        id: 'roof-ladder',
        bounds: { ...ROOF_LADDER_BOUNDS },
        promptText: 'Climb down ladder',
        dialogueLines: [],
      },
      {
        id: 'roof-chimney',
        bounds: { ...ROOF_CHIMNEY_BOUNDS },
        promptText: 'Climb down chimney',
        dialogueLines: [],
      },
    ];
  }

  const list: Interactable[] = throwers.map((t) => {
    if (t.id === 'thrower-sylvester') {
      return {
        id: t.id,
        bounds: { x: t.x, y: t.y, width: t.width, height: t.height },
        promptText: 'Talk to Sylvester',
        dialogueLines: ['Watch out! Annelotte is crazy!'],
        speakerPortrait: 'Sylvester',
      };
    }
    if (t.id === 'thrower-annelotte') {
      return {
        id: t.id,
        bounds: { x: t.x, y: t.y, width: t.width, height: t.height },
        promptText: 'Talk to Annelotte',
        dialogueLines: [
          'It\'s good to talk about your feelings... how does a snowball in your face feel?',
        ],
        speakerPortrait: 'Annelotte',
      };
    }
    return {
      id: t.id,
      bounds: { x: t.x, y: t.y, width: t.width, height: t.height },
      promptText: 'Talk to',
      dialogueLines: ['Watch out!'],
    };
  });

  list.push({
    id: 'house-door',
    bounds: {
      x: HOUSE_DOOR_COL * TILE_SIZE,
      y: HOUSE_DOOR_ROW * TILE_SIZE,
      width: TILE_SIZE,
      height: TILE_SIZE,
    },
    promptText: 'Open door',
    dialogueLines: [
      "It's locked.",
      'There has to be another way into the house...',
    ],
  });

  if (motorcycleStatus === 'parked') {
    list.push({
      id: 'motorcycle',
      bounds: {
        x: MOTORCYCLE_START_X,
        y: MOTORCYCLE_START_Y,
        width: TILE_SIZE * 2,
        height: TILE_SIZE,
      },
      promptText: 'Drive',
      dialogueLines: [],
    });
  }

  if (!hasLadder && !ladderPlaced) {
    list.push({
      id: 'ground-ladder',
      bounds: { ...GROUND_LADDER_BOUNDS },
      promptText: 'Pick up',
      dialogueLines: [],
    });
    list.push({
      id: 'house-west-inspect',
      bounds: { ...HOUSE_WEST_LADDER_SPOT },
      promptText: 'Inspect',
      dialogueLines: [
        "Hmm.. looks like there is a chimney up there, but I can't reach it",
      ],
    });
  } else if (hasLadder && !ladderPlaced) {
    list.push({
      id: 'house-west-place-ladder',
      bounds: { ...HOUSE_WEST_LADDER_SPOT },
      promptText: 'Place ladder',
      dialogueLines: [],
    });
  } else if (ladderPlaced) {
    list.push({
      id: 'house-west-climb-ladder',
      bounds: { ...HOUSE_WEST_LADDER_SPOT },
      promptText: 'Climb ladder',
      dialogueLines: [],
    });
  }

  if (alexNpc) {
    list.push({
      id: 'outside-alex',
      bounds: { ...alexNpc },
      promptText: 'Talk to Alex',
      dialogueLines: ['Just practicing my swings...'],
      speakerPortrait: 'Alex',
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
