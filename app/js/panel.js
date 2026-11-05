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
  vapidKey: 'BNCSlsvNPr7pVw5dZTtm-mrSOrXsuIMQ_9IW9KTVPS1Hm8IEJMh8DaEk1nojGJ_4ZwVgV6ZYUgVTFSymAyS-jRc' 
};

// ==========================================
// 🔥 MOTOR DE SONIDO NATIVO MODERNO (UI SOUNDS)
// ==========================================
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function playSound(type) {
  try {
    initAudio();
    const now = audioCtx.currentTime;
    
    // Función auxiliar para crear un oscilador
    const createOsc = (freqStart, freqEnd, duration, gainVal, waveType) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = waveType;
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.setValueAtTime(freqStart, now);
      osc.frequency.exponentialRampToValueAtTime(freqEnd, now + duration);
      gain.gain.setValueAtTime(gainVal, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.start(now);
      osc.stop(now + duration);
    };

    // Función auxiliar para crear un "ruido" (sonidos modernos)
    const createNoise = (duration, filterFreq, gainVal) => {
      const bufferSize = audioCtx.sampleRate * duration;
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      
      const noise = audioCtx.createBufferSource();
      noise.buffer = buffer;
      
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = filterFreq;
      
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(gainVal, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);
      noise.start(now);
    };

    if (type === 'click') {
      // Un "Tick" seco y agudo (Estilo iOS)
      createOsc(1500, 500, 0.04, 0.2, 'triangle');
      createNoise(0.02, 5000, 0.1);
    } 
    else if (type === 'pop') {
      // Un "Bloop" rápido (Estilo Material Design)
      createOsc(800, 200, 0.1, 0.3, 'sine');
    } 
    else if (type === 'success') {
      // Dos notas cristalinas rápidas (Do agudo y Sol)
      createOsc(1046.50, 1046.50, 0.1, 0.2, 'sine'); // C6
      setTimeout(() => createOsc(1567.98, 1567.98, 0.2, 0.2, 'sine'), 80); // G6
    } 
    else if (type === 'error') {
      // Un zumbido moderno y opaco
      createOsc(200, 150, 0.15, 0.3, 'square');
      createNoise(0.1, 1000, 0.05);
    }
  } catch (e) { console.warn('Audio error', e); }
}

// Conectar sonidos de click a toda la interfaz
document.addEventListener('click', (e) => {
  if (e.target.closest('button') || e.target.closest('.nav-item') || e.target.closest('.chip-btn')) {
    playSound('click');
  }
});

export let appState = { sesion: null, ordenes: [], ventasHoy: [], inventario: [] };
let filtroActual = 'todos', busquedaActual = '', todosLosMovimientos = [], paginaActual = 1;
let unsubscribe = null, unsubscribeVentas = null, unsubscribeCierres = null, unsubscribeInventario = null; 
let ventasPanel = [];
const ITEMS_POR_PAGINA = CONFIG_APP.itemsPorPagina;

// Variables para el cierre
let reparacionesData = { total: 0, efectivo: 0, qr: 0, cantidad: 0 };
let ventasAccesoriosData = { total: 0, efectivo: 0, qr: 0, cantidad: 0 };
let detallesReparaciones = [];
let detallesVentas = [];

// Variable para editar venta
let ventaActualEditando = null;

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
  if (!('Notification' in window) || !messaging) return;
  const permiso = await Notification.requestPermission();
  if (permiso === 'granted') {
    try {
      if (!CONFIG_APP.vapidKey || CONFIG_APP.vapidKey === 'TU_VAPID_KEY_AQUI') return;
      const token = await getToken(messaging, { vapidKey: CONFIG_APP.vapidKey });
      if (token && appState.sesion?.rol === 'admin') {
        await updateDoc(doc(db, 'usuarios', appState.sesion.uid), { fcmToken: token });
      }
    } catch(e) { console.error(e); }
  }
}

if (messaging) {
  onMessage(messaging, (payload) => {
    const title = payload.notification?.title || payload.data?.title || 'Notificación';
    const body = payload.notification?.body || payload.data?.body || '';
    toast(`🔔 ${title}: ${body}`, 'info', 6000);
    escucharNotificaciones(); 
  });
}

// ==========================================
// BANDEJA DE NOTIFICACIONES (PARA EL DUEÑO)
// ==========================================
let notificacionesList = [];
let unsubscribeNotif = null;

