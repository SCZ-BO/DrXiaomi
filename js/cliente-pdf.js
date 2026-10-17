/* ============================================================
   DR. XIAOMI · GENERADOR DE PDF ÚNICO (ESTILO PREMIUM)
   Archivo: js/cliente-pdf.js
   ============================================================ */

import { CONFIG } from '/js/cliente.js';
import { formatBs } from '/js/app-ui.js';

// Función interna para cargar el logo
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
    img.onerror = () => resolve(''); 
    img.src = '/imagenes/web-app-manifest-192x192.png';
  });
}

// Función interna para generar el QR
async function generarQR(texto) {
  return new Promise((resolve) => {
    if (typeof QRCode === 'undefined') { resolve(''); return; }
    const div = document.createElement('div');
    div.style.cssText = 'position:absolute;left:-9999px;';
    document.body.appendChild(div);
    try {
      new QRCode(div, { text: texto, width: 256, height: 256, correctLevel: QRCode.CorrectLevel.M });
      setTimeout(() => {
        const canvas = div.querySelector('canvas');
        const dataUrl = canvas ? canvas.toDataURL('image/png') : '';
        div.remove(); resolve(dataUrl);
      }, 200);
    } catch (e) { div.remove(); resolve(''); }
  });
}

function formatFecha(fecha) {
  if (!fecha) return '-';
  let d;
  if (fecha.toDate) d = fecha.toDate();
  else if (fecha instanceof Date) d = fecha;
  else d = new Date(fecha);
  if (isNaN(d.getTime())) return '-';
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

// LA FUNCIÓN MAESTRA
export async function generarPDFUnificado(datos, accion = 'guardar') {
  try {
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error("Librerías cargando, espera...");

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, H = 297, M = 10;
    const CW = W - M * 2;

    /* FONDO BLANCO */
    pdf.setFillColor(253, 250, 247);
    pdf.rect(0, 0, W, H, 'F');

    /* MARCA DE AGUA */
    pdf.saveGraphicsState();
    pdf.setGState(new pdf.GState({ opacity: 0.04 }));
    pdf.setTextColor(255, 105, 0);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(55);
    for (let i = 0; i < 6; i++) {
      pdf.text('DR. XIAOMI', 10, 50 + (i * 50), { angle: 25 });
    }
    pdf.restoreGraphicsState();

    /* HEADER GRADIENTE */
    const headerGradSteps = 40;
    for (let i = 0; i < headerGradSteps; i++) {
      const ratio = i / headerGradSteps;
      pdf.setFillColor(255, 105 + (ratio * 30), ratio * 50);
      pdf.rect((W / headerGradSteps) * i, 0, W / headerGradSteps + 0.5, 32, 'F');
    }

    pdf.setFillColor(255, 255, 255);
    pdf.setGState(new pdf.GState({ opacity: 0.08 }));
    pdf.circle(190, 8, 22, 'F');
    pdf.circle(12, 32, 15, 'F');
    pdf.setGState(new pdf.GState({ opacity: 1 }));

    const logoDataUrl = await cargarLogoDataUrl();
    if (logoDataUrl) {
      try { pdf.addImage(logoDataUrl, 'PNG', M + 3, 5, 24, 24); } catch (e) {}
    }

    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.text(CONFIG.nombreTienda, M + 31, 13);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.text('Servicio Técnico Especializado', M + 31, 18);
    pdf.setFontSize(7);
    pdf.text(CONFIG.direccion, M + 31, 22);
    pdf.text(`Tel: ${CONFIG.telefono}  ·  ${CONFIG.web}`, M + 31, 26);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text('RECIBO N°', W - M - 3, 12, { align: 'right' });
    pdf.setFontSize(11);
    pdf.text(datos.numeroRecibo || '-', W - M - 3, 17, { align: 'right' });
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'normal');
    pdf.text(formatFecha(datos.fecha), W - M - 3, 22, { align: 'right' });
    pdf.setFont('helvetica', 'bold');
    pdf.text(`Atendió: ${(datos.creadoPor || '-').slice(0, 15)}`, W - M - 3, 27, { align: 'right' });

    let y = 37;

    /* ESTADO */
    const estadoActual = datos.estadoOrden || 'recibido';
    const estadosInfo = {
      'recibido': { texto: 'RECIBIDO', color: [200, 200, 200] },
      'reparacion': { texto: 'EN REPARACIÓN', color: [255, 105, 0] },
      'espera-repuesto': { texto: 'ESPERANDO REPUESTO', color: [59, 130, 246] },
      'listo': { texto: 'LISTO PARA ENTREGAR', color: [251, 191, 36] },
      'entregado': { texto: 'ENTREGADO', color: [16, 185, 129] },
      'devuelto': { texto: 'DEVUELTO', color: [239, 68, 68] }
    };
    const estadoInfo = estadosInfo[estadoActual] || estadosInfo.recibido;

    pdf.setFillColor(...estadoInfo.color);
    pdf.roundedRect(M, y, CW, 10, 2.5, 2.5, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text(estadoInfo.texto, M + 4, y + 6.8);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.text('Recibo de servicio técnico', W - M - 4, y + 6.8, { align: 'right' });
    y += 14;

    /* CLIENTE Y EQUIPO */
    const colW = (CW - 3) / 2;

    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(M, y, colW, 28, 2.5, 2.5, 'F');
    pdf.setDrawColor(255, 105, 0);
    pdf.setLineWidth(0.4);
    pdf.roundedRect(M, y, colW, 28, 2.5, 2.5, 'S');
    pdf.setFillColor(255, 105, 0);
    pdf.roundedRect(M, y, colW, 7, 2.5, 2.5, 'F');
    pdf.rect(M, y + 3, colW, 4, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text('CLIENTE', M + 3, y + 5);
    pdf.setTextColor(30, 30, 30);
    pdf.setFontSize(11);
    pdf.text((datos.cliente || '-').slice(0, 22), M + 3, y + 14);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(80, 80, 80);
    pdf.setFontSize(9);
    pdf.text(`Tel: ${datos.telefono || '-'}`, M + 3, y + 21);

    const x2 = M + colW + 3;
    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(x2, y, colW, 28, 2.5, 2.5, 'F');
    pdf.setDrawColor(255, 105, 0);
    pdf.roundedRect(x2, y, colW, 28, 2.5, 2.5, 'S');
    pdf.setFillColor(255, 105, 0);
    pdf.roundedRect(x2, y, colW, 7, 2.5, 2.5, 'F');
    pdf.rect(x2, y + 3, colW, 4, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text('EQUIPO', x2 + 3, y + 5);
    pdf.setTextColor(30, 30, 30);
    pdf.setFontSize(11);
    pdf.text(`${datos.marca || ''} ${datos.modelo || ''}`.slice(0, 22), x2 + 3, y + 14);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(80, 80, 80);
    pdf.setFontSize(9);
    pdf.text(`Enciende: ${datos.enciende || '-'}`, x2 + 3, y + 21);
    
    y += 33;

    /* ESTADO/FALLA + CLAVE */
    const bloque1W = (CW - 3) / 2;

    pdf.setFillColor(255, 250, 245);
    pdf.roundedRect(M, y, bloque1W, 20, 2, 2, 'F');
    pdf.setDrawColor(255, 200, 150);
    pdf.setLineWidth(0.3);
    pdf.roundedRect(M, y, bloque1W, 20, 2, 2, 'S');
    pdf.setTextColor(255, 105, 0);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.text('ESTADO / FALLA', M + 3, y + 4);
    pdf.setTextColor(50, 50, 50);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    const estadoTxt = (datos.estadoEquipo || 'Sin observaciones').slice(0, 40);
    const fallaTxt = (datos.falla || 'Sin falla reportada').slice(0, 40);
    pdf.text(pdf.splitTextToSize(estadoTxt, bloque1W - 6), M + 3, y + 9);
    pdf.text(pdf.splitTextToSize(fallaTxt, bloque1W - 6), M + 3, y + 15);

    const x3 = M + bloque1W + 3;
    pdf.setFillColor(255, 250, 245);
    pdf.roundedRect(x3, y, bloque1W, 20, 2, 2, 'F');
    pdf.setDrawColor(255, 200, 150);
    pdf.roundedRect(x3, y, bloque1W, 20, 2, 2, 'S');
    pdf.setTextColor(255, 105, 0);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.text('CLAVE DE ACCESO', x3 + 3, y + 4);

    let patronTexto = '';
    if (datos.tipoSeguridad === 'patron' && datos.patron) {
      patronTexto = datos.patron.split(',').join(' → ');
    }
    const segInfo = datos.tipoSeguridad === 'pin'
      ? `PIN: ${datos.pin || '-'}`
      : datos.tipoSeguridad === 'patron'
        ? `Patrón: ${patronTexto || '-'}`
        : 'Sin clave';

    pdf.setTextColor(40, 40, 40);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text(segInfo, x3 + 3, y + 13);

    y += 25;

    /* SERVICIOS */
    pdf.setTextColor(255, 105, 0);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text('SERVICIOS Y COSTOS', M, y + 2);
    y += 4;

    const servicios = Array.isArray(datos.servicios) ? datos.servicios : [];
    const serviciosData = servicios.length > 0
      ? servicios.map(s => [s.desc || 'Sin descripción', formatBs(s.costo || 0)])
      : [['Sin servicios registrados', '']];

    pdf.autoTable({
      startY: y,
      head: [['Descripción', 'Costo']],
      body: serviciosData,
      styles: { fontSize: 8, cellPadding: 2, lineColor: [240, 240, 240], lineWidth: 0.2 },
      headStyles: { fillColor: [255, 105, 0], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { textColor: [40, 40, 40], fillColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [255, 250, 245] },
      columnStyles: {
        0: { cellWidth: CW - 32 },
        1: { halign: 'right', cellWidth: 32, fontStyle: 'bold', textColor: [255, 105, 0] }
      },
      margin: { left: M, right: M },
      theme: 'grid'
    });

    y = pdf.lastAutoTable.finalY + 3;

    /* TOTALES */
    const boxW = 75;
    const boxX = W - M - boxW;
    const boxH = Number(datos.adelanto) > 0 ? 24 : 18;

    const totalGradSteps = 30;
    for (let i = 0; i < totalGradSteps; i++) {
      const ratio = i / totalGradSteps;
      pdf.setFillColor(255, 105 + (ratio * 30), ratio * 40);
      pdf.rect(boxX + (boxW / totalGradSteps) * i, y, boxW / totalGradSteps + 0.5, boxH, 'F');
    }

    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.text('Total:', boxX + 4, y + 6);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text(formatBs(datos.total || 0), W - M - 4, y + 6, { align: 'right' });

    if (Number(datos.adelanto) > 0) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.text('Adelanto:', boxX + 4, y + 12);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`- ${formatBs(datos.adelanto)}`, W - M - 4, y + 12, { align: 'right' });
    }

    pdf.setDrawColor(255, 255, 255);
    pdf.setLineWidth(0.3);
    pdf.line(boxX + 3, y + boxH - 8, W - M - 3, y + boxH - 8);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text('SALDO:', boxX + 4, y + boxH - 3);
    pdf.setFontSize(12);
    pdf.text(formatBs(datos.saldo || 0), W - M - 4, y + boxH - 3, { align: 'right' });

    y += boxH + 4;

    /* FOTOS */
    const fotosValidas = (Array.isArray(datos.fotos) ? datos.fotos : []).filter(f => f);
    if (fotosValidas.length > 0) {
      pdf.setTextColor(255, 105, 0);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.text('FOTOS DEL EQUIPO', M, y + 2);
      y += 4;

      const fotoW = (CW - 6) / 4;
      const fotoH = fotoW * 0.75;
      let x = M;
      for (let i = 0; i < Math.min(fotosValidas.length, 4); i++) {
        pdf.setFillColor(255, 255, 255);
        pdf.roundedRect(x, y, fotoW, fotoH + 2, 1, 1, 'F');
        pdf.setDrawColor(230, 230, 230);
        pdf.setLineWidth(0.2);
        pdf.roundedRect(x, y, fotoW, fotoH + 2, 1, 1, 'S');
        try {
          pdf.addImage(fotosValidas[i], 'JPEG', x + 0.5, y + 0.5, fotoW - 1, fotoH - 1, undefined, 'FAST');
        } catch (e) {}
        x += fotoW + 1.5;
      }
      y += fotoH + 5;
    }

    /* QR */
    const qrDataUrl = await generarQR(`${CONFIG.web}/?recibo=${datos.numeroRecibo}`);
    if (qrDataUrl && y < H - 75) {
      pdf.setFillColor(255, 250, 245);
      pdf.roundedRect(M, y, CW, 22, 2.5, 2.5, 'F');
      pdf.setDrawColor(255, 105, 0);
      pdf.setLineWidth(0.3);
      pdf.roundedRect(M, y, CW, 22, 2.5, 2.5, 'S');

      try { pdf.addImage(qrDataUrl, 'PNG', M + 3, y + 3, 16, 16); } catch (e) {}

      pdf.setTextColor(255, 105, 0);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.text('Consulta el estado de tu reparación', M + 23, y + 8);
      pdf.setTextColor(60, 60, 60);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.text('Escanea el código QR o visita:', M + 23, y + 13);
      pdf.setTextColor(255, 105, 0);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.text(`${CONFIG.web}/?recibo=${datos.numeroRecibo}`, M + 23, y + 18);

      y += 26;
    }

    /* BANNER WEB */
    if (y < H - 70) {
      const linkY = H - 62;
      const linkH = 26;

      const linkGradSteps = 30;
      for (let i = 0; i < linkGradSteps; i++) {
        const ratio = i / linkGradSteps;
        pdf.setFillColor(255, 105 + (ratio * 30), ratio * 40);
        pdf.rect(M + (CW / linkGradSteps) * i, linkY, CW / linkGradSteps + 0.5, linkH, 'F');
      }

      pdf.setFillColor(255, 255, 255);
      pdf.setGState(new pdf.GState({ opacity: 0.1 }));
      pdf.circle(M + 20, linkY + linkH + 5, 15, 'F');
      pdf.circle(M + CW - 10, linkY - 5, 10, 'F');
      pdf.setGState(new pdf.GState({ opacity: 1 }));

      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(14);
      pdf.text('VISITA NUESTRA PÁGINA WEB', M + 6, linkY + 9);

      pdf.setFontSize(20);
      pdf.text(CONFIG.web, M + 6, linkY + 18);

      if (qrDataUrl) {
        try { pdf.addImage(qrDataUrl, 'PNG', M + CW - 24, linkY + 2, 22, 22); } catch (e) {}
      }

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.text('Escanea o visita el enlace', M + 6, linkY + 23);

      pdf.link(M, linkY, CW, linkH, { url: CONFIG.urlApp });
      pdf.link(M, linkY - 40, CW, 40, { url: CONFIG.urlApp });

      y += linkH + 6;
    }

    /* CONDICIONES */
    const condY = H - 30;
    pdf.setFillColor(248, 248, 248);
    pdf.roundedRect(M, condY, CW, 20, 2, 2, 'F');
    pdf.setTextColor(255, 105, 0);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6);
    pdf.text('CONDICIONES:', M + 2, condY + 3);
    pdf.setTextColor(100, 100, 100);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(5.5);
    
    const condiciones = [
      '1. Conserve este recibo para retirar su equipo.',
      '2. Entrega sujeta a disponibilidad de repuestos.',
      '3. Retiro dentro de 10 días posteriores al aviso.',
      '4. Pasados 20 días, el equipo se considera abandonado.',
      '5. Garantía: 30 días repuestos / 60 días mano de obra.'
    ];
    
    pdf.text(condiciones[0], M + 2, condY + 7);
    pdf.text(condiciones[1], M + 2, condY + 10.5);
    pdf.text(condiciones[2], M + 2, condY + 14);
    pdf.text(condiciones[3], M + CW / 2 + 2, condY + 7);
    pdf.text(condiciones[4], M + CW / 2 + 2, condY + 10.5);

    /* FOOTER */
    pdf.setFillColor(255, 105, 0);
    pdf.rect(0, H - 5, W, 5, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6);
    pdf.text(`© ${new Date().getFullYear()} ${CONFIG.nombreTienda}  ·  ${CONFIG.web}  ·  Tel: ${CONFIG.telefono}`, W / 2, H - 2, { align: 'center' });

    /* GUARDAR */
    const nombreArchivo = `Recibo_${datos.numeroRecibo || 'sin-numero'}_${(datos.cliente || 'Cliente').split(' ')[0]}.pdf`;
    window._ultimoPDF = pdf;
    window._ultimoNombrePDF = nombreArchivo;
    pdf.save(nombreArchivo);

    return true;
  } catch (err) {
    console.error(err);
    alert('Error al generar PDF: ' + err.message);
    return false;
  }
}
