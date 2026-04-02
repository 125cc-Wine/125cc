// api/actualizar-mapa.js
// Recibe {cambios: [{id, x, y}]} y actualiza columnas F y G en la hoja Vinos

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

  const SHEET_ID            = process.env.GOOGLE_SHEET_ID;
  const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
  const GOOGLE_PRIVATE_KEY  = process.env.GOOGLE_PRIVATE_KEY;

  if (!SHEET_ID || !GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY)
    return res.status(500).json({ error: "Faltan credenciales." });

  try {
    const { cambios } = req.body;
    if (!cambios || !cambios.length)
      return res.status(400).json({ error: "No hay cambios." });

    const token = await getGoogleToken(GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY);

    // 1. Leer la hoja Vinos para encontrar la fila de cada id
    const readRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Vinos!A1:G50`,
      { headers: { "Authorization": `Bearer ${token}` } }
    );
    const readData = await readRes.json();
    const rows = readData.values || [];

    // Columna A = id (índice 0), F = x (índice 5), G = y (índice 6)
    const updates = [];
    cambios.forEach(cambio => {
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] && rows[i][0].toString().trim() === cambio.id.toString()) {
          const rowNum = i + 1; // 1-indexed para Sheets
          // Actualizar columnas F y G
          updates.push({
            range: `Vinos!F${rowNum}:G${rowNum}`,
            values: [[cambio.x, cambio.y]]
          });
          break;
        }
      }
    });

    if (!updates.length)
      return res.status(404).json({ error: "No se encontraron las filas." });

    // 2. Batch update
    const batchRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchUpdate`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          valueInputOption: "RAW",
          data: updates
        })
      }
    );

    if (!batchRes.ok) {
      const err = await batchRes.json();
      return res.status(502).json({ error: "Error escribiendo Sheets.", detail: err?.error?.message });
    }

    return res.status(200).json({ ok: true, updated: updates.length });

  } catch (err) {
    console.error("actualizar-mapa error:", err);
    return res.status(500).json({ error: "Error interno.", detail: err.message });
  }
};

// ── JWT / OAuth2 ──────────────────────────────────────────────────────────
async function getGoogleToken(clientEmail, privateKeyRaw) {
  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/spreadsheets",
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
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(unsigned)
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
