/* ============================================================
   DR. XIAOMI · REPORTES (CACHÉ + NUBE EN TIEMPO REAL)
   Archivo: app/reportes/reportes.js
   ============================================================ */

import { requireAuth, logout } from '/js/app-auth.js';
import { toast, haptic, initTheme, formatBs, escapeHtml } from '/js/app-ui.js';
import { db } from '/js/firebase.js';
import { collection, query, where, onSnapshot, limit } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

initTheme();
let sesion = null;
let rangoActual = 'hoy';
let unsubscribe = null;

// Elementos del DOM
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
}

async function cargarReporte(rango, desdeFecha, hastaFecha) {
  // Detenemos cualquier escucha anterior
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }

  totalMontoEl.textContent = '...';
  totalEntregasEl.textContent = 'Buscando...';
  listaMovimientos.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-3);">⏳ Cargando datos...</div>';

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

    // 🔥 CONSULTA OPTIMIZADA CON CACHÉ + TIEMPO REAL
    const q = query(
      collection(db, 'recibos'),
      where('estadoOrden', '==', 'entregado'),
      limit(500)
    );

    unsubscribe = onSnapshot(q, 
      { includeMetadataChanges: true },
      (snapshot) => {
        const source = snapshot.metadata.fromCache ? '💾 Caché' : '☁️ Servidor';
        console.log(`📡 Reportes cargados desde: ${source} (${snapshot.size} entregados)`);

        const datos = [];

        snapshot.forEach(doc => {
          const d = doc.data();
          
          let fechaValida = d.fechaEntrega || d.fecha;
          let fechaD = new Date();
          if (fechaValida) {
            if (typeof fechaValida.toDate === 'function') fechaD = fechaValida.toDate();
            else fechaD = new Date(fechaValida);
          }

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

        datos.sort((a, b) => b.fechaReal - a.fechaReal);
        renderizarReporte(datos);

        // 🔥 APAGAMOS EL LOADER AQUÍ (Cuando ya cargaron los datos)
        document.getElementById('appLoader')?.classList.add('hidden');
      },
      (error) => {
        console.error('❌ Error al cargar reporte:', error);
        totalMontoEl.textContent = 'Bs. 0.00';
        totalEntregasEl.textContent = 'Error';
        listaMovimientos.innerHTML = `
          <div style="text-align:center; padding:20px; color:#EF4444;">
            <i class="fas fa-exclamation-triangle" style="font-size:30px; margin-bottom:10px;"></i>
            <h3>Error de conexión</h3>
            <p style="font-size:12px;">${error.message}</p>
            <button onclick="location.reload()" style="margin-top:10px; padding:10px 20px; border-radius:8px; background:var(--brand); color:white; border:none; font-weight:bold;">Reintentar</button>
          </div>
        `;
        // 🔥 APAGAMOS EL LOADER AQUÍ TAMBIÉN (En caso de error)
        document.getElementById('appLoader')?.classList.add('hidden');
      }
    );

  } catch (error) {
    console.error('❌ Error al configurar reporte:', error);
    // 🔥 APAGAMOS EL LOADER SI FALLA LA CONFIGURACIÓN
    document.getElementById('appLoader')?.classList.add('hidden');
  }
}

function renderizarReporte(datos) {
  // 🔥 APAGAMOS EL LOADER AL INICIO DE ESTA FUNCIÓN PARA ASEGURARNOS
  document.getElementById('appLoader')?.classList.add('hidden');

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
      <div style="text-align:center; padding:40px 20px; color:var(--text-mute);">
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
