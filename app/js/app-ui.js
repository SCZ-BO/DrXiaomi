/* ============================================================
   DR. XIAOMI · UI HELPERS (PRIME EDITION)
   Archivo: js/app-ui.js
   Descripción: Toasts, Loaders, Modales, Formateo, Tema, Haptics
   ============================================================ */

/* ============================================================
   1. SISTEMA DE TOASTS (Notificaciones flotantes)
   ============================================================ */
let toastContainer = null;

function crearToastContainer() {
  if (toastContainer) return toastContainer;
  toastContainer = document.createElement('div');
  toastContainer.className = 'toast-container';
  toastContainer.id = 'toastContainer';
  // Estilos base por si el CSS tarda en cargar
  toastContainer.style.cssText = 'position:fixed; top:20px; left:50%; transform:translateX(-50%); z-index:9999; display:flex; flex-direction:column; gap:10px; pointer-events:none;';
  document.body.appendChild(toastContainer);
  return toastContainer;
}

export function toast(mensaje, tipo = 'info', duracion = 3000) {
  const container = crearToastContainer();
  const iconos = {
    success: 'fa-circle-check',
    error:   'fa-circle-xmark',
    warning: 'fa-triangle-exclamation',
    info:    'fa-circle-info'
  };

  const el = document.createElement('div');
  // Usamos las clases de tu app-components.css
  el.className = `toast toast-${tipo}`;
  el.style.cssText = `
    display:flex; align-items:center; gap:12px; padding:12px 20px;
    background:var(--bg-elev-2); color:var(--text-1); border-radius:var(--r-lg);
    box-shadow:var(--shadow-lg); border-left:4px solid var(--brand-500);
    font-size:14px; font-weight:600; transform:translateY(-20px); opacity:0;
    transition:all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); pointer-events:auto;
  `;
  
  // Colores según el tipo
  if (tipo === 'success') el.style.borderLeftColor = 'var(--success-500)';
  if (tipo === 'error')   el.style.borderLeftColor = 'var(--danger-500)';
  if (tipo === 'warning') el.style.borderLeftColor = 'var(--warning-500)';

  el.innerHTML = `
    <i class="fas ${iconos[tipo] || iconos.info}" style="color:var(--brand-500); font-size:18px;"></i>
    <span>${mensaje}</span>
  `;

  container.appendChild(el);

  // Animar entrada
  requestAnimationFrame(() => {
    el.style.transform = 'translateY(0)';
    el.style.opacity = '1';
  });

  // Auto-cerrar
  setTimeout(() => {
    el.style.transform = 'translateY(-20px)';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, duracion);
}

/* ============================================================
   2. HAPTIC FEEDBACK (Vibración)
   ============================================================ */
export function haptic(pattern = 10) {
  if ('vibrate' in navigator) {
    try { navigator.vibrate(pattern); } catch (e) {}
  }
}

/* ============================================================
   3. SISTEMA DE TEMA (Claro / Oscuro)
   ============================================================ */
const THEME_KEY = 'drx_theme';

export function initTheme() {
  const guardado = localStorage.getItem(THEME_KEY) || 'dark';
  aplicarTema(guardado);
}

export function aplicarTema(tema) {
  document.documentElement.setAttribute('data-theme', tema);
  localStorage.setItem(THEME_KEY, tema);

  // Actualizar el meta tag de color (barra de estado del celular)
  const metaColor = document.getElementById('metaThemeColor');
  if (metaColor) {
    metaColor.setAttribute('content', tema === 'light' ? '#F8F8F9' : '#0A0A0B');
  }

  // Actualizar icono si existe (usando FontAwesome por ahora, o tu PNG)
  const icono = document.querySelector('#btnTema i') || document.querySelector('#themeIcon');
  if (icono) {
    icono.className = tema === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
  }
}

export function toggleTheme() {
  const actual = document.documentElement.getAttribute('data-theme') || 'dark';
  aplicarTema(actual === 'dark' ? 'light' : 'dark');
}

// Iniciar el tema automáticamente al importar este archivo
initTheme();

/* ============================================================
   4. FORMATEO DE FECHAS Y NÚMEROS
   ============================================================ */
export function formatFecha(fecha, incluirHora = true) {
  if (!fecha) return '-';
  let d;
  if (fecha.toDate) d = fecha.toDate();
  else if (fecha instanceof Date) d = fecha;
  else if (typeof fecha === 'number') d = new Date(fecha);
  else d = new Date(fecha);

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

export function tiempoRelativo(fecha) {
  if (!fecha) return '';
  let d;
  if (fecha.toDate) d = fecha.toDate();
  else if (fecha instanceof Date) d = fecha;
  else d = new Date(fecha);

  if (isNaN(d.getTime())) return '';

  const diffSeg = Math.floor((new Date() - d) / 1000);
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

export function formatBs(monto) {
  const num = Number(monto) || 0;
  return `Bs. ${num.toFixed(2)}`;
}

/* ============================================================
   5. HELPERS DE STRINGS
   ============================================================ */
export function escapeHtml(texto) {
  if (!texto) return '';
  const div = document.createElement('div');
  div.textContent = String(texto);
  return div.innerHTML;
}

export function normalizar(texto) {
  if (!texto) return '';
  return String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

export function iniciales(nombre) {
  if (!nombre) return '?';
  const partes = String(nombre).trim().split(/\s+/);
  if (partes.length === 1) return partes[0].charAt(0).toUpperCase();
  return (partes[0].charAt(0) + partes[partes.length - 1].charAt(0)).toUpperCase();
}

/* ============================================================
   6. NAVEGACIÓN Y UTILIDADES
   ============================================================ */
export function goTo(url) {
  window.location.href = url;
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
