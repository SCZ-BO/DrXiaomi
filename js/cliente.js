/* ============================================================
   DR. XIAOMI · CLIENTE (Wizard de nuevo recibo)
   Archivo: js/cliente.js
   Descripción: Wizard, validación, PDF profesional, WhatsApp
   ============================================================ */

import { requireAuth, logout } from '/js/app-auth.js';
import { 
  toast, haptic, initTheme, 
  escapeHtml, formatBs, showLoading, hideLoading 
} from '/js/app-ui.js';
import { db } from '/js/firebase.js';
import { 
  collection, addDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ============================================================
   CONFIGURACIÓN DEL TALLER
   ============================================================ */
const CONFIG = {
  nombreTienda: 'DR. XIAOMI SCZ',
  eslogan: 'Servicio Técnico Especializado',
  direccion: 'Centro Comercial Cañoto #K1, Santa Cruz',
  telefono: '75959450',
  horario: 'Lunes a Sábado 9:00 - 20:00',
  web: 'xiaomi.scz.red',
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
  nombre: '',
  telefono: '',
  marca: '',
  modelo: '',
  imei: '',
  enciende: '',
  estado: '',
  falla: '',
  tipoSeguridad: 'patron',
  pin: '',
  patronSecuencia: '',
  fotos: [],
  servicios: [],
  total: 0,
  adelanto: 0,
  saldo: 0
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
  document.getElementById('userInfo').textContent = 
    `${sesion.icono || ''} ${sesion.nombre}`;

  configurarHeader();
  configurarWizard();
  configurarMarca();
  configurarRadioGroups();
  configurarPattern();
  configurarFotos();
  configurarServicios();
  configurarAdelanto();
  configurarCharCounters();
  configurarPDF();
}

/* ============================================================
   HEADER
   ============================================================ */
function configurarHeader() {
  document.getElementById('backToPanelBtn').addEventListener('click', () => {
    haptic(10);
    if (confirm('¿Salir? Los datos no guardados se perderán.')) {
      window.location.href = '/app/';
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', () => {
    haptic(20);
    if (confirm('¿Cerrar sesión?')) {
      logout();
    }
  });
}

/* ============================================================
   WIZARD
   ============================================================ */
function configurarWizard() {
  document.getElementById('btnPrev').addEventListener('click', irPasoAnterior);
  document.getElementById('btnNext').addEventListener('click', irPasoSiguiente);
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

  if (pasoActual === 7) generarResumen();
}

function actualizarBarraProgreso() {
  document.querySelectorAll('.wizard-step').forEach(el => {
    const step = parseInt(el.dataset.step);
    el.classList.remove('active', 'done');
    if (step < pasoActual) el.classList.add('done');
    else if (step === pasoActual) el.classList.add('active');
  });

  const porcentaje = (pasoActual / TOTAL_PASOS) * 100;
  document.getElementById('wizardBarFill').style.width = `${porcentaje}%`;
}

function actualizarBotones() {
  const btnPrev = document.getElementById('btnPrev');
  const btnNext = document.getElementById('btnNext');
  const btnGenerate = document.getElementById('btnGenerate');

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
   VALIDACIÓN
   ============================================================ */
function validarPaso(paso) {
  switch (paso) {
    case 1: return validarCliente();
    case 2: return validarEquipo();
    case 3: return true;
    case 4: return validarSeguridad();
    case 5: return true;
    case 6: return validarCostos();
    default: return true;
  }
}

function validarCliente() {
  const nombre = document.getElementById('nombre').value.trim();
  const telefono = document.getElementById('telefono').value.trim();

  if (!nombre) {
    toast('Ingresa el nombre del cliente', 'error');
    document.getElementById('nombre').focus();
    return false;
  }
  if (!telefono || telefono.length < 7) {
    toast('Ingresa un teléfono válido', 'error');
    document.getElementById('telefono').focus();
    return false;
  }
  return true;
}

function validarEquipo() {
  const marca = document.getElementById('marca').value;
  const modelo = document.getElementById('modelo').value.trim();
  const enciende = document.getElementById('enciende').value;

  if (!marca) { toast('Selecciona la marca', 'error'); return false; }
  if (!modelo) { toast('Ingresa el modelo', 'error'); document.getElementById('modelo').focus(); return false; }
  if (!enciende) { toast('Indica si el equipo enciende', 'error'); return false; }
  return true;
}

function validarSeguridad() {
  const tipo = document.getElementById('tipoSeguridad').value;

  if (tipo === 'pin') {
    const pin = document.getElementById('pinInput').value.trim();
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
    const desc = item.querySelector('.servicio-desc').value.trim();
    const costo = parseFloat(item.querySelector('.servicio-costo').value) || 0;
    if (desc && costo > 0) hayValido = true;
  });
  if (!hayValido) {
    toast('Agrega al menos un servicio con descripción y costo', 'error');
    return false;
  }
  return true;
}

/* ============================================================
   GUARDAR DATOS POR PASO
   ============================================================ */
function guardarDatosPaso(paso) {
  switch (paso) {
    case 1:
      datos.nombre = document.getElementById('nombre').value.trim();
      datos.telefono = document.getElementById('telefono').value.trim();
      break;
    case 2:
      datos.marca = document.getElementById('marca').value;
      datos.modelo = document.getElementById('modelo').value.trim();
      datos.imei = document.getElementById('imei').value.trim();
      datos.enciende = document.getElementById('enciende').value;
      break;
    case 3:
      datos.estado = document.getElementById('estado').value.trim();
      datos.falla = document.getElementById('falla').value.trim();
      break;
    case 4:
      datos.tipoSeguridad = document.getElementById('tipoSeguridad').value;
      datos.pin = document.getElementById('pinInput').value.trim();
      datos.patronSecuencia = document.getElementById('patronSecuencia')?.value || '';
      break;
    case 5:
      break;
    case 6:
      recolectarServicios();
      datos.total = parseFloat(document.getElementById('costoTotal').value) || 0;
      datos.adelanto = parseFloat(document.getElementById('adelanto').value) || 0;
      datos.saldo = Math.max(0, datos.total - datos.adelanto);
      break;
  }
}

/* ============================================================
   MARCA
   ============================================================ */
function configurarMarca() {
  const grid = document.getElementById('marcasGrid');
  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('.marca-btn');
    if (!btn) return;
    haptic(8);
    grid.querySelectorAll('.marca-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('marca').value = btn.dataset.marca;
  });
}

/* ============================================================
   RADIO GROUPS
   ============================================================ */
function configurarRadioGroups() {
  const enciendeGroup = document.getElementById('enciendeGroup');
  enciendeGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('.radio-option');
    if (!btn) return;
    haptic(8);
    enciendeGroup.querySelectorAll('.radio-option').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('enciende').value = btn.dataset.value;
  });

  const tipoGroup = document.getElementById('tipoSeguridadGroup');
  tipoGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('.radio-option');
    if (!btn) return;
    haptic(8);
    tipoGroup.querySelectorAll('.radio-option').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tipo = btn.dataset.value;
    document.getElementById('tipoSeguridad').value = tipo;

    document.getElementById('pinContainer').classList.toggle('hidden', tipo !== 'pin');
    document.getElementById('patronContainer').classList.toggle('hidden', tipo !== 'patron');
  });
}

