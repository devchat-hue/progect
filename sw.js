/* Service Worker мессенджера.
   Задача: (1) дать браузеру право показать кнопку «Установить как приложение»,
   (2) не мешать Firebase (Auth/Firestore) — эти запросы никогда не кешируются,
   (3) при обрыве сети показать что-то осмысленное вместо белого экрана.
   Само приложение всё равно работает только онлайн — сообщения без интернета
   не отправить и не прочитать. */

const CACHE = 'shell-v10'; // при следующем крупном обновлении сайта смените на v2, v3…
const SHELL = ['./', './index.html', './manifest.json'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);

  // Firebase (Auth/Firestore/gstatic) и вообще любой чужой домен — не трогаем,
  // всегда идём в сеть напрямую, без кеша.
  if (url.origin !== self.location.origin) return;

  // Главная страница: сначала пробуем сеть (чтобы всегда видеть свежую версию
  // после ваших правок), и только если сети нет — отдаём то, что закешировано.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(res => {
        caches.open(CACHE).then(c => c.put('./index.html', res.clone()));
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Статика (иконки, манифест) — сначала кеш, сеть как запасной вариант.
  e.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      caches.open(CACHE).then(c => c.put(req, res.clone()));
      return res;
    }).catch(() => cached))
  );
});
