import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/**
 * Pure-Node RGBA PNG encoder (zero external dependencies).
 * Generates 16-bit SNES-style pixel-art spritesheets and the 512x448 Rensbo overworld map.
 */
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const combined = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(combined), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

class PixelCanvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 4);
  }

  setPixel(x, y, rgba) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || ix >= this.width || iy < 0 || iy >= this.height) return;
    const idx = (iy * this.width + ix) * 4;
    const alpha = (rgba[3] ?? 255) / 255;
    if (alpha >= 0.999) {
      this.data[idx] = rgba[0];
      this.data[idx + 1] = rgba[1];
      this.data[idx + 2] = rgba[2];
      this.data[idx + 3] = 255;
    } else if (alpha > 0) {
      const inv = 1 - alpha;
      this.data[idx] = Math.round(rgba[0] * alpha + this.data[idx] * inv);
      this.data[idx + 1] = Math.round(rgba[1] * alpha + this.data[idx + 1] * inv);
      this.data[idx + 2] = Math.round(rgba[2] * alpha + this.data[idx + 2] * inv);
      this.data[idx + 3] = Math.min(255, Math.round(alpha * 255 + this.data[idx + 3] * inv));
    }
  }

  fillRect(x, y, w, h, rgba) {
    for (let py = y; py < y + h; py++) {
      for (let px = x; px < x + w; px++) {
        this.setPixel(px, py, rgba);
      }
    }
  }

  strokeRect(x, y, w, h, rgba) {
    for (let px = x; px < x + w; px++) {
      this.setPixel(px, y, rgba);
      this.setPixel(px, y + h - 1, rgba);
    }
    for (let py = y; py < y + h; py++) {
      this.setPixel(x, py, rgba);
      this.setPixel(x + w - 1, py, rgba);
    }
  }

  fillEllipse(cx, cy, rx, ry, rgba) {
    for (let py = Math.floor(cy - ry); py <= Math.ceil(cy + ry); py++) {
      for (let px = Math.floor(cx - rx); px <= Math.ceil(cx + rx); px++) {
        const dx = (px - cx) / rx;
        const dy = (py - cy) / ry;
        if (dx * dx + dy * dy <= 1.0) {
          this.setPixel(px, py, rgba);
        }
      }
    }
  }

  drawLine(x0, y0, x1, y1, rgba) {
    let x = Math.round(x0);
    let y = Math.round(y0);
    const dx = Math.abs(Math.round(x1) - x);
    const dy = Math.abs(Math.round(y1) - y);
    const sx = x < Math.round(x1) ? 1 : -1;
    const sy = y < Math.round(y1) ? 1 : -1;
    let err = dx - dy;
    while (true) {
      this.setPixel(x, y, rgba);
      if (x === Math.round(x1) && y === Math.round(y1)) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }
  }

  toPngBuffer() {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.width, 0);
    ihdr.writeUInt32BE(this.height, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    const rawData = Buffer.alloc(this.height * (1 + this.width * 4));
    for (let y = 0; y < this.height; y++) {
      const rowStart = y * (1 + this.width * 4);
      rawData[rowStart] = 0;
      const srcOffset = y * this.width * 4;
      rawData.set(this.data.subarray(srcOffset, srcOffset + this.width * 4), rowStart + 1);
    }

    const compressed = zlib.deflateSync(rawData, { level: 9 });
    return Buffer.concat([
      signature,
      pngChunk('IHDR', ihdr),
      pngChunk('IDAT', compressed),
      pngChunk('IEND', Buffer.alloc(0)),
    ]);
  }
}

function hash2d(x, y) {
  let n = (x * 374761393 + y * 668265263) ^ 0x5bf03635;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 0xffffffff;
}

// Smooth organic 2D value field (no blocky squares!)
function smoothNoise(x, y) {
  return (
    0.45 * Math.sin(x * 0.055 + y * 0.042) +
    0.35 * Math.cos(x * 0.032 - y * 0.068) +
    0.2 * Math.sin((x + y) * 0.11)
  );
}

// 16-bit SNES Color Palette inspired by A Link to the Past + inspiration/map.jpeg
const PAL = {
  outline: [22, 26, 36, 255],
  shadow: [14, 18, 28, 105],
  deepShadow: [14, 18, 28, 155],

  // Lush SNES lawn greens (smoothly shaded, no grid blocks)
  grassBright: [118, 166, 78, 255],
  grassLight: [104, 152, 68, 255],
  grassBase: [90, 138, 58, 255],
  grassMid: [76, 122, 48, 255],
  grassDark: [60, 102, 38, 255],
  grassGold: [132, 148, 68, 255],
  snowPure: [244, 248, 255, 255],
  snowMid: [214, 228, 244, 255],

  // Rosy-grey & terracotta gravel driveway & terrace (matching map.jpeg)
  gravelBase: [192, 164, 154, 255],
  gravelLight: [208, 182, 172, 255],
  gravelWarm: [178, 148, 138, 255],
  gravelDark: [156, 126, 116, 255],
  terracottaBase: [188, 144, 130, 255],
  terracottaLight: [204, 160, 146, 255],
  terracottaDark: [164, 120, 108, 255],
  curbLight: [206, 210, 216, 255],
  curbDark: [128, 134, 144, 255],

  // Granite cliff rock (upper left behind main house)
  rockLight: [164, 170, 176, 255],
  rockMid: [128, 134, 142, 255],
  rockDark: [88, 94, 104, 255],

  // Forest & Trees (Scots pine, spruce, birch, thuja)
  pineDarkest: [18, 48, 36, 255],
  pineDark: [26, 70, 50, 255],
  pineMid: [38, 96, 66, 255],
  pineLight: [56, 126, 82, 255],
  pineBright: [82, 154, 96, 255],

  thujaDark: [24, 68, 38, 255],
  thujaMid: [38, 98, 52, 255],
  thujaLight: [60, 132, 68, 255],
  thujaHighlight: [88, 162, 86, 255],

  trunkDark: [62, 40, 28, 255],
  trunkMid: [96, 62, 40, 255],
  pineTrunkRed: [156, 90, 52, 255],
  birchWhite: [236, 238, 242, 255],
  birchGrey: [168, 172, 180, 255],
  autumnBright: [208, 162, 74, 255],
  autumnLeaf: [182, 132, 58, 255],
  autumnDark: [138, 92, 40, 255],

  // Main House (Light warm-grey Swedish clapboard villa + white veranda + charcoal roof)
  roofDarkest: [30, 36, 46, 255],
  roofDark: [44, 52, 66, 255],
  roofMid: [60, 70, 86, 255],
  roofLight: [82, 94, 112, 255],
  roofHighlight: [108, 122, 142, 255],

  houseWallLight: [224, 228, 234, 255],
  houseWallMid: [206, 212, 220, 255],
  houseWallSeam: [182, 190, 200, 255],
  houseWallShade: [160, 168, 180, 255],
  foundationGrey: [122, 128, 138, 255],

  trimWhite: [250, 252, 255, 255],
  trimLight: [228, 234, 242, 255],
  trimShade: [190, 198, 212, 255],

  windowGlassDark: [32, 46, 64, 255],
  windowGlassMid: [48, 68, 92, 255],
  windowGlassReflect: [92, 126, 160, 255],
  windowWarmGlow: [255, 216, 112, 255],

  // Guest Cottages (Stugor - warm timber log cabins)
  cabinLight: [198, 142, 86, 255],
  cabinMid: [174, 118, 66, 255],
  cabinDark: [138, 88, 46, 255],
  cabinDeep: [104, 64, 32, 255],

  // Blue Garage (bottom-left) & Glass Greenhouse
  garageBlueLight: [108, 152, 188, 255],
  garageBlueMid: [82, 124, 160, 255],
  garageBlueDark: [60, 96, 128, 255],
  glassFrame: [216, 226, 236, 255],
  glassTint: [150, 200, 220, 150],

  // Red-Door Shed (right) & Playhouse Slide (bottom-right)
  shedRedBright: [212, 44, 44, 255],
  shedRedMid: [178, 32, 32, 255],
  shedRedDark: [136, 22, 22, 255],
  slideGreenBright: [76, 204, 92, 255],
  slideGreenDark: [44, 152, 62, 255],
  gold: [255, 212, 92, 255],
};

