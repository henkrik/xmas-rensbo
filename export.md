# Exporting for GitHub Pages (`export.md`)

Running `npm run export` compiles and bundles **xmas-rensbo** into a complete, standalone static website inside the `docs/` directory so it can be served directly by **GitHub Pages** using the `/docs` folder setting.

---

## 1. What `npm run export` Produces

When you run:

```bash
npm run export
```

the build pipeline performs two steps:
1. **`npm run typecheck` (`tsc --noEmit`):** Verifies that all TypeScript types across `src/` and `test/` are valid.
2. **`vite build` (configured via [vite.config.ts](./vite.config.ts)):** Reads the source template at `src/index.html`, cleans `docs/`, and outputs a self-contained static bundle:

```text
docs/
├── index.html                  # Complete HTML document with relative links (./assets/...)
└── assets/
    ├── index-<hash>.css        # Minified stylesheet from src/style.css
    └── index-<hash>.js         # Minified JS bundle + inlined PNG textures
```

### Relative References to `docs/`
In [vite.config.ts](./vite.config.ts), we configure `root: 'src'`, `base: './'`, and `build.outDir: '../docs'`. That ensures:
- There is no stray `index.html` in the repository root.
- `docs/index.html` references its scripts and stylesheets strictly relative to `docs/` (`./assets/index-<hash>.js` and `./assets/index-<hash>.css`), so it works seamlessly when GitHub Pages serves `/docs` at `https://<username>.github.io/xmas-rensbo/`.

---

## 2. How to Publish on GitHub Pages

1. Run the export command:
   ```bash
   npm run export
   ```
2. Commit and push the updated `docs/` folder to your branch (`main`).
3. In your GitHub repository, open **Settings → Pages**:
   - Under **Build and deployment → Source**, choose **Deploy from a branch**.
   - Select your branch (e.g. `main`) and select **`/docs`** from the folder dropdown, then click **Save**.
