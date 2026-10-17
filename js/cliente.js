/* ============================================================
   DR. XIAOMI · CLIENTE (Wizard de nuevo recibo)
   Archivo: js/cliente.js
   ============================================================ */

import { requireAuth, logout } from '/js/app-auth.js';
import {
  toast, haptic, initTheme,
  escapeHtml, formatBs, showLoading, hideLoading
} from '/js/app-ui.js';
import { db } from '/js/firebase.js';
import { collection, addDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ⬇️ Importamos el generador de PDF unificado
import { generarPDFUnificado } from '/js/cliente-pdf.js';

/* ============================================================
   CONFIGURACIÓN GENERAL
   ============================================================ */
const CONFIG = {
  nombreTienda: 'DR. XIAOMI SCZ',
  eslogan: 'Servicio Técnico Especializado',
  direccion: 'Centro Comercial Cañoto #K1, Santa Cruz',
  telefono: '75959450',
  horario: 'Lunes a Sábado 9:00 - 20:00',
  web: 'xiaomi.scz.red',
  urlApp: 'https://xiaomi.scz.red',
  logoUrl: 'https://xiaomi.scz.red/img/logo1.png',
  condiciones: [
    'Conserve este recibo. Solo con él puede retirar su equipo.',
    'La fecha de entrega está sujeta a disponibilidad de repuestos.',
    'El retiro debe hacerse dentro de los 10 días posteriores al aviso.',
    'Pasados 20 días sin retiro, el equipo se considera abandonado.',
    'Garantía: 30 días en repuestos / 60 días en mano de obra.'
  ]
};

/* ============================================================
   ESTADO
   ============================================================ */
let sesion = null;
let pasoActual = 1;
const TOTAL_PASOS = 7;

const datos = {
  nombre: '', telefono: '',
  marca: '', modelo: '', imei: '', enciende: '',
  estado: '', falla: '',
  tipoSeguridad: 'patron', pin: '', patronSecuencia: '',
  fotos: [null, null, null, null],
  servicios: [], total: 0, adelanto: 0, saldo: 0
};

export {
  sesion, datos, CONFIG, generarNumeroRecibo, configurarWhatsApp,
  showLoading, hideLoading, toast, haptic, formatBs, escapeHtml,
  db, collection, addDoc, serverTimestamp
};

/* ============================================================
   INICIALIZACIÓN
   ============================================================ */
initTheme();

requireAuth((s) => {
  sesion = s;
  iniciar();
});

function iniciar() {
  const userInfo = document.getElementById('userInfo');
  if (userInfo) userInfo.textContent = `${sesion.icono || ''} ${sesion.nombre}`;

  configurarHeader();
  configurarWizard();
  configurarMarca();
  configurarRadioGroups();
  configurarPattern();
  configurarFotos();
  configurarServicios();
  configurarAdelanto();
  configurarCharCounters();
  
  configurarBotonGenerarPDF();

  actualizarBotonesRemove();
  actualizarBarraProgreso();
  actualizarBotones();

  console.log('✅ Wizard inicializado correctamente');
}

/* ============================================================
   HEADER
   ============================================================ */
function configurarHeader() {
  document.getElementById('backToPanelBtn')?.addEventListener('click', () => {
    haptic(10);
    if (confirm('¿Salir? Los datos no guardados se perderán.')) window.location.href = '/app/';
  });
  document.getElementById('homeBtn')?.addEventListener('click', () => {
    haptic(15);
    window.location.href = '/app/';
  });
  document.getElementById('preciosBtn')?.addEventListener('click', () => {
    haptic(15);
    window.location.href = '/precio/';
  });
  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    haptic(20);
    if (confirm('¿Cerrar sesión?')) logout();
  });
}

/* ============================================================
   WIZARD
   ============================================================ */
function configurarWizard() {
  document.getElementById('btnPrev')?.addEventListener('click', irPasoAnterior);
  document.getElementById('btnNext')?.addEventListener('click', irPasoSiguiente);
}

