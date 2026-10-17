/* ============================================================
   DR. XIAOMI · REPORTES OPTIMIZADOS (MÓVILES iOS/ANDROID)
   Archivo: app/reportes/reportes.js
   ============================================================ */

import { requireAuth, logout } from '/js/app-auth.js';
import { toast, haptic, initTheme, formatBs, escapeHtml } from '/js/app-ui.js';
import { db } from '/js/firebase.js';
import { 
  collection, query, where, orderBy, getDocs, limit 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

initTheme();
let sesion = null;
let rangoActual = 'hoy';

const reporteContenido = document.getElementById('reporteContenido');
const headerSubtitle = document.getElementById('headerSubtitle');

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

// 🔥 FUNCIÓN OPTIMIZADA Y COMPATIBLE CON SAFARI
async function cargarReporte(rango, desdeFecha, hastaFecha) {
  reporteContenido.innerHTML = `
    <div style="display:flex; justify-content:center; padding:40px;">
      <div style="border: 3px solid var(--border-1); border-top: 3px solid var(--brand-500); border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite;"></div>
    </div>
  `;

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

    const opcionesFecha = { day: '2-digit', month: 'short' };
    headerSubtitle.textContent = `${inicio.toLocaleDateString('es-BO', opcionesFecha)} - ${fin.toLocaleDateString('es-BO', opcionesFecha)}`;

    const q = query(
      collection(db, 'recibos'),
      where('estadoOrden', '==', 'entregado'),
      where('fechaEntrega', '>=', inicio),
      where('fechaEntrega', '<=', fin),
      orderBy('fechaEntrega', 'desc'),
      limit(100) 
    );

    const snapshot = await getDocs(q);
    
    const datos = snapshot.docs.map(doc => {
      const d = doc.data();
      return {
        numeroRecibo: d.numeroRecibo,
        cliente: d.cliente,
        marca: d.marca,
        modelo: d.modelo,
        montoCobrado: d.montoCobrado,
        costoRepuesto: d.costoRepuesto,
        metodoPago: d.metodoPago,
        fechaEntrega: d.fechaEntrega
      };
    });

    renderizarReporte(datos);

  } catch (error) {
    console.error('Error al cargar reporte:', error);
    reporteContenido.innerHTML = `
      <div style="text-align:center; padding:40px 20px; color:var(--text-3);">
        <i class="fas fa-exclamation-triangle" style="font-size:32px; color:#EF4444; margin-bottom:10px;"></i>
        <h3>Error al cargar</h3>
        <p style="font-size:12px; margin-bottom:10px;">${error.message}</p>
        <button onclick="location.reload()" style="padding:10px 20px; border-radius:8px; background:var(--brand-500); color:white; border:none; font-weight:bold;">Reintentar</button>
      </div>
    `;
  }
}

