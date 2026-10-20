/* ============================================================
   DR. XIAOMI · VENTA DIRECTA
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
  configurarEventos();
  agregarServicio();
});

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
  document.getElementById('btnCerrarModal')?.addEventListener('click', () => window.location.href = '/app/');
  document.getElementById('btnGenerarPDF')?.addEventListener('click', () => {
    haptic(15);
    generarPDFVenta(ventaActual);
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
    const fecha = new Date();
    const numeroRecibo = `VNT-${String(fecha.getDate()).padStart(2,'0')}${String(fecha.getMonth()+1).padStart(2,'0')}${String(fecha.getFullYear()).slice(-2)}-${String(fecha.getHours()).padStart(2,'0')}${String(fecha.getMinutes()).padStart(2,'0')}`;

    ventaActual = { numeroRecibo, cliente: clienteNombre, telefono: clienteTelefono, servicios, total, metodoPago };

    await addDoc(collection(db, 'recibos'), {
      ...ventaActual,
      marca: 'Venta Directa',
      modelo: 'Mostrador',
      adelanto: 0,
      saldo: 0,
      estadoOrden: 'entregado',
      tipo: 'venta_directa',
      montoCobrado: total,
      fechaEntrega: serverTimestamp(),
      fecha: serverTimestamp(),
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

// Generación de PDF
async function generarPDFVenta(venta) {
  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    
    // Encabezado simple
    pdf.setFillColor(230, 81, 0);
    pdf.rect(0, 0, 210, 30, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(20);
    pdf.text('DR. XIAOMI SCZ', 14, 15);
    pdf.setFontSize(10);
    pdf.text('Comprobante de Venta Directa', 14, 22);

    // Datos
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
    pdf.text(new Date().toLocaleString('es-BO'), 40, 66);

    // Tabla
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

    pdf.save(`Venta_${venta.numeroRecibo}.pdf`);
    
    toast('PDF generado y descargado', 'success');
    setTimeout(() => window.location.href = '/app/', 1500);

  } catch (error) {
    console.error('Error generando PDF:', error);
    toast('Error al generar PDF', 'error');
  }
}
