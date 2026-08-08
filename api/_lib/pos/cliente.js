// api/_lib/pos/cliente.js — perfil de un cliente: datos + historial de
// compras (comandas cerradas) + intento best-effort de cruce con "Mis
// Catas" (Sheets) por email. El cruce NUNCA bloquea la respuesta si
// falla, si no hay credenciales, o si el cliente no tiene email — es
// un dato adicional, no crítico (la tasa de match va a ser baja al
// principio, nadie pide el email al cobrar todavía).
const { sql } = require('../db');
const { getReadOnlyToken } = require('../google-auth');

function normHeader(h) {
  return (h || '').toString().trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

async function buscarCatasPorEmail(email) {
  if (!email) return null;
  const SHEET_ID = process.env.GOOGLE_SHEET_ID;
  const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
  const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;
  if (!SHEET_ID || !GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY) return null;
  try {
    const token = await getReadOnlyToken(GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY);
    const r = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Degustaciones`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!r.ok) return null;
    const data = await r.json();
    const rows = data.values || [];
    if (!rows.length) return null;
    const headers = rows[0].map(normHeader);
    const emailIdx = headers.indexOf('email');
    if (emailIdx === -1) return null;
    const vinoIdx = headers.indexOf('vino');
    const puntuacionIdx = headers.findIndex((h) => h.startsWith('puntuaci'));
    const emailLower = email.trim().toLowerCase();
    const matches = rows.slice(1).filter((row) => (row[emailIdx] || '').trim().toLowerCase() === emailLower);
    return {
      cantidad: matches.length,
      catas: matches.slice(0, 10).map((row) => ({
        vino: vinoIdx !== -1 ? row[vinoIdx] : null,
        puntuacion: puntuacionIdx !== -1 ? row[puntuacionIdx] : null,
      })),
    };
  } catch (err) {
    return null; // best-effort — nunca bloquea el perfil del cliente
  }
}

async function getCliente(req, res) {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: "Falta id." });

  const { rows: clienteRows } = await sql`
    SELECT id, nombre, telefono, email, notas, cuit, razon_social, condicion_iva, created_at
    FROM clientes WHERE id=${id}`;
  if (!clienteRows.length) return res.status(404).json({ error: "Cliente no encontrado." });
  const cliente = clienteRows[0];

  const { rows: historial } = await sql`
    SELECT id, mesa_id, total, medio_pago, cerrada_at
    FROM comandas WHERE cliente_id=${id} AND estado='cerrada'
    ORDER BY cerrada_at DESC LIMIT 30`;

  const misCatas = await buscarCatasPorEmail(cliente.email);

  return res.status(200).json({ cliente, historial, misCatas });
}

module.exports = { getCliente };
