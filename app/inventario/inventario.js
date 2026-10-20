// Exportamos una función para que el Cierre de Caja pueda consultar el inventario
export async function obtenerProductos() {
  const { getDocs } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
  const snapshot = await getDocs(collection(db, 'productos'));
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}
