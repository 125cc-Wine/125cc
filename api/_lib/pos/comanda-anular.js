// api/_lib/pos/comanda-anular.js — cerrar una mesa/comanda SIN cobrar
// (se abrió por error, el cliente se fue sin pedir nada, etc.). Distinto
// de comanda-cerrar.js: no exige caja abierta, no escribe ningún
// movimiento de venta, y restaura el stock de los ítems que hubiera
// activos (se cancelan, no se vendieron). La mesa vuelve a libre.
//
// Restitución de stock en unidades de COMPRA (auditoría v2, A1): un
// producto vendido por copa consume fracción de botella (ver
// stock-unidades.js) — restituir `cantidad` (copas) tal cual inflaba el
// stock x6 en cada anulación de vino por copa.
const { withTransaction } = require('../db');
const { consumoStock } = require('./stock-unidades');

async function anularComanda(req, res) {
  const { comanda_id, registrado_por, motivo } = req.body || {};
  if (!comanda_id) return res.status(400).json({ error: "Falta comanda_id." });

  try {
    const comanda = await withTransaction(async (client) => {
      const { rows: comandaRows } = await client.sql`
        SELECT id, mesa_id, estado FROM comandas WHERE id=${comanda_id} FOR UPDATE`;
      if (!comandaRows.length) throw Object.assign(new Error('no_comanda'), { code: 'no_comanda' });
      if (comandaRows[0].estado !== 'abierta') {
        throw Object.assign(new Error('no_abierta'), { code: 'no_abierta' });
      }

      const { rows: items } = await client.sql`
        SELECT ci.id, ci.producto_id, ci.cantidad, p.unidad_venta, p.copas_por_botella
        FROM comanda_items ci JOIN productos p ON p.id = ci.producto_id
        WHERE ci.comanda_id=${comanda_id} AND ci.estado='activo'`;
      for (const it of items) {
        await client.sql`
          UPDATE productos SET stock_actual = stock_actual + ${it.cantidad * consumoStock(it)}
          WHERE id=${it.producto_id} AND stock_actual IS NOT NULL`;
      }
      // Auditoría v2, B1: el mismo rastro que ya se captura al anular una
      // línea suelta (comanda-item.js) — antes anular la comanda ENTERA
      // (el camino que más importa, es el que vacía una mesa completa)
      // dejaba las líneas sin quién ni cuándo, cayendo al created_at en
      // el panel de anulaciones.
      await client.sql`
        UPDATE comanda_items
        SET estado='anulado', anulado_at=now(), anulado_por=${registrado_por || null},
            motivo_anulacion=${motivo || 'comanda anulada'}
        WHERE comanda_id=${comanda_id} AND estado='activo'`;

      const { rows } = await client.sql`
        UPDATE comandas SET estado='anulada', cerrada_at=now()
        WHERE id=${comanda_id}
        RETURNING id, mesa_id, estado`;

      if (comandaRows[0].mesa_id) {
        await client.sql`UPDATE mesas SET estado='libre', updated_at=now() WHERE id=${comandaRows[0].mesa_id}`;
      }
      return rows[0];
    });
    return res.status(200).json({ comanda });
  } catch (err) {
    if (err.code === 'no_comanda') return res.status(404).json({ error: "Comanda no encontrada." });
    if (err.code === 'no_abierta') return res.status(409).json({ error: "La comanda ya está cerrada o anulada." });
    throw err;
  }
}

module.exports = { anularComanda };
