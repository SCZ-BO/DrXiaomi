// ============================================================
// DR. XIAOMI · APP UI (Layout Dinámico)
// Archivo: /app/js/app-ui.js
// ============================================================

// 🔥 DIRECTORIO DE ICONOS (Si cambias un icono, solo cambias la ruta aquí)
const ICONS = {
  home: '/app/icons/home.png',
  precios: '/app/icons/precios.png',
  reportes: '/app/icons/reportes.png',
  inventario: '/app/icons/inventario.png',
  volver: '/app/icons/volver.png',
  tema: '/app/icons/tema.png',
  agregar: '/app/icons/agregar.png',
  orden: '/app/icons/orden.png'
};

// 1. INYECTAR HEADER Y BOTTOM NAV
export function initLayout(titulo, subtitulo = '', activo = '', padre = '/app/') {
  
  // --- A. Crear Header ---
  const headerHTML = `
    <header class="app-header">
      <div class="brand">
        <button class="icon-btn" id="btnVolver" aria-label="Volver">
          <img src="${ICONS.volver}" width="20" height="20" alt="Volver">
        </button>
        <div class="brand-text">
          <h1>${titulo}</h1>
          ${subtitulo ? `<p>${subtitulo}</p>` : ''}
        </div>
      </div>
      <div class="header-actions">
        <button class="icon-btn" id="btnTema" aria-label="Cambiar tema">
          <img src="${ICONS.tema}" width="20" height="20" alt="Tema">
        </button>
      </div>
    </header>
  `;

  // --- B. Crear Bottom Nav ---
  const navHTML = `
    <nav class="bottom-nav">
      <a href="/app/" class="nav-item ${activo === 'home' ? 'active' : ''}">
        <img src="${ICONS.home}" alt="Panel"> <span>Panel</span>
      </a>
      <a href="/app/precios/" class="nav-item ${activo === 'precios' ? 'active' : ''}">
        <img src="${ICONS.precios}" alt="Precios"> <span>Precios</span>
      </a>
      <a href="/app/reportes/" class="nav-item ${activo === 'reportes' ? 'active' : ''}">
        <img src="${ICONS.reportes}" alt="Reportes"> <span>Reportes</span>
      </a>
      <a href="/app/inventario/" class="nav-item ${activo === 'inventario' ? 'active' : ''}">
        <img src="${ICONS.inventario}" alt="Inventario"> <span>Stock</span>
      </a>
    </nav>
  `;

  // Inyectar en el body
  document.body.insertAdjacentHTML('afterbegin', headerHTML);
  document.body.insertAdjacentHTML('beforeend', navHTML);

  // --- C. Lógica del botón Volver ---
  document.getElementById('btnVolver').addEventListener('click', () => {
    window.location.href = padre;
  });

  // --- D. Lógica del Tema (Oscuro / Claro) ---
  const btnTema = document.getElementById('btnTema');
  
  // Cargar tema guardado al iniciar
  const temaGuardado = localStorage.getItem('dr-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', temaGuardado);

  btnTema.addEventListener('click', () => {
    const actual = document.documentElement.getAttribute('data-theme');
    const nuevoTema = actual === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', nuevoTema);
    localStorage.setItem('dr-theme', nuevoTema);
  });
}
