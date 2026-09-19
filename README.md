# Анонимный мессенджер — деплой на GitHub Pages

GitHub Pages — статический хостинг, серверов там нет. Поэтому сообщения хранит бесплатный Firebase (Firestore), а страница лежит на GitHub.

## 1. Firebase (5 минут)
1. https://console.firebase.google.com → **Add project** (аналитику можно отключить).
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable** (только первый переключатель, «Email link» не нужен).
3. **Build → Firestore Database → Create database** (режим production, любой регион).
4. Вкладка **Rules** → вставьте содержимое `firestore.rules` → **Publish**.
5. **Project settings (⚙) → Your apps → значок `</>` (Web)** → зарегистрируйте приложение → скопируйте `firebaseConfig` в файл `firebase-config.js`.

## 2. GitHub Pages
1. Создайте репозиторий (Public), загрузите файлы `index.html`, `firebase-config.js` (`firestore.rules` и `README.md` можно тоже).
2. **Settings → Pages → Deploy from a branch → main / (root) → Save.**
3. Через минуту сайт откроется на `https://ВАШ_НИК.github.io/ИМЯ_РЕПО/`.

## 3. Важно: разрешить домен
Firebase → **Authentication → Settings → Authorized domains → Add domain** → `ВАШ_НИК.github.io`. Без этого вход и регистрация не сработают.

## Заметки
- `apiKey` в конфиге публичный по дизайну Firebase; доступ защищают правила из `firestore.rules`.
- Ник занимается транзакцией; правила не дают создать занятый ник, писать от чужого имени или читать чужие чаты.
- Бесплатный тариф Spark: ~50 тыс. чтений и 20 тыс. записей в сутки — хватит для небольшой компании.
- Вход по @нику и паролю, работает с любого устройства. Настоящая почта не нужна: внутри ник превращается в служебный адрес `ник@messenger.app`. Из-за этого **восстановить забытый пароль нельзя** — пароль можно только сменить в Настройках, пока вы в аккаунте.
- Данные хранятся у Google и не зашифрованы end-to-end.
- Уведомления работают, пока вкладка открыта (фоновый push потребует Service Worker + FCM).
