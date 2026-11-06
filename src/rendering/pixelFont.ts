/**
 * Pure 1-bit SNES Proportional Bitmap Font Engine.
 *
 * Browsers apply anti-aliasing (greyscale blur) to vector fonts rendered via ctx.fillText().
 * On a 256x224 canvas scaled up with pixelated interpolation, that anti-aliasing creates
 * fuzzy, muddy square artifacts.
 *
 * This bitmap font renders crisp, 100% unaliased integer pixels using ctx.fillRect,
 * giving authentic 16-bit SNES dialogue typography with zero blur.
 */

interface GlyphData {
  width: number;
  top: number;
  rows: string[];
}

function g(top: number, rows: string[]): GlyphData {
  let maxWidth = 0;
  for (const r of rows) {
    if (r.length > maxWidth) maxWidth = r.length;
  }
  return { width: maxWidth, top, rows };
}

// 7px cap-height font with 2px descenders (9px total cell), proportional character widths
const GLYPHS: Record<string, GlyphData> = {
  // Uppercase letters (top = 0, 7px tall)
  A: g(0, [' 11 ', '1  1', '1  1', '1111', '1  1', '1  1', '1  1']),
  B: g(0, ['111 ', '1  1', '1  1', '111 ', '1  1', '1  1', '111 ']),
  C: g(0, [' 111', '1   ', '1   ', '1   ', '1   ', '1   ', ' 111']),
  D: g(0, ['111 ', '1  1', '1  1', '1  1', '1  1', '1  1', '111 ']),
  E: g(0, ['1111', '1   ', '1   ', '111 ', '1   ', '1   ', '1111']),
  F: g(0, ['1111', '1   ', '1   ', '111 ', '1   ', '1   ', '1   ']),
  G: g(0, [' 111', '1   ', '1   ', '1 11', '1  1', '1  1', ' 111']),
  H: g(0, ['1  1', '1  1', '1  1', '1111', '1  1', '1  1', '1  1']),
  I: g(0, ['111', ' 1 ', ' 1 ', ' 1 ', ' 1 ', ' 1 ', '111']),
  J: g(0, ['  11', '   1', '   1', '   1', '   1', '1  1', ' 11 ']),
  K: g(0, ['1  1', '1  1', '1 1 ', '11  ', '1 1 ', '1  1', '1  1']),
  L: g(0, ['1   ', '1   ', '1   ', '1   ', '1   ', '1   ', '1111']),
  M: g(0, ['1   1', '11 11', '1 1 1', '1 1 1', '1   1', '1   1', '1   1']),
  N: g(0, ['1  1', '11 1', '11 1', '1 11', '1 11', '1  1', '1  1']),
  O: g(0, [' 11 ', '1  1', '1  1', '1  1', '1  1', '1  1', ' 11 ']),
  P: g(0, ['111 ', '1  1', '1  1', '111 ', '1   ', '1   ', '1   ']),
  Q: g(0, [' 11 ', '1  1', '1  1', '1  1', '1 11', '1  1', ' 111']),
  R: g(0, ['111 ', '1  1', '1  1', '111 ', '1 1 ', '1  1', '1  1']),
  S: g(0, [' 111', '1   ', '1   ', ' 11 ', '   1', '   1', '111 ']),
  T: g(0, ['11111', '  1  ', '  1  ', '  1  ', '  1  ', '  1  ', '  1  ']),
  U: g(0, ['1  1', '1  1', '1  1', '1  1', '1  1', '1  1', ' 11 ']),
  V: g(0, ['1   1', '1   1', '1   1', '1   1', ' 1 1 ', ' 1 1 ', '  1  ']),
  W: g(0, ['1   1', '1   1', '1   1', '1 1 1', '1 1 1', '11 11', '1   1']),
  X: g(0, ['1   1', '1   1', ' 1 1 ', '  1  ', ' 1 1 ', '1   1', '1   1']),
  Y: g(0, ['1   1', '1   1', ' 1 1 ', '  1  ', '  1  ', '  1  ', '  1  ']),
  Z: g(0, ['1111', '   1', '  1 ', ' 1  ', '1   ', '1   ', '1111']),

  // Lowercase letters (x-height top = 2, ascenders top = 0, descenders top = 2..8)
  a: g(2, [' 11 ', '   1', ' 111', '1  1', ' 111']),
  b: g(0, ['1   ', '1   ', '111 ', '1  1', '1  1', '1  1', '111 ']),
  c: g(2, [' 111', '1   ', '1   ', '1   ', ' 111']),
  d: g(0, ['   1', '   1', ' 111', '1  1', '1  1', '1  1', ' 111']),
  e: g(2, [' 11 ', '1  1', '1111', '1   ', ' 111']),
  f: g(0, [' 11', '1  ', '111', '1  ', '1  ', '1  ', '1  ']),
  g: g(2, [' 111', '1  1', '1  1', ' 111', '   1', '   1', '111 ']),
  h: g(0, ['1   ', '1   ', '111 ', '1  1', '1  1', '1  1', '1  1']),
  i: g(1, ['1', ' ', '1', '1', '1', '1']),
  j: g(1, [' 1', '  ', ' 1', ' 1', ' 1', ' 1', ' 1', '1 ']),
  k: g(0, ['1   ', '1   ', '1  1', '1 1 ', '11  ', '1 1 ', '1  1']),
  l: g(0, ['1', '1', '1', '1', '1', '1', '1']),
  m: g(2, ['11 11', '1 1 1', '1 1 1', '1 1 1', '1   1']),
  n: g(2, ['111 ', '1  1', '1  1', '1  1', '1  1']),
  o: g(2, [' 11 ', '1  1', '1  1', '1  1', ' 11 ']),
  p: g(2, ['111 ', '1  1', '1  1', '111 ', '1   ', '1   ', '1   ']),
  q: g(2, [' 111', '1  1', '1  1', ' 111', '   1', '   1', '   1']),
  r: g(2, ['1 1', '11 ', '1  ', '1  ', '1  ']),
  s: g(2, [' 111', '1   ', ' 11 ', '   1', '111 ']),
  t: g(1, [' 1 ', '111', ' 1 ', ' 1 ', ' 1 ', '  1']),
  u: g(2, ['1  1', '1  1', '1  1', '1  1', ' 111']),
  v: g(2, ['1   1', '1   1', ' 1 1 ', ' 1 1 ', '  1  ']),
  w: g(2, ['1   1', '1   1', '1 1 1', '1 1 1', ' 1 1 ']),
  x: g(2, ['1  1', ' 11 ', ' 11 ', '1  1', '1  1']),
  y: g(2, ['1  1', '1  1', '1  1', ' 111', '   1', '   1', '111 ']),
  z: g(2, ['1111', '  1 ', ' 1  ', '1   ', '1111']),

  // Digits 0-9 (top = 0, 7px tall)
  '0': g(0, [' 11 ', '1  1', '1  1', '1  1', '1  1', '1  1', ' 11 ']),
  '1': g(0, [' 1 ', '11 ', ' 1 ', ' 1 ', ' 1 ', ' 1 ', '111']),
  '2': g(0, [' 11 ', '1  1', '   1', '  1 ', ' 1  ', '1   ', '1111']),
  '3': g(0, ['111 ', '   1', '   1', ' 11 ', '   1', '   1', '111 ']),
  '4': g(0, ['1  1', '1  1', '1  1', '1111', '   1', '   1', '   1']),
  '5': g(0, ['1111', '1   ', '1   ', '111 ', '   1', '   1', '111 ']),
  '6': g(0, [' 11 ', '1   ', '1   ', '111 ', '1  1', '1  1', ' 11 ']),
  '7': g(0, ['1111', '   1', '   1', '  1 ', '  1 ', ' 1  ', ' 1  ']),
  '8': g(0, [' 11 ', '1  1', '1  1', ' 11 ', '1  1', '1  1', ' 11 ']),
  '9': g(0, [' 11 ', '1  1', '1  1', ' 111', '   1', '   1', ' 11 ']),

  // Punctuation & symbols
  '.': g(6, ['1']),
  ',': g(6, [' 1', '1 ']),
  ':': g(3, ['1', ' ', ' ', '1']),
  ';': g(3, [' 1', '  ', '  ', ' 1', '1 ']),
  '!': g(0, ['1', '1', '1', '1', ' ', ' ', '1']),
  '?': g(0, [' 11 ', '1  1', '   1', '  1 ', ' 1  ', '    ', ' 1  ']),
  "'": g(0, ['1', '1']),
  '"': g(0, ['1 1', '1 1']),
  '-': g(4, ['111']),
  '+': g(2, [' 1 ', '111', ' 1 ']),
  '/': g(0, ['   1', '  1 ', '  1 ', ' 1  ', ' 1  ', '1   ', '1   ']),
  '(': g(0, [' 1', '1 ', '1 ', '1 ', '1 ', '1 ', ' 1']),
  ')': g(0, ['1 ', ' 1', ' 1', ' 1', ' 1', ' 1', '1 ']),
  '|': g(0, ['1', '1', '1', '1', '1', '1', '1']),
};