// ============================================================================
// 1. GENERATE 512x448 SNES OVERWORLD MAP (32x28 tiles of 16x16px)
// ============================================================================
function generateRensboOverworldPng(mapMatrix) {
  const W = 32 * 16; // 512
  const H = 28 * 16; // 448
  const canvas = new PixelCanvas(W, H);

  // Step 1: Smooth Organic Terrain Pass (SNES lawn & gravel driveway/terrace)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const col = Math.floor(x / 16);
      const row = Math.floor(y / 16);
      const tile = mapMatrix[row][col];
      const n = hash2d(x, y);
      const wave = smoothNoise(x, y);

      if (tile === 2) {
        // Warmer reddish-terracotta gravel terrace directly under the left/center of Main House
        const isHouseTerrace = row <= 11 && col <= 11;
        let c = isHouseTerrace ? PAL.terracottaBase : PAL.gravelBase;
        if (wave > 0.25) {
          c = isHouseTerrace ? PAL.terracottaLight : PAL.gravelLight;
        } else if (wave < -0.25) {
          c = isHouseTerrace ? PAL.terracottaDark : PAL.gravelWarm;
        }
        // Subtle 2-pixel pebble texture (no harsh white noise)
        if (n > 0.88) {
          c = isHouseTerrace ? PAL.terracottaDark : PAL.gravelDark;
        } else if (n < 0.1) {
          c = isHouseTerrace ? PAL.terracottaLight : PAL.gravelLight;
        }
        canvas.setPixel(x, y, c);
      } else {
        // Smooth SNES meadow grass with natural elevation & forest-edge shading
        let c = PAL.grassBase;
        if (row <= 4) {
          c = wave > 0.1 ? PAL.grassMid : PAL.grassDark;
        } else if (wave > 0.32) {
          c = PAL.grassLight;
        } else if (wave > 0.12 && wave <= 0.32 && (x + y) % 2 === 0) {
          c = PAL.grassLight; // smooth SNES diagonal dither
        } else if (wave < -0.32) {
          c = PAL.grassMid;
        } else if (wave < -0.15 && (x + y) % 2 === 0) {
          c = PAL.grassMid;
        }
        if (n > 0.95) c = PAL.grassDark;
        else if (n < 0.03) c = PAL.grassBright;
        canvas.setPixel(x, y, c);
      }
    }
  }

  // Step 1b: Crisp 16-bit Zelda Grass Blade Tufts & Subtle Wildflowers on the Lawn
  for (let row = 4; row < 27; row++) {
    for (let col = 1; col < 31; col++) {
      if (mapMatrix[row][col] !== 0) continue;
      const seed = hash2d(col * 19 + 3, row * 37 + 7);
      const bx = col * 16 + 3 + Math.floor(seed * 9);
      const by = row * 16 + 4 + ((col * 5 + row * 3) % 8);
      if (seed < 0.45) {
        // Classic ALTTP 3-blade grass tuft
        canvas.setPixel(bx, by, PAL.grassDark);
        canvas.setPixel(bx - 1, by, PAL.grassDark);
        canvas.setPixel(bx + 1, by, PAL.grassDark);
        canvas.setPixel(bx - 2, by - 1, PAL.grassBright);
        canvas.setPixel(bx, by - 1, PAL.grassBright);
        canvas.setPixel(bx + 2, by - 1, PAL.grassBright);
        canvas.setPixel(bx, by - 2, PAL.grassBright);
      } else if (seed > 0.9) {
        // Tiny golden-autumn leaf / white clover detail on the lawn
        canvas.setPixel(bx, by, PAL.grassDark);
        canvas.setPixel(bx, by - 1, seed > 0.95 ? PAL.snowPure : PAL.grassGold);
        canvas.setPixel(bx + 1, by, PAL.grassLight);
      }
    }
  }

  // Step 1c: Stone Curbing & Wheel Tracks along Gravel Driveway/Terrace
  for (let row = 1; row < 27; row++) {
    for (let col = 1; col < 31; col++) {
      if (mapMatrix[row][col] !== 2) continue;
      const bx = col * 16;
      const by = row * 16;

      // Subtle wheel tracks along the main driveway (cols 14..16, rows 11..26)
      if ((col === 14 || col === 16) && row >= 11 && row <= 26) {
        for (let py = by; py < by + 16; py++) {
          const wx = bx + (col === 14 ? 6 : 9);
          if (hash2d(wx, py) > 0.35) {
            canvas.setPixel(wx, py, PAL.gravelWarm);
            canvas.setPixel(wx + 1, py, PAL.gravelDark);
          }
        }
      }

      // Stone curb edge where gravel meets grass
      if (mapMatrix[row][col - 1] === 0) {
        for (let py = by; py < by + 16; py++) {
          canvas.setPixel(bx, py, PAL.curbDark);
          canvas.setPixel(bx + 1, py, py % 5 === 0 ? PAL.curbDark : PAL.curbLight);
        }
      }
      if (mapMatrix[row][col + 1] === 0) {
        for (let py = by; py < by + 16; py++) {
          canvas.setPixel(bx + 15, py, PAL.curbDark);
          canvas.setPixel(bx + 14, py, py % 5 === 0 ? PAL.curbDark : PAL.curbLight);
        }
      }
      if (mapMatrix[row + 1]?.[col] === 0) {
        for (let px = bx; px < bx + 16; px++) {
          canvas.setPixel(px, by + 15, PAL.curbDark);
          canvas.setPixel(px, by + 14, px % 6 === 0 ? PAL.curbDark : PAL.curbLight);
        }
      }
      if (mapMatrix[row - 1]?.[col] === 0) {
        for (let px = bx; px < bx + 16; px++) {
          canvas.setPixel(px, by, PAL.curbDark);
          canvas.setPixel(px, by + 1, px % 6 === 0 ? PAL.curbDark : PAL.curbLight);
        }
      }
    }
  }

  // Stepping stone path from Left Guest Cottage (stuga) down to the upper driveway
  const steppingStones = [
    [19 * 16 + 14, 9 * 16 + 3],
    [19 * 16 + 4, 9 * 16 + 10],
    [18 * 16 + 10, 10 * 16 + 2],
    [18 * 16 + 2, 10 * 16 + 10],
  ];
  for (const [sx, sy] of steppingStones) {
    canvas.fillEllipse(sx, sy + 1, 4, 2.2, PAL.curbDark);
    canvas.fillEllipse(sx, sy, 3.5, 1.8, PAL.curbLight);
  }

  // ==========================================================================
  // Step 2: Granite Rock Cliff Outcrops (Upper-left behind main house, as in map.jpeg)
  // ==========================================================================
  function drawRockOutcrop(x, y, w, h) {
    canvas.fillEllipse(x + w / 2, y + h / 2 + 2, w / 2 + 2, h / 2 + 1, PAL.shadow);
    for (let py = y; py < y + h; py++) {
      for (let px = x; px < x + w; px++) {
        const dx = (px - (x + w / 2)) / (w / 2);
        const dy = (py - (y + h / 2)) / (h / 2);
        if (dx * dx + dy * dy <= 1.05) {
          const n = hash2d(px, py);
          let c = PAL.rockMid;
          if (dy < -0.25 || (dx < -0.2 && n > 0.35)) c = PAL.rockLight;
          if (dy > 0.35 || (px + py) % 11 === 0) c = PAL.rockDark;
          if (dy < -0.55 && n > 0.4) c = PAL.grassGold;
          canvas.setPixel(px, py, c);
        }
      }
    }
  }
  drawRockOutcrop(1 * 16 + 4, 2 * 16 + 8, 48, 26);
  drawRockOutcrop(3 * 16 + 6, 1 * 16 + 12, 38, 22);

  // ==========================================================================
  // Step 3: SNES Foliage, Trees, Birch, Conical Thuja & Connected Hedgerows
  // ==========================================================================
  function drawLeafyCluster(cx, cy, rx, ry, paletteRamp, hasFrost = false) {
    const [darkest, dark, mid, light, bright] = paletteRamp;
    for (let py = Math.floor(cy - ry); py <= Math.ceil(cy + ry); py++) {
      for (let px = Math.floor(cx - rx); px <= Math.ceil(cx + rx); px++) {
        const dx = (px - cx) / rx;
        const dy = (py - cy) / ry;
        const d2 = dx * dx + dy * dy;
        if (d2 <= 1.0) {
          const n = hash2d(px, py);
          let c = mid;
          if (d2 > 0.82) {
            c = darkest;
          } else if (dy < -0.35 && dx < 0.25) {
            c = n > 0.35 ? bright : light;
          } else if (dx < -0.2 && dy < 0.25) {
            c = light;
          } else if (dy > 0.35 || dx > 0.35) {
            c = n > 0.45 ? darkest : dark;
          } else if (n > 0.68) {
            c = light;
          } else if (n < 0.25) {
            c = dark;
          }
          if (hasFrost && dy < -0.62 && dx > -0.4 && dx < 0.4 && n > 0.5) {
            c = PAL.snowPure;
          }
          canvas.setPixel(px, py, c);
        }
      }
    }
  }

  const GREEN_RAMP = [
    PAL.pineDarkest,
    PAL.thujaDark,
    PAL.thujaMid,
    PAL.thujaLight,
    PAL.thujaHighlight,
  ];
  const AUTUMN_RAMP = [
    PAL.outline,
    PAL.autumnDark,
    PAL.autumnLeaf,
    PAL.autumnBright,
    PAL.grassGold,
  ];

  function drawSnesPineTree(cx, baseY, scale = 1.0, isScotsPine = false) {
    const w = Math.round(22 * scale);
    canvas.fillEllipse(cx + 1, baseY - 1, w * 0.42, 4, PAL.shadow);

    const trunkW = Math.max(3, Math.round(4 * scale));
    const trunkH = isScotsPine ? Math.round(12 * scale) : Math.round(6 * scale);
    for (let py = baseY - trunkH; py < baseY; py++) {
      for (let px = cx - Math.floor(trunkW / 2); px <= cx + Math.floor(trunkW / 2); px++) {
        const isLeft = px < cx;
        canvas.setPixel(
          px,
          py,
          isScotsPine
            ? isLeft
              ? PAL.pineTrunkRed
              : PAL.trunkMid
            : isLeft
            ? PAL.trunkMid
            : PAL.trunkDark
        );
      }
    }

    const tiers = 3;
    for (let t = 0; t < tiers; t++) {
      const tierBaseY = baseY - trunkH + 2 - t * Math.round(6.5 * scale);
      const tierHeight = Math.round((13 - t * 2) * scale);
      const tierHalfW = Math.round((w * 0.54) * (1 - t * 0.2));

      for (let py = tierBaseY - tierHeight; py <= tierBaseY; py++) {
        const relY = (py - (tierBaseY - tierHeight)) / Math.max(1, tierHeight);
        const rowHalfW = Math.max(1, Math.round(tierHalfW * (0.22 + 0.78 * relY)));
        for (let px = cx - rowHalfW; px <= cx + rowHalfW; px++) {
          const relX = (px - cx) / Math.max(1, rowHalfW);
          const n = hash2d(px, py);
          const isEdge = Math.abs(px - cx) === rowHalfW || py === tierBaseY;

          let c = PAL.pineMid;
          if (isEdge && py === tierBaseY) {
            c = PAL.pineDarkest;
          } else if (relY < 0.24 && relX < 0.25 && n > 0.35) {
            c = relY < 0.14 ? PAL.snowPure : PAL.snowMid;
          } else if (relX < -0.15 && relY < 0.75) {
            c = n > 0.45 ? PAL.pineBright : PAL.pineLight;
          } else if (relX > 0.25 || relY > 0.8) {
            c = n > 0.5 ? PAL.pineDarkest : PAL.pineDark;
          } else if (n > 0.65) {
            c = PAL.pineLight;
          } else if (n < 0.25) {
            c = PAL.pineDark;
          }
          canvas.setPixel(px, py, c);
        }
      }
    }
  }

  function drawBirchTree(cx, baseY, height = 34) {
    canvas.fillEllipse(cx + 2, baseY, 6, 2.5, PAL.shadow);
    // Slender white birch trunk with dark bark notches and Y-branches
    for (let py = baseY - height; py <= baseY; py++) {
      const t = (py - (baseY - height)) / height;
      const halfW = t > 0.5 ? 1.5 : 1;
      for (let px = Math.ceil(cx - halfW); px <= Math.floor(cx + halfW); px++) {
        let c = px <= cx ? PAL.birchWhite : PAL.birchGrey;
        if ((py + px * 3) % 7 === 0) c = PAL.outline;
        canvas.setPixel(px, py, c);
      }
    }
    canvas.drawLine(cx, baseY - height + 10, cx - 6, baseY - height + 4, PAL.birchWhite);
    canvas.drawLine(cx, baseY - height + 12, cx + 6, baseY - height + 6, PAL.birchGrey);

    // Airy golden-autumn & olive birch crown
    drawLeafyCluster(cx - 5, baseY - height + 6, 6, 4.5, AUTUMN_RAMP, false);
    drawLeafyCluster(cx + 5, baseY - height + 5, 6, 4.5, AUTUMN_RAMP, false);
    drawLeafyCluster(cx, baseY - height + 1, 7, 5, AUTUMN_RAMP, true);
  }

  // Sprawling Apple/Deciduous Tree on the central lawn (map.jpeg center-left)
  function drawAppleTree(cx, baseY) {
    canvas.fillEllipse(cx + 2, baseY, 11, 4, PAL.shadow);
    // Crooked dark orchard trunk splitting into wide branches
    for (let py = baseY - 12; py <= baseY; py++) {
      canvas.fillRect(cx - 2, py, 4, 1, PAL.trunkDark);
      canvas.setPixel(cx - 1, py, PAL.trunkMid);
    }
    canvas.drawLine(cx - 1, baseY - 10, cx - 9, baseY - 17, PAL.trunkMid);
    canvas.drawLine(cx + 1, baseY - 10, cx + 9, baseY - 16, PAL.trunkDark);
    canvas.drawLine(cx, baseY - 12, cx, baseY - 20, PAL.trunkMid);

    // Multi-lobed rounded SNES leafy canopy
    drawLeafyCluster(cx - 8, baseY - 17, 8, 6, GREEN_RAMP, false);
    drawLeafyCluster(cx + 8, baseY - 16, 8, 6, GREEN_RAMP, false);
    drawLeafyCluster(cx, baseY - 21, 9, 6.5, GREEN_RAMP, true);
    drawLeafyCluster(cx, baseY - 14, 9, 5.5, GREEN_RAMP, false);
  }

  // Tall Slender Conical Thuja (Arborvitae) lining the driveway in map.jpeg
  function drawConicalThuja(cx, baseY) {
    canvas.fillEllipse(cx + 2, baseY - 1, 7, 3.5, PAL.deepShadow);
    canvas.fillRect(cx - 2, baseY - 4, 4, 4, PAL.trunkDark);

    const height = 27;
    const topY = baseY - 3 - height;
    for (let py = topY; py <= baseY - 3; py++) {
      const t = (py - topY) / height;
      const halfW = Math.max(1, Math.round(1.2 + Math.sin(t * Math.PI * 0.62) * 6.2));
      for (let px = cx - halfW; px <= cx + halfW; px++) {
        const relX = (px - cx) / Math.max(1, halfW);
        const n = hash2d(px, py);
        let c = PAL.thujaMid;
        if (Math.abs(px - cx) === halfW) {
          c = PAL.pineDarkest;
        } else if (relX < -0.2) {
          c = n > 0.4 ? PAL.thujaHighlight : PAL.thujaLight;
        } else if (relX > 0.25 || t > 0.88) {
          c = PAL.thujaDark;
        } else if (n > 0.65) {
          c = PAL.thujaLight;
        }
        canvas.setPixel(px, py, c);
      }
    }
  }

  // ==========================================================================
  // Step 4: Draw Forest Border with Natural Organic Offsets (No rigid grid!)
  // ==========================================================================
  // Deep forest canopy base along rows 0..2
  for (let y = 0; y < 3 * 16; y++) {
    for (let x = 0; x < W; x++) {
      if (y < 38) {
        const n = hash2d(x, y);
        canvas.setPixel(x, y, n > 0.5 ? PAL.pineDarkest : PAL.pineDark);
      }
    }
  }

  for (let row = 0; row < 28; row++) {
    for (let col = 0; col < 32; col++) {
      if (mapMatrix[row][col] === 1) {
        // Deterministic organic jitter so border trees overlap naturally like ALTTP woods
        const jx = Math.round((hash2d(col * 13, row * 29) - 0.5) * 6);
        const jy = Math.round((hash2d(col * 41, row * 17) - 0.5) * 4);
        const scale = 0.92 + hash2d(col * 7, row * 11) * 0.22;
        const cx = col * 16 + 8 + jx;
        const by = row * 16 + 15 + jy;
        const isScots = row <= 2 && col >= 7 && col <= 21 && (col + row) % 2 === 0;

        if (row <= 2 && col >= 23 && (col + row) % 2 === 0) {
          drawBirchTree(cx, by + 2, 26);
        } else {
          drawSnesPineTree(cx, by, scale, isScots);
        }
      }
    }
  }

  // ==========================================================================
  // Step 5: Draw THE MAIN HOUSE (cols 4..16, rows 3..9)
  // ==========================================================================
  {
    const hx = 4 * 16;
    const hy = 3 * 16;
    const hw = 13 * 16;
    const hh = 7 * 16;
    const roofH = 3 * 16;
    const wallY = hy + roofH;
    const wallH = 4 * 16;

    // Soft ambient shadow cast onto the gravel terrace & right lawn
    canvas.fillRect(hx + 4, hy + hh, hw + 4, 6, PAL.deepShadow);
    canvas.fillRect(hx + hw, hy + 12, 6, hh - 6, PAL.shadow);

    // 5a. Main House Clapboard Walls (cols 4..16, rows 6..9)
    for (let py = wallY; py < wallY + wallH; py++) {
      for (let px = hx; px < hx + hw; px++) {
        const isUnderEave = py < wallY + 4;
        const isFoundation = py >= wallY + wallH - 5;
        let c = PAL.houseWallLight;
        if (isFoundation) {
          c = py === wallY + wallH - 1 ? PAL.outline : PAL.foundationGrey;
        } else if (isUnderEave) {
          c = PAL.houseWallShade;
        } else if ((px - hx) % 4 === 0) {
          c = PAL.houseWallSeam;
        } else if ((px - hx) % 4 === 1) {
          c = PAL.houseWallMid;
        }
        if (py === wallY + 31 || py === wallY + 32) {
          c = py === wallY + 31 ? PAL.houseWallSeam : PAL.trimWhite;
        }
        canvas.setPixel(px, py, c);
      }
    }

    // White corner trim boards & rain gutter downspouts
    canvas.fillRect(hx, wallY, 3, wallH - 5, PAL.trimWhite);
    canvas.fillRect(hx + hw - 3, wallY, 3, wallH - 5, PAL.trimWhite);
    canvas.strokeRect(hx, wallY, hw, wallH, PAL.outline);

    // 5b. Multi-pane Main House Windows with white frames & striped awnings
    function drawHouseWindow(wx, wy, ww, wh, panes = 3, hasAwning = true) {
      canvas.fillRect(wx + 1, wy + wh, ww, 2, PAL.houseWallShade);
      canvas.fillRect(wx, wy, ww, wh, PAL.trimWhite);
      canvas.strokeRect(wx, wy, ww, wh, PAL.outline);

      const innerX = wx + 2;
      const innerY = wy + 2;
      const innerW = ww - 4;
      const innerH = wh - 4;
      const paneW = Math.floor(innerW / panes);

      for (let i = 0; i < panes; i++) {
        const px0 = innerX + i * paneW;
        const pw = i === panes - 1 ? innerW - i * paneW : paneW - 1;
        canvas.fillRect(px0, innerY, pw, innerH, PAL.windowGlassDark);
        canvas.fillRect(px0 + 1, innerY + innerH - 5, pw - 2, 4, PAL.windowWarmGlow);
        canvas.drawLine(px0 + 1, innerY + 5, px0 + 4, innerY + 1, PAL.windowGlassReflect);
        if (i < panes - 1) {
          canvas.fillRect(px0 + pw, innerY, 1, innerH, PAL.trimWhite);
        }
      }

      if (hasAwning) {
        for (let ay = 0; ay < 4; ay++) {
          for (let ax = wx - 1; ax <= wx + ww; ax++) {
            const stripe = Math.floor((ax - wx) / 3) % 2 === 0;
            canvas.setPixel(
              ax,
              wy - 2 + ay,
              ay === 3 ? PAL.outline : stripe ? PAL.trimWhite : PAL.roofLight
            );
          }
        }
      }
    }

    drawHouseWindow(5 * 16 + 2, 6 * 16 + 5, 36, 20, 3, true);
    drawHouseWindow(5 * 16 + 2, 8 * 16 + 5, 36, 20, 3, true);
    drawHouseWindow(13 * 16 + 4, 6 * 16 + 5, 28, 19, 2, false);
    drawHouseWindow(15 * 16 - 2, 8 * 16 + 8, 16, 16, 1, false);

    // 5c. Front Entrance Door at col 13, row 9 (HOUSE_DOOR_COL = 13, HOUSE_DOOR_ROW = 9)
    {
      const dx = 13 * 16 + 1;
      const dy = 8 * 16 + 10;
      const dw = 14;
      const dh = 22;
      canvas.fillRect(dx - 1, dy - 1, dw + 2, dh + 1, PAL.outline);
      canvas.fillRect(dx, dy, dw, dh, PAL.trimWhite);
      canvas.fillRect(dx + 2, dy + 2, dw - 4, dh - 3, PAL.trimLight);
      canvas.fillRect(dx + 3, dy + 3, 8, 7, PAL.windowGlassMid);
      canvas.fillRect(dx + 6, dy + 3, 2, 7, PAL.trimWhite);
      canvas.fillRect(dx + 3, dy + 6, 8, 1, PAL.trimWhite);
      // Festive Christmas Wreath on the front door
      canvas.fillEllipse(dx + 7, dy + 8, 4, 4, PAL.thujaMid);
      canvas.fillEllipse(dx + 7, dy + 8, 2.5, 2.5, PAL.thujaHighlight);
      canvas.fillEllipse(dx + 7, dy + 8, 1.2, 1.2, PAL.windowGlassDark);
      canvas.fillRect(dx + 6, dy + 11, 3, 2, PAL.shedRedBright);
      canvas.fillRect(dx + 10, dy + 14, 2, 2, PAL.gold);
    }

    // 5d. Main Pitched Slate Roof (cols 4..16, rows 3..5)
    for (let py = hy; py < hy + roofH; py++) {
      const relY = (py - hy) / roofH;
      const indent = Math.round((1 - relY) * 8);
      for (let px = hx + indent; px < hx + hw - indent; px++) {
        const isRidge = py < hy + 3;
        const isEave = py >= hy + roofH - 4;
        const shingleRow = (py - hy) % 5 === 0;
        const shingleCol = ((px + Math.floor((py - hy) / 5) * 3) % 6) === 0;

        let c = PAL.roofMid;
        if (isRidge) {
          c = py === hy ? PAL.outline : PAL.roofHighlight;
        } else if (isEave) {
          c = py === hy + roofH - 1 ? PAL.outline : py === hy + roofH - 2 ? PAL.trimWhite : PAL.snowMid;
        } else if (shingleRow) {
          c = PAL.roofDarkest;
        } else if (shingleCol) {
          c = PAL.roofDark;
        } else if (relY < 0.35) {
          c = PAL.roofLight;
        }
        canvas.setPixel(px, py, c);
      }
      canvas.setPixel(hx + indent, py, PAL.outline);
      canvas.setPixel(hx + indent + 1, py, PAL.trimWhite);
      canvas.setPixel(hx + indent + 2, py, PAL.trimLight);
      canvas.setPixel(hx + hw - indent - 1, py, PAL.outline);
      canvas.setPixel(hx + hw - indent - 2, py, PAL.trimWhite);
    }

    // Chimney & TV Antenna on the upper-left roof ridge (col 7, rows 2..3)
    const chimX = 7 * 16 + 4;
    const chimY = 2 * 16 + 10;
    canvas.fillRect(chimX, chimY, 10, 12, PAL.roofDarkest);
    canvas.fillRect(chimX + 1, chimY + 1, 8, 10, PAL.roofMid);
    canvas.fillRect(chimX - 1, chimY, 12, 2, PAL.snowPure);
    canvas.drawLine(chimX + 5, chimY - 10, chimX + 5, chimY, PAL.curbLight);
    canvas.drawLine(chimX + 1, chimY - 8, chimX + 9, chimY - 8, PAL.curbLight);
    canvas.drawLine(chimX + 2, chimY - 5, chimX + 8, chimY - 5, PAL.curbLight);

    // 5e. Central Projecting 2-Story White Veranda / Sunroom & Gable (cols 9..11, rows 4..9)
    const vx = 9 * 16;
    const vw = 3 * 16;
    const vy = 5 * 16 + 6;
    const vh = 10 * 16 - vy + 2; // projects 2px forward onto the terrace

    canvas.fillRect(vx + vw, vy + 2, 4, vh - 2, PAL.deepShadow);
    canvas.fillRect(vx, vy, vw, vh, PAL.trimWhite);
    canvas.strokeRect(vx, vy, vw, vh, PAL.outline);

    for (let i = 0; i < 3; i++) {
      const wx = vx + 4 + i * 14;
      const wy = 6 * 16 + 2;
      canvas.fillRect(wx, wy, 12, 13, PAL.windowGlassDark);
      canvas.fillRect(wx + 1, wy + 9, 10, 3, PAL.windowWarmGlow);
      canvas.drawLine(wx + 1, wy + 4, wx + 4, wy + 1, PAL.windowGlassReflect);
      canvas.strokeRect(wx, wy, 12, 13, PAL.trimShade);
    }

    canvas.fillRect(vx + 2, 7 * 16, vw - 4, 12, PAL.trimLight);
    canvas.strokeRect(vx + 2, 7 * 16, vw - 4, 12, PAL.trimShade);
    canvas.fillRect(vx, 7 * 16 + 12, vw, 3, PAL.trimWhite);
    canvas.drawLine(vx, 7 * 16 + 15, vx + vw - 1, 7 * 16 + 15, PAL.outline);

    const porchInnerY = 8 * 16;
    const porchInnerH = 2 * 16;
    canvas.fillRect(vx + 3, porchInnerY, vw - 6, porchInnerH, PAL.roofDarkest);
    canvas.fillRect(vx + 8, porchInnerY + 6, 22, 8, PAL.outline);
    canvas.fillRect(vx + 10, porchInnerY + 8, 18, 4, PAL.shedRedMid);

    canvas.fillRect(vx + 1, porchInnerY, 3, porchInnerH, PAL.trimWhite);
    canvas.fillRect(vx + 22, porchInnerY, 3, porchInnerH, PAL.trimWhite);
    canvas.fillRect(vx + vw - 4, porchInnerY, 3, porchInnerH, PAL.trimWhite);

    const railY = 9 * 16 + 4;
    const railH = 12;
    canvas.fillRect(vx + 2, railY, vw - 4, 2, PAL.trimWhite);
    canvas.fillRect(vx + 2, railY + railH - 2, vw - 4, 2, PAL.trimWhite);
    for (let rx = vx + 4; rx < vx + vw - 4; rx += 3) {
      canvas.fillRect(rx, railY + 2, 1, railH - 4, PAL.trimLight);
    }

    const gablePeakX = vx + vw / 2;
    const gableTopY = 4 * 16 + 4;
    const gableBaseY = vy + 2;
    for (let py = gableTopY; py <= gableBaseY; py++) {
      const t = (py - gableTopY) / (gableBaseY - gableTopY);
      const halfSpan = Math.round(t * (vw / 2 + 3));
      for (let px = gablePeakX - halfSpan; px <= gablePeakX + halfSpan; px++) {
        const distFromEdge = halfSpan - Math.abs(px - gablePeakX);
        let c = PAL.roofMid;
        if (distFromEdge === 0) c = PAL.outline;
        else if (distFromEdge <= 2) c = PAL.trimWhite;
        else if (distFromEdge === 3) c = PAL.snowPure;
        else if ((py - gableTopY) % 4 === 0) c = PAL.roofDarkest;
        else if (px < gablePeakX) c = PAL.roofLight;
        canvas.setPixel(px, py, c);
      }
    }
  }

  // Silver Birch tree standing just left of the Main House terrace (col 3, row 10)
  drawBirchTree(3 * 16 + 8, 10 * 16 + 14, 42);

  // Lush round manicured boxwood bush (klotthuja) in front of the house left wing (cols 5..6, rows 12..13)
  canvas.fillEllipse(6 * 16, 13 * 16 + 9, 13, 4.5, PAL.deepShadow);
  drawLeafyCluster(6 * 16, 12 * 16 + 15, 13, 11, GREEN_RAMP, true);

  // ==========================================================================
  // Step 6: Draw TWO GUEST COTTAGES ("STUGOR") (Upper-Right, as in map.jpeg)
  // ==========================================================================
  function drawGuestStuga(startCol, startRow) {
    const sx = startCol * 16;
    const sy = startRow * 16;
    const sw = 4 * 16;
    const sh = 4 * 16;
    const roofBaseY = sy + 26;

    canvas.fillRect(sx + 3, sy + sh - 2, sw + 2, 5, PAL.deepShadow);

    const wallY = roofBaseY - 4;
    const wallH = sh - (wallY - sy) - 4;
    for (let py = wallY; py < wallY + wallH; py++) {
      const logRow = (py - wallY) % 4;
      for (let px = sx + 3; px < sx + sw - 3; px++) {
        let c = PAL.cabinMid;
        if (logRow === 0) c = PAL.cabinDark;
        else if (logRow === 1) c = PAL.cabinLight;
        if (px < sx + 6 || px >= sx + sw - 6) c = PAL.cabinDeep;
        canvas.setPixel(px, py, c);
      }
    }
    canvas.strokeRect(sx + 3, wallY, sw - 6, wallH, PAL.outline);

    const doorX = sx + 14;
    const doorY = wallY + 6;
    canvas.fillRect(doorX, doorY, 13, 22, PAL.trimWhite);
    canvas.strokeRect(doorX, doorY, 13, 22, PAL.outline);
    canvas.fillRect(doorX + 3, doorY + 3, 3, 3, PAL.windowGlassDark);
    canvas.fillRect(doorX + 7, doorY + 3, 3, 3, PAL.windowGlassDark);
    canvas.fillRect(doorX + 3, doorY + 7, 3, 3, PAL.windowGlassDark);
    canvas.fillRect(doorX + 7, doorY + 7, 3, 3, PAL.windowGlassDark);

    const winX = sx + 35;
    const winY = wallY + 7;
    canvas.fillRect(winX, winY, 14, 12, PAL.trimWhite);
    canvas.strokeRect(winX, winY, 14, 12, PAL.outline);
    canvas.fillRect(winX + 2, winY + 2, 10, 8, PAL.windowGlassDark);
    canvas.fillRect(winX + 3, winY + 6, 8, 3, PAL.windowWarmGlow);
    canvas.fillRect(winX + 6, winY + 2, 2, 8, PAL.trimWhite);

    // Front porch posts & balustrade
    const porchY = sy + sh - 14;
    canvas.fillRect(sx + 4, wallY, 2, wallH, PAL.cabinLight);
    canvas.fillRect(sx + sw - 6, wallY, 2, wallH, PAL.cabinLight);
    canvas.fillRect(sx + 4, porchY, sw - 8, 2, PAL.cabinLight);
    canvas.fillRect(sx + 4, porchY + 8, sw - 8, 4, PAL.cabinDark);
    for (let rx = sx + 6; rx < sx + sw - 6; rx += 3) {
      if (rx >= doorX + 1 && rx <= doorX + 11) continue;
      canvas.fillRect(rx, porchY + 2, 2, 6, PAL.cabinMid);
    }

    const peakX = sx + sw / 2;
    const peakY = sy + 4;
    for (let py = peakY; py <= roofBaseY; py++) {
      const t = (py - peakY) / (roofBaseY - peakY);
      const halfSpan = Math.round(6 + t * (sw / 2 - 2));
      for (let px = peakX - halfSpan; px <= peakX + halfSpan; px++) {
        const edgeDist = halfSpan - Math.abs(px - peakX);
        let c = PAL.roofMid;
        if (edgeDist === 0) c = PAL.outline;
        else if (edgeDist <= 2) c = PAL.trimWhite;
        else if (py === roofBaseY) c = PAL.outline;
        else if (py === roofBaseY - 1) c = PAL.snowPure;
        else if ((py - peakY) % 4 === 0) c = PAL.roofDarkest;
        else if (px < peakX) c = PAL.roofLight;
        else c = PAL.roofDark;
        canvas.setPixel(px, py, c);
      }
    }
    canvas.fillRect(peakX - 2, peakY + 5, 4, 4, PAL.trimWhite);
  }

  drawGuestStuga(19, 5);
  drawGuestStuga(25, 5);

  // Connected shrubs between & below the two cottages (cols 22..24, rows 9..10)
  canvas.fillEllipse(23 * 16 + 8, 10 * 16 + 10, 18, 5, PAL.shadow);
  drawLeafyCluster(24 * 16, 9 * 16 + 9, 13, 9, AUTUMN_RAMP, false);
  drawLeafyCluster(23 * 16 + 2, 10 * 16 + 4, 12, 8, GREEN_RAMP, true);

  // ==========================================================================
  // Step 7: Draw Outdoor Patio Table & 6 Chairs on Lawn (cols 7..8, rows 14..15)
  // ==========================================================================
  {
    const px = 7 * 16;
    const py = 14 * 16;
    const pw = 32;
    const ph = 32;
    for (let y = py + 2; y < py + ph - 2; y++) {
      for (let x = px + 2; x < px + pw - 2; x++) {
        const isGrid = (x - px) % 7 === 0 || (y - py) % 7 === 0;
        canvas.setPixel(x, y, isGrid ? PAL.curbDark : PAL.curbLight);
      }
    }
    canvas.strokeRect(px + 2, py + 2, pw - 4, ph - 4, PAL.curbDark);

    for (let i = 0; i < 3; i++) {
      const cx = px + 6 + i * 8;
      canvas.fillRect(cx, py + 5, 5, 4, PAL.outline);
      canvas.fillRect(cx + 1, py + 6, 3, 2, PAL.roofMid);
      canvas.fillRect(cx, py + 23, 5, 4, PAL.outline);
      canvas.fillRect(cx + 1, py + 24, 3, 2, PAL.roofMid);
    }

    canvas.fillRect(px + 4, py + 11, 24, 12, PAL.shadow);
    canvas.fillRect(px + 4, py + 9, 24, 12, PAL.outline);
    canvas.fillRect(px + 5, py + 10, 22, 10, PAL.roofDark);
    canvas.fillRect(px + 6, py + 11, 20, 2, PAL.roofLight);
  }

  // ==========================================================================
  // Step 8: Draw Connected Diagonal Hedgerow, Foreground Hedge & Conical Thujas
  // ==========================================================================
  // 8a. Continuous Diagonal Hedgerow on left lawn (cols 4..11, rows 16..23)
  for (let i = 0; i <= 15; i++) {
    const t = i / 15;
    const hx = 4 * 16 + 10 + t * (7 * 16);
    const hy = 16 * 16 + 8 + t * (7 * 16);
    canvas.fillEllipse(hx + 2, hy + 7, 11, 4, PAL.shadow);
  }
  for (let i = 0; i <= 15; i++) {
    const t = i / 15;
    const hx = 4 * 16 + 10 + t * (7 * 16) + (i % 2 === 0 ? -2 : 2);
    const hy = 16 * 16 + 6 + t * (7 * 16);
    const ramp = i % 4 === 2 ? AUTUMN_RAMP : GREEN_RAMP;
    drawLeafyCluster(hx, hy, 10, 7.5, ramp, i % 3 === 0);
  }

  // 8b. Continuous Foreground Hedgerow below gravel turnaround (cols 18..21, rows 24..25)
  for (let i = 0; i <= 8; i++) {
    const hx = 18 * 16 + 8 + i * 7;
    const hy = 24 * 16 + 15 + (i % 2) * 3;
    canvas.fillEllipse(hx + 1, hy + 8, 10, 4, PAL.shadow);
  }
  for (let i = 0; i <= 8; i++) {
    const hx = 18 * 16 + 8 + i * 7;
    const hy = 24 * 16 + 14 + (i % 2) * 3;
    const ramp = i % 3 === 1 ? AUTUMN_RAMP : GREEN_RAMP;
    drawLeafyCluster(hx, hy, 9.5, 8, ramp, i % 2 === 0);
  }

  // 8c. Draw the tall conical Thuja trees lining the driveway (type 3 in mapMatrix)
  for (let row = 0; row < 28; row++) {
    for (let col = 0; col < 32; col++) {
      if (mapMatrix[row][col] === 3) {
        if (mapMatrix[row + 1]?.[col] === 3) continue;
        drawConicalThuja(col * 16 + 8, row * 16 + 15);
      }
    }
  }

  // 8d. Sprawling Apple/Deciduous Tree on the central lawn (between patio table & driveway)
  drawAppleTree(10 * 16 + 12, 16 * 16 + 4);

  // ==========================================================================
  // Step 9: Draw White Shed with Bright Red Double Doors (cols 25..29, rows 16..19)
  // ==========================================================================
  {
    const sx = 25 * 16;
    const sy = 16 * 16;
    const sw = 5 * 16;
    const sh = 4 * 16;
    const roofH = 2 * 16;

    canvas.fillRect(sx + 3, sy + sh, sw, 5, PAL.deepShadow);

    const wallY = sy + roofH;
    const wallH = 2 * 16;
    canvas.fillRect(sx + 2, wallY, sw - 4, wallH, PAL.trimWhite);
    for (let px = sx + 4; px < sx + sw - 4; px += 4) {
      canvas.drawLine(px, wallY, px, wallY + wallH - 1, PAL.trimLight);
    }
    canvas.strokeRect(sx + 2, wallY, sw - 4, wallH, PAL.outline);

    const doorW = 36;
    const doorH = wallH - 5;
    const doorX = sx + Math.floor((sw - doorW) / 2);
    const doorY = wallY + 4;
    canvas.fillRect(doorX - 2, doorY - 2, doorW + 4, doorH + 2, PAL.trimShade);
    canvas.fillRect(doorX, doorY, doorW, doorH, PAL.shedRedMid);
    canvas.strokeRect(doorX, doorY, doorW, doorH, PAL.outline);
    canvas.fillRect(doorX + 2, doorY + 2, doorW / 2 - 3, doorH - 4, PAL.shedRedBright);
    canvas.fillRect(doorX + doorW / 2 + 1, doorY + 2, doorW / 2 - 3, doorH - 4, PAL.shedRedBright);
    canvas.drawLine(doorX + doorW / 2, doorY, doorX + doorW / 2, doorY + doorH - 1, PAL.outline);
    canvas.fillRect(doorX + doorW / 2 - 2, doorY + 12, 5, 3, PAL.curbLight);

    for (let py = sy + 4; py < sy + roofH; py++) {
      const t = (py - (sy + 4)) / (roofH - 4);
      const indent = Math.round((1 - t) * 12);
      for (let px = sx + indent; px < sx + sw - indent; px++) {
        let c = PAL.roofMid;
        if (py === sy + roofH - 1) c = PAL.outline;
        else if (py === sy + roofH - 2) c = PAL.trimWhite;
        else if (py === sy + roofH - 3) c = PAL.snowPure;
        else if ((py - sy) % 4 === 0) c = PAL.roofDarkest;
        else if (px < sx + sw / 2) c = PAL.roofLight;
        else c = PAL.roofDark;
        canvas.setPixel(px, py, c);
      }
      canvas.setPixel(sx + indent, py, PAL.outline);
      canvas.setPixel(sx + sw - indent - 1, py, PAL.outline);
    }
  }

  // ==========================================================================
  // Step 10: Draw Blue Garage & Glass Greenhouse in Bottom-Left (cols 2..7, rows 21..25)
  // ==========================================================================
  {
    const gx = 2 * 16;
    const gy = 21 * 16;
    const gw = 6 * 16;
    const gh = 5 * 16;
    const roofH = 2 * 16;
    const wallY = gy + roofH;
    const wallH = 3 * 16;

    canvas.fillRect(gx + 4, gy + gh, gw + 4, 5, PAL.deepShadow);

    for (let py = wallY; py < wallY + wallH; py++) {
      for (let px = gx; px < gx + gw; px++) {
        const seam = (px - gx) % 4 === 0;
        canvas.setPixel(px, py, seam ? PAL.garageBlueDark : PAL.garageBlueMid);
      }
    }
    canvas.fillRect(gx, wallY, 3, wallH, PAL.trimWhite);
    canvas.fillRect(gx + gw - 3, wallY, 3, wallH, PAL.trimWhite);
    canvas.strokeRect(gx, wallY, gw, wallH, PAL.outline);

    for (let d = 0; d < 2; d++) {
      const dx = gx + 8 + d * 42;
      const dy = wallY + 10;
      const dw = 36;
      const dh = wallH - 11;
      canvas.fillRect(dx, dy, dw, dh, PAL.trimWhite);
      canvas.strokeRect(dx, dy, dw, dh, PAL.outline);
      canvas.drawLine(dx + dw / 2, dy, dx + dw / 2, dy + dh - 1, PAL.trimShade);
      for (let py = dy + 5; py < dy + dh - 4; py += 8) {
        canvas.strokeRect(dx + 3, py, dw / 2 - 5, 5, PAL.trimShade);
        canvas.strokeRect(dx + dw / 2 + 2, py, dw / 2 - 5, 5, PAL.trimShade);
      }
    }

    for (let py = gy; py < gy + roofH; py++) {
      for (let px = gx; px < gx + gw; px++) {
        let c = (py - gy) % 4 === 0 ? PAL.roofDarkest : PAL.roofDark;
        if (py === gy) c = PAL.outline;
        if (py >= gy + roofH - 2) c = PAL.trimWhite;
        canvas.setPixel(px, py, c);
      }
    }
    const gPeakX = gx + gw / 2;
    const gPeakY = gy + 4;
    for (let py = gPeakY; py < wallY + 4; py++) {
      const t = (py - gPeakY) / (wallY + 4 - gPeakY);
      const halfSpan = Math.round(t * (gw / 2 - 2));
      for (let px = gPeakX - halfSpan; px <= gPeakX + halfSpan; px++) {
        const edgeDist = halfSpan - Math.abs(px - gPeakX);
        let c = (px - gx) % 4 === 0 ? PAL.garageBlueDark : PAL.garageBlueLight;
        if (edgeDist === 0) c = PAL.outline;
        else if (edgeDist <= 3) c = PAL.trimWhite;
        else if (edgeDist === 4) c = PAL.snowPure;
        canvas.setPixel(px, py, c);
      }
    }

    // Translucent Glass Greenhouse (Växthus) right beside the blue garage (col 8, rows 24..25)
    const ghX = gx + gw + 2;
    const ghY = 24 * 16;
    const ghW = 26;
    const ghH = 28;
    canvas.fillRect(ghX, ghY + 8, ghW, ghH - 8, PAL.glassTint);
    canvas.strokeRect(ghX, ghY + 8, ghW, ghH - 8, PAL.glassFrame);
    for (let gxPane = ghX + 6; gxPane < ghX + ghW; gxPane += 6) {
      canvas.drawLine(gxPane, ghY + 8, gxPane, ghY + ghH - 1, PAL.glassFrame);
    }
    for (let py = ghY; py < ghY + 8; py++) {
      const span = Math.round(((py - ghY) / 8) * (ghW / 2));
      const mid = ghX + ghW / 2;
      canvas.drawLine(mid - span, py, mid + span, py, PAL.glassTint);
      canvas.setPixel(mid - span, py, PAL.glassFrame);
      canvas.setPixel(mid + span, py, PAL.glassFrame);
    }
  }

  // ==========================================================================
  // Step 11: Draw Wooden Playhouse & Green Slide in Bottom-Right (cols 27..29, rows 24..25)
  // ==========================================================================
  {
    const px = 28 * 16;
    const py = 24 * 16 + 4;
    canvas.fillRect(px, py + 6, 18, 18, PAL.cabinDark);
    canvas.strokeRect(px, py + 6, 18, 18, PAL.outline);
    canvas.fillRect(px - 1, py, 20, 7, PAL.thujaMid);
    for (let i = 0; i < 18; i++) {
      const sx = px - i;
      const sy = py + 12 + Math.floor(i * 0.65);
      canvas.fillRect(sx, sy, 5, 3, PAL.slideGreenBright);
      canvas.setPixel(sx, sy, PAL.slideGreenDark);
      canvas.setPixel(sx + 4, sy + 2, PAL.outline);
    }
  }

  return canvas.toPngBuffer();
}

