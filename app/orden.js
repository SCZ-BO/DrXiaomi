/* ============================================================
   DR. XIAOMI · ORDEN (VERSIÓN PRO FINAL - CORREGIDO v4)
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
   CONFIGURACIÓN Y ESTILOS GLOBALES
   ============================================================ */
const TIMEOUT_MS = 10000;

const styleGlobal = document.createElement('style');
styleGlobal.textContent = `
  .metodo-btn.activo {
    background: rgba(255, 105, 0, 0.12) !important;
    border-color: #FF6900 !important;
    color: #FF6900 !important;
    transform: scale(0.98);
  }
  .modal-backdrop .modal h3 { margin-bottom: 8px; }
  .modal-backdrop .modal label {
    display: block;
    font-size: 12px;
    font-weight: 700;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    margin-bottom: 6px;
  }
  .modal-backdrop .modal input[type="number"],
  .modal-backdrop .modal input[type="text"],
  .modal-backdrop .modal input[type="date"] {
    width: 100%;
    padding: 14px;
    font-size: 16px;
    background: #242424;
    color: #F5F5F5;
    border: 1px solid #2C2C2C;
    border-radius: 8px;
    font-family: inherit;
    outline: none;
    transition: border-color 0.2s;
  }
  .modal-backdrop .modal input:focus { border-color: #FF6900; }
  .modal-backdrop .modal .btn-modal-cancel {
    flex: 1;
    padding: 14px;
    border-radius: 8px;
    border: 1px solid #2C2C2C;
    background: #242424;
    color: #F5F5F5;
    font-weight: 700;
    cursor: pointer;
    font-family: inherit;
    transition: 0.2s;
  }
  .modal-backdrop .modal .btn-modal-cancel:active { transform: scale(0.98); }
  .modal-backdrop .modal .btn-modal-confirm {
    flex: 1;
    padding: 14px;
    border-radius: 8px;
    border: none;
    background: #FF6900;
    color: white;
    font-weight: 700;
    cursor: pointer;
    font-family: inherit;
    transition: 0.2s;
  }
  .modal-backdrop .modal .btn-modal-confirm:active { transform: scale(0.98); }
`;
document.head.appendChild(styleGlobal);

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
   CARGAR ORDEN
   ============================================================ */
