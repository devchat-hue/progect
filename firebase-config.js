window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyAnZPBsvzguQGhYuIHDilmxGiTFN81SXiQ",
  authDomain: "chat2-3f11a.firebaseapp.com",
  projectId: "chat2-3f11a",
  storageBucket: "chat2-3f11a.firebasestorage.app",
  messagingSenderId: "583875578310",
  appId: "1:583875578310:web:cf4899e519ebe5cd394ac7"
};

/* Ключ для push-уведомлений (Web Push / FCM).
   Firebase Console → Project settings → Cloud Messaging → вкладка
   "Web configuration" → "Web Push certificates" → Generate key pair.
   Скопируйте строку ("public key") сюда. Без неё вкладки #nt/enablePush()
   в приложении просто ничего не будут делать — push работать не будет. */
window.FIREBASE_VAPID_KEY = "";
