// api/sync-precios.js — Recorre los vinos con tienda_url, lee el precio publicado
// en la tienda y lo pisa en el Sheet si cambió. Pensado para correr solo vía
// Vercel Cron (ver "crons" en vercel.json); también admite disparo manual con
// la contraseña de admin, por si hace falta forzar una sincronización.

const { getReadWriteToken } = require('./_lib/google-auth');
const { isBlockedHost }     = require('./_lib/ssrf-guard');
const { extraerPrecio }     = require('./_lib/extraer-precio');

const FETCH_TIMEOUT_MS = 8000;
const PAUSA_ENTRE_SITIOS_MS = 300; // no golpear todas las tiendas a la vez

module.exports = async function handler(req, res) {
  if (!requireCronOrAdmin(req, res)) return;

  const SHEET_ID            = process.env.GOOGLE_SHEET_ID;
  const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
  const GOOGLE_PRIVATE_KEY  = process.env.GOOGLE_PRIVATE_KEY;
  if (!SHEET_ID || !GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY)
    return res.status(500).json({ error: "Faltan credenciales de Google." });

  try {
    const token = await getReadWriteToken(GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY);

    const dataRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Vinos!A1:V500`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    if (!dataRes.ok) {
      const err = await dataRes.json();
      return res.status(502).json({ error: "Error leyendo Vinos.", detail: err?.error?.message });
    }
    const data = await dataRes.json();
    const rows = data.values || [];
    if (rows.length < 2) return res.status(200).json({ ok: true, revisados: 0, actualizados: [], errores: [] });

    const headers = rows[0];
    const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_');
    const colIdx = name => headers.findIndex(h => norm(h) === name);

    const idxNombre = colIdx('nombre');
    const idxPrecio = colIdx('precio');
    const idxTienda = colIdx('tienda_url');
    if (idxPrecio < 0 || idxTienda < 0)
      return res.status(500).json({ error: "El sheet no tiene columnas 'precio' o 'tienda_url'." });
    const colPrecio = String.fromCharCode(65 + idxPrecio);

    const actualizados = [];
    const errores = [];
    const updates = [];

    for (let i = 0; i < rows.length - 1; i++) {
      const fila = rows[i + 1];
      const url = (fila[idxTienda] || '').trim();
      if (!url) continue;

      const nombre = fila[idxNombre] || `fila ${i + 2}`;
      const precioActual = parseFloat((fila[idxPrecio] || '').toString().replace(/\$/g, '').replace(/,/g, ''));

      try {
        const nuevoPrecio = await leerPrecioDeTienda(url);
        if (nuevoPrecio == null) {
          errores.push({ nombre, error: "No se encontró precio en la página." });
        } else if (Math.round(nuevoPrecio) !== Math.round(precioActual)) {
          const sheetRow = i + 2; // +1 header, +1 porque Sheets es 1-indexed
          updates.push({ range: `Vinos!${colPrecio}${sheetRow}`, values: [[Math.round(nuevoPrecio)]] });
          actualizados.push({ nombre, precioAnterior: precioActual || null, precioNuevo: Math.round(nuevoPrecio) });
        }
      } catch (err) {
        errores.push({ nombre, error: err.message });
      }

      await new Promise(r => setTimeout(r, PAUSA_ENTRE_SITIOS_MS));
    }

    if (updates.length) {
      const batchRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchUpdate`,
        {
          method:  'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({ valueInputOption: 'USER_ENTERED', data: updates }),
        }
      );
      if (!batchRes.ok) {
        const err = await batchRes.json();
        return res.status(502).json({ error: "Error escribiendo precios.", detail: err?.error?.message });
      }
    }

    return res.status(200).json({
      ok: true,
      revisados: rows.length - 1,
      actualizados,
      errores,
    });

  } catch (err) {
    console.error("sync-precios error:", err);
    return res.status(500).json({ error: "Error interno.", detail: err.message });
  }
};

async function leerPrecioDeTienda(url) {
  let target;
  try { target = new URL(url); } catch { return null; }
  if (!/^https?:$/.test(target.protocol) || isBlockedHost(target.hostname)) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const pageRes = await fetch(target.toString(), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; 125ccBot/1.0; +https://www.125cc.com.ar)" },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!pageRes.ok) return null;
    const html = await pageRes.text();
    return extraerPrecio(html);
  } finally {
    clearTimeout(timeout);
  }
}

// Vercel manda "Authorization: Bearer <CRON_SECRET>" en cada invocación de Cron
// cuando la env var CRON_SECRET está seteada. También se acepta la contraseña
// de admin, para poder forzar una sincronización a mano.
function requireCronOrAdmin(req, res) {
  const auth  = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const okCron  = process.env.CRON_SECRET && token === process.env.CRON_SECRET;
  const okAdmin = process.env.ADMIN_PASSWORD && token === process.env.ADMIN_PASSWORD;
  if (!okCron && !okAdmin) {
    res.status(401).json({ error: "No autorizado." });
    return false;
  }
  return true;
}
