/* ============================================================
   DR. XIAOMI · ORDEN (VERSIÓN PRO FINAL)
   Archivo: app/orden.js
   ============================================================ */

import { requireAuth } from '/js/app-auth.js';
import {
  toast, haptic, initTheme, escapeHtml,
  formatBs, tiempoRelativo, showLoading, hideLoading
} from '/js/app-ui.js';
import { db } from '/js/firebase.js';
import {
  doc, getDoc, updateDoc, deleteDoc,
  serverTimestamp, arrayUnion, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import '/js/dictado.js';

/* ============================================================
   CONFIGURACIÓN
   ============================================================ */
const TIMEOUT_MS = 10000;

const CONFIG = {
  nombreTienda: 'DR. XIAOMI SCZ',
  direccion: 'Centro Comercial Cañoto #K1, Santa Cruz',
  telefono: '75959450',
  web: 'xiaomi.scz.red',
  urlApp: 'https://xiaomi.scz.red'
};

const ESTADOS = {
  recibido:          { texto: 'Recibido',            icono: 'fa-box',                clase: 'recibido' },
  reparacion:        { texto: 'En reparación',       icono: 'fa-screwdriver-wrench', clase: 'reparacion' },
  'espera-repuesto': { texto: 'Esperando repuesto',  icono: 'fa-clock',              clase: 'espera' },
  listo:             { texto: 'Listo para entregar', icono: 'fa-check-circle',       clase: 'listo' },
  entregado:         { texto: 'Entregado',           icono: 'fa-handshake',          clase: 'entregado' },
  devuelto:          { texto: 'Devuelto',            icono: 'fa-rotate-left',        clase: 'devuelto' }
};

const ESTADO_COLORES = {
  'recibido': '#FFFFFF',
  'reparacion': '#FF6900',
  'espera-repuesto': '#3B82F6',
  'listo': '#FBBF24',
  'entregado': '#10B981',
  'devuelto': '#EF4444'
};

let sesion = null;
let ordenId = null;
let orden = null;
let fotosNuevas = [];
let unsubscribe = null;

/* ============================================================
   INICIALIZACIÓN
   ============================================================ */
initTheme();

requireAuth(async (s) => {
  sesion = s;
  await iniciar();
});

async function iniciar() {
  // 🔥 OCULTAMOS EL LOADER INMEDIATAMENTE
  const loader = document.getElementById('appLoader');
  if (loader) loader.classList.add('hidden');

  const params = new URLSearchParams(window.location.search);
  ordenId = params.get('id');

  if (!ordenId) {
    toast('Orden no encontrada', 'error');
    setTimeout(() => window.location.href = '/app/', 1500);
    return;
  }

  document.getElementById('backBtn')?.addEventListener('click', () => {
    haptic(10);
    window.location.href = '/app/';
  });

  document.getElementById('themeToggle')?.addEventListener('click', () => {
    haptic(10);
    const html = document.documentElement;
    const nuevo = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', nuevo);
    localStorage.setItem('theme', nuevo);
    const icon = document.querySelector('#themeToggle i');
    if (icon) icon.className = nuevo === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
  });

  await cargarOrden();
}

/* ============================================================
   CARGAR ORDEN (CON SNAPSHOT EN TIEMPO REAL)
   ============================================================ */
async function cargarOrden() {
  showLoading('Cargando orden...');

  try {
    const ref = doc(db, 'recibos', ordenId);
    
    // 🔥 USAMOS onSnapshot PARA QUE LA PÁGINA SE ACTUALICE EN TIEMPO REAL
    unsubscribe = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        toast('Esta orden no existe o fue eliminada', 'error', 3000);
        setTimeout(() => window.location.href = '/app/', 2000);
        return;
      }

      orden = { id: snap.id, ...snap.data() };
      renderOrden();
      hideLoading();
      document.getElementById('appLoader')?.classList.add('hidden');
    }, (error) => {
      console.error('Error en snapshot:', error);
      toast('Error al cargar la orden: ' + error.message, 'error', 4000);
      hideLoading();
      setTimeout(() => window.location.href = '/app/', 2500);
    });

  } catch (err) {
    console.error('Error cargando orden:', err);
    toast('Error al cargar la orden: ' + err.message, 'error', 4000);
    hideLoading();
    setTimeout(() => window.location.href = '/app/', 2500);
  }
}

/* ============================================================
   RENDER PRINCIPAL
   ============================================================ */
