/**
 * service-worker.js — PWA: cache-first con fallback a red
 */

const CACHE_NAME = 'wordle-es-v1';

const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/game.js',
  '/multiplayer.js',
  '/discord.js',
  '/supabase.js',
  '/words.js',
  '/stats.js',
  '/manifest.json'
];

// Instalar — cachear assets estáticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activar — limpiar caches antiguos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch — cache first, network fallback
self.addEventListener('fetch', (event) => {
  // No cachear peticiones a Supabase u otras APIs
  if (event.request.url.includes('supabase') ||
      event.request.url.includes('discord.com') ||
      event.request.url.includes('api') ||
      event.request.url.includes('cdn.jsdelivr.net')) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          // Cachear nuevas peticiones GET exitosas
          if (response.ok && event.request.method === 'GET') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
      .catch(() => {
        // Offline fallback
        if (event.request.destination === 'document') {
          return caches.match('/index.html');
        }
      })
  );
});
