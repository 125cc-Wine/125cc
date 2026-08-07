// api/_lib/pos/gastos.js — lo que realmente se gastó (a diferencia de
// costos-fijos.js, que es presupuesto). Baja lógica al eliminar: un
// gasto ya cargado es un registro histórico, no se borra de la tabla.
const { sql } = require('../db');

const TIPOS = ['fijo', 'variable'];

function rangoMes(mes) {
  const [y, m] = mes.split('-').map(Number);
  const inicio = `${mes}-01`;
  const finExclusivo = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  return { inicio, finExclusivo };
}

async function listGastos(req, res) {
  const mes = req.query.mes;
  if (mes && !/^\d{4}-\d{2}$/.test(mes)) {
    return res.status(400).json({ error: "Formato de mes inválido (usar YYYY-MM)." });
  }

  let rows;
  if (mes) {
    const { inicio, finExclusivo } = rangoMes(mes);
    ({ rows } = await sql`
      SELECT g.id, g.categoria, g.tipo, g.proveedor_id, pr.nombre AS proveedor_nombre,
             g.monto, g.descripcion, g.fecha, g.registrado_por, g.created_at
      FROM gastos g LEFT JOIN proveedores pr ON pr.id = g.proveedor_id
      WHERE g.estado='activo' AND g.fecha >= ${inicio} AND g.fecha < ${finExclusivo}
      ORDER BY g.fecha DESC, g.id DESC`);
  } else {
    ({ rows } = await sql`
      SELECT g.id, g.categoria, g.tipo, g.proveedor_id, pr.nombre AS proveedor_nombre,
             g.monto, g.descripcion, g.fecha, g.registrado_por, g.created_at
      FROM gastos g LEFT JOIN proveedores pr ON pr.id = g.proveedor_id
      WHERE g.estado='activo'
      ORDER BY g.fecha DESC, g.id DESC
      LIMIT 200`);
  }
  return res.status(200).json({ gastos: rows });
}

async function upsertGasto(req, res) {
  const { id, categoria, tipo, proveedor_id, monto, descripcion, fecha, registrado_por, accion } = req.body || {};

  if (accion === 'eliminar') {
    if (!id) return res.status(400).json({ error: "Falta id." });
    const { rows } = await sql`UPDATE gastos SET estado='eliminado' WHERE id=${id} RETURNING id`;
    if (!rows.length) return res.status(404).json({ error: "Gasto no encontrado." });
    return res.status(200).json({ ok: true });
  }

  if (!categoria || typeof categoria !== 'string' || !categoria.trim() || categoria.length > 60) {
    return res.status(400).json({ error: "Falta categoría válida." });
  }
  if (!TIPOS.includes(tipo)) return res.status(400).json({ error: "Tipo inválido (usar 'fijo' o 'variable')." });
  const montoNum = Number(monto);
  if (!Number.isFinite(montoNum) || montoNum <= 0) return res.status(400).json({ error: "Monto inválido." });
  const fechaVal = fecha || new Date().toISOString().slice(0, 10);
  const provId = proveedor_id || null;

  if (id) {
    const { rows } = await sql`
      UPDATE gastos SET categoria=${categoria}, tipo=${tipo}, proveedor_id=${provId}, monto=${montoNum},
        descripcion=${descripcion || null}, fecha=${fechaVal}
      WHERE id=${id}
      RETURNING id, categoria, tipo, proveedor_id, monto, descripcion, fecha, estado, registrado_por`;
    if (!rows.length) return res.status(404).json({ error: "Gasto no encontrado." });
    return res.status(200).json({ gasto: rows[0] });
  }
  const { rows } = await sql`
    INSERT INTO gastos (categoria, tipo, proveedor_id, monto, descripcion, fecha, registrado_por)
    VALUES (${categoria}, ${tipo}, ${provId}, ${montoNum}, ${descripcion || null}, ${fechaVal}, ${registrado_por || null})
    RETURNING id, categoria, tipo, proveedor_id, monto, descripcion, fecha, estado, registrado_por`;
  return res.status(201).json({ gasto: rows[0] });
}

module.exports = { listGastos, upsertGasto };
