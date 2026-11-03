// /app/js/panel.js
import { toast, haptic, tiempoRelativo, escapeHtml, initTheme, toggleTheme } from './app-ui.js';
import { requireAuth, logout } from './app-auth.js'; 
import { db } from './firebase.js';
import { collection, query, onSnapshot, limit, addDoc, serverTimestamp, orderBy, doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { abrirSheetTelefono, abrirSheetVenta } from './panel-modals.js';
import { generarPDFDia } from './panel-pdf.js';
import { icono } from './icons.js';

initTheme();

export let appState = { sesion: null, ordenes: [], ventasHoy: [], inventario: [] };
let filtroActual = 'todos', busquedaActual = '', todosLosMovimientos = [], paginaActual = 1;
let unsubscribe = null, unsubscribeVentas = null, unsubscribeCierres = null, unsubscribeInventario = null; 
let ventasPanel = [], ventasCierre = [];
const ITEMS_POR_PAGINA = 12;

const reciboSheet = document.getElementById('reciboSheet');
const modalVenta = document.getElementById('modalVenta');
const modalNotaDueno = document.getElementById('modalNotaDueno');
const modalPreviewPDF = document.getElementById('modalPreviewPDF');
const paginationContainer = document.getElementById('paginationContainer');
const appLoader = document.getElementById('appLoader');

// ==========================================
// NOTIFICACIONES (BADGE)
// ==========================================
let contadorNotificaciones = parseInt(localStorage.getItem('drx_notif_count') || '0');
function actualizarBadge() {
  if ('setAppBadge' in navigator) {
    if (contadorNotificaciones > 0) navigator.setAppBadge(contadorNotificaciones).catch(console.error);
    else navigator.clearAppBadge().catch(console.error);
  }
  localStorage.setItem('drx_notif_count', contadorNotificaciones);
  const badge = document.getElementById('notifBadge');
  if (badge) {
    badge.textContent = contadorNotificaciones;
    badge.style.display = contadorNotificaciones > 0 ? 'block' : 'none';
  }
}

// ==========================================
// 1. RENDERIZADO DEL LAYOUT
// ==========================================
function renderLayout() {
  const container = document.querySelector('.app-container');
  if (!container) return;

  const headerHTML = `
    <header class="app-header">
      <div class="brand">
        <div class="brand-logo"><img src="/imagenes/web-app-manifest-192x192.png" alt="Logo"></div>
        <div class="brand-text"><h1>Panel</h1><p id="userInfo">Cargando...</p></div>
      </div>
      <div class="header-actions">
        <button class="icon-btn" id="btnNotificaciones" style="position:relative;">
          ${icono('campana', 20)}
          <span class="notif-badge" id="notifBadge" style="position:absolute; top:-4px; right:-4px; display:none; background:var(--danger-500); color:white; font-size:10px; font-weight:800; padding:2px 5px; border-radius:10px; border:2px solid var(--bg-elev-1);">0</span>
        </button>
        <button class="icon-btn" id="btnTema">${icono('tema', 20)}</button>
        <button class="icon-btn" id="btnSalir">${icono('salir', 20)}</button>
      </div>
    </header>`;
    
  const navHTML = `
    <nav class="bottom-nav">
      <a href="/app/" class="nav-item active">${icono('home', 22)} <span>Panel</span></a>
      <a href="/app/precios/" class="nav-item">${icono('precios', 22)} <span>Precios</span></a>
      <a href="/app/reportes/" class="nav-item">${icono('reportes', 22)} <span>Reportes</span></a>
      <a href="/app/inventario/" class="nav-item">${icono('inventario', 22)} <span>Stock</span></a>
    </nav>`;
    
  container.insertAdjacentHTML('afterbegin', headerHTML);
  container.insertAdjacentHTML('beforeend', navHTML);
  
  document.getElementById('btnSalir')?.addEventListener('click', () => { if(confirm('¿Cerrar sesión?')) logout(); });
  document.getElementById('btnNotificaciones')?.addEventListener('click', () => { haptic(10); contadorNotificaciones = 0; actualizarBadge(); toast('Notificaciones leídas', 'success'); });
  document.getElementById('btnTema')?.addEventListener('click', toggleTheme);
}

renderLayout();

// ==========================================
// 2. AUTENTICACIÓN Y POPUPS
// ==========================================
requireAuth((s) => {
  appState.sesion = s;
  setTimeout(() => { 
    iniciarApp(); 
    const sub = document.getElementById('userInfo'); if(sub) sub.textContent = s.nombre;
    verificarPopups();
  }, 500);
});

function iniciarApp() {
  if (appState.sesion?.rol !== 'admin') {
    const btnRep = document.querySelector('.nav-item[href="/app/reportes/"]'); 
    if(btnRep) btnRep.style.display = 'none';
    const btnPDF = document.getElementById('btnPDFDia'); 
    if(btnPDF) btnPDF.style.display = 'none'; // Ocultar PDF a técnicos si así se desea
  }
  configurarEventos(); 
  cargarDatos();
  setTimeout(() => { if(appLoader) appLoader.classList.add('hidden'); }, 800);
}

async function verificarPopups() {
  try {
    const docRef = doc(db, 'config', 'popup_mensaje');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      const ahora = new Date().getTime();
      if (data.activo && data.fechaExpiracion > ahora) {
        document.getElementById('verPopupTitulo').textContent = data.titulo;
        document.getElementById('verPopupTexto').textContent = data.texto;
        document.getElementById('modalVerPopup').classList.add('show');
      }
    }
  } catch(e) { console.log('No hay popups configurados.'); }
}

