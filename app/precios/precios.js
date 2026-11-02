// /app/precios/precios.js
import { db } from '../js/firebase.js';
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { COMPATIBILIDADES } from './compatibles.js';

const appRoot = document.getElementById('appRoot');
const splash = document.getElementById('splash');
const container = document.getElementById('resultsContainer');
const searchInput = document.getElementById('searchInput');
const suggestionsPanel = document.getElementById('suggestionsPanel');
const resultsCount = document.getElementById('resultsCount');
const clearSearchBtn = document.getElementById('clearSearchBtn');

let allData = [];
let filteredData = [];
let currentFilter = "all";
let favorites = new Set(JSON.parse(localStorage.getItem("drxiaomi_favs_v1") || "[]"));
let techMode = false;
let currentTerm = "";

// ==========================================
// 1. PERMISOS Y SEGURIDAD
// ==========================================
let sesion = null;
try { sesion = JSON.parse(localStorage.getItem('drx_sesion') || 'null'); } catch(e) {}
const isAdmin = sesion && sesion.rol === 'admin';

if (isAdmin) {
  document.getElementById('adminEditBtn').style.display = 'flex';
  document.getElementById('adminEditBtn').onclick = () => window.location.href = '/app/precios-admin/';
} else {
  // 🔥 Si es técnico, ocultamos el botón de Reportes de la barra inferior
  const navReportes = document.getElementById('navReportes');
  if (navReportes) navReportes.style.display = 'none';
}

// ==========================================
// 2. UTILIDADES
// ==========================================
function getLogo(marca) {
  let m = marca ? marca.split(" ")[0].toUpperCase() : "GENERAL";
  if (m.includes("APPLE") || m.includes("IPHONE")) m = "APPLE";
  if (m.includes("XIAOMI") || m.includes("REDMI") || m.includes("POCO")) m = "XIAOMI";
  
  // 🔥 Ruta corregida a la carpeta local de logos
  return `/app/precios/logos/${m.toLowerCase()}.png`;
}

// ==========================================
// 3. CONEXIÓN A FIREBASE Y DESORDEN ALEATORIO
// ==========================================
onSnapshot(collection(db, "precios"), (snap) => {
  allData = [];
  snap.forEach(d => { if (d.data().activo !== false) allData.push({ id: d.id, ...d.data() }); });
  
  // 🎲 Desordenamos solo al cargar
  allData.sort(() => Math.random() - 0.5);
  
  splash.classList.add('hidden');
  appRoot.style.opacity = "1";
  renderList();
});

// ==========================================
// 4. BUSCADORES
// ==========================================
function aplicarBusqueda(data, term) {
  if (!term) return data;
  const tokens = term.toLowerCase().split(" ").filter(t => t.length > 0);
  if (!tokens.length) return data;

  const results = [];
  for (const item of data) {
    const combined = `${item.marca} ${item.modelo}`.toLowerCase();
    let score = 0;

    const joinedTerm = tokens.join(" ");
    if (combined === joinedTerm) score = 100;
    else if (combined.startsWith(joinedTerm)) score = 90;
    else if (combined.includes(joinedTerm)) score = 80;
    else {
      const coincideTodas = tokens.every(t => combined.includes(t));
      if (coincideTodas) score = 50;
      else {
        const coincideAlguna = tokens.some(t => t.length > 2 && combined.includes(t));
        if (coincideAlguna) score = 10;
      }
    }
    if (score > 0) results.push({ item, score });
  }
  
  // Los resultados se ordenan de mayor a menor puntaje
  return results.sort((a, b) => b.score - a.score).map(r => r.item);
}

function buscarCompatibles(term) {
  term = term.toLowerCase().trim();
  if (!term) return [];
  const tokens = term.split(" ").filter(t => t.length > 0);
  const resultados = [];

  for (const [clave, grupo] of Object.entries(COMPATIBILIDADES)) {
    const claveLimpia = clave.toLowerCase();
    const modelos = grupo.modelos || [];
    let matchClave = claveLimpia.includes(term);
    let matchModelo = modelos.some(m => tokens.every(t => m.toLowerCase().includes(t)));
    
    if (matchClave || matchModelo) {
      resultados.push({ grupoNombre: clave.toUpperCase(), ...grupo });
    }
  }
  return resultados;
}

