// Neutraliza el primer carácter de un valor si Google Sheets podría
// interpretarlo como el inicio de una fórmula (CWE-1236 — CSV/Formula
// Injection). guardar-puntuacion.js y editar-cata.js escriben con
// valueInputOption=USER_ENTERED texto que llega de visitantes anónimos
// (descripcion, aromas_otro, etc.) — sin esto, alguien puede mandar
// =HYPERLINK(...) o una fórmula de exfiltración que se ejecuta cuando el
// admin abre la hoja "Degustaciones" en Sheets.
//
// Anteponer una comilla simple fuerza a Sheets/Excel a tratar la celda
// como texto literal — es el mismo mitigation estándar de OWASP para esta
// clase de vulnerabilidad, y no cambia lo que el admin ve en la celda.
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

function sheetSafe(val) {
  if (val == null) return val;
  const s = String(val);
  return FORMULA_TRIGGER.test(s) ? "'" + s : s;
}

// Aplica sheetSafe() a cada celda de una fila antes de mandarla a la API de
// Sheets — más seguro que sanitizar campo por campo (no depende de acordarse
// de cubrir cada campo de texto libre nuevo que se agregue a futuro).
function sheetSafeRow(row) {
  return row.map(sheetSafe);
}

module.exports = { sheetSafe, sheetSafeRow };
