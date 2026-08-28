// api/_lib/pos/comanda.js — detalle de una comanda: cabecera + ítems (activos y anulados).
const { sql } = require('../db');

async function getComanda(req, res) {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: "Falta id." });

  const { rows: comandaRows } = await sql`
    SELECT c.id, c.mesa_id, m.nombre AS mesa_nombre, c.estado, c.atendido_por, c.comensales,
           c.medio_pago, c.total, c.descuento_tipo, c.descuento_valor,
           c.cliente_id, cl.nombre AS cliente_nombre, cl.cuenta_corriente_habilitada,
           c.notas, c.abierta_at, c.cerrada_at
    FROM comandas c
    LEFT JOIN mesas m ON m.id = c.mesa_id
    LEFT JOIN clientes cl ON cl.id = c.cliente_id
    WHERE c.id = ${id}`;
  if (!comandaRows.length) return res.status(404).json({ error: "Comanda no encontrada." });

  const { rows: items } = await sql`
    SELECT id, producto_id, nombre_snapshot, precio_unitario, cantidad, estado, estado_cocina, created_at
    FROM comanda_items WHERE comanda_id = ${id} ORDER BY created_at`;

  return res.status(200).json({ comanda: comandaRows[0], items });
}

module.exports = { getComanda };
