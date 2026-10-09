/* ============================================================
   DR. XIAOMI · CONFIGURACIÓN FIREBASE
   Archivo: js/firebase.js
   Descripción: Inicializa Firebase, Auth, Firestore y Storage
   ============================================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyAZ_bLmFDWK_UTclkGeS0kShsKLGucTM4",
  authDomain: "dr-xiaomi.firebaseapp.com",
  projectId: "dr-xiaomi",
  storageBucket: "dr-xiaomi.firebasestorage.app",
  messagingSenderId: "1033874960016",
  appId: "1:1033874960016:web:51e1fa3ee547b2ebc17215",
  measurementId: "G-TG2E3GK7V7"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Exportar servicios
export const db      = getFirestore(app);
export const auth    = getAuth(app);
export const storage = getStorage(app);
export { app };

console.log('🔥 Firebase inicializado:', firebaseConfig.projectId);
