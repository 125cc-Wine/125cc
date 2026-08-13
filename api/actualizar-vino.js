// api/actualizar-vino.js — CRUD de vinos en Google Sheets (Vercel-compatible)
// Reemplaza la versión anterior que usaba fs.writeFileSync (solo funciona en local)
//
// También carga acá (no en un archivo propio) el historial de "Calendario
// de Carta" — qué vino estuvo en carta cada semana, para la regla de
// no-repetición de 12 meses. Debería vivir en su propio endpoint, pero el
// plan Hobby de Vercel tope a 12 funciones serverless y el repo ya está en
// ese límite (por eso pos.js es un router único para todo el módulo POS).
// Se elige este archivo como destino porque comparte dominio (vinos/carta)
// y auth (requireAdmin) con lo que ya hace — decisión tomada con Maio.
// El historial persiste en Postgres/Neon (api/_lib/db.js, la misma DB que
// ya usa el POS), no en el Sheet ni vía GitHub API (no hay integración con
// GitHub en este repo).

const { getReadWriteToken }        = require('./_lib/google-auth');
const { requireAdmin }             = require('./_lib/require-admin');
const { sql, withTransaction }     = require('./_lib/db');
const { normalizarBodega }         = require('./_lib/bodegas');

// Temporada de bloqueo del Calendario de Carta: un vino que estuvo en carta
// no puede volver a los pools de selección hasta que pasen 12 meses desde
// la última vez que se confirmó. Valor decidido a mano con Maio — no se
// puede inferir del negocio ni del código.
const MESES_BLOQUEO_CARTA = 12;

async function getHistorialCarta(req, res) {
  // ?todo=1 trae todo el historial sin ventana de 12 meses — lo usa la
  // "Vista de historial" (solo lectura, mirar la rotación pasada completa).
  // Sin el flag, se queda con la ventana de bloqueo — es lo único que
  // necesita el cálculo de qué está bloqueado en los pools.
  if (req.query.todo === '1') {
    const { rows } = await sql`
      SELECT vino_id, vino_nombre, bodega, semana_label, semana_inicio, confirmado_at, fuente
      FROM carta_historial
      ORDER BY semana_inicio DESC, confirmado_at DESC
    `;
    return res.status(200).json({ historial: rows, mesesBloqueo: MESES_BLOQUEO_CARTA });
  }

  // El intervalo se arma como string en JS (ej '12 months') y se castea en
  // SQL — pasar el número solo y concatenar con '||' en Postgres mezclaría
  // int y text sin cast implícito seguro.
  const { rows } = await sql`
    SELECT vino_id, vino_nombre, bodega, semana_label, semana_inicio, confirmado_at, fuente
    FROM carta_historial
    WHERE confirmado_at > now() - ${MESES_BLOQUEO_CARTA + ' months'}::interval
    ORDER BY confirmado_at DESC
  `;
  return res.status(200).json({ historial: rows, mesesBloqueo: MESES_BLOQUEO_CARTA });
}

