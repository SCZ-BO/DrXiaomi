/* ============================================================
   CAMBIAR ESTADO
   ============================================================ */
async function cambiarEstado(nuevoEstado) {
  if (!nuevoEstado || !ESTADOS[nuevoEstado]) return;

  const estadoActual = orden.estadoOrden || 'recibido';
  if (nuevoEstado === estadoActual) {
    toast('Ya está en ese estado', 'info', 1500);
    return;
  }

  // 🔥 SI ES ENTREGADO, ABRIMOS EL MODAL DE COBRO
  if (nuevoEstado === 'entregado') {
    abrirModalCobro();
    return;
  }

  haptic(20);
  showLoading('Actualizando estado...');

  try {
    const entrada = {
      tipo: 'estado',
      texto: `Estado cambiado a: ${ESTADOS[nuevoEstado].texto}`,
      autor: sesion.nombre,
      fecha: new Date().toISOString()
    };

    await updateDoc(doc(db, 'recibos', ordenId), {
      estadoOrden: nuevoEstado,
      bitacora: arrayUnion(entrada),
      actualizadoEn: serverTimestamp()
    });

    orden.estadoOrden = nuevoEstado;
    orden.bitacora = [...(orden.bitacora || []), entrada];

    toast(`Estado: ${ESTADOS[nuevoEstado].texto}`, 'success', 2000);
    renderOrden();
  } catch (err) {
    toast('Error al cambiar estado', 'error');
  } finally {
    hideLoading();
  }
}

/* ============================================================
   MODAL DE COBRO (ENTREGADO) - CON ESTILOS INYECTADOS
   ============================================================ */
