/* ============================================================
   DR. XIAOMI · CLIENTE (Wizard PRO - Conectado a Firestore)
   Archivo: js/cliente.js
   ============================================================ */

import { requireAuth, logout } from '/js/app-auth.js';
import { toast, haptic, initTheme, escapeHtml, formatBs, showLoading, hideLoading } from '/js/app-ui.js';
import { db } from '/js/firebase.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { generarPDFUnificado } from '/js/cliente-pdf.js';

/* ============================================================
   CONFIGURACIÓN GENERAL
   ============================================================ */
const CONFIG = {
  nombreTienda: 'DR. XIAOMI SCZ',
  eslogan: 'Servicio Técnico Especializado',
  direccion: 'Centro Comercial Cañoto #K1, Santa Cruz',
  telefono: '75959450',
  web: 'xiaomi.scz.red',
  urlApp: 'https://xiaomi.scz.red',
  logoUrl: 'https://xiaomi.scz.red/img/logo1.png'
};

/* ============================================================
   ESTADO GLOBAL
   ============================================================ */
let sesion = null;
let pasoActual = 1;
const TOTAL_PASOS = 7;

const datos = {
  nombre: '', telefono: '',
  marca: '', modelo: '', color: '', enciende: '',
  motivoIngreso: '', falla: '', checklist: '',
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
  
  const hayBorrador = cargarBorrador();

  configurarHeader();
  configurarWizard();
  configurarMarca();
  configurarRadioGroups();
  configurarLogicaInteligente();
  configurarPattern();
  configurarFotos();
  configurarServicios();
  configurarBotonGenerarPDF();

  const content = document.getElementById('wizardContent');
  if (content) {
    content.addEventListener('input', guardarBorradorDebounce);
    content.addEventListener('change', guardarBorradorDebounce);
  }

  if (!hayBorrador) irAPaso(1);
  
  actualizarBarraProgreso();
  actualizarBotones();
}

/* ============================================================
   PERSISTENCIA (BORRADOR)
   ============================================================ */
let timerGuardado = null;

function guardarBorrador() {
  try {
    const copia = { ...datos };
    copia.fotos = datos.fotos.map(f => f && f.dataUrl ? { dataUrl: f.dataUrl } : null);
    localStorage.setItem('drxiaomi_borrador', JSON.stringify(copia));
  } catch (e) {}
}

function guardarBorradorDebounce() {
  clearTimeout(timerGuardado);
  timerGuardado = setTimeout(guardarBorrador, 500);
}

function cargarBorrador() {
  try {
    const guardado = localStorage.getItem('drxiaomi_borrador');
    if (!guardado) return false;
    const d = JSON.parse(guardado);
    if (!d.nombre) return false;
    
    Object.assign(datos, d);
    if (!datos.fotos || datos.fotos.length !== 4) datos.fotos = [null, null, null, null];
    
    if (datos.nombre) document.getElementById('nombre').value = datos.nombre;
    if (datos.telefono) document.getElementById('telefono').value = datos.telefono;
    if (datos.modelo) document.getElementById('modelo').value = datos.modelo;
    if (datos.color) document.getElementById('color').value = datos.color;
    if (datos.falla) document.getElementById('fallaDetalle').value = datos.falla;
    
    toast('Borrador recuperado', 'info', 2000);
    irAPaso(2); 
    return true;
  } catch (e) { return false; }
}

function limpiarBorrador() {
  if (confirm('¿Borrar todo y empezar un recibo nuevo?')) {
    localStorage.removeItem('drxiaomi_borrador');
    window.location.reload();
  }
}

/* ============================================================
   HEADER
   ============================================================ */
