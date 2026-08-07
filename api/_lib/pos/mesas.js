// api/_lib/pos/mesas.js — listar mesas (con su comanda abierta, si tiene) / crear-editar mesa.
// Módulo de lógica pura: lo llama el router en api/pos.js, no es un
// endpoint de Vercel en sí mismo (vive bajo _lib, fuera del límite de
// funciones serverless).
const { sql } = require('../db');

async function listMesas(req, res) {
  const { rows } = await sql`
    SELECT m.id, m.nombre, m.capacidad, m.estado, m.pos_x, m.pos_y, c.id AS comanda_id
    FROM mesas m
    LEFT JOIN comandas c ON c.mesa_id = m.id AND c.estado = 'abierta'
    ORDER BY m.id`;
  return res.status(200).json({ mesas: rows });
}

async function upsertMesa(req, res) {
  const { id, nombre, capacidad, pos_x, pos_y } = req.body || {};
  if (!nombre || typeof nombre !== 'string' || nombre.length > 60) {
    return res.status(400).json({ error: "Falta nombre válido." });
  }
  const cap = capacidad != null && capacidad !== '' ? Number(capacidad) : null;
  if (cap != null && (!Number.isFinite(cap) || cap < 0 || cap > 200)) {
    return res.status(400).json({ error: "Capacidad inválida." });
  }
  const px = pos_x != null && pos_x !== '' ? Number(pos_x) : null;
  const py = pos_y != null && pos_y !== '' ? Number(pos_y) : null;
  if ((px != null && (!Number.isFinite(px) || px < 0 || px > 100)) ||
      (py != null && (!Number.isFinite(py) || py < 0 || py > 100))) {
    return res.status(400).json({ error: "Posición inválida." });
  }

  if (id) {
    const { rows } = await sql`
      UPDATE mesas SET nombre = ${nombre}, capacidad = ${cap},
        pos_x = COALESCE(${px}, pos_x), pos_y = COALESCE(${py}, pos_y),
        updated_at = now()
      WHERE id = ${id} RETURNING id, nombre, capacidad, estado, pos_x, pos_y`;
    if (!rows.length) return res.status(404).json({ error: "Mesa no encontrada." });
    return res.status(200).json({ mesa: rows[0] });
  }
  const { rows } = await sql`
    INSERT INTO mesas (nombre, capacidad, pos_x, pos_y) VALUES (${nombre}, ${cap}, ${px}, ${py})
    RETURNING id, nombre, capacidad, estado, pos_x, pos_y`;
  return res.status(201).json({ mesa: rows[0] });
}

// Guardado en lote de posiciones del plano del salón — mismo patrón que
// actualizar-mapa.js usa para el mapa de vinos ({cambios: [{id,x,y}]}).
async function saveMesasPos(req, res) {
  const { cambios } = req.body || {};
  if (!Array.isArray(cambios) || !cambios.length) {
    return res.status(400).json({ error: "Falta el array de cambios." });
  }
  for (const c of cambios) {
    const px = Number(c.pos_x), py = Number(c.pos_y);
    if (!c.id || !Number.isFinite(px) || !Number.isFinite(py) || px < 0 || px > 100 || py < 0 || py > 100) {
      return res.status(400).json({ error: "Cambio inválido: " + JSON.stringify(c) });
    }
  }
  for (const c of cambios) {
    await sql`UPDATE mesas SET pos_x = ${Number(c.pos_x)}, pos_y = ${Number(c.pos_y)}, updated_at = now() WHERE id = ${c.id}`;
  }
  return res.status(200).json({ ok: true, updated: cambios.length });
}

module.exports = { listMesas, upsertMesa, saveMesasPos };
