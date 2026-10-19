/* ============================================================
   FOTOS (MÉTODO DE CLONACIÓN - MÁXIMA COMPATIBILIDAD)
   ============================================================ */
function configurarFotos() {
  const grid = document.getElementById('fotosGrid');
  const sheet = document.getElementById('fotoSheet');
  
  if (!grid) return;

  let slotActual = null;

  // 1. Abrir el menú al tocar un cuadro
  grid.addEventListener('click', (e) => {
    const slot = e.target.closest('.foto-slot');
    if (!slot) return;

    // Si toca la "X" para borrar
    if (e.target.closest('.foto-remove')) {
      e.stopPropagation(); haptic(15);
      const idx = parseInt(slot.dataset.slot);
      datos.fotos[idx] = null; renderSlots(); return;
    }

    const idx = parseInt(slot.dataset.slot);
    if (datos.fotos[idx]) return; // Ya tiene foto

    slotActual = idx; haptic(10);
    
    // Mostrar el menú
    if (sheet) sheet.classList.add('show');
  });

  // 2. Cerrar el menú
  const cerrarSheet = () => sheet?.classList.remove('show');
  document.getElementById('btnCancelarFoto')?.addEventListener('click', cerrarSheet);

  // 3. FUNCIÓN MÁGICA PARA ANDROID: Crea un input falso en el DOM
  const dispararCamara = (usarCamara) => {
    // Creamos un input temporal
    const tempInput = document.createElement('input');
    tempInput.type = 'file';
    tempInput.accept = 'image/*';
    if (usarCamara) {
      tempInput.capture = 'environment'; // Fuerza la cámara trasera
    }

    // Lo hacemos invisible pero parte del DOM real
    tempInput.style.position = 'absolute';
    tempInput.style.top = '-9999px';
    tempInput.style.opacity = '0';

    // Evento cuando el usuario toma o elige la foto
    tempInput.addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (file && slotActual !== null) {
        haptic(10);
        try {
          const dataUrl = await comprimirImagen(file, 1000, 0.75);
          datos.fotos[slotActual] = { file, dataUrl };
          renderSlots(); 
          toast('Foto añadida', 'success', 1500);
        } catch (err) { 
          toast('Error al procesar la imagen', 'error'); 
        }
      }
      slotActual = null;
      document.body.removeChild(tempInput); // Limpiamos el input temporal
    });

    document.body.appendChild(tempInput);
    tempInput.click(); // Hacemos clic en el input temporal
  };

  // 4. Botones del menú
  document.getElementById('btnTomarFoto')?.addEventListener('click', () => {
    cerrarSheet();
    dispararCamara(true); // true = Abrir cámara
  });

  document.getElementById('btnSubirFoto')?.addEventListener('click', () => {
    cerrarSheet();
    dispararCamara(false); // false = Abrir galería
  });

  // 5. Renderizar los huecos
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
