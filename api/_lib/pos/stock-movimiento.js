// api/_lib/pos/stock-movimiento.js — mermas y conteo físico: un ajuste
// de stock que NO vino de una venta. comanda-item.js solo descuenta
// stock por venta; esto cubre el resto (botella rota, vencida, o el
// stock del sistema desalineado del real).
//
// Costeo de insumos (handoff/ANALISIS-COSTEO-INSUMOS.md), Tier 3,
// hallazgo 4: antes esto solo servía productos. Cada función ahora acepta
// producto_id O insumo_id (exactamente uno) — mismo criterio que
// stock_movimientos.insumo_id (num_nonnulls) y proveedor-producto.js.
const { withTransaction, sql } = require('../db');

const MOTIVOS_MERMA = ['rotura', 'vencimiento', 'robo', 'otro'];

// De qué entidad es esta merma/conteo — exactamente uno de los dos ids
// en el body. Lanza bad_request si viene mal.
function resolverEntidad(body) {
  const { producto_id, insumo_id } = body || {};
  if (producto_id && insumo_id) throw Object.assign(new Error('bad_request'), { code: 'bad_request', msg: 'Mandá producto_id o insumo_id, no los dos.' });
  if (producto_id) return { campo: 'producto_id', id: producto_id };
  if (insumo_id) return { campo: 'insumo_id', id: insumo_id };
  throw Object.assign(new Error('bad_request'), { code: 'bad_request', msg: 'Falta producto_id o insumo_id.' });
}

// Merma: resta cantidad del stock (permite quedar negativo, no bloquea
// — es un registro de lo que se perdió, no una venta).
async function registrarMerma(req, res) {
  let entidad;
  try { entidad = resolverEntidad(req.body); }
  catch (err) { return res.status(400).json({ error: err.msg }); }
  const { cantidad, motivo, registrado_por } = req.body || {};
  const cant = Number(cantidad);
  if (!Number.isFinite(cant) || cant <= 0) return res.status(400).json({ error: "Cantidad inválida." });
  const mot = MOTIVOS_MERMA.includes(motivo) ? motivo : 'otro';

  try {
    const movimiento = await withTransaction(async (client) => {
      if (entidad.campo === 'producto_id') {
        const { rows: prodRows } = await client.sql`SELECT stock_actual FROM productos WHERE id=${entidad.id} FOR UPDATE`;
        if (!prodRows.length) throw Object.assign(new Error('no_entidad'), { code: 'no_entidad' });
        const antes = prodRows[0].stock_actual;
        const despues = antes != null ? antes - cant : null;
        if (despues != null) await client.sql`UPDATE productos SET stock_actual=${despues}, updated_at=now() WHERE id=${entidad.id}`;
        const { rows } = await client.sql`
          INSERT INTO stock_movimientos (producto_id, tipo, cantidad, motivo, stock_antes, stock_despues, registrado_por)
          VALUES (${entidad.id}, 'merma', ${-cant}, ${mot}, ${antes}, ${despues}, ${registrado_por || null})
          RETURNING id, producto_id, insumo_id, tipo, cantidad, motivo, stock_antes, stock_despues, created_at`;
        return rows[0];
      }
      const { rows: insRows } = await client.sql`SELECT stock_actual FROM insumos WHERE id=${entidad.id} FOR UPDATE`;
      if (!insRows.length) throw Object.assign(new Error('no_entidad'), { code: 'no_entidad' });
      const antes = insRows[0].stock_actual;
      const despues = antes != null ? antes - cant : null;
      if (despues != null) await client.sql`UPDATE insumos SET stock_actual=${despues}, updated_at=now() WHERE id=${entidad.id}`;
      const { rows } = await client.sql`
        INSERT INTO stock_movimientos (insumo_id, tipo, cantidad, motivo, stock_antes, stock_despues, registrado_por)
        VALUES (${entidad.id}, 'merma', ${-cant}, ${mot}, ${antes}, ${despues}, ${registrado_por || null})
        RETURNING id, producto_id, insumo_id, tipo, cantidad, motivo, stock_antes, stock_despues, created_at`;
      return rows[0];
    });
    return res.status(201).json({ movimiento });
  } catch (err) {
    if (err.code === 'no_entidad') return res.status(404).json({ error: entidad.campo === 'producto_id' ? "Producto no encontrado." : "Insumo no encontrado." });
    throw err;
  }
}

