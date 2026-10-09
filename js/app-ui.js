/* ============================================================
   DR. XIAOMI · UI HELPERS
   Archivo: js/app-ui.js
   Descripción: Toasts, loaders, formateo, helpers de UI
   ============================================================ */

/* ============================================================
   TOASTS
   ============================================================ */

let toastContainer = null;

function crearToastContainer() {
  if (toastContainer) return toastContainer;
  toastContainer = document.createElement('div');
  toastContainer.className = 'toast-container';
  toastContainer.id = 'toastContainer';
  document.body.appendChild(toastContainer);
  return toastContainer;
}

/**
 * Muestra un toast
 * @param {string} mensaje - texto del toast
 * @param {string} tipo - 'success' | 'error' | 'warning' | 'info'
 * @param {number} duracion - ms antes de desaparecer (default 3000)
 */
export function toast(mensaje, tipo = 'info', duracion = 3000) {
  const container = crearToastContainer();
  const iconos = {
    success: 'fa-circle-check',
    error:   'fa-circle-xmark',
    warning: 'fa-triangle-exclamation',
    info:    'fa-circle-info'
  };

  const el = document.createElement('div');
  el.className = `toast toast-${tipo}`;
  el.innerHTML = `
    <i class="fas ${iconos[tipo] || iconos.info}"></i>
    <span>${mensaje}</span>
  `;

  container.appendChild(el);

  // Animar entrada
  requestAnimationFrame(() => el.classList.add('show'));

  // Auto-cerrar
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, duracion);
}

/* ============================================================
   LOADING OVERLAY
   ============================================================ */

let loadingEl = null;

function crearLoading() {
  if (loadingEl) return loadingEl;
  loadingEl = document.createElement('div');
  loadingEl.className = 'loading-overlay';
  loadingEl.id = 'loadingOverlay';
  loadingEl.innerHTML = `
    <div class="loading-card">
      <div class="spinner"></div>
      <p id="loadingText">Cargando...</p>
    </div>
  `;
  document.body.appendChild(loadingEl);
  return loadingEl;
}

/**
 * Muestra el overlay de carga
 */
export function showLoading(texto = 'Cargando...') {
  const el = crearLoading();
  const txt = el.querySelector('#loadingText');
  if (txt) txt.textContent = texto;
  el.classList.add('show');
}

/**
 * Oculta el overlay de carga
 */
export function hideLoading() {
  if (loadingEl) loadingEl.classList.remove('show');
}

/* ============================================================
   CONFIRMACIÓN (modal)
   ============================================================ */

/**
 * Muestra un modal de confirmación
 * @param {Object} opciones - { titulo, mensaje, textoConfirmar, textoCancelar, peligro }
 * @returns {Promise<boolean>}
 */
export function confirmar(opciones = {}) {
  const {
    titulo = '¿Estás seguro?',
    mensaje = '',
    textoConfirmar = 'Confirmar',
    textoCancelar = 'Cancelar',
    peligro = false
  } = opciones;

  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal">
        <h3 class="modal-title">${titulo}</h3>
        ${mensaje ? `<p class="modal-text">${mensaje}</p>` : ''}
        <div class="modal-actions">
          <button class="btn btn-secondary" data-action="cancel">${textoCancelar}</button>
          <button class="btn ${peligro ? 'btn-danger' : 'btn-primary'}" data-action="confirm">${textoConfirmar}</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add('show'));

    backdrop.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action === 'confirm') {
        cerrar(true);
      } else if (action === 'cancel' || e.target === backdrop) {
        cerrar(false);
      }
    });

    function cerrar(resultado) {
      backdrop.classList.remove('show');
      setTimeout(() => {
        backdrop.remove();
        resolve(resultado);
      }, 250);
    }
  });
}

/* ============================================================
   BOTTOM SHEET
   ============================================================ */

let currentSheet = null;

/**
 * Abre un bottom sheet con HTML personalizado
 * @param {string} html - contenido HTML del sheet
 * @returns {HTMLElement} el elemento del sheet (para listeners)
 */
export function openSheet(html) {
  closeSheet(); // cerrar si ya hay uno abierto

  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  backdrop.id = 'sheetBackdrop';

  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.id = 'sheetContent';
  sheet.innerHTML = `
    <div class="sheet-handle"></div>
    ${html}
  `;

  document.body.appendChild(backdrop);
  document.body.appendChild(sheet);

  requestAnimationFrame(() => {
    backdrop.classList.add('show');
    sheet.classList.add('show');
  });

  backdrop.addEventListener('click', closeSheet);

  currentSheet = sheet;
  return sheet;
}

/**
 * Cierra el bottom sheet
 */
export function closeSheet() {
  const backdrop = document.getElementById('sheetBackdrop');
  const sheet = document.getElementById('sheetContent');

  if (backdrop) backdrop.classList.remove('show');
  if (sheet) sheet.classList.remove('show');

  setTimeout(() => {
    if (backdrop) backdrop.remove();
    if (sheet) sheet.remove();
    currentSheet = null;
  }, 400);
}