/* ============================================================
   PATTERN LOCK
   ============================================================ */
function configurarPattern() {
  const bgCanvas = document.getElementById('bgCanvas');
  const lineCanvas = document.getElementById('lineCanvas');
  if (!bgCanvas || !lineCanvas) return;

  const bgc = bgCanvas.getContext('2d');
  const lnc = lineCanvas.getContext('2d');
  const size = 300;
  const r = 22;
  const margin = 30;
  const cols = 3, rows = 3;
  const sepX = (size - 2 * margin) / (cols - 1);
  const sepY = (size - 2 * margin) / (rows - 1);

  const pts = [];
  let id = 1;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      pts.push({ id: id++, x: margin + sepX * x, y: margin + sepY * y, sel: false });
    }
  }

  let path = [];
  let drawing = false;

  function drawBase() {
    bgc.clearRect(0, 0, size, size);
    pts.forEach(p => {
      bgc.beginPath();
      bgc.arc(p.x, p.y, r, 0, 2 * Math.PI);
      bgc.fillStyle = p.sel ? '#FF6900' : 'transparent';
      bgc.fill();
      bgc.strokeStyle = p.sel ? '#FF6900' : '#4b5563';
      bgc.lineWidth = 3;
      bgc.stroke();
    });
  }

  function drawLines(current) {
    lnc.clearRect(0, 0, size, size);
    if (path.length === 0) return;

    lnc.strokeStyle = '#FF6900';
    lnc.lineWidth = 6;
    lnc.lineCap = 'round';
    lnc.lineJoin = 'round';
    lnc.beginPath();
    lnc.moveTo(path[0].x, path[0].y);
    path.forEach(p => lnc.lineTo(p.x, p.y));
    if (drawing && current) lnc.lineTo(current.x, current.y);
    lnc.stroke();

    path.forEach((p, i) => {
      lnc.beginPath();
      lnc.arc(p.x, p.y, 10, 0, 2 * Math.PI);
      lnc.fillStyle = '#FF6900';
      lnc.fill();
      lnc.fillStyle = 'white';
      lnc.font = 'bold 11px Inter';
      lnc.textAlign = 'center';
      lnc.textBaseline = 'middle';
      lnc.fillText(i + 1, p.x, p.y);
    });
  }

  function getPos(e) {
    const rect = lineCanvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return {
      x: (t.clientX - rect.left) * (size / rect.width),
      y: (t.clientY - rect.top) * (size / rect.height)
    };
  }

  function hit(p) {
    return pts.find(pt => !pt.sel && Math.hypot(pt.x - p.x, pt.y - p.y) < r + 12);
  }

  function start(e) {
    e.preventDefault();
    drawing = true;
    path = [];
    pts.forEach(p => p.sel = false);
    lnc.clearRect(0, 0, size, size);
    updateSequence();
    drawBase();
  }

  function move(e) {
    if (!drawing) return;
    e.preventDefault();
    const p = getPos(e);
    const h = hit(p);
    if (h) {
      h.sel = true;
      path.push(h);
      haptic(5);
      drawBase();
    }
    drawLines(p);
  }

  function end() {
    if (!drawing) return;
    drawing = false;
    drawLines();
    updateSequence();
  }

  function updateSequence() {
    const seq = path.map(p => p.id).join(',');
    document.getElementById('patronSecuencia').value = seq;
    const display = document.getElementById('pattern-sequence');
    if (seq) {
      display.textContent = 'Patrón: ' + path.map(p => p.id).join(' → ');
      display.style.color = 'var(--brand-500)';
    } else {
      display.textContent = 'Sin patrón';
      display.style.color = 'var(--text-3)';
    }
  }

  if (!document.getElementById('patronSecuencia')) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.id = 'patronSecuencia';
    document.body.appendChild(input);
  }

  lineCanvas.addEventListener('mousedown', start);
  lineCanvas.addEventListener('mousemove', move);
  lineCanvas.addEventListener('mouseup', end);
  lineCanvas.addEventListener('mouseleave', end);
  lineCanvas.addEventListener('touchstart', start, { passive: false });
  lineCanvas.addEventListener('touchmove', move, { passive: false });
  lineCanvas.addEventListener('touchend', end);

  document.getElementById('clearPattern').addEventListener('click', () => {
    haptic(10);
    path = [];
    pts.forEach(p => p.sel = false);
    drawBase();
    lnc.clearRect(0, 0, size, size);
    updateSequence();
  });

  drawBase();
}

