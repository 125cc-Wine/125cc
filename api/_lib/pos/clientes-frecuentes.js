// api/_lib/pos/clientes-frecuentes.js — clientes con varias comandas
// cerradas en una ventana reciente, para sugerir un descuento. Nunca
// automático: el frontend solo prellena el flujo de descuento manual
// ya existente (comanda-descuento.js), el mozo confirma. Umbrales
// configurables vía pos_config, mismo patrón que margen_alerta_pct.
const { sql } = require('../db');

const DEFAULTS = {
  cliente_frecuente_visitas: 3,
  cliente_frecuente_dias: 60,
  cliente_frecuente_descuento_pct: 10,
};

async function getClientesFrecuentes(req, res) {
  const { rows: configRows } = await sql`
    SELECT clave, valor FROM pos_config
    WHERE clave IN ('cliente_frecuente_visitas','cliente_frecuente_dias','cliente_frecuente_descuento_pct')`;
  const config = { ...DEFAULTS };
  for (const r of configRows) config[r.clave] = Number(r.valor);

  const desde = new Date(Date.now() - config.cliente_frecuente_dias * 24 * 60 * 60 * 1000);

  const { rows } = await sql`
    SELECT cl.id, cl.nombre, cl.telefono,
      COUNT(c.id) AS visitas, SUM(c.total) AS total_gastado, MAX(c.cerrada_at) AS ultima_visita
    FROM clientes cl
    JOIN comandas c ON c.cliente_id = cl.id AND c.estado='cerrada' AND c.cerrada_at >= ${desde}
    GROUP BY cl.id, cl.nombre, cl.telefono
    HAVING COUNT(c.id) >= ${config.cliente_frecuente_visitas}
    ORDER BY visitas DESC`;

  return res.status(200).json({
    dias: config.cliente_frecuente_dias,
    minVisitas: config.cliente_frecuente_visitas,
    descuentoPct: config.cliente_frecuente_descuento_pct,
    clientes: rows,
  });
}

module.exports = { getClientesFrecuentes };
