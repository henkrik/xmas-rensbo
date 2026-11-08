import { GameAssets } from '../assets';
import { Cat } from '../entities/cat';
import { Dog } from '../entities/dog';
import { Direction, Footprint, Rect } from '../entities/player';
import { GameState, MotorcycleState } from '../world/gameState';
import { CollidableDoor } from '../world/levels/types';
import {
  DAMAGED_WIRE_HAZARD,
  GROUND_LADDER_BOUNDS,
  isSolidTile,
  TILE_SIZE,
  TileType,
} from '../world/tilemap';
import {
  drawPixelText,
  measurePixelText,
  wrapPixelText,
} from './pixelFont';

export interface Camera {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function computeCamera(
  playerX: number,
  playerY: number,
  playerWidth: number,
  playerHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  mapWidthPx: number,
  mapHeightPx: number
): Camera {
  const targetX = playerX + playerWidth / 2 - viewportWidth / 2;
  const targetY = playerY + playerHeight / 2 - viewportHeight / 2;

  const maxX = Math.max(0, mapWidthPx - viewportWidth);
  const maxY = Math.max(0, mapHeightPx - viewportHeight);

  return {
    x: Math.round(Math.max(0, Math.min(maxX, targetX))),
    y: Math.round(Math.max(0, Math.min(maxY, targetY))),
    width: viewportWidth,
    height: viewportHeight,
  };
}

export const DIALOGUE_FONT = 'bold 10px "Courier New", Courier, monospace';

export function wrapTextLines(
  _ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  return wrapPixelText(text, maxWidth);
}

function drawSnesFrame(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  // Drop shadow
  ctx.fillStyle = 'rgba(8, 12, 20, 0.65)';
  ctx.fillRect(x + 2, y + 2, w, h);

  // Deep SNES navy interior
  ctx.fillStyle = 'rgba(16, 26, 48, 0.94)';
  ctx.fillRect(x, y, w, h);

  // Outer dark outline
  ctx.strokeStyle = '#101420';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  // Inner bright silver-white bevel border
  ctx.strokeStyle = '#e8f0ff';
  ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);

  // Golden corner rivets (A Link to the Past window style)
  ctx.fillStyle = '#ffd166';
  ctx.fillRect(x + 1, y + 1, 2, 2);
  ctx.fillRect(x + w - 3, y + 1, 2, 2);
  ctx.fillRect(x + 1, y + h - 3, 2, 2);
  ctx.fillRect(x + w - 3, y + h - 3, 2, 2);
}

function drawInteractionPrompt(
  ctx: CanvasRenderingContext2D,
  promptText: string,
  zKeySprite: HTMLImageElement
): void {
  ctx.save();
  const textWidth = measurePixelText(promptText);
  const iconSize = 16;
  const gap = 6;
  const padX = 8;
  const boxHeight = 22;
  const boxWidth = padX * 2 + iconSize + gap + textWidth;
  const boxX = Math.round((ctx.canvas.width - boxWidth) / 2);
  const boxY = ctx.canvas.height - boxHeight - 6;

  drawSnesFrame(ctx, boxX, boxY, boxWidth, boxHeight);

  // Draw Z key icon
  const iconX = boxX + padX;
  const iconY = boxY + Math.round((boxHeight - iconSize) / 2);
  ctx.drawImage(zKeySprite, iconX, iconY, iconSize, iconSize);

  // Draw unaliased prompt label with 1px drop shadow
  const textX = iconX + iconSize + gap;
  const textY = boxY + Math.round((boxHeight - 8) / 2);
  drawPixelText(ctx, promptText, textX, textY, '#ffd166', '#0c101a');
  ctx.restore();
}

function drawDialogueBox(
  ctx: CanvasRenderingContext2D,
  text: string,
  zKeySprite: HTMLImageElement,
  showZKey: boolean = true
): void {
  ctx.save();
  const margin = 8;
  const boxWidth = ctx.canvas.width - margin * 2;

  // Wrapped dialogue text rendered with 100% unaliased integer pixels
  const lines = wrapPixelText(text, boxWidth - 24);
  const lineHeight = 12;
  const textHeight = lines.length * lineHeight;
  const boxHeight = Math.max(52, textHeight + (showZKey ? 22 : 16));
  const boxX = margin;
  const boxY = ctx.canvas.height - boxHeight - margin;

  drawSnesFrame(ctx, boxX, boxY, boxWidth, boxHeight);

  lines.forEach((line, idx) => {
    const lx = boxX + 10;
    const ly = boxY + 8 + idx * lineHeight;
    drawPixelText(ctx, line, lx, ly, '#ffffff', '#0c101a');
  });

  if (showZKey) {
    // Small Z key indicator in the bottom-right corner of the dialogue box
    ctx.drawImage(
      zKeySprite,
      boxX + boxWidth - 20,
      boxY + boxHeight - 20,
      14,
      14
    );
  }
  ctx.restore();
}

/**
 * Renders Santa's boot prints pressed into snow tiles, fading smoothly over 3 seconds.
 */
