# Exporting for GitHub Pages (`export.md`)

Running `npm run export` compiles and bundles **xmas-rensbo** into a complete, standalone static website inside the `out/` directory ready to be hosted on **GitHub Pages** (or any static file host).

---

## 1. What `npm run export` Produces

When you run:

```bash
npm run export
```

the build pipeline performs two steps:
1. **`npm run typecheck` (`tsc --noEmit`):** Verifies that all TypeScript types across `src/` and `test/` are valid.
2. **`vite build` (configured via [vite.config.ts](./vite.config.ts)):** Cleans `out/` and generates a complete production bundle:

```text
out/
├── index.html                  # Complete HTML document with relative links (./assets/...)
└── assets/
    ├── index-<hash>.css        # Minified stylesheet from src/style.css
    └── index-<hash>.js         # Minified JS bundle + inlined small PNG textures
```

### Why Relative Paths (`base: './'`) Matter for GitHub Pages
In [vite.config.ts](./vite.config.ts), we set `base: './'`. That ensures `out/index.html` references `./assets/index-<hash>.js` and `./assets/index-<hash>.css` using relative paths instead of root-absolute `/assets/...` paths. As a result, the exported site works out of the box whether hosted at:
- `https://<username>.github.io/xmas-rensbo/` (a project repository page), or
- `https://<username>.github.io/` (a custom domain or root user page).

---

## 2. How to Publish `out/` to GitHub Pages

You have two easy options to publish the `out/` folder on GitHub Pages:

### Option A: Automated GitHub Actions Deployment (Recommended)
If you add a `.github/workflows/deploy.yml` workflow that runs `npm ci && npm run export` and uploads `./out` via `actions/upload-pages-artifact` + `actions/deploy-pages`, GitHub will automatically build and publish `out/index.html` on every push to `main`.

### Option B: Push `out/` to a `gh-pages` Branch
You can push the contents of `out/` directly to a `gh-pages` branch from your terminal:
```bash
npm run export
npx gh-pages -d out
```
Then, in your GitHub repository **Settings → Pages**, set the source branch to `gh-pages` (`/ (root)`).

---

## 3. Previewing the Export Locally

To verify the exported `out/` directory locally before pushing to GitHub Pages:

```bash
npm run export
npx vite preview --outDir out
```
