// api/_lib/pos/clientes.js — búsqueda y alta de clientes. A diferencia
// de "Mis Catas" (Sheets, email opcional sin unicidad), esta es la base
// real desde la que se arma historial de compras — el teléfono es único
// cuando se carga (WhatsApp, el dato más útil en un wine bar argentino).
//
// cuit/razon_social/condicion_iva (Fase 7): datos fiscales para poder
// facturar. Un cliente Responsable Inscripto con CUIT factura Factura A
// automáticamente al cobrar; el resto factura Consumidor Final (B).
//
// cuenta_corriente_habilitada: solo clientes marcados explícitamente
// como de confianza pueden fiar — nunca por default (ver comanda-
// cerrar.js y cuenta-corriente.js).
const { sql } = require('../db');

const CONDICIONES_IVA = ['responsable_inscripto', 'monotributista', 'exento', 'consumidor_final'];

async function listClientes(req, res) {
  const q = (req.query.q || '').trim();
  const { rows } = q
    ? await sql`
        SELECT id, nombre, telefono, email, notas, cuit, razon_social, condicion_iva, cuenta_corriente_habilitada, created_at
        FROM clientes
        WHERE nombre ILIKE ${'%' + q + '%'} OR telefono ILIKE ${'%' + q + '%'} OR email ILIKE ${'%' + q + '%'}
        ORDER BY nombre LIMIT 30`
    : await sql`SELECT id, nombre, telefono, email, notas, cuit, razon_social, condicion_iva, cuenta_corriente_habilitada, created_at FROM clientes ORDER BY nombre LIMIT 100`;
  return res.status(200).json({ clientes: rows });
}

async function upsertCliente(req, res) {
  const { id, nombre, telefono, email, notas, cuit, razon_social, condicion_iva, cuenta_corriente_habilitada, creado_por } = req.body || {};
  if (!nombre || typeof nombre !== 'string' || !nombre.trim() || nombre.length > 120) {
    return res.status(400).json({ error: "Falta nombre válido." });
  }
  if (telefono != null && telefono !== '' && (typeof telefono !== 'string' || telefono.length > 30)) {
    return res.status(400).json({ error: "Teléfono inválido." });
  }
  if (email && (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return res.status(400).json({ error: "Email inválido." });
  }
  const condIva = CONDICIONES_IVA.includes(condicion_iva) ? condicion_iva : 'consumidor_final';
  const cuitVal = cuit ? String(cuit).replace(/[^0-9]/g, '') : null;
  if (condIva === 'responsable_inscripto' && !cuitVal) {
    return res.status(400).json({ error: "Falta CUIT para Responsable Inscripto." });
  }
  if (cuitVal && cuitVal.length !== 11) {
    return res.status(400).json({ error: "CUIT inválido (deben ser 11 dígitos)." });
  }
  const tel = telefono ? telefono.trim() : null;
  const nombreVal = nombre.trim();
  const emailVal = email ? email.trim() : null;
  const notasVal = notas || null;
  const razonSocialVal = razon_social ? String(razon_social).trim().slice(0, 120) : null;
  const ccHabilitada = cuenta_corriente_habilitada === true;

  try {
    if (id) {
      const { rows } = await sql`
        UPDATE clientes SET nombre=${nombreVal}, telefono=${tel}, email=${emailVal}, notas=${notasVal},
          cuit=${cuitVal}, razon_social=${razonSocialVal}, condicion_iva=${condIva},
          cuenta_corriente_habilitada=${ccHabilitada}, updated_at=now()
        WHERE id=${id}
        RETURNING id, nombre, telefono, email, notas, cuit, razon_social, condicion_iva, cuenta_corriente_habilitada`;
      if (!rows.length) return res.status(404).json({ error: "Cliente no encontrado." });
      return res.status(200).json({ cliente: rows[0] });
    }
    const { rows } = await sql`
      INSERT INTO clientes (nombre, telefono, email, notas, cuit, razon_social, condicion_iva, cuenta_corriente_habilitada, creado_por)
      VALUES (${nombreVal}, ${tel}, ${emailVal}, ${notasVal}, ${cuitVal}, ${razonSocialVal}, ${condIva}, ${ccHabilitada}, ${creado_por || null})
      RETURNING id, nombre, telefono, email, notas, cuit, razon_social, condicion_iva, cuenta_corriente_habilitada`;
    return res.status(201).json({ cliente: rows[0] });
  } catch (err) {
    if (String(err.message || '').includes('idx_clientes_telefono')) {
      return res.status(409).json({ error: "Ya existe un cliente con ese teléfono." });
    }
    throw err;
  }
}

// Franja de cifras del panel Clientes (auditoría, sección 02 — "¿quién
// vuelve y quién me debe?"): total fiado abierto y cuántos clientes
// tienen saldo — antes la deuda solo se veía entrando cliente por
// cliente, no había ninguna cifra agregada. El saldo por cliente se
// deriva del mismo ledger que ya usa cuenta-corriente.js (SUM(cargo) -
// SUM(pago)), acá agregado sobre todos los clientes con movimientos.
async function getResumenClientes(req, res) {
  const { rows: fiadoRows } = await sql`
    SELECT COUNT(*) AS clientes_con_saldo, COALESCE(SUM(saldo), 0) AS saldo_total
    FROM (
      SELECT cliente_id, SUM(CASE WHEN tipo='cargo' THEN monto ELSE -monto END) AS saldo
      FROM cuenta_corriente_movimientos
      GROUP BY cliente_id
      HAVING SUM(CASE WHEN tipo='cargo' THEN monto ELSE -monto END) > 0
    ) t`;

  const { rows: totalClientesRows } = await sql`SELECT COUNT(*) AS total FROM clientes`;

  return res.status(200).json({
    saldoTotal: fiadoRows[0].saldo_total,
    clientesConSaldo: fiadoRows[0].clientes_con_saldo,
    totalClientes: totalClientesRows[0].total,
  });
}

module.exports = { listClientes, upsertCliente, getResumenClientes };
