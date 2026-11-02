// /app/js/panel.js
import { toast, haptic, tiempoRelativo, escapeHtml, initTheme } from './app-ui.js';
import { requireAuth, logout } from './app-auth.js'; 
import { db } from './firebase.js';
import { collection, query, onSnapshot, limit, addDoc, serverTimestamp, orderBy, doc, updateDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { abrirSheetTelefono, abrirSheetVenta } from './panel-modals.js';
import { generarPDFDia } from './panel-pdf.js';

initTheme();

export let appState = { sesion: null, ordenes: [], ventasHoy: [], inventario: [] };
let filtroActual = 'todos', busquedaActual = '', todosLosMovimientos = [], paginaActual = 1;
let unsubscribe = null, unsubscribeVentas = null, unsubscribeCierres = null, unsubscribeInventario = null; 
let ventasPanel = [], ventasCierre = [];
const ITEMS_POR_PAGINA = 12;

const reciboSheet = document.getElementById('reciboSheet');
const modalVenta = document.getElementById('modalVenta');
const paginationContainer = document.getElementById('paginationContainer');
const appLoader = document.getElementById('appLoader');

function renderLayout() {
  const headerHTML = `
    <header class="app-header">
      <div class="brand">
        <div class="brand-logo"><img src="/imagenes/web-app-manifest-192x192.png" alt="Logo"></div>
        <div class="brand-text"><h1>Panel</h1><p id="userInfo">Cargando...</p></div>
      </div>
      <div class="header-actions">
        <button class="icon-btn" id="btnSalir"><img src="/app/icons/salir.png" width="20" height="20"></button>
        <button class="icon-btn" id="btnTema"><img src="/app/icons/tema.png" width="20" height="20"></button>
      </div>
    </header>`;
    
  const navHTML = `
    <nav class="bottom-nav">
      <a href="/app/" class="nav-item active"><img src="/app/icons/home.png"> <span>Panel</span></a>
      <a href="/app/precios/" class="nav-item"><img src="/app/icons/precios.png"> <span>Precios</span></a>
      <a href="/app/reportes/" class="nav-item"><img src="/app/icons/reportes.png"> <span>Reportes</span></a>
      <a href="/app/inventario/" class="nav-item"><img src="/app/icons/inventario.png"> <span>Stock</span></a>
    </nav>`;
    
  document.body.insertAdjacentHTML('afterbegin', headerHTML);
  document.body.insertAdjacentHTML('beforeend', navHTML);
  
  document.getElementById('btnSalir').addEventListener('click', () => { if(confirm('¿Cerrar sesión?')) logout(); });
  document.getElementById('btnTema').addEventListener('click', () => {
    const act = document.documentElement.getAttribute('data-theme'), nue = act === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nue); localStorage.setItem('theme', nue);
  });
}
renderLayout();

requireAuth((s) => {
  appState.sesion = s;
  setTimeout(() => { 
    iniciarApp(); 
    const sub = document.getElementById('userInfo'); if(sub) sub.textContent = s.nombre;
  }, 500);
});

function iniciarApp() {
  if (appState.sesion?.rol !== 'admin') {
    const btnRep = document.querySelector('.nav-item[href="/app/reportes/"]'); if(btnRep) btnRep.style.display = 'none';
  }
  configurarEventos(); 
  cargarDatos();
  setTimeout(() => { if(appLoader) appLoader.classList.add('hidden'); }, 800);
}

// UTILIDADES
export function parsearFecha(f) { /* ... */ return f ? new Date(f.seconds * 1000) : null; }
export function formatBsLimpio(n) { const v = Number(n) || 0; return v === Math.floor(v) ? `Bs. ${v}` : `Bs. ${v.toFixed(2)}`; }
function formatFechaCompleta(f) { /* ... */ }
export function cerrarSheet() { if (reciboSheet) reciboSheet.classList.remove('show'); }

