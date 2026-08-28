// api/_lib/pos/food-cost.js — food cost % agregado del período: costo de
// venta de los platos con receta real / ingresos de esos mismos platos.
// Costeo de insumos (handoff/ANALISIS-COSTEO-INSUMOS.md), Tier 3,
// hallazgo 6 — mismo patrón que productos-alertas.js (margen_alerta_pct)
// para el umbral, banda sana de referencia 28-32% (ver fuentes del
// análisis).
//
// Alcance acotado a productos con costo_calculado=true (los que vienen
// de una receta real, no un vino con costo cargado a mano) — mezclar
// vino ahí adentro no tiene sentido, food cost es un concepto de comida.
const { sql } = require('../db');

async function getFoodCost(req, res) {
  const dias = Number(req.query.dias) || 30;
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

  const { rows: configRows } = await sql`SELECT valor FROM pos_config WHERE clave='food_cost_alerta_pct'`;
  const umbral = configRows.length ? Number(configRows[0].valor) : 32;

  const { rows } = await sql`
    SELECT
      COALESCE(SUM(ci.cantidad * ci.precio_unitario), 0) AS ingresos,
      COALESCE(SUM(ci.cantidad * COALESCE(ci.costo_snapshot, p.costo, 0)), 0) AS costo
    FROM comanda_items ci
    JOIN comandas c ON c.id = ci.comanda_id
    JOIN productos p ON p.id = ci.producto_id
    WHERE ci.estado='activo' AND c.estado='cerrada' AND c.cerrada_at >= ${desde}
      AND p.costo_calculado = true`;

  const ingresos = Number(rows[0].ingresos);
  const costo = Number(rows[0].costo);
  const foodCostPct = ingresos > 0 ? Math.round((costo / ingresos) * 1000) / 10 : null;

  // Desglose por plato — para ver cuál empuja el % para arriba, mismo
  // criterio que topPorMargen en reportes.js pero acotado a comida.
  const { rows: porPlato } = await sql`
    SELECT ci.producto_id, ci.nombre_snapshot,
      SUM(ci.cantidad) AS unidades,
      SUM(ci.cantidad * ci.precio_unitario) AS ingresos,
      SUM(ci.cantidad * COALESCE(ci.costo_snapshot, p.costo, 0)) AS costo
    FROM comanda_items ci
    JOIN comandas c ON c.id = ci.comanda_id
    JOIN productos p ON p.id = ci.producto_id
    WHERE ci.estado='activo' AND c.estado='cerrada' AND c.cerrada_at >= ${desde}
      AND p.costo_calculado = true
    GROUP BY ci.producto_id, ci.nombre_snapshot
    ORDER BY costo DESC`;

  return res.status(200).json({
    dias, ingresos, costo, foodCostPct, umbral,
    alerta: foodCostPct != null && foodCostPct > umbral,
    porPlato,
  });
}

module.exports = { getFoodCost };