document.getElementById('btnOkPopup')?.addEventListener('click', () => {
  document.getElementById('modalVerPopup').classList.remove('show');
});

// ==========================================
// 3. HELPERS
// ==========================================
export function parsearFecha(f) {
  if (!f) return null;
  if (typeof f.toDate === 'function') return f.toDate();
  if (f.seconds !== undefined) return new Date(f.seconds * 1000);
  const d = new Date(f); return isNaN(d.getTime()) ? null : d;
}

export function formatBsLimpio(n) {
  const v = Number(n) || 0; return v === Math.floor(v) ? `Bs. ${v}` : `Bs. ${v.toFixed(2)}`;
}

function formatFechaCompleta(f) {
  let d = parsearFecha(f); if (!d) return 'Reciente';
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} a las ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

export function cerrarSheet() { if (reciboSheet) reciboSheet.classList.remove('show'); }

// ==========================================
// 4. EVENTOS (Ventas, Filtros, PDF, Notas)
// ==========================================
function configurarEventos() {
  document.getElementById('nuevoReciboBtn')?.addEventListener('click', () => { haptic(15); window.location.href = '/app/cliente/'; });
  document.getElementById('ventaRapidaBtn')?.addEventListener('click', () => { haptic(15); modalVenta.classList.add('show'); });
  document.getElementById('btnCloseVenta')?.addEventListener('click', () => modalVenta.classList.remove('show'));
  document.getElementById('btnCloseSheet')?.addEventListener('click', () => reciboSheet.classList.remove('show'));
  document.getElementById('btnClosePago')?.addEventListener('click', () => document.getElementById('modalPago').classList.remove('show'));
  
  // Cerrar modales al tocar el fondo oscuro
  document.querySelectorAll('.sheet-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) backdrop.classList.remove('show');
    });
  });

  // PDF Y NOTAS
  document.getElementById('btnAbrirNotaDueno')?.addEventListener('click', () => { haptic(15); modalNotaDueno.classList.add('show'); });
  document.getElementById('btnCancelarNotaDueno')?.addEventListener('click', () => modalNotaDueno.classList.remove('show'));
  
  document.getElementById('btnGuardarNotaDueno')?.addEventListener('click', async () => {
    const texto = document.getElementById('notaDuenoTexto').value.trim();
    if (!texto) { toast('Escribe algo primero', 'error'); return; }
    haptic(20);
    try {
      await addDoc(collection(db, 'notas'), { texto, autor: appState.sesion?.nombre || 'Técnico', fecha: serverTimestamp() });
      toast('Nota guardada para el dueño', 'success');
      modalNotaDueno.classList.remove('show');
      document.getElementById('notaDuenoTexto').value = '';
    } catch (e) { toast('Error al guardar', 'error'); }
  });

  // CIERRE DE CAJA (PDF)
  document.getElementById('btnPDFDia')?.addEventListener('click', () => { haptic(15); abrirVistaPreviaPDF(); });
  document.getElementById('btnClosePreviewPDF')?.addEventListener('click', () => modalPreviewPDF.classList.remove('show'));
  
  document.getElementById('btnDescargarPDF')?.addEventListener('click', () => {
    haptic(20);
    generarPDFDia(); 
    toast('PDF Descargado', 'success');
  });

  document.getElementById('btnEnviarPDFDueno')?.addEventListener('click', async () => {
    haptic(20);
    const btn = document.getElementById('btnEnviarPDFDueno');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
    btn.disabled = true;

    try {
      generarPDFDia(); 
      const efectivo = parseFloat(document.getElementById('efectivoCaja').value) || 0;
      const totalSistema = calcularTotalDia();
      const diferencia = efectivo - totalSistema;
      
      let textoDif = diferencia === 0 ? '✅ Caja Cuadrada Exacta' : (diferencia < 0 ? `⚠️ Faltante: Bs. ${Math.abs(diferencia).toFixed(2)}` : `💰 Sobrante: Bs. ${diferencia.toFixed(2)}`);

      const mensaje = `*CIERRE DE CAJA - DR. XIAOMI*\n\n` +
        `👨‍🔧 *Técnico:* ${appState.sesion.nombre}\n` +
        `📅 *Fecha:* ${new Date().toLocaleDateString()}\n\n` +
        `💵 *Efectivo en Caja:* Bs. ${efectivo.toFixed(2)}\n` +
        `💻 *Total en Sistema:* Bs. ${totalSistema.toFixed(2)}\n` +
        `📊 *Resultado:* ${textoDif}\n\n` +
        `📄 Adjunto el PDF del reporte diario.`;

      const numeroDueno = '59170000000'; // 🔥 CAMBIA ESTO POR EL NÚMERO DEL DUEÑO
      window.open(`https://wa.me/${numeroDueno}?text=${encodeURIComponent(mensaje)}`, '_blank');
      
      toast('Reporte enviado al dueño', 'success');
      modalPreviewPDF.classList.remove('show');
    } catch (e) {
      toast('Error al enviar', 'error');
    } finally {
      btn.innerHTML = '<i class="fab fa-whatsapp"></i> Enviar al Dueño';
      btn.disabled = false;
    }
  });

  document.getElementById('efectivoCaja')?.addEventListener('input', (e) => {
    const efectivo = parseFloat(e.target.value) || 0;
    const totalSistema = calcularTotalDia();
    const diff = efectivo - totalSistema;
    const elDiff = document.getElementById('diferenciaCaja');
    
    elDiff.style.display = 'block';
    if (diff === 0) { elDiff.textContent = '✅ Caja cuadrada exacta.'; elDiff.style.color = 'var(--success-500)'; } 
    else if (diff < 0) { elDiff.textContent = `⚠️ Faltante de Bs. ${Math.abs(diff).toFixed(2)}`; elDiff.style.color = 'var(--danger-500)'; } 
    else { elDiff.textContent = `💰 Sobrante de Bs. ${diff.toFixed(2)}`; elDiff.style.color = 'var(--warning-500)'; }
  });

  // LÓGICA DE VENTA
  const tipoStep = document.getElementById('tipoVentaStep');
  const accesorioStep = document.getElementById('ventaAccesorioStep');
  const servicioStep = document.getElementById('ventaServicioStep');

  document.getElementById('btnVentaAccesorio')?.addEventListener('click', () => {
    if(tipoStep) tipoStep.style.display = 'none'; 
    if(accesorioStep) accesorioStep.style.display = 'block'; 
    if(servicioStep) servicioStep.style.display = 'none';
    
    const grid = document.getElementById('gridAccesorios');
    if (grid) {
      grid.innerHTML = appState.inventario.map(i => `
        <div class="accesorio-card" data-id="${i.id}" data-nombre="${i.nombre}" data-precio="${i.precio}" data-costo="${i.costo}" data-stock="${i.stock}">
          ${i.foto ? `<img src="${i.foto}" alt="${i.nombre}">` : `<div class="no-img">${icono('inventario', 24)}</div>`}
          <div class="nombre">${i.nombre}</div>
          <div class="precio">${i.precio} Bs</div>
          <div class="stock">Stock: ${i.stock}</div>
        </div>
      `).join('');
      
      grid.querySelectorAll('.accesorio-card').forEach(card => {
        card.addEventListener('click', () => {
          haptic(10);
          grid.querySelectorAll('.accesorio-card').forEach(c => c.classList.remove('seleccionado'));
          card.classList.add('seleccionado');
          
          document.getElementById('productoSeleccionadoInfo').style.display = 'block';
          document.getElementById('infoProdNombre').textContent = card.dataset.nombre;
          document.getElementById('infoProdPrecio').textContent = card.dataset.precio;
          document.getElementById('accesorioCantidad').value = 1;
          document.getElementById('accesorioCantidad').max = card.dataset.stock;
          
          const btnReg = document.getElementById('btnRegistrarAccesorio');
          btnReg.disabled = false;
          btnReg.dataset.id = card.dataset.id;
          btnReg.dataset.nombre = card.dataset.nombre;
          btnReg.dataset.precio = card.dataset.precio;
          btnReg.dataset.costo = card.dataset.costo;
          btnReg.dataset.stock = card.dataset.stock;
        });
      });
    }
  });

  document.getElementById('btnVentaServicio')?.addEventListener('click', () => {
    if(tipoStep) tipoStep.style.display = 'none'; 
    if(accesorioStep) accesorioStep.style.display = 'none'; 
    if(servicioStep) servicioStep.style.display = 'block';
  });

  document.getElementById('btnBackToTipo')?.addEventListener('click', () => { if(tipoStep) tipoStep.style.display = 'block'; if(accesorioStep) accesorioStep.style.display = 'none'; if(servicioStep) servicioStep.style.display = 'none'; });
  document.getElementById('btnBackToTipo2')?.addEventListener('click', () => { if(tipoStep) tipoStep.style.display = 'block'; if(accesorioStep) accesorioStep.style.display = 'none'; if(servicioStep) servicioStep.style.display = 'none'; });

  document.getElementById('btnGuardarVenta')?.addEventListener('click', async () => {
    let concepto = document.getElementById('ventaConcepto').value, monto = parseFloat(document.getElementById('ventaMonto').value), metodo = document.getElementById('ventaMetodo').value;
    if (concepto === 'Otro') { const c = document.getElementById('ventaConceptoOtro').value.trim(); if (!c) { toast('Especifica qué se vendió', 'error'); return; } concepto = c; }
    if (!monto || monto <= 0) { toast('Ingresa un monto válido', 'error'); return; }
    haptic(20);
    try {
      await addDoc(collection(db, 'ventas'), { concepto, monto, costo: 0, metodoPago: metodo, fecha: serverTimestamp(), creadoPor: appState.sesion?.nombre || 'Técnico' });
      toast('Venta registrada', 'success'); modalVenta.classList.remove('show');
    } catch (err) { toast('Error al guardar', 'error'); }
  });

  document.getElementById('btnRegistrarAccesorio')?.addEventListener('click', async (e) => {
    const btn = e.target;
    const id = btn.dataset.id, nombre = btn.dataset.nombre;
    const precio = parseFloat(btn.dataset.precio), costo = parseFloat(btn.dataset.costo);
    const stock = parseInt(btn.dataset.stock), cantidad = parseInt(document.getElementById('accesorioCantidad').value);

    if (!id) return;
    if (cantidad > stock) { toast('No hay suficiente stock', 'error'); return; }

    haptic(20);
    try {
      const total = precio * cantidad;
      await addDoc(collection(db, 'ventas'), { concepto: `${cantidad}x ${nombre}`, monto: total, costo: costo * cantidad, metodoPago: 'Efectivo', fecha: serverTimestamp(), creadoPor: appState.sesion?.nombre || 'Técnico' });
      await updateDoc(doc(db, 'productos', id), { stock: stock - cantidad });
      toast('Venta de accesorio registrada', 'success'); 
      modalVenta.classList.remove('show');
      document.getElementById('productoSeleccionadoInfo').style.display = 'none';
      btn.disabled = true;
    } catch (err) { console.error(err); toast('Error al guardar', 'error'); }
  });

  document.getElementById('filtros')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filtro]'); if (!btn) return;
    haptic(10); document.querySelectorAll('#filtros .chip-interactive').forEach(b => b.classList.remove('active'));
    btn.classList.add('active'); filtroActual = btn.dataset.filtro;
    busquedaActual = ''; document.getElementById('buscador').value = ''; paginaActual = 1; renderizarTodo();
  });
  document.getElementById('buscador')?.addEventListener('input', (e) => {
    busquedaActual = e.target.value.toLowerCase().trim(); paginaActual = 1; renderizarTodo();
  });
}

