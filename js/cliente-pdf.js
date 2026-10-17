/* ============================================================
   DR. XIAOMI · PDF DEL RECIBO (DISEÑO PRO)
   Archivo: js/cliente-pdf.js
   ============================================================ */

import {
  datos, sesion, CONFIG, generarNumeroRecibo, configurarWhatsApp,
  db, collection, addDoc, serverTimestamp
} from '/js/cliente.js';

import { toast, haptic, formatBs, showLoading, hideLoading } from '/js/app-ui.js';

const COLOR = {
  naranja: [255, 105, 0], 
  naranjaClaro: [255, 140, 60], 
  naranjaSuave: [255, 244, 235],
  grisFondo: [248, 248, 248], 
  grisSuave: [235, 235, 235],
  textoOscuro: [30, 30, 30], 
  textoMedio: [100, 100, 100], 
  textoClaro: [150, 150, 150], 
  blanco: [255, 255, 255],
  verde: [34, 197, 94]
};

async function cargarLibreriasPDF() {
  if (!window.jspdf) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s.onload = resolve; s.onerror = () => reject(new Error('No JSPDF')); document.head.appendChild(s);
    });
  }
  if (!window.jspdf?.jsPDF?.API?.autoTable) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js';
      s.onload = resolve; s.onerror = () => reject(new Error('No AutoTable')); document.head.appendChild(s);
    });
  }
  if (!window.QRCode) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
      s.onload = resolve; s.onerror = () => reject(new Error('No QRCode')); document.head.appendChild(s);
    });
  }
}

export function configurarPDF() {
  document.getElementById('btnGenerate')?.addEventListener('click', generarPDF);
  document.getElementById('backToPanelBtn2')?.addEventListener('click', () => window.location.href = '/app/');
  document.getElementById('downloadPdfBtn')?.addEventListener('click', () => {
    haptic(15);
    if (window._ultimoPDF) {
      try { window._ultimoPDF.save(window._ultimoNombrePDF || 'recibo.pdf'); toast('PDF descargado', 'success'); } catch (err) {}
    } else toast('Genera el recibo primero', 'warning');
  });
}

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

async function cargarLogoDataUrl() {
  return new Promise((resolve) => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => {
      try { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0); resolve(c.toDataURL('image/png')); }
      catch (e) { resolve(''); }
    };
    img.onerror = () => resolve(''); img.src = CONFIG.logoUrl;
  });
}

