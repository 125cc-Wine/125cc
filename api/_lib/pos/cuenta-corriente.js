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

      // Auditoría v2, B3: antes se podía registrar un pago por cualquier
      // monto contra cualquier cliente_id, sin chequear que existiera,
      // que debiera esa plata, ni lockear — dos toques al botón entraban
      // los dos pagos y el saldo podía quedar negativo (como si el
      // local le debiera al cliente). Lockear la fila del cliente
      // serializa dos pagos simultáneos del mismo cliente; el saldo se
      // lee ya con el lock tomado.
      const { rows: cliRows } = await client.sql`SELECT id FROM clientes WHERE id=${cliente_id} FOR UPDATE`;
      if (!cliRows.length) throw Object.assign(new Error('no_cliente'), { code: 'no_cliente' });

      const { rows: saldoRows } = await client.sql`
        SELECT COALESCE(SUM(CASE WHEN tipo='cargo' THEN monto ELSE -monto END), 0) AS saldo
        FROM cuenta_corriente_movimientos WHERE cliente_id=${cliente_id}`;
      const saldo = Number(saldoRows[0].saldo);
      if (saldo <= 0) throw Object.assign(new Error('sin_deuda'), { code: 'sin_deuda' });
      // Tolerancia de $1, mismo criterio que el ajuste de split de pagos.
      if (montoNum > saldo + 1) throw Object.assign(new Error('excede'), { code: 'excede', saldo });

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
    if (err.code === 'no_cliente') return res.status(404).json({ error: "Cliente no encontrado." });
    if (err.code === 'sin_deuda') return res.status(409).json({ error: "Este cliente no tiene deuda pendiente." });
    if (err.code === 'excede') return res.status(400).json({ error: `El pago supera la deuda ($${err.saldo}).` });
    throw err;
  }
}

module.exports = { getCuentaCorriente, registrarPago };
