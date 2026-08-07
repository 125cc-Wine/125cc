// api/_lib/pos/reportes.js — agregados de venta para la vista de reportes:
// total del período, desglose por medio de pago, ranking de productos,
// historial de cierres de caja (con su diferencia) y anulaciones
// recientes (visibilidad, no hay "por qué se anuló" en el schema).
const { sql } = require('../db');

async function getReportes(req, res) {
  const dias = Number(req.query.dias) || 7;
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

  const { rows: totalGeneral } = await sql`
    SELECT COUNT(*) AS cantidad, COALESCE(SUM(total),0) AS total
    FROM comandas WHERE estado='cerrada' AND cerrada_at >= ${desde}`;

  const { rows: totalesPorMedio } = await sql`
    SELECT medio_pago, COUNT(*) AS cantidad, COALESCE(SUM(total),0) AS total
    FROM comandas
    WHERE estado='cerrada' AND cerrada_at >= ${desde}
    GROUP BY medio_pago
    ORDER BY total DESC`;

  const { rows: topProductos } = await sql`
    SELECT ci.producto_id, ci.nombre_snapshot,
           SUM(ci.cantidad) AS unidades,
           SUM(ci.cantidad * ci.precio_unitario) AS total
    FROM comanda_items ci
    JOIN comandas c ON c.id = ci.comanda_id
    WHERE ci.estado='activo' AND c.estado='cerrada' AND c.cerrada_at >= ${desde}
    GROUP BY ci.producto_id, ci.nombre_snapshot
    ORDER BY unidades DESC
    LIMIT 15`;

  const { rows: cajas } = await sql`
    SELECT id, monto_inicial, monto_final_contado, monto_final_esperado, diferencia,
           abierta_por, cerrada_por, abierta_at, cerrada_at
    FROM caja_sesiones
    WHERE estado='cerrada' AND cerrada_at >= ${desde}
    ORDER BY cerrada_at DESC
    LIMIT 20`;

  // Sin timestamp de anulación en el schema — se ordena por creación de
  // la línea, no es "recién anulado primero" exacto pero alcanza para
  // tener visibilidad de qué se anula seguido.
  const { rows: anulados } = await sql`
    SELECT id, comanda_id, nombre_snapshot, cantidad, precio_unitario, created_at
    FROM comanda_items
    WHERE estado='anulado'
    ORDER BY created_at DESC
    LIMIT 30`;

  return res.status(200).json({ dias, totalGeneral: totalGeneral[0], totalesPorMedio, topProductos, cajas, anulados });
}

module.exports = { getReportes };