// ============================================================================
// 2. GENERATE 16-BIT SNES SANTA SPRITESHEET (48x64: 3 frames x 4 directions)
// Row 0: Down | Row 1: Up | Row 2: Left | Row 3: Right
// ============================================================================
function generateSantaSpritesheet() {
  const sheet = new PixelCanvas(48, 64);

  const C = {
    K: [22, 24, 34, 255],
    R: [220, 42, 42, 255],
    M: [182, 28, 28, 255],
    D: [134, 18, 24, 255],
    W: [250, 252, 255, 255],
    G: [206, 218, 236, 255],
    S: [255, 214, 174, 255],
    P: [242, 166, 142, 255],
    Y: [255, 216, 84, 255],
    B: [52, 38, 30, 255],
    H: [88, 66, 52, 255],
  };

  function drawGrid(ox, oy, grid) {
    sheet.fillEllipse(ox + 7.5, oy + 14.5, 5.5, 1.8, [12, 16, 26, 110]);
    for (let y = 0; y < 16; y++) {
      const row = grid[y];
      for (let x = 0; x < 16; x++) {
        const ch = row[x];
        if (ch !== '.' && C[ch]) {
          sheet.setPixel(ox + x, oy + y, C[ch]);
        }
      }
    }
  }

  const downIdle = [
    '.....KKKKKK.....',
    '....KRRRRMMK....',
    '...KRRRRRMMMK...',
    '..KWWWWWWWWWWK..',
    '..KWGWWWWWWGWK..',
    '..KWSKSSKSWKWK..',
    '..KWSSPPSSWKWK..',
    '..KWWWWWWWWKK...',
    '.KRRRRWWWWWRRK..',
    '.KMRRRWWWWWMRK..',
    '.KWRBBBBBBBBWK..',
    '.K.KBBYYYYBBK...',
    '...KRRRRRMMMK...',
    '...KMMMDDMMMK...',
    '...KHBK..KHBK...',
    '...KKKK..KKKK...',
  ];
  const downWalk1 = [
    '.....KKKKKK.....',
    '....KRRRRMMK....',
    '...KRRRRRMMMK...',
    '..KWWWWWWWWWWK..',
    '..KWGWWWWWWGWK..',
    '..KWSKSSKSWKWK..',
    '..KWSSPPSSWKWK..',
    '..KWWWWWWWWKK...',
    '.KWRRRWWWWWRRK..',
    '.K.KRRWWWWWMRK..',
    '...KBBBBBBBBWK..',
    '...KBBYYYYBBK...',
    '...KRRRRRMMMK...',
    '...KHBKDDMMMK...',
    '...KKKK..KHBK...',
    '.........KKKK...',
  ];
  const downWalk2 = [
    '.....KKKKKK.....',
    '....KRRRRMMK....',
    '...KRRRRRMMMK...',
    '..KWWWWWWWWWWK..',
    '..KWGWWWWWWGWK..',
    '..KWSKSSKSWKWK..',
    '..KWSSPPSSWKWK..',
    '..KWWWWWWWWKK...',
    '.KRRRRWWWWWRWK..',
    '.KMRRRWWWWWRK.K.',
    '.KWRBBBBBBBBK...',
    '...KBBYYYYBBK...',
    '...KRRRRRMMMK...',
    '...KMMMDDKHBK...',
    '...KHBK..KKKK...',
    '...KKKK.........',
  ];

  const upIdle = [
    '.....KKKKKK.....',
    '....KRRRRMMK....',
    '...KRRRRRMMMK...',
    '..KWWWWWWWWWWK..',
    '..KWGWWWWWWGWK..',
    '..KRRRRMMMKWWK..',
    '..KMRRRMMDKWWK..',
    '..KWWWWWWWWKK...',
    '.KRRRRRRRRRRRK..',
    '.KMRRRRRRRRMRK..',
    '.KWRBBBBBBBBWK..',
    '.K.KBBBBBBBBK...',
    '...KRRRRRMMMK...',
    '...KWWWWWWWWK...',
    '...KHBK..KHBK...',
    '...KKKK..KKKK...',
  ];
  const upWalk1 = [
    '.....KKKKKK.....',
    '....KRRRRMMK....',
    '...KRRRRRMMMK...',
    '..KWWWWWWWWWWK..',
    '..KWGWWWWWWGWK..',
    '..KRRRRMMMKWWK..',
    '..KMRRRMMDKWWK..',
    '..KWWWWWWWWKK...',
    '.KWRRRRRRRRRRK..',
    '...KMRRRRRRMRK..',
    '...KBBBBBBBBWK..',
    '...KBBBBBBBBK...',
    '...KRRRRRMMMK...',
    '...KHBKWWWWWK...',
    '...KKKK..KHBK...',
    '.........KKKK...',
  ];
  const upWalk2 = [
    '.....KKKKKK.....',
    '....KRRRRMMK....',
    '...KRRRRRMMMK...',
    '..KWWWWWWWWWWK..',
    '..KWGWWWWWWGWK..',
    '..KRRRRMMMKWWK..',
    '..KMRRRMMDKWWK..',
    '..KWWWWWWWWKK...',
    '.KRRRRRRRRRRWK..',
    '.KMRRRRRRRRMK...',
    '.KWRBBBBBBBBK...',
    '...KBBBBBBBBK...',
    '...KRRRRRMMMK...',
    '...KWWWWWKHBK...',
    '...KHBK..KKKK...',
    '...KKKK.........',
  ];

  const leftIdle = [
    '.....KKKKKK.....',
    '....KRRRRMMK....',
    '...KRRRRRMMMK...',
    '..KWWWWWWWWWWK..',
    '..KWGWWWWWWGWK..',
    '..KKSKSSWWWWKK..',
    '..KPSWWWWWWKWWK.',
    '..KWWWWWWWWKWWK.',
    '...KWWWRRRRRKK..',
    '...KWWWRRWWWRK..',
    '...KBBBBBBBBK...',
    '...KYYBBBBBBK...',
    '...KRRRRRMMMK...',
    '...KMMMDDMMMK...',
    '....KHBKKHBK....',
    '....KKKKKKKK....',
  ];
  const leftWalk1 = [
    '.....KKKKKK.....',
    '....KRRRRMMK....',
    '...KRRRRRMMMK...',
    '..KWWWWWWWWWWK..',
    '..KWGWWWWWWGWK..',
    '..KKSKSSWWWWKK..',
    '..KPSWWWWWWKWWK.',
    '..KWWWWWWWWKWWK.',
    '...KWWWRRRRRKK..',
    '..KWRRWRRMMRK...',
    '..K.KBBBBBBBK...',
    '...KYYBBBBBBK...',
    '...KRRRRRMMMK...',
    '..KHBKMDDMMMK...',
    '..KKKK..KHBK....',
    '........KKKK....',
  ];
  const leftWalk2 = [
    '.....KKKKKK.....',
    '....KRRRRMMK....',
    '...KRRRRRMMMK...',
    '..KWWWWWWWWWWK..',
    '..KWGWWWWWWGWK..',
    '..KKSKSSWWWWKK..',
    '..KPSWWWWWWKWWK.',
    '..KWWWWWWWWKWWK.',
    '...KWWWRRRRRKK..',
    '...KWWWRRWWWRK..',
    '...KBBBBBBBBWK..',
    '...KYYBBBBBBK...',
    '...KRRRRRMMMK...',
    '...KMMMDDKHBK...',
    '...KHBK..KKKK...',
    '...KKKK.........',
  ];

  function flipH(grid) {
    return grid.map((r) => r.split('').reverse().join(''));
  }

  drawGrid(0, 0, downIdle);
  drawGrid(16, 0, downWalk1);
  drawGrid(32, 0, downWalk2);

  drawGrid(0, 16, upIdle);
  drawGrid(16, 16, upWalk1);
  drawGrid(32, 16, upWalk2);

  drawGrid(0, 32, leftIdle);
  drawGrid(16, 32, leftWalk1);
  drawGrid(32, 32, leftWalk2);

  drawGrid(0, 48, flipH(leftIdle));
  drawGrid(16, 48, flipH(leftWalk1));
  drawGrid(32, 48, flipH(leftWalk2));

  return sheet.toPngBuffer();
}

