// api/obtener-vinos.js
// Lee la hoja "Vinos" del Google Sheet y la devuelve como JSON al menú

const { getReadOnlyToken } = require('./_lib/google-auth');
const { normalizarBodega, leerBodegas } = require('./_lib/bodegas');

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  // Ventana corta a propósito: con el recambio de carta cada 14 días, un caché
  // de 5 min (como estaba antes) podía tardar hasta ~6 min en reflejar un vino
  // recién editado desde el admin.
  res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=30");
  if (req.method === "OPTIONS") return res.status(200).end();

  const SHEET_ID            = process.env.GOOGLE_SHEET_ID;
  const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
  const GOOGLE_PRIVATE_KEY  = process.env.GOOGLE_PRIVATE_KEY;

  if (!SHEET_ID || !GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY) {
    return res.status(500).json({ error: "Faltan credenciales de Google." });
  }

  try {
    const token = await getReadOnlyToken(GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY);

    // ?bodegas=1 — lo usa el admin (panel "Bodegas") para listar/editar el
    // catálogo centralizado. El menú público nunca manda este flag.
    if (req.query.bodegas === '1') {
      const { bodegas } = await leerBodegas(SHEET_ID, token);
      return res.status(200).json({ bodegas });
    }

    // Leer hoja Vinos — A:V incluye las 22 columnas hasta perfil_taninos
    const sheetRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Vinos!A1:V500`,
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

    // Catálogo centralizado de bodegas (pestaña "Bodegas") — bodega_info de acá
    // pisa la del propio vino cuando el nombre matchea (normalizado). Si una
    // bodega todavía no está migrada, el vino conserva su bodega_info propia
    // como fallback — así nunca desaparece texto por no estar todavía en la
    // pestaña nueva.
    const { porNombre: bodegasPorNombre } = await leerBodegas(SHEET_ID, token);

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

        const bodegaCentral = bodegasPorNombre.get(normalizarBodega(obj.bodega));

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
          bodega_info: bodegaCentral?.bodega_info || obj.bodega_info || "",
          bodega_lat:  bodegaCentral?.lat ?? null,
          bodega_lon:  bodegaCentral?.lon ?? null,
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
