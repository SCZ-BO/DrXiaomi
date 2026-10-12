/* ============================================================
   DR. XIAOMI · REPORTES DE INGRESOS
   Archivo: app/reportes/reportes.js
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
  document.getElementById('headerSubtitle').textContent = 
    `👑 ${sesion.nombre}`;

  configurarEventos();
  await cargarOrdenes();
}

/* ============================================================
   EVENTOS
   ============================================================ */
function configurarEventos() {
  document.getElementById('backBtn').addEventListener('click', () => {
    haptic(10);
    window.location.href = '/app/';
  });

  document.getElementById('refreshBtn').addEventListener('click', async () => {
    haptic(10);
    await cargarOrdenes();
    toast('Datos actualizados', 'success', 1500);
  });

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
        custom.classList.add('show');
      } else {
        custom.classList.remove('show');
        aplicarFiltro();
      }
    });
  });

  const btnAplicar = document.getElementById('btnAplicarCustom');
  if (btnAplicar) {
    btnAplicar.addEventListener('click', () => {
      const desde = document.getElementById('fechaDesde').value;
      const hasta = document.getElementById('fechaHasta').value;
      
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

  document.getElementById('btnExportar').addEventListener('click', exportarCSV);
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
    console.log(`📋 ${todasLasOrdenes.length} órdenes cargadas`);

    aplicarFiltro();
  } catch (err) {
    console.error('Error cargando:', err);
    toast('Error al cargar las órdenes', 'error');
  } finally {
    hideLoading();
  }
}

/* ============================================================
   APLICAR FILTRO
   ============================================================ */
function aplicarFiltro() {
  const ahora = new Date();
  let desde, hasta = new Date();

  switch (rangoActual) {
    case 'hoy':
      desde = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
      hasta = new Date(desde.getTime() + 24 * 60 * 60 * 1000 - 1);
      break;

    case 'ayer':
      desde = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - 1);
      hasta = new Date(desde.getTime() + 24 * 60 * 60 * 1000 - 1);
      break;

    case 'semana': {
      const diaSemana = ahora.getDay();
      const diff = diaSemana === 0 ? 6 : diaSemana - 1;
      desde = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - diff);
      hasta = ahora;
      break;
    }

    case 'mes':
      desde = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
      hasta = ahora;
      break;

    case 'custom':
      desde = fechaCustomDesde;
      hasta = fechaCustomHasta;
      break;

    default:
      desde = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
      hasta = new Date(desde.getTime() + 24 * 60 * 60 * 1000 - 1);
  }

  ordenesFiltradas = todasLasOrdenes.filter(o => {
    const esEntregado = o.estadoOrden === 'entregado';
    const esDevueltoConCobro = o.estadoOrden === 'devuelto' && Number(o.montoCobrado) > 0;

    if (!esEntregado && !esDevueltoConCobro) return false;

    const fecha = getFecha(o);
    if (!fecha) return false;

    return fecha >= desde && fecha <= hasta;
  });

  renderizarReporte();
}

function getFecha(orden) {
  const f = orden.fechaEntrega || orden.actualizadoEn || orden.fecha;
  if (!f) return null;
  if (f.toDate) return f.toDate();
  if (f instanceof Date) return f;
  return new Date(f);
}

/* ============================================================
   RENDERIZAR REPORTE
   ============================================================ */
