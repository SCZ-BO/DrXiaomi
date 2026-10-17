/* ============================================================
   DR. XIAOMI · HISTORIAL DE RECIBOS
   Archivo: js/historial.js
   Descripción: Lista en tiempo real, filtros, búsqueda y acciones
   ============================================================ */

import { requireAuth, logout } from '/js/app-auth.js';
import { toast, haptic, initTheme, formatBs, escapeHtml, tiempoRelativo } from '/js/app-ui.js';
import { db } from '/js/firebase.js';
import { 
  collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, limit 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

initTheme();

let sesion = null;
let recibos = [];
let filtroActual = 'todos';
let busquedaActual = '';
let unsubscribe = null;

// Elementos del DOM
const listaRecibos = document.getElementById('listaRecibos');
const buscador = document.getElementById('buscador');
const filtros = document.getElementById('filtros');
const bottomSheet = document.getElementById('reciboSheet');
const sheetContent = document.getElementById('sheetContent');

// Iniciar
requireAuth((s) => {
  sesion = s;
  const userInfo = document.getElementById('userInfo');
  if (userInfo) userInfo.textContent = `${sesion.icono || ''} ${sesion.nombre}`;

  configurarEventos();
  cargarRecibos();
});

/* ============================================================
   EVENTOS BÁSICOS
   ============================================================ */
function configurarEventos() {
  document.getElementById('homeBtn')?.addEventListener('click', () => {
    haptic(10); window.location.href = '/app/';
  });

  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    haptic(15); if (confirm('¿Cerrar sesión?')) logout();
  });

  document.getElementById('nuevoReciboBtn')?.addEventListener('click', () => {
    haptic(15); window.location.href = '/cliente/';
  });

  // Buscador
  buscador?.addEventListener('input', (e) => {
    busquedaActual = e.target.value.toLowerCase().trim();
    renderizarLista();
  });

  // Filtros
  filtros?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filtro]');
    if (!btn) return;
    haptic(8);
    filtros.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    filtroActual = btn.dataset.filtro;
    renderizarLista();
  });

  // Cerrar Bottom Sheet
  document.getElementById('btnCloseSheet')?.addEventListener('click', cerrarSheet);
  bottomSheet?.addEventListener('click', (e) => {
    if (e.target === bottomSheet) cerrarSheet();
  });
}

/* ============================================================
   CARGAR DATOS DESDE FIRESTORE (TIEMPO REAL)
   ============================================================ */
function cargarRecibos() {
  const q = query(
    collection(db, 'recibos'),
    orderBy('fecha', 'desc'),
    limit(150) // Límite para no saturar si hay miles
  );

  unsubscribe = onSnapshot(q, 
    (snapshot) => {
      recibos = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));
      console.log(`📋 ${recibos.length} recibos cargados`);
      renderizarLista();
      actualizarStats();
    },
    (error) => {
      console.error('❌ Error cargando recibos:', error);
      if (listaRecibos) {
        listaRecibos.innerHTML = `
          <div class="empty-state">
            <i class="fas fa-exclamation-triangle" style="color: #EF4444;"></i>
            <h3>Error al cargar</h3>
            <p>${error.message}</p>
          </div>`;
      }
    }
  );
}

/* ============================================================
   RENDERIZAR LISTA
   ============================================================ */