function irPasoSiguiente() {
  if (!validarPaso(pasoActual)) return;
  guardarDatosPaso(pasoActual);
  if (pasoActual < TOTAL_PASOS) irAPaso(pasoActual + 1);
}

function irPasoAnterior() {
  guardarDatosPaso(pasoActual);
  if (pasoActual > 1) irAPaso(pasoActual - 1);
}

function irAPaso(nuevoPaso) {
  haptic(10);
  pasoActual = nuevoPaso;

  document.querySelectorAll('.wizard-panel').forEach(p => p.classList.add('hidden'));
  const panelActual = document.querySelector(`[data-panel="${pasoActual}"]`);
  if (panelActual) {
    panelActual.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  actualizarBarraProgreso();
  actualizarBotones();
  if (pasoActual === 7) generarVistaPrevia();
}

function actualizarBarraProgreso() {
  document.querySelectorAll('.wizard-step').forEach(el => {
    const step = parseInt(el.dataset.step);
    el.classList.remove('active', 'done');
    if (step < pasoActual) el.classList.add('done');
    else if (step === pasoActual) el.classList.add('active');
  });
  const fill = document.getElementById('wizardBarFill');
  if (fill) fill.style.width = `${(pasoActual / TOTAL_PASOS) * 100}%`;
}

function actualizarBotones() {
  const btnPrev = document.getElementById('btnPrev');
  const btnNext = document.getElementById('btnNext');
  const btnGenerate = document.getElementById('btnGenerate');
  if (!btnPrev || !btnNext || !btnGenerate) return;

  btnPrev.style.display = pasoActual === 1 ? 'none' : 'flex';
  if (pasoActual === TOTAL_PASOS) {
    btnNext.style.display = 'none';
    btnGenerate.style.display = 'flex';
  } else {
    btnNext.style.display = 'flex';
    btnGenerate.style.display = 'none';
  }
}

/* ============================================================
   VALIDACIÓN Y GUARDADO
   ============================================================ */
function validarPaso(paso) {
  switch (paso) {
    case 1: return validarCliente();
    case 2: return validarEquipo();
    case 4: return validarSeguridad();
    case 6: return validarCostos();
    default: return true;
  }
}

function validarCliente() {
  const nombreEl = document.getElementById('nombre');
  const telefonoEl = document.getElementById('telefono');
  const nombre = nombreEl?.value.trim() || '';
  const telefono = telefonoEl?.value.trim() || '';

  if (!nombre) { toast('Ingresa el nombre del cliente', 'error'); nombreEl?.focus(); return false; }
  if (!telefono || telefono.length < 7) { toast('Ingresa un teléfono válido', 'error'); telefonoEl?.focus(); return false; }
  return true;
}

function validarEquipo() {
  const marca = document.getElementById('marca')?.value || '';
  const modelo = document.getElementById('modelo')?.value.trim() || '';
  const enciende = document.getElementById('enciende')?.value || '';

  if (!marca) { toast('Selecciona la marca', 'error'); return false; }
  if (!modelo) { toast('Ingresa el modelo', 'error'); document.getElementById('modelo')?.focus(); return false; }
  if (!enciende) { toast('Indica si el equipo enciende', 'error'); return false; }
  return true;
}

function validarSeguridad() {
  const tipo = document.getElementById('tipoSeguridad')?.value || 'patron';
  if (tipo === 'pin') {
    const pin = document.getElementById('pinInput')?.value.trim() || '';
    if (!pin) { toast('Ingresa el PIN del equipo', 'error'); return false; }
  }
  if (tipo === 'patron') {
    const patron = document.getElementById('patronSecuencia')?.value || '';
    if (!patron) { toast('Dibuja el patrón del equipo', 'error'); return false; }
  }
  return true;
}

function validarCostos() {
  const servicios = document.querySelectorAll('.servicio-item');
  let hayValido = false;
  servicios.forEach(item => {
    const desc = item.querySelector('.servicio-desc')?.value.trim() || '';
    const costo = parseFloat(item.querySelector('.servicio-costo')?.value) || 0;
    if (desc && costo > 0) hayValido = true;
  });
  if (!hayValido) { toast('Agrega al menos un servicio con descripción y costo', 'error'); return false; }
  return true;
}

function guardarDatosPaso(paso) {
  switch (paso) {
    case 1:
      datos.nombre = document.getElementById('nombre')?.value.trim() || '';
      datos.telefono = document.getElementById('telefono')?.value.trim() || '';
      break;
    case 2:
      datos.marca = document.getElementById('marca')?.value || '';
      datos.modelo = document.getElementById('modelo')?.value.trim() || '';
      datos.imei = document.getElementById('imei')?.value.trim() || '';
      datos.enciende = document.getElementById('enciende')?.value || '';
      break;
    case 3:
      datos.estado = document.getElementById('estado')?.value.trim() || '';
      datos.falla = document.getElementById('falla')?.value.trim() || '';
      break;
    case 4:
      datos.tipoSeguridad = document.getElementById('tipoSeguridad')?.value || 'patron';
      datos.pin = document.getElementById('pinInput')?.value.trim() || '';
      datos.patronSecuencia = document.getElementById('patronSecuencia')?.value || '';
      break;
    case 6:
      recolectarServicios();
      datos.total = parseFloat(document.getElementById('costoTotal')?.value) || 0;
      datos.adelanto = parseFloat(document.getElementById('adelanto')?.value) || 0;
      datos.saldo = Math.max(0, datos.total - datos.adelanto);
      break;
  }
}

/* ============================================================
   MARCA Y RADIOS
   ============================================================ */
function configurarMarca() {
  const grid = document.getElementById('marcasGrid');
  if (!grid) return;
  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('.marca-btn');
    if (!btn) return;
    haptic(8);
    grid.querySelectorAll('.marca-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('marca').value = btn.dataset.marca;
  });
}

