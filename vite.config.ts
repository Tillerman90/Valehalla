import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

// Shown on the Saves tab so it is always clear which build a phone is running.
const buildId = `${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC, ${(process.env.GITHUB_SHA ?? 'local').slice(0, 7)}`;

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  // Relative paths, so the game works wherever GitHub Pages serves it from.
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // A new version waits until the player taps Update, so it never swaps in mid-session.
      registerType: 'prompt',
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon.svg'],
      manifest: {
        name: 'Valehalla',
        short_name: 'Valehalla',
        description: 'Found a village, raise a dynasty, conquer the valley.',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0a1322',
        theme_color: '#0a1322',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff2}'] },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