function configurarHeader() {
  document.getElementById('backToPanelBtn')?.addEventListener('click', () => {
    haptic(10);
    if (confirm('¿Salir? Tu borrador se guardará automáticamente.')) window.location.href = '/app/';
  });
  
  document.getElementById('clearDraftBtn')?.addEventListener('click', () => {
    haptic(15);
    limpiarBorrador();
  });

  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    haptic(20);
    if (confirm('¿Cerrar sesión?')) logout();
  });

  document.getElementById('themeToggleBtn')?.addEventListener('click', () => {
    const html = document.documentElement;
    const nuevo = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', nuevo);
    localStorage.setItem('theme', nuevo);
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

  document.querySelectorAll('.wizard-panel').forEach(p => {
    p.classList.add('hidden');
    p.setAttribute('aria-hidden', 'true');
  });
  
  const panel = document.querySelector(`[data-panel="${pasoActual}"]`);
  if (panel) {
    panel.classList.remove('hidden');
    panel.setAttribute('aria-hidden', 'false');
    const appBody = document.getElementById('appBody');
    if (appBody) appBody.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // 🔥 CORREGIDO: LÓGICA INTELIGENTE DEL PASO 3
  if (pasoActual === 3) {
    // Quitamos el setTimeout para que sea inmediato
    const valorEnciende = document.getElementById('enciende')?.value;
    const cardReparaciones = document.getElementById('cardReparaciones');
    const cardAuditoriaGeneral = document.getElementById('cardAuditoriaGeneral');
    const cardAuditoriaFisica = document.getElementById('cardAuditoriaFisica');
    
    if (cardReparaciones) {
      if (valorEnciende === 'Sí' || valorEnciende === 'A veces') {
        cardReparaciones.classList.remove('hidden');
        cardAuditoriaGeneral?.classList.remove('hidden');
        cardAuditoriaFisica?.classList.add('hidden');
      } else {
        cardReparaciones.classList.add('hidden');
        cardAuditoriaGeneral?.classList.add('hidden');
        cardAuditoriaFisica?.classList.remove('hidden');
      }
    }
  }

  actualizarBarraProgreso();
  actualizarBotones();
  if (pasoActual === 7) generarVistaPrevia();
}

function actualizarBarraProgreso() {
  const dots = document.querySelectorAll('.wizard-dot');
  dots.forEach((dot, index) => {
    const step = index + 1;
    dot.classList.remove('active', 'done');
    if (step < pasoActual) dot.classList.add('done');
    else if (step === pasoActual) dot.classList.add('active');
  });
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
   VALIDACIONES
   ============================================================ */
function validarPaso(paso) {
  if (paso === 1) {
    if (!document.getElementById('nombre')?.value.trim()) { toast('Falta el nombre del cliente', 'error'); return false; }
    if (document.getElementById('telefono')?.value.length < 7) { toast('El teléfono debe tener al menos 7 dígitos', 'error'); return false; }
  }
  if (paso === 2) {
    if (!document.getElementById('marca')?.value) { toast('Selecciona una marca', 'error'); return false; }
    if (!document.getElementById('modelo')?.value.trim()) { toast('Falta el modelo del equipo', 'error'); return false; }
    if (!document.getElementById('enciende')?.value) { toast('Indica si el equipo enciende', 'error'); return false; }
  }
  if (paso === 3) {
    const enciende = document.getElementById('enciende')?.value;
    if (enciende === 'Sí' || enciende === 'A veces') {
      if (!document.getElementById('motivoIngreso')?.value) {
        toast('Selecciona una reparación', 'error'); return false;
      }
    }
  }
  if (paso === 4) {
    const tipo = document.getElementById('tipoSeguridad')?.value;
    if (tipo === 'patron' && !document.getElementById('patronSecuencia')?.value) { toast('Dibuja el patrón', 'error'); return false; }
    if (tipo === 'pin' && !document.getElementById('pinInput')?.value.trim()) { toast('Ingresa el PIN', 'error'); return false; }
  }
  if (paso === 6) {
    let hayServicio = false;
    document.querySelectorAll('.servicio-item').forEach(item => {
      const desc = item.querySelector('.servicio-desc')?.value;
      const costo = parseFloat(item.querySelector('.servicio-costo')?.value) || 0;
      if (desc && costo > 0) hayServicio = true;
    });
    if (!hayServicio) { toast('Añade al menos un costo', 'error'); return false; }
  }
  return true;
}

function guardarDatosPaso(paso) {
  if (paso === 1) {
    datos.nombre = document.getElementById('nombre')?.value.trim() || '';
    datos.telefono = document.getElementById('telefono')?.value.trim() || '';
  }
  if (paso === 2) {
    datos.marca = document.getElementById('marca')?.value || '';
    datos.modelo = document.getElementById('modelo')?.value.trim() || '';
    datos.color = document.getElementById('color')?.value.trim() || '';
    datos.enciende = document.getElementById('enciende')?.value || '';
  }
  if (paso === 3) {
    datos.motivoIngreso = document.getElementById('motivoIngreso')?.value || '';
    datos.falla = document.getElementById('fallaDetalle')?.value.trim() || '';
    datos.checklist = document.getElementById('checklistResultados')?.value || '';
  }
  if (paso === 4) {
    datos.tipoSeguridad = document.getElementById('tipoSeguridad')?.value || 'patron';
    datos.pin = document.getElementById('pinInput')?.value.trim() || '';
    datos.patronSecuencia = document.getElementById('patronSecuencia')?.value || '';
  }
  if (paso === 6) {
    recolectarServicios();
  }
}

/* ============================================================
   MARCAS Y RADIOS
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
   LÓGICA INTELIGENTE (CHIPS Y CHECKLIST)
   ============================================================ */
function configurarLogicaInteligente() {
  const motivoGroup = document.getElementById('motivoIngresoGroup');
  if (motivoGroup) {
    motivoGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.chip-btn');
      if (!btn) return;
      haptic(8);
      motivoGroup.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('motivoIngreso').value = btn.dataset.value;
    });
  }

  const configurarChecklist = (idGroup) => {
    const group = document.getElementById(idGroup);
    if (!group) return;
    group.addEventListener('click', (e) => {
      const btn = e.target.closest('.check-item');
      if (!btn) return;
      haptic(10);
      
      if (!btn.classList.contains('ok') && !btn.classList.contains('falla')) {
        btn.classList.add('ok'); 
      } else if (btn.classList.contains('ok')) {
        btn.classList.remove('ok');
        btn.classList.add('falla');
      } else {
        btn.classList.remove('falla');
      }
      actualizarResultados();
    });
  };

  configurarChecklist('checklistGeneralGroup');
  configurarChecklist('checklistFisicoGroup');

  function actualizarResultados() {
    const resultados = [];
    document.querySelectorAll('.check-item').forEach(btn => {
      const item = btn.dataset.item;
      if (btn.classList.contains('ok')) resultados.push(`${item}: OK`);
      if (btn.classList.contains('falla')) resultados.push(`${item}: FALLA`);
    });
    const inputRes = document.getElementById('checklistResultados');
    if (inputRes) inputRes.value = resultados.join(', ');
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
  const size = 300, r = 20, margin = 30;
  const pts = []; let id = 1;
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) pts.push({ id: id++, x: margin + 120 * x, y: margin + 120 * y, sel: false });

  let path = [], drawing = false;

  function drawBase() {
    bgc.clearRect(0, 0, size, size);
    pts.forEach(p => {
      bgc.beginPath(); bgc.arc(p.x, p.y, r, 0, 2 * Math.PI);
      bgc.fillStyle = p.sel ? '#E65100' : 'transparent'; bgc.fill();
      bgc.strokeStyle = p.sel ? '#E65100' : '#555'; bgc.lineWidth = 3; bgc.stroke();
    });
  }

  function drawLines(current) {
    lnc.clearRect(0, 0, size, size);
    if (path.length === 0) return;
    lnc.strokeStyle = '#E65100'; lnc.lineWidth = 6; lnc.lineCap = 'round'; lnc.lineJoin = 'round';
    lnc.beginPath(); lnc.moveTo(path[0].x, path[0].y);
    path.forEach(p => lnc.lineTo(p.x, p.y));
    if (drawing && current) lnc.lineTo(current.x, current.y);
    lnc.stroke();
  }

  function getPos(e) {
    const rect = lineCanvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: (t.clientX - rect.left) * (size / rect.width), y: (t.clientY - rect.top) * (size / rect.height) };
  }

  function hit(p) { return pts.find(pt => !pt.sel && Math.hypot(pt.x - p.x, pt.y - p.y) < r + 25); }

  function updateSeq() {
    const seq = path.map(p => p.id).join(',');
    document.getElementById('patronSecuencia').value = seq;
    const display = document.getElementById('pattern-sequence');
    if (display) display.textContent = seq ? path.map(p => p.id).join(' → ') : 'Sin patrón';
  }

  lineCanvas.addEventListener('mousedown', (e) => { e.preventDefault(); drawing = true; path = []; pts.forEach(p => p.sel = false); updateSeq(); drawBase(); });
  lineCanvas.addEventListener('mousemove', (e) => {
    if (!drawing) return; e.preventDefault(); const p = getPos(e); const h = hit(p);
    if (h) { h.sel = true; path.push(h); haptic(10); drawBase(); updateSeq(); }
    drawLines(p);
  });
  lineCanvas.addEventListener('mouseup', () => { drawing = false; drawLines(); updateSeq(); });
  lineCanvas.addEventListener('mouseleave', () => { drawing = false; drawLines(); updateSeq(); });

  lineCanvas.addEventListener('touchstart', (e) => { e.preventDefault(); drawing = true; path = []; pts.forEach(p => p.sel = false); updateSeq(); drawBase(); }, { passive: false });
  lineCanvas.addEventListener('touchmove', (e) => {
    if (!drawing) return; e.preventDefault(); const p = getPos(e); const h = hit(p);
    if (h) { h.sel = true; path.push(h); haptic(10); drawBase(); updateSeq(); }
    drawLines(p);
  }, { passive: false });
  lineCanvas.addEventListener('touchend', (e) => { e.preventDefault(); drawing = false; drawLines(); updateSeq(); }, { passive: false });

  document.getElementById('clearPattern')?.addEventListener('click', () => {
    haptic(10); path = []; pts.forEach(p => p.sel = false); drawBase(); lnc.clearRect(0, 0, size, size); updateSeq();
  });

  drawBase();
}