function renderOrden() {
  const estadoActual = orden.estadoOrden || 'recibido';
  const estadoInfo = ESTADOS[estadoActual] || ESTADOS.recibido;

  const titleEl = document.getElementById('headerTitle');
  const subtitleEl = document.getElementById('headerSubtitle');
  if (titleEl) titleEl.textContent = orden.numeroRecibo || 'ORDEN';
  if (subtitleEl) subtitleEl.textContent = `${estadoInfo.texto} · ${tiempoRelativo(orden.fecha)}`;

  const cont = document.getElementById('contenido');
  if (!cont) return;

  let patronTexto = '';
  if (orden.tipoSeguridad === 'patron' && orden.patron) {
    patronTexto = orden.patron.split(',').join(' → ');
  }

  const serviciosHtml = Array.isArray(orden.servicios) && orden.servicios.length > 0
    ? orden.servicios.map(s => `
        <tr><td>${escapeHtml(s.desc)}</td><td>${formatBs(s.costo)}</td></tr>
      `).join('')
    : '<tr><td colspan="2" style="text-align:center;color:var(--text-mute);padding:12px;">Sin servicios registrados</td></tr>';

  const fotosValidas = Array.isArray(orden.fotos) ? orden.fotos : [];
  const fotosHtml = fotosValidas.length > 0
    ? `<div class="card"><div class="card-title">📸 Fotos del ingreso</div><div class="bitacora-fotos">${fotosValidas.map(f => `<img src="${f}" alt="foto" data-ver-img="${f}">`).join('')}</div></div>`
    : '';

  const colorEstado = ESTADO_COLORES[estadoActual] || '#FF6900';
  const ganancia = (Number(orden.montoCobrado) || 0) - (Number(orden.costoRepuesto) || 0);

  const estadosBotones = Object.entries(ESTADOS).map(([key, info]) => `
    <button class="estado-btn ${key === estadoActual ? 'activo' : ''}" data-estado="${key}">
      <i class="fas ${info.icono}"></i><span>${info.texto}</span>
    </button>
  `).join('');

  cont.innerHTML = `
    <!-- 1. RECIBO -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">📋 Detalle del Recibo</div>
        <span class="chip-estado" style="background:${colorEstado}25; color:${colorEstado}; padding:4px 8px; border-radius:6px; font-size:10px; font-weight:700;">
          <i class="fas ${estadoInfo.icono}"></i> ${estadoInfo.texto}
        </span>
      </div>
      <div class="recibo-row"><span>Cliente</span><span>${escapeHtml(orden.cliente || '-')}</span></div>
      <div class="recibo-row"><span>Teléfono</span><span style="color:var(--brand); font-weight:700;">${escapeHtml(orden.telefono || '-')}</span></div>
      <div class="recibo-row"><span>Equipo</span><span>${escapeHtml(orden.marca || '')} ${escapeHtml(orden.modelo || '')}</span></div>
      ${orden.imei ? `<div class="recibo-row"><span>IMEI</span><span style="font-family:monospace; font-size:12px;">${escapeHtml(orden.imei)}</span></div>` : ''}
      <div class="recibo-row"><span>Enciende</span><span>${escapeHtml(orden.enciende || '-')}</span></div>
      ${orden.estadoEquipo || orden.falla ? `<div class="recibo-row"><span>Estado / Falla</span><span style="text-align:right;">${escapeHtml(orden.estadoEquipo || '')} ${escapeHtml(orden.falla || '')}</span></div>` : ''}
      ${orden.tipoSeguridad === 'pin' && orden.pin ? `<div class="recibo-row"><span>Clave PIN</span><span style="font-family:monospace; font-weight:800; color:var(--brand);">${escapeHtml(orden.pin)}</span></div>` : ''}
      ${patronTexto ? `<div class="recibo-row"><span>Patrón</span><span style="font-family:monospace; font-weight:800; color:var(--brand);">${escapeHtml(patronTexto)}</span></div>` : ''}
      <div class="recibo-row"><span>Fecha de ingreso</span><span>${formatFecha(orden.fecha)}</span></div>
      <div class="recibo-row"><span>Por</span><span>${escapeHtml(orden.creadoPor || '-')}</span></div>

      <div style="margin-top:16px; border-top:1px solid var(--border); padding-top:12px;">
        <table class="tabla-servicios"><thead><tr><th>Servicio</th><th style="text-align:right;">Costo</th></tr></thead><tbody>${serviciosHtml}</tbody></table>
        <div class="total-box"><span style="font-size:12px; color:var(--text-mute);">Total</span><strong>${formatBs(orden.total || 0)}</strong></div>
        ${Number(orden.adelanto) > 0 ? `<div style="display:flex; justify-content:space-between; margin-top:8px; font-size:13px;"><span style="color:var(--text-mute);">Adelanto</span><span>${formatBs(orden.adelanto)}</span></div>` : ''}
        <div class="total-box" style="background:var(--brand-light); margin-top:8px;"><span style="font-size:12px; color:var(--brand); font-weight:700;">SALDO A PAGAR</span><strong style="color:var(--brand); font-size:18px;">${formatBs(orden.saldo || 0)}</strong></div>
      </div>
    </div>

    ${fotosHtml}

    <!-- 2. ACCIONES -->
    <div class="card">
      <div class="card-title">📱 Acciones</div>
      <div style="display:flex; gap:12px; margin-top:8px;">
        <button class="btn-grande btn-whatsapp" id="btnContactar" style="flex:1;"><i class="fab fa-whatsapp"></i> Contactar</button>
        <button class="btn-grande btn-pdf" id="btnRegenerarPDF" style="flex:1;"><i class="fas fa-file-pdf"></i> Enviar PDF</button>
      </div>
    </div>

    <!-- 3. CAMBIAR ESTADO -->
    <div class="card">
      <div class="card-title">🔄 Cambiar estado</div>
      <div class="estados-grid" style="margin-top:12px;">${estadosBotones}</div>
    </div>

    <!-- 4. COSTOS (admin) -->
    ${sesion.rol === 'admin' ? `
      <div class="card" style="border-color:rgba(16,185,129,0.3);">
        <div class="card-title" style="color:#10B981;">💰 Costos y ganancia</div>
        ${Number(orden.montoCobrado) > 0 ? `
          <div class="recibo-row"><span>Cobrado al cliente</span><span style="color:var(--brand); font-weight:700;">${formatBs(orden.montoCobrado || 0)}</span></div>
          <div class="recibo-row"><span>Costo del repuesto</span><span style="color:#FF9500; font-weight:700;">${Number(orden.costoRepuesto) > 0 ? formatBs(orden.costoRepuesto) : 'Sin asignar'}</span></div>
          <div class="recibo-row" style="background:rgba(16,185,129,0.1); padding:8px; border-radius:8px; margin-top:8px;"><span style="color:#10B981; font-weight:700;">Ganancia neta</span><span style="color:#10B981; font-weight:800; font-size:16px;">${formatBs(ganancia)}</span></div>
        ` : `<p style="font-size:12px; color:var(--text-mute); text-align:center; margin-bottom:12px;">Esta orden aún no tiene cobro registrado.</p>`}
        <button id="btnRegistrarCosto" class="btn-grande btn-pdf" style="margin-top:12px; background:var(--bg-elev); color:var(--text-main); border:1px solid var(--border);"><i class="fas fa-calculator"></i> ${Number(orden.costoRepuesto) > 0 ? 'Editar costo' : 'Registrar costo'}</button>
        <button id="btnEditarFecha" class="btn-grande" style="margin-top:8px; background:var(--bg-elev); color:var(--brand); border:1px solid var(--brand);"><i class="fas fa-calendar-alt"></i> Editar fecha</button>
      </div>
    ` : ''}

    <!-- 5. BITÁCORA -->
    <div class="card">
      <div class="card-title">📋 Bitácora</div>
      <div style="margin-bottom:16px;">
        <div class="dictado-wrap textarea">
          <textarea id="nuevaNota" placeholder="Escribe una nota..." maxlength="500" style="width:100%; padding:12px; background:var(--bg-elev); color:var(--text-main); border:1px solid var(--border); border-radius:8px; font-family:inherit; font-size:13px; resize:vertical; min-height:70px;"></textarea>
        </div>
        <div class="foto-uploader" id="fotoUploader"><button type="button" class="btn-add-foto" id="btnAddFoto"><i class="fas fa-camera"></i><span>Añadir</span></button></div>
        <input type="file" id="fotoInput" accept="image/*" capture="environment" hidden>
        <button id="btnGuardarNota" class="btn-grande btn-pdf" style="margin-top:12px; padding:10px; font-size:13px; width:auto;"><i class="fas fa-plus"></i> Añadir</button>
      </div>
      <div id="historialBitacora">${renderBitacora()}</div>
    </div>

    <!-- 6. ADMIN -->
    ${sesion.rol === 'admin' ? `
      <div class="card" style="border-color: rgba(239,68,68,0.3);">
        <div class="card-title" style="color:#EF4444;">⚙️ Admin</div>
        <button id="btnEliminar" class="btn-grande" style="background:rgba(239,68,68,0.1); color:#EF4444; border:1px solid #EF4444; margin-top:8px;"><i class="fas fa-trash"></i> Eliminar orden</button>
      </div>
    ` : ''}

    <!-- 7. VOLVER -->
    <button id="btnVolverPanelFinal" class="btn-grande btn-pdf" style="margin-top:8px; margin-bottom:24px; padding:16px; font-size:15px;"><i class="fas fa-home"></i> VOLVER AL PANEL</button>
  `;

  configurarEventosOrden();
}