async function guardarHistorialCarta(req, res, semanas) {
  if (!Array.isArray(semanas) || semanas.length === 0) {
    return res.status(400).json({ error: "Falta 'semanas' (array)." });
  }
  for (const s of semanas) {
    if (!s || typeof s.label !== 'string' || typeof s.inicio !== 'string' || !Array.isArray(s.vinos)) {
      return res.status(400).json({ error: "Cada semana necesita label, inicio y vinos[]." });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.inicio)) {
      return res.status(400).json({ error: `Fecha de inicio inválida en ${s.label}.` });
    }
  }

  // Guardado parcial permitido (pedido de Maio): no hace falta llenar las 14
  // posiciones de cada quincena para confirmar — los espacios vacíos (null)
  // simplemente no generan fila. Lo único que se rechaza es un guardado
  // totalmente vacío (no tendría nada para escribir).
  const vinosValidos = [];
  for (const s of semanas) {
    for (const v of s.vinos) {
      if (v && v.id != null && v.nombre) vinosValidos.push({ v, s });
    }
  }
  if (!vinosValidos.length) {
    return res.status(400).json({ error: "No hay ningún vino cargado para guardar." });
  }

  // El admin ahora ve en el calendario lo que ya estaba confirmado para ese
  // mes (antes arrancaba siempre vacío — ver comentario en nuevoPlanMes() de
  // stats.html) y puede re-guardar la misma quincena después de agregar o
  // sacar algo. Sin este chequeo, cada re-guardado volvía a INSERTar una
  // fila para cada vino que ya estaba, duplicándolo en el historial. Se
  // saltea (no se toca) cualquier combinación vino_id+semana_inicio+
  // semana_label que ya exista, sin importar cuándo se confirmó.
  const semanaInicios = [...new Set(semanas.map(s => s.inicio))];
  const { rows: existentes } = await sql`
    SELECT vino_id, semana_inicio, semana_label FROM carta_historial
    WHERE semana_inicio = ANY(${semanaInicios}::date[])
  `;
  // r.semana_inicio llega como objeto Date (columna `date`) — String(date) da
  // un formato verboso tipo "Thu Jan 01 2099 ...", NO "2099-01-01", así que
  // el slice(0,10) de eso no matchea nunca con `s.inicio` (que sí es
  // "YYYY-MM-DD" desde el body). toISOString() sí arranca con la fecha en
  // ese formato.
  const yaExiste = new Set(existentes.map(r => `${r.vino_id}|${r.semana_inicio.toISOString().slice(0, 10)}|${r.semana_label}`));

  const idsGuardados = [];
  let omitidos = 0;
  await withTransaction(async (client) => {
    for (const { v, s } of vinosValidos) {
      const key = `${String(v.id)}|${s.inicio}|${s.label}`;
      if (yaExiste.has(key)) { omitidos++; continue; }
      yaExiste.add(key); // por si vinosValidos trae el mismo vino repetido en el propio request

      // vino_id es texto: puede ser un id numérico del Sheet de 125cc (se
      // guarda como string) o un UUID del catálogo externo de Aroma/La Vid.
      // RETURNING id: se necesita para poder "deshacer" este guardado
      // puntual después, sin tocar otras filas que compartan vino_id de
      // una confirmación anterior.
      const { rows } = await client.sql`
        INSERT INTO carta_historial (vino_id, vino_nombre, bodega, semana_label, semana_inicio, fuente)
        VALUES (${String(v.id)}, ${v.nombre}, ${v.bodega || ''}, ${s.label}, ${s.inicio}, ${v.fuente || '125cc'})
        RETURNING id
      `;
      idsGuardados.push(rows[0].id);
    }
  });

  if (!idsGuardados.length) {
    return res.status(200).json({ ok: true, vinosGuardados: 0, vinosOmitidos: omitidos, idsGuardados, sinCambios: true });
  }

  return res.status(200).json({ ok: true, vinosGuardados: idsGuardados.length, vinosOmitidos: omitidos, idsGuardados });
}

// Deshace un guardado reciente — borra filas puntuales de carta_historial
// por su id de fila (no por vino_id, que podría repetirse en confirmaciones
// viejas). Ventana de 15 minutos desde que se confirmó: esto es "epa, me
// equivoqué recién", no un borrador general del historial — pasado ese
// margen, corregirlo es una operación manual a propósito.
const VENTANA_DESHACER_MIN = 15;
async function deshacerHistorialCarta(req, res, ids) {
  if (!Array.isArray(ids) || !ids.length) {
    return res.status(400).json({ error: "Falta 'ids' (array)." });
  }
  const idsNum = ids.map(Number).filter(Number.isInteger);
  if (!idsNum.length) {
    return res.status(400).json({ error: "'ids' inválido." });
  }
  const { rowCount } = await sql`
    DELETE FROM carta_historial
    WHERE id = ANY(${idsNum})
      AND confirmado_at > now() - ${VENTANA_DESHACER_MIN + ' minutes'}::interval
  `;
  return res.status(200).json({ ok: true, filasBorradas: rowCount });
}

