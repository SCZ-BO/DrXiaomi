// /app/js/panel.js
import { toast, haptic, tiempoRelativo, escapeHtml, initTheme, toggleTheme, formatBs } from './app-ui.js';
import { requireAuth, logout } from './app-auth.js'; 
import { db } from './firebase.js';
import { collection, query, onSnapshot, limit, addDoc, serverTimestamp, orderBy, doc, updateDoc, getDoc, where, getDocs, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { abrirSheetTelefono, abrirSheetVenta } from './panel-modals.js';
import { icono } from './icons.js';

// 🔥 IMPORTACIONES PARA NOTIFICACIONES PUSH (FCM)
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js";
import { app } from './firebase.js';

initTheme();

// ==========================================
// CONFIGURACIÓN GLOBAL
// ==========================================
const CONFIG_APP = {
  whatsappDueno: '59175589308',
  gastoAlmuerzo: 20,
  itemsPorPagina: 12,
  pullThreshold: 100,
  debounceRenderMs: 100,
  loaderFallbackMs: 3000,
  vapidKey: 'TU_VAPID_KEY_AQUI' // 🔥 Reemplazar por tu VAPID real
};

export let appState = { sesion: null, ordenes: [], ventasHoy: [], inventario: [] };
let filtroActual = 'todos', busquedaActual = '', todosLosMovimientos = [], paginaActual = 1;
let unsubscribe = null, unsubscribeVentas = null, unsubscribeCierres = null, unsubscribeInventario = null; 
let ventasPanel = [], ventasCierre = [];
const ITEMS_POR_PAGINA = CONFIG_APP.itemsPorPagina;

// Variables para el cierre
let reparacionesData = { total: 0, efectivo: 0, qr: 0, cantidad: 0, ganancia: 0 };
let ventasAccesoriosData = { total: 0, cantidad: 0, ganancia: 0 };
let ventasExtrasData = { total: 0, cantidad: 0, ganancia: 0 };

const reciboSheet = document.getElementById('reciboSheet');
const modalVenta = document.getElementById('modalVenta');
const modalNotaDueno = document.getElementById('modalNotaDueno');
const modalPreviewPDF = document.getElementById('modalPreviewPDF');
const paginationContainer = document.getElementById('paginationContainer');
const appLoader = document.getElementById('appLoader');

// ==========================================
// 🔥 NOTIFICACIONES PUSH (FCM)
// ==========================================
let messaging = null;
try { messaging = getMessaging(app); } catch(e) { console.warn('FCM no disponible', e); }

async function solicitarPermisoNotificaciones() {
  if (!('Notification' in window)) return;
  if (!messaging) return;
  const permiso = await Notification.requestPermission();
  if (permiso === 'granted') {
    try {
      if (!CONFIG_APP.vapidKey || CONFIG_APP.vapidKey === 'TU_VAPID_KEY_AQUI') {
        console.warn('FCM: VAPID key no configurada. Saltando getToken.');
        return;
      }
      const token = await getToken(messaging, { vapidKey: CONFIG_APP.vapidKey });
      
      if (token && appState.sesion && appState.sesion.rol === 'admin') {
        await updateDoc(doc(db, 'usuarios', appState.sesion.uid), { fcmToken: token });
        console.log('Token FCM guardado:', token);
      }
    } catch(e) { console.error('Error al obtener token:', e); }
  }
}

if (messaging) {
  onMessage(messaging, (payload) => {
    const title = payload.notification?.title || payload.data?.title || 'Notificación';
    const body = payload.notification?.body || payload.data?.body || '';
    toast(`🔔 ${title}: ${body}`, 'info', 6000);
    contadorNotificaciones++;
    actualizarBadge();
  });
}

// ==========================================
// NOTIFICACIONES (BADGE LOCAL)
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

  const esAdmin = appState.sesion?.rol === 'admin';
  const btnMensajePopup = esAdmin
    ? `<button class="icon-btn" id="btnAbrirMensajePopup" title="Enviar mensaje al técnico">${icono('campana', 20)}</button>`
    : '';

  const headerHTML = `
    <header class="app-header">
      <div class="brand">
        <div class="brand-logo"><img src="/imagenes/web-app-manifest-192x192.png" alt="Logo"></div>
        <div class="brand-text"><h1>Panel</h1><p id="userInfo">Cargando...</p></div>
      </div>
      <div class="header-actions">
        ${btnMensajePopup}
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
  document.getElementById('btnNotificaciones')?.addEventListener('click', () => { 
    haptic(10); 
    contadorNotificaciones = 0; 
    actualizarBadge(); 
    toast('Notificaciones leídas', 'success'); 
  });
  document.getElementById('btnTema')?.addEventListener('click', toggleTheme);
  document.getElementById('btnAbrirMensajePopup')?.addEventListener('click', () => {
    haptic(15);
    document.getElementById('modalMensajePopup')?.classList.add('show');
  });
}

renderLayout();
actualizarBadge();

// ==========================================
// 2. AUTENTICACIÓN Y POPUPS
// ==========================================
requireAuth((s) => {
  appState.sesion = s;
  setTimeout(() => { 
    iniciarApp(); 
    const sub = document.getElementById('userInfo'); if(sub) sub.textContent = s.nombre;
    verificarPopups();
    
    // 🔥 SOLICITAR PERMISO DE NOTIFICACIONES SI ES ADMIN
    if (s.rol === 'admin') {
      solicitarPermisoNotificaciones();
    }
  }, 500);
});

function iniciarApp() {
  if (appState.sesion?.rol !== 'admin') {
    const btnRep = document.querySelector('.nav-item[href="/app/reportes/"]'); 
    if(btnRep) btnRep.style.display = 'none';
  }
  configurarEventos(); 
  cargarDatos();
  // Fallback: si en 3s no se ocultó, ocultar igual
  setTimeout(() => { if(appLoader) appLoader.classList.add('hidden'); }, CONFIG_APP.loaderFallbackMs);
}

async function verificarPopups() {
  try {
    const docRef = doc(db, 'config', 'popup_mensaje');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      const ahora = new Date().getTime();
      if (data.activo && data.fechaExpiracion > ahora && !data.leidoPorTecnico) {
        const t = document.getElementById('verPopupTitulo');
        const p = document.getElementById('verPopupTexto');
        if (t) t.textContent = data.titulo || 'Mensaje';
        if (p) p.textContent = data.texto || '';
        document.getElementById('modalVerPopup')?.classList.add('show');
      }
    }
  } catch(e) {
    if (e?.code !== 'permission-denied' && e?.code !== 'not-found') {
      console.warn('verificarPopups:', e?.message || e);
    }
  }
}

document.getElementById('btnOkPopup')?.addEventListener('click', async () => {
  document.getElementById('modalVerPopup').classList.remove('show');
  haptic(15);
  try {
    await updateDoc(doc(db, 'config', 'popup_mensaje'), { leidoPorTecnico: true });
    toast('Mensaje del dueño confirmado', 'success');
  } catch(e) { console.log('Error al confirmar lectura', e); }
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
// 4. EVENTOS
// ==========================================
function configurarEventos() {
  document.getElementById('nuevoReciboBtn')?.addEventListener('click', () => { haptic(15); window.location.href = '/app/cliente/'; });
  document.getElementById('ventaRapidaBtn')?.addEventListener('click', () => { haptic(15); modalVenta?.classList.add('show'); });
  document.getElementById('btnCloseVenta')?.addEventListener('click', () => modalVenta?.classList.remove('show'));
  document.getElementById('btnCloseSheet')?.addEventListener('click', () => reciboSheet?.classList.remove('show'));
  document.getElementById('btnClosePago')?.addEventListener('click', () => document.getElementById('modalPago')?.classList.remove('show'));
  
  document.querySelectorAll('.sheet-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.classList.remove('show'); });
  });

  document.getElementById('btnPDFDia')?.addEventListener('click', () => { haptic(15); abrirCierreDeCaja(); });
  document.getElementById('btnClosePreviewPDF')?.addEventListener('click', () => modalPreviewPDF?.classList.remove('show'));

  document.getElementById('btnDescargarPDF')?.addEventListener('click', () => {
    haptic(20);
    const gastos = leerGastosDelDOM();
    generarPDFCierre(gastos); 
    toast('PDF Descargado', 'success');
  });

  document.getElementById('btnCerrarYEnviar')?.addEventListener('click', async () => {
    haptic(20);
    const btn = document.getElementById('btnCerrarYEnviar');
    if (!btn) return;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';
    btn.disabled = true;

    try {
      const gastos = leerGastosDelDOM();
      await guardarCierreEnFirebase(gastos);
      generarPDFCierre(gastos);
      
      const totalGlobal = document.getElementById('totalGlobal')?.textContent || 'Bs. 0.00';
      const gananciaGlobal = document.getElementById('gananciaGlobal')?.textContent || 'Bs. 0.00';
      const montoTransferir = document.getElementById('montoTransferir')?.textContent || 'Bs. 0.00';
      
      const mensaje = `*CIERRE DE CAJA - DR. XIAOMI*\n\n` +
        `📅 *Fecha:* ${new Date().toLocaleDateString()}\n\n` +
        `💰 *Total del Día:* ${totalGlobal}\n` +
        `💵 *Ganancia Libre:* ${gananciaGlobal}\n\n` +
        `💸 *Monto a Transferir al Técnico:* ${montoTransferir}\n\n` +
        `_Adjunto el PDF con el detalle._`;

      setTimeout(() => {
        window.open(`https://wa.me/${CONFIG_APP.whatsappDueno}?text=${encodeURIComponent(mensaje)}`, '_blank');
      }, 1000);
      
      toast('Día cerrado y guardado', 'success');
      modalPreviewPDF?.classList.remove('show');
    } catch (e) {
      console.error(e);
      toast('Error al cerrar el día', 'error');
    } finally {
      btn.innerHTML = `<img src="/app/icons/whatsapp.png" width="20" height="20" style="margin-right: 8px;"> Cerrar Día y Enviar al Dueño`;
      btn.disabled = false;
    }
  });

  document.getElementById('gastoPasajes')?.addEventListener('input', recalcularCierre);
  document.getElementById('toggleAlmuerzo')?.addEventListener('change', recalcularCierre);

  document.getElementById('btnAbrirNotaDueno')?.addEventListener('click', () => { haptic(15); modalNotaDueno?.classList.add('show'); });
  document.getElementById('btnCancelarNotaDueno')?.addEventListener('click', () => modalNotaDueno?.classList.remove('show'));
  
  document.getElementById('btnGuardarNotaDueno')?.addEventListener('click', async () => {
    const texto = document.getElementById('notaDuenoTexto').value.trim();
    if (!texto) { toast('Escribe algo primero', 'error'); return; }
    haptic(20);
    try {
      await addDoc(collection(db, 'notas'), { texto, autor: appState.sesion?.nombre || 'Técnico', fecha: serverTimestamp() });
      toast('Nota guardada para el dueño', 'success');
      modalNotaDueno?.classList.remove('show');
      document.getElementById('notaDuenoTexto').value = '';
    } catch (e) { toast('Error al guardar', 'error'); }
  });

  document.getElementById('btnAbrirMensajePopup')?.addEventListener('click', () => {
    document.getElementById('modalMensajePopup')?.classList.add('show');
  });

  document.getElementById('btnCancelarMensajePopup')?.addEventListener('click', () => {
    document.getElementById('modalMensajePopup')?.classList.remove('show');
  });

  document.getElementById('btnGuardarMensajePopup')?.addEventListener('click', async () => {
    const titulo = (document.getElementById('mensajePopupTitulo').value || '').trim().slice(0, 100);
    const texto = (document.getElementById('mensajePopupTexto').value || '').trim().slice(0, 2000);
    const dias = parseInt(document.getElementById('mensajePopupDuracion').value) || 0;
    
    if (!titulo || !texto) { toast('Completa todos los campos', 'error'); return; }
    haptic(20);
    try {
      const fechaExpiracion = dias > 0 ? new Date().getTime() + (dias * 24 * 60 * 60 * 1000) : 9999999999999;
      await setDoc(doc(db, 'config', 'popup_mensaje'), {
        titulo, texto, fechaExpiracion, activo: true, leidoPorTecnico: false, fechaCreacion: serverTimestamp()
      });
      toast('Mensaje enviado al técnico', 'success');
      document.getElementById('modalMensajePopup')?.classList.remove('show');
    } catch(err) { toast('Error al enviar', 'error'); }
  });

  // 🔥 MOSTRAR/OCULTAR "OTRO" EN VENTA SERVICIO
  const selConcepto = document.getElementById('ventaConcepto');
  const wrapOtro = document.getElementById('wrapConceptoOtro');
  selConcepto?.addEventListener('change', () => {
    if (wrapOtro) wrapOtro.style.display = selConcepto.value === 'Otro' ? 'block' : 'none';
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
    let concepto = document.getElementById('ventaConcepto').value;
    let monto = parseFloat(document.getElementById('ventaMonto').value);
    let metodo = document.getElementById('ventaMetodo').value;
    if (concepto === 'Otro') {
      const c = document.getElementById('ventaConceptoOtro').value.trim();
      if (!c) { toast('Especifica qué se vendió', 'error'); return; }
      concepto = c;
    }
    if (!monto || monto <= 0 || isNaN(monto)) { toast('Ingresa un monto válido', 'error'); return; }
    haptic(20);
    try {
      await addDoc(collection(db, 'ventas'), { concepto, monto, costo: 0, metodoPago: metodo, fecha: serverTimestamp(), creadoPor: appState.sesion?.nombre || 'Técnico' });
      toast('Venta registrada', 'success'); 
      modalVenta?.classList.remove('show');
    } catch (err) { toast('Error al guardar', 'error'); }
  });

  document.getElementById('btnRegistrarAccesorio')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const id = btn.dataset.id, nombre = btn.dataset.nombre;
    const precio = parseFloat(btn.dataset.precio), costo = parseFloat(btn.dataset.costo);
    const stock = parseInt(btn.dataset.stock);
    const cantidad = parseInt(document.getElementById('accesorioCantidad').value);

    if (!id) return;
    if (!cantidad || cantidad < 1 || isNaN(cantidad)) { toast('Cantidad inválida', 'error'); return; }
    if (cantidad > stock) { toast('No hay suficiente stock', 'error'); return; }

    haptic(20);
    try {
      const total = precio * cantidad;
      await addDoc(collection(db, 'ventas'), { concepto: `${cantidad}x ${nombre}`, monto: total, costo: costo * cantidad, metodoPago: 'Efectivo', fecha: serverTimestamp(), creadoPor: appState.sesion?.nombre || 'Técnico' });
      await updateDoc(doc(db, 'productos', id), { stock: stock - cantidad });
      toast('Venta de accesorio registrada', 'success'); 
      modalVenta?.classList.remove('show');
      document.getElementById('productoSeleccionadoInfo').style.display = 'none';
      btn.disabled = true;
    } catch (err) { console.error(err); toast('Error al guardar', 'error'); }
  });

  document.getElementById('filtros')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filtro]'); if (!btn) return;
    haptic(10); 
    document.querySelectorAll('#filtros .chip-interactive').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
    btn.classList.add('active'); btn.setAttribute('aria-selected', 'true');
    filtroActual = btn.dataset.filtro;
    busquedaActual = ''; document.getElementById('buscador').value = ''; paginaActual = 1; renderizarTodo();
  });
  document.getElementById('buscador')?.addEventListener('input', (e) => {
    busquedaActual = e.target.value.toLowerCase().trim(); paginaActual = 1; renderizarTodoDebounced();
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
      // Ocultar loader al primer snapshot
      if (appLoader && !appLoader.classList.contains('hidden')) appLoader.classList.add('hidden');
      renderizarTodo();
    }, (err) => { 
      console.error(err); 
      if (appLoader) appLoader.classList.add('hidden');
    });

  if (unsubscribeVentas) unsubscribeVentas();
  unsubscribeVentas = onSnapshot(query(collection(db, 'ventas'), orderBy('fecha', 'desc'), limit(100)), (snap) => {
    ventasPanel = snap.docs.map(d => ({ id: d.id, origen: 'panel', coleccion: 'ventas', ...d.data() })); 
    procesarVentas();
  });

  if (unsubscribeCierres) unsubscribeCierres();
  unsubscribeCierres = onSnapshot(query(collection(db, 'cierres'), orderBy('fecha', 'desc'), limit(100)), (snap) => {
    ventasCierre = [];
    snap.forEach(docSnap => { 
      const d = docSnap.data();
      if (Array.isArray(d.ventasInventario)) {
        d.ventasInventario.forEach((v, i) => ventasCierre.push({ 
          id: docSnap.id, indexExtra: `inv_${i}`, origen: 'cierre', coleccion: 'cierres', 
          concepto: `${v.cantidad}x ${v.nombre}`, monto: Number(v.precio * v.cantidad) || 0, 
          costo: Number(v.costo || 0), metodoPago: 'Efectivo', fecha: d.fecha 
        }));
      }
      if (Array.isArray(d.extras)) {
        d.extras.forEach((e, i) => { 
          if (Number(e.monto) > 0) ventasCierre.push({ 
            id: docSnap.id, indexExtra: `ext_${i}`, origen: 'cierre', coleccion: 'cierres', 
            concepto: e.desc || 'Venta Extra', monto: Number(e.monto) || 0, 
            costo: 0, metodoPago: 'Efectivo', fecha: d.fecha 
          }); 
        });
      }
    });
    procesarVentas();
  });

  if (unsubscribeInventario) unsubscribeInventario();
  unsubscribeInventario = onSnapshot(query(collection(db, 'productos')), (snap) => {
    appState.inventario = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  });
}

