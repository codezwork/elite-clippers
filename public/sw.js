const CACHE_NAME = 'elite-clipper-cache-v1';

// Install Event
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate Event
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Fetch Event - Basic Network First Strategy
self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests, like those for Firebase API, Google Fonts, etc.
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }
  
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});
