// /app/js/panel-pdf.js
import { toast, haptic } from './app-ui.js';
import { parsearFecha } from './panel.js';

export function generarPDFDia(ordenes, ventasHoy) {
  haptic(20); 
  toast('Generando PDF...', 'info');
  
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();
  
  // Encabezado
  pdf.setFontSize(18); 
  pdf.text("Reporte del Día - DR. XIAOMI", 14, 20);
  pdf.setFontSize(10); 
  pdf.text(`Fecha: ${new Date().toLocaleDateString()}`, 14, 28);
  
  let y = 40; 
  let totalDia = 0;
  const hoy = new Date(); 
  hoy.setHours(0,0,0,0);

  // Sección: Reparaciones
  pdf.setFontSize(12); 
  pdf.text("Reparaciones Entregadas Hoy", 14, y); 
  y += 8; 
  pdf.setFontSize(10);
  
  ordenes.forEach(o => {
    if (o.estadoOrden === 'entregado') {
      const fEntrega = parsearFecha(o.fechaEntrega) || parsearFecha(o.fechaEditada) || parsearFecha(o.fecha);
      if (fEntrega && fEntrega >= hoy) {
        const monto = Number(o.montoCobrado) || 0;
        pdf.text(`- ${o.numeroRecibo || 'Sin N°'} | ${o.cliente} | ${o.marca} ${o.modelo} | Bs. ${monto.toFixed(2)}`, 14, y);
        totalDia += monto; 
        y += 6;
      }
    }
  });

  // Sección: Ventas Rápidas
  y += 4; 
  pdf.setFontSize(12); 
  pdf.text("Ventas Rápidas y Extras (Mostrador)", 14, y); 
  y += 8; 
  pdf.setFontSize(10);
  
  ventasHoy.forEach(v => {
    const fVenta = parsearFecha(v.fecha);
    if (fVenta && fVenta >= hoy) {
      const monto = Number(v.monto) || 0;
      pdf.text(`- ${v.concepto} | ${v.metodoPago} | Bs. ${monto.toFixed(2)}`, 14, y);
      totalDia += monto; 
      y += 6;
    }
  });

  // Total Final
  y += 10; 
  pdf.setFontSize(14); 
  pdf.text(`TOTAL DEL DÍA: Bs. ${totalDia.toFixed(2)}`, 14, y);
  
  // Guardar
  pdf.save(`Reporte_${new Date().toISOString().slice(0,10)}.pdf`); 
  toast('PDF generado con éxito', 'success');
}
