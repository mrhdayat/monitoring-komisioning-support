import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import { VitePWA } from 'vite-plugin-pwa';

// Kode admin (dan pustaka berat Task 17–18) ke berkas `admin-*` agar mudah dikecualikan dari precache HP mekanik.
const adminChunk = (c: { name: string; facadeModuleId: string | null }) =>
  c.facadeModuleId?.includes('/src/admin/') || /xlsx|client-zip/.test(c.name) ? 'assets/admin-[name]-[hash].js' : 'assets/[name]-[hash].js';

export default defineConfig({
  build: { rolldownOptions: { output: { chunkFileNames: adminChunk, assetFileNames: (a: { names: string[] }) => (a.names[0]?.startsWith('AdminApp') ? 'assets/admin-[name]-[hash][extname]' : 'assets/[name]-[hash][extname]') } } },
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
        globIgnores: ['**/admin-*', '**/*xlsx*', '**/*client-zip*'], // admin dan pustaka beratnya tidak di-precache di HP mekanik
        // SW tidak pernah merender (render:false): modul watermark (DOM/canvas + font) diganti modul kosong.
        buildPlugins: { vite: [{ name: 'sw-tanpa-watermark', load: (id) => (id.endsWith('/src/lib/watermark.ts') ? 'export {}' : null) }] },
      },
      manifest: {
        name: 'Komisioning', short_name: 'Komisioning', display: 'standalone', lang: 'id',
        theme_color: '#141414', background_color: '#EDEBE4',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
});
