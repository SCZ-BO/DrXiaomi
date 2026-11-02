// ============================================================
// DR. XIAOMI · PANEL LOGIC
// Archivo: /app/js/panel.js
// ============================================================

import { initLayout, toast, haptic, tiempoRelativo, escapeHtml } from './app-ui.js';
import { requireAuth, logout } from './app-auth.js'; 
import { db } from './firebase.js';
import { collection, query, onSnapshot, limit, doc, updateDoc, deleteDoc, addDoc, serverTimestamp, orderBy } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// 1. INICIALIZAR LAYOUT
initLayout('Panel', 'Cargando...', 'home', '/');

let sesion = null, ordenes = [], ventasHoy = [], filtroActual = 'todos', busquedaActual = '';
let unsubscribe = null, unsubscribeVentas = null, unsubscribeCierres = null; 
let ordenAEntregar = null, metodoPagoSeleccionado = null, todosLosMovimientos = [];
let paginaActual = 1;
const ITEMS_POR_PAGINA = 12;
let ventasPanel = [], ventasCierre = [];

const reciboSheet = document.getElementById('reciboSheet');
const modalVenta = document.getElementById('modalVenta');
const modalPago = document.getElementById('modalPago');
const sheetContent = document.getElementById('sheetContent');
const paginationContainer = document.getElementById('paginationContainer');
const appLoader = document.getElementById('appLoader');

// 2. AUTENTICACIÓN
if (typeof requireAuth === 'function') {
  requireAuth((s) => {
    sesion = s;
    setTimeout(() => { 
      iniciarApp(); 
      const subtitle = document.querySelector('.brand-text p');
      if (subtitle) subtitle.textContent = sesion.nombre;
    }, 500);
  });
} else { setTimeout(() => { iniciarApp(); }, 500); }

function iniciarApp() {
  configurarPermisosPorRol();
  configurarEventos();
  cargarDatos();
}

function configurarPermisosPorRol() {
  if (sesion?.rol !== 'admin') {
    const btnReportes = document.querySelector('.nav-item[href="/app/reportes/"]');
    if (btnReportes) btnReportes.style.display = 'none';
  }
}

function parsearFecha(f) {
  if (!f) return null;
  if (typeof f.toDate === 'function') return f.toDate();
  if (f.seconds !== undefined) return new Date(f.seconds * 1000);
  const d = new Date(f); return isNaN(d.getTime()) ? null : d;
}

function formatBsLimpio(n) {
  const v = Number(n) || 0;
  return v === Math.floor(v) ? `Bs. ${v}` : `Bs. ${v.toFixed(2)}`;
}

function formatFechaCompleta(f) {
  let d = parsearFecha(f); if (!d) return 'Reciente';
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} a las ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

