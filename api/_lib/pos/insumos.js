// api/_lib/pos/insumos.js — CRUD de insumos (materia prima para recetas
// de productos compuestos). Mismo patrón que productos.js. Sin UI todavía
// (Fase 4: solo backend — no hay menú de comida real armado aún).
const { sql } = require('../db');

async function listInsumos(req, res) {
  const soloActivos = req.query.activo !== 'all';
  const { rows } = soloActivos
    ? await sql`SELECT id, nombre, unidad, costo_unitario, stock_actual, activo FROM insumos WHERE activo=true ORDER BY nombre`
    : await sql`SELECT id, nombre, unidad, costo_unitario, stock_actual, activo FROM insumos ORDER BY nombre`;
  return res.status(200).json({ insumos: rows });
}

async function upsertInsumo(req, res) {
  const { id, nombre, unidad, costo_unitario, stock_actual, activo } = req.body || {};
  if (!nombre || typeof nombre !== 'string' || !nombre.trim() || nombre.length > 120) {
    return res.status(400).json({ error: "Falta nombre válido." });
  }
  if (!unidad || typeof unidad !== 'string' || !unidad.trim() || unidad.length > 20) {
    return res.status(400).json({ error: "Falta unidad válida." });
  }
  const costo = costo_unitario != null && costo_unitario !== '' ? Number(costo_unitario) : null;
  if (costo != null && (!Number.isFinite(costo) || costo < 0)) {
    return res.status(400).json({ error: "Costo unitario inválido." });
  }
  const stock = stock_actual != null && stock_actual !== '' ? Number(stock_actual) : null;
  if (stock != null && !Number.isFinite(stock)) {
    return res.status(400).json({ error: "Stock inválido." });
  }
  const act = activo !== false;

  if (id) {
    const { rows } = await sql`
      UPDATE insumos SET nombre=${nombre}, unidad=${unidad}, costo_unitario=${costo},
        stock_actual=${stock}, activo=${act}, updated_at=now()
      WHERE id=${id}
      RETURNING id, nombre, unidad, costo_unitario, stock_actual, activo`;
    if (!rows.length) return res.status(404).json({ error: "Insumo no encontrado." });
    return res.status(200).json({ insumo: rows[0] });
  }
  const { rows } = await sql`
    INSERT INTO insumos (nombre, unidad, costo_unitario, stock_actual, activo)
    VALUES (${nombre}, ${unidad}, ${costo}, ${stock}, ${act})
    RETURNING id, nombre, unidad, costo_unitario, stock_actual, activo`;
  return res.status(201).json({ insumo: rows[0] });
}

module.exports = { listInsumos, upsertInsumo };
