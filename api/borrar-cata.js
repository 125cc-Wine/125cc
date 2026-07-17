// api/borrar-cata.js — borra una cata guardada, identificada por id.
// Solo permite borrar si el email recibido coincide (case-insensitive) con
// el email guardado en esa fila.

const { getReadWriteToken } = require('./_lib/google-auth');

function normHeader(h) {
  return (h || '').toString().trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "DELETE, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "DELETE" && req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const SHEET_ID            = process.env.GOOGLE_SHEET_ID;
  const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
  const GOOGLE_PRIVATE_KEY  = process.env.GOOGLE_PRIVATE_KEY;
  if (!SHEET_ID || !GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY)
    return res.status(500).json({ error: "Faltan credenciales." });

  const { id, email } = req.body || {};

  if (!id || typeof id !== 'string')
    return res.status(400).json({ error: "Falta el id de la cata." });
  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: "Email inválido." });

  try {
    const token = await getReadWriteToken(GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY);

    const sheetRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Degustaciones!A1:W20000`,
      { headers: { "Authorization": `Bearer ${token}` } }
    );
    if (!sheetRes.ok) {
      const err = await sheetRes.json();
      return res.status(502).json({ error: "Error leyendo Sheets.", detail: err?.error?.message });
    }
    const data = await sheetRes.json();
    const rows = data.values || [];
    if (rows.length < 2) return res.status(404).json({ error: "Cata no encontrada." });

    const headers = rows[0].map(normHeader);
    const idIdx    = headers.indexOf('id');
    const emailIdx = headers.indexOf('email');
    if (idIdx === -1) return res.status(404).json({ error: "Cata no encontrada." });

    let rowIndex = -1;
    for (let i = 1; i < rows.length; i++) {
      const rid = (rows[i][idIdx] || '').toString().trim();
      if (rid && rid === id.trim()) { rowIndex = i; break; }
    }
    if (rowIndex === -1) return res.status(404).json({ error: "Cata no encontrada." });

    const row = rows[rowIndex];
    const rowEmail = (emailIdx >= 0 ? (row[emailIdx] || '') : '').toString().trim().toLowerCase();
    if (!rowEmail || rowEmail !== email.trim().toLowerCase())
      return res.status(403).json({ error: "No autorizado para borrar esta cata." });

    // Necesitamos el gridId (sheetId numérico) de la tab "Degustaciones" para
    // poder borrar la dimensión correcta con batchUpdate.
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties`,
      { headers: { "Authorization": `Bearer ${token}` } }
    );
    if (!metaRes.ok) {
      const err = await metaRes.json();
      return res.status(502).json({ error: "Error leyendo metadata de Sheets.", detail: err?.error?.message });
    }
    const meta = await metaRes.json();
    const sheetMeta = (meta.sheets || []).find(s => s.properties?.title === 'Degustaciones');
    if (!sheetMeta) return res.status(500).json({ error: "No se encontró la hoja Degustaciones." });
    const gridId = sheetMeta.properties.sheetId;

    // rows[] está alineado 1:1 con las filas de la sheet (rows[0] = fila 1,
    // índice 0-based), así que rowIndex ya es el startIndex correcto.
    const batchRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`,
      {
        method:  "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body:    JSON.stringify({
          requests: [{
            deleteDimension: {
              range: { sheetId: gridId, dimension: "ROWS", startIndex: rowIndex, endIndex: rowIndex + 1 },
            },
          }],
        }),
      }
    );
    if (!batchRes.ok) {
      const e = await batchRes.json();
      return res.status(502).json({ error: "Error Sheets", detail: e?.error?.message });
    }

    return res.status(200).json({ success: true, id });

  } catch (err) {
    return res.status(500).json({ error: "Error interno.", detail: err.message });
  }
};
