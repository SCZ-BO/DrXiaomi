/* ============================================================
   DR. XIAOMI · INVENTARIO PRO (V2.0)
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
let productoEditandoId = null; // Para saber si estamos editando o creando

requireAuth((s) => {
  sesion = s;
  
  // 🔥 CONTROL DE ACCESO ESTRICTO
  if (sesion.rol !== 'admin') {
    toast('Acceso denegado. Área exclusiva del administrador.', 'error');
    setTimeout(() => window.location.href = '/app/', 1500);
    return;
  }

  document.getElementById('headerSubtitle').textContent = `Admin · ${sesion.nombre}`;
  configurarEventos();
  cargarProductos();
});

function configurarEventos() {
  document.getElementById('backBtn')?.addEventListener('click', () => window.location.href = '/app/');
  document.getElementById('btnNuevoProducto')?.addEventListener('click', () => abrirModal());
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
  document.getElementById('btnEliminarProducto')?.addEventListener('click', eliminarProducto);
  document.getElementById('btnWhatsApp')?.addEventListener('click', enviarInventarioWhatsApp);
}

function cargarProductos() {
  if (unsubscribe) unsubscribe();
  
  const q = collection(db, 'productos');
  
  unsubscribe = onSnapshot(q, (snapshot) => {
    productos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    productos.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    renderProductos();
    actualizarKPIs();
    document.getElementById('appLoader')?.classList.add('hidden');
  }, (error) => {
    console.error(error);
    toast('Error de conexión', 'error');
    document.getElementById('appLoader')?.classList.add('hidden');
  });
}

function actualizarKPIs() {
  const total = productos.length;
  let valorTotal = 0;
  productos.forEach(p => {
    valorTotal += (Number(p.precio) || 0) * (Number(p.stock) || 0);
  });
  
  document.getElementById('kpiTotal').textContent = total;
  document.getElementById('kpiValor').textContent = formatBs(valorTotal);
}

function renderProductos() {
  const grid = document.getElementById('productosGrid');
  
  if (productos.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: span 2; text-align:center; padding:60px 20px; color:var(--text-mute);">
        <i class="fas fa-box-open" style="font-size:48px; opacity:0.2; margin-bottom:16px; display:block;"></i>
        <h3 style="font-size:16px; margin-bottom:6px; color:var(--text-main);">Inventario Vacío</h3>
        <p style="font-size:13px;">Toca el botón <b>+</b> para agregar tu primer producto.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = productos.map(p => {
    const stock = Number(p.stock) || 0;
    const costo = Number(p.costo) || 0;
    const precio = Number(p.precio) || 0;
    const ganancia = precio - costo; 

    let stockClass = '';
    if (stock === 0) stockClass = 'empty';
    else if (stock <= 3) stockClass = 'low';

    const imgUrl = p.foto || 'https://via.placeholder.com/300?text=Sin+Foto';

    return `
      <div class="producto-card" onclick="window.abrirEdicion('${p.id}')">
        <img src="${imgUrl}" alt="${escapeHtml(p.nombre)}" class="producto-img">
        <div class="producto-info">
          <div class="producto-nombre">${escapeHtml(p.nombre || 'Sin nombre')}</div>
          <div class="producto-precio">${formatBs(precio)}</div>
          
          <div class="producto-costos">
            <span>Costo: ${formatBs(costo)}</span>
            <span class="producto-ganancia">+${formatBs(ganancia)}</span>
          </div>
          
          <div class="stock-controls" onclick="event.stopPropagation()">
            <span class="stock-display ${stockClass}">Stock: ${stock}</span>
            <div class="stock-actions">
              <button class="btn-stock-action" onclick="window.ajustarStock('${p.id}', -1)" ${stock <= 0 ? 'disabled' : ''}>
                <i class="fas fa-minus"></i>
              </button>
              <button class="btn-stock-action" onclick="window.ajustarStock('${p.id}', 1)">
                <i class="fas fa-plus"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// 🔥 FUNCIONES GLOBALES PARA LOS BOTONES DE LA TARJETA
window.ajustarStock = async function(id, cantidad) {
  haptic(15);
  try {
    await updateDoc(doc(db, 'productos', id), {
      stock: increment(cantidad)
    });
  } catch (err) {
    toast('Error al actualizar stock', 'error');
  }
};

window.abrirEdicion = function(id) {
  const p = productos.find(x => x.id === id);
  if (!p) return;
  haptic(15);
  abrirModal(p);
};

// 🔥 MODAL (CREAR / EDITAR)
function abrirModal(producto = null) {
  productoEditandoId = producto ? producto.id : null;
  
  document.getElementById('modalTitle').textContent = producto ? 'Editar Producto' : 'Nuevo Producto';
  document.getElementById('btnEliminarProducto').style.display = producto ? 'flex' : 'none';
  
  document.getElementById('inputNombre').value = producto ? producto.nombre : '';
  document.getElementById('inputCosto').value = producto ? producto.costo : '';
  document.getElementById('inputPrecio').value = producto ? producto.precio : '';
  document.getElementById('inputStock').value = producto ? producto.stock : '';
  
  fotoDataUrl = producto ? producto.foto : '';
  renderFotoPreview();
  
  document.getElementById('modalProducto').classList.add('show');
}

function cerrarModal() {
  document.getElementById('modalProducto').classList.remove('show');
  productoEditandoId = null;
}

function renderFotoPreview() {
  const cont = document.getElementById('fotoUploader');
  const btnAdd = document.getElementById('btnAddFoto');
  
  cont.querySelectorAll('.foto-preview').forEach(el => el.remove());
  
  if (fotoDataUrl) {
    const div = document.createElement('div');
    div.className = 'foto-preview';
    div.innerHTML = `
      <img src="${fotoDataUrl}">
      <button class="btn-remove-foto" onclick="window.removerFoto(event)"><i class="fas fa-times"></i></button>
    `;
    cont.insertBefore(div, btnAdd);
  }
}

window.removerFoto = function(e) {
  e.stopPropagation();
  fotoDataUrl = '';
  renderFotoPreview();
  haptic(15);
};

async function guardarProducto() {
  const nombre = document.getElementById('inputNombre').value.trim();
  const costo = parseFloat(document.getElementById('inputCosto').value) || 0; 
  const precio = parseFloat(document.getElementById('inputPrecio').value) || 0;
  const stock = parseInt(document.getElementById('inputStock').value) || 0;
  
  if (!nombre) { toast('El nombre es obligatorio', 'error'); return; }
  if (precio <= 0) { toast('El precio debe ser mayor a 0', 'error'); return; }

  haptic(20);
  const btn = document.getElementById('btnGuardarProducto');
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
  btn.disabled = true;

  const data = {
    nombre: nombre,
    costo: costo, 
    precio: precio,
    stock: stock,
    foto: fotoDataUrl || '',
    actualizadoEn: serverTimestamp()
  };

  try {
    if (productoEditandoId) {
      // Editar existente
      await updateDoc(doc(db, 'productos', productoEditandoId), data);
      toast('Producto actualizado', 'success');
    } else {
      // Crear nuevo
      data.creadoEn = serverTimestamp();
      data.creadoPor = sesion.nombre;
      await addDoc(collection(db, 'productos'), data);
      toast('Producto agregado', 'success');
    }
    cerrarModal();
  } catch (err) {
    console.error(err);
    toast('Error al guardar', 'error');
  } finally {
    btn.innerHTML = '<i class="fas fa-save"></i> Guardar Producto';
    btn.disabled = false;
  }
}

async function eliminarProducto() {
  if (!productoEditandoId) return;
  
  const confirmar = confirm("¿Estás seguro de eliminar este producto? Esta acción no se puede deshacer.");
  if (!confirmar) return;

  haptic(30);
  const btn = document.getElementById('btnEliminarProducto');
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Eliminando...';
  btn.disabled = true;

  try {
    await deleteDoc(doc(db, 'productos', productoEditandoId));
    toast('Producto eliminado', 'success');
    cerrarModal();
  } catch (err) {
    console.error(err);
    toast('Error al eliminar', 'error');
  } finally {
    btn.innerHTML = '<i class="fas fa-trash-alt"></i> Eliminar Producto';
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
  
  let msg = `*REPORTE DE INVENTARIO - DR. XIAOMI*\n`;
  msg += `📅 ${new Date().toLocaleDateString('es-BO')}\n`;
  msg += `👤 Admin: ${sesion.nombre}\n\n`;

  let productosConStock = 0;

  productos.forEach(p => {
    const stock = Number(p.stock) || 0;
    const precio = Number(p.precio) || 0;

    if (stock > 0) {
      msg += `▪️ *${p.nombre}*\n`;
      msg += `   Stock: ${stock} uds. | PVP: ${formatBs(precio)}\n`;
      productosConStock++;
    }
  });

  if (productosConStock === 0) {
    msg += `_No hay productos con stock disponible._\n`;
  }

  msg += `\n*Total de ítems:* ${productosConStock}`;

  const telDueno = '59175959450'; 
  window.open(`https://wa.me/${telDueno}?text=${encodeURIComponent(msg)}`, '_blank');
}

// Red de seguridad
setTimeout(() => {
  document.getElementById('appLoader')?.classList.add('hidden');
}, 2500);
