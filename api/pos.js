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
//
// require() perezoso con string LITERAL (no dinámico): cada entrada de
// ROUTES es un closure `() => require('./ruta/literal').fn` — el
// require() adentro solo corre cuando esa ruta puntual se llama (Node
// cachea el módulo después, no se re-lee del disco en la misma
// instancia tibia). La primera versión de este fix armaba la ruta como
// `[modulePath, fnName]` y hacía `require(modulePath)` con modulePath
// como variable — ESO ROMPIÓ producción: el bundler de Vercel
// (@vercel/nft) arma el paquete de cada función rastreando
// require(...) de forma ESTÁTICA, y un require(variable) no es
// rastreable — los módulos de _lib/pos ni siquiera se subían al
// deployment, así que cualquier ruta que no fuera 'auth' tiraba 500
// ("Error interno") en vivo aunque local funcionaba perfecto (local no
// pasa por ese empaquetado). Un string literal DENTRO de una función
// sigue siendo rastreable — el analizador no ejecuta el código, solo
// busca el patrón require('...') en el texto — así que esta forma
// preserva la carga perezosa sin romper el bundling.
const { requirePos } = require('./_lib/require-pos');

const ROUTES = {
  'mesas:GET': () => require('./_lib/pos/mesas').listMesas,
  'mesas:POST': () => require('./_lib/pos/mesas').upsertMesa,
  'mesas-pos:POST': () => require('./_lib/pos/mesas').saveMesasPos,
  'mesa-eliminar:POST': () => require('./_lib/pos/mesas').eliminarMesa,
  'mesa-estado:POST': () => require('./_lib/pos/mesa-estado').setMesaEstado,
  'productos:GET': () => require('./_lib/pos/productos').listProductos,
  'productos:POST': () => require('./_lib/pos/productos').upsertProducto,
  'productos-import:POST': () => require('./_lib/pos/productos-import').importVinos,
  'comandas:GET': () => require('./_lib/pos/comandas').listComandas,
  'comandas:POST': () => require('./_lib/pos/comandas').abrirComanda,
  'comanda:GET': () => require('./_lib/pos/comanda').getComanda,
  'comanda-item:POST': () => require('./_lib/pos/comanda-item').comandaItem,
  'comanda-cerrar:POST': () => require('./_lib/pos/comanda-cerrar').cerrarComanda,
  'comanda-anular:POST': () => require('./_lib/pos/comanda-anular').anularComanda,
  'comanda-trasladar:POST': () => require('./_lib/pos/comanda-trasladar').trasladarComanda,
  'comanda-descuento:POST': () => require('./_lib/pos/comanda-descuento').setDescuento,
  'caja:GET': () => require('./_lib/pos/caja').getCaja,
  'caja:POST': () => require('./_lib/pos/caja').abrirCaja,
  'caja-movimiento:POST': () => require('./_lib/pos/caja-movimiento').registrarMovimiento,
  'caja-cerrar:POST': () => require('./_lib/pos/caja-cerrar').cerrarCaja,
  'reportes:GET': () => require('./_lib/pos/reportes').getReportes,
  'productos-alertas:GET': () => require('./_lib/pos/productos-alertas').getAlertasMargen,
  'pos-config:GET': () => require('./_lib/pos/productos-alertas').getConfig,
  'pos-config:POST': () => require('./_lib/pos/productos-alertas').setConfig,
  'proveedores:GET': () => require('./_lib/pos/proveedores').listProveedores,
  'proveedores:POST': () => require('./_lib/pos/proveedores').upsertProveedor,
  'proveedor-producto:GET': () => require('./_lib/pos/proveedor-producto').listProveedorProductos,
  'proveedor-producto:POST': () => require('./_lib/pos/proveedor-producto').upsertProveedorProducto,
  'proveedor-aplicar-costo:POST': () => require('./_lib/pos/proveedor-producto').aplicarCosto,
  'stock-merma:POST': () => require('./_lib/pos/stock-movimiento').registrarMerma,
  'stock-conteo:POST': () => require('./_lib/pos/stock-movimiento').registrarConteo,
  'stock-movimientos:GET': () => require('./_lib/pos/stock-movimiento').listMovimientos,
  'insumos:GET': () => require('./_lib/pos/insumos').listInsumos,
  'insumos:POST': () => require('./_lib/pos/insumos').upsertInsumo,
  'receta:GET': () => require('./_lib/pos/receta').getReceta,
  'receta-item:POST': () => require('./_lib/pos/receta').upsertRecetaItem,
  'receta-recalcular-costo:POST': () => require('./_lib/pos/receta').recalcularCostoReceta,
  'costos-fijos:GET': () => require('./_lib/pos/costos-fijos').listCostosFijos,
  'costos-fijos:POST': () => require('./_lib/pos/costos-fijos').upsertCostoFijo,
  'gastos:GET': () => require('./_lib/pos/gastos').listGastos,
  'gastos:POST': () => require('./_lib/pos/gastos').upsertGasto,
  'estado-resultados:GET': () => require('./_lib/pos/estado-resultados').getEstadoResultados,
  'clientes:GET': () => require('./_lib/pos/clientes').listClientes,
  'clientes:POST': () => require('./_lib/pos/clientes').upsertCliente,
  'cliente:GET': () => require('./_lib/pos/cliente').getCliente,
  'comanda-cliente:POST': () => require('./_lib/pos/comanda-cliente').setComandaCliente,
  'clientes-frecuentes:GET': () => require('./_lib/pos/clientes-frecuentes').getClientesFrecuentes,
  'clientes-segmento:GET': () => require('./_lib/pos/clientes-segmento').getClientesSegmento,
  'comprobante-emitir:POST': () => require('./_lib/pos/comprobantes').emitirComprobante,
  'comprobantes:GET': () => require('./_lib/pos/comprobantes').listComprobantes,
  'comprobante-reintentar:POST': () => require('./_lib/pos/comprobantes').reintentarComprobante,
  'cuenta-corriente:GET': () => require('./_lib/pos/cuenta-corriente').getCuentaCorriente,
  'cuenta-corriente-pago:POST': () => require('./_lib/pos/cuenta-corriente').registrarPago,
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
    const { timingSafeStringEqual } = require('./_lib/timing-safe');
    const { password } = req.body || {};
    const POS_PASSWORD = process.env.POS_PASSWORD;
    if (!POS_PASSWORD) return res.status(500).json({ error: "POS_PASSWORD no configurada." });
    if (!password) return res.status(400).json({ error: "Falta password." });
    if (timingSafeStringEqual(password, POS_PASSWORD)) return res.status(200).json({ ok: true });
    return res.status(401).json({ ok: false, error: "Contraseña incorrecta." });
  }

  if (!requirePos(req, res)) return; // ya respondió 401/500

  const getFn = ROUTES[`${r}:${req.method}`];
  if (!getFn) return res.status(404).json({ error: `Recurso no encontrado: ${r}` });

  try {
    const fn = getFn();
    await fn(req, res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: "Error interno." });
  }
};