// Catálogo externo de Aroma de Vid / La Vid Consultora (repo
// gestion-vinoteca2, Supabase — tabla `productos`) para el pool "elegir
// vino de mi distribuidor", agrupado por bodega en el cliente. Se llama a
// la REST API de Supabase directo con fetch (apikey del anon key, de solo
// lectura) en vez de agregar el SDK @supabase/supabase-js — este repo no
// usa ningún framework/build step y el resto de las integraciones externas
// (Sheets) ya siguen el mismo patrón de fetch plano.
async function getCatalogoExterno(req, res) {
  const VINOTECA_SUPABASE_URL      = process.env.VINOTECA_SUPABASE_URL;
  const VINOTECA_SUPABASE_ANON_KEY = process.env.VINOTECA_SUPABASE_ANON_KEY;
  if (!VINOTECA_SUPABASE_URL || !VINOTECA_SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: "Faltan credenciales del catálogo Aroma/La Vid (VINOTECA_SUPABASE_URL / VINOTECA_SUPABASE_ANON_KEY)." });
  }
  const headers = { apikey: VINOTECA_SUPABASE_ANON_KEY, Authorization: `Bearer ${VINOTECA_SUPABASE_ANON_KEY}` };

  // Solo activos, excluye categoria='Otro' (vermouth/destilados/accesorios —
  // no es vino). Sin filtro de stock: Maio pidió verlos igual aunque no
  // tengan stock cargado en este momento. Trae las dos empresas juntas (no
  // se filtra por `empresa`) — se dedupean por nombre más abajo.
  const PAGE = 1000; // Supabase PostgREST tiene max_rows=1000 por página
  let all = [];
  let offset = 0;
  while (true) {
    // varietal/region viajan para precargar la ficha del vino si se crea un
    // borrador en el Sheet al confirmar la carta (93%/85% de los vinos
    // activos los tienen cargados en gestion-vinoteca2). categoria viaja
    // para mapear el `tipo` de 125cc al crear ese borrador. stock viaja
    // para la alerta de "elegiste un vino sin stock en el distribuidor".
    const url = `${VINOTECA_SUPABASE_URL}/rest/v1/productos`
      + `?select=id,nombre,bodega,precio_venta,empresa,varietal,region,categoria,stock`
      + `&activo=eq.true&categoria=neq.Otro`
      + `&order=bodega.asc,nombre.asc&limit=${PAGE}&offset=${offset}`;
    const r = await fetch(url, { headers });
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      return res.status(502).json({ error: "Error leyendo el catálogo Aroma/La Vid.", detail });
    }
    const rows = await r.json();
    all = all.concat(rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }

  // Dedup por nombre normalizado — Aroma y La Vid sincronizan el mismo vino
  // como fila propia en cada empresa, así que en el pool alcanza con una
  // sola tarjeta por vino. Entre las dos, se queda con la que tenga más
  // stock (no la primera que aparece) — así no se marca "sin stock" a un
  // vino que sí está disponible del otro lado.
  const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const porNombre = new Map();
  for (const p of all) {
    const key = norm(p.nombre);
    if (!key) continue;
    const existente = porNombre.get(key);
    if (!existente || (p.stock || 0) > (existente.stock || 0)) porNombre.set(key, p);
  }

  const catalogo = Array.from(porNombre.values())
    .map(p => ({
      id: p.id, nombre: p.nombre, bodega: p.bodega || 'Sin bodega', precio: p.precio_venta || 0,
      varietal: p.varietal || '', region: p.region || '', categoria: p.categoria || '',
      stock: p.stock ?? null,
    }))
    .sort((a, b) => a.bodega.localeCompare(b.bodega) || a.nombre.localeCompare(b.nombre));

  return res.status(200).json({ catalogo });
}

