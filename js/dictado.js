/* ============================================================
   DR. XIAOMI · DICTADO POR VOZ
   Archivo: js/dictado.js
   Descripción: Añade micrófono a todos los campos con [data-dictado]
   ============================================================ */

(function() {
  'use strict';

  /* ---------- Verificar soporte del navegador ---------- */
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    console.warn('⚠️ Este navegador no soporta dictado por voz');
    return;
  }

  console.log('🎤 Dictado por voz disponible');

  /* ---------- Configuración ---------- */
  const CONFIG = {
    idioma: 'es-BO',
    continuo: false,
    interimResults: true
  };

  /* ---------- Inicializar cuando cargue el DOM ---------- */
  function init() {
    // Buscar todos los campos con [data-dictado]
    const campos = document.querySelectorAll('[data-dictado]');
    
    if (campos.length === 0) {
      console.log('🎤 No hay campos para dictado');
      return;
    }

    console.log(`🎤 ${campos.length} campos con dictado detectados`);

    campos.forEach(campo => {
      agregarBotonDictado(campo);
    });
  }

  /* ---------- Añadir botón al campo ---------- */
  function agregarBotonDictado(campo) {
    // Si ya tiene botón, salir
    if (campo.parentElement.querySelector('.dictado-btn')) return;

    // Buscar el contenedor .dictado-wrap (ya está en el HTML)
    const wrap = campo.closest('.dictado-wrap') || campo.parentElement;
    
    // Crear botón
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dictado-btn';
    btn.setAttribute('aria-label', 'Dictar por voz');
    btn.innerHTML = '<i class="fas fa-microphone"></i>';

    // Añadir al wrap
    wrap.appendChild(btn);

    // Crear indicador "escuchando" si no existe
    let indicador = document.querySelector(`[data-indicador="${campo.id}"]`);
    if (!indicador) {
      indicador = document.createElement('div');
      indicador.className = 'dictado-indicador';
      indicador.setAttribute('data-indicador', campo.id);
      indicador.innerHTML = '<div class="punto"></div> Escuchando... habla ahora';
      // Insertar después del wrap
      wrap.parentElement.insertBefore(indicador, wrap.nextSibling);
    }

    // Configurar reconocimiento
    const recognition = new SpeechRecognition();
    recognition.lang = CONFIG.idioma;
    recognition.continuous = CONFIG.continuo;
    recognition.interimResults = CONFIG.interimResults;

    let estaEscuchando = false;

    // Click en el botón
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (estaEscuchando) {
        recognition.stop();
      } else {
        try {
          recognition.start();
        } catch (err) {
          console.error('Error iniciando dictado:', err);
        }
      }
    });

    // Cuando empieza a escuchar
    recognition.onstart = () => {
      estaEscuchando = true;
      btn.classList.add('activo');
      btn.innerHTML = '<i class="fas fa-stop"></i>';
      indicador.classList.add('show');
      
      // Vibración corta
      if ('vibrate' in navigator) navigator.vibrate(10);
    };

    // Cuando termina de escuchar
    recognition.onend = () => {
      estaEscuchando = false;
      btn.classList.remove('activo');
      btn.innerHTML = '<i class="fas fa-microphone"></i>';
      indicador.classList.remove('show');
    };

    // Resultado del reconocimiento
    recognition.onresult = (event) => {
      let textoFinal = '';
      let textoInterim = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcripcion = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          textoFinal += transcripcion;
        } else {
          textoInterim += transcripcion;
        }
      }

      // Si hay texto final, lo escribimos en el campo (reemplazando)
      if (textoFinal) {
        const textoLimpio = textoFinal.trim();
        if (textoLimpio) {
          campo.value = textoLimpio;
          // Disparar evento input para que otros listeners reaccionen (char counters, etc.)
          campo.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    };

    // Errores
    recognition.onerror = (event) => {
      console.error('Error de dictado:', event.error);
      
      estaEscuchando = false;
      btn.classList.remove('activo');
      btn.innerHTML = '<i class="fas fa-microphone"></i>';
      indicador.classList.remove('show');

      // Mensaje según el error
      let mensaje = 'Error al dictar';
      switch (event.error) {
        case 'not-allowed':
        case 'permission-denied':
          mensaje = 'Permiso de micrófono denegado';
          break;
        case 'no-speech':
          mensaje = 'No se detectó voz';
          break;
        case 'network':
          mensaje = 'Sin conexión a internet';
          break;
        case 'aborted':
          // Silencioso, el usuario paró
          return;
      }

      // Toast si está disponible globalmente
      if (window.toast) {
        window.toast(mensaje, 'error', 2500);
      } else {
        console.warn(mensaje);
      }
    };
  }

  /* ---------- Ejecutar cuando el DOM esté listo ---------- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Re-detectar campos después de añadir dinámicamente (para servicios)
  window.addEventListener('camposAgregados', init);

})();