export function measurePixelText(text: string): number {
  let width = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === ' ') {
      width += 3;
    } else {
      const glyph = GLYPHS[ch] ?? GLYPHS['?'];
      width += glyph.width;
    }
    if (i < text.length - 1) {
      width += 1; // 1px tracking between letters
    }
  }
  return width;
}

export function wrapPixelText(text: string, maxWidth: number): string[] {
  const paragraphs = text.split('\n');
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) {
      lines.push('');
      continue;
    }
    const words = trimmed.split(/\s+/);
    let current = '';

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (measurePixelText(candidate) <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }

  return lines;
}

function drawGlyphPass(
  ctx: CanvasRenderingContext2D,
  text: string,
  startX: number,
  startY: number,
  color: string
): void {
  ctx.fillStyle = color;
  let curX = Math.round(startX);
  const curY = Math.round(startY);

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === ' ') {
      curX += 4; // 3px space + 1px spacing
      continue;
    }

    const glyph = GLYPHS[ch] ?? GLYPHS['?'];
    const top = curY + glyph.top;

    for (let r = 0; r < glyph.rows.length; r++) {
      const row = glyph.rows[r];
      const y = top + r;
      for (let c = 0; c < row.length; c++) {
        if (row[c] === '1') {
          ctx.fillRect(curX + c, y, 1, 1);
        }
      }
    }
    curX += glyph.width + 1;
  }
}

/**
 * Draws text onto the canvas with 100% unaliased solid pixels and an optional 1px drop shadow.
 */
export function drawPixelText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  shadowColor?: string
): void {
  ctx.save();
  if (shadowColor) {
    drawGlyphPass(ctx, text, x + 1, y + 1, shadowColor);
  }
  drawGlyphPass(ctx, text, x, y, color);
  ctx.restore();
}

