/* ============================================================
   DR. XIAOMI · INVENTARIO
   Archivo: app/inventario/inventario.js
   ============================================================ */

import { requireAuth, logout } from '/js/app-auth.js';
import { toast, haptic, initTheme, formatBs, escapeHtml } from '/js/app-ui.js';
import { db } from '/js/firebase.js';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, increment } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

initTheme();
let sesion = null;
let productos = [];
let unsubscribe = null;
let fotoDataUrl = '';

requireAuth((s) => {
  sesion = s;
  
  // 🔥 BLOQUEO DE SEGURIDAD: Si no es admin, lo sacamos
  if (sesion.rol !== 'admin') {
    toast('Acceso denegado. Solo el dueño puede ver el inventario.', 'error');
    setTimeout(() => window.location.href = '/app/', 1500);
    return;
  }

  document.getElementById('headerSubtitle').textContent = `Admin · ${sesion.nombre}`;
  configurarEventos();
  cargarProductos();
});

function configurarEventos() {
  document.getElementById('backBtn')?.addEventListener('click', () => window.location.href = '/app/');
  
  document.getElementById('btnNuevoProducto')?.addEventListener('click', abrirModal);
  document.getElementById('btnCloseModal')?.addEventListener('click', cerrarModal);
  
  document.getElementById('btnAddFoto')?.addEventListener('click', () => {
    document.getElementById('fotoInput').click();
  });
  
  document.getElementById('fotoInput')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
      fotoDataUrl = await comprimirImagen(file);
      renderFotoPreview();
    }
    e.target.value = '';
  });

  document.getElementById('btnGuardarProducto')?.addEventListener('click', guardarProducto);
  document.getElementById('btnWhatsApp')?.addEventListener('click', enviarInventarioWhatsApp);
}

function cargarProductos() {
  if (unsubscribe) unsubscribe();
  
  const q = collection(db, 'productos');
  
  unsubscribe = onSnapshot(q, (snapshot) => {
    productos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    productos.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    renderProductos();
    document.getElementById('appLoader')?.classList.add('hidden');
  }, (error) => {
    console.error(error);
    toast('Error al cargar inventario', 'error');
    document.getElementById('appLoader')?.classList.add('hidden');
  });
}

