/* ============================================================
   DR. XIAOMI · CLIENTE (Wizard de nuevo recibo)
   Archivo: js/cliente.js
   Contiene: Wizard, fotos, sumas, header, vista previa
   ⚠️ NO contiene código de PDF (eso está en cliente-pdf.js)
   ============================================================ */

import { requireAuth, logout } from '/js/app-auth.js';
import {
  toast, haptic, initTheme,
  escapeHtml, formatBs, showLoading, hideLoading
} from '/js/app-ui.js';
import { db } from '/js/firebase.js';
import { collection, addDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ⬇️ Importamos el generador de PDF desde su propio archivo ⬇️ */
import { generarPDF, configurarPDF } from '/js/cliente-pdf.js';

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
  logoUrl: 'https://xiaomi.scz.red/img/logo1.png'
};

/* ============================================================
   ESTADO (exportado para que cliente-pdf.js lo use)
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

/* ============================================================
   EXPORTS ÚNICOS (una sola vez cada nombre)
   ============================================================ */
export {
  sesion,
  datos,
  CONFIG,
  generarNumeroRecibo,
  configurarWhatsApp,
  showLoading,
  hideLoading,
  toast,
  haptic,
  formatBs,
  escapeHtml,
  db,
  collection,
  addDoc,
  serverTimestamp
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
  configurarPDF();
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
    if (confirm('¿Salir? Los datos no guardados se perderán.')) {
      window.location.href = '/app/';
    }
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
  if (fill) {
    const porcentaje = (pasoActual / TOTAL_PASOS) * 100;
    fill.style.width = `${porcentaje}%`;
  }
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
  const nombreEl = document.getElementById('nombre');
  const telefonoEl = document.getElementById('telefono');
  const nombre = nombreEl?.value.trim() || '';
  const telefono = telefonoEl?.value.trim() || '';

  if (!nombre) {
    toast('Ingresa el nombre del cliente', 'error');
    nombreEl?.focus();
    return false;
  }
  if (!telefono || telefono.length < 7) {
    toast('Ingresa un teléfono válido', 'error');
    telefonoEl?.focus();
    return false;
  }
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
  if (!hayValido) {
    toast('Agrega al menos un servicio con descripción y costo', 'error');
    return false;
  }
  return true;
}

/* ============================================================
   GUARDAR DATOS
   ============================================================ */
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
   MARCA
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
    const inputMarca = document.getElementById('marca');
    if (inputMarca) inputMarca.value = btn.dataset.marca;
  });
}

/* ============================================================
   RADIO GROUPS
   ============================================================ */
function configurarRadioGroups() {
  const enciendeGroup = document.getElementById('enciendeGroup');
  if (enciendeGroup) {
    enciendeGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.radio-option');
      if (!btn) return;
      haptic(8);
      enciendeGroup.querySelectorAll('.radio-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const inputEnciende = document.getElementById('enciende');
      if (inputEnciende) inputEnciende.value = btn.dataset.value;
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
      const inputTipo = document.getElementById('tipoSeguridad');
      if (inputTipo) inputTipo.value = tipo;

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
    input.type = 'hidden';
    input.id = 'patronSecuencia';
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
    for (let x = 0; x < cols; x++) {
      pts.push({ id: id++, x: margin + sepX * x, y: margin + sepY * y, sel: false });
    }
  }

  let path = [], drawing = false;

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
    if (h) { h.sel = true; path.push(h); haptic(5); drawBase(); }
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
    const inputPatron = document.getElementById('patronSecuencia');
    if (inputPatron) inputPatron.value = seq;

    const display = document.getElementById('pattern-sequence');
    if (display) {
      if (seq) {
        display.textContent = 'Patrón: ' + path.map(p => p.id).join(' → ');
        display.style.color = 'var(--brand-500)';
      } else {
        display.textContent = 'Sin patrón';
        display.style.color = 'var(--text-3)';
      }
    }
  }

  lineCanvas.addEventListener('mousedown', start);
  lineCanvas.addEventListener('mousemove', move);
  lineCanvas.addEventListener('mouseup', end);
  lineCanvas.addEventListener('mouseleave', end);
  lineCanvas.addEventListener('touchstart', start, { passive: false });
  lineCanvas.addEventListener('touchmove', move, { passive: false });
  lineCanvas.addEventListener('touchend', end);

  const clearBtn = document.getElementById('clearPattern');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      haptic(10);
      path = [];
      pts.forEach(p => p.sel = false);
      drawBase();
      lnc.clearRect(0, 0, size, size);
      updateSequence();
    });
  }

  drawBase();
}

/* ============================================================
   FOTOS
   ============================================================ */
