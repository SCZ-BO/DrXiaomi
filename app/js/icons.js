/* ============================================================
   DR. XIAOMI · DIRECTORIO CENTRAL DE ICONOS (64x64)
   Archivo: /app/js/icons.js
   ============================================================ */

export const ICONS = {
  agregar:    '/app/icons/agregar.png',
  bateria:    '/app/icons/bateria.png',
  buscar:     '/app/icons/buscar.png',
  calendario: '/app/icons/calendario.png',
  camara:     '/app/icons/camara.png',
  campana:    '/app/icons/campana.png',
  cierre:     '/app/icons/cierre.png',
  cliente:    '/app/icons/cliente.png',
  cobrar:     '/app/icons/cobrar.png',
  editar:     '/app/icons/editar.png',
  eliminar:   '/app/icons/eliminar.png',
  estado:     '/app/icons/estado-reparacion.png',
  falla:      '/app/icons/falla.png',
  galeria:    '/app/icons/galeria.png',
  ganancia:   '/app/icons/ganancia.png',
  home:       '/app/icons/home.png',
  inventario: '/app/icons/inventario.png',
  nota:       '/app/icons/nota.png',
  patron:     '/app/icons/patron.png',
  pdf:        '/app/icons/pdf.png',
  popup:      '/app/icons/popup.png',
  precios:    '/app/icons/precios.png',
  reportes:   '/app/icons/reportes.png',
  salir:      '/app/icons/salir.png',
  servicios:  '/app/icons/servicios.png',
  telefono:   '/app/icons/telefono.png',
  tema:       '/app/icons/tema.png',
  total:      '/app/icons/total.png',
  venta:      '/app/icons/venta.png',
  volver:     '/app/icons/volver.png',
  whatsapp:   '/app/icons/whatsapp.png'
};

/**
 * Función para insertar un icono en cualquier parte de tu HTML o JS.
 * @param {string} nombre - El nombre del icono (ej: 'salir', 'campana').
 * @param {number} tamañoVisual - Tamaño en px que quieres que se vea en pantalla.
 * @returns {string} La etiqueta <img> lista para usar.
 */
export function icono(nombre, tamañoVisual = 24) {
  const ruta = ICONS[nombre];
  
  if (!ruta) {
    console.warn(`El icono "${nombre}" no existe en el directorio.`);
    return '';
  }

  // Usamos 'object-fit: contain' para que el icono de 64x64 se adapte 
  // a cualquier tamaño sin deformarse.
  return `<img src="${ruta}" width="${tamañoVisual}" height="${tamañoVisual}" alt="${nombre}" style="object-fit: contain; display: inline-block; vertical-align: middle;">`;
}