// 3. EVENTOS
function configurarEventos() {
  document.getElementById('nuevoReciboBtn').addEventListener('click', () => { haptic(15); window.location.href = '/cliente/'; });
  document.getElementById('ventaRapidaBtn').addEventListener('click', () => { haptic(15); modalVenta.classList.add('show'); });
  document.getElementById('btnCloseVenta')?.addEventListener('click', () => modalVenta.classList.remove('show'));
  modalVenta?.addEventListener('click', (e) => { if (e.target === modalVenta) modalVenta.classList.remove('show'); });
  
  document.getElementById('ventaConcepto')?.addEventListener('change', (e) => {
    const w = document.getElementById('wrapConceptoOtro');
    if (e.target.value === 'Otro') { w.style.display = 'block'; document.getElementById('ventaConceptoOtro').focus(); }
    else { w.style.display = 'none'; document.getElementById('ventaConceptoOtro').value = ''; }
  });

  document.getElementById('btnCloseSheet')?.addEventListener('click', cerrarSheet);
  reciboSheet?.addEventListener('click', (e) => { if (e.target === reciboSheet) cerrarSheet(); });
  document.getElementById('btnClosePago')?.addEventListener('click', () => modalPago.classList.remove('show'));
  modalPago?.addEventListener('click', (e) => { if (e.target === modalPago) modalPago.classList.remove('show'); });

  document.getElementById('metodosPagoGrid')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-metodo]'); if (!btn) return;
    haptic(10);
    document.querySelectorAll('#metodosPagoGrid [data-metodo]').forEach(b => { b.classList.remove('btn-primary'); b.classList.add('btn-secondary'); });
    btn.classList.remove('btn-secondary'); btn.classList.add('btn-primary');
    metodoPagoSeleccionado = btn.dataset.metodo;
  });

  document.getElementById('btnConfirmarPago')?.addEventListener('click', confirmarEntregaConPago);

  document.getElementById('btnGuardarVenta')?.addEventListener('click', async () => {
    let concepto = document.getElementById('ventaConcepto').value;
    const monto = parseFloat(document.getElementById('ventaMonto').value);
    const metodo = document.getElementById('ventaMetodo').value;
    if (concepto === 'Otro') {
      const c = document.getElementById('ventaConceptoOtro').value.trim();
      if (!c) { toast('Especifica qué se vendió', 'error'); return; }
      concepto = c;
    }
    if (!monto || monto <= 0) { toast('Ingresa un monto válido', 'error'); return; }
    haptic(20);
    try {
      await addDoc(collection(db, 'ventas'), { concepto, monto, costo: 0, metodoPago: metodo, fecha: serverTimestamp(), creadoPor: sesion?.nombre || 'Técnico' });
      toast('Venta registrada', 'success'); modalVenta.classList.remove('show');
      document.getElementById('ventaMonto').value = ''; document.getElementById('ventaConceptoOtro').value = '';
      document.getElementById('wrapConceptoOtro').style.display = 'none'; document.getElementById('ventaConcepto').value = 'Botón';
    } catch (err) { toast('Error al guardar', 'error'); }
  });

  document.getElementById('filtros').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filtro]'); if (!btn) return;
    haptic(10);
    document.querySelectorAll('#filtros .chip-interactive').forEach(b => b.classList.remove('active'));
    btn.classList.add('active'); filtroActual = btn.dataset.filtro;
    busquedaActual = ''; document.getElementById('buscador').value = ''; paginaActual = 1;
    renderizarTodo();
  });
  
  document.getElementById('buscador').addEventListener('input', (e) => {
    busquedaActual = e.target.value.toLowerCase().trim(); paginaActual = 1; renderizarTodo();
  });
}