function renderizarReporte(datos) {
  if (datos.length === 0) {
    reporteContenido.innerHTML = `
      <div style="text-align:center; padding:60px 20px; color:var(--text-3);">
        <i class="fas fa-inbox" style="font-size:48px; opacity:0.3; margin-bottom:12px; display:block;"></i>
        <h3>Sin movimientos</h3>
        <p style="font-size:13px;">No hay ventas entregadas en este período.</p>
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
    const monto = Number(d.montoCobrado) || 0;
    const costo = Number(d.costoRepuesto) || 0;
    const metodo = (d.metodoPago || 'Efectivo').toLowerCase();

    totalMonto += monto;
    totalCosto += costo;
    if (monto > maxVenta) maxVenta = monto;

    if (metodo.includes('efectivo')) metodos.efectivo += monto;
    else if (metodo.includes('qr')) metodos.qr += monto;
    else if (metodo.includes('transf')) metodos.transferencia += monto;
    else metodos.mixto += monto;

    // 🔥 COMPATIBILIDAD CON SAFARI (Fecha segura)
    let fechaD = new Date();
    if (d.fechaEntrega) {
      if (typeof d.fechaEntrega.toDate === 'function') {
        fechaD = d.fechaEntrega.toDate(); // Firebase Timestamp
      } else {
        fechaD = new Date(d.fechaEntrega); // String o Date
      }
    }
    
    const horaStr = `${String(fechaD.getHours()).padStart(2, '0')}:${String(fechaD.getMinutes()).padStart(2, '0')}`;

    movimientosHtml += `
      <div class="movimiento">
        <div class="hora">${horaStr}</div>
        <div class="info">
          <div class="cliente">${escapeHtml(d.cliente || 'Cliente')}</div>
          <div class="detalle">${escapeHtml(d.marca || '')} ${escapeHtml(d.modelo || '')} · ${escapeHtml(d.metodoPago || 'Efectivo')}</div>
        </div>
        <div class="monto">${formatBs(monto)}</div>
      </div>
    `;
  }

  const totalGanancia = totalMonto - totalCosto;
  const margen = totalMonto > 0 ? (totalGanancia / totalMonto) * 100 : 0;
  const promedio = totalMonto / datos.length;

  reporteContenido.innerHTML = `
    <div class="total-card">
      <div class="label">Total cobrado</div>
      <div class="valor">${formatBs(totalMonto)}</div>
      <div class="sub">${datos.length} entregas</div>
    </div>

    <div class="costos-grid">
      <div class="costo-card costos">
        <div class="valor">${formatBs(totalCosto)}</div>
        <div class="label">Costos</div>
      </div>
      <div class="costo-card ganancia">
        <div class="valor">${formatBs(totalGanancia)}</div>
        <div class="label">Ganancia neta</div>
      </div>
    </div>

    <div class="margen-card">
      <div class="valor">${margen.toFixed(1)}%</div>
      <div class="label">Margen de ganancia</div>
      <div class="helper">(Ganancia / Total cobrado)</div>
    </div>

    <div class="mini-stats">
      <div class="mini-stat">
        <div class="valor">${formatBs(promedio)}</div>
        <div class="label">Promedio</div>
      </div>
      <div class="mini-stat">
        <div class="valor">${formatBs(maxVenta)}</div>
        <div class="label">Mayor venta</div>
      </div>
    </div>

    <h3 style="font-size:12px; font-weight:800; color:var(--brand-500); text-transform:uppercase; letter-spacing:0.6px; margin-bottom:12px;">
      Por método de pago
    </h3>
    <div class="metodos-grid">
      <div class="metodo-card"><div class="icono efectivo"><i class="fas fa-money-bill-wave"></i></div><div class="nombre">Efectivo</div><div class="monto">${formatBs(metodos.efectivo)}</div></div>
      <div class="metodo-card"><div class="icono qr"><i class="fas fa-qrcode"></i></div><div class="nombre">QR</div><div class="monto">${formatBs(metodos.qr)}</div></div>
      <div class="metodo-card"><div class="icono transf"><i class="fas fa-building-columns"></i></div><div class="nombre">Transf.</div><div class="monto">${formatBs(metodos.transferencia)}</div></div>
      <div class="metodo-card"><div class="icono mixto"><i class="fas fa-shuffle"></i></div><div class="nombre">Mixto</div><div class="monto">${formatBs(metodos.mixto)}</div></div>
    </div>

    <h3 style="font-size:12px; font-weight:800; color:var(--brand-500); text-transform:uppercase; letter-spacing:0.6px; margin-bottom:12px;">
      Movimientos
    </h3>
    <div style="max-height: 400px; overflow-y: auto; -webkit-overflow-scrolling: touch;">
      ${movimientosHtml}
    </div>

    <button class="btn-export" id="btnExportar">
      <i class="fas fa-download"></i> Exportar a CSV
    </button>

    <button class="btn-back-panel" id="btnVolverPanel">
      <i class="fas fa-home"></i> VOLVER AL PANEL
    </button>
  `;

  document.getElementById('btnVolverPanel')?.addEventListener('click', () => window.location.href = '/app/');
  document.getElementById('btnExportar')?.addEventListener('click', () => exportarCSV(datos));
}

// 🔥 EXPORTAR CSV COMPATIBLE CON SAFARI (iOS)
function exportarCSV(datos) {
  haptic(15);
  if (datos.length === 0) return toast('No hay datos para exportar', 'warning');

  // En Safari móvil, el formato de descarga es más estricto
  let csvContent = "Recibo,Cliente,Equipo,Cobrado,Costo,Ganancia,Metodo,Fecha\n";

  datos.forEach(d => {
    const monto = Number(d.montoCobrado) || 0;
    const costo = Number(d.costoRepuesto) || 0;
    const ganancia = monto - costo;
    
    let fechaD = new Date();
    if (d.fechaEntrega) {
      if (typeof d.fechaEntrega.toDate === 'function') fechaD = d.fechaEntrega.toDate();
      else fechaD = new Date(d.fechaEntrega);
    }
    
    const fechaStr = `${String(fechaD.getDate()).padStart(2,'0')}/${String(fechaD.getMonth()+1).padStart(2,'0')}/${fechaD.getFullYear()}`;
    
    csvContent += `"${d.numeroRecibo || ''}","${d.cliente || ''}","${d.marca || ''} ${d.modelo || ''}",${monto},${costo},${ganancia},"${d.metodoPago || 'Efectivo'}","${fechaStr}"\n`;
  });

  // Truco para que Safari y Chrome descarguen el archivo de forma nativa
  const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
  
  if (navigator.msSaveBlob) { // Para IE/Edge antiguo
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
