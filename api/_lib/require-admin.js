// Verifica el header Authorization: Bearer <ADMIN_PASSWORD> en endpoints de escritura del admin.
// Devuelve true si está autorizado; si no, ya respondió el 401 y el caller debe retornar.
function requireAdmin(req, res) {
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  if (!ADMIN_PASSWORD) {
    res.status(500).json({ error: "ADMIN_PASSWORD no configurada." });
    return false;
  }
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token !== ADMIN_PASSWORD) {
    res.status(401).json({ error: "No autorizado." });
    return false;
  }
  return true;
}

module.exports = { requireAdmin };