function drawFootprints(
  ctx: CanvasRenderingContext2D,
  footprints: readonly Footprint[]
): void {
  if (footprints.length === 0) return;
  ctx.save();

  for (const fp of footprints) {
    const alpha = Math.max(0, 1 - fp.age / fp.maxAge);
    if (alpha <= 0) continue;

    const isVertical = fp.facing === 'up' || fp.facing === 'down';
    const w = isVertical ? 2 : 3;
    const h = isVertical ? 3 : 2;
    const x = Math.round(fp.x);
    const y = Math.round(fp.y);

    // Subtle displaced snow highlight along bottom/right edge
    ctx.fillStyle = `rgba(255, 255, 255, ${(0.55 * alpha).toFixed(3)})`;
    ctx.fillRect(x, y + 1, w, h);

    // Recessed blue-grey snow boot print shadow
    ctx.fillStyle = `rgba(122, 148, 184, ${(0.82 * alpha).toFixed(3)})`;
    ctx.fillRect(x, y, w, h);

    // Deeper sole indentation center
    ctx.fillStyle = `rgba(92, 118, 154, ${(0.72 * alpha).toFixed(3)})`;
    ctx.fillRect(x, y, 1, 1);
  }

  ctx.restore();
}

/**
 * Renders a crisp 7x6 pixel-art red heart at (cx, cy).
 */
function drawPixelHeart(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  alpha: number
): void {
  const x = Math.round(cx - 3);
  const y = Math.round(cy - 3);
  const pattern = [
    '.KK.KK.',
    'KRRKRRK',
    'KRHRRRK',
    '.KRRRK.',
    '..KRK..',
    '...K...',
  ];

  ctx.save();
  for (let row = 0; row < pattern.length; row++) {
    for (let col = 0; col < pattern[row].length; col++) {
      const ch = pattern[row][col];
      if (ch === '.') continue;
      if (ch === 'K') {
        ctx.fillStyle = `rgba(28, 18, 32, ${(0.9 * alpha).toFixed(3)})`;
      } else if (ch === 'H') {
        ctx.fillStyle = `rgba(255, 184, 200, ${(0.95 * alpha).toFixed(3)})`;
      } else {
        ctx.fillStyle = `rgba(238, 36, 74, ${(0.95 * alpha).toFixed(3)})`;
      }
      ctx.fillRect(x + col, y + row, 1, 1);
    }
  }
  ctx.restore();
}

/**
 * Renders the dog on the east snow field along with floating red hearts when chasing Santa.
 */
function drawDogAndHearts(
  ctx: CanvasRenderingContext2D,
  dog: Dog,
  dogSprite: HTMLImageElement
): void {
  const drawX = Math.round(dog.x - (TILE_SIZE - dog.width) / 2);
  const drawY = Math.round(dog.y - (TILE_SIZE - dog.height));

  const speed = Math.hypot(dog.vx, dog.vy);
  let frameCol = 0;
  if (dog.mode === 'chasing' || speed > 4) {
    frameCol = Math.floor(dog.animTimer * 10) % 2 === 0 ? 1 : 2;
  }
  const dirRow = dog.facing === 'left' ? 1 : 0;

  ctx.drawImage(
    dogSprite,
    frameCol * TILE_SIZE,
    dirRow * TILE_SIZE,
    TILE_SIZE,
    TILE_SIZE,
    drawX,
    drawY,
    TILE_SIZE,
    TILE_SIZE
  );

  for (const heart of dog.hearts) {
    const alpha = Math.max(0, 1 - heart.age / heart.maxAge);
    if (alpha > 0) {
      drawPixelHeart(ctx, heart.x, heart.y, alpha);
    }
  }
}

/**
 * Renders the black cat in the extra room upstairs.
 */
function drawCat(
  ctx: CanvasRenderingContext2D,
  cat: Cat,
  catSprite: HTMLImageElement
): void {
  const drawX = Math.round(cat.x - (TILE_SIZE - cat.width) / 2);
  const drawY = Math.round(cat.y - (TILE_SIZE - cat.height));

  const speed = Math.hypot(cat.vx, cat.vy);
  let frameCol = 0;
  if (cat.mode === 'flee' || speed > 4) {
    frameCol = Math.floor(cat.animTimer * 12) % 2 === 0 ? 1 : 2;
  }
  const dirRow = cat.facing === 'left' ? 1 : 0;

  ctx.drawImage(
    catSprite,
    frameCol * TILE_SIZE,
    dirRow * TILE_SIZE,
    TILE_SIZE,
    TILE_SIZE,
    drawX,
    drawY,
    TILE_SIZE,
    TILE_SIZE
  );
}

/**
 * Renders the wooden ladder lying on the snow next to the dog before Santa picks it up.
 */
