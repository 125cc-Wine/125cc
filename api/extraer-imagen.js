// api/extraer-imagen.js — Trae automáticamente la foto de producto (og:image) de un
// link externo (típicamente el mismo tienda_url que ya carga el admin), para no tener
// que buscar y pegar la URL de la imagen a mano en cada rotación de carta.

const { requireAdmin } = require('./_lib/require-admin');
const { isBlockedHost } = require('./_lib/ssrf-guard');

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!requireAdmin(req, res)) return;

  const { url } = req.body || {};
  if (!url || typeof url !== "string") return res.status(400).json({ error: "Falta la URL." });

  let target;
  try { target = new URL(url); } catch { return res.status(400).json({ error: "URL inválida." }); }
  if (!/^https?:$/.test(target.protocol)) return res.status(400).json({ error: "Solo se admite http/https." });
  if (isBlockedHost(target.hostname)) return res.status(400).json({ error: "Ese host no está permitido." });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const pageRes = await fetch(target.toString(), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; 125ccBot/1.0; +https://www.125cc.com.ar)" },
      redirect: "follow",
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!pageRes.ok) return res.status(502).json({ error: `No se pudo acceder al link (${pageRes.status}).` });

    const html = await pageRes.text();
    const imagen = extractMetaContent(html, ["og:image", "twitter:image", "twitter:image:src"]);
    if (!imagen) return res.status(404).json({ error: "No encontramos una imagen en esa página." });

    const resolved = new URL(imagen, target).toString();
    return res.status(200).json({ imagen: resolved });

  } catch (err) {
    if (err.name === "AbortError") return res.status(504).json({ error: "El link tardó demasiado en responder." });
    return res.status(500).json({ error: "Error interno.", detail: err.message });
  }
};

function extractMetaContent(html, propNames) {
  for (const prop of propNames) {
    const re1 = new RegExp(`<meta[^>]*(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`, "i");
    const re2 = new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`, "i");
    const m = html.match(re1) || html.match(re2);
    if (m) return m[1].replace(/&amp;/g, "&");
  }
  return null;
}
