import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'HerbBossNG',
        short_name: 'HerbBossNG',
        description: 'HerbBossNG operations, orders, and fulfillment console.',
        start_url: '/',
        display: 'standalone',
        background_color: '#0b0817',
        theme_color: '#0b0817',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // Only the built app shell (JS/CSS/HTML/static assets) is
      // precached. No runtimeCaching rules are configured, so every
      // Supabase request (a different origin entirely — API, auth,
      // realtime) always goes straight to the network, never served
      // stale — this is a live commerce console, not a content site.
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
