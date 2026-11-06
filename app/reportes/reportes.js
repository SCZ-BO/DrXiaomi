/* ============================================================
   DR. XIAOMI · REPORTES PRO (CON GASTOS Y DESGLOSE)
   Archivo: app/reportes/reportes.js
   ============================================================ */

import { requireAuth, logout } from '/js/app-auth.js';
import { toast, haptic, initTheme, formatBs, escapeHtml } from '/js/app-ui.js';
import { db } from '/js/firebase.js';
import { collection, query, onSnapshot, limit } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

initTheme();
let sesion = null;
let rangoActual = 'hoy';
let unsubscribeRecibos = null;
let unsubscribeVentas = null; 
let unsubscribeCierresGastos = null;
let datosActuales = []; // Datos completos del período
let datosFiltrados = []; // Datos filtrados por la pestaña activa
let tabActual = 'todos'; // 'todos', 'servicios', 'accesorios'
let gastosActuales = { pasajes: 0, almuerzo: 0 };

// Elementos del DOM
const headerSubtitle = document.getElementById('headerSubtitle');
const totalMontoEl = document.getElementById('totalMonto');
const totalEntregasEl = document.getElementById('totalEntregas');
const totalCostoEl = document.getElementById('totalCosto');
const totalGananciaEl = document.getElementById('totalGanancia');
const totalGastosEl = document.getElementById('totalGastos');
const totalMargenEl = document.getElementById('totalMargen');
const pagoEfectivoEl = document.getElementById('pagoEfectivo');
const pagoQREl = document.getElementById('pagoQR');
const breakdownChart = document.getElementById('breakdownChart');
const breakdownTotalPct = document.getElementById('breakdownTotalPct');
const breakdownAccesoriosEl = document.getElementById('breakdownAccesorios');
const breakdownServiciosEl = document.getElementById('breakdownServicios');
const listaMovimientos = document.getElementById('listaMovimientos');

requireAuth((s) => {
  sesion = s;
  configurarEventos();
  cargarReporte('hoy');
});

function configurarEventos() {
  document.getElementById('backBtn')?.addEventListener('click', () => window.location.href = '/app/');
  document.getElementById('logoutBtn')?.addEventListener('click', () => logout());
  document.getElementById('refreshBtn')?.addEventListener('click', () => cargarReporte(rangoActual));

  // Filtros de tiempo
  document.querySelectorAll('.time-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      haptic(10);
      document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      rangoActual = btn.dataset.rango;

      if (rangoActual === 'custom') {
        document.getElementById('customDateRow').classList.add('show');
      } else {
        document.getElementById('customDateRow').classList.remove('show');
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

  // Tabs de movimientos
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      haptic(10);
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      tabActual = btn.dataset.tab;
      filtrarYRenderizarMovimientos();
    });
  });

  document.getElementById('btnExportar')?.addEventListener('click', exportarCSV);
  document.getElementById('btnVolverPanel')?.addEventListener('click', () => window.location.href = '/app/');
}

function parsearFecha(fechaObj) {
  if (!fechaObj) return null;
  if (typeof fechaObj.toDate === 'function') return fechaObj.toDate();
  if (fechaObj.seconds !== undefined) return new Date(fechaObj.seconds * 1000);
  const d = new Date(fechaObj);
  return isNaN(d.getTime()) ? null : d;
}

