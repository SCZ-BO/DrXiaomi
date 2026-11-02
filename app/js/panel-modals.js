// /app/js/panel-modals.js
import { toast, haptic, escapeHtml } from './app-ui.js';
import { db } from './firebase.js';
import { doc, updateDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
// 🔥 IMPORTAMOS EL ESTADO Y FUNCIONES DEL PANEL PRINCIPAL
import { appState, parsearFecha, formatBsLimpio, cerrarSheet } from './panel.js';

let ordenAEntregar = null;
let metodoPagoSeleccionado = null;

// ==========================================
// MODAL 1: DETALLE DEL TELÉFONO
// ==========================================
export function abrirSheetTelefono(id) {
  const orden = appState.ordenes.find(o => o.id === id); 
  if (!orden) return;
  
  const reciboSheet = document.getElementById('reciboSheet');
  const sheetContent = document.getElementById('sheetContent');
  const esAdmin = appState.sesion?.rol === 'admin';
  
  const opciones = `
    <option value="recibido" ${orden.estadoOrden === 'recibido' ? 'selected' : ''}>📦 Recibido</option>
    <option value="reparacion" ${orden.estadoOrden === 'reparacion' ? 'selected' : ''}>🔧 En reparación</option>
    <option value="espera-repuesto" ${orden.estadoOrden === 'espera-repuesto' ? 'selected' : ''}>⏳ Esperando repuesto</option>
    <option value="listo" ${orden.estadoOrden === 'listo' ? 'selected' : ''}>✅ Listo para entregar</option>
    <option value="entregado" ${orden.estadoOrden === 'entregado' ? 'selected' : ''}>🤝 Entregado</option>
    <option value="devuelto" ${orden.estadoOrden === 'devuelto' ? 'selected' : ''}>↩️ Devuelto</option>
  `;
  
  const btnEliminarHtml = esAdmin ? `<button class="btn btn-danger btn-block" id="btnEliminar" style="margin-top: 8px;"><i class="fas fa-trash"></i> Eliminar</button>` : '';

  sheetContent.innerHTML = `
    <div style="margin-bottom: 24px;">
      <h3 style="font-size: 24px; font-weight: 800; color: var(--text-1); margin: 0 0 4px 0; letter-spacing: -0.5px;">${escapeHtml(orden.numeroRecibo)}</h3>
      <p style="font-size: 15px; color: var(--text-3); margin: 0;">${escapeHtml(orden.cliente)} · ${escapeHtml(orden.marca)} ${escapeHtml(orden.modelo)}</p>
    </div>
    <button class="btn btn-secondary btn-block" style="margin-bottom: 12px;" id="btnEditarOrden"><i class="fas fa-edit"></i> Abrir Orden Completa</button>
    <div class="field" style="margin-bottom: 16px;">
      <label class="input-label">Estado del Equipo</label>
      <select id="selectEstado" class="input-field">${opciones}</select>
    </div>
    <button class="btn btn-primary btn-block" id="btnActualizarEstado" style="margin-bottom: 8px;"><i class="fas fa-check"></i> Guardar Estado</button>
    <button class="btn btn-whatsapp btn-block" id="btnWhatsApp" style="margin-bottom: 8px;"><i class="fab fa-whatsapp"></i> WhatsApp</button>
    ${btnEliminarHtml}
  `;

  reciboSheet.classList.add('show'); 
  haptic(15);

  document.getElementById('btnEditarOrden')?.addEventListener('click', () => { 
    window.location.href = `/app/orden.html?id=${id}`; 
  });

  document.getElementById('btnActualizarEstado')?.addEventListener('click', async () => {
    const nuevoEstado = document.getElementById('selectEstado').value;
    if (nuevoEstado === 'entregado') { 
      cerrarSheet(); 
      abrirModalPago(orden); 
      return; 
    }
    try {
      await updateDoc(doc(db, 'recibos', id), { estadoOrden: nuevoEstado });
      toast('Estado actualizado', 'success'); cerrarSheet();
      if (nuevoEstado === 'listo' && orden.telefono) {
        setTimeout(() => {
          if (confirm(`El equipo está listo. ¿Deseas avisar a ${orden.cliente.split(' ')[0]} por WhatsApp?`)) {
            const mensaje = `¡Hola ${orden.cliente.split(' ')[0]}! 🎉\n\nTu equipo *${orden.marca} ${orden.modelo}* ya está listo para retirar.\n\nN° Recibo: ${orden.numeroRecibo}\nSaldo: Bs. ${orden.saldo}\n\n- DR. XIAOMI SCZ`;
            window.open(`https://wa.me/591${orden.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(mensaje)}`, '_blank');
          }
        }, 500);
      }
    } catch (err) { toast('Error al actualizar', 'error'); }
  });

  document.getElementById('btnWhatsApp')?.addEventListener('click', () => {
    const urlRecibo = `${window.location.origin}/recibo/?id=${orden.numeroRecibo}`;
    const mensaje = `Hola ${orden.cliente.split(' ')[0]}, tu equipo *${orden.marca} ${orden.modelo}* ya está en nuestro taller.\n\n📄 *Recibo:*\n${urlRecibo}\n\n¡Gracias! - DR. XIAOMI`;
    window.open(`https://wa.me/591${orden.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(mensaje)}`, '_blank');
    cerrarSheet();
  });

  document.getElementById('btnEliminar')?.addEventListener('click', async () => {
    if (confirm('¿Eliminar este recibo permanentemente?')) {
      try { await deleteDoc(doc(db, 'recibos', id)); toast('Recibo eliminado', 'success'); cerrarSheet(); }
      catch (err) { toast('Error al eliminar', 'error'); }
    }
  });
}

// ==========================================
// MODAL 2: CONFIRMAR ENTREGA Y COBRO
// ==========================================
function abrirModalPago(orden) {
  ordenAEntregar = orden; 
  metodoPagoSeleccionado = null;
  
  const modalPago = document.getElementById('modalPago');
  document.getElementById('pagoMonto').value = orden.saldo > 0 ? orden.saldo : orden.total;
  document.querySelectorAll('#metodosPagoGrid [data-metodo]').forEach(b => { b.classList.remove('btn-primary'); b.classList.add('btn-secondary'); });
  
  modalPago.classList.add('show'); haptic(15);

  document.getElementById('metodosPagoGrid').onclick = (e) => {
    const btn = e.target.closest('[data-metodo]'); if (!btn) return;
    haptic(10);
    document.querySelectorAll('#metodosPagoGrid [data-metodo]').forEach(b => { b.classList.remove('btn-primary'); b.classList.add('btn-secondary'); });
    btn.classList.remove('btn-secondary'); btn.classList.add('btn-primary');
    metodoPagoSeleccionado = btn.dataset.metodo;
  };

  document.getElementById('btnConfirmarPago').onclick = async () => {
    const monto = parseFloat(document.getElementById('pagoMonto').value);
    if (!metodoPagoSeleccionado) { toast('Selecciona un método de pago', 'error'); return; }
    if (!monto || monto <= 0) { toast('Ingresa un monto válido', 'error'); return; }
    haptic(20);
    try {
      await updateDoc(doc(db, 'recibos', ordenAEntregar.id), {
        estadoOrden: 'entregado', fechaEntrega: serverTimestamp(), montoCobrado: monto, metodoPago: metodoPagoSeleccionado
      });
      toast('Equipo entregado y cobrado', 'success'); modalPago.classList.remove('show');
    } catch (err) { toast('Error al entregar', 'error'); }
  };
  
  document.getElementById('btnClosePago').onclick = () => modalPago.classList.remove('show');
}

// ==========================================
// MODAL 3: DETALLE DE VENTA
// ==========================================
export function abrirSheetVenta(id, origen, extra) {
  const venta = appState.ventasHoy.find(v => v.id === id && (v.indexExtra || '') === extra);
  if (!venta) return;
  
  const reciboSheet = document.getElementById('reciboSheet');
  const sheetContent = document.getElementById('sheetContent');
  const f = parsearFecha(venta.fecha); 
  const hora = f ? `${String(f.getHours()).padStart(2,'0')}:${String(f.getMinutes()).padStart(2,'0')}` : '';
  const esAdmin = appState.sesion?.rol === 'admin';
  const btnEliminarHtml = esAdmin ? `<button class="btn btn-danger btn-block" id="btnEliminarVenta" style="margin-top: 8px;"><i class="fas fa-trash"></i> Eliminar</button>` : '';

  sheetContent.innerHTML = `
    <div style="margin-bottom: 24px;">
      <h3 style="font-size: 24px; font-weight: 800; color: var(--success-500); margin: 0 0 4px 0;">${escapeHtml(venta.concepto)}</h3>
      <p style="font-size: 15px; color: var(--text-3); margin: 0;">${formatBsLimpio(venta.monto)} · ${hora} · ${escapeHtml(venta.metodoPago)}</p>
    </div>
    ${origen === 'panel' && esAdmin ? `<button class="btn btn-secondary btn-block" id="btnEditarVenta" style="margin-bottom: 8px;"><i class="fas fa-edit"></i> Editar Venta</button>` : ''}
    ${btnEliminarHtml}
  `;
  
  reciboSheet.classList.add('show'); haptic(15);

  if (origen === 'panel' && esAdmin) {
    document.getElementById('btnEditarVenta')?.addEventListener('click', () => { cerrarSheet(); abrirModalEditarVenta(venta); });
  }
  
  document.getElementById('btnEliminarVenta')?.addEventListener('click', async () => {
    if (!confirm('¿Eliminar esta venta permanentemente?')) return;
    haptic(20);
    try {
      if (origen === 'panel') await deleteDoc(doc(db, 'ventas', id));
      else await deleteDoc(doc(db, 'cierres', id));
      toast('Eliminado', 'success'); cerrarSheet();
    } catch (err) { toast('Error al eliminar', 'error'); }
  });
}

// ==========================================
// MODAL 4: EDITAR VENTA
// ==========================================
export function abrirModalEditarVenta(venta) {
  const modal = document.createElement('div');
  modal.className = 'sheet-backdrop'; modal.id = 'modalEditarVenta'; modal.style.display = 'flex';
  const esAdmin = appState.sesion?.rol === 'admin';
  const campoCosto = esAdmin ? `<div class="field"><label class="input-label">Costo (Bs.)</label><input type="number" id="editCostoV" class="input-field" value="${venta.costo || 0}"></div>` : '';

  modal.innerHTML = `
    <div class="sheet">
      <div class="sheet-handle"></div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h3 style="font-size: 20px; font-weight: 800;">Editar Venta</h3>
        <button class="icon-btn" id="btnCloseEditV"><i class="fas fa-times"></i></button>
      </div>
      <div class="field"><label class="input-label">Concepto</label><input type="text" id="editConceptoV" class="input-field" value="${escapeHtml(venta.concepto)}"></div>
      <div class="field"><label class="input-label">Monto (Bs.)</label><input type="number" id="editMontoV" class="input-field" value="${venta.monto}"></div>
      ${campoCosto}
      <div class="field">
        <label class="input-label">Método de Pago</label>
        <select id="editMetodoV" class="input-field">
          <option value="Efectivo" ${venta.metodoPago === 'Efectivo' ? 'selected' : ''}>💵 Efectivo</option>
          <option value="QR" ${venta.metodoPago === 'QR' ? 'selected' : ''}>📱 QR</option>
        </select>
      </div>
      <button class="btn btn-primary btn-block" id="btnSaveEditV">Guardar Cambios</button>
    </div>
  `;
  
  document.body.appendChild(modal); setTimeout(() => modal.classList.add('show'), 10);

  const cerrar = () => { modal.classList.remove('show'); setTimeout(() => modal.remove(), 300); };
  document.getElementById('btnCloseEditV').addEventListener('click', cerrar);
  modal.addEventListener('click', (e) => { if (e.target === modal) cerrar(); });

  document.getElementById('btnSaveEditV').addEventListener('click', async () => {
    const nuevoConcepto = document.getElementById('editConceptoV').value.trim();
    const nuevoMonto = parseFloat(document.getElementById('editMontoV').value) || 0;
    const nuevoMetodo = document.getElementById('editMetodoV').value;
    const nuevoCosto = document.getElementById('editCostoV') ? (parseFloat(document.getElementById('editCostoV').value) || 0) : 0;
    haptic(20);
    try {
      await updateDoc(doc(db, 'ventas', venta.id), { concepto: nuevoConcepto, monto: nuevoMonto, costo: nuevoCosto, metodoPago: nuevoMetodo });
      toast('Venta actualizada', 'success'); cerrar();
    } catch (err) { toast('Error al actualizar', 'error'); }
  });
}
