/* ============================================================
   DR. XIAOMI · GENERADOR DE PDF ÚNICO
   Archivo: js/cliente-pdf.js
   ============================================================ */

import { CONFIG, sesion, generarNumeroRecibo } from '/js/cliente.js';
import { toast, haptic, formatBs } from '/js/app-ui.js';
import { db, collection, addDoc, serverTimestamp } from '/js/firebase.js'; // Importante para guardar

// Cargar Logo
async function cargarLogoDataUrl() {
  return new Promise((resolve) => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => {
      try { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0); resolve(c.toDataURL('image/png')); } catch (e) { resolve(''); }
    };
    img.onerror = () => resolve(''); img.src = CONFIG.logoUrl;
  });
}

// Cargar QR
async function generarQRDataUrl(texto) {
  return new Promise((resolve) => {
    if (typeof QRCode === 'undefined') { resolve(''); return; }
    const div = document.createElement('div'); div.style.cssText = 'position:absolute;left:-9999px;';
    document.body.appendChild(div);
    try {
      new QRCode(div, { text: texto, width: 256, height: 256, correctLevel: QRCode.CorrectLevel.M });
      setTimeout(() => {
        const canvas = div.querySelector('canvas'), img = div.querySelector('img');
        let dataUrl = canvas ? canvas.toDataURL('image/png') : (img && img.src ? img.src : '');
        div.remove(); resolve(dataUrl);
      }, 200);
    } catch (e) { div.remove(); resolve(''); }
  });
}

// LA FUNCIÓN MÁGICA
export async function generarPDFUnificado(datosRecibo, accion = 'guardar') {
  try {
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error("Espera un momento, cargando librerías...");

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, H = 297, M = 15, CW = W - M * 2; let y = 0;

    const naranja = [255, 105, 0];
    const grisFondo = [248, 248, 248];
    const textoOscuro = [30, 30, 30];
    const textoMedio = [100, 100, 100];

    const [logoDataUrl, qrDataUrl] = await Promise.all([
      cargarLogoDataUrl(), 
      generarQRDataUrl(`${CONFIG.urlApp}/?recibo=${datosRecibo.numeroRecibo}`)
    ]);

    // --- HEADER ---
    pdf.setFillColor(...naranja);
    pdf.rect(0, 0, W, 40, 'F');
    if (logoDataUrl) {
      pdf.setFillColor(255, 255, 255);
      pdf.circle(M + 12, 20, 11, 'F');
      pdf.addImage(logoDataUrl, 'PNG', M + 2, 10, 20, 20);
    }
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(22);
    pdf.text(CONFIG.nombreTienda, M + 28, 16);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.text(CONFIG.eslogan, M + 28, 22);
    pdf.text(`${CONFIG.direccion} · Tel: ${CONFIG.telefono}`, M + 28, 28);

    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(W - M - 60, 8, 60, 24, 3, 3, 'F');
    pdf.setTextColor(...naranja);
    pdf.setFont('helvetica', 'bold');
    pdf.text('RECIBO N°', W - M - 4, 14, { align: 'right' });
    pdf.text(datosRecibo.numeroRecibo, W - M - 4, 20, { align: 'right' });

    y = 50;

    // --- CLIENTE Y EQUIPO ---
    const colW = (CW - 6) / 2;
    pdf.setFillColor(...grisFondo);
    pdf.roundedRect(M, y, colW, 30, 3, 3, 'F');
    pdf.setTextColor(...naranja);
    pdf.setFontSize(8);
    pdf.text('CLIENTE', M + 5, y + 7);
    pdf.setTextColor(...textoOscuro);
    pdf.setFontSize(12);
    pdf.text((datosRecibo.cliente || '').slice(0, 25), M + 5, y + 15);

    pdf.setFillColor(...grisFondo);
    pdf.roundedRect(M + colW + 6, y, colW, 30, 3, 3, 'F');
    pdf.setTextColor(...naranja);
    pdf.setFontSize(8);
    pdf.text('EQUIPO', M + colW + 11, y + 7);
    pdf.setTextColor(...textoOscuro);
    pdf.setFontSize(12);
    pdf.text(`${datosRecibo.marca || ''} ${datosRecibo.modelo || ''}`.slice(0, 25), M + colW + 11, y + 15);

    y += 36;

    // --- SERVICIOS ---
    pdf.setFillColor(...naranja);
    pdf.roundedRect(M, y, CW, 10, 3, 3, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.text('SERVICIOS Y COSTOS', M + 5, y + 6.5);
    y += 14;

    pdf.autoTable({
      startY: y,
      head: [['Descripción', 'Costo']],
      body: (datosRecibo.servicios || []).map(s => [s.desc, formatBs(s.costo)]),
      headStyles: { fillColor: naranja },
      columnStyles: { 1: { halign: 'right' } },
      margin: { left: M, right: M }
    });

    y = pdf.lastAutoTable.finalY + 10;

    // --- TOTALES ---
    pdf.setTextColor(...textoOscuro);
    pdf.text(`TOTAL: ${formatBs(datosRecibo.total || 0)}`, M + CW - 5, y, { align: 'right' });
    pdf.setTextColor(...naranja);
    pdf.text(`SALDO: ${formatBs(datosRecibo.saldo || 0)}`, M + CW - 5, y + 8, { align: 'right' });

    // GUARDAR ARCHIVO
    const nombreArchivo = `Recibo_${datosRecibo.numeroRecibo}_${datosRecibo.cliente.split(' ')[0]}.pdf`;
    window._ultimoPDF = pdf; 
    window._ultimoNombrePDF = nombreArchivo;
    pdf.save(nombreArchivo);

    // GUARDAR EN FIREBASE (Solo si venimos del Wizard)
    if (accion === 'guardar_en_nube') {
      await addDoc(collection(db, 'recibos'), {
        ...datosRecibo,
        creadoPor: sesion.nombre,
        creadoPorRol: sesion.rol,
        fecha: serverTimestamp(),
        estadoOrden: 'recibido'
      });
    }

    return true;
  } catch (error) {
    console.error(error);
    toast('Error al generar PDF: ' + error.message, 'error');
    return false;
  }
}
