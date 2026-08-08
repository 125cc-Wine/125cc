// api/_lib/pos/clientes-segmento.js — todos los clientes con su
// actividad (visitas, última visita, total gastado) para armar
// campañas. El CSV en sí lo arma el frontend (mismo patrón que
// reportes/finanzas) — este endpoint solo da los datos agregados.
const { sql } = require('../db');

async function getClientesSegmento(req, res) {
  const { rows } = await sql`
    SELECT cl.id, cl.nombre, cl.telefono, cl.email,
      COUNT(c.id) FILTER (WHERE c.estado='cerrada') AS visitas,
      COALESCE(SUM(c.total) FILTER (WHERE c.estado='cerrada'), 0) AS total_gastado,
      MAX(c.cerrada_at) AS ultima_visita
    FROM clientes cl
    LEFT JOIN comandas c ON c.cliente_id = cl.id
    GROUP BY cl.id, cl.nombre, cl.telefono, cl.email
    ORDER BY visitas DESC, cl.nombre`;
  return res.status(200).json({ clientes: rows });
}

module.exports = { getClientesSegmento };