function drawGroundLadder(ctx: CanvasRenderingContext2D): void {
  const x = Math.round(GROUND_LADDER_BOUNDS.x);
  const y = Math.round(GROUND_LADDER_BOUNDS.y);
  const w = Math.round(GROUND_LADDER_BOUNDS.width);

  ctx.save();
  // Soft shadow in the snow
  ctx.fillStyle = 'rgba(14, 20, 32, 0.35)';
  ctx.fillRect(x + 1, y + 4, w - 1, 10);

  // Dark pixel outline for both rails
  ctx.fillStyle = '#181420';
  ctx.fillRect(x, y + 2, w, 3);
  ctx.fillRect(x, y + 10, w, 3);

  // Rungs connecting top and bottom rails across the full length of the ladder
  for (let rx = x + 2; rx <= x + w - 4; rx += 4) {
    ctx.fillStyle = '#181420';
    ctx.fillRect(rx, y + 4, 3, 7);
    ctx.fillStyle = '#c88642';
    ctx.fillRect(rx + 1, y + 4, 1, 7);
  }

  // Warm wooden side rails with top highlight
  ctx.fillStyle = '#9e6228';
  ctx.fillRect(x + 1, y + 3, w - 2, 1);
  ctx.fillRect(x + 1, y + 11, w - 2, 1);
  ctx.fillStyle = '#e4a65c';
  ctx.fillRect(x + 1, y + 2, w - 2, 1);
  ctx.fillRect(x + 1, y + 10, w - 2, 1);

  ctx.restore();
}

/**
 * Renders the wooden ladder leaning up against the west side of the Main House once placed.
 */
function drawPlacedHouseLadder(ctx: CanvasRenderingContext2D): void {
  const lx = 4 * TILE_SIZE + 2;
  const topY = 4 * TILE_SIZE + 8;
  const bottomY = 10 * TILE_SIZE + 8;
  const height = bottomY - topY;
  const width = 12;

  ctx.save();

  // Drop shadow against the west house wall
  ctx.fillStyle = 'rgba(10, 14, 24, 0.42)';
  ctx.fillRect(lx + 2, topY + 2, width, height);

  // Horizontal wooden rungs every 7px
  for (let ry = topY + 4; ry <= bottomY - 4; ry += 7) {
    ctx.fillStyle = '#181420';
    ctx.fillRect(lx + 2, ry, width - 4, 3);
    ctx.fillStyle = '#e4a65c';
    ctx.fillRect(lx + 2, ry, width - 4, 1);
    ctx.fillStyle = '#9e6228';
    ctx.fillRect(lx + 2, ry + 1, width - 4, 1);
  }

  // Left and right vertical wooden rails
  ctx.fillStyle = '#181420';
  ctx.fillRect(lx, topY, 3, height);
  ctx.fillRect(lx + width - 3, topY, 3, height);

  ctx.fillStyle = '#e4a65c';
  ctx.fillRect(lx + 1, topY + 1, 1, height - 2);
  ctx.fillRect(lx + width - 2, topY + 1, 1, height - 2);

  ctx.restore();
}

/**
 * Renders the black motorcycle (either upright when parked/driving, or tipped over after crashing into the trees).
 */
