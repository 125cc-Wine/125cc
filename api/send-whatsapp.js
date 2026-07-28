// api/send-whatsapp.js
// Meta WhatsApp Cloud API — resumen de cata

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const WHATSAPP_TOKEN  = process.env.WHATSAPP_TOKEN;
  const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    return res.status(500).json({ error: "Faltan credenciales de WhatsApp." });
  }

  const { phone, wineName, winery, varietal, price, glass, rating, ratingLabel, sabor, opinion } = req.body || {};

  if (!phone || !wineName) {
    return res.status(400).json({ error: "Faltan campos obligatorios: phone, wineName." });
  }

  // Este endpoint es público (no requiere login) y termina mandando un
  // WhatsApp real con las credenciales del negocio — sin estos chequeos,
  // cualquiera puede pegarle directo a la API (sin pasar por la UI) para
  // mandar mensajes con texto arbitrario a un número arbitrario.
  const phoneDigits = phone.toString().replace(/[^\d+]/g, '');
  if (!/^\+?\d{8,15}$/.test(phoneDigits)) {
    return res.status(400).json({ error: "Teléfono inválido." });
  }

  const strField = (val, max) => {
    if (val == null) return '';
    if (typeof val !== 'string') return null;
    return val.length <= max ? val : null;
  };
  const wineNameV = strField(wineName, 200);
  const wineryV   = strField(winery, 200);
  const varietalV = strField(varietal, 200);
  const glassV    = strField(glass, 50);
  const priceV    = strField(price, 50);
  const ratingLabelV = strField(ratingLabel, 50);
  const saborV    = strField(sabor, 500);
  const opinionV  = strField(opinion, 500);
  if ([wineNameV, wineryV, varietalV, glassV, priceV, ratingLabelV, saborV, opinionV].includes(null)) {
    return res.status(400).json({ error: "Algún campo es inválido o demasiado largo." });
  }
  if (!wineNameV) return res.status(400).json({ error: "Falta el nombre del vino." });

  let ratingV = '';
  if (rating !== undefined && rating !== null && rating !== '') {
    const n = Number(rating);
    if (!Number.isFinite(n) || n < 0 || n > 100)
      return res.status(400).json({ error: "Puntuación inválida." });
    ratingV = n;
  }

  const saborLine   = saborV   ? `\n*En boca:* ${saborV}` : '';
  const opinionLine = opinionV ? `\n*Opinión:* "${opinionV}"` : '';

  const messageBody = {
    messaging_product: "whatsapp",
    to:   phoneDigits,
    type: "text",
    text: {
      preview_url: false,
      body:
`🍷 *Degustación en Wine Bar 125cc*

*Vino:* ${wineNameV} · ${wineryV || '—'}
*Varietal:* ${varietalV || '—'}
*Copa:* ${glassV || '125 cc'} · ${priceV || '—'}

*Puntuación:* ${ratingV || '—'}/100 — _${ratingLabelV || '—'}_${saborLine}${opinionLine}

📍 ${new Date().toLocaleDateString("es-AR", {
  weekday: "long", year: "numeric", month: "long", day: "numeric",
})}
🌐 www.125cc.com.ar`,
    },
  };

  try {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
      {
        method:  "POST",
        headers: { "Authorization": `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
        body:    JSON.stringify(messageBody),
      }
    );

    const data = await response.json();
    if (!response.ok) {
      console.error("Meta API error:", JSON.stringify(data));
      return res.status(502).json({ error: "Error de WhatsApp API.", detail: data?.error?.message });
    }

    return res.status(200).json({ success: true, messageId: data.messages?.[0]?.id });

  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({ error: "Error interno.", detail: err.message });
  }
};