/* ============================================================
   FOTOS (🔥 CORREGIDO CON LOS INPUTS DEL HTML)
   ============================================================ */
function configurarFotos() {
  const grid = document.getElementById('fotosGrid');
  const sheet = document.getElementById('fotoSheet');
  // Buscamos los inputs ocultos que añadimos al HTML
  const inputCamara = document.getElementById('inputCamara');
  const inputGaleria = document.getElementById('inputGaleria');
  
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
  });

  const cerrarSheet = () => sheet?.classList.remove('show');
  document.getElementById('btnCancelarFoto')?.addEventListener('click', cerrarSheet);

  // 🔥 Clic directo, sin crear inputs temporales
  document.getElementById('btnTomarFoto')?.addEventListener('click', () => {
    cerrarSheet();
    if (inputCamara) inputCamara.click();
    else toast('Cámara no disponible', 'error');
  });

  document.getElementById('btnSubirFoto')?.addEventListener('click', () => {
    cerrarSheet();
    if (inputGaleria) inputGaleria.click();
    else toast('Galería no disponible', 'error');
  });

  async function procesarFoto(e) {
    const file = e.target.files[0];
    if (file && slotActual !== null) {
      haptic(10);
      try {
        const dataUrl = await comprimirImagen(file);
        datos.fotos[slotActual] = { file, dataUrl };
        renderSlots(); toast('Foto añadida', 'success', 1500); guardarBorradorDebounce();
      } catch (err) { toast('Error al procesar imagen', 'error'); }
    }
    e.target.value = ''; // Limpiar el input para que se pueda volver a tomar foto
    slotActual = null;
  }

  inputCamara?.addEventListener('change', procesarFoto);
  inputGaleria?.addEventListener('change', procesarFoto);

  function renderSlots() {
    grid.querySelectorAll('.foto-slot').forEach((slot, i) => {
      const f = datos.fotos[i];
      if (f && f.dataUrl) {
        slot.classList.add('filled');
        slot.innerHTML = `<img src="${f.dataUrl}" alt="Foto"><button type="button" class="foto-remove"><i class="fas fa-times"></i></button>`;
      } else {
        slot.classList.remove('filled');
        slot.innerHTML = `<i class="fas fa-camera"></i><span>Añadir</span>`;
      }
    });
  }
  renderSlots();
}