function configurarRadioGroups() {
  const enciendeGroup = document.getElementById('enciendeGroup');
  if (enciendeGroup) {
    enciendeGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.radio-option');
      if (!btn) return;
      haptic(8);
      enciendeGroup.querySelectorAll('.radio-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('enciende').value = btn.dataset.value;
    });
  }

  const tipoGroup = document.getElementById('tipoSeguridadGroup');
  if (tipoGroup) {
    tipoGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.radio-option');
      if (!btn) return;
      haptic(8);
      tipoGroup.querySelectorAll('.radio-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tipo = btn.dataset.value;
      document.getElementById('tipoSeguridad').value = tipo;
      document.getElementById('pinContainer')?.classList.toggle('hidden', tipo !== 'pin');
      document.getElementById('patronContainer')?.classList.toggle('hidden', tipo !== 'patron');
    });
  }
}

/* ============================================================
   PATTERN LOCK
   ============================================================ */
function configurarPattern() {
  const bgCanvas = document.getElementById('bgCanvas');
  const lineCanvas = document.getElementById('lineCanvas');
  if (!bgCanvas || !lineCanvas) return;

  if (!document.getElementById('patronSecuencia')) {
    const input = document.createElement('input');
    input.type = 'hidden'; input.id = 'patronSecuencia';
    document.body.appendChild(input);
  }

  const bgc = bgCanvas.getContext('2d');
  const lnc = lineCanvas.getContext('2d');
  const size = 300, r = 22, margin = 30, cols = 3, rows = 3;
  const sepX = (size - 2 * margin) / (cols - 1);
  const sepY = (size - 2 * margin) / (rows - 1);

  const pts = [];
  let id = 1;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) pts.push({ id: id++, x: margin + sepX * x, y: margin + sepY * y, sel: false });
  }

  let path = [], drawing = false;

  function drawBase() {
    bgc.clearRect(0, 0, size, size);
    pts.forEach(p => {
      bgc.beginPath(); bgc.arc(p.x, p.y, r, 0, 2 * Math.PI);
      bgc.fillStyle = p.sel ? '#FF6900' : 'transparent'; bgc.fill();
      bgc.strokeStyle = p.sel ? '#FF6900' : '#4b5563'; bgc.lineWidth = 3; bgc.stroke();
    });
  }

  function drawLines(current) {
    lnc.clearRect(0, 0, size, size);
    if (path.length === 0) return;
    lnc.strokeStyle = '#FF6900'; lnc.lineWidth = 6; lnc.lineCap = 'round'; lnc.lineJoin = 'round';
    lnc.beginPath(); lnc.moveTo(path[0].x, path[0].y);
    path.forEach(p => lnc.lineTo(p.x, p.y));
    if (drawing && current) lnc.lineTo(current.x, current.y);
    lnc.stroke();
    path.forEach((p, i) => {
      lnc.beginPath(); lnc.arc(p.x, p.y, 10, 0, 2 * Math.PI);
      lnc.fillStyle = '#FF6900'; lnc.fill();
      lnc.fillStyle = 'white'; lnc.font = 'bold 11px Inter';
      lnc.textAlign = 'center'; lnc.textBaseline = 'middle'; lnc.fillText(i + 1, p.x, p.y);
    });
  }

  function getPos(e) {
    const rect = lineCanvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: (t.clientX - rect.left) * (size / rect.width), y: (t.clientY - rect.top) * (size / rect.height) };
  }

  function hit(p) { return pts.find(pt => !pt.sel && Math.hypot(pt.x - p.x, pt.y - p.y) < r + 12); }

  function start(e) {
    e.preventDefault(); drawing = true; path = []; pts.forEach(p => p.sel = false);
    lnc.clearRect(0, 0, size, size); updateSequence(); drawBase();
  }

  function move(e) {
    if (!drawing) return;
    e.preventDefault(); const p = getPos(e); const h = hit(p);
    if (h) { h.sel = true; path.push(h); haptic(5); drawBase(); }
    drawLines(p);
  }

  function end() {
    if (!drawing) return;
    drawing = false; drawLines(); updateSequence();
  }

  function updateSequence() {
    const seq = path.map(p => p.id).join(',');
    document.getElementById('patronSecuencia').value = seq;
    const display = document.getElementById('pattern-sequence');
    if (display) {
      display.textContent = seq ? 'Patrón: ' + path.map(p => p.id).join(' → ') : 'Sin patrón';
      display.style.color = seq ? 'var(--brand-500)' : 'var(--text-3)';
    }
  }

  lineCanvas.addEventListener('mousedown', start); lineCanvas.addEventListener('mousemove', move); lineCanvas.addEventListener('mouseup', end);
  lineCanvas.addEventListener('mouseleave', end);
  lineCanvas.addEventListener('touchstart', start, { passive: false }); lineCanvas.addEventListener('touchmove', move, { passive: false }); lineCanvas.addEventListener('touchend', end);

  document.getElementById('clearPattern')?.addEventListener('click', () => {
    haptic(10); path = []; pts.forEach(p => p.sel = false); drawBase();
    lnc.clearRect(0, 0, size, size); updateSequence();
  });

  drawBase();
}

