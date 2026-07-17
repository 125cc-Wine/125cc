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

  if (typeof vino !== 'string' || vino.length > 200)
    return res.status(400).json({ error: "Nombre de vino inválido." });

  const puntuacionNum = Number(puntuacion);
  if (!Number.isFinite(puntuacionNum) || puntuacionNum < 60 || puntuacionNum > 100)
    return res.status(400).json({ error: "La puntuación debe estar entre 60 y 100." });

  if (email && (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))
    return res.status(400).json({ error: "Email inválido." });

  const MAX_TEXT = 1000;
  for (const [campo, val] of Object.entries({ descripcion, color_otro, aromas_otro, sabor_otro })) {
    if (val && (typeof val !== 'string' || val.length > MAX_TEXT))
      return res.status(400).json({ error: `Campo ${campo} demasiado largo.` });
  }

  for (const [campo, val] of Object.entries({ acidez, cuerpo, taninos, final_boca, visual, olfativo })) {
    if (val !== undefined && val !== null && val !== '') {
      const n = Number(val);
      if (!Number.isFinite(n) || n < 1 || n > 5)
        return res.status(400).json({ error: `Campo ${campo} fuera de rango (1-5).` });
    }
  }

  try {
    const token = await getReadWriteToken(GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY);
    const ahora = new Date();
    const fecha = ahora.toLocaleDateString("es-AR");
    const hora  = ahora.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

    // Auto-migración: la columna "id" (W) puede no existir todavía en hojas
    // creadas antes de este cambio. La agregamos on-the-fly si falta, así no
    // depende de que alguien la agregue a mano en la sheet. Si esto falla no
    // debe frenar el guardado de la cata (el id igual se escribe en la fila).
    try {
      const headerCheckRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Degustaciones!W1`,
        { headers: { "Authorization": `Bearer ${token}` } }
      );
      let needsIdHeader = true;
      if (headerCheckRes.ok) {
        const hd = await headerCheckRes.json();
        const val = (hd.values && hd.values[0] && hd.values[0][0]) || '';
        needsIdHeader = val.toString().trim().toLowerCase() !== 'id';
      }
      if (needsIdHeader) {
        await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Degustaciones!W1?valueInputOption=USER_ENTERED`,
          {
            method:  "PUT",
            headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
            body:    JSON.stringify({ values: [["id"]] }),
          }
        );
      }
    } catch (e) { /* no bloquea el guardado */ }

    // Id estable de la fila, generado server-side (no confiar en el cliente).
    const cataId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

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
      puntuacionNum,
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
      cataId,
    ];

    const r = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Degustaciones!A:W:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
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
    return res.status(200).json({ success: true, id: cataId });

  } catch (err) {
    return res.status(500).json({ error: "Error interno.", detail: err.message });
  }
};