/* ============================================================
   BITÁCORA
   ============================================================ */
function renderBitacora() {
  const bitacora = Array.isArray(orden.bitacora) ? orden.bitacora : [];
  const ordenada = [...bitacora].sort((a, b) => {
    const fa = a.fecha ? new Date(a.fecha) : 0;
    const fb = b.fecha ? new Date(b.fecha) : 0;
    return fb - fa;
  });

  if (ordenada.length === 0) return `<div style="text-align:center; padding:20px; color:var(--text-mute); font-size:13px;"><i class="fas fa-clipboard-list" style="font-size:24px; opacity:0.4; margin-bottom:8px; display:block;"></i>No hay entradas en la bitácora aún</div>`;

  return ordenada.map(entry => {
    let clase = 'nota', icono = 'fa-sticky-note';
    if (entry.tipo === 'estado') { clase = 'estado'; icono = 'fa-exchange-alt'; }
    else if (entry.tipo === 'foto') { clase = 'foto'; icono = 'fa-camera'; }
    else if (entry.tipo === 'whatsapp') { clase = 'whatsapp'; icono = 'fa-brands fa-whatsapp'; }
    else if (entry.tipo === 'cobro') { clase = 'estado'; icono = 'fa-money-bill-wave'; }

    return `<div class="bitacora-item">
      <div class="bitacora-icono ${clase}"><i class="fas ${icono}"></i></div>
      <div class="bitacora-content">
        <div class="bitacora-header"><span class="bitacora-autor">${escapeHtml(entry.autor || 'Sistema')}</span><span class="bitacora-fecha">${tiempoRelativo(entry.fecha)}</span></div>
        <div class="bitacora-texto">${escapeHtml(entry.texto || '')}</div>
        ${Array.isArray(entry.fotos) && entry.fotos.length > 0 ? `<div class="bitacora-fotos">${entry.fotos.map(f => `<img src="${f}" alt="foto" data-ver-img="${f}">`).join('')}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

/* ============================================================
   EVENTOS
   ============================================================ */
function configurarEventosOrden() {
  console.log("🔥 Configurando eventos de la orden...");
  
  document.querySelectorAll('.estado-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      console.log("👉 Click en estado:", btn.dataset.estado);
      cambiarEstado(btn.dataset.estado);
    });
  });

  const btnAddFoto = document.getElementById('btnAddFoto');
  const fotoInput = document.getElementById('fotoInput');
  if (btnAddFoto && fotoInput) btnAddFoto.addEventListener('click', () => { haptic(10); fotoInput.click(); });

  if (fotoInput) {
    fotoInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      haptic(10);
      try { const dataUrl = await comprimirImagen(file, 1000, 0.75); fotosNuevas.push(dataUrl); renderFotosNuevas(); } catch (err) { toast('Error procesando imagen', 'error'); }
      fotoInput.value = '';
    });
  }

  document.getElementById('btnGuardarNota')?.addEventListener('click', guardarNota);
  document.getElementById('btnContactar')?.addEventListener('click', contactarCliente);
  document.getElementById('btnEliminar')?.addEventListener('click', eliminarOrden);
  document.getElementById('btnRegistrarCosto')?.addEventListener('click', () => { console.log("👉 Click en registrar costo"); abrirModalCosto(); });
  document.getElementById('btnEditarFecha')?.addEventListener('click', () => { console.log("👉 Click en editar fecha"); abrirModalFecha(); });
  document.getElementById('btnRegenerarPDF')?.addEventListener('click', () => { haptic(15); regenerarYEnviarPDF(); });
  document.getElementById('btnVolverPanelFinal')?.addEventListener('click', () => { haptic(15); window.location.href = '/app/'; });

  document.querySelectorAll('[data-ver-img]').forEach(img => {
    img.addEventListener('click', () => {
      haptic(10);
      const viewer = document.getElementById('imgViewer');
      const viewerImg = document.getElementById('imgViewerImg');
      if (!viewer || !viewerImg) return;
      viewerImg.src = img.dataset.verImg;
      viewer.classList.add('show');
    });
  });

  const viewer = document.getElementById('imgViewer');
  const viewerCerrar = document.getElementById('imgViewerCerrar');
  if (viewer && viewerCerrar && !viewer.dataset.listenersAdded) {
    viewer.dataset.listenersAdded = 'true';
    viewerCerrar.addEventListener('click', () => { viewer.classList.remove('show'); document.getElementById('imgViewerImg').src = ''; });
    viewer.addEventListener('click', (e) => { if (e.target === viewer) { viewer.classList.remove('show'); document.getElementById('imgViewerImg').src = ''; } });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && viewer.classList.contains('show')) { viewer.classList.remove('show'); document.getElementById('imgViewerImg').src = ''; } });
  }
}