function drawMotorcycle(
  ctx: CanvasRenderingContext2D,
  motorcycle: MotorcycleState,
  elapsedTime: number
): void {
  const mx = Math.round(motorcycle.x) + 2;
  const my = Math.round(motorcycle.y) + 1;

  ctx.save();

  if (motorcycle.status === 'crashed') {
    // Displaced snow and skid marks where it crashed into the trees
    ctx.fillStyle = 'rgba(18, 24, 36, 0.45)';
    ctx.fillRect(mx - 4, my + 8, 28, 6);
    ctx.fillStyle = '#f8fbff';
    ctx.fillRect(mx + 18, my + 4, 8, 9);

    // Tilted/fallen-over wheels (rear wheel flat, front wheel wedged up at an angle)
    ctx.fillStyle = '#141822';
    ctx.fillRect(mx + 1, my + 8, 8, 6);
    ctx.fillStyle = '#a8b4c6';
    ctx.fillRect(mx + 3, my + 10, 4, 2);

    ctx.fillStyle = '#141822';
    ctx.fillRect(mx + 17, my + 3, 8, 6);
    ctx.fillStyle = '#a8b4c6';
    ctx.fillRect(mx + 19, my + 5, 4, 2);

    // Bike frame & black tank lying sideways on the ground
    ctx.fillStyle = '#141822';
    ctx.fillRect(mx + 5, my + 6, 15, 7);
    ctx.fillStyle = '#242a38';
    ctx.fillRect(mx + 10, my + 6, 8, 5);
    ctx.fillStyle = '#8c9cb8';
    ctx.fillRect(mx + 11, my + 7, 5, 1);

    // Exposed chrome exhaust & bent front fork
    ctx.fillStyle = '#d2def0';
    ctx.fillRect(mx + 4, my + 11, 12, 2);
    ctx.fillRect(mx + 16, my + 4, 5, 2);

    // Little puffs of grey smoke rising from the crashed engine
    const smokeOffset = Math.max(0, Math.floor(elapsedTime * 6)) % 6;
    ctx.fillStyle = 'rgba(200, 212, 228, 0.75)';
    ctx.fillRect(mx + 12, my + 1 - smokeOffset, 3, 3);
    ctx.fillRect(mx + 15, my - 2 - ((smokeOffset + 3) % 6), 2, 2);

    ctx.restore();
    return;
  }

  // Upright motorcycle (parked or driving east)
  // Ground shadow
  ctx.fillStyle = 'rgba(12, 16, 26, 0.45)';
  ctx.fillRect(mx + 2, my + 11, 24, 4);

  // Kickstand when parked
  if (motorcycle.status === 'parked') {
    ctx.fillStyle = '#141822';
    ctx.fillRect(mx + 11, my + 11, 2, 3);
  } else {
    // Exhaust puffs while driving east
    const puff = Math.max(0, Math.floor(elapsedTime * 20)) % 4;
    ctx.fillStyle = 'rgba(232, 240, 255, 0.85)';
    ctx.fillRect(mx - 3 - puff, my + 9, 3, 3);
    ctx.fillRect(mx - 7 - puff, my + 8, 2, 2);
  }

  // Rear tire (left) & Front tire (right)
  ctx.fillStyle = '#141822';
  ctx.fillRect(mx + 1, my + 6, 8, 8);
  ctx.fillRect(mx + 19, my + 6, 8, 8);
  ctx.fillStyle = '#a8b4c6';
  ctx.fillRect(mx + 3, my + 8, 4, 4);
  ctx.fillRect(mx + 21, my + 8, 4, 4);
  ctx.fillStyle = '#141822';
  ctx.fillRect(mx + 4, my + 9, 2, 2);
  ctx.fillRect(mx + 22, my + 9, 2, 2);

  // Chrome dual exhaust & engine block
  ctx.fillStyle = '#3e4654';
  ctx.fillRect(mx + 9, my + 7, 8, 4);
  ctx.fillStyle = '#d2def0';
  ctx.fillRect(mx + 4, my + 10, 12, 2);

  // Jet-black frame, tail fender & sculpted fuel tank
  ctx.fillStyle = '#141822';
  ctx.fillRect(mx + 4, my + 6, 15, 3);
  ctx.fillStyle = '#1c202c';
  ctx.fillRect(mx + 12, my + 4, 8, 4);
  ctx.fillStyle = '#8c9cb8';
  ctx.fillRect(mx + 14, my + 5, 4, 1);

  // Dark leather rider seat
  ctx.fillStyle = '#2e2422';
  ctx.fillRect(mx + 6, my + 5, 6, 3);

  // Chrome front fork, handlebars, headlight & red taillight
  ctx.fillStyle = '#cad6e8';
  ctx.fillRect(mx + 19, my + 3, 2, 6);
  ctx.fillStyle = '#141822';
  ctx.fillRect(mx + 17, my + 2, 4, 2);
  ctx.fillStyle = '#ffee54';
  ctx.fillRect(mx + 21, my + 4, 2, 2);
  ctx.fillStyle = '#e02828';
  ctx.fillRect(mx + 3, my + 6, 2, 2);

  ctx.restore();
}

/**
 * Renders animated electric sparks crackling out of the damaged EV charging cable on the driveway.
 */
function drawDamagedWireSparks(
  ctx: CanvasRenderingContext2D,
  elapsedTime: number
): void {
  const cx = Math.round(
    DAMAGED_WIRE_HAZARD.x + DAMAGED_WIRE_HAZARD.width / 2 - 1
  );
  const cy = Math.round(DAMAGED_WIRE_HAZARD.y + DAMAGED_WIRE_HAZARD.height / 2);
  const tick = Math.max(0, Math.floor(elapsedTime * 16));

  ctx.save();

  // Pulsing electric glow on the snow around the frayed wire
  if (tick % 3 !== 0) {
    ctx.fillStyle = 'rgba(112, 248, 255, 0.28)';
    ctx.fillRect(cx - 6, cy - 4, 12, 8);
  }

  // Hot white/yellow spark core
  ctx.fillStyle = tick % 2 === 0 ? '#ffffff' : '#ffee54';
  ctx.fillRect(cx - 2, cy - 1, 4, 2);

  // 4 animated jagged spark rays that jump around every 1/16th of a second
  const rayOffsets = [
    [-5, -4, -2, -2],
    [4, -5, 2, -2],
    [-4, 4, -2, 2],
    [5, 3, 2, 1],
    [0, -6, 0, -3],
    [-6, 0, -3, 0],
  ];

  for (let i = 0; i < 4; i++) {
    const idx =
      (((tick + i * 2) % rayOffsets.length) + rayOffsets.length) %
      rayOffsets.length;
    const [ox1, oy1, ox2, oy2] = rayOffsets[idx];
    ctx.fillStyle = i % 2 === 0 ? '#70f8ff' : '#ffee54';
    ctx.fillRect(cx + ox2, cy + oy2, 2, 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx + ox1, cy + oy1, 1, 1);
  }

  ctx.restore();
}

/**
 * Renders gentle falling snowflakes across the viewport for a festive Christmas atmosphere.
 */