// 4. DATOS DE FIREBASE
function cargarDatos() {
  if (unsubscribe) unsubscribe();
  if (appLoader) appLoader.classList.add('show');
  
  const qRecibos = query(collection(db, 'recibos'), orderBy('fecha', 'desc'));
  unsubscribe = onSnapshot(qRecibos, (snap) => {
      ordenes = snap.docs.map(d => { const data = d.data(); delete data.fotos; return { id: d.id, ...data }; });
      ordenes.sort((a, b) => { const fa = a.fechaEditada || a.fecha; const fb = b.fechaEditada || b.fecha; return (parsearFecha(fb) || 0) - (parsearFecha(fa) || 0); });
      renderizarTodo(); if (appLoader) appLoader.classList.remove('show');
    }, (err) => {
      document.getElementById('listaOrdenes').innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Error</h3><p>${err.message}</p></div>`;
      if (appLoader) appLoader.classList.remove('show');
    }
  );

  if (unsubscribeVentas) unsubscribeVentas();
  unsubscribeVentas = onSnapshot(query(collection(db, 'ventas'), limit(100)), (snap) => {
    ventasPanel = snap.docs.map(d => ({ id: d.id, origen: 'panel', coleccion: 'ventas', ...d.data() }));
    procesarVentas();
  });

  if (unsubscribeCierres) unsubscribeCierres();
  unsubscribeCierres = onSnapshot(query(collection(db, 'cierres'), limit(100)), (snap) => {
    ventasCierre = [];
    snap.forEach(doc => {
      const d = doc.data();
      if (d.ventasInventario && d.ventasInventario.length > 0) {
        d.ventasInventario.forEach((v, i) => {
          ventasCierre.push({ id: doc.id, indexExtra: `inv_${i}`, origen: 'cierre', coleccion: 'cierres', concepto: `${v.cantidad}x ${v.nombre}`, monto: Number(v.precio * v.cantidad) || 0, metodoPago: 'Efectivo', fecha: d.fecha });
        });
      }
      if (d.extras && d.extras.length > 0) {
        d.extras.forEach((e, i) => {
          if (e.monto > 0) ventasCierre.push({ id: doc.id, indexExtra: `ext_${i}`, origen: 'cierre', coleccion: 'cierres', concepto: e.desc || 'Venta Extra', monto: Number(e.monto) || 0, metodoPago: 'Efectivo', fecha: d.fecha });
        });
      }
    });
    procesarVentas();
  });
}

function procesarVentas() {
  ventasHoy = [...ventasPanel, ...ventasCierre].sort((a, b) => (parsearFecha(b.fecha) || 0) - (parsearFecha(a.fecha) || 0));
  renderizarTodo();
}

// 5. RENDERIZADO
function renderizarTodo() {
  actualizarStats(); todosLosMovimientos = [];

  if (filtroActual === 'todos' || filtroActual === 'reparacion' || filtroActual === 'listo' || filtroActual === 'entregado' || filtroActual === 'devuelto') {
    ordenes.forEach(o => {
      const est = o.estadoOrden || 'recibido';
      if (filtroActual === 'reparacion' && est !== 'reparacion' && est !== 'espera-repuesto' && est !== 'recibido') return;
      else if (filtroActual !== 'todos' && filtroActual !== 'reparacion' && filtroActual !== est) return;
      
      const entregado = est === 'entregado';
      const monto = entregado ? (Number(o.montoCobrado) || Number(o.total) || 0) : (Number(o.total) || 0);
      todosLosMovimientos.push({ tipo: 'telefono', data: o, fechaOrden: entregado ? (parsearFecha(o.fechaEntrega) || parsearFecha(o.fechaEditada) || parsearFecha(o.fecha)) : (parsearFecha(o.fechaEditada) || parsearFecha(o.fecha)), monto });
    });
  }

  if (filtroActual === 'todos' || filtroActual === 'venta') {
    ventasHoy.forEach(v => { todosLosMovimientos.push({ tipo: v.origen === 'panel' ? 'venta' : 'cierre', data: v, fechaOrden: parsearFecha(v.fecha), monto: v.monto }); });
  }

  if (busquedaActual) {
    todosLosMovimientos = todosLosMovimientos.filter(m => {
      const txt = m.tipo === 'telefono' ? [m.data.numeroRecibo, m.data.cliente, m.data.telefono, m.data.marca, m.data.modelo].filter(Boolean).join(' ').toLowerCase() : m.data.concepto.toLowerCase();
      return txt.includes(busquedaActual);
    });
  }

  todosLosMovimientos.sort((a, b) => b.fechaOrden - a.fechaOrden);
  const totalPag = Math.ceil(todosLosMovimientos.length / ITEMS_POR_PAGINA);
  if (paginaActual > totalPag) paginaActual = totalPag || 1;
  const pagItems = todosLosMovimientos.slice((paginaActual - 1) * ITEMS_POR_PAGINA, paginaActual * ITEMS_POR_PAGINA);

  const lista = document.getElementById('listaOrdenes');
  if (todosLosMovimientos.length === 0) {
    lista.innerHTML = `<div class="empty-state"><i class="fas fa-box-open"></i><h3>Sin movimientos</h3><p>No hay resultados para este filtro.</p></div>`;
    paginationContainer.innerHTML = ''; return;
  }

  lista.innerHTML = pagItems.map(m => m.tipo === 'telefono' ? renderCardTelefono(m.data) : renderCardVenta(m.data, m.tipo)).join('');
  lista.querySelectorAll('.ingreso-card').forEach(card => {
    card.addEventListener('click', () => { haptic(10); card.dataset.tipo === 'telefono' ? abrirSheetTelefono(card.dataset.id) : abrirSheetVenta(card.dataset.id, card.dataset.origen, card.dataset.extra); });
  });
  renderizarPaginacion(totalPag);
}

function renderizarPaginacion(total) {
  if (total <= 1) { paginationContainer.innerHTML = ''; return; }
  let html = `<button class="page-nav" ${paginaActual === 1 ? 'disabled' : ''} onclick="cambiarPagina(${paginaActual - 1})">Ant</button>`;
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= paginaActual - 1 && i <= paginaActual + 1)) {
      html += `<button class="page-btn ${i === paginaActual ? 'active' : ''}" onclick="cambiarPagina(${i})">${i}</button>`;
    } else if (i === paginaActual - 2 || i === paginaActual + 2) html += `<span style="color: var(--text-3);">...</span>`;
  }
  html += `<button class="page-nav" ${paginaActual === total ? 'disabled' : ''} onclick="cambiarPagina(${paginaActual + 1})">Sig</button>`;
  paginationContainer.innerHTML = html;
}

window.cambiarPagina = (p) => { haptic(8); paginaActual = p; renderizarTodo(); document.querySelector('.app-content').scrollTo({ top: 0, behavior: 'smooth' }); };

function renderCardTelefono(o) {
  const est = o.estadoOrden || 'recibido';
  const info = { recibido: { t: 'Recibido', c: 'var(--warning-500)' }, reparacion: { t: 'Reparación', c: 'var(--brand-500)' }, 'espera-repuesto': { t: 'Repuesto', c: 'var(--purple-500)' }, listo: { t: 'Listo', c: 'var(--yellow-500)' }, entregado: { t: 'Entregado', c: 'var(--success-500)' }, devuelto: { t: 'Devuelto', c: 'var(--info-500)' } }[est] || { t: est, c: 'var(--text-3)' };
  return `
    <div class="ingreso-card" data-tipo="telefono" data-id="${o.id}" style="border-left-color: ${info.c};">
      <div class="icon-circle" style="color: ${info.c}; background: color-mix(in srgb, ${info.c} 15%, transparent);"><i class="fas fa-mobile-alt"></i></div>
      <div class="info-col">
        <div class="info-title">${escapeHtml(o.marca || '')} ${escapeHtml(o.modelo || '')}</div>
        <div class="info-sub">${escapeHtml(o.cliente || 'Cliente')}</div>
        <div class="info-sub" style="font-size: 11px; margin-top: 2px;">${est === 'entregado' ? `Entregado: ${formatFechaCompleta(o.fechaEntrega)}` : `Ingreso: ${tiempoRelativo ? tiempoRelativo(o.fechaEditada || o.fecha) : 'Reciente'}`}</div>
        <span class="estado-chip" style="background: color-mix(in srgb, ${info.c} 15%, transparent); color: ${info.c};">${info.t}</span>
      </div>
      <div class="monto-col"><div class="monto" style="color: var(--text-1);">${formatBsLimpio(Number(o.montoCobrado) || Number(o.total) || 0)}</div></div>
    </div>`;
}

function renderCardVenta(v, tipo) {
  const f = parsearFecha(v.fecha); const hora = f ? `${String(f.getHours()).padStart(2,'0')}:${String(f.getMinutes()).padStart(2,'0')}` : '';
  let ic = 'fa-box'; if (v.concepto === 'Botón') ic = 'fa-hand-pointer'; else if (v.concepto === 'Limpieza') ic = 'fa-broom'; else if (v.concepto === 'Reactivación') ic = 'fa-bolt'; else if (v.concepto === 'Cargador') ic = 'fa-plug';
  const cor = tipo === 'venta' ? 'var(--success-500)' : 'var(--purple-500)';
  return `
    <div class="ingreso-card" data-tipo="${tipo}" data-id="${v.id}" data-origen="${v.origen}" data-extra="${v.indexExtra || ''}" style="border-left-color: ${cor};">
      <div class="icon-circle" style="color: ${cor}; background: color-mix(in srgb, ${cor} 15%, transparent);"><i class="fas ${ic}"></i></div>
      <div class="info-col"><div class="info-title">${escapeHtml(v.concepto)}</div><div class="info-sub">${hora} · ${escapeHtml(v.metodoPago)}</div></div>
      <div class="monto-col"><div class="monto" style="color: ${cor};">${formatBsLimpio(v.monto)}</div></div>
    </div>`;
}

function actualizarStats() {
  document.getElementById('statActivas').textContent = ordenes.filter(o => ['recibido', 'reparacion', 'espera-repuesto'].includes(o.estadoOrden || 'recibido')).length;
  document.getElementById('statListas').textContent = ordenes.filter(o => o.estadoOrden === 'listo').length;
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  let ingRep = 0; ordenes.forEach(o => { if (o.estadoOrden === 'entregado') { const f = parsearFecha(o.fechaEntrega) || parsearFecha(o.fechaEditada) || parsearFecha(o.fecha); if (f && f >= hoy) ingRep += Number(o.montoCobrado) || Number(o.total) || 0; } });
  const ingVent = ventasHoy.filter(v => { const f = parsearFecha(v.fecha); return f && f >= hoy; }).reduce((s, v) => s + (Number(v.monto) || 0), 0);
  document.getElementById('statHoy').textContent = formatBsLimpio(ingRep + ingVent);
}

// 6. MODALES Y ACCIONES
function cerrarSheet() { if (reciboSheet) reciboSheet.classList.remove('show'); }

function abrirSheetTelefono(id) {
  const orden = ordenes.find(o => o.id === id); if (!orden) return;
  const esAdmin = sesion?.rol === 'admin';
  const opciones = `
    <option value="recibido" ${orden.estadoOrden === 'recibido' ? 'selected' : ''}>📦 Recibido</option>
    <option value="reparacion" ${orden.estadoOrden === 'reparacion' ? 'selected' : ''}>🔧 En reparación</option>
    <option value="espera-repuesto" ${orden.estadoOrden === 'espera-repuesto' ? 'selected' : ''}>⏳ Esperando repuesto</option>
    <option value="listo" ${orden.estadoOrden === 'listo' ? 'selected' : ''}>✅ Listo para entregar</option>
    <option value="entregado" ${orden.estadoOrden === 'entregado' ? 'selected' : ''}>🤝 Entregado</option>
    <option value="devuelto" ${orden.estadoOrden === 'devuelto' ? 'selected' : ''}>↩️ Devuelto</option>
  `;
  const btnEliminarHtml = esAdmin ? `<button class="btn-sheet btn-sheet-danger" id="btnEliminar"><i class="fas fa-trash"></i> Eliminar</button>` : '';

  sheetContent.innerHTML = `
    <div style="margin-bottom: 24px;">
      <h3 style="font-size: 24px; font-weight: 800; color: var(--text-1); margin: 0 0 4px 0; letter-spacing: -0.5px;">${escapeHtml(orden.numeroRecibo)}</h3>
      <p style="font-size: 15px; color: var(--text-3); margin: 0;">${escapeHtml(orden.cliente)} · ${escapeHtml(orden.marca)} ${escapeHtml(orden.modelo)}</p>
    </div>
    <button class="btn btn-secondary btn-block" style="margin-bottom: 12px;" id="btnEditarOrden"><i class="fas fa-edit"></i> Abrir Orden Completa</button>
    <div class="field" style="margin-bottom: 16px;">
      <label class="input-label">Estado del Equipo</label>
      <select id="selectEstado" class="input-field">${opciones}</select>
    </div>
    <button class="btn btn-primary btn-block" id="btnActualizarEstado" style="margin-bottom: 8px;"><i class="fas fa-check"></i> Guardar Estado</button>
    <button class="btn btn-whatsapp btn-block" id="btnWhatsApp" style="margin-bottom: 8px;"><i class="fab fa-whatsapp"></i> WhatsApp</button>
    ${btnEliminarHtml}
  `;

  reciboSheet.classList.add('show'); haptic(15);

  document.getElementById('btnEditarOrden')?.addEventListener('click', () => { window.location.href = `/app/orden.html?id=${id}`; });

  document.getElementById('btnActualizarEstado')?.addEventListener('click', async () => {
    const nuevoEstado = document.getElementById('selectEstado').value;
    if (nuevoEstado === 'entregado') { cerrarSheet(); abrirModalPago(orden); return; }
    try {
      await updateDoc(doc(db, 'recibos', id), { estadoOrden: nuevoEstado });
      toast('Estado actualizado', 'success');
      filtroActual = 'todos'; paginaActual = 1;
      document.querySelectorAll('#filtros .chip-interactive').forEach(b => b.classList.remove('active'));
      document.querySelector('#filtros .chip-interactive[data-filtro="todos"]')?.classList.add('active');
      cerrarSheet();
      if (nuevoEstado === 'listo' && orden.telefono) {
        setTimeout(() => {
          if (confirm(`El equipo está listo. ¿Deseas avisar a ${orden.cliente.split(' ')[0]} por WhatsApp?`)) {
            const mensaje = `¡Hola ${orden.cliente.split(' ')[0]}! 🎉\n\nTu equipo *${orden.marca} ${orden.modelo}* ya está listo para retirar.\n\nN° Recibo: ${orden.numeroRecibo}\nSaldo: Bs. ${orden.saldo}\n\n- DR. XIAOMI SCZ`;
            window.open(`https://wa.me/591${orden.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(mensaje)}`, '_blank');
          }
        }, 500);
      }
    } catch (err) { toast('Error al actualizar', 'error'); }
  });

  document.getElementById('btnWhatsApp')?.addEventListener('click', () => {
    const urlRecibo = `${window.location.origin}/recibo/?id=${orden.numeroRecibo}`;
    const mensaje = `Hola ${orden.cliente.split(' ')[0]}, tu equipo *${orden.marca} ${orden.modelo}* ya está en nuestro taller.\n\n📄 *Recibo:*\n${urlRecibo}\n\n¡Gracias! - DR. XIAOMI`;
    window.open(`https://wa.me/591${orden.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(mensaje)}`, '_blank');
    cerrarSheet();
  });

  document.getElementById('btnEliminar')?.addEventListener('click', async () => {
    if (confirm('¿Eliminar este recibo permanentemente?')) {
      try { await deleteDoc(doc(db, 'recibos', id)); toast('Recibo eliminado', 'success'); cerrarSheet(); }
      catch (err) { toast('Error al eliminar', 'error'); }
    }
  });
}

