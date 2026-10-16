/* ============================================================
   DR. XIAOMI · ORDEN (Detalle + Bitácora + WhatsApp + Cobro + Costos)
   Archivo: app/orden.js
   Versión final completa
   ============================================================ */

import { requireAuth, logout, getSesion } from '/js/app-auth.js';
import {
  toast, haptic, initTheme, escapeHtml,
  formatBs, tiempoRelativo, showLoading, hideLoading
} from '/js/app-ui.js';
import { db } from '/js/firebase.js';
import {
  doc, getDoc, updateDoc, deleteDoc,
  serverTimestamp, arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import '/js/dictado.js';

/* ============================================================
   CONFIGURACIÓN
   ============================================================ */
const DEBUG = true;
const TIMEOUT_MS = 10000;

const CONFIG = {
  nombreTienda: 'DR. XIAOMI SCZ',
  direccion: 'Centro Comercial Cañoto #K1, Santa Cruz',
  telefono: '75959450',
  horario: 'Lunes a Sábado 9:00 - 20:00',
  web: 'xiaomi.scz.red'
};

const ESTADOS = {
  recibido:          { texto: 'En proceso',          icono: 'fa-box',                clase: 'recibido' },
  reparacion:        { texto: 'En reparación',       icono: 'fa-screwdriver-wrench', clase: 'reparacion' },
  'espera-repuesto': { texto: 'Esperando repuesto',  icono: 'fa-clock',              clase: 'espera' },
  listo:             { texto: 'Listo para entregar', icono: 'fa-check-circle',       clase: 'listo' },
  entregado:         { texto: 'Entregado',           icono: 'fa-handshake',          clase: 'entregado' },
  devuelto:          { texto: 'Devuelto',            icono: 'fa-rotate-left',        clase: 'devuelto' }
};

const ESTADO_COLORES = {
  'recibido': '#F59E0B',
  'reparacion': '#3B82F6',
  'espera-repuesto': '#FF6900',
  'listo': '#10B981',
  'entregado': '#8B5CF6',
  'devuelto': '#EF4444'
};

/* ============================================================
   ESTADO
   ============================================================ */
let sesion = null;
let ordenId = null;
let orden = null;
let fotosNuevas = [];

/* ============================================================
   INICIALIZACIÓN
   ============================================================ */
initTheme();

requireAuth(async (s) => {
  sesion = s;
  await iniciar();
});

async function iniciar() {
  const params = new URLSearchParams(window.location.search);
  ordenId = params.get('id');

  if (DEBUG) console.log('🆔 Orden ID:', ordenId);

  if (!ordenId) {
    toast('Orden no encontrada', 'error');
    setTimeout(() => window.location.href = '/app/', 1500);
    return;
  }

  document.getElementById('backBtn')?.addEventListener('click', () => {
    haptic(10);
    window.location.href = '/app/';
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

    const snap = await Promise.race([
      getDoc(ref),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS)
      )
    ]);

    if (!snap.exists()) {
      if (DEBUG) console.warn('⚠️ La orden no existe:', ordenId);
      toast('Esta orden no existe o fue eliminada', 'error', 3000);
      setTimeout(() => window.location.href = '/app/', 2000);
      return;
    }

    orden = { id: snap.id, ...snap.data() };

    if (DEBUG) console.log('✅ Orden cargada:', orden);

    renderOrden();

  } catch (err) {
    console.error('❌ Error cargando orden:', err);

    let mensaje = 'Error al cargar la orden';
    if (err.message?.includes('TIMEOUT')) {
      mensaje = 'Firestore no responde. Verifica tu conexión.';
    } else if (err.code === 'permission-denied') {
      mensaje = 'Sin permisos para ver esta orden.';
    } else if (err.code === 'unavailable') {
      mensaje = 'Sin conexión. Revisa tu internet.';
    }

    toast(mensaje, 'error', 4000);
    setTimeout(() => window.location.href = '/app/', 2500);

  } finally {
    hideLoading();
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
  if (subtitleEl) {
    subtitleEl.textContent = `${estadoInfo.texto} · ${tiempoRelativo(orden.fecha)}`;
  }

  const cont = document.getElementById('contenido');
  if (!cont) return;

  let patronTexto = '';
  if (orden.tipoSeguridad === 'patron' && orden.patron) {
    patronTexto = orden.patron.split(',').join(' → ');
  }

  const serviciosHtml = Array.isArray(orden.servicios) && orden.servicios.length > 0
    ? orden.servicios.map(s => `
        <tr>
          <td>${escapeHtml(s.desc)}</td>
          <td class="costo">${formatBs(s.costo)}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="2" style="text-align:center;color:var(--text-3);padding:12px;">Sin servicios registrados</td></tr>';

  const fotosValidas = Array.isArray(orden.fotos) ? orden.fotos : [];
  const fotosHtml = fotosValidas.length > 0
    ? `<div class="preview-section">
         <div class="preview-section-title">📸 Fotos del ingreso</div>
         <div class="bitacora-fotos">
           ${fotosValidas.map(f => `<img src="${f}" alt="foto" data-ver-img="${f}">`).join('')}
         </div>
       </div>`
    : '';

  const colorEstado = ESTADO_COLORES[estadoActual] || '#FF6900';
  const ganancia = (Number(orden.montoCobrado) || 0) - (Number(orden.costoRepuesto) || 0);

  cont.innerHTML = `
    <!-- RECIBO BONITO -->
    <div class="preview-recibo">
      <div class="preview-header">
        <img src="/imagenes/web-app-manifest-192x192.png" alt="DR. Xiaomi"
             onerror="this.style.display='none';">
        <div class="preview-header-text">
          <h3>DR. XIAOMI SCZ</h3>
          <p>Servicio Técnico Especializado</p>
        </div>
        <div class="preview-header-recibo">
          <strong>RECIBO</strong>
          DE INGRESO
        </div>
      </div>

      <div class="preview-estado-badge-wrap">
        <span class="preview-estado-badge" style="background:${colorEstado}25;color:${colorEstado};border:1.5px solid ${colorEstado}60;">
          <i class="fas ${estadoInfo.icono}"></i>
          ${estadoInfo.texto}
        </span>
      </div>

      <div class="preview-fecha">
        <span>Fecha: <strong>${formatFecha(orden.fecha)}</strong></span>
        <span>Por: <strong>${escapeHtml(orden.creadoPor || '-')}</strong></span>
      </div>

      <div class="preview-section">
        <div class="preview-section-title">👤 Cliente</div>
        <div class="preview-row">
          <span>Nombre:</span>
          <span>${escapeHtml(orden.cliente || '-')}</span>
        </div>
        <div class="preview-row">
          <span>Teléfono:</span>
          <span>
            <a href="tel:${orden.telefono}" style="color:var(--brand-500);text-decoration:none;font-weight:700;">
              ${escapeHtml(orden.telefono || '-')}
            </a>
          </span>
        </div>
      </div>

      <div class="preview-section">
        <div class="preview-section-title">📱 Equipo</div>
        <div class="preview-row">
          <span>Marca / Modelo:</span>
          <span>${escapeHtml(orden.marca || '')} ${escapeHtml(orden.modelo || '')}</span>
        </div>
        ${orden.imei ? `
          <div class="preview-row">
            <span>IMEI:</span>
            <span style="font-family:monospace;font-size:11px;">${escapeHtml(orden.imei)}</span>
          </div>
        ` : ''}
        <div class="preview-row">
          <span>Enciende:</span>
          <span>${escapeHtml(orden.enciende || '-')}</span>
        </div>
      </div>

      ${orden.estadoEquipo || orden.falla ? `
        <div class="preview-section">
          <div class="preview-section-title">🔍 Estado y falla</div>
          ${orden.estadoEquipo ? `
            <div class="preview-row">
              <span>Estado:</span>
              <span>${escapeHtml(orden.estadoEquipo)}</span>
            </div>
          ` : ''}
          ${orden.falla ? `
            <div class="preview-row">
              <span>Falla:</span>
              <span>${escapeHtml(orden.falla)}</span>
            </div>
          ` : ''}
        </div>
      ` : ''}

      ${orden.tipoSeguridad ? `
        <div class="preview-section">
          <div class="preview-section-title">🔐 Clave de acceso</div>
          ${orden.tipoSeguridad === 'pin' && orden.pin ? `
            <div class="preview-row">
              <span>PIN:</span>
              <span style="font-family:monospace;font-weight:800;color:var(--brand-500);">
                ${escapeHtml(orden.pin)}
              </span>
            </div>
          ` : ''}
          ${patronTexto ? `
            <div class="preview-row">
              <span>Patrón:</span>
              <span style="font-family:monospace;font-weight:800;color:var(--brand-500);">
                ${escapeHtml(patronTexto)}
              </span>
            </div>
          ` : ''}
        </div>
      ` : ''}

      <div class="preview-section">
        <div class="preview-section-title">🔧 Servicios y costos</div>
        <table class="preview-servicios-table">
          <thead>
            <tr>
              <th>Descripción</th>
              <th style="text-align:right;">Costo</th>
            </tr>
          </thead>
          <tbody>
            ${serviciosHtml}
          </tbody>
        </table>

        <div class="preview-totales">
          <div class="total-row">
            <span>Total:</span>
            <strong>${formatBs(orden.total || 0)}</strong>
          </div>
          ${Number(orden.adelanto) > 0 ? `
            <div class="total-row">
              <span>Adelanto:</span>
              <strong>${formatBs(orden.adelanto)}</strong>
            </div>
          ` : ''}
          <div class="saldo-row">
            <span>SALDO A PAGAR:</span>
            <span>${formatBs(orden.saldo || 0)}</span>
          </div>
        </div>
      </div>

      ${fotosHtml}

      ${orden.fechaEntrega || orden.montoCobrado ? `
        <div class="preview-section" style="background:rgba(16,185,129,0.05);">
          <div class="preview-section-title" style="color:#10B981;">✅ Entrega</div>
          ${orden.fechaEntrega ? `
            <div class="preview-row">
              <span>Fecha entrega:</span>
              <span style="color:#10B981;font-weight:700;">${formatFecha(orden.fechaEntrega)}</span>
            </div>
          ` : ''}
          ${orden.montoCobrado ? `
            <div class="preview-row">
              <span>Cobrado:</span>
              <span style="color:#10B981;font-weight:700;">${formatBs(orden.montoCobrado)}</span>
            </div>
            <div class="preview-row">
              <span>Método:</span>
              <span>${escapeHtml(orden.metodoPago || '-')}</span>
            </div>
          ` : ''}
        </div>
      ` : ''}
    </div>

    <!-- CAMBIAR ESTADO -->
    <div class="section-block">
      <h3>🔄 Cambiar estado</h3>
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
        ${Object.entries(ESTADOS).map(([key, info]) => `
          <button class="estado-btn ${key === estadoActual ? 'activo' : ''}" data-estado="${key}">
            <i class="fas ${info.icono}"></i>
            <span>${info.texto}</span>
          </button>
        `).join('')}
      </div>
    </div>

    <!-- CONTACTAR CLIENTE -->
    <div class="section-block">
      <h3>📞 Contactar al cliente</h3>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-whatsapp" id="btnContactar" style="flex:1;">
          <i class="fab fa-whatsapp"></i> WhatsApp
        </button>
        <a href="tel:${orden.telefono}" class="btn btn-secondary" style="flex:1; text-decoration:none; display:flex; align-items:center; justify-content:center; gap:6px;">
          <i class="fas fa-phone"></i> Llamar
        </a>
      </div>
    </div>

    ${estadoActual === 'listo' ? `
      <div class="section-block" style="border-color:rgba(37,211,102,0.4); background: rgba(37,211,102,0.05);">
        <h3 style="color:#25D366;">📱 Avisar al cliente</h3>
        <p style="font-size:12px; color:var(--text-3); margin-bottom:12px;">
          El equipo está listo. Envía un WhatsApp al cliente para que venga a retirarlo.
        </p>
        <button class="btn-whatsapp-grande" id="btnWhatsappListo">
          <i class="fab fa-whatsapp"></i>
          Avisar que está listo
        </button>
      </div>
    ` : ''}

    ${estadoActual === 'entregado' ? `
      <div class="section-block" style="border-color:rgba(37,211,102,0.4); background: rgba(37,211,102,0.05);">
        <h3 style="color:#25D366;">✅ Confirmar entrega</h3>
        <p style="font-size:12px; color:var(--text-3); margin-bottom:12px;">
          Envía un WhatsApp al cliente confirmando que retiró su equipo.
        </p>
        <button class="btn-whatsapp-grande" id="btnWhatsappEntrega">
          <i class="fab fa-whatsapp"></i>
          Confirmar entrega por WhatsApp
        </button>
      </div>
    ` : ''}

    <!-- COSTOS Y GANANCIA (solo admin) -->
    ${sesion.rol === 'admin' ? `
      <div class="section-block" style="border-color:rgba(16,185,129,0.3); background:rgba(16,185,129,0.03);">
        <h3 style="color:#10B981;">💰 Costos y ganancia</h3>
        ${Number(orden.montoCobrado) > 0 ? `
          <div class="fila-info">
            <span class="label">Cobrado al cliente</span>
            <span class="valor" style="color:var(--brand-500); font-weight:700;">${formatBs(orden.montoCobrado || 0)}</span>
          </div>
          <div class="fila-info">
            <span class="label">Costo del repuesto</span>
            <span class="valor" style="color:#FF9500; font-weight:700;">
              ${Number(orden.costoRepuesto) > 0 ? formatBs(orden.costoRepuesto) : 'Sin asignar'}
            </span>
          </div>
          <div class="fila-info" style="background:rgba(16,185,129,0.1); padding:8px; border-radius:8px; margin-top:8px;">
            <span class="label" style="color:#10B981; font-weight:700;">Ganancia neta</span>
            <span class="valor" style="color:#10B981; font-weight:800; font-size:16px;">
              ${formatBs(ganancia)}
            </span>
          </div>
        ` : `
          <p style="font-size:12px; color:var(--text-3); text-align:center; margin-bottom:12px;">
            Esta orden aún no tiene cobro registrado.
          </p>
        `}
        <button id="btnRegistrarCosto" class="btn btn-primary" style="margin-top:12px;">
          <i class="fas fa-calculator"></i>
          ${Number(orden.costoRepuesto) > 0 ? 'Editar costo' : 'Registrar costo'}
        </button>
        ${orden.costoActualizadoPor ? `
          <div style="font-size:10px; color:var(--text-3); text-align:center; margin-top:8px;">
            Actualizado por: ${escapeHtml(orden.costoActualizadoPor)}
          </div>
        ` : ''}
      </div>
    ` : ''}

    <!-- BITÁCORA -->
    <div class="section-block">
      <h3>📋 Bitácora de la reparación</h3>

      <div style="margin-bottom:16px;">
        <div class="dictado-wrap textarea">
          <textarea
            id="nuevaNota"
            placeholder="Escribe o dicta una nota sobre el proceso..."
            maxlength="500"
            data-dictado
            style="width:100%; padding:12px; padding-right:52px; background:var(--input-bg); color:var(--text-1); border:1.5px solid var(--border-2); border-radius:12px; font-family:inherit; font-size:13px; resize:vertical; min-height:80px;"></textarea>
        </div>

        <div class="foto-uploader" id="fotoUploader">
          <button type="button" class="btn-add-foto" id="btnAddFoto">
            <i class="fas fa-camera"></i>
            <span>Añadir</span>
          </button>
        </div>
        <input type="file" id="fotoInput" accept="image/*" capture="environment" hidden>

        <button id="btnGuardarNota" class="btn btn-primary btn-sm" style="margin-top:12px; width:auto;">
          <i class="fas fa-plus"></i> Añadir a la bitácora
        </button>
      </div>

      <div id="historialBitacora">
        ${renderBitacora()}
      </div>
    </div>

    <!-- ACCIONES ADMIN -->
    ${sesion.rol === 'admin' ? `
      <div class="section-block" style="border-color: rgba(239,68,68,0.3);">
        <h3 style="color:#EF4444;">⚙️ Acciones de administrador</h3>
        <button id="btnEliminar" class="btn btn-secondary" style="border-color:#EF4444; color:#EF4444;">
          <i class="fas fa-trash"></i> Eliminar orden
        </button>
      </div>
    ` : ''}
  `;

  configurarEventosOrden();

  if (window.__dictadoIniciar) {
    setTimeout(() => window.__dictadoIniciar(), 100);
  }
}

function getTextoClave(o) {
  if (!o.tipoSeguridad) return '-';
  if (o.tipoSeguridad === 'pin') return `PIN: <strong style="color:var(--text-1);">${escapeHtml(o.pin || '-')}</strong>`;
  if (o.tipoSeguridad === 'patron') {
    const patron = (o.patron || '').split(',').join('-');
    return `Patrón: <strong style="color:var(--text-1);">${escapeHtml(patron)}</strong>`;
  }
  return 'Sin clave de acceso';
}

function renderBitacora() {
  const bitacora = Array.isArray(orden.bitacora) ? orden.bitacora : [];

  const ordenada = [...bitacora].sort((a, b) => {
    const fa = a.fecha ? new Date(a.fecha) : 0;
    const fb = b.fecha ? new Date(b.fecha) : 0;
    return fb - fa;
  });

  if (ordenada.length === 0) {
    return `
      <div style="text-align:center; padding:20px; color:var(--text-3); font-size:13px;">
        <i class="fas fa-clipboard-list" style="font-size:24px; opacity:0.4; margin-bottom:8px; display:block;"></i>
        No hay entradas en la bitácora aún
      </div>
    `;
  }

  return ordenada.map(entry => {
    let clase = 'nota';
    let icono = 'fa-sticky-note';

    if (entry.tipo === 'estado') { clase = 'estado'; icono = 'fa-exchange-alt'; }
    else if (entry.tipo === 'foto') { clase = 'foto'; icono = 'fa-camera'; }
    else if (entry.tipo === 'whatsapp') { clase = 'whatsapp'; icono = 'fa-brands fa-whatsapp'; }
    else if (entry.tipo === 'cobro') { clase = 'estado'; icono = 'fa-money-bill-wave'; }

    return `
      <div class="bitacora-item">
        <div class="bitacora-icono ${clase}">
          <i class="fas ${icono}"></i>
        </div>
        <div class="bitacora-content">
          <div>
            <span class="bitacora-autor">${escapeHtml(entry.autor || 'Sistema')}</span>
            <span class="bitacora-fecha">${tiempoRelativo(entry.fecha)}</span>
          </div>
          <div class="bitacora-texto">${escapeHtml(entry.texto || '')}</div>
          ${Array.isArray(entry.fotos) && entry.fotos.length > 0 ? `
            <div class="bitacora-fotos">
              ${entry.fotos.map(f => `<img src="${f}" alt="foto" data-ver-img="${f}">`).join('')}
            </div>
          ` : ''}
        </div>
      </div>
    `;
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

  if (btnAddFoto && fotoInput) {
    btnAddFoto.addEventListener('click', () => {
      haptic(10);
      fotoInput.click();
    });
  }

  if (fotoInput) {
    fotoInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      haptic(10);
      try {
        const dataUrl = await comprimirImagen(file, 1000, 0.75);
        fotosNuevas.push(dataUrl);
        renderFotosNuevas();
      } catch (err) {
        console.error(err);
        toast('Error procesando imagen', 'error');
      }
      fotoInput.value = '';
    });
  }

  document.getElementById('btnGuardarNota')?.addEventListener('click', guardarNota);
  document.getElementById('btnWhatsappListo')?.addEventListener('click', enviarWhatsappListo);
  document.getElementById('btnWhatsappEntrega')?.addEventListener('click', enviarWhatsappEntrega);
  document.getElementById('btnContactar')?.addEventListener('click', contactarCliente);
  document.getElementById('btnEliminar')?.addEventListener('click', eliminarOrden);
  document.getElementById('btnRegistrarCosto')?.addEventListener('click', abrirModalCosto);

  // Visor de imágenes
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

    viewerCerrar.addEventListener('click', () => {
      viewer.classList.remove('show');
      const vImg = document.getElementById('imgViewerImg');
      if (vImg) vImg.src = '';
    });

    viewer.addEventListener('click', (e) => {
      if (e.target === viewer) {
        viewer.classList.remove('show');
        const vImg = document.getElementById('imgViewerImg');
        if (vImg) vImg.src = '';
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && viewer.classList.contains('show')) {
        viewer.classList.remove('show');
        const vImg = document.getElementById('imgViewerImg');
        if (vImg) vImg.src = '';
      }
    });
  }
}

/* ============================================================
   CAMBIAR ESTADO
   ============================================================ */
async function cambiarEstado(nuevoEstado) {
  if (!nuevoEstado || !ESTADOS[nuevoEstado]) return;

  const estadoActual = orden.estadoOrden || 'recibido';
  if (nuevoEstado === estadoActual) {
    toast('Ya está en ese estado', 'info', 1500);
    return;
  }

  if (nuevoEstado === 'entregado') {
    abrirModalCobro();
    return;
  }

  haptic(20);
  showLoading('Actualizando estado...');

  try {
    const entrada = {
      tipo: 'estado',
      texto: `Estado cambiado a: ${ESTADOS[nuevoEstado].texto}`,
      autor: sesion.nombre,
      fecha: new Date().toISOString()
    };

    await updateDoc(doc(db, 'recibos', ordenId), {
      estadoOrden: nuevoEstado,
      bitacora: arrayUnion(entrada),
      actualizadoEn: serverTimestamp()
    });

    orden.estadoOrden = nuevoEstado;
    orden.bitacora = [...(orden.bitacora || []), entrada];

    toast(`Estado: ${ESTADOS[nuevoEstado].texto}`, 'success', 2000);
    renderOrden();

  } catch (err) {
    console.error('Error cambiando estado:', err);
    toast('Error al cambiar estado', 'error');
  } finally {
    hideLoading();
  }
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
    <div class="modal" style="max-width: 420px;">
      <h3 class="modal-title" style="color: var(--brand-500);">✅ Confirmar entrega</h3>
      <p class="modal-text" style="margin-bottom: 20px;">
        <strong>${escapeHtml(orden.cliente)}</strong><br>
        <span style="font-size: 12px; color: var(--text-3);">
          Total: ${formatBs(total)}${saldo > 0 && saldo !== total ? ` · Saldo: ${formatBs(saldo)}` : ''}
        </span>
      </p>

      <div style="margin-bottom: 16px;">
        <label style="display:block; font-size:12px; font-weight:700; color:var(--text-3); text-transform:uppercase; letter-spacing:0.6px; margin-bottom:6px;">
          Monto cobrado
        </label>
        <input type="number"
               id="inputMonto"
               step="0.01"
               min="0"
               value="${montoSugerido.toFixed(2)}"
               inputmode="decimal"
               style="width:100%; padding:14px; font-size:18px; font-weight:700; text-align:center; background:var(--input-bg); color:var(--text-1); border:1.5px solid var(--border-2); border-radius:12px; font-family:inherit;">
      </div>

      <div style="margin-bottom: 20px;">
        <label style="display:block; font-size:12px; font-weight:700; color:var(--text-3); text-transform:uppercase; letter-spacing:0.6px; margin-bottom:8px;">
          Método de pago
        </label>
        <div id="metodosPago" style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
          <button type="button" class="metodo-btn" data-metodo="Efectivo">
            <i class="fas fa-money-bill-wave"></i><span>Efectivo</span>
          </button>
          <button type="button" class="metodo-btn" data-metodo="QR">
            <i class="fas fa-qrcode"></i><span>QR</span>
          </button>
          <button type="button" class="metodo-btn" data-metodo="Transferencia">
            <i class="fas fa-building-columns"></i><span>Transferencia</span>
          </button>
          <button type="button" class="metodo-btn" data-metodo="Mixto">
            <i class="fas fa-shuffle"></i><span>Mixto</span>
          </button>
        </div>

        <div id="detalleMixtoContainer" style="display:none; margin-top:10px;">
          <input type="text"
                 id="detalleMixto"
                 placeholder="Ej: 200 efectivo + 150 QR"
                 maxlength="100"
                 style="width:100%; padding:12px; background:var(--input-bg); color:var(--text-1); border:1.5px solid var(--border-2); border-radius:12px; font-family:inherit; font-size:13px;">
        </div>

        <div id="errorMetodo" style="color:#EF4444; font-size:12px; margin-top:8px; display:none;"></div>
      </div>

      <div style="display:flex; gap:8px;">
        <button type="button" class="btn btn-secondary" id="btnCancelarCobro" style="flex:1;">
          Cancelar
        </button>
        <button type="button" class="btn btn-primary" id="btnConfirmarCobro" style="flex:1;">
          <i class="fas fa-check"></i> Confirmar
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('show'));

  if (!document.getElementById('metodoBtnStyles')) {
    const style = document.createElement('style');
    style.id = 'metodoBtnStyles';
    style.textContent = `
      .metodo-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 12px 8px;
        background: var(--bg-elev-2);
        border: 2px solid var(--border-2);
        border-radius: 12px;
        color: var(--text-2);
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        font-family: inherit;
        transition: all 0.15s ease;
      }
      .metodo-btn i { font-size: 20px; }
      .metodo-btn:active { transform: scale(0.95); }
      .metodo-btn.activo {
        background: var(--brand-500);
        border-color: var(--brand-500);
        color: white;
        box-shadow: 0 4px 12px rgba(255,105,0,0.4);
      }
    `;
    document.head.appendChild(style);
  }

  let metodoSeleccionado = null;

  modal.querySelectorAll('.metodo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      haptic(8);
      modal.querySelectorAll('.metodo-btn').forEach(b => b.classList.remove('activo'));
      btn.classList.add('activo');
      metodoSeleccionado = btn.dataset.metodo;

      const detalle = document.getElementById('detalleMixtoContainer');
      detalle.style.display = metodoSeleccionado === 'Mixto' ? 'block' : 'none';
      document.getElementById('errorMetodo').style.display = 'none';
    });
  });

  document.getElementById('btnCancelarCobro').addEventListener('click', cerrarModalCobro);

  document.getElementById('btnConfirmarCobro').addEventListener('click', async () => {
    const monto = parseFloat(document.getElementById('inputMonto').value) || 0;

    if (!metodoSeleccionado) {
      document.getElementById('errorMetodo').textContent = 'Selecciona un método de pago';
      document.getElementById('errorMetodo').style.display = 'block';
      return;
    }

    if (monto <= 0) {
      document.getElementById('errorMetodo').textContent = 'Ingresa un monto válido';
      document.getElementById('errorMetodo').style.display = 'block';
      return;
    }

    let metodoFinal = metodoSeleccionado;
    if (metodoSeleccionado === 'Mixto') {
      const detalle = document.getElementById('detalleMixto').value.trim();
      if (!detalle) {
        document.getElementById('errorMetodo').textContent = 'Especifica el detalle del pago mixto';
        document.getElementById('errorMetodo').style.display = 'block';
        return;
      }
      metodoFinal = `Mixto (${detalle})`;
    }

    await confirmarCobro(monto, metodoFinal);
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) cerrarModalCobro();
  });
}

function cerrarModalCobro() {
  const modal = document.getElementById('modalCobro');
  if (!modal) return;
  modal.classList.remove('show');
  setTimeout(() => modal.remove(), 300);
}

async function confirmarCobro(monto, metodo) {
  cerrarModalCobro();
  haptic(20);
  showLoading('Registrando entrega...');

  try {
    const entrada = {
      tipo: 'estado',
      texto: `Estado cambiado a: Entregado · Cobrado: ${formatBs(monto)} (${metodo})`,
      autor: sesion.nombre,
      fecha: new Date().toISOString()
    };

    await updateDoc(doc(db, 'recibos', ordenId), {
      estadoOrden: 'entregado',
      fechaEntrega: serverTimestamp(),
      montoCobrado: monto,
      metodoPago: metodo,
      bitacora: arrayUnion(entrada),
      actualizadoEn: serverTimestamp()
    });

    orden.estadoOrden = 'entregado';
    orden.fechaEntrega = new Date();
    orden.montoCobrado = monto;
    orden.metodoPago = metodo;
    orden.bitacora = [...(orden.bitacora || []), entrada];

    toast(`Entregado · ${formatBs(monto)} (${metodo})`, 'success', 2500);
    renderOrden();

  } catch (err) {
    console.error('Error:', err);
    toast('Error al registrar entrega', 'error');
  } finally {
    hideLoading();
  }
}

/* ============================================================
   MODAL PARA REGISTRAR COSTO (solo admin)
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
  modal.innerHTML = `
    <div class="modal" style="max-width: 420px;">
      <h3 class="modal-title" style="color: #10B981;">
        <i class="fas fa-calculator"></i> Registrar costo
      </h3>

      <div style="background:var(--bg-elev-2); border-radius:12px; padding:12px; margin-bottom:1rem;">
        <div style="font-size:11px; color:var(--text-3); margin-bottom:4px;">RECIBO</div>
        <div style="font-weight:700; font-size:13px;">${escapeHtml(orden.numeroRecibo || '-')}</div>
        <div style="font-size:12px; color:var(--text-2); margin-top:4px;">${escapeHtml(orden.cliente || '-')}</div>
        <div style="font-size:11px; color:var(--text-3); margin-top:2px;">${escapeHtml(orden.marca || '')} ${escapeHtml(orden.modelo || '')}</div>
      </div>

      <div style="margin-bottom:1rem;">
        <label style="display:block; font-size:11px; font-weight:700; color:var(--text-3); text-transform:uppercase; letter-spacing:0.6px; margin-bottom:6px;">
          Monto cobrado al cliente
        </label>
        <div style="background:var(--bg-elev-2); border:1.5px solid var(--border-2); border-radius:12px; padding:14px; font-size:18px; font-weight:800; text-align:center; color:var(--brand-500);">
          ${formatBs(monto)}
        </div>
      </div>

      <div style="margin-bottom:1rem;">
        <label style="display:block; font-size:11px; font-weight:700; color:var(--text-3); text-transform:uppercase; letter-spacing:0.6px; margin-bottom:6px;">
          Costo del repuesto
        </label>
        <input type="number"
               id="costoInput"
               step="0.01"
               min="0"
               value="${costoActual > 0 ? costoActual.toFixed(2) : ''}"
               inputmode="decimal"
               placeholder="0.00"
               style="width:100%; padding:14px; font-size:20px; font-weight:800; text-align:center; background:var(--input-bg); color:#FF9500; border:1.5px solid var(--border-2); border-radius:12px; font-family:inherit;">
        <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
          <button type="button" class="costo-preset" data-pct="0.7" style="flex:1; padding:8px; background:var(--bg-elev-2); border:1px solid var(--border); border-radius:8px; color:var(--text-2); font-size:11px; font-weight:700; cursor:pointer; font-family:inherit;">70%</button>
          <button type="button" class="costo-preset" data-pct="0.5" style="flex:1; padding:8px; background:var(--bg-elev-2); border:1px solid var(--border); border-radius:8px; color:var(--text-2); font-size:11px; font-weight:700; cursor:pointer; font-family:inherit;">50%</button>
          <button type="button" class="costo-preset" data-pct="0.4" style="flex:1; padding:8px; background:var(--bg-elev-2); border:1px solid var(--border); border-radius:8px; color:var(--text-2); font-size:11px; font-weight:700; cursor:pointer; font-family:inherit;">40%</button>
        </div>
      </div>

      <div style="background:linear-gradient(135deg,rgba(16,185,129,0.1),rgba(0,255,200,0.1)); border:1.5px solid rgba(16,185,129,0.4); border-radius:12px; padding:16px; margin-bottom:1.2rem; text-align:center;">
        <div style="font-size:11px; color:var(--text-3); text-transform:uppercase; font-weight:700; letter-spacing:0.6px; margin-bottom:4px;">Ganancia neta</div>
        <div id="gananciaPreview" style="font-size:26px; font-weight:900; color:#10B981; line-height:1;">
          ${formatBs(gananciaInicial)}
        </div>
      </div>

      <div style="display:flex; gap:8px;">
        <button type="button" class="btn btn-secondary" id="btnCancelarCosto" style="flex:1;">
          Cancelar
        </button>
        <button type="button" class="btn btn-primary" id="btnGuardarCosto" style="flex:1;">
          <i class="fas fa-check"></i> Guardar
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('show'));

  const costoInput = modal.querySelector('#costoInput');
  const gananciaPreview = modal.querySelector('#gananciaPreview');

  function actualizarPreview() {
    const costo = parseFloat(costoInput.value) || 0;
    const ganancia = monto - costo;
    gananciaPreview.textContent = formatBs(ganancia);
    gananciaPreview.style.color = ganancia >= 0 ? '#10B981' : '#FF4D6D';
  }

  costoInput.addEventListener('input', actualizarPreview);
  costoInput.focus();

  modal.querySelectorAll('.costo-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const pct = parseFloat(btn.dataset.pct);
      costoInput.value = (monto * pct).toFixed(2);
      actualizarPreview();
      haptic(8);
    });
  });

  document.getElementById('btnCancelarCosto').addEventListener('click', cerrarModalCosto);

  document.getElementById('btnGuardarCosto').addEventListener('click', async () => {
    const costo = parseFloat(costoInput.value) || 0;
    haptic(20);
    showLoading('Guardando costo...');

    try {
      const ganancia = monto - costo;

      const entrada = {
        tipo: 'cobro',
        texto: `Costo registrado: ${formatBs(costo)} · Ganancia: ${formatBs(ganancia)}`,
        autor: sesion.nombre,
        fecha: new Date().toISOString()
      };

      await updateDoc(doc(db, 'recibos', ordenId), {
        costoRepuesto: costo,
        gananciaNeta: ganancia,
        costoActualizadoEn: serverTimestamp(),
        costoActualizadoPor: sesion.nombre,
        bitacora: arrayUnion(entrada)
      });

      orden.costoRepuesto = costo;
      orden.gananciaNeta = ganancia;
      orden.costoActualizadoPor = sesion.nombre;
      orden.bitacora = [...(orden.bitacora || []), entrada];

      toast(`Costo guardado · Ganancia: ${formatBs(ganancia)}`, 'success', 2500);
      cerrarModalCosto();
      renderOrden();

    } catch (err) {
      console.error('Error guardando costo:', err);
      toast('Error al guardar el costo', 'error');
    } finally {
      hideLoading();
    }
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) cerrarModalCosto();
  });
}