/* ============================================================
   FOTOS
   ============================================================ */
function configurarFotos() {
  const grid = document.getElementById('fotosGrid');
  const sheet = document.getElementById('fotoSheet');
  
  const inputCamara = document.getElementById('inputCamara') || document.querySelector('input[type="file"][capture]');
  const inputGaleria = document.getElementById('inputGaleria') || document.querySelector('input[type="file"]:not([capture])');
  
  if (!grid) return;

  let slotActual = null;

  grid.addEventListener('click', (e) => {
    const slot = e.target.closest('.foto-slot');
    if (!slot) return;

    if (e.target.closest('.foto-remove')) {
      e.stopPropagation(); haptic(15);
      const idx = parseInt(slot.dataset.slot);
      datos.fotos[idx] = null; renderSlots(); return;
    }

    const idx = parseInt(slot.dataset.slot);
    if (datos.fotos[idx]) return;

    slotActual = idx; haptic(10);
    
    if (sheet) sheet.classList.add('show');
    else if (inputGaleria) inputGaleria.click();
  });

  const cerrarSheet = () => sheet?.classList.remove('show');
  document.getElementById('btnCancelarFoto')?.addEventListener('click', cerrarSheet);
  sheet?.addEventListener('click', (e) => { if (e.target === sheet) cerrarSheet(); });

  document.getElementById('btnTomarFoto')?.addEventListener('click', () => {
    cerrarSheet();
    if (inputCamara) setTimeout(() => inputCamara.click(), 150);
    else toast('Cámara no disponible.', 'error');
  });

  document.getElementById('btnSubirFoto')?.addEventListener('click', () => {
    cerrarSheet();
    if (inputGaleria) setTimeout(() => inputGaleria.click(), 150);
    else toast('Galería no disponible.', 'error');
  });

  async function procesarFoto(e) {
    const file = e.target.files[0];
    if (!file || slotActual === null) return;
    haptic(10);
    try {
      const dataUrl = await comprimirImagen(file, 1000, 0.75);
      datos.fotos[slotActual] = { file, dataUrl };
      renderSlots(); toast('Foto añadida', 'success', 1500);
    } catch (err) { toast('Error al procesar la imagen', 'error'); }
    e.target.value = ''; slotActual = null;
  }

  inputCamara?.addEventListener('change', procesarFoto);
  inputGaleria?.addEventListener('change', procesarFoto);

  function renderSlots() {
    grid.querySelectorAll('.foto-slot').forEach((slot, i) => {
      const foto = datos.fotos[i];
      if (foto && foto.dataUrl) {
        slot.classList.add('filled');
        slot.innerHTML = `<img src="${foto.dataUrl}" alt="Foto ${i + 1}"><button type="button" class="foto-remove"><i class="fas fa-times"></i></button>`;
      } else {
        slot.classList.remove('filled');
        slot.innerHTML = `<i class="fas fa-camera"></i><span>Añadir</span>`;
      }
    });
  }
  renderSlots();
}