function abrirModalPago(orden) {
  ordenAEntregar = orden; metodoPagoSeleccionado = null;
  document.getElementById('pagoMonto').value = orden.saldo > 0 ? orden.saldo : orden.total;
  document.querySelectorAll('#metodosPagoGrid [data-metodo]').forEach(b => { b.classList.remove('btn-primary'); b.classList.add('btn-secondary'); });
  modalPago.classList.add('show'); haptic(15);
}

async function confirmarEntregaConPago() {
  const monto = parseFloat(document.getElementById('pagoMonto').value);
  if (!metodoPagoSeleccionado) { toast('Selecciona un método de pago', 'error'); return; }
  if (!monto || monto <= 0) { toast('Ingresa un monto válido', 'error'); return; }
  haptic(20);
  try {
    await updateDoc(doc(db, 'recibos', ordenAEntregar.id), {
      estadoOrden: 'entregado', fechaEntrega: serverTimestamp(), montoCobrado: monto, metodoPago: metodoPagoSeleccionado
    });
    toast('Equipo entregado', 'success'); modalPago.classList.remove('show');
    filtroActual = 'todos'; paginaActual = 1;
    document.querySelectorAll('#filtros .chip-interactive').forEach(b => b.classList.remove('active'));
    document.querySelector('#filtros .chip-interactive[data-filtro="todos"]')?.classList.add('active');
  } catch (err) { toast('Error al entregar', 'error'); }
}

