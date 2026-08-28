// api/_lib/pos/proveedor-producto.js — precio de compra de un producto O
// UN INSUMO a un proveedor puntual, y aplicar ese precio como el costo
// actual (el punto concreto de la auditoría: "actualizar costos cuando
// cambia un proveedor").
//
// Costeo de insumos (handoff/ANALISIS-COSTEO-INSUMOS.md), Tier 2,
// hallazgo 5: el schema (proveedor_productos.insumo_id, con su índice
// único parcial) y hasta el comentario de FASE 4 en schema.sql ya
// anticipaban esto — lo que faltaba era exponerlo acá y en la UI. Cada
// fila de proveedor_productos referencia UN producto O UN insumo, nunca
// los dos (mismo criterio que num_nonnulls en stock_movimientos, acá sin
// CHECK explícito porque ya lo resuelve el índice único parcial).
//
// Convención de unidades (auditoría v2, A2 — y su equivalente para
// insumos): precio_compra es SIEMPRE por unidad de COMPRA. productos.costo
// es por unidad de VENTA (la copa, si se vende por copa) — ver
// aplicarCosto(). insumos.costo_unitario, en cambio, es SIEMPRE por unidad
// de COMPRA también (ver insumos.js) — copiar precio_compra ahí es 1:1,
// sin dividir por nada; el factor_receta de un insumo entra recién al
// calcular el costo de una RECETA (receta.js), no acá.
const { sql } = require('../db');

async function listProveedorProductos(req, res) {
  const proveedorId = req.query.proveedor_id;
  if (!proveedorId) return res.status(400).json({ error: "Falta proveedor_id." });
  const { rows } = await sql`
    SELECT pp.id, pp.producto_id, pp.insumo_id, p.nombre AS producto_nombre, p.costo AS costo_actual,
           NULL AS insumo_nombre, NULL::numeric AS insumo_costo_actual,
           'producto' AS tipo, pp.precio_compra, pp.actualizado_at
    FROM proveedor_productos pp
    JOIN productos p ON p.id = pp.producto_id
    WHERE pp.proveedor_id = ${proveedorId} AND pp.producto_id IS NOT NULL
    UNION ALL
    SELECT pp.id, NULL, pp.insumo_id, NULL,
           NULL, i.nombre, i.costo_unitario,
           'insumo', pp.precio_compra, pp.actualizado_at
    FROM proveedor_productos pp
    JOIN insumos i ON i.id = pp.insumo_id
    WHERE pp.proveedor_id = ${proveedorId} AND pp.insumo_id IS NOT NULL
    ORDER BY tipo, 1`;
  return res.status(200).json({ items: rows });
}

async function upsertProveedorProducto(req, res) {
  const { proveedor_id, producto_id, insumo_id, precio_compra } = req.body || {};
  if (!proveedor_id || (!producto_id && !insumo_id) || (producto_id && insumo_id)) {
    return res.status(400).json({ error: "Falta proveedor_id y exactamente uno de producto_id/insumo_id." });
  }
  const precio = Number(precio_compra);
  if (!Number.isFinite(precio) || precio < 0) return res.status(400).json({ error: "Precio de compra inválido." });

  if (insumo_id) {
    const { rows } = await sql`
      INSERT INTO proveedor_productos (proveedor_id, insumo_id, precio_compra)
      VALUES (${proveedor_id}, ${insumo_id}, ${precio})
      ON CONFLICT (proveedor_id, insumo_id) WHERE insumo_id IS NOT NULL
      DO UPDATE SET precio_compra=${precio}, actualizado_at=now()
      RETURNING id, proveedor_id, insumo_id, precio_compra`;
    return res.status(200).json({ item: rows[0] });
  }
  const { rows } = await sql`
    INSERT INTO proveedor_productos (proveedor_id, producto_id, precio_compra)
    VALUES (${proveedor_id}, ${producto_id}, ${precio})
    ON CONFLICT (proveedor_id, producto_id)
    DO UPDATE SET precio_compra=${precio}, actualizado_at=now()
    RETURNING id, proveedor_id, producto_id, precio_compra`;
  return res.status(200).json({ item: rows[0] });
}

// Copia proveedor_productos.precio_compra → productos.costo (o
// insumos.costo_unitario). Si el nuevo costo deja el producto con margen
// bajo/negativo, lo informa en la respuesta (no bloquea — el frontend
// decide si confirma antes de llamar esto, reusando confirmDialog + la
// misma lógica de productos-alertas.js).
//
// Convención de unidades (auditoría v2, A2): precio_compra SIEMPRE está en
// la unidad de COMPRA (la botella). productos.costo está en la unidad de
// VENTA — reportes.js/estado-resultados.js ya asumen esto (multiplican
// cantidad-en-copas por costo). Si el producto se vende por copa, el costo
// de la copa es el de la botella dividido por copas_por_botella; antes acá
// se copiaba el precio de la botella tal cual, inflando x6 el costo
// variable de reportes y disparando alertas de margen negativo en todo el
// catálogo por copa. Para un INSUMO no hace falta dividir nada — su
// costo_unitario también es por unidad de compra, precio_compra se copia
// tal cual (ver comentario de arriba del archivo).
async function aplicarCosto(req, res) {
  const { proveedor_id, producto_id, insumo_id } = req.body || {};
  if (!proveedor_id || (!producto_id && !insumo_id)) {
    return res.status(400).json({ error: "Falta proveedor_id y producto_id o insumo_id." });
  }

  if (insumo_id) {
    const { rows: ppRows } = await sql`
      SELECT precio_compra FROM proveedor_productos
      WHERE proveedor_id=${proveedor_id} AND insumo_id=${insumo_id}`;
    if (!ppRows.length) return res.status(404).json({ error: "No hay precio cargado para ese proveedor/insumo." });

    const { rows } = await sql`
      UPDATE insumos SET costo_unitario=${ppRows[0].precio_compra}, updated_at=now()
      WHERE id=${insumo_id}
      RETURNING id, nombre, unidad, costo_unitario`;
    if (!rows.length) return res.status(404).json({ error: "Insumo no encontrado." });
    return res.status(200).json({ insumo: rows[0] });
  }

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
