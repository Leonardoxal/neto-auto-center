import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'NETO AUTO CENTER — Gestão Operacional',
        short_name: 'NETO',
        description: 'Gestão de pátio, orçamentos, faturamento e relatórios da NETO AUTO CENTER',
        lang: 'pt-BR',
        start_url: '/',
        display: 'standalone',
        background_color: '#0C0C0E',
        theme_color: '#D3242A',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: { navigateFallback: '/index.html', globPatterns: ['**/*.{js,css,html,svg,png}'] }
    })
  ],
  test: { environment: 'node' }
} as any)
