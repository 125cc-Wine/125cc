// api/admin-auth.js — Valida contraseña de admin contra env var
const { timingSafeStringEqual } = require('./_lib/timing-safe');

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { password } = req.body || {};
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

  if (!ADMIN_PASSWORD) return res.status(500).json({ error: "ADMIN_PASSWORD no configurada." });
  if (!password)       return res.status(400).json({ error: "Falta password." });

  if (timingSafeStringEqual(password, ADMIN_PASSWORD)) {
    return res.status(200).json({ ok: true });
  }
  return res.status(401).json({ ok: false, error: "Contraseña incorrecta." });
};
