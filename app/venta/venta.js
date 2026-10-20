/* ============================================================
   DR. XIAOMI · VENTA DIRECTA (VISUAL + STOCK + FECHA)
   Archivo: app/venta/venta.js
   ============================================================ */

import { requireAuth } from '/js/app-auth.js';
import { toast, haptic, initTheme, formatBs, escapeHtml } from '/js/app-ui.js';
import { db } from '/js/firebase.js';
import { 
  collection, addDoc, serverTimestamp, getDocs, 
  updateDoc, doc, increment 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

initTheme();
let sesion = null;
let metodoPago = 'Efectivo';
let ventaActual = null;
let inventario = []; 

requireAuth(async (s) => {
  sesion = s;
  document.getElementById('userInfo').textContent = sesion.nombre;

  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('fechaVenta').value = hoy;

  await cargarInventario(); 
  configurarEventos();
  agregarServicio(); 
});

async function cargarInventario() {
  try {
    const snapshot = await getDocs(collection(db, 'productos'));
    inventario = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error("Error al cargar inventario:", error);
  }
}

function configurarEventos() {
  document.getElementById('backBtn')?.addEventListener('click', () => {
    if (confirm('¿Salir? Los datos no guardados se perderán.')) window.location.href = '/app/';
  });

  document.getElementById('addServicio')?.addEventListener('click', () => {
    haptic(10);
    agregarServicio();
  });

  // 🔥 Botón para abrir el buscador visual
  document.getElementById('btnAbrirInventario')?.addEventListener('click', () => {
    haptic(10);
    abrirModalInventario();
  });

  document.getElementById('metodosGroup')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.metodo-btn');
    if (!btn) return;
    haptic(10);
    document.querySelectorAll('.metodo-btn').forEach(b => b.classList.remove('activo'));
    btn.classList.add('activo');
    metodoPago = btn.dataset.metodo;
    document.getElementById('metodoPago').value = metodoPago;
  });

  document.getElementById('btnGenerarVenta')?.addEventListener('click', registrarVenta);

  document.getElementById('btnCerrarModal')?.addEventListener('click', () => {
    haptic(10);
    document.getElementById('clienteNombre').value = '';
    document.getElementById('clienteTelefono').value = '';
    const hoy = new Date().toISOString().split('T')[0];
    document.getElementById('fechaVenta').value = hoy;
    document.getElementById('serviciosList').innerHTML = '';
    agregarServicio();
    calcularTotal();
    window.location.href = '/app/';
  });

  document.getElementById('btnGenerarPDF')?.addEventListener('click', () => {
    haptic(15);
    if (ventaActual) generarPDFVenta(ventaActual);
  });
}

// 🔥 FUNCIÓN QUE MUESTRA LAS FOTOS EN EL MODAL
function abrirModalInventario() {
  const modal = document.getElementById('modalInventario');
  const grid = document.getElementById('modalInvGrid');
  
  if (inventario.length === 0) {
    toast('El inventario está vacío', 'warning');
    return;
  }

  grid.innerHTML = inventario.map(p => {
    const stock = Number(p.stock) || 0;
    const imgUrl = p.foto || 'https://via.placeholder.com/100?text=Sin+Foto';
    return `
      <div class="inv-card" onclick="seleccionarProductoVenta('${p.id}')" style="border: 1px solid var(--border); border-radius: 8px; padding: 10px; display: flex; gap: 10px; align-items: center; ${stock <= 0 ? 'opacity: 0.5; pointer-events: none;' : 'cursor: pointer;'}">
        <img src="${imgUrl}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 6px;">
        <div style="flex: 1;">
          <div style="font-weight: 700; font-size: 13px;">${escapeHtml(p.nombre)}</div>
          <div style="font-size: 11px; color: var(--brand); font-weight: 700;">${formatBs(p.precio)}</div>
          <div style="font-size: 10px; color: var(--text-mute);">Stock: ${stock}</div>
        </div>
        <i class="fas fa-plus-circle" style="color: var(--brand); font-size: 20px;"></i>
      </div>
    `;
  }).join('');

  modal.classList.add('show');
}

// 🔥 FUNCIÓN QUE SE EJECUTA AL TOCAR UN PRODUCTO
window.seleccionarProductoVenta = function(id) {
  const prod = inventario.find(p => p.id === id);
  if (!prod) return;

  haptic(15);
  const list = document.getElementById('serviciosList');
  const primerInput = list.querySelector('.servicio-desc');
  const primerCosto = list.querySelector('.servicio-costo');
  
  if (primerInput && !primerInput.value) {
    primerInput.value = prod.nombre;
    primerCosto.value = prod.precio;
  } else {
    agregarServicio(prod.nombre, prod.precio);
  }
  
  calcularTotal();
  document.getElementById('modalInventario').classList.remove('show');
  toast(`${prod.nombre} agregado`, 'success', 1000);
};

function agregarServicio(desc = '', costo = '') {
  const list = document.getElementById('serviciosList');
  const div = document.createElement('div');
  div.className = 'servicio-item';
  div.innerHTML = `
    <input type="text" class="servicio-desc" placeholder="Ej. Cargador 20W" value="${desc}" autocomplete="off">
    <input type="number" class="servicio-costo" placeholder="Bs." step="0.01" min="0" value="${costo}">
    <button type="button" class="removeServicio"><i class="fas fa-times"></i></button>
  `;
  
  div.querySelector('.removeServicio').addEventListener('click', () => {
    if (list.querySelectorAll('.servicio-item').length > 1) {
      haptic(10);
      div.remove();
      calcularTotal();
    }
  });

  div.querySelector('.servicio-costo').addEventListener('input', calcularTotal);
  list.appendChild(div);
}

