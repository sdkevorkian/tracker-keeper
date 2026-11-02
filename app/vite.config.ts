import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

// Everything the app loads comes from its own site, and nothing may run code built from a
// string, so a PDF that exploits a pdf.js bug can't run code here. GitHub Pages can't send
// headers, so this goes in a meta tag. The dev server needs inline scripts, so builds only.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ')

function contentSecurityPolicy(): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
        injectTo: 'head-prepend',
      },
    ],
  }
}

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves a project site from /<repo>/
  base: '/tracker-keeper/',
  // The chart-reading worker is a module worker, so it can share chunks with the app.
  worker: { format: 'es' },
  plugins: [
    contentSecurityPolicy(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // pdf.js's worker is an .mjs file, which the default patterns miss; import needs it offline.
      workbox: { globPatterns: ['**/*.{js,mjs,css,html}'] },
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'tracker-keeper',
        short_name: 'tracker-keeper',
        description: 'Import, verify and track cross stitch charts in the browser.',
        display: 'standalone',
        theme_color: '#7a3b69',
        background_color: '#fbf7f2',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    // The app runs the modern pdf.js build in Chromium; Node needs the legacy one.
    alias: [{ find: /^pdfjs-dist$/, replacement: 'pdfjs-dist/legacy/build/pdf.mjs' }],
    projects: [
      { extends: true, test: { name: 'unit', include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.ts'] } },
      // The acceptance cases against the Workspace driver; Playwright runs them against the browser driver.
      { extends: true, test: { name: 'acceptance', include: ['acceptance/runners/*.test.ts'], environment: 'node' } },
    ],
  },
})
