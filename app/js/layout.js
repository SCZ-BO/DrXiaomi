/* ============================================================
   DR. XIAOMI · LAYOUT.JS
   Inyecta Header + Bottom Nav + Botón Atrás
   ============================================================ */

import { icono } from './icons.js';
import { logout } from './app-auth.js';
import { toggleTheme } from './app-ui.js';

/**
 * Monta la plantilla visual en la página actual.
 * @param {Object} opciones
 * @param {string} opciones.titulo - El título de la pantalla (ej. 'Panel', 'Nuevo Recibo')
 * @param {string} opciones.padre - Ruta a la que vuelve el botón atrás (ej. '/app/'). Si es null, muestra el logo.
 * @param {string} opciones.activo - Key del nav activo ('panel', 'precios', 'reportes', 'inventario')
 */
export function montarLayout({ titulo = 'DR. XIAOMI', padre = null, activo = 'panel' } = {}) {
  const container = document.querySelector('.app-container');
  if (!container) return;

  const showBack = !!padre;

  // ——— 1. INYECTAR HEADER ———
  const headerHTML = `
    <header class="app-header">
      <div class="brand">
        ${showBack 
          ? `<button class="icon-btn" id="backBtn" onclick="window.location.href='${padre}'" style="background:transparent; border:none;">
               ${icono('volver', 20)}
             </button>`
          : `<div class="brand-logo"><img src="/imagenes/web-app-manifest-192x192.png" alt="Logo"></div>`
        }
        
        <div class="brand-text">
          <h1>${titulo}</h1>
          <p id="userInfo">Cargando...</p>
        </div>
      </div>
      
      <div class="header-actions">
        <button class="icon-btn" id="btnNotificaciones" style="position:relative;">
          ${icono('campana', 20)}
          <span class="notif-badge" id="notifBadge" style="position:absolute; top:-4px; right:-4px; display:none; background:var(--danger-500); color:white; font-size:10px; font-weight:800; padding:2px 5px; border-radius:10px; border:2px solid var(--bg-elev-1);">0</span>
        </button>
        <button class="icon-btn" id="btnTema">${icono('tema', 20)}</button>
        <button class="icon-btn" id="btnSalir">${icono('salir', 20)}</button>
      </div>
    </header>`;

  container.insertAdjacentHTML('afterbegin', headerHTML);

  // ——— EVENTOS DEL HEADER ———
  document.getElementById('btnSalir')?.addEventListener('click', () => { if(confirm('¿Cerrar sesión?')) logout(); });
  document.getElementById('btnTema')?.addEventListener('click', toggleTheme);
  document.getElementById('btnNotificaciones')?.addEventListener('click', () => {
    const badge = document.getElementById('notifBadge');
    if (badge) badge.style.display = 'none';
  });

  // ——— 2. BOTTOM NAV (Solo si no es el wizard de recibo) ———
  // Si quieres ocultar el nav en el wizard, puedes agregar una condición aquí.
  const navHTML = `
    <nav class="bottom-nav">
      <a href="/app/" class="nav-item ${activo === 'panel' ? 'active' : ''}">${icono('home', 22)} <span>Panel</span></a>
      <a href="/app/precios/" class="nav-item ${activo === 'precios' ? 'active' : ''}">${icono('precios', 22)} <span>Precios</span></a>
      <a href="/app/reportes/" class="nav-item ${activo === 'reportes' ? 'active' : ''}">${icono('reportes', 22)} <span>Reportes</span></a>
      <a href="/app/inventario/" class="nav-item ${activo === 'inventario' ? 'active' : ''}">${icono('inventario', 22)} <span>Stock</span></a>
    </nav>`;

  container.insertAdjacentHTML('beforeend', navHTML);

  // ——— 3. INTERCEPTAR BOTÓN ATRÁS DEL SISTEMA ———
  if (showBack) {
    history.pushState({ pantalla: titulo }, '', location.href);
    window.addEventListener('popstate', () => {
      window.location.href = padre || '/app/';
    });
  }
}