function cerrarModalCosto() {
  const modal = document.getElementById('modalCosto');
  if (!modal) return;
  modal.classList.remove('show');
  setTimeout(() => modal.remove(), 300);
}

/* ============================================================
   WHATSAPP - CONTACTAR
   ============================================================ */
function contactarCliente() {
  if (!orden.telefono) {
    toast('La orden no tiene teléfono', 'error');
    return;
  }

  haptic(15);

  const nombreCliente = (orden.cliente || '').split(' ')[0] || 'cliente';
  const equipo = `${orden.marca || ''} ${orden.modelo || ''}`.trim();
  const mensaje = `Hola ${nombreCliente}, le escribimos de ${CONFIG.nombreTienda} en relación a su ${equipo} (Recibo ${orden.numeroRecibo || '-'}).`;

  const tel = orden.telefono.replace(/\D/g, '');
  const url = `https://wa.me/591${tel}?text=${encodeURIComponent(mensaje)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

/* ============================================================
   WHATSAPP - AVISAR LISTO
   ============================================================ */
async function enviarWhatsappListo() {
  if (!orden.telefono) {
    toast('La orden no tiene teléfono', 'error');
    return;
  }

  haptic(15);

  const serviciosTexto = Array.isArray(orden.servicios) && orden.servicios.length > 0
    ? orden.servicios.map(s => `- ${s.desc}`).join('\n')
    : '- Reparación realizada';

  const nombreCliente = (orden.cliente || '').split(' ')[0] || 'cliente';
  const equipo = `${orden.marca || ''} ${orden.modelo || ''}`.trim();
  const saldoTexto = Number(orden.saldo) > 0 ? `Saldo pendiente: ${formatBs(orden.saldo)}\n` : '';

  const mensaje = `Hola ${nombreCliente},

Buenas noticias: su ${equipo} ya está LISTO para retirar.

Servicios realizados:
${serviciosTexto}

Total: ${formatBs(orden.total || 0)}
${saldoTexto}
${CONFIG.nombreTienda}
${CONFIG.direccion}
${CONFIG.horario}
Tel: ${CONFIG.telefono}

Le esperamos.`;

  const tel = orden.telefono.replace(/\D/g, '');
  const url = `https://wa.me/591${tel}?text=${encodeURIComponent(mensaje)}`;
  window.open(url, '_blank', 'noopener,noreferrer');

  try {
    const entrada = {
      tipo: 'whatsapp',
      texto: `WhatsApp enviado: Aviso de equipo listo`,
      autor: sesion.nombre,
      fecha: new Date().toISOString()
    };
    await updateDoc(doc(db, 'recibos', ordenId), {
      bitacora: arrayUnion(entrada),
      actualizadoEn: serverTimestamp()
    });
    orden.bitacora = [...(orden.bitacora || []), entrada];
    renderOrden();
    toast('WhatsApp enviado y registrado', 'success', 2000);
  } catch (err) {
    console.error('Error registrando WhatsApp:', err);
  }
}