async function cargarReporte(rango, desdeFecha, hastaFecha) {
  if (unsubscribeRecibos) unsubscribeRecibos();
  if (unsubscribeVentas) unsubscribeVentas();
  if (unsubscribeCierresGastos) unsubscribeCierresGastos();

  totalMontoEl.textContent = '...';
  totalEntregasEl.textContent = 'Buscando...';
  listaMovimientos.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Cargando datos...</p></div>';

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
      const dia = inicio.getDay() || 7; // Lunes es 1
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
    let datosVentas = [];
    gastosActuales = { pasajes: 0, almuerzo: 0 };

    const procesarYRenderizar = () => {
      const todosLosDatos = [...datosRecibos, ...datosVentas];
      todosLosDatos.sort((a, b) => b.fechaReal - a.fechaReal);
      datosActuales = todosLosDatos;
      renderizarReporte(todosLosDatos, gastosActuales);
      document.getElementById('appLoader')?.classList.add('hidden');
    };

    // 1. Leer Recibos (Servicios/Reparaciones)
    const qRecibos = query(collection(db, 'recibos'), limit(100));
    unsubscribeRecibos = onSnapshot(qRecibos, (snapshot) => {
      datosRecibos = [];
      snapshot.forEach(doc => {
        const d = doc.data();
        const montoCobrado = Number(d.montoCobrado) || 0;
        const estaEntregado = d.estadoOrden === 'entregado';
        if (!estaEntregado && montoCobrado <= 0) return;

        const fechaD = parsearFecha(d.fechaEditada) || parsearFecha(d.fechaEntrega) || parsearFecha(d.fecha);
        if (!fechaD) return;

        const diaRecibo = new Date(fechaD.getFullYear(), fechaD.getMonth(), fechaD.getDate());
        if (diaRecibo >= diaInicio && diaRecibo <= diaFin) {
          datosRecibos.push({
            origen: 'recibo',
            tipo: 'servicio', // Clasificación para el filtro
            cliente: d.cliente || 'Cliente',
            detalle: `${d.marca || ''} ${d.modelo || ''}`,
            montoCobrado: montoCobrado,
            costoRepuesto: Number(d.costoRepuesto) || 0,
            metodoPago: d.metodoPago || 'Efectivo',
            fechaReal: fechaD,
            numeroRecibo: d.numeroRecibo || ''
          });
        }
      });
      procesarYRenderizar();
    });

    // 2. Leer Ventas (Accesorios y Servicios Rápidos)
    const qVentas = query(collection(db, 'ventas'), limit(100));
    unsubscribeVentas = onSnapshot(qVentas, (snapshot) => {
      datosVentas = [];
      snapshot.forEach(doc => {
        const d = doc.data();
        const fechaD = parsearFecha(d.fecha);
        if (!fechaD) return;

        const diaVenta = new Date(fechaD.getFullYear(), fechaD.getMonth(), fechaD.getDate());
        if (diaVenta >= diaInicio && diaVenta <= diaFin) {
          // Clasificamos como accesorio si el concepto empieza con "Xx " (ej: 1x Pantalla)
          const esAccesorio = /^\d+x\s/.test(d.concepto);
          datosVentas.push({
            origen: 'venta_panel',
            tipo: esAccesorio ? 'accesorio' : 'servicio',
            cliente: 'Venta Rápida',
            detalle: d.concepto,
            montoCobrado: Number(d.monto) || 0,
            costoRepuesto: Number(d.costo) || 0,
            metodoPago: d.metodoPago || 'Efectivo',
            fechaReal: fechaD,
            numeroRecibo: ''
          });
        }
      });
      procesarYRenderizar();
    });

    // 3. Leer Cierres (SOLO para Gastos)
    const qCierres = query(collection(db, 'cierres'), limit(100));
    unsubscribeCierresGastos = onSnapshot(qCierres, (snapshot) => {
      gastosActuales = { pasajes: 0, almuerzo: 0 };
      snapshot.forEach(doc => {
        const d = doc.data();
        const fechaD = parsearFecha(d.fecha);
        if (!fechaD) return;

        const diaCierre = new Date(fechaD.getFullYear(), fechaD.getMonth(), fechaD.getDate());
        if (diaCierre >= diaInicio && diaCierre <= diaFin) {
          gastosActuales.pasajes += Number(d.gastoPasajes) || 0;
          gastosActuales.almuerzo += Number(d.gastoAlmuerzo) || 0;
        }
      });
      procesarYRenderizar();
    });

  } catch (error) {
    console.error('❌ Error al configurar reporte:', error);
    document.getElementById('appLoader')?.classList.add('hidden');
  }
}