// ==========================================
// 5. RENDERIZADO PRINCIPAL
// ==========================================
function renderList() {
  let data = [...allData]; // Copiamos sin desordenar de nuevo
  
  if (currentFilter === "FAV") data = data.filter(i => favorites.has(i.id));
  else if (currentFilter !== "all" && currentFilter !== "COMPAT") data = data.filter(i => i.tipo === currentFilter);
  
  // MODO COMPATIBILIDAD
  if (currentFilter === "COMPAT") {
    if (!currentTerm) {
      container.innerHTML = `<div class="empty-state"><i class="fas fa-search"></i><p>Escribe un modelo para ver sus compatibles.</p></div>`;
      resultsCount.innerHTML = `<span>Modo Compatibilidad</span>`;
      return;
    }
    
    const grupos = buscarCompatibles(currentTerm);
    if (grupos.length === 0) {
      container.innerHTML = `<div class="empty-state"><p>No hay compatibles para "${currentTerm}".</p></div>`;
      return;
    }

    resultsCount.innerHTML = `<span>${grupos.length} grupos encontrados</span>`;
    container.innerHTML = grupos.map(g => `
      <div class="product-card is-compat" style="border-left-color: #3B82F6;">
        <div style="font-weight: 800; color: #3B82F6; margin-bottom: 8px;">${g.marca}</div>
        <div style="font-size: 18px; font-weight: 700; margin-bottom: 12px;">${g.grupoNombre}</div>
        <div style="font-size: 12px; color: var(--text-3); margin-bottom: 8px;">Modelos compatibles (${g.modelos.length}):</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
          ${g.modelos.map(m => `<div style="background: var(--bg-elev-2); padding: 6px; border-radius: 4px; font-size: 11px;">${m}</div>`).join('')}
        </div>
      </div>
    `).join('');
    return;
  }

  // MODO NORMAL
  if (currentTerm) {
    data = aplicarBusqueda(data, currentTerm);
  }

  filteredData = data;
  resultsCount.innerHTML = `<span>${data.length} productos</span>`;
  
  if (data.length === 0) {
    container.innerHTML = `<div class="empty-state"><i class="fas fa-search"></i><p>No hay resultados.</p></div>`;
    return;
  }

  container.innerHTML = data.map(item => `
    <div class="product-card ${item.tipo === 'ORIG' ? 'is-orig' : ''}">
      <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
        <div style="display:flex; gap:10px; align-items:center;">
          <img src="${getLogo(item.marca)}" style="width:32px; height:32px; object-fit:contain;" onerror="this.style.display='none'">
          <div>
            <div class="card-brand">${item.marca}</div>
            <div class="card-model">${item.modelo}</div>
          </div>
        </div>
        <button class="icon-btn" onclick="window.toggleFav('${item.id}')" style="background:none; border:none; color:${favorites.has(item.id) ? '#FFB800' : 'var(--text-3)'};">
          <i class="fa${favorites.has(item.id) ? 's' : 'r'} fa-star"></i>
        </button>
      </div>
      
      <div style="display:flex; gap:8px; margin-bottom:12px;">
        <span class="card-type ${item.tipo.toLowerCase()}">${item.tipo}</span>
        ${techMode || isAdmin ? `<span style="font-size:10px; background:rgba(255,255,255,0.1); padding:4px 8px; border-radius:4px;">Compra: ${item.compra} Bs</span>` : ''}
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-1); padding-top:12px;">
        <div class="card-price">${item.venta} Bs</div>
        <div style="display:flex; gap:6px;">
          ${isAdmin ? `<button class="edit-btn" onclick="window.editPrice('${item.id}')"><i class="fas fa-pen"></i></button>` : ''}
          <button class="image-btn" onclick="window.openGoogle('${item.modelo}')"><i class="fab fa-google"></i></button>
          <button class="whatsapp-btn" onclick="window.shareWA('${item.id}')"><i class="fab fa-whatsapp"></i></button>
        </div>
      </div>
    </div>
  `).join('');
}

// ==========================================
// 6. EVENTOS (BOTONES)
// ==========================================
searchInput.addEventListener('input', (e) => {
  currentTerm = e.target.value;
  clearSearchBtn.style.display = currentTerm ? 'block' : 'none';
  renderList();
});

clearSearchBtn.addEventListener('click', () => {
  searchInput.value = ''; currentTerm = ''; clearSearchBtn.style.display = 'none'; renderList();
});

document.getElementById('quickFilters').addEventListener('click', (e) => {
  const btn = e.target.closest('.filter-chip');
  if (!btn) return;
  document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentFilter = btn.dataset.filter;
  
  if (currentFilter === "COMPAT") searchInput.placeholder = "Buscar compatible (Ej: Vivo Y21S)...";
  else searchInput.placeholder = "Buscar modelo...";
  
  renderList();
});

// 🔥 MODO TÉCNICO CON CONFIRMACIÓN (Añadido)
document.getElementById('techModeBtn').addEventListener('click', () => {
  if (techMode) {
    techMode = false; renderList(); return;
  }
  
  const modal = document.createElement('div');
  modal.className = 'sheet-backdrop show';
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="sheet" style="text-align: center; padding: 32px 20px;">
      <div class="sheet-handle"></div>
      <div style="font-size: 56px; margin-bottom: 16px;"><i class="fas fa-user-shield" style="color: var(--brand-500);"></i></div>
      <h3 style="font-size: 22px; font-weight: 800; margin-bottom: 12px;">¿Eres el técnico?</h3>
      <p style="color: var(--text-3); font-size: 14px; margin-bottom: 24px;">Al confirmar, se mostrarán los precios de compra.</p>
      <div style="display: flex; gap: 12px;">
        <button id="btnCancelarTech" class="btn btn-secondary" style="flex: 1;">Cancelar</button>
        <button id="btnConfirmarTech" class="btn btn-primary" style="flex: 1;">Sí, soy técnico</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('btnCancelarTech').onclick = () => modal.remove();
  document.getElementById('btnConfirmarTech').onclick = () => {
    techMode = true; modal.remove(); renderList();
  };
});

document.getElementById('backBtn').addEventListener('click', () => window.location.href = '/app/');
document.getElementById('receiptBtn').addEventListener('click', () => window.location.href = '/app/cliente/');

// ==========================================
// 7. FUNCIONES GLOBALES
// ==========================================
window.toggleFav = (id) => {
  if (favorites.has(id)) favorites.delete(id); else favorites.add(id);
  localStorage.setItem("drxiaomi_favs_v1", JSON.stringify([...favorites]));
  renderList();
};

window.openGoogle = (modelo) => {
  window.open(`https://www.google.com/search?q=${encodeURIComponent(`LCD ${modelo} pantalla`)}&tbm=isch`, '_blank');
};

window.shareWA = (id) => {
  const p = allData.find(x => x.id === id);
  if (!p) return;
  const msg = `*${p.marca} ${p.modelo}*\nPrecio: ${p.venta} Bs\nINCLUYE INSTALACIÓN`;
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
};

window.editPrice = (id) => {
  window.location.href = '/app/precios-admin/';
};