function abrirModalCobro() {
  haptic(15);

  const total = Number(orden.total) || 0;
  const saldo = Number(orden.saldo) || 0;
  const montoSugerido = saldo > 0 ? saldo : total;

  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.id = 'modalCobro';
  
  // 🔥 ESTILOS INYECTADOS DIRECTAMENTE
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.85); backdrop-filter: blur(4px);
    z-index: 9999999; display: flex; align-items: center; justify-content: center;
    opacity: 0; transition: opacity 0.3s ease;
  `;

  modal.innerHTML = `
    <div style="
      background: var(--bg-card); border-radius: var(--radius-md); padding: 24px;
      width: 90%; max-width: 420px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      border: 1px solid var(--border); position: relative; z-index: 10000000;
      transform: translateY(20px); transition: transform 0.3s ease;
    ">
      <h3 style="color: var(--brand); font-weight: 800; font-size: 18px; margin-bottom: 8px;">✅ Confirmar entrega</h3>
      <p style="margin-bottom: 20px; font-size: 14px;">
        <strong>${escapeHtml(orden.cliente)}</strong><br>
        <span style="font-size: 12px; color: var(--text-mute);">Total: ${formatBs(total)}${saldo > 0 && saldo !== total ? ` · Saldo: ${formatBs(saldo)}` : ''}</span>
      </p>

      <div style="margin-bottom: 16px;">
        <label style="display:block; font-size:12px; font-weight:700; color:var(--text-mute); text-transform:uppercase; letter-spacing:0.6px; margin-bottom:6px;">Monto cobrado</label>
        <input type="number" id="inputMonto" step="0.01" min="0" value="${montoSugerido.toFixed(2)}" inputmode="decimal"
               style="width:100%; padding:14px; font-size:18px; font-weight:700; text-align:center; background:var(--bg-elev); color:var(--text-main); border:1px solid var(--border); border-radius:var(--radius-sm); font-family:inherit;">
      </div>

      <div style="margin-bottom: 20px;">
        <label style="display:block; font-size:12px; font-weight:700; color:var(--text-mute); text-transform:uppercase; letter-spacing:0.6px; margin-bottom:8px;">Método de pago</label>
        <div id="metodosPago" style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
          <button type="button" class="metodo-btn" data-metodo="Efectivo" style="display:flex; flex-direction:column; align-items:center; gap:4px; padding:12px 8px; background:var(--bg-elev); border:1px solid var(--border); border-radius:var(--radius-sm); color:var(--text-main); font-size:12px; font-weight:600; cursor:pointer; font-family:inherit;"><i class="fas fa-money-bill-wave" style="font-size:20px;"></i><span>Efectivo</span></button>
          <button type="button" class="metodo-btn" data-metodo="QR" style="display:flex; flex-direction:column; align-items:center; gap:4px; padding:12px 8px; background:var(--bg-elev); border:1px solid var(--border); border-radius:var(--radius-sm); color:var(--text-main); font-size:12px; font-weight:600; cursor:pointer; font-family:inherit;"><i class="fas fa-qrcode" style="font-size:20px;"></i><span>QR</span></button>
          <button type="button" class="metodo-btn" data-metodo="Transferencia" style="display:flex; flex-direction:column; align-items:center; gap:4px; padding:12px 8px; background:var(--bg-elev); border:1px solid var(--border); border-radius:var(--radius-sm); color:var(--text-main); font-size:12px; font-weight:600; cursor:pointer; font-family:inherit;"><i class="fas fa-building-columns" style="font-size:20px;"></i><span>Transferencia</span></button>
          <button type="button" class="metodo-btn" data-metodo="Mixto" style="display:flex; flex-direction:column; align-items:center; gap:4px; padding:12px 8px; background:var(--bg-elev); border:1px solid var(--border); border-radius:var(--radius-sm); color:var(--text-main); font-size:12px; font-weight:600; cursor:pointer; font-family:inherit;"><i class="fas fa-shuffle" style="font-size:20px;"></i><span>Mixto</span></button>
        </div>
        <div id="detalleMixtoContainer" style="display:none; margin-top:10px;">
          <input type="text" id="detalleMixto" placeholder="Ej: 200 efectivo + 150 QR" maxlength="100"
                 style="width:100%; padding:12px; background:var(--bg-elev); color:var(--text-main); border:1px solid var(--border); border-radius:var(--radius-sm); font-family:inherit; font-size:13px;">
        </div>
        <div id="errorMetodo" style="color:#EF4444; font-size:12px; margin-top:8px; display:none;"></div>
      </div>

      <div style="display:flex; gap:8px;">
        <button type="button" id="btnCancelarCobro" style="flex:1; padding:14px; border-radius:var(--radius-sm); border:1px solid var(--border); background:var(--bg-elev); color:var(--text-main); font-weight:700; cursor:pointer; font-family:inherit;">Cancelar</button>
        <button type="button" id="btnConfirmarCobro" style="flex:1; padding:14px; border-radius:var(--radius-sm); border:none; background:var(--brand); color:white; font-weight:700; cursor:pointer; font-family:inherit;"><i class="fas fa-check"></i> Confirmar</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // 🔥 FORZAMOS LA APARICIÓN CON UN PEQUEÑO DELAY
  setTimeout(() => {
    modal.style.opacity = '1';
    modal.querySelector('div').style.transform = 'translateY(0)';
  }, 10);

  let metodoSeleccionado = null;

  modal.querySelectorAll('.metodo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      haptic(8);
      modal.querySelectorAll('.metodo-btn').forEach(b => {
        b.classList.remove('activo');
        b.style.background = 'var(--bg-elev)';
        b.style.borderColor = 'var(--border)';
        b.style.color = 'var(--text-main)';
      });
      btn.classList.add('activo');
      btn.style.background = 'var(--brand-light)';
      btn.style.borderColor = 'var(--brand)';
      btn.style.color = 'var(--brand)';
      metodoSeleccionado = btn.dataset.metodo;
      document.getElementById('detalleMixtoContainer').style.display = metodoSeleccionado === 'Mixto' ? 'block' : 'none';
      document.getElementById('errorMetodo').style.display = 'none';
    });
  });

  document.getElementById('btnCancelarCobro').addEventListener('click', () => {
    modal.style.opacity = '0';
    setTimeout(() => modal.remove(), 300);
  });

  document.getElementById('btnConfirmarCobro').addEventListener('click', async () => {
    const monto = parseFloat(document.getElementById('inputMonto').value) || 0;
    if (!metodoSeleccionado) {
      document.getElementById('errorMetodo').textContent = 'Selecciona un método de pago';
      document.getElementById('errorMetodo').style.display = 'block';
      return;
    }
    if (monto <= 0) {
      document.getElementById('errorMetodo').textContent = 'Ingresa un monto válido';
      document.getElementById('errorMetodo').style.display = 'block';
      return;
    }
    let metodoFinal = metodoSeleccionado;
    if (metodoSeleccionado === 'Mixto') {
      const detalle = document.getElementById('detalleMixto').value.trim();
      if (!detalle) {
        document.getElementById('errorMetodo').textContent = 'Especifica el detalle';
        document.getElementById('errorMetodo').style.display = 'block';
        return;
      }
      metodoFinal = `Mixto (${detalle})`;
    }
    await confirmarCobro(monto, metodoFinal);
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.style.opacity = '0';
      setTimeout(() => modal.remove(), 300);
    }
  });
}

