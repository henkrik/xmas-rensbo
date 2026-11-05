# Exporting for GitHub Pages (`export.md`)

Running `npm run export` compiles and bundles **xmas-rensbo** into three plain, readable vanilla files inside the `docs/` directory so it can be served directly by **GitHub Pages** using the `/docs` folder setting.

---

## 1. What `npm run export` Produces

When you run:

```bash
npm run export
```

the build pipeline performs two steps:
1. **`npm run typecheck` (`tsc --noEmit`):** Verifies that all TypeScript types across `src/` and `test/` are valid.
2. **`node scripts/export-docs.mjs`:** Cleans `docs/` and generates three clean, zero-magic files:

```text
docs/
├── index.html      # Complete HTML document referencing ./style.css and ./game.js
├── style.css       # Plain CSS copied directly from src/style.css
└── game.js         # Single vanilla IIFE JS bundle with all TypeScript + Base64 PNGs inlined
```

### Why We Use a Plain `<script src="./game.js"></script>` (Instead of `<script type="module" src="./main.ts">`)
1. **No `.ts` MIME Type Errors (`video/mp2t`):** Static web servers like GitHub Pages map the `.ts` file extension to MPEG-2 Transport Stream video (`video/mp2t`). If an `index.html` file containing `<script type="module" src="./main.ts"></script>` is deployed directly, the browser blocks it because strict MIME checking rejects `video/mp2t` for `<script type="module">`.
2. **No Module Preload Polyfills or `fetch()` Pinging:** By bundling with `esbuild` in `iife` format and loading `<script src="./game.js"></script>` at the bottom of `<body>`, `docs/game.js` contains 100% pure, readable application code—no `modulepreload` observers, no `fetch()` calls, and no external asset requests.

---

## 2. How to Publish on GitHub Pages

1. Run the export command:
   ```bash
   npm run export
   ```
2. Commit and push the `docs/` folder (`docs/index.html`, `docs/style.css`, `docs/game.js`) to your branch (`main`).
3. In your GitHub repository, open **Settings → Pages**:
   - Under **Build and deployment → Source**, choose **Deploy from a branch**.
   - Select your branch (e.g. `main`) and select **`/docs`** from the folder dropdown, then click **Save**.
