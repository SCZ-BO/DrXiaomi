/* ============================================================
   DR. XIAOMI · AUTENTICACIÓN SIMPLE CON PIN (OPTIMIZADO)
   Archivo: js/app-auth.js
   ============================================================ */

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

  const sesion = {
    usuarioId,
    nombre: usuario.nombre,
    rol: usuario.rol,
    icono: usuario.icono,
    subtitulo: usuario.subtitulo,
    fechaLogin: Date.now()
  };

  localStorage.setItem(SESION_KEY, JSON.stringify(sesion));
  console.log('✅ Login OK:', usuarioId);

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
   PROTECCIÓN DE PÁGINAS (Optimizado para velocidad)
   ============================================================ */
export function requireAuth(callback, opciones = {}) {
  const { requiereAdmin = false, redirigirA = '/login/' } = opciones;

  // 🔥 Leemos la sesión del almacenamiento local (es instantáneo)
  const sesion = getSesion();

  // Si no hay sesión, mandamos al login de inmediato
  if (!sesion) {
    console.log('🔒 Sin sesión → redirigiendo a login');
    window.location.href = redirigirA;
    return null;
  }

  // Si requiere admin y no lo es, lo devolvemos al panel
  if (requiereAdmin && sesion.rol !== 'admin') {
    console.log('🔒 No es admin → redirigiendo a /app/');
    window.location.href = '/app/';
    return null;
  }

  // 🔥 EJECUTAMOS EL CALLBACK INMEDIATAMENTE (Velocidad pura)
  // Al no esperar a Firebase ni a internet, el panel del celular
  // abrirá la pantalla de inmediato con los datos del usuario.
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
