// api/guardar-puntuacion.js — v2 con email + campos cata completa

const { getReadWriteToken } = require('./_lib/google-auth');

function normHeader(h) {
  return (h || '').toString().trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

function colLetter(idx) {
  let n = idx + 1, s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

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

    // Leemos los headers REALES de la sheet y armamos la fila mapeando por
    // nombre de columna (igual que editar-cata.js) en vez de asumir un orden
    // fijo — si alguien reordena o inserta columnas a mano en Sheets, un
    // array posicional queda desalineado en silencio y los datos se guardan
    // en la columna equivocada.
    const headerRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Degustaciones!1:1`,
      { headers: { "Authorization": `Bearer ${token}` } }
    );
    if (!headerRes.ok) {
      const err = await headerRes.json();
      return res.status(502).json({ error: "Error leyendo Sheets.", detail: err?.error?.message });
    }
    const headerData = await headerRes.json();
    const headersRaw = (headerData.values && headerData.values[0]) || [];
    let headers = headersRaw.map(normHeader);

    // Auto-migración: agrega la columna "id" si todavía no existe. Si falla,
    // no debe frenar el guardado (se guarda igual, sin id, como fila legacy).
    if (headers.indexOf('id') === -1) {
      const idColLetter = colLetter(headers.length);
      try {
        await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Degustaciones!${idColLetter}1?valueInputOption=USER_ENTERED`,
          {
            method:  "PUT",
            headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
            body:    JSON.stringify({ values: [["id"]] }),
          }
        );
        headers = [...headers, 'id'];
      } catch (e) { /* no bloquea el guardado */ }
    }

    // Id estable de la fila, generado server-side (no confiar en el cliente).
    const cataId = headers.indexOf('id') !== -1
      ? Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
      : '';

    const colorFinal = color === '__otro__' ? (color_otro || '—') : (color || '—');
    const aromasArr  = aromas ? aromas.split(',').map(s => s.trim()).filter(Boolean) : [];
    if (aromas_otro?.trim()) aromasArr.push(aromas_otro.trim());
    const saborArr   = sabor ? sabor.split(',').map(s => s.trim()).filter(Boolean) : [];
    if (sabor_otro?.trim()) saborArr.push(sabor_otro.trim());

    const fieldMap = {
      fecha, hora,
      email:       email       || '—',
      vino:        vino        || '—',
      bodega:      bodega      || '—',
      tipo:        tipo        || '—',
      precio:      precio      || '—',
      puntuacion:  puntuacionNum,
      puntuaci_n:  puntuacionNum,
      puntuaci__n: puntuacionNum,
      acidez:      acidez      ?? '—',
      cuerpo:      cuerpo      ?? '—',
      taninos:     taninos     ?? '—',
      visual:      visual      ?? '—',
      repetiria:   repetiria   || '—',
      descripcion: descripcion || '—',
      opinion:     descripcion || '—',
      opini_n:     descripcion || '—',
      nivel:       nivel       || 'simple',
      color:       colorFinal,
      aromas:      aromasArr.join(', ') || '—',
      sabor:       saborArr.join(', ')  || '—',
      final_en_boca: final_boca ?? '—',
      final_boca:    final_boca ?? '—',
      gusto:       olfativo    ?? '—',
      olfativo:    olfativo    ?? '—',
      copa:        copa        || '125 cc',
      varietal:    varietal    || '—',
      id:          cataId,
    };

    const fila = headers.map(h => fieldMap[h] !== undefined ? fieldMap[h] : '');
    const lastCol = colLetter(headers.length - 1);

    const r = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Degustaciones!A:${lastCol}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
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
