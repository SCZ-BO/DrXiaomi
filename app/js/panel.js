// /app/js/panel.js
import { toast, haptic, tiempoRelativo, escapeHtml, initTheme } from './app-ui.js';
import { requireAuth, logout } from './app-auth.js'; 
import { db } from './firebase.js';
import { collection, query, onSnapshot, limit, doc, updateDoc, deleteDoc, addDoc, serverTimestamp, orderBy } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
// 🔥 IMPORTAMOS LOS MODALES Y EL PDF DE OTROS ARCHIVOS
import { abrirSheetTelefono, abrirSheetVenta, abrirModalEditarVenta } from './panel-modals.js';
import { generarPDFDia } from './panel-pdf.js';

initTheme();

// --- LAYOUT BÁSICO (HEADER Y NAV) ---
function renderLayout() {
  const headerHTML = `
    <header class="app-header">
      <div class="brand">
        <div class="brand-text">
          <h1>Panel de Control</h1>
          <p id="userInfo">Cargando...</p>
        </div>
      </div>
      <div class="header-actions">
        <button class="icon-btn" id="btnSalir" aria-label="Cerrar sesión">
          <img src="/app/icons/salir.png" width="20" height="20" alt="Salir">
        </button>
        <button class="icon-btn" id="btnTema" aria-label="Cambiar tema">
          <img src="/app/icons/tema.png" width="20" height="20" alt="Tema">
        </button>
      </div>
    </header>
  `;

  const navHTML = `
    <nav class="bottom-nav">
      <a href="/app/" class="nav-item active">
        <img src="/app/icons/home.png" alt="Panel"> <span>Panel</span>
      </a>
      <a href="/app/precios/" class="nav-item">
        <img src="/app/icons/precios.png" alt="Precios"> <span>Precios</span>
      </a>
      <a href="/app/reportes/" class="nav-item">
        <img src="/app/icons/reportes.png" alt="Reportes"> <span>Reportes</span>
      </a>
      <a href="/app/inventario/" class="nav-item">
        <img src="/app/icons/inventario.png" alt="Inventario"> <span>Stock</span>
      </a>
    </nav>
  `;

  document.body.insertAdjacentHTML('afterbegin', headerHTML);
  document.body.insertAdjacentHTML('beforeend', navHTML);

  document.getElementById('btnSalir').addEventListener('click', () => { if(confirm('¿Cerrar sesión?')) logout(); });
  document.getElementById('btnTema').addEventListener('click', () => {
    const actual = document.documentElement.getAttribute('data-theme');
    const nuevo = actual === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nuevo);
    localStorage.setItem('theme', nuevo);
  });
}
renderLayout();

// --- ESTADO GLOBAL ---
export let appState = {
  sesion: null,
  ordenes: [],
  ventasHoy: []
};

let filtroActual = 'todos', busquedaActual = '';
let unsubscribe = null, unsubscribeVentas = null, unsubscribeCierres = null; 
let todosLosMovimientos = [];
let paginaActual = 1;
const ITEMS_POR_PAGINA = 12;
let ventasPanel = [], ventasCierre = [];

const reciboSheet = document.getElementById('reciboSheet');
const modalVenta = document.getElementById('modalVenta');
const paginationContainer = document.getElementById('paginationContainer');
const appLoader = document.getElementById('appLoader');

// --- AUTENTICACIÓN ---
requireAuth((s) => {
  appState.sesion = s;
  setTimeout(() => { 
    iniciarApp(); 
    const subtitle = document.getElementById('userInfo');
    if (subtitle) subtitle.textContent = s.nombre;
  }, 500);
});

function iniciarApp() {
  if (appState.sesion?.rol !== 'admin') {
    const btnReportes = document.querySelector('.nav-item[href="/app/reportes/"]');
    if (btnReportes) btnReportes.style.display = 'none';
  }
  configurarEventos();
  cargarDatos();
  setTimeout(() => { if(appLoader) appLoader.classList.remove('show'); }, 800);
}

export function parsearFecha(f) {
  if (!f) return null;
  if (typeof f.toDate === 'function') return f.toDate();
  if (f.seconds !== undefined) return new Date(f.seconds * 1000);
  const d = new Date(f); return isNaN(d.getTime()) ? null : d;
}

export function formatBsLimpio(n) {
  const v = Number(n) || 0;
  return v === Math.floor(v) ? `Bs. ${v}` : `Bs. ${v.toFixed(2)}`;
}

function formatFechaCompleta(f) {
  let d = parsearFecha(f); if (!d) return 'Reciente';
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} a las ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

// --- EVENTOS PRINCIPALES ---
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
  document.getElementById('btnPDFDia')?.addEventListener('click', () => generarPDFDia(appState.ordenes, appState.ventasHoy));

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
      await addDoc(collection(db, 'ventas'), { concepto, monto, costo: 0, metodoPago: metodo, fecha: serverTimestamp(), creadoPor: appState.sesion?.nombre || 'Técnico' });
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

