// api/send-whatsapp.js
// Vercel Serverless Function — Meta WhatsApp Cloud API

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const WHATSAPP_TOKEN  = process.env.WHATSAPP_TOKEN;
  const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    return res.status(500).json({ error: "Faltan credenciales de WhatsApp en las variables de entorno." });
  }

  const {
    phone, wineName, winery, varietal, price, glass,
    rating, ratingLabel, aroma, body, freshness,
    wouldOrderAgain, pairing, opinion,
  } = req.body;

  if (!phone || !wineName) {
    return res.status(400).json({ error: "Faltan campos obligatorios: phone, wineName." });
  }

  const bar = (v) => "▰".repeat(v) + "▱".repeat(5 - v);
  const stars = "⭐".repeat(rating) + "☆".repeat(5 - rating);

  const messageBody = {
    messaging_product: "whatsapp",
    to: phone,
    type: "text",
    text: {
      preview_url: false,
      body:
`🍷 *Degustación en Wine Bar 125cc*

*Vino:* ${wineName} · ${winery}
*Varietal:* ${varietal || "—"}
*Copa:* ${glass || "125 cc"} · ${price}

*Tu puntuación:* ${stars} ${rating}/5
_${ratingLabel}_

*Sensaciones:*
• Aroma: ${bar(aroma)} ${aroma}/5
• Cuerpo: ${bar(body)} ${body}/5
• Gusto: ${bar(freshness)} ${freshness}/5

*Opinión:* ${opinion || "—"}

📍 ${new Date().toLocaleDateString("es-AR", {
  weekday: "long", year: "numeric", month: "long", day: "numeric"
})}
🌐 www.125cc.com.ar`
    },
  };

  try {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messageBody),
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
