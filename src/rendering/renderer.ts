import { GameAssets } from '../assets';
import { Direction } from '../entities/player';
import { GameState } from '../world/gameState';
import { TILE_SIZE } from '../world/tilemap';

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

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
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
  ctx.font = 'bold 10px "Courier New", Courier, monospace';
  ctx.textBaseline = 'middle';

  const textWidth = Math.ceil(ctx.measureText(promptText).width);
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

  // Draw prompt label with 1px drop shadow
  const textX = iconX + iconSize + gap;
  const textY = boxY + boxHeight / 2 + 1;
  ctx.fillStyle = '#0c101a';
  ctx.fillText(promptText, textX + 1, textY + 1);
  ctx.fillStyle = '#ffd166';
  ctx.fillText(promptText, textX, textY);
  ctx.restore();
}

function drawDialogueBox(
  ctx: CanvasRenderingContext2D,
  text: string,
  zKeySprite: HTMLImageElement
): void {
  ctx.save();
  const margin = 8;
  const boxHeight = 52;
  const boxWidth = ctx.canvas.width - margin * 2;
  const boxX = margin;
  const boxY = ctx.canvas.height - boxHeight - margin;

  drawSnesFrame(ctx, boxX, boxY, boxWidth, boxHeight);

  // Wrapped dialogue text with crisp 1px drop shadow
  ctx.font = 'bold 10px "Courier New", Courier, monospace';
  ctx.textBaseline = 'top';
  const lines = wrapTextLines(ctx, text, boxWidth - 24);
  lines.forEach((line, idx) => {
    const lx = boxX + 10;
    const ly = boxY + 10 + idx * 13;
    ctx.fillStyle = '#0c101a';
    ctx.fillText(line, lx + 1, ly + 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(line, lx, ly);
  });

  // Small Z key indicator in the bottom-right corner of the dialogue box
  ctx.drawImage(
    zKeySprite,
    boxX + boxWidth - 20,
    boxY + boxHeight - 20,
    14,
    14
  );
  ctx.restore();
}

const DIRECTION_TO_ROW: Record<Direction, number> = {
  down: 0,
  up: 1,
  left: 2,
  right: 3,
};

export function renderGame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  assets: GameAssets
): void {
  const { map, player, throwers, snowballs, nearbyInteractable, activeDialogue } =
    state;

  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

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

  // 1. Draw visible map region
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

  // 2. Draw snowball thrower NPCs on the driveway (with throwing animation frame)
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

  // 3. Draw flying snowballs
  for (const sb of snowballs) {
    const drawX = Math.round(sb.x - (TILE_SIZE - sb.width) / 2);
    const drawY = Math.round(sb.y - (TILE_SIZE - sb.height) / 2);
    ctx.drawImage(assets.snowballSprite, drawX, drawY, TILE_SIZE, TILE_SIZE);
  }

  // 4. Draw Santa (4-directional SNES spritesheet + 3-frame walk cycle + hit blinking)
  const isBlinkHidden =
    player.blinkTimer > 0 && Math.floor(player.blinkTimer * 12) % 2 === 1;

  if (!isBlinkHidden) {
    const dirRow = DIRECTION_TO_ROW[player.facing] ?? 0;
    let frameCol = 0;
    if (player.isMoving) {
      const stepPhase = Math.floor(player.walkTimer * 8) % 4;
      frameCol = stepPhase === 1 ? 1 : stepPhase === 3 ? 2 : 0;
    }

    const drawX = Math.round(player.x - (TILE_SIZE - player.width) / 2);
    const drawY = Math.round(player.y - (TILE_SIZE - player.height));

    ctx.drawImage(
      assets.santaSprite,
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

  ctx.restore();

  // 5. Screen-space UI overlay: Dialogue box OR bottom Z-key interaction prompt
  if (activeDialogue) {
    const line = activeDialogue.lines[activeDialogue.currentIndex] ?? '';
    drawDialogueBox(ctx, line, assets.zKeySprite);
  } else if (nearbyInteractable) {
    drawInteractionPrompt(ctx, nearbyInteractable.promptText, assets.zKeySprite);
  }
}
