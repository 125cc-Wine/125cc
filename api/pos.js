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
// require() perezoso (detectado en auditoría, hallazgo 3.1): antes los
// ~28 módulos de _lib/pos se importaban todos al tope del archivo, así
// que CUALQUIER llamada —listar mesas incluida— cargaba en frío
// node-forge, el cliente de AFIP y todo el resto, sin usarlos. ROUTES
// ahora mapea a [ruta-del-módulo, nombreDeExport] en vez de a la
// función ya importada; el dispatch hace el require recién cuando esa
// ruta puntual se llama. require() de Node cachea el módulo después de
// la primera carga, así que dentro de una misma instancia tibia no se
// re-lee del disco — el costo real es solo por ruta usada, una vez.
const { requirePos } = require('./_lib/require-pos');

const ROUTES = {
  'mesas:GET': ['./_lib/pos/mesas', 'listMesas'],
  'mesas:POST': ['./_lib/pos/mesas', 'upsertMesa'],
  'mesas-pos:POST': ['./_lib/pos/mesas', 'saveMesasPos'],
  'mesa-eliminar:POST': ['./_lib/pos/mesas', 'eliminarMesa'],
  'mesa-estado:POST': ['./_lib/pos/mesa-estado', 'setMesaEstado'],
  'productos:GET': ['./_lib/pos/productos', 'listProductos'],
  'productos:POST': ['./_lib/pos/productos', 'upsertProducto'],
  'productos-import:POST': ['./_lib/pos/productos-import', 'importVinos'],
  'comandas:GET': ['./_lib/pos/comandas', 'listComandas'],
  'comandas:POST': ['./_lib/pos/comandas', 'abrirComanda'],
  'comanda:GET': ['./_lib/pos/comanda', 'getComanda'],
  'comanda-item:POST': ['./_lib/pos/comanda-item', 'comandaItem'],
  'comanda-cerrar:POST': ['./_lib/pos/comanda-cerrar', 'cerrarComanda'],
  'comanda-anular:POST': ['./_lib/pos/comanda-anular', 'anularComanda'],
  'comanda-trasladar:POST': ['./_lib/pos/comanda-trasladar', 'trasladarComanda'],
  'comanda-descuento:POST': ['./_lib/pos/comanda-descuento', 'setDescuento'],
  'caja:GET': ['./_lib/pos/caja', 'getCaja'],
  'caja:POST': ['./_lib/pos/caja', 'abrirCaja'],
  'caja-movimiento:POST': ['./_lib/pos/caja-movimiento', 'registrarMovimiento'],
  'caja-cerrar:POST': ['./_lib/pos/caja-cerrar', 'cerrarCaja'],
  'reportes:GET': ['./_lib/pos/reportes', 'getReportes'],
  'productos-alertas:GET': ['./_lib/pos/productos-alertas', 'getAlertasMargen'],
  'pos-config:GET': ['./_lib/pos/productos-alertas', 'getConfig'],
  'pos-config:POST': ['./_lib/pos/productos-alertas', 'setConfig'],
  'proveedores:GET': ['./_lib/pos/proveedores', 'listProveedores'],
  'proveedores:POST': ['./_lib/pos/proveedores', 'upsertProveedor'],
  'proveedor-producto:GET': ['./_lib/pos/proveedor-producto', 'listProveedorProductos'],
  'proveedor-producto:POST': ['./_lib/pos/proveedor-producto', 'upsertProveedorProducto'],
  'proveedor-aplicar-costo:POST': ['./_lib/pos/proveedor-producto', 'aplicarCosto'],
  'stock-merma:POST': ['./_lib/pos/stock-movimiento', 'registrarMerma'],
  'stock-conteo:POST': ['./_lib/pos/stock-movimiento', 'registrarConteo'],
  'stock-movimientos:GET': ['./_lib/pos/stock-movimiento', 'listMovimientos'],
  'insumos:GET': ['./_lib/pos/insumos', 'listInsumos'],
  'insumos:POST': ['./_lib/pos/insumos', 'upsertInsumo'],
  'receta:GET': ['./_lib/pos/receta', 'getReceta'],
  'receta-item:POST': ['./_lib/pos/receta', 'upsertRecetaItem'],
  'receta-recalcular-costo:POST': ['./_lib/pos/receta', 'recalcularCostoReceta'],
  'costos-fijos:GET': ['./_lib/pos/costos-fijos', 'listCostosFijos'],
  'costos-fijos:POST': ['./_lib/pos/costos-fijos', 'upsertCostoFijo'],
  'gastos:GET': ['./_lib/pos/gastos', 'listGastos'],
  'gastos:POST': ['./_lib/pos/gastos', 'upsertGasto'],
  'estado-resultados:GET': ['./_lib/pos/estado-resultados', 'getEstadoResultados'],
  'clientes:GET': ['./_lib/pos/clientes', 'listClientes'],
  'clientes:POST': ['./_lib/pos/clientes', 'upsertCliente'],
  'cliente:GET': ['./_lib/pos/cliente', 'getCliente'],
  'comanda-cliente:POST': ['./_lib/pos/comanda-cliente', 'setComandaCliente'],
  'clientes-frecuentes:GET': ['./_lib/pos/clientes-frecuentes', 'getClientesFrecuentes'],
  'clientes-segmento:GET': ['./_lib/pos/clientes-segmento', 'getClientesSegmento'],
  'comprobante-emitir:POST': ['./_lib/pos/comprobantes', 'emitirComprobante'],
  'comprobantes:GET': ['./_lib/pos/comprobantes', 'listComprobantes'],
  'comprobante-reintentar:POST': ['./_lib/pos/comprobantes', 'reintentarComprobante'],
  'cuenta-corriente:GET': ['./_lib/pos/cuenta-corriente', 'getCuentaCorriente'],
  'cuenta-corriente-pago:POST': ['./_lib/pos/cuenta-corriente', 'registrarPago'],
};

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  const r = req.query.r;

  // Login: no pasa por requirePos porque ES el chequeo de auth.
  // timing-safe se carga acá adentro (perezoso también), no hace falta
  // en ninguna otra ruta.
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

  const routeInfo = ROUTES[`${r}:${req.method}`];
  if (!routeInfo) return res.status(404).json({ error: `Recurso no encontrado: ${r}` });

  try {
    const [modulePath, fnName] = routeInfo;
    const fn = require(modulePath)[fnName];
    await fn(req, res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: "Error interno." });
  }
};
