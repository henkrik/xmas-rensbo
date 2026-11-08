import { Direction, Player, Rect } from '../../entities/player';
import { Interactable } from '../interaction';
import { MAP_COLS, MAP_ROWS, TILE_SIZE, TileMap, TileType } from '../tilemap';
import { GameLevel, LevelId, LevelTransitionContext } from './types';

const V = TileType.VoidBlack;
const W = TileType.InteriorWall;
const F = TileType.WoodFloor;

export const PEOPLE_NAMES = [
  'Albin',
  'Alex',
  'Anne-Marie',
  'Annelotte',
  'Diana',
  'Hanneloes',
  'Henrik',
  'Olexa',
  'Simon',
  'Sylvester',
  'Tanja',
] as const;

export type PersonName = typeof PEOPLE_NAMES[number];

export interface PersonNpc {
  name: PersonName;
  bounds: Rect;
  facing: Direction;
  hairColor: string;
  shirtColor: string;
}

/**
 * 32x28 Tile Matrix for `level-people`:
 * A big comfortable indoor room (cols 2..29, rows 2..25) with wooden floors and walls.
 */
export const PEOPLE_TILES: TileType[][] = Array.from({ length: MAP_ROWS }, (_, r) =>
  Array.from({ length: MAP_COLS }, (_, c) => {
    if (r < 2 || r > 25 || c < 2 || c > 29) {
      return V;
    }
    if (r === 2 || r === 25 || c === 2 || c === 29) {
      return W;
    }
    return F;
  })
);

export const PEOPLE_MAP: TileMap = {
  cols: MAP_COLS,
  rows: MAP_ROWS,
  tileSize: TILE_SIZE,
  tiles: PEOPLE_TILES,
};

export const PEOPLE_PLAYER_SPAWN = {
  x: 15 * TILE_SIZE + 2,
  y: 23 * TILE_SIZE + 2,
  facing: 'up' as Direction,
};

/**
 * Distinct styling for each person's in-world 16x16 pixel-art character sprite.
 */
const PERSON_STYLES: Record<PersonName, { hair: string; shirt: string }> = {
  Albin: { hair: '#7a421c', shirt: '#285890' },
  Alex: { hair: '#3a2016', shirt: '#9c3832' },
  'Anne-Marie': { hair: '#c88642', shirt: '#428860' },
  Annelotte: { hair: '#b06830', shirt: '#804070' },
  Diana: { hair: '#2a1a14', shirt: '#3a6288' },
  Hanneloes: { hair: '#8a4822', shirt: '#2d7862' },
  Henrik: { hair: '#6e4624', shirt: '#324a78' },
  Olexa: { hair: '#342618', shirt: '#52446a' },
  Simon: { hair: '#583822', shirt: '#647038' },
  Sylvester: { hair: '#4a2c1e', shirt: '#b05832' },
  Tanja: { hair: '#743c20', shirt: '#783858' },
};

export class LevelPeople implements GameLevel {
  public readonly id: LevelId = 'level-people';
  public readonly map: TileMap = PEOPLE_MAP;
  public readonly npcs: PersonNpc[] = [];

  constructor() {
    // Distribute the 11 people evenly in two friendly rows across the big room:
    // Row 1 (top): 6 people (cols 5, 9, 13, 17, 21, 25 at row 7)
    // Row 2 (middle): 5 people (cols 7, 11, 15, 19, 23 at row 15)
    const positions = [
      { col: 5, row: 7 },
      { col: 9, row: 7 },
      { col: 13, row: 7 },
      { col: 17, row: 7 },
      { col: 21, row: 7 },
      { col: 25, row: 7 },
      { col: 7, row: 15 },
      { col: 11, row: 15 },
      { col: 15, row: 15 },
      { col: 19, row: 15 },
      { col: 23, row: 15 },
    ];

    PEOPLE_NAMES.forEach((name, idx) => {
      const pos = positions[idx];
      const style = PERSON_STYLES[name];
      this.npcs.push({
        name,
        bounds: {
          x: pos.col * TILE_SIZE + 2,
          y: pos.row * TILE_SIZE + 2,
          width: 12,
          height: 12,
        },
        facing: 'down',
        hairColor: style.hair,
        shirtColor: style.shirt,
      });
    });
  }

  public enter(player: Player): void {
    player.x = PEOPLE_PLAYER_SPAWN.x;
    player.y = PEOPLE_PLAYER_SPAWN.y;
    player.facing = PEOPLE_PLAYER_SPAWN.facing;
    player.isMoving = false;
    player.walkTimer = 0;
  }

  public getSolidObstacles(): readonly Rect[] {
    return this.npcs.map((npc) => npc.bounds);
  }

  public getInteractables(): Interactable[] {
    return this.npcs.map((npc) => ({
      id: `person-${npc.name.toLowerCase()}`,
      bounds: { ...npc.bounds },
      promptText: `Talk to ${npc.name}`,
      dialogueLines: [`${npc.name} says hello.`],
      speakerPortrait: npc.name,
    }));
  }

  public handleInteraction(
    _interactableId: string,
    _player: Player,
    _ctx: LevelTransitionContext
  ): boolean {
    return false;
  }
}
