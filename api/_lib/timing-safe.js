const crypto = require('crypto');

// Compara dos strings en tiempo constante — evita que un atacante remoto
// pueda inferir el password admin carácter por carácter midiendo cuánto
// tarda cada intento (timing side-channel en comparaciones con === / !==,
// que cortan apenas encuentran el primer carácter distinto).
function timingSafeStringEqual(a, b) {
  const bufA = Buffer.from(String(a ?? ''));
  const bufB = Buffer.from(String(b ?? ''));
  if (bufA.length !== bufB.length) {
    // timingSafeEqual exige buffers del mismo largo. Igual comparamos algo
    // del mismo tamaño que bufA para no filtrar la longitud a través de un
    // return anticipado más rápido que la comparación real.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = { timingSafeStringEqual };
