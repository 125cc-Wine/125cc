// api/_lib/pos/productos-import.js — trae el catálogo de vinos de la app
// (Sheet "Vinos", vía /api/obtener-vinos, ya público) y los crea/actualiza
// como productos del POS, para no tener que cargarlos a mano de nuevo.
//
// Se pega al propio endpoint público en vez de reimplementar el parseo de
// la hoja acá adentro, para no duplicar (y potencialmente desalinear) la
// lógica de columnas de obtener-vinos.js.
//
// Import de un solo sentido (Sheet → Postgres), no sincroniza de vuelta:
// escribir en Sheets desde acá reintroduciría el problema de escritura
// concurrente que justificó mover el POS a Postgres.
//
// El Sheet solo tiene precio de BOTELLA (el campo "copa" es el tamaño de
// la porción en cc, no un precio). 125cc vende únicamente por copa, así
// que se deriva el precio de copa con LA MISMA fórmula que ya usa
// public/index.html (fmtPrecio) para mostrarle el precio al cliente en
// el menú — así el mozo cobra en el POS exactamente lo mismo que el
// cliente ve en la carta. Si esa fórmula cambia en index.html, hay que
// actualizarla acá también (no está compartida en un módulo común
// porque index.html corre en el browser del cliente, sin build step).
const { sql } = require('../db');

const TIPO_A_CATEGORIA = { Tinto: 'tinto', Blanco: 'blanco', Rosado: 'rosado', Naranjo: 'naranjo' };

// Espejo exacto de fmtPrecio() en public/index.html.
function precioCopa(botella) {
  if (!botella) return 0;
  let factor = 1.50;
  if (botella < 14000)      factor = 1.70;
  else if (botella < 18000) factor = 1.60;
  else if (botella < 30000) factor = 1.50;
  else                      factor = 1.25;
  return Math.round(((botella / 6) * factor) / 500) * 500;
}

async function importVinos(req, res) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';

  let vinos;
  try {
    const r = await fetch(`${proto}://${host}/api/obtener-vinos`);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Error obteniendo vinos.');
    vinos = data.vinos || [];
  } catch (err) {
    return res.status(502).json({ error: "No se pudo leer el menú de vinos.", detail: err.message });
  }

  let creados = 0, actualizados = 0, omitidos = 0;
  const vinoRefsEnCarta = [];

  for (const v of vinos) {
    const botella = parseFloat(v.precio);
    const precio = precioCopa(botella);
    if (!v.nombre || !Number.isFinite(precio) || precio <= 0) { omitidos++; continue; }

    const categoria = TIPO_A_CATEGORIA[v.tipo] || 'otros';
    const vinoRef = String(v.id);
    vinoRefsEnCarta.push(vinoRef);

    const { rows: existentes } = await sql`SELECT id FROM productos WHERE vino_ref = ${vinoRef}`;
    if (existentes.length) {
      // activo=true acá también (no solo en el INSERT): un vino puede
      // volver a la carta en una rotación futura después de haber sido
      // desactivado más abajo — sin esto quedaba con precio/nombre al
      // día pero invisible en el picker de la comanda.
      await sql`
        UPDATE productos SET nombre=${v.nombre}, categoria=${categoria}, unidad_venta='copa',
          precio=${precio}, activo=true, updated_at=now()
        WHERE id=${existentes[0].id}`;
      actualizados++;
    } else {
      await sql`
        INSERT INTO productos (nombre, categoria, unidad_venta, precio, activo, vino_ref)
        VALUES (${v.nombre}, ${categoria}, 'copa', ${precio}, true, ${vinoRef})`;
      creados++;
    }
  }

  // Rotación de carta (14 días, catálogo completo se recambia): un
  // producto con vino_ref que YA NO vino en este batch se cayó de la
  // carta actual — antes quedaba activo=true para siempre (nunca había
  // ningún camino que lo desactivara, ni acá ni en la UI, que solo
  // tiene toggle de activo para platos del Menú) y se acumulaba en el
  // picker "Adicionar" de la comanda con el precio congelado de la
  // última vez que estuvo en carta. `vino_ref IS NOT NULL` para no
  // tocar nunca productos del Menú (platos), que no tienen vino_ref.
  const desactivados = vinoRefsEnCarta.length
    ? await sql`
        UPDATE productos SET activo=false, updated_at=now()
        WHERE vino_ref IS NOT NULL AND activo=true AND NOT (vino_ref = ANY(${vinoRefsEnCarta}))
        RETURNING id`
    : { rows: [] };

  return res.status(200).json({ ok: true, creados, actualizados, omitidos, desactivados: desactivados.rows.length, total: vinos.length });
}

module.exports = { importVinos };