// Conteo físico: fija el stock a lo contado a mano, registra el delta.
async function registrarConteo(req, res) {
  let entidad;
  try { entidad = resolverEntidad(req.body); }
  catch (err) { return res.status(400).json({ error: err.msg }); }
  const { cantidad_contada, registrado_por } = req.body || {};
  const contado = Number(cantidad_contada);
  if (!Number.isFinite(contado) || contado < 0) return res.status(400).json({ error: "Cantidad contada inválida." });

  try {
    const movimiento = await withTransaction(async (client) => {
      if (entidad.campo === 'producto_id') {
        const { rows: prodRows } = await client.sql`SELECT stock_actual FROM productos WHERE id=${entidad.id} FOR UPDATE`;
        if (!prodRows.length) throw Object.assign(new Error('no_entidad'), { code: 'no_entidad' });
        const antes = prodRows[0].stock_actual;
        const delta = contado - (antes != null ? Number(antes) : 0);
        await client.sql`UPDATE productos SET stock_actual=${contado}, updated_at=now() WHERE id=${entidad.id}`;
        const { rows } = await client.sql`
          INSERT INTO stock_movimientos (producto_id, tipo, cantidad, motivo, stock_antes, stock_despues, registrado_por)
          VALUES (${entidad.id}, 'ajuste_conteo', ${delta}, 'conteo físico', ${antes}, ${contado}, ${registrado_por || null})
          RETURNING id, producto_id, insumo_id, tipo, cantidad, motivo, stock_antes, stock_despues, created_at`;
        return rows[0];
      }
      const { rows: insRows } = await client.sql`SELECT stock_actual FROM insumos WHERE id=${entidad.id} FOR UPDATE`;
      if (!insRows.length) throw Object.assign(new Error('no_entidad'), { code: 'no_entidad' });
      const antes = insRows[0].stock_actual;
      const delta = contado - (antes != null ? Number(antes) : 0);
      await client.sql`UPDATE insumos SET stock_actual=${contado}, updated_at=now() WHERE id=${entidad.id}`;
      const { rows } = await client.sql`
        INSERT INTO stock_movimientos (insumo_id, tipo, cantidad, motivo, stock_antes, stock_despues, registrado_por)
        VALUES (${entidad.id}, 'ajuste_conteo', ${delta}, 'conteo físico', ${antes}, ${contado}, ${registrado_por || null})
        RETURNING id, producto_id, insumo_id, tipo, cantidad, motivo, stock_antes, stock_despues, created_at`;
      return rows[0];
    });
    return res.status(201).json({ movimiento });
  } catch (err) {
    if (err.code === 'no_entidad') return res.status(404).json({ error: entidad.campo === 'producto_id' ? "Producto no encontrado." : "Insumo no encontrado." });
    throw err;
  }
}

