/* ============================================================
   DR. XIAOMI · CIERRE DE CAJA
   Archivo: app/cierre/cierre.js
   ============================================================ */

import { requireAuth, logout } from '/js/app-auth.js';
import { toast, haptic, initTheme, formatBs, escapeHtml } from '/js/app-ui.js';
import { db } from '/js/firebase.js';
import { collection, query, where, getDocs, addDoc, serverTimestamp, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

initTheme();
let sesion = null;
let reparacionesData = { total: 0, efectivo: 0, qr: 0, transf: 0, cantidad: 0 };
let extras = []; // Ventas manuales
let ventasInventario = []; // Ventas de accesorios
let extrasId = 0;

requireAuth(async (s) => {
  sesion = s;
  configurarHeader();
  await cargarReparacionesHoy();
  await cargarInventario();
  actualizarTotales();
});

function configurarHeader() {
  document.getElementById('backBtn')?.addEventListener('click', () => window.location.href = '/app/');
}

async function cargarReparacionesHoy() {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const manana = new Date(hoy);
  manana.setDate(manana.getDate() + 1);

  document.getElementById('headerSubtitle').textContent = `Fecha: ${hoy.toLocaleDateString('es-BO')}`;

  try {
    const q = query(collection(db, 'recibos'), where('estadoOrden', '==', 'entregado'));
    const snapshot = await getDocs(q);

    reparacionesData = { total: 0, efectivo: 0, qr: 0, transf: 0, cantidad: 0 };

    snapshot.forEach(doc => {
      const d = doc.data();
      let fechaD = d.fechaEntrega || d.fecha;
      if (fechaD && typeof fechaD.toDate === 'function') fechaD = fechaD.toDate();
      else if (fechaD) fechaD = new Date(fechaD);

      if (fechaD >= hoy && fechaD < manana) {
        const monto = Number(d.montoCobrado) || 0;
        const metodo = (d.metodoPago || 'Efectivo').toLowerCase();

        reparacionesData.total += monto;
        reparacionesData.cantidad++;

        if (metodo.includes('efectivo')) reparacionesData.efectivo += monto;
        else if (metodo.includes('qr')) reparacionesData.qr += monto;
        else if (metodo.includes('transf')) reparacionesData.transf += monto;
        else reparacionesData.efectivo += monto;
      }
    });

    document.getElementById('cantReparaciones').textContent = reparacionesData.cantidad;
    document.getElementById('totalReparaciones').textContent = formatBs(reparacionesData.total);
    document.getElementById('totalEfectivo').textContent = formatBs(reparacionesData.efectivo);
    document.getElementById('totalQR').textContent = formatBs(reparacionesData.qr);
    document.getElementById('totalTransf').textContent = formatBs(reparacionesData.transf);

  } catch (error) {
    console.error(error);
    toast('Error al cargar reparaciones', 'error');
  }
}

async function cargarInventario() {
  try {
    const snapshot = await getDocs(collection(db, 'productos'));
    const productos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    
    const cont = document.getElementById('listaInventario');
    if (productos.length === 0) {
      cont.innerHTML = '<p style="font-size:12px; color:var(--text-mute); grid-column:span 3; text-align:center;">No hay productos en inventario.</p>';
      return;
    }

    cont.innerHTML = productos.map(p => `
      <button class="producto-btn" data-id="${p.id}" data-nombre="${escapeHtml(p.nombre)}" data-precio="${p.precio}" data-stock="${p.stock}" style="opacity: ${p.stock <= 0 ? 0.4 : 1};" ${p.stock <= 0 ? 'disabled' : ''}>
        ${p.foto ? `<img src="${p.foto}">` : `<i class="fas fa-box" style="font-size:20px; color:var(--brand);"></i>`}
        <span class="nombre">${escapeHtml(p.nombre)}</span>
        <span class="precio">${formatBs(p.precio)}</span>
      </button>
    `).join('');

    cont.querySelectorAll('.producto-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        haptic(10);
        const id = btn.dataset.id;
        const nombre = btn.dataset.nombre;
        const precio = parseFloat(btn.dataset.precio) || 0;
        
        const existe = ventasInventario.find(v => v.id === id);
        if (existe) existe.cantidad++;
        else ventasInventario.push({ id, nombre, precio, cantidad: 1 });
        
        actualizarTotales();
        toast(`${nombre} agregado`, 'success', 1000);
      });
    });

  } catch (error) {
    console.error(error);
  }
}

function agregarExtra() {
  const id = extrasId++;
  extras.push({ id, desc: '', monto: 0 });
  renderExtras();
}

