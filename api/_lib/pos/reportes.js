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
//
// margenGeneral.ingresos usa comandas.total (neto de descuento), NO
// SUM(ci.precio_unitario*cantidad) — ese es el precio de lista antes
// del descuento. Antes de este fix, cualquier comanda con descuento
// inflaba el margen reportado exactamente por el monto descontado
// (bug real, detectado en auditoría). El costo sigue viniendo de
// comanda_items (no hay otra fuente), el descuento no le pega al
// costo, solo a los ingresos.
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

  const { rows: costoAnteriorRows } = await sql`
    SELECT COALESCE(SUM(ci.cantidad * COALESCE(p.costo, 0)), 0) AS costo
    FROM comanda_items ci
    JOIN comandas c ON c.id = ci.comanda_id
    LEFT JOIN productos p ON p.id = ci.producto_id
    WHERE ci.estado='activo' AND c.estado='cerrada' AND c.cerrada_at >= ${antes} AND c.cerrada_at < ${desde}`;
  const ingresosAnterior = Number(totalAnteriorRows[0].total);
  const costoAnterior = Number(costoAnteriorRows[0].costo);
  const periodoAnterior = {
    totalGeneral: totalAnteriorRows[0],
    margenGeneral: { ingresos: ingresosAnterior, costo: costoAnterior, margen: ingresosAnterior - costoAnterior },
  };

  // Serie diaria para el gráfico — los días sin ventas no generan fila
  // acá, se completan con 0 en el frontend al recorrer día por día
  // desde `desde` hasta hoy (más simple que generar la serie completa
  // en SQL con generate_series).
  const { rows: serieDiaria } = await sql`
    SELECT date_trunc('day', cerrada_at)::date AS fecha, COALESCE(SUM(total),0) AS total
    FROM comandas WHERE estado='cerrada' AND cerrada_at >= ${desde}
    GROUP BY 1 ORDER BY 1`;

  const { rows: costoRows } = await sql`
    SELECT
      COALESCE(SUM(ci.cantidad * COALESCE(p.costo, 0)), 0) AS costo,
      COALESCE(SUM(CASE WHEN p.costo IS NULL THEN ci.cantidad ELSE 0 END), 0) AS unidades_sin_costo
    FROM comanda_items ci
    JOIN comandas c ON c.id = ci.comanda_id
    LEFT JOIN productos p ON p.id = ci.producto_id
    WHERE ci.estado='activo' AND c.estado='cerrada' AND c.cerrada_at >= ${desde}`;
  const ingresosGeneral = Number(totalGeneral[0].total);
  const costoGeneral = Number(costoRows[0].costo);
  const margenGeneral = {
    ingresos: ingresosGeneral, costo: costoGeneral,
    margen: ingresosGeneral - costoGeneral,
    unidades_sin_costo: costoRows[0].unidades_sin_costo,
  };

  // Desglose real por medio de pago — antes agrupaba por
  // comandas.medio_pago, así que una cuenta dividida (2+ pagos, medios
  // distintos) caía entera en 'mixto' sin decir cuánto entró por cada
  // medio. caja_movimientos SÍ guarda un pago por medio (uno por cada
  // elemento del array `pagos` de comanda-cerrar.js), eso es lo que
  // responde "cuánto entró por cada medio". El fiado (cuenta_corriente)
  // no genera fila en caja_movimientos —la plata no entró— así que se
  // suma aparte desde cuenta_corriente_movimientos para no desaparecer
  // del desglose.
  const { rows: totalesPorMedio } = await sql`
    SELECT medio_pago, COUNT(*) AS cantidad, COALESCE(SUM(monto),0) AS total FROM (
      SELECT cm.medio_pago AS medio_pago, cm.monto AS monto
      FROM caja_movimientos cm
      JOIN comandas c ON c.id = cm.comanda_id
      WHERE cm.tipo='venta' AND c.estado='cerrada' AND c.cerrada_at >= ${desde}
      UNION ALL
      SELECT 'cuenta_corriente' AS medio_pago, ccm.monto AS monto
      FROM cuenta_corriente_movimientos ccm
      JOIN comandas c ON c.id = ccm.comanda_id
      WHERE ccm.tipo='cargo' AND c.estado='cerrada' AND c.cerrada_at >= ${desde}
    ) t
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
  // para no mezclar "sin dato" con "margen 100%". A diferencia de
  // margenGeneral, acá sí queda a precio de lista (no neto de
  // descuento): el descuento es de la comanda entera, no hay forma de
  // saber cuánto le corresponde a cada línea sin prorratear, y esto es
  // un ranking relativo entre productos, no una cifra de caja.
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

  // Antes sin filtro de fecha: el panel decía "7 días" pero mostraba
  // los últimos 30 anulados de toda la historia. Ahora filtra y ordena
  // por COALESCE(anulado_at, created_at) — anulado_at es lo correcto
  // (cuándo se anuló, no cuándo se creó la línea), created_at queda
  // como respaldo para filas anuladas antes de que existiera la
  // columna (van a quedar con anulado_at NULL para siempre, es
  // historial viejo, no vale la pena migrar datos para esto).
  const { rows: anulados } = await sql`
    SELECT id, comanda_id, nombre_snapshot, cantidad, precio_unitario, anulado_por,
           COALESCE(anulado_at, created_at) AS anulado_en
    FROM comanda_items
    WHERE estado='anulado' AND COALESCE(anulado_at, created_at) >= ${desde}
    ORDER BY anulado_en DESC
    LIMIT 30`;

  return res.status(200).json({
    dias, totalGeneral: totalGeneral[0], margenGeneral, periodoAnterior, serieDiaria,
    totalesPorMedio, topProductos, topPorMargen, cajas, anulados,
  });
}

module.exports = { getReportes };