async function comprimirImagen(file, maxSize = 1000, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxSize) { height = (height * maxSize) / width; width = maxSize; }
        else if (height > maxSize) { width = (width * maxSize) / height; height = maxSize; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject; img.src = e.target.result;
    };
    reader.onerror = reject; reader.readAsDataURL(file);
  });
}

/* ============================================================
   SERVICIOS Y COSTOS
   ============================================================ */
function configurarServicios() {
  const list = document.getElementById('serviciosList');
  const btnAdd = document.getElementById('addServicio');
  if (!list || !btnAdd) return;

  list.addEventListener('input', (e) => {
    if (e.target.classList.contains('servicio-costo')) calcularTotal();
  });

  list.addEventListener('click', (e) => {
    if (e.target.closest('.removeServicio')) eliminarServicio(e.target.closest('.servicio-item'));
  });

  btnAdd.addEventListener('click', () => {
    haptic(10);
    const item = crearServicioItem();
    list.appendChild(item);
    actualizarBotonesRemove();
    item.querySelector('.servicio-desc')?.focus();
  });

  calcularTotal();
}

function crearServicioItem() {
  const div = document.createElement('div');
  div.className = 'servicio-item';
  div.innerHTML = `
    <div class="dictado-wrap">
      <input type="text" class="servicio-desc" placeholder="Descripción del servicio" maxlength="100" data-dictado>
    </div>
    <input type="number" class="servicio-costo" placeholder="Bs." step="0.01" min="0" inputmode="decimal">
    <button type="button" class="removeServicio"><i class="fas fa-times"></i></button>
  `;
  if (window.__dictadoIniciar) setTimeout(() => window.__dictadoIniciar(), 50);
  return div;
}

function eliminarServicio(item) {
  haptic(15);
  const list = document.getElementById('serviciosList');
  if (!list || list.querySelectorAll('.servicio-item').length <= 1) return;
  item.remove(); calcularTotal(); actualizarBotonesRemove();
}