function drawSnowfall(
  ctx: CanvasRenderingContext2D,
  elapsedTime: number,
  camera: Camera
): void {
  ctx.save();
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const flakeCount = 48;

  for (let i = 0; i < flakeCount; i++) {
    const speedY = 18 + (i % 5) * 6;
    const driftAmp = 6 + (i % 4) * 3;
    const driftFreq = 1.2 + (i % 3) * 0.4;
    const startX = (i * 53 + 17) % (w * 2);
    const startY = (i * 79 + 29) % (h * 2);

    // Compute world-space snowflake position wrapped cleanly across the viewport
    const worldX =
      startX + Math.sin(elapsedTime * driftFreq + i) * driftAmp - camera.x * 0.6;
    const worldY = startY + elapsedTime * speedY - camera.y * 0.6;

    const sx = Math.floor(((worldX % w) + w) % w);
    const sy = Math.floor(((worldY % h) + h) % h);

    const isLargeFlake = i % 3 === 0;
    ctx.fillStyle =
      i % 4 === 0 ? 'rgba(255, 255, 255, 0.92)' : 'rgba(232, 244, 255, 0.78)';
    if (isLargeFlake) {
      ctx.fillRect(sx, sy, 2, 2);
    } else {
      ctx.fillRect(sx, sy, 1, 1);
    }
  }

  ctx.restore();
}

const DIRECTION_TO_ROW: Record<Direction, number> = {
  down: 0,
  up: 1,
  left: 2,
  right: 3,
};

/**
 * 16x16 cartoony electrocuted Santa grid:
 * - Every non-'.' character ('K' or 'W') is drawn 100% pitch black (#000000) to form Santa's silhouette.
 * - On skeleton-flash frames, 'W' pixels are drawn in bright bone-white (#ffffff) on top of the black silhouette
 *   (skull with dark eye sockets & jaw teeth, spine, ribcage, arm bones, pelvis, and leg bones).
 */
const ELECTROCUTED_SANTA_GRID: readonly string[] = [
  '.....KKKKKK.....',
  '....KKKKKKKK....',
  '...KKKKKKKKKK...',
  '..KKKKWWWWKKKK..',
  '..KKWKWWWWKWKK..',
  '..KKWWWWWWWWKK..',
  '..KKKWKWWKWKK...',
  '.KKKKKKWWKKKKK..',
  '.KKWKKWWWWKKWKK.',
  '.KKWKKKWWKKKWKK.',
  '.KKKKKWWWWKKKK..',
  '.K.KKKKWWKKKK...',
  '...KKKWWWWKKK...',
  '...KKWK..KWKK...',
  '...KKWK..KWKK...',
  '...KKKK..KKKK...',
];

function drawElectrocutedSanta(
  ctx: CanvasRenderingContext2D,
  drawX: number,
  drawY: number,
  electrocutionTimer: number
): void {
  const showSkeleton = Math.max(0, Math.floor(electrocutionTimer * 14)) % 2 === 0;
  const jitterX =
    Math.max(0, Math.floor(electrocutionTimer * 28)) % 2 === 0 ? -1 : 1;
  const baseX = drawX + jitterX;

  ctx.save();

  // 1. 100% pitch-black Santa silhouette
  ctx.fillStyle = '#000000';
  for (let r = 0; r < ELECTROCUTED_SANTA_GRID.length; r++) {
    const row = ELECTROCUTED_SANTA_GRID[r];
    for (let c = 0; c < row.length; c++) {
      if (row[c] !== '.') {
        ctx.fillRect(baseX + c, drawY + r, 1, 1);
      }
    }
  }

  // 2. Blinking cartoony skeleton on top of the 100% black silhouette
  if (showSkeleton) {
    ctx.fillStyle = '#ffffff';
    for (let r = 0; r < ELECTROCUTED_SANTA_GRID.length; r++) {
      const row = ELECTROCUTED_SANTA_GRID[r];
      for (let c = 0; c < row.length; c++) {
        if (row[c] === 'W') {
          ctx.fillRect(baseX + c, drawY + r, 1, 1);
        }
      }
    }
  }

  ctx.restore();
}

function drawClosedDoorAndHiddenMask(
  ctx: CanvasRenderingContext2D,
  door: CollidableDoor
): void {
  // 1. Mask the hidden room in pure black (#000000) until the door is opened
  ctx.fillStyle = '#000000';
  for (const region of door.hiddenRegions) {
    ctx.fillRect(region.x, region.y, region.width, region.height);
  }

  // 2. Draw the closed wooden door sprite at the doorway
  const { x, y, width, height } = door.bounds;
  ctx.fillStyle = '#26160c';
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = '#784826';
  ctx.fillRect(x + 1, y + 1, width - 2, height - 2);
  ctx.fillStyle = '#5c361b';
  ctx.fillRect(x + 3, y + 3, width - 6, height - 6);
  // Brass doorknob
  ctx.fillStyle = '#f2c84b';
  ctx.fillRect(x + width - 5, y + Math.floor(height / 2), 2, 2);
}

