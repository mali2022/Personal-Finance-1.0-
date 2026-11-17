import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import releases from './src/data/releases.json';
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        onlyExplicitManualChunks: true,
        manualChunks(id) {
          const module = id.replaceAll('\\', '/');
          if (/\/node_modules\/(?:react|react-dom|scheduler)\//.test(module)) return 'framework';
          if (module.includes('/node_modules/zrender/')) return 'chart-renderer';
          if (module.includes('/node_modules/echarts/')) return 'chart-engine';
        },
      },
    },
  },
  plugins: [
    react(),
    {
      name: 'finance-static-pwa',
      configureServer(server) {
        server.middlewares.use('/release-info.json', (_request, response) => {
          response.setHeader('Content-Type', 'application/json');
          response.setHeader('Cache-Control', 'no-store');
          response.end(JSON.stringify(releases));
        });
      },
      generateBundle: {
        order: 'post',
        handler(_options, bundle) {
          this.emitFile({ type: 'asset', fileName: 'release-info.json', source: JSON.stringify(releases) });
          const assets = Object.keys(bundle)
            .filter((name) => /\.(js|css)$/.test(name))
            .map((name) => '/' + name);
          const version = createHash('sha256')
            .update('shell-policy-2|' + assets.join('|'))
            .digest('hex')
            .slice(0, 12);
          const startup = new Set<string>();
          function includeStartup(file: string) {
            if (startup.has('/' + file)) return;
            const item = bundle[file];
            if (item?.type !== 'chunk') return;
            startup.add('/' + file);
            for (const dependency of item.imports) includeStartup(dependency);
          }
          for (const item of Object.values(bundle))
            if (item.type === 'chunk' && (item.isEntry || /\/pages\/(?:LoginPage|ReleaseNotesPage)\.tsx$/.test(item.facadeModuleId ?? '')))
              includeStartup(item.fileName);
          const urls = [
            '/',
            '/offline.html',
            '/manifest.webmanifest',
            '/icon-192.png',
            '/icon-512.png',
            '/icon-180.png',
            ...startup,
            ...assets.filter(name => name.endsWith('.css')),
          ];
          this.emitFile({
            type: 'asset',
            fileName: 'sw.js',
            source: `const CACHE='pf-shell-${version}';const RESOURCES=${JSON.stringify(urls)};const ASSETS=${JSON.stringify(assets)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(RESOURCES))));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('pf-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(async()=>await caches.match('/')||await caches.match('/offline.html')));return;}
if(RESOURCES.includes(url.pathname)||ASSETS.includes(url.pathname)){event.respondWith(caches.open(CACHE).then(async cache=>{const cached=await cache.match(event.request,{ignoreVary:true});if(cached)return cached;const response=await fetch(event.request);if(response.ok){try{await cache.put(event.request,response.clone());}catch{}}return response;}));}});`,
          });
        },
      },
    },
  ],
  server: {
    port: 5173,
    watch: {
      ignored: [
        '**/verification/**',
        '**/test-results/**',
        '**/playwright-report/**',
        '**/*.tmpdir/**',
        '**/*.tmp',
        '**/.~*',
      ],
    },
    proxy: {
      '/api': {
        target: process.env.FINANCE_API_PROXY_TARGET || 'http://127.0.0.1:5085',
        changeOrigin: false,
      },
    },
  },
});
