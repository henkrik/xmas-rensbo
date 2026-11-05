# xmas-rensbo

A short 2D top-down Christmas adventure game with the look and feel of SNES-era *The Legend of Zelda: A Link to the Past*.

> **Note for Contributors & AI Assistants:** Use this document as the foundational context for all architectural decisions, asset loading patterns, testing practices, and build configurations in this repository.

---

## 1. Project Overview & Goals

- **Genre & Style:** 2D top-down pixel-art adventure game (SNES 16-bit aesthetic, crisp pixel rendering via `image-rendering: pixelated`).
- **Tech Stack:** Vanilla TypeScript + HTML5 `<canvas>` (zero external runtime dependencies).
- **Local Development:** Full modern developer experience—modular TypeScript files, local PNG/audio assets, hot-reloading dev server (`npm start`), and fast unit tests (`npm test`).
- **Release Target (GitHub Pages `/docs`):** Running `npm run export` typechecks and builds a complete, self-contained static web bundle into `docs/` (with `docs/index.html` and relative `./assets/...` paths) so you can configure GitHub Pages to serve directly from your branch's `/docs` folder.

See [export.md](./export.md) for full details on how the export pipeline works and how to publish to GitHub Pages.

---

## 2. NPM Scripts

| Command | Description |
| :--- | :--- |
| `npm start` | Starts a local Vite development server (rooted at `src/`) with hot-reload so you can play and debug the game in your browser. |
| `npm test` | Runs the unit test suite via Vitest (`vitest run`). Use `npm run test:watch` during active development. |
| `npm run typecheck` | Runs `tsc --noEmit` to verify TypeScript types across the project. |
| `npm run export` | Runs `tsc --noEmit` and `vite build` to output a complete static site (`docs/index.html` + bundled JS, CSS, and assets) ready for GitHub Pages (`/docs`). |

---

## 3. Directory Structure

```text
xmas-rensbo/
├── vite.config.ts          # Vite configuration (sets root: 'src', base: './', and outDir: '../docs')
├── package.json            # Scripts and devDependencies (vite, vitest, typescript)
├── tsconfig.json           # Strict TypeScript configuration
├── README.md               # Project architecture and development guidelines (this file)
├── export.md               # Documentation for exporting and publishing to GitHub Pages
├── assets/                 # Raw game assets (spritesheets, tilesets, audio)
│   ├── sprites/            # Character, projectile, and UI icon PNGs
│   └── tiles/              # Tilemap PNGs
├── src/                    # Game source code (TypeScript + HTML template)
│   ├── index.html          # Source HTML template for Vite dev server & build
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
├── scripts/                # Asset generation & utility scripts
│   └── generate-placeholders.mjs
└── docs/                   # Generated static site for GitHub Pages (committed on release)
    ├── index.html
    └── assets/
```

---

## 4. Architectural Rules

### Rule 1: Import Assets via ES Modules
Always import image/audio assets statically in TypeScript (`import santaSpriteUrl from '../../assets/sprites/santa.png'`) rather than hardcoding absolute root URLs like `/assets/sprites/santa.png`.
- Because GitHub Pages serves repositories from a subpath (`https://<user>.github.io/xmas-rensbo/`) and from the `/docs` folder, Vite uses `base: './'` during `npm run export` so all asset URLs in `docs/index.html` and the JS bundle resolve relatively (`./assets/...`).

### Rule 2: Separate Game Logic from DOM / Canvas APIs
To make `npm test` fast, deterministic, and runnable in Node without needing a real browser window:
- Keep game state, movement math, AABB/tile collision detection, snowball hazards, and dialogue state machines in pure TypeScript modules inside `src/core/`, `src/world/`, and `src/entities/`.
- Pass an abstract `InputState` (`{ up, down, left, right, action, actionJustPressed }`) and delta time (`dtSeconds`) into `updateGameState(state, input, dtSeconds)`.
- Isolate `CanvasRenderingContext2D` calls inside `src/rendering/` and `src/main.ts`.

### Rule 3: Crisp Pixel Art Rendering
- Render at a native low resolution appropriate for SNES style (`256x224` logical pixels) and scale the `<canvas>` up via CSS using `image-rendering: pixelated;`.
- Always set `ctx.imageSmoothingEnabled = false;` on the 2D canvas context before drawing sprites or tiles.
