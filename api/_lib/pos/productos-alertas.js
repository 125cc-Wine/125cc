// api/_lib/pos/productos-alertas.js — productos con margen bajo o
// negativo (solo los que tienen costo cargado — sin costo no hay nada
// que alertar), y la config chica (hoy: el umbral de alerta).
const { sql } = require('../db');

async function getAlertasMargen(req, res) {
  const { rows: configRows } = await sql`SELECT valor FROM pos_config WHERE clave='margen_alerta_pct'`;
  const umbral = configRows.length ? Number(configRows[0].valor) : 30;

  const { rows } = await sql`
    SELECT id, nombre, categoria, precio, costo,
      ROUND(((precio - costo) / NULLIF(precio, 0)) * 100, 1) AS margen_pct
    FROM productos
    WHERE activo = true AND costo IS NOT NULL AND precio > 0
      AND ((precio - costo) / precio) * 100 < ${umbral}
    ORDER BY margen_pct ASC`;

  return res.status(200).json({ umbral, productos: rows });
}

async function getConfig(req, res) {
  const { rows } = await sql`SELECT clave, valor FROM pos_config`;
  const config = {};
  for (const r of rows) config[r.clave] = r.valor;
  return res.status(200).json({ config });
}

async function setConfig(req, res) {
  const { clave, valor } = req.body || {};
  if (!clave || typeof clave !== 'string' || clave.length > 60) {
    return res.status(400).json({ error: "Falta clave válida." });
  }
  if (valor === undefined) return res.status(400).json({ error: "Falta valor." });
  const { rows } = await sql`
    INSERT INTO pos_config (clave, valor) VALUES (${clave}, ${JSON.stringify(valor)}::jsonb)
    ON CONFLICT (clave) DO UPDATE SET valor=${JSON.stringify(valor)}::jsonb, updated_at=now()
    RETURNING clave, valor`;
  return res.status(200).json({ config: rows[0] });
}

module.exports = { getAlertasMargen, getConfig, setConfig };
