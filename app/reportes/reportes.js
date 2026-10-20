/* ============================================================
   DR. XIAOMI · REPORTES (VERSIÓN FINAL CORREGIDA v13)
   Archivo: app/reportes/reportes.js
   ARREGLO: Ahora respeta la fecha editada manualmente.
   ============================================================ */

import { requireAuth, logout } from '/js/app-auth.js';
import { toast, haptic, initTheme, formatBs, escapeHtml } from '/js/app-ui.js';
import { db } from '/js/firebase.js';
import { collection, query, onSnapshot, limit, doc, updateDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

initTheme();
let sesion = null;
let rangoActual = 'hoy';
let unsubscribeRecibos = null;
let unsubscribeCierres = null;
let unsubscribeVentas = null; 
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

// UTILIDAD PARA LEER CUALQUIER TIPO DE FECHA
function parsearFecha(fechaObj) {
  if (!fechaObj) return null;
  if (typeof fechaObj.toDate === 'function') return fechaObj.toDate();
  if (fechaObj.seconds !== undefined) return new Date(fechaObj.seconds * 1000);
  const d = new Date(fechaObj);
  return isNaN(d.getTime()) ? null : d;
}

/* ============================================================
   CARGAR REPORTE
   ============================================================ */
async function cargarReporte(rango, desdeFecha, hastaFecha) {
  if (unsubscribeRecibos) unsubscribeRecibos();
  if (unsubscribeCierres) unsubscribeCierres();
  if (unsubscribeVentas) unsubscribeVentas();

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
    let datosVentas = [];

    const procesarYRenderizar = () => {
      const todosLosDatos = [...datosRecibos, ...datosCierres, ...datosVentas];
      todosLosDatos.sort((a, b) => b.fechaReal - a.fechaReal);
      datosActuales = todosLosDatos;
      renderizarReporte(todosLosDatos);
      document.getElementById('appLoader')?.classList.add('hidden');
    };

    // 1. Escuchar Recibos
    const qRecibos = query(collection(db, 'recibos'), limit(500));
    unsubscribeRecibos = onSnapshot(qRecibos, (snapshot) => {
      datosRecibos = [];
      snapshot.forEach(doc => {
        const d = doc.data();
        const montoCobrado = Number(d.montoCobrado) || 0;
        const estaEntregado = d.estadoOrden === 'entregado';
        if (!estaEntregado && montoCobrado <= 0) return;

        // 🔥 AQUÍ ESTÁ EL ARREGLO: Leer primero 'fechaEditada'
        const fechaD = parsearFecha(d.fechaEditada) || parsearFecha(d.fechaEntrega) || parsearFecha(d.fecha);
        if (!fechaD) return;

        const diaRecibo = new Date(fechaD.getFullYear(), fechaD.getMonth(), fechaD.getDate());
        if (diaRecibo >= diaInicio && diaRecibo <= diaFin) {
          datosRecibos.push({
            id: doc.id,
            origen: 'recibo',
            coleccion: 'recibos',
            cliente: d.cliente || 'Cliente',
            detalle: `${d.marca || ''} ${d.modelo || ''}`,
            montoCobrado: montoCobrado,
            costoRepuesto: Number(d.costoRepuesto) || 0,
            metodoPago: d.metodoPago || 'Efectivo',
            fechaReal: fechaD,
            numeroRecibo: d.numeroRecibo || '',
            estadoOrden: d.estadoOrden || 'recibido'
          });
        }
      });
      procesarYRenderizar();
    });

    // 2. Escuchar Ventas Rápidas (Panel)
    const qVentas = query(collection(db, 'ventas'), limit(500));
    unsubscribeVentas = onSnapshot(qVentas, (snapshot) => {
      datosVentas = [];
      snapshot.forEach(doc => {
        const d = doc.data();
        const fechaD = parsearFecha(d.fecha);
        if (!fechaD) return;

        const diaVenta = new Date(fechaD.getFullYear(), fechaD.getMonth(), fechaD.getDate());
        if (diaVenta >= diaInicio && diaVenta <= diaFin) {
          datosVentas.push({
            id: doc.id,
            origen: 'venta_panel',
            coleccion: 'ventas',
            cliente: 'Venta Rápida',
            detalle: d.concepto,
            montoCobrado: Number(d.monto) || 0,
            costoRepuesto: 0,
            metodoPago: d.metodoPago || 'Efectivo',
            fechaReal: fechaD,
            numeroRecibo: '',
            estadoOrden: 'entregado'
          });
        }
      });
      procesarYRenderizar();
    });

    // 3. Escuchar Cierres (Ventas Extras antiguas)
    const qCierres = query(collection(db, 'cierres'), limit(500));
    unsubscribeCierres = onSnapshot(qCierres, (snapshot) => {
      datosCierres = [];
      snapshot.forEach(doc => {
        const d = doc.data();
        const fechaD = parsearFecha(d.fecha);
        if (!fechaD) return;

        const diaRecibo = new Date(fechaD.getFullYear(), fechaD.getMonth(), fechaD.getDate());
        if (diaRecibo >= diaInicio && diaRecibo <= diaFin) {
          if (d.ventasInventario && d.ventasInventario.length > 0) {
            d.ventasInventario.forEach((v, index) => {
              datosCierres.push({
                id: doc.id,
                indexExtra: `inv_${index}`,
                origen: 'cierre',
                coleccion: 'cierres',
                cliente: 'Venta de Accesorio',
                detalle: `${v.cantidad}x ${v.nombre}`,
                montoCobrado: Number(v.precio * v.cantidad) || 0,
                costoRepuesto: 0,
                metodoPago: 'Efectivo',
                fechaReal: fechaD,
                numeroRecibo: '',
                estadoOrden: 'entregado'
              });
            });
          }
          if (d.extras && d.extras.length > 0) {
            d.extras.forEach((e, index) => {
              if (e.monto > 0) {
                datosCierres.push({
                  id: doc.id,
                  indexExtra: `ext_${index}`,
                  origen: 'cierre',
                  coleccion: 'cierres',
                  cliente: 'Venta Extra',
                  detalle: e.desc || 'Varios',
                  montoCobrado: Number(e.monto) || 0,
                  costoRepuesto: 0,
                  metodoPago: 'Efectivo',
                  fechaReal: fechaD,
                  numeroRecibo: '',
                  estadoOrden: 'entregado'
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
    const ganancia = monto - costo;
    const metodo = (d.metodoPago || '').toLowerCase();

    totalMonto += monto;
    totalCosto += costo;
    if (monto > maxVenta) maxVenta = monto;

    if (metodo.includes('efectivo')) metodos.efectivo += monto;
    else if (metodo.includes('qr')) metodos.qr += monto;
    else if (metodo.includes('transf')) metodos.transferencia += monto;
    else metodos.mixto += monto;

    const fechaD = d.fechaReal;
    const horaStr = `${String(fechaD.getHours()).padStart(2, '0')}:${String(fechaD.getMinutes()).padStart(2, '0')}`;
    const fechaStr = `${String(fechaD.getDate()).padStart(2, '0')}/${String(fechaD.getMonth() + 1).padStart(2, '0')}`;

    let icono = '🔧';
    if (d.origen === 'cierre') icono = '🛒';
    else if (d.origen === 'venta_panel') icono = '⚡';

    movimientosHtml += `
      <div class="movimiento" style="position: relative;">
        <div class="hora">${fechaStr}<br>${horaStr}</div>
        <div class="info">
          <div class="cliente">${icono} ${escapeHtml(d.cliente || 'Cliente')}</div>
          <div class="detalle">${escapeHtml(d.detalle || '')} · ${escapeHtml(d.metodoPago)}${d.numeroRecibo ? ` · ${escapeHtml(d.numeroRecibo)}` : ''}</div>
          
          <div style="font-size: 11px; margin-top: 4px; display: flex; gap: 8px;">
            ${costo > 0 ? `<span style="color: #F59E0B;">Costo: ${formatBs(costo)}</span>` : ''}
            <span style="color: #22C55E; font-weight: 700;">Ganancia: ${formatBs(ganancia)}</span>
          </div>
        </div>
        
        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
          <div class="monto">${formatBs(monto)}</div>
          <div style="display: flex; gap: 6px; margin-top: 4px;">
            <button class="btn-edit-mov" data-id="${d.id}" data-origen="${d.origen}" data-coleccion="${d.coleccion}" data-extra="${d.indexExtra || ''}" style="background: rgba(59,130,246,0.1); color: #3B82F6; border: 1px solid #3B82F6; border-radius: 4px; padding: 4px 8px; font-size: 10px; cursor: pointer;">
              <i class="fas fa-edit"></i>
            </button>
            <button class="btn-del-mov" data-id="${d.id}" data-origen="${d.origen}" data-coleccion="${d.coleccion}" data-extra="${d.indexExtra || ''}" style="background: rgba(239,68,68,0.1); color: #EF4444; border: 1px solid #EF4444; border-radius: 4px; padding: 4px 8px; font-size: 10px; cursor: pointer;">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
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

  document.querySelectorAll('.btn-del-mov').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const coleccion = btn.dataset.coleccion;
      const extra = btn.dataset.extra;

      if (!confirm('¿Seguro que deseas eliminar este registro? Esta acción no se puede deshacer.')) return;
      
      haptic(20);
      try {
        if (extra) {
          toast('Para borrar extras de cierres, hazlo desde Cierre de Caja.', 'warning', 3000);
        } else {
          await deleteDoc(doc(db, coleccion, id));
          toast('Registro eliminado', 'success');
        }
      } catch (err) {
        console.error(err);
        toast('Error al eliminar', 'error');
      }
    });
  });

  document.querySelectorAll('.btn-edit-mov').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const coleccion = btn.dataset.coleccion;
      const extra = btn.dataset.extra;
      const registro = datosActuales.find(d => d.id === id && d.indexExtra === extra);
      
      if (!registro) return;
      abrirModalEdicion(registro);
    });
  });
}

/* ============================================================
   MODAL DE EDICIÓN
   ============================================================ */
function abrirModalEdicion(registro) {
  if (registro.origen === 'cierre') {
    toast('Los cierres antiguos no se pueden editar desde aquí.', 'warning');
    return;
  }

  haptic(15);
  const modal = document.createElement('div');
  modal.className = 'sheet-backdrop';
  modal.id = 'modalEdicion';
  modal.style.display = 'flex';

  const esRecibo = registro.origen === 'recibo';

  modal.innerHTML = `
    <div class="sheet">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h3 style="font-size: 18px; font-weight: 800;">Editar ${esRecibo ? 'Recibo' : 'Venta'}</h3>
        <button class="icon-btn" id="btnCloseEdit" style="background: var(--bg-elev);"><i class="fas fa-times"></i></button>
      </div>
      
      <div class="input-group">
        <label>Cliente / Concepto</label>
        <input type="text" id="editCliente" class="form-control" value="${escapeHtml(registro.cliente)}" ${!esRecibo ? 'readonly style="opacity:0.5;"' : ''}>
      </div>

      <div class="input-group">
        <label>Detalle</label>
        <input type="text" id="editDetalle" class="form-control" value="${escapeHtml(registro.detalle)}">
      </div>

      <div class="input-group">
        <label>Monto Cobrado (Bs.)</label>
        <input type="number" id="editMonto" class="form-control" value="${registro.montoCobrado}">
      </div>

      <div class="input-group">
        <label>Costo del Repuesto (Bs.)</label>
        <input type="number" id="editCosto" class="form-control" value="${registro.costoRepuesto}">
      </div>

      <div class="input-group">
        <label>Método de Pago</label>
        <select id="editMetodo" class="form-control">
          <option value="Efectivo" ${registro.metodoPago === 'Efectivo' ? 'selected' : ''}>💵 Efectivo</option>
          <option value="QR" ${registro.metodoPago === 'QR' ? 'selected' : ''}>📱 QR</option>
          <option value="Transferencia" ${registro.metodoPago === 'Transferencia' ? 'selected' : ''}>🏦 Transferencia</option>
          <option value="Mixto" ${registro.metodoPago.includes('Mixto') ? 'selected' : ''}>🔀 Mixto</option>
        </select>
      </div>

      <button class="btn-sheet btn-sheet-primary" id="btnSaveEdit">
        <i class="fas fa-save"></i> Guardar Cambios
      </button>
    </div>
  `;

  document.body.appendChild(modal);
  setTimeout(() => modal.classList.add('show'), 10);

  const cerrar = () => {
    modal.classList.remove('show');
    setTimeout(() => modal.remove(), 300);
  };

  document.getElementById('btnCloseEdit').addEventListener('click', cerrar);
  modal.addEventListener('click', (e) => { if (e.target === modal) cerrar(); });

  document.getElementById('btnSaveEdit').addEventListener('click', async () => {
    const nuevoMonto = parseFloat(document.getElementById('editMonto').value) || 0;
    const nuevoCosto = parseFloat(document.getElementById('editCosto').value) || 0;
    const nuevoDetalle = document.getElementById('editDetalle').value.trim();
    const nuevoMetodo = document.getElementById('editMetodo').value;
    
    haptic(20);
    try {
      if (esRecibo) {
        const nuevoCliente = document.getElementById('editCliente').value.trim();
        await updateDoc(doc(db, 'recibos', registro.id), {
          cliente: nuevoCliente,
          montoCobrado: nuevoMonto,
          costoRepuesto: nuevoCosto,
          metodoPago: nuevoMetodo,
          actualizadoEn: serverTimestamp()
        });
      } else {
        await updateDoc(doc(db, 'ventas', registro.id), {
          monto: nuevoMonto,
          metodoPago: nuevoMetodo,
          concepto: nuevoDetalle
        });
      }
      toast('Cambios guardados', 'success');
      cerrar();
    } catch (err) {
      console.error(err);
      toast('Error al guardar', 'error');
    }
  });
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

  let csv = 'Fecha;Hora;Tipo;Cliente;Detalle;Metodo Pago;Monto;Recibo\n';

  datosActuales.forEach(d => {
    const fechaD = d.fechaReal;
    const fechaStr = `${String(fechaD.getDate()).padStart(2, '0')}/${String(fechaD.getMonth() + 1).padStart(2, '0')}/${fechaD.getFullYear()}`;
    const horaStr = `${String(fechaD.getHours()).padStart(2, '0')}:${String(fechaD.getMinutes()).padStart(2, '0')}`;
    
    let tipo = 'Reparacion/Venta';
    if (d.origen === 'cierre') tipo = 'Accesorio/Extra';
    else if (d.origen === 'venta_panel') tipo = 'Venta Rápida';

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