async function comprimirImagen(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > 1000) { h = h * 1000 / w; w = 1000; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.onerror = reject; img.src = e.target.result;
    };
    reader.onerror = reject; reader.readAsDataURL(file);
  });
}

/* ============================================================
   SERVICIOS Y COSTOS (🔥 CORREGIDO)
   ============================================================ */
function configurarServicios() {
  const list = document.getElementById('serviciosList');
  const btnAdd = document.getElementById('addServicio');
  const preciosGroup = document.getElementById('preciosRapidosGroup');
  if (!list || !btnAdd) return;

  list.addEventListener('input', (e) => {
    if (e.target.classList.contains('servicio-costo')) calcularTotal();
  });

  list.addEventListener('click', (e) => {
    if (e.target.closest('.removeServicio')) {
      haptic(15);
      const item = e.target.closest('.servicio-item');
      if (list.querySelectorAll('.servicio-item').length > 1) {
        item.remove(); calcularTotal();
      }
    }
  });

  btnAdd.addEventListener('click', () => {
    haptic(10);
    const item = crearServicioItem('', '');
    list.appendChild(item);
    item.querySelector('.servicio-desc').focus();
  });

  if (preciosGroup) {
    preciosGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.chip-btn');
      if (!btn) return;
      haptic(8);
      const precio = btn.dataset.precio;
      let llenado = false;
      
      document.querySelectorAll('.servicio-costo').forEach(input => {
        if (!input.value && !llenado) {
          input.value = precio;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          llenado = true;
        }
      });

      if (!llenado) {
        const item = crearServicioItem('Reparación extra', precio);
        list.appendChild(item);
        calcularTotal();
      }
    });
  }

  document.getElementById('adelanto')?.addEventListener('input', calcularTotal);
  
  // 🔥 Forzar que siempre haya una casilla al entrar
  if (list.children.length === 0) list.appendChild(crearServicioItem('', ''));
}