function procesarVentas() { 
  appState.ventasHoy = [...ventasPanel, ...ventasCierre].sort((a, b) => (parsearFecha(b.fecha) || 0) - (parsearFecha(a.fecha) || 0)); 
  renderizarTodoDebounced(); 
}

// Debounce para no renderizar 4 veces seguidas
let renderTimer = null;
function renderizarTodoDebounced() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderizarTodo, CONFIG_APP.debounceRenderMs);
}

function renderizarTodo() {
  actualizarStats(); 
  todosLosMovimientos = [];
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
      const txt = m.tipo === 'telefono' ? [m.data.numeroRecibo, m.data.cliente, m.data.telefono, m.data.marca, m.data.modelo].filter(Boolean).join(' ').toLowerCase() : (m.data.concepto || '').toLowerCase();
      return txt.includes(busquedaActual);
    });
  }
  todosLosMovimientos.sort((a, b) => b.fechaOrden - a.fechaOrden);
  const totalPag = Math.ceil(todosLosMovimientos.length / ITEMS_POR_PAGINA);
  if (paginaActual > totalPag) paginaActual = totalPag || 1;
  const pagItems = todosLosMovimientos.slice((paginaActual - 1) * ITEMS_POR_PAGINA, paginaActual * ITEMS_POR_PAGINA);
  const lista = document.getElementById('listaOrdenes');
  if (!lista) return;
  if (todosLosMovimientos.length === 0) {
    lista.innerHTML = `<div class="empty-state"><h3>Sin movimientos</h3><p>No hay resultados.</p></div>`; 
    if (paginationContainer) paginationContainer.innerHTML = ''; 
    return;
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
  if (!paginationContainer) return;
  if (total <= 1) { paginationContainer.innerHTML = ''; return; }
  let html = `<button type="button" class="page-nav" data-page="${paginaActual - 1}" ${paginaActual === 1 ? 'disabled' : ''}>Ant</button>`;
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= paginaActual - 1 && i <= paginaActual + 1)) {
      html += `<button type="button" class="page-btn ${i === paginaActual ? 'active' : ''}" data-page="${i}">${i}</button>`;
    } else if (i === paginaActual - 2 || i === paginaActual + 2) {
      html += `<span>...</span>`;
    }
  }
  html += `<button type="button" class="page-nav" data-page="${paginaActual + 1}" ${paginaActual === total ? 'disabled' : ''}>Sig</button>`;
  paginationContainer.innerHTML = html;
  
  paginationContainer.querySelectorAll('button[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = parseInt(btn.dataset.page);
      if (!isNaN(p) && p >= 1) cambiarPagina(p);
    });
  });
}

