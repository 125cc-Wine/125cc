// api/_lib/pos/proveedores.js — CRUD de proveedores. Mismo patrón que
// productos.js. Deliberadamente chico: solo nombre + contacto + notas,
// nada de órdenes de compra ni cuenta corriente.
const { sql } = require('../db');

async function listProveedores(req, res) {
  const soloActivos = req.query.activo !== 'all';
  const { rows } = soloActivos
    ? await sql`SELECT id, nombre, contacto, notas, activo FROM proveedores WHERE activo=true ORDER BY nombre`
    : await sql`SELECT id, nombre, contacto, notas, activo FROM proveedores ORDER BY nombre`;
  return res.status(200).json({ proveedores: rows });
}

async function upsertProveedor(req, res) {
  const { id, nombre, contacto, notas, activo } = req.body || {};
  if (!nombre || typeof nombre !== 'string' || nombre.length > 120) {
    return res.status(400).json({ error: "Falta nombre válido." });
  }
  const cont = contacto ? String(contacto).slice(0, 200) : null;
  const nts = notas ? String(notas).slice(0, 500) : null;
  const act = activo !== false;

  if (id) {
    const { rows } = await sql`
      UPDATE proveedores SET nombre=${nombre}, contacto=${cont}, notas=${nts}, activo=${act}, updated_at=now()
      WHERE id=${id} RETURNING id, nombre, contacto, notas, activo`;
    if (!rows.length) return res.status(404).json({ error: "Proveedor no encontrado." });
    return res.status(200).json({ proveedor: rows[0] });
  }
  const { rows } = await sql`
    INSERT INTO proveedores (nombre, contacto, notas, activo)
    VALUES (${nombre}, ${cont}, ${nts}, ${act})
    RETURNING id, nombre, contacto, notas, activo`;
  return res.status(201).json({ proveedor: rows[0] });
}

module.exports = { listProveedores, upsertProveedor };