function actualizarBadgeNotif() {
  const badge = document.getElementById('notifBadge');
  if (badge) {
    const noLeidas = notificacionesList.filter(n => !n.leido).length;
    badge.textContent = noLeidas;
    badge.style.display = noLeidas > 0 ? 'block' : 'none';
  }
}

function escucharNotificaciones() {
  if (unsubscribeNotif) unsubscribeNotif();
  if (appState.sesion?.rol !== 'admin') return; 

  unsubscribeNotif = onSnapshot(query(collection(db, 'notificaciones'), orderBy('fecha', 'desc'), limit(50)), (snap) => {
    notificacionesList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    actualizarBadgeNotif();
  });
}

function renderNotificacionesModal() {
  const container = document.getElementById('listaNotificaciones');
  if (!container) return;

  if (notificacionesList.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding: 20px; color: var(--text-3);">No hay notificaciones aún.</div>`;
    return;
  }
  
  container.innerHTML = notificacionesList.map(n => `
    <div style="background: var(--bg-elev-2); padding: 12px; border-radius: var(--r-md); margin-bottom: 8px; border-left: 3px solid ${n.leido ? 'var(--border-1)' : 'var(--brand-500)'};">
      <div style="font-weight: 800; font-size: 13px; color: var(--text-1);">${escapeHtml(n.titulo)}</div>
      <div style="font-size: 12px; color: var(--text-2); margin-top: 4px;">${escapeHtml(n.mensaje)}</div>
      <div style="font-size: 10px; color: var(--text-3); margin-top: 6px;">${tiempoRelativo(n.fecha)}</div>
    </div>
  `).join('');
}

async function marcarNotificacionesLeidas() {
  const noLeidas = notificacionesList.filter(n => !n.leido);
  if (noLeidas.length === 0) return;
  for (const n of noLeidas) {
    await updateDoc(doc(db, 'notificaciones', n.id), { leido: true });
  }
}

// ==========================================
// GUARDAR NOTIFICACIÓN EN BD
// ==========================================
async function enviarNotificacionDB(titulo, mensaje) {
  try {
    await addDoc(collection(db, 'notificaciones'), { 
      titulo: titulo, 
      mensaje: mensaje, 
      leido: false, 
      fecha: serverTimestamp() 
    });
  } catch(e) { console.error('Error al guardar notificación', e); }
}