// ==========================================
// 5. CARGA DE DATOS Y RENDERIZADO
// ==========================================
function cargarDatos() {
  if (unsubscribe) unsubscribe();
  unsubscribe = onSnapshot(query(collection(db, 'recibos'), orderBy('fecha', 'desc')), (snap) => {
      appState.ordenes = snap.docs.map(d => { const data = d.data(); delete data.fotos; return { id: d.id, ...data }; });
      appState.ordenes.sort((a, b) => (parsearFecha(b.fechaEditada || b.fecha) || 0) - (parsearFecha(a.fechaEditada || a.fecha) || 0));
      renderizarTodo();
    }, (err) => { console.error(err); });

  if (unsubscribeVentas) unsubscribeVentas();
  unsubscribeVentas = onSnapshot(query(collection(db, 'ventas'), limit(100)), (snap) => {
    ventasPanel = snap.docs.map(d => ({ id: d.id, origen: 'panel', coleccion: 'ventas', ...d.data() })); procesarVentas();
  });

  if (unsubscribeCierres) unsubscribeCierres();
  unsubscribeCierres = onSnapshot(query(collection(db, 'cierres'), limit(100)), (snap) => {
    ventasCierre = [];
    snap.forEach(doc => { const d = doc.data();
      if (d.ventasInventario) d.ventasInventario.forEach((v, i) => ventasCierre.push({ id: doc.id, indexExtra: `inv_${i}`, origen: 'cierre', coleccion: 'cierres', concepto: `${v.cantidad}x ${v.nombre}`, monto: Number(v.precio * v.cantidad) || 0, metodoPago: 'Efectivo', fecha: d.fecha }));
      if (d.extras) d.extras.forEach((e, i) => { if (e.monto > 0) ventasCierre.push({ id: doc.id, indexExtra: `ext_${i}`, origen: 'cierre', coleccion: 'cierres', concepto: e.desc || 'Venta Extra', monto: Number(e.monto) || 0, metodoPago: 'Efectivo', fecha: d.fecha }); });
    });
    procesarVentas();
  });

  if (unsubscribeInventario) unsubscribeInventario();
  unsubscribeInventario = onSnapshot(query(collection(db, 'productos')), (snap) => {
    appState.inventario = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  });
}