/* ============================================================
   WHATSAPP - CONFIRMAR ENTREGA
   ============================================================ */
async function enviarWhatsappEntrega() {
  if (!orden.telefono) {
    toast('La orden no tiene teléfono', 'error');
    return;
  }

  haptic(15);

  const fechaEntrega = orden.fechaEntrega
    ? formatFecha(orden.fechaEntrega)
    : formatFecha(new Date());

  const nombreCliente = (orden.cliente || '').split(' ')[0] || 'cliente';
  const equipo = `${orden.marca || ''} ${orden.modelo || ''}`.trim();
  const montoTexto = orden.montoCobrado
    ? `Total cobrado: ${formatBs(orden.montoCobrado)}\nMétodo: ${orden.metodoPago}\n`
    : '';

  const mensaje = `Hola ${nombreCliente},

Confirmamos la entrega de su ${equipo}.

N° Recibo: ${orden.numeroRecibo || '-'}
Fecha de entrega: ${fechaEntrega}

${montoTexto}
Gracias por confiar en nosotros.
Cualquier consulta:
Tel: ${CONFIG.telefono}

${CONFIG.nombreTienda}
${CONFIG.web}`;

  const tel = orden.telefono.replace(/\D/g, '');
  const url = `https://wa.me/591${tel}?text=${encodeURIComponent(mensaje)}`;
  window.open(url, '_blank', 'noopener,noreferrer');

  try {
    const entrada = {
      tipo: 'whatsapp',
      texto: `WhatsApp enviado: Confirmación de entrega`,
      autor: sesion.nombre,
      fecha: new Date().toISOString()
    };
    await updateDoc(doc(db, 'recibos', ordenId), {
      bitacora: arrayUnion(entrada),
      actualizadoEn: serverTimestamp()
    });
    orden.bitacora = [...(orden.bitacora || []), entrada];
    renderOrden();
    toast('Confirmación enviada y registrada', 'success', 2000);
  } catch (err) {
    console.error('Error registrando WhatsApp:', err);
  }
}

