// api/_lib/pos/caja-movimiento.js — registrar un movimiento manual de
// caja (retiro/ingreso/propina) dentro de la sesión abierta. Los
// movimientos de tipo 'venta' los escribe comanda-cerrar.js, no acá.
const { sql } = require('../db');

const TIPOS = ['retiro', 'ingreso', 'propina'];
const MEDIOS = ['efectivo', 'tarjeta', 'transferencia', 'otro'];

async function registrarMovimiento(req, res) {
  const { tipo, medio_pago, monto, descripcion } = req.body || {};
  if (!TIPOS.includes(tipo)) return res.status(400).json({ error: "Tipo de movimiento inválido." });
  if (!MEDIOS.includes(medio_pago)) return res.status(400).json({ error: "Medio de pago inválido." });
  const montoNum = Number(monto);
  if (!Number.isFinite(montoNum) || montoNum <= 0) return res.status(400).json({ error: "Monto inválido." });
  const desc = descripcion ? String(descripcion).slice(0, 200) : null;

  const { rows: sesiones } = await sql`SELECT id FROM caja_sesiones WHERE estado='abierta' LIMIT 1`;
  if (!sesiones.length) return res.status(409).json({ error: "No hay una caja abierta." });

  const { rows } = await sql`
    INSERT INTO caja_movimientos (caja_sesion_id, tipo, medio_pago, monto, descripcion)
    VALUES (${sesiones[0].id}, ${tipo}, ${medio_pago}, ${montoNum}, ${desc})
    RETURNING id, tipo, medio_pago, monto, descripcion, created_at`;
  return res.status(201).json({ movimiento: rows[0] });
}

module.exports = { registrarMovimiento };