function crearServicioItem(desc, costo) {
  const div = document.createElement('div');
  div.className = 'servicio-item';
  div.innerHTML = `
    <input type="text" class="servicio-desc" placeholder="Ej. Cambio de pantalla" value="${desc}">
    <input type="number" class="servicio-costo" placeholder="Bs." value="${costo}" step="0.01" min="0">
    <button type="button" class="removeServicio"><i class="fas fa-times"></i></button>
  `;
  return div;
}

function calcularTotal() {
  let total = 0;
  document.querySelectorAll('.servicio-costo').forEach(input => {
    total += parseFloat(input.value) || 0;
  });
  
  const adelanto = parseFloat(document.getElementById('adelanto')?.value) || 0;
  const totalDisplay = document.getElementById('costoTotalDisplay');
  const saldoDisplay = document.getElementById('saldoDisplay');
  const costoTotalInput = document.getElementById('costoTotal');
  
  if (costoTotalInput) costoTotalInput.value = total.toFixed(2);
  if (totalDisplay) totalDisplay.textContent = formatBs(total);
  if (saldoDisplay) saldoDisplay.textContent = formatBs(Math.max(0, total - adelanto));
}

function recolectarServicios() {
  datos.servicios = [];
  document.querySelectorAll('.servicio-item').forEach(item => {
    const desc = item.querySelector('.servicio-desc')?.value.trim() || '';
    const costo = parseFloat(item.querySelector('.servicio-costo')?.value) || 0;
    if (desc || costo > 0) {
      datos.servicios.push({ desc: desc || 'Reparación', costo });
    }
  });
  datos.total = parseFloat(document.getElementById('costoTotal')?.value) || 0;
  datos.adelanto = parseFloat(document.getElementById('adelanto')?.value) || 0;
  datos.saldo = Math.max(0, datos.total - datos.adelanto);
}

