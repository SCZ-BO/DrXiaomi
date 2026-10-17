/* ============================================================
   DR. XIAOMI · PDF DEL RECIBO
   Archivo: js/cliente-pdf.js
   ============================================================ */

import {
  datos, sesion, CONFIG, generarNumeroRecibo, configurarWhatsApp,
  db, collection, addDoc, serverTimestamp
} from '/js/cliente.js';

import { toast, haptic, formatBs, showLoading, hideLoading } from '/js/app-ui.js';

const COLOR = {
  naranja: [255, 105, 0], naranjaClaro: [255, 140, 60], naranjaSuave: [255, 244, 235],
  grisFondo: [248, 248, 248], grisSuave: [235, 235, 235],
  textoOscuro: [30, 30, 30], textoMedio: [80, 80, 80], textoClaro: [120, 120, 120], blanco: [255, 255, 255]
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
  showLoading('Generando PDF...'); haptic(20);
  try {
    await cargarLibreriasPDF();
    const [logoDataUrl, qrDataUrl] = await Promise.all([cargarLogoDataUrl(), generarQRDataUrl(`${CONFIG.urlApp}/?recibo=${numeroRecibo}`)]);

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, H = 297, M = 14, CW = W - M * 2; let y = 0;

    /* MARCA DE AGUA */
    pdf.saveGraphicsState(); pdf.setTextColor(...COLOR.naranja); pdf.setFont('helvetica', 'bold');
    try { pdf.setGState(new pdf.GState({ opacity: 0.05 })); } catch (e) {}
    pdf.setFontSize(70); pdf.text('DR. XIAOMI', W / 2, H / 2 - 20, { align: 'center', angle: 45 });
    pdf.restoreGraphicsState();

    /* HEADER */
    pdf.setFillColor(...COLOR.naranja); pdf.rect(0, 0, W, 34, 'F');
    pdf.setFillColor(...COLOR.naranjaClaro); pdf.rect(0, 34, W, 1.5, 'F');
    if (logoDataUrl) {
      try { pdf.setFillColor(255, 255, 255); pdf.circle(M + 11, 17, 12, 'F'); pdf.addImage(logoDataUrl, 'PNG', M + 1, 7, 20, 20); } catch (e) {}
    }
    pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(20);
    pdf.text(CONFIG.nombreTienda, M + 28, 14);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.text(CONFIG.eslogan, M + 28, 20);
    pdf.setFontSize(8); pdf.text(CONFIG.direccion + ' · Tel: ' + CONFIG.telefono, M + 28, 26);

    pdf.setFillColor(255, 255, 255); try { pdf.setGState(new pdf.GState({ opacity: 0.15 })); } catch (e) {}
    pdf.roundedRect(W - M - 55, 6, 55, 22, 2, 2, 'F'); try { pdf.setGState(new pdf.GState({ opacity: 1 })); } catch (e) {}
    pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8);
    pdf.text('RECIBO N°', W - M - 4, 11, { align: 'right' }); pdf.setFontSize(11); pdf.text(numeroRecibo, W - M - 4, 17, { align: 'right' });
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7);
    const f = new Date(); const fStr = `${String(f.getDate()).padStart(2,'0')}/${String(f.getMonth()+1).padStart(2,'0')}/${f.getFullYear()}`;
    pdf.text(`${fStr} · ${sesion.nombre}`, W - M - 4, 22, { align: 'right' });

    y = 40;

    /* CLIENTE / EQUIPO */
    const colW = (CW - 4) / 2;
    pdf.setFillColor(...COLOR.naranjaSuave); pdf.roundedRect(M, y, colW, 26, 2, 2, 'F');
    pdf.setFillColor(...COLOR.naranja); pdf.rect(M, y, 1.5, 26, 'F');
    pdf.setTextColor(...COLOR.naranja); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.text('CLIENTE', M + 5, y + 6);
    pdf.setTextColor(...COLOR.textoOscuro); pdf.setFontSize(11); pdf.text(datos.nombre.slice(0, 28), M + 5, y + 13);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(...COLOR.textoMedio); pdf.text(`Tel: ${datos.telefono}`, M + 5, y + 18);

    pdf.setFillColor(...COLOR.naranjaSuave); pdf.roundedRect(M + colW + 4, y, colW, 26, 2, 2, 'F');
    pdf.setFillColor(...COLOR.naranja); pdf.rect(M + colW + 4, y, 1.5, 26, 'F');
    pdf.setTextColor(...COLOR.naranja); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.text('EQUIPO', M + colW + 9, y + 6);
    pdf.setTextColor(...COLOR.textoOscuro); pdf.setFontSize(11); pdf.text(`${datos.marca} ${datos.modelo}`.slice(0, 28), M + colW + 9, y + 13);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(...COLOR.textoMedio);
    if (datos.imei) pdf.text(`IMEI: ${datos.imei}`, M + colW + 9, y + 18);
    pdf.text(`Enciende: ${datos.enciende}`, M + colW + 9, y + 23);
    y += 30;

    /* ESTADO / CLAVE */
    pdf.setFillColor(...COLOR.naranjaSuave); pdf.roundedRect(M, y, colW, 26, 2, 2, 'F');
    pdf.setFillColor(...COLOR.naranja); pdf.rect(M, y, 1.5, 26, 'F');
    pdf.setTextColor(...COLOR.naranja); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.text('ESTADO / FALLA', M + 5, y + 6);
    pdf.setTextColor(...COLOR.textoMedio); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);
    if (datos.estado) pdf.text(datos.estado.slice(0, 40), M + 5, y + 12);
    if (datos.falla) pdf.text(datos.falla.slice(0, 40), M + 5, y + 17);

    pdf.setFillColor(...COLOR.naranjaSuave); pdf.roundedRect(M + colW + 4, y, colW, 26, 2, 2, 'F');
    pdf.setFillColor(...COLOR.naranja); pdf.rect(M + colW + 4, y, 1.5, 26, 'F');
    pdf.setTextColor(...COLOR.naranja); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.text('CLAVE DE ACCESO', M + colW + 9, y + 6);
    let segInfo = datos.tipoSeguridad === 'pin' ? `PIN: ${datos.pin}` : (datos.patronSecuencia ? `Patrón: ${datos.patronSecuencia.split(',').join('-')}` : 'Sin clave');
    pdf.setTextColor(...COLOR.textoOscuro); pdf.setFontSize(12); pdf.text(segInfo.slice(0, 25), M + colW + 9, y + 16);
    y += 30;

    /* SERVICIOS */
    pdf.setFillColor(...COLOR.naranja); pdf.roundedRect(M, y, CW, 9, 1.5, 1.5, 'F');
    pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.text('SERVICIOS Y COSTOS', M + 4, y + 6);
    y += 12;
    pdf.autoTable({
      startY: y, head: [['Descripción', 'Costo']], body: datos.servicios.map(s => [s.desc, formatBs(s.costo)]),
      styles: { fontSize: 9, cellPadding: 3.5, textColor: COLOR.textoOscuro },
      headStyles: { fillColor: COLOR.naranja, textColor: 255 }, alternateRowStyles: { fillColor: [255, 250, 245] },
      columnStyles: { 0: { cellWidth: CW - 40 }, 1: { halign: 'right', cellWidth: 40, fontStyle: 'bold', textColor: COLOR.naranja } },
      margin: { left: M, right: M }, theme: 'grid'
    });
    y = pdf.lastAutoTable.finalY + 5;

    /* TOTALES */
    const boxW = 85, boxX = M + CW - boxW, boxAlto = datos.adelanto > 0 ? 28 : 20;
    pdf.setFillColor(...COLOR.grisFondo); pdf.roundedRect(boxX, y, boxW, boxAlto, 2, 2, 'F');
    pdf.setDrawColor(...COLOR.naranja); pdf.roundedRect(boxX, y, boxW, boxAlto, 2, 2, 'S');
    pdf.setTextColor(...COLOR.textoMedio); pdf.setFontSize(9); pdf.text('Total:', boxX + 5, y + 7);
    pdf.setTextColor(...COLOR.textoOscuro); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.text(formatBs(datos.total), boxX + boxW - 5, y + 7, { align: 'right' });
    let rowY = y + 7;
    if (datos.adelanto > 0) {
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(...COLOR.textoMedio); pdf.text('Adelanto:', boxX + 5, y + 14);
      pdf.setTextColor(...COLOR.textoOscuro); pdf.setFont('helvetica', 'bold'); pdf.text(`- ${formatBs(datos.adelanto)}`, boxX + boxW - 5, y + 14, { align: 'right' });
      rowY = y + 14;
    }
    pdf.setDrawColor(...COLOR.naranja); pdf.line(boxX + 5, rowY + 4, boxX + boxW - 5, rowY + 4);
    pdf.setTextColor(...COLOR.naranja); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.text('SALDO:', boxX + 5, rowY + 11);
    pdf.setFontSize(13); pdf.text(formatBs(datos.saldo), boxX + boxW - 5, rowY + 11, { align: 'right' });
    y += boxAlto + 6;

    /* FOTOS */
    const fotosValidas = datos.fotos.filter(f => f && f.dataUrl);
    if (fotosValidas.length > 0) {
      if (y > 235) { pdf.addPage(); y = 20; }
      pdf.setFillColor(...COLOR.naranja); pdf.roundedRect(M, y, CW, 8, 1.5, 1.5, 'F');
      pdf.setTextColor(255, 255, 255); pdf.setFontSize(8); pdf.text('FOTOS DEL EQUIPO', M + 4, y + 5.5); y += 11;
      const fotoW = (CW - 9) / 4, fotoH = fotoW * 0.75; let x = M;
      for (let i = 0; i < Math.min(fotosValidas.length, 4); i++) {
        try { pdf.addImage(fotosValidas[i].dataUrl, 'JPEG', x, y, fotoW, fotoH, undefined, 'FAST'); } catch (e) {}
        x += fotoW + 3;
      }
      y += fotoH + 6;
    }

    /* QR Y BANNER WEB LLAMATIVO */
    if (y > 215) { pdf.addPage(); y = 20; }
    pdf.setFillColor(...COLOR.naranja); pdf.roundedRect(M, y, CW, 36, 2, 2, 'F');
    
    pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
    pdf.text('¡VISITA NUESTRA PÁGINA WEB!', M + 8, y + 10);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(22);
    pdf.textWithLink(CONFIG.web, M + 8, y + 21, { url: CONFIG.urlApp });
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7);
    pdf.text('Toca el enlace o escanea el código QR', M + 8, y + 29);

    if (qrDataUrl) {
      try { pdf.setFillColor(255, 255, 255); pdf.roundedRect(W - M - 34, y + 4, 28, 28, 1.5, 1.5, 'F'); pdf.addImage(qrDataUrl, 'PNG', W - M - 32, y + 6, 24, 24); } catch (e) {}
    }
    y += 42;

    /* CONDICIONES Y FOOTER */
    pdf.setTextColor(...COLOR.naranja); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.5); pdf.text('CONDICIONES:', M, y + 4);
    pdf.setTextColor(...COLOR.textoMedio); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.5);
    CONFIG.condiciones.forEach((txt, i) => pdf.text(`${i + 1}. ${txt}`, M, y + 9 + i * 3.5));
    
    pdf.setFontSize(7); pdf.setTextColor(...COLOR.naranja); pdf.setFont('helvetica', 'bold');
    pdf.textWithLink(`© ${new Date().getFullYear()} ${CONFIG.nombreTienda} · ${CONFIG.web}`, W / 2, H - 10, { url: CONFIG.urlApp, align: 'center' });

    /* GUARDAR Y FIRESTORE */
    const nombreArchivo = `Recibo_${numeroRecibo}_${datos.nombre.split(' ')[0]}.pdf`;
    window._ultimoPDF = pdf; window._ultimoNombrePDF = nombreArchivo; pdf.save(nombreArchivo);

    try {
      await addDoc(collection(db, 'recibos'), {
        numeroRecibo, cliente: datos.nombre, telefono: datos.telefono, marca: datos.marca, modelo: datos.modelo, imei: datos.imei || null, enciende: datos.enciende, estadoEquipo: datos.estado || '-', falla: datos.falla || '-', tipoSeguridad: datos.tipoSeguridad, pin: datos.tipoSeguridad === 'pin' ? datos.pin : null, patron: datos.tipoSeguridad === 'patron' ? datos.patronSecuencia : null, servicios: datos.servicios, total: datos.total, adelanto: datos.adelanto, saldo: datos.saldo, fotos: datos.fotos.filter(f => f && f.dataUrl).map(f => f.dataUrl), estadoOrden: 'recibido', creadoPor: sesion.nombre, creadoPorRol: sesion.rol, fecha: serverTimestamp()
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
