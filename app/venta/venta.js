/* ============================================================
   DR. XIAOMI · VENTA DIRECTA (CON STOCK Y FECHA RETROACTIVA)
   Archivo: app/venta/venta.js
   ============================================================ */

import { requireAuth } from '/js/app-auth.js';
import { toast, haptic, initTheme, formatBs, escapeHtml } from '/js/app-ui.js';
import { db } from '/js/firebase.js';
import { 
  collection, addDoc, serverTimestamp, 
  getDocs, updateDoc, doc, increment // 🔥 Importamos esto para el stock
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

initTheme();
let sesion = null;
let metodoPago = 'Efectivo';
let ventaActual = null;
let inventario = []; // 🔥 Guardaremos los productos aquí

requireAuth(async (s) => {
  sesion = s;
  document.getElementById('userInfo').textContent = sesion.nombre;

  // Poner la fecha de hoy por defecto en el input
  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('fechaVenta').value = hoy;

  await cargarInventario(); // 🔥 Cargamos los productos
  configurarEventos();
  agregarServicio();
});

// 🔥 NUEVA FUNCIÓN: Leer productos de la nube
async function cargarInventario() {
  try {
    const snapshot = await getDocs(collection(db, 'productos'));
    inventario = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error("Error al cargar inventario:", error);
    toast('No se pudo cargar el inventario', 'error');
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

function agregarServicio() {
  const list = document.getElementById('serviciosList');
  const div = document.createElement('div');
  div.className = 'servicio-item';
  div.style.position = 'relative';

  // 🔥 Creamos un datalist único para este input para autocompletar
  const listId = `inv-${Date.now()}-${Math.floor(Math.random() * 100)}`;
  let opciones = inventario.filter(p => (Number(p.stock) || 0) > 0).map(p => `
    <option value="${escapeHtml(p.nombre)}" data-precio="${p.precio}" data-id="${p.id}"></option>
  `).join('');

  div.innerHTML = `
    <input type="text" class="servicio-desc" placeholder="Ej. Cargador 20W" list="${listId}" autocomplete="off">
    <datalist id="${listId}">${opciones}</datalist>
    <input type="number" class="servicio-costo" placeholder="Bs." step="0.01" min="0">
    <button type="button" class="removeServicio"><i class="fas fa-times"></i></button>
  `;
  
  const inputDesc = div.querySelector('.servicio-desc');
  const inputCosto = div.querySelector('.servicio-costo');

  // 🔥 MAGIA: Si selecciona un producto del datalist, ponemos su precio
  inputDesc.addEventListener('input', (e) => {
    const valor = e.target.value;
    const prod = inventario.find(p => p.nombre === valor);
    if (prod && !inputCosto.value) {
      inputCosto.value = prod.precio;
      calcularTotal();
    }
  });

  div.querySelector('.removeServicio').addEventListener('click', () => {
    if (list.querySelectorAll('.servicio-item').length > 1) {
      haptic(10);
      div.remove();
      calcularTotal();
    }
  });

  inputCosto.addEventListener('input', calcularTotal);
  list.appendChild(div);
  inputDesc.focus();
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
  let itemsVendidos = []; // 🔥 Para saber qué descontar del stock

  document.querySelectorAll('.servicio-item').forEach(item => {
    const desc = item.querySelector('.servicio-desc').value.trim();
    const costo = parseFloat(item.querySelector('.servicio-costo').value) || 0;
    if (desc && costo > 0) {
      servicios.push({ desc, costo });
      total += costo;
      
      // Si el texto coincide con un producto del inventario, lo guardamos para descontar
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

    // 1. Guardar en Firebase (Recibo)
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

    // 2. 🔥 RESTAR EL STOCK
    if (itemsVendidos.length > 0) {
      const promesasStock = itemsVendidos.map(id => 
        updateDoc(doc(db, 'productos', id), { stock: increment(-1) })
      );
      await Promise.all(promesasStock);
      console.log(`✅ Stock actualizado para ${itemsVendidos.length} producto(s)`);
    }

    // Mostrar Modal de Éxito
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
