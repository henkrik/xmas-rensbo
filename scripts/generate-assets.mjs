import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/**
 * Pure-Node RGBA PNG encoder (zero external dependencies).
 * Generates 16-bit SNES-style pixel-art spritesheets and the 512x448 Rensbo winter overworld map.
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

function smoothNoise(x, y) {
  return (
    0.45 * Math.sin(x * 0.055 + y * 0.042) +
    0.35 * Math.cos(x * 0.032 - y * 0.068) +
    0.2 * Math.sin((x + y) * 0.11)
  );
}

// 16-bit SNES Winter Color Palette (Snow-blanketed ground & tree tops + Rensbo landmarks)
const PAL = {
  outline: [22, 26, 36, 255],
  shadow: [26, 40, 68, 95],
  deepShadow: [20, 32, 56, 145],

  // 16-bit SNES Snow-Covered Ground Ramp (soft ice-blue & periwinkle snowdrifts)
  snowBrightest: [250, 253, 255, 255],
  snowLight: [238, 245, 254, 255],
  snowBase: [224, 235, 248, 255],
  snowMid: [206, 221, 240, 255],
  snowShade: [184, 204, 228, 255],
  snowDeep: [158, 182, 212, 255],

  // Plowed snowy rosy-terracotta gravel driveway & terrace
  gravelBase: [196, 174, 168, 255],
  gravelLight: [214, 196, 192, 255],
  gravelWarm: [180, 152, 144, 255],
  gravelDark: [158, 130, 122, 255],
  terracottaBase: [192, 154, 144, 255],
  terracottaLight: [210, 176, 168, 255],
  terracottaDark: [168, 128, 118, 255],
  curbLight: [228, 236, 246, 255],
  curbDark: [142, 158, 180, 255],

  // Granite cliff rock (upper left behind main house, snow-topped)
  rockLight: [172, 180, 192, 255],
  rockMid: [134, 142, 156, 255],
  rockDark: [94, 102, 116, 255],

  // Forest & Trees (Deep evergreen undersides + heavy snow caps on top)
  pineDarkest: [18, 46, 38, 255],
  pineDark: [26, 66, 52, 255],
  pineMid: [38, 92, 68, 255],
  pineLight: [58, 120, 86, 255],

  thujaDark: [22, 62, 40, 255],
  thujaMid: [36, 90, 54, 255],
  thujaLight: [56, 120, 70, 255],

  trunkDark: [62, 40, 28, 255],
  trunkMid: [96, 62, 40, 255],
  pineTrunkRed: [152, 88, 52, 255],
  birchWhite: [238, 240, 246, 255],
  birchGrey: [168, 174, 186, 255],

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
  glassTint: [160, 206, 232, 165],

  // Red-Door Shed (right) & Playhouse Slide (bottom-right)
  shedRedBright: [212, 44, 44, 255],
  shedRedMid: [178, 32, 32, 255],
  shedRedDark: [136, 22, 22, 255],
  slideGreenBright: [76, 204, 92, 255],
  slideGreenDark: [44, 152, 62, 255],
  gold: [255, 212, 92, 255],

  // Electric Car & Charging Cable
  carBodyBright: [130, 178, 218, 255],
  carBodyMid: [94, 142, 184, 255],
  carBodyDark: [62, 102, 142, 255],
  carGlass: [34, 48, 68, 255],
  carGlassHighlight: [110, 156, 196, 255],
  wireBlack: [28, 32, 40, 255],
  wireHighlight: [64, 72, 86, 255],
  copperBright: [232, 134, 68, 255],
  sparkCyan: [112, 248, 255, 255],
  sparkYellow: [255, 238, 84, 255],
  ledGreen: [64, 242, 112, 255],
};

// ============================================================================
// 1. GENERATE 512x448 SNES WINTER OVERWORLD MAP (32x28 tiles of 16x16px)
// ============================================================================
function generateRensboOverworldPng(mapMatrix) {
  const W = 32 * 16; // 512
  const H = 28 * 16; // 448
  const canvas = new PixelCanvas(W, H);

  // Step 1: Snow-Covered Ground & Plowed Gravel Driveway Pass
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const col = Math.floor(x / 16);
      const row = Math.floor(y / 16);
      const tile = mapMatrix[row][col];
      const n = hash2d(x, y);
      const wave = smoothNoise(x, y);

      if (tile === 2 || tile === 14 || tile === 15) {
        // Plowed gravel road / terrace with snow-dusted edges and wheel tracks
        const isHouseTerrace = row <= 11 && col <= 11;
        let c = isHouseTerrace ? PAL.terracottaBase : PAL.gravelBase;
        if (wave > 0.22) {
          c = isHouseTerrace ? PAL.terracottaLight : PAL.gravelLight;
        } else if (wave < -0.25) {
          c = isHouseTerrace ? PAL.terracottaDark : PAL.gravelWarm;
        }
        // Soft snow patches & pebbles on the plowed road
        if (wave > 0.42) {
          c = PAL.snowBase;
        } else if (n > 0.88) {
          c = isHouseTerrace ? PAL.terracottaDark : PAL.gravelDark;
        } else if (n < 0.12) {
          c = PAL.snowLight;
        }
        canvas.setPixel(x, y, c);
      } else {
        // Lush 16-bit SNES snowfield across the entire yard
        let c = PAL.snowBase;
        if (row <= 4) {
          // Deeper blue-shaded snow under the northern forest shadow
          c = wave > 0.1 ? PAL.snowMid : PAL.snowShade;
        } else if (wave > 0.3) {
          c = PAL.snowBrightest;
        } else if (wave > 0.1 && wave <= 0.3 && (x + y) % 2 === 0) {
          c = PAL.snowLight; // smooth SNES diagonal snow drift dither
        } else if (wave >= -0.1 && wave <= 0.1) {
          c = PAL.snowLight;
        } else if (wave < -0.32) {
          c = PAL.snowShade;
        } else if (wave < -0.15 && (x + y) % 2 === 0) {
          c = PAL.snowMid;
        }
        if (n > 0.96) c = PAL.snowShade;
        else if (n < 0.04) c = PAL.snowBrightest;
        canvas.setPixel(x, y, c);
      }
    }
  }

  // Step 1b: Delicate SNES Snow-Drift Ripples & Frosted Grass Tips on the Snowfield
  for (let row = 4; row < 27; row++) {
    for (let col = 1; col < 31; col++) {
      if (mapMatrix[row][col] !== 0) continue;
      const seed = hash2d(col * 19 + 3, row * 37 + 7);
      const bx = col * 16 + 3 + Math.floor(seed * 9);
      const by = row * 16 + 4 + ((col * 5 + row * 3) % 8);
      if (seed < 0.42) {
        // Subtle sculpted snowdrift ripple
        canvas.drawLine(bx - 2, by, bx + 2, by, PAL.snowBrightest);
        canvas.drawLine(bx - 1, by + 1, bx + 3, by + 1, PAL.snowShade);
      } else if (seed > 0.88) {
        // Tiny frosted grass blades peeking through the snow
        canvas.setPixel(bx, by, PAL.snowDeep);
        canvas.setPixel(bx - 1, by - 1, PAL.thujaLight);
        canvas.setPixel(bx + 1, by - 1, PAL.snowBrightest);
      }
    }
  }

  // Step 1c: Snow-Banked Stone Curbing & Tire Tracks along Gravel Driveway/Terrace
  for (let row = 1; row < 27; row++) {
    for (let col = 1; col < 31; col++) {
      const tile = mapMatrix[row][col];
      if (tile !== 2 && tile !== 14 && tile !== 15) continue;
      const bx = col * 16;
      const by = row * 16;

      // Tire tracks along the main driveway (cols 14..16, rows 11..26)
      if ((col === 14 || col === 16) && row >= 11 && row <= 26) {
        for (let py = by; py < by + 16; py++) {
          const wx = bx + (col === 14 ? 6 : 9);
          if (hash2d(wx, py) > 0.3) {
            canvas.setPixel(wx, py, PAL.gravelWarm);
            canvas.setPixel(wx + 1, py, PAL.gravelDark);
          }
        }
      }

      // Snowbank curb where plowed road meets the snowfield
      if (mapMatrix[row][col - 1] === 0) {
        for (let py = by; py < by + 16; py++) {
          canvas.setPixel(bx, py, PAL.curbDark);
          canvas.setPixel(bx + 1, py, PAL.snowBrightest);
          canvas.setPixel(bx + 2, py, PAL.snowMid);
        }
      }
      if (mapMatrix[row][col + 1] === 0) {
        for (let py = by; py < by + 16; py++) {
          canvas.setPixel(bx + 15, py, PAL.curbDark);
          canvas.setPixel(bx + 14, py, PAL.snowBrightest);
          canvas.setPixel(bx + 13, py, PAL.snowMid);
        }
      }
      if (mapMatrix[row + 1]?.[col] === 0) {
        for (let px = bx; px < bx + 16; px++) {
          canvas.setPixel(px, by + 15, PAL.curbDark);
          canvas.setPixel(px, by + 14, PAL.snowBrightest);
        }
      }
      if (mapMatrix[row - 1]?.[col] === 0) {
        for (let px = bx; px < bx + 16; px++) {
          canvas.setPixel(px, by, PAL.curbDark);
          canvas.setPixel(px, by + 1, PAL.snowBrightest);
        }
      }
    }
  }

  // Snow-dusted stepping stones from Left Guest Cottage (stuga) down to the upper driveway
  const steppingStones = [
    [19 * 16 + 14, 9 * 16 + 3],
    [19 * 16 + 4, 9 * 16 + 10],
    [18 * 16 + 10, 10 * 16 + 2],
    [18 * 16 + 2, 10 * 16 + 10],
  ];
  for (const [sx, sy] of steppingStones) {
    canvas.fillEllipse(sx, sy + 1, 4, 2.2, PAL.curbDark);
    canvas.fillEllipse(sx, sy, 3.5, 1.8, PAL.snowBrightest);
  }

  // ==========================================================================
  // Step 2: Snow-Capped Granite Cliff Outcrops (Upper-left behind main house)
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
          if (dy < -0.3) c = dy < -0.5 ? PAL.snowBrightest : PAL.snowMid; // heavy snow cap on rock
          else if (dx < -0.2 && n > 0.35) c = PAL.rockLight;
          else if (dy > 0.35 || (px + py) % 11 === 0) c = PAL.rockDark;
          canvas.setPixel(px, py, c);
        }
      }
    }
  }
  drawRockOutcrop(1 * 16 + 4, 2 * 16 + 8, 48, 26);
  drawRockOutcrop(3 * 16 + 6, 1 * 16 + 12, 38, 22);

  // ==========================================================================
  // Step 3: Snow-Covered Trees, Birch, Conical Thuja & Snow-Blanketed Hedgerows
  // ==========================================================================
  function drawSnowyFoliageCluster(cx, cy, rx, ry) {
    for (let py = Math.floor(cy - ry); py <= Math.ceil(cy + ry); py++) {
      for (let px = Math.floor(cx - rx); px <= Math.ceil(cx + rx); px++) {
        const dx = (px - cx) / rx;
        const dy = (py - cy) / ry;
        const d2 = dx * dx + dy * dy;
        if (d2 <= 1.0) {
          const n = hash2d(px, py);
          // Top 62% of the foliage cluster is blanketed in thick pillow-shaded snow!
          const snowLine = 0.22 + 0.18 * Math.sin(px * 0.7);
          let c = PAL.thujaMid;
          if (d2 > 0.84) {
            c = dy < snowLine ? PAL.curbDark : PAL.pineDarkest;
          } else if (dy < snowLine) {
            if (dy < -0.3 && dx < 0.25) c = PAL.snowBrightest;
            else if (dx < 0.15) c = PAL.snowLight;
            else c = PAL.snowMid;
          } else {
            // Evergreen needles peeking out underneath the snow cap
            if (dy < snowLine + 0.16) c = PAL.snowShade;
            else if (dx < -0.15 && n > 0.4) c = PAL.thujaLight;
            else if (dy > 0.55 || dx > 0.35) c = PAL.pineDarkest;
            else c = PAL.thujaDark;
          }
          canvas.setPixel(px, py, c);
        }
      }
    }
  }

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

    // 3 tiered SNES bough layers heavily laden with snow on top
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
          const snowLimit = 0.62 + 0.12 * Math.cos((px - cx) * 0.9);

          let c = PAL.pineMid;
          if (isEdge && py === tierBaseY) {
            c = PAL.pineDarkest;
          } else if (relY < snowLimit) {
            // Thick snow blanket covering the tree boughs
            if (isEdge) c = PAL.snowShade;
            else if (relX < -0.1 && relY < 0.45) c = PAL.snowBrightest;
            else if (relX < 0.25) c = PAL.snowLight;
            else c = PAL.snowMid;
          } else {
            // Deep evergreen bough shadow peeking out below the snow
            if (relX < -0.15 && n > 0.4) c = PAL.pineLight;
            else if (relX > 0.25 || relY > 0.85) c = PAL.pineDarkest;
            else c = PAL.pineDark;
          }
          canvas.setPixel(px, py, c);
        }
      }
    }
  }

  function drawBirchTree(cx, baseY, height = 34) {
    canvas.fillEllipse(cx + 2, baseY, 6, 2.5, PAL.shadow);
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

    drawSnowyFoliageCluster(cx - 5, baseY - height + 6, 6, 4.5);
    drawSnowyFoliageCluster(cx + 5, baseY - height + 5, 6, 4.5);
    drawSnowyFoliageCluster(cx, baseY - height + 1, 7, 5);
  }

  function drawAppleTree(cx, baseY) {
    canvas.fillEllipse(cx + 2, baseY, 11, 4, PAL.shadow);
    for (let py = baseY - 12; py <= baseY; py++) {
      canvas.fillRect(cx - 2, py, 4, 1, PAL.trunkDark);
      canvas.setPixel(cx - 1, py, PAL.trunkMid);
    }
    canvas.drawLine(cx - 1, baseY - 10, cx - 9, baseY - 17, PAL.trunkMid);
    canvas.drawLine(cx + 1, baseY - 10, cx + 9, baseY - 16, PAL.trunkDark);
    canvas.drawLine(cx, baseY - 12, cx, baseY - 20, PAL.trunkMid);

    drawSnowyFoliageCluster(cx - 8, baseY - 17, 8, 6);
    drawSnowyFoliageCluster(cx + 8, baseY - 16, 8, 6);
    drawSnowyFoliageCluster(cx, baseY - 14, 9, 5.5);
    drawSnowyFoliageCluster(cx, baseY - 21, 9, 6.5);
  }

  // Tall Slender Conical Thuja (Arborvitae) with heavy winter snow cap
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
        // Snow draped down the top and upper ridges of the conical Thuja
        const isSnowCap = t < 0.42 || (t < 0.68 && Math.abs(relX) > 0.35 && n > 0.3);
        let c = PAL.thujaMid;
        if (Math.abs(px - cx) === halfW) {
          c = isSnowCap ? PAL.snowShade : PAL.pineDarkest;
        } else if (isSnowCap) {
          c = relX < 0 ? PAL.snowBrightest : PAL.snowMid;
        } else if (relX < -0.2) {
          c = PAL.thujaLight;
        } else if (relX > 0.25 || t > 0.88) {
          c = PAL.thujaDark;
        }
        canvas.setPixel(px, py, c);
      }
    }
  }

  // ==========================================================================
  // Step 4: Draw Forest Border with Snow-Covered Canopies
  // ==========================================================================
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
  // Step 5: Draw THE MAIN HOUSE (cols 4..16, rows 3..9) with Snow on Roof
  // ==========================================================================
  {
    const hx = 4 * 16;
    const hy = 3 * 16;
    const hw = 13 * 16;
    const hh = 7 * 16;
    const roofH = 3 * 16;
    const wallY = hy + roofH;
    const wallH = 4 * 16;

    canvas.fillRect(hx + 4, hy + hh, hw + 4, 6, PAL.deepShadow);
    canvas.fillRect(hx + hw, hy + 12, 6, hh - 6, PAL.shadow);

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

    canvas.fillRect(hx, wallY, 3, wallH - 5, PAL.trimWhite);
    canvas.fillRect(hx + hw - 3, wallY, 3, wallH - 5, PAL.trimWhite);
    canvas.strokeRect(hx, wallY, hw, wallH, PAL.outline);

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

    // Front Entrance Door at col 13, row 9
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
      canvas.fillEllipse(dx + 7, dy + 8, 4, 4, PAL.thujaMid);
      canvas.fillEllipse(dx + 7, dy + 8, 2.5, 2.5, PAL.thujaLight);
      canvas.fillEllipse(dx + 7, dy + 8, 1.2, 1.2, PAL.windowGlassDark);
      canvas.fillRect(dx + 6, dy + 11, 3, 2, PAL.shedRedBright);
      canvas.fillRect(dx + 10, dy + 14, 2, 2, PAL.gold);
    }

    // Main Pitched Slate Roof with snowbanks along ridge and eaves
    for (let py = hy; py < hy + roofH; py++) {
      const relY = (py - hy) / roofH;
      const indent = Math.round((1 - relY) * 8);
      for (let px = hx + indent; px < hx + hw - indent; px++) {
        const isRidge = py < hy + 5;
        const isEave = py >= hy + roofH - 6;
        const shingleRow = (py - hy) % 5 === 0;
        const shingleCol = ((px + Math.floor((py - hy) / 5) * 3) % 6) === 0;

        let c = PAL.roofMid;
        if (isRidge) {
          c = py === hy ? PAL.outline : py <= hy + 2 ? PAL.snowBrightest : PAL.snowMid;
        } else if (isEave) {
          c =
            py === hy + roofH - 1
              ? PAL.outline
              : py >= hy + roofH - 4
              ? PAL.snowBrightest
              : PAL.snowMid;
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

    // Classic Red-Brick Christmas Chimney slightly left of the center of the Main House Roof (col 7.5, rows 3..4)
    const chimX = 7 * 16 + 8;
    const chimY = 3 * 16 + 10;
    const chimW = 16;
    const chimH = 18;

    // Chimney drop shadow on the slate roof
    canvas.fillRect(chimX + 2, chimY + 3, chimW + 2, chimH, PAL.deepShadow);

    // Brick body with horizontal & staggered vertical mortar lines
    for (let py = chimY + 4; py < chimY + chimH; py++) {
      const isMortarRow = (py - chimY) % 4 === 0;
      const rowGroup = Math.floor((py - chimY) / 4);
      for (let px = chimX; px < chimX + chimW; px++) {
        const isMortarCol = (px - chimX + (rowGroup % 2) * 3) % 6 === 0;
        let c = PAL.shedRedMid;
        if (isMortarRow || isMortarCol) {
          c = PAL.curbDark;
        } else if (px < chimX + 5) {
          c = PAL.shedRedBright;
        } else if (px >= chimX + chimW - 4) {
          c = PAL.shedRedDark;
        }
        canvas.setPixel(px, py, c);
      }
    }
    canvas.strokeRect(chimX, chimY + 3, chimW, chimH - 3, PAL.outline);

    // Snow-rimmed chimney crown & dark flue opening
    canvas.fillRect(chimX - 1, chimY, chimW + 2, 6, PAL.snowBrightest);
    canvas.strokeRect(chimX - 1, chimY, chimW + 2, 6, PAL.outline);
    canvas.fillRect(chimX + 2, chimY + 1, chimW - 4, 3, PAL.outline);

    // Central Projecting 2-Story White Veranda / Sunroom & Gable
    const vx = 9 * 16;
    const vw = 3 * 16;
    const vy = 5 * 16 + 6;
    const vh = 10 * 16 - vy + 2;

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
        else if (distFromEdge <= 3) c = PAL.snowBrightest;
        else if (distFromEdge === 4) c = PAL.snowMid;
        else if ((py - gableTopY) % 4 === 0) c = PAL.roofDarkest;
        else if (px < gablePeakX) c = PAL.roofLight;
        canvas.setPixel(px, py, c);
      }
    }
  }

  // Special Snow-Free Ground Spot on the West Side of the Main House (cols 3..4, rows 9..10)
  // Visible hint that a ladder can be placed here to reach the roof!
  {
    const spotX = 3 * 16 + 8;
    const spotY = 9 * 16 + 15;
    const spotW = 22;
    const spotH = 14;

    // Cleared snow rim around the bare earth/stone patch
    canvas.fillEllipse(spotX + spotW / 2, spotY + spotH / 2, spotW / 2 + 2, spotH / 2 + 2, PAL.snowBrightest);
    canvas.fillEllipse(spotX + spotW / 2, spotY + spotH / 2, spotW / 2 + 1, spotH / 2 + 1, PAL.curbDark);

    // Snow-free bare earth & cobblestone footing patch
    for (let py = spotY; py < spotY + spotH; py++) {
      for (let px = spotX; px < spotX + spotW; px++) {
        const dx = (px - (spotX + spotW / 2)) / (spotW / 2);
        const dy = (py - (spotY + spotH / 2)) / (spotH / 2);
        if (dx * dx + dy * dy <= 1.0) {
          const n = hash2d(px, py);
          let c = PAL.trunkDark;
          if (n > 0.65) c = PAL.trunkMid;
          else if (n < 0.22) c = PAL.cabinDeep;
          canvas.setPixel(px, py, c);
        }
      }
    }

    // Two flat stone footing blocks where the ladder legs rest
    canvas.fillRect(4 * 16 + 1, 10 * 16 + 4, 5, 4, PAL.rockLight);
    canvas.strokeRect(4 * 16 + 1, 10 * 16 + 4, 5, 4, PAL.outline);
    canvas.fillRect(4 * 16 + 9, 10 * 16 + 4, 5, 4, PAL.rockLight);
    canvas.strokeRect(4 * 16 + 9, 10 * 16 + 4, 5, 4, PAL.outline);
  }

  // Silver Birch tree standing to the left of the Main House lawn (col 2, row 11)
  drawBirchTree(2 * 16 + 4, 11 * 16 + 12, 42);

  // Snow-capped round boxwood bush (klotthuja) in front of the house left wing
  canvas.fillEllipse(6 * 16, 13 * 16 + 9, 13, 4.5, PAL.deepShadow);
  drawSnowyFoliageCluster(6 * 16, 12 * 16 + 15, 13, 11);

  // ==========================================================================
  // Step 6: Draw TWO GUEST COTTAGES ("STUGOR") (Upper-Right)
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
        else if (edgeDist <= 3) c = PAL.snowBrightest;
        else if (py === roofBaseY) c = PAL.outline;
        else if (py >= roofBaseY - 3) c = PAL.snowBrightest;
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

  canvas.fillEllipse(23 * 16 + 8, 10 * 16 + 10, 18, 5, PAL.shadow);
  drawSnowyFoliageCluster(24 * 16, 9 * 16 + 9, 13, 9);
  drawSnowyFoliageCluster(23 * 16 + 2, 10 * 16 + 4, 12, 8);

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
        canvas.setPixel(x, y, isGrid ? PAL.curbDark : PAL.snowMid);
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
    // Snow layer on top of the outdoor table
    canvas.fillRect(px + 6, py + 10, 20, 4, PAL.snowBrightest);
  }

  // ==========================================================================
  // Step 8: Snow-Capped Diagonal Hedgerow, Foreground Hedge & Conical Thujas
  // ==========================================================================
  // 8a. Diagonal Hedgerow on left lawn (cols 4..9, rows 16..21)
  for (let i = 0; i <= 11; i++) {
    const t = i / 11;
    const hx = 4 * 16 + 10 + t * (5 * 16);
    const hy = 16 * 16 + 8 + t * (5 * 16);
    canvas.fillEllipse(hx + 2, hy + 7, 11, 4, PAL.shadow);
  }
  for (let i = 0; i <= 11; i++) {
    const t = i / 11;
    const hx = 4 * 16 + 10 + t * (5 * 16) + (i % 2 === 0 ? -2 : 2);
    const hy = 16 * 16 + 6 + t * (5 * 16);
    drawSnowyFoliageCluster(hx, hy, 10, 7.5);
  }

  // 8b. Foreground Hedgerow below gravel turnaround (cols 18..21, rows 24..25)
  for (let i = 0; i <= 8; i++) {
    const hx = 18 * 16 + 8 + i * 7;
    const hy = 24 * 16 + 15 + (i % 2) * 3;
    canvas.fillEllipse(hx + 1, hy + 8, 10, 4, PAL.shadow);
  }
  for (let i = 0; i <= 8; i++) {
    const hx = 18 * 16 + 8 + i * 7;
    const hy = 24 * 16 + 14 + (i % 2) * 3;
    drawSnowyFoliageCluster(hx, hy, 9.5, 8);
  }

  // 8c. Tall conical Thuja trees lining the driveway
  for (let row = 0; row < 28; row++) {
    for (let col = 0; col < 32; col++) {
      if (mapMatrix[row][col] === 3) {
        if (mapMatrix[row + 1]?.[col] === 3) continue;
        drawConicalThuja(col * 16 + 8, row * 16 + 15);
      }
    }
  }

  // 8d. Sprawling snow-topped Apple Tree on the central lawn
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
        else if (py >= sy + roofH - 4) c = PAL.snowBrightest;
        else if (py <= sy + 7) c = PAL.snowLight;
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
        if (py >= gy + roofH - 3) c = PAL.snowBrightest;
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
        else if (edgeDist <= 4) c = PAL.snowBrightest;
        canvas.setPixel(px, py, c);
      }
    }

    // Wall-mounted EV Charger Box on the right wall of the Blue Garage (col 7, row 22)
    const wbX = gx + gw - 2;
    const wbY = 22 * 16 + 3;
    canvas.fillRect(wbX, wbY, 6, 9, PAL.outline);
    canvas.fillRect(wbX + 1, wbY + 1, 4, 7, PAL.roofMid);
    canvas.fillRect(wbX + 2, wbY + 2, 2, 2, PAL.ledGreen);

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
      canvas.drawLine(mid - span, py, mid + span, py, PAL.snowLight);
      canvas.setPixel(mid - span, py, PAL.glassFrame);
      canvas.setPixel(mid + span, py, PAL.glassFrame);
    }
  }

  // ==========================================================================
  // Step 11: Draw Electric Car & Damaged Charging Cable (cols 7..19, rows 21..22)
  // Parked on the driveway below the snowball throwers where the road turns right!
  // ==========================================================================
  {
    // 11a. Charging Wire running from the Blue Garage wallbox (col 7, row 22)
    // across the snow and driveway to the Electric Car (col 17, row 22)
    const wireStartX = 8 * 16 - 2;
    const wireEndX = 17 * 16 + 4;
    const baseWireY = 22 * 16 + 8;

    for (let px = wireStartX; px <= wireEndX; px++) {
      const sag = Math.round(Math.sin((px - wireStartX) * 0.09) * 2);
      const wy = baseWireY + sag;
      // Soft shadow beneath cable
      canvas.setPixel(px, wy + 2, PAL.shadow);
      canvas.setPixel(px, wy, PAL.wireBlack);
      canvas.setPixel(px, wy + 1, PAL.outline);
      if (px % 3 === 0) {
        canvas.setPixel(px, wy, PAL.wireHighlight);
      }
    }

    // 11b. Visibly Damaged / Frayed Section on the Driveway (col 14..15, row 22)
    const dmgX = 14 * 16 + 10;
    const dmgY = baseWireY;
    // Dark scorch mark on the snowy driveway around the damaged cable
    canvas.fillEllipse(dmgX, dmgY + 1, 8, 4.5, [40, 36, 38, 160]);
    canvas.fillEllipse(dmgX, dmgY + 1, 5, 2.5, PAL.outline);
    // Exposed bright copper strands & static spark core
    canvas.fillRect(dmgX - 4, dmgY - 1, 8, 3, PAL.copperBright);
    canvas.setPixel(dmgX - 2, dmgY, PAL.sparkYellow);
    canvas.setPixel(dmgX + 1, dmgY - 1, PAL.sparkCyan);
    canvas.setPixel(dmgX, dmgY + 1, PAL.snowBrightest);

    // 11c. Sleek 16-Bit Electric Car parked at cols 17..19, rows 21..22 (48x32px)
    const carX = 17 * 16 + 2;
    const carY = 21 * 16 + 4;
    const carW = 44;
    const carH = 24;

    // Drop shadow under car
    canvas.fillEllipse(carX + carW / 2, carY + carH - 1, carW / 2 + 2, 6, PAL.deepShadow);

    // Four dark rubber wheels
    canvas.fillRect(carX + 6, carY - 1, 8, 3, PAL.outline);
    canvas.fillRect(carX + carW - 14, carY - 1, 8, 3, PAL.outline);
    canvas.fillRect(carX + 6, carY + carH - 2, 8, 4, PAL.outline);
    canvas.fillRect(carX + carW - 14, carY + carH - 2, 8, 4, PAL.outline);

    // Rounded metallic glacier-blue EV body
    canvas.fillRect(carX + 2, carY + 1, carW - 4, carH - 2, PAL.carBodyMid);
    canvas.fillRect(carX + 1, carY + 3, carW - 2, carH - 6, PAL.carBodyMid);
    canvas.fillRect(carX + 3, carY + 2, carW - 6, 5, PAL.carBodyBright);
    canvas.fillRect(carX + 3, carY + carH - 6, carW - 6, 4, PAL.carBodyDark);
    canvas.strokeRect(carX + 2, carY + 1, carW - 4, carH - 2, PAL.outline);

    // Panoramic dark glass roof, windshield (left) & rear window (right)
    canvas.fillRect(carX + 10, carY + 4, 24, carH - 8, PAL.carGlass);
    canvas.strokeRect(carX + 10, carY + 4, 24, carH - 8, PAL.outline);
    // Glass reflection & roof pillar bars
    canvas.drawLine(carX + 13, carY + 6, carX + 18, carY + 6, PAL.carGlassHighlight);
    canvas.drawLine(carX + 22, carY + 4, carX + 22, carY + carH - 5, PAL.carBodyBright);
    // Snow dusting on the car roof
    canvas.fillRect(carX + 24, carY + 6, 7, 4, PAL.snowLight);

    // Bright LED headlights on left front bumper + red taillights on right rear
    canvas.fillRect(carX + 1, carY + 4, 2, 4, PAL.sparkCyan);
    canvas.fillRect(carX + 1, carY + carH - 8, 2, 4, PAL.sparkCyan);
    canvas.fillRect(carX + carW - 3, carY + 4, 2, 4, PAL.shedRedBright);
    canvas.fillRect(carX + carW - 3, carY + carH - 8, 2, 4, PAL.shedRedBright);

    // Charging plug & glowing green charging status indicator on the front-left fender
    canvas.fillRect(carX - 1, carY + 14, 4, 4, PAL.outline);
    canvas.fillRect(carX + 3, carY + 15, 2, 2, PAL.ledGreen);
  }

  // ==========================================================================
  // Step 12: Draw Wooden Playhouse & Green Slide in Bottom-Right (cols 27..29, rows 24..25)
  // ==========================================================================
  {
    const px = 28 * 16;
    const py = 24 * 16 + 4;
    canvas.fillRect(px, py + 6, 18, 18, PAL.cabinDark);
    canvas.strokeRect(px, py + 6, 18, 18, PAL.outline);
    canvas.fillRect(px - 1, py, 20, 7, PAL.thujaMid);
    canvas.fillRect(px, py, 18, 3, PAL.snowBrightest);
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

  // Keep Santa's iconic front-facing look (hat, face, white beard, gold belt buckle)
  // visible across all 4 movement directions, with a 3-frame walk cycle and horizontal flip when moving left.
  drawGrid(0, 0, downIdle);
  drawGrid(16, 0, downWalk1);
  drawGrid(32, 0, downWalk2);

  drawGrid(0, 16, downIdle);
  drawGrid(16, 16, downWalk1);
  drawGrid(32, 16, downWalk2);

  drawGrid(0, 32, flipH(downIdle));
  drawGrid(16, 32, flipH(downWalk1));
  drawGrid(32, 32, flipH(downWalk2));

  drawGrid(0, 48, downIdle);
  drawGrid(16, 48, downWalk1);
  drawGrid(32, 48, downWalk2);

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
// 4B. GENERATE 16-BIT SNES DOG SPRITESHEET (48x32: 3 frames x 2 directions)
// Frame 0 = Waiting/Sitting pose, Frames 1 & 2 = Chasing/Running poses
// ============================================================================
function generateDogSpritesheet() {
  const sheet = new PixelCanvas(48, 32);
  const C = {
    K: [22, 20, 28, 255], // Dark outline
    D: [148, 88, 42, 255], // Deep warm brown fur shade
    M: [198, 132, 68, 255], // Golden-brown coat mid
    L: [236, 178, 108, 255], // Golden highlight fur
    W: [248, 244, 236, 255], // Cream chest & muzzle
    R: [228, 44, 68, 255], // Red collar & happy tongue
    Y: [255, 214, 74, 255], // Gold collar bell
  };

  // Frame 0: Dog sitting patiently in "waiting mode" (facing right)
  const rightSit = [
    '................',
    '.......KK.KK....',
    '......KDMKDMK...',
    '.....KDLLLLMLK..',
    '.....KMLKLWLKK..',
    '.....KMLWWWWWK..',
    '.....KRRRRYYK...',
    '....KMMLLLLWK...',
    '...K.KMLLWWWK...',
    '..KMK.KMLLWWK...',
    '..KDK.KMMLLLK...',
    '...KK.KDDMMDK...',
    '......KDDKDDK...',
    '......KWWKWWK...',
    '......KKKKKKK...',
    '................',
  ];

  // Frame 1: Dog galloping in "chasing mode" - stride A (facing right, happy tongue out)
  const rightRun1 = [
    '................',
    '........KK.KK...',
    '.......KDMKDMK..',
    '......KDLLLLMLK.',
    '......KMLKLWLKK.',
    '......KMLWWWWWK.',
    '..KK..KRRRRYYRK.',
    '.KMLKKMMMLLLWWK.',
    'KDMLLLLLLLLWWK..',
    '.KKKDDDDMMMLLK..',
    '...KDDK....KDDK.',
    '..KWWK......KWWK',
    '..KKKK......KKKK',
    '................',
    '................',
    '................',
  ];

  // Frame 2: Dog galloping in "chasing mode" - stride B (facing right, legs gathered)
  const rightRun2 = [
    '................',
    '................',
    '........KK.KK...',
    '.......KDMKDMK..',
    '......KDLLLLMLK.',
    '......KMLKLWLKK.',
    '...KK.KMLWWWWWK.',
    '..KMLKKRRRRYYRK.',
    '..KDMLLLLLLLWWK.',
    '...KKDDDDMMLLK..',
    '.....KDDKKDDK...',
    '....KWWK..KWWK..',
    '....KKKK..KKKK..',
    '................',
    '................',
    '................',
  ];

  function flipH(grid) {
    return grid.map((r) => r.split('').reverse().join(''));
  }

  function drawDogFrame(ox, oy, grid) {
    sheet.fillEllipse(ox + 8, oy + 14, 5.5, 1.8, [12, 16, 26, 105]);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const ch = grid[y][x];
        if (ch !== '.' && C[ch]) {
          sheet.setPixel(ox + x, oy + y, C[ch]);
        }
      }
    }
  }

  // Row 0: Facing Right
  drawDogFrame(0, 0, rightSit);
  drawDogFrame(16, 0, rightRun1);
  drawDogFrame(32, 0, rightRun2);

  // Row 1: Facing Left
  drawDogFrame(0, 16, flipH(rightSit));
  drawDogFrame(16, 16, flipH(rightRun1));
  drawDogFrame(32, 16, flipH(rightRun2));

  return sheet.toPngBuffer();
}

// ============================================================================
// 5. RENSBO 32x28 MAP MATRIX (Matches src/world/tilemap.ts)
// Tile 14 = Electric Car parked on the driveway (cols 17..19, rows 21..22)
// Tile 15 = Black Motorcycle parked outside the red-door shed (cols 25..26, row 21)
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
  [1, 0, 5, 5, 5, 5, 5, 5, 0, 4, 4, 0, 0, 2, 2, 2, 2, 14, 14, 14, 2, 2, 2, 2, 2, 15, 15, 2, 0, 0, 0, 1], // 21: Blue garage roof | Electric Car (17..19) | Motorcycle (25..26)
  [1, 0, 5, 5, 5, 5, 5, 5, 0, 0, 0, 0, 0, 2, 2, 2, 2, 14, 14, 14, 2, 2, 2, 2, 2, 2, 2, 2, 0, 0, 0, 1], // 22: Charging cable runs cols 8..16 to Car (17..19)
  [1, 0, 11, 11, 11, 11, 11, 11, 0, 0, 0, 0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0, 0, 0, 0, 0, 1], // 23
  [1, 0, 11, 11, 11, 11, 11, 11, 0, 0, 0, 0, 0, 2, 2, 2, 2, 2, 4, 4, 4, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 24
  [1, 0, 11, 11, 11, 11, 11, 11, 0, 0, 0, 0, 0, 2, 2, 2, 2, 0, 4, 4, 4, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 25
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 26
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 27
];

// ============================================================================
// 6. GENERATE 512x448 BASEMENT & UPSTAIRS 16-BIT SNES LEVEL MAPS
// ============================================================================
function drawWoodPlankFloor(canvas, cStart, rStart, cEnd, rEnd) {
  const x0 = cStart * 16;
  const y0 = rStart * 16;
  const x1 = (cEnd + 1) * 16;
  const y1 = (rEnd + 1) * 16;

  for (let py = y0; py < y1; py++) {
    const plankRow = Math.floor(py / 4);
    const isSeamY = py % 4 === 0;
    for (let px = x0; px < x1; px++) {
      const jointOffset = (plankRow % 3) * 11;
      const isSeamX = (px + jointOffset) % 24 === 0;
      const grain = Math.sin(px * 0.25 + plankRow * 1.7) * 6;
      if (isSeamY || isSeamX) {
        canvas.setPixel(px, py, [118, 76, 42, 255]);
      } else if (py % 4 === 1) {
        canvas.setPixel(px, py, [
          Math.round(188 + grain),
          Math.round(134 + grain * 0.8),
          Math.round(84 + grain * 0.5),
          255,
        ]);
      } else {
        canvas.setPixel(px, py, [
          Math.round(172 + grain),
          Math.round(118 + grain * 0.8),
          Math.round(70 + grain * 0.5),
          255,
        ]);
      }
    }
  }
}

function drawStoneTileFloor(canvas, cStart, rStart, cEnd, rEnd) {
  const x0 = cStart * 16;
  const y0 = rStart * 16;
  const x1 = (cEnd + 1) * 16;
  const y1 = (rEnd + 1) * 16;

  for (let py = y0; py < y1; py++) {
    const tileRow = Math.floor(py / 8);
    const localY = py % 8;
    for (let px = x0; px < x1; px++) {
      const stagger = (tileRow % 2) * 4;
      const localX = (px + stagger) % 8;
      const tileCol = Math.floor((px + stagger) / 8);
      const toneShift = ((tileRow * 7 + tileCol * 13) % 5) * 4 - 8;

      if (localY === 0 || localX === 0) {
        // Mortar joint
        canvas.setPixel(px, py, [108, 48, 32, 255]);
      } else if (localY === 1 || localX === 1) {
        // Warm terracotta bevel highlight
        canvas.setPixel(px, py, [
          Math.min(255, 224 + toneShift),
          Math.min(255, 128 + toneShift),
          Math.min(255, 82 + toneShift),
          255,
        ]);
      } else if (localY === 7 || localX === 7) {
        // Tile edge shade
        canvas.setPixel(px, py, [
          Math.max(0, 174 + toneShift),
          Math.max(0, 82 + toneShift),
          Math.max(0, 48 + toneShift),
          255,
        ]);
      } else {
        // Reddish-orangish stone body
        canvas.setPixel(px, py, [
          Math.min(255, Math.max(0, 204 + toneShift)),
          Math.min(255, Math.max(0, 104 + toneShift)),
          Math.min(255, Math.max(0, 64 + toneShift)),
          255,
        ]);
      }
    }
  }
}

function drawBathroomTileFloor(canvas, cStart, rStart, cEnd, rEnd) {
  const x0 = cStart * 16;
  const y0 = rStart * 16;
  const x1 = (cEnd + 1) * 16;
  const y1 = (rEnd + 1) * 16;

  for (let py = y0; py < y1; py++) {
    const tileY = Math.floor(py / 8);
    const ly = py % 8;
    for (let px = x0; px < x1; px++) {
      const tileX = Math.floor(px / 8);
      const lx = px % 8;
      const isAlt = (tileX + tileY) % 2 === 0;
      if (lx === 0 || ly === 0) {
        canvas.setPixel(px, py, [146, 178, 198, 255]);
      } else if (lx === 1 && ly === 1) {
        canvas.setPixel(px, py, [250, 254, 255, 255]);
      } else if (isAlt) {
        canvas.setPixel(px, py, [224, 242, 250, 255]);
      } else {
        canvas.setPixel(px, py, [198, 226, 240, 255]);
      }
    }
  }
}

function drawInteriorWallTile(canvas, col, row) {
  const x = col * 16;
  const y = row * 16;
  // Dark slate-wood wall top with subtle bevel & wainscoting trim
  canvas.fillRect(x, y, 16, 16, [68, 62, 78, 255]);
  canvas.fillRect(x + 1, y + 1, 14, 14, [86, 78, 98, 255]);
  canvas.fillRect(x + 2, y + 2, 12, 10, [102, 92, 114, 255]);
  // Baseboard / wainscoting edge at bottom of wall tile
  canvas.fillRect(x, y + 13, 16, 2, [132, 110, 88, 255]);
  canvas.fillRect(x, y + 15, 16, 1, [28, 24, 34, 255]);
}

function drawNeutralCouchVertical(canvas, cStart, rStart, cEnd, rEnd) {
  const x = cStart * 16 + 2;
  const y = rStart * 16 + 2;
  const w = (cEnd - cStart + 1) * 16 - 4;
  const h = (rEnd - rStart + 1) * 16 - 4;

  // Drop shadow
  canvas.fillRect(x + 2, y + 2, w, h, [20, 16, 24, 110]);
  // Outer dark outline
  canvas.fillRect(x, y, w, h, [34, 28, 26, 255]);
  // Warm neutral beige/taupe backrest (on left/west side)
  canvas.fillRect(x + 2, y + 2, 8, h - 4, [156, 142, 126, 255]);
  canvas.fillRect(x + 3, y + 3, 6, h - 6, [178, 164, 148, 255]);
  // Seat cushions (3 vertical cushions)
  const cushionCount = 3;
  const ch = Math.floor((h - 16) / cushionCount);
  for (let i = 0; i < cushionCount; i++) {
    const cy = y + 8 + i * ch;
    canvas.fillRect(x + 10, cy, w - 12, ch - 1, [198, 186, 170, 255]);
    canvas.fillRect(x + 11, cy + 1, w - 14, ch - 3, [214, 202, 186, 255]);
    canvas.drawLine(x + 10, cy + ch - 1, x + w - 3, cy + ch - 1, [138, 124, 110, 255]);
  }
  // Top and bottom armrests
  canvas.fillRect(x + 2, y + 2, w - 4, 6, [168, 154, 138, 255]);
  canvas.fillRect(x + 2, y + h - 8, w - 4, 6, [168, 154, 138, 255]);
}

function drawNeutralCouchHorizontal(canvas, cStart, rStart, cEnd, rEnd) {
  const x = cStart * 16 + 2;
  const y = rStart * 16 + 2;
  const w = (cEnd - cStart + 1) * 16 - 4;
  const h = (rEnd - rStart + 1) * 16 - 4;

  canvas.fillRect(x + 2, y + 2, w, h, [20, 16, 24, 110]);
  canvas.fillRect(x, y, w, h, [34, 28, 26, 255]);
  // Backrest along top
  canvas.fillRect(x + 2, y + 2, w - 4, 8, [156, 142, 126, 255]);
  canvas.fillRect(x + 3, y + 3, w - 6, 6, [178, 164, 148, 255]);
  // 3 seat cushions
  const cw = Math.floor((w - 16) / 3);
  for (let i = 0; i < 3; i++) {
    const cx = x + 8 + i * cw;
    canvas.fillRect(cx, y + 10, cw - 1, h - 12, [198, 186, 170, 255]);
    canvas.fillRect(cx + 1, y + 11, cw - 3, h - 14, [214, 202, 186, 255]);
  }
  // Left & right armrests
  canvas.fillRect(x + 2, y + 2, 6, h - 4, [168, 154, 138, 255]);
  canvas.fillRect(x + w - 8, y + 2, 6, h - 4, [168, 154, 138, 255]);
}

function generateBasementPng() {
  const canvas = new PixelCanvas(512, 448);
  // 1. Fill entire background with solid black (#000000)
  canvas.fillRect(0, 0, 512, 448, [0, 0, 0, 255]);

  // 2. Draw floor regions
  // Library & Basement Living Room wooden floor (cols 4..14, rows 5..22)
  drawWoodPlankFloor(canvas, 4, 5, 14, 22);
  // Corridor & Basement Hallway reddish-orangish stone tiles (cols 15..24, rows 10..22)
  drawStoneTileFloor(canvas, 15, 13, 18, 16);
  drawStoneTileFloor(canvas, 19, 10, 24, 22);
  // Threshold strip where wood floor meets stone tiles at col 15, rows 13..16
  canvas.fillRect(15 * 16, 13 * 16, 2, 4 * 16, [112, 78, 46, 255]);
  // Basement Bathroom ceramic tiles (cols 20..24, rows 4..9)
  drawBathroomTileFloor(canvas, 20, 4, 24, 9);

  // 3. Draw Stairs (cols 25..28, rows 14..17)
  for (let c = 25; c <= 28; c++) {
    const sx = c * 16;
    const sy = 14 * 16;
    const sh = 4 * 16;
    // Two steps per tile column going up toward the east
    for (let step = 0; step < 2; step++) {
      const tx = sx + step * 8;
      const shade = (c - 25) * 6 + step * 3;
      canvas.fillRect(tx, sy, 7, sh, [176 + shade, 124 + shade, 76 + shade, 255]);
      canvas.fillRect(tx, sy, 2, sh, [212, 162, 108, 255]); // Step nosing highlight
      canvas.fillRect(tx + 7, sy, 1, sh, [88, 54, 30, 255]); // Step riser shadow
    }
    // Banister rails at top and bottom of stairs
    canvas.fillRect(sx, sy, 16, 3, [120, 74, 38, 255]);
    canvas.fillRect(sx, sy + sh - 3, 16, 3, [120, 74, 38, 255]);
  }

  // 4. Draw Interior Walls from BASEMENT_TILES layout
  // West Wing walls
  for (let r = 3; r <= 23; r++) drawInteriorWallTile(canvas, 3, r);
  for (let c = 4; c <= 14; c++) {
    drawInteriorWallTile(canvas, c, 3);
    drawInteriorWallTile(canvas, c, 4);
    drawInteriorWallTile(canvas, c, 23);
  }
  for (let r = 3; r <= 12; r++) drawInteriorWallTile(canvas, 14, r);
  for (let r = 17; r <= 23; r++) drawInteriorWallTile(canvas, 14, r);

  // Corridor & Hallway walls
  for (let c = 15; c <= 18; c++) {
    drawInteriorWallTile(canvas, c, 12);
    drawInteriorWallTile(canvas, c, 17);
  }
  for (let r = 9; r <= 12; r++) drawInteriorWallTile(canvas, 18, r);
  for (let r = 17; r <= 23; r++) drawInteriorWallTile(canvas, 18, r);
  for (let c = 18; c <= 25; c++) drawInteriorWallTile(canvas, c, 23);
  for (let r = 9; r <= 13; r++) drawInteriorWallTile(canvas, 25, r);
  for (let r = 18; r <= 23; r++) drawInteriorWallTile(canvas, 25, r);

  // Bathroom walls (cols 19..25, rows 3..9, doorway at col 22, row 9)
  for (let c = 19; c <= 25; c++) {
    drawInteriorWallTile(canvas, c, 3);
    if (c !== 22) drawInteriorWallTile(canvas, c, 9);
  }
  for (let r = 3; r <= 9; r++) {
    drawInteriorWallTile(canvas, 19, r);
    drawInteriorWallTile(canvas, 25, r);
  }

  // Stairs walls (cols 25..29, rows 13..18)
  for (let c = 25; c <= 29; c++) {
    drawInteriorWallTile(canvas, c, 13);
    drawInteriorWallTile(canvas, c, 18);
  }
  for (let r = 13; r <= 18; r++) drawInteriorWallTile(canvas, 29, r);

  // 5. THE LIBRARY DETAILS
  // 5A. North Wall Bookshelf (cols 4..13, rows 3..4)
  {
    const bx = 4 * 16;
    const by = 3 * 16 + 2;
    const bw = 10 * 16;
    const bh = 2 * 16 - 2;
    canvas.fillRect(bx, by, bw, bh, [72, 42, 24, 255]);
    canvas.strokeRect(bx, by, bw, bh, [32, 18, 10, 255]);
    const bookColors = [
      [198, 48, 48, 255],
      [46, 128, 76, 255],
      [52, 92, 178, 255],
      [214, 168, 54, 255],
      [142, 68, 162, 255],
      [184, 112, 58, 255],
    ];
    for (let shelf = 0; shelf < 3; shelf++) {
      const sy = by + 3 + shelf * 9;
      canvas.fillRect(bx + 2, sy, bw - 4, 7, [44, 26, 16, 255]);
      // Wooden shelf plank
      canvas.fillRect(bx + 1, sy + 7, bw - 2, 2, [138, 86, 48, 255]);
      let px = bx + 3;
      let bookIdx = shelf * 7;
      while (px < bx + bw - 5) {
        const w = 2 + (bookIdx % 3);
        const h = 5 + (bookIdx % 2);
        const col = bookColors[bookIdx % bookColors.length];
        canvas.fillRect(px, sy + (7 - h), w, h, col);
        canvas.setPixel(px, sy + (7 - h) + 1, [245, 232, 196, 255]); // Gold spine stripe
        px += w + 1;
        bookIdx++;
      }
    }
  }

  // 5B. Library Neutral Couch on west side (cols 4..5, rows 6..10)
  drawNeutralCouchVertical(canvas, 4, 6, 5, 10);

  // 5C. Stack of Firewood on east side (cols 12..13, rows 5..7) - box with horizontal log lines
  {
    const wx = 12 * 16 + 1;
    const wy = 5 * 16 + 2;
    const ww = 2 * 16 - 2;
    const wh = 3 * 16 - 4;
    canvas.fillRect(wx + 2, wy + 2, ww, wh, [20, 14, 10, 100]);
    canvas.fillRect(wx, wy, ww, wh, [58, 36, 20, 255]);
    canvas.strokeRect(wx, wy, ww, wh, [28, 18, 10, 255]);
    // Horizontal stacked logs with bark lines & circular cut ends
    for (let ly = wy + 3; ly < wy + wh - 4; ly += 6) {
      canvas.fillRect(wx + 2, ly, ww - 4, 5, [134, 86, 46, 255]);
      canvas.fillRect(wx + 2, ly + 1, ww - 4, 2, [164, 110, 64, 255]);
      canvas.drawLine(wx + 2, ly + 4, wx + ww - 3, ly + 4, [78, 48, 24, 255]);
      // Cut log ends on left & right
      canvas.fillRect(wx + 2, ly + 1, 3, 3, [218, 184, 132, 255]);
      canvas.fillRect(wx + ww - 5, ly + 1, 3, 3, [218, 184, 132, 255]);
    }
  }

  // 5D. The Fireplace (cols 11..13, rows 9..12)
  {
    // Cozy red hearth rug right next to the fireplace where Santa spawns (cols 9..10, rows 10..11)
    const rx = 9 * 16 + 2;
    const ry = 10 * 16 + 2;
    canvas.fillRect(rx, ry, 28, 28, [148, 42, 46, 255]);
    canvas.strokeRect(rx + 2, ry + 2, 24, 24, [218, 176, 78, 255]);

    const fx = 11 * 16;
    const fy = 9 * 16;
    const fw = 3 * 16;
    const fh = 4 * 16;
    // Stone & red brick hearth structure
    canvas.fillRect(fx, fy, fw, fh, [96, 88, 86, 255]);
    for (let py = fy + 2; py < fy + fh - 2; py++) {
      for (let px = fx + 2; px < fx + fw - 2; px++) {
        const isMortar = (py % 4 === 0) || ((px + Math.floor(py / 4) * 4) % 8 === 0);
        canvas.setPixel(px, py, isMortar ? [72, 64, 64, 255] : [158, 72, 58, 255]);
      }
    }
    canvas.strokeRect(fx, fy, fw, fh, [32, 26, 28, 255]);
    // Dark firebox opening facing west/south-west into the library
    canvas.fillRect(fx + 4, fy + 14, 26, 34, [24, 18, 20, 255]);
    // Glowing logs & warm fire base
    canvas.fillRect(fx + 8, fy + 36, 18, 6, [92, 52, 28, 255]);
    canvas.fillRect(fx + 10, fy + 26, 14, 12, [244, 124, 38, 255]);
    canvas.fillRect(fx + 12, fy + 28, 10, 8, [255, 212, 74, 255]);
  }

  // 6. BASEMENT LIVING ROOM DETAILS
  // 6A. Living Room Neutral Couch (cols 6..10, rows 14..15)
  drawNeutralCouchHorizontal(canvas, 6, 14, 10, 15);

  // 6B. Chess Board Table (cols 7..9, rows 18..19)
  {
    // Decorative rug under chess table
    canvas.fillRect(6 * 16 + 8, 17 * 16 + 8, 4 * 16, 3 * 16, [54, 96, 82, 255]);
    canvas.strokeRect(6 * 16 + 10, 17 * 16 + 10, 4 * 16 - 4, 3 * 16 - 4, [198, 164, 88, 255]);

    const tx = 7 * 16 + 2;
    const ty = 18 * 16 + 2;
    const tw = 3 * 16 - 4;
    const th = 2 * 16 - 4;
    canvas.fillRect(tx + 2, ty + 2, tw, th, [20, 14, 10, 110]);
    canvas.fillRect(tx, ty, tw, th, [104, 64, 36, 255]);
    canvas.strokeRect(tx, ty, tw, th, [42, 24, 14, 255]);
    canvas.fillRect(tx + 2, ty + 2, tw - 4, th - 4, [132, 84, 48, 255]);

    // 8x8 Pixel Chess Board in the center of the table (16x16 px, 2x2 per square)
    const bx = tx + Math.floor((tw - 18) / 2);
    const by = ty + Math.floor((th - 18) / 2);
    canvas.strokeRect(bx, by, 18, 18, [48, 28, 16, 255]);
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const isLight = (r + c) % 2 === 0;
        const sqColor = isLight ? [238, 226, 198, 255] : [44, 38, 46, 255];
        canvas.fillRect(bx + 1 + c * 2, by + 1 + r * 2, 2, 2, sqColor);
        // Tiny chess pieces on ranks 0, 1 and 6, 7
        if (r <= 1) {
          canvas.setPixel(bx + 1 + c * 2, by + 1 + r * 2, [196, 54, 54, 255]);
        } else if (r >= 6) {
          canvas.setPixel(bx + 1 + c * 2, by + 1 + r * 2, [250, 244, 214, 255]);
        }
      }
    }
  }

  // 6C. Extra Big South Windows (cols 5..8, row 23 and cols 10..13, row 23)
  for (const [cStart, cEnd] of [
    [5, 8],
    [10, 13],
  ]) {
    const wx = cStart * 16;
    const wy = 23 * 16 + 2;
    const ww = (cEnd - cStart + 1) * 16;
    const wh = 12;
    canvas.fillRect(wx, wy, ww, wh, [28, 48, 82, 255]);
    canvas.fillRect(wx + 2, wy + 2, ww - 4, wh - 4, [68, 112, 168, 255]);
    // Snow sill & window mullions
    canvas.fillRect(wx + 2, wy + wh - 4, ww - 4, 2, [236, 246, 255, 255]);
    for (let c = cStart + 1; c <= cEnd; c++) {
      canvas.fillRect(c * 16 - 1, wy + 1, 2, wh - 2, [218, 226, 238, 255]);
    }
    canvas.strokeRect(wx, wy, ww, wh, [218, 226, 238, 255]);
  }

  // 7. BASEMENT HALLWAY DETAILS
  // 7A. Locked Door on North Wall of Corridor (cols 16..17, row 12)
  {
    const dx = 16 * 16 + 2;
    const dy = 12 * 16 + 1;
    canvas.fillRect(dx, dy, 28, 15, [112, 68, 38, 255]);
    canvas.strokeRect(dx, dy, 28, 15, [38, 22, 12, 255]);
    canvas.fillRect(dx + 3, dy + 3, 9, 9, [92, 54, 28, 255]);
    canvas.fillRect(dx + 16, dy + 3, 9, 9, [92, 54, 28, 255]);
    canvas.fillRect(dx + 22, dy + 8, 2, 2, [238, 196, 68, 255]); // Brass doorknob
  }

  // 7B. Coat Hangers on West Wall of Hallway (col 19, rows 18..20)
  {
    const cx = 19 * 16 + 1;
    const cy = 18 * 16 + 2;
    const cw = 13;
    const ch = 3 * 16 - 4;
    // Wooden rack base & vertical post
    canvas.fillRect(cx, cy, cw, ch, [98, 60, 32, 255]);
    canvas.strokeRect(cx, cy, cw, ch, [38, 22, 12, 255]);
    // Brass hooks & hanging winter coats (red coat, navy jacket, green scarf)
    canvas.fillRect(cx + 3, cy + 5, 8, 12, [196, 46, 52, 255]); // Red winter coat
    canvas.fillRect(cx + 3, cy + 19, 8, 12, [48, 78, 138, 255]); // Blue parka
    canvas.fillRect(cx + 4, cy + 33, 6, 9, [46, 138, 78, 255]); // Green scarf & hat
  }

  // 7C. Locked Front Door on South Wall of Hallway (cols 21..22, row 23)
  {
    const dx = 21 * 16 + 2;
    const dy = 23 * 16 + 1;
    canvas.fillRect(dx, dy, 28, 15, [118, 72, 40, 255]);
    canvas.strokeRect(dx, dy, 28, 15, [38, 22, 12, 255]);
    canvas.drawLine(dx + 14, dy + 1, dx + 14, dy + 14, [48, 28, 16, 255]);
    canvas.fillRect(dx + 11, dy + 6, 2, 3, [238, 196, 68, 255]);
    canvas.fillRect(dx + 15, dy + 6, 2, 3, [238, 196, 68, 255]);
  }

  // 8. BASEMENT BATHROOM FIXTURES (cols 20..24, rows 4..8)
  // 8A. Sink on west wall (col 20, rows 5..6)
  {
    const sx = 20 * 16 + 1;
    const sy = 5 * 16 + 2;
    canvas.fillRect(sx, sy, 13, 26, [236, 244, 252, 255]);
    canvas.strokeRect(sx, sy, 13, 26, [122, 146, 168, 255]);
    canvas.fillRect(sx + 3, sy + 5, 7, 16, [186, 218, 238, 255]); // Basin water/bowl
    canvas.fillRect(sx + 1, sy + 11, 4, 3, [192, 204, 218, 255]); // Silver faucet
  }
  // 8B. Toilet on north-east wall (col 24, row 5)
  {
    const tx = 24 * 16 + 2;
    const ty = 5 * 16 + 1;
    canvas.fillRect(tx, ty, 12, 6, [238, 246, 255, 255]); // Tank
    canvas.strokeRect(tx, ty, 12, 6, [122, 146, 168, 255]);
    canvas.fillRect(tx + 1, ty + 6, 10, 9, [246, 250, 255, 255]); // Bowl
    canvas.strokeRect(tx + 1, ty + 6, 10, 9, [122, 146, 168, 255]);
  }

  return canvas.toPngBuffer();
}

function drawColorfulCouch(canvas, cStart, rStart, cEnd, rEnd) {
  const x = cStart * 16 + 1;
  const y = rStart * 16 + 1;
  const w = (cEnd - cStart + 1) * 16 - 2;
  const h = (rEnd - rStart + 1) * 16 - 2;

  // Vibrant festive multi-color upholstery (berry magenta, teal-turquoise, gold cushions)
  canvas.fillRect(x + 2, y + 2, w, h, [20, 14, 24, 115]);
  canvas.fillRect(x, y, w, h, [38, 20, 42, 255]);
  // Berry-magenta backrest & frame
  canvas.fillRect(x + 2, y + 2, w - 4, 6, [196, 44, 108, 255]);
  canvas.fillRect(x + 2, y + 2, 5, h - 4, [196, 44, 108, 255]);
  canvas.fillRect(x + w - 7, y + 2, 5, h - 4, [196, 44, 108, 255]);
  // 3 colorful cushions (Teal, Gold, Coral-Red)
  const cushionColors = [
    [42, 176, 168, 255],
    [238, 184, 52, 255],
    [228, 78, 68, 255],
  ];
  const cw = Math.floor((w - 14) / 3);
  for (let i = 0; i < 3; i++) {
    const cx = x + 7 + i * cw;
    canvas.fillRect(cx, y + 7, cw - 1, h - 9, cushionColors[i]);
  }
}

function drawColorfulArmchair(canvas, col, row) {
  const x = col * 16 + 1;
  const y = row * 16 + 1;
  const w = 14;
  const h = 14;
  canvas.fillRect(x + 1, y + 1, w, h, [20, 14, 24, 110]);
  canvas.fillRect(x, y, w, h, [38, 20, 42, 255]);
  // Matching berry-magenta frame & teal/gold cushion
  canvas.fillRect(x + 1, y + 1, w - 2, h - 2, [196, 44, 108, 255]);
  canvas.fillRect(x + 3, y + 3, w - 6, h - 5, [42, 176, 168, 255]);
  canvas.fillRect(x + 4, y + 4, w - 8, 4, [238, 184, 52, 255]);
}

function generateUpstairsPng() {
  const canvas = new PixelCanvas(512, 448);
  // 1. Fill entire background with solid black (#000000)
  canvas.fillRect(0, 0, 512, 448, [0, 0, 0, 255]);

  // 2. Snowy night exterior strip outside the north kitchen windows (cols 8..15, rows 2..3)
  // so the running Santa in the Rosanna cutscene is clearly visible outside the windows!
  for (let py = 2 * 16; py < 4 * 16; py++) {
    for (let px = 8 * 16; px < 16 * 16; px++) {
      const isSnowGround = py >= 3 * 16 - 4;
      canvas.setPixel(
        px,
        py,
        isSnowGround ? [214, 232, 250, 255] : [22, 34, 58, 255]
      );
    }
  }

  // 3. Draw Floor Regions (WoodFloor in all rooms except Shower which has BathroomTileFloor)
  // Dining Room & Living Room (cols 4..8, rows 5..19)
  drawWoodPlankFloor(canvas, 4, 5, 8, 19);
  // The Kitchen (cols 9..14, rows 5..10)
  drawWoodPlankFloor(canvas, 9, 5, 14, 10);
  // Hallway & Extra Room (cols 9..28, rows 11..14 and Extra Room cols 25..28, rows 15..18)
  drawWoodPlankFloor(canvas, 9, 11, 28, 14);
  drawWoodPlankFloor(canvas, 25, 15, 28, 18);
  // Shower Room (cols 16..19, rows 5..10) -> BathroomTileFloor!
  drawBathroomTileFloor(canvas, 16, 5, 19, 10);
  // The Bedroom (cols 21..26, rows 5..10) -> WoodFloor
  drawWoodPlankFloor(canvas, 21, 5, 26, 10);
  // Table Room (cols 10..13, rows 15..21) -> WoodFloor
  drawWoodPlankFloor(canvas, 10, 15, 13, 21);
  // The Office (cols 20..23, rows 15..21) -> WoodFloor
  drawWoodPlankFloor(canvas, 20, 15, 23, 21);

  // 4. Draw Staircase (cols 15..18, rows 15..19)
  for (let r = 15; r <= 19; r++) {
    const sy = r * 16;
    const sx = 15 * 16;
    const sw = 4 * 16;
    for (let step = 0; step < 2; step++) {
      const ty = sy + step * 8;
      const shade = (19 - r) * 5 + step * 2;
      canvas.fillRect(sx, ty, sw, 7, [168 + shade, 116 + shade, 68 + shade, 255]);
      canvas.fillRect(sx, ty, sw, 2, [206, 154, 102, 255]);
      canvas.fillRect(sx, ty + 7, sw, 1, [84, 50, 26, 255]);
    }
    canvas.fillRect(sx, sy, 3, 16, [118, 72, 36, 255]);
    canvas.fillRect(sx + sw - 3, sy, 3, 16, [118, 72, 36, 255]);
  }

  // 5. Draw Interior Walls matching UPSTAIRS_TILES
  for (let r = 4; r <= 20; r++) {
    for (let c = 3; c <= 29; c++) {
      if (UPSTAIRS_MAP_MATRIX_FOR_PNG[r]?.[c] === 21) {
        drawInteriorWallTile(canvas, c, r);
      }
    }
  }
  for (let r = 21; r <= 22; r++) {
    for (let c = 9; c <= 24; c++) {
      if (UPSTAIRS_MAP_MATRIX_FOR_PNG[r]?.[c] === 21) {
        drawInteriorWallTile(canvas, c, r);
      }
    }
  }

  // 6. THE KITCHEN DETAILS (cols 9..14, rows 4..10)
  // 3 North Kitchen Windows (cols 10, 12, 13, row 4)
  for (const wc of [10, 12, 13]) {
    const wx = wc * 16 + 1;
    const wy = 4 * 16 + 2;
    canvas.fillRect(wx, wy, 14, 12, [68, 118, 178, 255]);
    canvas.strokeRect(wx, wy, 14, 12, [224, 234, 246, 255]);
    canvas.drawLine(wx + 7, wy + 1, wx + 7, wy + 11, [224, 234, 246, 255]);
  }
  // Kitchen Island (cols 11..12, rows 6..7)
  {
    const ix = 11 * 16 + 1;
    const iy = 6 * 16 + 2;
    canvas.fillRect(ix, iy, 30, 28, [122, 78, 44, 255]);
    canvas.fillRect(ix + 2, iy + 2, 26, 24, [218, 210, 198, 255]); // Butcher/marble counter top
    canvas.strokeRect(ix, iy, 30, 28, [42, 26, 16, 255]);
  }
  // Stove & Sink on east kitchen wall (col 14, rows 5..8)
  {
    const sx = 14 * 16 + 1;
    const sy = 5 * 16 + 1;
    canvas.fillRect(sx, sy, 14, 4 * 16 - 2, [186, 194, 204, 255]);
    canvas.strokeRect(sx, sy, 14, 4 * 16 - 2, [54, 60, 68, 255]);
    // 4 Stove burners
    for (const [bx, by] of [
      [sx + 3, sy + 4],
      [sx + 8, sy + 4],
      [sx + 3, sy + 12],
      [sx + 8, sy + 12],
    ]) {
      canvas.fillRect(bx, by, 3, 3, [32, 34, 40, 255]);
      canvas.setPixel(bx + 1, by + 1, [228, 64, 48, 255]);
    }
    // Double sink basins
    canvas.fillRect(sx + 3, sy + 34, 8, 10, [132, 152, 172, 255]);
    canvas.fillRect(sx + 3, sy + 46, 8, 10, [132, 152, 172, 255]);
  }
  // Kitchen Bar Counter (cols 9..10, row 9) & The Altar (cols 9..10, row 11)
  canvas.fillRect(9 * 16 + 1, 9 * 16 + 3, 30, 10, [138, 88, 48, 255]);
  canvas.strokeRect(9 * 16 + 1, 9 * 16 + 3, 30, 10, [46, 28, 14, 255]);
  {
    // The Altar (cols 9..10, row 11): ornate table with oval mirror & twin candles
    const ax = 9 * 16 + 2;
    const ay = 11 * 16 + 2;
    canvas.fillRect(ax, ay, 28, 12, [116, 68, 38, 255]);
    canvas.fillRect(ax + 4, ay + 2, 20, 8, [238, 232, 220, 255]); // Altar cloth
    canvas.fillRect(ax + 11, ay - 3, 6, 6, [168, 214, 244, 255]); // Mirror
    canvas.strokeRect(ax + 10, ay - 4, 8, 8, [228, 184, 58, 255]); // Gold frame
    canvas.fillRect(ax + 5, ay + 2, 2, 4, [255, 214, 68, 255]); // Left candle
    canvas.fillRect(ax + 21, ay + 2, 2, 4, [255, 214, 68, 255]); // Right candle
  }

  // 7. DINING ROOM DETAILS (cols 3..8, rows 4..11)
  // Cupboard against west wall (col 4, rows 6..8)
  {
    const cx = 4 * 16 + 1;
    const cy = 6 * 16 + 2;
    canvas.fillRect(cx, cy, 13, 3 * 16 - 4, [112, 68, 36, 255]);
    canvas.strokeRect(cx, cy, 13, 3 * 16 - 4, [42, 24, 12, 255]);
    canvas.fillRect(cx + 3, cy + 4, 7, 16, [154, 192, 214, 255]); // Glass cupboard doors
  }
  // Long Wooden Kitchen Table (cols 6..7, rows 5..9)
  {
    const tx = 6 * 16 + 2;
    const ty = 5 * 16 + 2;
    const tw = 2 * 16 - 4;
    const th = 5 * 16 - 4;
    canvas.fillRect(tx + 2, ty + 2, tw, th, [20, 14, 10, 110]);
    canvas.fillRect(tx, ty, tw, th, [138, 88, 46, 255]);
    canvas.fillRect(tx + 2, ty + 2, tw - 4, th - 4, [162, 106, 58, 255]);
    canvas.strokeRect(tx, ty, tw, th, [48, 28, 14, 255]);
    // Festive red runner down center of long table
    canvas.fillRect(tx + 11, ty + 6, 6, th - 12, [196, 44, 48, 255]);
  }

  // 8. LIVING ROOM DETAILS (cols 3..8, rows 12..20)
  // Colorful Couch (cols 5..7, row 13) + Matching Colorful Armchairs (col 4, row 14 & col 8, row 14)
  drawColorfulCouch(canvas, 5, 13, 7, 13);
  drawColorfulArmchair(canvas, 4, 14);
  drawColorfulArmchair(canvas, 8, 14);
  // Xmas Tree in south-west corner (cols 4..5, rows 17..19)
  {
    const cx = 5 * 16;
    const ty = 17 * 16 + 2;
    // Layered pine boughs
    canvas.fillEllipse(cx, ty + 32, 13, 9, [26, 92, 48, 255]);
    canvas.fillEllipse(cx, ty + 22, 10, 8, [34, 118, 60, 255]);
    canvas.fillEllipse(cx, ty + 12, 7, 6, [44, 142, 72, 255]);
    // Golden star at top
    canvas.fillRect(cx - 2, ty + 2, 5, 5, [255, 218, 64, 255]);
    // Ornaments
    for (const [ox, oy, col] of [
      [cx - 5, ty + 16, [228, 48, 58, 255]],
      [cx + 4, ty + 18, [255, 208, 64, 255]],
      [cx - 7, ty + 28, [64, 156, 244, 255]],
      [cx + 6, ty + 30, [228, 48, 58, 255]],
      [cx, ty + 24, [255, 208, 64, 255]],
    ]) {
      canvas.fillRect(ox, oy, 2, 2, col);
    }
    // Wrapped Christmas presents under tree
    canvas.fillRect(cx - 10, ty + 36, 6, 5, [214, 46, 54, 255]);
    canvas.fillRect(cx - 8, ty + 36, 2, 5, [255, 214, 68, 255]);
    canvas.fillRect(cx + 4, ty + 37, 6, 4, [52, 118, 214, 255]);
    canvas.fillRect(cx + 6, ty + 37, 2, 4, [255, 214, 68, 255]);
  }

  // 8B. Windows on South Walls (Living Room row 20, Table Room row 22, Office row 22, Extra Room row 19)
  for (const [cStart, cEnd, rWin] of [
    [5, 8, 20],
    [10, 13, 22],
    [21, 22, 22],
    [25, 28, 19],
    [18, 18, 4],
  ]) {
    const wx = cStart * 16 + 2;
    const wy = rWin * 16 + 2;
    const ww = (cEnd - cStart + 1) * 16 - 4;
    const wh = 12;
    canvas.fillRect(wx, wy, ww, wh, [68, 118, 178, 255]);
    canvas.strokeRect(wx, wy, ww, wh, [224, 234, 246, 255]);
    for (let c = cStart + 1; c <= cEnd; c++) {
      canvas.fillRect(c * 16 - 1, wy + 1, 2, wh - 2, [224, 234, 246, 255]);
    }
  }

  // 9. TABLE ROOM DETAILS (cols 9..14, rows 15..22)
  // Second Big Wooden Kitchen Table (cols 11..13, rows 18..19)
  {
    const tx = 11 * 16 + 2;
    const ty = 18 * 16 + 2;
    const tw = 3 * 16 - 4;
    const th = 2 * 16 - 4;
    canvas.fillRect(tx + 2, ty + 2, tw, th, [20, 14, 10, 110]);
    canvas.fillRect(tx, ty, tw, th, [142, 92, 48, 255]);
    canvas.fillRect(tx + 2, ty + 2, tw - 4, th - 4, [168, 112, 62, 255]);
    canvas.strokeRect(tx, ty, tw, th, [48, 28, 14, 255]);
    canvas.fillRect(tx + 8, ty + 11, tw - 16, 6, [236, 228, 210, 255]);
  }

  // 10. SHOWER ROOM DETAILS (cols 15..20, rows 4..10)
  // Shower corner & head (col 16, row 5), drain (col 17, row 6), Sink (col 16, rows 7..8), Toilet (col 19, row 8)
  canvas.strokeRect(16 * 16 + 1, 5 * 16 + 1, 22, 22, [156, 204, 228, 255]);
  canvas.fillRect(16 * 16 + 3, 5 * 16 + 2, 6, 4, [192, 206, 220, 255]);
  canvas.fillRect(17 * 16 + 5, 6 * 16 + 5, 6, 6, [118, 138, 154, 255]);
  canvas.fillRect(16 * 16 + 1, 7 * 16 + 2, 12, 24, [236, 244, 252, 255]);
  canvas.strokeRect(16 * 16 + 1, 7 * 16 + 2, 12, 24, [122, 146, 168, 255]);
  canvas.fillRect(19 * 16 + 2, 8 * 16 + 2, 12, 12, [242, 248, 255, 255]);
  canvas.strokeRect(19 * 16 + 2, 8 * 16 + 2, 12, 12, [122, 146, 168, 255]);

  // 11. THE BEDROOM DETAILS (cols 20..27, rows 4..10)
  // Double Bed against east wall (cols 24..26, rows 5..8)
  {
    const bx = 24 * 16 + 2;
    const by = 5 * 16 + 2;
    const bw = 3 * 16 - 4;
    const bh = 4 * 16 - 4;
    canvas.fillRect(bx, by, bw, bh, [104, 62, 34, 255]);
    canvas.strokeRect(bx, by, bw, bh, [38, 22, 12, 255]);
    // Quilted burgundy bedspread
    canvas.fillRect(bx + 2, by + 2, bw - 14, bh - 4, [168, 48, 64, 255]);
    // White sheet fold & two pillows on the east side
    canvas.fillRect(bx + bw - 14, by + 2, 12, bh - 4, [238, 242, 248, 255]);
    canvas.fillRect(bx + bw - 11, by + 5, 8, 18, [252, 254, 255, 255]);
    canvas.fillRect(bx + bw - 11, by + bh - 23, 8, 18, [252, 254, 255, 255]);
  }

  // 12. THE OFFICE DETAILS (cols 19..24, rows 15..22)
  // Side desk (col 20, rows 17..18) & Corner Computer Desk + Chair (cols 20..22, rows 20..21)
  canvas.fillRect(20 * 16 + 1, 17 * 16 + 2, 13, 28, [126, 80, 44, 255]);
  canvas.strokeRect(20 * 16 + 1, 17 * 16 + 2, 13, 28, [44, 26, 14, 255]);
  {
    const ox = 20 * 16 + 1;
    const oy = 20 * 16 + 2;
    canvas.fillRect(ox, oy, 3 * 16 - 4, 28, [126, 80, 44, 255]);
    canvas.strokeRect(ox, oy, 3 * 16 - 4, 28, [44, 26, 14, 255]);
    // Swivel Office Chair in front of desk
    canvas.fillRect(ox + 10, oy - 8, 10, 8, [54, 62, 78, 255]);
    canvas.strokeRect(ox + 10, oy - 8, 10, 8, [26, 30, 38, 255]);
    // Computer Monitor & Keyboard
    canvas.fillRect(ox + 6, oy + 12, 14, 10, [48, 56, 68, 255]);
    canvas.fillRect(ox + 8, oy + 14, 10, 6, [88, 184, 238, 255]); // Glowing screen
    canvas.fillRect(ox + 8, oy + 4, 12, 5, [196, 204, 214, 255]); // Keyboard
  }

  return canvas.toPngBuffer();
}

const UPSTAIRS_MAP_MATRIX_FOR_PNG = [
  [],
  [],
  [],
  [],
  [0,0,0,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,0,0,0,0], // 4
  [0,0,0,21,16,16,22,22,16,16,16,16,16,16,22,21,18,18,18,18,21,16,16,16,22,22,22,21,0,0,0,0], // 5
  [0,0,0,21,22,16,22,22,16,16,16,22,22,16,22,21,18,18,18,18,21,16,16,16,22,22,22,21,0,0,0,0], // 6
  [0,0,0,21,22,16,22,22,16,16,16,22,22,16,22,21,22,18,18,18,21,16,16,16,22,22,22,21,0,0,0,0], // 7
  [0,0,0,21,22,16,22,22,16,16,16,16,16,16,22,21,22,18,18,22,21,16,16,16,22,22,22,21,0,0,0,0], // 8
  [0,0,0,21,16,16,22,22,16,22,22,16,16,16,21,21,18,18,18,18,21,16,16,16,16,16,16,21,0,0,0,0], // 9
  [0,0,0,21,16,16,16,16,16,21,21,16,16,16,21,21,21,18,21,21,21,21,16,21,21,21,21,21,21,21,0,0], // 10
  [0,0,0,21,16,16,16,16,16,22,22,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,21,0,0], // 11
  [0,0,0,21,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,21,0,0], // 12
  [0,0,0,21,16,22,22,22,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,21,0,0], // 13
  [0,0,0,21,22,16,16,16,22,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,21,0,0], // 14
  [0,0,0,21,16,16,16,16,16,21,16,21,21,21,21,19,19,19,19,21,21,16,21,21,21,16,16,16,16,21,0,0], // 15
  [0,0,0,21,16,16,16,16,16,21,16,16,16,16,21,19,19,19,19,21,16,16,16,21,21,16,16,16,16,21,0,0], // 16
  [0,0,0,21,22,22,16,16,16,21,16,16,16,16,21,19,19,19,19,21,22,16,16,21,21,16,16,16,16,21,0,0], // 17
  [0,0,0,21,22,22,16,16,16,21,16,22,22,22,21,19,19,19,19,21,22,16,16,21,21,16,16,16,16,21,0,0], // 18
  [0,0,0,21,22,22,16,16,16,21,16,22,22,22,21,19,19,19,19,21,16,16,16,21,21,21,21,21,21,21,0,0], // 19
  [0,0,0,21,21,21,21,21,21,21,16,16,16,16,21,21,21,21,21,21,22,22,22,21,0,0,0,0,0,0,0,0], // 20
  [0,0,0,0,0,0,0,0,0,21,16,16,16,16,21,0,0,0,0,21,22,22,16,21,0,0,0,0,0,0,0,0], // 21
  [0,0,0,0,0,0,0,0,0,21,21,21,21,21,21,0,0,0,0,21,21,21,21,21,0,0,0,0,0,0,0,0], // 22
];

const spritesDir = path.join(process.cwd(), 'assets/sprites');
const tilesDir = path.join(process.cwd(), 'assets/tiles');
fs.mkdirSync(spritesDir, { recursive: true });
fs.mkdirSync(tilesDir, { recursive: true });

fs.writeFileSync(path.join(spritesDir, 'santa.png'), generateSantaSpritesheet());
fs.writeFileSync(path.join(spritesDir, 'dog.png'), generateDogSpritesheet());
fs.writeFileSync(path.join(spritesDir, 'thrower.png'), generateThrowerSpritesheet());
fs.writeFileSync(path.join(spritesDir, 'snowball.png'), generateSnowballSprite());
fs.writeFileSync(path.join(spritesDir, 'z-key.png'), generateZKeySprite());
fs.writeFileSync(
  path.join(tilesDir, 'winter-tiles.png'),
  generateRensboOverworldPng(RENSBO_MAP_MATRIX)
);
fs.writeFileSync(
  path.join(tilesDir, 'basement-tiles.png'),
  generateBasementPng()
);
fs.writeFileSync(
  path.join(tilesDir, 'upstairs-tiles.png'),
  generateUpstairsPng()
);

console.log('Generated 16-bit SNES Rensbo outdoor, basement, and upstairs maps + sprites!');
