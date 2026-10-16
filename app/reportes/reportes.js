/* ============================================================
   DR. XIAOMI · REPORTES DE INGRESOS
   Archivo: app/reportes/reportes.js
   Versión: con costos, ganancia, margen y botón volver al panel
   ============================================================ */

import { requireAuth, logout } from '/js/app-auth.js';
import {
  toast, haptic, initTheme, escapeHtml, formatBs, showLoading, hideLoading
} from '/js/app-ui.js';
import { db } from '/js/firebase.js';
import {
  collection, query, orderBy, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ============================================================
   CONFIGURACIÓN
   ============================================================ */
const DEBUG = true;

/* ============================================================
   ESTADO
   ============================================================ */
let sesion = null;
let todasLasOrdenes = [];
let ordenesFiltradas = [];
let rangoActual = 'hoy';
let fechaCustomDesde = null;
let fechaCustomHasta = null;

/* ============================================================
   INICIALIZACIÓN
   ============================================================ */
initTheme();

requireAuth(async (s) => {
  if (s.rol !== 'admin') {
    toast('Solo el administrador puede ver reportes', 'error');
    setTimeout(() => window.location.href = '/app/', 1500);
    return;
  }

  sesion = s;
  await iniciar();
});

async function iniciar() {
  const subtitle = document.getElementById('headerSubtitle');
  if (subtitle) subtitle.textContent = `👑 ${sesion.nombre}`;

  configurarEventos();
  await cargarOrdenes();
}

/* ============================================================
   EVENTOS
   ============================================================ */
function configurarEventos() {
  // 🏠 Botón Home
  document.getElementById('homeBtn')?.addEventListener('click', () => {
    haptic(15);
    window.location.href = '/app/';
  });

  // 🏷️ Botón Precios
  document.getElementById('preciosBtn')?.addEventListener('click', () => {
    haptic(15);
    window.location.href = '/precio/';
  });

  // 🚪 Botón Salir
  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    haptic(20);
    if (confirm('¿Cerrar sesión?')) logout();
  });

  // ← Botón Volver (flecha)
  document.getElementById('backBtn')?.addEventListener('click', () => {
    haptic(10);
    window.location.href = '/app/';
  });

  // 🔄 Botón Refrescar
  document.getElementById('refreshBtn')?.addEventListener('click', async () => {
    haptic(10);
    await cargarOrdenes();
    toast('Datos actualizados', 'success', 1500);
  });

  // 🏠 Botón "Volver al panel" (grande)
  document.getElementById('btnVolverPanel')?.addEventListener('click', () => {
    haptic(15);
    window.location.href = '/app/';
  });

  // Filtros de fecha
  document.querySelectorAll('.fecha-btn[data-rango]').forEach(btn => {
    btn.addEventListener('click', () => {
      haptic(8);
      document.querySelectorAll('.fecha-btn[data-rango]').forEach(b =>
        b.classList.remove('active')
      );
      btn.classList.add('active');
      rangoActual = btn.dataset.rango;

      const custom = document.getElementById('fechaCustom');
      if (rangoActual === 'custom') {
        custom?.classList.add('show');
      } else {
        custom?.classList.remove('show');
        aplicarFiltro();
      }
    });
  });

  // Botón Aplicar fecha personalizada
  const btnAplicar = document.getElementById('btnAplicarCustom');
  if (btnAplicar) {
    btnAplicar.addEventListener('click', () => {
      const desde = document.getElementById('fechaDesde')?.value;
      const hasta = document.getElementById('fechaHasta')?.value;

      if (!desde || !hasta) {
        toast('Selecciona ambas fechas', 'error');
        return;
      }

      fechaCustomDesde = new Date(desde + 'T00:00:00');
      fechaCustomHasta = new Date(hasta + 'T23:59:59');

      haptic(10);
      aplicarFiltro();
    });
  }

  // Botón exportar CSV
  document.getElementById('btnExportar')?.addEventListener('click', exportarCSV);
}

/* ============================================================
   CARGAR ÓRDENES
   ============================================================ */
async function cargarOrdenes() {
  showLoading('Cargando datos...');
  try {
    const q = query(
      collection(db, 'recibos'),
      orderBy('fecha', 'desc')
    );
    const snap = await getDocs(q);

    todasLasOrdenes = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (DEBUG) {
      console.log(`📋 ${todasLasOrdenes.length} órdenes cargadas desde Firestore`);
    }

    aplicarFiltro();
  } catch (err) {
    console.error('Error cargando:', err);
    toast('Error al cargar las órdenes', 'error');
  } finally {
    hideLoading();
  }
}

/* ============================================================
   NORMALIZAR FECHA
   ============================================================ */
