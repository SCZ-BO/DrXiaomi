// /app/cierre/cierre.js
import { requireAuth, logout } from '../js/app-auth.js';
import { toast, haptic, initTheme, toggleTheme, formatBs, escapeHtml } from '../js/app-ui.js';
import { db } from '../js/firebase.js';
import { 
  collection, query, where, onSnapshot, addDoc, serverTimestamp, 
  doc, updateDoc, increment, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

initTheme();
let sesion = null;
let reparacionesData = { total: 0, efectivo: 0, qr: 0, cantidad: 0, ganancia: 0 };
let ventasAccesorios = { total: 0, cantidad: 0, ganancia: 0, items: [] };
let ventasExtras = { total: 0, cantidad: 0, ganancia: 0, items: [] };
let extrasManuales = [];
let extrasId = 0;

const hoy = new Date();
hoy.setHours(0, 0, 0, 0);
const hoyStr = hoy.toDateString();

requireAuth((s) => {
  sesion = s;
  
  document.getElementById('backBtn')?.addEventListener('click', () => window.location.href = '/app/');
  document.getElementById('btnTema')?.addEventListener('click', () => { haptic(10); toggleTheme(); });

  iniciarListeners();
  
  setTimeout(() => { document.getElementById('appLoader')?.classList.add('hidden'); }, 1500);
});

function iniciarListeners() {
  // 1. Listener de Reparaciones
  const qRecibos = query(collection(db, 'recibos'), where('estadoOrden', '==', 'entregado'));
  onSnapshot(qRecibos, (snapshot) => {
    reparacionesData = { total: 0, efectivo: 0, qr: 0, cantidad: 0, ganancia: 0 };
    const detalleReparaciones = [];

    snapshot.forEach(doc => {
      const d = doc.data();
      let fechaD = d.fechaEntrega || d.fecha;
      if (fechaD && typeof fechaD.toDate === 'function') fechaD = fechaD.toDate();
      else if (fechaD) fechaD = new Date(fechaD);

      if (fechaD && fechaD.toDateString() === hoyStr) {
        const monto = Number(d.montoCobrado) || 0;
        const costo = Number(d.costoRepuesto) || 0;
        const metodo = (d.metodoPago || 'Efectivo').toLowerCase();

        reparacionesData.total += monto;
        reparacionesData.ganancia += (monto - costo);
        reparacionesData.cantidad++;

        if (metodo.includes('efectivo')) reparacionesData.efectivo += monto;
        else if (metodo.includes('qr')) reparacionesData.qr += monto;

        detalleReparaciones.push({
          concepto: `${d.marca} ${d.modelo} - ${d.cliente}`,
          monto: monto,
          metodo: d.metodoPago || 'Efectivo',
          hora: fechaD.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })
        });
      }
    });

    document.getElementById('cantReparaciones').textContent = reparacionesData.cantidad;
    document.getElementById('totalReparaciones').textContent = formatBs(reparacionesData.total);
    document.getElementById('totalEfectivo').textContent = formatBs(reparacionesData.efectivo);
    document.getElementById('totalQR').textContent = formatBs(reparacionesData.qr);

    renderizarDesglose('reparaciones', detalleReparaciones);
    actualizarTotales();
  });

  // 2. Listener de Ventas (Muestra todos los movimientos de la colección 'ventas')
  const qVentas = query(collection(db, 'ventas'), orderBy('fecha', 'desc'), limit(100));
  onSnapshot(qVentas, (snapshot) => {
    ventasAccesorios = { total: 0, cantidad: 0, ganancia: 0, items: [] };

    snapshot.forEach(doc => {
      const d = doc.data();
      let fechaD = d.fecha;
      if (fechaD && typeof fechaD.toDate === 'function') fechaD = fechaD.toDate();
      else if (fechaD) fechaD = new Date(fechaD);

      if (fechaD && fechaD.toDateString() === hoyStr) {
        const monto = Number(d.monto) || 0;
        const costo = Number(d.costo) || 0;
        
        ventasAccesorios.total += monto;
        ventasAccesorios.cantidad++;
        ventasAccesorios.ganancia += (monto - costo);

        ventasAccesorios.items.push({
          concepto: d.concepto,
          monto: monto,
          metodo: d.metodoPago || 'Efectivo',
          hora: fechaD.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })
        });
      }
    });

    document.getElementById('totalVentasAccesorios').textContent = formatBs(ventasAccesorios.total);
    renderizarDesglose('ventas', ventasAccesorios.items);
    actualizarTotales();
  });

  // 3. Listener de Cierres (Para las ventas extras)
  const qCierres = query(collection(db, 'cierres'), orderBy('fecha', 'desc'), limit(100));
  onSnapshot(qCierres, (snapshot) => {
    ventasExtras = { total: 0, cantidad: 0, ganancia: 0, items: [] };

    snapshot.forEach(doc => {
      const d = doc.data();
      let fechaD = d.fecha;
      if (fechaD && typeof fechaD.toDate === 'function') fechaD = fechaD.toDate();
      else if (fechaD) fechaD = new Date(fechaD);

      if (fechaD && fechaD.toDateString() === hoyStr) {
        if (d.ventasInventario) {
          d.ventasInventario.forEach(v => {
            const monto = v.precio * v.cantidad;
            const costo = v.costo * v.cantidad;
            ventasExtras.total += monto;
            ventasExtras.cantidad++;
            ventasExtras.ganancia += (monto - costo);
            ventasExtras.items.push({
              concepto: `${v.cantidad}x ${v.nombre}`,
              monto: monto,
              metodo: 'Efectivo',
              hora: fechaD.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })
            });
          });
        }
        if (d.extras) {
          d.extras.forEach(e => {
            if (e.monto > 0) {
              ventasExtras.total += e.monto;
              ventasExtras.cantidad++;
              ventasExtras.ganancia += (e.monto - (e.costo || 0));
              ventasExtras.items.push({
                concepto: e.desc || 'Venta Extra',
                monto: Number(e.monto),
                metodo: 'Efectivo',
                hora: fechaD.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })
              });
            }
          });
        }
      }
    });

    document.getElementById('totalVentasExtras').textContent = formatBs(ventasExtras.total);
    renderizarDesglose('extras', ventasExtras.items);
    actualizarTotales();
  });
}

