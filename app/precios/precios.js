// /app/precios/precios.js
import { db } from '../js/firebase.js';
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { COMPATIBILIDADES } from './compatibles.js';

const appRoot = document.getElementById('appRoot');
const splash = document.getElementById('splash');
const container = document.getElementById('resultsContainer');
const searchInput = document.getElementById('searchInput');
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
  const adminBtn = document.getElementById('adminEditBtn');
  if (adminBtn) {
    adminBtn.style.display = 'flex';
    adminBtn.onclick = () => window.location.href = '/app/precios-admin/';
  }
} else {
  const navReportes = document.getElementById('navReportes');
  if (navReportes) navReportes.style.display = 'none';
}

// ==========================================
// 2. UTILIDADES (LOGO CON FALLBACK)
// ==========================================
function getLogo(marca) {
  if (!marca) return '/app/precios/logos/default.png';
  let m = marca.split(" ")[0].toUpperCase();
  if (m.includes("APPLE") || m.includes("IPHONE")) m = "APPLE";
  if (m.includes("XIAOMI") || m.includes("REDMI") || m.includes("POCO")) m = "XIAOMI";
  
  const logosExistentes = ["apple", "default", "honor", "huawei", "infinix", "realme", "motorola", "oppo", "samsung", "tecno", "vivo", "xiaomi", "zte"];
  const mLower = m.toLowerCase();
  
  if (logosExistentes.includes(mLower)) {
    return `/app/precios/logos/${mLower}.png`;
  }
  return '/app/precios/logos/default.png';
}

// ==========================================
// 3. CONEXIÓN A FIREBASE
// ==========================================
onSnapshot(collection(db, "precios"), (snap) => {
  allData = [];
  snap.forEach(d => { if (d.data().activo !== false) allData.push({ id: d.id, ...d.data() }); });
  
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
// 5. RENDERIZADO
// ==========================================
function renderList() {
  let data = [...allData]; 
  
  if (currentFilter === "FAV") data = data.filter(i => favorites.has(i.id));
  else if (currentFilter !== "all" && currentFilter !== "COMPAT") data = data.filter(i => i.tipo === currentFilter);
  
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
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
        <div style="display:flex; gap:10px; align-items:center;">
          <div style="width:32px; height:32px; border-radius:8px; background:var(--bg-elev-2); display:flex; align-items:center; justify-content:center; overflow:hidden;">
             <img src="${getLogo(item.marca)}" style="width:100%; height:100%; object-fit:contain;" 
                  onerror="this.onerror=null; this.src='/app/precios/logos/default.png';">
          </div>
          <div>
            <div class="card-brand">${item.marca}</div>
            <div class="card-model">${item.modelo}</div>
          </div>
        </div>
        
        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
           <!-- 🔥 PROVEEDOR ARRIBA A LA DERECHA 🔥 -->
           <div class="card-provider">${item.proveedor || 'SIN PROV'}</div>
           
           <button class="icon-btn" onclick="window.toggleFav('${item.id}')" style="background:none; border:none; color:${favorites.has(item.id) ? '#FFB800' : 'var(--text-3)'};">
             <i class="fa${favorites.has(item.id) ? 's' : 'r'} fa-star"></i>
           </button>
        </div>
      </div>
      
      <div style="display:flex; gap:8px; margin-bottom:8px;">
        <span class="card-type ${item.tipo.toLowerCase()}">${item.tipo}</span>
        <!-- 🔥 AHORA SIEMPRE SE GENERA EL HTML, PERO EL CSS SE ENCARGA DE OCULTARLO/MOSTRARLO 🔥 -->
        <span class="costo-tag" style="font-size:10px; background:rgba(255,255,255,0.1); padding:4px 8px; border-radius:4px;">Compra: ${item.compra} Bs</span>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-1); padding-top:10px; margin-top:auto;">
        <div class="card-price" data-marca="${item.marca}" data-modelo="${item.modelo}">${item.venta} Bs</div>
        <div style="display:flex; gap:6px;">
          <button class="edit-btn" onclick="window.editPrice('${item.id}')"><i class="fas fa-pen"></i></button>
          <button class="image-btn" onclick="window.openGoogle('${item.modelo}')"><i class="fab fa-google"></i></button>
          <button class="whatsapp-btn" onclick="window.shareWA('${item.id}')"><i class="fab fa-whatsapp"></i></button>
        </div>
      </div>
    </div>
  `).join('');
}

// ==========================================
// 6. EVENTOS DE BÚSQUEDA Y FILTROS
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

// ==========================================
// 7. MODO TÉCNICO (FLUIDO, SIN REPINTAR LA LISTA)
// ==========================================
const modalTechConfirm = document.getElementById('modalTechConfirm');
const btnConfirmTech = document.getElementById('btnConfirmTech');
const btnCancelTech = document.getElementById('btnCancelTech');

// Restaurar estado si estaba activo
if (techMode) {
  document.getElementById('techModeBtn')?.classList.add('tech-active');
  document.body.classList.add('show-costs');
}

document.getElementById('techModeBtn')?.addEventListener('click', () => {
  if (techMode) {
    // APAGAR: Solo quitamos la clase, no repintamos
    techMode = false;
    document.getElementById('techModeBtn')?.classList.remove('tech-active');
    document.body.classList.remove('show-costs');
    return;
  }
  // ENCENDER: Mostrar modal de confirmación
  modalTechConfirm.classList.add('show');
});

btnCancelTech?.addEventListener('click', () => {
  modalTechConfirm.classList.remove('show');
});

btnConfirmTech?.addEventListener('click', () => {
  // CONFIRMAR ENCENDIDO: Solo añadimos la clase, no repintamos
  techMode = true;
  document.getElementById('techModeBtn')?.classList.add('tech-active');
  document.body.classList.add('show-costs');
  modalTechConfirm.classList.remove('show');
});

// ==========================================
// 8. FUNCIONES GLOBALES
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

// ==========================================
// 9. COPIADO AL TOCAR EL PRECIO
// ==========================================
document.addEventListener('click', (e) => {
  const priceElement = e.target.closest('.card-price');
  if (priceElement) {
    const marca = priceElement.dataset.marca;
    const modelo = priceElement.dataset.modelo;
    const precio = priceElement.innerText.replace(/[^0-9.]/g, '');
    
    const mensaje = `📱 ${marca} ${modelo}\n💰 Precio Pantalla: ${precio} Bs\n👨🏻‍🔧 INCLUYE INSTALACIÓN`;
    
    navigator.clipboard.writeText(mensaje).then(() => {
      const toast = document.createElement('div');
      toast.className = 'custom-toast show';
      toast.innerHTML = '<i class="fas fa-check-circle"></i> <span>Mensaje copiado</span>';
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 3000);
    }).catch(err => console.error('Error al copiar:', err));
  }
});
