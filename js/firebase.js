/* ============================================================
   DR. XIAOMI · CONFIGURACIÓN FIREBASE (RÁPIDA Y SEGURA)
   Archivo: js/firebase.js
   ============================================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
  initializeFirestore, 
  memoryLocalCache 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
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

const app = initializeApp(firebaseConfig);

// 🔥 Usamos memoria caché en lugar de disco para que sea instantáneo
export const db = initializeFirestore(app, {
  localCache: memoryLocalCache()
});

export const storage = getStorage(app);

export { app };

console.log('🔥 Firebase inicializado (Modo Seguro con PIN):', firebaseConfig.projectId);
