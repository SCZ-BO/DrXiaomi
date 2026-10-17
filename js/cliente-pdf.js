/* ============================================================
   DR. XIAOMI · PDF DEL RECIBO
   Archivo: js/cliente-pdf.js
   ⚠️ SOLO PDF. NO toca wizard, fotos ni sumas.
   ============================================================ */

import {
  datos,
  sesion,
  CONSTANTES,
  generarNumeroRecibo,
  configurarWhatsApp
} from '/js/cliente.js';

import {
  toast, haptic, formatBs,
  showLoading, hideLoading
} from '/js/app-ui.js';

import { db } from '/js/firebase.js';
import {
  collection, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ============================================================
   COLORES DE MARCA
   ============================================================ */
const COLOR = {
  naranja: [255, 105, 0],
  naranjaClaro: [255, 140, 60],
  naranjaSuave: [255, 244, 235],
  grisFondo: [248, 248, 248],
  grisSuave: [235, 235, 235],
  textoOscuro: [30, 30, 30],
  textoMedio: [80, 80, 80],
  textoClaro: [120, 120, 120],
  blanco: [255, 255, 255]
};

/* ============================================================
   CARGA DINÁMICA DE LIBRERÍAS (solo cuando se necesita PDF)
   ============================================================ */
async function cargarLibreriasPDF() {
  if (!window.jspdf) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('No se pudo cargar JSPDF'));
      document.head.appendChild(s);
    });
  }

  if (!window.jspdf?.jsPDF?.API?.autoTable) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('No se pudo cargar AutoTable'));
      document.head.appendChild(s);
    });
  }

  if (!window.QRCode) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('No se pudo cargar QRCode'));
      document.head.appendChild(s);
    });
  }
}

/* ============================================================
   CONFIGURAR BOTONES DEL PDF
   ============================================================ */
export function configurarPDF() {
  document.getElementById('btnGenerate')?.addEventListener('click', generarPDF);
  document.getElementById('backToPanelBtn2')?.addEventListener('click', () => {
    window.location.href = '/app/';
  });
  document.getElementById('downloadPdfBtn')?.addEventListener('click', () => {
    haptic(15);
    if (window._ultimoPDF) {
      try {
        window._ultimoPDF.save(window._ultimoNombrePDF || 'recibo.pdf');
        toast('PDF descargado', 'success', 2000);
      } catch (err) {
        console.error('Error descargando PDF:', err);
        toast('Error al descargar el PDF', 'error');
      }
    } else {
      toast('Genera el recibo primero', 'warning');
    }
  });
}

/* ============================================================
   QR Y LOGO
   ============================================================ */
async function generarQRDataUrl(texto) {
  return new Promise((resolve) => {
    if (typeof QRCode === 'undefined') { resolve(''); return; }
    const div = document.createElement('div');
    div.style.position = 'absolute';
    div.style.left = '-9999px';
    document.body.appendChild(div);
    try {
      new QRCode(div, {
        text: texto,
        width: 256, height: 256,
        colorDark: '#000000',
        colorLight: '#FFFFFF',
        correctLevel: QRCode.CorrectLevel.M
      });
      setTimeout(() => {
        const canvas = div.querySelector('canvas');
        const img = div.querySelector('img');
        let dataUrl = '';
        if (canvas) dataUrl = canvas.toDataURL('image/png');
        else if (img && img.src) dataUrl = img.src;
        div.remove();
        resolve(dataUrl);
      }, 200);
    } catch (e) {
      div.remove();
      resolve('');
    }
  });
}

async function cargarLogoDataUrl() {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        resolve(c.toDataURL('image/png'));
      } catch (e) { resolve(''); }
    };
    img.onerror = () => resolve('');
    img.src = CONSTANTES.CONFIG.logoUrl;
  });
}

/* ============================================================
   GENERAR PDF PRO
   ============================================================ */
