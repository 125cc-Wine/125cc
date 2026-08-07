// api/_lib/pos/caja.js — estado de la sesión de caja abierta (con totales
// en vivo por medio de pago) y apertura de una sesión nueva.
const { sql } = require('../db');

async function getCaja(req, res) {
  const { rows: sesiones } = await sql`
    SELECT id, estado, monto_inicial, abierta_por, abierta_at
    FROM caja_sesiones WHERE estado='abierta' LIMIT 1`;

  if (!sesiones.length) {
    return res.status(200).json({ sesion: null });
  }
  const sesion = sesiones[0];

  const { rows: movimientos } = await sql`
    SELECT tipo, medio_pago, monto FROM caja_movimientos WHERE caja_sesion_id=${sesion.id}`;

  // Totales por tipo+medio de pago, para el resumen en vivo de la vista Caja.
  const totales = {};
  for (const m of movimientos) {
    const key = `${m.tipo}_${m.medio_pago}`;
    totales[key] = (totales[key] || 0) + Number(m.monto);
  }

  return res.status(200).json({ sesion, totales, movimientos });
}

async function abrirCaja(req, res) {
  const { monto_inicial, abierta_por } = req.body || {};
  const monto = monto_inicial != null && monto_inicial !== '' ? Number(monto_inicial) : 0;
  if (!Number.isFinite(monto) || monto < 0) {
    return res.status(400).json({ error: "Monto inicial inválido." });
  }
  const abierta = abierta_por ? String(abierta_por).slice(0, 60) : null;

  try {
    const { rows } = await sql`
      INSERT INTO caja_sesiones (monto_inicial, abierta_por)
      VALUES (${monto}, ${abierta})
      RETURNING id, estado, monto_inicial, abierta_por, abierta_at`;
    return res.status(201).json({ sesion: rows[0] });
  } catch (err) {
    if (String(err.message || '').includes('one_open_caja_sesion')) {
      return res.status(409).json({ error: "Ya hay una caja abierta." });
    }
    throw err;
  }
}

module.exports = { getCaja, abrirCaja };
