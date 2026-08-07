// api/_lib/pos/caja-cerrar.js — cierre de la sesión de caja: calcula el
// efectivo esperado en el cajón a partir de los movimientos (solo los en
// efectivo afectan el cajón físico — tarjeta/transferencia no), y guarda
// la diferencia contra lo contado a mano.
const { withTransaction } = require('../db');

async function cerrarCaja(req, res) {
  const { monto_final_contado, cerrada_por } = req.body || {};
  const contado = Number(monto_final_contado);
  if (!Number.isFinite(contado) || contado < 0) {
    return res.status(400).json({ error: "Monto contado inválido." });
  }
  const cerrada = cerrada_por ? String(cerrada_por).slice(0, 60) : null;

  try {
    const sesion = await withTransaction(async (client) => {
      const { rows: sesiones } = await client.sql`
        SELECT id, monto_inicial FROM caja_sesiones WHERE estado='abierta' FOR UPDATE`;
      if (!sesiones.length) throw Object.assign(new Error('sin_caja'), { code: 'sin_caja' });
      const sesionId = sesiones[0].id;

      // Solo movimientos en efectivo mueven el cajón físico. 'retiro' resta,
      // el resto (venta/ingreso/propina) suma.
      const { rows: movRows } = await client.sql`
        SELECT tipo, monto FROM caja_movimientos
        WHERE caja_sesion_id=${sesionId} AND medio_pago='efectivo'`;
      const netoEfectivo = movRows.reduce((acc, m) =>
        acc + (m.tipo === 'retiro' ? -Number(m.monto) : Number(m.monto)), 0);

      const esperado = Number(sesiones[0].monto_inicial) + netoEfectivo;
      const diferencia = contado - esperado;

      const { rows } = await client.sql`
        UPDATE caja_sesiones SET estado='cerrada', monto_final_contado=${contado},
          monto_final_esperado=${esperado}, diferencia=${diferencia},
          cerrada_por=${cerrada}, cerrada_at=now()
        WHERE id=${sesionId}
        RETURNING id, estado, monto_inicial, monto_final_contado, monto_final_esperado, diferencia, cerrada_at`;
      return rows[0];
    });
    return res.status(200).json({ sesion });
  } catch (err) {
    if (err.code === 'sin_caja') return res.status(409).json({ error: "No hay una caja abierta." });
    throw err;
  }
}

module.exports = { cerrarCaja };
