/* ============================================================
   DR. XIAOMI · DIRECTORIO DE CLIENTES
   Archivo: js/clientes.js
   Descripción: Agrupa los recibos por cliente (teléfono)
   ============================================================ */

import { requireAuth, logout } from '/js/app-auth.js';
import { toast, haptic, initTheme, formatBs, escapeHtml, tiempoRelativo } from '/js/app-ui.js';
import { db } from '/js/firebase.js';
import { 
  collection, query, orderBy, onSnapshot, limit 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

initTheme();

let sesion = null;
let clientesAgrupados = [];
let busquedaActual = '';
let unsubscribe = null;

const listaClientes = document.getElementById('listaClientes');
const buscador = document.getElementById('buscador');
const bottomSheet = document.getElementById('clienteSheet');
const sheetContent = document.getElementById('sheetContent');

// Iniciar
requireAuth((s) => {
  sesion = s;
  const userInfo = document.getElementById('userInfo');
  if (userInfo) userInfo.textContent = `${sesion.icono || ''} ${sesion.nombre}`;

  configurarEventos();
  cargarClientes();
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

  buscador?.addEventListener('input', (e) => {
    busquedaActual = e.target.value.toLowerCase().trim();
    renderizarLista();
  });

  document.getElementById('btnCloseSheet')?.addEventListener('click', cerrarSheet);
  bottomSheet?.addEventListener('click', (e) => {
    if (e.target === bottomSheet) cerrarSheet();
  });
}

/* ============================================================
   CARGAR Y AGRUPAR DATOS DESDE FIRESTORE
   ============================================================ */
function cargarClientes() {
  // Traemos los últimos 300 recibos para armar la base de clientes
  const q = query(
    collection(db, 'recibos'),
    orderBy('fecha', 'desc'),
    limit(300)
  );

  unsubscribe = onSnapshot(q, 
    (snapshot) => {
      const recibos = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));

      agruparClientes(recibos);
      renderizarLista();
      
      const statTotal = document.getElementById('statTotal');
      if (statTotal) statTotal.textContent = clientesAgrupados.length;
    },
    (error) => {
      console.error('❌ Error cargando clientes:', error);
      if (listaClientes) {
        listaClientes.innerHTML = `
          <div class="empty-state">
            <i class="fas fa-exclamation-triangle" style="color: #EF4444;"></i>
            <h3>Error al cargar</h3>
            <p>${error.message}</p>
          </div>`;
      }
    }
  );
}

function agruparClientes(recibos) {
  const mapa = {};

  recibos.forEach(r => {
    // Usamos el teléfono como ID único del cliente
    const tel = (r.telefono || 'sin-telefono').replace(/\s+/g, '');
    if (!mapa[tel]) {
      mapa[tel] = {
        telefono: tel,
        nombre: r.cliente || 'Desconocido',
        visitas: 0,
        totalGastado: 0,
        ultimaVisita: r.fecha,
        recibos: []
      };
    }
    
    mapa[tel].visitas++;
    mapa[tel].totalGastado += Number(r.total) || 0;
    mapa[tel].recibos.push(r);
    
    // Si el nombre en el recibo es más reciente o más completo, lo actualizamos
    if (r.cliente && r.cliente.length > mapa[tel].nombre.length) {
      mapa[tel].nombre = r.cliente;
    }
  });

  // Convertir a array y ordenar por los que tienen más visitas
  clientesAgrupados = Object.values(mapa).sort((a, b) => b.visitas - a.visitas);
}

/* ============================================================
   RENDERIZAR LISTA DE CLIENTES
   ============================================================ */