/* ============================================================
   CAMBIAR ESTADO
   ============================================================ */
async function cambiarEstado(nuevoEstado) {
  if (!nuevoEstado || !ESTADOS[nuevoEstado]) return;
  const estadoActual = orden.estadoOrden || 'recibido';
  if (nuevoEstado === estadoActual) { toast('Ya está en ese estado', 'info', 1500); return; }
  
  if (nuevoEstado === 'entregado') { 
    console.log("👉 Abriendo modal de cobro...");
    abrirModalCobro(); 
    return; 
  }

  haptic(20); showLoading('Actualizando estado...');
  try {
    const entrada = { tipo: 'estado', texto: `Estado cambiado a: ${ESTADOS[nuevoEstado].texto}`, autor: sesion.nombre, fecha: new Date().toISOString() };
    await updateDoc(doc(db, 'recibos', ordenId), { estadoOrden: nuevoEstado, bitacora: arrayUnion(entrada), actualizadoEn: serverTimestamp() });
    toast(`Estado: ${ESTADOS[nuevoEstado].texto}`, 'success', 2000);
  } catch (err) { toast('Error al cambiar estado', 'error'); }
  finally { hideLoading(); }
}

/* ============================================================
   MODAL DE COBRO
   ============================================================ */
function abrirModalCobro() {
  haptic(15);
  const total = Number(orden.total) || 0;
  const saldo = Number(orden.saldo) || 0;
  const montoSugerido = saldo > 0 ? saldo : total;

  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.id = 'modalCobro';
  modal.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.85); backdrop-filter:blur(4px); z-index:9999999; display:flex; align-items:center; justify-content:center; opacity:0; transition:opacity 0.3s ease;';

  modal.innerHTML = `
    <div class="modal" style="background:var(--bg-card); border-radius:16px; padding:24px; width:90%; max-width:420px; box-shadow:0 10px 30px rgba(0,0,0,0.5); border:1px solid var(--border); transform:translateY(20px); transition:transform 0.3s ease; z-index:10000000;">
      <h3 style="color:var(--brand); font-weight:800; font-size:18px; margin-bottom:8px;">✅ Confirmar entrega</h3>
      <p style="margin-bottom:20px; font-size:14px;"><strong>${escapeHtml(orden.cliente)}</strong><br><span style="font-size:12px; color:var(--text-mute);">Total: ${formatBs(total)}${saldo > 0 && saldo !== total ? ` · Saldo: ${formatBs(saldo)}` : ''}</span></p>
      <div style="margin-bottom:16px;"><label style="display:block; font-size:12px; font-weight:700; color:var(--text-mute); text-transform:uppercase; letter-spacing:0.6px; margin-bottom:6px;">Monto cobrado</label><input type="number" id="inputMonto" step="0.01" min="0" value="${montoSugerido.toFixed(2)}" inputmode="decimal" style="width:100%; padding:14px; font-size:18px; font-weight:700; text-align:center; background:var(--bg-elev); color:var(--text-main); border:1px solid var(--border); border-radius:8px; font-family:inherit;"></div>
      <div style="margin-bottom:20px;"><label style="display:block; font-size:12px; font-weight:700; color:var(--text-mute); text-transform:uppercase; letter-spacing:0.6px; margin-bottom:8px;">Método de pago</label>
        <div id="metodosPago" style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
          <button type="button" class="metodo-btn" data-metodo="Efectivo" style="display:flex; flex-direction:column; align-items:center; gap:4px; padding:12px 8px; background:var(--bg-elev); border:1px solid var(--border); border-radius:8px; color:var(--text-main); font-size:12px; font-weight:600; cursor:pointer; font-family:inherit;"><i class="fas fa-money-bill-wave" style="font-size:20px;"></i><span>Efectivo</span></button>
          <button type="button" class="metodo-btn" data-metodo="QR" style="display:flex; flex-direction:column; align-items:center; gap:4px; padding:12px 8px; background:var(--bg-elev); border:1px solid var(--border); border-radius:8px; color:var(--text-main); font-size:12px; font-weight:600; cursor:pointer; font-family:inherit;"><i class="fas fa-qrcode" style="font-size:20px;"></i><span>QR</span></button>
          <button type="button" class="metodo-btn" data-metodo="Transferencia" style="display:flex; flex-direction:column; align-items:center; gap:4px; padding:12px 8px; background:var(--bg-elev); border:1px solid var(--border); border-radius:8px; color:var(--text-main); font-size:12px; font-weight:600; cursor:pointer; font-family:inherit;"><i class="fas fa-building-columns" style="font-size:20px;"></i><span>Transferencia</span></button>
          <button type="button" class="metodo-btn" data-metodo="Mixto" style="display:flex; flex-direction:column; align-items:center; gap:4px; padding:12px 8px; background:var(--bg-elev); border:1px solid var(--border); border-radius:8px; color:var(--text-main); font-size:12px; font-weight:600; cursor:pointer; font-family:inherit;"><i class="fas fa-shuffle" style="font-size:20px;"></i><span>Mixto</span></button>
        </div>
        <div id="detalleMixtoContainer" style="display:none; margin-top:10px;"><input type="text" id="detalleMixto" placeholder="Ej: 200 efectivo + 150 QR" maxlength="100" style="width:100%; padding:12px; background:var(--bg-elev); color:var(--text-main); border:1px solid var(--border); border-radius:8px; font-family:inherit; font-size:13px;"></div>
        <div id="errorMetodo" style="color:#EF4444; font-size:12px; margin-top:8px; display:none;"></div>
      </div>
      <div style="display:flex; gap:8px;"><button type="button" id="btnCancelarCobro" style="flex:1; padding:14px; border-radius:8px; border:1px solid var(--border); background:var(--bg-elev); color:var(--text-main); font-weight:700; cursor:pointer; font-family:inherit;">Cancelar</button><button type="button" id="btnConfirmarCobro" style="flex:1; padding:14px; border-radius:8px; border:none; background:var(--brand); color:white; font-weight:700; cursor:pointer; font-family:inherit;"><i class="fas fa-check"></i> Confirmar</button></div>
    </div>`;

  document.body.appendChild(modal);
  setTimeout(() => { modal.style.opacity = '1'; modal.querySelector('.modal').style.transform = 'translateY(0)'; }, 50);

  let metodoSeleccionado = null;

  modal.querySelectorAll('.metodo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      haptic(8);
      modal.querySelectorAll('.metodo-btn').forEach(b => { b.classList.remove('activo'); b.style.background = 'var(--bg-elev)'; b.style.borderColor = 'var(--border)'; b.style.color = 'var(--text-main)'; });
      btn.classList.add('activo'); btn.style.background = 'var(--brand-light)'; btn.style.borderColor = 'var(--brand)'; btn.style.color = 'var(--brand)';
      metodoSeleccionado = btn.dataset.metodo;
      document.getElementById('detalleMixtoContainer').style.display = metodoSeleccionado === 'Mixto' ? 'block' : 'none';
      document.getElementById('errorMetodo').style.display = 'none';
    });
  });

  document.getElementById('btnCancelarCobro').addEventListener('click', () => { modal.style.opacity = '0'; setTimeout(() => modal.remove(), 300); });

  document.getElementById('btnConfirmarCobro').addEventListener('click', async () => {
    const monto = parseFloat(document.getElementById('inputMonto').value) || 0;
    if (!metodoSeleccionado) { document.getElementById('errorMetodo').textContent = 'Selecciona un método de pago'; document.getElementById('errorMetodo').style.display = 'block'; return; }
    if (monto <= 0) { document.getElementById('errorMetodo').textContent = 'Ingresa un monto válido'; document.getElementById('errorMetodo').style.display = 'block'; return; }
    let metodoFinal = metodoSeleccionado;
    if (metodoSeleccionado === 'Mixto') {
      const detalle = document.getElementById('detalleMixto').value.trim();
      if (!detalle) { document.getElementById('errorMetodo').textContent = 'Especifica el detalle'; document.getElementById('errorMetodo').style.display = 'block'; return; }
      metodoFinal = `Mixto (${detalle})`;
    }
    await confirmarCobro(monto, metodoFinal);
  });

  modal.addEventListener('click', (e) => { if (e.target === modal) { modal.style.opacity = '0'; setTimeout(() => modal.remove(), 300); } });
}