function renderizarLista() {
  if (!listaRecibos) return;

  let filtrados = recibos;

  // Filtrar por estado
  if (filtroActual !== 'todos') {
    filtrados = filtrados.filter(r => (r.estadoOrden || 'recibido') === filtroActual);
  }

  // Filtrar por búsqueda
  if (busquedaActual) {
    filtrados = filtrados.filter(r => {
      const texto = [
        r.numeroRecibo, r.cliente, r.telefono, r.marca, r.modelo
      ].filter(Boolean).join(' ').toLowerCase();
      return texto.includes(busquedaActual);
    });
  }

  if (filtrados.length === 0) {
    listaRecibos.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-inbox"></i>
        <h3>No hay recibos</h3>
        <p>${busquedaActual ? 'Prueba con otra búsqueda' : 'Los recibos generados aparecerán aquí'}</p>
      </div>`;
    return;
  }

  listaRecibos.innerHTML = filtrados.map(r => renderCard(r)).join('');

  // Agregar eventos de clic a las tarjetas
  listaRecibos.querySelectorAll('.recibo-card').forEach(card => {
    card.addEventListener('click', () => {
      haptic(10);
      abrirSheet(card.dataset.id);
    });
  });
}

/* ============================================================
   TARJETA INDIVIDUAL
   ============================================================ */
function renderCard(r) {
  const estadoActual = r.estadoOrden || 'recibido';
  const estadoInfo = {
    recibido:          { clase: 'recibido',  texto: 'RECIBIDO',           emoji: '📦' },
    reparacion:        { clase: 'reparacion',texto: 'EN REPARACIÓN',      emoji: '🔧' },
    'espera-repuesto': { clase: 'espera',    texto: 'ESPERANDO REPUESTO', emoji: '⏳' },
    listo:             { clase: 'listo',     texto: 'LISTO PARA ENTREGAR',emoji: '✅' },
    entregado:         { clase: 'entregado', texto: 'ENTREGADO',          emoji: '🤝' },
    devuelto:          { clase: 'devuelto',  texto: 'DEVUELTO',           emoji: '↩️' },
    cancelado:         { clase: 'cancelado', texto: 'CANCELADO',          emoji: '⛔' }
  }[estadoActual] || { clase: 'recibido', texto: estadoActual.toUpperCase(), emoji: '📋' };

  const total = Number(r.total) || 0;
  const saldo = Number(r.saldo) || 0;
  const metodoPago = r.metodoPago ? r.metodoPago.replace(/\(.*\)/, '').trim() : '';

  let serviciosTexto = '';
  if (Array.isArray(r.servicios) && r.servicios.length > 0) {
    serviciosTexto = r.servicios
      .map(s => s.desc)
      .filter(d => d && d.trim() !== '' && d.trim() !== 'Sin descripción')
      .join(' · ');
  }

  return `
    <div class="card card-interactive recibo-card" data-id="${r.id}" data-estado="${estadoActual}">
      <div style="display: flex; justify-content: space-between; align-items: start; gap: 12px;">
        <div style="flex: 1; min-width: 0;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap;">
            <span class="chip-estado" data-estado="${estadoActual}">
              ${estadoInfo.emoji} ${estadoInfo.texto}
            </span>
            <span style="font-size: 10px; color: var(--text-mute); font-weight: 700; font-family: monospace;">
              ${r.numeroRecibo || '—'}
            </span>
          </div>
          <div style="font-size: 16px; font-weight: 800; color: var(--text-main); margin-bottom: 6px;">
            ${escapeHtml(r.marca || '')} ${escapeHtml(r.modelo || '')}
          </div>
          ${r.cliente ? `
            <div style="font-size: 12px; color: var(--text-mute); margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
              <span>👤</span> <span>${escapeHtml(r.cliente)}</span>
            </div>
          ` : ''}
          ${serviciosTexto ? `
            <div style="font-size: 11px; color: var(--text-mute); margin-bottom: 4px; display: flex; align-items: start; gap: 6px;">
              <span>🔧</span>
              <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;">${escapeHtml(serviciosTexto)}</span>
            </div>
          ` : ''}
          <div style="font-size: 10px; color: var(--text-mute); margin-top: 8px; display: flex; align-items: center; gap: 4px;">
            <i class="far fa-clock"></i> ${tiempoRelativo(r.fecha)}
          </div>
        </div>
        <div style="text-align: right; flex-shrink: 0;">
          <div style="font-size: 18px; font-weight: 900; color: var(--brand);">
            ${formatBs(total)}
          </div>
          ${metodoPago ? `
            <div style="font-size: 10px; color: #22C55E; font-weight: 700; margin-top: 4px;">
              ${getIconoMetodo(metodoPago)} ${escapeHtml(metodoPago)}
            </div>
          ` : saldo > 0 ? `
            <div style="font-size: 10px; color: #F59E0B; font-weight: 700; margin-top: 4px;">
              Saldo: ${formatBs(saldo)}
            </div>
          ` : `
            <div style="font-size: 10px; color: #22C55E; font-weight: 700; margin-top: 4px;">
              ✓ Pagado
            </div>
          `}
        </div>
      </div>
    </div>
  `;
}

function getIconoMetodo(metodo) {
  const m = String(metodo || '').toLowerCase();
  if (m.includes('efectivo')) return '💵';
  if (m.includes('qr')) return '📱';
  if (m.includes('transf')) return '🏦';
  if (m.includes('mixto')) return '🔀';
  return '💳';
}

/* ============================================================
   ACTUALIZAR ESTADÍSTICAS
   ============================================================ */
function actualizarStats() {
  const activas = recibos.filter(r => ['recibido', 'reparacion', 'espera-repuesto'].includes(r.estadoOrden || 'recibido')).length;
  const listas = recibos.filter(r => r.estadoOrden === 'listo').length;

  // Contar los de hoy
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const hoyCount = recibos.filter(r => {
    if (!r.fecha) return false;
    const d = r.fecha.toDate ? r.fecha.toDate() : new Date(r.fecha);
    return d >= hoy;
  }).length;

  if (document.getElementById('statActivas')) document.getElementById('statActivas').textContent = activas;
  if (document.getElementById('statListas')) document.getElementById('statListas').textContent = listas;
  if (document.getElementById('statHoy')) document.getElementById('statHoy').textContent = hoyCount;
}

/* ============================================================
   BOTTOM SHEET (ACCIONES DEL RECIBO)
   ============================================================ */
function abrirSheet(id) {
  const recibo = recibos.find(r => r.id === id);
  if (!recibo) return;

  if (!bottomSheet || !sheetContent) return;

  // Generar las opciones
  sheetContent.innerHTML = `
    <div style="margin-bottom: 16px;">
      <h3 style="font-size: 16px; font-weight: 800; color: var(--text-main); margin: 0 0 4px 0;">
        ${escapeHtml(recibo.numeroRecibo)}
      </h3>
      <p style="font-size: 12px; color: var(--text-mute); margin: 0;">
        ${escapeHtml(recibo.cliente)} · ${escapeHtml(recibo.marca)} ${escapeHtml(recibo.modelo)}
      </p>
    </div>

    <!-- Cambiar Estado -->
    <div style="background: var(--bg-elev); padding: 12px; border-radius: var(--radius-md); margin-bottom: 16px;">
      <label style="font-size: 11px; font-weight: 700; color: var(--text-mute); text-transform: uppercase; margin-bottom: 8px; display: block;">Cambiar Estado</label>
      <select id="selectEstado" style="width: 100%; padding: 10px; border-radius: 8px; background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border); outline: none; font-family: inherit;">
        <option value="recibido" ${recibo.estadoOrden === 'recibido' ? 'selected' : ''}>📦 Recibido</option>
        <option value="reparacion" ${recibo.estadoOrden === 'reparacion' ? 'selected' : ''}>🔧 En reparación</option>
        <option value="espera-repuesto" ${recibo.estadoOrden === 'espera-repuesto' ? 'selected' : ''}>⏳ Esperando repuesto</option>
        <option value="listo" ${recibo.estadoOrden === 'listo' ? 'selected' : ''}>✅ Listo para entregar</option>
        <option value="entregado" ${recibo.estadoOrden === 'entregado' ? 'selected' : ''}>🤝 Entregado</option>
        <option value="devuelto" ${recibo.estadoOrden === 'devuelto' ? 'selected' : ''}>↩️ Devuelto</option>
      </select>
    </div>

    <!-- Acciones -->
    <div style="display: flex; flex-direction: column; gap: 8px;">
      <button class="btn btn-primary" id="btnActualizarEstado" style="width: 100%;">
        <i class="fas fa-save"></i> Guardar Cambios
      </button>
      <button class="btn btn-whatsapp" id="btnWhatsApp" style="width: 100%;">
        <i class="fab fa-whatsapp"></i> Reenviar por WhatsApp
      </button>
      <button class="btn btn-secondary" id="btnVerPdf" style="width: 100%;">
        <i class="fas fa-file-pdf"></i> Ver / Imprimir Recibo
      </button>
      <button class="btn btn-ghost" id="btnEliminar" style="width: 100%; color: #EF4444;">
        <i class="fas fa-trash"></i> Eliminar Recibo
      </button>
    </div>
  `;

  // Mostrar el sheet
  bottomSheet.classList.add('show');
  haptic(15);

  // Eventos de los botones generados
  document.getElementById('btnActualizarEstado')?.addEventListener('click', async () => {
    const nuevoEstado = document.getElementById('selectEstado').value;
    try {
      await updateDoc(doc(db, 'recibos', id), { estadoOrden: nuevoEstado });
      toast('Estado actualizado', 'success');
      cerrarSheet();
    } catch (err) {
      console.error(err);
      toast('Error al actualizar el estado', 'error');
    }
  });

  document.getElementById('btnWhatsApp')?.addEventListener('click', () => {
    const mensaje = `Hola ${recibo.cliente.split(' ')[0]}, tu equipo ${recibo.marca} ${recibo.modelo} está en estado: *${recibo.estadoOrden || 'recibido'}*.\n\nN Recibo: ${recibo.numeroRecibo}\nPuedes revisarlo en: https://xiaomi.scz.red/?recibo=${recibo.numeroRecibo}`;
    const tel = recibo.telefono.replace(/\D/g, '');
    window.open(`https://wa.me/591${tel}?text=${encodeURIComponent(mensaje)}`, '_blank');
    cerrarSheet();
  });

  document.getElementById('btnVerPdf')?.addEventListener('click', () => {
    toast('Generando PDF...', 'info', 2000);
    // Aquí redirigimos a la vista del recibo para que se pueda imprimir
    window.open(`/app/recibo.html?id=${id}`, '_blank');
    cerrarSheet();
  });

  document.getElementById('btnEliminar')?.addEventListener('click', async () => {
    if (confirm('¿Eliminar este recibo permanentemente?')) {
      try {
        await deleteDoc(doc(db, 'recibos', id));
        toast('Recibo eliminado', 'success');
        cerrarSheet();
      } catch (err) {
        console.error(err);
        toast('Error al eliminar', 'error');
      }
    }
  });
}

function cerrarSheet() {
  if (bottomSheet) bottomSheet.classList.remove('show');
}
