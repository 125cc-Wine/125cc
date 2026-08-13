// api/_lib/bodegas.js — Lectura + normalización compartida de la pestaña
// "Bodegas" del Sheet. La usa obtener-vinos.js (fusionar bodega_info en cada
// vino) y actualizar-vino.js (CRUD del panel de bodegas + rename en cascada).

// Mismo criterio de normalización que ya usa actualizar-vino.js para las
// columnas del Sheet (colIdx) y stats.html para dedupear bodegas del catálogo
// externo — minúsculas, sin tildes, espacios colapsados. Así "Reinero",
// "reinero " y "Reinero " matchean como la misma bodega.
function normalizarBodega(nombre) {
  return (nombre || '').toString().toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

// Devuelve { bodegas: [{id,nombre,bodega_info}], porNombre: Map(normalizado -> bodega_info) }.
// Si la pestaña "Bodegas" todavía no existe (proyecto viejo sin migrar), no
// rompe: devuelve todo vacío y obtener-vinos.js cae al fallback de
// bodega_info propio de cada vino.
async function leerBodegas(sheetId, token) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Bodegas!A1:C500`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return { bodegas: [], porNombre: new Map() };

  const data = await res.json();
  const rows = data.values || [];
  const bodegas = rows.slice(1)
    .filter(r => r[0] && r[1])
    .map(r => ({ id: parseInt(r[0]) || 0, nombre: r[1] || '', bodega_info: r[2] || '' }));

  const porNombre = new Map(bodegas.map(b => [normalizarBodega(b.nombre), b.bodega_info]));
  return { bodegas, porNombre };
}

module.exports = { normalizarBodega, leerBodegas };