async function cargarOrden() {
  showLoading('Cargando orden...');

  try {
    const ref = doc(db, 'recibos', ordenId);
    
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
  if (subtitleEl) subtitleEl.textContent = `${estadoInfo.texto} · ${tiempoRelativo(orden.fechaEditada || orden.fecha)}`;

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
      <div class="recibo-row"><span>Fecha de ingreso</span><span>${formatFecha(orden.fechaEditada || orden.fecha)}</span></div>
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
  document.querySelectorAll('.estado-btn').forEach(btn => {
    btn.addEventListener('click', () => cambiarEstado(btn.dataset.estado));
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
  document.getElementById('btnRegistrarCosto')?.addEventListener('click', abrirModalCosto);
  document.getElementById('btnEditarFecha')?.addEventListener('click', abrirModalFecha);
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

  modal.innerHTML = `
    <div class="modal">
      <h3 style="color:var(--brand); font-weight:800; font-size:18px; margin-bottom:8px;">✅ Confirmar entrega</h3>
      <p style="margin-bottom:20px; font-size:14px;"><strong>${escapeHtml(orden.cliente)}</strong><br><span style="font-size:12px; color:var(--text-mute);">Total: ${formatBs(total)}${saldo > 0 && saldo !== total ? ` · Saldo: ${formatBs(saldo)}` : ''}</span></p>
      
      <div style="margin-bottom:16px;">
        <label>Monto cobrado</label>
        <input type="number" id="inputMonto" step="0.01" min="0" value="${montoSugerido.toFixed(2)}" inputmode="decimal" style="text-align:center; font-size:18px; font-weight:700;">
      </div>
      
      <div style="margin-bottom:20px;">
        <label>Método de pago</label>
        <div id="metodosPago" style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <button type="button" class="metodo-btn" data-metodo="Efectivo" style="display:flex; flex-direction:column; align-items:center; gap:6px; padding:14px 10px; background:var(--bg-elev); border:1.5px solid var(--border); border-radius:10px; color:var(--text-main); font-size:12px; font-weight:600; cursor:pointer; font-family:inherit; transition:all 0.2s ease;">
            <i class="fas fa-money-bill-wave" style="font-size:22px; color:#10B981;"></i><span>Efectivo</span>
          </button>
          <button type="button" class="metodo-btn" data-metodo="QR" style="display:flex; flex-direction:column; align-items:center; gap:6px; padding:14px 10px; background:var(--bg-elev); border:1.5px solid var(--border); border-radius:10px; color:var(--text-main); font-size:12px; font-weight:600; cursor:pointer; font-family:inherit; transition:all 0.2s ease;">
            <i class="fas fa-qrcode" style="font-size:22px; color:#3B82F6;"></i><span>QR</span>
          </button>
          <button type="button" class="metodo-btn" data-metodo="Transferencia" style="display:flex; flex-direction:column; align-items:center; gap:6px; padding:14px 10px; background:var(--bg-elev); border:1.5px solid var(--border); border-radius:10px; color:var(--text-main); font-size:12px; font-weight:600; cursor:pointer; font-family:inherit; transition:all 0.2s ease;">
            <i class="fas fa-building-columns" style="font-size:22px; color:#8B5CF6;"></i><span>Transferencia</span>
          </button>
          <button type="button" class="metodo-btn" data-metodo="Mixto" style="display:flex; flex-direction:column; align-items:center; gap:6px; padding:14px 10px; background:var(--bg-elev); border:1.5px solid var(--border); border-radius:10px; color:var(--text-main); font-size:12px; font-weight:600; cursor:pointer; font-family:inherit; transition:all 0.2s ease;">
            <i class="fas fa-shuffle" style="font-size:22px; color:#F59E0B;"></i><span>Mixto</span>
          </button>
        </div>
        <div id="detalleMixtoContainer" style="display:none; margin-top:10px;">
          <input type="text" id="detalleMixto" placeholder="Ej: 200 efectivo + 150 QR" maxlength="100">
        </div>
        <div id="errorMetodo" style="color:#EF4444; font-size:12px; margin-top:8px; display:none;"></div>
      </div>
      
      <div style="display:flex; gap:8px;">
        <button type="button" id="btnCancelarCobro" class="btn-modal-cancel">Cancelar</button>
        <button type="button" id="btnConfirmarCobro" class="btn-modal-confirm"><i class="fas fa-check"></i> Confirmar</button>
      </div>
    </div>`;

  document.body.appendChild(modal);

  setTimeout(() => {
    modal.classList.add('show');
  }, 10);

  let metodoSeleccionado = null;

  modal.querySelectorAll('.metodo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      haptic(8);
      modal.querySelectorAll('.metodo-btn').forEach(b => b.classList.remove('activo'));
      btn.classList.add('activo');
      metodoSeleccionado = btn.dataset.metodo;
      document.getElementById('detalleMixtoContainer').style.display = metodoSeleccionado === 'Mixto' ? 'block' : 'none';
      document.getElementById('errorMetodo').style.display = 'none';
    });
  });

  document.getElementById('btnCancelarCobro').addEventListener('click', () => { modal.classList.remove('show'); setTimeout(() => modal.remove(), 300); });

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

  modal.addEventListener('click', (e) => { if (e.target === modal) { modal.classList.remove('show'); setTimeout(() => modal.remove(), 300); } });
}

async function confirmarCobro(monto, metodo) {
  document.getElementById('modalCobro')?.remove();
  haptic(20);
  showLoading('Registrando entrega...');
  try {
    const entrada = { tipo: 'estado', texto: `Estado cambiado a: Entregado · Cobrado: ${formatBs(monto)} (${metodo})`, autor: sesion.nombre, fecha: new Date().toISOString() };
    await updateDoc(doc(db, 'recibos', ordenId), { estadoOrden: 'entregado', fechaEntrega: serverTimestamp(), montoCobrado: monto, metodoPago: metodo, bitacora: arrayUnion(entrada), actualizadoEn: serverTimestamp() });
    toast(`Entregado · ${formatBs(monto)} (${metodo})`, 'success', 2500);
  } catch (err
