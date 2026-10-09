/* ============================================================
   DR. XIAOMI · AUTENTICACIÓN
   Archivo: js/app-auth.js
   Descripción: Login, logout, protección de rutas, perfiles
   ============================================================ */

import { auth, db } from './firebase.js';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, collection, getDocs, query, orderBy, where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ============================================================
   LOGIN / LOGOUT
   ============================================================ */

/**
 * Inicia sesión con email y contraseña
 * @param {string} email - email interno (ej: admin@drxiaomi.local)
 * @param {string} password - contraseña del usuario
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function login(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    console.log('✅ Login OK:', userCredential.user.uid);
    return { success: true };
  } catch (error) {
    console.error('❌ Error login:', error.code, error.message);
    return {
      success: false,
      error: traducirError(error.code)
    };
  }
}

/**
 * Traduce errores de Firebase a español
 */
function traducirError(code) {
  const errores = {
    'auth/invalid-email':         'Email inválido',
    'auth/user-disabled':         'Usuario desactivado',
    'auth/user-not-found':        'Usuario no encontrado',
    'auth/wrong-password':        'Contraseña incorrecta',
    'auth/invalid-credential':    'Usuario o contraseña incorrectos',
    'auth/too-many-requests':     'Demasiados intentos. Espera un momento.',
    'auth/network-request-failed':'Sin conexión a internet',
    'auth/invalid-login-credentials': 'Usuario o contraseña incorrectos'
  };
  return errores[code] || 'Error al iniciar sesión. Intenta de nuevo.';
}

/**
 * Cierra la sesión actual y redirige al login
 */
export async function logout(redirectTo = '/login/') {
  try {
    await signOut(auth);
    console.log('👋 Sesión cerrada');
    if (redirectTo) {
      window.location.href = redirectTo;
    }
  } catch (error) {
    console.error('❌ Error cerrando sesión:', error);
  }
}

/* ============================================================
   PERFILES (para la pantalla de login)
   ============================================================ */

/**
 * Obtiene todos los perfiles activos de Firestore
 * @returns {Promise<Array>} array de perfiles ordenados
 */
export async function getPerfiles() {
  try {
    const q = query(
      collection(db, 'perfiles'),
      where('activo', '==', true),
      orderBy('orden', 'asc')
    );
    const snapshot = await getDocs(q);
    const perfiles = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    console.log(`📋 ${perfiles.length} perfiles cargados`);
    return perfiles;
  } catch (error) {
    console.error('❌ Error cargando perfiles:', error);
    return [];
  }
}

/* ============================================================
   USUARIO ACTUAL
   ============================================================ */

/**
 * Obtiene los datos del usuario logueado (uid + rol + nombre)
 * @returns {Promise<Object|null>}
 */
export async function getUsuarioActual() {
  const user = auth.currentUser;
  if (!user) return null;

  try {
    const userDoc = await getDoc(doc(db, 'usuarios', user.uid));
    if (!userDoc.exists()) {
      console.warn('⚠️ Usuario sin documento en Firestore');
      return {
        uid: user.uid,
        email: user.email,
        nombre: 'Usuario',
        rol: 'tecnico'
      };
    }
    return {
      uid: user.uid,
      email: user.email,
      ...userDoc.data()
    };
  } catch (error) {
    console.error('❌ Error obteniendo usuario:', error);
    return null;
  }
}

/**
 * Verifica si el usuario actual es admin
 */
export async function esAdmin() {
  const usuario = await getUsuarioActual();
  return usuario?.rol === 'admin';
}

/* ============================================================
   PROTECCIÓN DE RUTAS
   ============================================================ */

/**
 * Espera a que Firebase Auth esté listo y devuelve el usuario.
 * Útil para usar en páginas protegidas.
 * @returns {Promise<Object|null>}
 */
export function esperarAuth() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

/**
 * Protege una página: si no hay sesión, redirige al login.
 * Si hay sesión, llama al callback con los datos del usuario.
 * @param {Function} callback - función a ejecutar si está autenticado
 * @param {Object} opciones - { requiereAdmin: boolean, redirigirA: string }
 */
export async function requireAuth(callback, opciones = {}) {
  const { requiereAdmin = false, redirigirA = '/login/' } = opciones;

  // Esperar a que Firebase Auth esté listo
  await esperarAuth();

  const user = auth.currentUser;

  // Si no hay sesión, redirigir al login
  if (!user) {
    console.log('🔒 Sin sesión → redirigiendo a login');
    window.location.href = redirigirA;
    return null;
  }

  // Obtener datos del usuario
  const usuario = await getUsuarioActual();

  // Verificar si es admin cuando se requiere
  if (requiereAdmin && usuario?.rol !== 'admin') {
    console.log('🔒 No es admin → redirigiendo a /app/');
    window.location.href = '/app/';
    return null;
  }

  // Todo OK, ejecutar callback
  if (typeof callback === 'function') {
    callback(usuario);
  }

  return usuario;
}

/* ============================================================
   HELPERS PARA REDIRIGIR SEGÚN ROL
   ============================================================ */

/**
 * Redirige al usuario según su rol después del login
 */
export async function redirigirSegunRol() {
  const usuario = await getUsuarioActual();
  if (!usuario) {
    window.location.href = '/login/';
    return;
  }
  // Todos van al panel principal (el panel se adapta al rol)
  window.location.href = '/app/';
}

/**
 * Observa cambios de sesión (útil para detectar cierre de sesión)
 * @param {Function} callback - (user) => {}
 */
export function onSesionCambia(callback) {
  return onAuthStateChanged(auth, callback);
}
