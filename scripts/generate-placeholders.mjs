import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/**
 * Minimal pure-Node RGBA PNG encoder (zero external dependencies)
 * Used to generate crisp 16x16 placeholder pixel-art sprites & tiles.
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

function encodePng(width, height, getPixelRGBA) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    rawData[rowStart] = 0; // filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixelRGBA(x, y);
      const idx = rowStart + 1 + x * 4;
      rawData[idx] = r;
      rawData[idx + 1] = g;
      rawData[idx + 2] = b;
      rawData[idx + 3] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData);
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function renderGrid(grid, palette) {
  const height = grid.length;
  const width = grid[0].length;
  for (let r = 0; r < height; r++) {
    if (grid[r].length !== width) {
      throw new Error(`Row ${r} has length ${grid[r].length}, expected ${width}`);
    }
  }
  return encodePng(width, height, (x, y) => {
    const ch = grid[y][x];
    if (!palette[ch]) {
      throw new Error(`Unknown palette character '${ch}' at (${x}, ${y})`);
    }
    return palette[ch];
  });
}

const palette = {
  '.': [0, 0, 0, 0], // Transparent
  K: [28, 33, 45, 255], // Dark outline
  R: [214, 40, 40, 255], // Santa red / Red shed door
  D: [158, 25, 25, 255], // Shaded red
  W: [250, 250, 255, 255], // White trim / beard / snow
  G: [215, 228, 242, 255], // Light blue-grey snow shadow
  S: [255, 214, 170, 255], // Skin tone
  Y: [255, 209, 102, 255], // Gold belt buckle / warm window glow / star
  B: [58, 46, 38, 255], // Boots / belt / dark wood / trunk
  T: [34, 111, 84, 255], // Pine green
  L: [56, 163, 115, 255], // Pine highlight green
  E: [20, 74, 55, 255], // Pine dark shadow
  P: [189, 166, 154, 255], // Rosy-grey gravel road base
  Q: [161, 138, 126, 255], // Gravel pebble dark
  M: [214, 197, 187, 255], // Gravel pebble light
  F: [52, 61, 75, 255], // Charcoal roof tile base
  H: [73, 84, 100, 255], // Charcoal roof tile ridge highlight
  V: [222, 227, 234, 255], // Main house light grey siding
  N: [195, 202, 212, 255], // Main house vertical siding seam
  C: [181, 124, 74, 255], // Log cabin warm wood
  O: [143, 93, 50, 255], // Log cabin wood shadow seam
  U: [96, 136, 168, 255], // Blue garage siding
  J: [74, 109, 138, 255], // Blue garage vertical seam
  I: [62, 124, 177, 255], // Winter parka blue
  A: [42, 91, 132, 255], // Winter parka dark blue
};

// 16x16 Santa character sprite (SNES top-down style - unchanged!)
const santaGrid = [
  '.....KKKKKK.....',
  '....KRRRRRRK....',
  '...KRRRRRRRRK...',
  '...KWWWWWWWWKWW.',
  '...KWSKSSKSWKWW.',
  '...KWSSSSSSWK...',
  '...KWWWWWWWWK...',
  '..KRRRRWWWWWRK..',
  '..KRRRRWWWRRRK..',
  '..KWRBBBBBBBWK..',
  '..K.KBBYYBBK.K..',
  '....KRRRRRRK....',
  '....KRRDDRRK....',
  '....KBBKKBBK....',
  '....KBBKKBBK....',
  '................',
];

// 16x16 Snowball thrower NPC sprite (winter beanie, red scarf, blue coat, holding snowball)
const throwerGrid = [
  '.....KKKKKK.....',
  '....KYYYYYYK....',
  '...KIIIIIIIIK...',
  '...KWWWWWWWWK...',
  '...KWSKSSKSWK...',
  '...KWSSSSSSWK...',
  '....KRRRRRRK....',
  '..KKIIIIIIIIKKW.',
  '.KWWIIIIIIIIRGWK',
  '..KKIIIIIIIIRRK.',
  '....KAAAAAAK....',
  '....KIIIIIIK....',
  '....KAAKKAAK....',
  '....KBBKKBBK....',
  '....KBBKKBBK....',
  '................',
];

// 16x16 Snowball projectile sprite
const snowballGrid = [
  '................',
  '................',
  '................',
  '................',
  '.....KKKKKK.....',
  '....KWWWWWWK....',
  '....KWWWWWgk....'.replace('g', 'G').replace('k', 'K'),
  '....KWWWWGGK....',
  '....KWWGGGGK....',
  '.....KKKKKK.....',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
];

// 16x16 Keyboard 'Z' key prompt icon
const zKeyGrid = [
  '.KKKKKKKKKKKKKK.',
  'KWWWWWWWWWWWWWWK',
  'KWGGGGGGGGGGGGWK',
  'KWGWWWWWWWWWWGWK',
  'KWGWWKKKKKKWWGWK',
  'KWGWWWWWWKKWWGWK',
  'KWGWWWWWKKWWWGWK',
  'KWGWWWWKKWWWWGWK',
  'KWGWWWKKWWWWWGWK',
  'KWGWWKKWWWWWWGWK',
  'KWGWWKKKKKKWWGWK',
  'KWGWWWWWWWWWWGWK',
  'KWGGGGGGGGGGGGWK',
  'KBBBBBBBBBBBBBBK',
  'KBBBBBBBBBBBBBBK',
  '.KKKKKKKKKKKKKK.',
];

// Tile 0: Snow ground tile (unchanged!)
const snowTile = [
  'WWWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWW',
  'WWGWWWWWWWWWWWWW',
  'WWWWWWWWWWWWGWWW',
  'WWWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWW',
  'WWWWWWGWWWWWWWWW',
  'WWWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWW',
  'WWGWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWW',
  'WWWWWWWWWWGWWWWW',
  'WWWWWWWWWWWWWWWW',
  'WWWWGWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWW',
];

// Tile 1: Festive snow-topped pine tree (unchanged!)
const treeTile = [
  'WWWWWWWYYWWWWWWW',
  'WWWWWWYYYYWWWWWW',
  'WWWWWWKTTKWWWWWW',
  'WWWWWKWWWWKWWWWW',
  'WWWWKTTTTTTKWWWW',
  'WWWKWWLLLLWWKWWW',
  'WWWWKTTTTTTKWWWW',
  'WWWKTTTTTTTTKWWW',
  'WWKWWLLLLLLWWKWW',
  'WWKTTTTTTTTTTKWW',
  'WKWWLLLLLLLLWWKW',
  'WKTTTTTTTTTTTTKW',
  'WKEEEEEEEEEEEEKW',
  'WWWWWKBBBBKWWWWW',
  'WWWWWKBBBBKWWWWW',
  'WWWWGKKKKKKGWWWW',
];

// Tile 2: Gravel road / driveway with subtle snowy pebbles
const roadTile = [
  'PPPPMPPPPPPQPPPP',
  'PPPPPPPPPPPPPPPP',
  'PPQPPPPPPPPPPMPP',
  'PPPPPPPMPPPPPPPP',
  'PPPPPPPPPPPPQPPP',
  'PMPPPPPPPPPPPPPP',
  'PPPPPPQPPPPPPPPP',
  'PPPPPPPPPPPMPPPP',
  'PPPPMPPPPPPPPPPP',
  'PPPPPPPPPQPPPPPP',
  'PPQPPPPPPPPPPPMP',
  'PPPPPPPPPPPPPPPP',
  'PPPPPPPMPPPQPPPP',
  'PMPPPPPPPPPPPPPP',
  'PPPPPQPPPPPPPPPP',
  'PPPPPPPPPPPMPPPP',
];

// Tile 3: Tall slender Thuja / cypress tree lining the driveway
const thujaTile = [
  'WWWWWWKKKKWWWWWW',
  'WWWWWKTLTTKWWWWW',
  'WWWWWKTTTTKWWWWW',
  'WWWWKTTLLTTKWWWW',
  'WWWWKTTTTTTKWWWW',
  'WWWWKTLTTTTKWWWW',
  'WWWKTTTLLTTTKWWW',
  'WWWKTTTTTTTTKWWW',
  'WWWKTLTTTTTTKWWW',
  'WWWKTTTTLLTTKWWW',
  'WWWKTTTTTTTTKWWW',
  'WWWKTTEEEEEETWWW',
  'WWWWKTTTTTTKWWWW',
  'WWWWKBBBBBBKWWWW',
  'WWWWGKKKKKKGWWWW',
  'WWWWWWWWWWWWWWWW',
];

// Tile 4: Low snow-dusted garden hedge / bush
const hedgeTile = [
  'WWWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWW',
  'WWWWKKKKKKKKWWWW',
  'WWWKWWWWWWWWKWWW',
  'WWKWWLLLLLLWWKWW',
  'WKWWLTTTTTTLWKWW',
  'WKWTTTTTTTTTTKWW',
  'WKTTTLLTTTTLLTKW',
  'WKTTTTTTTTTTTTKW',
  'WKTTEEEEEEEEEETW',
  'WWKTTTTTTTTTTKWW',
  'WWKKEEEEEEEEKKWW',
  'WWWGKKKKKKKKGWWW',
  'WWWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWW',
];

// Tile 5: Dark charcoal shingled roof with snow-dusted eaves
const roofDarkTile = [
  'KKKKKKKKKKKKKKKK',
  'HHHHHHHHHHHHHHHH',
  'FFFFFFFFFFFFFFFF',
  'FGFGFGFGFGFGFGFG',
  'HHHHHHHHHHHHHHHH',
  'FFFFFFFFFFFFFFFF',
  'GFGFGFGFGFGFGFGF',
  'HHHHHHHHHHHHHHHH',
  'FFFFFFFFFFFFFFFF',
  'FGFGFGFGFGFGFGFG',
  'HHHHHHHHHHHHHHHH',
  'FFFFFFFFFFFFFFFF',
  'WWWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWW',
  'GGGGGGGGGGGGGGGG',
  'KKKKKKKKKKKKKKKK',
];

// Tile 6: Main house light-grey vertical siding with warm glowing window
const houseWallWindowTile = [
  'KKKKKKKKKKKKKKKK',
  'VNVNVNVNVNVNVNVN',
  'VNVKKKKKKKKKKVNV',
  'VNVKWWWWWWWWKVNV',
  'VNVKWYYKWYYWKVNV',
  'VNVKWYYKWYYWKVNV',
  'VNVKWWWWWWWWKVNV',
  'VNVKWYYKWYYWKVNV',
  'VNVKWYYKWYYWKVNV',
  'VNVKWWWWWWWWKVNV',
  'VNVKKKKKKKKKKVNV',
  'VNVNVNVNVNVNVNVN',
  'VNVNVNVNVNVNVNVN',
  'VNVNVNVNVNVNVNVN',
  'NNNNNNNNNNNNNNNN',
  'KKKKKKKKKKKKKKKK',
];

// Tile 7: Main house two-story white veranda / porch with railings
const housePorchTile = [
  'KKKKKKKKKKKKKKKK',
  'WWWWWWWWWWWWWWWW',
  'WWKKKKWWWWKKKKWW',
  'WWKYYKWWWWKYYKWW',
  'WWKKKKWWWWKKKKWW',
  'WWWWWWWWWWWWWWWW',
  'KKKKKKKKKKKKKKKK',
  'WKBBBBBBBBBBBBKW',
  'WKBBBBBBBBBBBBKW',
  'WWWWWWWWWWWWWWWW',
  'WKWKWKWKWKWKWKWK',
  'WKWKWKWKWKWKWKWK',
  'WKWKWKWKWKWKWKWK',
  'WWWWWWWWWWWWWWWW',
  'GGGGGGGGGGGGGGGG',
  'KKKKKKKKKKKKKKKK',
];

// Tile 8: Main house entrance door with festive Christmas wreath
const houseDoorTile = [
  'KKKKKKKKKKKKKKKK',
  'VNVNVNVNVNVNVNVN',
  'VNVNKKKKKKKKVNVN',
  'VNVNKWWWWWWKVNVN',
  'VNVNKWWTTWWKVNVN',
  'VNVNKWTYYTWKVNVN',
  'VNVNKWWTTWWKVNVN',
  'VNVNKWWRRWWKVNVN',
  'VNVNKWWWWWWKVNVN',
  'VNVNKWWWWYWKVNVN',
  'VNVNKWWWWWWKVNVN',
  'VNVNKWWWWWWKVNVN',
  'VNVNKWWWWWWKVNVN',
  'VNVNKWWWWWWKVNVN',
  'NNNNKKKKKKKKNNNN',
  'KKKKKKKKKKKKKKKK',
];

// Tile 9: Small wooden guest cottage (stuga) wall with door & window
const cabinWallTile = [
  'KKKKKKKKKKKKKKKK',
  'CCCCCCCCCCCCCCCC',
  'OOOOOOOOOOOOOOOC',
  'CCKKKKKKCKKKKKCC',
  'CCKWWWWKCKYYYKCC',
  'CCKWYYWKCKYYYKCC',
  'CCKWWWWKCKKKKKCC',
  'CCKWWWWKCCCCCCCC',
  'CCKWWWWKOOOOOOOO',
  'CCKWWYWKCCCCCCCC',
  'CCKWWWWKCCCCCCCC',
  'CCKWWWWKOOOOOOOO',
  'CCKWWWWKCCCCCCCC',
  'WWWWWWWWWWWWWWWW',
  'WKWKWKWKWKWKWKWK',
  'KKKKKKKKKKKKKKKK',
];

// Tile 10: White shed wall with bright red double door (right side of driveway)
const shedRedDoorTile = [
  'KKKKKKKKKKKKKKKK',
  'WWWWWWWWWWWWWWWW',
  'WWKKKKKKKKKKKKWW',
  'WWKRRRRKKRRRRKWW',
  'WWKRRRRKKRRRRKWW',
  'WWKRRRRKKRRRRKWW',
  'WWKRRRRKKRRRRKWW',
  'WWKRRRYKKYRRRKWW',
  'WWKRRRRKKRRRRKWW',
  'WWKRRRRKKRRRRKWW',
  'WWKRRRRKKRRRRKWW',
  'WWKRRRRKKRRRRKWW',
  'WWKRRRRKKRRRRKWW',
  'WWKRRRRKKRRRRKWW',
  'GGKKKKKKKKKKKKGG',
  'KKKKKKKKKKKKKKKK',
];

// Tile 11: Blue garage wall with white double doors (bottom-left of photo)
const blueGarageTile = [
  'KKKKKKKKKKKKKKKK',
  'UJUJUJUJUJUJUJUJ',
  'UJKKKKKKKKKKKKUJ',
  'UJKWWWWKKWWWWKUJ',
  'UJKWGGWKKWGGWKUJ',
  'UJKWWWWKKWWWWKUJ',
  'UJKWWWWKKWWWWKUJ',
  'UJKWGGWKKWGGWKUJ',
  'UJKWWWWKKWWWWKUJ',
  'UJKWWWWKKWWWWKUJ',
  'UJKWGGWKKWGGWKUJ',
  'UJKWWWWKKWWWWKUJ',
  'UJKWWWWKKWWWWKUJ',
  'UJKWWWWKKWWWWKUJ',
  'JJKKKKKKKKKKKKJJ',
  'KKKKKKKKKKKKKKKK',
];

// Tile 12: Outdoor patio table & chairs on snow-dusted stone pad
const patioTableTile = [
  'WWWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWW',
  'WWGGGGGGGGGGGGWW',
  'WWGKKGKKKKGKKGWW',
  'WWGGGGGGGGGGGGWW',
  'WWGKKKKKKKKKKGWW',
  'WWGKBBBBBBBBKGWW',
  'WWGKBBBBBBBBKGWW',
  'WWGKBBBBBBBBKGWW',
  'WWGKKKKKKKKKKGWW',
  'WWGKBKGGGGKBKGWW',
  'WWGKKGKKKKGKKGWW',
  'WWGGGGGGGGGGGGWW',
  'WWWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWW',
];

// Tile 13: Plain light-grey vertical house siding (for multi-tile large house walls)
const houseWallPlainTile = [
  'VNVNVNVNVNVNVNVN',
  'VNVNVNVNVNVNVNVN',
  'VNVNVNVNVNVNVNVN',
  'VNVNVNVNVNVNVNVN',
  'VNVNVNVNVNVNVNVN',
  'VNVNVNVNVNVNVNVN',
  'VNVNVNVNVNVNVNVN',
  'NNNNNNNNNNNNNNNN',
  'VNVNVNVNVNVNVNVN',
  'VNVNVNVNVNVNVNVN',
  'VNVNVNVNVNVNVNVN',
  'VNVNVNVNVNVNVNVN',
  'VNVNVNVNVNVNVNVN',
  'VNVNVNVNVNVNVNVN',
  'NNNNNNNNNNNNNNNN',
  'KKKKKKKKKKKKKKKK',
];

const allTiles = [
  snowTile,           // 0
  treeTile,           // 1
  roadTile,           // 2
  thujaTile,          // 3
  hedgeTile,          // 4
  roofDarkTile,       // 5
  houseWallWindowTile,// 6
  housePorchTile,     // 7
  houseDoorTile,      // 8
  cabinWallTile,      // 9
  shedRedDoorTile,    // 10
  blueGarageTile,     // 11
  patioTableTile,     // 12
  houseWallPlainTile, // 13
];

const tilesetGrid = snowTile.map((_, y) =>
  allTiles.map((tile) => tile[y]).join('')
);

const spritesDir = path.join(process.cwd(), 'assets/sprites');
const tilesDir = path.join(process.cwd(), 'assets/tiles');
fs.mkdirSync(spritesDir, { recursive: true });
fs.mkdirSync(tilesDir, { recursive: true });

fs.writeFileSync(
  path.join(spritesDir, 'santa.png'),
  renderGrid(santaGrid, palette)
);
fs.writeFileSync(
  path.join(spritesDir, 'thrower.png'),
  renderGrid(throwerGrid, palette)
);
fs.writeFileSync(
  path.join(spritesDir, 'snowball.png'),
  renderGrid(snowballGrid, palette)
);
fs.writeFileSync(
  path.join(spritesDir, 'z-key.png'),
  renderGrid(zKeyGrid, palette)
);
fs.writeFileSync(
  path.join(tilesDir, 'winter-tiles.png'),
  renderGrid(tilesetGrid, palette)
);

console.log(
  `Generated sprites (santa, thrower, snowball, z-key) and winter-tiles.png (${allTiles.length} tiles)`
);
