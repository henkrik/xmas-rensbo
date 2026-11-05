# xmas-rensbo

A short 2D top-down Christmas adventure game with the look and feel of SNES-era *The Legend of Zelda: A Link to the Past*.

> **Note for Contributors & AI Assistants:** Use this document as the foundational context for all architectural decisions, asset loading patterns, testing practices, and build configurations in this repository.

---

## 1. Project Overview & Goals

- **Genre & Style:** 2D top-down pixel-art adventure game (SNES 16-bit aesthetic, crisp pixel rendering via `image-rendering: pixelated`).
- **Tech Stack:** Vanilla TypeScript + HTML5 `<canvas>` (zero external runtime dependencies to keep bundle size small and self-contained).
- **Local Development:** Full modern developer experience—modular TypeScript files, local PNG/audio assets, hot-reloading dev server (`npm start`), and fast unit tests (`npm test`).
- **Release Target (JSFiddle):** Instead of self-hosting a server, the final game runs entirely inside [jsfiddle.net](https://jsfiddle.net). An export script (`npm run export`) compiles and bundles the entire project—including all sprites, tilemaps, and audio encoded as inline Base64 Data URLs—into three standalone files in `out/` (`fiddle.html`, `fiddle.css`, `fiddle.js`) ready to copy-paste into JSFiddle's three panes.

See [export.md](./export.md) for full details on how the export pipeline works and how to release a build.

---

## 2. NPM Scripts

| Command | Description |
| :--- | :--- |
| `npm start` | Starts a local Vite development server with hot-reload so you can play and debug the game in your browser. |
| `npm test` | Runs the unit test suite via Vitest (`vitest run`). Use `npm run test:watch` during active development. |
| `npm run typecheck` | Runs `tsc --noEmit` to verify TypeScript types across the project. |
| `npm run export` | Typechecks, bundles all TypeScript & assets (inlining PNGs/audio as Base64), and writes `out/fiddle.html`, `out/fiddle.css`, and `out/fiddle.js`. |

---

## 3. Directory Structure

```text
xmas-rensbo/
├── index.html              # Local dev HTML entry point (contains <!-- FIDDLE_HTML_START/END --> markers)
├── package.json            # Scripts and devDependencies (vite, vitest, esbuild, typescript)
├── tsconfig.json           # Strict TypeScript configuration
├── README.md               # Project architecture and development guidelines (this file)
├── export.md               # Detailed documentation for the JSFiddle export pipeline
├── assets/                 # Raw game assets (spritesheets, tilesets, audio)
│   ├── sprites/            # Character and item PNGs
│   └── tiles/              # Tilemap PNGs
├── src/                    # Game source code (TypeScript)
│   ├── main.ts             # Browser entry point: initializes canvas, loads assets, starts loop
│   ├── style.css           # Game styling (copied to out/fiddle.css on export)
│   ├── types/              # Custom declarations (e.g. *.png module declarations)
│   │   └── assets.d.ts
│   ├── assets/             # Central asset registry and loader
│   │   └── index.ts
│   ├── core/               # Engine primitives (game loop, input handler, camera, collision, math)
│   ├── world/              # Tilemaps, rooms/areas, triggers, NPCs, dialogues
│   ├── entities/           # Player, snowmen, obstacles, collectibles
│   └── rendering/          # Canvas 2D renderer, sprite animation, UI/dialogue box rendering
├── test/                   # Unit tests mirroring src/ structure (or colocated *.test.ts)
├── scripts/                # Build and export automation
│   └── export-fiddle.mjs   # Generates out/fiddle.{html,css,js}
└── out/                    # Generated JSFiddle release artifacts (git-ignored)
    ├── fiddle.html
    ├── fiddle.css
    └── fiddle.js
```

---

## 4. Architectural Rules (Crucial for JSFiddle Compatibility)

Because the game must run identically both on `localhost` during development and inside JSFiddle's sandboxed iframe on release, **all code changes must follow these rules**:

### Rule 1: Never Hardcode File Paths or Use Runtime `fetch()`
JSFiddle cannot serve relative files like `./assets/player.png` or `./data/map.json`.
- **Images/Sprites:** Always import assets statically in TypeScript (`import playerUrl from '../../assets/sprites/player.png'`).
  - During `npm start`, Vite resolves `playerUrl` to a local URL (or data URL).
  - During `npm run export`, our bundler automatically converts every `.png`, `.gif`, `.mp3`, or `.wav` import into an inline `data:...;base64,...` string.
- **Level / Map / Dialogue Data:** Store map layouts, collision grids, and dialogue trees as TypeScript modules (`.ts`) or statically imported `.json` files so they are compiled directly into the JS bundle.

### Rule 2: Separate Game Logic from DOM / Canvas APIs
To make `npm test` fast, deterministic, and runnable in Node without needing a real browser window:
- Keep game state, movement math, AABB/tile collision detection, inventory, and dialogue state machines in pure TypeScript classes/functions inside `src/core/`, `src/world/`, and `src/entities/`.
- Pass an abstract input state (e.g., `{ up: boolean, down: boolean, left: boolean, right: boolean, action: boolean }`) and delta time (`dt`) into your `update(dt, input)` functions rather than reading `window.addEventListener` directly inside entity logic.
- Isolate `CanvasRenderingContext2D` calls inside `src/rendering/` and `src/main.ts`.

### Rule 3: Keep `index.html` Synchronized with Export Markers
`index.html` is used by `npm start`, and the portion between `<!-- FIDDLE_HTML_START -->` and `<!-- FIDDLE_HTML_END -->` is extracted into `out/fiddle.html` during `npm run export`. Any DOM elements required by the game (such as `<canvas id="game-canvas"></canvas>`) must live inside those markers.

### Rule 4: Crisp Pixel Art Rendering
- Render at a native low resolution appropriate for SNES style (e.g., `256x224` or `320x240` logical pixels) and scale the `<canvas>` up via CSS using `image-rendering: pixelated;`.
- Always set `ctx.imageSmoothingEnabled = false;` on the 2D canvas context before drawing sprites or tiles.

A short 2D top-down Christmas adventure game with the look and feel of SNES-era *The Legend of Zelda: A Link to the Past*.

> **Note for Contributors & AI Assistants:** Use this document as the foundational context for all architectural decisions, asset loading patterns, testing practices, and build configurations in this repository.

---

## 1. Project Overview & Goals

- **Genre & Style:** 2D top-down pixel-art adventure game (SNES 16-bit aesthetic, crisp pixel rendering via `image-rendering: pixelated`).
- **Tech Stack:** Vanilla TypeScript + HTML5 `<canvas>` (zero external runtime dependencies to keep bundle size small and self-contained).
- **Local Development:** Full modern developer experience—modular TypeScript files, local PNG/audio assets, hot-reloading dev server (`npm start`), and fast unit tests (`npm test`).
- **Release Target (JSFiddle):** Instead of self-hosting a server, the final game runs entirely inside [jsfiddle.net](https://jsfiddle.net). An export script (`npm run export`) compiles and bundles the entire project—including all sprites, tilemaps, and audio encoded as inline Base64 Data URLs—into three standalone files in `out/` (`fiddle.html`, `fiddle.css`, `fiddle.js`) ready to copy-paste into JSFiddle's three panes.

See [export.md](./export.md) for full details on how the export pipeline works and how to release a build.

---

## 2. NPM Scripts

| Command | Description |
| :--- | :--- |
| `npm start` | Starts a local Vite development server with hot-reload so you can play and debug the game in your browser. |
| `npm test` | Runs the unit test suite via Vitest (`vitest run`). Use `npm run test:watch` during active development. |
| `npm run typecheck` | Runs `tsc --noEmit` to verify TypeScript types across the project. |
| `npm run export` | Typechecks, bundles all TypeScript & assets (inlining PNGs/audio as Base64), and writes `out/fiddle.html`, `out/fiddle.css`, and `out/fiddle.js`. |

---

## 3. Directory Structure

```text
xmas-rensbo/
├── index.html              # Local dev HTML entry point (contains <!-- FIDDLE_HTML_START/END --> markers)
├── package.json            # Scripts and devDependencies (vite, vitest, esbuild, typescript)
├── tsconfig.json           # Strict TypeScript configuration
├── README.md               # Project architecture and development guidelines (this file)
├── export.md               # Detailed documentation for the JSFiddle export pipeline
├── assets/                 # Raw game assets (spritesheets, tilesets, audio)
│   ├── sprites/            # Character and item PNGs
│   └── tiles/              # Tilemap PNGs
├── src/                    # Game source code (TypeScript)
│   ├── main.ts             # Browser entry point: initializes canvas, loads assets, starts loop
│   ├── style.css           # Game styling (copied to out/fiddle.css on export)
│   ├── types/              # Custom declarations (e.g. *.png module declarations)
│   │   └── assets.d.ts
│   ├── assets/             # Central asset registry and loader
│   │   └── index.ts
│   ├── core/               # Engine primitives (game loop, input handler, camera, collision, math)
│   ├── world/              # Tilemaps, rooms/areas, triggers, NPCs, dialogues
│   ├── entities/           # Player, snowmen, obstacles, collectibles
│   └── rendering/          # Canvas 2D renderer, sprite animation, UI/dialogue box rendering
├── test/                   # Unit tests mirroring src/ structure (or colocated *.test.ts)
├── scripts/                # Build and export automation
│   └── export-fiddle.mjs   # Generates out/fiddle.{html,css,js}
└── out/                    # Generated JSFiddle release artifacts (git-ignored)
    ├── fiddle.html
    ├── fiddle.css
    └── fiddle.js
```

---

## 4. Architectural Rules (Crucial for JSFiddle Compatibility)

Because the game must run identically both on `localhost` during development and inside JSFiddle's sandboxed iframe on release, **all code changes must follow these rules**:

### Rule 1: Never Hardcode File Paths or Use Runtime `fetch()`
JSFiddle cannot serve relative files like `./assets/player.png` or `./data/map.json`.
- **Images/Sprites:** Always import assets statically in TypeScript (`import playerUrl from '../../assets/sprites/player.png'`).
  - During `npm start`, Vite resolves `playerUrl` to a local URL (or data URL).
  - During `npm run export`, our bundler automatically converts every `.png`, `.gif`, `.mp3`, or `.wav` import into an inline `data:...;base64,...` string.
- **Level / Map / Dialogue Data:** Store map layouts, collision grids, and dialogue trees as TypeScript modules (`.ts`) or statically imported `.json` files so they are compiled directly into the JS bundle.

### Rule 2: Separate Game Logic from DOM / Canvas APIs
To make `npm test` fast, deterministic, and runnable in Node without needing a real browser window:
- Keep game state, movement math, AABB/tile collision detection, inventory, and dialogue state machines in pure TypeScript classes/functions inside `src/core/`, `src/world/`, and `src/entities/`.
- Pass an abstract input state (e.g., `{ up: boolean, down: boolean, left: boolean, right: boolean, action: boolean }`) and delta time (`dt`) into your `update(dt, input)` functions rather than reading `window.addEventListener` directly inside entity logic.
- Isolate `CanvasRenderingContext2D` calls inside `src/rendering/` and `src/main.ts`.

### Rule 3: Keep `index.html` Synchronized with Export Markers
`index.html` is used by `npm start`, and the portion between `<!-- FIDDLE_HTML_START -->` and `<!-- FIDDLE_HTML_END -->` is extracted into `out/fiddle.html` during `npm run export`. Any DOM elements required by the game (such as `<canvas id="game-canvas"></canvas>`) must live inside those markers.

### Rule 4: Crisp Pixel Art Rendering
- Render at a native low resolution appropriate for SNES style (e.g., `256x224` or `320x240` logical pixels) and scale the `<canvas>` up via CSS using `image-rendering: pixelated;`.
- Always set `ctx.imageSmoothingEnabled = false;` on the 2D canvas context before drawing sprites or tiles.
