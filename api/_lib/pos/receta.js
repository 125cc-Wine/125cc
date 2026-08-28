// api/_lib/pos/receta.js — receta_items de un producto compuesto (ej.
// futuro tapeo/plato) y recálculo de su costo a partir de insumos. Un
// vino (100% de los productos hoy) no usa nada de esto: sigue con
// productos.costo cargado a mano, costo_calculado queda en false. Sin
// UI todavía (Fase 4: solo backend).
const { sql } = require('../db');

async function getReceta(req, res) {
  const productoId = req.query.producto_id;
  if (!productoId) return res.status(400).json({ error: "Falta producto_id." });
  // costo_unitario es por unidad de COMPRA; ri.cantidad está en unidad de
  // RECETA — costo_receta_unitario (costo_unitario / factor_receta) es lo
  // que hay que multiplicar por ri.cantidad para el costo real de la
  // línea, ver comentario de insumos.js.
  const { rows } = await sql`
    SELECT ri.id, ri.insumo_id, i.nombre AS insumo_nombre, i.unidad, i.costo_unitario,
      i.factor_receta, i.costo_unitario / i.factor_receta AS costo_receta_unitario, ri.cantidad
    FROM receta_items ri
    JOIN insumos i ON i.id = ri.insumo_id
    WHERE ri.producto_id = ${productoId}
    ORDER BY i.nombre`;
  return res.status(200).json({ items: rows });
}

async function upsertRecetaItem(req, res) {
  const { id, producto_id, insumo_id, cantidad, accion } = req.body || {};

  if (accion === 'eliminar') {
    if (!id) return res.status(400).json({ error: "Falta id." });
    // Acotado a producto_id (auditoría v2, C1) — igual que la rama de
    // update de abajo, para no poder borrar por id un ítem de la
    // receta de OTRO producto. Riesgo real bajo (una sola contraseña
    // de local, sin roles), pero es gratis cerrarlo.
    if (!producto_id) return res.status(400).json({ error: "Falta producto_id." });
    const { rows } = await sql`DELETE FROM receta_items WHERE id=${id} AND producto_id=${producto_id} RETURNING id`;
    if (!rows.length) return res.status(404).json({ error: "Ítem de receta no encontrado." });
    return res.status(200).json({ ok: true });
  }

  if (!producto_id || !insumo_id) return res.status(400).json({ error: "Falta producto_id o insumo_id." });
  const cant = Number(cantidad);
  if (!Number.isFinite(cant) || cant <= 0) return res.status(400).json({ error: "Cantidad inválida." });

  if (id) {
    const { rows } = await sql`
      UPDATE receta_items SET cantidad=${cant}
      WHERE id=${id} AND producto_id=${producto_id}
      RETURNING id, producto_id, insumo_id, cantidad`;
    if (!rows.length) return res.status(404).json({ error: "Ítem de receta no encontrado." });
    return res.status(200).json({ item: rows[0] });
  }
  // ON CONFLICT (auditoría v2, C1): cargar el mismo insumo dos veces en
  // la misma receta suma sobre la línea existente en vez de duplicarla
  // — antes creaba una fila nueva y recalcularCostoReceta sumaba las
  // dos, inflando el costo calculado sin nada que lo señale.
  const { rows } = await sql`
    INSERT INTO receta_items (producto_id, insumo_id, cantidad)
    VALUES (${producto_id}, ${insumo_id}, ${cant})
    ON CONFLICT (producto_id, insumo_id) DO UPDATE SET cantidad = ${cant}
    RETURNING id, producto_id, insumo_id, cantidad`;
  return res.status(201).json({ item: rows[0] });
}

// Recalcula productos.costo = SUM(cantidad * costo_receta_unitario) de la
// receta y marca costo_calculado=true. Rechaza si falta algún insumo
// con costo_unitario cargado (no queremos un costo parcial silencioso).
// costo_receta_unitario = costo_unitario / factor_receta — costo_unitario
// es por unidad de COMPRA, ri.cantidad está en unidad de RECETA (ver
// insumos.js); sin dividir por factor_receta, un insumo con conversión
// (ej. se compra por kg, la receta pide gramos) infla el costo calculado
// hasta 1000x.
async function recalcularCostoReceta(req, res) {
  const productoId = req.query.producto_id || (req.body && req.body.producto_id);
  if (!productoId) return res.status(400).json({ error: "Falta producto_id." });

  const { rows } = await sql`
    SELECT
      SUM(ri.cantidad * i.costo_unitario / i.factor_receta) AS costo_total,
      COUNT(*) AS items,
      SUM(CASE WHEN i.costo_unitario IS NULL THEN 1 ELSE 0 END) AS insumos_sin_costo
    FROM receta_items ri
    JOIN insumos i ON i.id = ri.insumo_id
    WHERE ri.producto_id = ${productoId}`;
  const r = rows[0];
  if (!r.items || Number(r.items) === 0) return res.status(400).json({ error: "El producto no tiene receta cargada." });
  if (Number(r.insumos_sin_costo) > 0) {
    return res.status(400).json({
      error: `${r.insumos_sin_costo} insumo(s) de la receta no tienen costo cargado — no se puede calcular.`,
    });
  }

  const { rows: prodRows } = await sql`
    UPDATE productos SET costo=${r.costo_total}, costo_calculado=true, updated_at=now()
    WHERE id=${productoId}
    RETURNING id, nombre, precio, costo, costo_calculado`;
  if (!prodRows.length) return res.status(404).json({ error: "Producto no encontrado." });
  return res.status(200).json({ producto: prodRows[0] });
}

module.exports = { getReceta, upsertRecetaItem, recalcularCostoReceta };