function procesarVentas() { appState.ventasHoy = [...ventasPanel, ...ventasCierre].sort((a, b) => (parsearFecha(b.fecha) || 0) - (parsearFecha(a.fecha) || 0)); renderizarTodo(); }

function renderizarTodo() {
  actualizarStats(); todosLosMovimientos = [];
  if (filtroActual === 'todos' || filtroActual === 'reparacion' || filtroActual === 'listo' || filtroActual === 'entregado' || filtroActual === 'devuelto') {
    appState.ordenes.forEach(o => {
      const est = o.estadoOrden || 'recibido';
      if (filtroActual === 'reparacion' && est !== 'reparacion' && est !== 'espera-repuesto' && est !== 'recibido') return;
      else if (filtroActual !== 'todos' && filtroActual !== 'reparacion' && filtroActual !== est) return;
      const entregado = est === 'entregado';
      todosLosMovimientos.push({ tipo: 'telefono', data: o, fechaOrden: entregado ? (parsearFecha(o.fechaEntrega) || parsearFecha(o.fechaEditada) || parsearFecha(o.fecha)) : (parsearFecha(o.fechaEditada) || parsearFecha(o.fecha)) });
    });
  }
  if (filtroActual === 'todos' || filtroActual === 'venta') {
    appState.ventasHoy.forEach(v => { todosLosMovimientos.push({ tipo: v.origen === 'panel' ? 'venta' : 'cierre', data: v, fechaOrden: parsearFecha(v.fecha) }); });
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
    lista.innerHTML = `<div class="empty-state"><h3>Sin movimientos</h3><p>No hay resultados.</p></div>`; paginationContainer.innerHTML = ''; return;
  }
  lista.innerHTML = pagItems.map(m => m.tipo === 'telefono' ? renderCardTelefono(m.data) : renderCardVenta(m.data, m.tipo)).join('');
  lista.querySelectorAll('.ingreso-card').forEach(card => {
    card.addEventListener('click', () => { haptic(10); if(card.dataset.tipo === 'telefono') abrirSheetTelefono(card.dataset.id); else abrirSheetVenta(card.dataset.id, card.dataset.origen, card.dataset.extra); });
  });
  renderizarPaginacion(totalPag);
}