// Catálogo centralizado de bodegas (pestaña "Bodegas") — lo usa el panel
// nuevo del admin. Antes cada vino tenía su propio texto "sobre la bodega y
// el terruño" repetido en cada fila (mismo dato copiado 2-3 veces por
// bodega, sin forma de mantenerlos en sync). Acá vive una sola vez por
// bodega y obtener-vinos.js lo fusiona en cada vino al leer.
const normSheet = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_');

// Guarda (crea o actualiza) una bodega. Si el nombre cambió respecto al que
// ya estaba en el Sheet, hace rename en cascada sobre Vinos!bodega — si no,
// las filas que apuntaban al nombre viejo dejan de matchear en
// obtener-vinos.js y pierden el texto centralizado en silencio.
async function guardarBodega(token, SHEET_ID, datos) {
  const nombre = (datos.nombre || '').trim();
  if (!nombre) return { status: 400, body: { error: "El nombre de la bodega es obligatorio." } };
  const bodega_info = (datos.bodega_info || '').trim();

  const sheetRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Bodegas!A1:C500`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!sheetRes.ok) return { status: 502, body: { error: "Error leyendo Bodegas.", detail: await sheetRes.text() } };
  const data     = await sheetRes.json();
  const dataRows = (data.values || []).slice(1);

  let nombreViejo = null;
  let id          = datos.id;

  if (id != null) {
    const rowIdx = dataRows.findIndex(r => (r[0] || '').toString().trim() === id.toString());
    if (rowIdx < 0) return { status: 404, body: { error: "Bodega no encontrada." } };
    nombreViejo = dataRows[rowIdx][1] || '';

    const choque = dataRows.find((r, i) => i !== rowIdx && normalizarBodega(r[1]) === normalizarBodega(nombre));
    if (choque) return { status: 409, body: { error: `Ya existe una bodega llamada "${choque[1]}".` } };

    const sheetRow = rowIdx + 2; // +1 header, +1 porque Sheets es 1-indexed
    const updRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Bodegas!A${sheetRow}:C${sheetRow}?valueInputOption=USER_ENTERED`,
      {
        method:  'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ range: `Bodegas!A${sheetRow}:C${sheetRow}`, values: [[id, nombre, bodega_info]] }),
      }
    );
    if (!updRes.ok) return { status: 502, body: { error: "Error actualizando bodega.", detail: await updRes.text() } };
  } else {
    const choque = dataRows.find(r => normalizarBodega(r[1]) === normalizarBodega(nombre));
    if (choque) return { status: 409, body: { error: `Ya existe una bodega llamada "${choque[1]}".` } };

    id = dataRows.reduce((m, r) => Math.max(m, parseInt(r[0] || 0) || 0), 0) + 1;
    const appendRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Bodegas!A:C:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ values: [[id, nombre, bodega_info]] }),
      }
    );
    if (!appendRes.ok) return { status: 502, body: { error: "Error creando bodega.", detail: await appendRes.text() } };
  }

  let vinosActualizados = 0;
  if (nombreViejo && normalizarBodega(nombreViejo) !== normalizarBodega(nombre)) {
    vinosActualizados = await renombrarBodegaEnVinos(token, SHEET_ID, nombreViejo, nombre);
  }

  return { status: 200, body: { ok: true, id, vinosActualizados } };
}

