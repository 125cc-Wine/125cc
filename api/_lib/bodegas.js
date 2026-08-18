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

// D y E son lat/lon (WGS84, decimal) para el mapa de ubicación de la ficha —
// se agregaron después de bodega_info, por eso quedan al final y son
// opcionales: una bodega sin geocodificar todavía simplemente no muestra
// mapa (ver public/index.html, renderFicha).
function parseCoord(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

// Devuelve { bodegas: [{id,nombre,bodega_info,lat,lon}], porNombre: Map(normalizado -> {bodega_info,lat,lon}) }.
// Si la pestaña "Bodegas" todavía no existe (proyecto viejo sin migrar), no
// rompe: devuelve todo vacío y obtener-vinos.js cae al fallback de
// bodega_info propio de cada vino.
async function leerBodegas(sheetId, token) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Bodegas!A1:E500`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return { bodegas: [], porNombre: new Map() };

  const data = await res.json();
  const rows = data.values || [];
  const bodegas = rows.slice(1)
    .filter(r => r[0] && r[1])
    .map(r => ({
      id: parseInt(r[0]) || 0,
      nombre: r[1] || '',
      bodega_info: r[2] || '',
      lat: parseCoord(r[3]),
      lon: parseCoord(r[4]),
    }));

  const porNombre = new Map(bodegas.map(b => [normalizarBodega(b.nombre), { bodega_info: b.bodega_info, lat: b.lat, lon: b.lon }]));
  return { bodegas, porNombre };
}

module.exports = { normalizarBodega, leerBodegas };