/* ============================================================
   FOTOS
   ============================================================ */
function configurarFotos() {
  const grid = document.getElementById('fotosGrid');
  const input = document.getElementById('fotosInput');
  let slotActual = null;

  grid.addEventListener('click', (e) => {
    const slot = e.target.closest('.foto-slot');
    if (!slot) return;

    const removeBtn = e.target.closest('.foto-remove');
    if (removeBtn) {
      e.stopPropagation();
      haptic(15);
      const idx = parseInt(slot.dataset.slot);
      datos.fotos[idx] = null;
      renderSlots();
      return;
    }

    if (datos.fotos[parseInt(slot.dataset.slot)]) return;

    slotActual = parseInt(slot.dataset.slot);
    input.click();
  });

  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    haptic(10);

    try {
      const dataUrl = await comprimirImagen(file, 1000, 0.75);
      datos.fotos[slotActual] = { file, dataUrl };
      renderSlots();
    } catch (err) {
      console.error('Error procesando foto:', err);
      toast('Error al procesar la imagen', 'error');
    }

    input.value = '';
  });

  function renderSlots() {
    const slots = grid.querySelectorAll('.foto-slot');
    slots.forEach((slot, i) => {
      const foto = datos.fotos[i];
      if (foto) {
        slot.classList.add('filled');
        slot.innerHTML = `
          <img src="${foto.dataUrl}" alt="Foto ${i + 1}">
          <button type="button" class="foto-remove" aria-label="Eliminar">
            <i class="fas fa-times"></i>
          </button>
        `;
      } else {
        slot.classList.remove('filled');
        slot.innerHTML = `
          <i class="fas fa-camera"></i>
          <span>Añadir</span>
        `;
      }
    });
  }

  renderSlots();
}

