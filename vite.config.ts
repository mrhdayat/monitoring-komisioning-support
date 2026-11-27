import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import { VitePWA } from 'vite-plugin-pwa';

// Kode admin (dan pustaka berat Task 17–18) ke berkas `admin-*` agar mudah dikecualikan dari precache HP mekanik.
const adminChunk = (c: { name: string; facadeModuleId: string | null }) =>
  c.facadeModuleId?.includes('/src/admin/') || /xlsx|client-zip/.test(c.name) ? 'assets/admin-[name]-[hash].js' : 'assets/[name]-[hash].js';

// Layar lazy yang dibuka langsung (/admin, /cek): chunk-nya, impor statisnya, CSS, dan font diunduh bersamaan
// dengan bundle utama, bukan sesudahnya (LCP). Hanya skrip kecil di index.html; di papan tidak ada yang diunduh.
const LAZY_ROUTES: [string, string][] = [['/admin', 'admin-AdminApp-'], ['/cek', 'CekKode-']];
const lazyPreload = {
  name: 'lazy-route-preload',
  apply: 'build' as const,
  transformIndexHtml: {
    order: 'post' as const,
    handler(html: string, ctx: { bundle?: Record<string, { fileName: string; imports?: string[]; viteMetadata?: { importedCss: Set<string> } }> }) {
      const all = Object.values(ctx.bundle ?? {});
      const fonts = all.map((c) => c.fileName).filter((f) => /(inter-latin-wght|barlow-condensed-latin-[78]00)-normal-.*\.woff2$/.test(f));
      const map = Object.fromEntries(LAZY_ROUTES.map(([path, prefix]) => {
        const c = all.find((x) => x.fileName.includes(prefix) && x.fileName.endsWith('.js'));
        const files = c ? [c.fileName, ...(c.imports ?? []), ...(c.viteMetadata?.importedCss ?? []), ...fonts] : [];
        return [path, files.filter((f) => !html.includes(f)).map((f) => `/${f}`)];
      }));
      const js = `for(const[p,hs]of Object.entries(${JSON.stringify(map)}))if(location.pathname.startsWith(p))for(const h of hs){`
        + `const l=document.createElement('link');`
        + `if(h.endsWith('.js'))l.rel='modulepreload';else{l.rel='preload';l.as=h.endsWith('.css')?'style':'font';l.crossOrigin='anonymous'}`
        + `l.href=h;document.head.append(l)}`;
      return html.replace('</head>', `<script>${js}</script></head>`);
    },
  },
};

export default defineConfig({
  build: { rolldownOptions: { output: { chunkFileNames: adminChunk, assetFileNames: (a: { names: string[] }) => (a.names[0]?.startsWith('AdminApp') ? 'assets/admin-[name]-[hash][extname]' : 'assets/[name]-[hash][extname]') } } },
  plugins: [
    react(),
    lazyPreload,
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
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