// ============================================================================
// 3. GENERATE 16-BIT SNES SNOWBALL THROWER SPRITESHEET (32x32: 2 frames x 2 dirs)
// ============================================================================
function generateThrowerSpritesheet() {
  const sheet = new PixelCanvas(32, 32);
  const C = {
    K: [22, 24, 34, 255],
    Y: [255, 212, 84, 255],
    I: [64, 134, 190, 255],
    A: [44, 96, 144, 255],
    D: [28, 66, 104, 255],
    W: [248, 250, 255, 255],
    G: [204, 218, 236, 255],
    S: [255, 214, 174, 255],
    P: [242, 166, 142, 255],
    R: [214, 42, 42, 255],
    B: [56, 42, 32, 255],
  };

  const rightReady = [
    '.....KKKKKK.....',
    '....KYYYYYYK....',
    '...KIIIIIIIIK...',
    '..KWWWWWWWWWWK..',
    '..KWSKSSKSWKWK..',
    '..KWSSSSPSWKWK..',
    '...KRRRRRRRRK...',
    '..KIIIIIIIIIKWK.',
    '.KWIIIIIIIIIRWWK',
    '..KKIIIIIIIIRWK.',
    '...KAAAAAAAAK...',
    '...KIIIAAIIIK...',
    '...KAAK..KAAK...',
    '...KBBK..KBBK...',
    '...KKKK..KKKK...',
    '................',
  ];

  const rightThrow = [
    '.....KKKKKK.....',
    '....KYYYYYYK....',
    '...KIIIIIIIIK...',
    '..KWWWWWWWWWWK..',
    '..KWSKSSKSWKWK..',
    '..KWSSSSPSWKWK..',
    '...KRRRRRRRRK...',
    '..KIIIIIIIIIIKK.',
    '..KIIIIIIIIIIRWK',
    '...KAAAAAAAARRK.',
    '...KIIIAAIIIK...',
    '...KAAK..KAAK...',
    '..KBBK....KBBK..',
    '..KKKK....KKKK..',
    '................',
    '................',
  ];

  function flipH(grid) {
    return grid.map((r) => r.split('').reverse().join(''));
  }

  function drawNpc(ox, oy, grid) {
    sheet.fillEllipse(ox + 7.5, oy + 14.5, 5.5, 1.8, [12, 16, 26, 110]);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const ch = grid[y][x];
        if (ch !== '.' && C[ch]) {
          sheet.setPixel(ox + x, oy + y, C[ch]);
        }
      }
    }
  }

  drawNpc(0, 0, rightReady);
  drawNpc(16, 0, rightThrow);
  drawNpc(0, 16, flipH(rightReady));
  drawNpc(16, 16, flipH(rightThrow));

  return sheet.toPngBuffer();
}