window.cambiarPagina = (p) => { 
  haptic(8); 
  paginaActual = p; 
  renderizarTodo(); 
  document.querySelector('.app-content')?.scrollTo({ top: 0, behavior: 'smooth' }); 
};

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
  const f = parsearFecha(v.fecha); 
  const hora = f ? `${String(f.getHours()).padStart(2,'0')}:${String(f.getMinutes()).padStart(2,'0')}` : '';
  
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
        <div class="info-title">${escapeHtml(v.concepto || '')}</div>
        <div class="info-sub">${hora} · ${escapeHtml(v.metodoPago || '')}</div>
      </div>
      <div class="monto-col">
        <div class="monto" style="color: ${cor};">${formatBsLimpio(v.monto)}</div>
      </div>
    </div>`;
}

function actualizarStats() {
  const activas = document.getElementById('statActivas');
  const listas = document.getElementById('statListas');
  const hoyEl = document.getElementById('statHoy');
  if (activas) activas.textContent = appState.ordenes.filter(o => ['recibido', 'reparacion', 'espera-repuesto'].includes(o.estadoOrden || 'recibido')).length;
  if (listas) listas.textContent = appState.ordenes.filter(o => o.estadoOrden === 'listo').length;
  
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  let ingRep = 0; 
  appState.ordenes.forEach(o => { 
    if (o.estadoOrden === 'entregado') { 
      const f = parsearFecha(o.fechaEntrega) || parsearFecha(o.fechaEditada) || parsearFecha(o.fecha); 
      if (f && f >= hoy) ingRep += Number(o.montoCobrado) || Number(o.total) || 0; 
    } 
  });
  
  // Dedupe: evitar doble conteo de ventas de accesorios que ya están en cierres
  const ventasHoyUnicas = dedupeVentas(appState.ventasHoy);
  const ingVent = ventasHoyUnicas.filter(v => { const f = parsearFecha(v.fecha); return f && f >= hoy; }).reduce((s, v) => s + (Number(v.monto) || 0), 0);
  
  if (hoyEl) hoyEl.textContent = formatBsLimpio(ingRep + ingVent);
}

// Dedupe simple por concepto+monto+fecha (minuto) para evitar duplicados entre ventas y cierres
function dedupeVentas(ventas) {
  const seen = new Set();
  const result = [];
  for (const v of ventas) {
    const f = parsearFecha(v.fecha);
    const min = f ? `${f.getFullYear()}-${f.getMonth()}-${f.getDate()}-${f.getHours()}-${f.getMinutes()}` : 'sin-fecha';
    const key = `${v.concepto || ''}|${Number(v.monto) || 0}|${min}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(v);
  }
  return result;
}