// Reescribe Vinos!bodega en todas las filas que referenciaban `nombreViejo`
// (comparado normalizado) para que pasen a `nombreNuevo`. Devuelve cuántas
// filas tocó.
async function renombrarBodegaEnVinos(token, SHEET_ID, nombreViejo, nombreNuevo) {
  const dataRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Vinos!A1:V500`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await dataRes.json();
  const rows = data.values || [];
  if (!rows.length) return 0;

  const idxBodega = rows[0].findIndex(h => normSheet(h) === 'bodega');
  if (idxBodega < 0) return 0;

  const col       = String.fromCharCode(65 + idxBodega);
  const objetivo  = normalizarBodega(nombreViejo);
  const cambios   = [];
  rows.slice(1).forEach((row, i) => {
    if (normalizarBodega(row[idxBodega]) === objetivo) {
      cambios.push({ range: `Vinos!${col}${i + 2}`, values: [[nombreNuevo]] });
    }
  });
  if (!cambios.length) return 0;

  const batchRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchUpdate`,
    {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ valueInputOption: 'USER_ENTERED', data: cambios }),
    }
  );
  if (!batchRes.ok) throw new Error(`Error renombrando bodega en vinos: ${await batchRes.text()}`);
  return cambios.length;
}

// Borra una bodega — bloqueado si todavía hay vinos que la referencian, para
// no dejarlos huérfanos en silencio (el admin tiene que reasignarles bodega
// primero, a mano, en el Editor de Vinos).
async function eliminarBodega(token, SHEET_ID, id) {
  const [bodegasRes, vinosRes] = await Promise.all([
    fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Bodegas!A1:C500`, { headers: { Authorization: `Bearer ${token}` } }),
    fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Vinos!A1:V500`,   { headers: { Authorization: `Bearer ${token}` } }),
  ]);
  const bRows = (await bodegasRes.json()).values || [];
  const rowIdx = bRows.slice(1).findIndex(r => (r[0] || '').toString().trim() === id.toString());
  if (rowIdx < 0) return { status: 404, body: { error: "Bodega no encontrada." } };
  const nombre = bRows[rowIdx + 1][1];

  const vRows = (await vinosRes.json()).values || [];
  if (vRows.length) {
    const idxBodega = vRows[0].findIndex(h => normSheet(h) === 'bodega');
    const idxNombre = vRows[0].findIndex(h => normSheet(h) === 'nombre');
    const usados = vRows.slice(1)
      .filter(r => normalizarBodega(r[idxBodega]) === normalizarBodega(nombre))
      .map(r => r[idxNombre]);
    if (usados.length) {
      return { status: 409, body: {
        error: `No se puede borrar: ${usados.length} vino(s) todavía usan esta bodega (${usados.slice(0, 5).join(', ')}${usados.length > 5 ? '…' : ''}). Cambiales la bodega primero.`,
      } };
    }
  }

  const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties`, { headers: { Authorization: `Bearer ${token}` } });
  const meta    = await metaRes.json();
  const sheetId = meta.sheets?.find(s => s.properties?.title === 'Bodegas')?.properties?.sheetId;
  if (sheetId == null) return { status: 500, body: { error: "No se encontró la hoja Bodegas." } };

  const sheetRowIdx = rowIdx + 1; // 0-indexed, +1 saltea header
  const delRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`,
    {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: sheetRowIdx, endIndex: sheetRowIdx + 1 } } }] }),
    }
  );
  if (!delRes.ok) return { status: 502, body: { error: "Error eliminando bodega.", detail: await delRes.text() } };

  return { status: 200, body: { ok: true } };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!requireAdmin(req, res)) return;

  // GET solo existe para el Calendario de Carta (historial y catálogo
  // externo) — el CRUD de vinos de acá abajo es todo POST (siempre fue así,
  // no se toca).
  if (req.method === "GET") {
    try {
      if (req.query.historial === '1') return await getHistorialCarta(req, res);
      if (req.query.catalogo === '1')  return await getCatalogoExterno(req, res);
      return res.status(404).json({ error: "Recurso no encontrado." });
    } catch (err) {
      console.error("actualizar-vino (GET) error:", err);
      return res.status(500).json({ error: "Error interno.", detail: err.message });
    }
  }

  if (req.body && req.body.historial) {
    try {
      return await guardarHistorialCarta(req, res, req.body.semanas);
    } catch (err) {
      console.error("actualizar-vino (historial POST) error:", err);
      return res.status(500).json({ error: "Error interno.", detail: err.message });
    }
  }

  if (req.body && req.body.historialDeshacer) {
    try {
      return await deshacerHistorialCarta(req, res, req.body.ids);
    } catch (err) {
      console.error("actualizar-vino (historial deshacer) error:", err);
      return res.status(500).json({ error: "Error interno.", detail: err.message });
    }
  }

  // Panel "Bodegas" — CRUD del catálogo centralizado. Van antes del bloque de
  // vinos porque no comparten forma de request (no traen `vino`).
  if (req.body && req.body.bodegaGuardar) {
    try {
      const SHEET_ID = process.env.GOOGLE_SHEET_ID;
      const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
      const GOOGLE_PRIVATE_KEY  = process.env.GOOGLE_PRIVATE_KEY;
      if (!SHEET_ID || !GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY)
        return res.status(500).json({ error: "Faltan credenciales de Google." });
      const token = await getReadWriteToken(GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY);
      const { status, body } = await guardarBodega(token, SHEET_ID, req.body.bodegaGuardar);
      return res.status(status).json(body);
    } catch (err) {
      console.error("actualizar-vino (bodega guardar) error:", err);
      return res.status(500).json({ error: "Error interno.", detail: err.message });
    }
  }

  if (req.body && req.body.bodegaEliminarId != null) {
    try {
      const SHEET_ID = process.env.GOOGLE_SHEET_ID;
      const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
      const GOOGLE_PRIVATE_KEY  = process.env.GOOGLE_PRIVATE_KEY;
      if (!SHEET_ID || !GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY)
        return res.status(500).json({ error: "Faltan credenciales de Google." });
      const token = await getReadWriteToken(GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY);
      const { status, body } = await eliminarBodega(token, SHEET_ID, req.body.bodegaEliminarId);
      return res.status(status).json(body);
    } catch (err) {
      console.error("actualizar-vino (bodega eliminar) error:", err);
      return res.status(500).json({ error: "Error interno.", detail: err.message });
    }
  }

  const SHEET_ID            = process.env.GOOGLE_SHEET_ID;
  const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
  const GOOGLE_PRIVATE_KEY  = process.env.GOOGLE_PRIVATE_KEY;
  if (!SHEET_ID || !GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY)
    return res.status(500).json({ error: "Faltan credenciales de Google." });

  try {
    const { vino, nuevo, eliminar } = req.body;
    const token = await getReadWriteToken(GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY);

    // Leer encabezados + datos actuales
    const dataRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Vinos!A1:V500`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    if (!dataRes.ok) {
      const err = await dataRes.json();
      return res.status(502).json({ error: "Error leyendo Vinos.", detail: err?.error?.message });
    }
    const data     = await dataRes.json();
    const rows     = data.values || [];
    if (!rows.length) return res.status(500).json({ error: "Hoja Vinos vacía." });

    const headers  = rows[0];
    const dataRows = rows.slice(1);

    // Busca el índice de columna por nombre (tolerante a tildes/mayúsculas/espacios)
    function colIdx(name) {
      const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_');
      const target = norm(name);
      return headers.findIndex(h => norm(h) === target);
    }

    // Convierte un objeto vino al array de celdas en el orden de los encabezados del sheet
    function wineToRow(w) {
      const row = new Array(headers.length).fill('');
      const set = (col, val) => { const i = colIdx(col); if (i >= 0) row[i] = val ?? ''; };
      set('id',            w.id);
      set('nombre',        w.nombre);
      set('bodega',        w.bodega);
      set('precio',        w.precio);
      set('copa',          w.copa || '125 cc');
      set('tipo',          w.tipo);
      set('x',             w.x ?? 0);
      set('y',             w.y ?? 0);
      set('varietal',      w.varietal);
      set('region',        w.region);
      set('altitud',       w.altitud);
      set('suelo',         w.suelo);
      set('crianza',       w.crianza);
      set('temperatura',   w.temperatura);
      set('nota',          w.nota);
      set('maridaje',      Array.isArray(w.maridaje) ? w.maridaje.join(', ') : (w.maridaje || ''));
      set('bodega_info',   w.bodega_info);
      set('tienda_url',    w.tienda_url);
      set('imagen',        w.imagen);
      set('perfil_cuerpo',   w.perfil_cuerpo   ?? w.perfil?.cuerpo   ?? 3);
      set('perfil_frescura', w.perfil_frescura ?? w.perfil?.frescura ?? 3);
      set('perfil_taninos',  w.perfil_taninos  ?? w.perfil?.taninos  ?? 3);
      return row;
    }

    const idCol = colIdx('id');

    // ── ELIMINAR ─────────────────────────────────────────────────
    if (eliminar) {
      const rowIdx = dataRows.findIndex(r => (r[idCol] || '').toString().trim() === eliminar.toString());
      if (rowIdx < 0) return res.status(404).json({ error: "Vino no encontrado." });

      // Necesitamos el sheetId numérico de la hoja "Vinos"
      const metaRes  = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      const meta    = await metaRes.json();
      const sheetId = meta.sheets?.find(s => s.properties?.title === 'Vinos')?.properties?.sheetId;
      if (sheetId == null) return res.status(500).json({ error: "No se encontró la hoja Vinos." });

      const sheetRowIdx = rowIdx + 1; // 0-indexed, +1 saltea header
      const delRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`,
        {
          method:  'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            requests: [{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: sheetRowIdx, endIndex: sheetRowIdx + 1 } } }],
          }),
        }
      );
      if (!delRes.ok) {
        const err = await delRes.json();
        return res.status(502).json({ error: "Error eliminando fila.", detail: err?.error?.message });
      }
      return res.status(200).json({ ok: true, total: dataRows.length - 1 });
    }

    // ── AGREGAR ──────────────────────────────────────────────────
    if (nuevo) {
      const maxId = dataRows.reduce((m, r) => Math.max(m, parseInt(r[idCol] || 0) || 0), 0);
      vino.id = maxId + 1;
      const row = wineToRow(vino);

      const appendRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Vinos!A:V:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
        {
          method:  'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({ values: [row] }),
        }
      );
      if (!appendRes.ok) {
        const err = await appendRes.json();
        return res.status(502).json({ error: "Error agregando vino.", detail: err?.error?.message });
      }
      return res.status(200).json({ ok: true, id: vino.id, total: dataRows.length + 1 });
    }

    // ── ACTUALIZAR ───────────────────────────────────────────────
    const rowIdx = dataRows.findIndex(r => (r[idCol] || '').toString().trim() === vino.id.toString());
    if (rowIdx < 0) return res.status(404).json({ error: "Vino no encontrado." });

    // Merge: valores existentes del sheet + cambios entrantes
    const existing = Object.fromEntries(headers.map((h, i) => [h, dataRows[rowIdx][i] || '']));
    const merged   = { ...existing, ...vino };
    const row      = wineToRow(merged);
    const sheetRow = rowIdx + 2; // +1 header, +1 porque Sheets es 1-indexed
    const lastCol  = String.fromCharCode(64 + headers.length); // A=65, V=86 para 22 cols
    const range    = `Vinos!A${sheetRow}:${lastCol}${sheetRow}`;

    const updateRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
      {
        method:  'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ range, values: [row] }),
      }
    );
    if (!updateRes.ok) {
      const err = await updateRes.json();
      return res.status(502).json({ error: "Error actualizando vino.", detail: err?.error?.message });
    }
    return res.status(200).json({ ok: true, total: dataRows.length });

  } catch (err) {
    console.error("actualizar-vino error:", err);
    return res.status(500).json({ error: "Error interno.", detail: err.message });
  }
};