// ============================================================================
// 4. GENERATE SNOWBALL & Z-KEY ICON SPRITES
// ============================================================================
function generateSnowballSprite() {
  const canvas = new PixelCanvas(16, 16);
  canvas.fillEllipse(8, 13, 3, 1.2, [14, 18, 28, 85]);
  const grid = [
    '................',
    '................',
    '................',
    '.....KKKKKK.....',
    '....KWWWWWWK....',
    '...KWWWWWWWWK...',
    '...KWWWWWWGGK...',
    '...KWWWWWGGGK...',
    '....KWWWGGGK....',
    '.....KKKKKK.....',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ];
  const C = {
    K: [24, 32, 48, 255],
    W: [250, 252, 255, 255],
    G: [190, 210, 234, 255],
  };
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const ch = grid[y][x];
      if (C[ch]) canvas.setPixel(x, y, C[ch]);
    }
  }
  return canvas.toPngBuffer();
}

function generateZKeySprite() {
  const canvas = new PixelCanvas(16, 16);
  const grid = [
    '.KKKKKKKKKKKKKK.',
    'KWWWWWWWWWWWWWWK',
    'KWLLLLLLLLLLLLWK',
    'KWLWWWWWWWWWWLWK',
    'KWLWWKKKKKKWWLWK',
    'KWLWWWWWWKKWWLWK',
    'KWLWWWWWKKWWWLWK',
    'KWLWWWWKKWWWWLWK',
    'KWLWWWKKWWWWWLWK',
    'KWLWWKKWWWWWWLWK',
    'KWLWWKKKKKKWWLWK',
    'KWLWWWWWWWWWWLWK',
    'KWDDDDDDDDDDDDWK',
    'KBBBBBBBBBBBBBBK',
    'KBBBBBBBBBBBBBBK',
    '.KKKKKKKKKKKKKK.',
  ];
  const C = {
    K: [20, 24, 34, 255],
    W: [252, 252, 255, 255],
    L: [226, 232, 242, 255],
    D: [176, 186, 202, 255],
    B: [96, 106, 124, 255],
  };
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const ch = grid[y][x];
      if (C[ch]) canvas.setPixel(x, y, C[ch]);
    }
  }
  return canvas.toPngBuffer();
}

