// api/_lib/pos/cocina.js — cola de preparación de cocina/barra
// (handoff/ANALISIS-POS-SISTEMA-COMPLETO.md, hallazgo 1): antes nada le
// avisaba a cocina qué preparar cuando un mozo agregaba un ítem de
// comida — dependía de mirar la pantalla del POS o decírselo de
// palabra. comanda-item.js ya marca cada línea de comida (sin
// vino_ref) como estado_cocina='pendiente' al agregarla (NULL para
// vino, que se sirve en el momento); esto expone esa cola y el botón
// de marcarla lista.
const { sql } = require('../db');

// Lista todo lo pendiente de preparar, de comandas ABIERTAS únicamente
// (una comanda cerrada/anulada no tiene nada que cocinar) — más viejo
// primero, orden natural de una cola de cocina real.
async function getColaCocina(req, res) {
  const { rows } = await sql`
    SELECT ci.id, ci.comanda_id, ci.nombre_snapshot, ci.cantidad, ci.created_at,
           m.nombre AS mesa_nombre
    FROM comanda_items ci
    JOIN comandas c ON c.id = ci.comanda_id
    LEFT JOIN mesas m ON m.id = c.mesa_id
    WHERE ci.estado='activo' AND ci.estado_cocina='pendiente' AND c.estado='abierta'
    ORDER BY ci.created_at ASC`;
  return res.status(200).json({ items: rows });
}

// Marca un ítem como listo. No hay vuelta atrás desde acá a propósito
// (si hace falta reabrirlo, agregar de nuevo esa cantidad desde la
// comanda ya lo vuelve a poner en 'pendiente' — ver comanda-item.js) —
// una cola de cocina no necesita más ceremonia que "listo" en un touch.
async function marcarListoCocina(req, res) {
  const { item_id } = req.body || {};
  if (!item_id) return res.status(400).json({ error: "Falta item_id." });
  const { rows } = await sql`
    UPDATE comanda_items SET estado_cocina='listo'
    WHERE id=${item_id} AND estado_cocina='pendiente'
    RETURNING id, estado_cocina`;
  if (!rows.length) return res.status(404).json({ error: "Ítem no encontrado o ya no está pendiente." });
  return res.status(200).json({ item: rows[0] });
}

module.exports = { getColaCocina, marcarListoCocina };