function renderExtras() {
  const cont = document.getElementById('listaExtras');
  cont.innerHTML = '';

  extras.forEach(ext => {
    const div = document.createElement('div');
    div.className = 'item-extra';
    div.innerHTML = `
      <input type="text" placeholder="Ej. Venta de funda" value="${escapeHtml(ext.desc)}" data-id="${ext.id}" class="desc">
      <input type="number" placeholder="Bs." value="${ext.monto || ''}" data-id="${ext.id}" class="costo" inputmode="decimal">
      <button class="btn-remove" data-id="${ext.id}"><i class="fas fa-times"></i></button>
    `;
    cont.appendChild(div);
  });

  cont.querySelectorAll('.desc').forEach(input => {
    input.addEventListener('input', (e) => {
      const id = parseInt(e.target.dataset.id);
      const ext = extras.find(x => x.id === id);
      if (ext) ext.desc = e.target.value;
    });
  });

  cont.querySelectorAll('.costo').forEach(input => {
    input.addEventListener('input', (e) => {
      const id = parseInt(e.target.dataset.id);
      const ext = extras.find(x => x.id === id);
      if (ext) ext.monto = parseFloat(e.target.value) || 0;
      actualizarTotales();
    });
  });

  cont.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = parseInt(btn.dataset.id);
      extras = extras.filter(x => x.id !== id);
      renderExtras();
      actualizarTotales();
      haptic(10);
    });
  });
}

function calcularTotalExtras() {
  return extras.reduce((sum, ext) => sum + (Number(ext.monto) || 0), 0);
}

function calcularTotalInventario() {
  return ventasInventario.reduce((sum, v) => sum + (v.precio * v.cantidad), 0);
}

function actualizarTotales() {
  const totalExtras = calcularTotalExtras();
  const totalInventario = calcularTotalInventario();
  const totalGlobal = reparacionesData.total + totalExtras + totalInventario;
  
  document.getElementById('totalGlobal').textContent = formatBs(totalGlobal);
}

document.getElementById('btnAddExtra')?.addEventListener('click', () => {
  haptic(10);
  agregarExtra();
});

document.getElementById('btnGuardarCierre')?.addEventListener('click', async () => {
  haptic(15);
  const totalExtras = calcularTotalExtras();
  const totalInventario = calcularTotalInventario();
  const totalGlobal = reparacionesData.total + totalExtras + totalInventario;

  if (totalGlobal === 0) {
    toast('No hay ingresos para guardar', 'warning');
    return;
  }

  try {
    await addDoc(collection(db, 'cierres'), {
      fecha: serverTimestamp(),
      realizadoPor: sesion.nombre,
      reparaciones: reparacionesData,
      ventasInventario: ventasInventario,
      extras: extras,
      totalInventario: totalInventario,
      totalExtras,
      totalGlobal
    });

    // Descontar stock del inventario
    for (const v of ventasInventario) {
      const prodRef = doc(db, 'productos', v.id);
      await updateDoc(prodRef, {
        stock: increment(-v.cantidad)
      });
    }

    toast('Cierre guardado y stock actualizado', 'success');
  } catch (error) {
    console.error(error);
    toast('Error al guardar cierre', 'error');
  }
});

document.getElementById('btnEnviarWhatsApp')?.addEventListener('click', () => {
  haptic(15);
  const totalExtras = calcularTotalExtras();
  const totalInventario = calcularTotalInventario();
  const totalGlobal = reparacionesData.total + totalExtras + totalInventario;

  let msg = `*CIERRE DE CAJA - DR. XIAOMI*\n`;
  msg += `📅 Fecha: ${new Date().toLocaleDateString('es-BO')}\n`;
  msg += `👤 Por: ${sesion.nombre}\n\n`;

  msg += `*🔧 REPARACIONES (${reparacionesData.cantidad})*\n`;
  msg += `Total: ${formatBs(reparacionesData.total)}\n`;
  msg += `💵 Efectivo: ${formatBs(reparacionesData.efectivo)}\n`;
  msg += `📱 QR: ${formatBs(reparacionesData.qr)}\n`;
  msg += `🏦 Transf: ${formatBs(reparacionesData.transf)}\n\n`;

  if (ventasInventario.length > 0) {
    msg += `*🛒 ACCESORIOS VENDIDOS*\n`;
    ventasInventario.forEach(v => {
      msg += `- ${v.cantidad}x ${v.nombre}: ${formatBs(v.precio * v.cantidad)}\n`;
    });
    msg += `\n`;
  }

  if (extras.length > 0) {
    msg += `*✍️ VENTAS EXTRAS*\n`;
    extras.forEach(ext => {
      if (ext.desc || ext.monto > 0) msg += `- ${ext.desc || 'Venta'}: ${formatBs(ext.monto)}\n`;
    });
    msg += `\n`;
  }

  msg += `*📊 TOTAL DEL DÍA: ${formatBs(totalGlobal)}*`;

  const telDueno = '59175959450'; 
  window.open(`https://wa.me/${telDueno}?text=${encodeURIComponent(msg)}`, '_blank');
});

// Red de seguridad
setTimeout(() => {
  document.getElementById('appLoader')?.classList.add('hidden');
}, 2500);