/* ============================================================
   MODAL DE COSTO (PRESUPUESTO) - CON ESTILOS INYECTADOS
   ============================================================ */
function abrirModalCosto() {
  if (sesion.rol !== 'admin') return;
  haptic(15);

  const monto = Number(orden.montoCobrado) || 0;
  const costoActual = Number(orden.costoRepuesto) || 0;
  const gananciaInicial = monto - costoActual;

  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.id = 'modalCosto';
  
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.85); backdrop-filter: blur(4px);
    z-index: 9999999; display: flex; align-items: center; justify-content: center;
    opacity: 0; transition: opacity 0.3s ease;
  `;

  modal.innerHTML = `
    <div style="
      background: var(--bg-card); border-radius: var(--radius-md); padding: 24px;
      width: 90%; max-width: 420px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      border: 1px solid var(--border); position: relative; z-index: 10000000;
      transform: translateY(20px); transition: transform 0.3s ease;
    ">
      <h3 style="color: #10B981; font-weight: 800; font-size: 18px; margin-bottom: 16px;"><i class="fas fa-calculator"></i> Registrar presupuesto</h3>

      <div style="background:var(--bg-elev); border-radius:var(--radius-sm); padding:12px; margin-bottom:1rem; border:1px solid var(--border);">
        <div style="font-size:11px; color:var(--text-mute); margin-bottom:4px;">RECIBO</div>
        <div style="font-weight:700; font-size:13px;">${escapeHtml(orden.numeroRecibo || '-')}</div>
        <div style="font-size:12px; color:var(--text-main); margin-top:4px;">${escapeHtml(orden.cliente || '-')}</div>
        <div style="font-size:11px; color:var(--text-mute); margin-top:2px;">${escapeHtml(orden.marca || '')} ${escapeHtml(orden.modelo || '')}</div>
      </div>

      <div style="margin-bottom:1rem;">
        <label style="display:block; font-size:11px; font-weight:700; color:var(--text-mute); text-transform:uppercase; letter-spacing:0.6px; margin-bottom:6px;">Monto cobrado al cliente</label>
        <div style="background:var(--bg-elev); border:1px solid var(--border); border-radius:var(--radius-sm); padding:14px; font-size:18px; font-weight:800; text-align:center; color:var(--brand);">
          ${formatBs(monto)}
        </div>
      </div>

      <div style="margin-bottom:1rem;">
        <label style="display:block; font-size:11px; font-weight:700; color:var(--text-mute); text-transform:uppercase; letter-spacing:0.6px; margin-bottom:6px;">Costo del repuesto</label>
        <input type="number" id="costoInput" step="0.01" min="0" value="${costoActual > 0 ? costoActual.toFixed(2) : ''}" inputmode="decimal" placeholder="0.00"
               style="width:100%; padding:14px; font-size:20px; font-weight:800; text-align:center; background:var(--bg-elev); color:#F59E0B; border:1px solid var(--border); border-radius:var(--radius-sm); font-family:inherit;">
        <div style="display:flex; gap:6px; margin-top:8px;">
          <button type="button" class="costo-preset" data-pct="0.7" style="flex:1; padding:8px; background:var(--bg-elev); border:1px solid var(--border); border-radius:var(--radius-sm); color:var(--text-main); font-size:11px; font-weight:700; cursor:pointer; font-family:inherit;">70%</button>
          <button type="button" class="costo-preset" data-pct="0.5" style="flex:1; padding:8px; background:var(--bg-elev); border:1px solid var(--border); border-radius:var(--radius-sm); color:var(--text-main); font-size:11px; font-weight:700; cursor:pointer; font-family:inherit;">50%</button>
          <button type="button" class="costo-preset" data-pct="0.4" style="flex:1; padding:8px; background:var(--bg-elev); border:1px solid var(--border); border-radius:var(--radius-sm); color:var(--text-main); font-size:11px; font-weight:700; cursor:pointer; font-family:inherit;">40%</button>
        </div>
      </div>

      <div style="background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.3); border-radius:var(--radius-sm); padding:16px; margin-bottom:1.2rem; text-align:center;">
        <div style="font-size:11px; color:var(--text-mute); text-transform:uppercase; font-weight:700; letter-spacing:0.6px; margin-bottom:4px;">Ganancia neta</div>
        <div id="gananciaPreview" style="font-size:26px; font-weight:900; color:#10B981; line-height:1;">${formatBs(gananciaInicial)}</div>
      </div>

      <div style="display:flex; gap:8px;">
        <button type="button" id="btnCancelarCosto" style="flex:1; padding:14px; border-radius:var(--radius-sm); border:1px solid var(--border); background:var(--bg-elev); color:var(--text-main); font-weight:700; cursor:pointer; font-family:inherit;">Cancelar</button>
        <button type="button" id="btnGuardarCosto" style="flex:1; padding:14px; border-radius:var(--radius-sm); border:none; background:var(--brand); color:white; font-weight:700; cursor:pointer; font-family:inherit;"><i class="fas fa-check"></i> Guardar</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  setTimeout(() => {
    modal.style.opacity = '1';
    modal.querySelector('div').style.transform = 'translateY(0)';
  }, 10);

  const costoInput = modal.querySelector('#costoInput');
  const gananciaPreview = modal.querySelector('#gananciaPreview');

  function actualizarPreview() {
    const costo = parseFloat(costoInput.value) || 0;
    const ganancia = monto - costo;
    gananciaPreview.textContent = formatBs(ganancia);
    gananciaPreview.style.color = ganancia >= 0 ? '#10B981' : '#EF4444';
  }

  costoInput.addEventListener('input', actualizarPreview);
  costoInput.focus();

  modal.querySelectorAll('.costo-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const pct = parseFloat(btn.dataset.pct);
      costoInput.value = (monto * pct).toFixed(2);
      actualizarPreview();
      haptic(8);
    });
  });

  document.getElementById('btnCancelarCosto').addEventListener('click', () => {
    modal.style.opacity = '0';
    setTimeout(() => modal.remove(), 300);
  });

  document.getElementById('btnGuardarCosto').addEventListener('click', async () => {
    const costo = parseFloat(costoInput.value) || 0;
    haptic(20);
    showLoading('Guardando costo...');

    try {
      const ganancia = monto - costo;
      const entrada = {
        tipo: 'cobro',
        texto: `Costo registrado: ${formatBs(costo)} · Ganancia: ${formatBs(ganancia)}`,
        autor: sesion.nombre,
        fecha: new Date().toISOString()
      };

      await updateDoc(doc(db, 'recibos', ordenId), {
        costoRepuesto: costo,
        gananciaNeta: ganancia,
        costoActualizadoEn: serverTimestamp(),
        costoActualizadoPor: sesion.nombre,
        bitacora: arrayUnion(entrada)
      });

      orden.costoRepuesto = costo;
      orden.gananciaNeta = ganancia;
      orden.bitacora = [...(orden.bitacora || []), entrada];

      toast(`Costo guardado · Ganancia: ${formatBs(ganancia)}`, 'success', 2500);
      modal.style.opacity = '0';
      setTimeout(() => modal.remove(), 300);
      renderOrden();
    } catch (err) {
      toast('Error al guardar el costo', 'error');
    } finally {
      hideLoading();
    }
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.style.opacity = '0';
      setTimeout(() => modal.remove(), 300);
    }
  });
}
