/* ============================================================
   DR. XIAOMI · REPORTES OPTIMIZADOS (MÓVILES iOS/ANDROID)
   Archivo: app/reportes/reportes.js
   ============================================================ */

import { requireAuth, logout } from '/js/app-auth.js';
import { toast, haptic, initTheme, formatBs, escapeHtml } from '/js/app-ui.js';
import { db } from '/js/firebase.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

initTheme();
let sesion = null;
let rangoActual = 'hoy';

// Elementos del DOM (los IDs exactos de tu HTML)
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
}

async function cargarReporte(rango, desdeFecha, hastaFecha) {
  // Mostramos estado de carga en los campos
  totalMontoEl.textContent = '...';
  totalEntregasEl.textContent = 'Buscando...';
  listaMovimientos.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-3);">⏳ Cargando datos...</div>';

  try {
    let inicio = new Date();
    let fin = new Date();

    // Calcular fechas
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

    const opcionesFecha = { day: '2-digit', month: 'short' };
    headerSubtitle.textContent = `${inicio.toLocaleDateString('es-BO', opcionesFecha)} - ${fin.toLocaleDateString('es-BO', opcionesFecha)}`;

    // 🔥 CONSULTA SENCILLA: Traemos los recibos sin where (para evitar índices)
    const snapshot = await getDocs(collection(db, 'recibos'));
    console.log(`📡 Recibos descargados: ${snapshot.size}`);

    const datos = [];

    // Recorremos y filtramos manualmente en el celular
    snapshot.forEach(doc => {
      const d = doc.data();
      
      // Solo procesamos los entregados
      if (d.estadoOrden !== 'entregado') return;

      // Fecha válida
      let fechaValida = d.fechaEntrega || d.fecha;
      let fechaD = new Date();
      if (fechaValida) {
        if (typeof fechaValida.toDate === 'function') fechaD = fechaValida.toDate();
        else fechaD = new Date(fechaValida);
      }

      // Filtramos por el rango de fechas
      if (fechaD >= inicio && fechaD <= fin) {
        datos.push({
          numeroRecibo: d.numeroRecibo,
          cliente: d.cliente,
          marca: d.marca,
          modelo: d.modelo,
          montoCobrado: Number(d.montoCobrado) || 0,
          costoRepuesto: Number(d.costoRepuesto) || 0,
          metodoPago: d.metodoPago || 'Efectivo',
          fechaReal: fechaD
        });
      }
    });

    // Ordenar del más reciente al más antiguo
    datos.sort((a, b) => b.fechaReal - a.fechaReal);
    console.log(`✅ Entregas encontradas en rango: ${datos.length}`);

    renderizarReporte(datos);

  } catch (error) {
    console.error('Error al cargar reporte:', error);
    totalMontoEl.textContent = 'Bs. 0.00';
    totalEntregasEl.textContent = 'Error';
    listaMovimientos.innerHTML = `
      <div style="text-align:center; padding:20px; color:#EF4444;">
        <i class="fas fa-exclamation-triangle" style="font-size:30px; margin-bottom:10px;"></i>
        <h3>Error de conexión</h3>
        <p style="font-size:12px;">${error.message}</p>
        <button onclick="location.reload()" style="margin-top:10px; padding:10px 20px; border-radius:8px; background:var(--brand-500); color:white; border:none; font-weight:bold;">Reintentar</button>
      </div>
    `;
  }
}

function renderizarReporte(datos) {
  if (datos.length === 0) {
    totalMontoEl.textContent = 'Bs. 0.00';
    totalEntregasEl.textContent = '0 entregas';
    totalCostoEl.textContent = 'Bs. 0';
    totalGananciaEl.textContent = 'Bs. 0';
    totalMargenEl.textContent = '0%';
    statPromedioEl.textContent = 'Bs. 0';
    statMaximoEl.textContent = 'Bs. 0';
    metodosGrid.innerHTML = '';
    listaMovimientos.innerHTML = `
      <div style="text-align:center; padding:40px 20px; color:var(--text-3);">
        <i class="fas fa-inbox" style="font-size:40px; opacity:0.3; margin-bottom:10px; display:block;"></i>
        <h3 style="font-size:15px;">Sin movimientos</h3>
        <p style="font-size:12px;">No hay ventas entregadas en este período.</p>
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

    movimientosHtml += `
      <div class="movimiento">
        <div class="hora">${horaStr}</div>
        <div class="info">
          <div class="cliente">${escapeHtml(d.cliente || 'Cliente')}</div>
          <div class="detalle">${escapeHtml(d.marca || '')} ${escapeHtml(d.modelo || '')} · ${escapeHtml(d.metodoPago)}</div>
        </div>
        <div class="monto">${formatBs(monto)}</div>
      </div>
    `;
  }

  const totalGanancia = totalMonto - totalCosto;
  const margen = totalMonto > 0 ? (totalGanancia / totalMonto) * 100 : 0;
  const promedio = totalMonto / datos.length;

  // Inyectar en el HTML
  totalMontoEl.textContent = formatBs(totalMonto);
  totalEntregasEl.textContent = `${datos.length} entregas`;
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

// Exportar CSV
function exportarCSV(datos) {
  haptic(15);
  if (datos.length === 0) return toast('No hay datos para exportar', 'warning');

  let csvContent = "Recibo,Cliente,Equipo,Cobrado,Costo,Ganancia,Metodo,Fecha\n";

  datos.forEach(d => {
    const monto = Number(d.montoCobrado) || 0;
    const costo = Number(d.costoRepuesto) || 0;
    const ganancia = monto - costo;
    
    const fechaD = d.fechaReal;
    const fechaStr = `${String(fechaD.getDate()).padStart(2,'0')}/${String(fechaD.getMonth()+1).padStart(2,'0')}/${fechaD.getFullYear()}`;
    
    csvContent += `"${d.numeroRecibo || ''}","${d.cliente || ''}","${d.marca || ''} ${d.modelo || ''}",${monto},${costo},${ganancia},"${d.metodoPago || 'Efectivo'}","${fechaStr}"\n`;
  });

  const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
  
  if (navigator.msSaveBlob) {
    navigator.msSaveBlob(blob, 'Reporte_DR_Xiaomi.csv');
    return;
  }

  const link = document.createElement("a");
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "Reporte_DR_Xiaomi.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
