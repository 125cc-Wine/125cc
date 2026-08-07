// api/_lib/pos/proveedor-producto.js — precio de compra de un producto
// a un proveedor puntual, y aplicar ese precio como el costo actual del
// producto (el punto concreto de la auditoría: "actualizar costos
// cuando cambia un proveedor").
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
async function aplicarCosto(req, res) {
  const { proveedor_id, producto_id } = req.body || {};
  if (!proveedor_id || !producto_id) return res.status(400).json({ error: "Falta proveedor_id o producto_id." });

  const { rows: ppRows } = await sql`
    SELECT precio_compra FROM proveedor_productos WHERE proveedor_id=${proveedor_id} AND producto_id=${producto_id}`;
  if (!ppRows.length) return res.status(404).json({ error: "No hay precio cargado para ese proveedor/producto." });
  const nuevoCosto = ppRows[0].precio_compra;

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
