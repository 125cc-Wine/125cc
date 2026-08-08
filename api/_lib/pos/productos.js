// api/_lib/pos/productos.js — catálogo de venta del POS (independiente del
// Sheet de Vinos): listar para el picker de la comanda / crear-editar producto.
const { sql } = require('../db');

const UNIDADES = ['copa', 'botella', 'unidad'];

async function listProductos(req, res) {
  const soloActivos = req.query.activo !== 'all';
  const { rows } = soloActivos
    ? await sql`
        SELECT id, nombre, categoria, unidad_venta, precio, costo, stock_actual, stock_minimo, copas_por_botella, activo, vino_ref
        FROM productos WHERE activo = true ORDER BY categoria, nombre`
    : await sql`
        SELECT id, nombre, categoria, unidad_venta, precio, costo, stock_actual, stock_minimo, copas_por_botella, activo, vino_ref
        FROM productos ORDER BY categoria, nombre`;
  return res.status(200).json({ productos: rows });
}

async function upsertProducto(req, res) {
  const { id, nombre, categoria, unidad_venta, precio, costo, stock_actual, stock_minimo, copas_por_botella, activo, vino_ref } = req.body || {};
  if (!nombre || typeof nombre !== 'string' || nombre.length > 120) {
    return res.status(400).json({ error: "Falta nombre válido." });
  }
  const precioNum = Number(precio);
  if (!Number.isFinite(precioNum) || precioNum < 0) {
    return res.status(400).json({ error: "Precio inválido." });
  }
  const unidad = UNIDADES.includes(unidad_venta) ? unidad_venta : 'copa';
  const cat = (categoria && String(categoria).slice(0, 40)) || 'otros';
  const costoNum = costo != null && costo !== '' ? Number(costo) : null;
  if (costoNum != null && (!Number.isFinite(costoNum) || costoNum < 0)) {
    return res.status(400).json({ error: "Costo inválido." });
  }
  const stockAct = stock_actual != null && stock_actual !== '' ? Number(stock_actual) : null;
  const stockMin = stock_minimo != null && stock_minimo !== '' ? Number(stock_minimo) : null;
  if (stockAct != null && !Number.isFinite(stockAct)) return res.status(400).json({ error: "Stock actual inválido." });
  if (stockMin != null && !Number.isFinite(stockMin)) return res.status(400).json({ error: "Stock mínimo inválido." });
  const copasPorBotella = copas_por_botella != null && copas_por_botella !== '' ? Number(copas_por_botella) : 6;
  if (!Number.isFinite(copasPorBotella) || copasPorBotella <= 0) {
    return res.status(400).json({ error: "Copas por botella inválido." });
  }
  const act = activo !== false;
  const ref = vino_ref ? String(vino_ref).slice(0, 200) : null;

  if (id) {
    const { rows } = await sql`
      UPDATE productos SET nombre=${nombre}, categoria=${cat}, unidad_venta=${unidad},
        precio=${precioNum}, costo=${costoNum}, stock_actual=${stockAct}, stock_minimo=${stockMin},
        copas_por_botella=${copasPorBotella}, activo=${act}, vino_ref=${ref}, updated_at=now()
      WHERE id=${id}
      RETURNING id, nombre, categoria, unidad_venta, precio, costo, stock_actual, stock_minimo, copas_por_botella, activo, vino_ref`;
    if (!rows.length) return res.status(404).json({ error: "Producto no encontrado." });
    return res.status(200).json({ producto: rows[0] });
  }
  const { rows } = await sql`
    INSERT INTO productos (nombre, categoria, unidad_venta, precio, costo, stock_actual, stock_minimo, copas_por_botella, activo, vino_ref)
    VALUES (${nombre}, ${cat}, ${unidad}, ${precioNum}, ${costoNum}, ${stockAct}, ${stockMin}, ${copasPorBotella}, ${act}, ${ref})
    RETURNING id, nombre, categoria, unidad_venta, precio, costo, stock_actual, stock_minimo, copas_por_botella, activo, vino_ref`;
  return res.status(201).json({ producto: rows[0] });
}

module.exports = { listProductos, upsertProducto };