export async function generarPDF() {
  const numeroRecibo = generarNumeroRecibo();
  showLoading('Generando PDF PRO...'); haptic(20);
  try {
    await cargarLibreriasPDF();
    const [logoDataUrl, qrDataUrl] = await Promise.all([cargarLogoDataUrl(), generarQRDataUrl(`${CONFIG.urlApp}/?recibo=${numeroRecibo}`)]);

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, H = 297, M = 15, CW = W - M * 2; let y = 0;

    /* ================= HEADER ================= */
    pdf.setFillColor(...COLOR.naranja);
    pdf.rect(0, 0, W, 40, 'F');
    pdf.setFillColor(...COLOR.naranjaClaro);
    pdf.rect(0, 40, W, 2, 'F');

    // Logo con fondo blanco
    if (logoDataUrl) {
      try {
        pdf.setFillColor(255, 255, 255);
        pdf.circle(M + 12, 20, 11, 'F');
        pdf.addImage(logoDataUrl, 'PNG', M + 2, 10, 20, 20);
      } catch (e) {}
    }

    // Textos del Header
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(22);
    pdf.text(CONFIG.nombreTienda, M + 28, 16);
    
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text(CONFIG.eslogan, M + 28, 22);
    pdf.setFontSize(8);
    pdf.text(`${CONFIG.direccion} · Tel: ${CONFIG.telefono}`, M + 28, 28);

    // Caja del Recibo
    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(W - M - 60, 8, 60, 24, 3, 3, 'F');
    pdf.setTextColor(...COLOR.naranja);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.text('RECIBO N°', W - M - 4, 14, { align: 'right' });
    pdf.setFontSize(11);
    pdf.text(numeroRecibo, W - M - 4, 20, { align: 'right' });
    pdf.setTextColor(...COLOR.textoMedio);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    const f = new Date(); const fStr = `${String(f.getDate()).padStart(2,'0')}/${String(f.getMonth()+1).padStart(2,'0')}/${f.getFullYear()}`;
    pdf.text(`${fStr} · ${sesion.nombre}`, W - M - 4, 26, { align: 'right' });

    y = 50;

    /* ================= CLIENTE / EQUIPO ================= */
    const colW = (CW - 6) / 2;

    // Tarjeta Cliente
    pdf.setFillColor(...COLOR.grisFondo);
    pdf.roundedRect(M, y, colW, 30, 3, 3, 'F');
    pdf.setFillColor(...COLOR.naranja);
    pdf.rect(M, y, 2, 30, 'F');
    
    pdf.setTextColor(...COLOR.naranja);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text('CLIENTE', M + 5, y + 7);
    pdf.setTextColor(...COLOR.textoOscuro);
    pdf.setFontSize(12);
    pdf.text(datos.nombre.slice(0, 25), M + 5, y + 15);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(...COLOR.textoMedio);
    pdf.text(`Tel: ${datos.telefono}`, M + 5, y + 23);

    // Tarjeta Equipo
    pdf.setFillColor(...COLOR.grisFondo);
    pdf.roundedRect(M + colW + 6, y, colW, 30, 3, 3, 'F');
    pdf.setFillColor(...COLOR.naranja);
    pdf.rect(M + colW + 6, y, 2, 30, 'F');

    pdf.setTextColor(...COLOR.naranja);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text('EQUIPO', M + colW + 11, y + 7);
    pdf.setTextColor(...COLOR.textoOscuro);
    pdf.setFontSize(12);
    pdf.text(`${datos.marca} ${datos.modelo}`.slice(0, 25), M + colW + 11, y + 15);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(...COLOR.textoMedio);
    if (datos.imei) pdf.text(`IMEI: ${datos.imei}`, M + colW + 11, y + 21);
    pdf.text(`Enciende: ${datos.enciende}`, M + colW + 11, y + 26);

    y += 36;

    /* ================= FALLA / SEGURIDAD ================= */
    pdf.setFillColor(...COLOR.grisFondo);
    pdf.roundedRect(M, y, colW, 30, 3, 3, 'F');
    pdf.setFillColor(...COLOR.naranja);
    pdf.rect(M, y, 2, 30, 'F');
    
    pdf.setTextColor(...COLOR.naranja);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text('ESTADO / FALLA', M + 5, y + 7);
    pdf.setTextColor(...COLOR.textoMedio);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    let fallaText = datos.falla || datos.estado || 'No especificado';
    pdf.text(pdf.splitTextToSize(fallaText, colW - 10), M + 5, y + 14);

    // Tarjeta Seguridad
    pdf.setFillColor(...COLOR.grisFondo);
    pdf.roundedRect(M + colW + 6, y, colW, 30, 3, 3, 'F');
    pdf.setFillColor(...COLOR.naranja);
    pdf.rect(M + colW + 6, y, 2, 30, 'F');

    pdf.setTextColor(...COLOR.naranja);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text('CLAVE DE ACCESO', M + colW + 11, y + 7);
    
    let segInfo = datos.tipoSeguridad === 'pin' ? `PIN: ${datos.pin}` : (datos.patronSecuencia ? `Patrón: ${datos.patronSecuencia.split(',').join('-')}` : 'Sin clave');
    pdf.setTextColor(...COLOR.textoOscuro);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.text(segInfo.slice(0, 25), M + colW + 11, y + 17);

    y += 36;

    /* ================= SERVICIOS Y COSTOS ================= */
    pdf.setFillColor(...COLOR.naranja);
    pdf.roundedRect(M, y, CW, 10, 3, 3, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text('SERVICIOS Y COSTOS', M + 5, y + 6.5);
    y += 14;

    pdf.autoTable({
      startY: y,
      head: [['Descripción', 'Costo']],
      body: datos.servicios.map(s => [s.desc, formatBs(s.costo)]),
      styles: { fontSize: 10, cellPadding: 4, textColor: COLOR.textoOscuro, lineColor: [230,230,230], lineWidth: 0.1 },
      headStyles: { fillColor: COLOR.naranja, textColor: 255, fontStyle: 'bold', fontSize: 10 },
      alternateRowStyles: { fillColor: [255, 250, 245] },
      columnStyles: {
        0: { cellWidth: CW - 40 },
        1: { halign: 'right', cellWidth: 40, fontStyle: 'bold', textColor: COLOR.naranja }
      },
      margin: { left: M, right: M },
      theme: 'grid'
    });

    y = pdf.lastAutoTable.finalY + 8;

    /* ================= TOTALES ================= */
    const boxW = 80;
    const boxX = M + CW - boxW;
    const boxAlto = datos.adelanto > 0 ? 28 : 20;

    pdf.setFillColor(...COLOR.grisFondo);
    pdf.roundedRect(boxX, y, boxW, boxAlto, 3, 3, 'F');
    pdf.setDrawColor(...COLOR.naranja);
    pdf.setLineWidth(0.5);
    pdf.roundedRect(boxX, y, boxW, boxAlto, 3, 3, 'S');

    pdf.setTextColor(...COLOR.textoMedio);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text('Total:', boxX + 5, y + 8);
    pdf.setTextColor(...COLOR.textoOscuro);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.text(formatBs(datos.total), boxX + boxW - 5, y + 8, { align: 'right' });

    let rowY = y + 8;
    if (datos.adelanto > 0) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(...COLOR.textoMedio);
      pdf.text('Adelanto:', boxX + 5, y + 15);
      pdf.setTextColor(...COLOR.textoOscuro);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`- ${formatBs(datos.adelanto)}`, boxX + boxW - 5, y + 15, { align: 'right' });
      rowY = y + 15;
    }

    pdf.setDrawColor(...COLOR.naranja);
    pdf.setLineWidth(0.3);
    pdf.line(boxX + 5, rowY + 5, boxX + boxW - 5, rowY + 5);

    pdf.setTextColor(...COLOR.naranja);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text('SALDO:', boxX + 5, rowY + 12);
    pdf.setFontSize(14);
    pdf.text(formatBs(datos.saldo), boxX + boxW - 5, rowY + 12, { align: 'right' });

    y += boxAlto + 8;

    /* ================= FOTOS (MEJORADAS) ================= */
    const fotosValidas = datos.fotos.filter(f => f && f.dataUrl);
    if (fotosValidas.length > 0) {
      if (y > 220) { pdf.addPage(); y = 20; }
      
      pdf.setFillColor(...COLOR.naranja);
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
          // Fondo blanco para las fotos
          pdf.setFillColor(255, 255, 255);
          pdf.roundedRect(x, y, fotoW, fotoH, 2, 2, 'F');
          pdf.setDrawColor(220, 220, 220);
          pdf.roundedRect(x, y, fotoW, fotoH, 2, 2, 'S');
          
          // Insertar imagen con un margen interno
          pdf.addImage(fotosValidas[i].dataUrl, 'JPEG', x + 1, y + 1, fotoW - 2, fotoH - 2, undefined, 'FAST');
        } catch (e) {
          console.error('Error foto:', e);
          pdf.setFillColor(240, 240, 240);
          pdf.roundedRect(x, y, fotoW, fotoH, 2, 2, 'F');
        }
        x += fotoW + 3;
      }
      y += fotoH + 10;
    }

    /* ================= BANNER WEB (PRO) ================= */
    if (y > 215) { pdf.addPage(); y = 20; }
    
    pdf.setFillColor(...COLOR.naranja);
    pdf.roundedRect(M, y, CW, 35, 4, 4, 'F');
    
    // Diseño interno del banner
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

    // QR a la derecha
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
    pdf.setFillColor(...COLOR.grisFondo);
    pdf.roundedRect(M, y, CW, 30, 3, 3, 'F');
    
    pdf.setTextColor(...COLOR.naranja);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text('CONDICIONES DEL SERVICIO', M + 5, y + 6);
    
    pdf.setTextColor(...COLOR.textoMedio);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    CONFIG.condiciones.forEach((txt, i) => {
      pdf.text(`${i + 1}. ${txt}`, M + 5, y + 12 + i * 3.5);
    });

    /* ================= GUARDAR Y FIRESTORE ================= */
    const nombreArchivo = `Recibo_${numeroRecibo}_${datos.nombre.split(' ')[0]}.pdf`;
    window._ultimoPDF = pdf; window._ultimoNombrePDF = nombreArchivo; pdf.save(nombreArchivo);

    try {
      await addDoc(collection(db, 'recibos'), {
        numeroRecibo, 
        cliente: datos.nombre, 
        telefono: datos.telefono, 
        marca: datos.marca, 
        modelo: datos.modelo, 
        imei: datos.imei || null, 
        enciende: datos.enciende, 
        estadoEquipo: datos.estado || '-', 
        falla: datos.falla || '-', 
        tipoSeguridad: datos.tipoSeguridad, 
        pin: datos.tipoSeguridad === 'pin' ? datos.pin : null, 
        patron: datos.tipoSeguridad === 'patron' ? datos.patronSecuencia : null, 
        servicios: datos.servicios, 
        total: datos.total, 
        adelanto: datos.adelanto, 
        saldo: datos.saldo, 
        fotos: datos.fotos.filter(f => f && f.dataUrl).map(f => f.dataUrl), 
        estadoOrden: 'recibido', 
        creadoPor: sesion.nombre, 
        creadoPorRol: sesion.rol, 
        fecha: serverTimestamp()
      });
    } catch (err) { toast('Recibo generado, pero no se guardó en la nube', 'warning'); }

    document.getElementById('successNumero').textContent = numeroRecibo;
    document.getElementById('successModal')?.classList.add('show');
    window._ultimoRecibo = { numeroRecibo, cliente: datos.nombre, telefono: datos.telefono, marca: datos.marca, modelo: datos.modelo, total: datos.total, saldo: datos.saldo };
    configurarWhatsApp();
  } catch (err) {
    console.error(err); toast('Error al generar el PDF: ' + err.message, 'error', 5000);
  } finally { hideLoading(); }
}
