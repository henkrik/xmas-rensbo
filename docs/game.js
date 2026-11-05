"use strict";
(() => {
  // assets/sprites/santa.png
  var santa_default = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAfUlEQVR4nGNgwAJkFHX/Y8PY1GLVfE1DAysmaAg+zUQZApL89es/XoysBqcB/6+tAisE0chskgzAhmEGUOwFogMQmwE4A5KQAQRjAuZ8kAIrPTWcGKc3YIIgGqb4/8U0MIbxkdXgDUiyUyK6AfMkJcGYZAOQnYzOp70BpAIAw61bMjzitTMAAAAASUVORK5CYII=";

  // assets/sprites/snowball.png
  var snowball_default = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAANklEQVR4nGNgGAVYgYyi7n9smGjNv379x4qJMgSXAdeffCLfAJBmsgyAaSTJAAZKA3EUDAAAAOj4ePtunwWaAAAAAElFTkSuQmCC";

  // assets/sprites/thrower.png
  var thrower_default = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAgklEQVR4nGNgwAJkFHX/Y8PY1GLV/P9iGlZM0BCQAruajXgxXkNAkr9+/ceLiTLg/7VVYIUgGplNkgHYMEEDYIZc09DAignaTmwgwlyKNfAIGQByyfUnnzC9Q6wLCHoHJKEV3YIVE5Ua8bmCaAOQbUTnE2WAlZ4aGMMMQObT3gBSAQDe8Eg8PrTODAAAAABJRU5ErkJggg==";

  // assets/sprites/z-key.png
  var z_key_default = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAV0lEQVR4nGNgYGBgkFHU/U8OZoBp/vXrP1kYbAjMgOtPPpGEsRpArM0EDcDlZ6INwOZXsg1A10ySAdg0E20ALs0kBeLgiQWiXUB2SrTSUyMLU8cASrMzALRlzhH1z6aeAAAAAElFTkSuQmCC";

  // assets/tiles/winter-tiles.png
  var winter_tiles_default = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAOAAAAAQCAYAAAAPv3P4AAADOklEQVR4nO2aPYsUQRCG70cYbqKBXKKBCIrgD7g1vVQwEDMxMBVjucTcTA7k/sBFYnRcYibImZloZGi4yUgflNTWVXV9dPV86AYvs/T0TM9019Nvdc/ubTbD0EvDl2eXqtX59OHdli7OP14pA70/en2lTLrv6vqtLfV6R9rOTstS6/h///FrOPv8NXzc6w2fBqEEm1USFDdeHA73j19eHot6QXhw+LRJrQM4dQCdvlo3qfX5n7w5GdbPj8LHqfvvL4Dffv5ODUyAQAv+mrtJwi6pte0F0Dtj3n34qEl4QKyzNr5Gem7tvaQA8rRdjm8f3wkLAxh1LgDJez0FsMS/R+kAWmUBVQqAGoAaaFYHxPAVB/S4oAVSWqdAVPokeqQAWtqXAIRsQ+p/7jwHoLVt7IBSoEvnqAOWsov9/S1BXa6cA1CadLhyDkCoj39zZZMCaAkQ6j41ALwpJ3XK1vY5sABcKq5uZgoK96Wg4DR+DAeEc9BvVgC5NuEcXo70BBA7FH5XWr5YB9Tgk4KYqwMAWpzO64DY+TQA6XNLAMN74PrZKWgUwKgkAMv7QrsAoQVA+qxjA8hNOlx5zQE1jQJgdE2Y5YDWNWGtbZqCSs+Ag84ifI+W9FMCUOvfyLpR0lgOuJQU9MHtm1XNOgWtwScB4HE7zilb27eCS8vhPnNIQS2BwwVSzQGLIOBbAbTsglLQ4P3BPcdIQSMAlj5oURqA0TVUZONFA7CWRloA9LjgHFLQXgBq7msBUNsJ3TlgY8oZCeIagN50VHsGy04ovu7a+p5JkJrNZRc0KguAEvwSgHQNGHHA/34N6IUPfkvuJ7lg5DsgdkrvJCAFeXQCyU5Bves23JeRY28HHBvAjBQUIMOi50YHsOaQLSlcdPdTc0DNuaTZUnM+OqtmpqCR49wBXFoKulrid0BL4HKBrAFI14OW/4LWJgMtxbOkIdn/GPrXAVxSCjqL74AZAbZiFrPSwPb4DqhtPMxJGQBmtu8FMKsfpgZwqvHr8mdsL4DRb4AcgDUXy3avTWDmpGrdxs5uX8sAaP1NowPjNZZHcF2BKPJfULiudfxbxy8dQC8Amd8Bp5B34Heal6Ye/z8UIqvV8ISObgAAAABJRU5ErkJggg==";

  // src/assets/index.ts
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      img.src = src;
    });
  }
  async function loadAllAssets() {
    const [santaSprite, throwerSprite, snowballSprite, zKeySprite, winterTiles] = await Promise.all([
      loadImage(santa_default),
      loadImage(thrower_default),
      loadImage(snowball_default),
      loadImage(z_key_default),
      loadImage(winter_tiles_default)
    ]);
    return {
      santaSprite,
      throwerSprite,
      snowballSprite,
      zKeySprite,
      winterTiles
    };
  }

  // src/core/input.ts
  function createEmptyInput() {
    return {
      up: false,
      down: false,
      left: false,
      right: false,
      action: false,
      actionJustPressed: false
    };
  }
  var KEY_TO_BUTTON = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    KeyZ: "action",
    z: "action",
    Z: "action"
  };
  function applyKeyEvent(state, codeOrKey, isPressed) {
    const btn = KEY_TO_BUTTON[codeOrKey];
    if (!btn) {
      return false;
    }
    if (btn === "action") {
      if (isPressed && !state.action) {
        state.actionJustPressed = true;
      }
      state.action = isPressed;
    } else {
      state[btn] = isPressed;
    }
    return true;
  }
  function consumeActionPress(state) {
    if (state.actionJustPressed) {
      state.actionJustPressed = false;
      return true;
    }
    return false;
  }
  function attachKeyboardListeners(target, state) {
    const onKeyDown = (e) => {
      if (applyKeyEvent(state, e.code || e.key, true)) {
        e.preventDefault();
      }
    };
    const onKeyUp = (e) => {
      if (applyKeyEvent(state, e.code || e.key, false)) {
        e.preventDefault();
      }
    };
    target.addEventListener("keydown", onKeyDown);
    target.addEventListener("keyup", onKeyUp);
    return () => {
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
    };
  }

  // src/world/tilemap.ts
  var TILE_SIZE = 16;
  var MAP_COLS = 32;
  var MAP_ROWS = 28;
  var HOUSE_DOOR_COL = 13;
  var HOUSE_DOOR_ROW = 9;
  var PLAYER_START_X = 14.5 * TILE_SIZE;
  var PLAYER_START_Y = 25.5 * TILE_SIZE;
  var STARTER_MAP = {
    cols: MAP_COLS,
    rows: MAP_ROWS,
    tileSize: TILE_SIZE,
    tiles: [
      //0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      // 0
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      // 1
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      // 2
      [1, 1, 0, 0, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1],
      // 3: House top roof ridge
      [1, 1, 0, 0, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1],
      // 4: House middle roof
      [1, 0, 0, 0, 5, 5, 5, 5, 5, 7, 7, 7, 5, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 1],
      // 5: House lower roof + gable | Cottage roofs
      [1, 0, 0, 0, 13, 6, 6, 13, 13, 7, 7, 7, 13, 6, 6, 13, 13, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 1],
      // 6: House upper story windows & balcony
      [1, 0, 0, 0, 13, 13, 13, 13, 13, 7, 7, 7, 13, 13, 13, 13, 13, 0, 0, 9, 9, 9, 9, 0, 0, 9, 9, 9, 9, 0, 0, 1],
      // 7: House mid facade | Cottage walls
      [1, 0, 0, 0, 13, 6, 6, 13, 13, 7, 7, 7, 13, 13, 6, 6, 13, 0, 0, 9, 9, 9, 9, 0, 0, 9, 9, 9, 9, 0, 0, 1],
      // 8: House lower windows & porch
      [1, 0, 0, 0, 13, 13, 13, 13, 13, 7, 7, 7, 13, 8, 13, 13, 13, 0, 0, 0, 0, 0, 0, 4, 4, 0, 0, 0, 0, 0, 0, 1],
      // 9: House ground floor & Door (col 13, row 9)
      [1, 0, 0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0, 3, 0, 0, 4, 4, 0, 0, 0, 0, 0, 0, 0, 1],
      // 10: Gravel terrace in front of house
      [1, 0, 0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      // 11: Gravel terrace
      [1, 0, 0, 0, 0, 4, 4, 0, 0, 0, 0, 0, 2, 2, 2, 2, 2, 2, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      // 12: Bush by house | Upper driveway
      [1, 0, 0, 0, 0, 4, 4, 0, 0, 0, 0, 0, 3, 2, 2, 2, 2, 2, 3, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      // 13: Bush | Thujas flanking driveway
      [1, 0, 0, 0, 0, 0, 0, 12, 12, 0, 0, 0, 3, 2, 2, 2, 2, 2, 3, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 1],
      // 14: Patio table | Driveway
      [1, 0, 0, 0, 0, 0, 0, 12, 12, 0, 0, 0, 0, 2, 2, 2, 2, 2, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 1],
      // 15: Patio table | Driveway
      [1, 0, 0, 0, 4, 4, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 5, 5, 5, 5, 5, 0, 1],
      // 16: Snowball throwers at col 12 & col 18! | Shed roof
      [1, 0, 0, 0, 0, 4, 4, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 5, 5, 5, 5, 5, 0, 1],
      // 17: Diagonal hedge | Driveway | Shed roof
      [1, 0, 0, 0, 0, 0, 4, 4, 0, 0, 0, 0, 3, 2, 2, 2, 2, 2, 3, 0, 3, 0, 0, 0, 0, 10, 10, 10, 10, 10, 0, 1],
      // 18: Hedge | Thujas | Red-door shed wall
      [1, 0, 0, 0, 0, 0, 0, 4, 4, 0, 0, 0, 3, 2, 2, 2, 2, 2, 3, 0, 3, 0, 0, 0, 0, 10, 10, 10, 10, 10, 0, 1],
      // 19: Hedge | Thujas | Red-door shed wall
      [1, 0, 0, 0, 0, 0, 0, 0, 4, 4, 0, 0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0, 0, 0, 1],
      // 20: Lower gravel courtyard expands toward shed
      [1, 0, 5, 5, 5, 5, 5, 5, 0, 4, 4, 0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0, 0, 0, 1],
      // 21: Blue garage roof | Courtyard
      [1, 0, 5, 5, 5, 5, 5, 5, 0, 0, 4, 4, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0, 0, 0, 1],
      // 22: Blue garage roof | Courtyard
      [1, 0, 11, 11, 11, 11, 11, 11, 0, 0, 0, 4, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0, 0, 0, 0, 0, 1],
      // 23: Blue garage wall | Courtyard
      [1, 0, 11, 11, 11, 11, 11, 11, 0, 0, 0, 0, 0, 2, 2, 2, 2, 2, 4, 4, 4, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      // 24: Blue garage doors | Road | Foreground bushes
      [1, 0, 11, 11, 11, 11, 11, 11, 0, 0, 0, 0, 0, 2, 2, 2, 2, 0, 4, 4, 4, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      // 25: Santa starts at col 14.5, row 25.5!
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      // 26: Road entrance
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
      // 27: Bottom tree border with road gate
    ]
  };
  var WALKABLE_TILES = /* @__PURE__ */ new Set([
    0 /* Snow */,
    2 /* Road */
  ]);
  function isSolidTile(map, col, row) {
    if (col < 0 || col >= map.cols || row < 0 || row >= map.rows) {
      return true;
    }
    return !WALKABLE_TILES.has(map.tiles[row][col]);
  }
  function isRectCollidingWithMap(map, x, y, width, height) {
    const startCol = Math.floor(x / map.tileSize);
    const endCol = Math.floor((x + width - 1e-3) / map.tileSize);
    const startRow = Math.floor(y / map.tileSize);
    const endRow = Math.floor((y + height - 1e-3) / map.tileSize);
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        if (isSolidTile(map, c, r)) {
          return true;
        }
      }
    }
    return false;
  }

  // src/rendering/renderer.ts
  function computeCamera(playerX, playerY, playerWidth, playerHeight, viewportWidth, viewportHeight, mapWidthPx, mapHeightPx) {
    const targetX = playerX + playerWidth / 2 - viewportWidth / 2;
    const targetY = playerY + playerHeight / 2 - viewportHeight / 2;
    const maxX = Math.max(0, mapWidthPx - viewportWidth);
    const maxY = Math.max(0, mapHeightPx - viewportHeight);
    return {
      x: Math.round(Math.max(0, Math.min(maxX, targetX))),
      y: Math.round(Math.max(0, Math.min(maxY, targetY))),
      width: viewportWidth,
      height: viewportHeight
    };
  }
  function wrapTextLines(ctx, text, maxWidth) {
    const words = text.split(" ");
    const lines = [];
    let current = "";
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
  function drawInteractionPrompt(ctx, promptText, zKeySprite) {
    ctx.save();
    ctx.font = 'bold 10px "Courier New", Courier, monospace';
    ctx.textBaseline = "middle";
    const textWidth = Math.ceil(ctx.measureText(promptText).width);
    const iconSize = 16;
    const gap = 6;
    const padX = 8;
    const boxHeight = 22;
    const boxWidth = padX * 2 + iconSize + gap + textWidth;
    const boxX = Math.round((ctx.canvas.width - boxWidth) / 2);
    const boxY = ctx.canvas.height - boxHeight - 6;
    ctx.fillStyle = "rgba(16, 24, 40, 0.92)";
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    ctx.strokeStyle = "#fafaff";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxWidth - 1, boxHeight - 1);
    const iconX = boxX + padX;
    const iconY = boxY + Math.round((boxHeight - iconSize) / 2);
    ctx.drawImage(zKeySprite, iconX, iconY, iconSize, iconSize);
    ctx.fillStyle = "#ffd166";
    ctx.fillText(promptText, iconX + iconSize + gap, boxY + boxHeight / 2 + 1);
    ctx.restore();
  }
  function drawDialogueBox(ctx, text, zKeySprite) {
    ctx.save();
    const margin = 8;
    const boxHeight = 52;
    const boxWidth = ctx.canvas.width - margin * 2;
    const boxX = margin;
    const boxY = ctx.canvas.height - boxHeight - margin;
    ctx.fillStyle = "rgba(14, 22, 38, 0.95)";
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    ctx.strokeStyle = "#fafaff";
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX + 1, boxY + 1, boxWidth - 2, boxHeight - 2);
    ctx.font = 'bold 10px "Courier New", Courier, monospace';
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "top";
    const lines = wrapTextLines(ctx, text, boxWidth - 24);
    lines.forEach((line, idx) => {
      ctx.fillText(line, boxX + 10, boxY + 10 + idx * 13);
    });
    ctx.drawImage(
      zKeySprite,
      boxX + boxWidth - 20,
      boxY + boxHeight - 20,
      14,
      14
    );
    ctx.restore();
  }
  function renderGame(ctx, state, assets) {
    const { map, player, throwers, snowballs, nearbyInteractable, activeDialogue } = state;
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
    for (const thrower of throwers) {
      const drawX = Math.round(thrower.x - (TILE_SIZE - thrower.width) / 2);
      const drawY = Math.round(thrower.y - (TILE_SIZE - thrower.height));
      ctx.save();
      if (thrower.facing === "left") {
        ctx.translate(drawX + TILE_SIZE, drawY);
        ctx.scale(-1, 1);
        ctx.drawImage(assets.throwerSprite, 0, 0, TILE_SIZE, TILE_SIZE);
      } else {
        ctx.drawImage(assets.throwerSprite, drawX, drawY, TILE_SIZE, TILE_SIZE);
      }
      ctx.restore();
    }
    for (const sb of snowballs) {
      const drawX = Math.round(sb.x - (TILE_SIZE - sb.width) / 2);
      const drawY = Math.round(sb.y - (TILE_SIZE - sb.height) / 2);
      ctx.drawImage(assets.snowballSprite, drawX, drawY, TILE_SIZE, TILE_SIZE);
    }
    const isBlinkHidden = player.blinkTimer > 0 && Math.floor(player.blinkTimer * 12) % 2 === 1;
    if (!isBlinkHidden) {
      const bobOffset = player.isMoving ? Math.sin(player.walkTimer * 18) > 0 ? -1 : 0 : 0;
      const drawX = Math.round(player.x - (TILE_SIZE - player.width) / 2);
      const drawY = Math.round(
        player.y - (TILE_SIZE - player.height) + bobOffset
      );
      ctx.save();
      if (player.facing === "left") {
        ctx.translate(drawX + TILE_SIZE, drawY);
        ctx.scale(-1, 1);
        ctx.drawImage(assets.santaSprite, 0, 0, TILE_SIZE, TILE_SIZE);
      } else {
        ctx.drawImage(assets.santaSprite, drawX, drawY, TILE_SIZE, TILE_SIZE);
      }
      ctx.restore();
    }
    ctx.restore();
    if (activeDialogue) {
      const line = activeDialogue.lines[activeDialogue.currentIndex] ?? "";
      drawDialogueBox(ctx, line, assets.zKeySprite);
    } else if (nearbyInteractable) {
      drawInteractionPrompt(ctx, nearbyInteractable.promptText, assets.zKeySprite);
    }
  }

  // src/entities/player.ts
  function createPlayer(x, y) {
    return {
      x,
      y,
      width: 12,
      height: 12,
      speed: 75,
      // pixels per second
      facing: "up",
      isMoving: false,
      walkTimer: 0,
      blinkTimer: 0
    };
  }
  function rectsIntersect(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  }
  function updatePlayer(player, input, dtSeconds, map, solidObstacles = []) {
    if (player.blinkTimer > 0) {
      player.blinkTimer = Math.max(0, player.blinkTimer - dtSeconds);
    }
    let dx = 0;
    let dy = 0;
    if (input.left) dx -= 1;
    if (input.right) dx += 1;
    if (input.up) dy -= 1;
    if (input.down) dy += 1;
    if (dx === 0 && dy === 0) {
      player.isMoving = false;
      player.walkTimer = 0;
      return;
    }
    player.isMoving = true;
    player.walkTimer += dtSeconds;
    if (dy < 0) player.facing = "up";
    else if (dy > 0) player.facing = "down";
    else if (dx < 0) player.facing = "left";
    else if (dx > 0) player.facing = "right";
    const length = Math.hypot(dx, dy);
    const moveX = dx / length * player.speed * dtSeconds;
    const moveY = dy / length * player.speed * dtSeconds;
    const collidesAt = (testX, testY) => {
      if (isRectCollidingWithMap(map, testX, testY, player.width, player.height)) {
        return true;
      }
      const testRect = {
        x: testX,
        y: testY,
        width: player.width,
        height: player.height
      };
      return solidObstacles.some((obs) => rectsIntersect(testRect, obs));
    };
    const nextX = player.x + moveX;
    if (!collidesAt(nextX, player.y)) {
      player.x = nextX;
    }
    const nextY = player.y + moveY;
    if (!collidesAt(player.x, nextY)) {
      player.y = nextY;
    }
  }

  // src/entities/snowball.ts
  var SNOWBALL_SPEED = 110;
  var THROW_INTERVAL_SECONDS = 2.4;
  var HIT_BLINK_DURATION_SECONDS = 2;
  function createDrivewayThrowers() {
    const rowY = 16 * TILE_SIZE + 2;
    const leftX = 12 * TILE_SIZE + 2;
    const rightX = 18 * TILE_SIZE + 2;
    return [
      {
        id: "thrower-left",
        x: leftX,
        y: rowY,
        width: 12,
        height: 12,
        facing: "right",
        targetX: rightX,
        throwInterval: THROW_INTERVAL_SECONDS,
        // Throw shortly after level starts/resets
        throwTimer: 0.6
      },
      {
        id: "thrower-right",
        x: rightX,
        y: rowY,
        width: 12,
        height: 12,
        facing: "left",
        targetX: leftX,
        throwInterval: THROW_INTERVAL_SECONDS,
        // Staggered so they alternate throwing back and forth across the driveway
        throwTimer: 1.8
      }
    ];
  }
  function spawnSnowballFromThrower(thrower) {
    const dir = thrower.facing === "right" ? 1 : -1;
    return {
      x: thrower.facing === "right" ? thrower.x + thrower.width : thrower.x - 6,
      y: thrower.y + 3,
      width: 6,
      height: 6,
      vx: dir * SNOWBALL_SPEED,
      vy: 0,
      targetX: thrower.targetX
    };
  }
  function updateSnowballFight(throwers, snowballs, player, dtSeconds) {
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
      if (rectsIntersect(sb, player)) {
        return true;
      }
      if (sb.vx > 0 && sb.x >= sb.targetX || sb.vx < 0 && sb.x + sb.width <= sb.targetX + 12) {
        snowballs.splice(i, 1);
      }
    }
    return false;
  }

  // src/world/interaction.ts
  var INTERACTION_MAX_GAP_PX = 6;
  function rectEdgeDistance(a, b) {
    const dx = Math.max(0, b.x - (a.x + a.width), a.x - (b.x + b.width));
    const dy = Math.max(0, b.y - (a.y + a.height), a.y - (b.y + b.height));
    return Math.hypot(dx, dy);
  }
  function buildInteractables(throwers) {
    const list = throwers.map((t) => ({
      id: t.id,
      bounds: { x: t.x, y: t.y, width: t.width, height: t.height },
      promptText: "Z: Talk to",
      dialogueLines: ["Watch out!"]
    }));
    list.push({
      id: "house-door",
      bounds: {
        x: HOUSE_DOOR_COL * TILE_SIZE,
        y: HOUSE_DOOR_ROW * TILE_SIZE,
        width: TILE_SIZE,
        height: TILE_SIZE
      },
      promptText: "Z: Open door",
      dialogueLines: [
        "It's locked.",
        "There has to be another way into the house..."
      ]
    });
    return list;
  }
  function findNearbyInteractable(player, interactables, maxGapPx = INTERACTION_MAX_GAP_PX) {
    let closest = null;
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

  // src/world/gameState.ts
  function createGameState(map = STARTER_MAP) {
    const player = createPlayer(PLAYER_START_X, PLAYER_START_Y);
    const throwers = createDrivewayThrowers();
    const snowballs = [];
    const interactables = buildInteractables(throwers);
    return {
      map,
      player,
      throwers,
      snowballs,
      interactables,
      nearbyInteractable: null,
      activeDialogue: null
    };
  }
  function resetAfterSnowballHit(state) {
    state.player.x = PLAYER_START_X;
    state.player.y = PLAYER_START_Y;
    state.player.facing = "up";
    state.player.isMoving = false;
    state.player.walkTimer = 0;
    state.player.blinkTimer = HIT_BLINK_DURATION_SECONDS;
    state.throwers = createDrivewayThrowers();
    state.snowballs = [];
    state.interactables = buildInteractables(state.throwers);
    state.nearbyInteractable = null;
    state.activeDialogue = null;
  }
  function updateGameState(state, input, dtSeconds) {
    const zPressed = consumeActionPress(input);
    if (state.activeDialogue) {
      state.player.isMoving = false;
      if (zPressed) {
        state.activeDialogue.currentIndex += 1;
        if (state.activeDialogue.currentIndex >= state.activeDialogue.lines.length) {
          state.activeDialogue = null;
        }
      }
      return;
    }
    updatePlayer(state.player, input, dtSeconds, state.map, state.throwers);
    const hitBySnowball = updateSnowballFight(
      state.throwers,
      state.snowballs,
      state.player,
      dtSeconds
    );
    if (hitBySnowball) {
      resetAfterSnowballHit(state);
      return;
    }
    state.nearbyInteractable = findNearbyInteractable(
      state.player,
      state.interactables
    );
    if (zPressed && state.nearbyInteractable) {
      state.activeDialogue = {
        lines: state.nearbyInteractable.dialogueLines,
        currentIndex: 0
      };
    }
  }

  // src/main.ts
  async function startGame() {
    const canvas = document.getElementById("game-canvas");
    if (!canvas) {
      throw new Error("Could not find #game-canvas element");
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not get 2D rendering context");
    }
    const assets = await loadAllAssets();
    const input = createEmptyInput();
    attachKeyboardListeners(window, input);
    const state = createGameState();
    let lastTimestamp = performance.now();
    function frame(now) {
      const dtSeconds = Math.min((now - lastTimestamp) / 1e3, 0.1);
      lastTimestamp = now;
      updateGameState(state, input, dtSeconds);
      renderGame(ctx, state, assets);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  startGame().catch((err) => {
    console.error("Failed to start Xmas Rensbo:", err);
  });
})();
