// api/guardar-puntuacion.js — v2 con email + campos cata completa

const { getReadWriteToken } = require('./_lib/google-auth');

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const SHEET_ID            = process.env.GOOGLE_SHEET_ID;
  const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
  const GOOGLE_PRIVATE_KEY  = process.env.GOOGLE_PRIVATE_KEY;
  if (!SHEET_ID || !GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY)
    return res.status(500).json({ error: "Faltan credenciales." });

  const {
    email, vino, bodega, tipo, precio, nivel,
    puntuacion, color, color_otro, aromas, aromas_otro,
    sabor, sabor_otro, acidez, cuerpo, taninos, final_boca,
    visual, olfativo, descripcion, repetiria, copa, varietal,
  } = req.body;

  if (!vino || !puntuacion)
    return res.status(400).json({ error: "Faltan campos obligatorios." });

  try {
    const token = await getReadWriteToken(GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY);
    const ahora = new Date();
    const fecha = ahora.toLocaleDateString("es-AR");
    const hora  = ahora.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

    const colorFinal = color === '__otro__' ? (color_otro || '—') : (color || '—');
    const aromasArr  = aromas ? aromas.split(',').map(s => s.trim()).filter(Boolean) : [];
    if (aromas_otro?.trim()) aromasArr.push(aromas_otro.trim());
    const saborArr   = sabor ? sabor.split(',').map(s => s.trim()).filter(Boolean) : [];
    if (sabor_otro?.trim()) saborArr.push(sabor_otro.trim());

    const fila = [
      fecha, hora,
      email       || '—',
      vino        || '—',
      bodega      || '—',
      tipo        || '—',
      precio      || '—',
      puntuacion,
      acidez      ?? '—',
      cuerpo      ?? '—',
      taninos     ?? '—',
      visual      ?? '—',
      repetiria   || '—',
      descripcion || '—',
      nivel       || 'simple',
      colorFinal,
      aromasArr.join(', ') || '—',
      saborArr.join(', ')  || '—',
      final_boca  ?? '—',
      olfativo    ?? '—',
      copa        || '125 cc',
      varietal    || '—',
    ];

    const r = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Degustaciones!A:V:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method:  "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body:    JSON.stringify({ values: [fila] }),
      }
    );
    if (!r.ok) {
      const e = await r.json();
      return res.status(502).json({ error: "Error Sheets", detail: e?.error?.message });
    }
    return res.status(200).json({ success: true });

  } catch (err) {
    return res.status(500).json({ error: "Error interno.", detail: err.message });
  }
};
