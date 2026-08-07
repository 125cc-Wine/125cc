// api/_lib/pos/comanda-trasladar.js — mover una comanda abierta a otra
// mesa (ej: el grupo se cambió de lugar). La mesa vieja vuelve a libre,
// la nueva pasa a ocupada, todo en una transacción.
const { withTransaction } = require('../db');

async function trasladarComanda(req, res) {
  const { comanda_id, mesa_id } = req.body || {};
  if (!comanda_id || !mesa_id) return res.status(400).json({ error: "Falta comanda_id o mesa_id." });

  try {
    const comanda = await withTransaction(async (client) => {
      const { rows: comandaRows } = await client.sql`
        SELECT id, mesa_id, estado FROM comandas WHERE id=${comanda_id} FOR UPDATE`;
      if (!comandaRows.length) throw Object.assign(new Error('no_comanda'), { code: 'no_comanda' });
      if (comandaRows[0].estado !== 'abierta') throw Object.assign(new Error('no_abierta'), { code: 'no_abierta' });
      const mesaVieja = comandaRows[0].mesa_id;
      if (mesaVieja === mesa_id) throw Object.assign(new Error('misma_mesa'), { code: 'misma_mesa' });

      const { rows: mesaNuevaRows } = await client.sql`SELECT id FROM mesas WHERE id=${mesa_id} FOR UPDATE`;
      if (!mesaNuevaRows.length) throw Object.assign(new Error('no_mesa'), { code: 'no_mesa' });

      const { rows } = await client.sql`
        UPDATE comandas SET mesa_id=${mesa_id} WHERE id=${comanda_id}
        RETURNING id, mesa_id`;

      await client.sql`UPDATE mesas SET estado='ocupada', updated_at=now() WHERE id=${mesa_id}`;
      if (mesaVieja) {
        await client.sql`UPDATE mesas SET estado='libre', updated_at=now() WHERE id=${mesaVieja}`;
      }
      return rows[0];
    });
    return res.status(200).json({ comanda });
  } catch (err) {
    if (err.code === 'no_comanda') return res.status(404).json({ error: "Comanda no encontrada." });
    if (err.code === 'no_abierta') return res.status(409).json({ error: "La comanda no está abierta." });
    if (err.code === 'no_mesa') return res.status(404).json({ error: "Mesa destino no encontrada." });
    if (err.code === 'misma_mesa') return res.status(400).json({ error: "Ya está en esa mesa." });
    if (String(err.message || '').includes('one_open_comanda_per_mesa')) {
      return res.status(409).json({ error: "La mesa destino ya tiene una comanda abierta." });
    }
    throw err;
  }
}

module.exports = { trasladarComanda };
