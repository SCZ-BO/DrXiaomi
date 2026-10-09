    pdf.setTextColor(50, 50, 50);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);

    let yy = y + 12;
    if (datos.estado) {
      const lineas = pdf.splitTextToSize(`Estado: ${datos.estado}`, CW - 8);
      pdf.text(lineas, M + 4, yy);
      yy += lineas.length * 4 + 2;
    }
    if (datos.falla) {
      const lineas = pdf.splitTextToSize(`Falla: ${datos.falla}`, CW - 8);
      pdf.text(lineas, M + 4, yy);
    }

    y += boxH + 6;
  }

  /* SEGURIDAD */
  pdf.setFillColor(248, 248, 248);
  pdf.roundedRect(M, y, CW, 22, 2, 2, 'F');

  pdf.setTextColor(255, 105, 0);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.text('CLAVE DE ACCESO DEL EQUIPO', M + 4, y + 6);

  pdf.setTextColor(50, 50, 50);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.text(`Tipo: ${datos.tipoSeguridad}`, M + 4, y + 14);

  if (datos.tipoSeguridad === 'pin') {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.text(`PIN: ${datos.pin}`, M + 4, y + 20);
  } else if (datos.tipoSeguridad === 'patron') {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    const secuencia = datos.patronSecuencia.split(',').join(' → ');
    pdf.text(`Secuencia: ${secuencia}`, M + 4, y + 20);
  } else {
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(10);
    pdf.text('Sin clave de acceso', M + 4, y + 20);
  }

  y += 28;

  /* SERVICIOS Y COSTOS */
  if (y > 200) { pdf.addPage(); y = 20; }

  pdf.setFillColor(255, 244, 235);
  pdf.roundedRect(M, y, CW, 12, 2, 2, 'F');
  pdf.setTextColor(255, 105, 0);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.text('SERVICIOS Y COSTOS', M + 4, y + 8);
  y += 16;

  // Tabla de servicios
  const serviciosData = datos.servicios.map(s => [s.desc, formatBs(s.costo)]);

  pdf.autoTable({
    startY: y,
    head: [['Descripción', 'Costo']],
    body: serviciosData,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { 
      fillColor: [255, 105, 0], 
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 9
    },
    columnStyles: { 
      0: { cellWidth: CW - 40 }, 
      1: { halign: 'right', cellWidth: 40, fontStyle: 'bold' } 
    },
    margin: { left: M, right: M },
    theme: 'grid'
  });

  y = pdf.lastAutoTable.finalY + 6;

  // Resumen de pago
  pdf.setFillColor(248, 248, 248);
  pdf.roundedRect(M + CW - 80, y, 80, datos.adelanto > 0 ? 26 : 16, 2, 2, 'F');

  pdf.setTextColor(80, 80, 80);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text('Total:', M + CW - 75, y + 6);
  pdf.setTextColor(50, 50, 50);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.text(formatBs(datos.total), M + CW - 5, y + 6, { align: 'right' });

  if (datos.adelanto > 0) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(80, 80, 80);
    pdf.text('Adelanto:', M + CW - 75, y + 13);
    pdf.setTextColor(50, 50, 50);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`- ${formatBs(datos.adelanto)}`, M + CW - 5, y + 13, { align: 'right' });

    pdf.setDrawColor(255, 105, 0);
    pdf.line(M + CW - 75, y + 16, M + CW - 5, y + 16);
  }

  // Saldo final
  pdf.setTextColor(255, 105, 0);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.text('SALDO A PAGAR:', M + CW - 75, y + (datos.adelanto > 0 ? 23 : 13));
  pdf.setFontSize(12);
  pdf.text(formatBs(datos.saldo), M + CW - 5, y + (datos.adelanto > 0 ? 23 : 13), { align: 'right' });

  y += datos.adelanto > 0 ? 34 : 24;

  /* FOTOS */
  const fotosValidas = datos.fotos.filter(f => f && f.dataUrl);
  if (fotosValidas.length > 0) {
    if (y > 200) { pdf.addPage(); y = 20; }

    pdf.setFillColor(255, 244, 235);
    pdf.roundedRect(M, y, CW, 10, 2, 2, 'F');
    pdf.setTextColor(255, 105, 0);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.text('FOTOS DEL EQUIPO', M + 4, y + 7);
    y += 14;

    const fotosPorFila = 3;
    const fotoW = (CW - 8) / fotosPorFila;
    const fotoH = fotoW * 0.75;
    let x = M;
    let col = 0;

    for (let i = 0; i < fotosValidas.length; i++) {
      if (y + fotoH > 275) { pdf.addPage(); y = 20; x = M; col = 0; }

      try {
        pdf.addImage(fotosValidas[i].dataUrl, 'JPEG', x, y, fotoW - 2, fotoH, undefined, 'FAST');
      } catch (e) {
        console.error('Error agregando foto:', e);
      }
      x += fotoW;
      col++;
      if (col === fotosPorFila) {
        x = M;
        y += fotoH + 2;
        col = 0;
      }
    }
    if (col !== 0) y += fotoH + 2;

    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(8);
    pdf.setTextColor(120, 120, 120);
    pdf.text('Estas fotos son el respaldo del estado del equipo al ser recibido.', M, y + 4);
    y += 12;
  }

  /* CONDICIONES */
  if (y > 220) { pdf.addPage(); y = 20; }

  pdf.setFillColor(248, 248, 248);
  pdf.roundedRect(M, y, CW, 32, 2, 2, 'F');

  pdf.setTextColor(255, 105, 0);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.text('CONDICIONES DEL SERVICIO', M + 4, y + 6);

  pdf.setTextColor(80, 80, 80);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  CONFIG.condiciones.forEach((txt, i) => {
    pdf.text(`${i + 1}. ${txt}`, M + 4, y + 12 + i * 3.5);
  });

  y += 38;

  /* FIRMAS */
  if (y > 240) { pdf.addPage(); y = 20; }

  pdf.setDrawColor(150, 150, 150);
  pdf.line(M, y + 15, M + 60, y + 15);
  pdf.line(W - M - 60, y + 15, W - M, y + 15);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(80, 80, 80);
  pdf.text('Firma del Cliente', M + 30, y + 19, { align: 'center' });
  pdf.text('Firma del Taller', W - M - 30, y + 19, { align: 'center' });

  /* FOOTER */
  pdf.setDrawColor(255, 105, 0);
  pdf.setLineWidth(0.5);
  pdf.line(M, H - 15, W - M, H - 15);

  pdf.setFontSize(7);
  pdf.setTextColor(120, 120, 120);
  pdf.text(`© ${new Date().getFullYear()} ${CONFIG.nombreTienda} · Todos los derechos reservados`, W / 2, H - 9, { align: 'center' });
  pdf.text(CONFIG.web, W / 2, H - 5, { align: 'center' });

  /* GUARDAR PDF */
  const nombreArchivo = `Recibo_${numeroRecibo}_${datos.nombre.split(' ')[0]}.pdf`;
  pdf.save(nombreArchivo);

  /* GUARDAR EN FIRESTORE */
  try {
    await addDoc(collection(db, 'recibos'), {
      numeroRecibo,
      cliente: datos.nombre,
      telefono: datos.telefono,
      marca: datos.marca,
      modelo: datos.modelo,
      imei: datos.imei || null,
      enciende: datos.enciende,
      estado: datos.estado || '-',
      falla: datos.falla || '-',
      tipoSeguridad: datos.tipoSeguridad,
      pin: datos.tipoSeguridad === 'pin' ? datos.pin : null,
      patron: datos.tipoSeguridad === 'patron' ? datos.patronSecuencia : null,
      servicios: datos.servicios,
      total: datos.total,
      adelanto: datos.adelanto,
      saldo: datos.saldo,
      fotos: datos.fotos.filter(f => f && f.dataUrl).map(f => f.dataUrl),
      estado_orden: 'recibido',
      creadoPor: sesion.nombre,
      creadoPorRol: sesion.rol,
      fecha: serverTimestamp()
    });
    console.log('✅ Recibo guardado en Firestore');
  } catch (err) {
    console.error('❌ Error guardando en Firestore:', err);
    toast('Recibo generado pero no se pudo guardar en la nube', 'warning', 4000);
  }

  /* MOSTRAR MODAL DE ÉXITO */
  document.getElementById('successNumero').textContent = numeroRecibo;
  const modal = document.getElementById('successModal');
  modal.classList.add('show');

  // Guardar datos para el botón de WhatsApp
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

/* ============================================================
   WHATSAPP
   ============================================================ */
function configurarWhatsApp() {
  const btn = document.getElementById('sendWhatsappBtn');
  // Remover listeners previos
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);

  newBtn.addEventListener('click', () => {
    const recibo = window._ultimoRecibo;
    if (!recibo) return;

    haptic(15);

    const mensaje = `Hola ${recibo.cliente.split(' ')[0]} 👋

✅ *Recibo de ingreso generado*

📄 N° Recibo: ${recibo.numeroRecibo}
📱 Equipo: ${recibo.marca} ${recibo.modelo}

💰 Total: ${formatBs(recibo.total)}
${recibo.saldo > 0 ? `💵 Saldo pendiente: ${formatBs(recibo.saldo)}\n` : ''}
Su equipo ha sido recibido en nuestro taller. Le avisaremos cuando esté listo.

🔧 *${CONFIG.nombreTienda}*
📍 ${CONFIG.direccion}
📞 ${CONFIG.telefono}
🌐 ${CONFIG.web}`;

    const tel = recibo.telefono.replace(/\D/g, '');
    const url = `https://wa.me/591${tel}?text=${encodeURIComponent(mensaje)}`;
    window.open(url, '_blank');
  });
}
