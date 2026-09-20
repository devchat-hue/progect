/* =============================================================================
   Shadow — облачные функции для push-уведомлений и звонков.

   Зачем это отдельно от index.html: пока вкладка/браузер открыты, приложение
   само следит за новыми сообщениями и звонками через onSnapshot (см. enter()
   и watchCalls() в index.html) — этого достаточно для тостов и звука.
   Но показать системное уведомление, когда вкладка ЗАКРЫТА или телефон
   заблокирован, может только push, а push должен кто-то ОТПРАВИТЬ. Firestore
   сам этого не делает — нужен именно этот код, выполняющийся на сервере
   Firebase при появлении нового документа.

   Что тут происходит:
   - onNewMessage: срабатывает на каждое новое сообщение в любом чате.
     Находит получателей (все участники чата, кроме автора), достаёт их
     сохранённые токены устройств (users/<username>/priv/push) и шлёт push.
   - onCallRinging: срабатывает, когда кто-то создаёт документ звонка со
     статусом "ringing", и сразу шлёт получателю push с высоким приоритетом
     и кнопками «Ответить» / «Отклонить».
   - Невалидные/просроченные токены (человек удалил приложение, отозвал
     разрешение и т.п.) автоматически вычищаются из базы.

   Деплой — см. functions/README.md рядом с этим файлом.
   ========================================================================= */

const {onDocumentCreated} = require('firebase-functions/v2/firestore');
const {setGlobalOptions} = require('firebase-functions/v2');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();

// Функции живут в одном регионе — выберите ближайший к вашим пользователям,
// если нужно (europe-west1 для Европы и т.п.); us-central1 работает везде,
// просто с чуть большей задержкой.
setGlobalOptions({region: 'us-central1', maxInstances: 20});

async function tokensFor(username) {
  try {
    const snap = await db.doc(`users/${username}/priv/push`).get();
    if (!snap.exists) return [];
    const list = snap.data().tokens;
    return Array.isArray(list) ? list : [];
  } catch (e) {
    logger.warn('tokensFor failed', username, e.message);
    return [];
  }
}

async function pruneTokens(username, bad) {
  if (!bad.length) return;
  try {
    await db.doc(`users/${username}/priv/push`).update({
      tokens: admin.firestore.FieldValue.arrayRemove(...bad),
    });
  } catch (e) { /* документа может уже не быть — не страшно */ }
}

/* Данные во FCM data-payload обязаны быть строками — приводим всё к String. */
function toStringMap(obj) {
  const out = {};
  for (const k in obj) if (obj[k] != null) out[k] = String(obj[k]);
  return out;
}

async function sendToUser(username, payload, opts = {}) {
  const tokens = await tokensFor(username);
  if (!tokens.length) return;

  const message = {
    tokens,
    data: toStringMap(payload),
    webpush: {
      headers: {
        Urgency: opts.urgent ? 'high' : 'normal',
        TTL: String(opts.ttl ?? 86400),
      },
    },
    android: {priority: opts.urgent ? 'high' : 'normal'},
    apns: {headers: {'apns-priority': opts.urgent ? '10' : '5'}},
  };

  const res = await messaging.sendEachForMulticast(message);
  const bad = [];
  res.responses.forEach((r, i) => {
    if (!r.success) {
      const code = r.error && r.error.code;
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token' ||
        code === 'messaging/invalid-argument'
      ) bad.push(tokens[i]);
    }
  });
  await pruneTokens(username, bad);
}

/* ---------- новое сообщение в любом чате (личка / группа / канал) ---------- */
exports.onNewMessage = onDocumentCreated(
  'chats/{chatId}/messages/{messageId}',
  async (event) => {
    const msg = event.data && event.data.data();
    if (!msg || !msg.from) return;
    const {chatId} = event.params;

    const chatSnap = await db.doc(`chats/${chatId}`).get();
    if (!chatSnap.exists) return;
    const chat = chatSnap.data();

    const recipients = (chat.members || []).filter((m) => m !== msg.from);
    if (!recipients.length) return;

    const senderSnap = await db.doc(`users/${msg.from}`).get();
    const senderName = (senderSnap.exists && senderSnap.data().name) || msg.from;
    const isGroup = chat.type === 'group' || chat.type === 'channel';

    const bodyByType = {
      voice: '🎤 Голосовое сообщение',
      circle: '🎬 Видеосообщение',
      image: '🖼 Фото',
      video: '🎬 Видео',
      file: '📄 Файл',
    };
    const body = bodyByType[msg.type] || (msg.text ? String(msg.text).slice(0, 140) : 'Новое сообщение');
    const title = isGroup ? `${chat.title} · ${senderName}` : senderName;

    await Promise.all(recipients.map((u) => sendToUser(u, {
      type: 'message',
      chatId,
      title,
      body,
      icon: 'icons/icon-192.png',
    })));
  }
);

/* ---------- новый звонок (документ calls/<id> в статусе "ringing") ---------- */
exports.onCallRinging = onDocumentCreated('calls/{callId}', async (event) => {
  const call = event.data && event.data.data();
  if (!call || call.state !== 'ringing' || !call.to || !call.from) return;
  const {callId} = event.params;

  const fromSnap = await db.doc(`users/${call.from}`).get();
  const fromName = (fromSnap.exists && fromSnap.data().name) || call.from;

  await sendToUser(call.to, {
    type: 'call',
    callId,
    title: fromName,
    body: call.type === 'video' ? '🎥 Видеозвонок' : '📞 Аудиозвонок',
    icon: 'icons/icon-192.png',
  }, {urgent: true, ttl: 30}); // TTL маленький: звонок, на который никто не ответил, не нужен через минуту
});
