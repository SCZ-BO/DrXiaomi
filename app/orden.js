/* ============================================================
   DR. XIAOMI · ORDEN (Detalle + Bitácora + WhatsApp)
   Archivo: app/orden.js
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

/* ============================================================
   CONFIGURACIÓN
   ============================================================ */
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

  if (!ordenId) {
    toast('Orden no encontrada', 'error');
    setTimeout(() => window.location.href = '/app/', 1500);
    return;
  }

  await cargarOrden();

  document.getElementById('backBtn').addEventListener('click', () => {
    haptic(10);
    window.location.href = '/app/';
  });
}

/* ============================================================
   CARGAR ORDEN
   ============================================================ */
async function cargarOrden() {
  try {
    const ref = doc(db, 'recibos', ordenId);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      toast('Orden no encontrada', 'error');
      setTimeout(() => window.location.href = '/app/', 1500);
      return;
    }

    orden = { id: snap.id, ...snap.data() };
    renderOrden();

  } catch (err) {
    console.error('Error cargando orden:', err);
    toast('Error al cargar la orden', 'error');
  }
}

/* ============================================================
   RENDER PRINCIPAL
   ============================================================ */
function renderOrden() {
  const estadoActual = orden.estadoOrden || 'recibido';
  const estadoInfo = ESTADOS[estadoActual] || ESTADOS.recibido;

  document.getElementById('headerTitle').textContent = orden.numeroRecibo || 'ORDEN';
  document.getElementById('headerSubtitle').textContent = 
    `${estadoInfo.texto} · ${tiempoRelativo(orden.fecha)}`;

  const cont = document.getElementById('contenido');
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
          ${orden.fotos.map(f => `<img src="${f}" alt="foto" onclick="window.open('${f}', '_blank')">`).join('')}
        </div>
      </div>
    ` : ''}

    <!-- BOTONES DE WHATSAPP -->
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

    ${estadoActual === 'entregado' ? `
      <div class="section-block" style="border-color:rgba(37,211,102,0.4); background: rgba(37,211,102,0.05);">
        <h3 style="color:#25D366;">✅ Confirmar entrega</h3>
        <p style="font-size:12px; color:var(--text-3); margin-bottom:0;">
          Envía un WhatsApp al cliente confirmando que retiró su equipo. Queda constancia con fecha.
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
        <textarea 
          id="nuevaNota" 
          placeholder="Escribe una nota sobre el proceso..."
          maxlength="500"
          style="width:100%; padding:12px; background:var(--input-bg); color:var(--text-1); border:1.5px solid var(--border-2); border-radius:12px; font-family:inherit; font-size:13px; resize:vertical; min-height:80px;"></textarea>

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
              ${entry.fotos.map(f => `<img src="${f}" alt="foto" onclick="window.open('${f}', '_blank')">`).join('')}
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
  // Botones de estado
  document.querySelectorAll('.estado-btn').forEach(btn => {
    btn.addEventListener('click', () => cambiarEstado(btn.dataset.estado));
  });

  // Foto uploader
  const btnAddFoto = document.getElementById('btnAddFoto');
  const fotoInput = document.getElementById('fotoInput');
  
  if (btnAddFoto) {
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

  // Guardar nota
  const btnGuardarNota = document.getElementById('btnGuardarNota');
  if (btnGuardarNota) btnGuardarNota.addEventListener('click', guardarNota);

  // WhatsApp: Avisar listo
  const btnWspListo = document.getElementById('btnWhatsappListo');
  if (btnWspListo) btnWspListo.addEventListener('click', enviarWhatsappListo);

  // WhatsApp: Confirmar entrega
  const btnWspEntrega = document.getElementById('btnWhatsappEntrega');
  if (btnWspEntrega) btnWspEntrega.addEventListener('click', enviarWhatsappEntrega);

  // Eliminar
  const btnEliminar = document.getElementById('btnEliminar');
  if (btnEliminar) btnEliminar.addEventListener('click', eliminarOrden);
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

  haptic(20);
  showLoading('Actualizando estado...');

  try {
    const entrada = {
      tipo: 'estado',
      texto: `Estado cambiado a: ${ESTADOS[nuevoEstado].texto}`,
      autor: sesion.nombre,
      fecha: new Date().toISOString()
    };

    const updateData = {
      estadoOrden: nuevoEstado,
      bitacora: arrayUnion(entrada),
      actualizadoEn: serverTimestamp()
    };

    // Si es la primera vez que se entrega, guardar fecha
    if (nuevoEstado === 'entregado' && !orden.fechaEntrega) {
      updateData.fechaEntrega = serverTimestamp();
    }

    await updateDoc(doc(db, 'recibos', ordenId), updateData);

    orden.estadoOrden = nuevoEstado;
    orden.bitacora = [...(orden.bitacora || []), entrada];
    if (nuevoEstado === 'entregado' && !orden.fechaEntrega) {
      orden.fechaEntrega = new Date();
    }

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

  const mensaje = `Hola ${(orden.cliente || '').split(' ')[0]},

Buenas noticias: su ${orden.marca || ''} ${orden.modelo || ''} ya está LISTO para retirar.

🔧 Servicios realizados:
${serviciosTexto}

💰 Total: ${formatBs(orden.total || 0)}
${Number(orden.saldo) > 0 ? `💵 Saldo pendiente: ${formatBs(orden.saldo)}` : ''}

📍 ${CONFIG.nombreTienda}
   ${CONFIG.direccion}
   ${CONFIG.horario}
   Tel: ${CONFIG.telefono}

¡Le esperamos!`;

  const tel = orden.telefono.replace(/\D/g, '');
  const url = `https://wa.me/591${tel}?text=${encodeURIComponent(mensaje)}`;
  window.open(url, '_blank');

  // Registrar en bitácora
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

  const mensaje = `Hola ${(orden.cliente || '').split(' ')[0]},

Confirmamos la entrega de su ${orden.marca || ''} ${orden.modelo || ''}.

📄 N° Recibo: ${orden.numeroRecibo || '-'}
📅 Fecha de entrega: ${fechaEntrega}

${Number(orden.saldo) === 0 && Number(orden.total) > 0 ? `💰 Total pagado: ${formatBs(orden.total)}\n` : ''}
Gracias por confiar en nosotros.
Cualquier consulta:
Tel: ${CONFIG.telefono}

${CONFIG.nombreTienda}
${CONFIG.web}`;

  const tel = orden.telefono.replace(/\D/g, '');
  const url = `https://wa.me/591${tel}?text=${encodeURIComponent(mensaje)}`;
  window.open(url, '_blank');

  // Registrar en bitácora
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
      texto: texto || '📷 Foto añadida',
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
