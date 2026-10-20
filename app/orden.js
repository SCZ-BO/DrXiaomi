/* ============================================================
   DR. XIAOMI · REPORTES (VERSIÓN FINAL CORREGIDA v2)
   Archivo: app/reportes/reportes.js
   ============================================================ */

import { requireAuth, logout } from '/js/app-auth.js';
import { toast, haptic, initTheme, formatBs, escapeHtml } from '/js/app-ui.js';
import { db } from '/js/firebase.js';
import { collection, query, where, onSnapshot, limit } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

initTheme();
let sesion = null;
let rangoActual = 'hoy';
let unsubscribeRecibos = null;
let unsubscribeCierres = null;
let datosActuales = [];

const headerSubtitle = document.getElementById('headerSubtitle');
const totalMontoEl = document.getElementById('totalMonto');
const totalEntregasEl = document.getElementById('totalEntregas');
const totalCostoEl = document.getElementById('totalCosto');
const totalGananciaEl = document.getElementById('totalGanancia');
const totalMargenEl = document.getElementById('totalMargen');
const statPromedioEl = document.getElementById('statPromedio');
const statMaximoEl = document.getElementById('statMaximo');
const metodosGrid = document.getElementById('metodosGrid');
const listaMovimientos = document.getElementById('listaMovimientos');

requireAuth((s) => {
  sesion = s;
  configurarEventos();
  cargarReporte('hoy');
});

