// api/_lib/pos/cuenta-corriente.js — cuenta corriente ("fiado") de un
// cliente. El saldo se deriva del ledger (SUM(cargo) - SUM(pago)) en
// vez de una columna cacheada, mismo criterio que stock_movimientos —
// nunca se desalinea. Los 'cargo' los escribe comanda-cerrar.js al
// cobrar una comanda como cuenta_corriente; acá solo se leen y se
// registran los 'pago' (cuando el cliente salda parte o toda la deuda).
const { sql, withTransaction } = require('../db');

async function getCuentaCorriente(req, res) {
  const clienteId = req.query.cliente_id;
  if (!clienteId) return res.status(400).json({ error: "Falta cliente_id." });

  const { rows: saldoRows } = await sql`
    SELECT COALESCE(SUM(CASE WHEN tipo='cargo' THEN monto ELSE -monto END), 0) AS saldo
    FROM cuenta_corriente_movimientos WHERE cliente_id=${clienteId}`;

  const { rows: movimientos } = await sql`
    SELECT id, tipo, monto, comanda_id, medio_pago, descripcion, registrado_por, created_at
    FROM cuenta_corriente_movimientos
    WHERE cliente_id=${clienteId}
    ORDER BY created_at DESC LIMIT 50`;

  return res.status(200).json({ saldo: saldoRows[0].saldo, movimientos });
}

// Registrar un pago del cliente contra su deuda — entra plata real a
// caja (a diferencia del cargo original, que no movió caja). Exige
// caja abierta, igual que cualquier otro ingreso de efectivo/tarjeta.
async function registrarPago(req, res) {
  const { cliente_id, monto, medio_pago, descripcion, registrado_por } = req.body || {};
  if (!cliente_id) return res.status(400).json({ error: "Falta cliente_id." });
  const montoNum = Number(monto);
  if (!Number.isFinite(montoNum) || montoNum <= 0) return res.status(400).json({ error: "Monto inválido." });
  const MEDIOS = ['efectivo', 'tarjeta', 'transferencia'];
  if (!MEDIOS.includes(medio_pago)) return res.status(400).json({ error: "Medio de pago inválido." });

  try {
    const movimiento = await withTransaction(async (client) => {
      const { rows: sesiones } = await client.sql`SELECT id FROM caja_sesiones WHERE estado='abierta' LIMIT 1`;
      if (!sesiones.length) throw Object.assign(new Error('sin_caja'), { code: 'sin_caja' });

      const { rows } = await client.sql`
        INSERT INTO cuenta_corriente_movimientos (cliente_id, tipo, monto, medio_pago, descripcion, registrado_por)
        VALUES (${cliente_id}, 'pago', ${montoNum}, ${medio_pago}, ${descripcion || null}, ${registrado_por || null})
        RETURNING id, tipo, monto, medio_pago, descripcion, created_at`;

      await client.sql`
        INSERT INTO caja_movimientos (caja_sesion_id, tipo, medio_pago, monto, descripcion)
        VALUES (${sesiones[0].id}, 'cobro_cuenta_corriente', ${medio_pago}, ${montoNum}, ${descripcion || 'Pago de cuenta corriente'})`;

      return rows[0];
    });
    return res.status(201).json({ movimiento });
  } catch (err) {
    if (err.code === 'sin_caja') return res.status(409).json({ error: "No hay una caja abierta." });
    throw err;
  }
}

module.exports = { getCuentaCorriente, registrarPago };