function renderizarDesglose(tipo, items) {
  const contenedor = document.getElementById('listaVentasDelDia');
  if (!contenedor) return;

  let html = '';

  if (tipo === 'reparaciones' && items.length > 0) {
    html += `<div style="font-weight:800; font-size:12px; color:var(--brand-500); margin-bottom:8px;">Reparaciones Entregadas</div>`;
    items.forEach(r => {
      html += `
        <div class="movimiento-item">
          <div class="movimiento-info">
            <div class="movimiento-concepto">${r.concepto}</div>
            <div class="movimiento-metodo">${r.metodo} · ${r.hora}</div>
          </div>
          <div class="movimiento-monto">Bs. ${r.monto.toFixed(2)}</div>
        </div>
      `;
    });
  } else if (tipo === 'ventas' && items.length > 0) {
    html += `<div style="font-weight:800; font-size:12px; color:var(--info-500); margin-bottom:8px; margin-top:12px;">Ventas de Accesorios</div>`;
    items.forEach(v => {
      html += `
        <div class="movimiento-item">
          <div class="movimiento-info">
            <div class="movimiento-concepto">${v.concepto}</div>
            <div class="movimiento-metodo">${v.metodo} · ${v.hora}</div>
          </div>
          <div class="movimiento-monto">Bs. ${v.monto.toFixed(2)}</div>
        </div>
      `;
    });
  } else if (tipo === 'extras' && items.length > 0) {
    html += `<div style="font-weight:800; font-size:12px; color:var(--purple-500); margin-bottom:8px; margin-top:12px;">Ventas Extras</div>`;
    items.forEach(v => {
      html += `
        <div class="movimiento-item">
          <div class="movimiento-info">
            <div class="movimiento-concepto">${v.concepto}</div>
            <div class="movimiento-metodo">${v.metodo} · ${v.hora}</div>
          </div>
          <div class="movimiento-monto">Bs. ${v.monto.toFixed(2)}</div>
        </div>
      `;
    });
  }

  // Aquí está el truco: limpiamos y volvemos a pintar todo desde cero
  // para evitar que se dupliquen los elementos cada vez que se actualiza un listener
  if (contenedor.innerHTML.includes('Reparaciones Entregadas')) {
    contenedor.innerHTML = html + contenedor.innerHTML.split('Reparaciones Entregadas')[1];
  } else if (contenedor.innerHTML.includes('Ventas de Accesorios')) {
    contenedor.innerHTML = contenedor.innerHTML.split('Ventas de Accesorios')[0] + html + contenedor.innerHTML.split('Ventas de Accesorios')[1];
  } else {
    contenedor.innerHTML += html;
  }
}