function configurarEventos() {
  document.getElementById('homeBtn')?.addEventListener('click', () => window.location.href = '/app/');
  document.getElementById('backBtn')?.addEventListener('click', () => window.location.href = '/app/');
  document.getElementById('preciosBtn')?.addEventListener('click', () => window.location.href = '/precio/');
  document.getElementById('logoutBtn')?.addEventListener('click', () => logout());
  document.getElementById('refreshBtn')?.addEventListener('click', () => cargarReporte(rangoActual));

  document.querySelectorAll('.fecha-btn[data-rango]').forEach(btn => {
    btn.addEventListener('click', () => {
      haptic(10);
      document.querySelectorAll('.fecha-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      rangoActual = btn.dataset.rango;

      if (rangoActual === 'custom') {
        document.getElementById('fechaCustom').classList.add('show');
      } else {
        document.getElementById('fechaCustom').classList.remove('show');
        cargarReporte(rangoActual);
      }
    });
  });

  document.getElementById('btnAplicarCustom')?.addEventListener('click', () => {
    const desde = document.getElementById('fechaDesde').value;
    const hasta = document.getElementById('fechaHasta').value;
    if (!desde || !hasta) {
      toast('Selecciona ambas fechas', 'warning');
      return;
    }
    cargarReporte('custom', desde, hasta);
  });

  document.getElementById('btnVolverPanel')?.addEventListener('click', () => window.location.href = '/app/');
  document.getElementById('btnExportar')?.addEventListener('click', exportarCSV);
}

/* ============================================================
   FUNCIÓN AUXILIAR: CONVERTIR CUALQUIER FECHA A DATE
   ============================================================ */
function convertirFecha(fecha) {
  if (!fecha) return null;
  
  if (typeof fecha.toDate === 'function') {
    return fecha.toDate();
  }
  
  if (typeof fecha === 'object' && fecha.seconds !== undefined) {
    return new Date(fecha.seconds * 1000 + Math.floor((fecha.nanoseconds || 0) / 1000000));
  }
  
  if (fecha instanceof Date) {
    return fecha;
  }
  
  const d = new Date(fecha);
  if (!isNaN(d.getTime())) return d;
  
  return null;
}

/* ============================================================
   CARGAR REPORTE
   ============================================================ */
async function cargarReporte(rango, desdeFecha, hastaFecha) {
  if (unsubscribeRecibos) unsubscribeRecibos();
  if (unsubscribeCierres) unsubscribeCierres();

  totalMontoEl.textContent = '...';
  totalEntregasEl.textContent = 'Buscando...';
  listaMovimientos.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-mute);">⏳ Cargando datos...</div>';

  try {
    let inicio = new Date();
    let fin = new Date();

    if (rango === 'hoy') {
      inicio.setHours(0, 0, 0, 0);
      fin.setHours(23, 59, 59, 999);
    } else if (rango === 'ayer') {
      inicio.setDate(inicio.getDate() - 1);
      inicio.setHours(0, 0, 0, 0);
      fin.setDate(fin.getDate() - 1);
      fin.setHours(23, 59, 59, 999);
    } else if (rango === 'semana') {
      const dia = inicio.getDay() || 7;
      inicio.setDate(inicio.getDate() - dia + 1);
      inicio.setHours(0, 0, 0, 0);
      fin.setHours(23, 59, 59, 999);
    } else if (rango === 'mes') {
      inicio.setDate(1);
      inicio.setHours(0, 0, 0, 0);
      fin.setHours(23, 59, 59, 999);
    } else if (rango === 'custom') {
      inicio = new Date(desdeFecha + 'T00:00:00');
      fin = new Date(hastaFecha + 'T23:59:59');
    }

    const diaInicio = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());
    const diaFin = new Date(fin.getFullYear(), fin.getMonth(), fin.getDate());

    const opcionesFecha = { day: '2-digit', month: 'short' };
    headerSubtitle.textContent = `${inicio.toLocaleDateString('es-BO', opcionesFecha)} - ${fin.toLocaleDateString('es-BO', opcionesFecha)}`;

    let datosRecibos = [];
    let datosCierres = [];

    const procesarYRenderizar = () => {
      const todosLosDatos = [...datosRecibos, ...datosCierres];
      todosLosDatos.sort((a, b) => b.fechaReal - a.fechaReal);
      datosActuales = todosLosDatos;
      renderizarReporte(todosLosDatos);
      document.getElementById('appLoader')?.classList.add('hidden');
    };

    // 1. Escuchar Recibos
    const qRecibos = query(
      collection(db, 'recibos'),
      where('estadoOrden', '==', 'entregado'),
      limit(500)
    );

    unsubscribeRecibos = onSnapshot(qRecibos, (snapshot) => {
      datosRecibos = [];
      snapshot.forEach(doc => {
        const d = doc.data();
        
        // 🔥 PRIORIDAD ABSOLUTA: fechaEditada > fechaEntrega > fecha
        let fechaD = convertirFecha(d.fechaEditada) 
                  || convertirFecha(d.fechaEntrega) 
                  || convertirFecha(d.fecha);
        
        if (!fechaD) return;

        // 🔥 LOG PARA DEPURAR
        console.log('📅 Recibo:', d.numeroRecibo, '| fechaEditada:', d.fechaEditada, '| fechaD:', fechaD);

        // 🔥 COMPARAMOS SOLO POR DÍA
        const diaRecibo = new Date(fechaD.getFullYear(), fechaD.getMonth(), fechaD.getDate());
        if (diaRecibo >= diaInicio && diaRecibo <= diaFin) {
          datosRecibos.push({
            origen: 'recibo',
            cliente: d.cliente,
            detalle: `${d.marca || ''} ${d.modelo || ''}`,
            montoCobrado: Number(d.montoCobrado) || 0,
            costoRepuesto: Number(d.costoRepuesto) || 0,
            metodoPago: d.metodoPago || 'Efectivo',
            fechaReal: fechaD
          });
        }
      });
      procesarYRenderizar();
    });

    // 2. Escuchar Cierres
    const qCierres = query(collection(db, 'cierres'), limit(500));

    unsubscribeCierres = onSnapshot(qCierres, (snapshot) => {
      datosCierres = [];
      snapshot.forEach(doc => {
        const d = doc.data();
        let fechaD = convertirFecha(d.fecha);
        if (!fechaD) return;

        const diaRecibo = new Date(fechaD.getFullYear(), fechaD.getMonth(), fechaD.getDate());
        if (diaRecibo >= diaInicio && diaRecibo <= diaFin) {
          if (d.ventasInventario && d.ventasInventario.length > 0) {
            d.ventasInventario.forEach(v => {
              datosCierres.push({
                origen: 'cierre',
                cliente: 'Venta de Accesorio',
                detalle: `${v.cantidad}x ${v.nombre}`,
                montoCobrado: Number(v.precio * v.cantidad) || 0,
                costoRepuesto: 0,
                metodoPago: 'Efectivo',
                fechaReal: fechaD
              });
            });
          }
          if (d.extras && d.extras.length > 0) {
            d.extras.forEach(e => {
              if (e.monto > 0) {
                datosCierres.push({
                  origen: 'cierre',
                  cliente: 'Venta Extra',
                  detalle: e.desc || 'Varios',
                  montoCobrado: Number(e.monto) || 0,
                  costoRepuesto: 0,
                  metodoPago: 'Efectivo',
                  fechaReal: fechaD
                });
              }
            });
          }
        }
      });
      procesarYRenderizar();
    });

  } catch (error) {
    console.error('❌ Error al configurar reporte:', error);
    document.getElementById('appLoader')?.classList.add('hidden');
  }
}

/* ============================================================
   RENDERIZAR REPORTE
   ============================================================ */
