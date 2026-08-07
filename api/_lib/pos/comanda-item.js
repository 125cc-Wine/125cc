// api/_lib/pos/comanda-item.js — agregar/restar/anular un ítem de una
// comanda abierta. Cada producto ocupa una sola línea mientras esté
// activo: agregar el mismo producto de nuevo suma a esa línea (stepper
// +/− en la UI) en vez de crear filas duplicadas. Precio/nombre quedan
// "congelados" al momento de la primera venta de esa línea.
// Fase 1: no toca stock todavía (eso se cablea en Fase 2, en una
// transacción que combine el UPDATE de productos.stock_actual con esto).
const { sql } = require('../db');

async function comandaItem(req, res) {
  const { comanda_id, accion } = req.body || {};
  if (!comanda_id) return res.status(400).json({ error: "Falta comanda_id." });

  const { rows: comandaRows } = await sql`SELECT estado FROM comandas WHERE id=${comanda_id}`;
  if (!comandaRows.length) return res.status(404).json({ error: "Comanda no encontrada." });
  if (comandaRows[0].estado !== 'abierta') {
    return res.status(409).json({ error: "La comanda no está abierta." });
  }

  // Anular: saca la línea entera, sin importar la cantidad (botón ✕).
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

  // Restar 1 unidad (botón −); si llega a 0, anula la línea.
  if (accion === 'restar') {
    const { item_id } = req.body || {};
    if (!item_id) return res.status(400).json({ error: "Falta item_id." });
    const { rows: itemRows } = await sql`
      SELECT cantidad FROM comanda_items WHERE id=${item_id} AND comanda_id=${comanda_id} AND estado='activo'`;
    if (!itemRows.length) return res.status(404).json({ error: "Ítem no encontrado." });
    const nuevaCant = itemRows[0].cantidad - 1;
    if (nuevaCant <= 0) {
      await sql`UPDATE comanda_items SET estado='anulado' WHERE id=${item_id}`;
    } else {
      await sql`UPDATE comanda_items SET cantidad=${nuevaCant} WHERE id=${item_id}`;
    }
    return res.status(200).json({ ok: true });
  }

  // Agregar 1 unidad (botón + / tocar un producto del picker): suma a la
  // línea activa de ese producto si ya existe, si no crea una nueva.
  const { producto_id } = req.body || {};
  if (!producto_id) return res.status(400).json({ error: "Falta producto_id." });

  const { rows: existentes } = await sql`
    SELECT id, cantidad FROM comanda_items
    WHERE comanda_id=${comanda_id} AND producto_id=${producto_id} AND estado='activo'`;

  if (existentes.length) {
    const { rows } = await sql`
      UPDATE comanda_items SET cantidad = cantidad + 1
      WHERE id=${existentes[0].id}
      RETURNING id, producto_id, nombre_snapshot, precio_unitario, cantidad, estado`;
    return res.status(200).json({ item: rows[0] });
  }

  const { rows: prodRows } = await sql`SELECT nombre, precio FROM productos WHERE id=${producto_id}`;
  if (!prodRows.length) return res.status(404).json({ error: "Producto no encontrado." });
  const producto = prodRows[0];

  const { rows } = await sql`
    INSERT INTO comanda_items (comanda_id, producto_id, nombre_snapshot, precio_unitario, cantidad)
    VALUES (${comanda_id}, ${producto_id}, ${producto.nombre}, ${producto.precio}, 1)
    RETURNING id, producto_id, nombre_snapshot, precio_unitario, cantidad, estado`;
  return res.status(201).json({ item: rows[0] });
}

module.exports = { comandaItem };
