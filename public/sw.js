/* Mundo Aberto X — service worker (offline-first)
   Estratégia:
   - Cache-first para o shell (/, index.html) e assets imutáveis (/assets/*, /engine.js, ícones, manifest)
   - Navegações offline caem no shell em cache
   - Sem runtime caching de APIs externas (não usamos nenhuma)
   Versão bumped manualmente quando o shell mudar */
const VERSAO = 'mun-x-v10.3'; // atualizar sempre que o shell/engine mudar (quebra cache dos visitantes antigos)
const SHELL = `${VERSAO}-shell`;
const IMUTAVEIS = `${VERSAO}-assets`;

const SHELL_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSAO)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Assets com hash / motor / ícones: cache-first (imutáveis na prática)
  const imutavel = url.pathname.startsWith('/assets/')
    || url.pathname === '/engine.js'
    || url.pathname.startsWith('/icon-');

  if (imutavel) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copia = res.clone();
        caches.open(IMUTAVEIS).then((c) => c.put(req, copia));
        return res;
      }))
    );
    return;
  }

  // Navegações e o resto: rede primeiro, cai no shell offline
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (req.mode === 'navigate' && res.ok) {
          const copia = res.clone();
          caches.open(SHELL).then((c) => c.put('/', copia));
        }
        return res;
      })
      .catch(() => caches.match('/'))
  );
});
