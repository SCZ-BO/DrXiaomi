const functions = require('firebase-functions');
const admin = require('firebase-admin');

// En Firebase Functions, se inicializa solo
admin.initializeApp();

// Notificar cuando se crea un nuevo recibo
exports.notificarNuevoRecibo = functions.firestore
  .document('recibos/{reciboId}')
  .onCreate(async (snap, context) => {
    const recibo = snap.data();
    const token = await obtenerTokenAdmin();
    if (!token) return;
    await admin.messaging().send({
      notification: { 
        title: '📱 Nuevo Equipo', 
        body: `${recibo.cliente} - ${recibo.marca} ${recibo.modelo}` 
      },
      token: token
    });
  });

// Notificar cuando se crea una nueva venta
exports.notificarNuevaVenta = functions.firestore
  .document('ventas/{ventaId}')
  .onCreate(async (snap, context) => {
    const venta = snap.data();
    const token = await obtenerTokenAdmin();
    if (!token) return;
    await admin.messaging().send({
      notification: { 
        title: '💰 Nueva Venta', 
        body: `${venta.concepto} - Bs. ${venta.monto}` 
      },
      token: token
    });
  });

// Obtener el token del admin desde Firestore
async function obtenerTokenAdmin() {
  const snap = await admin.firestore().collection('usuarios').where('rol', '==', 'admin').limit(1).get();
  let token = null;
  snap.forEach(doc => { token = doc.data().fcmToken; });
  return token;
}