/* ============================================================
   COMPRIMIR IMAGEN
   ============================================================ */
async function comprimirImagen(file, maxSize = 1000, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxSize) {
          height = (height * maxSize) / width;
          width = maxSize;
        } else if (height > maxSize) {
          width = (width * maxSize) / height;
          height = maxSize;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ============================================================
   SERVICIOS
   ============================================================ */
function configurarServicios() {
  const list = document.getElementById('serviciosList');
  const btnAdd = document.getElementById('addServicio');

  const firstItem = list.querySelector('.servicio-item');
  const firstCosto = firstItem.querySelector('.servicio-costo');
  const firstRemove = firstItem.querySelector('.removeServicio');
  firstCosto.addEventListener('input', calcularTotal);
  firstRemove.addEventListener('click', () => eliminarServicio(firstItem));

  btnAdd.addEventListener('click', () => {
    haptic(10);
    const item = crearServicioItem();
    list.appendChild(item);
    actualizarBotonesRemove();
    item.querySelector('.servicio-desc').focus();
  });
}

function crearServicioItem() {
  const div = document.createElement('div');
  div.className = 'servicio-item';
  div.innerHTML = `
    <input type="text" class="servicio-desc" placeholder="Descripción del servicio" maxlength="100">
    <input type="number" class="servicio-costo" placeholder="Bs." step="0.01" min="0" inputmode="decimal">
    <button type="button" class="removeServicio">✕</button>
  `;
  div.querySelector('.servicio-costo').addEventListener('input', calcularTotal);
  div.querySelector('.removeServicio').addEventListener('click', () => eliminarServicio(div));
  return div;
}

function eliminarServicio(item) {
  haptic(15);
  const list = document.getElementById('serviciosList');
  if (list.querySelectorAll('.servicio-item').length <= 1) return;
  item.remove();
  calcularTotal();
  actualizarBotonesRemove();
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

  document.getElementById('costoTotal').value = total.toFixed(2);
  document.getElementById('costoTotalDisplay').textContent = formatBs(total);

  actualizarSaldo();
}

function recolectarServicios() {
  datos.servicios = [];
  document.querySelectorAll('.servicio-item').forEach(item => {
    const desc = item.querySelector('.servicio-desc').value.trim();
    const costo = parseFloat(item.querySelector('.servicio-costo').value) || 0;
    if (desc || costo > 0) {
      datos.servicios.push({ desc: desc || 'Sin descripción', costo });
    }
  });
}

/* ============================================================
   ADELANTO Y SALDO
   ============================================================ */
function configurarAdelanto() {
  const input = document.getElementById('adelanto');
  input.addEventListener('input', actualizarSaldo);
}

function actualizarSaldo() {
  const total = parseFloat(document.getElementById('costoTotal').value) || 0;
  const adelanto = parseFloat(document.getElementById('adelanto').value) || 0;
  const saldo = Math.max(0, total - adelanto);
  document.getElementById('saldoDisplay').textContent = formatBs(saldo);
}

/* ============================================================
   CHAR COUNTERS
   ============================================================ */
function configurarCharCounters() {
  document.querySelectorAll('.char-counter').forEach(counter => {
    const id = counter.dataset.for;
    const input = document.getElementById(id);
    if (!input) return;
    const max = input.maxLength;
    const update = () => {
      counter.textContent = `${input.value.length}/${max}`;
    };
    update();
    input.addEventListener('input', update);
  });
}

/* ============================================================
   RESUMEN
   ============================================================ */
function generarResumen() {
  guardarDatosPaso(6);
  const cont = document.getElementById('resumenContenido');

  const serviciosHtml = datos.servicios.map(s => `
    <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border-1);">
      <span style="color: var(--text-2); font-size: 14px;">${escapeHtml(s.desc)}</span>
      <strong style="color: var(--text-1); font-size: 14px;">${formatBs(s.costo)}</strong>
    </div>
  `).join('');

  cont.innerHTML = `
    <div class="card">
      <h3 class="card-section-title">👤 Cliente</h3>
      <div style="font-size: 15px; font-weight: 700; color: var(--text-1);">${escapeHtml(datos.nombre)}</div>
      <div style="font-size: 13px; color: var(--text-3); margin-top: 4px;">
        <i class="fas fa-phone"></i> ${escapeHtml(datos.telefono)}
      </div>
    </div>

    <div class="card">
      <h3 class="card-section-title">📱 Equipo</h3>
      <div style="font-size: 15px; font-weight: 700; color: var(--text-1);">
        ${escapeHtml(datos.marca)} ${escapeHtml(datos.modelo)}
      </div>
      ${datos.imei ? `<div style="font-size: 13px; color: var(--text-3); margin-top: 4px;"><i class="fas fa-barcode"></i> ${escapeHtml(datos.imei)}</div>` : ''}
      <div style="font-size: 13px; color: var(--text-3); margin-top: 4px;">
        <i class="fas fa-power-off"></i> Enciende: ${escapeHtml(datos.enciende)}
      </div>
    </div>

    ${datos.estado || datos.falla ? `
      <div class="card">
        <h3 class="card-section-title">🔍 Estado y falla</h3>
        ${datos.estado ? `<div style="font-size: 13px; color: var(--text-2); margin-bottom: 8px;"><strong style="color: var(--text-1);">Estado:</strong> ${escapeHtml(datos.estado)}</div>` : ''}
        ${datos.falla ? `<div style="font-size: 13px; color: var(--text-2);"><strong style="color: var(--text-1);">Falla:</strong> ${escapeHtml(datos.falla)}</div>` : ''}
      </div>
    ` : ''}

    <div class="card">
      <h3 class="card-section-title">🔐 Seguridad</h3>
      <div style="font-size: 13px; color: var(--text-2);">
        <strong style="color: var(--text-1);">Tipo:</strong> ${datos.tipoSeguridad}
      </div>
      ${datos.tipoSeguridad === 'pin' ? `<div style="font-size: 13px; color: var(--text-2); margin-top: 4px;"><strong style="color: var(--text-1);">PIN:</strong> ${escapeHtml(datos.pin)}</div>` : ''}
      ${datos.tipoSeguridad === 'patron' && datos.patronSecuencia ? `<div style="font-size: 13px; color: var(--text-2); margin-top: 4px;"><strong style="color: var(--text-1);">Patrón:</strong> ${escapeHtml(datos.patronSecuencia)}</div>` : ''}
    </div>

    <div class="card">
      <h3 class="card-section-title">🔧 Servicios</h3>
      ${serviciosHtml}
      <div style="margin-top: 12px; padding-top: 12px; border-top: 2px solid var(--border-2);">
        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
          <span style="color: var(--text-2); font-size: 14px;">Total</span>
          <strong style="color: var(--text-1); font-size: 15px;">${formatBs(datos.total)}</strong>
        </div>
        ${datos.adelanto > 0 ? `
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
            <span style="color: var(--text-2); font-size: 14px;">Adelanto</span>
            <strong style="color: var(--text-1); font-size: 14px;">${formatBs(datos.adelanto)}</strong>
          </div>
        ` : ''}
        <div style="display: flex; justify-content: space-between; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-2);">
          <span style="color: var(--brand-500); font-size: 14px; font-weight: 700;">Saldo a pagar</span>
          <strong style="color: var(--brand-500); font-size: 18px;">${formatBs(datos.saldo)}</strong>
        </div>
      </div>
    </div>
  `;
}

/* ============================================================
   PDF PROFESIONAL
   ============================================================ */
function configurarPDF() {
  document.getElementById('btnGenerate').addEventListener('click', generarPDF);
  document.getElementById('backToPanelBtn2').addEventListener('click', () => {
    window.location.href = '/app/';
  });
}

function generarNumeroRecibo() {
  const f = new Date();
  const dd = String(f.getDate()).padStart(2, '0');
  const mm = String(f.getMonth() + 1).padStart(2, '0');
  const yy = String(f.getFullYear()).slice(-2);
  const hh = String(f.getHours()).padStart(2, '0');
  const mi = String(f.getMinutes()).padStart(2, '0');
  const ss = String(f.getSeconds()).padStart(2, '0');
  return `REC-${dd}${mm}${yy}-${hh}${mi}${ss}`;
}

async function generarPDF() {
  guardarDatosPaso(6);
  const numeroRecibo = generarNumeroRecibo();
  showLoading('Generando PDF...');
  haptic(20);

  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, H = 297, M = 15;
    const CW = W - M * 2;
    let y = 0;

    /* HEADER NARANJA */
    pdf.setFillColor(255, 105, 0);
    pdf.rect(0, 0, W, 38, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(20);
    pdf.text(CONFIG.nombreTienda, M, 15);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text(CONFIG.eslogan, M, 21);
    pdf.setFontSize(8);
    pdf.text(`${CONFIG.direccion}  ·  Tel: ${CONFIG.telefono}`, M, 26);
    pdf.text(`${CONFIG.horario}  ·  ${CONFIG.web}`, M, 30);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text('RECIBO DE INGRESO', W - M, 15, { align: 'right' });
    pdf.setFontSize(9);
    pdf.text(numeroRecibo, W - M, 21, { align: 'right' });

    y = 45;
    const fecha = new Date();
    const fechaStr = `${String(fecha.getDate()).padStart(2,'0')}/${String(fecha.getMonth()+1).padStart(2,'0')}/${fecha.getFullYear()} · ${String(fecha.getHours()).padStart(2,'0')}:${String(fecha.getMinutes()).padStart(2,'0')}`;

    pdf.setFillColor(248, 248, 248);
    pdf.roundedRect(M, y, CW, 12, 2, 2, 'F');
    pdf.setTextColor(80, 80, 80);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text(`Fecha: ${fechaStr}`, M + 4, y + 7.5);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(50, 50, 50);
    pdf.text(`Recibido por: ${sesion.nombre}`, W - M - 4, y + 7.5, { align: 'right' });

    y += 18;

    /* CLIENTE Y EQUIPO */
    const colW = (CW - 4) / 2;
    pdf.setFillColor(255, 244, 235);
    pdf.roundedRect(M, y, colW, 26, 2, 2, 'F');
    pdf.roundedRect(M + colW + 4, y, colW, 26, 2, 2, 'F');

    pdf.setTextColor(255, 105, 0);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text('CLIENTE', M + 4, y + 6);
    pdf.text('EQUIPO', M + colW + 8, y + 6);

    pdf.setTextColor(30, 30, 30);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text(datos.nombre.slice(0, 22), M + 4, y + 13);
    pdf.text(`${datos.marca} ${datos.modelo}`.slice(0, 22), M + colW + 8, y + 13);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(80, 80, 80);
    pdf.text(`Tel: ${datos.telefono}`, M + 4, y + 20);
    if (datos.imei) pdf.text(`IMEI: ${datos.imei}`, M + colW + 8, y + 20);
    else pdf.text(`Enciende: ${datos.enciende}`, M + colW + 8, y + 20);

    y += 32;

    /* ESTADO Y FALLA */
    if (datos.estado || datos.falla) {
      pdf.setFillColor(248, 248, 248);
      const boxH = (datos.estado ? 12 : 0) + (datos.falla ? 12 : 0) + 12;
      pdf.roundedRect(M, y, CW, boxH, 2, 2, 'F');

      pdf.setTextColor(255, 105, 0);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.text('ESTADO Y FALLA', M + 4, y + 6);

      let yy = y + 12;
      pdf.setTextColor(50, 50, 50);
      pdf.setFont('helvetica', 'normal');
      pdf.setFont