function renderizarPaginacion(total) {
  if (total <= 1) { paginationContainer.innerHTML = ''; return; }
  let html = `<button class="page-nav" ${paginaActual === 1 ? 'disabled' : ''} onclick="cambiarPagina(${paginaActual - 1})">Ant</button>`;
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= paginaActual - 1 && i <= paginaActual + 1)) html += `<button class="page-btn ${i === paginaActual ? 'active' : ''}" onclick="cambiarPagina(${i})">${i}</button>`;
    else if (i === paginaActual - 2 || i === paginaActual + 2) html += `<span>...</span>`;
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
      <div class="icon-circle" style="color: ${info.c}; background: color-mix(in srgb, ${info.c} 15%, transparent);">
        ${icono('telefono', 24)}
      </div>
      <div class="info-col">
        <div class="info-title">${escapeHtml(o.marca || '')} ${escapeHtml(o.modelo || '')}</div>
        <div class="info-sub">${escapeHtml(o.cliente || '')}</div>
        <div class="info-sub" style="font-size: 11px;">
          ${est === 'entregado' ? `Entregado: ${formatFechaCompleta(o.fechaEntrega)}` : `Ingreso: ${tiempoRelativo(o.fechaEditada || o.fecha)}`}
        </div>
        <span class="estado-chip" style="background: color-mix(in srgb, ${info.c} 15%, transparent); color: ${info.c};">${info.t}</span>
      </div>
      <div class="monto-col">
        <div class="monto" style="color: var(--text-1);">${formatBsLimpio(Number(o.montoCobrado) || Number(o.total) || 0)}</div>
      </div>
    </div>`;
}

function renderCardVenta(v, tipo) {
  const f = parsearFecha(v.fecha); const hora = f ? `${String(f.getHours()).padStart(2,'0')}:${String(f.getMinutes()).padStart(2,'0')}` : '';
  
  let iconoNombre = 'venta';
  if (v.concepto === 'Botón') iconoNombre = 'bateria'; 
  else if (v.concepto === 'Limpieza') iconoNombre = 'servicios';
  else if (v.concepto === 'Reactivación') iconoNombre = 'estado';
  else if (v.concepto === 'Cargador') iconoNombre = 'bateria';
  
  const cor = tipo === 'venta' ? 'var(--success-500)' : 'var(--purple-500)';
  
  return `
    <div class="ingreso-card" data-tipo="${tipo}" data-id="${v.id}" data-origen="${v.origen}" data-extra="${v.indexExtra || ''}" style="border-left-color: ${cor};">
      <div class="icon-circle" style="color: ${cor}; background: color-mix(in srgb, ${cor} 15%, transparent);">
        ${icono(iconoNombre, 24)}
      </div>
      <div class="info-col">
        <div class="info-title">${escapeHtml(v.concepto)}</div>
        <div class="info-sub">${hora} · ${escapeHtml(v.metodoPago)}</div>
      </div>
      <div class="monto-col">
        <div class="monto" style="color: ${cor};">${formatBsLimpio(v.monto)}</div>
      </div>
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

