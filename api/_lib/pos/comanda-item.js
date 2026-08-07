// api/_lib/pos/comanda-item.js — agregar/restar/anular un ítem de una
// comanda abierta. Cada producto ocupa una sola línea mientras esté
// activo: agregar el mismo producto de nuevo suma a esa línea (stepper
// +/− en la UI) en vez de crear filas duplicadas. Precio/nombre quedan
// "congelados" al momento de la primera venta de esa línea.
//
// Stock (Fase 2): si el producto trackea stock (stock_actual no nulo),
// cada +1/−1 de línea descuenta/restaura stock_actual en la MISMA
// transacción que el cambio de comanda_items, con SELECT ... FOR UPDATE
// para que dos mozos no puedan vender la última unidad a la vez. Sin
// stock disponible devuelve 409 (advisory, no bloqueo duro — el body
// {forzar:true} permite cargar igual, por si se abrió una botella nueva
// que todavía no se registró).
const { sql, withTransaction } = require('../db');

async function comandaItem(req, res) {
  const { comanda_id, accion } = req.body || {};
  if (!comanda_id) return res.status(400).json({ error: "Falta comanda_id." });

  const { rows: comandaRows } = await sql`SELECT estado FROM comandas WHERE id=${comanda_id}`;
  if (!comandaRows.length) return res.status(404).json({ error: "Comanda no encontrada." });
  if (comandaRows[0].estado !== 'abierta') {
    return res.status(409).json({ error: "La comanda no está abierta." });
  }

  // Anular: saca la línea entera y restaura todo el stock de esa línea.
  if (accion === 'anular') {
    const { item_id } = req.body || {};
    if (!item_id) return res.status(400).json({ error: "Falta item_id." });
    try {
      await withTransaction(async (client) => {
        const { rows } = await client.sql`
          UPDATE comanda_items SET estado='anulado'
          WHERE id=${item_id} AND comanda_id=${comanda_id} AND estado='activo'
          RETURNING id, producto_id, cantidad`;
        if (!rows.length) throw Object.assign(new Error('no_item'), { code: 'no_item' });
        await client.sql`
          UPDATE productos SET stock_actual = stock_actual + ${rows[0].cantidad}
          WHERE id=${rows[0].producto_id} AND stock_actual IS NOT NULL`;
      });
      return res.status(200).json({ ok: true });
    } catch (err) {
      if (err.code === 'no_item') return res.status(404).json({ error: "Ítem no encontrado o ya anulado." });
      throw err;
    }
  }

  // Restar 1 unidad (botón −); si llega a 0, anula la línea. Restaura 1
  // unidad de stock.
  if (accion === 'restar') {
    const { item_id } = req.body || {};
    if (!item_id) return res.status(400).json({ error: "Falta item_id." });
    try {
      await withTransaction(async (client) => {
        const { rows: itemRows } = await client.sql`
          SELECT cantidad, producto_id FROM comanda_items
          WHERE id=${item_id} AND comanda_id=${comanda_id} AND estado='activo' FOR UPDATE`;
        if (!itemRows.length) throw Object.assign(new Error('no_item'), { code: 'no_item' });
        const nuevaCant = itemRows[0].cantidad - 1;
        if (nuevaCant <= 0) {
          await client.sql`UPDATE comanda_items SET estado='anulado' WHERE id=${item_id}`;
        } else {
          await client.sql`UPDATE comanda_items SET cantidad=${nuevaCant} WHERE id=${item_id}`;
        }
        await client.sql`
          UPDATE productos SET stock_actual = stock_actual + 1
          WHERE id=${itemRows[0].producto_id} AND stock_actual IS NOT NULL`;
      });
      return res.status(200).json({ ok: true });
    } catch (err) {
      if (err.code === 'no_item') return res.status(404).json({ error: "Ítem no encontrado." });
      throw err;
    }
  }

  // Agregar 1 unidad (botón + / tocar un producto del picker): descuenta
  // stock si corresponde, y suma a la línea activa de ese producto si ya
  // existe, si no crea una nueva.
  const { producto_id, forzar } = req.body || {};
  if (!producto_id) return res.status(400).json({ error: "Falta producto_id." });

  try {
    const item = await withTransaction(async (client) => {
      const { rows: prodRows } = await client.sql`
        SELECT nombre, precio, stock_actual FROM productos WHERE id=${producto_id} FOR UPDATE`;
      if (!prodRows.length) throw Object.assign(new Error('no_producto'), { code: 'no_producto' });
      const producto = prodRows[0];

      if (producto.stock_actual != null) {
        if (producto.stock_actual < 1 && !forzar) {
          throw Object.assign(new Error('sin_stock'), { code: 'sin_stock', disponible: producto.stock_actual });
        }
        await client.sql`UPDATE productos SET stock_actual = stock_actual - 1 WHERE id=${producto_id}`;
      }

      const { rows: existentes } = await client.sql`
        SELECT id, cantidad FROM comanda_items
        WHERE comanda_id=${comanda_id} AND producto_id=${producto_id} AND estado='activo'`;

      if (existentes.length) {
        const { rows } = await client.sql`
          UPDATE comanda_items SET cantidad = cantidad + 1
          WHERE id=${existentes[0].id}
          RETURNING id, producto_id, nombre_snapshot, precio_unitario, cantidad, estado`;
        return rows[0];
      }
      const { rows } = await client.sql`
        INSERT INTO comanda_items (comanda_id, producto_id, nombre_snapshot, precio_unitario, cantidad)
        VALUES (${comanda_id}, ${producto_id}, ${producto.nombre}, ${producto.precio}, 1)
        RETURNING id, producto_id, nombre_snapshot, precio_unitario, cantidad, estado`;
      return rows[0];
    });
    return res.status(201).json({ item });
  } catch (err) {
    if (err.code === 'no_producto') return res.status(404).json({ error: "Producto no encontrado." });
    if (err.code === 'sin_stock') {
      return res.status(409).json({ error: "Sin stock disponible.", disponible: err.disponible });
    }
    throw err;
  }
}

module.exports = { comandaItem };