// ==========================================
// 6. LÓGICA DEL CIERRE DE CAJA (MODAL)
// ==========================================
async function abrirCierreDeCaja() {
  const hoy = new Date();
  hoy.setHours(0,0,0,0);
  const hoyStr = hoy.toDateString();

  reparacionesData = { total: 0, efectivo: 0, qr: 0, cantidad: 0, ganancia: 0 };
  ventasAccesoriosData = { total: 0, cantidad: 0, ganancia: 0 };
  ventasExtrasData = { total: 0, cantidad: 0, ganancia: 0 };

  try {
    const qRecibos = query(collection(db, 'recibos'), where('estadoOrden', '==', 'entregado'));
    const snapRecibos = await getDocs(qRecibos);
    
    snapRecibos.forEach(docSnap => {
      const d = docSnap.data();
      let fechaD = d.fechaEntrega || d.fecha;
      if (fechaD && typeof fechaD.toDate === 'function') fechaD = fechaD.toDate();
      
      if (fechaD && fechaD.toDateString() === hoyStr) {
        const monto = Number(d.montoCobrado) || 0;
        const costo = Number(d.costoRepuesto) || 0;
        const metodo = (d.metodoPago || 'Efectivo').toLowerCase();

        reparacionesData.total += monto;
        reparacionesData.ganancia += (monto - costo);
        reparacionesData.cantidad++;

        if (metodo.includes('efectivo')) reparacionesData.efectivo += monto;
        else if (metodo.includes('qr')) reparacionesData.qr += monto;
      }
    });
  } catch (e) {
    console.error('Error al leer recibos para cierre:', e);
    toast('Error al leer recibos. Se usará solo ventas.', 'error');
  }

  // Ventas de accesorios del día (solo de la colección 'ventas', no de cierres)
  const ventasHoyUnicas = dedupeVentas(appState.ventasHoy);
  ventasHoyUnicas.forEach(v => {
    const f = parsearFecha(v.fecha);
    if (f && f.toDateString() === hoyStr) {
      const monto = Number(v.monto) || 0;
      const costo = Number(v.costo) || 0;
      if (v.origen === 'panel') {
        ventasAccesoriosData.total += monto;
        ventasAccesoriosData.ganancia += (monto - costo);
        ventasAccesoriosData.cantidad++;
      }
    }
  });

  renderizarVistaPreviaCierre();
  recalcularCierre();
  modalPreviewPDF?.classList.add('show');
}

