// api/_lib/pos/costos-fijos.js — presupuesto mensual por categoría.
// Versionado: subir un monto no pisa el histórico, agrega una fila
// nueva con vigente_desde — estado-resultados.js toma la vigente en
// cada mes consultado (DISTINCT ON por categoría, la de vigente_desde
// más reciente que no supere el mes).
const { sql } = require('../db');

async function listCostosFijos(req, res) {
  const soloActivos = req.query.activo !== 'all';
  const { rows } = soloActivos
    ? await sql`SELECT id, categoria, monto_mensual, vigente_desde, activo FROM costos_fijos WHERE activo=true ORDER BY categoria, vigente_desde DESC`
    : await sql`SELECT id, categoria, monto_mensual, vigente_desde, activo FROM costos_fijos ORDER BY categoria, vigente_desde DESC`;
  return res.status(200).json({ costosFijos: rows });
}

async function upsertCostoFijo(req, res) {
  const { id, categoria, monto_mensual, vigente_desde, activo } = req.body || {};
  if (!categoria || typeof categoria !== 'string' || !categoria.trim() || categoria.length > 60) {
    return res.status(400).json({ error: "Falta categoría válida." });
  }
  const monto = Number(monto_mensual);
  if (!Number.isFinite(monto) || monto < 0) return res.status(400).json({ error: "Monto mensual inválido." });
  const vigencia = vigente_desde || new Date().toISOString().slice(0, 10);
  const act = activo !== false;

  if (id) {
    const { rows } = await sql`
      UPDATE costos_fijos SET categoria=${categoria}, monto_mensual=${monto}, vigente_desde=${vigencia}, activo=${act}
      WHERE id=${id}
      RETURNING id, categoria, monto_mensual, vigente_desde, activo`;
    if (!rows.length) return res.status(404).json({ error: "Costo fijo no encontrado." });
    return res.status(200).json({ costoFijo: rows[0] });
  }
  const { rows } = await sql`
    INSERT INTO costos_fijos (categoria, monto_mensual, vigente_desde, activo)
    VALUES (${categoria}, ${monto}, ${vigencia}, ${act})
    RETURNING id, categoria, monto_mensual, vigente_desde, activo`;
  return res.status(201).json({ costoFijo: rows[0] });
}

module.exports = { listCostosFijos, upsertCostoFijo };