function normalizarFecha(f) {
  if (!f) return null;
  if (typeof f.toDate === 'function') return f.toDate();
  if (f instanceof Date) return f;
  if (typeof f === 'number') return new Date(f);
  if (typeof f === 'string') {
    const d = new Date(f);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function getFecha(orden) {
  return (
    normalizarFecha(orden.fechaEntrega) ||
    normalizarFecha(orden.actualizadoEn) ||
    normalizarFecha(orden.fecha)
  );
}

/* ============================================================
   APLICAR FILTRO
   ============================================================ */
function aplicarFiltro() {
  const ahora = new Date();
  let desde, hasta;

  switch (rangoActual) {
    case 'hoy': {
      desde = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 0, 0, 0, 0);
      hasta = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 23, 59, 59, 999);
      break;
    }
    case 'ayer': {
      const ayer = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - 1);
      desde = new Date(ayer.getFullYear(), ayer.getMonth(), ayer.getDate(), 0, 0, 0, 0);
      hasta = new Date(ayer.getFullYear(), ayer.getMonth(), ayer.getDate(), 23, 59, 59, 999);
      break;
    }
    case 'semana': {
      const diaSemana = ahora.getDay();
      const diff = diaSemana === 0 ? 6 : diaSemana - 1;
      desde = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - diff, 0, 0, 0, 0);
      hasta = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 23, 59, 59, 999);
      break;
    }
    case 'mes': {
      desde = new Date(ahora.getFullYear(), ahora.getMonth(), 1, 0, 0, 0, 0);
      hasta = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0, 23, 59, 59, 999);
      break;
    }
    case 'custom': {
      desde = fechaCustomDesde;
      hasta = fechaCustomHasta;
      break;
    }
    default: {
      desde = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 0, 0, 0, 0);
      hasta = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 23, 59, 59, 999);
    }
  }

  ordenesFiltradas = todasLasOrdenes.filter(o => {
    const monto = Number(o.montoCobrado) || 0;
    const estado = o.estadoOrden || 'recibido';
    const esEntregado = estado === 'entregado';
    const esDevueltoConCobro = estado === 'devuelto' && monto > 0;
    const tieneCobro = monto > 0;

    if (!esEntregado && !esDevueltoConCobro && !tieneCobro) return false;

    const fecha = getFecha(o);
    if (!fecha) return false;

    return fecha >= desde && fecha <= hasta;
  });

  renderizarReporte();
}

/* ============================================================
   RENDERIZAR REPORTE
   ============================================================ */