function renderizarReporte() {
  let total = 0;
  const porMetodo = {
    Efectivo: 0,
    QR: 0,
    Transferencia: 0,
    Mixto: 0,
    Otro: 0
  };

  ordenesFiltradas.forEach(o => {
    const monto = Number(o.montoCobrado) || 0;
    total += monto;

    const metodo = o.metodoPago || 'Otro';
    if (metodo.toLowerCase().includes('efectivo')) porMetodo.Efectivo += monto;
    else if (metodo.toLowerCase().includes('qr')) porMetodo.QR += monto;
    else if (metodo.toLowerCase().includes('transf')) porMetodo.Transferencia += monto;
    else if (metodo.toLowerCase().includes('mixto')) porMetodo.Mixto += monto;
    else porMetodo.Otro += monto;
  });

  document.getElementById('totalMonto').textContent = formatBs(total);
  document.getElementById('totalEntregas').textContent = 
    `${ordenesFiltradas.length} entrega${ordenesFiltradas.length === 1 ? '' : 's'}`;

  const promedio = ordenesFiltradas.length > 0 ? total / ordenesFiltradas.length : 0;
  const maximo = ordenesFiltradas.length > 0 
    ? Math.max(...ordenesFiltradas.map(o => Number(o.montoCobrado) || 0))
    : 0;

  document.getElementById('statPromedio').textContent = formatBs(promedio);
  document.getElementById('statMaximo').textContent = formatBs(maximo);

  const metodosGrid = document.getElementById('metodosGrid');
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

  const listaMov = document.getElementById('listaMovimientos');
  
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
      ? `${String(fecha.getHours()).padStart(2,'0')}:${String(fecha.getMinutes()).padStart(2,'0')}`
      : '--:--';
    const dia = fecha
      ? `${String(fecha.getDate()).padStart(2,'0')}/${String(fecha.getMonth()+1).padStart(2,'0')}`
      : '--';

    const metodo = (o.metodoPago || 'Otro').replace(/\(.*\)/, '').trim();
    const monto = Number(o.montoCobrado) || 0;

    return `
      <div class="movimiento">
        <div class="hora">${hora}<br>${dia}</div>
        <div class="info">
          <div class="cliente">${escapeHtml(o.cliente || '-')}</div>
          <div class="detalle">${escapeHtml(o.marca || '')} ${escapeHtml(o.modelo || '')} · ${escapeHtml(metodo)}</div>
        </div>
        <div class="monto">${formatBs(monto)}</div>
      </div>
    `;
  }).join('');
}

/* ============================================================
   EXPORTAR CSV (compatible con Excel español)
   ============================================================ */
function exportarCSV() {
  if (ordenesFiltradas.length === 0) {
    toast('No hay datos para exportar', 'warning');
    return;
  }

  haptic(15);

  // Encabezados
  const headers = [
    'Recibo',
    'Cliente',
    'Teléfono',
    'Equipo',
    'Fecha Entrega',
    'Método',
    'Monto Cobrado',
    'Total',
    'Adelanto',
    'Saldo'
  ];

  // Filas
  const filas = ordenesFiltradas.map(o => {
    const fecha = getFecha(o);
    const fechaStr = fecha 
      ? `${String(fecha.getDate()).padStart(2,'0')}/${String(fecha.getMonth()+1).padStart(2,'0')}/${fecha.getFullYear()} ${String(fecha.getHours()).padStart(2,'0')}:${String(fecha.getMinutes()).padStart(2,'0')}`
      : '-';

    return [
      o.numeroRecibo || '-',
      o.cliente || '-',
      o.telefono || '-',
      `${o.marca || ''} ${o.modelo || ''}`.trim() || '-',
      fechaStr,
      o.metodoPago || '-',
      Number(o.montoCobrado) || 0,
      Number(o.total) || 0,
      Number(o.adelanto) || 0,
      Number(o.saldo) || 0
    ];
  });

  // Escape de valores (usando ; como separador)
  const escapeCSV = (val) => {
    const str = String(val);
    // Si contiene el separador, comillas, o salto de línea → escapar
    if (str.includes(';') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  // Separador: punto y coma (Excel español)
  const SEPARADOR = ';';

  const csv = [
    headers.map(escapeCSV).join(SEPARADOR),
    ...filas.map(fila => fila.map(escapeCSV).join(SEPARADOR))
  ].join('\r\n');

  // BOM UTF-8 para que Excel muestre tildes y ñ correctamente
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  // Nombre del archivo
  const ahora = new Date();
  const nombre = `DR-XIAOMI_Reporte_${rangoActual}_${ahora.getFullYear()}${String(ahora.getMonth()+1).padStart(2,'0')}${String(ahora.getDate()).padStart(2,'0')}.csv`;

  // Descargar
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  toast(`Exportado: ${ordenesFiltradas.length} movimientos`, 'success', 2500);
}
