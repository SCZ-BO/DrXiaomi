/* ============================================================
   DR. XIAOMI · GENERADOR DE PDF ÚNICO
   Archivo: js/cliente-pdf.js
   ============================================================ */

import { CONFIG, sesion } from '/js/cliente.js';
import { toast, formatBs } from '/js/app-ui.js';

export async function generarPDFUnificado(datos, accion = 'guardar') {
  try {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      toast("Espera un momento, cargando librerías...", "warning");
      return false;
    }

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, M = 15, CW = W - M * 2; let y = 0;

    const naranja = [255, 105, 0];
    const grisFondo = [248, 248, 248];
    const textoOscuro = [30, 30, 30];
    const textoMedio = [100, 100, 100];

    // --- HEADER ---
    pdf.setFillColor(...naranja);
    pdf.rect(0, 0, W, 40, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(22);
    pdf.text(CONFIG.nombreTienda, M + 5, 16);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`${CONFIG.direccion} · Tel: ${CONFIG.telefono}`, M + 5, 24);

    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(W - M - 60, 8, 60, 24, 3, 3, 'F');
    pdf.setTextColor(...naranja);
    pdf.setFont('helvetica', 'bold');
    pdf.text('RECIBO N°', W - M - 4, 14, { align: 'right' });
    pdf.text(datos.numeroRecibo || 'NUEVO', W - M - 4, 20, { align: 'right' });

    y = 50;

    // --- CLIENTE Y EQUIPO ---
    const colW = (CW - 6) / 2;
    pdf.setFillColor(...grisFondo);
    pdf.roundedRect(M, y, colW, 30, 3, 3, 'F');
    pdf.setTextColor(...naranja);
    pdf.text('CLIENTE', M + 5, y + 7);
    pdf.setTextColor(...textoOscuro);
    pdf.text((datos.cliente || '').slice(0, 25), M + 5, y + 15);

    pdf.setFillColor(...grisFondo);
    pdf.roundedRect(M + colW + 6, y, colW, 30, 3, 3, 'F');
    pdf.setTextColor(...naranja);
    pdf.text('EQUIPO', M + colW + 11, y + 7);
    pdf.setTextColor(...textoOscuro);
    pdf.text(`${datos.marca || ''} ${datos.modelo || ''}`.slice(0, 25), M + colW + 11, y + 15);

    y += 36;

    // --- SERVICIOS ---
    pdf.setFillColor(...naranja);
    pdf.roundedRect(M, y, CW, 10, 3, 3, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.text('SERVICIOS', M + 5, y + 6.5);
    y += 14;

    pdf.autoTable({
      startY: y,
      head: [['Descripción', 'Costo']],
      body: (datos.servicios || []).map(s => [s.desc, formatBs(s.costo)]),
      headStyles: { fillColor: naranja },
      columnStyles: { 1: { halign: 'right' } },
      margin: { left: M, right: M }
    });

    y = pdf.lastAutoTable.finalY + 10;

    // --- TOTALES ---
    pdf.setTextColor(...textoOscuro);
    pdf.text(`TOTAL: ${formatBs(datos.total || 0)}`, M + CW - 5, y, { align: 'right' });
    pdf.setTextColor(...naranja);
    pdf.text(`SALDO: ${formatBs(datos.saldo || 0)}`, M + CW - 5, y + 8, { align: 'right' });

    // --- GUARDAR ---
    const nombre = `Recibo_${datos.numeroRecibo || 'Nuevo'}.pdf`;
    window._ultimoPDF = pdf;
    window._ultimoNombrePDF = nombre;
    pdf.save(nombre);

    return true;
  } catch (error) {
    console.error(error);
    toast("Error al generar PDF", "error");
    return false;
  }
}
