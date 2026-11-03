const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Inicializar el SDK de Admin con la clave que acabas de descargar
admin.initializeApp({
  credential: admin.credential.cert(require('./serviceAccountKey.json')) // 🔥 Pon aquí el nombre de tu archivo .json
});

// Escuchar cuando se crea un nuevo recibo
exports.notificarNuevoRecibo = functions.firestore
  .document('recibos/{reciboId}')
  .onCreate(async (snap, context) => {
    const recibo = snap.data();
    const adminToken = await obtenerTokenAdmin();
    
    if (adminToken) {
      const message = {
        notification: {
          title: '📱 Nuevo Equipo Recibido',
          body: `${recibo.cliente} - ${recibo.marca} ${recibo.modelo}`,
        },
        token: adminToken,
      };
      await admin.messaging().send(message);
    }
  });

// Escuchar cuando se crea una nueva venta
exports.notificarNuevaVenta = functions.firestore
  .document('ventas/{ventaId}')
  .onCreate(async (snap, context) => {
    const venta = snap.data();
    const adminToken = await obtenerTokenAdmin();
    
    if (adminToken) {
      const message = {
        notification: {
          title: '💰 Nueva Venta',
          body: `${venta.concepto} - Bs. ${venta.monto}`,
        },
        token: adminToken,
      };
      await admin.messaging().send(message);
    }
  });

// Obtener el token del admin desde Firestore
async function obtenerTokenAdmin() {
  const usuariosSnapshot = await admin.firestore().collection('usuarios').where('rol', '==', 'admin').get();
  let token = null;
  usuariosSnapshot.forEach(doc => {
    const data = doc.data();
    if (data.fcmToken) token = data.fcmToken;
  });
  return token;
}
