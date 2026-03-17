// api/obtener-vinos.js
// Lee la hoja "Vinos" del Google Sheet y la devuelve como JSON al menú

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  // Cache 5 minutos — el menú no re-fetcha en cada tap
  res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
  if (req.method === "OPTIONS") return res.status(200).end();

  const SHEET_ID            = process.env.GOOGLE_SHEET_ID;
  const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
  const GOOGLE_PRIVATE_KEY  = process.env.GOOGLE_PRIVATE_KEY;

  if (!SHEET_ID || !GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY) {
    return res.status(500).json({ error: "Faltan credenciales de Google." });
  }

  try {
    const token = await getGoogleToken(GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY);

    // Leer hoja Vinos (columnas A a Q, máximo 50 filas)
    const sheetRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Vinos!A1:Q50`,
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
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // quita tildes
      .replace(/\s+/g, "_")
    );

    const vinos = rows.slice(1)
      .filter(row => row[0] && row[0].toString().trim() !== "") // saltar filas vacías
      .map(row => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = (row[i] || "").toString().trim(); });

        // Normalizar campos numéricos
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
          // maridaje: "carnes rojas, tabla" → array
          maridaje:    obj.maridaje
            ? obj.maridaje.split(",").map(s => s.trim()).filter(Boolean)
            : [],
          bodega_info: obj.bodega_info   || "",
          tienda_url:  obj.tienda_url    || "",
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

// ── JWT / OAuth2 para Google Service Account ─────────────────────
async function getGoogleToken(clientEmail, privateKeyRaw) {
  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss:   clientEmail,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud:   "https://oauth2.googleapis.com/token",
    exp:   now + 3600,
    iat:   now,
  };
  const header  = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify(claim));
  const unsigned = `${header}.${payload}`;
  const keyData  = pemToArrayBuffer(privateKey);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", cryptoKey,
    new TextEncoder().encode(unsigned)
  );
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
  let str;
  if (data instanceof ArrayBuffer) {
    str = String.fromCharCode(...new Uint8Array(data));
  } else {
    str = typeof data === "string" ? data : JSON.stringify(data);
  }
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem) {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, "");
  const binary = atob(b64);
  const buf  = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
  return buf;
}
