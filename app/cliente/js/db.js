// js/db.js
import { db, ensureAuth } from './firebase.js';
import {
  collection, addDoc, getDocs, getDoc, doc,
  query, where, orderBy, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ============ RECIBOS ============
export const Recibos = {
  async crear(data) {
    await ensureAuth();
    const docRef = await addDoc(collection(db, 'recibos'), {
      ...data,
      fecha: serverTimestamp(),
      estado: 'recibido'
    });
    return docRef.id;
  },

  async todos() {
    await ensureAuth();
    const q = query(collection(db, 'recibos'), orderBy('fecha', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async obtener(id) {
    await ensureAuth();
    const snap = await getDoc(doc(db, 'recibos', id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  },

  async actualizarEstado(id, estado) {
    await ensureAuth();
    await updateDoc(doc(db, 'recibos', id), {
      estado,
      actualizado: serverTimestamp()
    });
  },

  async eliminar(id) {
    await ensureAuth();
    await deleteDoc(doc(db, 'recibos', id));
  },

  // 🔥 Escucha en tiempo real: cuando el empleado crea un recibo,
  // el teléfono del jefe lo ve INSTANTÁNEAMENTE sin recargar
  escuchar(callback) {
    ensureAuth().then(() => {
      return onSnapshot(
        query(collection(db, 'recibos'), orderBy('fecha', 'desc')),
        (snapshot) => {
          const recibos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
          callback(recibos);
        },
        (err) => console.error('Error escuchando:', err)
      );
    });
  }
};

// ============ CLIENTES ============
export const Clientes = {
  async upsert(cliente) {
    await ensureAuth();
    const q = query(collection(db, 'clientes'), where('telefono', '==', cliente.telefono));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const docId = snapshot.docs[0].id;
      const existente = snapshot.docs[0].data();
      await updateDoc(doc(db, 'clientes', docId), {
        ...cliente,
        ultimaVisita: serverTimestamp(),
        visitas: (existente.visitas || 1) + 1
      });
      return docId;
    } else {
      const docRef = await addDoc(collection(db, 'clientes'), {
        ...cliente,
        ultimaVisita: serverTimestamp(),
        visitas: 1
      });
      return docRef.id;
    }
  },

  async todos() {
    await ensureAuth();
    const q = query(collection(db, 'clientes'), orderBy('ultimaVisita', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  }
};
