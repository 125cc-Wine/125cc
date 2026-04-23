// api/stats.js — v2 con email y nuevas columnas de cata
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const SHEET_ID            = process.env.GOOGLE_SHEET_ID;
  const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
  const GOOGLE_PRIVATE_KEY  = process.env.GOOGLE_PRIVATE_KEY;
  if (!SHEET_ID || !GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY)
    return res.status(500).json({ error: "Faltan credenciales." });

  // Filtro por email (para Mis Catas)
  const emailFiltro = (req.query?.email || "").toLowerCase().trim();

  try {
    const token = await getGoogleToken(GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY);

    // Leer hasta columna V (22 cols) para capturar todos los campos nuevos
    const sheetRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Degustaciones!A1:V1000`,
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
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "")
    );

    const col = (row, name) => {
      const i = headers.indexOf(name);
      return i >= 0 ? (row[i] || "").toString().trim() : "";
    };
    const colN = (row, name) => parseFloat(col(row, name)) || 0;

    const degustaciones = rows.slice(1)
      .filter(r => r.length > 1 && (r[3] || r[2] || r[0])) // al menos fecha o vino
      .map(r => ({
        fecha:       col(r, "fecha"),
        hora:        col(r, "hora"),
        email:       col(r, "email"),
        vino:        col(r, "vino"),
        bodega:      col(r, "bodega"),
        tipo:        col(r, "tipo"),
        precio:      col(r, "precio"),
        nivel:       col(r, "nivel"),
        puntuacion:  colN(r, "puntuacion"),
        color:       col(r, "color"),
        aromas:      col(r, "aromas"),
        sabor:       col(r, "sabor"),
        acidez:      colN(r, "acidez"),
        taninos:     colN(r, "taninos"),
        cuerpo:      colN(r, "cuerpo"),
        final_boca:  colN(r, "final_en_boca") || colN(r, "final_boca"),
        visual:      colN(r, "visual"),
        olfativo:    colN(r, "olfativo"),
        repetiria:   col(r, "repetiria"),
        descripcion: col(r, "descripcion") || col(r, "opinion"),
        copa:        col(r, "copa"),
        varietal:    col(r, "varietal"),
      }))
      .filter(d => d.vino); // solo filas con nombre de vino

    // ── Si hay filtro por email → devolver historial personal ──
    if (emailFiltro) {
      const catas = degustaciones
        .filter(d => d.email.toLowerCase() === emailFiltro)
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
      return res.status(200).json({ total: catas.length, catas });
    }

    // ── Sin filtro → resumen para dashboard ───────────────────
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
      if (d.descripcion) b.opiniones.push({ texto: d.descripcion, fecha: d.fecha });
    }

    const resumen = Object.values(byVino).map(b => ({
      vino:      b.vino,
      bodega:    b.bodega,
      tipo:      b.tipo,
      count:     b.count,
      puntuacion: +(b.puntuacion / b.count).toFixed(1),
      acidez:    +(b.acidez    / b.count).toFixed(1),
      cuerpo:    +(b.cuerpo    / b.count).toFixed(1),
      taninos:   +(b.taninos   / b.count).toFixed(1),
      visual:    +(b.visual    / b.count).toFixed(1),
      gusto:     +(b.gusto     / b.count).toFixed(1),
      opiniones: b.opiniones,
    })).sort((a, b) => b.puntuacion - a.puntuacion);

    return res.status(200).json({ total: degustaciones.length, resumen, degustaciones });

  } catch (err) {
    return res.status(500).json({ error: "Error interno.", detail: err.message });
  }
};

  try {
    const token = await getGoogleToken(GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY);

    // Columnas: Fecha | Hora | Vino | Bodega | Tipo | Precio | Puntuación | Acidez | Cuerpo | Taninos | Visual | Gusto | Opinión
    const sheetRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Degustaciones!A1:M500`,
      { headers: { "Authorization": `Bearer ${token}` } }
    );
    if (!sheetRes.ok) {
      const err = await sheetRes.json();
      return res.status(502).json({ error: "Error leyendo Sheets.", detail: err?.error?.message });
    }

    const data = await sheetRes.json();
    const rows = data.values || [];
    if (rows.length < 2) return res.status(200).json({ degustaciones: [], resumen: {} });

    const headers = rows[0].map(h => h.trim().toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "_")
    );

    const degustaciones = rows.slice(1)
      .filter(r => r[0] && r[2])
      .map(r => {
        const o = {};
        headers.forEach((h, i) => { o[h] = (r[i] || "").toString().trim(); });
        return {
          fecha:       o.fecha       || "",
          hora:        o.hora        || "",
          vino:        o.vino        || "",
          bodega:      o.bodega      || "",
          tipo:        o.tipo        || "",
          precio:      o.precio      || "",
          puntuacion:  parseFloat(o.puntuacion)  || 0,
          acidez:      parseFloat(o.acidez)      || 0,
          cuerpo:      parseFloat(o.cuerpo)      || 0,
          taninos:     parseFloat(o.taninos)     || 0,
          visual:      parseFloat(o.visual)      || 0,
          gusto:       parseFloat(o.gusto)       || 0,
          opinion:     o.opinion     || "",
        };
      });

    // ── Calcular resumen por vino ──────────────────────────────────────────
    const byVino = {};
    for (const d of degustaciones) {
      if (!byVino[d.vino]) {
        byVino[d.vino] = { vino: d.vino, bodega: d.bodega, tipo: d.tipo,
          count: 0, puntuacion: 0, acidez: 0, cuerpo: 0, taninos: 0, visual: 0, gusto: 0,
          opiniones: [] };
      }
      const b = byVino[d.vino];
      b.count++;
      b.puntuacion += d.puntuacion;
      b.acidez     += d.acidez;
      b.cuerpo     += d.cuerpo;
      b.taninos    += d.taninos;
      b.visual     += d.visual;
      b.gusto      += d.gusto;
      if (d.opinion) b.opiniones.push({ texto: d.opinion, fecha: d.fecha });
    }

    const resumen = Object.values(byVino).map(b => ({
      vino:      b.vino,
      bodega:    b.bodega,
      tipo:      b.tipo,
      count:     b.count,
      puntuacion: +(b.puntuacion / b.count).toFixed(1),
      acidez:    +(b.acidez    / b.count).toFixed(1),
      cuerpo:    +(b.cuerpo    / b.count).toFixed(1),
      taninos:   +(b.taninos   / b.count).toFixed(1),
      visual:    +(b.visual    / b.count).toFixed(1),
      gusto:     +(b.gusto     / b.count).toFixed(1),
      opiniones: b.opiniones,
    })).sort((a, b) => b.puntuacion - a.puntuacion);

    return res.status(200).json({
      total: degustaciones.length,
      resumen,
      degustaciones,
    });

  } catch (err) {
    console.error("Stats error:", err);
    return res.status(500).json({ error: "Error interno.", detail: err.message });
  }
};

// ── JWT / OAuth2 ──────────────────────────────────────────────────────────
async function getGoogleToken(clientEmail, privateKeyRaw) {
  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600, iat: now,
  };
  const header  = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify(claim));
  const unsigned = `${header}.${payload}`;
  const keyData  = pemToArrayBuffer(privateKey);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", keyData, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${b64url(signature)}`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error("Token fallido: " + JSON.stringify(tokenData));
  return tokenData.access_token;
}
function b64url(data) {
  let str = data instanceof ArrayBuffer
    ? String.fromCharCode(...new Uint8Array(data))
    : typeof data === "string" ? data : JSON.stringify(data);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function pemToArrayBuffer(pem) {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, "");
  const binary = atob(b64);
  const buf = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
  return buf;
}