async function confirmarCobro(monto, metodo) {
  document.getElementById('modalCobro')?.remove();
  haptic(20);
  showLoading('Registrando entrega...');
  try {
    const entrada = { tipo: 'estado', texto: `Estado cambiado a: Entregado · Cobrado: ${formatBs(monto)} (${metodo})`, autor: sesion.nombre, fecha: new Date().toISOString() };
    await updateDoc(doc(db, 'recibos', ordenId), { estadoOrden: 'entregado', fechaEntrega: serverTimestamp(), montoCobrado: monto, metodoPago: metodo, bitacora: arrayUnion(entrada), actualizadoEn: serverTimestamp() });
    toast(`Entregado · ${formatBs(monto)} (${metodo})`, 'success', 2500);
  } catch (err) { toast('Error al registrar entrega', 'error'); }
  finally { hideLoading(); }
}

/* ============================================================
   MODAL DE COSTO
   ============================================================ */
function abrirModalCosto() {
  if (sesion.rol !== 'admin') return;
  haptic(15);
  const monto = Number(orden.montoCobrado) || 0;
  const costoActual = Number(orden.costoRepuesto) || 0;
  const gananciaInicial = monto - costoActual;

  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.id = 'modalCosto';
  modal.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.85); backdrop-filter:blur(4px); z-index:9999999; display:flex; align-items:center; justify-content:center; opacity:0; transition:opacity 0.3s ease;';

  modal.innerHTML = `
    <div class="modal" style="background:var(--bg-card); border-radius:16px; padding:24px; width:90%; max-width:420px; box-shadow:0 10px 30px rgba(0,0,0,0.5); border:1px solid var(--border); transform:translateY(20px); transition:transform 0.3s ease; z-index:10000000;">
      <h3 style="color:#10B981; font-weight:800; font-size:18px; margin-bottom:16px;"><i class="fas fa-calculator"></i> Registrar presupuesto</h3>
      <div style="background:var(--bg-elev); border-radius:8px; padding:12px; margin-bottom:1rem; border:1px solid var(--border);"><div style="font-size:11px; color:var(--text-mute); margin-bottom:4px;">RECIBO</div><div style="font-weight:700; font-size:13px;">${escapeHtml(orden.numeroRecibo || '-')}</div><div style="font-size:12px; color:var(--text-main); margin-top:4px;">${escapeHtml(orden.cliente || '-')}</div><div style="font-size:11px; color:var(--text-mute); margin-top:2px;">${escapeHtml(orden.marca || '')} ${escapeHtml(orden.modelo || '')}</div></div>
      <div style="margin-bottom:1rem;"><label style="display:block; font-size:11px; font-weight:700; color:var(--text-mute); text-transform:uppercase; letter-spacing:0.6px; margin-bottom:6px;">Monto cobrado al cliente</label><div style="background:var(--bg-elev); border:1px solid var(--border); border-radius:8px; padding:14px; font-size:18px; font-weight:800; text-align:center; color:var(--brand);">${formatBs(monto)}</div></div>
      <div style="margin-bottom:1rem;"><label style="display:block; font-size:11px; font-weight:700; color:var(--text-mute); text-transform:uppercase; letter-spacing:0.6px; margin-bottom:6px;">Costo del repuesto</label><input type="number" id="costoInput" step="0.01" min="0" value="${costoActual > 0 ? costoActual.toFixed(2) : ''}" inputmode="decimal" placeholder="0.00" style="width:100%; padding:14px; font-size:20px; font-weight:800; text-align:center; background:var(--bg-elev); color:#F59E0B; border:1px solid var(--border); border-radius:8px; font-family:inherit;"><div style="display:flex; gap:6px; margin-top:8px;"><button type="button" class="costo-preset" data-pct="0.7" style="flex:1; padding:8px; background:var(--bg-elev); border:1px solid var(--border); border-radius:8px; color:var(--text-main); font-size:11px; font-weight:700; cursor:pointer; font-family:inherit;">70%</button><button type="button" class="costo-preset" data-pct="0.5" style="flex:1; padding:8px; background:var(--bg-elev); border:1px solid var(--border); border-radius:8px; color:var(--text-main); font-size:11px; font-weight:700; cursor:pointer; font-family:inherit;">50%</button><button type="button" class="costo-preset" data-pct="0.4" style="flex:1; padding:8px; background:var(--bg-elev); border:1px solid var(--border); border-radius:8px; color:var(--text-main); font-size:11px; font-weight:700; cursor:pointer; font-family:inherit;">40%</button></div></div>
      <div style="background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.3); border-radius:8px; padding:16px; margin-bottom:1.2rem; text-align:center;"><div style="font-size:11px; color:var(--text-mute); text-transform:uppercase; font-weight:700; letter-spacing:0.6px; margin-bottom:4px;">Ganancia neta</div><div id="gananciaPreview" style="font-size:26px; font-weight:900; color:#10B981; line-height:1;">${formatBs(gananciaInicial)}</div></div>
      <div style="display:flex; gap:8px;"><button type="button" id="btnCancelarCosto" style="flex:1; padding:14px; border-radius:8px; border:1px solid var(--border); background:var(--bg-elev); color:var(--text-main); font-weight:700; cursor:pointer; font-family:inherit;">Cancelar</button><button type="button" id="btnGuardarCosto" style="flex:1; padding:14px; border-radius:8px; border:none; background:var(--brand); color:white; font-weight:700; cursor:pointer; font-family:inherit;"><i class="fas fa-check"></i> Guardar</button></div>
    </div>`;

  document.body.appendChild(modal);
  setTimeout(() => { modal.style.opacity = '1'; modal.querySelector('.modal').style.transform = 'translateY(0)'; }, 50);

  const costoInput = modal.querySelector('#costoInput');
  const gananciaPreview = modal.querySelector('#gananciaPreview');

  function actualizarPreview() {
    const costo = parseFloat(costoInput.value) || 0;
    const ganancia = monto - costo;
    gananciaPreview.textContent = formatBs(ganancia);
    gananciaPreview.style.color = ganancia >= 0 ? '#10B981' : '#EF4444';
  }

  costoInput.addEventListener('input', actualizarPreview);
  costoInput.focus();

  modal.querySelectorAll('.costo-preset').forEach(btn => {
    btn.addEventListener('click', () => { const pct = parseFloat(btn.dataset.pct); costoInput.value = (monto * pct).toFixed(2); actualizarPreview(); haptic(8); });
  });

  document.getElementById('btnCancelarCosto').addEventListener('click', () => { modal.style.opacity = '0'; setTimeout(() => modal.remove(), 300); });

  document.getElementById('btnGuardarCosto').addEventListener('click', async () => {
    const costo = parseFloat(costoInput.value) || 0;
    haptic(20); showLoading('Guardando costo...');
    try {
      const ganancia = monto - costo;
      const entrada = { tipo: 'cobro', texto: `Costo registrado: ${formatBs(costo)} · Ganancia: ${formatBs(ganancia)}`, autor: sesion.nombre, fecha: new Date().toISOString() };
      await updateDoc(doc(db, 'recibos', ordenId), { costoRepuesto: costo, gananciaNeta: ganancia, costoActualizadoEn: serverTimestamp(), costoActualizadoPor: sesion.nombre, bitacora: arrayUnion(entrada) });
      toast(`Costo guardado · Ganancia: ${formatBs(ganancia)}`, 'success', 2500);
      modal.style.opacity = '0'; setTimeout(() => modal.remove(), 300);
    } catch (err) { toast('Error al guardar el costo', 'error'); }
    finally { hideLoading(); }
  });

  modal.addEventListener('click', (e) => { if (e.target === modal) { modal.style.opacity = '0'; setTimeout(() => modal.remove(), 300); } });
}

