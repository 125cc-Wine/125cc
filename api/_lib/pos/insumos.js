// api/_lib/pos/insumos.js — CRUD de insumos (materia prima para recetas
// de productos compuestos). Mismo patrón que productos.js.
//
// Costeo de insumos (handoff/ANALISIS-COSTEO-INSUMOS.md), Tier 2:
// - unidad pasa de texto libre a una lista fija (UNIDADES) — texto libre
//   ya produjo un dato mal cargado real ("Mondiolita" con unidad="25").
// - factor_receta: mismo patrón que productos.copas_por_botella.
//   costo_unitario es SIEMPRE por unidad de COMPRA (la de acá arriba);
//   receta_items.cantidad está SIEMPRE en unidad de RECETA (más chica,
//   ej. gramos si se compra por kg). factor_receta = cuántas unidades de
//   receta hay en 1 unidad de compra — default 1, sin conversión, cuando
//   se compra y se cocina en la misma unidad.
const { sql } = require('../db');

const UNIDADES = ['g', 'kg', 'ml', 'l', 'unidad', 'paquete'];

async function listInsumos(req, res) {
  const soloActivos = req.query.activo !== 'all';
  const { rows } = soloActivos
    ? await sql`SELECT id, nombre, unidad, costo_unitario, stock_actual, factor_receta, activo FROM insumos WHERE activo=true ORDER BY nombre`
    : await sql`SELECT id, nombre, unidad, costo_unitario, stock_actual, factor_receta, activo FROM insumos ORDER BY nombre`;
  return res.status(200).json({ insumos: rows });
}

async function upsertInsumo(req, res) {
  const { id, nombre, unidad, costo_unitario, stock_actual, factor_receta, activo } = req.body || {};
  if (!nombre || typeof nombre !== 'string' || !nombre.trim() || nombre.length > 120) {
    return res.status(400).json({ error: "Falta nombre válido." });
  }
  if (!UNIDADES.includes(unidad)) {
    return res.status(400).json({ error: "Unidad inválida (debe ser g, kg, ml, l, unidad o paquete)." });
  }
  const costo = costo_unitario != null && costo_unitario !== '' ? Number(costo_unitario) : null;
  if (costo != null && (!Number.isFinite(costo) || costo < 0)) {
    return res.status(400).json({ error: "Costo unitario inválido." });
  }
  const stock = stock_actual != null && stock_actual !== '' ? Number(stock_actual) : null;
  if (stock != null && !Number.isFinite(stock)) {
    return res.status(400).json({ error: "Stock inválido." });
  }
  const factor = factor_receta != null && factor_receta !== '' ? Number(factor_receta) : 1;
  if (!Number.isFinite(factor) || factor <= 0) {
    return res.status(400).json({ error: "Factor de conversión a unidad de receta inválido." });
  }
  const act = activo !== false;

  if (id) {
    const { rows } = await sql`
      UPDATE insumos SET nombre=${nombre}, unidad=${unidad}, costo_unitario=${costo},
        stock_actual=${stock}, factor_receta=${factor}, activo=${act}, updated_at=now()
      WHERE id=${id}
      RETURNING id, nombre, unidad, costo_unitario, stock_actual, factor_receta, activo`;
    if (!rows.length) return res.status(404).json({ error: "Insumo no encontrado." });
    return res.status(200).json({ insumo: rows[0] });
  }
  const { rows } = await sql`
    INSERT INTO insumos (nombre, unidad, costo_unitario, stock_actual, factor_receta, activo)
    VALUES (${nombre}, ${unidad}, ${costo}, ${stock}, ${factor}, ${act})
    RETURNING id, nombre, unidad, costo_unitario, stock_actual, factor_receta, activo`;
  return res.status(201).json({ insumo: rows[0] });
}

module.exports = { listInsumos, upsertInsumo, UNIDADES };