/* ============================================================
   HAPTIC FEEDBACK (vibración)
   ============================================================ */

/**
 * Vibración háptica corta
 * @param {number|Array} pattern - duración o patrón
 */
export function haptic(pattern = 10) {
  if ('vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch (e) {
      // silencioso
    }
  }
}

/* ============================================================
   FORMATEO DE FECHAS Y NÚMEROS
   ============================================================ */

/**
 * Formatea un Timestamp de Firestore o fecha a "DD/MM/YYYY HH:MM"
 */
export function formatFecha(fecha, incluirHora = true) {
  if (!fecha) return '-';

  let d;
  if (fecha.toDate) {
    d = fecha.toDate(); // Timestamp de Firestore
  } else if (fecha instanceof Date) {
    d = fecha;
  } else if (typeof fecha === 'number') {
    d = new Date(fecha);
  } else {
    d = new Date(fecha);
  }

  if (isNaN(d.getTime())) return '-';

  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const anio = d.getFullYear();

  const base = `${dia}/${mes}/${anio}`;

  if (!incluirHora) return base;

  const horas = String(d.getHours()).padStart(2, '0');
  const minutos = String(d.getMinutes()).padStart(2, '0');
  return `${base} ${horas}:${minutos}`;
}

/**
 * Formatea fecha relativa: "hace 2h", "hace 3 días", etc.
 */
export function tiempoRelativo(fecha) {
  if (!fecha) return '';

  let d;
  if (fecha.toDate) d = fecha.toDate();
  else if (fecha instanceof Date) d = fecha;
  else d = new Date(fecha);

  if (isNaN(d.getTime())) return '';

  const ahora = new Date();
  const diffSeg = Math.floor((ahora - d) / 1000);

  if (diffSeg < 60) return 'ahora mismo';

  const diffMin = Math.floor(diffSeg / 60);
  if (diffMin < 60) return `hace ${diffMin} min`;

  const diffHoras = Math.floor(diffMin / 60);
  if (diffHoras < 24) return `hace ${diffHoras}h`;

  const diffDias = Math.floor(diffHoras / 24);
  if (diffDias < 30) return `hace ${diffDias} día${diffDias > 1 ? 's' : ''}`;

  const diffMeses = Math.floor(diffDias / 30);
  if (diffMeses < 12) return `hace ${diffMeses} mes${diffMeses > 1 ? 'es' : ''}`;

  const diffAnios = Math.floor(diffMeses / 12);
  return `hace ${diffAnios} año${diffAnios > 1 ? 's' : ''}`;
}

/**
 * Formatea número como moneda boliviana
 */
export function formatBs(monto) {
  const num = Number(monto) || 0;
  return `Bs. ${num.toFixed(2)}`;
}

/* ============================================================
   HELPERS DE STRINGS
   ============================================================ */

/**
 * Escapa HTML para prevenir XSS al insertar texto del usuario
 */
export function escapeHtml(texto) {
  if (!texto) return '';
  const div = document.createElement('div');
  div.textContent = String(texto);
  return div.innerHTML;
}

/**
 * Normaliza un string para búsqueda (minúsculas, sin tildes)
 */
export function normalizar(texto) {
  if (!texto) return '';
  return String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

/**
 * Obtiene las iniciales de un nombre
 */
export function iniciales(nombre) {
  if (!nombre) return '?';
  const partes = String(nombre).trim().split(/\s+/);
  if (partes.length === 1) return partes[0].charAt(0).toUpperCase();
  return (partes[0].charAt(0) + partes[partes.length - 1].charAt(0)).toUpperCase();
}

/* ============================================================
   THEME (modo claro/oscuro)
   ============================================================ */

const THEME_KEY = 'drx_theme';

/**
 * Inicializa el tema guardado (o el oscuro por defecto)
 */
export function initTheme() {
  const guardado = localStorage.getItem(THEME_KEY) || 'dark';
  aplicarTema(guardado);
}

/**
 * Aplica un tema
 */
export function aplicarTema(tema) {
  document.documentElement.setAttribute('data-theme', tema);
  localStorage.setItem(THEME_KEY, tema);

  const icono = document.querySelector('#themeToggle i');
  if (icono) {
    icono.className = tema === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
  }
}

/**
 * Alterna entre claro y oscuro
 */
export function toggleTheme() {
  const actual = document.documentElement.getAttribute('data-theme') || 'dark';
  aplicarTema(actual === 'dark' ? 'light' : 'dark');
}

/* ============================================================
   NAVEGACIÓN / ROUTER BÁSICO
   ============================================================ */

/**
 * Redirige a una URL
 */
export function goTo(url) {
  window.location.href = url;
}

/**
 * Espera X milisegundos
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