function renderizarVistaPreviaCierre() {
  const container = document.getElementById('previewPDFContent');
  if (!container) return;
  const hoy = new Date();
  const fechaStr = `${String(hoy.getDate()).padStart(2,'0')}/${String(hoy.getMonth()+1).padStart(2,'0')}/${hoy.getFullYear()}`;

  container.innerHTML = `
    <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 12px;">
      <h2 style="font-size: 16px; margin: 0; font-family: 'Helvetica';">DR. XIAOMI SCZ</h2>
      <p style="margin: 0; font-size: 10px;">Cierre del ${fechaStr}</p>
    </div>
    <table style="width: 100%; font-size: 11px; text-align: left; margin-bottom: 12px;">
      <tr><th>Concepto</th><th style="text-align: right;">Monto</th></tr>
      <tr><td>Reparaciones Entregadas (${reparacionesData.cantidad})</td><td style="text-align: right; font-weight: bold;">Bs. ${reparacionesData.total.toFixed(2)}</td></tr>
      <tr><td>Ventas de Accesorios</td><td style="text-align: right; font-weight: bold;">Bs. ${ventasAccesoriosData.total.toFixed(2)}</td></tr>
      <tr><td>Ventas Extras</td><td style="text-align: right; font-weight: bold;">Bs. ${ventasExtrasData.total.toFixed(2)}</td></tr>
    </table>
    <div style="background: #f0f0f0; padding: 8px; border-radius: 4px; font-size: 11px;">
      <div style="display: flex; justify-content: space-between;"><span>Efectivo:</span> <strong>Bs. ${reparacionesData.efectivo.toFixed(2)}</strong></div>
      <div style="display: flex; justify-content: space-between;"><span>QR:</span> <strong>Bs. ${reparacionesData.qr.toFixed(2)}</strong></div>
    </div>
  `;
}