function abrirSheetVenta(id, origen, extra) {
  const venta = ventasHoy.find(v => v.id === id && (v.indexExtra || '') === extra);
  if (!venta) return;
  const f = parsearFecha(venta.fecha); const hora = f ? `${String(f.getHours()).padStart(2,'0')}:${String(f.getMinutes()).padStart(2,'0')}` : '';
  const esAdmin = sesion?.rol === 'admin';
  const btnEliminarHtml = esAdmin ? `<button class="btn btn-danger btn-block" id="btnEliminarVenta"><i class="fas fa-trash"></i> Eliminar</button>` : '';

  sheetContent.innerHTML = `
    <div style="margin-bottom: 24px;">
      <h3 style="font-size: 24px; font-weight: 800; color: var(--success-500); margin: 0 0 4px 0;">${escapeHtml(venta.concepto)}</h3>
      <p style="font-size: 15px; color: var(--text-3); margin: 0;">${formatBsLimpio(venta.monto)} · ${hora} · ${escapeHtml(venta.metodoPago)}</p>
    </div>
    ${origen === 'panel' && esAdmin ? `<button class="btn btn-secondary btn-block" id="btnEditarVenta" style="margin-bottom: 8px;"><i class="fas fa-edit"></i> Editar Venta</button>` : ''}
    ${btnEliminarHtml}
  `;
  reciboSheet.classList.add('show'); haptic(15);

  if (origen === 'panel' && esAdmin) {
    document.getElementById('btnEditarVenta')?.addEventListener('click', () => { cerrarSheet(); abrirModalEditarVenta(venta); });
  }
  document.getElementById('btnEliminarVenta')?.addEventListener('click', async () => {
    if (!confirm('¿Eliminar esta venta permanentemente?')) return;
    haptic(20);
    try {
      if (origen === 'panel') await deleteDoc(doc(db, 'ventas', id));
      else await deleteDoc(doc(db, 'cierres', id));
      toast('Eliminado', 'success'); cerrarSheet();
    } catch (err) { toast('Error al eliminar', 'error'); }
  });
}

