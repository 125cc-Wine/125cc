// api/actualizar-vino.js — CRUD de vinos en Google Sheets (Vercel-compatible)
// Reemplaza la versión anterior que usaba fs.writeFileSync (solo funciona en local)

const { getReadWriteToken } = require('./_lib/google-auth');
const { requireAdmin }      = require('./_lib/require-admin');

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!requireAdmin(req, res)) return;

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