/* ============================================================
   VISTA PREVIA (PASO 7)
   ============================================================ */
function generarVistaPrevia() {
  guardarDatosPaso(6);
  const cont = document.getElementById('previewContainer');
  if (!cont) return;

  const serviciosHtml = datos.servicios.map(s => 
    `<tr><td>${escapeHtml(s.desc)}</td><td style="text-align:right">${formatBs(s.costo)}</td></tr>`
  ).join('');

  const fotosValidas = datos.fotos.filter(f => f && f.dataUrl);
  const fotosHtml = fotosValidas.length > 0 
    ? `<div class="preview-section" style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;">${fotosValidas.map(f => `<img src="${f.dataUrl}" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:4px;">`).join('')}</div>` 
    : '';

  let seguridadTexto = 'Ninguna';
  if (datos.tipoSeguridad === 'pin' && datos.pin) {
    seguridadTexto = `PIN: ${escapeHtml(datos.pin)}`;
  } else if (datos.tipoSeguridad === 'patron' && datos.patronSecuencia) {
    seguridadTexto = `Patrón: ${datos.patronSecuencia.split(',').join(' → ')}`;
  } else if (datos.tipoSeguridad === 'ninguno') {
    seguridadTexto = 'Sin bloqueo';
  }

  cont.innerHTML = `
    <div class="preview-recibo">
      <div class="preview-header">
        <img src="${CONFIG.logoUrl}" onerror="this.style.display='none'">
        <div>
          <h3 style="margin:0;font-size:16px;">${CONFIG.nombreTienda}</h3>
          <p style="margin:0;font-size:10px;">Recibo de Ingreso</p>
        </div>
      </div>
      
      <div class="preview-section">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><strong>CLIENTE:</strong> <span>${escapeHtml(datos.nombre)}</span></div>
        <div style="display:flex;justify-content:space-between;"><strong>TELÉFONO:</strong> <span>${escapeHtml(datos.telefono)}</span></div>
      </div>

      <div class="preview-section">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><strong>EQUIPO:</strong> <span>${escapeHtml(datos.marca)} ${escapeHtml(datos.modelo)} (${escapeHtml(datos.color || 'N/A')})</span></div>
        <div style="display:flex;justify-content:space-between;color:#E65100;"><strong>DESBLOQUEO:</strong> <span>${seguridadTexto}</span></div>
      </div>

      <div class="preview-section">
        <div><strong>MOTIVO / FALLA:</strong> ${escapeHtml(datos.motivoIngreso || datos.falla || '-')}</div>
        <div style="margin-top:4px; font-size:10px; color:#666;"><strong>CHECKLIST:</strong> ${escapeHtml(datos.checklist || 'Todo OK')}</div>
      </div>

      <table style="width:100%; font-size:11px; margin-top:10px; border-collapse:collapse;">
        <thead><tr style="border-bottom:1px solid #ddd;"><th align="left" style="padding:6px 0;">Servicio</th><th align="right" style="padding:6px 0;">Costo</th></tr></thead>
        <tbody>${serviciosHtml}</tbody>
      </table>

      <div class="preview-totales">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Total:</span><b>${formatBs(datos.total)}</b></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Adelanto:</span><b>${formatBs(datos.adelanto)}</b></div>
        <div style="display:flex;justify-content:space-between;color:#E65100;font-size:14px;margin-top:8px;"><span>SALDO A PAGAR:</span><b>${formatBs(datos.saldo)}</b></div>
      </div>

      ${fotosHtml}
    </div>
  `;
}

/* ============================================================
   GENERACIÓN DE PDF Y GUARDADO EN FIRESTORE (🔥 CORREGIDO)
   ============================================================ */