function renderizarReporte() {
  let total = 0;
  let totalCosto = 0;
  let totalGanancia = 0;

  const porMetodo = {
    Efectivo: 0,
    QR: 0,
    Transferencia: 0,
    Mixto: 0,
    Otro: 0
  };

  ordenesFiltradas.forEach(o => {
    const monto = Number(o.montoCobrado) || 0;
    const costo = Number(o.costoRepuesto) || 0;
    const ganancia = monto - costo;

    total += monto;
    totalCosto += costo;
    totalGanancia += ganancia;

    const metodo = (o.metodoPago || 'Otro').toLowerCase();
    if (metodo.includes('efectivo')) porMetodo.Efectivo += monto;
    else if (metodo.includes('qr')) porMetodo.QR += monto;
    else if (metodo.includes('transf')) porMetodo.Transferencia += monto;
    else if (metodo.includes('mixto')) porMetodo.Mixto += monto;
    else porMetodo.Otro += monto;
  });

  // Total cobrado
  const totalMontoEl = document.getElementById('totalMonto');
  const totalEntregasEl = document.getElementById('totalEntregas');
  if (totalMontoEl) totalMontoEl.textContent = formatBs(total);
  if (totalEntregasEl) {
    totalEntregasEl.textContent =
      `${ordenesFiltradas.length} entrega${ordenesFiltradas.length === 1 ? '' : 's'}`;
  }

  // Costos y ganancia
  const costoEl = document.getElementById('totalCosto');
  const gananciaEl = document.getElementById('totalGanancia');
  const margenEl = document.getElementById('totalMargen');

  if (costoEl) costoEl.textContent = formatBs(totalCosto);
  if (gananciaEl) gananciaEl.textContent = formatBs(totalGanancia);
  if (margenEl) {
    const margen = total > 0 ? Math.round((totalGanancia / total) * 100) : 0;
    margenEl.textContent = margen + '%';
    margenEl.style.color = margen >= 40 ? '#00FFCC' : margen >= 20 ? '#FFAA44' : '#FF4D6D';
  }

  // Promedio y máximo
  const promedio = ordenesFiltradas.length > 0 ? total / ordenesFiltradas.length : 0;
  const maximo = ordenesFiltradas.length > 0
    ? Math.max(...ordenesFiltradas.map(o => Number(o.montoCobrado) || 0))
    : 0;

  const statPromedioEl = document.getElementById('statPromedio');
  const statMaximoEl = document.getElementById('statMaximo');
  if (statPromedioEl) statPromedioEl.textContent = formatBs(promedio);
  if (statMaximoEl) statMaximoEl.textContent = formatBs(maximo);

  // Métodos de pago
  const metodosGrid = document.getElementById('metodosGrid');
  if (metodosGrid) {
    const metodosItems = [
      { key: 'Efectivo', icono: 'fa-money-bill-wave', clase: 'efectivo' },
      { key: 'QR', icono: 'fa-qrcode', clase: 'qr' },
      { key: 'Transferencia', icono: 'fa-building-columns', clase: 'transf' },
      { key: 'Mixto', icono: 'fa-shuffle', clase: 'mixto' }
    ];

    metodosGrid.innerHTML = metodosItems.map(m => `
      <div class="metodo-card">
        <div class="icono ${m.clase}">
          <i class="fas ${m.icono}"></i>
        </div>
        <div class="nombre">${m.key}</div>
        <div class="monto">${formatBs(porMetodo[m.key])}</div>
      </div>
    `).join('');
  }

  // Lista de movimientos
  const listaMov = document.getElementById('listaMovimientos');
  if (!listaMov) return;

  if (ordenesFiltradas.length === 0) {
    listaMov.innerHTML = `
      <div class="empty-reporte">
        <i class="fas fa-inbox"></i>
        <h3 style="font-size:15px; color:var(--text-2); margin-bottom:4px;">Sin movimientos</h3>
        <p style="font-size:13px;">No hay cobros en este período</p>
      </div>
    `;
    return;
  }

  listaMov.innerHTML = ordenesFiltradas.map(o => {
    const fecha = getFecha(o);
    const hora = fecha
      ? `${String(fecha.getHours()).padStart(2, '0')}:${String(fecha.getMinutes()).padStart(2, '0')}`
      : '--:--';
    const dia = fecha
      ? `${String(fecha.getDate()).padStart(2, '0')}/${String(fecha.getMonth() + 1).padStart(2, '0')}`
      : '--';

    const metodo = (o.metodoPago || 'Otro').replace(/\(.*\)/, '').trim();
    const monto = Number(o.montoCobrado) || 0;
    const costo = Number(o.costoRepuesto) || 0;
    const ganancia = monto - costo;

    const costoInfo = costo > 0
      ? `<div style="font-size:10px; color:#10B981; margin-top:2px; font-weight:700;">Ganancia: ${formatBs(ganancia)}</div>`
      : `<div style="font-size:10px; color:#FF9500; margin-top:2px; font-weight:700;">Sin costo asignado</div>`;

    return `
      <div class="movimiento">
        <div class="hora">${hora}<br>${dia}</div>
        <div class="info">
          <div class="cliente">${escapeHtml(o.cliente || '-')}</div>
          <div class="detalle">${escapeHtml(o.marca || '')} ${escapeHtml(o.modelo || '')} · ${escapeHtml(metodo)}</div>
          ${costoInfo}
        </div>
        <div class="monto">${formatBs(monto)}</div>
      </div>
    `;
  }).join('');
}

/* ============================================================
   EXPORTAR CSV
   ============================================================ */
function exportarCSV() {
  if (ordenesFiltradas.length === 0) {
    toast('No hay datos para exportar', 'warning');
    return;
  }

  haptic(15);

  const headers = [
    'Recibo', 'Cliente', 'Teléfono', 'Equipo',
    'Fecha Entrega', 'Método', 'Monto Cobrado',
    'Total', 'Adelanto', 'Saldo',
    'Costo Repuesto', 'Ganancia Neta'
  ];

  const filas = ordenesFiltradas.map(o => {
    const fecha = getFecha(o);
    const fechaStr = fecha
      ? `${String(fecha.getDate()).padStart(2, '0')}/${String(fecha.getMonth() + 1).padStart(2, '0')}/${fecha.getFullYear()} ${String(fecha.getHours()).padStart(2, '0')}:${String(fecha.getMinutes()).padStart(2, '0')}`
      : '-';

    const monto = Number(o.montoCobrado) || 0;
    const costo = Number(o.costoRepuesto) || 0;
    const ganancia = monto - costo;

    return [
      o.numeroRecibo || '-',
      o.cliente || '-',
      o.telefono || '-',
      `${o.marca || ''} ${o.modelo || ''}`.trim() || '-',
      fechaStr,
      o.metodoPago || '-',
      monto,
      Number(o.total) || 0,
      Number(o.adelanto) || 0,
      Number(o.saldo) || 0,
      costo,
      ganancia
    ];
  });

  const escapeCSV = (val) => {
    const str = String(val);
    if (str.includes(';') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const SEPARADOR = ';';
  const csv = [
    headers.map(escapeCSV).join(SEPARADOR),
    ...filas.map(fila => fila.map(escapeCSV).join(SEPARADOR))
  ].join('\r\n');

  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const ahora = new Date();
  const nombre = `DR-XIAOMI_Reporte_${rangoActual}_${ahora.getFullYear()}${String(ahora.getMonth() + 1).padStart(2, '0')}${String(ahora.getDate()).padStart(2, '0')}.csv`;

  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  toast(`Exportado: ${ordenesFiltradas.length} movimientos`, 'success', 2500);
}
