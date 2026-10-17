/* ============================================================
   DR. XIAOMI · GENERADOR DE PDF CENTRAL
   Archivo: js/cliente-pdf.js
   ============================================================ */

import { CONFIG, sesion, generarNumeroRecibo } from '/js/cliente.js';
import { toast, haptic, formatBs } from '/js/app-ui.js';

// Función auxiliar para cargar el logo como DataURL
async function cargarLogoDataUrl() {
  return new Promise((resolve) => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => {
      try { 
        const c = document.createElement('canvas'); 
        c.width = img.width; c.height = img.height; 
        c.getContext('2d').drawImage(img, 0, 0); 
        resolve(c.toDataURL('image/png')); 
      } catch (e) { resolve(''); }
    };
    img.onerror = () => resolve(''); img.src = CONFIG.logoUrl;
  });
}

// Función auxiliar para generar el QR
async function generarQRDataUrl(texto) {
  return new Promise((resolve) => {
    if (typeof QRCode === 'undefined') { resolve(''); return; }
    const div = document.createElement('div');
    div.style.cssText = 'position:absolute;left:-9999px;';
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

// Función principal que exportaremos
export async function generarPDFUnificado(datosRecibo, accion = 'guardar') {
  try {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error("Las librerías de PDF se están cargando. Intenta de nuevo en 2 segundos.");
    }

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, H = 297, M = 15, CW = W - M * 2; let y = 0;

    const naranja = [255, 105, 0];
    const naranjaSuave = [255, 244, 235];
    const grisFondo = [248, 248, 248];
    const textoOscuro = [30, 30, 30];
    const textoMedio = [100, 100, 100];

    const [logoDataUrl, qrDataUrl] = await Promise.all([
      cargarLogoDataUrl(), 
      generarQRDataUrl(`${CONFIG.urlApp}/?recibo=${datosRecibo.numeroRecibo || 'NUEVO'}`)
    ]);

    /* ================= HEADER ================= */
    pdf.setFillColor(...naranja);
    pdf.rect(0, 0, W, 40, 'F');

    if (logoDataUrl) {
      try {
        pdf.setFillColor(255, 255, 255);
        pdf.circle(M + 12, 20, 11, 'F');
        pdf.addImage(logoDataUrl, 'PNG', M + 2, 10, 20, 20);
      } catch (e) {}
    }

    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(22);
    pdf.text(CONFIG.nombreTienda, M + 28, 16);
    
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text(CONFIG.eslogan, M + 28, 22);
    pdf.setFontSize(8);
    pdf.text(`${CONFIG.direccion} · Tel: ${CONFIG.telefono}`, M + 28, 28);

    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(W - M - 60, 8, 60, 24, 3, 3, 'F');
    pdf.setTextColor(...naranja);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.text('RECIBO N°', W - M - 4, 14, { align: 'right' });
    pdf.setFontSize(11);
    pdf.text(datosRecibo.numeroRecibo || 'NUEVO', W - M - 4, 20, { align: 'right' });
    pdf.setTextColor(...textoMedio);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    const f = new Date(); const fStr = `${String(f.getDate()).padStart(2,'0')}/${String(f.getMonth()+1).padStart(2,'0')}/${f.getFullYear()}`;
    pdf.text(`${fStr} · ${datosRecibo.creadoPor || sesion.nombre}`, W - M - 4, 26, { align: 'right' });

    y = 50;

    /* ================= CLIENTE / EQUIPO ================= */
    const colW = (CW - 6) / 2;

    // Cliente
    pdf.setFillColor(...grisFondo);
    pdf.roundedRect(M, y, colW, 30, 3, 3, 'F');
    pdf.setFillColor(...naranja);
    pdf.rect(M, y, 2, 30, 'F');
    pdf.setTextColor(...naranja);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text('CLIENTE', M + 5, y + 7);
    pdf.setTextColor(...textoOscuro);
    pdf.setFontSize(12);
    pdf.text((datosRecibo.cliente || '').slice(0, 25), M + 5, y + 15);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(...textoMedio);
    pdf.text(`Tel: ${datosRecibo.telefono || ''}`, M + 5, y + 23);

    // Equipo
    pdf.setFillColor(...grisFondo);
    pdf.roundedRect(M + colW + 6, y, colW, 30, 3, 3, 'F');
    pdf.setFillColor(...naranja);
    pdf.rect(M + colW + 6, y, 2, 30, 'F');
    pdf.setTextColor(...naranja);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text('EQUIPO', M + colW + 11, y + 7);
    pdf.setTextColor(...textoOscuro);
    pdf.setFontSize(12);
    pdf.text(`${datosRecibo.marca || ''} ${datosRecibo.modelo || ''}`.slice(0, 25), M + colW + 11, y + 15);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(...textoMedio);
    if (datosRecibo.imei) pdf.text(`IMEI: ${datosRecibo.imei}`, M + colW + 11, y + 21);
    pdf.text(`Enciende: ${datosRecibo.enciende || ''}`, M + colW + 11, y + 26);

    y += 36;

    /* ================= FALLA / SEGURIDAD ================= */
    pdf.setFillColor(...grisFondo);
    pdf.roundedRect(M, y, colW, 30, 3, 3, 'F');
    pdf.setFillColor(...naranja);
    pdf.rect(M, y, 2, 30, 'F');
    pdf.setTextColor(...naranja);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text('ESTADO / FALLA', M + 5, y + 7);
    pdf.setTextColor(...textoMedio);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    let fallaText = datosRecibo.falla || datosRecibo.estadoEquipo || 'No especificado';
    pdf.text(pdf.splitTextToSize(fallaText, colW - 10), M + 5, y + 14);

    // Seguridad
    pdf.setFillColor(...grisFondo);
    pdf.roundedRect(M + colW + 6, y, colW, 30, 3, 3, 'F');
    pdf.setFillColor(...naranja);
    pdf.rect(M + colW + 6, y, 2, 30, 'F');
    pdf.setTextColor(...naranja);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text('CLAVE DE ACCESO', M + colW + 11, y + 7);
    
    let segInfo = datosRecibo.tipoSeguridad === 'pin' ? `PIN: ${datosRecibo.pin}` : (datosRecibo.patron ? `Patrón: ${datosRecibo.patron.split(',').join('-')}` : 'Sin clave');
    pdf.setTextColor(...textoOscuro);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.text(segInfo.slice(0, 25), M + colW + 11, y + 17);

    y += 36;

    /* ================= SERVICIOS Y COSTOS ================= */
    pdf.setFillColor(...naranja);
    pdf.roundedRect(M, y, CW, 10, 3, 3, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text('SERVICIOS Y COSTOS', M + 5, y + 6.5);
    y += 14;

    pdf.autoTable({
      startY: y,
      head: [['Descripción', 'Costo']],
      body: (datosRecibo.servicios || []).map(s => [s.desc, formatBs(s.costo)]),
      styles: { fontSize: 10, cellPadding: 4, textColor: textoOscuro, lineColor: [230,230,230], lineWidth: 0.1 },
      headStyles: { fillColor: naranja, textColor: 255, fontStyle: 'bold', fontSize: 10 },
      alternateRowStyles: { fillColor: [255, 250, 245] },
      columnStyles: {
        0: { cellWidth: CW - 40 },
        1: { halign: 'right', cellWidth: 40, fontStyle: 'bold', textColor: naranja }
      },
      margin: { left: M, right: M },
      theme: 'grid'
    });

    y = pdf.lastAutoTable.finalY + 8;

    /* ================= TOTALES ================= */
    const boxW = 80;
    const boxX = M + CW - boxW;
    const boxAlto = datosRecibo.adelanto > 0 ? 28 : 20;

    pdf.setFillColor(...grisFondo);
    pdf.roundedRect(boxX, y, boxW, boxAlto, 3, 3, 'F');
    pdf.setDrawColor(...naranja);
    pdf.setLineWidth(0.5);
    pdf.roundedRect(boxX, y, boxW, boxAlto, 3, 3, 'S');

    pdf.setTextColor(...textoMedio);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text('Total:', boxX + 5, y + 8);
    pdf.setTextColor(...textoOscuro);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.text(formatBs(datosRecibo.total || 0), boxX + boxW - 5, y + 8, { align: 'right' });

    let rowY = y + 8;
    if (datosRecibo.adelanto > 0) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(...textoMedio);
      pdf.text('Adelanto:', boxX + 5, y + 15);
      pdf.setTextColor(...textoOscuro);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`- ${formatBs(datosRecibo.adelanto)}`, boxX + boxW - 5, y + 15, { align: 'right' });
      rowY = y + 15;
    }

    pdf.setDrawColor(...naranja);
    pdf.setLineWidth(0.3);
    pdf.line(boxX + 5, rowY + 5, boxX + boxW - 5, rowY + 5);

    pdf.setTextColor(...naranja);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text('SALDO:', boxX + 5, rowY + 12);
    pdf.setFontSize(14);
    pdf.text(formatBs(datosRecibo.saldo || 0), boxX + boxW - 5, rowY + 12, { align: 'right' });

    y += boxAlto + 8;

    /* ================= FOTOS ================= */
    const fotosValidas = (datosRecibo.fotos || []).filter(f => f);
    if (fotosValidas.length > 0) {
      if (y > 220) { pdf.addPage(); y = 20; }
      
      pdf.setFillColor(...naranja);
      pdf.roundedRect(M, y, CW, 10, 3, 3, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.text('FOTOS DEL EQUIPO', M + 5, y + 6.5);
      y += 14;

      const fotoW = (CW - 12) / 4;
      const fotoH = fotoW * 0.75;
      let x = M;
      
      for (let i = 0; i < Math.min(fotosValidas.length, 4); i++) {
        try {
          pdf.setFillColor(255, 255, 255);
          pdf.roundedRect(x, y, fotoW, fotoH, 2, 2, 'F');
          pdf.setDrawColor(220, 220, 220);
          pdf.roundedRect(x, y, fotoW, fotoH, 2, 2, 'S');
          pdf.addImage(fotosValidas[i], 'JPEG', x + 1, y + 1, fotoW - 2, fotoH - 2, undefined, 'FAST');
        } catch (e) {}
        x += fotoW + 3;
      }
      y += fotoH + 10;
    }

    /* ================= BANNER WEB ================= */
    if (y > 215) { pdf.addPage(); y = 20; }
    
    pdf.setFillColor(...naranja);
    pdf.roundedRect(M, y, CW, 35, 4, 4, 'F');
    
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text('¡VISITA NUESTRA PÁGINA WEB!', M + 10, y + 10);
    
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(22);
    pdf.textWithLink(CONFIG.web, M + 10, y + 22, { url: CONFIG.urlApp });
    
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.text('Toca el enlace o escanea el código QR', M + 10, y + 29);

    if (qrDataUrl) {
      try {
        pdf.setFillColor(255, 255, 255);
        pdf.roundedRect(W - M - 35, y + 4, 28, 28, 2, 2, 'F');
        pdf.addImage(qrDataUrl, 'PNG', W - M - 33, y + 6, 24, 24);
      } catch (e) {}
    }
    y += 45;

    /* ================= CONDICIONES ================= */
    if (y > 245) { pdf.addPage(); y = 20; }
    pdf.setFillColor(...grisFondo);
    pdf.roundedRect(M, y, CW, 30, 3, 3, 'F');
    
    pdf.setTextColor(...naranja);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text('CONDICIONES DEL SERVICIO', M + 5, y + 6);
    
    pdf.setTextColor(...textoMedio);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    (CONFIG.condiciones || []).forEach((txt, i) => {
      pdf.text(`${i + 1}. ${txt}`, M + 5, y + 12 + i * 3.5);
    });

    /* ================= GUARDAR ================= */
    if (accion === 'guardar') {
      const nombreArchivo = `Recibo_${datosRecibo.numeroRecibo}_${datosRecibo.cliente.split(' ')[0]}.pdf`;
      window._ultimoPDF = pdf; 
      window._ultimoNombrePDF = nombreArchivo; 
      pdf.save(nombreArchivo);
    } else if (accion === 'whatsapp') {
      const nombreArchivo = `Recibo_${datosRecibo.numeroRecibo}.pdf`;
      window._ultimoPDF = pdf; 
      window._ultimoNombrePDF = nombreArchivo; 
    }

    return true; // Éxito

  } catch (err) {
    console.error('Error PDF:', err);
    toast('Error al generar el PDF: ' + err.message, 'error', 5000);
    return false;
  }
}
