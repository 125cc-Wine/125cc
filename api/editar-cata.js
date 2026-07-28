// api/editar-cata.js — edita una cata ya guardada, identificada por id.
// Solo permite editar si el email recibido coincide (case-insensitive) con
// el email guardado en esa fila. Reconstruye la fila completa mapeando por
// nombre real de columna (no asume orden fijo), igual que hace stats.js.

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
  res.setHeader("Access-Control-Allow-Methods", "PUT, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "PUT" && req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const SHEET_ID            = process.env.GOOGLE_SHEET_ID;
  const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
  const GOOGLE_PRIVATE_KEY  = process.env.GOOGLE_PRIVATE_KEY;
  if (!SHEET_ID || !GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY)
    return res.status(500).json({ error: "Faltan credenciales." });

  const {
    id, email, vino, bodega, tipo, precio, nivel,
    puntuacion, color, color_otro, aromas, aromas_otro,
    sabor, sabor_otro, acidez, cuerpo, taninos, final_boca,
    visual, olfativo, descripcion, repetiria, copa, varietal,
  } = req.body;

  if (!id || typeof id !== 'string')
    return res.status(400).json({ error: "Falta el id de la cata." });

  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: "Email inválido." });

  if (!vino || !puntuacion)
    return res.status(400).json({ error: "Faltan campos obligatorios." });

  if (typeof vino !== 'string' || vino.length > 200)
    return res.status(400).json({ error: "Nombre de vino inválido." });

  const puntuacionNum = Number(puntuacion);
  if (!Number.isFinite(puntuacionNum) || puntuacionNum < 60 || puntuacionNum > 100)
    return res.status(400).json({ error: "La puntuación debe estar entre 60 y 100." });

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
      return res.status(403).json({ error: "No autorizado para editar esta cata." });

    const colorFinal = color === '__otro__' ? (color_otro || '—') : (color || '—');
    const aromasArr   = aromas ? aromas.split(',').map(s => s.trim()).filter(Boolean) : [];
    if (aromas_otro?.trim()) aromasArr.push(aromas_otro.trim());
    const saborArr    = sabor ? sabor.split(',').map(s => s.trim()).filter(Boolean) : [];
    if (sabor_otro?.trim()) saborArr.push(sabor_otro.trim());

    // Reconstruye la fila completa siguiendo el orden REAL de columnas de la
    // hoja (headers). fecha/hora/email/id se preservan del valor original —
    // editar una cata no cambia cuándo se hizo ni quién es su dueño.
    // Cualquier columna que no reconozcamos también se preserva tal cual.
    const newRow = headers.map((h, i) => {
      switch (h) {
        case 'fecha':
        case 'hora':
        case 'email':
        case 'id':
          return row[i] ?? '';
        case 'vino':        return vino || '—';
        case 'bodega':      return bodega || '—';
        case 'tipo':        return tipo || '—';
        case 'precio':      return precio || '—';
        case 'puntuacion':
        case 'puntuaci_n':
        case 'puntuaci__n':
          return puntuacionNum;
        case 'acidez':      return acidez ?? '—';
        case 'cuerpo':      return cuerpo ?? '—';
        case 'taninos':     return taninos ?? '—';
        case 'visual':      return visual ?? '—';
        case 'repetiria':   return repetiria || '—';
        case 'descripcion':
        case 'opinion':
        case 'opini_n':
          return descripcion || '—';
        case 'nivel':       return nivel || 'simple';
        case 'color':       return colorFinal;
        case 'aromas':      return aromasArr.join(', ') || '—';
        case 'sabor':       return saborArr.join(', ') || '—';
        case 'final':
        case 'final_en_boca':
        case 'final_boca':
          return final_boca ?? '—';
        case 'gusto':
        case 'olfativo':
          return olfativo ?? '—';
        case 'copa':        return copa || '125 cc';
        case 'varietal':    return varietal || '—';
        default:            return row[i] ?? '';
      }
    });

    const rowNum = rowIndex + 1; // rows[] está alineado 1:1 con filas de la sheet (rows[0] = fila 1)
    const range  = `Degustaciones!A${rowNum}:${colLetter(headers.length - 1)}${rowNum}`;

    const updRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
      {
        method:  "PUT",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body:    JSON.stringify({ values: [newRow] }),
      }
    );
    if (!updRes.ok) {
      const e = await updRes.json();
      return res.status(502).json({ error: "Error Sheets", detail: e?.error?.message });
    }

    return res.status(200).json({ success: true, id });

  } catch (err) {
    return res.status(500).json({ error: "Error interno.", detail: err.message });
  }
};