async function listMovimientos(req, res) {
  const productoId = req.query.producto_id;
  const insumoId = req.query.insumo_id;
  // COALESCE(p.nombre, i.nombre) — cada fila es de un producto O un
  // insumo (num_nonnulls en el schema), así que el LEFT JOIN que no
  // aplica siempre da NULL y no hace falta elegir cuál mirar a mano.
  let rows;
  if (productoId) {
    ({ rows } = await sql`
      SELECT sm.id, sm.producto_id, sm.insumo_id, COALESCE(p.nombre, i.nombre) AS nombre,
             CASE WHEN sm.producto_id IS NOT NULL THEN 'producto' ELSE 'insumo' END AS entidad,
             sm.tipo, sm.cantidad, sm.motivo, sm.stock_antes, sm.stock_despues, sm.registrado_por, sm.created_at
      FROM stock_movimientos sm
      LEFT JOIN productos p ON p.id = sm.producto_id LEFT JOIN insumos i ON i.id = sm.insumo_id
      WHERE sm.producto_id = ${productoId}
      ORDER BY sm.created_at DESC LIMIT 50`);
  } else if (insumoId) {
    ({ rows } = await sql`
      SELECT sm.id, sm.producto_id, sm.insumo_id, COALESCE(p.nombre, i.nombre) AS nombre,
             CASE WHEN sm.producto_id IS NOT NULL THEN 'producto' ELSE 'insumo' END AS entidad,
             sm.tipo, sm.cantidad, sm.motivo, sm.stock_antes, sm.stock_despues, sm.registrado_por, sm.created_at
      FROM stock_movimientos sm
      LEFT JOIN productos p ON p.id = sm.producto_id LEFT JOIN insumos i ON i.id = sm.insumo_id
      WHERE sm.insumo_id = ${insumoId}
      ORDER BY sm.created_at DESC LIMIT 50`);
  } else {
    ({ rows } = await sql`
      SELECT sm.id, sm.producto_id, sm.insumo_id, COALESCE(p.nombre, i.nombre) AS nombre,
             CASE WHEN sm.producto_id IS NOT NULL THEN 'producto' ELSE 'insumo' END AS entidad,
             sm.tipo, sm.cantidad, sm.motivo, sm.stock_antes, sm.stock_despues, sm.registrado_por, sm.created_at
      FROM stock_movimientos sm
      LEFT JOIN productos p ON p.id = sm.producto_id LEFT JOIN insumos i ON i.id = sm.insumo_id
      ORDER BY sm.created_at DESC LIMIT 50`);
  }
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

  // stock_actual está en unidades de COMPRA (botellas); costo está en
  // unidades de VENTA (copas, ver productos.js). Para valorizar hay que
  // volver a botella multiplicando por copas_por_botella (auditoría v2, A2).
  const { rows: valorRows } = await sql`
    SELECT COALESCE(SUM(
      stock_actual * costo *
      CASE WHEN unidad_venta = 'copa' THEN COALESCE(copas_por_botella, 6) ELSE 1 END
    ), 0) AS valorizado
    FROM productos
    WHERE activo=true AND stock_actual IS NOT NULL AND costo IS NOT NULL AND stock_actual > 0`;

  const { rows: bajoMinimoRows } = await sql`
    SELECT COUNT(*) AS cantidad
    FROM productos
    WHERE activo=true AND stock_actual IS NOT NULL AND stock_minimo IS NOT NULL AND stock_actual <= stock_minimo`;

  // sm.cantidad de una merma está en unidades de COMPRA (botellas, mismo
  // criterio que stock_actual — registrarMerma resta directo de ahí);
  // p.costo está en unidades de VENTA (copa, si unidad_venta='copa').
  // Mismo ajuste que valorRows arriba (auditoría v2, A2) — sin esto, la
  // merma de un vino por copa se valorizaba dividida por copas_por_botella
  // (ej: una botella rota de $6000 se reportaba como ~$1000).
  const { rows: mermasRows } = await sql`
    SELECT COALESCE(SUM(
      ABS(sm.cantidad) * COALESCE(p.costo,0) *
      CASE WHEN p.unidad_venta = 'copa' THEN COALESCE(p.copas_por_botella, 6) ELSE 1 END
    ), 0) AS valor_mermado, COUNT(*) AS cantidad
    FROM stock_movimientos sm JOIN productos p ON p.id = sm.producto_id
    WHERE sm.tipo='merma' AND sm.created_at >= ${inicioMes.toISOString()}`;

  // producto_id IS NOT NULL: desde que stock_movimientos también puede
  // ser de un insumo, sin este filtro un conteo de insumo más reciente
  // que el último conteo de producto contaminaba esta cifra (que es del
  // panel Stock, productos únicamente — el equivalente de insumos es
  // getResumenInsumos más abajo).
  const { rows: ultimoConteoRows } = await sql`
    SELECT MAX(created_at) AS fecha FROM stock_movimientos WHERE tipo='ajuste_conteo' AND producto_id IS NOT NULL`;

  return res.status(200).json({
    valorizado: valorRows[0].valorizado,
    bajoMinimo: bajoMinimoRows[0].cantidad,
    mermasValor: mermasRows[0].valor_mermado,
    mermasCantidad: mermasRows[0].cantidad,
    ultimoConteo: ultimoConteoRows[0].fecha,
  });
}

// Equivalente de getResumenStock pero para insumos (Tier 3, hallazgo 4
// del análisis) — franja de cifras para el panel Menú → Insumos.
// insumos.costo_unitario ya está en la MISMA unidad que stock_actual (la
// de compra, ver insumos.js) — a diferencia de productos, acá no hace
// falta ningún multiplicador de conversión para valorizar.
async function getResumenInsumos(req, res) {
  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);

  const { rows: valorRows } = await sql`
    SELECT COALESCE(SUM(stock_actual * costo_unitario), 0) AS valorizado
    FROM insumos
    WHERE activo=true AND stock_actual IS NOT NULL AND costo_unitario IS NOT NULL AND stock_actual > 0`;

  const { rows: mermasRows } = await sql`
    SELECT COALESCE(SUM(ABS(sm.cantidad) * COALESCE(i.costo_unitario,0)), 0) AS valor_mermado, COUNT(*) AS cantidad
    FROM stock_movimientos sm JOIN insumos i ON i.id = sm.insumo_id
    WHERE sm.tipo='merma' AND sm.created_at >= ${inicioMes.toISOString()}`;

  const { rows: ultimoConteoRows } = await sql`
    SELECT MAX(created_at) AS fecha FROM stock_movimientos WHERE tipo='ajuste_conteo' AND insumo_id IS NOT NULL`;

  return res.status(200).json({
    valorizado: valorRows[0].valorizado,
    mermasValor: mermasRows[0].valor_mermado,
    mermasCantidad: mermasRows[0].cantidad,
    ultimoConteo: ultimoConteoRows[0].fecha,
  });
}

module.exports = { registrarMerma, registrarConteo, listMovimientos, getResumenStock, getResumenInsumos };
