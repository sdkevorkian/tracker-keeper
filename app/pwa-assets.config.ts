import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Matches the favicon's background so the padding around these icons doesn't show as a white border.
const resizeOptions = { background: '#fbf7f2' }

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions },
    apple: { ...minimal2023Preset.apple, resizeOptions },
  },
  images: ['public/favicon.svg'],
})
