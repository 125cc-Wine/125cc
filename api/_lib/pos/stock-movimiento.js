// api/_lib/pos/stock-movimiento.js — mermas y conteo físico: un ajuste
// de stock que NO vino de una venta. comanda-item.js solo descuenta
// stock por venta; esto cubre el resto (botella rota, vencida, o el
// stock del sistema desalineado del real).
const { withTransaction, sql } = require('../db');

const MOTIVOS_MERMA = ['rotura', 'vencimiento', 'robo', 'otro'];

// Merma: resta cantidad del stock (permite quedar negativo, no bloquea
// — es un registro de lo que se perdió, no una venta).
async function registrarMerma(req, res) {
  const { producto_id, cantidad, motivo, registrado_por } = req.body || {};
  if (!producto_id) return res.status(400).json({ error: "Falta producto_id." });
  const cant = Number(cantidad);
  if (!Number.isFinite(cant) || cant <= 0) return res.status(400).json({ error: "Cantidad inválida." });
  const mot = MOTIVOS_MERMA.includes(motivo) ? motivo : 'otro';

  try {
    const movimiento = await withTransaction(async (client) => {
      const { rows: prodRows } = await client.sql`
        SELECT stock_actual FROM productos WHERE id=${producto_id} FOR UPDATE`;
      if (!prodRows.length) throw Object.assign(new Error('no_producto'), { code: 'no_producto' });
      const antes = prodRows[0].stock_actual;
      const despues = antes != null ? antes - cant : null;

      if (despues != null) {
        await client.sql`UPDATE productos SET stock_actual=${despues}, updated_at=now() WHERE id=${producto_id}`;
      }
      const { rows } = await client.sql`
        INSERT INTO stock_movimientos (producto_id, tipo, cantidad, motivo, stock_antes, stock_despues, registrado_por)
        VALUES (${producto_id}, 'merma', ${-cant}, ${mot}, ${antes}, ${despues}, ${registrado_por || null})
        RETURNING id, producto_id, tipo, cantidad, motivo, stock_antes, stock_despues, created_at`;
      return rows[0];
    });
    return res.status(201).json({ movimiento });
  } catch (err) {
    if (err.code === 'no_producto') return res.status(404).json({ error: "Producto no encontrado." });
    throw err;
  }
}

// Conteo físico: fija el stock a lo contado a mano, registra el delta.
async function registrarConteo(req, res) {
  const { producto_id, cantidad_contada, registrado_por } = req.body || {};
  if (!producto_id) return res.status(400).json({ error: "Falta producto_id." });
  const contado = Number(cantidad_contada);
  if (!Number.isFinite(contado) || contado < 0) return res.status(400).json({ error: "Cantidad contada inválida." });

  try {
    const movimiento = await withTransaction(async (client) => {
      const { rows: prodRows } = await client.sql`
        SELECT stock_actual FROM productos WHERE id=${producto_id} FOR UPDATE`;
      if (!prodRows.length) throw Object.assign(new Error('no_producto'), { code: 'no_producto' });
      const antes = prodRows[0].stock_actual;
      const delta = contado - (antes != null ? Number(antes) : 0);

      await client.sql`UPDATE productos SET stock_actual=${contado}, updated_at=now() WHERE id=${producto_id}`;
      const { rows } = await client.sql`
        INSERT INTO stock_movimientos (producto_id, tipo, cantidad, motivo, stock_antes, stock_despues, registrado_por)
        VALUES (${producto_id}, 'ajuste_conteo', ${delta}, 'conteo físico', ${antes}, ${contado}, ${registrado_por || null})
        RETURNING id, producto_id, tipo, cantidad, motivo, stock_antes, stock_despues, created_at`;
      return rows[0];
    });
    return res.status(201).json({ movimiento });
  } catch (err) {
    if (err.code === 'no_producto') return res.status(404).json({ error: "Producto no encontrado." });
    throw err;
  }
}

async function listMovimientos(req, res) {
  const productoId = req.query.producto_id;
  const { rows } = productoId
    ? await sql`
        SELECT sm.id, sm.producto_id, p.nombre AS producto_nombre, sm.tipo, sm.cantidad, sm.motivo,
               sm.stock_antes, sm.stock_despues, sm.registrado_por, sm.created_at
        FROM stock_movimientos sm JOIN productos p ON p.id = sm.producto_id
        WHERE sm.producto_id = ${productoId}
        ORDER BY sm.created_at DESC LIMIT 50`
    : await sql`
        SELECT sm.id, sm.producto_id, p.nombre AS producto_nombre, sm.tipo, sm.cantidad, sm.motivo,
               sm.stock_antes, sm.stock_despues, sm.registrado_por, sm.created_at
        FROM stock_movimientos sm JOIN productos p ON p.id = sm.producto_id
        ORDER BY sm.created_at DESC LIMIT 50`;
  return res.status(200).json({ movimientos: rows });
}

// Franja de cifras del panel Stock (auditoría, sección 02 — "¿qué
// repongo y cuánta plata tengo parada?"): valorización a costo de lo
// que hay en stock, cuántos productos están bajo el mínimo, mermas
// del mes (valorizadas a costo), fecha del último conteo físico.
async function getResumenStock(req, res) {
  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);

  const { rows: valorRows } = await sql`
    SELECT COALESCE(SUM(stock_actual * costo), 0) AS valorizado
    FROM productos
    WHERE activo=true AND stock_actual IS NOT NULL AND costo IS NOT NULL AND stock_actual > 0`;

  const { rows: bajoMinimoRows } = await sql`
    SELECT COUNT(*) AS cantidad
    FROM productos
    WHERE activo=true AND stock_actual IS NOT NULL AND stock_minimo IS NOT NULL AND stock_actual <= stock_minimo`;

  const { rows: mermasRows } = await sql`
    SELECT COALESCE(SUM(ABS(sm.cantidad) * COALESCE(p.costo,0)), 0) AS valor_mermado, COUNT(*) AS cantidad
    FROM stock_movimientos sm JOIN productos p ON p.id = sm.producto_id
    WHERE sm.tipo='merma' AND sm.created_at >= ${inicioMes.toISOString()}`;

  const { rows: ultimoConteoRows } = await sql`
    SELECT MAX(created_at) AS fecha FROM stock_movimientos WHERE tipo='ajuste_conteo'`;

  return res.status(200).json({
    valorizado: valorRows[0].valorizado,
    bajoMinimo: bajoMinimoRows[0].cantidad,
    mermasValor: mermasRows[0].valor_mermado,
    mermasCantidad: mermasRows[0].cantidad,
    ultimoConteo: ultimoConteoRows[0].fecha,
  });
}

module.exports = { registrarMerma, registrarConteo, listMovimientos, getResumenStock };