function configurarBotonGenerarPDF() {
  const btn = document.getElementById('btnGenerate');
  if (!btn) return;
  let generando = false;

  btn.addEventListener('click', async () => {
    if (generando) return;
    if (!validarPaso(6)) return;
    
    generando = true;
    guardarDatosPaso(6);
    
    const textoOriginal = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    btn.style.opacity = '0.7';

    try {
      const num = generarNumeroRecibo();
      
      // Preparamos el paquete
      const paquete = {
        numeroRecibo: num,
        cliente: datos.nombre,
        telefono: datos.telefono,
        marca: datos.marca,
        modelo: datos.modelo,
        color: datos.color,
        enciende: datos.enciende,
        falla: datos.falla,
        motivoIngreso: datos.motivoIngreso,
        checklist: datos.checklist,
        tipoSeguridad: datos.tipoSeguridad,
        pin: datos.pin,
        patron: datos.patronSecuencia,
        servicios: datos.servicios,
        total: datos.total,
        adelanto: datos.adelanto,
        saldo: datos.saldo,
        fotos: datos.fotos.filter(f => f && f.dataUrl).map(f => f.dataUrl),
        estadoOrden: 'recibido',
        fecha: serverTimestamp(),
        creadoPor: sesion.nombre,
        montoCobrado: 0,
        costoRepuesto: 0
      };

      // 1. GUARDAR EN FIRESTORE PRIMERO
      const docRef = await addDoc(collection(db, 'recibos'), paquete);
      console.log('✅ Recibo guardado en Firestore con ID:', docRef.id);

      // 2. LUEGO GENERAR EL PDF (capturamos el error para que no rompa el guardado)
      try {
        await generarPDFUnificado(paquete, 'guardar_en_nube');
      } catch (pdfError) {
        console.error('PDF falló, pero el recibo se guardó:', pdfError);
      }

      // 3. MOSTRAR ÉXITO
      localStorage.removeItem('drxiaomi_borrador');
      document.getElementById('successNumero').textContent = num;
      document.getElementById('successModal').classList.add('show');
      window._ultimoRecibo = paquete;
      configurarWhatsApp();

    } catch (error) {
      console.error("Error al guardar en Firestore:", error);
      toast('Error al guardar en la base de datos: ' + error.message, 'error', 5000);
    } finally {
      generando = false;
      btn.innerHTML = textoOriginal;
      btn.style.opacity = '1';
    }
  });

  document.getElementById('backToPanelBtn2')?.addEventListener('click', () => {
    window.location.href = '/app/';
  });
}

function configurarWhatsApp() {
  const btn = document.getElementById('sendWhatsappBtn');
  if (!btn) return;
  
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);
  
  newBtn.addEventListener('click', () => {
    const recibo = window._ultimoRecibo;
    if (!recibo) return;
    
    haptic(15);
    const mensaje = `Hola ${recibo.cliente.split(' ')[0]},\n\nRecibo de ingreso generado.\n\nN Recibo: ${recibo.numeroRecibo}\nEquipo: ${recibo.marca} ${recibo.modelo}\nTotal: ${formatBs(recibo.total)}\n${recibo.saldo > 0 ? `Saldo pendiente: ${formatBs(recibo.saldo)}` : ''}\n\nConsulta el estado en: ${CONFIG.urlApp}/?recibo=${recibo.numeroRecibo}\n\n${CONFIG.nombreTienda}\nTel: ${CONFIG.telefono}`;
    
    window.open(`https://wa.me/591${recibo.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(mensaje)}`, '_blank');
  });
}

function generarNumeroRecibo() {
  const f = new Date();
  return `REC-${String(f.getDate()).padStart(2, '0')}${String(f.getMonth() + 1).padStart(2, '0')}${String(f.getFullYear()).slice(-2)}-${String(f.getHours()).padStart(2, '0')}${String(f.getMinutes()).padStart(2, '0')}${String(f.getSeconds()).padStart(2, '0')}`;
}
