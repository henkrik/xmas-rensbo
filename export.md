# Exporting to JSFiddle (`export.md`)

When releasing **xmas-rensbo**, we do not host our own web server or static asset CDN. Instead, the entire game is distributed and played inside [jsfiddle.net](https://jsfiddle.net), which provides three text panes: **HTML**, **CSS**, and **JavaScript**.

This document explains how our export pipeline turns a multi-file TypeScript project with image/audio assets into three self-contained files in the `out/` directory.

---

## 1. Why an `out/` Folder?

Yes—having a dedicated, git-ignored `out/` directory is the cleanest way to separate development source code from release artifacts. Running `npm run export` cleans and populates `out/` with:

| Output File | JSFiddle Target Pane | Contents |
| :--- | :--- | :--- |
| `out/fiddle.html` | **HTML** pane | Only the inner HTML markup needed by the game (e.g. `<div id="game-container"><canvas id="game-canvas"></canvas></div>`), stripped of `<html>`, `<head>`, `<body`, and `<script>` tags since JSFiddle wraps those automatically. |
| `out/fiddle.css` | **CSS** pane | The complete stylesheet from `src/style.css` (centering the canvas, setting `image-rendering: pixelated`, retro background, etc.). |
| `out/fiddle.js` | **JavaScript** pane | A single, self-contained IIFE (`(() => { ... })()`) compiled from `src/main.ts` with all TypeScript modules and all imported assets inlined as `data:<mime>;base64,...` strings. |

---

## 2. How Assets (Textures / Sprites / Audio) Are Inlined

During local development (`npm start`), assets live as normal files in `assets/` (e.g. `assets/sprites/santa.png`) so you can edit them in any pixel-art editor like Aseprite.

In TypeScript, we import them using standard ES module syntax:

```ts
// src/assets/index.ts
import santaSheetUrl from '../../assets/sprites/santa.png';
import tilesetUrl from '../../assets/tiles/snow-village.png';

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

export async function loadAllAssets() {
  const [santaSheet, tileset] = await Promise.all([
    loadImage(santaSheetUrl),
    loadImage(tilesetUrl),
  ]);
  return { santaSheet, tileset };
}
```

### What happens in each mode?
1. **Local Dev (`npm start` via Vite):**
   `santaSheetUrl` resolves to a local path (`/assets/sprites/santa.png`) served by the Vite dev server. Changes to PNGs reload immediately in your browser.
2. **Unit Tests (`npm test` via Vitest):**
   Tests focus on pure game logic (`src/core/`, `src/world/`, `src/entities/`) or mock `loadAllAssets()`, so Node never needs to decode PNGs unless testing asset helpers.
3. **JSFiddle Export (`npm run export` via esbuild):**
   We configure `esbuild` with the `dataurl` loader for asset extensions:
   ```js
   loader: {
     '.png': 'dataurl',
     '.gif': 'dataurl',
     '.jpg': 'dataurl',
     '.svg': 'dataurl',
     '.mp3': 'dataurl',
     '.wav': 'dataurl',
     '.ogg': 'dataurl',
   }
   ```
   `esbuild` reads `assets/sprites/santa.png` from disk at build time, Base64-encodes the binary bytes, and replaces `santaSheetUrl` in `out/fiddle.js` with:
   ```js
   var santa_default = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...";
   ```
   When the browser sets `img.src = "data:image/png;base64,..."`, `HTMLImageElement` natively decodes the Base64 image in memory without making any external network request!

---

## 3. How `index.html` Maps to `out/fiddle.html`

In `index.html`, we wrap the game's markup with comments:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Xmas Rensbo</title>
    <link rel="stylesheet" href="/src/style.css" />
  </head>
  <body>
    <!-- FIDDLE_HTML_START -->
    <div id="game-container">
      <canvas id="game-canvas" width="256" height="224"></canvas>
    </div>
    <!-- FIDDLE_HTML_END -->
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

During `npm run export`, `scripts/export-fiddle.mjs` extracts everything between `<!-- FIDDLE_HTML_START -->` and `<!-- FIDDLE_HTML_END -->` and writes it to `out/fiddle.html`. This guarantees that the DOM structure used in `npm start` and the DOM structure pasted into JSFiddle never drift out of sync.

---

## 4. Reference Implementation of `scripts/export-fiddle.mjs`

When setting up the build tooling, `scripts/export-fiddle.mjs` should perform the following steps:

```js
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const outDir = path.join(rootDir, 'out');

// 1. Clean and recreate out/
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

// 2. Extract HTML snippet between markers in index.html
const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const match = indexHtml.match(/<!--\s*FIDDLE_HTML_START\s*-->([\s\S]*?)<!--\s*FIDDLE_HTML_END\s*-->/);
if (!match) {
  throw new Error('Could not find <!-- FIDDLE_HTML_START --> ... <!-- FIDDLE_HTML_END --> in index.html');
}
fs.writeFileSync(path.join(outDir, 'fiddle.html'), match[1].trim() + '\n', 'utf8');

// 3. Copy CSS to out/fiddle.css
fs.copyFileSync(path.join(rootDir, 'src/style.css'), path.join(outDir, 'fiddle.css'));

// 4. Bundle TypeScript + inline Base64 assets into out/fiddle.js
await esbuild.build({
  entryPoints: [path.join(rootDir, 'src/main.ts')],
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  outfile: path.join(outDir, 'fiddle.js'),
  loader: {
    '.png': 'dataurl',
    '.gif': 'dataurl',
    '.jpg': 'dataurl',
    '.svg': 'dataurl',
    '.mp3': 'dataurl',
    '.wav': 'dataurl',
    '.ogg': 'dataurl',
  },
});

// 5. Print file sizes so we can keep an eye on JSFiddle payload size
for (const file of ['fiddle.html', 'fiddle.css', 'fiddle.js']) {
  const stats = fs.statSync(path.join(outDir, file));
  const kb = (stats.size / 1024).toFixed(2);
  console.log(`Generated out/${file} (${kb} KB)`);
}
```

---

## 5. Step-by-Step Release Checklist

Whenever you are ready to test or publish the game on JSFiddle:

1. **Run Tests & Typecheck:**
   ```bash
   npm test
   npm run typecheck
   ```
2. **Build the Export Artifacts:**
   ```bash
   npm run export
   ```
3. **Copy-Paste into JSFiddle:**
   - Open [https://jsfiddle.net](https://jsfiddle.net).
   - Copy the contents of `out/fiddle.html` into the **HTML** pane (on macOS, you can run `pbcopy < out/fiddle.html`).
   - Copy the contents of `out/fiddle.css` into the **CSS** pane (`pbcopy < out/fiddle.css`).
   - Copy the contents of `out/fiddle.js` into the **JavaScript** pane (`pbcopy < out/fiddle.js`).
     *(Make sure the JSFiddle JavaScript language dropdown is set to plain **JavaScript**, not TypeScript or Babel, since `fiddle.js` is already compiled).*
4. **Click "Run"** in the top-left corner of JSFiddle and click inside the result frame to focus keyboard controls.

---

## 6. Best Practices to Keep the Export Small

Base64 encoding increases binary size by ~33%, and JSFiddle's editor can get sluggish if `fiddle.js` grows into several megabytes. To keep `out/fiddle.js` snappy:

- **Use indexed-color PNGs:** Keep spritesheets and tilesets at native 16-bit pixel dimensions (e.g., 16x16 tiles) rather than pre-upscaling them in your image editor. Let the `<canvas>` scale them up at runtime.
- **Pack sprites into spritesheets:** A single spritesheet PNG compresses much better than dozens of tiny individual PNGs.
- **Synthesize retro sound effects or use tiny audio clips:** Consider using the browser's built-in `AudioContext` (Web Audio API) to synthesize 8-bit/16-bit chiptune sound effects and jingles in code—zero asset bytes required!

