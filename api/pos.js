// api/pos.js — único endpoint serverless para todo el módulo POS
// (mesas/comandas/stock/caja), enrutando internamente por ?r=<recurso>.
//
// Por qué un solo archivo: el plan Hobby de Vercel permite máximo 12
// funciones serverless por deployment. Entre los 11 endpoints existentes
// de Sheets (admin-auth, actualizar-vino, etc.) y los del POS ya nos
// pasábamos si cada recurso fuera su propio archivo bajo /api. La lógica
// de cada recurso vive en api/_lib/pos/*.js (no cuenta como función, por
// estar bajo _lib) — este archivo solo hace CORS + auth + dispatch.
// Todas las fases siguientes (stock, caja, reportes) se agregan como
// entradas nuevas en ROUTES, no como archivos nuevos en /api.
const { timingSafeStringEqual } = require('./_lib/timing-safe');
const { requirePos } = require('./_lib/require-pos');

const { listMesas, upsertMesa, saveMesasPos } = require('./_lib/pos/mesas');
const { setMesaEstado } = require('./_lib/pos/mesa-estado');
const { listProductos, upsertProducto } = require('./_lib/pos/productos');
const { importVinos } = require('./_lib/pos/productos-import');
const { listComandas, abrirComanda } = require('./_lib/pos/comandas');
const { getComanda } = require('./_lib/pos/comanda');
const { comandaItem } = require('./_lib/pos/comanda-item');
const { cerrarComanda } = require('./_lib/pos/comanda-cerrar');
const { anularComanda } = require('./_lib/pos/comanda-anular');
const { trasladarComanda } = require('./_lib/pos/comanda-trasladar');
const { setDescuento } = require('./_lib/pos/comanda-descuento');
const { getCaja, abrirCaja } = require('./_lib/pos/caja');
const { registrarMovimiento } = require('./_lib/pos/caja-movimiento');
const { cerrarCaja } = require('./_lib/pos/caja-cerrar');
const { getReportes } = require('./_lib/pos/reportes');

const ROUTES = {
  'mesas:GET': listMesas,
  'mesas:POST': upsertMesa,
  'mesas-pos:POST': saveMesasPos,
  'mesa-estado:POST': setMesaEstado,
  'productos:GET': listProductos,
  'productos:POST': upsertProducto,
  'productos-import:POST': importVinos,
  'comandas:GET': listComandas,
  'comandas:POST': abrirComanda,
  'comanda:GET': getComanda,
  'comanda-item:POST': comandaItem,
  'comanda-cerrar:POST': cerrarComanda,
  'comanda-anular:POST': anularComanda,
  'comanda-trasladar:POST': trasladarComanda,
  'comanda-descuento:POST': setDescuento,
  'caja:GET': getCaja,
  'caja:POST': abrirCaja,
  'caja-movimiento:POST': registrarMovimiento,
  'caja-cerrar:POST': cerrarCaja,
  'reportes:GET': getReportes,
};

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  const r = req.query.r;

  // Login: no pasa por requirePos porque ES el chequeo de auth.
  if (r === 'auth') {
    if (req.method !== 'POST') return res.status(405).json({ error: "Method not allowed" });
    const { password } = req.body || {};
    const POS_PASSWORD = process.env.POS_PASSWORD;
    if (!POS_PASSWORD) return res.status(500).json({ error: "POS_PASSWORD no configurada." });
    if (!password) return res.status(400).json({ error: "Falta password." });
    if (timingSafeStringEqual(password, POS_PASSWORD)) return res.status(200).json({ ok: true });
    return res.status(401).json({ ok: false, error: "Contraseña incorrecta." });
  }

  if (!requirePos(req, res)) return; // ya respondió 401/500

  const fn = ROUTES[`${r}:${req.method}`];
  if (!fn) return res.status(404).json({ error: `Recurso no encontrado: ${r}` });

  try {
    await fn(req, res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: "Error interno." });
  }
};
