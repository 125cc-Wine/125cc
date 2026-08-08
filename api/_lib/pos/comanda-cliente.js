// api/_lib/pos/comanda-cliente.js — asocia (o quita, cliente_id null)
// un cliente a una comanda. Pensado para usarse al abrir la mesa —
// feedback real del dueño: "cargar el cliente al abrir mesa sería
// ideal" — pero funciona en cualquier momento de la comanda y nunca
// bloquea cobrar sin cliente asociado.
const { sql } = require('../db');

async function setComandaCliente(req, res) {
  const { comanda_id, cliente_id } = req.body || {};
  if (!comanda_id) return res.status(400).json({ error: "Falta comanda_id." });
  const { rows } = await sql`
    UPDATE comandas SET cliente_id=${cliente_id || null}
    WHERE id=${comanda_id}
    RETURNING id, cliente_id`;
  if (!rows.length) return res.status(404).json({ error: "Comanda no encontrada." });
  return res.status(200).json({ comanda: rows[0] });
}

module.exports = { setComandaCliente };
