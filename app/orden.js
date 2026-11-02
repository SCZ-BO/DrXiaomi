// /app/orden.js - PARTE 1
import { requireAuth, logout } from './js/app-auth.js'; 
import { toast, haptic, escapeHtml, formatBs, tiempoRelativo, initTheme } from './js/app-ui.js';
import { db } from './js/firebase.js';
import { doc, updateDoc, deleteDoc, serverTimestamp, arrayUnion, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

initTheme();

const CONFIG = { nombreTienda: 'DR. XIAOMI SCZ', urlApp: 'https://xiaomi.scz.red' };
const ESTADOS = {
  recibido: { texto: 'Recibido', icono: 'fa-box' },
  reparacion: { texto: 'En reparación', icono: 'fa-screwdriver-wrench' },
  'espera-repuesto': { texto: 'Esperando repuesto', icono: 'fa-clock' },
  listo: { texto: 'Listo para entregar', icono: 'fa-check-circle' },
  entregado: { texto: 'Entregado', icono: 'fa-handshake' },
  devuelto: { texto: 'Devuelto', icono: 'fa-rotate-left' }
};
const ESTADO_COLORES = { 'recibido': '#9CA3AF', 'reparacion': '#FF6900', 'espera-repuesto': '#8B5CF6', 'listo': '#FBBF24', 'entregado': '#10B981', 'devuelto': '#3B82F6' };

let sesion = null, ordenId = null, orden = null, fotosNuevas = [], unsubscribe = null;

// 1. LAYOUT (Header)
document.getElementById('btnSalir').addEventListener('click', () => { if(confirm('¿Cerrar sesión?')) logout(); });
document.getElementById('themeToggle').addEventListener('click', () => {
  const act = document.documentElement.getAttribute('data-theme'), nue = act === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', nue); localStorage.setItem('theme', nue);
});
document.getElementById('backBtn').addEventListener('click', () => window.location.href = '/app/');

// 2. INICIO
requireAuth((s) => { 
  sesion = s; 
  const params = new URLSearchParams(window.location.search);
  ordenId = params.get('id');
  if (!ordenId) { window.location.href = '/app/'; return; }
  cargarOrden();
});

function cargarOrden() {
  const ref = doc(db, 'recibos', ordenId);
  unsubscribe = onSnapshot(ref, (snap) => {
    if (!snap.exists()) { window.location.href = '/app/'; return; }
    orden = { id: snap.id, ...snap.data() };
    renderOrden();
    document.getElementById('appLoader').classList.remove('show');
  }, (error) => {
    toast('Error al cargar orden', 'error'); window.location.href = '/app/';
  });
}

function calcularTotalesDesdeServicios(servicios, adelanto) {
  const total = (Array.isArray(servicios) ? servicios : []).reduce((acc, s) => acc + (Number(s.costo) || 0), 0);
  const saldo = total - (Number(adelanto) || 0);
  return { total, saldo };
}

// 3. RENDERIZADO PRINCIPAL
function renderOrden() {
  const estadoActual = orden.estadoOrden || 'recibido';
  const estadoInfo = ESTADOS[estadoActual] || ESTADOS.recibido;
  
  document.getElementById('headerTitle').textContent = orden.numeroRecibo || 'ORDEN';
  document.getElementById('headerSubtitle').textContent = `${estadoInfo.texto} · ${tiempoRelativo(orden.fechaEditada || orden.fecha)}`;

  const cont = document.getElementById('contenido');
  const serviciosArr = Array.isArray(orden.servicios) ? orden.servicios : [];
  
  const estadosBotones = Object.entries(ESTADOS).map(([key, info]) => `
    <button class="estado-btn ${key === estadoActual ? 'activo' : ''}" data-estado="${key}">
      <i class="fas ${info.icono}"></i><span>${info.texto}</span>
    </button>
  `).join('');

  const serviciosHtml = serviciosArr.length > 0 ? serviciosArr.map((s, idx) => `
    <tr>
      <td>${escapeHtml(s.desc)}</td>
      <td>${formatBs(s.costo)}</td>
      <td style="text-align:right; width:80px;">
        ${sesion.rol === 'admin' ? `
          <button class="icon-btn" style="width:28px; height:28px; display:inline-flex;" data-edit-serv="${idx}"><i class="fas fa-pen" style="font-size:10px;"></i></button>
          <button class="icon-btn" style="width:28px; height:28px; display:inline-flex; color:var(--danger-500);" data-del-serv="${idx}"><i class="fas fa-trash" style="font-size:10px;"></i></button>
        ` : ''}
      </td>
    </tr>
  `).join('') : '<tr><td colspan="3" style="text-align:center; color:var(--text-3);">Sin servicios registrados</td></tr>';

  cont.innerHTML = `
    <div class="card card-accent" style="border-left-color: ${ESTADO_COLORES[estadoActual]};">
      <div class="card-header"><div class="card-title">📋 Detalle del Recibo</div></div>
      <div class="recibo-row"><span>Cliente</span><span>${escapeHtml(orden.cliente || '-')}</span></div>
      <div class="recibo-row"><span>Teléfono</span><span style="color:var(--brand-500);">${escapeHtml(orden.telefono || '-')}</span></div>
      <div class="recibo-row"><span>Equipo</span><span>${escapeHtml(orden.marca || '')} ${escapeHtml(orden.modelo || '')}</span></div>
      
      <table class="tabla-servicios">
        <thead><tr><th>Servicio</th><th style="text-align:right;">Costo</th><th></th></tr></thead>
        <tbody>${serviciosHtml}</tbody>
      </table>
      
      <button class="btn btn-secondary" id="btnAgregarServicio" style="width: 100%; margin-top: 12px; border-style: dashed; color: var(--brand-500); border-color: var(--brand-500);">
        <i class="fas fa-plus"></i> Agregar servicio
      </button>

      <div class="total-box"><span style="color:var(--text-3);">Total</span><strong>${formatBs(orden.total || 0)}</strong></div>
      <div class="total-box" style="background:var(--brand-light); margin-top:8px;"><span style="color:var(--brand-500); font-weight:700;">SALDO A PAGAR</span><strong style="color:var(--brand-500);">${formatBs(orden.saldo || 0)}</strong></div>
    </div>

    <div class="card">
      <div class="card-title">📱 Acciones</div>
      <div style="display:flex; gap:12px; margin-top:12px;">
        <button class="btn btn-whatsapp" id="btnContactar" style="flex:1;"><i class="fab fa-whatsapp"></i> Contactar</button>
        <button class="btn btn-primary" id="btnRegenerarPDF" style="flex:1;"><i class="fas fa-file-pdf"></i> Enviar PDF</button>
      </div>
    </div>

    <div class="card">
      <div class="card-title">🔄 Cambiar estado</div>
      <div class="estados-grid" style="margin-top:12px;">${estadosBotones}</div>
    </div>

    <div class="card">
      <div class="card-title">📋 Bitácora</div>
      <div style="margin-top: 12px; display: flex; gap: 8px;">
        <input type="text" id="nuevaNota" class="input-field" placeholder="Escribe una nota..." style="flex:1;">
        <button id="btnGuardarNota" class="btn btn-primary"><i class="fas fa-plus"></i></button>
      </div>
      <div id="historialBitacora" style="margin-top: 16px;">${renderBitacora()}</div>
    </div>

    ${sesion.rol === 'admin' ? `
      <div class="card" style="border-color: rgba(239,68,68,0.3);">
        <div class="card-title" style="color:#EF4444;">⚙️ Admin</div>
        <button id="btnEliminar" class="btn btn-danger" style="width: 100%; margin-top: 8px;"><i class="fas fa-trash"></i> Eliminar orden</button>
      </div>
    ` : ''}
  `;

  configurarEventosOrden();
}
// /app/orden.js - PARTE 2

// 4. EVENTOS Y MODALES
function configurarEventosOrden() {
  document.querySelectorAll('.estado-btn').forEach(btn => {
    btn.addEventListener('click', () => cambiarEstado(btn.dataset.estado));
  });

  document.getElementById('btnGuardarNota')?.addEventListener('click', guardarNota);
  document.getElementById('btnContactar')?.addEventListener('click', contactarCliente);
  document.getElementById('btnEliminar')?.addEventListener('click', eliminarOrden);
  document.getElementById('btnRegenerarPDF')?.addEventListener('click', () => { haptic(15); regenerarYEnviarPDF(); });
  
  document.getElementById('btnAgregarServicio')?.addEventListener('click', () => abrirModalServicio());

  document.querySelectorAll('[data-edit-serv]').forEach(btn => {
    btn.addEventListener('click', () => abrirModalServicio(parseInt(btn.dataset.editServ, 10)));
  });
  
  document.querySelectorAll('[data-del-serv]').forEach(btn => {
    btn.addEventListener('click', () => eliminarServicio(parseInt(btn.dataset.delServ, 10)));
  });

  // Visor de imágenes
  document.querySelectorAll('[data-ver-img]').forEach(img => {
    img.addEventListener('click', () => {
      haptic(10);
      document.getElementById('imgViewerImg').src = img.dataset.verImg;
      document.getElementById('imgViewer').classList.add('show');
    });
  });

  const viewer = document.getElementById('imgViewer');
  if (viewer && !viewer.dataset.listenersAdded) {
    viewer.dataset.listenersAdded = 'true';
    document.getElementById('imgViewerCerrar').addEventListener('click', () => viewer.classList.remove('show'));
    viewer.addEventListener('click', (e) => { if (e.target === viewer) viewer.classList.remove('show'); });
  }
}

function renderBitacora() {
  const bitacora = Array.isArray(orden.bitacora) ? orden.bitacora : [];
  const ordenada = [...bitacora].sort((a, b) => (b.fecha ? new Date(b.fecha) : 0) - (a.fecha ? new Date(a.fecha) : 0));

  if (ordenada.length === 0) return `<div style="text-align:center; padding:20px; color:var(--text-3); font-size:13px;">No hay entradas en la bitácora.</div>`;

  return ordenada.map(entry => {
    let icono = 'fa-sticky-note', color = '';
    if (entry.tipo === 'estado') { icono = 'fa-exchange-alt'; color = 'color:#3B82F6;'; }
    else if (entry.tipo === 'foto') { icono = 'fa-camera'; color = 'color:#8B5CF6;'; }
    else if (entry.tipo === 'whatsapp') { icono = 'fa-whatsapp'; color = 'color:#25D366;'; }
    else if (entry.tipo === 'cobro') { icono = 'fa-money-bill-wave'; color = 'color:#10B981;'; }
    else if (entry.tipo === 'servicio') { icono = 'fa-screwdriver-wrench'; color = 'color:#F59E0B;'; }

    return `<div class="bitacora-item">
      <div class="bitacora-icono" style="${color} background: color-mix(in srgb, currentColor 15%, transparent);"><i class="fas ${icono}"></i></div>
      <div class="bitacora-content">
        <div class="bitacora-header"><span class="bitacora-autor">${escapeHtml(entry.autor || 'Sistema')}</span><span class="bitacora-fecha">${tiempoRelativo(entry.fecha)}</span></div>
        <div class="bitacora-texto">${escapeHtml(entry.texto || '')}</div>
      </div>
    </div>`;
  }).join('');
}

// 5. LÓGICA DE SERVICIOS
function abrirModalServicio(idxEditar = null) {
  haptic(15);
  const esEdicion = idxEditar !== null;
  const servicios = Array.isArray(orden.servicios) ? orden.servicios : [];
  const actual = esEdicion ? servicios[idxEditar] : null;

  const backdrop = document.getElementById('modalServicioBackdrop');
  document.getElementById('modalServicioTitulo').textContent = esEdicion ? 'Editar servicio' : 'Agregar servicio';
  document.getElementById('servicioDescripcion').value = actual ? actual.desc : '';
  document.getElementById('servicioCosto').value = actual ? Number(actual.costo).toFixed(2) : '';
  
  backdrop.classList.add('show');

  const btnCancelar = document.getElementById('modalServicioCancelar');
  const btnGuardar = document.getElementById('modalServicioGuardar');
  const newBtnCancelar = btnCancelar.cloneNode(true);
  const newBtnGuardar = btnGuardar.cloneNode(true);
  btnCancelar.parentNode.replaceChild(newBtnCancelar, btnCancelar);
  btnGuardar.parentNode.replaceChild(newBtnGuardar, btnGuardar);

  const cerrarModal = () => backdrop.classList.remove('show');
  newBtnCancelar.addEventListener('click', cerrarModal);

  newBtnGuardar.addEventListener('click', async () => {
    const desc = (document.getElementById('servicioDescripcion').value || '').trim();
    const costo = parseFloat(document.getElementById('servicioCosto').value) || 0;
    if (!desc) { toast('Escribe una descripción', 'error'); return; }
    await guardarServicio(idxEditar, { desc, costo });
    cerrarModal();
  });
}

async function guardarServicio(idxEditar, { desc, costo }) {
  haptic(20);
  try {
    const servicios = Array.isArray(orden.servicios) ? [...orden.servicios] : [];
    let textoBitacora = '';

    if (idxEditar !== null) {
      const anterior = servicios[idxEditar];
      servicios[idxEditar] = { desc, costo };
      textoBitacora = `Servicio editado: "${anterior.desc}" → "${desc}"`;
    } else {
      servicios.push({ desc, costo });
      textoBitacora = `Servicio agregado: "${desc}" (Bs. ${costo})`;
    }

    const { total, saldo } = calcularTotalesDesdeServicios(servicios, orden.adelanto);
    const entrada = { tipo: 'servicio', texto: textoBitacora, autor: sesion.nombre, fecha: new Date().toISOString() };

    await updateDoc(doc(db, 'recibos', ordenId), {
      servicios, total, saldo, bitacora: arrayUnion(entrada), actualizadoEn: serverTimestamp()
    });
    toast('Servicio guardado', 'success');
  } catch (err) { toast('Error al guardar', 'error'); }
}

async function eliminarServicio(idx) {
  if (sesion.rol !== 'admin') return;
  haptic(15);
  const servicios = Array.isArray(orden.servicios) ? [...orden.servicios] : [];
  const servicio = servicios[idx];
  if (!servicio || !confirm(`¿Eliminar el servicio "${servicio.desc}"?`)) return;

  try {
    servicios.splice(idx, 1);
    const { total, saldo } = calcularTotalesDesdeServicios(servicios, orden.adelanto);
    const entrada = { tipo: 'servicio', texto: `Servicio eliminado: "${servicio.desc}"`, autor: sesion.nombre, fecha: new Date().toISOString() };

    await updateDoc(doc(db, 'recibos', ordenId), {
      servicios, total, saldo, bitacora: arrayUnion(entrada), actualizadoEn: serverTimestamp()
    });
    toast('Servicio eliminado', 'success');
  } catch (err) { toast('Error al eliminar', 'error'); }
}
// /app/orden.js - PARTE 3

// 6. OTRAS ACCIONES
function contactarCliente() {
  if (!orden.telefono) { toast('La orden no tiene teléfono', 'error'); return; }
  haptic(15);
  const nombreCliente = (orden.cliente || '').split(' ')[0] || 'cliente';
  const mensaje = `Hola ${nombreCliente}, le escribimos de ${CONFIG.nombreTienda} en relación a su ${orden.marca} ${orden.modelo} (Recibo ${orden.numeroRecibo}).`;
  window.open(`https://wa.me/591${orden.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(mensaje)}`, '_blank');
}

async function guardarNota() {
  const notaInput = document.getElementById('nuevaNota');
  const texto = (notaInput.value || '').trim();
  if (!texto) return;

  haptic(15);
  try {
    const entrada = { tipo: 'nota', texto, autor: sesion.nombre, fecha: new Date().toISOString() };
    await updateDoc(doc(db, 'recibos', ordenId), { bitacora: arrayUnion(entrada), actualizadoEn: serverTimestamp() });
    notaInput.value = '';
    toast('Nota guardada', 'success');
  } catch (err) { toast('Error al guardar', 'error'); }
}

async function cambiarEstado(nuevoEstado) {
  if (nuevoEstado === (orden.estadoOrden || 'recibido')) return;
  haptic(20);
  try {
    const entrada = { tipo: 'estado', texto: `Estado cambiado a: ${ESTADOS[nuevoEstado].texto}`, autor: sesion.nombre, fecha: new Date().toISOString() };
    await updateDoc(doc(db, 'recibos', ordenId), { estadoOrden: nuevoEstado, bitacora: arrayUnion(entrada), actualizadoEn: serverTimestamp() });
    toast('Estado actualizado', 'success');
  } catch (err) { toast('Error al cambiar estado', 'error'); }
}

async function eliminarOrden() {
  if (sesion.rol !== 'admin') return;
  if (!confirm('¿Eliminar esta orden permanentemente?')) return;
  haptic(20);
  try {
    await deleteDoc(doc(db, 'recibos', ordenId));
    toast('Orden eliminada', 'success');
    setTimeout(() => window.location.href = '/app/', 1000);
  } catch (err) { toast('Error al eliminar', 'error'); }
}

// 7. GENERACIÓN DE PDF
async function regenerarYEnviarPDF() {
  if (!orden.telefono) { toast('La orden no tiene teléfono', 'error'); return; }
  toast('Generando PDF...', 'info');
  
  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, H = 297, M = 15, CW = W - M * 2;
    let y = 0;

    // Encabezado
    pdf.setFillColor(230, 81, 0); pdf.rect(0, 0, W, 40, 'F');
    pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(22); pdf.text('DR. XIAOMI SCZ', M + 10, 16);
    pdf.setFontSize(9); pdf.setFont('helvetica', 'normal'); pdf.text('Servicio Técnico Especializado', M + 10, 22);
    pdf.setFontSize(8); pdf.text(`Centro Comercial Cañoto #K1 · Tel: 75959450`, M + 10, 28);

    pdf.setFillColor(255, 255, 255); pdf.roundedRect(W - M - 60, 8, 60, 24, 3, 3, 'F');
    pdf.setTextColor(230, 81, 0); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.text('RECIBO N°', W - M - 4, 14, { align: 'right' });
    pdf.setFontSize(11); pdf.text(orden.numeroRecibo || '-', W - M - 4, 20, { align: 'right' });

    y = 50;
    const colW = (CW - 6) / 2;
    
    // Datos del Cliente
    pdf.setFillColor(248, 248, 248); pdf.roundedRect(M, y, colW, 30, 3, 3, 'F');
    pdf.setTextColor(230, 81, 0); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.text('CLIENTE', M + 5, y + 7);
    pdf.setTextColor(30, 30, 30); pdf.setFontSize(12); pdf.text((orden.cliente || '').slice(0, 25), M + 5, y + 15);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(100, 100, 100); pdf.text(`Tel: ${orden.telefono || ''}`, M + 5, y + 23);

    // Datos del Equipo
    pdf.setFillColor(248, 248, 248); pdf.roundedRect(M + colW + 6, y, colW, 30, 3, 3, 'F');
    pdf.setTextColor(230, 81, 0); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.text('EQUIPO', M + colW + 11, y + 7);
    pdf.setTextColor(30, 30, 30); pdf.setFontSize(12); pdf.text(`${orden.marca || ''} ${orden.modelo || ''}`.slice(0, 25), M + colW + 11, y + 15);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(100, 100, 100); pdf.text(`Enciende: ${orden.enciende || ''}`, M + colW + 11, y + 23);

    y += 36;
    // Falla
    pdf.setFillColor(248, 248, 248); pdf.roundedRect(M, y, colW, 30, 3, 3, 'F');
    pdf.setTextColor(230, 81, 0); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.text('ESTADO / FALLA', M + 5, y + 7);
    pdf.setTextColor(100, 100, 100); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.text(pdf.splitTextToSize(orden.falla || '-', colW - 10), M + 5, y + 14);

    // Clave
    pdf.setFillColor(248, 248, 248); pdf.roundedRect(M + colW + 6, y, colW, 30, 3, 3, 'F');
    pdf.setTextColor(230, 81, 0); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.text('CLAVE DE ACCESO', M + colW + 11, y + 7);
    pdf.setTextColor(30, 30, 30); pdf.setFontSize(12); let segInfo = orden.tipoSeguridad === 'pin' ? `PIN: ${orden.pin}` : (orden.patron ? `Patrón: ${orden.patron.split(',').join('-')}` : 'Sin clave'); pdf.text(segInfo.slice(0, 25), M + colW + 11, y + 17);

    y += 36;
    // Tabla de servicios
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
    toast('Error al generar el PDF', 'error');
  }
}
// /app/orden.js - PARTE 4 (Lógica de Cobro y Extras)

