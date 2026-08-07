// Verifica el header Authorization: Bearer <POS_PASSWORD> en los endpoints
// del módulo POS. Espejo de require-admin.js pero con su propia password,
// independiente de ADMIN_PASSWORD (acceso de piso vs. back-office).
// Devuelve true si está autorizado; si no, ya respondió el 401 y el
// caller debe retornar.
const { timingSafeStringEqual } = require('./timing-safe');

function requirePos(req, res) {
  const POS_PASSWORD = process.env.POS_PASSWORD;
  if (!POS_PASSWORD) {
    res.status(500).json({ error: "POS_PASSWORD no configurada." });
    return false;
  }
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!timingSafeStringEqual(token, POS_PASSWORD)) {
    res.status(401).json({ error: "No autorizado." });
    return false;
  }
  return true;
}

module.exports = { requirePos };
