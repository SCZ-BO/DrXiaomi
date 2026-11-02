// ============================================================
// DR. XIAOMI · APP UI (Layout y Directorio Definitivo)
// Archivo: /app/js/app-ui.js
// ============================================================

// 🔥 DIRECTORIO MAESTRO DE ICONOS (28 iconos)
export const ICONS = {
  // 1. Navegación y Layout
  home: '/app/icons/home.png',
  precios: '/app/icons/precios.png',
  reportes: '/app/icons/reportes.png',
  inventario: '/app/icons/inventario.png',
  volver: '/app/icons/volver.png',
  tema: '/app/icons/tema.png',
  salir: '/app/icons/salir.png',
  buscar: '/app/icons/buscar.png',

  // 2. Acciones Principales
  agregar: '/app/icons/agregar.png',
  venta: '/app/icons/venta.png',
  cierre: '/app/icons/cierre.png',
  editar: '/app/icons/editar.png',
  eliminar: '/app/icons/eliminar.png',

  // 3. Acciones de la Orden
  whatsapp: '/app/icons/whatsapp.png',
  pdf: '/app/icons/pdf.png',
  cobrar: '/app/icons/cobrar.png',
  camara: '/app/icons/camara.png',
  galeria: '/app/icons/galeria.png',
  estadoReparacion: '/app/icons/estado-reparacion.png',

  // 4. Wizard (Cliente)
  cliente: '/app/icons/cliente.png',
  telefono: '/app/icons/telefono.png',
  patron: '/app/icons/patron.png',
  bateria: '/app/icons/bateria.png',
  senal: '/app/icons/senal.png',
  falla: '/app/icons/falla.png',
  servicios: '/app/icons/servicios.png',
  total: '/app/icons/total.png',

  // 5. Reportes y Extras
  calendario: '/app/icons/calendario.png',
  ganancia: '/app/icons/ganancia.png',
  ver: '/app/icons/ver.png'
};

// ============================================================
// FUNCIÓN PRINCIPAL DEL LAYOUT
// ============================================================
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
        <button class="icon-btn" id="btnSalir" aria-label="Cerrar sesión" style="margin-right: 4px;">
          <img src="${ICONS.salir}" width="20" height="20" alt="Salir">
        </button>
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

  // --- D. Lógica del botón Salir ---
  document.getElementById('btnSalir').addEventListener('click', async () => {
    const confirmar = confirm('¿Estás seguro que deseas cerrar sesión?');
    if (confirmar) {
      // Si usas Firebase Auth, aquí deberías poner: await auth.signOut();
      localStorage.removeItem('dr-theme'); // Limpiamos preferencias
      window.location.href = '/'; // Redirigir al inicio/login
    }
  });

  // --- E. Lógica del Tema (Oscuro / Claro) ---
  const btnTema = document.getElementById('btnTema');
  const temaGuardado = localStorage.getItem('dr-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', temaGuardado);

  btnTema.addEventListener('click', () => {
    const actual = document.documentElement.getAttribute('data-theme');
    const nuevoTema = actual === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nuevoTema);
    localStorage.setItem('dr-theme', nuevoTema);
  });
}
