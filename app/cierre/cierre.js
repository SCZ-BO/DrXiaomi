/* ============================================================
   DR. XIAOMI · CIERRE DE CAJA (CON GANANCIAS)
   Archivo: app/cierre/cierre.js
   ============================================================ */

import { requireAuth, logout } from '/js/app-auth.js';
import { toast, haptic, initTheme, formatBs, escapeHtml } from '/js/app-ui.js';
import { db } from '/js/firebase.js';
import { 
  collection, query, where, getDocs, addDoc, serverTimestamp, 
  doc, updateDoc, increment 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

initTheme();
let sesion = null;
let reparacionesData = { total: 0, efectivo: 0, qr: 0, transf: 0, cantidad: 0, ganancia: 0 };
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

    reparacionesData = { total: 0, efectivo: 0, qr: 0, transf: 0, cantidad: 0, ganancia: 0 };

    snapshot.forEach(doc => {
      const d = doc.data();
      let fechaD = d.fechaEntrega || d.fecha;
      if (fechaD && typeof fechaD.toDate === 'function') fechaD = fechaD.toDate();
      else if (fechaD) fechaD = new Date(fechaD);

      if (fechaD >= hoy && fechaD < manana) {
        const monto = Number(d.montoCobrado) || 0;
        const costoRepuesto = Number(d.costoRepuesto) || 0; // 🔥 LEEMOS EL COSTO
        const ganancia = monto - costoRepuesto; // 🔥 CALCULAMOS LA GANANCIA
        const metodo = (d.metodoPago || 'Efectivo').toLowerCase();

        reparacionesData.total += monto;
        reparacionesData.ganancia += ganancia;
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
      <button class="producto-btn" data-id="${p.id}" data-nombre="${escapeHtml(p.nombre)}" data-precio="${p.precio}" data-costo="${p.costo || 0}" data-stock="${p.stock}" style="opacity: ${p.stock <= 0 ? 0.4 : 1};" ${p.stock <= 0 ? 'disabled' : ''}>
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
        const costo = parseFloat(btn.dataset.costo) || 0; // 🔥 LEEMOS EL COSTO
        
        const existe = ventasInventario.find(v => v.id === id);
        if (existe) existe.cantidad++;
        else ventasInventario.push({ id, nombre, precio, costo, cantidad: 1 }); // 🔥 LO GUARDAMOS
        
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
  extras.push({ id, desc: '', monto: 0, costo: 0 }); // 🔥 AGREGAMOS COSTO
  renderExtras();
}

function renderExtras() {
  const cont = document.getElementById('listaExtras');
  cont.innerHTML = '';

  extras.forEach(ext => {
    const div = document.createElement('div');
    div.className = 'item-extra';
    div.innerHTML = `
      <input type="text" placeholder="Descripción" value="${escapeHtml(ext.desc)}" data-id="${ext.id}" class="desc">
      <input type="number" placeholder="Venta Bs." value="${ext.monto || ''}" data-id="${ext.id}" class="monto" inputmode="decimal">
      <input type="number" placeholder="Costo Bs." value="${ext.costo || ''}" data-id="${ext.id}" class="costo" inputmode="decimal">
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

  cont.querySelectorAll('.monto').forEach(input => {
    input.addEventListener('input', (e) => {
      const id = parseInt(e.target.dataset.id);
      const ext = extras.find(x => x.id === id);
      if (ext) ext.monto = parseFloat(e.target.value) || 0;
      actualizarTotales();
    });
  });

  cont.querySelectorAll('.costo').forEach(input => {
    input.addEventListener('input', (e) => {
      const id = parseInt(e.target.dataset.id);
      const ext = extras.find(x => x.id === id);
      if (ext) ext.costo = parseFloat(e.target.value) || 0;
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

// 🔥 CALCULAR GANANCIAS
function calcularGananciaTotal() {
  const gananciaReparaciones = reparacionesData.ganancia;
  
  const gananciaInventario = ventasInventario.reduce((sum, v) => 
    sum + ((v.precio - v.costo) * v.cantidad), 0);
    
  const gananciaExtras = extras.reduce((sum, ext) => 
    sum + (ext.monto - ext.costo), 0);

  return gananciaReparaciones + gananciaInventario + gananciaExtras;
}

function actualizarTotales() {
  const totalExtras = calcularTotalExtras();
  const totalInventario = calcularTotalInventario();
  const totalGlobal = reparacionesData.total + totalExtras + totalInventario;
  
  const gananciaGlobal = calcularGananciaTotal(); // 🔥 CALCULAMOS LA GANANCIA

  document.getElementById('totalGlobal').textContent = formatBs(totalGlobal);
  document.getElementById('gananciaGlobal').textContent = formatBs(gananciaGlobal); // 🔥 MOSTRAMOS LA GANANCIA
}

document.getElementById('btnAddExtra')?.addEventListener('click', () => {
  haptic(10);
  agregarExtra();
});

// 🔥 GUARDAR CIERRE Y DESCONTAR STOCK
document.getElementById('btnGuardarCierre')?.addEventListener('click', async () => {
  haptic(15);
  const totalExtras = calcularTotalExtras();
  const totalInventario = calcularTotalInventario();
  const totalGlobal = reparacionesData.total + totalExtras + totalInventario;
  const gananciaGlobal = calcularGananciaTotal();

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
      totalGlobal,
      gananciaGlobal // 🔥 GUARDAMOS LA GANANCIA
    });

    for (const v of ventasInventario) {
      const prodRef = doc(db, 'productos', v.id);
      await updateDoc(prodRef, {
        stock: increment(-v.cantidad)
      });
    }

    toast('Cierre guardado y stock actualizado', 'success');
    setTimeout(() => window.location.href = '/app/', 1500);

  } catch (error) {
    console.error(error);
    toast('Error al guardar cierre', 'error');
  }
});

// 🔥 ENVIAR CIERRE POR WHATSAPP (CON PDF MEJORADO)
document.getElementById('btnEnviarWhatsApp')?.addEventListener('click', async () => {
  haptic(15);
  const totalExtras = calcularTotalExtras();
  const totalInventario = calcularTotalInventario();
  const totalGlobal = reparacionesData.total + totalExtras + totalInventario;
  const gananciaGlobal = calcularGananciaTotal();

  if (totalGlobal === 0) {
    toast('No hay ingresos para generar el cierre', 'warning');
    return;
  }

  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });

    pdf.setFillColor(255, 105, 0);
    pdf.rect(0, 0, 210, 30, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(20);
    pdf.text('DR. XIAOMI SCZ', 14, 15);
    pdf.setFontSize(10);
    pdf.text('Cierre de Caja Diario', 14, 22);

    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(12);
    pdf.text(`Fecha: ${new Date().toLocaleDateString('es-BO')}`, 14, 45);
    pdf.text(`Realizado por: ${sesion.nombre}`, 14, 52);

    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Reparaciones', 14, 65);
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`- Cantidad entregada: ${reparacionesData.cantidad}`, 18, 72);
    pdf.text(`- Total Cobrado: ${formatBs(reparacionesData.total)}`, 18, 79);
    pdf.text(`  Efectivo: ${formatBs(reparacionesData.efectivo)} | QR: ${formatBs(reparacionesData.qr)} | Transf: ${formatBs(reparacionesData.transf)}`, 18, 86);

    let y = 95;

    if (ventasInventario.length > 0) {
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Accesorios Vendidos', 14, y);
      y += 7;
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'normal');
      
      ventasInventario.forEach(v => {
        pdf.text(`- ${v.cantidad}x ${v.nombre}: ${formatBs(v.precio * v.cantidad)}`, 18, y);
        y += 7;
      });
      y += 5;
    }

    if (extras.length > 0) {
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Ventas Extras', 14, y);
      y += 7;
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'normal');
      
      extras.forEach(ext => {
        if (ext.desc || ext.monto > 0) {
          pdf.text(`- ${ext.desc || 'Venta'}: ${formatBs(ext.monto)}`, 18, y);
          y += 7;
        }
      });
      y += 5;
    }

    // 🔥 TOTAL GLOBAL
    pdf.setFillColor(240, 240, 240);
    pdf.rect(14, y, 182, 20, 'F');
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(255, 105, 0);
    pdf.text(`TOTAL DEL DÍA: ${formatBs(totalGlobal)}`, 105, y + 13, { align: 'center' });

    // 🔥 GANANCIA NETA
    pdf.setFillColor(16, 185, 129); // Verde
    pdf.rect(14, y + 22, 182, 20, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.text(`GANANCIA NETA: ${formatBs(gananciaGlobal)}`, 105, y + 35, { align: 'center' });

    pdf.setFontSize(8);
    pdf.setTextColor(120, 120, 120);
    pdf.text('Generado automáticamente por DR. Xiaomi', 105, 280, { align: 'center' });

    const nombreArchivo = `Cierre_${new Date().toISOString().slice(0,10)}.pdf`;
    pdf.save(nombreArchivo);
    toast('PDF generado. Adjúntalo en WhatsApp.', 'success');

    setTimeout(() => {
      const mensaje = `Hola, le envío el Cierre de Caja del día ${new Date().toLocaleDateString('es-BO')}.\n\n*Total del día: ${formatBs(totalGlobal)}*\n*Ganancia Neta: ${formatBs(gananciaGlobal)}*\n\nLe adjunto el PDF con el detalle.`;
      const telDueno = '59175959450';
      window.open(`https://wa.me/${telDueno}?text=${encodeURIComponent(mensaje)}`, '_blank');
    }, 1000);

  } catch (error) {
    console.error('Error generando PDF:', error);
    toast('Error al generar el PDF', 'error');
  }
});

// Red de seguridad
setTimeout(() => {
  document.getElementById('appLoader')?.classList.add('hidden');
}, 2500);