function renderizarLista() {
  if (!listaClientes) return;

  let filtrados = clientesAgrupados;

  if (busquedaActual) {
    filtrados = filtrados.filter(c => {
      const texto = `${c.nombre} ${c.telefono}`.toLowerCase();
      return texto.includes(busquedaActual);
    });
  }

  if (filtrados.length === 0) {
    listaClientes.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-users"></i>
        <h3>No hay clientes</h3>
        <p>${busquedaActual ? 'Prueba con otra búsqueda' : 'Los clientes aparecerán al generar recibos'}</p>
      </div>`;
    return;
  }

  listaClientes.innerHTML = filtrados.map(c => renderCard(c)).join('');

  listaClientes.querySelectorAll('.cliente-card').forEach(card => {
    card.addEventListener('click', () => {
      haptic(10);
      abrirSheet(card.dataset.tel);
    });
  });
}

function renderCard(c) {
  const iniciales = c.nombre.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

  return `
    <div class="card card-interactive cliente-card" data-tel="${c.telefono}" style="padding: 16px; display: flex; align-items: center; gap: 16px;">
      
      <!-- Avatar con iniciales -->
      <div style="width: 46px; height: 46px; border-radius: 50%; background: var(--brand-light); color: var(--brand); display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 800; flex-shrink: 0;">
        ${escapeHtml(iniciales)}
      </div>

      <div style="flex: 1; min-width: 0;">
        <div style="font-size: 15px; font-weight: 700; color: var(--text-main); margin-bottom: 2px;">
          ${escapeHtml(c.nombre)}
        </div>
        <div style="font-size: 12px; color: var(--text-mute); display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
          <i class="fas fa-phone" style="font-size: 10px;"></i> ${escapeHtml(c.telefono)}
        </div>
        <div style="display: flex; gap: 12px; font-size: 11px; color: var(--text-mute); font-weight: 600;">
          <span><i class="fas fa-screwdriver-wrench"></i> ${c.visitas} visitas</span>
          <span><i class="fas fa-clock"></i> ${tiempoRelativo(c.ultimaVisita)}</span>
        </div>
      </div>

      <div style="text-align: right; flex-shrink: 0;">
        <div style="font-size: 14px; font-weight: 800; color: var(--text-main);">
          ${formatBs(c.totalGastado)}
        </div>
        <div style="font-size: 10px; color: var(--text-mute);">Total</div>
      </div>

    </div>
  `;
}

/* ============================================================
   BOTTOM SHEET (DETALLE DEL CLIENTE)
   ============================================================ */
function abrirSheet(tel) {
  const cliente = clientesAgrupados.find(c => c.telefono === tel);
  if (!cliente) return;

  if (!bottomSheet || !sheetContent) return;

  // Generar HTML de los recibos de este cliente
  const recibosHtml = cliente.recibos.map(r => `
    <div style="background: var(--bg-elev); border-radius: var(--radius-md); padding: 12px; margin-bottom: 8px;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
        <span style="font-size: 11px; font-weight: 700; color: var(--brand);">${r.numeroRecibo}</span>
        <span style="font-size: 11px; font-weight: 700; color: var(--text-main);">${formatBs(r.total)}</span>
      </div>
      <div style="font-size: 12px; color: var(--text-main); margin-bottom: 4px;">
        ${escapeHtml(r.marca)} ${escapeHtml(r.modelo)}
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 10px; color: var(--text-mute);">
        <span>${tiempoRelativo(r.fecha)}</span>
        <span>${r.estadoOrden || 'recibido'}</span>
      </div>
    </div>
  `).join('');

  sheetContent.innerHTML = `
    <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 20px;">
      <div style="width: 56px; height: 56px; border-radius: 50%; background: var(--brand-light); color: var(--brand); display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 800; flex-shrink: 0;">
        ${cliente.nombre.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
      </div>
      <div>
        <h3 style="font-size: 18px; font-weight: 800; color: var(--text-main); margin: 0 0 4px 0;">${escapeHtml(cliente.nombre)}</h3>
        <p style="font-size: 13px; color: var(--text-mute); margin: 0;">${escapeHtml(cliente.telefono)}</p>
      </div>
    </div>

    <!-- Botones de acción directa -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 20px;">
      <a href="tel:+591${cliente.telefono}" class="btn btn-secondary" style="text-decoration: none;">
        <i class="fas fa-phone"></i> Llamar
      </a>
      <a href="https://wa.me/591${cliente.telefono}" target="_blank" class="btn btn-whatsapp" style="text-decoration: none;">
        <i class="fab fa-whatsapp"></i> WhatsApp
      </a>
    </div>

    <div style="font-size: 12px; font-weight: 700; color: var(--text-mute); text-transform: uppercase; margin-bottom: 10px;">
      Historial de Reparaciones (${cliente.visitas})
    </div>
    
    <div style="max-height: 40vh; overflow-y: auto; padding-right: 4px;">
      ${recibosHtml}
    </div>
  `;

  // Mostrar el sheet
  bottomSheet.classList.add('show');
  haptic(15);
}

function cerrarSheet() {
  if (bottomSheet) bottomSheet.classList.remove('show');
}
