# tracker-keeper

A browser app (Chrome and Edge) for importing, verifying and tracking cross stitch charts. It installs as a PWA and works offline once loaded.

## Scripts

- `npm run dev`: start the dev server
- `npm test`: run the Vitest suite once (`npm run test:watch` to watch)
- `npm run lint`: lint with oxlint
- `npm run build`: typecheck and build for production
- `npm run preview`: serve the production build, including the service worker
- `npm run generate-pwa-assets`: regenerate the PWA icons from `public/favicon.svg`

## Credits

Color data: craft-color-codes by [MakeBead](https://makebead.com/) ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)). The bundled DMC thread colors in `src/workspace/threads/dmc-floss.json` are its data file, unchanged. See [ADR-0002](../docs/adr/0002-dmc-color-table.md).

## Deploy

Pushes to `main` run lint, build and tests. Deploying is switched off until the app is ready to share: the `deploy` job in `.github/workflows/ci.yml` is commented out. Once it is turned back on, every push to `main` will deploy `dist` to GitHub Pages at `/tracker-keeper/`. The repo's Pages source must be set to "GitHub Actions".