function configurarFotos() {
  const grid = document.getElementById('fotosGrid');
  const inputCamara = document.getElementById('inputCamara');
  const inputGaleria = document.getElementById('inputGaleria');
  const sheet = document.getElementById('fotoSheet');

  if (!grid) {
    console.warn('⚠️ #fotosGrid no existe');
    return;
  }

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

    const idx = parseInt(slot.dataset.slot);
    if (datos.fotos[idx]) return;

    slotActual = idx;
    haptic(10);
    sheet?.classList.add('show');
  });

  function cerrarSheet() {
    sheet?.classList.remove('show');
  }

  document.getElementById('btnCancelarFoto')?.addEventListener('click', cerrarSheet);
  sheet?.addEventListener('click', (e) => {
    if (e.target === sheet) cerrarSheet();
  });

  document.getElementById('btnTomarFoto')?.addEventListener('click', () => {
    cerrarSheet();
    if (!inputCamara) {
      toast('Cámara no disponible.', 'error', 4000);
      return;
    }
    setTimeout(() => inputCamara.click(), 150);
  });

  document.getElementById('btnSubirFoto')?.addEventListener('click', () => {
    cerrarSheet();
    if (!inputGaleria) {
      toast('Galería no disponible.', 'error', 4000);
      return;
    }
    setTimeout(() => inputGaleria.click(), 150);
  });

  async function procesarFoto(e) {
    const file = e.target.files[0];
    if (!file || slotActual === null) return;
    haptic(10);
    try {
      const dataUrl = await comprimirImagen(file, 1000, 0.75);
      datos.fotos[slotActual] = { file, dataUrl };
      renderSlots();
      toast('Foto añadida', 'success', 1500);
    } catch (err) {
      console.error('Error procesando foto:', err);
      toast('Error al procesar la imagen', 'error');
    }
    e.target.value = '';
    slotActual = null;
  }

  inputCamara?.addEventListener('change', procesarFoto);
  inputGaleria?.addEventListener('change', procesarFoto);

  function renderSlots() {
    const slots = grid.querySelectorAll('.foto-slot');
    slots.forEach((slot, i) => {
      const foto = datos.fotos[i];
      if (foto && foto.dataUrl) {
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
  if (!list || !btnAdd) {
    console.warn('⚠️ #serviciosList o #addServicio no existen');
    return;
  }

  list.addEventListener('input', (e) => {
    if (e.target.classList.contains('servicio-costo')) {
      calcularTotal();
    }
  });

  list.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('.removeServicio');
    if (!removeBtn) return;
    const item = removeBtn.closest('.servicio-item');
    if (item) eliminarServicio(item);
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
    <button type="button" class="removeServicio">✕</button>
  `;
  if (window.__dictadoIniciar) {
    setTimeout(() => window.__dictadoIniciar(), 50);
  }
  return div;
}

function eliminarServicio(item) {
  haptic(15);
  const list = document.getElementById('serviciosList');
  if (!list) return;
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
  if (!input) return;
  input.addEventListener('input', actualizarSaldo);
}

function actualizarSaldo() {
  const total = parseFloat(document.getElementById('costoTotal')?.value) || 0;
  const adelanto = parseFloat(document.getElementById('adelanto')?.value) || 0;
  const saldo = Math.max(0, total - adelanto);
  const display = document.getElementById('saldoDisplay');
  if (display) display.textContent = formatBs(saldo);
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
    const update = () => { counter.textContent = `${input.value.length}/${max}`; };
    update();
    input.addEventListener('input', update);
  });
}

/* ============================================================
   VISTA PREVIA (paso 7)
   ============================================================ */
function generarVistaPrevia() {
  guardarDatosPaso(6);
  const cont = document.getElementById('previewContainer');
  if (!cont) return;

  let patronTexto = '';
  if (datos.tipoSeguridad === 'patron' && datos.patronSecuencia) {
    patronTexto = datos.patronSecuencia.split(',').join('-');
  }

  const serviciosHtml = datos.servicios.map(s => `
    <tr>
      <td>${escapeHtml(s.desc)}</td>
      <td class="costo">${formatBs(s.costo)}</td>
    </tr>
  `).join('');

  const fotosValidas = datos.fotos.filter(f => f && f.dataUrl);
  const fotosHtml = fotosValidas.length > 0
    ? `<div class="preview-section">
         <div class="preview-section-title">Fotos del equipo</div>
         <div class="preview-fotos-grid">
           ${fotosValidas.map(f => `<img src="${f.dataUrl}" alt="foto">`).join('')}
         </div>
       </div>`
    : '';

  cont.innerHTML = `
    <div class="preview-recibo">
      <div class="preview-header">
        <img src="${CONFIG.logoUrl}" alt="logo" onerror="this.style.display='none'">
        <div class="preview-header-text">
          <h3>${CONFIG.nombreTienda}</h3>
          <p>${CONFIG.eslogan}</p>
        </div>
        <div class="preview-header-recibo">
          <strong>RECIBO</strong>
          DE INGRESO
        </div>
      </div>

      <div class="preview-fecha">
        <span>Fecha: <strong>${new Date().toLocaleString('es-BO')}</strong></span>
        <span>Por: <strong>${escapeHtml(sesion.nombre)}</strong></span>
      </div>

      <div class="preview-section">
        <div class="preview-section-title">Cliente</div>
        <div class="preview-row">
          <span>Nombre:</span>
          <span>${escapeHtml(datos.nombre)}</span>
        </div>
        <div class="preview-row">
          <span>Teléfono:</span>
          <span>${escapeHtml(datos.telefono)}</span>
        </div>
      </div>

      <div class="preview-section">
        <div class="preview-section-title">Equipo</div>
        <div class="preview-row">
          <span>Marca / Modelo:</span>
          <span>${escapeHtml(datos.marca)} ${escapeHtml(datos.modelo)}</span>
        </div>
        ${datos.imei ? `<div class="preview-row"><span>IMEI:</span><span>${escapeHtml(datos.imei)}</span></div>` : ''}
        <div class="preview-row">
          <span>Enciende:</span>
          <span>${escapeHtml(datos.enciende)}</span>
        </div>
      </div>

      ${datos.estado || datos.falla ? `
        <div class="preview-section">
          <div class="preview-section-title">Estado y falla</div>
          ${datos.estado ? `<div class="preview-row"><span>Estado:</span><span>${escapeHtml(datos.estado)}</span></div>` : ''}
          ${datos.falla ? `<div class="preview-row"><span>Falla:</span><span>${escapeHtml(datos.falla)}</span></div>` : ''}
        </div>
      ` : ''}

      <div class="preview-section">
        <div class="preview-section-title">Clave de acceso</div>
        <div class="preview-row">
          <span>Tipo:</span>
          <span>${escapeHtml(datos.tipoSeguridad)}</span>
        </div>
        ${datos.tipoSeguridad === 'pin' ? `<div class="preview-row"><span>PIN:</span><span>${escapeHtml(datos.pin)}</span></div>` : ''}
        ${patronTexto ? `<div class="preview-row"><span>Patrón:</span><span>${patronTexto}</span></div>` : ''}
      </div>

      <div class="preview-section">
        <div class="preview-section-title">Servicios y costos</div>
        <table class="preview-servicios-table">
          <thead>
            <tr>
              <th>Descripción</th>
              <th style="text-align:right;">Costo</th>
            </tr>
          </thead>
          <tbody>
            ${serviciosHtml}
          </tbody>
        </table>
        <div class="preview-totales">
          <div class="total-row">
            <span>Total:</span>
            <strong>${formatBs(datos.total)}</strong>
          </div>
          ${datos.adelanto > 0 ? `
            <div class="total-row">
              <span>Adelanto:</span>
              <strong>${formatBs(datos.adelanto)}</strong>
            </div>
          ` : ''}
          <div class="saldo-row">
            <span>SALDO A PAGAR:</span>
            <span>${formatBs(datos.saldo)}</span>
          </div>
        </div>
      </div>

      ${fotosHtml}

      <div class="preview-qr-block">
        <div class="preview-qr-img">
          <i class="fas fa-qrcode" style="font-size: 40px; color: #FF6900;"></i>
        </div>
        <div class="preview-qr-info">
          <h4>Consulta tu reparación online</h4>
          <p>Escanea el código o visita:<br><strong>${CONFIG.web}</strong></p>
        </div>
      </div>
    </div>
  `;
}

/* ============================================================
   WHATSAPP
   ============================================================ */
function configurarWhatsApp() {
  const btn = document.getElementById('sendWhatsappBtn');
  if (!btn) return;

  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);

  newBtn.addEventListener('click', () => {
    const recibo = window._ultimoRecibo;
    if (!recibo) return;
    haptic(15);

    const mensaje = `Hola ${recibo.cliente.split(' ')[0]},

Recibo de ingreso generado.

N Recibo: ${recibo.numeroRecibo}
Equipo: ${recibo.marca} ${recibo.modelo}
Total: ${formatBs(recibo.total)}
${recibo.saldo > 0 ? `Saldo pendiente: ${formatBs(recibo.saldo)}` : ''}

Consulta el estado en: ${CONFIG.urlApp}/?recibo=${recibo.numeroRecibo}

${CONFIG.nombreTienda}
${CONFIG.direccion}
Tel: ${CONFIG.telefono}`;

    const tel = recibo.telefono.replace(/\D/g, '');
    const url = `https://wa.me/591${tel}?text=${encodeURIComponent(mensaje)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  });
}

/* ============================================================
   UTILIDADES EXPORTADAS PARA EL PDF
   ============================================================ */
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