function actualizarBotonesRemove() {
  const items = document.querySelectorAll('.servicio-item');
  items.forEach(item => {
    const btn = item.querySelector('.removeServicio');
    if (btn) btn.style.display = items.length > 1 ? 'flex' : 'none';
  });
}

function calcularTotal() {
  let total = 0;
  document.querySelectorAll('.servicio-costo').forEach(input => {
    total += parseFloat(input.value) || 0;
  });
  const costoTotal = document.getElementById('costoTotal');
  if (costoTotal) costoTotal.value = total.toFixed(2);
  const display = document.getElementById('costoTotalDisplay');
  if (display) display.textContent = formatBs(total);
  actualizarSaldo();
}

function recolectarServicios() {
  datos.servicios = [];
  document.querySelectorAll('.servicio-item').forEach(item => {
    const desc = item.querySelector('.servicio-desc')?.value.trim() || '';
    const costo = parseFloat(item.querySelector('.servicio-costo')?.value) || 0;
    if (desc || costo > 0) datos.servicios.push({ desc: desc || 'Sin descripción', costo });
  });
}

/* ============================================================
   ADELANTO Y SALDO
   ============================================================ */
function configurarAdelanto() {
  document.getElementById('adelanto')?.addEventListener('input', actualizarSaldo);
}

function actualizarSaldo() {
  const total = parseFloat(document.getElementById('costoTotal')?.value) || 0;
  const adelanto = parseFloat(document.getElementById('adelanto')?.value) || 0;
  const display = document.getElementById('saldoDisplay');
  if (display) display.textContent = formatBs(Math.max(0, total - adelanto));
}

/* ============================================================
   CHAR COUNTERS Y VISTA PREVIA
   ============================================================ */
function configurarCharCounters() {
  document.querySelectorAll('.char-counter').forEach(counter => {
    const input = document.getElementById(counter.dataset.for);
    if (!input) return;
    const max = input.maxLength;
    const update = () => { counter.textContent = `${input.value.length}/${max}`; };
    update(); input.addEventListener('input', update);
  });
}

function generarVistaPrevia() {
  guardarDatosPaso(6);
  const cont = document.getElementById('previewContainer');
  if (!cont) return;

  let patronTexto = (datos.tipoSeguridad === 'patron' && datos.patronSecuencia) ? datos.patronSecuencia.split(',').join('-') : '';
  const serviciosHtml = datos.servicios.map(s => `<tr><td>${escapeHtml(s.desc)}</td><td class="costo">${formatBs(s.costo)}</td></tr>`).join('');
  const fotosValidas = datos.fotos.filter(f => f && f.dataUrl);
  const fotosHtml = fotosValidas.length > 0 ? `<div class="preview-section"><div class="preview-section-title">Fotos</div><div class="preview-fotos-grid">${fotosValidas.map(f => `<img src="${f.dataUrl}">`).join('')}</div></div>` : '';

  cont.innerHTML = `
    <div class="preview-recibo">
      <div class="preview-header">
        <img src="${CONFIG.logoUrl}" onerror="this.style.display='none'">
        <div class="preview-header-text"><h3>${CONFIG.nombreTienda}</h3><p>${CONFIG.eslogan}</p></div>
        <div class="preview-header-recibo"><strong>RECIBO</strong> DE INGRESO</div>
      </div>
      <div class="preview-fecha">
        <span>Fecha: <strong>${new Date().toLocaleString('es-BO')}</strong></span>
        <span>Por: <strong>${escapeHtml(sesion.nombre)}</strong></span>
      </div>
      <div class="preview-section">
        <div class="preview-section-title">Cliente</div>
        <div class="preview-row"><span>Nombre:</span><span>${escapeHtml(datos.nombre)}</span></div>
        <div class="preview-row"><span>Teléfono:</span><span>${escapeHtml(datos.telefono)}</span></div>
      </div>
      <div class="preview-section">
        <div class="preview-section-title">Equipo</div>
        <div class="preview-row"><span>Marca / Modelo:</span><span>${escapeHtml(datos.marca)} ${escapeHtml(datos.modelo)}</span></div>
        ${datos.imei ? `<div class="preview-row"><span>IMEI:</span><span>${escapeHtml(datos.imei)}</span></div>` : ''}
        <div class="preview-row"><span>Enciende:</span><span>${escapeHtml(datos.enciende)}</span></div>
      </div>
      <div class="preview-section">
        <div class="preview-section-title">Servicios y costos</div>
        <table class="preview-servicios-table">
          <thead><tr><th>Descripción</th><th style="text-align:right;">Costo</th></tr></thead>
          <tbody>${serviciosHtml}</tbody>
        </table>
        <div class="preview-totales">
          <div class="total-row"><span>Total:</span><strong>${formatBs(datos.total)}</strong></div>
          ${datos.adelanto > 0 ? `<div class="total-row"><span>Adelanto:</span><strong>${formatBs(datos.adelanto)}</strong></div>` : ''}
          <div class="saldo-row"><span>SALDO A PAGAR:</span><span>${formatBs(datos.saldo)}</span></div>
        </div>
      </div>
      ${fotosHtml}
    </div>
  `;
}

