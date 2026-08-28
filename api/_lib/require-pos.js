// Verifica el header Authorization: Bearer <POS_PASSWORD> en los endpoints
// del módulo POS. Espejo de require-admin.js pero con su propia password,
// independiente de ADMIN_PASSWORD (acceso de piso vs. back-office).
// Devuelve true si está autorizado; si no, ya respondió el 401/500 y el
// caller debe retornar. Devuelve además un `reason` ('bad_token' |
// 'no_config') para que el caller (api/pos.js) sepa si el fallo cuenta
// como un intento de password errado (bad_token, sí cuenta para el
// throttle de fuerza bruta) o es un problema de configuración del
// servidor (no_config, no es culpa de quien pega el request).
const { timingSafeStringEqual } = require('./timing-safe');

function requirePos(req, res) {
  const POS_PASSWORD = process.env.POS_PASSWORD;
  if (!POS_PASSWORD) {
    res.status(500).json({ error: "POS_PASSWORD no configurada." });
    return { ok: false, reason: 'no_config' };
  }
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!timingSafeStringEqual(token, POS_PASSWORD)) {
    res.status(401).json({ error: "No autorizado." });
    return { ok: false, reason: 'bad_token' };
  }
  return { ok: true };
}

module.exports = { requirePos };
