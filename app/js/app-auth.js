/* ============================================================
   DR. XIAOMI · AUTENTICACIÓN SIMPLE CON PIN (CONECTADO A FIREBASE)
   Archivo: js/app-auth.js
   ============================================================ */

// 🔥 IMPORTS DE FIREBASE
import { auth } from '/js/firebase.js';
import { signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const USUARIOS = {
  admin: {
    pin: '2011xiaomi',
    nombre: 'Admin',
    rol: 'admin',
    icono: '👑',
    subtitulo: 'Dueño'
  },
  tecnico: {
    pin: '321xiaomi',
    nombre: 'Técnico',
    rol: 'tecnico',
    icono: '👨‍🔧',
    subtitulo: 'Taller'
  }
};

const SESION_KEY = 'drx_sesion';

/* ============================================================
   LOGIN
   ============================================================ */
export function login(usuarioId, pin) {
  const usuario = USUARIOS[usuarioId];
  if (!usuario) return { success: false, error: 'Usuario no encontrado' };
  if (!pin || pin.trim().length === 0) return { success: false, error: 'Ingresa tu clave' };
  if (pin !== usuario.pin) return { success: false, error: 'Clave incorrecta' };

  // 🔥 CONECTAR CON FIREBASE AUTH (Para que las reglas de Firestore nos dejen pasar)
  signInAnonymously(auth)
    .then(() => {
      console.log('✅ Firebase Auth: Token anónimo generado correctamente');
    })
    .catch((error) => {
      console.error('⚠️ Error en Firebase Auth (Revisa que el login anónimo esté activo):', error);
    });

  const sesion = {
    usuarioId,
    nombre: usuario.nombre,
    rol: usuario.rol,
    icono: usuario.icono,
    subtitulo: usuario.subtitulo,
    fechaLogin: Date.now()
  };

  localStorage.setItem(SESION_KEY, JSON.stringify(sesion));
  console.log('✅ Login Local OK:', usuarioId);

  return { success: true, usuario: sesion };
}

/* ============================================================
   LOGOUT
   ============================================================ */
export function logout(redirectTo = '/login/') {
  localStorage.removeItem(SESION_KEY);
  console.log('👋 Sesión cerrada');
  if (redirectTo) window.location.href = redirectTo;
}

/* ============================================================
   SESIÓN ACTUAL (Lector rápido)
   ============================================================ */
export function getSesion() {
  try {
    const raw = localStorage.getItem(SESION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.error('Error leyendo sesión:', error);
    return null;
  }
}

export function esAdmin() {
  const sesion = getSesion();
  return sesion?.rol === 'admin';
}

export function esTecnico() {
  const sesion = getSesion();
  return sesion?.rol === 'tecnico';
}

export function getPerfiles() {
  return Object.entries(USUARIOS).map(([id, u]) => ({
    id, nombre: u.nombre, subtitulo: u.subtitulo, icono: u.icono, rol: u.rol
  }));
}

/* ============================================================
   PROTECCIÓN DE PÁGINAS
   ============================================================ */
export function requireAuth(callback, opciones = {}) {
  const { requiereAdmin = false, redirigirA = '/login/' } = opciones;

  const sesion = getSesion();

  if (!sesion) {
    console.log('🔒 Sin sesión → redirigiendo a login');
    window.location.href = redirigirA;
    return null;
  }

  if (requiereAdmin && sesion.rol !== 'admin') {
    console.log('🔒 No es admin → redirigiendo a /app/');
    window.location.href = '/app/';
    return null;
  }

  // 🔥 IMPORTANTE: Si recargamos la página (F5) y ya había sesión, 
  // nos aseguramos de que Firebase vuelva a generar el token por si se perdió.
  if (!auth.currentUser) {
    signInAnonymously(auth).catch(e => console.log("Reconectando a Firebase..."));
  }

  if (typeof callback === 'function') {
    callback(sesion);
  }

  return sesion;
}

/* ============================================================
   HELPERS
   ============================================================ */
export function redirigirSegunRol() {
  const sesion = getSesion();
  if (!sesion) {
    window.location.href = '/login/';
    return;
  }
  window.location.href = '/app/';
}