function leerGastosDelDOM() {
  const pasajes = parseFloat(document.getElementById('gastoPasajes')?.value) || 0;
  const almuerzo = document.getElementById('toggleAlmuerzo')?.checked ? CONFIG_APP.gastoAlmuerzo : 0;
  return { pasajes, almuerzo, totalGastos: pasajes + almuerzo };
}

function recalcularCierre() {
  const { totalGastos } = leerGastosDelDOM();

  const totalGlobal = reparacionesData.total + ventasAccesoriosData.total + ventasExtrasData.total;
  // Ganancia real: ganancia de reparaciones + accesorios + extras - gastos
  const gananciaReal = (reparacionesData.ganancia + ventasAccesoriosData.ganancia + ventasExtrasData.ganancia) - totalGastos;

  // Efectivo en caja = efectivo cobrado por reparaciones (las ventas de accesorios también son efectivo)
  const efectivoEnCaja = reparacionesData.efectivo + ventasAccesoriosData.total;
  let montoTransferir = 0;

  // Si el efectivo en caja no cubre la ganancia libre, el técnico transfiere la diferencia al dueño
  if (efectivoEnCaja < gananciaReal) {
    montoTransferir = gananciaReal - efectivoEnCaja;
  }

  const elTotal = document.getElementById('totalGlobal');
  const elGanancia = document.getElementById('gananciaGlobal');
  const elMontoTransf = document.getElementById('montoTransferir');

  if (elTotal) elTotal.textContent = formatBsLimpio(totalGlobal);
  if (elGanancia) elGanancia.textContent = formatBsLimpio(gananciaReal);
  if (elMontoTransf) elMontoTransf.textContent = formatBsLimpio(montoTransferir);
}

