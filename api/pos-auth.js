// api/pos-auth.js — Valida contraseña de piso (POS) contra env var.
// Espejo de admin-auth.js, con su propia password (POS_PASSWORD),
// independiente del acceso de back-office (ADMIN_PASSWORD).
const { timingSafeStringEqual } = require('./_lib/timing-safe');

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { password } = req.body || {};
  const POS_PASSWORD = process.env.POS_PASSWORD;

  if (!POS_PASSWORD) return res.status(500).json({ error: "POS_PASSWORD no configurada." });
  if (!password)     return res.status(400).json({ error: "Falta password." });

  if (timingSafeStringEqual(password, POS_PASSWORD)) {
    return res.status(200).json({ ok: true });
  }
  return res.status(401).json({ ok: false, error: "Contraseña incorrecta." });
};
