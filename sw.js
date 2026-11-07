'use strict';
const CACHE = 'solo-life-v017-20261107-1';
const ASSETS = ['./season.css?v=0.17.0', './season.js?v=0.17.0', './season-ui.js?v=0.17.0', './training.css?v=0.17.0', './training.js?v=0.17.0', './training-ui.js?v=0.17.0', './', './index.html', './app.css?v=0.17.0', './journey.css?v=0.17.0', './habits.js?v=0.17.0', './difficulty.js?v=0.17.0', './difficulty-ui.js?v=0.17.0', './journey.js?v=0.17.0', './journey-ui.js?v=0.17.0', './progress.js?v=0.17.0', './planner.js?v=0.17.0', './app.js?v=0.17.0', './reminders.js?v=0.17.0', './push-config.json?v=0.17.0', './manifest.webmanifest', './blue-flame.webp', './icon.svg', './icon-180.png', './icon-192.png', './icon-512.png'];
const scope = new URL(self.registration.scope);
const assetUrls = new Set(ASSETS.map(path => new URL(path, scope).href));
self.addEventListener('push', event => {
  event.waitUntil(self.registration.showNotification('SOLO LIFE · 今日のクエスト', {
    body:'今日の達成はまだです。1分の緊急クエストから始められます。',
    tag:'solo-life-daily-reminder',icon:new URL('./icon-192.png',scope).href
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({type:'window'});
    const existing = windows.find(client => client.url.startsWith(scope.href));
    if (existing) { await existing.focus(); existing.postMessage({type:'SHOW_TODAY'}); }
    else await self.clients.openWindow(new URL('./index.html#todayBoard',scope).href);
  })());
});
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(path => new Request(new URL(path, scope), { cache: 'reload' })))));
});
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('solo-life-') && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  const navigation = event.request.mode === 'navigate' && (url.pathname === scope.pathname || url.pathname === scope.pathname + 'index.html');
  if (!navigation && !assetUrls.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = navigation ? new URL('./index.html', scope).href : event.request;
    try {
      const response = await fetch(event.request, { cache: 'no-cache' });
      if (!response.ok) throw new Error('Offline fallback');
      try { await cache.put(key, response.clone()); } catch { /* Storage may be full. */ }
      return response;
    } catch {
      return (await cache.match(key)) || new Response('オフラインです。接続後にもう一度開いてください。', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
