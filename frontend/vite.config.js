import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\/api\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
            },
          },
          {
            urlPattern: /^https?:\/\/.*\/static\/recipes\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'recipe-images',
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      manifest: {
        name: 'NutriPlanner',
        short_name: 'NutriPlanner',
        description: 'Tu planificador de comidas semanal con lista de compra optimizada',
        theme_color: '#2D6A4F',
        background_color: '#F5EEDC',
        display: 'standalone',
        start_url: '/app',
        scope: '/',
        categories: ['food', 'health', 'lifestyle'],
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Mi Menu', short_name: 'Menu', url: '/app/menu', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
          { name: 'Mi Compra', short_name: 'Compra', url: '/app/mi-compra', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
          { name: 'Despensa', short_name: 'Despensa', url: '/app/despensa', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
        ],
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
  },
  server: {
    port: 5176,
    host: true,
    // Proxy para todas las rutas del backend
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8004',
        changeOrigin: true,
        secure: false,
      },
      '/auth': {
        target: 'http://127.0.0.1:8004',
        changeOrigin: true,
        secure: false,
      },
      '/users': {
        target: 'http://127.0.0.1:8004',
        changeOrigin: true,
        secure: false,
      },
      '/static': {
        target: 'http://127.0.0.1:8004',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})