/* ============================================================
   MODAL DE FECHA
   ============================================================ */
function abrirModalFecha() {
  if (sesion.rol !== 'admin') return;
  haptic(15);
  let fechaActualStr = '';
  if (orden.fecha) {
    const d = orden.fecha.toDate ? orden.fecha.toDate() : new Date(orden.fecha);
    if (!isNaN(d.getTime())) fechaActualStr = d.toISOString().split('T')[0];
  }

  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.id = 'modalFecha';
  modal.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.85); backdrop-filter:blur(4px); z-index:9999999; display:flex; align-items:center; justify-content:center; opacity:0; transition:opacity 0.3s ease;';

  modal.innerHTML = `
    <div class="modal" style="background:var(--bg-card); border-radius:16px; padding:24px; width:90%; max-width:400px; box-shadow:0 10px 30px rgba(0,0,0,0.5); border:1px solid var(--border); transform:translateY(20px); transition:transform 0.3s ease; z-index:10000000;">
      <h3 style="color:var(--brand); font-weight:800; font-size:18px; margin-bottom:8px;"><i class="fas fa-calendar-alt"></i> Editar Fecha</h3>
      <p style="font-size:12px; color:var(--text-mute); margin-bottom:16px;">Esta acción cambiará la fecha en el panel y en los reportes.</p>
      <div style="margin-bottom:20px;"><label style="display:block; font-size:12px; font-weight:700; color:var(--text-mute); text-transform:uppercase; letter-spacing:0.6px; margin-bottom:6px;">Nueva Fecha</label><input type="date" id="inputFechaOrden" value="${fechaActualStr}" style="width:100%; padding:14px; font-size:16px; background:var(--bg-elev); color:var(--text-main); border:1px solid var(--border); border-radius:8px; font-family:inherit;"></div>
      <div style="display:flex; gap:8px;"><button type="button" id="btnCancelarFecha" style="flex:1; padding:14px; border-radius:8px; border:1px solid var(--border); background:var(--bg-elev); color:var(--text-main); font-weight:700; cursor:pointer; font-family:inherit;">Cancelar</button><button type="button" id="btnGuardarFecha" style="flex:1; padding:14px; border-radius:8px; border:none; background:var(--brand); color:white; font-weight:700; cursor:pointer; font-family:inherit;"><i class="fas fa-save"></i> Guardar</button></div>
    </div>`;

  document.body.appendChild(modal);
  setTimeout(() => { modal.style.opacity = '1'; modal.querySelector('.modal').style.transform = 'translateY(0)'; }, 50);

  document.getElementById('btnCancelarFecha').addEventListener('click', () => { modal.style.opacity = '0'; setTimeout(() => modal.remove(), 300); });

  document.getElementById('btnGuardarFecha').addEventListener('click', async () => {
    const nuevaFechaStr = document.getElementById('inputFechaOrden').value;
    if (!nuevaFechaStr) { toast('Selecciona una fecha válida', 'error'); return; }
    haptic(20); showLoading('Actualizando fecha...');
    try {
      const nuevaFecha = new Date(nuevaFechaStr + 'T12:00:00');
      const entrada = { tipo: 'nota', texto: `Fecha de ingreso editada a: ${nuevaFecha.toLocaleDateString('es-BO')}`, autor: sesion.nombre, fecha: new Date().toISOString() };
      await updateDoc(doc(db, 'recibos', ordenId), { fecha: nuevaFecha, bitacora: arrayUnion(entrada), actualizadoEn: serverTimestamp() });
      toast('Fecha actualizada correctamente', 'success', 2500);
      modal.style.opacity = '0'; setTimeout(() => modal.remove(), 300);
    } catch (err) { toast('Error al actualizar la fecha', 'error'); }
    finally { hideLoading(); }
  });

  modal.addEventListener('click', (e) => { if (e.target === modal) { modal.style.opacity = '0'; setTimeout(() => modal.remove(), 300); } });
}

