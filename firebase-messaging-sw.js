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

// 🔥 Maneja las notificaciones cuando la app está cerrada o en segundo plano
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Notificación en segundo plano:', payload);

  // Optional chaining (?) por si el payload viene sin el objeto 'notification'
  const title = payload.notification?.title || payload.data?.title || 'DR XIAOMI';
  const body = payload.notification?.body || payload.data?.body || 'Nueva actualización en el panel';

  const notificationOptions = {
    body: body,
    icon: '/imagenes/web-app-manifest-192x192.png',
    badge: '/imagenes/favicon-96x96.png',
    vibrate: [200, 100, 200],
    data: payload.data || {},
    tag: 'dr-xiaomi-notif', // Evita que se apilen 10 notificaciones iguales
    requireInteraction: false
  };

  self.registration.showNotification(title, notificationOptions);
});

// 🔥 Si el dueño toca la notificación en la pantalla de bloqueo, abre la app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Si la app ya está abierta en el navegador, la enfoca
      for (const client of clientList) {
        if (client.url.includes('/app/') && 'focus' in client) {
          return client.focus();
        }
      }
      // Si no está abierta, la abre en el panel
      if (clients.openWindow) {
        return clients.openWindow('/app/');
      }
    })
  );
});
