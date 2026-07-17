// api/stats.js — Lee hoja Degustaciones, soporta filtro por email

const { getReadOnlyToken } = require('./_lib/google-auth');

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const SHEET_ID            = process.env.GOOGLE_SHEET_ID;
  const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
  const GOOGLE_PRIVATE_KEY  = process.env.GOOGLE_PRIVATE_KEY;
  if (!SHEET_ID || !GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY)
    return res.status(500).json({ error: "Faltan credenciales." });

  const emailFiltro = (req.method === 'POST' ? req.body?.email : req.query?.email || "").toLowerCase().trim();

  try {
    const token = await getReadOnlyToken(GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY);

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
    if (rows.length < 2) return res.status(200).json({ total: 0, resumen: [], catas: [] });

    const headers = rows[0].map(h => h.trim().toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "")
    );

    const col  = (row, name) => { const i = headers.indexOf(name); return i >= 0 ? (row[i] || "").toString().trim() : ""; };
    const colN = (row, name) => parseFloat(col(row, name)) || 0;

    // fecha se guarda como D/M/YYYY (es-AR) — new Date() la interpreta como M/D/YYYY
    // (o directamente Invalid Date si el día es >12), así que el orden salía mal.
    const fechaHoraTs = (fecha, hora) => {
      const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((fecha || "").trim());
      if (!m) { const d = new Date(fecha); return isNaN(d) ? 0 : d.getTime(); }
      const [, dd, mm, yyyy] = m;
      const [hh, min] = (hora || "").split(":").map(n => parseInt(n, 10) || 0);
      return new Date(+yyyy, +mm - 1, +dd, hh || 0, min || 0).getTime();
    };

    const degustaciones = rows.slice(1)
      .filter(r => r.length > 1 && (r[2] || r[0]))
      .map(r => ({
        id:          col(r, "id"),
        fecha:       col(r, "fecha"),
        hora:        col(r, "hora"),
        email:       col(r, "email") || "",
        vino:        col(r, "vino"),
        bodega:      col(r, "bodega"),
        tipo:        col(r, "tipo"),
        precio:      col(r, "precio"),
        nivel:       col(r, "nivel"),
        puntuacion:  colN(r, "puntuacion") || colN(r, "puntuaci_n") || colN(r, "puntuaci__n"),
        color:       col(r, "color"),
        aromas:      col(r, "aromas"),
        sabor:       col(r, "sabor"),
        acidez:      colN(r, "acidez"),
        taninos:     colN(r, "taninos"),
        cuerpo:      colN(r, "cuerpo"),
        final_boca:  colN(r, "final_en_boca") || colN(r, "final_boca"),
        visual:      colN(r, "visual"),
        gusto:       colN(r, "gusto"),
        repetiria:   col(r, "repetiria"),
        descripcion: col(r, "descripcion") || col(r, "opinion") || col(r, "opini_n"),
        copa:        col(r, "copa"),
        varietal:    col(r, "varietal"),
      }))
      .filter(d => d.vino);

    // Filtro por email → historial personal
    if (emailFiltro) {
      const catas = degustaciones
        .filter(d => d.email.toLowerCase() === emailFiltro)
        .sort((a, b) => fechaHoraTs(b.fecha, b.hora) - fechaHoraTs(a.fecha, a.hora));
      return res.status(200).json({ total: catas.length, catas });
    }

    // Sin filtro → resumen para dashboard
    const byVino = {};
    for (const d of degustaciones) {
      if (!byVino[d.vino]) {
        byVino[d.vino] = { vino: d.vino, bodega: d.bodega, tipo: d.tipo,
          count: 0, puntuacion: 0, acidez: 0, cuerpo: 0, taninos: 0,
          visual: 0, gusto: 0, opiniones: [] };
      }
      const b = byVino[d.vino];
      b.count++;
      b.puntuacion += d.puntuacion;
      b.acidez     += d.acidez;
      b.cuerpo     += d.cuerpo;
      b.taninos    += d.taninos;
      b.visual     += d.visual;
      b.gusto      += d.gusto;
      // Una entrada por cata (no solo las que tienen texto libre) — el admin
      // necesita ver color/aromas/sabor/atributos aunque el cliente no haya
      // escrito nada. Sin email: esto lo consume también la carta pública
      // (favoritos), no solo el dashboard autenticado.
      b.opiniones.push({
        texto: d.descripcion, fecha: d.fecha, hora: d.hora, nivel: d.nivel,
        puntuacion: d.puntuacion, color: d.color, aromas: d.aromas, sabor: d.sabor,
        acidez: d.acidez, taninos: d.taninos, cuerpo: d.cuerpo,
        visual: d.visual, gusto: d.gusto, final_boca: d.final_boca,
        repetiria: d.repetiria,
      });
    }

    const resumen = Object.values(byVino).map(b => ({
      vino:       b.vino,
      bodega:     b.bodega,
      tipo:       b.tipo,
      count:      b.count,
      puntuacion: +(b.puntuacion / b.count).toFixed(1),
      acidez:     +(b.acidez    / b.count).toFixed(1),
      cuerpo:     +(b.cuerpo    / b.count).toFixed(1),
      taninos:    +(b.taninos   / b.count).toFixed(1),
      visual:     +(b.visual    / b.count).toFixed(1),
      gusto:      +(b.gusto     / b.count).toFixed(1),
      opiniones:  b.opiniones.sort((a, c) => fechaHoraTs(c.fecha, c.hora) - fechaHoraTs(a.fecha, a.hora)),
    })).sort((a, b) => b.puntuacion - a.puntuacion);

    // No devolver "degustaciones" crudo sin filtro: expondría email y opiniones
    // de todos los clientes a cualquier caller anónimo. "resumen" (agregado, sin
    // email) es lo único que consume el dashboard admin y la carta pública.
    return res.status(200).json({ total: degustaciones.length, resumen });

  } catch (err) {
    return res.status(500).json({ error: "Error interno.", detail: err.message });
  }
};
