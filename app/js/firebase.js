/* ============================================================
   DR. XIAOMI · CONFIGURACIÓN FIREBASE
   Archivo: js/firebase.js
   ============================================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyD8HfSlVivSJMyCaWVjoBCrECyCxccT6IU", 
  authDomain: "dr-xiaomi.firebaseapp.com",
  projectId: "dr-xiaomi",
  storageBucket: "dr-xiaomi.firebasestorage.app",
  messagingSenderId: "1033874960016",
  appId: "1:1033874960016:web:51e1fa3ee547b2ebc17215",
  measurementId: "G-TG2E3GK7V7"
};

const app = initializeApp(firebaseConfig);

// 🔥 Usamos getFirestore estándar para evitar el error de doble inicialización
export const db = getFirestore(app);

export const auth = getAuth(app);
export const storage = getStorage(app);

export { app };

console.log('🔥 Firebase inicializado:', firebaseConfig.projectId);