function generarPDFCierre(gastos) {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });

  pdf.setFillColor(255, 105, 0); pdf.rect(0, 0, 210, 30, 'F');
  pdf.setTextColor(255, 255, 255); pdf.setFontSize(20); pdf.text('DR. XIAOMI SCZ', 14, 15);
  pdf.setFontSize(10); pdf.text('Cierre de Caja Diario', 14, 22);
  pdf.setTextColor(0, 0, 0); pdf.setFontSize(12);
  pdf.text(`Fecha: ${new Date().toLocaleDateString('es-BO')}`, 14, 45);
  pdf.text(`Realizado por: ${appState.sesion?.nombre || 'Técnico'}`, 14, 52);

  pdf.setFontSize(14); pdf.setFont('helvetica', 'bold'); pdf.text('Reparaciones', 14, 65);
  pdf.setFontSize(11); pdf.setFont('helvetica', 'normal');
  pdf.text(`- Cantidad entregada: ${reparacionesData.cantidad}`, 18, 72);
  pdf.text(`- Total Cobrado: ${formatBsLimpio(reparacionesData.total)}`, 18, 79);

  let y = 90;
  if (ventasAccesoriosData.cantidad > 0) {
    pdf.setFontSize(14); pdf.setFont('helvetica', 'bold'); pdf.text('Ventas de Accesorios', 14, y); y += 7;
    pdf.setFontSize(11); pdf.setFont('helvetica', 'normal');
    pdf.text(`- Total: ${formatBsLimpio(ventasAccesoriosData.total)}`, 18, y); y += 10;
  }

  const totalGastos = gastos?.totalGastos || 0;
  const totalGlobal = reparacionesData.total + ventasAccesoriosData.total + ventasExtrasData.total;
  const gananciaReal = (reparacionesData.ganancia + ventasAccesoriosData.ganancia + ventasExtrasData.ganancia) - totalGastos;
  const efectivoEnCaja = reparacionesData.efectivo + ventasAccesoriosData.total;
  const montoTransferir = Math.max(0, gananciaReal - efectivoEnCaja);

  pdf.setFillColor(240, 240, 240); pdf.rect(14, y, 182, 20, 'F');
  pdf.setFontSize(16); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(255, 105, 0);
  pdf.text(`TOTAL DEL DÍA: ${formatBsLimpio(totalGlobal)}`, 105, y + 13, { align: 'center' });

  pdf.setFillColor(16, 185, 129); pdf.rect(14, y + 22, 182, 20, 'F');
  pdf.setTextColor(255, 255, 255); pdf.text(`GANANCIA NETA: ${formatBsLimpio(gananciaReal)}`, 105, y + 35, { align: 'center' });

  if (montoTransferir > 0) {
    pdf.setFillColor(59, 130, 246); pdf.rect(14, y + 44, 182, 20, 'F');
    pdf.setTextColor(255, 255, 255); pdf.text(`MONTO A TRANSFERIR AL TÉCNICO: ${formatBsLimpio(montoTransferir)}`, 105, y + 57, { align: 'center' });
  }

  pdf.setFontSize(8); pdf.setTextColor(120, 120, 120); pdf.text('Generado automáticamente por DR. Xiaomi', 105, 280, { align: 'center' });

  pdf.save(`Cierre_${new Date().toISOString().slice(0,10)}.pdf`);
}