function renderProductos() {
  const grid = document.getElementById('productosGrid');
  
  if (productos.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: span 2; text-align:center; padding:40px 20px; color:var(--text-mute);">
        <i class="fas fa-box-open" style="font-size:40px; opacity:0.3; margin-bottom:12px; display:block;"></i>
        <h3 style="font-size:15px; margin-bottom:4px;">Inventario vacío</h3>
        <p style="font-size:12px;">Toca el botón "+" para agregar tu primer producto.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = productos.map(p => {
    const stock = Number(p.stock) || 0;
    const costo = Number(p.costo) || 0;
    const precio = Number(p.precio) || 0;
    const ganancia = precio - costo; // 🔥 Calculamos la ganancia

    let stockClass = '';
    if (stock === 0) stockClass = 'stock-cero';
    else if (stock <= 3) stockClass = 'stock-bajo';

    const imgUrl = p.foto || 'https://via.placeholder.com/300?text=Sin+Foto';

    return `
      <div class="producto-card">
        <img src="${imgUrl}" alt="${escapeHtml(p.nombre)}" class="producto-img">
        <div class="producto-info">
          <div class="producto-nombre">${escapeHtml(p.nombre || 'Sin nombre')}</div>
          <div class="producto-precio">${formatBs(precio)}</div>
          
          <!-- 🔥 MOSTRAMOS COSTO Y GANANCIA -->
          <div class="producto-costos">
            <span>Costo: ${formatBs(costo)}</span>
            <span class="producto-ganancia">Ganancia: ${formatBs(ganancia)}</span>
          </div>
          
          <div class="producto-stock ${stockClass}">Stock: ${stock}</div>
        </div>
        <button class="btn-stock" data-id="${p.id}" data-stock="${stock}" ${stock <= 0 ? 'disabled' : ''}>
          <i class="fas fa-minus"></i>
        </button>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.btn-stock').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const stockActual = parseInt(btn.dataset.stock);
      
      if (stockActual <= 0) return;
      
      haptic(15);
      
      try {
        await updateDoc(doc(db, 'productos', id), {
          stock: increment(-1)
        });
        toast('Stock actualizado', 'success', 1000);
      } catch (err) {
        toast('Error al actualizar', 'error');
      }
    });
  });
}

function abrirModal() {
  document.getElementById('inputNombre').value = '';
  document.getElementById('inputCosto').value = ''; // 🔥 Limpiar costo
  document.getElementById('inputPrecio').value = '';
  document.getElementById('inputStock').value = '';
  fotoDataUrl = '';
  renderFotoPreview();
  document.getElementById('modalProducto').classList.add('show');
}

function cerrarModal() {
  document.getElementById('modalProducto').classList.remove('show');
}

function renderFotoPreview() {
  const cont = document.getElementById('fotoUploader');
  const btnAdd = document.getElementById('btnAddFoto');
  
  cont.querySelectorAll('.foto-preview').forEach(el => el.remove());
  
  if (fotoDataUrl) {
    const div = document.createElement('div');
    div.className = 'foto-preview';
    div.innerHTML = `<img src="${fotoDataUrl}">`;
    cont.insertBefore(div, btnAdd);
  }
}

async function guardarProducto() {
  const nombre = document.getElementById('inputNombre').value.trim();
  const costo = parseFloat(document.getElementById('inputCosto').value) || 0; // 🔥 Nuevo campo
  const precio = parseFloat(document.getElementById('inputPrecio').value) || 0;
  const stock = parseInt(document.getElementById('inputStock').value) || 0;
  
  if (!nombre) { toast('Ponle un nombre al producto', 'error'); return; }
  if (precio <= 0) { toast('Ponle un precio válido', 'error'); return; }

  haptic(20);
  const btn = document.getElementById('btnGuardarProducto');
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
  btn.disabled = true;

  try {
    await addDoc(collection(db, 'productos'), {
      nombre: nombre,
      costo: costo, // 🔥 Guardamos el costo
      precio: precio,
      stock: stock,
      foto: fotoDataUrl || '',
      creadoEn: serverTimestamp(),
      creadoPor: sesion.nombre
    });
    
    toast('Producto agregado', 'success');
    cerrarModal();
  } catch (err) {
    console.error(err);
    toast('Error al guardar', 'error');
  } finally {
    btn.innerHTML = '<i class="fas fa-save"></i> Guardar Producto';
    btn.disabled = false;
  }
}

async function comprimirImagen(file, maxSize = 600, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > h && w > maxSize) { h = (h * maxSize) / w; w = maxSize; }
        else if (h > maxSize) { w = (w * maxSize) / h; h = maxSize; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject; img.src = e.target.result;
    };
    reader.onerror = reject; reader.readAsDataURL(file);
  });
}

function enviarInventarioWhatsApp() {
  if (productos.length === 0) {
    toast('El inventario está vacío', 'warning');
    return;
  }

  haptic(15);
  
  let msg = `*INVENTARIO - DR. XIAOMI*\n`;
  msg += `📅 ${new Date().toLocaleDateString('es-BO')}\n`;
  msg += `👤 Por: ${sesion.nombre}\n\n`;

  productos.forEach(p => {
    const stock = Number(p.stock) || 0;
    const costo = Number(p.costo) || 0;
    const precio = Number(p.precio) || 0;
    const ganancia = precio - costo;

    if (stock > 0) {
      msg += `- ${p.nombre}: ${stock} uds. (${formatBs(precio)})\n`;
      msg += `  _Costo: ${formatBs(costo)} | Ganancia: ${formatBs(ganancia)}_\n`; // 🔥 Agregamos costo y ganancia al WhatsApp
    }
  });

  msg += `\n*Total de productos:* ${productos.length}`;

  const telDueno = '59175959450'; 
  window.open(`https://wa.me/${telDueno}?text=${encodeURIComponent(msg)}`, '_blank');
}

// Red de seguridad
setTimeout(() => {
  document.getElementById('appLoader')?.classList.add('hidden');
}, 2500);
