/* Service Worker мессенджера.
   Задача: (1) дать браузеру право показать кнопку «Установить как приложение»,
   (2) не мешать Firebase (Auth/Firestore) — эти запросы никогда не кешируются,
   (3) при обрыве сети показать что-то осмысленное вместо белого экрана.
   Само приложение всё равно работает только онлайн — сообщения без интернета
   не отправить и не прочитать. */

const CACHE = 'shell-v11'; // при следующем крупном обновлении сайта смените на v2, v3…
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

/* =============================================================================
   PUSH-УВЕДОМЛЕНИЯ
   Сюда прилетает то, что отправила облачная функция (functions/index.js) через
   Firebase Cloud Messaging, когда вкладка/браузер закрыты. Payload — простой
   JSON в поле data (мы намеренно не используем ключ "notification" в FCM,
   чтобы самим полностью управлять видом уведомления: иконкой, картинкой,
   вибрацией и кнопками, а не отдавать это на откуп браузеру по умолчанию).
   ============================================================================= */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { try { d = { body: e.data.text() }; } catch (e2) {} }

  const isCall = d.type === 'call';
  const title = d.title || 'Shadow';
  const options = {
    body: d.body || '',
    icon: d.icon || 'icons/icon-192.png',       // иконка приложения слева
    badge: 'icons/icon-96.png',                 // монохромная иконка в статус-баре (Android)
    image: d.image || undefined,                // крупная картинка-превью (если сервер её передал — см. функцию ниже)
    tag: d.tag || (isCall ? 'call-' + (d.callId || '') : 'msg-' + (d.chatId || Date.now())),
    renotify: true,
    requireInteraction: isCall,                 // звонок не должен пропасть сам по себе
    vibrate: isCall ? [400, 250, 400, 250, 400] : [200, 100, 200],
    silent: false,                               // системный звук уведомления/вибро
    data: d,
    actions: isCall
      ? [{ action: 'answer', title: '📞 Ответить' }, { action: 'decline', title: '✖ Отклонить' }]
      : []
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', e => {
  const d = e.notification.data || {};
  e.notification.close();
  if (d.type === 'call' && e.action === 'decline') {
    // отклонить звонок можно прямо из уведомления, не открывая приложение —
    // просто помечаем звонок отклонённым через Firestore REST одним запросом
    // тут недоступен (нет авторизации сервис-воркера), поэтому открываем
    // приложение — оно тут же покажет входящий вызов, который можно отклонить.
  }
  const target = './' + (d.chatId ? ('#chat=' + d.chatId) : '');
  e.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) {
        await c.focus();
        c.postMessage({ type: 'open-chat', chatId: d.chatId, callId: d.callId, action: e.action });
        return;
      }
    }
    if (clients.openWindow) await clients.openWindow(target);
  })());
});