function renderizarReporte(datos, gastos) {
  document.getElementById('appLoader')?.classList.add('hidden');

  // 1. Calcular Totales
  let totalMonto = 0;
  let totalCosto = 0;
  let metodos = { efectivo: 0, qr: 0 };
  let totalAccesorios = 0;
  let totalServicios = 0;

  datos.forEach(d => {
    const monto = d.montoCobrado;
    const costo = d.costoRepuesto;
    const metodo = (d.metodoPago || '').toLowerCase();

    totalMonto += monto;
    totalCosto += costo;

    if (metodo.includes('efectivo')) metodos.efectivo += monto;
    else if (metodo.includes('qr')) metodos.qr += monto;

    if (d.tipo === 'accesorio') totalAccesorios += monto;
    else totalServicios += monto;
  });

  const totalGastos = gastos.pasajes + gastos.almuerzo;
  const totalGanancia = totalMonto - totalCosto - totalGastos;
  const margen = totalMonto > 0 ? (totalGanancia / totalMonto) * 100 : 0;

  // 2. Actualizar DOM
  totalMontoEl.textContent = formatBs(totalMonto);
  totalEntregasEl.textContent = `${datos.length} movimientos`;
  totalCostoEl.textContent = formatBs(totalCosto);
  totalGastosEl.textContent = formatBs(totalGastos);
  totalGananciaEl.textContent = formatBs(totalGanancia);
  totalMargenEl.textContent = `${margen.toFixed(1)}%`;
  pagoEfectivoEl.textContent = formatBs(metodos.efectivo);
  pagoQREl.textContent = formatBs(metodos.qr);

  // 3. Gráfico de Dona
  const totalVentas = totalAccesorios + totalServicios;
  const pctAccesorios = totalVentas > 0 ? (totalAccesorios / totalVentas) * 100 : 0;
  breakdownChart.style.setProperty('--p-accesorios', `${pctAccesorios}%`);
  breakdownTotalPct.textContent = `${Math.round(pctAccesorios)}%`;
  breakdownAccesoriosEl.textContent = formatBs(totalAccesorios);
  breakdownServiciosEl.textContent = formatBs(totalServicios);

  // 4. Renderizar Movimientos
  filtrarYRenderizarMovimientos();
}

function filtrarYRenderizarMovimientos() {
  if (tabActual === 'todos') {
    datosFiltrados = datosActuales;
  } else if (tabActual === 'servicios') {
    datosFiltrados = datosActuales.filter(d => d.tipo === 'servicio');
  } else if (tabActual === 'accesorios') {
    datosFiltrados = datosActuales.filter(d => d.tipo === 'accesorio');
  }

  if (datosFiltrados.length === 0) {
    listaMovimientos.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-inbox"></i>
        <p>No hay movimientos en esta categoría.</p>
      </div>
    `;
    return;
  }

  let html = '';
  datosFiltrados.forEach(d => {
    const fechaD = d.fechaReal;
    const horaStr = `${String(fechaD.getHours()).padStart(2, '0')}:${String(fechaD.getMinutes()).padStart(2, '0')}`;
    const fechaStr = `${String(fechaD.getDate()).padStart(2, '0')}/${String(fechaD.getMonth() + 1).padStart(2, '0')}`;
    
    const icono = d.tipo === 'accesorio' ? 'fa-box' : 'fa-wrench';
    const claseIcono = d.tipo === 'accesorio' ? 'venta' : 'recibo';

    html += `
      <div class="movement-item">
        <div class="icon-box ${claseIcono}">
          <i class="fas ${icono}"></i>
        </div>
        <div class="info">
          <div class="title">${escapeHtml(d.cliente || 'Cliente')}</div>
          <div class="subtitle">${escapeHtml(d.detalle || '')} · ${fechaStr} ${horaStr} · ${escapeHtml(d.metodoPago)}</div>
        </div>
        <div class="amount">${formatBs(d.montoCobrado)}</div>
      </div>
    `;
  });

  listaMovimientos.innerHTML = html;
}

function exportarCSV() {
  haptic(15);

  if (!datosActuales || datosActuales.length === 0) {
    toast('No hay datos para exportar', 'warning');
    return;
  }

  let csv = 'Fecha;Hora;Tipo;Cliente;Detalle;Metodo Pago;Monto;Recibo\n';

  datosActuales.forEach(d => {
    const fechaD = d.fechaReal;
    const fechaStr = `${String(fechaD.getDate()).padStart(2, '0')}/${String(fechaD.getMonth() + 1).padStart(2, '0')}/${fechaD.getFullYear()}`;
    const horaStr = `${String(fechaD.getHours()).padStart(2, '0')}:${String(fechaD.getMinutes()).padStart(2, '0')}`;
    
    const tipo = d.tipo === 'accesorio' ? 'Accesorio' : 'Servicio/Reparación';

    const cliente = String(d.cliente || '').replace(/;/g, ',');
    const detalle = String(d.detalle || '').replace(/;/g, ',');
    const metodo = String(d.metodoPago || '').replace(/;/g, ',');
    const monto = Number(d.montoCobrado).toFixed(2);
    const recibo = String(d.numeroRecibo || '').replace(/;/g, ',');

    csv += `${fechaStr};${horaStr};${tipo};${cliente};${detalle};${metodo};${monto};${recibo}\n`;
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
