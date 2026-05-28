// api/actualizar-vino.js — Editar, agregar o eliminar vinos del catálogo
const fs = require('fs');
const path = require('path');

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { vino, nuevo, eliminar } = req.body;

    // Leer vinos.json actual
    const vinosPath = path.join(process.cwd(), 'public', 'vinos.json');
    const raw = fs.readFileSync(vinosPath, 'utf8');
    const config = JSON.parse(raw);
    let vinos = config.vinos || [];

    if (eliminar) {
      // Eliminar vino por id
      const before = vinos.length;
      vinos = vinos.filter(w => w.id !== eliminar);
      if (vinos.length === before) return res.status(404).json({ error: "Vino no encontrado" });

    } else if (nuevo) {
      // Agregar vino nuevo
      const maxId = vinos.length ? Math.max(...vinos.map(w => w.id)) : 0;
      vino.id = maxId + 1;
      vinos.push(vino);

    } else {
      // Actualizar vino existente
      const idx = vinos.findIndex(w => w.id === vino.id);
      if (idx < 0) return res.status(404).json({ error: "Vino no encontrado" });
      vinos[idx] = { ...vinos[idx], ...vino };
    }

    // Guardar vinos.json actualizado
    config.vinos = vinos;
    fs.writeFileSync(vinosPath, JSON.stringify(config, null, 2), 'utf8');

    return res.status(200).json({ ok: true, total: vinos.length });

  } catch (err) {
    return res.status(500).json({ error: "Error interno.", detail: err.message });
  }
};
