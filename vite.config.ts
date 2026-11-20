import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    cloudflare(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,woff2}'], // font watermark ikut agar render offline tetap jalan
        // SW tidak pernah merender (render:false): modul watermark (DOM/canvas + font) diganti modul kosong.
        buildPlugins: { vite: [{ name: 'sw-tanpa-watermark', load: (id) => (id.endsWith('/src/lib/watermark.ts') ? 'export {}' : null) }] },
      },
      manifest: {
        name: 'Komisioning', short_name: 'Komisioning', display: 'standalone', lang: 'id',
        theme_color: '#F2F2F7', background_color: '#F2F2F7',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
});
