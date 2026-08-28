// api/_lib/pos/mesas.js — listar mesas (con su comanda abierta, si tiene) / crear-editar mesa.
// Módulo de lógica pura: lo llama el router en api/pos.js, no es un
// endpoint de Vercel en sí mismo (vive bajo _lib, fuera del límite de
// funciones serverless).
const { sql } = require('../db');

// abierta_at/cuenta_pedida_at: para el aviso de "hace cuánto" en el
// pin del plano (auditoría, hallazgo 1.3) — "una mesa en azul hace
// doce minutos es el problema más caro del turno".
//
// platos_listos: señal de vuelta al salón (handoff/
// ANALISIS-POS-SISTEMA-COMPLETO.md, feedback tras el hallazgo 1) —
// cuántos ítems de la comanda abierta de esta mesa cocina ya marcó
// 'listo' y el mozo todavía no confirmó 'entregado'. Subquery
// correlacionada (no un JOIN + GROUP BY) porque la cardinalidad es
// chica (pocos ítems 'listo' a la vez) y evita duplicar filas de mesas
// por cada ítem listo.
async function listMesas(req, res) {
  const { rows } = await sql`
    SELECT m.id, m.nombre, m.capacidad, m.estado, m.pos_x, m.pos_y,
           c.id AS comanda_id, c.abierta_at, c.cuenta_pedida_at,
           (SELECT COUNT(*) FROM comanda_items ci
            WHERE ci.comanda_id = c.id AND ci.estado='activo' AND ci.estado_cocina='listo') AS platos_listos
    FROM mesas m
    LEFT JOIN comandas c ON c.mesa_id = m.id AND c.estado = 'abierta'
    WHERE m.activo = true
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

// Baja lógica (activo=false), nunca DELETE físico — una mesa vieja
// puede tener años de comandas históricas apuntándole. Se niega si
// tiene una comanda abierta (no se puede borrar una mesa en servicio).
async function eliminarMesa(req, res) {
  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: "Falta id." });

  const { rows: abiertas } = await sql`
    SELECT id FROM comandas WHERE mesa_id=${id} AND estado='abierta'`;
  if (abiertas.length) {
    return res.status(409).json({ error: "Esta mesa tiene una comanda abierta — cerrala antes de eliminarla." });
  }

  const { rows } = await sql`
    UPDATE mesas SET activo=false, updated_at=now() WHERE id=${id} AND activo=true
    RETURNING id`;
  if (!rows.length) return res.status(404).json({ error: "Mesa no encontrada." });
  return res.status(200).json({ ok: true });
}

module.exports = { listMesas, upsertMesa, saveMesasPos, eliminarMesa };
