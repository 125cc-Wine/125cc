// api/_lib/pos/reportes.js — agregados de venta para la vista de reportes:
// total del período, desglose por medio de pago, ranking de productos
// (por unidades vendidas Y por margen real), historial de cierres de caja
// (con su diferencia) y anulaciones recientes.
//
// El margen usa el costo ACTUAL del producto (productos.costo), no un
// costo "congelado" al momento de la venta — comanda_items no guarda un
// snapshot de costo (solo de precio). Para algo que cambia tan seguido
// como el costo de compra de un vino esto puede introducir un desvío
// chico contra ventas viejas, pero evita una migración de datos más
// compleja por ahora; si el costo cambia poco entre ventas no es un
// problema real. Los productos sin costo cargado quedan afuera del
// ranking "por margen" (si no, COALESCE a 0 los haría parecer 100% de
// margen, que es engañoso) — se informa cuántas unidades vendidas
// todavía no tienen costo cargado, para que se note la falta de dato.
const { sql } = require('../db');

async function getReportes(req, res) {
  const dias = Number(req.query.dias) || 7;
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  // Ventana anterior de igual longitud, inmediatamente antes de `desde` —
  // para el badge de "vs. período anterior" en el frontend. El delta en
  // sí (%) se calcula del lado del cliente con estos dos totales, sin
  // fórmula nueva del lado backend.
  const antes = new Date(desde.getTime() - dias * 24 * 60 * 60 * 1000);

  const { rows: totalGeneral } = await sql`
    SELECT COUNT(*) AS cantidad, COALESCE(SUM(total),0) AS total
    FROM comandas WHERE estado='cerrada' AND cerrada_at >= ${desde}`;

  const { rows: totalAnteriorRows } = await sql`
    SELECT COUNT(*) AS cantidad, COALESCE(SUM(total),0) AS total
    FROM comandas WHERE estado='cerrada' AND cerrada_at >= ${antes} AND cerrada_at < ${desde}`;

  const { rows: margenAnteriorRows } = await sql`
    SELECT
      COALESCE(SUM(ci.cantidad * ci.precio_unitario), 0) AS ingresos,
      COALESCE(SUM(ci.cantidad * COALESCE(p.costo, 0)), 0) AS costo
    FROM comanda_items ci
    JOIN comandas c ON c.id = ci.comanda_id
    LEFT JOIN productos p ON p.id = ci.producto_id
    WHERE ci.estado='activo' AND c.estado='cerrada' AND c.cerrada_at >= ${antes} AND c.cerrada_at < ${desde}`;
  const ma = margenAnteriorRows[0];
  const periodoAnterior = {
    totalGeneral: totalAnteriorRows[0],
    margenGeneral: { ingresos: ma.ingresos, costo: ma.costo, margen: Number(ma.ingresos) - Number(ma.costo) },
  };

  // Serie diaria para el gráfico — los días sin ventas no generan fila
  // acá, se completan con 0 en el frontend al recorrer día por día
  // desde `desde` hasta hoy (más simple que generar la serie completa
  // en SQL con generate_series).
  const { rows: serieDiaria } = await sql`
    SELECT date_trunc('day', cerrada_at)::date AS fecha, COALESCE(SUM(total),0) AS total
    FROM comandas WHERE estado='cerrada' AND cerrada_at >= ${desde}
    GROUP BY 1 ORDER BY 1`;

  const { rows: margenGeneralRows } = await sql`
    SELECT
      COALESCE(SUM(ci.cantidad * ci.precio_unitario), 0) AS ingresos,
      COALESCE(SUM(ci.cantidad * COALESCE(p.costo, 0)), 0) AS costo,
      COALESCE(SUM(CASE WHEN p.costo IS NULL THEN ci.cantidad ELSE 0 END), 0) AS unidades_sin_costo
    FROM comanda_items ci
    JOIN comandas c ON c.id = ci.comanda_id
    LEFT JOIN productos p ON p.id = ci.producto_id
    WHERE ci.estado='activo' AND c.estado='cerrada' AND c.cerrada_at >= ${desde}`;
  const mg = margenGeneralRows[0];
  const margenGeneral = {
    ingresos: mg.ingresos, costo: mg.costo,
    margen: Number(mg.ingresos) - Number(mg.costo),
    unidades_sin_costo: mg.unidades_sin_costo,
  };

  const { rows: totalesPorMedio } = await sql`
    SELECT medio_pago, COUNT(*) AS cantidad, COALESCE(SUM(total),0) AS total
    FROM comandas
    WHERE estado='cerrada' AND cerrada_at >= ${desde}
    GROUP BY medio_pago
    ORDER BY total DESC`;

  const { rows: topProductos } = await sql`
    SELECT ci.producto_id, ci.nombre_snapshot,
           SUM(ci.cantidad) AS unidades,
           SUM(ci.cantidad * ci.precio_unitario) AS total,
           SUM(ci.cantidad * p.costo) AS costo_total,
           BOOL_AND(p.costo IS NOT NULL) AS tiene_costo
    FROM comanda_items ci
    JOIN comandas c ON c.id = ci.comanda_id
    LEFT JOIN productos p ON p.id = ci.producto_id
    WHERE ci.estado='activo' AND c.estado='cerrada' AND c.cerrada_at >= ${desde}
    GROUP BY ci.producto_id, ci.nombre_snapshot
    ORDER BY unidades DESC
    LIMIT 15`;

  // Ranking por rentabilidad real — solo productos con costo cargado,
  // para no mezclar "sin dato" con "margen 100%".
  const { rows: topPorMargen } = await sql`
    SELECT ci.producto_id, ci.nombre_snapshot,
           SUM(ci.cantidad) AS unidades,
           SUM(ci.cantidad * ci.precio_unitario) - SUM(ci.cantidad * p.costo) AS margen
    FROM comanda_items ci
    JOIN comandas c ON c.id = ci.comanda_id
    JOIN productos p ON p.id = ci.producto_id
    WHERE ci.estado='activo' AND c.estado='cerrada' AND c.cerrada_at >= ${desde} AND p.costo IS NOT NULL
    GROUP BY ci.producto_id, ci.nombre_snapshot
    ORDER BY margen DESC
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

  return res.status(200).json({
    dias, totalGeneral: totalGeneral[0], margenGeneral, periodoAnterior, serieDiaria,
    totalesPorMedio, topProductos, topPorMargen, cajas, anulados,
  });
}

module.exports = { getReportes };
