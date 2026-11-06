# xmas-rensbo

**[Play here](https://henkrik.github.io/xmas-rensbo/)**

A short 2D top-down Christmas adventure game with the look and feel of SNES-era *The Legend of Zelda: A Link to the Past*.

> **Note for Contributors & AI Assistants:** Use this document as the foundational context for all architectural decisions, asset loading patterns, testing practices, and build configurations in this repository.

---

## 1. Project Overview & Goals

- **Genre & Style:** 2D top-down pixel-art adventure game (SNES 16-bit aesthetic, crisp pixel rendering via `image-rendering: pixelated`).
- **Tech Stack:** Vanilla TypeScript + HTML5 `<canvas>` (zero external runtime dependencies, zero injected client scripts).
- **Local Development:** Modular TypeScript files, local PNG assets, fast unit tests (`npm test`), and a zero-injection static HTTP server (`npm start`) that builds and serves `docs/` with zero background polling or WebSockets.
- **Release Target (GitHub Pages `/docs`):** Running `npm run export` typechecks and builds three plain, unminified vanilla files into `docs/`:
  - `docs/index.html` (the single `index.html` in the repository)
  - `docs/style.css`
  - `docs/game.js` (compiled from `src/main.ts` with all PNG assets inlined as Base64 Data URLs).

See [export.md](./export.md) for full details on how the export pipeline works and how to publish to GitHub Pages.

---

## 2. NPM Scripts

| Command | Description |
| :--- | :--- |
| `npm start` | Exports `docs/` and starts a minimal local static HTTP server (`http://localhost:8080/`) with zero injected scripts or polling. |
| `npm test` | Runs the unit test suite via Vitest (`vitest run`). Use `npm run test:watch` during active development. |
| `npm run typecheck` | Runs `tsc --noEmit` to verify TypeScript types across the project. |
| `npm run export` | Runs `tsc --noEmit` and `node scripts/export-docs.mjs` to output `docs/index.html`, `docs/style.css`, and `docs/game.js` ready for GitHub Pages (`/docs`). |

---

## 3. Directory Structure

```text
xmas-rensbo/
├── package.json            # Scripts and devDependencies (esbuild, vitest, typescript)
├── tsconfig.json           # Strict TypeScript configuration
├── README.md               # Project architecture and development guidelines (this file)
├── export.md               # Documentation for exporting and publishing to GitHub Pages
├── assets/                 # Raw game assets (spritesheets, tilesets, audio)
│   ├── sprites/            # Character, projectile, and UI icon PNGs
│   └── tiles/              # Tilemap PNGs
├── src/                    # Game source code (TypeScript)
│   ├── main.ts             # Browser entry point: initializes canvas, loads assets, starts loop
│   ├── style.css           # Game styling
│   ├── types/              # Custom declarations (e.g. *.png module declarations)
│   │   └── assets.d.ts
│   ├── assets/             # Central asset registry and loader
│   │   └── index.ts
│   ├── core/               # Engine primitives (input handler, camera, collision, math)
│   ├── world/              # Tilemaps, game state, interactions, dialogues
│   ├── entities/           # Player, snowball throwers, projectiles
│   └── rendering/          # Canvas 2D renderer, camera scrolling, UI/dialogue box rendering
├── test/                   # Unit tests mirroring src/ structure
├── scripts/                # Build, dev server, and asset generation scripts
│   ├── dev-server.mjs      # Minimal static HTTP server for `npm start` (no HMR/pinging)
│   ├── export-docs.mjs     # Exports vanilla docs/index.html, docs/style.css, and docs/game.js
│   └── generate-placeholders.mjs
└── docs/                   # Generated vanilla static site for GitHub Pages
    ├── index.html
    ├── style.css
    └── game.js
```

---

## 4. Architectural Rules

### Rule 1: Import Assets via ES Modules
Always import image/audio assets statically in TypeScript (`import santaSpriteUrl from '../../assets/sprites/santa.png'`) rather than hardcoding file paths.
- `scripts/export-docs.mjs` uses `esbuild` (`loader: { '.png': 'dataurl' }`) to inline all PNGs as `data:image/png;base64,...` strings directly inside `docs/game.js`.

### Rule 2: Separate Game Logic from DOM / Canvas APIs
To make `npm test` fast, deterministic, and runnable in Node without needing a real browser window:
- Keep game state, movement math, AABB/tile collision detection, snowball hazards, and dialogue state machines in pure TypeScript modules inside `src/core/`, `src/world/`, and `src/entities/`.
- Pass an abstract `InputState` (`{ up, down, left, right, action, actionJustPressed }`) and delta time (`dtSeconds`) into `updateGameState(state, input, dtSeconds)`.
- Isolate `CanvasRenderingContext2D` calls inside `src/rendering/` and `src/main.ts`.

### Rule 3: Crisp Pixel Art Rendering
- Render at a native low resolution appropriate for SNES style (`256x224` logical pixels) and scale the `<canvas>` up via CSS using `image-rendering: pixelated;`.
- Always set `ctx.imageSmoothingEnabled = false;` on the 2D canvas context before drawing sprites or tiles.
