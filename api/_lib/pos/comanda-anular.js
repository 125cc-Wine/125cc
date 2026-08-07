// api/_lib/pos/comanda-anular.js — cerrar una mesa/comanda SIN cobrar
// (se abrió por error, el cliente se fue sin pedir nada, etc.). Distinto
// de comanda-cerrar.js: no exige caja abierta, no escribe ningún
// movimiento de venta, y restaura el stock de los ítems que hubiera
// activos (se cancelan, no se vendieron). La mesa vuelve a libre.
const { withTransaction } = require('../db');

async function anularComanda(req, res) {
  const { comanda_id } = req.body || {};
  if (!comanda_id) return res.status(400).json({ error: "Falta comanda_id." });

  try {
    const comanda = await withTransaction(async (client) => {
      const { rows: comandaRows } = await client.sql`
        SELECT id, mesa_id, estado FROM comandas WHERE id=${comanda_id} FOR UPDATE`;
      if (!comandaRows.length) throw Object.assign(new Error('no_comanda'), { code: 'no_comanda' });
      if (comandaRows[0].estado !== 'abierta') {
        throw Object.assign(new Error('no_abierta'), { code: 'no_abierta' });
      }

      const { rows: items } = await client.sql`
        SELECT id, producto_id, cantidad FROM comanda_items
        WHERE comanda_id=${comanda_id} AND estado='activo'`;
      for (const it of items) {
        await client.sql`
          UPDATE productos SET stock_actual = stock_actual + ${it.cantidad}
          WHERE id=${it.producto_id} AND stock_actual IS NOT NULL`;
      }
      await client.sql`
        UPDATE comanda_items SET estado='anulado'
        WHERE comanda_id=${comanda_id} AND estado='activo'`;

      const { rows } = await client.sql`
        UPDATE comandas SET estado='anulada', cerrada_at=now()
        WHERE id=${comanda_id}
        RETURNING id, mesa_id, estado`;

      if (comandaRows[0].mesa_id) {
        await client.sql`UPDATE mesas SET estado='libre', updated_at=now() WHERE id=${comandaRows[0].mesa_id}`;
      }
      return rows[0];
    });
    return res.status(200).json({ comanda });
  } catch (err) {
    if (err.code === 'no_comanda') return res.status(404).json({ error: "Comanda no encontrada." });
    if (err.code === 'no_abierta') return res.status(409).json({ error: "La comanda ya está cerrada o anulada." });
    throw err;
  }
}

module.exports = { anularComanda };
