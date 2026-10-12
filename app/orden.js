/* ============================================================
   DR. XIAOMI · ORDEN (Detalle + Bitácora + WhatsApp + Cobro)
   Archivo: app/orden.js
   Versión: timeout de seguridad, manejo de errores robusto,
            debug en consola, visor de imágenes (modal),
            mensajes de WhatsApp SIN emojis
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

// Módulo de dictado por voz (se autoinicializa)
import '/js/dictado.js';

/* ============================================================
   CONFIGURACIÓN
   ============================================================ */
const DEBUG = true; // ← cambia a false en producción
const TIMEOUT_MS = 10000; // 10 segundos máximo esperando Firestore

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
   CARGAR ORDEN (con timeout y manejo robusto)
   ============================================================ */
async function cargarOrden() {
  showLoading('Cargando orden...');

  try {
    const ref = doc(db, 'recibos', ordenId);

    const snap = await Promise.race([
      getDoc(ref),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT: Firestore no respondió en ' + (TIMEOUT_MS/1000) + 's')), TIMEOUT_MS)
      )
    ]);

    if (!snap.exists()) {
      if (DEBUG) console.warn('⚠️ La orden no existe en Firestore:', ordenId);
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

  cont.innerHTML = `
    <!-- ESTADO ACTUAL -->
    <div class="section-block">
      <div class="fila-info" style="margin-bottom:10px;">
        <span class="label">Estado actual</span>
        <span class="chip chip-${estadoInfo.clase}">
          <i class="fas ${estadoInfo.icono}"></i> ${estadoInfo.texto}
        </span>
      </div>
      <div class="fila-info">
        <span class="label">Recibo</span>
        <span class="valor">${escapeHtml(orden.numeroRecibo || '-')}</span>
      </div>
      <div class="fila-info">
        <span class="label">Registrado</span>
        <span class="valor">${formatFecha(orden.fecha)}</span>
      </div>
      <div class="fila-info">
        <span class="label">Por</span>
        <span class="valor">${escapeHtml(orden.creadoPor || '-')}</span>
      </div>
      ${orden.fechaEntrega ? `
        <div class="fila-info" style="background:rgba(16,185,129,0.1); padding:8px; border-radius:8px; margin-top:8px;">
          <span class="label" style="color:#10B981; font-weight:700;">✓ Entregado</span>
          <span class="valor" style="color:#10B981;">${formatFecha(orden.fechaEntrega)}</span>
        </div>
      ` : ''}
      ${orden.montoCobrado ? `
        <div class="fila-info" style="background:rgba(255,105,0,0.08); padding:8px; border-radius:8px; margin-top:6px;">
          <span class="label" style="color:var(--brand-500); font-weight:700;">💰 Cobrado</span>
          <span class="valor" style="color:var(--brand-500);">${formatBs(orden.montoCobrado)} · ${escapeHtml(orden.metodoPago || '-')}</span>
        </div>
      ` : ''}
    </div>

    <!-- CLIENTE -->
    <div class="section-block">
      <h3>👤 Cliente</h3>
      <div class="fila-info">
        <span class="label">Nombre</span>
        <span class="valor">${escapeHtml(orden.cliente || '-')}</span>
      </div>
      <div class="fila-info">
        <span class="label">Teléfono</span>
        <a href="tel:${orden.telefono}" style="color:var(--brand-500); font-weight:700; font-size:13px; text-decoration:none;">
          ${escapeHtml(orden.telefono || '-')}
        </a>
      </div>
      <div style="display:flex; gap:8px; margin-top:12px;">
        <button class="btn btn-whatsapp btn-sm" id="btnContactar" style="flex:1;">
          <i class="fab fa-whatsapp"></i> Contactar
        </button>
        <a href="tel:${orden.telefono}" class="btn btn-secondary btn-sm" style="flex:0 0 auto; padding:10px 16px; text-decoration:none;">
          <i class="fas fa-phone"></i> Llamar
        </a>
      </div>
    </div>

    <!-- EQUIPO -->
    <div class="section-block">
      <h3>📱 Equipo</h3>
      <div class="fila-info">
        <span class="label">Marca / Modelo</span>
        <span class="valor">${escapeHtml(orden.marca || '')} ${escapeHtml(orden.modelo || '')}</span>
      </div>
      ${orden.imei ? `
        <div class="fila-info">
          <span class="label">IMEI</span>
          <span class="valor" style="font-family:monospace; font-size:12px;">${escapeHtml(orden.imei)}</span>
        </div>
      ` : ''}
      <div class="fila-info">
        <span class="label">¿Enciende?</span>
        <span class="valor">${escapeHtml(orden.enciende || '-')}</span>
      </div>
    </div>

    ${orden.estadoEquipo || orden.falla ? `
      <div class="section-block">
        <h3>🔍 Estado y falla</h3>
        ${orden.estadoEquipo ? `
          <div style="margin-bottom:10px;">
            <div style="color:var(--text-3); font-size:11px; margin-bottom:3px;">Estado del equipo</div>
            <div style="color:var(--text-2); font-size:13px; line-height:1.4;">${escapeHtml(orden.estadoEquipo)}</div>
          </div>
        ` : ''}
        ${orden.falla ? `
          <div>
            <div style="color:var(--text-3); font-size:11px; margin-bottom:3px;">Falla reportada</div>
            <div style="color:var(--text-2); font-size:13px; line-height:1.4;">${escapeHtml(orden.falla)}</div>
          </div>
        ` : ''}
      </div>
    ` : ''}

    ${orden.tipoSeguridad ? `
      <div class="section-block">
        <h3>🔐 Clave de acceso</h3>
        <div style="color:var(--text-2); font-size:13px;">
          ${getTextoClave(orden)}
        </div>
      </div>
    ` : ''}

    ${Array.isArray(orden.servicios) && orden.servicios.length > 0 ? `
      <div class="section-block">
        <h3>🔧 Servicios</h3>
        ${orden.servicios.map(s => `
          <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--border-1);">
            <span style="color:var(--text-2); font-size:13px;">${escapeHtml(s.desc)}</span>
            <strong style="color:var(--text-1); font-size:13px;">${formatBs(s.costo)}</strong>
          </div>
        `).join('')}
        <div style="display:flex; justify-content:space-between; padding-top:10px; margin-top:6px; border-top:2px solid var(--border-2);">
          <span style="color:var(--text-3); font-size:12px;">Total</span>
          <strong style="color:var(--text-1); font-size:14px;">${formatBs(orden.total || 0)}</strong>
        </div>
        ${Number(orden.adelanto) > 0 ? `
          <div style="display:flex; justify-content:space-between; padding-top:4px;">
            <span style="color:var(--text-3); font-size:12px;">Adelanto</span>
            <strong style="color:var(--text-2); font-size:13px;">${formatBs(orden.adelanto)}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; padding-top:4px;">
            <span style="color:var(--brand-500); font-size:13px; font-weight:700;">Saldo pendiente</span>
            <strong style="color:var(--brand-500); font-size:15px;">${formatBs(orden.saldo || 0)}</strong>
          </div>
        ` : ''}
      </div>
    ` : ''}

    ${Array.isArray(orden.fotos) && orden.fotos.length > 0 ? `
      <div class="section-block">
        <h3>📸 Fotos del ingreso</h3>
        <div class="bitacora-fotos">
          ${orden.fotos.map(f => `<img src="${f}" alt="foto" data-ver-img="${f}">`).join('')}
        </div>
      </div>
    ` : ''}

    <!-- BOTÓN WHATSAPP LISTO -->
    ${estadoActual === 'listo' ? `
      <div class="section-block" style="border-color:rgba(37,211,102,0.4); background: rgba(37,211,102,0.05);">
        <h3 style="color:#25D366;">📱 Avisar al cliente</h3>
        <p style="font-size:12px; color:var(--text-3); margin-bottom:0;">
          El equipo está listo. Envía un WhatsApp al cliente para que venga a retirarlo.
        </p>
        <button class="btn-whatsapp-grande" id="btnWhatsappListo">
          <i class="fab fa-whatsapp"></i>
          Avisar que está listo
        </button>
      </div>
    ` : ''}

    <!-- BOTÓN WHATSAPP ENTREGA -->
    ${estadoActual === 'entregado' ? `
      <div class="section-block" style="border-color:rgba(37,211,102,0.4); background: rgba(37,211,102,0.05);">
        <h3 style="color:#25D366;">✅ Confirmar entrega</h3>
        <p style="font-size:12px; color:var(--text-3); margin-bottom:0;">
          Envía un WhatsApp al cliente confirmando que retiró su equipo.
        </p>
        <button class="btn-whatsapp-grande" id="btnWhatsappEntrega">
          <i class="fab fa-whatsapp"></i>
          Confirmar entrega por WhatsApp
        </button>
      </div>
    ` : ''}

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

  // ============================================================
  // 🖼️ VISOR DE IMÁGENES
  // ============================================================
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

  if (viewer && viewerCerrar) {
    if (!viewer.dataset.listenersAdded) {
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

  const style = document.createElement('style');
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

  document.getElementById('btnCancelarCobro').addEventListener('click', () => {
    cerrarModalCobro();
  });

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
   WHATSAPP - CONTACTAR
   ============================================================ */
function contactarCliente() {
  if (!orden.telefono) {
    toast('La orden no tiene teléfono', 'error');
    return;
  }

  haptic(15);

  const mensaje = `Hola ${(orden.cliente || '').split(' ')[0]}, le escribimos de ${CONFIG