function actualizarTotales() {
  const totalGlobal = reparacionesData.total + ventasAccesorios.total + ventasExtras.total;
  const gananciaTotal = reparacionesData.ganancia + ventasAccesorios.ganancia + ventasExtras.ganancia;

  const pasajes = parseFloat(document.getElementById('gastoPasajes')?.value) || 0;
  const almuerzo = document.getElementById('toggleAlmuerzo')?.checked ? 20 : 0;
  const totalGastos = pasajes + almuerzo;

  document.getElementById('totalGlobal').textContent = formatBs(totalGlobal);
  document.getElementById('gananciaGlobal').textContent = formatBs(gananciaTotal - totalGastos);
}

document.getElementById('btnAddExtra')?.addEventListener('click', () => { haptic(10); agregarExtra(); });
document.getElementById('gastoPasajes')?.addEventListener('input', actualizarTotales);
document.getElementById('toggleAlmuerzo')?.addEventListener('change', actualizarTotales);

function agregarExtra() {
  const id = extrasId++;
  extrasManuales.push({ id, desc: '', monto: 0, costo: 0 });
  renderExtras();
}

function renderExtras() {
  const cont = document.getElementById('listaExtras');
  if (!cont) return;
  cont.innerHTML = '';

  extrasManuales.forEach(ext => {
    const div = document.createElement('div');
    div.className = 'item-extra';
    div.innerHTML = `
      <input type="text" placeholder="Descripción" value="${escapeHtml(ext.desc)}" data-id="${ext.id}" class="desc">
      <input type="number" placeholder="Venta Bs." value="${ext.monto || ''}" data-id="${ext.id}" class="monto" inputmode="decimal">
      <input type="number" placeholder="Costo Bs." value="${ext.costo || ''}" data-id="${ext.id}" class="costo" inputmode="decimal">
      <button class="btn-remove" data-id="${ext.id}"><img src="/app/icons/eliminar.png" width="18" height="18" alt="X"></button>
    `;
    cont.appendChild(div);
  });

  cont.querySelectorAll('.desc').forEach(input => {
    input.addEventListener('input', (e) => { const id = parseInt(e.target.dataset.id); const ext = extrasManuales.find(x => x.id === id); if (ext) ext.desc = e.target.value; });
  });
  cont.querySelectorAll('.monto').forEach(input => {
    input.addEventListener('input', (e) => { const id = parseInt(e.target.dataset.id); const ext = extrasManuales.find(x => x.id === id); if (ext) ext.monto = parseFloat(e.target.value) || 0; actualizarTotales(); });
  });
  cont.querySelectorAll('.costo').forEach(input => {
    input.addEventListener('input', (e) => { const id = parseInt(e.target.dataset.id); const ext = extrasManuales.find(x => x.id === id); if (ext) ext.costo = parseFloat(e.target.value) || 0; actualizarTotales(); });
  });
  cont.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', () => { const id = parseInt(btn.dataset.id); extrasManuales = extrasManuales.filter(x => x.id !== id); renderExtras(); actualizarTotales(); haptic(10); });
  });
}