// 8. MODAL DE COBRO (Cuando se cambia a Entregado)
async function cambiarEstado(nuevoEstado) {
  if (nuevoEstado === (orden.estadoOrden || 'recibido')) return;
  
  if (nuevoEstado === 'entregado') {
    abrirModalCobro(); // Si es entregado, abrimos el modal de cobro
    return;
  }

  haptic(20);
  try {
    const entrada = { tipo: 'estado', texto: `Estado cambiado a: ${ESTADOS[nuevoEstado].texto}`, autor: sesion.nombre, fecha: new Date().toISOString() };
    await updateDoc(doc(db, 'recibos', ordenId), { estadoOrden: nuevoEstado, bitacora: arrayUnion(entrada), actualizadoEn: serverTimestamp() });
    toast('Estado actualizado', 'success');
  } catch (err) { toast('Error al cambiar estado', 'error'); }
}

function abrirModalCobro() {
  haptic(15);
  const total = Number(orden.total) || 0;
  const saldo = Number(orden.saldo) || 0;
  const montoSugerido = saldo > 0 ? saldo : total;

  const modal = document.createElement('div');
  modal.className = 'sheet-backdrop show'; // Usamos las clases de tu nuevo diseño
  modal.style.display = 'flex';
  
  modal.innerHTML = `
    <div class="sheet">
      <div class="sheet-handle"></div>
      <h3 style="font-size: 20px; font-weight: 800; color: var(--brand-500); margin-bottom: 8px;">✅ Confirmar entrega</h3>
      <p style="margin-bottom:20px; font-size:14px;"><strong>${escapeHtml(orden.cliente)}</strong><br><span style="font-size:12px; color:var(--text-3);">Total: ${formatBs(total)}${saldo > 0 && saldo !== total ? ` · Saldo: ${formatBs(saldo)}` : ''}</span></p>
      
      <div class="field">
        <label class="input-label">Monto cobrado</label>
        <input type="number" id="inputMonto" class="input-field" step="0.01" min="0" value="${montoSugerido.toFixed(2)}" inputmode="decimal" style="text-align:center; font-size:18px; font-weight:700;">
      </div>

      <div class="field">
        <label class="input-label">Método de pago</label>
        <div id="metodosPago" style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <button type="button" class="btn btn-secondary metodo-btn" data-metodo="Efectivo" style="flex-direction:column; padding:14px 10px;"><i class="fas fa-money-bill-wave" style="font-size:22px; color:#10B981;"></i><span>Efectivo</span></button>
          <button type="button" class="btn btn-secondary metodo-btn" data-metodo="QR" style="flex-direction:column; padding:14px 10px;"><i class="fas fa-qrcode" style="font-size:22px; color:#3B82F6;"></i><span>QR</span></button>
          <button type="button" class="btn btn-secondary metodo-btn" data-metodo="Transferencia" style="flex-direction:column; padding:14px 10px;"><i class="fas fa-building-columns" style="font-size:22px; color:#8B5CF6;"></i><span>Transf.</span></button>
          <button type="button" class="btn btn-secondary metodo-btn" data-metodo="Mixto" style="flex-direction:column; padding:14px 10px;"><i class="fas fa-shuffle" style="font-size:22px; color:#F59E0B;"></i><span>Mixto</span></button>
        </div>
        <div id="detalleMixtoContainer" style="display:none; margin-top:10px;">
          <input type="text" id="detalleMixto" class="input-field" placeholder="Ej: 200 efectivo + 150 QR" maxlength="100">
        </div>
        <div id="errorMetodo" style="color:#EF4444; font-size:12px; margin-top:8px; display:none;"></div>
      </div>

      <div style="display:flex; gap:8px; margin-top:20px;">
        <button type="button" id="btnCancelarCobro" class="btn btn-secondary" style="flex:1;">Cancelar</button>
        <button type="button" id="btnConfirmarCobro" class="btn btn-primary" style="flex:1;"><i class="fas fa-check"></i> Confirmar</button>
      </div>
    </div>`;

  document.body.appendChild(modal);

  let metodoSeleccionado = null;
  modal.querySelectorAll('.metodo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      haptic(8);
      modal.querySelectorAll('.metodo-btn').forEach(b => { b.classList.remove('btn-primary'); b.classList.add('btn-secondary'); });
      btn.classList.remove('btn-secondary'); btn.classList.add('btn-primary');
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

    modal.classList.remove('show'); setTimeout(() => modal.remove(), 300);
    await confirmarCobro(monto, metodoFinal);
  });
}

async function confirmarCobro(monto, metodo) {
  haptic(20);
  try {
    const entrada = { tipo: 'estado', texto: `Estado cambiado a: Entregado · Cobrado: ${formatBs(monto)} (${metodo})`, autor: sesion.nombre, fecha: new Date().toISOString() };
    await updateDoc(doc(db, 'recibos', ordenId), { estadoOrden: 'entregado', fechaEntrega: serverTimestamp(), montoCobrado: monto, metodoPago: metodo, bitacora: arrayUnion(entrada), actualizadoEn: serverTimestamp() });
    toast(`Entregado · ${formatBs(monto)}`, 'success');
  } catch (err) { toast('Error al registrar entrega', 'error'); }
}
