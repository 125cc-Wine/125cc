// api/stats.js — Lee hoja Degustaciones, soporta filtro por email
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

  const emailFiltro = (req.query?.email || "").toLowerCase().trim();

  try {
    const token = await getGoogleToken(GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY);

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

    // Normalizar encabezados
    const headers = rows[0].map(h => h.trim().toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "")
    );

    const col  = (row, name) => { const i = headers.indexOf(name); return i >= 0 ? (row[i] || "").toString().trim() : ""; };
    const colN = (row, name) => parseFloat(col(row, name)) || 0;

    const degustaciones = rows.slice(1)
      .filter(r => r.length > 1 && (r[2] || r[0]))
      .map(r => ({
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

    // ── Filtro por email → historial personal ──
    if (emailFiltro) {
      const catas = degustaciones
        .filter(d => d.email.toLowerCase() === emailFiltro)
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
      return res.status(200).json({ total: catas.length, catas });
    }

    // ── Sin filtro → resumen para dashboard ──
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
      if (d.descripcion) b.opiniones.push({ texto: d.descripcion, fecha: d.fecha });
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
      opiniones:  b.opiniones,
    })).sort((a, b) => b.puntuacion - a.puntuacion);

    return res.status(200).json({ total: degustaciones.length, resumen, degustaciones });

  } catch (err) {
    return res.status(500).json({ error: "Error interno.", detail: err.message });
  }
};

// ── Google Auth ──────────────────────────────────────────────
async function getGoogleToken(clientEmail, privateKeyRaw) {
  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const claim = { iss: clientEmail, scope: "https://www.googleapis.com/auth/spreadsheets.readonly", aud: "https://oauth2.googleapis.com/token", exp: now + 3600, iat: now };
  const h = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const p = b64url(JSON.stringify(claim));
  const unsigned = `${h}.${p}`;
  const key = await crypto.subtle.importKey("pkcs8", pemToAB(privateKey), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${b64url(sig)}`;
  const t = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}` });
  const d = await t.json();
  if (!d.access_token) throw new Error("Token fallido: " + JSON.stringify(d));
  return d.access_token;
}
function b64url(data) {
  const s = data instanceof ArrayBuffer ? String.fromCharCode(...new Uint8Array(data)) : typeof data === "string" ? data : JSON.stringify(data);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function pemToAB(pem) {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, "");
  const bin = atob(b64); const buf = new ArrayBuffer(bin.length); const v = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) v[i] = bin.charCodeAt(i); return buf;
}
