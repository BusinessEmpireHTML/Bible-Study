// Service worker: makes the app installable and usable offline.
// - App files: served from cache, refreshed in the background.
// - Bible API: network first, falling back to the last saved copy (so chapters you've read work offline).
const VERSION = 'v1';
const SHELL_CACHE = `shell-${VERSION}`;
const API_CACHE = `api-${VERSION}`;
const API_CACHE_LIMIT = 400;

const SHELL_FILES = [
    './',
    'index.html',
    'css/app.css',
    'js/data.js',
    'js/text.js',
    'js/storage.js',
    'js/api.js',
    'js/app.js',
    'universalBookMap.json',
    'manifest.webmanifest',
    'icons/icon.svg',
    'icons/icon-192.png',
    'icons/icon-512.png'
];
const TAILWIND = 'https://cdn.tailwindcss.com/3.4.17';

self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(SHELL_CACHE);
        await cache.addAll(SHELL_FILES);
        try { await cache.add(new Request(TAILWIND, { mode: 'no-cors' })); } catch (e) { /* cached on first use instead */ }
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const keep = [SHELL_CACHE, API_CACHE];
        for (const key of await caches.keys()) {
            if (!keep.includes(key)) await caches.delete(key);
        }
        await self.clients.claim();
    })());
});

async function trimCache(cacheName, limit) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    for (let i = 0; i < keys.length - limit; i++) await cache.delete(keys[i]);
}

async function networkFirst(request) {
    const cache = await caches.open(API_CACHE);
    try {
        const response = await fetch(request);
        if (response.ok) {
            await cache.put(request, response.clone());
            trimCache(API_CACHE, API_CACHE_LIMIT);
        }
        return response;
    } catch (e) {
        const cached = await cache.match(request);
        if (cached) return cached;
        throw e;
    }
}

async function staleWhileRevalidate(request, cacheKey = request) {
    const cache = await caches.open(SHELL_CACHE);
    const cached = await cache.match(cacheKey, { ignoreSearch: true });
    const update = fetch(request).then(response => {
        if (response.ok || response.type === 'opaque') cache.put(cacheKey, response.clone());
        return response;
    }).catch(() => null);
    if (cached) return cached;
    const fresh = await update;
    return fresh || Response.error();
}

self.addEventListener('fetch', event => {
    const { request } = event;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);

    if (url.origin === self.location.origin && url.pathname.startsWith('/.netlify/functions/')) {
        event.respondWith(networkFirst(request));
        return;
    }
    if (request.mode === 'navigate' && url.origin === self.location.origin) {
        // Hash routing: every page is index.html.
        event.respondWith(staleWhileRevalidate(request, 'index.html'));
        return;
    }
    if (url.origin === self.location.origin || url.href.startsWith(TAILWIND)) {
        event.respondWith(staleWhileRevalidate(request));
    }
});