// GENERADOR DE PDF
function generarPDF() {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });

  pdf.setFillColor(255, 105, 0); pdf.rect(0, 0, 210, 30, 'F');
  pdf.setTextColor(255, 255, 255); pdf.setFontSize(20); pdf.text('DR. XIAOMI SCZ', 14, 15);
  pdf.setFontSize(10); pdf.text('Cierre de Caja Diario', 14, 22);
  pdf.setTextColor(0, 0, 0); pdf.setFontSize(12);
  pdf.text(`Fecha: ${new Date().toLocaleDateString('es-BO')}`, 14, 45);
  pdf.text(`Realizado por: ${sesion.nombre}`, 14, 52);

  pdf.setFontSize(14); pdf.setFont('helvetica', 'bold'); pdf.text('Reparaciones', 14, 65);
  pdf.setFontSize(11); pdf.setFont('helvetica', 'normal');
  pdf.text(`- Cantidad entregada: ${reparacionesData.cantidad}`, 18, 72);
  pdf.text(`- Total Cobrado: ${formatBs(reparacionesData.total)}`, 18, 79);

  let y = 90;
  if (ventasAccesorios.items.length > 0) {
    pdf.setFontSize(14); pdf.setFont('helvetica', 'bold'); pdf.text('Ventas de Accesorios', 14, y); y += 7;
    pdf.setFontSize(11); pdf.setFont('helvetica', 'normal');
    ventasAccesorios.items.forEach(v => { pdf.text(`- ${v.concepto}: ${formatBs(v.monto)}`, 18, y); y += 7; });
    y += 5;
  }

  if (ventasExtras.items.length > 0) {
    pdf.setFontSize(14); pdf.setFont('helvetica', 'bold'); pdf.text('Ventas Extras', 14, y); y += 7;
    pdf.setFontSize(11); pdf.setFont('helvetica', 'normal');
    ventasExtras.items.forEach(v => { pdf.text(`- ${v.concepto}: ${formatBs(v.monto)}`, 18, y); y += 7; });
    y += 5;
  }

  const totalGlobal = reparacionesData.total + ventasAccesorios.total + ventasExtras.total;
  const gananciaReal = reparacionesData.ganancia + ventasAccesorios.ganancia + ventasExtras.ganancia - (parseFloat(document.getElementById('gastoPasajes')?.value) || 0) - (document.getElementById('toggleAlmuerzo')?.checked ? 20 : 0);

  pdf.setFillColor(240, 240, 240); pdf.rect(14, y, 182, 20, 'F');
  pdf.setFontSize(16); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(255, 105, 0);
  pdf.text(`TOTAL DEL DÍA: ${formatBs(totalGlobal)}`, 105, y + 13, { align: 'center' });

  pdf.setFillColor(16, 185, 129); pdf.rect(14, y + 22, 182, 20, 'F');
  pdf.setTextColor(255, 255, 255); pdf.text(`GANANCIA NETA: ${formatBs(gananciaReal)}`, 105, y + 35, { align: 'center' });

  pdf.setFontSize(8); pdf.setTextColor(120, 120, 120); pdf.text('Generado automáticamente por DR. Xiaomi', 105, 280, { align: 'center' });

  pdf.save(`Cierre_${new Date().toISOString().slice(0,10)}.pdf`);
}

document.getElementById('btnDescargarPDF')?.addEventListener('click', () => {
  haptic(15);
  generarPDF();
  toast('PDF Descargado', 'success');
});

document.getElementById('btnCerrarDia')?.addEventListener('click', async () => {
  haptic(20);
  const totalGlobal = reparacionesData.total + ventasAccesorios.total + ventasExtras.total;
  
  const pasajes = parseFloat(document.getElementById('gastoPasajes')?.value) || 0;
  const almuerzo = document.getElementById('toggleAlmuerzo')?.checked ? 20 : 0;
  const gananciaReal = reparacionesData.ganancia + ventasAccesorios.ganancia + ventasExtras.ganancia - pasajes - almuerzo;

  if (totalGlobal === 0) { toast('No hay ingresos para cerrar el día', 'warning'); return; }

  try {
    await addDoc(collection(db, 'cierres'), {
      fecha: serverTimestamp(), realizadoPor: sesion.nombre,
      reparaciones: reparacionesData, ventasAccesorios: ventasAccesorios, ventasExtras: ventasExtras, extrasManuales: extrasManuales,
      totalGlobal, gananciaReal, gastoPasajes: pasajes, gastoAlmuerzo: almuerzo
    });

    generarPDF();

    const mensaje = `Hola, le envío el Cierre de Caja del día ${new Date().toLocaleDateString('es-BO')}.\n\n*Total del día: ${formatBs(totalGlobal)}*\n*Ganancia Neta: ${formatBs(gananciaReal)}*\n\nLe adjunto el PDF con el detalle.`;
    setTimeout(() => {
      window.open(`https://wa.me/59175589308?text=${encodeURIComponent(mensaje)}`, '_blank');
    }, 1000);

    toast('Día cerrado, PDF generado y listo para enviar.', 'success');
    setTimeout(() => window.location.href = '/app/', 2000);
  } catch (error) { 
    console.error(error); 
    toast('Error al cerrar el día', 'error'); 
  }
});
