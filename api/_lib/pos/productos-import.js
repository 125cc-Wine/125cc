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
// El precio del Sheet es precio de COPA (125cc vende únicamente por copa;
// el campo "copa" del Sheet es el tamaño de la porción en cc, no un precio
// aparte) — se importa como unidad_venta='copa'.
const { sql } = require('../db');

const TIPO_A_CATEGORIA = { Tinto: 'tinto', Blanco: 'blanco', Rosado: 'rosado', Naranjo: 'naranjo' };

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

  for (const v of vinos) {
    const precio = parseFloat(v.precio);
    if (!v.nombre || !Number.isFinite(precio) || precio <= 0) { omitidos++; continue; }

    const categoria = TIPO_A_CATEGORIA[v.tipo] || 'otros';
    const vinoRef = String(v.id);

    const { rows: existentes } = await sql`SELECT id FROM productos WHERE vino_ref = ${vinoRef}`;
    if (existentes.length) {
      await sql`
        UPDATE productos SET nombre=${v.nombre}, categoria=${categoria}, unidad_venta='copa',
          precio=${precio}, updated_at=now()
        WHERE id=${existentes[0].id}`;
      actualizados++;
    } else {
      await sql`
        INSERT INTO productos (nombre, categoria, unidad_venta, precio, activo, vino_ref)
        VALUES (${v.nombre}, ${categoria}, 'copa', ${precio}, true, ${vinoRef})`;
      creados++;
    }
  }

  return res.status(200).json({ ok: true, creados, actualizados, omitidos, total: vinos.length });
}

module.exports = { importVinos };
