// api/_lib/pos/estado-resultados.js — ingresos reales, costo variable
// (misma lógica que margenGeneral de reportes.js, acá acotada a un mes
// calendario) y gastos reales vs. presupuesto (costos_fijos vigente ese
// mes). Sin tablas nuevas — agrega sobre lo que ya existe.
const { sql } = require('../db');

function rangoMes(mes) {
  const [y, m] = mes.split('-').map(Number);
  const inicio = `${mes}-01`;
  const finExclusivo = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  return { inicio, finExclusivo };
}

async function getEstadoResultados(req, res) {
  const mes = req.query.mes || new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(mes)) return res.status(400).json({ error: "Formato de mes inválido (usar YYYY-MM)." });
  const { inicio, finExclusivo } = rangoMes(mes);

  const { rows: ingresosRows } = await sql`
    SELECT COUNT(*) AS comandas, COALESCE(SUM(total),0) AS ingresos
    FROM comandas
    WHERE estado='cerrada' AND cerrada_at >= ${inicio} AND cerrada_at < ${finExclusivo}`;

  const { rows: costoRows } = await sql`
    SELECT COALESCE(SUM(ci.cantidad * COALESCE(p.costo,0)),0) AS costo_variable,
           COALESCE(SUM(CASE WHEN p.costo IS NULL THEN ci.cantidad ELSE 0 END),0) AS unidades_sin_costo
    FROM comanda_items ci
    JOIN comandas c ON c.id = ci.comanda_id
    LEFT JOIN productos p ON p.id = ci.producto_id
    WHERE ci.estado='activo' AND c.estado='cerrada' AND c.cerrada_at >= ${inicio} AND c.cerrada_at < ${finExclusivo}`;

  const { rows: gastosPorCategoria } = await sql`
    SELECT categoria, tipo, COALESCE(SUM(monto),0) AS monto
    FROM gastos
    WHERE estado='activo' AND fecha >= ${inicio} AND fecha < ${finExclusivo}
    GROUP BY categoria, tipo
    ORDER BY categoria`;

  const { rows: gastosTotalRows } = await sql`
    SELECT COALESCE(SUM(monto),0) AS total
    FROM gastos WHERE estado='activo' AND fecha >= ${inicio} AND fecha < ${finExclusivo}`;

  // Presupuesto vigente en el mes consultado: la fila de vigente_desde
  // más reciente que no lo supere, por categoría (versionado — subir un
  // monto agrega fila nueva, no pisa el histórico).
  const { rows: presupuesto } = await sql`
    SELECT DISTINCT ON (categoria) categoria, monto_mensual, vigente_desde
    FROM costos_fijos
    WHERE activo=true AND vigente_desde < ${finExclusivo}
    ORDER BY categoria, vigente_desde DESC`;

  const ingresos = Number(ingresosRows[0].ingresos);
  const costoVariable = Number(costoRows[0].costo_variable);
  const gastosTotal = Number(gastosTotalRows[0].total);
  const presupuestoTotal = presupuesto.reduce((acc, r) => acc + Number(r.monto_mensual), 0);
  const resultadoNeto = ingresos - costoVariable - gastosTotal;

  // Comparación real vs. presupuestado por categoría — no reimplementa
  // la fórmula de equilibrio.html (copas necesarias, IVA, comisión), es
  // costos_fijos vs. gastos.tipo='fijo' agrupado, distinto alcance.
  const gastosFijosPorCategoria = new Map(
    gastosPorCategoria.filter((g) => g.tipo === 'fijo').map((g) => [g.categoria, Number(g.monto)])
  );
  const categorias = new Set([...presupuesto.map((p) => p.categoria), ...gastosFijosPorCategoria.keys()]);
  const comparativoFijos = [...categorias].map((categoria) => {
    const presupuestado = Number(presupuesto.find((p) => p.categoria === categoria)?.monto_mensual || 0);
    const real = gastosFijosPorCategoria.get(categoria) || 0;
    return { categoria, presupuestado, real, diferencia: real - presupuestado };
  }).sort((a, b) => a.categoria.localeCompare(b.categoria));

  // Serie de resultado neto de los últimos 6 meses (auditoría, sección
  // 02 — "¿cerré el mes arriba o abajo, y por qué?"): mismo cálculo que
  // arriba, agregado por mes en vez de para uno solo. Se arma con tres
  // queries agrupadas por mes (ingresos/costo/gastos) y se combinan acá
  // — más simple que un JOIN de tres agregaciones con distinta
  // granularidad de fecha.
  const [yMes, mMes] = mes.split('-').map(Number);
  const inicio6Meses = new Date(Date.UTC(yMes, mMes - 1 - 5, 1)).toISOString().slice(0, 10);

  const { rows: ingresosPorMes } = await sql`
    SELECT date_trunc('month', cerrada_at)::date AS mes, COALESCE(SUM(total),0) AS ingresos
    FROM comandas
    WHERE estado='cerrada' AND cerrada_at >= ${inicio6Meses} AND cerrada_at < ${finExclusivo}
    GROUP BY 1`;
  const { rows: costoPorMes } = await sql`
    SELECT date_trunc('month', c.cerrada_at)::date AS mes,
           COALESCE(SUM(ci.cantidad * COALESCE(p.costo,0)),0) AS costo
    FROM comanda_items ci
    JOIN comandas c ON c.id = ci.comanda_id
    LEFT JOIN productos p ON p.id = ci.producto_id
    WHERE ci.estado='activo' AND c.estado='cerrada' AND c.cerrada_at >= ${inicio6Meses} AND c.cerrada_at < ${finExclusivo}
    GROUP BY 1`;
  const { rows: gastosPorMes } = await sql`
    SELECT date_trunc('month', fecha)::date AS mes, COALESCE(SUM(monto),0) AS gastos
    FROM gastos
    WHERE estado='activo' AND fecha >= ${inicio6Meses} AND fecha < ${finExclusivo}
    GROUP BY 1`;

  const mapaIngresos = new Map(ingresosPorMes.map((r) => [r.mes.toISOString().slice(0, 7), Number(r.ingresos)]));
  const mapaCosto = new Map(costoPorMes.map((r) => [r.mes.toISOString().slice(0, 7), Number(r.costo)]));
  const mapaGastos = new Map(gastosPorMes.map((r) => [r.mes.toISOString().slice(0, 7), Number(r.gastos)]));

  const serieResultadoNeto = [];
  for (let i = 5; i >= 0; i--) {
    const fecha = new Date(Date.UTC(yMes, mMes - 1 - i, 1));
    const key = fecha.toISOString().slice(0, 7);
    const ing = mapaIngresos.get(key) || 0;
    const cos = mapaCosto.get(key) || 0;
    const gas = mapaGastos.get(key) || 0;
    serieResultadoNeto.push({ mes: key, resultadoNeto: ing - cos - gas });
  }

  return res.status(200).json({
    mes,
    ingresos, comandas: ingresosRows[0].comandas,
    costoVariable, unidadesSinCosto: costoRows[0].unidades_sin_costo,
    gastosTotal, gastosPorCategoria,
    presupuesto, presupuestoTotal, comparativoFijos,
    resultadoNeto, serieResultadoNeto,
  });
}

module.exports = { getEstadoResultados };