function abrirModalEditarVenta(venta) {
  const modal = document.createElement('div');
  modal.className = 'sheet-backdrop'; modal.id = 'modalEditarVenta'; modal.style.display = 'flex';
  const esAdmin = sesion?.rol === 'admin';
  const campoCosto = esAdmin ? `<div class="field"><label class="input-label">Costo (Bs.)</label><input type="number" id="editCostoV" class="input-field" value="${venta.costo || 0}"></div>` : '';

  modal.innerHTML = `
    <div class="sheet">
      <div class="sheet-handle"></div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h3 style="font-size: 20px; font-weight: 800;">Editar Venta</h3>
        <button class="icon-btn" id="btnCloseEditV"><i class="fas fa-times"></i></button>
      </div>
      <div class="field"><label class="input-label">Concepto</label><input type="text" id="editConceptoV" class="input-field" value="${escapeHtml(venta.concepto)}"></div>
      <div class="field"><label class="input-label">Monto (Bs.)</label><input type="number" id="editMontoV" class="input-field" value="${venta.monto}"></div>
      ${campoCosto}
      <div class="field">
        <label class="input-label">Método de Pago</label>
        <select id="editMetodoV" class="input-field">
          <option value="Efectivo" ${venta.metodoPago === 'Efectivo' ? 'selected' : ''}>💵 Efectivo</option>
          <option value="QR" ${venta.metodoPago === 'QR' ? 'selected' : ''}>📱 QR</option>
        </select>
      </div>
      <button class="btn btn-primary btn-block" id="btnSaveEditV">Guardar Cambios</button>
    </div>
  `;
  document.body.appendChild(modal); setTimeout(() => modal.classList.add('show'), 10);

  const cerrar = () => { modal.classList.remove('show'); setTimeout(() => modal.remove(), 300); };
  document.getElementById('btnCloseEditV').addEventListener('click', cerrar);
  modal.addEventListener('click', (e) => { if (e.target === modal) cerrar(); });

  document.getElementById('btnSaveEditV').addEventListener('click', async () => {
    const nuevoConcepto = document.getElementById('editConceptoV').value.trim();
    const nuevoMonto = parseFloat(document.getElementById('editMontoV').value) || 0;
    const nuevoMetodo = document.getElementById('editMetodoV').value;
    const nuevoCosto = document.getElementById('editCostoV') ? (parseFloat(document.getElementById('editCostoV').value) || 0) : 0;
    haptic(20);
    try {
      await updateDoc(doc(db, 'ventas', venta.id), { concepto: nuevoConcepto, monto: nuevoMonto, costo: nuevoCosto, metodoPago: nuevoMetodo });
      toast('Venta actualizada', 'success'); cerrar();
    } catch (err) { toast('Error al actualizar', 'error'); }
  });
}
