import { GameAssets } from '../assets';
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

  // Classic SNES dark navy box with crisp white border
  ctx.fillStyle = 'rgba(16, 24, 40, 0.92)';
  ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
  ctx.strokeStyle = '#fafaff';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxWidth - 1, boxHeight - 1);

  // Draw Z key icon
  const iconX = boxX + padX;
  const iconY = boxY + Math.round((boxHeight - iconSize) / 2);
  ctx.drawImage(zKeySprite, iconX, iconY, iconSize, iconSize);

  // Draw prompt label (e.g. "Z: Talk to" or "Z: Open door")
  ctx.fillStyle = '#ffd166';
  ctx.fillText(promptText, iconX + iconSize + gap, boxY + boxHeight / 2 + 1);
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

  // SNES-style dialogue box
  ctx.fillStyle = 'rgba(14, 22, 38, 0.95)';
  ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
  ctx.strokeStyle = '#fafaff';
  ctx.lineWidth = 2;
  ctx.strokeRect(boxX + 1, boxY + 1, boxWidth - 2, boxHeight - 2);

  // Wrapped dialogue text
  ctx.font = 'bold 10px "Courier New", Courier, monospace';
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'top';
  const lines = wrapTextLines(ctx, text, boxWidth - 24);
  lines.forEach((line, idx) => {
    ctx.fillText(line, boxX + 10, boxY + 10 + idx * 13);
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

  // 1. Draw visible tilemap cells
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
      const srcX = tileType * TILE_SIZE;
      const destX = col * TILE_SIZE;
      const destY = row * TILE_SIZE;

      ctx.drawImage(
        assets.winterTiles,
        srcX,
        0,
        TILE_SIZE,
        TILE_SIZE,
        destX,
        destY,
        TILE_SIZE,
        TILE_SIZE
      );
    }
  }

  // 2. Draw snowball thrower NPCs on the driveway
  for (const thrower of throwers) {
    const drawX = Math.round(thrower.x - (TILE_SIZE - thrower.width) / 2);
    const drawY = Math.round(thrower.y - (TILE_SIZE - thrower.height));

    ctx.save();
    if (thrower.facing === 'left') {
      ctx.translate(drawX + TILE_SIZE, drawY);
      ctx.scale(-1, 1);
      ctx.drawImage(assets.throwerSprite, 0, 0, TILE_SIZE, TILE_SIZE);
    } else {
      ctx.drawImage(assets.throwerSprite, drawX, drawY, TILE_SIZE, TILE_SIZE);
    }
    ctx.restore();
  }

  // 3. Draw flying snowballs
  for (const sb of snowballs) {
    const drawX = Math.round(sb.x - (TILE_SIZE - sb.width) / 2);
    const drawY = Math.round(sb.y - (TILE_SIZE - sb.height) / 2);
    ctx.drawImage(assets.snowballSprite, drawX, drawY, TILE_SIZE, TILE_SIZE);
  }

  // 4. Draw Santa (blinking after being hit by a snowball)
  const isBlinkHidden =
    player.blinkTimer > 0 && Math.floor(player.blinkTimer * 12) % 2 === 1;

  if (!isBlinkHidden) {
    const bobOffset = player.isMoving
      ? Math.sin(player.walkTimer * 18) > 0
        ? -1
        : 0
      : 0;

    const drawX = Math.round(player.x - (TILE_SIZE - player.width) / 2);
    const drawY = Math.round(
      player.y - (TILE_SIZE - player.height) + bobOffset
    );

    ctx.save();
    if (player.facing === 'left') {
      ctx.translate(drawX + TILE_SIZE, drawY);
      ctx.scale(-1, 1);
      ctx.drawImage(assets.santaSprite, 0, 0, TILE_SIZE, TILE_SIZE);
    } else {
      ctx.drawImage(assets.santaSprite, drawX, drawY, TILE_SIZE, TILE_SIZE);
    }
    ctx.restore();
  }

  ctx.restore();

  // 5. Screen-space UI overlay: Dialogue box OR bottom Z-key interaction prompt
  if (activeDialogue) {
    const line =
      activeDialogue.lines[activeDialogue.currentIndex] ?? '';
    drawDialogueBox(ctx, line, assets.zKeySprite);
  } else if (nearbyInteractable) {
    drawInteractionPrompt(ctx, nearbyInteractable.promptText, assets.zKeySprite);
  }
}
