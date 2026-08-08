// api/_lib/pos/clientes.js — búsqueda y alta de clientes. A diferencia
// de "Mis Catas" (Sheets, email opcional sin unicidad), esta es la base
// real desde la que se arma historial de compras — el teléfono es único
// cuando se carga (WhatsApp, el dato más útil en un wine bar argentino).
const { sql } = require('../db');

async function listClientes(req, res) {
  const q = (req.query.q || '').trim();
  const { rows } = q
    ? await sql`
        SELECT id, nombre, telefono, email, notas, created_at
        FROM clientes
        WHERE nombre ILIKE ${'%' + q + '%'} OR telefono ILIKE ${'%' + q + '%'} OR email ILIKE ${'%' + q + '%'}
        ORDER BY nombre LIMIT 30`
    : await sql`SELECT id, nombre, telefono, email, notas, created_at FROM clientes ORDER BY nombre LIMIT 100`;
  return res.status(200).json({ clientes: rows });
}

async function upsertCliente(req, res) {
  const { id, nombre, telefono, email, notas, creado_por } = req.body || {};
  if (!nombre || typeof nombre !== 'string' || !nombre.trim() || nombre.length > 120) {
    return res.status(400).json({ error: "Falta nombre válido." });
  }
  if (telefono != null && telefono !== '' && (typeof telefono !== 'string' || telefono.length > 30)) {
    return res.status(400).json({ error: "Teléfono inválido." });
  }
  if (email && (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return res.status(400).json({ error: "Email inválido." });
  }
  const tel = telefono ? telefono.trim() : null;
  const nombreVal = nombre.trim();
  const emailVal = email ? email.trim() : null;
  const notasVal = notas || null;

  try {
    if (id) {
      const { rows } = await sql`
        UPDATE clientes SET nombre=${nombreVal}, telefono=${tel}, email=${emailVal}, notas=${notasVal}, updated_at=now()
        WHERE id=${id}
        RETURNING id, nombre, telefono, email, notas`;
      if (!rows.length) return res.status(404).json({ error: "Cliente no encontrado." });
      return res.status(200).json({ cliente: rows[0] });
    }
    const { rows } = await sql`
      INSERT INTO clientes (nombre, telefono, email, notas, creado_por)
      VALUES (${nombreVal}, ${tel}, ${emailVal}, ${notasVal}, ${creado_por || null})
      RETURNING id, nombre, telefono, email, notas`;
    return res.status(201).json({ cliente: rows[0] });
  } catch (err) {
    if (String(err.message || '').includes('idx_clientes_telefono')) {
      return res.status(409).json({ error: "Ya existe un cliente con ese teléfono." });
    }
    throw err;
  }
}

module.exports = { listClientes, upsertCliente };