function drawWindowGazingNpc(
  ctx: CanvasRenderingContext2D,
  npcBounds: Rect
): void {
  const x = Math.round(npcBounds.x - 2);
  const y = Math.round(npcBounds.y - 4);

  // Soft floor shadow
  ctx.fillStyle = 'rgba(12, 10, 16, 0.4)';
  ctx.fillRect(x + 3, y + 13, 10, 3);

  // Character standing facing south (looking out the big south window)
  // Dark outline & hair
  ctx.fillStyle = '#181420';
  ctx.fillRect(x + 4, y + 1, 8, 6);
  ctx.fillStyle = '#583822'; // Warm brown hair
  ctx.fillRect(x + 5, y + 2, 6, 4);

  // Cozy winter sweater (forest green with cream collar)
  ctx.fillStyle = '#181420';
  ctx.fillRect(x + 3, y + 7, 10, 5);
  ctx.fillStyle = '#e8e2d5';
  ctx.fillRect(x + 5, y + 7, 6, 1);
  ctx.fillStyle = '#2e7d52';
  ctx.fillRect(x + 4, y + 8, 8, 3);

  // Trousers & boots
  ctx.fillStyle = '#2c3e5a';
  ctx.fillRect(x + 4, y + 11, 3, 3);
  ctx.fillRect(x + 9, y + 11, 3, 3);
  ctx.fillStyle = '#181420';
  ctx.fillRect(x + 4, y + 14, 3, 1);
  ctx.fillRect(x + 9, y + 14, 3, 1);
}

function drawToiletNpc(
  ctx: CanvasRenderingContext2D,
  npcBounds: Rect
): void {
  const x = Math.round(npcBounds.x - 2);
  const y = Math.round(npcBounds.y - 4);

  // Person sitting on toilet facing west (left)
  // Hair & head
  ctx.fillStyle = '#181420';
  ctx.fillRect(x + 3, y + 1, 7, 6);
  ctx.fillStyle = '#7a3b22'; // Auburn hair
  ctx.fillRect(x + 4, y + 2, 5, 4);
  // Face looking left
  ctx.fillStyle = '#ffcfab';
  ctx.fillRect(x + 2, y + 3, 3, 3);
  ctx.fillStyle = '#181420';
  ctx.fillRect(x + 3, y + 4, 1, 1); // Eye

  // Torso / shirt (light blue pajama shirt)
  ctx.fillStyle = '#181420';
  ctx.fillRect(x + 3, y + 6, 7, 5);
  ctx.fillStyle = '#72a8d8';
  ctx.fillRect(x + 4, y + 7, 5, 4);

  // Lower body / bare knees & dropped trousers bunched around ankles
  ctx.fillStyle = '#ffcfab';
  ctx.fillRect(x + 2, y + 10, 3, 2); // Bare knees sitting forward
  ctx.fillStyle = '#404c64'; // Bunched trousers
  ctx.fillRect(x + 1, y + 12, 5, 3);
  ctx.fillStyle = '#181420';
  ctx.fillRect(x + 2, y + 14, 3, 1);
}

function drawFireplaceAnimation(
  ctx: CanvasRenderingContext2D,
  elapsedTime: number
): void {
  const fx = 11 * TILE_SIZE;
  const fy = 11 * TILE_SIZE;
  const phase = Math.floor(elapsedTime * 10) % 3;

  // Warm flickering firelight on the hearth & floor
  const alpha = 0.12 + phase * 0.03;
  ctx.fillStyle = `rgba(255, 168, 52, ${alpha})`;
  ctx.fillRect(fx - 24, fy + 8, 40, 44);

  // Animated flame tongues inside the firebox
  ctx.fillStyle = '#ff6b24';
  ctx.fillRect(fx + 3, fy + 8 + (phase % 2), 14, 12);
  ctx.fillStyle = '#ffd644';
  ctx.fillRect(fx + 5 + (phase === 1 ? 1 : 0), fy + 10, 9, 8);
  ctx.fillStyle = '#fff6b8';
  ctx.fillRect(fx + 7, fy + 13 - (phase === 2 ? 1 : 0), 5, 4);
}

function drawBlinkingExclamation(
  ctx: CanvasRenderingContext2D,
  playerDrawX: number,
  playerDrawY: number,
  elapsed: number
): void {
  // Blink at ~8 Hz while the other Santa runs past the kitchen windows
  if (Math.floor(elapsed * 8) % 2 !== 0) {
    return;
  }

  const bx = playerDrawX + 3;
  const by = playerDrawY - 12;

  // Speech/alert badge background with dark pixel outline
  ctx.fillStyle = '#141824';
  ctx.fillRect(bx, by, 10, 11);
  ctx.fillStyle = '#fff8d6';
  ctx.fillRect(bx + 1, by + 1, 8, 9);

  // Bold red/gold '!!' exclamation marks
  ctx.fillStyle = '#d62828';
  ctx.fillRect(bx + 3, by + 2, 1, 5);
  ctx.fillRect(bx + 3, by + 8, 1, 1);
  ctx.fillRect(bx + 6, by + 2, 1, 5);
  ctx.fillRect(bx + 6, by + 8, 1, 1);
}

/**
 * Draws green collision bounding boxes for all collidable objects and the player
 * when the `?debug` URL option is active.
 */