// ==========================================
// 6. FUNCIONES DE CIERRE Y PREVIEW
// ==========================================
function calcularTotalDia() {
  let total = 0;
  const hoy = new Date();
  hoy.setHours(0,0,0,0);
  
  appState.ordenes.forEach(o => {
    if (o.estadoOrden === 'entregado') {
      const fEntrega = parsearFecha(o.fechaEntrega) || parsearFecha(o.fechaEditada);
      if (fEntrega && fEntrega >= hoy) total += Number(o.montoCobrado) || 0;
    }
  });
  
  appState.ventasHoy.forEach(v => {
    const f = parsearFecha(v.fecha);
    if (f && f >= hoy) total += Number(v.monto) || 0;
  });
  
  return total;
}

function abrirVistaPreviaPDF() {
  const container = document.getElementById('previewPDFContent');
  const hoy = new Date();
  const fechaStr = `${String(hoy.getDate()).padStart(2,'0')}/${String(hoy.getMonth()+1).padStart(2,'0')}/${hoy.getFullYear()}`;
  
  let totalDia = 0;
  let htmlFilas = '';

  appState.ordenes.forEach(o => {
    if (o.estadoOrden === 'entregado') {
      const fEntrega = parsearFecha(o.fechaEntrega) || parsearFecha(o.fechaEditada) || parsearFecha(o.fecha);
      if (fEntrega && fEntrega.toDateString() === hoy.toDateString()) {
        const monto = Number(o.montoCobrado) || Number(o.total) || 0;
        totalDia += monto;
        htmlFilas += `
          <tr>
            <td style="padding: 6px 0; border-bottom: 1px solid #eee;">${o.numeroRecibo || 'S/N'}</td>
            <td style="padding: 6px 0; border-bottom: 1px solid #eee;">${o.cliente}</td>
            <td style="padding: 6px 0; border-bottom: 1px solid #eee;">${o.marca} ${o.modelo}</td>
            <td style="padding: 6px 0; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">Bs. ${monto.toFixed(2)}</td>
          </tr>`;
      }
    }
  });

  appState.ventasHoy.forEach(v => {
    const f = parsearFecha(v.fecha);
    if (f && f.toDateString() === hoy.toDateString()) {
      const monto = Number(v.monto) || 0;
      totalDia += monto;
      htmlFilas += `
        <tr>
          <td style="padding: 6px 0; border-bottom: 1px solid #eee;">VENTA</td>
          <td style="padding: 6px 0; border-bottom: 1px solid #eee;">Mostrador</td>
          <td style="padding: 6px 0; border-bottom: 1px solid #eee;">${v.concepto}</td>
          <td style="padding: 6px 0; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">Bs. ${monto.toFixed(2)}</td>
        </tr>`;
    }
  });

  if (!htmlFilas) {
    htmlFilas = `<tr><td colspan="4" style="text-align: center; padding: 20px; color: #888;">No hay movimientos registrados hoy.</td></tr>`;
  }

  container.innerHTML = `
    <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 16px;">
      <h1 style="font-size: 20px; margin: 0 0 4px 0; font-family: 'Helvetica';">DR. XIAOMI SCZ</h1>
      <p style="margin: 0; font-size: 10px; color: #555;">Reporte de Cierre Diario</p>
      <p style="margin: 4px 0 0 0; font-size: 11px; font-weight: bold;">Fecha: ${fechaStr}</p>
    </div>
    
    <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
      <thead>
        <tr style="border-bottom: 2px solid #000; text-align: left;">
          <th style="padding-bottom: 6px;">Recibo</th>
          <th style="padding-bottom: 6px;">Cliente</th>
          <th style="padding-bottom: 6px;">Concepto</th>
          <th style="padding-bottom: 6px; text-align: right;">Monto</th>
        </tr>
      </thead>
      <tbody>
        ${htmlFilas}
      </tbody>
    </table>
    
    <div style="margin-top: 20px; text-align: right; border-top: 2px solid #000; padding-top: 10px;">
      <h2 style="font-size: 16px; margin: 0;">TOTAL DEL DÍA: Bs. ${totalDia.toFixed(2)}</h2>
    </div>
  `;

  document.getElementById('efectivoCaja').value = '';
  document.getElementById('diferenciaCaja').style.display = 'none';
  modalPreviewPDF.classList.add('show');
}

