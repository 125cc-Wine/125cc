// api/pos-mesas.js — listar mesas (con su comanda abierta, si tiene) / crear-editar mesa.
const { sql } = require('./_lib/db');
const { posHandler } = require('./_lib/pos-handler');

module.exports = posHandler(['GET', 'POST'], async (req, res) => {
  if (req.method === 'GET') {
    const { rows } = await sql`
      SELECT m.id, m.nombre, m.capacidad, m.estado, c.id AS comanda_id
      FROM mesas m
      LEFT JOIN comandas c ON c.mesa_id = m.id AND c.estado = 'abierta'
      ORDER BY m.id`;
    return res.status(200).json({ mesas: rows });
  }

  // POST: crear o editar mesa
  const { id, nombre, capacidad } = req.body || {};
  if (!nombre || typeof nombre !== 'string' || nombre.length > 60) {
    return res.status(400).json({ error: "Falta nombre válido." });
  }
  const cap = capacidad != null && capacidad !== '' ? Number(capacidad) : null;
  if (cap != null && (!Number.isFinite(cap) || cap < 0 || cap > 200)) {
    return res.status(400).json({ error: "Capacidad inválida." });
  }

  if (id) {
    const { rows } = await sql`
      UPDATE mesas SET nombre = ${nombre}, capacidad = ${cap}, updated_at = now()
      WHERE id = ${id} RETURNING id, nombre, capacidad, estado`;
    if (!rows.length) return res.status(404).json({ error: "Mesa no encontrada." });
    return res.status(200).json({ mesa: rows[0] });
  }
  const { rows } = await sql`
    INSERT INTO mesas (nombre, capacidad) VALUES (${nombre}, ${cap})
    RETURNING id, nombre, capacidad, estado`;
  return res.status(201).json({ mesa: rows[0] });
});