function drawCollisionDebugOutlines(
  ctx: CanvasRenderingContext2D,
  state: GameState
): void {
  ctx.save();
  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth = 1;

  // 1. Solid tiles in the tilemap (excluding outer black void)
  const { map } = state;
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      if (isSolidTile(map, c, r) && map.tiles[r][c] !== TileType.VoidBlack) {
        ctx.strokeRect(
          c * map.tileSize + 0.5,
          r * map.tileSize + 0.5,
          map.tileSize - 1,
          map.tileSize - 1
        );
      }
    }
  }

  // 2. Solid dynamic obstacles for the active level
  const activeLevel = state.levels[state.currentLevelId];
  const solidObstacles =
    state.currentLevelId === 'level-outside'
      ? [...state.throwers, state.motorcycle]
      : activeLevel.getSolidObstacles();

  for (const obs of solidObstacles) {
    ctx.strokeRect(
      Math.round(obs.x) + 0.5,
      Math.round(obs.y) + 0.5,
      obs.width - 1,
      obs.height - 1
    );
  }

  // 3. Player's collision bounding box
  ctx.strokeRect(
    Math.round(state.player.x) + 0.5,
    Math.round(state.player.y) + 0.5,
    state.player.width - 1,
    state.player.height - 1
  );

  ctx.restore();
}

