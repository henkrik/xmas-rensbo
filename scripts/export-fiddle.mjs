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
const match = indexHtml.match(
  /<!--\s*FIDDLE_HTML_START\s*-->([\s\S]*?)<!--\s*FIDDLE_HTML_END\s*-->/
);
if (!match) {
  throw new Error(
    'Could not find <!-- FIDDLE_HTML_START --> ... <!-- FIDDLE_HTML_END --> in index.html'
  );
}
fs.writeFileSync(
  path.join(outDir, 'fiddle.html'),
  match[1].trim() + '\n',
  'utf8'
);

// 3. Copy CSS to out/fiddle.css
fs.copyFileSync(
  path.join(rootDir, 'src/style.css'),
  path.join(outDir, 'fiddle.css')
);

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