function calcularTotal() {
  let total = 0;
  document.querySelectorAll('.servicio-costo').forEach(input => {
    total += parseFloat(input.value) || 0;
  });
  document.getElementById('totalDisplay').textContent = formatBs(total);
}

async function registrarVenta() {
  const clienteNombre = document.getElementById('clienteNombre').value.trim() || 'Cliente Ocasional';
  const clienteTelefono = document.getElementById('clienteTelefono').value.trim();
  const fechaSeleccionada = document.getElementById('fechaVenta').value;

  if (!fechaSeleccionada) {
    toast('Selecciona una fecha válida', 'error');
    return;
  }

  let servicios = [];
  let total = 0;
  let itemsVendidos = []; 

  document.querySelectorAll('.servicio-item').forEach(item => {
    const desc = item.querySelector('.servicio-desc').value.trim();
    const costo = parseFloat(item.querySelector('.servicio-costo').value) || 0;
    if (desc && costo > 0) {
      servicios.push({ desc, costo });
      total += costo;
      
      const prodInventario = inventario.find(p => p.nombre === desc);
      if (prodInventario) {
        itemsVendidos.push(prodInventario.id);
      }
    }
  });

  if (servicios.length === 0) {
    toast('Agrega al menos un producto con su precio', 'error');
    return;
  }

  haptic(20);
  const btn = document.getElementById('btnGenerarVenta');
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';
  btn.disabled = true;

  try {
    const fechaObj = new Date(fechaSeleccionada + 'T12:00:00'); 
    const numeroRecibo = `VNT-${String(fechaObj.getDate()).padStart(2,'0')}${String(fechaObj.getMonth()+1).padStart(2,'0')}${String(fechaObj.getFullYear()).slice(-2)}-${String(new Date().getHours()).padStart(2,'0')}${String(new Date().getMinutes()).padStart(2,'0')}`;

    ventaActual = { numeroRecibo, cliente: clienteNombre, telefono: clienteTelefono, servicios, total, metodoPago, fechaReal: fechaObj };

    await addDoc(collection(db, 'recibos'), {
      ...ventaActual,
      marca: 'Venta Directa',
      modelo: 'Mostrador',
      adelanto: 0,
      saldo: 0,
      estadoOrden: 'entregado',
      tipo: 'venta_directa',
      montoCobrado: total,
      fechaEntrega: fechaObj,
      fecha: fechaObj,
      creadoPor: sesion.nombre
    });

    if (itemsVendidos.length > 0) {
      const promesasStock = itemsVendidos.map(id => 
        updateDoc(doc(db, 'productos', id), { stock: increment(-1) })
      );
      await Promise.all(promesasStock);
    }

    document.getElementById('successTotal').textContent = `Total: ${formatBs(total)}`;
    document.getElementById('successModal').classList.add('show');
    
    btn.innerHTML = '<i class="fas fa-check"></i> Registrar Venta';
    btn.disabled = false;

  } catch (error) {
    console.error(error);
    toast('Error al registrar venta', 'error');
    btn.innerHTML = '<i class="fas fa-check"></i> Registrar Venta';
    btn.disabled = false;
  }
}

// ============================================================
// GENERACIÓN DE PDF
// ============================================================
async function generarPDFVenta(venta) {
  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    
    pdf.setFillColor(230, 81, 0);
    pdf.rect(0, 0, 210, 30, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(20);
    pdf.text('DR. XIAOMI SCZ', 14, 15);
    pdf.setFontSize(10);
    pdf.text('Comprobante de Venta Directa', 14, 22);

    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(12);
    pdf.text('Cliente:', 14, 45);
    pdf.setFontSize(11);
    pdf.text(venta.cliente, 40, 45);
    
    if (venta.telefono) {
      pdf.text('Teléfono:', 14, 52);
      pdf.text(venta.telefono, 40, 52);
    }

    pdf.text('Recibo N°:', 14, 59);
    pdf.text(venta.numeroRecibo, 40, 59);

    pdf.text('Fecha:', 14, 66);
    const fechaStr = venta.fechaReal.toLocaleDateString('es-BO');
    pdf.text(fechaStr, 40, 66);

    const body = venta.servicios.map(s => [s.desc, formatBs(s.costo)]);
    pdf.autoTable({
      startY: 75,
      head: [['Producto / Servicio', 'Costo']],
      body: body,
      styles: { fontSize: 10, cellPadding: 3 },
      headStyles: { fillColor: [230, 81, 0] },
      columnStyles: { 1: { halign: 'right' } }
    });

    let finalY = pdf.lastAutoTable.finalY + 10;
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`TOTAL: ${formatBs(venta.total)}`, 210 - 14, finalY, { align: 'right' });
    
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Método de pago: ${venta.metodoPago}`, 14, finalY);

    pdf.setFontSize(8);
    pdf.setTextColor(120, 120, 120);
    pdf.text('Gracias por su compra · DR. XIAOMI SCZ', 105, 280, { align: 'center' });

    pdf.save(`Venta_${venta.numeroRecibo}.pdf`);
    
    toast('PDF generado y descargado', 'success');
    setTimeout(() => window.location.href = '/app/', 1500);

  } catch (error) {
    console.error('Error generando PDF:', error);
    toast('Error al generar PDF', 'error');
  }
}
