// api/_lib/pos-handler.js — envuelve un endpoint pos-* con el boilerplate
// de CORS + method guard + auth que se repetiría igual en cada uno de los
// ~10 endpoints nuevos del módulo POS. Los endpoints de Sheets existentes
// (admin-auth.js, actualizar-vino.js, etc.) siguen con su propio boilerplate
// inline — no se tocan — esto es solo para el namespace pos-* nuevo, donde
// el volumen de archivos justifica no repetir el mismo bloque diez veces.
const { requirePos } = require('./require-pos');

// methods: array de métodos HTTP permitidos, ej. ['GET','POST']
function posHandler(methods, fn) {
  return async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", methods.join(', ') + ", OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") return res.status(200).end();
    if (!methods.includes(req.method)) return res.status(405).json({ error: "Method not allowed" });
    if (!requirePos(req, res)) return; // ya respondió 401/500

    try {
      await fn(req, res);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) res.status(500).json({ error: "Error interno." });
    }
  };
}

module.exports = { posHandler };