// EVENTOS
function configurarEventos() {
  document.getElementById('nuevoReciboBtn').addEventListener('click', () => { haptic(15); window.location.href = '/app/cliente/'; });
  document.getElementById('ventaRapidaBtn').addEventListener('click', () => { haptic(15); modalVenta.classList.add('show'); });
  document.getElementById('btnCloseVenta')?.addEventListener('click', () => modalVenta.classList.remove('show'));

  // Lógica de Pasos para Venta Rápida
  const tipoStep = document.getElementById('tipoVentaStep');
  const accesorioStep = document.getElementById('ventaAccesorioStep');
  const servicioStep = document.getElementById('ventaServicioStep');

  document.getElementById('btnVentaAccesorio').onclick = () => {
    tipoStep.style.display = 'none'; accesorioStep.style.display = 'block'; servicioStep.style.display = 'none';
    // Cargar inventario en el select
    const select = document.getElementById('accesorioSelect');
    select.innerHTML = appState.inventario.map(i => `<option value="${i.id}" data-precio="${i.venta}">${i.nombre} (${i.venta} Bs)</option>`).join('');
  };

  document.getElementById('btnVentaServicio').onclick = () => {
    tipoStep.style.display = 'none'; accesorioStep.style.display = 'none'; servicioStep.style.display = 'block';
  };

  document.getElementById('btnBackToTipo').onclick = document.getElementById('btnBackToTipo2').onclick = () => {
    tipoStep.style.display = 'block'; accesorioStep.style.display = 'none'; servicioStep.style.display = 'none';
  };

  // Registrar Venta de Servicio
  document.getElementById('btnGuardarVenta').onclick = async () => {
    let concepto = document.getElementById('ventaConcepto').value, monto = parseFloat(document.getElementById('ventaMonto').value), metodo = document.getElementById('ventaMetodo').value;
    if (concepto === 'Otro') { const c = document.getElementById('ventaConceptoOtro').value.trim(); if (!c) { toast('Especifica qué se vendió', 'error'); return; } concepto = c; }
    if (!monto || monto <= 0) { toast('Ingresa un monto válido', 'error'); return; }
    haptic(20);
    try {
      await addDoc(collection(db, 'ventas'), { concepto, monto, costo: 0, metodoPago: metodo, fecha: serverTimestamp(), creadoPor: appState.sesion?.nombre || 'Técnico' });
      toast('Venta registrada', 'success'); modalVenta.classList.remove('show');
    } catch (err) { toast('Error al guardar', 'error'); }
  };

  // Registrar Venta de Accesorio
  document.getElementById('btnRegistrarAccesorio').onclick = async () => {
    const select = document.getElementById('accesorioSelect');
    const id = select.value;
    const cantidad = parseInt(document.getElementById('accesorioCantidad').value);
    const prod = appState.inventario.find(p => p.id === id);
    if (!prod) return;

    haptic(20);
    try {
      const total = prod.venta * cantidad;
      await addDoc(collection(db, 'ventas'), { concepto: `${cantidad}x ${prod.nombre}`, monto: total, costo: prod.compra * cantidad, metodoPago: 'Efectivo', fecha: serverTimestamp(), creadoPor: appState.sesion?.nombre || 'Técnico' });
      // Actualizar stock
      await updateDoc(doc(db, 'inventario', id), { stock: prod.stock - cantidad });
      toast('Venta de accesorio registrada', 'success'); modalVenta.classList.remove('show');
    } catch (err) { toast('Error al guardar', 'error'); }
  };

  // Resto de eventos (filtros, buscador, etc)
  document.getElementById('filtros').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filtro]'); if (!btn) return;
    haptic(10); document.querySelectorAll('#filtros .chip-interactive').forEach(b => b.classList.remove('active'));
    btn.classList.add('active'); filtroActual = btn.dataset.filtro;
    busquedaActual = ''; document.getElementById('buscador').value = ''; paginaActual = 1; renderizarTodo();
  });
  document.getElementById('buscador').addEventListener('input', (e) => {
    busquedaActual = e.target.value.toLowerCase().trim(); paginaActual = 1; renderizarTodo();
  });
}

// BASE DE DATOS
function cargarDatos() {
  // Recibos
  if (unsubscribe) unsubscribe();
  unsubscribe = onSnapshot(query(collection(db, 'recibos'), orderBy('fecha', 'desc')), (snap) => {
      appState.ordenes = snap.docs.map(d => { const data = d.data(); delete data.fotos; return { id: d.id, ...data }; });
      appState.ordenes.sort((a, b) => (parsearFecha(b.fechaEditada || b.fecha) || 0) - (parsearFecha(a.fechaEditada || a.fecha) || 0));
      renderizarTodo();
    }, (err) => { console.error(err); });

  // Ventas
  if (unsubscribeVentas) unsubscribeVentas();
  unsubscribeVentas = onSnapshot(query(collection(db, 'ventas'), limit(100)), (snap) => {
    ventasPanel = snap.docs.map(d => ({ id: d.id, origen: 'panel', coleccion: 'ventas', ...d.data() })); procesarVentas();
  });

  // Cierres
  if (unsubscribeCierres) unsubscribeCierres();
  unsubscribeCierres = onSnapshot(query(collection(db, 'cierres'), limit(100)), (snap) => {
    ventasCierre = [];
    snap.forEach(doc => { const d = doc.data();
      if (d.ventasInventario) d.ventasInventario.forEach((v, i) => ventasCierre.push({ id: doc.id, indexExtra: `inv_${i}`, origen: 'cierre', coleccion: 'cierres', concepto: `${v.cantidad}x ${v.nombre}`, monto: Number(v.precio * v.cantidad) || 0, metodoPago: 'Efectivo', fecha: d.fecha }));
      if (d.extras) d.extras.forEach((e, i) => { if (e.monto > 0) ventasCierre.push({ id: doc.id, indexExtra: `ext_${i}`, origen: 'cierre', coleccion: 'cierres', concepto: e.desc || 'Venta Extra', monto: Number(e.monto) || 0, metodoPago: 'Efectivo', fecha: d.fecha }); });
    });
    procesarVentas();
  });

  // Inventario (para ventas rápidas)
  if (unsubscribeInventario) unsubscribeInventario();
  unsubscribeInventario = onSnapshot(query(collection(db, 'inventario')), (snap) => {
    appState.inventario = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  });
}

function procesarVentas() { appState.ventasHoy = [...ventasPanel, ...ventasCierre].sort((a, b) => (parsearFecha(b.fecha) || 0) - (parsearFecha(a.fecha) || 0)); renderizarTodo(); }

// RENDERIZADO
function renderizarTodo() {
  actualizarStats(); todosLosMovimientos = [];
  // ... (Lógica de renderizado de tarjetas de movimientos igual que antes)
  // ... (Paginación igual que antes)
}

// RESTO DE FUNCIONES (cambiarPagina, renderCardTelefono, renderCardVenta, actualizarStats)
// ... (Mantén las funciones que ya tenías, no las he cambiado en esta respuesta para no alargarla)