// ============================================================================
// 5. RENSBO 32x28 MAP MATRIX (Matches src/world/tilemap.ts)
// ============================================================================
const RENSBO_MAP_MATRIX = [
  //0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 0
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 1
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 2
  [1, 1, 0, 0, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1], // 3
  [1, 1, 0, 0, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1], // 4
  [1, 0, 0, 0, 5, 5, 5, 5, 5, 7, 7, 7, 5, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 1], // 5
  [1, 0, 0, 0, 13, 6, 6, 13, 13, 7, 7, 7, 13, 6, 6, 13, 13, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 1], // 6
  [1, 0, 0, 0, 13, 13, 13, 13, 13, 7, 7, 7, 13, 13, 13, 13, 13, 0, 0, 9, 9, 9, 9, 0, 0, 9, 9, 9, 9, 0, 0, 1], // 7
  [1, 0, 0, 0, 13, 6, 6, 13, 13, 7, 7, 7, 13, 13, 6, 6, 13, 0, 0, 9, 9, 9, 9, 0, 0, 9, 9, 9, 9, 0, 0, 1], // 8
  [1, 0, 0, 0, 13, 13, 13, 13, 13, 7, 7, 7, 13, 8, 13, 13, 13, 0, 0, 0, 0, 0, 0, 4, 4, 0, 0, 0, 0, 0, 0, 1], // 9
  [1, 0, 0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0, 3, 0, 0, 4, 4, 0, 0, 0, 0, 0, 0, 0, 1], // 10
  [1, 0, 0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 11
  [1, 0, 0, 0, 0, 4, 4, 0, 0, 0, 0, 0, 2, 2, 2, 2, 2, 2, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 12
  [1, 0, 0, 0, 0, 4, 4, 0, 0, 0, 0, 0, 3, 2, 2, 2, 2, 2, 3, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 13
  [1, 0, 0, 0, 0, 0, 0, 12, 12, 0, 0, 0, 3, 2, 2, 2, 2, 2, 3, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 1], // 14
  [1, 0, 0, 0, 0, 0, 0, 12, 12, 0, 0, 0, 0, 2, 2, 2, 2, 2, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 1], // 15
  [1, 0, 0, 0, 4, 4, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 5, 5, 5, 5, 5, 0, 1], // 16
  [1, 0, 0, 0, 0, 4, 4, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 5, 5, 5, 5, 5, 0, 1], // 17
  [1, 0, 0, 0, 0, 0, 4, 4, 0, 0, 0, 0, 3, 2, 2, 2, 2, 2, 3, 0, 3, 0, 0, 0, 0, 10, 10, 10, 10, 10, 0, 1], // 18
  [1, 0, 0, 0, 0, 0, 0, 4, 4, 0, 0, 0, 3, 2, 2, 2, 2, 2, 3, 0, 3, 0, 0, 0, 0, 10, 10, 10, 10, 10, 0, 1], // 19
  [1, 0, 0, 0, 0, 0, 0, 0, 4, 4, 0, 0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0, 0, 0, 1], // 20
  [1, 0, 5, 5, 5, 5, 5, 5, 0, 4, 4, 0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0, 0, 0, 1], // 21
  [1, 0, 5, 5, 5, 5, 5, 5, 0, 0, 4, 4, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0, 0, 0, 1], // 22
  [1, 0, 11, 11, 11, 11, 11, 11, 0, 0, 0, 4, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0, 0, 0, 0, 0, 1], // 23
  [1, 0, 11, 11, 11, 11, 11, 11, 0, 0, 0, 0, 0, 2, 2, 2, 2, 2, 4, 4, 4, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 24
  [1, 0, 11, 11, 11, 11, 11, 11, 0, 0, 0, 0, 0, 2, 2, 2, 2, 0, 4, 4, 4, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 25
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 26
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 27
];

const spritesDir = path.join(process.cwd(), 'assets/sprites');
const tilesDir = path.join(process.cwd(), 'assets/tiles');
fs.mkdirSync(spritesDir, { recursive: true });
fs.mkdirSync(tilesDir, { recursive: true });

fs.writeFileSync(path.join(spritesDir, 'santa.png'), generateSantaSpritesheet());
fs.writeFileSync(path.join(spritesDir, 'thrower.png'), generateThrowerSpritesheet());
fs.writeFileSync(path.join(spritesDir, 'snowball.png'), generateSnowballSprite());
fs.writeFileSync(path.join(spritesDir, 'z-key.png'), generateZKeySprite());
fs.writeFileSync(
  path.join(tilesDir, 'winter-tiles.png'),
  generateRensboOverworldPng(RENSBO_MAP_MATRIX)
);

console.log('Generated 16-bit SNES spritesheets and 512x448 Rensbo overworld map!');
