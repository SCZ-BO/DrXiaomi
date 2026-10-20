/* ============================================================
   DR. XIAOMI · PDF DEL RECIBO (MOTOR CENTRAL BLINDADO v2)
   Archivo: js/cliente-pdf.js
   ============================================================ */

// 🔥 CAMBIO: Separar imports. Firebase ya NO viene de cliente.js
import { datos, sesion, CONFIG, generarNumeroRecibo } from '/js/cliente.js';
import { toast, haptic, formatBs, showLoading, hideLoading } from '/js/app-ui.js';

// 🔥 CAMBIO: Importar Firebase desde firebase.js (verifica que exporte db y auth)
import { db, auth } from '/js/firebase.js';
import {
  collection, addDoc, serverTimestamp,
  query, where, getDocs, updateDoc, doc
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
//                                   👆 CAMBIA ESTO POR 10.12.0

// 🔥 CAMBIO: Variable de módulo en lugar de window._ultimoPDF
let ultimoPDF = null;
let ultimoNombrePDF = 'recibo.pdf';

const COLOR = {
  naranja: [255, 105, 0], naranjaClaro: [255, 140, 60], naranjaSuave: [255, 244, 235],
  grisFondo: [248, 248, 248], grisSuave: [235, 235, 235],
  textoOscuro: [30, 30, 30], textoMedio: [100, 100, 100], textoClaro: [150, 150, 150], blanco: [255, 255, 255]
};

// 🔥 FUNCIÓN PARA CARGAR SCRIPTS DINÁMICAMENTE
function cargarScript(url) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${url}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = url; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Error al descargar: ${url}`));
    document.head.appendChild(s);
  });
}

async function cargarLibreriasPDF() {
  if (!window.jspdf) {
    await cargarScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    await new Promise(r => setTimeout(r, 150));
  }
  if (!window.jspdf || !window.jspdf.jsPDF) {
    throw new Error("jsPDF no se inicializó. Revisa tu conexión.");
  }
  if (!window.jspdf.jsPDF.API.autoTable) {
    await cargarScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js');
    await new Promise(r => setTimeout(r, 150));
  }
  if (!window.QRCode) {
    await cargarScript('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js');
    await new Promise(r => setTimeout(r, 150));
  }
}

// 🔥 CAMBIO: Función pública para descargar el último PDF (para el botón del modal)
export function descargarUltimoPDF() {
  if (ultimoPDF) {
    try {
      ultimoPDF.save(ultimoNombrePDF || 'recibo.pdf');
      toast('PDF descargado', 'success');
    } catch (err) {
      console.error(err);
      toast('Error al descargar el PDF', 'error');
    }
  } else {
    toast('Genera el recibo primero', 'warning');
  }
}

export function configurarPDF() {
  document.getElementById('btnGenerate')?.addEventListener('click', generarPDF);
  document.getElementById('backToPanelBtn2')?.addEventListener('click', () => window.location.href = '/app/');
  // 🔥 CAMBIO: usar la función descargarUltimoPDF en lugar de window._ultimoPDF
  document.getElementById('downloadPdfBtn')?.addEventListener('click', () => {
    haptic(15);
    descargarUltimoPDF();
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
      try {
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        resolve(c.toDataURL('image/png'));
      } catch (e) { resolve(''); }
    };
    img.onerror = () => resolve('');
    img.src = CONFIG.logoUrl;
  });
}

// 🔥 CAMBIO: Verificar que numeroRecibo no exista ya en Firestore
async function verificarNumeroUnico(numeroRecibo) {
  try {
    const q = query(collection(db, 'recibos'), where('numeroRecibo', '==', numeroRecibo));
    const snap = await getDocs(q);
    return snap.empty;
  } catch (err) {
    console.warn('No se pudo verificar unicidad del número de recibo:', err);
    return true; // si falla la verificación, no bloqueamos
  }
}

// 🔥 CAMBIO: función interna que construye el PDF (sin guardar en Firestore)
async function construirPDF(paquete, numeroRecibo) {
  // Cargar librerías
  await cargarLibreriasPDF();

  // Cargar logo y QR
  const [logoDataUrl, qrDataUrl] = await Promise.all([
    cargarLogoDataUrl(),
    generarQRDataUrl(`${CONFIG.urlApp}/?recibo=${numeroRecibo}`)
  ]);

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, H = 297, M = 15, CW = W - M * 2;
  let y = 0;

  /* ================= HEADER ================= */
  pdf.setFillColor(...COLOR.naranja);
  pdf.rect(0, 0, W, 40, 'F');
  pdf.setFillColor(...COLOR.naranjaClaro);
  pdf.rect(0, 40, W, 2, 'F');

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
  pdf.setTextColor(...COLOR.naranja);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.text('RECIBO N°', W - M - 4, 14, { align: 'right' });
  pdf.setFontSize(11);
  pdf.text(numeroRecibo, W - M - 4, 20, { align: 'right' });
  pdf.setTextColor(...COLOR.textoMedio);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  const f = new Date();
  const fStr = `${String(f.getDate()).padStart(2,'0')}/${String(f.getMonth()+1).padStart(2,'0')}/${f.getFullYear()}`;
  pdf.text(`${fStr} · ${sesion.nombre}`, W - M - 4, 26, { align: 'right' });

  y = 50;

  /* ================= CLIENTE / EQUIPO ================= */
  const colW = (CW - 6) / 2;

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
  pdf.text((paquete.cliente || '').slice(0, 25), M + 5, y + 15);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(...COLOR.textoMedio);
  pdf.text(`Tel: ${paquete.telefono || ''}`, M + 5, y + 23);

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
  pdf.text(`${paquete.marca || ''} ${paquete.modelo || ''}`.slice(0, 25), M + colW + 11, y + 15);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(...COLOR.textoMedio);
  if (paquete.imei) pdf.text(`IMEI: ${paquete.imei}`, M + colW + 11, y + 21);
  pdf.text(`Enciende: ${paquete.enciende || ''}`, M + colW + 11, y + 26);

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
  let fallaText = paquete.falla || paquete.estadoEquipo || 'No especificado';
  pdf.text(pdf.splitTextToSize(fallaText, colW - 10), M + 5, y + 14);

  pdf.setFillColor(...COLOR.grisFondo);
  pdf.roundedRect(M + colW + 6, y, colW, 30, 3, 3, 'F');
  pdf.setFillColor(...COLOR.naranja);
  pdf.rect(M + colW + 6, y, 2, 30, 'F');
  pdf.setTextColor(...COLOR.naranja);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.text('CLAVE DE ACCESO', M + colW + 11, y + 7);

  let segInfo = paquete.tipoSeguridad === 'pin'
    ? `PIN: ${paquete.pin}`
    : (paquete.patron ? `Patrón: ${paquete.patron.split(',').join('-')}` : 'Sin clave');
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
    body: (paquete.servicios || []).map(s => [s.desc, formatBs(s.costo)]),
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
  const boxAlto = paquete.adelanto > 0 ? 28 : 20;

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
  pdf.text(formatBs(paquete.total || 0), boxX + boxW - 5, y + 8, { align: 'right' });

  let rowY = y + 8;
  if (paquete.adelanto > 0) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(...COLOR.textoMedio);
    pdf.text('Adelanto:', boxX + 5, y + 15);
    pdf.setTextColor(...COLOR.textoOscuro);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`- ${formatBs(paquete.adelanto)}`, boxX + boxW - 5, y + 15, { align: 'right' });
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
  pdf.text(formatBs(paquete.saldo || 0), boxX + boxW - 5, rowY + 12, { align: 'right' });

  y += boxAlto + 8;

  /* ================= FOTOS ================= */
  const fotosValidas = (paquete.fotos || []).filter(f => f && (f.dataUrl || typeof f === 'string'));
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
        const fVal = fotosValidas[i];
        const dataUrl = (typeof fVal === 'string') ? fVal : (fVal.dataUrl || '');
        if (!dataUrl) continue;
        pdf.setFillColor(255, 255, 255);
        pdf.roundedRect(x, y, fotoW, fotoH, 2, 2, 'F');
        pdf.setDrawColor(220, 220, 220);
        pdf.roundedRect(x, y, fotoW, fotoH, 2, 2, 'S');
        pdf.addImage(dataUrl, 'JPEG', x + 1, y + 1, fotoW - 2, fotoH - 2, undefined, 'FAST');
      } catch (e) {}
      x += fotoW + 3;
    }
    y += fotoH + 10;
  }

  /* ================= BANNER WEB ================= */
  if (y > 215) { pdf.addPage(); y = 20; }
  pdf.setFillColor(...COLOR.naranja);
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
  pdf.setFillColor(...COLOR.grisFondo);
  pdf.roundedRect(M, y, CW, 30, 3, 3, 'F');
  pdf.setTextColor(...COLOR.naranja);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.text('CONDICIONES DEL SERVICIO', M + 5, y + 6);
  pdf.setTextColor(...COLOR.textoMedio);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  (CONFIG.condiciones || []).forEach((txt, i) => {
    pdf.text(`${i + 1}. ${txt}`, M + 5, y + 12 + i * 3.5);
  });

  return { pdf, qrDataUrl };
}

/* ============================================================
   🔥 FUNCIÓN PRINCIPAL (puede recibir un paquete ya construido
   o construirlo desde el wizard)
   ============================================================ */
export async function generarPDFUnificado(paquete, accion = 'guardar') {
  showLoading('Generando PDF...');
  haptic(20);

  try {
    // 1. Generar número único de recibo
    let numeroRecibo = paquete.numeroRecibo || generarNumeroRecibo();

    // 🔥 CAMBIO: verificar unicidad SOLO si vamos a guardar en la nube
    if (accion === 'guardar_en_nube' && db) {
      const esUnico = await verificarNumeroUnico(numeroRecibo);
      if (!esUnico) {
        numeroRecibo = `${numeroRecibo}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
      }
    }

    // 2. Construir PDF (solo diseño, no guarda nada aún)
    const { pdf } = await construirPDF(paquete, numeroRecibo);

    // 3. Guardar PRIMERO en Firestore (si se pidió)
    let guardadoEnNube = false;
    let errorGuardado = null;

    if (accion === 'guardar_en_nube') {
      if (!db) {
        errorGuardado = 'Firebase no inicializado';
      } else if (!auth?.currentUser) {
        // 🔥 CAMBIO: verificar auth.currentUser
        errorGuardado = 'Debes iniciar sesión para guardar en la nube';
      } else {
        try {
          const docRef = await addDoc(collection(db, 'recibos'), {
            numeroRecibo,
            cliente: paquete.cliente || '',
            telefono: paquete.telefono || '',
            marca: paquete.marca || '',
            modelo: paquete.modelo || '',
            imei: paquete.imei || null,
            enciende: paquete.enciende || '',
            estadoEquipo: paquete.estadoEquipo || '-',
            falla: paquete.falla || '-',
            tipoSeguridad: paquete.tipoSeguridad || 'ninguno',
            pin: paquete.tipoSeguridad === 'pin' ? paquete.pin : null,
            patron: paquete.tipoSeguridad === 'patron' ? paquete.patron : null,
            servicios: paquete.servicios || [],
            total: paquete.total || 0,
            adelanto: paquete.adelanto || 0,
            saldo: paquete.saldo || 0,
            // 🔥 CAMBIO: campos nuevos para que app/index.html los lea
            metodoPago: paquete.metodoPago || null,
            fotos: paquete.fotos || [],
            estadoOrden: 'recibido',
            fechaEntrega: null,
            creadoPor: sesion.nombre || 'Desconocido',
            creadoPorRol: sesion.rol || 'operador',
            fecha: serverTimestamp(),
            actualizadoEn: serverTimestamp(),
            id: null // se rellena justo después con el ID real
          });
          // Actualizar el campo `id` con el ID real del documento
          await updateDoc(doc(db, 'recibos', docRef.id), { id: docRef.id });
          guardadoEnNube = true;
        } catch (err) {
          console.error('Error Firestore:', err.code, err.message);
          if (err.code === 'permission-denied') errorGuardado = 'Sin permisos. Inicia sesión.';
          else if (err.code === 'unavailable') errorGuardado = 'Sin conexión a internet.';
          else errorGuardado = 'Error: ' + (err.message || 'desconocido');
        }
      }
    }

    // 4. Guardar PDF localmente
    const nombreArchivo = `Recibo_${numeroRecibo}_${(paquete.cliente || 'Cliente').split(' ')[0]}.pdf`;
    ultimoPDF = pdf;
    ultimoNombrePDF = nombreArchivo;
    try {
      pdf.save(nombreArchivo);
    } catch (err) {
      console.error('Error al descargar PDF:', err);
    }

    // 5. Feedback al usuario
    if (accion === 'guardar_en_nube') {
      if (guardadoEnNube) {
        toast('✅ Recibo guardado y descargado', 'success', 3000);
      } else {
        toast(`⚠️ PDF descargado. ${errorGuardado || 'No se guardó en la nube'}`, 'warning', 5000);
      }
    } else {
      toast('PDF generado', 'success');
    }

    // 6. Devolver resultado (útil para quien llame la función)
    return {
      success: true,
      guardadoEnNube,
      numeroRecibo,
      errorGuardado,
      nombreArchivo
    };

  } catch (err) {
    console.error('Error al generar PDF:', err);
    toast('Error al generar el PDF: ' + (err.message || err), 'error', 5000);
    return { success: false, error: err.message };
  } finally {
    hideLoading();
  }
}

/* ============================================================
   🔥 ALIAS para compatibilidad con cliente.js
   (por si cliente.js llama a generarPDF en lugar de generarPDFUnificado)
   ============================================================ */
export async function generarPDF(paquete, accion = 'guardar') {
  return generarPDFUnificado(paquete, accion);
}
