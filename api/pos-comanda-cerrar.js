// api/pos-comanda-cerrar.js — cobrar y cerrar una comanda: el total se
// calcula server-side desde los ítems activos (nunca se confía en un total
// mandado por el cliente), y la mesa vuelve a 'libre'. Desde la Fase 3
// esto también exige una caja abierta y escribe el movimiento correspondiente
// en la misma transacción.
const { withTransaction } = require('./_lib/db');
const { posHandler } = require('./_lib/pos-handler');

const MEDIOS = ['efectivo', 'tarjeta', 'transferencia', 'mixto'];

module.exports = posHandler(['POST'], async (req, res) => {
  const { comanda_id, medio_pago } = req.body || {};
  if (!comanda_id || !MEDIOS.includes(medio_pago)) {
    return res.status(400).json({ error: "Falta comanda_id o medio_pago inválido." });
  }

  try {
    const comanda = await withTransaction(async (client) => {
      const { rows: openRows } = await client.sql`
        SELECT id, mesa_id, estado FROM comandas WHERE id=${comanda_id} FOR UPDATE`;
      if (!openRows.length) throw Object.assign(new Error('not_found'), { code: 'not_found' });
      if (openRows[0].estado !== 'abierta') {
        throw Object.assign(new Error('not_open'), { code: 'not_open' });
      }

      const { rows: totalRows } = await client.sql`
        SELECT COALESCE(SUM(precio_unitario * cantidad), 0) AS total
        FROM comanda_items WHERE comanda_id=${comanda_id} AND estado='activo'`;
      const total = totalRows[0].total;

      const { rows } = await client.sql`
        UPDATE comandas SET estado='cerrada', medio_pago=${medio_pago}, total=${total}, cerrada_at=now()
        WHERE id=${comanda_id}
        RETURNING id, mesa_id, estado, medio_pago, total, cerrada_at`;

      if (openRows[0].mesa_id) {
        await client.sql`UPDATE mesas SET estado='libre', updated_at=now() WHERE id=${openRows[0].mesa_id}`;
      }
      return rows[0];
    });
    return res.status(200).json({ comanda });
  } catch (err) {
    if (err.code === 'not_found') return res.status(404).json({ error: "Comanda no encontrada." });
    if (err.code === 'not_open') return res.status(409).json({ error: "La comanda ya está cerrada o anulada." });
    throw err;
  }
});