function renderizarReporte(datos) {
  document.getElementById('appLoader')?.classList.add('hidden');

  if (datos.length === 0) {
    totalMontoEl.textContent = 'Bs. 0.00';
    totalEntregasEl.textContent = '0 ventas';
    totalCostoEl.textContent = 'Bs. 0';
    totalGananciaEl.textContent = 'Bs. 0';
    totalMargenEl.textContent = '0%';
    statPromedioEl.textContent = 'Bs. 0';
    statMaximoEl.textContent = 'Bs. 0';
    metodosGrid.innerHTML = '';
    listaMovimientos.innerHTML = `
      <div style="text-align:center; padding:40px 20px; color:var(--text-mute);">
        <i class="fas fa-inbox" style="font-size:40px; opacity:0.3; margin-bottom:10px; display:block;"></i>
        <h3 style="font-size:15px;">Sin movimientos</h3>
        <p style="font-size:12px;">No hay ventas en este período.</p>
      </div>
    `;
    return;
  }

  let totalMonto = 0;
  let totalCosto = 0;
  let metodos = { efectivo: 0, qr: 0, transferencia: 0, mixto: 0 };
  let maxVenta = 0;
  let movimientosHtml = '';

  for (let i = 0; i < datos.length; i++) {
    const d = datos[i];
    const monto = d.montoCobrado;
    const costo = d.costoRepuesto;
    const metodo = d.metodoPago.toLowerCase();

    totalMonto += monto;
    totalCosto += costo;
    if (monto > maxVenta) maxVenta = monto;

    if (metodo.includes('efectivo')) metodos.efectivo += monto;
    else if (metodo.includes('qr')) metodos.qr += monto;
    else if (metodo.includes('transf')) metodos.transferencia += monto;
    else metodos.mixto += monto;

    const fechaD = d.fechaReal;
    const horaStr = `${String(fechaD.getHours()).padStart(2, '0')}:${String(fechaD.getMinutes()).padStart(2, '0')}`;

    let icono = '🔧';
    if (d.origen === 'cierre') icono = '🛒';

    movimientosHtml += `
      <div class="movimiento">
        <div class="hora">${horaStr}</div>
        <div class="info">
          <div class="cliente">${icono} ${escapeHtml(d.cliente || 'Cliente')}</div>
          <div class="detalle">${escapeHtml(d.detalle || '')} · ${escapeHtml(d.metodoPago)}</div>
        </div>
        <div class="monto">${formatBs(monto)}</div>
      </div>
    `;
  }

  const totalGanancia = totalMonto - totalCosto;
  const margen = totalMonto > 0 ? (totalGanancia / totalMonto) * 100 : 0;
  const promedio = totalMonto / datos.length;

  totalMontoEl.textContent = formatBs(totalMonto);
  totalEntregasEl.textContent = `${datos.length} ventas totales`;
  totalCostoEl.textContent = formatBs(totalCosto);
  totalGananciaEl.textContent = formatBs(totalGanancia);
  totalMargenEl.textContent = `${margen.toFixed(1)}%`;
  statPromedioEl.textContent = formatBs(promedio);
  statMaximoEl.textContent = formatBs(maxVenta);

  metodosGrid.innerHTML = `
    <div class="metodo-card"><div class="icono efectivo"><i class="fas fa-money-bill-wave"></i></div><div class="nombre">Efectivo</div><div class="monto">${formatBs(metodos.efectivo)}</div></div>
    <div class="metodo-card"><div class="icono qr"><i class="fas fa-qrcode"></i></div><div class="nombre">QR</div><div class="monto">${formatBs(metodos.qr)}</div></div>
    <div class="metodo-card"><div class="icono transf"><i class="fas fa-building-columns"></i></div><div class="nombre">Transf.</div><div class="monto">${formatBs(metodos.transferencia)}</div></div>
    <div class="metodo-card"><div class="icono mixto"><i class="fas fa-shuffle"></i></div><div class="nombre">Mixto</div><div class="monto">${formatBs(metodos.mixto)}</div></div>
  `;

  listaMovimientos.innerHTML = movimientosHtml;
}

/* ============================================================
   EXPORTAR CSV
   ============================================================ */
function exportarCSV() {
  haptic(15);

  if (!datosActuales || datosActuales.length === 0) {
    toast('No hay datos para exportar', 'warning');
    return;
  }

  let csv = 'Fecha;Hora;Tipo;Cliente;Detalle;Metodo Pago;Monto\n';

  datosActuales.forEach(d => {
    const fechaD = d.fechaReal;
    const fechaStr = `${String(fechaD.getDate()).padStart(2, '0')}/${String(fechaD.getMonth() + 1).padStart(2, '0')}/${fechaD.getFullYear()}`;
    const horaStr = `${String(fechaD.getHours()).padStart(2, '0')}:${String(fechaD.getMinutes()).padStart(2, '0')}`;
    const tipo = d.origen === 'cierre' ? 'Accesorio/Extra' : 'Reparacion/Venta';

    const cliente = String(d.cliente || '').replace(/;/g, ',');
    const detalle = String(d.detalle || '').replace(/;/g, ',');
    const metodo = String(d.metodoPago || '').replace(/;/g, ',');
    const monto = Number(d.montoCobrado).toFixed(2);

    csv += `${fechaStr};${horaStr};${tipo};${cliente};${detalle};${metodo};${monto}\n`;
  });

  const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `Reporte_${new Date().toISOString().slice(0,10)}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  toast('CSV exportado correctamente', 'success');
}
