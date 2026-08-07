// api/pos-comanda-item.js — agregar un ítem a una comanda abierta, o anularlo.
// Fase 1: inserta con precio/nombre "congelados" al momento de la venta,
// sin tocar stock todavía (eso se cablea en Fase 2, en una transacción
// que combine el UPDATE de productos.stock_actual con este INSERT).
const { sql } = require('./_lib/db');
const { posHandler } = require('./_lib/pos-handler');

module.exports = posHandler(['POST'], async (req, res) => {
  const { comanda_id, accion } = req.body || {};
  if (!comanda_id) return res.status(400).json({ error: "Falta comanda_id." });

  if (accion === 'anular') {
    const { item_id } = req.body || {};
    if (!item_id) return res.status(400).json({ error: "Falta item_id." });
    const { rows } = await sql`
      UPDATE comanda_items SET estado='anulado'
      WHERE id=${item_id} AND comanda_id=${comanda_id} AND estado='activo'
      RETURNING id`;
    if (!rows.length) return res.status(404).json({ error: "Ítem no encontrado o ya anulado." });
    return res.status(200).json({ ok: true });
  }

  // agregar ítem
  const { producto_id, cantidad } = req.body || {};
  const cant = Number(cantidad) || 1;
  if (!producto_id || !Number.isFinite(cant) || cant <= 0 || cant > 50) {
    return res.status(400).json({ error: "producto_id/cantidad inválidos." });
  }

  const { rows: comandaRows } = await sql`SELECT estado FROM comandas WHERE id=${comanda_id}`;
  if (!comandaRows.length) return res.status(404).json({ error: "Comanda no encontrada." });
  if (comandaRows[0].estado !== 'abierta') {
    return res.status(409).json({ error: "La comanda no está abierta." });
  }

  const { rows: prodRows } = await sql`SELECT nombre, precio FROM productos WHERE id=${producto_id}`;
  if (!prodRows.length) return res.status(404).json({ error: "Producto no encontrado." });
  const producto = prodRows[0];

  const { rows } = await sql`
    INSERT INTO comanda_items (comanda_id, producto_id, nombre_snapshot, precio_unitario, cantidad)
    VALUES (${comanda_id}, ${producto_id}, ${producto.nombre}, ${producto.precio}, ${cant})
    RETURNING id, producto_id, nombre_snapshot, precio_unitario, cantidad, estado`;
  return res.status(201).json({ item: rows[0] });
});
