// api/pos-comandas.js — listar comandas (?estado=abierta para la vista de piso)
// / abrir una comanda nueva (mesa o takeaway).
const { sql, withTransaction } = require('./_lib/db');
const { posHandler } = require('./_lib/pos-handler');

module.exports = posHandler(['GET', 'POST'], async (req, res) => {
  if (req.method === 'GET') {
    const estado = req.query.estado;
    const { rows } = estado
      ? await sql`
          SELECT c.id, c.mesa_id, m.nombre AS mesa_nombre, c.estado, c.atendido_por,
                 c.medio_pago, c.total, c.abierta_at
          FROM comandas c LEFT JOIN mesas m ON m.id = c.mesa_id
          WHERE c.estado = ${estado} ORDER BY c.abierta_at DESC`
      : await sql`
          SELECT c.id, c.mesa_id, m.nombre AS mesa_nombre, c.estado, c.atendido_por,
                 c.medio_pago, c.total, c.abierta_at
          FROM comandas c LEFT JOIN mesas m ON m.id = c.mesa_id
          ORDER BY c.abierta_at DESC LIMIT 100`;
    return res.status(200).json({ comandas: rows });
  }

  // POST: abrir comanda — mesa_id nulo = takeaway/barra suelta
  const { mesa_id, atendido_por } = req.body || {};
  const atendido = atendido_por ? String(atendido_por).slice(0, 60) : null;
  const mesaId = mesa_id || null;

  try {
    const comanda = await withTransaction(async (client) => {
      const { rows } = await client.sql`
        INSERT INTO comandas (mesa_id, atendido_por) VALUES (${mesaId}, ${atendido})
        RETURNING id, mesa_id, estado, atendido_por, total, abierta_at`;
      if (mesaId) {
        await client.sql`UPDATE mesas SET estado='ocupada', updated_at=now() WHERE id=${mesaId}`;
      }
      return rows[0];
    });
    return res.status(201).json({ comanda });
  } catch (err) {
    // Viola one_open_comanda_per_mesa: ya hay una comanda abierta en esa mesa.
    if (String(err.message || '').includes('one_open_comanda_per_mesa')) {
      return res.status(409).json({ error: "Esa mesa ya tiene una comanda abierta." });
    }
    throw err;
  }
});