/* ============================================================
   WHATSAPP
   ============================================================ */
function contactarCliente() {
  if (!orden.telefono) { toast('La orden no tiene teléfono', 'error'); return; }
  haptic(15);
  const nombreCliente = (orden.cliente || '').split(' ')[0] || 'cliente';
  const equipo = `${orden.marca || ''} ${orden.modelo || ''}`.trim();
  const mensaje = `Hola ${nombreCliente}, le escribimos de ${CONFIG.nombreTienda} en relación a su ${equipo} (Recibo ${orden.numeroRecibo || '-'}).`;
  const tel = orden.telefono.replace(/\D/g, '');
  window.open(`https://wa.me/591${tel}?text=${encodeURIComponent(mensaje)}`, '_blank', 'noopener,noreferrer');
}

/* ============================================================
   REGENERAR PDF
   ============================================================ */
async function regenerarYEnviarPDF() {
  if (!orden.telefono) { toast('La orden no tiene teléfono', 'error'); return; }
  showLoading('Generando PDF...');
  haptic(20);

  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, H = 297, M = 15, CW = W - M * 2;
    let y = 0;

    pdf.setFillColor(230, 81, 0); pdf.rect(0, 0, W, 40, 'F');
    pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(22); pdf.text('DR. XIAOMI SCZ', M + 10, 16);
    pdf.setFontSize(9); pdf.setFont('helvetica', 'normal'); pdf.text('Servicio Técnico Especializado', M + 10, 22);
    pdf.setFontSize(8); pdf.text(`Centro Comercial Cañoto #K1 · Tel: 75959450`, M + 10, 28);

    pdf.setFillColor(255, 255, 255); pdf.roundedRect(W - M - 60, 8, 60, 24, 3, 3, 'F');
    pdf.setTextColor(230, 81, 0); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.text('RECIBO N°', W - M - 4, 14, { align: 'right' });
    pdf.setFontSize(11); pdf.text(orden.numeroRecibo || '-', W - M - 4, 20, { align: 'right' });
    pdf.setTextColor(100, 100, 100); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.text(`Fecha: ${new Date().toLocaleDateString('es-BO')}`, W - M - 4, 26, { align: 'right' });

    y = 50;
    const colW = (CW - 6) / 2;
    pdf.setFillColor(248, 248, 248); pdf.roundedRect(M, y, colW, 30, 3, 3, 'F');
    pdf.setTextColor(230, 81, 0); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.text('CLIENTE', M + 5, y + 7);
    pdf.setTextColor(30, 30, 30); pdf.setFontSize(12); pdf.text((orden.cliente || '').slice(0, 25), M + 5, y + 15);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(100, 100, 100); pdf.text(`Tel: ${orden.telefono || ''}`, M + 5, y + 23);

    pdf.setFillColor(248, 248, 248); pdf.roundedRect(M + colW + 6, y, colW, 30, 3, 3, 'F');
    pdf.setTextColor(230, 81, 0); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.text('EQUIPO', M + colW + 11, y + 7);
    pdf.setTextColor(30, 30, 30); pdf.setFontSize(12); pdf.text(`${orden.marca || ''} ${orden.modelo || ''}`.slice(0, 25), M + colW + 11, y + 15);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(100, 100, 100); pdf.text(`Enciende: ${orden.enciende || ''}`, M + colW + 11, y + 23);

    y += 36;
    pdf.setFillColor(248, 248, 248); pdf.roundedRect(M, y, colW, 30, 3, 3, 'F');
    pdf.setTextColor(230, 81, 0); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.text('ESTADO / FALLA', M + 5, y + 7);
    pdf.setTextColor(100, 100, 100); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.text(pdf.splitTextToSize(orden.falla || '-', colW - 10), M + 5, y + 14);

    pdf.setFillColor(248, 248, 248); pdf.roundedRect(M + colW + 6, y, colW, 30, 3, 3, 'F');
    pdf.setTextColor(230, 81, 0); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.text('CLAVE DE ACCESO', M + colW + 11, y + 7);
    pdf.setTextColor(30, 30, 30); pdf.setFontSize(12); let segInfo = orden.tipoSeguridad === 'pin' ? `PIN: ${orden.pin}` : (orden.patron ? `Patrón: ${orden.patron.split(',').join('-')}` : 'Sin clave'); pdf.text(segInfo.slice(0, 25), M + colW + 11, y + 17);

    y += 36;
    pdf.setFillColor(230, 81, 0); pdf.roundedRect(M, y, CW, 10, 3, 3, 'F');
    pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.text('SERVICIOS Y COSTOS', M + 5, y + 6.5); y += 14;

    pdf.autoTable({ startY: y, head: [['Descripción', 'Costo']], body: (orden.servicios || []).map(s => [s.desc, formatBs(s.costo)]), styles: { fontSize: 10, cellPadding: 4 }, headStyles: { fillColor: [230, 81, 0] }, columnStyles: { 1: { halign: 'right' } }, margin: { left: M, right: M } });

    y = pdf.lastAutoTable.finalY + 8;
    const boxW = 80; const boxX = M + CW - boxW;
    pdf.setFillColor(248, 248, 248); pdf.roundedRect(boxX, y, boxW, 20, 3, 3, 'F');
    pdf.setTextColor(100, 100, 100); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.text('Total:', boxX + 5, y + 8);
    pdf.setTextColor(30, 30, 30); pdf.setFont('helvetica', 'bold'); pdf.text(formatBs(orden.total || 0), boxX + boxW - 5, y + 8, { align: 'right' });
    pdf.setTextColor(230, 81, 0); pdf.setFontSize(10); pdf.text('SALDO:', boxX + 5, y + 16);
    pdf.setFontSize(14); pdf.text(formatBs(orden.saldo || 0), boxX + boxW - 5, y + 16, { align: 'right' });

    const nombreArchivo = `Recibo_${orden.numeroRecibo || 'orden'}.pdf`;
    pdf.save(nombreArchivo);

    setTimeout(() => {
      const nombreCliente = (orden.cliente || '').split(' ')[0] || 'cliente';
      const equipo = `${orden.marca || ''} ${orden.modelo || ''}`.trim();
      const mensaje = `Hola ${nombreCliente}, le adjuntamos el recibo de ingreso de su equipo.\n\nN° Recibo: ${orden.numeroRecibo || '-'}\nEquipo: ${equipo}\nTotal: ${formatBs(orden.total || 0)}\n${Number(orden.saldo) > 0 ? `Saldo pendiente: ${formatBs(orden.saldo)}` : ''}\n\nLe adjuntamos el PDF del recibo.`;
      const tel = (orden.telefono || '').replace(/\D/g, '');
      window.open(`https://wa.me/591${tel}?text=${encodeURIComponent(mensaje)}`, '_blank');
      toast('PDF descargado · Adjúntalo en WhatsApp', 'success', 4000);
    }, 600);

  } catch (err) {
    console.error('Error regenerando PDF:', err);
    toast('Error al generar el PDF: ' + err.message, 'error', 4000);
  } finally {
    hideLoading();
  }
}