/* ============================================================
   CONFIGURACIÓN DEL BOTÓN DE PDF
   ============================================================ */
function configurarBotonGenerarPDF() {
  const btn = document.getElementById('btnGenerate');
  if (!btn) return;

  let generando = false;

  btn.addEventListener('click', async () => {
    if (generando) return;
    generando = true;

    if (!validarCostos()) {
      generando = false;
      return;
    }
    guardarDatosPaso(6);

    const textoOriginal = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando...';
    btn.style.opacity = '0.7';

    try {
      const numeroRecibo = generarNumeroRecibo();
      
      const paquete = {
        numeroRecibo: numeroRecibo,
        cliente: datos.nombre,
        telefono: datos.telefono,
        marca: datos.marca,
        modelo: datos.modelo,
        imei: datos.imei,
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
        fotos: datos.fotos.filter(f => f && f.dataUrl).map(f => f.dataUrl)
      };

      const exito = await generarPDFUnificado(paquete, 'guardar_en_nube');
      
      if (exito) {
        document.getElementById('successNumero').textContent = numeroRecibo;
        document.getElementById('successModal')?.classList.add('show');
        window._ultimoRecibo = paquete; 
        configurarWhatsApp();
      }
    } catch (error) {
      console.error("Error al generar:", error);
    } finally {
      generando = false;
      btn.innerHTML = textoOriginal;
      btn.style.opacity = '1';
    }
  });
}

/* ============================================================
   WHATSAPP Y UTILIDADES
   ============================================================ */
function configurarWhatsApp() {
  const btn = document.getElementById('sendWhatsappBtn');
  if (!btn) return;
  const newBtn = btn.cloneNode(true); btn.parentNode.replaceChild(newBtn, btn);
  newBtn.addEventListener('click', () => {
    const recibo = window._ultimoRecibo; if (!recibo) return; haptic(15);
    const mensaje = `Hola ${recibo.cliente.split(' ')[0]},\n\nRecibo de ingreso generado.\n\nN Recibo: ${recibo.numeroRecibo}\nEquipo: ${recibo.marca} ${recibo.modelo}\nTotal: ${formatBs(recibo.total)}\n${recibo.saldo > 0 ? `Saldo pendiente: ${formatBs(recibo.saldo)}` : ''}\n\nConsulta el estado en: ${CONFIG.urlApp}/?recibo=${recibo.numeroRecibo}\n\n${CONFIG.nombreTienda}\nTel: ${CONFIG.telefono}`;
    window.open(`https://wa.me/591${recibo.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(mensaje)}`, '_blank');
  });
}

function generarNumeroRecibo() {
  const f = new Date();
  return `REC-${String(f.getDate()).padStart(2, '0')}${String(f.getMonth() + 1).padStart(2, '0')}${String(f.getFullYear()).slice(-2)}-${String(f.getHours()).padStart(2, '0')}${String(f.getMinutes()).padStart(2, '0')}${String(f.getSeconds()).padStart(2, '0')}`;
}