async function guardarCierreEnFirebase(gastos) {
  const { pasajes, almuerzo, totalGastos } = gastos;
  const totalGlobal = reparacionesData.total + ventasAccesoriosData.total + ventasExtrasData.total;
  const gananciaReal = (reparacionesData.ganancia + ventasAccesoriosData.ganancia + ventasExtrasData.ganancia) - totalGastos;
  const efectivoEnCaja = reparacionesData.efectivo + ventasAccesoriosData.total;
  const montoTransferir = Math.max(0, gananciaReal - efectivoEnCaja);

  const fechaStr = new Date().toISOString().slice(0, 10); // idempotente por día
  const cierreRef = doc(db, 'cierres', fechaStr);

  // Ventas de accesorios del día (para que el lector pueda releerlas)
  const hoyStr = new Date().toDateString();
  const ventasInventario = [];
  const extras = [];
  const ventasHoyUnicas = dedupeVentas(appState.ventasHoy);
  ventasHoyUnicas.forEach(v => {
    const f = parsearFecha(v.fecha);
    if (f && f.toDateString() === hoyStr && v.origen === 'panel') {
      ventasInventario.push({
        nombre: v.concepto || 'Venta',
        cantidad: 1,
        precio: Number(v.monto) || 0,
        costo: Number(v.costo) || 0
      });
    }
  });

  await setDoc(cierreRef, {
    fecha: serverTimestamp(),
    realizadoPor: appState.sesion?.nombre || 'Técnico',
    reparaciones: reparacionesData,
    ventasAccesorios: ventasAccesoriosData,
    ventasExtras: ventasExtrasData,
    ventasInventario,
    extras,
    totalGlobal,
    gananciaReal,
    gastoPasajes: pasajes,
    gastoAlmuerzo: almuerzo,
    montoTransferir
  }, { merge: true });
}

// ==========================================
// 7. LÓGICA DE PULL TO REFRESH (Jalar para actualizar)
// ==========================================
let touchStartY = 0;
let touchCurrentY = 0;
let isPulling = false;
const pullThreshold = CONFIG_APP.pullThreshold;
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
      if (ptrIcon) ptrIcon.style.transform = `rotate(${progress * 360}deg)`;
    }
  }, { passive: false });

  appContent.addEventListener('touchend', () => {
    if (!isPulling) return;
    const distance = touchCurrentY - touchStartY;

    if (distance > pullThreshold && appContent.scrollTop === 0) {
      pullIndicator.style.transform = 'translateX(-50%) translateY(50px)';
      if (ptrIcon) ptrIcon.style.animation = 'spin 0.8s linear infinite'; 
      
      // 🔥 NO re-suscribir: solo re-render local. Los listeners ya están activos.
      if (typeof renderizarTodo === 'function') {
        renderizarTodo();
        setTimeout(() => {
          resetPullToRefresh();
          toast('Datos actualizados', 'success');
        }, 600);
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
    if (ptrIcon) {
      ptrIcon.style.animation = 'none';
      ptrIcon.style.transform = 'rotate(0deg)';
    }
  }
}