/* ============================================================
   GUARDAR NOTA
   ============================================================ */
async function guardarNota() {
  const notaInput = document.getElementById('nuevaNota');
  const texto = (notaInput.value || '').trim();
  if (!texto && fotosNuevas.length === 0) { toast('Escribe una nota o añade una foto', 'error'); return; }

  haptic(15); showLoading('Guardando...');
  try {
    const entrada = { tipo: fotosNuevas.length > 0 && !texto ? 'foto' : 'nota', texto: texto || 'Foto añadida', fotos: fotosNuevas.slice(), autor: sesion.nombre, fecha: new Date().toISOString() };
    await updateDoc(doc(db, 'recibos', ordenId), { bitacora: arrayUnion(entrada), actualizadoEn: serverTimestamp() });
    fotosNuevas = [];
    toast('Añadido a la bitácora', 'success', 2000);
  } catch (err) { toast('Error al guardar', 'error'); }
  finally { hideLoading(); }
}

/* ============================================================
   FOTOS
   ============================================================ */
function renderFotosNuevas() {
  const cont = document.getElementById('fotoUploader');
  if (!cont) return;
  const btnAdd = cont.querySelector('#btnAddFoto');
  cont.querySelectorAll('.foto-preview').forEach(el => el.remove());

  fotosNuevas.forEach((dataUrl, i) => {
    const div = document.createElement('div');
    div.className = 'foto-preview';
    div.innerHTML = `<img src="${dataUrl}" alt="preview"><button type="button" class="btn-remove" data-idx="${i}"><i class="fas fa-times"></i></button>`;
    cont.insertBefore(div, btnAdd);
  });

  cont.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', () => { const idx = parseInt(btn.dataset.idx); fotosNuevas.splice(idx, 1); renderFotosNuevas(); haptic(10); });
  });
}

/* ============================================================
   ELIMINAR
   ============================================================ */
async function eliminarOrden() {
  if (sesion.rol !== 'admin') return;
  const confirmar = confirm('¿Eliminar esta orden?\n\nEsta acción NO se puede deshacer.');
  if (!confirmar) return;

  haptic([50, 30, 50]); showLoading('Eliminando...');
  try {
    await deleteDoc(doc(db, 'recibos', ordenId));
    toast('Orden eliminada', 'success', 2000);
    setTimeout(() => window.location.href = '/app/', 1000);
  } catch (err) { toast('Error al eliminar', 'error'); hideLoading(); }
}

/* ============================================================
   UTILIDADES
   ============================================================ */
function formatFecha(fecha) {
  if (!fecha) return '-';
  let d;
  if (fecha.toDate) d = fecha.toDate();
  else if (fecha instanceof Date) d = fecha;
  else d = new Date(fecha);
  if (isNaN(d.getTime())) return '-';
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

async function comprimirImagen(file, maxSize = 1000, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxSize) { height = (height * maxSize) / width; width = maxSize; }
        else if (height > maxSize) { width = (width * maxSize) / height; height = maxSize; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject; img.src = e.target.result;
    };
    reader.onerror = reject; reader.readAsDataURL(file);
  });
}