// ==========================================
// 7. LÓGICA DE PULL TO REFRESH (Jalar para actualizar)
// ==========================================
let touchStartY = 0;
let touchCurrentY = 0;
let isPulling = false;
const pullThreshold = 100; 
const appContent = document.querySelector('.app-content');
const pullIndicator = document.getElementById('pullToRefresh');
const ptrIcon = document.getElementById('ptrIcon');

if (appContent && pullIndicator) {
  appContent.addEventListener('touchstart', (e) => {
    if (appContent.scrollTop === 0) {
      touchStartY = e.touches[0].clientY;
      isPulling = true;
    }
  }, { passive: true });

  appContent.addEventListener('touchmove', (e) => {
    if (!isPulling) return;
    touchCurrentY = e.touches[0].clientY;
    const distance = touchCurrentY - touchStartY;

    if (distance > 0 && appContent.scrollTop === 0) {
      e.preventDefault(); 
      const progress = Math.min(distance / pullThreshold, 1);
      pullIndicator.style.transform = `translateX(-50%) translateY(${progress * 60}px)`;
      pullIndicator.style.opacity = progress;
      ptrIcon.style.transform = `rotate(${progress * 360}deg)`;
    }
  }, { passive: false });

  appContent.addEventListener('touchend', () => {
    if (!isPulling) return;
    const distance = touchCurrentY - touchStartY;

    if (distance > pullThreshold && appContent.scrollTop === 0) {
      pullIndicator.style.transform = 'translateX(-50%) translateY(50px)';
      ptrIcon.style.animation = 'spin 0.8s linear infinite'; 
      
      if (typeof cargarDatos === 'function') {
        cargarDatos(); 
        setTimeout(() => {
          resetPullToRefresh();
          toast('Datos actualizados', 'success');
        }, 1000);
      } else {
        window.location.reload();
      }
    } else {
      resetPullToRefresh();
    }
    
    isPulling = false;
    touchStartY = 0;
    touchCurrentY = 0;
  });

  function resetPullToRefresh() {
    pullIndicator.style.transform = 'translateX(-50%) translateY(-60px)';
    pullIndicator.style.opacity = '0';
    ptrIcon.style.animation = 'none';
    ptrIcon.style.transform = 'rotate(0deg)';
  }
}
