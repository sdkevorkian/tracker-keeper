# tracker-keeper

A browser app (Chrome and Edge) for importing, verifying and tracking cross stitch charts. It installs as a PWA and works offline once loaded.

## Scripts

- `npm run dev`: start the dev server
- `npm test`: run the Vitest suite once (`npm run test:watch` to watch)
- `npm run lint`: lint with oxlint
- `npm run build`: typecheck and build for production
- `npm run preview`: serve the production build, including the service worker
- `npm run generate-pwa-assets`: regenerate the PWA icons from `public/favicon.svg`

## Deploy

Pushes to `main` run lint, build and tests, then deploy `dist` to GitHub Pages at `/tracker-keeper/`. The repo's Pages source must be set to "GitHub Actions".
