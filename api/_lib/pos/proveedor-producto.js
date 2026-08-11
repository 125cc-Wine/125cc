// api/_lib/pos/proveedor-producto.js — precio de compra de un producto
// a un proveedor puntual, y aplicar ese precio como el costo actual del
// producto (el punto concreto de la auditoría: "actualizar costos
// cuando cambia un proveedor").
//
// Convención de unidades (auditoría v2, A2): precio_compra es SIEMPRE
// por unidad de COMPRA (la botella). productos.costo es SIEMPRE por
// unidad de VENTA (la copa, si el producto se vende por copa) — ver el
// comentario de aplicarCosto() más abajo.
const { sql } = require('../db');

async function listProveedorProductos(req, res) {
  const proveedorId = req.query.proveedor_id;
  if (!proveedorId) return res.status(400).json({ error: "Falta proveedor_id." });
  const { rows } = await sql`
    SELECT pp.id, pp.producto_id, p.nombre AS producto_nombre, p.costo AS costo_actual,
           pp.precio_compra, pp.actualizado_at
    FROM proveedor_productos pp
    JOIN productos p ON p.id = pp.producto_id
    WHERE pp.proveedor_id = ${proveedorId}
    ORDER BY p.nombre`;
  return res.status(200).json({ items: rows });
}

async function upsertProveedorProducto(req, res) {
  const { proveedor_id, producto_id, precio_compra } = req.body || {};
  if (!proveedor_id || !producto_id) return res.status(400).json({ error: "Falta proveedor_id o producto_id." });
  const precio = Number(precio_compra);
  if (!Number.isFinite(precio) || precio < 0) return res.status(400).json({ error: "Precio de compra inválido." });

  const { rows } = await sql`
    INSERT INTO proveedor_productos (proveedor_id, producto_id, precio_compra)
    VALUES (${proveedor_id}, ${producto_id}, ${precio})
    ON CONFLICT (proveedor_id, producto_id)
    DO UPDATE SET precio_compra=${precio}, actualizado_at=now()
    RETURNING id, proveedor_id, producto_id, precio_compra`;
  return res.status(200).json({ item: rows[0] });
}

// Copia proveedor_productos.precio_compra → productos.costo. Si el nuevo
// costo deja el producto con margen bajo/negativo, lo informa en la
// respuesta (no bloquea — el frontend decide si confirma antes de llamar
// esto, reusando confirmDialog + la misma lógica de productos-alertas.js).
//
// Convención de unidades (auditoría v2, A2): precio_compra SIEMPRE está en
// la unidad de COMPRA (la botella). productos.costo está en la unidad de
// VENTA — reportes.js/estado-resultados.js ya asumen esto (multiplican
// cantidad-en-copas por costo). Si el producto se vende por copa, el costo
// de la copa es el de la botella dividido por copas_por_botella; antes acá
// se copiaba el precio de la botella tal cual, inflando x6 el costo
// variable de reportes y disparando alertas de margen negativo en todo el
// catálogo por copa.
async function aplicarCosto(req, res) {
  const { proveedor_id, producto_id } = req.body || {};
  if (!proveedor_id || !producto_id) return res.status(400).json({ error: "Falta proveedor_id o producto_id." });

  const { rows: ppRows } = await sql`
    SELECT pp.precio_compra, p.unidad_venta, p.copas_por_botella
    FROM proveedor_productos pp JOIN productos p ON p.id = pp.producto_id
    WHERE pp.proveedor_id=${proveedor_id} AND pp.producto_id=${producto_id}`;
  if (!ppRows.length) return res.status(404).json({ error: "No hay precio cargado para ese proveedor/producto." });
  const { precio_compra, unidad_venta, copas_por_botella } = ppRows[0];
  const divisor = unidad_venta === 'copa' ? Number(copas_por_botella || 6) : 1;
  const nuevoCosto = Number(precio_compra) / divisor;

  const { rows } = await sql`
    UPDATE productos SET costo=${nuevoCosto}, updated_at=now()
    WHERE id=${producto_id}
    RETURNING id, nombre, precio, costo`;
  if (!rows.length) return res.status(404).json({ error: "Producto no encontrado." });

  const p = rows[0];
  const margenPct = Number(p.precio) > 0 ? ((Number(p.precio) - Number(p.costo)) / Number(p.precio)) * 100 : null;
  return res.status(200).json({ producto: p, margen_pct: margenPct != null ? Math.round(margenPct * 10) / 10 : null });
}

module.exports = { listProveedorProductos, upsertProveedorProducto, aplicarCosto };