export function cerrarSheet() { if (reciboSheet) reciboSheet.classList.remove('show'); }

// --- BASE DE DATOS ---
function cargarDatos() {
  if (unsubscribe) unsubscribe();
  const qRecibos = query(collection(db, 'recibos'), orderBy('fecha', 'desc'));
  unsubscribe = onSnapshot(qRecibos, (snap) => {
      appState.ordenes = snap.docs.map(d => { const data = d.data(); delete data.fotos; return { id: d.id, ...data }; });
      appState.ordenes.sort((a, b) => { const fa = a.fechaEditada || a.fecha; const fb = b.fechaEditada || b.fecha; return (parsearFecha(fb) || 0) - (parsearFecha(fa) || 0); });
      renderizarTodo();
    }, (err) => {
      document.getElementById('listaOrdenes').innerHTML = `<div class="empty-state"><h3>Error de conexión</h3><p>${err.message}</p></div>`;
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
        d.ventasInventario.forEach((v, i) => ventasCierre.push({ id: doc.id, indexExtra: `inv_${i}`, origen: 'cierre', coleccion: 'cierres', concepto: `${v.cantidad}x ${v.nombre}`, monto: Number(v.precio * v.cantidad) || 0, metodoPago: 'Efectivo', fecha: d.fecha }));
      }
      if (d.extras && d.extras.length > 0) {
        d.extras.forEach((e, i) => { if (e.monto > 0) ventasCierre.push({ id: doc.id, indexExtra: `ext_${i}`, origen: 'cierre', coleccion: 'cierres', concepto: e.desc || 'Venta Extra', monto: Number(e.monto) || 0, metodoPago: 'Efectivo', fecha: d.fecha }); });
      }
    });
    procesarVentas();
  });
}

function procesarVentas() {
  appState.ventasHoy = [...ventasPanel, ...ventasCierre].sort((a, b) => (parsearFecha(b.fecha) || 0) - (parsearFecha(a.fecha) || 0));
  renderizarTodo();
}

// --- RENDERIZADO ---
function renderizarTodo() {
  actualizarStats(); todosLosMovimientos = [];

  if (filtroActual === 'todos' || filtroActual === 'reparacion' || filtroActual === 'listo' || filtroActual === 'entregado' || filtroActual === 'devuelto') {
    appState.ordenes.forEach(o => {
      const est = o.estadoOrden || 'recibido';
      if (filtroActual === 'reparacion' && est !== 'reparacion' && est !== 'espera-repuesto' && est !== 'recibido') return;
      else if (filtroActual !== 'todos' && filtroActual !== 'reparacion' && filtroActual !== est) return;
      
      const entregado = est === 'entregado';
      const monto = entregado ? (Number(o.montoCobrado) || Number(o.total) || 0) : (Number(o.total) || 0);
      todosLosMovimientos.push({ tipo: 'telefono', data: o, fechaOrden: entregado ? (parsearFecha(o.fechaEntrega) || parsearFecha(o.fechaEditada) || parsearFecha(o.fecha)) : (parsearFecha(o.fechaEditada) || parsearFecha(o.fecha)), monto });
    });
  }

  if (filtroActual === 'todos' || filtroActual === 'venta') {
    appState.ventasHoy.forEach(v => { todosLosMovimientos.push({ tipo: v.origen === 'panel' ? 'venta' : 'cierre', data: v, fechaOrden: parsearFecha(v.fecha), monto: v.monto }); });
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
    card.addEventListener('click', () => { 
      haptic(10); 
      if(card.dataset.tipo === 'telefono') abrirSheetTelefono(card.dataset.id);
      else abrirSheetVenta(card.dataset.id, card.dataset.origen, card.dataset.extra);
    });
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
  document.getElementById('statActivas').textContent = appState.ordenes.filter(o => ['recibido', 'reparacion', 'espera-repuesto'].includes(o.estadoOrden || 'recibido')).length;
  document.getElementById('statListas').textContent = appState.ordenes.filter(o => o.estadoOrden === 'listo').length;
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  let ingRep = 0; appState.ordenes.forEach(o => { if (o.estadoOrden === 'entregado') { const f = parsearFecha(o.fechaEntrega) || parsearFecha(o.fechaEditada) || parsearFecha(o.fecha); if (f && f >= hoy) ingRep += Number(o.montoCobrado) || Number(o.total) || 0; } });
  const ingVent = appState.ventasHoy.filter(v => { const f = parsearFecha(v.fecha); return f && f >= hoy; }).reduce((s, v) => s + (Number(v.monto) || 0), 0);
  document.getElementById('statHoy').textContent = formatBsLimpio(ingRep + ingVent);
}