/* ============================================================
   GUARDAR NOTA
   ============================================================ */
async function guardarNota() {
  const notaInput = document.getElementById('nuevaNota');
  const texto = (notaInput.value || '').trim();

  if (!texto && fotosNuevas.length === 0) {
    toast('Escribe una nota o añade una foto', 'error');
    return;
  }

  haptic(15);
  showLoading('Guardando...');

  try {
    const entrada = {
      tipo: fotosNuevas.length > 0 && !texto ? 'foto' : 'nota',
      texto: texto || 'Foto añadida',
      fotos: fotosNuevas.slice(),
      autor: sesion.nombre,
      fecha: new Date().toISOString()
    };

    await updateDoc(doc(db, 'recibos', ordenId), {
      bitacora: arrayUnion(entrada),
      actualizadoEn: serverTimestamp()
    });

    orden.bitacora = [...(orden.bitacora || []), entrada];
    fotosNuevas = [];

    toast('Entrada añadida a la bitácora', 'success', 2000);
    renderOrden();

  } catch (err) {
    console.error('Error guardando nota:', err);
    toast('Error al guardar la nota', 'error');
  } finally {
    hideLoading();
  }
}

/* ============================================================
   RENDER FOTOS NUEVAS
   ============================================================ */
function renderFotosNuevas() {
  const cont = document.getElementById('fotoUploader');
  if (!cont) return;

  const btnAdd = cont.querySelector('#btnAddFoto');
  cont.querySelectorAll('.foto-preview').forEach(el => el.remove());

  fotosNuevas.forEach((dataUrl, i) => {
    const div = document.createElement('div');
    div.className = 'foto-preview';
    div.innerHTML = `
      <img src="${dataUrl}" alt="preview">
      <button type="button" class="btn-remove" data-idx="${i}">
        <i class="fas fa-times"></i>
      </button>
    `;
    cont.insertBefore(div, btnAdd);
  });

  cont.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      fotosNuevas.splice(idx, 1);
      renderFotosNuevas();
      haptic(10);
    });
  });
}

/* ============================================================
   ELIMINAR
   ============================================================ */
async function eliminarOrden() {
  if (sesion.rol !== 'admin') return;

  const confirmar = confirm(
    '¿Estás seguro que quieres eliminar esta orden?\n\nEsta acción NO se puede deshacer.'
  );

  if (!confirmar) return;

  haptic([50, 30, 50]);
  showLoading('Eliminando...');

  try {
    await deleteDoc(doc(db, 'recibos', ordenId));
    toast('Orden eliminada', 'success', 2000);
    setTimeout(() => window.location.href = '/app/', 1000);
  } catch (err) {
    console.error('Error eliminando:', err);
    toast('Error al eliminar', 'error');
    hideLoading();
  }
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
        if (width > height && width > maxSize) {
          height = (height * maxSize) / width;
          width = maxSize;
        } else if (height > maxSize) {
          width = (width * maxSize) / height;
          height = maxSize;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
