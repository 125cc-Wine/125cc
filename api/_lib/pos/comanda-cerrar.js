// api/_lib/pos/comanda-cerrar.js — cobrar y cerrar una comanda: el total se
// calcula server-side desde los ítems activos (nunca se confía en un total
// mandado por el cliente), la mesa vuelve a 'libre', y se exige una caja
// abierta (si no hay, se rechaza el cobro) — se escribe el movimiento de
// venta correspondiente en la MISMA transacción, para que la caja y las
// comandas cerradas nunca queden desincronizadas.
const { withTransaction } = require('../db');

const MEDIOS = ['efectivo', 'tarjeta', 'transferencia', 'mixto'];
// caja_movimientos.medio_pago no tiene 'mixto' (no sabemos el split exacto
// efectivo/tarjeta de un cobro mixto sin una UI más granular) — se anota
// como 'otro' en el movimiento de caja.
const MEDIO_A_CAJA = { efectivo: 'efectivo', tarjeta: 'tarjeta', transferencia: 'transferencia', mixto: 'otro' };

async function cerrarComanda(req, res) {
  const { comanda_id, medio_pago } = req.body || {};
  if (!comanda_id || !MEDIOS.includes(medio_pago)) {
    return res.status(400).json({ error: "Falta comanda_id o medio_pago inválido." });
  }

  try {
    const comanda = await withTransaction(async (client) => {
      const { rows: sesiones } = await client.sql`
        SELECT id FROM caja_sesiones WHERE estado='abierta' LIMIT 1`;
      if (!sesiones.length) throw Object.assign(new Error('sin_caja'), { code: 'sin_caja' });

      const { rows: openRows } = await client.sql`
        SELECT id, mesa_id, estado FROM comandas WHERE id=${comanda_id} FOR UPDATE`;
      if (!openRows.length) throw Object.assign(new Error('not_found'), { code: 'not_found' });
      if (openRows[0].estado !== 'abierta') {
        throw Object.assign(new Error('not_open'), { code: 'not_open' });
      }

      const { rows: totalRows } = await client.sql`
        SELECT COALESCE(SUM(precio_unitario * cantidad), 0) AS total
        FROM comanda_items WHERE comanda_id=${comanda_id} AND estado='activo'`;
      const total = totalRows[0].total;
      if (Number(total) <= 0) throw Object.assign(new Error('sin_items'), { code: 'sin_items' });

      const { rows } = await client.sql`
        UPDATE comandas SET estado='cerrada', medio_pago=${medio_pago}, total=${total}, cerrada_at=now()
        WHERE id=${comanda_id}
        RETURNING id, mesa_id, estado, medio_pago, total, cerrada_at`;

      if (openRows[0].mesa_id) {
        await client.sql`UPDATE mesas SET estado='libre', updated_at=now() WHERE id=${openRows[0].mesa_id}`;
      }

      await client.sql`
        INSERT INTO caja_movimientos (caja_sesion_id, tipo, comanda_id, medio_pago, monto)
        VALUES (${sesiones[0].id}, 'venta', ${comanda_id}, ${MEDIO_A_CAJA[medio_pago]}, ${total})`;

      return rows[0];
    });
    return res.status(200).json({ comanda });
  } catch (err) {
    if (err.code === 'sin_caja') return res.status(409).json({ error: "No hay una caja abierta. Abrí la caja antes de cobrar." });
    if (err.code === 'not_found') return res.status(404).json({ error: "Comanda no encontrada." });
    if (err.code === 'not_open') return res.status(409).json({ error: "La comanda ya está cerrada o anulada." });
    if (err.code === 'sin_items') return res.status(409).json({ error: "La comanda no tiene ítems activos para cobrar." });
    throw err;
  }
}

module.exports = { cerrarComanda };
