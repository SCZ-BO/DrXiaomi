const admin = require('firebase-admin');
const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function enviarPendientes() {
  // Busca notificaciones no leídas
  const snapshot = await db.collection('notificaciones').where('leido', '==', false).get();
  
  if (snapshot.empty) {
    console.log('No hay notificaciones nuevas.');
    return;
  }

  // Busca los tokens de los administradores (el dueño)
  const usuariosSnapshot = await db.collection('usuarios').where('rol', '==', 'admin').get();
  let tokens = [];
  usuariosSnapshot.forEach(doc => {
    if (doc.data().fcmToken) tokens.push(doc.data().fcmToken);
  });

  if (tokens.length === 0) {
    console.log('No hay tokens guardados del dueño.');
    return;
  }

  // Envía cada notificación pendiente
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const payload = {
      notification: {
        title: data.titulo,
        body: data.mensaje
      }
    };

    try {
      await admin.messaging().sendToDevice(tokens, payload);
      // Marca la notificación como leída para no enviarla de nuevo
      await doc.ref.update({ leido: true });
      console.log(`Notificación enviada: ${data.titulo}`);
    } catch (error) {
      console.error('Error enviando push:', error);
    }
  }
}

enviarPendientes();