export async function generarPDF() {
  const { CONFIG } = CONSTANTES;
  const numeroRecibo = generarNumeroRecibo();
  showLoading('Generando PDF...');
  haptic(20);

  try {
    await cargarLibreriasPDF();

    const [logoDataUrl, qrDataUrl] = await Promise.all([
      cargarLogoDataUrl(),
      generarQRDataUrl(`${CONFIG.urlApp}/?recibo=${numeroRecibo}`)
    ]);

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, H = 297, M = 14;
    const CW = W - M * 2;
    let y = 0;

    /* MARCA DE AGUA */
    pdf.saveGraphicsState();
    pdf.setTextColor(...COLOR.naranja);
    pdf.setFont('helvetica', 'bold');
    try { pdf.setGState(new pdf.GState({ opacity: 0.05 })); } catch (e) {}
    pdf.setFontSize(70);
    pdf.text('DR. XIAOMI', W / 2, H / 2 - 20, { align: 'center', angle: 45 });
    pdf.setFontSize(50);
    pdf.text('SCZ', W / 2 + 10, H / 2 + 30, { align: 'center', angle: 45 });
    pdf.restoreGraphicsState();

    /* HEADER */
    pdf.setFillColor(...COLOR.naranja);
    pdf.rect(0, 0, W, 34, 'F');
    pdf.setFillColor(...COLOR.naranjaClaro);
    pdf.rect(0, 34, W, 1.5, 'F');

    if (logoDataUrl) {
      try {
        pdf.setFillColor(255, 255, 255);
        pdf.circle(M + 11, 17, 12, 'F');
        pdf.addImage(logoDataUrl, 'PNG', M + 1, 7, 20, 20);
      } catch (e) {}
    }

    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(20);
    pdf.text(CONFIG.nombreTienda, M + 28, 14);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text(CONFIG.eslogan, M + 28, 20);
    pdf.setFontSize(8);
    pdf.text(CONFIG.direccion, M + 28, 26);

    const telLabel = ' · Tel: ';
    const telLabelX = M + 28 + pdf.getTextWidth(CONFIG.direccion);
    pdf.text(telLabel, telLabelX, 26);
    pdf.textWithLink(CONFIG.telefono, telLabelX + pdf.getTextWidth(telLabel), 26, {
      url: `tel:+591${CONFIG.telefono}`
    });

    pdf.setFillColor(255, 255, 255);
    try { pdf.setGState(new pdf.GState({ opacity: 0.15 })); } catch (e) {}
    pdf.roundedRect(W - M - 55, 6, 55, 22, 2, 2, 'F');
    try { pdf.setGState(new pdf.GState({ opacity: 1 })); } catch (e) {}

    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text('RECIBO N°', W - M - 4, 11, { align: 'right' });
    pdf.setFontSize(11);
    pdf.text(numeroRecibo, W - M - 4, 17, { align: 'right' });
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    const fecha = new Date();
    const fechaStr = `${String(fecha.getDate()).padStart(2,'0')}/${String(fecha.getMonth()+1).padStart(2,'0')}/${fecha.getFullYear()} ${String(fecha.getHours()).padStart(2,'0')}:${String(fecha.getMinutes()).padStart(2,'0')}`;
    pdf.text(fechaStr, W - M - 4, 22, { align: 'right' });
    pdf.text(`Atendido: ${sesion.nombre}`, W - M - 4, 26, { align: 'right' });

    y = 40;

    /* BANNER RECIBIDO */
    pdf.setFillColor(...COLOR.grisSuave);
    pdf.roundedRect(M, y, CW, 10, 2, 2, 'F');
    pdf.setTextColor(...COLOR.textoOscuro);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text('RECIBIDO', M + 4, y + 6.5);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(...COLOR.textoMedio);
    pdf.text('Recibo de servicio técnico', W - M - 4, y + 6.5, { align: 'right' });
    y += 14;

    /* CLIENTE / EQUIPO */
    const colW = (CW - 4) / 2;

    pdf.setFillColor(...COLOR.naranjaSuave);
    pdf.roundedRect(M, y, colW, 26, 2, 2, 'F');
    pdf.setFillColor(...COLOR.naranja);
    pdf.rect(M, y, 1.5, 26, 'F');
    pdf.setTextColor(...COLOR.naranja);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text('CLIENTE', M + 5, y + 6);
    pdf.setTextColor(...COLOR.textoOscuro);
    pdf.setFontSize(11);
    pdf.text(datos.nombre.slice(0, 28), M + 5, y + 13);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(...COLOR.textoMedio);
    pdf.text('Tel: ', M + 5, y + 18);
    pdf.textWithLink(datos.telefono, M + 5 + pdf.getTextWidth('Tel: '), y + 18, {
      url: `tel:+591${datos.telefono}`
    });
    pdf.text('Cliente', M + 5, y + 23);

    pdf.setFillColor(...COLOR.naranjaSuave);
    pdf.roundedRect(M + colW + 4, y, colW, 26, 2, 2, 'F');
    pdf.setFillColor(...COLOR.naranja);
    pdf.rect(M + colW + 4, y, 1.5, 26, 'F');
    pdf.setTextColor(...COLOR.naranja);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text('EQUIPO', M + colW + 9, y + 6);
    pdf.setTextColor(...COLOR.textoOscuro);
    pdf.setFontSize(11);
    pdf.text(`${datos.marca} ${datos.modelo}`.slice(0, 28), M + colW + 9, y + 13);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(...COLOR.textoMedio);
    if (datos.imei) pdf.text(`IMEI: ${datos.imei}`, M + colW + 9, y + 18);
    pdf.text(`Enciende: ${datos.enciende}`, M + colW + 9, y + 23);

    y += 30;

    /* ESTADO / CLAVE */
    pdf.setFillColor(...COLOR.naranjaSuave);
    pdf.roundedRect(M, y, colW, 26, 2, 2, 'F');
    pdf.setFillColor(...COLOR.naranja);
    pdf.rect(M, y, 1.5, 26, 'F');
    pdf.setTextColor(...COLOR.naranja);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text('ESTADO / FALLA', M + 5, y + 6);
    pdf.setTextColor(...COLOR.textoMedio);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    let yy = y + 12;
    if (datos.estado) {
      const l = pdf.splitTextToSize(datos.estado, colW - 10);
      pdf.text(l.slice(0, 2), M + 5, yy);
      yy += l.slice(0, 2).length * 3.5;
    }
    if (datos.falla) {
      const l = pdf.splitTextToSize(datos.falla, colW - 10);
      pdf.text(l.slice(0, 2), M + 5, yy);
    }

    pdf.setFillColor(...COLOR.naranjaSuave);
    pdf.roundedRect(M + colW + 4, y, colW, 26, 2, 2, 'F');
    pdf.setFillColor(...COLOR.naranja);
    pdf.rect(M + colW + 4, y, 1.5, 26, 'F');
    pdf.setTextColor(...COLOR.naranja);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text('CLAVE DE ACCESO', M + colW + 9, y + 6);

    let patronTexto = '';
    if (datos.tipoSeguridad === 'patron' && datos.patronSecuencia) {
      patronTexto = datos.patronSecuencia.split(',').join('-');
    }
    let segInfo = '';
    if (datos.tipoSeguridad === 'pin') segInfo = `PIN: ${datos.pin}`;
    else if (datos.tipoSeguridad === 'patron' && patronTexto) segInfo = `Patrón: ${patronTexto}`;
    else segInfo = 'Sin clave';

    pdf.setTextColor(...COLOR.textoOscuro);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.text(segInfo.slice(0, 25), M + colW + 9, y + 16);

    y += 30;

    /* SERVICIOS */
    if (y > 220) { pdf.addPage(); y = 20; }
    pdf.setFillColor(...COLOR.naranja);
    pdf.roundedRect(M, y, CW, 9, 1.5, 1.5, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.text('SERVICIOS Y COSTOS', M + 4, y + 6);
    y += 12;

    const serviciosData = datos.servicios.map(s => [s.desc, formatBs(s.costo)]);
    pdf.autoTable({
      startY: y,
      head: [['Descripción', 'Costo']],
      body: serviciosData,
      styles: { fontSize: 9, cellPadding: 3.5, textColor: COLOR.textoOscuro, lineColor: [230,230,230], lineWidth: 0.2 },
      headStyles: { fillColor: COLOR.naranja, textColor: 255, fontStyle: 'bold', fontSize: 9 },
      alternateRowStyles: { fillColor: [255, 250, 245] },
      columnStyles: {
        0: { cellWidth: CW - 40 },
        1: { halign: 'right', cellWidth: 40, fontStyle: 'bold', textColor: COLOR.naranja }
      },
      margin: { left: M, right: M },
      theme: 'grid'
    });

    y = pdf.lastAutoTable.finalY + 5;

    /* TOTALES */
    const boxW = 85;
    const boxX = M + CW - boxW;
    const boxAlto = datos.adelanto > 0 ? 28 : 20;

    pdf.setFillColor(...COLOR.grisFondo);
    pdf.roundedRect(boxX, y, boxW, boxAlto, 2, 2, 'F');
    pdf.setDrawColor(...COLOR.naranja);
    pdf.setLineWidth(0.4);
    pdf.roundedRect(boxX, y, boxW, boxAlto, 2, 2, 'S');

    pdf.setTextColor(...COLOR.textoMedio);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text('Total:', boxX + 5, y + 7);
    pdf.setTextColor(...COLOR.textoOscuro);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text(formatBs(datos.total), boxX + boxW - 5, y + 7, { align: 'right' });

    let rowY = y + 7;
    if (datos.adelanto > 0) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(...COLOR.textoMedio);
      pdf.text('Adelanto:', boxX + 5, y + 14);
      pdf.setTextColor(...COLOR.textoOscuro);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`- ${formatBs(datos.adelanto)}`, boxX + boxW - 5, y + 14, { align: 'right' });
      rowY = y + 14;
    }

    pdf.setDrawColor(...COLOR.naranja);
    pdf.setLineWidth(0.5);
    pdf.line(boxX + 5, rowY + 4, boxX + boxW - 5, rowY + 4);

    pdf.setTextColor(...COLOR.naranja);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.text('SALDO:', boxX + 5, rowY + 11);
    pdf.setFontSize(13);
    pdf.text(formatBs(datos.saldo), boxX + boxW - 5, rowY + 11, { align: 'right' });

    y += boxAlto + 6;

    /* FOTOS */
    const fotosValidas = datos.fotos.filter(f => f && f.dataUrl);
    if (fotosValidas.length > 0) {
      if (y > 235) { pdf.addPage(); y = 20; }
      pdf.setFillColor(...COLOR.naranja);
      pdf.roundedRect(M, y, CW, 8, 1.5, 1.5, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.text('FOTOS DEL EQUIPO', M + 4, y + 5.5);
      y += 11;

      const fotoW = (CW - 9) / 4;
      const fotoH = fotoW * 0.75;
      let x = M;
      for (let i = 0; i < Math.min(fotosValidas.length, 4); i++) {
        try {
          pdf.setFillColor(240, 240, 240);
          pdf.roundedRect(x + 0.5, y + 0.5, fotoW, fotoH, 1, 1, 'F');
          pdf.setFillColor(255, 255, 255);
          pdf.roundedRect(x, y, fotoW, fotoH, 1, 1, 'F');
          pdf.addImage(fotosValidas[i].dataUrl, 'JPEG', x + 1, y + 1, fotoW - 2, fotoH - 2, undefined, 'FAST');
        } catch (e) {}
        x += fotoW + 3;
      }
      y += fotoH + 6;
    }

    /* QR + URL */
    if (y > 215) { pdf.addPage(); y = 20; }
    pdf.setFillColor(...COLOR.naranjaSuave);
    pdf.roundedRect(M, y, CW, 32, 2, 2, 'F');
    pdf.setFillColor(...COLOR.naranja);
    pdf.rect(M, y, 1.5, 32, 'F');

    if (qrDataUrl) {
      try {
        pdf.setFillColor(255, 255, 255);
        pdf.roundedRect(M + 5, y + 5, 22, 22, 1.5, 1.5, 'F');
        pdf.addImage(qrDataUrl, 'PNG', M + 6, y + 6, 20, 20);
      } catch (e) {}
    }

    pdf.setTextColor(...COLOR.naranja);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text('Consulta el estado de tu reparación', M + 32, y + 10);

    pdf.setTextColor(...COLOR.textoMedio);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.text('Escanea el código QR o visita:', M + 32, y + 16);

    const urlTexto = `${CONFIG.web}/?recibo=${numeroRecibo}`;
    const urlCompleta = `${CONFIG.urlApp}/?recibo=${numeroRecibo}`;
    pdf.setTextColor(...COLOR.naranja);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.textWithLink(urlTexto, M + 32, y + 23, { url: urlCompleta });

    const urlWidth = pdf.getTextWidth(urlTexto);
    pdf.setDrawColor(...COLOR.naranja);
    pdf.setLineWidth(0.3);
    pdf.line(M + 32, y + 24.5, M + 32 + urlWidth, y + 24.5);

    y += 38;

    /* BANNER WEB */
    if (y > 240) { pdf.addPage(); y = 20; }
    pdf.setFillColor(...COLOR.naranja);
    pdf.roundedRect(M, y, CW, 34, 2, 2, 'F');
    pdf.setFillColor(...COLOR.naranjaClaro);
    pdf.rect(M, y, CW, 2, 'F');

    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text('VISITA NUESTRA PÁGINA WEB', M + 8, y + 10);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(22);
    pdf.textWithLink(CONFIG.web, M + 8, y + 21, { url: CONFIG.urlApp });
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.text('Toca el enlace o escanea el código QR', M + 8, y + 28);

    if (qrDataUrl) {
      try {
        pdf.setFillColor(255, 255, 255);
        pdf.roundedRect(W - M - 30, y + 4, 26, 26, 1.5, 1.5, 'F');
        pdf.addImage(qrDataUrl, 'PNG', W - M - 28.5, y + 5.5, 23, 23);
      } catch (e) {}
    }

    y += 40;

    /* CONDICIONES */
    if (y > 245) { pdf.addPage(); y = 20; }
    pdf.setTextColor(...COLOR.naranja);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.text('CONDICIONES:', M, y + 4);

    pdf.setTextColor(...COLOR.textoMedio);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.5);
    const condColW = CW / 2 - 3;
    CONFIG.condiciones.forEach((txt, i) => {
      const col = i < 3 ? 0 : 1;
      const row = i < 3 ? i : i - 3;
      const xPos = M + col * (condColW + 6);
      const yPos = y + 9 + row * 3.5;
      const l = pdf.splitTextToSize(`${i + 1}. ${txt}`, condColW);
      pdf.text(l[0], xPos, yPos);
    });

    /* FOOTER */
    pdf.setDrawColor(...COLOR.naranja);
    pdf.setLineWidth(0.6);
    pdf.line(M, H - 15, W - M, H - 15);

    pdf.setFontSize(6.5);
    pdf.setTextColor(...COLOR.textoClaro);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`© ${new Date().getFullYear()} ${CONFIG.nombreTienda} · Todos los derechos reservados`, W / 2, H - 10, { align: 'center' });

    pdf.setFontSize(7);
    const footerY = H - 6;
    const webText = CONFIG.web;
    const sepText = '  ·  ';
    const telText = `Tel: ${CONFIG.telefono}`;
    const webW = pdf.getTextWidth(webText);
    const sepW = pdf.getTextWidth(sepText);
    const telW = pdf.getTextWidth(telText);
    const totalW = webW + sepW + telW;
    const startX = (W - totalW) / 2;

    pdf.setTextColor(...COLOR.naranja);
    pdf.setFont('helvetica', 'bold');
    pdf.textWithLink(webText, startX, footerY, { url: CONFIG.urlApp });

    pdf.setTextColor(...COLOR.textoClaro);
    pdf.setFont('helvetica', 'normal');
    pdf.text(sepText, startX + webW, footerY);

    pdf.setTextColor(...COLOR.naranja);
    pdf.setFont('helvetica', 'bold');
    pdf.textWithLink(telText, startX + webW + sepW, footerY, {
      url: `tel:+591${CONFIG.telefono}`
    });

    /* GUARDAR */
    const nombreArchivo = `Recibo_${numeroRecibo}_${datos.nombre.split(' ')[0]}.pdf`;
    window._ultimoPDF = pdf;
    window._ultimoNombrePDF = nombreArchivo;
    pdf.save(nombreArchivo);

    /* FIRESTORE */
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
    } catch (err) {
      console.error('Error guardando en Firestore:', err);
      toast('Recibo generado pero no se pudo guardar en la nube', 'warning', 4000);
    }

    /* MODAL ÉXITO */
    const successNumero = document.getElementById('successNumero');
    if (successNumero) successNumero.textContent = numeroRecibo;
    const successModal = document.getElementById('successModal');
    if (successModal) successModal.classList.add('show');

    window._ultimoRecibo = {
      numeroRecibo,
      cliente: datos.nombre,
      telefono: datos.telefono,
      marca: datos.marca,
      modelo: datos.modelo,
      total: datos.total,
      saldo: datos.saldo
    };

    configurarWhatsApp();

  } catch (err) {
    console.error('Error generando PDF:', err);
    toast('Error al generar el PDF: ' + err.message, 'error', 5000);
  } finally {
    hideLoading();
  }
}
