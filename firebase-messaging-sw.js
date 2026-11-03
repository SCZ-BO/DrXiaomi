importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyD8HfSlVivSJMyCaWVjoBCrECyCxccT6IU",
  authDomain: "dr-xiaomi.firebaseapp.com",
  projectId: "dr-xiaomi",
  storageBucket: "dr-xiaomi.firebasestorage.app",
  messagingSenderId: "1033874960016",
  appId: "1:1033874960016:web:51e1fa3ee547b2ebc17215",
  measurementId: "G-TG2E3GK7V7"
});

const messaging = firebase.messaging();

// Maneja las notificaciones cuando la app está cerrada o en segundo plano
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Notificación:', payload);
  const { title, body } = payload.notification;
  self.registration.showNotification(title, {
    body,
    icon: '/imagenes/web-app-manifest-192x192.png',
    badge: '/imagenes/favicon-96x96.png',
    vibrate: [200, 100, 200],
  });
});
