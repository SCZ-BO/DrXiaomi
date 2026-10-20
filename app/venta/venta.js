/* ============================================================
   DR. XIAOMI · VENTA DIRECTA (CON FECHA RETROACTIVA)
   Archivo: app/venta/venta.js
   ============================================================ */

import { requireAuth } from '/js/app-auth.js';
import { toast, haptic, initTheme, formatBs, escapeHtml } from '/js/app-ui.js';
import { db } from '/js/firebase.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

initTheme();
let sesion = null;
let metodoPago = 'Efectivo';
let ventaActual = null;

requireAuth((s) => {
  sesion = s;
  document.getElementById('userInfo').textContent = sesion.nombre;

  // 🔥 Poner la fecha de hoy por defecto en el input
  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('fechaVenta').value = hoy;

  configurarEventos();
  agregarServicio();
});

function configurarEventos() {
  // Botón Volver
  document.getElementById('backBtn')?.addEventListener('click', () => {
    if (confirm('¿Salir? Los datos no guardados se perderán.')) window.location.href = '/app/';
  });

  // Botón Añadir otro producto
  document.getElementById('addServicio')?.addEventListener('click', () => {
    haptic(10);
    agregarServicio();
  });

  // Botones de método de pago
  document.getElementById('metodosGroup')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.metodo-btn');
    if (!btn) return;
    haptic(10);
    document.querySelectorAll('.metodo-btn').forEach(b => b.classList.remove('activo'));
    btn.classList.add('activo');
    metodoPago = btn.dataset.metodo;
    document.getElementById('metodoPago').value = metodoPago;
  });

  // Registrar Venta
  document.getElementById('btnGenerarVenta')?.addEventListener('click', registrarVenta);

  // Cerrar Modal (Venta Rápida) - LIMPIA LOS CAMPOS
  document.getElementById('btnCerrarModal')?.addEventListener('click', () => {
    haptic(10);
    document.getElementById('clienteNombre').value = '';
    document.getElementById('clienteTelefono').value = '';
    
    // Restaurar la fecha a hoy por si era retroactiva
    const hoy = new Date().toISOString().split('T')[0];
    document.getElementById('fechaVenta').value = hoy;

    document.getElementById('serviciosList').innerHTML = '';
    agregarServicio();
    calcularTotal();
    window.location.href = '/app/';
  });

  // Generar PDF (desde el modal)
  document.getElementById('btnGenerarPDF')?.addEventListener('click', () => {
    haptic(15);
    if (ventaActual) {
      generarPDFVenta(ventaActual);
    }
  });
}

function agregarServicio() {
  const list = document.getElementById('serviciosList');
  const div = document.createElement('div');
  div.className = 'servicio-item';
  div.innerHTML = `
    <input type="text" class="servicio-desc" placeholder="Ej. Cargador 20W">
    <input type="number" class="servicio-costo" placeholder="Bs." step="0.01" min="0">
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
  div.querySelector('.servicio-desc').focus();
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
  const fechaSeleccionada = document.getElementById('fechaVenta').value; // 🔥 Fecha del input

  if (!fechaSeleccionada) {
    toast('Selecciona una fecha válida', 'error');
    return;
  }

  let servicios = [];
  let total = 0;

  document.querySelectorAll('.servicio-item').forEach(item => {
    const desc = item.querySelector('.servicio-desc').value.trim();
    const costo = parseFloat(item.querySelector('.servicio-costo').value) || 0;
    if (desc && costo > 0) {
      servicios.push({ desc, costo });
      total += costo;
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
    // 🔥 Usar la fecha seleccionada (Retroactiva o de Hoy)
    const fechaObj = new Date(fechaSeleccionada + 'T12:00:00'); 
    const numeroRecibo = `VNT-${String(fechaObj.getDate()).padStart(2,'0')}${String(fechaObj.getMonth()+1).padStart(2,'0')}${String(fechaObj.getFullYear()).slice(-2)}-${String(new Date().getHours()).padStart(2,'0')}${String(new Date().getMinutes()).padStart(2,'0')}`;

    ventaActual = { numeroRecibo, cliente: clienteNombre, telefono: clienteTelefono, servicios, total, metodoPago, fechaReal: fechaObj };

    // Guardar en Firebase
    await addDoc(collection(db, 'recibos'), {
      ...ventaActual,
      marca: 'Venta Directa',
      modelo: 'Mostrador',
      adelanto: 0,
      saldo: 0,
      estadoOrden: 'entregado',
      tipo: 'venta_directa',
      montoCobrado: total,
      fechaEntrega: fechaObj, // 🔥 Fecha seleccionada
      fecha: fechaObj,        // 🔥 Fecha seleccionada
      creadoPor: sesion.nombre
    });

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
// GENERACIÓN DE PDF (Solo si el cliente lo pide)
// ============================================================
async function generarPDFVenta(venta) {
  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    
    // Encabezado
    pdf.setFillColor(230, 81, 0);
    pdf.rect(0, 0, 210, 30, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(20);
    pdf.text('DR. XIAOMI SCZ', 14, 15);
    pdf.setFontSize(10);
    pdf.text('Comprobante de Venta Directa', 14, 22);

    // Datos del Cliente
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

    // 🔥 Fecha del PDF (la fecha seleccionada, no la de hoy)
    pdf.text('Fecha:', 14, 66);
    const fechaStr = venta.fechaReal.toLocaleDateString('es-BO');
    pdf.text(fechaStr, 40, 66);

    // Tabla de Productos
    const body = venta.servicios.map(s => [s.desc, formatBs(s.costo)]);
    pdf.autoTable({
      startY: 75,
      head: [['Producto / Servicio', 'Costo']],
      body: body,
      styles: { fontSize: 10, cellPadding: 3 },
      headStyles: { fillColor: [230, 81, 0] },
      columnStyles: { 1: { halign: 'right' } }
    });

    // Total
    let finalY = pdf.lastAutoTable.finalY + 10;
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`TOTAL: ${formatBs(venta.total)}`, 210 - 14, finalY, { align: 'right' });
    
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Método de pago: ${venta.metodoPago}`, 14, finalY);

    // Footer
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
