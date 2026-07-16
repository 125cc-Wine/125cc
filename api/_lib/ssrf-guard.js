// Mitigación básica de SSRF — bloquea hosts locales/internos obvios.
// No es infalible (no protege contra DNS rebinding), pero es razonable para
// endpoints que ya requieren admin o cron secret.
function isBlockedHost(hostname) {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local")) return true;
  if (h === "0.0.0.0" || h === "::1" || h === "[::1]") return true;
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true; // link-local / metadata de nube
  return false;
}

module.exports = { isBlockedHost };