export function renderGame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  assets: GameAssets
): void {
  const {
    map,
    player,
    footprints,
    dog,
    throwers,
    snowballs,
    nearbyInteractable,
    activeDialogue,
    elapsedTime,
  } = state;

  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Fill background with pure black for indoor levels
  if (state.currentLevelId !== 'level-outside') {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  const mapWidthPx = map.cols * map.tileSize;
  const mapHeightPx = map.rows * map.tileSize;
  const camera = computeCamera(
    player.x,
    player.y,
    player.width,
    player.height,
    ctx.canvas.width,
    ctx.canvas.height,
    mapWidthPx,
    mapHeightPx
  );

  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  const playerDrawX = Math.round(player.x - (TILE_SIZE - player.width) / 2);
  const playerDrawY = Math.round(player.y - (TILE_SIZE - player.height));

  if (state.currentLevelId === 'level-outside') {
    // 1. Draw visible outdoor map region
    const isFullOverworldAtlas =
      assets.winterTiles.width === mapWidthPx &&
      assets.winterTiles.height === mapHeightPx;

    if (isFullOverworldAtlas) {
      ctx.drawImage(
        assets.winterTiles,
        camera.x,
        camera.y,
        camera.width,
        camera.height,
        camera.x,
        camera.y,
        camera.width,
        camera.height
      );
    } else {
      const startCol = Math.max(0, Math.floor(camera.x / TILE_SIZE));
      const endCol = Math.min(
        map.cols - 1,
        Math.ceil((camera.x + camera.width) / TILE_SIZE)
      );
      const startRow = Math.max(0, Math.floor(camera.y / TILE_SIZE));
      const endRow = Math.min(
        map.rows - 1,
        Math.ceil((camera.y + camera.height) / TILE_SIZE)
      );

      for (let row = startRow; row <= endRow; row++) {
        for (let col = startCol; col <= endCol; col++) {
          const tileType = map.tiles[row][col];
          ctx.drawImage(
            assets.winterTiles,
            tileType * TILE_SIZE,
            0,
            TILE_SIZE,
            TILE_SIZE,
            col * TILE_SIZE,
            row * TILE_SIZE,
            TILE_SIZE,
            TILE_SIZE
          );
        }
      }
    }

    // 2. Draw Santa's fading footprints in the snow
    drawFootprints(ctx, footprints);

    // 3. Draw the ladder (either lying next to the dog on the ground, or leaning up the west side of the house)
    if (!state.hasLadder && !state.ladderPlaced) {
      drawGroundLadder(ctx);
    } else if (state.ladderPlaced) {
      drawPlacedHouseLadder(ctx);
    }

    // 4. Draw the black motorcycle (parked, driving east, or crashed into the trees)
    drawMotorcycle(ctx, state.motorcycle, elapsedTime);

    // 5. Draw animated electric sparks on the damaged EV charging cable
    drawDamagedWireSparks(ctx, elapsedTime);

    // 6. Draw snowball thrower NPCs on the driveway (with throwing animation frame)
    for (const thrower of throwers) {
      const drawX = Math.round(thrower.x - (TILE_SIZE - thrower.width) / 2);
      const drawY = Math.round(thrower.y - (TILE_SIZE - thrower.height));

      const isThrowingPose =
        thrower.throwTimer < 0.25 ||
        thrower.throwTimer > thrower.throwInterval - 0.35;
      const frameCol = isThrowingPose ? 1 : 0;
      const dirRow = thrower.facing === 'left' ? 1 : 0;

      ctx.drawImage(
        assets.throwerSprite,
        frameCol * TILE_SIZE,
        dirRow * TILE_SIZE,
        TILE_SIZE,
        TILE_SIZE,
        drawX,
        drawY,
        TILE_SIZE,
        TILE_SIZE
      );
    }

    // 7. Draw the dog on the east snow field & its floating love hearts when chasing
    drawDogAndHearts(ctx, dog, assets.dogSprite);

    // 8. Draw flying snowballs
    for (const sb of snowballs) {
      const drawX = Math.round(sb.x - (TILE_SIZE - sb.width) / 2);
      const drawY = Math.round(sb.y - (TILE_SIZE - sb.height) / 2);
      ctx.drawImage(assets.snowballSprite, drawX, drawY, TILE_SIZE, TILE_SIZE);
    }
  } else if (state.currentLevelId === 'level-basement') {
    const basement = state.levels['level-basement'];
    ctx.drawImage(
      assets.basementTiles,
      camera.x,
      camera.y,
      camera.width,
      camera.height,
      camera.x,
      camera.y,
      camera.width,
      camera.height
    );

    // Animated warm fire inside the library fireplace
    drawFireplaceAnimation(ctx, elapsedTime);

    // Character standing by the extra big south windows in the basement living room
    drawWindowGazingNpc(ctx, basement.windowNpc);

    // Person sitting on the toilet in the basement bathroom
    drawToiletNpc(ctx, basement.toiletNpc);

    // Closed doors & black fog-of-war over unopened rooms (e.g. bathroom)
    for (const door of basement.doors) {
      drawClosedDoorAndHiddenMask(ctx, door);
    }
  } else if (state.currentLevelId === 'level-upstairs') {
    const upstairs = state.levels['level-upstairs'];
    ctx.drawImage(
      assets.upstairsTiles,
      camera.x,
      camera.y,
      camera.width,
      camera.height,
      camera.x,
      camera.y,
      camera.width,
      camera.height
    );

    // If the one-time Kitchen Rosanna cutscene is active, draw the other Santa running west-to-east outside the north windows
    if (upstairs.rosannaCutscene?.active) {
      const cs = upstairs.rosannaCutscene;
      const stepPhase = Math.floor(cs.walkTimer * 10) % 4;
      const frameCol = stepPhase === 1 ? 1 : stepPhase === 3 ? 2 : 0;
      const rightDirRow = DIRECTION_TO_ROW.right;
      ctx.drawImage(
        assets.santaSprite,
        frameCol * TILE_SIZE,
        rightDirRow * TILE_SIZE,
        TILE_SIZE,
        TILE_SIZE,
        Math.round(cs.santaX),
        Math.round(cs.santaY),
        TILE_SIZE,
        TILE_SIZE
      );
    }

    // Draw black cat in extra room
    drawCat(ctx, upstairs.cat, assets.catSprite);

    // Closed doors & black fog-of-war over unopened rooms (shower, bedroom, office, table room)
    for (const door of upstairs.doors) {
      drawClosedDoorAndHiddenMask(ctx, door);
    }
  }

  // Draw Santa (electrocuted OR 4-directional SNES spritesheet + 3-frame walk cycle + hit blinking)
  if (state.currentLevelId === 'level-outside' && state.electrocutionTimer > 0) {
    drawElectrocutedSanta(ctx, playerDrawX, playerDrawY, state.electrocutionTimer);
  } else {
    const isBlinkHidden =
      player.blinkTimer > 0 && Math.floor(player.blinkTimer * 12) % 2 === 1;

    if (!isBlinkHidden) {
      const dirRow = DIRECTION_TO_ROW[player.facing] ?? 0;
      let frameCol = 0;
      if (player.isMoving) {
        const stepPhase = Math.floor(player.walkTimer * 8) % 4;
        frameCol = stepPhase === 1 ? 1 : stepPhase === 3 ? 2 : 0;
      }

      ctx.drawImage(
        assets.santaSprite,
        frameCol * TILE_SIZE,
        dirRow * TILE_SIZE,
        TILE_SIZE,
        TILE_SIZE,
        playerDrawX,
        playerDrawY,
        TILE_SIZE,
        TILE_SIZE
      );
    }
  }

  // Draw blinking '!' above the player's head during the Kitchen Rosanna cutscene
  if (
    state.currentLevelId === 'level-upstairs' &&
    state.levels['level-upstairs'].rosannaCutscene?.active
  ) {
    drawBlinkingExclamation(
      ctx,
      playerDrawX,
      playerDrawY,
      state.levels['level-upstairs'].rosannaCutscene.elapsed
    );
  }

  // Draw blinking '!' above the toilet person's head during the basement bathroom toilet cutscene
  if (
    state.currentLevelId === 'level-basement' &&
    state.levels['level-basement'].toiletCutscene?.active
  ) {
    const toiletNpc = state.levels['level-basement'].toiletNpc;
    const npcDrawX = Math.round(toiletNpc.x - (TILE_SIZE - toiletNpc.width) / 2);
    const npcDrawY = Math.round(toiletNpc.y - (TILE_SIZE - toiletNpc.height));
    drawBlinkingExclamation(
      ctx,
      npcDrawX,
      npcDrawY,
      state.levels['level-basement'].toiletCutscene.timer
    );
  }

  // Debug overlay: render green collision bounding boxes for all collidable objects and the player
  if (state.debugMode) {
    drawCollisionDebugOutlines(ctx, state);
  }

  ctx.restore();

  // Gentle falling snow overlay across the screen (outdoor level only)
  if (state.currentLevelId === 'level-outside') {
    drawSnowfall(ctx, elapsedTime, camera);
  }

  // Screen-space UI overlay: Dialogue box OR bottom Z-key interaction prompt
  if (activeDialogue) {
    const line = activeDialogue.lines[activeDialogue.currentIndex] ?? '';
    drawDialogueBox(ctx, line, assets.zKeySprite, !state.joystickActive);
  } else if (nearbyInteractable && !state.joystickActive) {
    drawInteractionPrompt(ctx, nearbyInteractable.promptText, assets.zKeySprite);
  }
}