// ==========================================
// 1. RENDERIZADO DEL LAYOUT
// ==========================================
function renderLayout() {
  const container = document.querySelector('.app-container');
  if (!container) return;

  const esAdmin = appState.sesion?.rol === 'admin';
  const btnMensajePopup = esAdmin ? `<button type="button" class="icon-btn" id="btnAbrirMensajePopup" title="Mensaje al técnico">${icono('nota', 20)}</button>` : '';

  const headerHTML = `
    <header class="app-header">
      <div class="brand">
        <div class="brand-logo"><img src="/imagenes/web-app-manifest-192x192.png" alt="Logo"></div>
        <div class="brand-text"><h1>Panel</h1><p id="userInfo">Cargando...</p></div>
      </div>
      <div class="header-actions">
        ${btnMensajePopup}
        <button type="button" class="icon-btn" id="btnNotificaciones" style="position:relative;">
          ${icono('campana', 20)}
          <span class="notif-badge" id="notifBadge" style="position:absolute; top:-4px; right:-4px; display:none; background:var(--danger-500); color:white; font-size:10px; font-weight:800; padding:2px 5px; border-radius:10px; border:2px solid var(--bg-elev-1);">0</span>
        </button>
        <button type="button" class="icon-btn" id="btnTema">${icono('tema', 20)}</button>
        <button type="button" class="icon-btn" id="btnSalir">${icono('salir', 20)}</button>
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
    playSound('pop');
    renderNotificacionesModal();
    document.getElementById('modalNotificaciones')?.classList.add('show');
    marcarNotificacionesLeidas(); 
  });
  
  document.getElementById('btnTema')?.addEventListener('click', toggleTheme);
  document.getElementById('btnAbrirMensajePopup')?.addEventListener('click', () => {
    haptic(15);
    playSound('pop');
    document.getElementById('modalMensajePopup')?.classList.add('show');
  });
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
    if (s.rol === 'admin') {
      solicitarPermisoNotificaciones();
      escucharNotificaciones(); 
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
        playSound('pop');
      }
    }
  } catch(e) { /* Silencioso */ }
}

document.getElementById('btnOkPopup')?.addEventListener('click', async () => {
  document.getElementById('modalVerPopup').classList.remove('show');
  haptic(15);
  try {
    await updateDoc(doc(db, 'config', 'popup_mensaje'), { leidoPorTecnico: true });
    toast('Mensaje confirmado', 'success');
    playSound('success');
  } catch(e) { console.log(e); }
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
// FUNCIÓN PARA EDITAR VENTA (SOLO ADMIN)
// ==========================================
async function abrirEditarVenta(id) {
  const venta = appState.ventasHoy.find(v => v.id === id);
  if (!venta) return;
  
  ventaActualEditando = venta;
  
  const inputCosto = document.getElementById('editCostoVenta');
  if (inputCosto) inputCosto.value = venta.costo || 0;
  
  document.getElementById('modalEditarVenta')?.classList.add('show');
  playSound('pop');
}

// ==========================================
// 4. EVENTOS
// ==========================================
function configurarEventos() {
  document.getElementById('nuevoReciboBtn')?.addEventListener('click', () => { 
    haptic(15); 
    playSound('pop');
    setTimeout(() => { window.location.href = '/app/cliente/'; }, 100);
  });
  
  document.getElementById('ventaRapidaBtn')?.addEventListener('click', () => { 
    haptic(15); 
    playSound('pop');
    resetVentaModal();
    modalVenta?.classList.add('show'); 
  });

  document.getElementById('btnCloseVenta')?.addEventListener('click', () => modalVenta?.classList.remove('show'));
  document.getElementById('btnCloseSheet')?.addEventListener('click', () => reciboSheet?.classList.remove('show'));
  document.getElementById('btnClosePago')?.addEventListener('click', () => document.getElementById('modalPago')?.classList.remove('show'));
  document.getElementById('btnCloseNotificaciones')?.addEventListener('click', () => document.getElementById('modalNotificaciones')?.classList.remove('show'));
  
  document.querySelectorAll('.sheet-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.classList.remove('show'); });
  });

  document.getElementById('btnPDFDia')?.addEventListener('click', () => { 
    haptic(15); 
    playSound('pop');
    abrirCierreDeCaja(); 
  });
  document.getElementById('btnClosePreviewPDF')?.addEventListener('click', () => modalPreviewPDF?.classList.remove('show'));

  document.getElementById('btnDescargarPDF')?.addEventListener('click', () => {
    haptic(20);
    playSound('success');
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
      const resumen = calcularResumenCierre(gastos);
      
      await guardarCierreEnFirebase(gastos, resumen);
      generarPDFCierre(gastos);
      playSound('success');
      
      const mensaje = `*CIERRE DE CAJA - DR. XIAOMI*\n\n` +
        `📅 *Fecha:* ${new Date().toLocaleDateString()}\n\n` +
        `💰 *Total Cobrado:* ${formatBsLimpio(resumen.totalGlobal)}\n` +
        `💵 *Efectivo Físico:* ${formatBsLimpio(resumen.efectivoCaja)}\n` +
        `📱 *QR:* ${formatBsLimpio(resumen.qrCaja)}\n\n` +
        `💸 *A Entregar al Dueño:* ${formatBsLimpio(resumen.aEntregar)}\n` +
        `_(Se descontaron Bs. ${resumen.totalGastos} de gastos)_\n\n` +
        `_Adjunto el PDF con el detalle._`;

      setTimeout(() => {
        window.open(`https://wa.me/${CONFIG_APP.whatsappDueno}?text=${encodeURIComponent(mensaje)}`, '_blank');
      }, 1000);
      
      toast('Día cerrado y guardado', 'success');
      modalPreviewPDF?.classList.remove('show');
    } catch (e) {
      console.error(e);
      playSound('error');
      toast('Error al cerrar el día', 'error');
    } finally {
      btn.innerHTML = `<img src="/app/icons/whatsapp.png" width="20" height="20" style="margin-right: 8px;"> Cerrar Día y Enviar al Dueño`;
      btn.disabled = false;
    }
  });

  document.getElementById('gastoPasajes')?.addEventListener('input', recalcularCierre);
  document.getElementById('toggleAlmuerzo')?.addEventListener('change', recalcularCierre);

  document.getElementById('btnAbrirNotaDueno')?.addEventListener('click', () => { 
    haptic(15); 
    playSound('pop');
    modalNotaDueno?.classList.add('show'); 
  });
  document.getElementById('btnCancelarNotaDueno')?.addEventListener('click', () => modalNotaDueno?.classList.remove('show'));
  
  document.getElementById('btnGuardarNotaDueno')?.addEventListener('click', async () => {
    const texto = document.getElementById('notaDuenoTexto').value.trim();
    if (!texto) { 
      playSound('error');
      toast('Escribe algo primero', 'error'); 
      return; 
    }
    haptic(20);
    try {
      await addDoc(collection(db, 'notas'), { texto, autor: appState.sesion?.nombre || 'Técnico', fecha: serverTimestamp() });
      await enviarNotificacionDB('Nota del Técnico', `${appState.sesion?.nombre || 'Técnico'}: ${texto}`);
      
      playSound('success');
      toast('Nota guardada', 'success');
      modalNotaDueno?.classList.remove('show');
      document.getElementById('notaDuenoTexto').value = '';
    } catch (e) { 
      playSound('error');
      toast('Error al guardar', 'error'); 
    }
  });

  document.getElementById('btnCancelarMensajePopup')?.addEventListener('click', () => {
    document.getElementById('modalMensajePopup')?.classList.remove('show');
  });

  document.getElementById('btnGuardarMensajePopup')?.addEventListener('click', async () => {
    const titulo = (document.getElementById('mensajePopupTitulo').value || '').trim().slice(0, 100);
    const texto = (document.getElementById('mensajePopupTexto').value || '').trim().slice(0, 2000);
    const dias = parseInt(document.getElementById('mensajePopupDuracion').value) || 0;
    
    if (!titulo || !texto) { 
      playSound('error');
      toast('Completa todos los campos', 'error'); 
      return; 
    }
    haptic(20);
    try {
      const fechaExpiracion = dias > 0 ? new Date().getTime() + (dias * 24 * 60 * 60 * 1000) : 9999999999999;
      await setDoc(doc(db, 'config', 'popup_mensaje'), { titulo, texto, fechaExpiracion, activo: true, leidoPorTecnico: false, fechaCreacion: serverTimestamp() });
      await enviarNotificacionDB('Mensaje del Dueño', texto);

      playSound('success');
      toast('Mensaje enviado', 'success');
      document.getElementById('modalMensajePopup')?.classList.remove('show');
    } catch(err) { 
      playSound('error');
      toast('Error al enviar', 'error'); 
    }
  });

  // 🔥 EVENTOS DEL MODAL DE EDITAR COSTO
  document.getElementById('btnCancelarEditarVenta')?.addEventListener('click', () => {
    document.getElementById('modalEditarVenta')?.classList.remove('show');
  });

  document.getElementById('btnGuardarEditarVenta')?.addEventListener('click', async () => {
    if (!ventaActualEditando) return;
    
    const nuevoCosto = parseFloat(document.getElementById('editCostoVenta').value) || 0;
    
    try {
      await updateDoc(doc(db, 'ventas', ventaActualEditando.id), { costo: nuevoCosto });
      ventaActualEditando.costo = nuevoCosto;
      
      playSound('success');
      toast('Costo actualizado', 'success');
      document.getElementById('modalEditarVenta')?.classList.remove('show');
      renderizarTodo();
    } catch (error) {
      console.error(error);
      playSound('error');
      toast('Error al guardar', 'error');
    }
  });

  const selConcepto = document.getElementById('ventaConcepto');
  const wrapOtro = document.getElementById('wrapConceptoOtro');
  selConcepto?.addEventListener('change', () => {
    if (wrapOtro) wrapOtro.style.display = selConcepto.value === 'Otro' ? 'block' : 'none';
  });

  const tipoStep = document.getElementById('tipoVentaStep');
  const accesorioStep = document.getElementById('ventaAccesorioStep');
  const servicioStep = document.getElementById('ventaServicioStep');

  document.getElementById('btnVentaAccesorio')?.addEventListener('click', () => {
    playSound('click');
    if(tipoStep) tipoStep.style.display = 'none'; 
    if(accesorioStep) accesorioStep.style.display = 'block'; 
    if(servicioStep) servicioStep.style.display = 'none';
    
    const metodoAccesorio = document.getElementById('accesorioMetodoPago');
    if(metodoAccesorio) metodoAccesorio.value = 'Efectivo'; 

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
          playSound('click');
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
    playSound('click');
    if(tipoStep) tipoStep.style.display = 'none'; 
    if(accesorioStep) accesorioStep.style.display = 'none'; 
    if(servicioStep) servicioStep.style.display = 'block';
    
    document.getElementById('ventaConcepto').value = 'Botón';
    if(wrapOtro) wrapOtro.style.display = 'none';
    document.getElementById('ventaMonto').value = '';
  });

  document.getElementById('btnBackToTipo')?.addEventListener('click', () => { 
    playSound('click');
    if(tipoStep) tipoStep.style.display = 'block'; 
    if(accesorioStep) accesorioStep.style.display = 'none'; 
    if(servicioStep) servicioStep.style.display = 'none'; 
  });
  document.getElementById('btnBackToTipo2')?.addEventListener('click', () => { 
    playSound('click');
    if(tipoStep) tipoStep.style.display = 'block'; 
    if(accesorioStep) accesorioStep.style.display = 'none'; 
    if(servicioStep) servicioStep.style.display = 'none'; 
  });

  document.getElementById('btnGuardarVenta')?.addEventListener('click', async () => {
    let concepto = document.getElementById('ventaConcepto').value;
    let monto = parseFloat(document.getElementById('ventaMonto').value);
    let metodo = document.getElementById('ventaMetodo').value;
    if (concepto === 'Otro') {
      const c = document.getElementById('ventaConceptoOtro').value.trim();
      if (!c) { 
        playSound('error');
        toast('Especifica qué se vendió', 'error'); 
        return; 
      }
      concepto = c;
    }
    if (!monto || monto <= 0 || isNaN(monto)) { 
      playSound('error');
      toast('Ingresa un monto válido', 'error'); 
      return; 
    }
    haptic(20);
    try {
      await addDoc(collection(db, 'ventas'), { concepto, monto, costo: 0, metodoPago: metodo, fecha: serverTimestamp(), creadoPor: appState.sesion?.nombre || 'Técnico' });
      await enviarNotificacionDB('Nueva Venta', `Se vendió ${concepto} por Bs. ${monto} (${metodo})`);

      playSound('success');
      toast('Venta registrada', 'success'); 
      if (document.activeElement) document.activeElement.blur(); 
      modalVenta?.classList.remove('show');
    } catch (err) { 
      playSound('error');
      toast('Error al guardar', 'error'); 
    }
  });

  document.getElementById('btnRegistrarAccesorio')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const id = btn.dataset.id, nombre = btn.dataset.nombre;
    const precio = parseFloat(btn.dataset.precio), costo = parseFloat(btn.dataset.costo);
    const stock = parseInt(btn.dataset.stock);
    const cantidad = parseInt(document.getElementById('accesorioCantidad').value);
    const metodo = document.getElementById('accesorioMetodoPago').value;

    if (!id) return;
    if (!cantidad || cantidad < 1 || isNaN(cantidad)) { 
      playSound('error');
      toast('Cantidad inválida', 'error'); 
      return; 
    }
    if (cantidad > stock) { 
      playSound('error');
      toast('No hay suficiente stock', 'error'); 
      return; 
    }

    haptic(20);
    try {
      const total = precio * cantidad;
      await addDoc(collection(db, 'ventas'), { concepto: `${cantidad}x ${nombre}`, monto: total, costo: costo * cantidad, metodoPago: metodo, fecha: serverTimestamp(), creadoPor: appState.sesion?.nombre || 'Técnico' });
      await updateDoc(doc(db, 'productos', id), { stock: stock - cantidad });
      await enviarNotificacionDB('Nueva Venta (Accesorio)', `Se vendió ${cantidad}x ${nombre} por Bs. ${total} (${metodo})`);

      playSound('success');
      toast('Venta de accesorio registrada', 'success'); 
      if (document.activeElement) document.activeElement.blur(); 
      modalVenta?.classList.remove('show');
    } catch (err) { 
      console.error(err); 
      playSound('error');
      toast('Error al guardar', 'error'); 
    }
  });

  document.getElementById('filtros')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filtro]'); if (!btn) return;
    haptic(10); 
    playSound('click');
    document.querySelectorAll('#filtros .chip-interactive').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
    btn.classList.add('active'); btn.setAttribute('aria-selected', 'true');
    filtroActual = btn.dataset.filtro;
    busquedaActual = ''; document.getElementById('buscador').value = ''; paginaActual = 1; renderizarTodo();
  });

  const buscador = document.getElementById('buscador');
  if (buscador) {
    buscador.addEventListener('input', (e) => {
      busquedaActual = e.target.value.toLowerCase().trim(); 
      paginaActual = 1; 
      renderizarTodoDebounced();
    });
    buscador.addEventListener
