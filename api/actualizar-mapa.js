// api/actualizar-mapa.js
// Recibe {cambios: [{id, x, y}]} y actualiza columnas x/y en la hoja Vinos

const { getReadWriteToken } = require('./_lib/google-auth');
const { requireAdmin }      = require('./_lib/require-admin');

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  if (!requireAdmin(req, res)) return;

  const SHEET_ID            = process.env.GOOGLE_SHEET_ID;
  const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
  const GOOGLE_PRIVATE_KEY  = process.env.GOOGLE_PRIVATE_KEY;

  if (!SHEET_ID || !GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY)
    return res.status(500).json({ error: "Faltan credenciales." });

  try {
    const { cambios } = req.body;
    if (!cambios || !cambios.length)
      return res.status(400).json({ error: "No hay cambios." });

    const token = await getReadWriteToken(GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY);

    // Leer la hoja para encontrar la fila de cada id
    const readRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Vinos!A1:G500`,
      { headers: { "Authorization": `Bearer ${token}` } }
    );
    const readData = await readRes.json();
    const rows = readData.values || [];

    // Columna A = id (índice 0), F = x (índice 5), G = y (índice 6)
    const updates = [];
    cambios.forEach(cambio => {
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] && rows[i][0].toString().trim() === cambio.id.toString()) {
          const rowNum = i + 1;
          updates.push({
            range:  `Vinos!F${rowNum}:G${rowNum}`,
            values: [[cambio.x, cambio.y]],
          });
          break;
        }
      }
    });

    if (!updates.length)
      return res.status(404).json({ error: "No se encontraron las filas." });

    const batchRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchUpdate`,
      {
        method:  "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body:    JSON.stringify({ valueInputOption: "RAW", data: updates }),
      }
    );

    if (!batchRes.ok) {
      const err = await batchRes.json();
      return res.status(502).json({ error: "Error escribiendo Sheets.", detail: err?.error?.message });
    }

    return res.status(200).json({ ok: true, updated: updates.length });

  } catch (err) {
    console.error("actualizar-mapa error:", err);
    return res.status(500).json({ error: "Error interno.", detail: err.message });
  }
};
