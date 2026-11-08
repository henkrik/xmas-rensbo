import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const docsDir = path.join(rootDir, 'docs');

// 1. Clean and recreate docs/
fs.rmSync(docsDir, { recursive: true, force: true });
fs.mkdirSync(docsDir, { recursive: true });

// 2. Write a clean, vanilla docs/index.html that loads ./style.css and ./game.js
const indexHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
    <title>Xmas Rensbo</title>
    <link rel="stylesheet" href="./style.css" />
  </head>
  <body>
    <div id="viewport-frame">
      <div id="game-container">
        <canvas id="game-canvas" width="256" height="224"></canvas>
        <div id="virtual-joystick-container" style="display: none;">
          <div id="virtual-joystick-base">
            <div id="virtual-joystick-stick"></div>
          </div>
        </div>
        <button id="mobile-action-btn" type="button" aria-label="Action"></button>
      </div>
    </div>
    <script src="./game.js"></script>
  </body>
</html>
`;
fs.writeFileSync(path.join(docsDir, 'index.html'), indexHtml, 'utf8');

// 3. Copy vanilla CSS to docs/style.css
fs.copyFileSync(
  path.join(rootDir, 'src/style.css'),
  path.join(docsDir, 'style.css')
);

// 3b. Copy inspiration/secret.txt to docs/secret.txt
if (fs.existsSync(path.join(rootDir, 'inspiration/secret.txt'))) {
  fs.copyFileSync(
    path.join(rootDir, 'inspiration/secret.txt'),
    path.join(docsDir, 'secret.txt')
  );
}

// 4. Bundle TypeScript + inline Base64 PNG assets into a single vanilla IIFE docs/game.js
await esbuild.build({
  entryPoints: [path.join(rootDir, 'src/main.ts')],
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  outfile: path.join(docsDir, 'game.js'),
  loader: {
    '.png': 'dataurl',
    '.gif': 'dataurl',
    '.jpg': 'dataurl',
    '.svg': 'dataurl',
    '.mp3': 'dataurl',
    '.wav': 'dataurl',
    '.ogg': 'dataurl',
    '.txt': 'text',
  },
});

for (const file of ['index.html', 'style.css', 'secret.txt', 'game.js']) {
  const stats = fs.statSync(path.join(docsDir, file));
  const kb = (stats.size / 1024).toFixed(2);
  console.log(`Generated docs/${file} (${kb} KB)`);
}

