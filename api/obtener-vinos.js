// api/obtener-vinos.js
// Lee la hoja "Vinos" del Google Sheet y la devuelve como JSON al menú

const { getReadOnlyToken } = require('./_lib/google-auth');

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
  if (req.method === "OPTIONS") return res.status(200).end();

  const SHEET_ID            = process.env.GOOGLE_SHEET_ID;
  const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
  const GOOGLE_PRIVATE_KEY  = process.env.GOOGLE_PRIVATE_KEY;

  if (!SHEET_ID || !GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY) {
    return res.status(500).json({ error: "Faltan credenciales de Google." });
  }

  try {
    const token = await getReadOnlyToken(GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY);

    // Leer hoja Vinos — A:V incluye las 22 columnas hasta perfil_taninos
    const sheetRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Vinos!A1:V50`,
      { headers: { "Authorization": `Bearer ${token}` } }
    );

    if (!sheetRes.ok) {
      const err = await sheetRes.json();
      return res.status(502).json({ error: "Error leyendo Google Sheets.", detail: err?.error?.message });
    }

    const data = await sheetRes.json();
    const rows = data.values || [];

    if (rows.length < 2) {
      return res.status(200).json({ vinos: [] });
    }

    // Fila 0 = encabezados, filas 1+ = datos
    const headers = rows[0].map(h => h.trim().toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/\s+/g, "_")
    );

    const vinos = rows.slice(1)
      .filter(row => row[0] && row[0].toString().trim() !== "")
      .map(row => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = (row[i] || "").toString().trim(); });

        return {
          id:          parseInt(obj.id)  || 0,
          nombre:      obj.nombre        || "",
          bodega:      obj.bodega        || "",
          precio:      obj.precio        || "",
          copa:        obj.copa          || "125 cc",
          tipo:        obj.tipo          || "Tinto",
          x:           parseFloat(obj.x) || 0,
          y:           parseFloat(obj.y) || 0,
          varietal:    obj.varietal      || "",
          region:      obj.region        || "",
          altitud:     obj.altitud       || "",
          suelo:       obj.suelo         || "",
          crianza:     obj.crianza       || "",
          temperatura: obj.temperatura   || "",
          nota:        obj.nota          || "",
          maridaje:    obj.maridaje
            ? obj.maridaje.split(",").map(s => s.trim()).filter(Boolean)
            : [],
          bodega_info: obj.bodega_info   || "",
          tienda_url:  obj.tienda_url    || "",
          imagen:      obj.imagen        || "",
          perfil: {
            cuerpo:   parseInt(obj.perfil_cuerpo)   || 3,
            frescura: parseInt(obj.perfil_frescura) || 3,
            taninos:  parseInt(obj.perfil_taninos)  || 3,
          },
        };
      });

    return res.status(200).json({ vinos });

  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({ error: "Error interno.", detail: err.message });
  }
};
