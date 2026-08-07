// api/_lib/pos/mesa-estado.js — override manual del estado de una mesa
// (ej: destrabar una mesa que quedó "ocupada" sin comanda por un error).
const { sql } = require('../db');

const ESTADOS = ['libre', 'ocupada', 'cuenta_pedida'];

async function setMesaEstado(req, res) {
  const { id, estado } = req.body || {};
  if (!id || !ESTADOS.includes(estado)) {
    return res.status(400).json({ error: "Falta id o estado inválido." });
  }
  const { rows } = await sql`
    UPDATE mesas SET estado = ${estado}, updated_at = now()
    WHERE id = ${id} RETURNING id, nombre, estado`;
  if (!rows.length) return res.status(404).json({ error: "Mesa no encontrada." });
  return res.status(200).json({ mesa: rows[0] });
}

module.exports = { setMesaEstado };
