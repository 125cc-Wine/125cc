// api/guardar-puntuacion.js — v2 con email + campos cata completa
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const SHEET_ID            = process.env.GOOGLE_SHEET_ID;
  const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
  const GOOGLE_PRIVATE_KEY  = process.env.GOOGLE_PRIVATE_KEY;
  if (!SHEET_ID || !GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY)
    return res.status(500).json({ error: "Faltan credenciales." });

  const {
    email, vino, bodega, tipo, precio, nivel,
    puntuacion, color, color_otro, aromas, aromas_otro,
    sabor, sabor_otro, acidez, cuerpo, taninos, final_boca,
    visual, olfativo, descripcion, repetiria, copa, varietal,
  } = req.body;

  if (!vino || !puntuacion)
    return res.status(400).json({ error: "Faltan campos obligatorios." });

  try {
    const token = await getGoogleToken(GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY);
    const ahora = new Date();
    const fecha = ahora.toLocaleDateString("es-AR");
    const hora  = ahora.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

    const colorFinal = color === '__otro__' ? (color_otro || '—') : (color || '—');
    const aromasArr  = aromas ? aromas.split(',').map(s=>s.trim()).filter(Boolean) : [];
    if (aromas_otro?.trim()) aromasArr.push(aromas_otro.trim());
    const saborArr   = sabor ? sabor.split(',').map(s=>s.trim()).filter(Boolean) : [];
    if (sabor_otro?.trim()) saborArr.push(sabor_otro.trim());

    const fila = [
      fecha, hora,
      vino       || '—',   // C — coincide con Sheet actual
      bodega     || '—',   // D
      tipo       || '—',   // E
      precio     || '—',   // F
      puntuacion,           // G — Puntuación
      acidez     ?? '—',   // H
      cuerpo     ?? '—',   // I
      taninos    ?? '—',   // J
      visual     ?? '—',   // K
      repetiria  || '—',   // L — antes era Gusto
      descripcion|| '—',   // M — Opinión
      nivel      || 'simple', // N — nuevo
      colorFinal,           // O — nuevo
      aromasArr.join(', ') || '—', // P
      saborArr.join(', ')  || '—', // Q
      final_boca ?? '—',   // R
      olfativo   ?? '—',   // S
      copa       || '125 cc', // T
      varietal   || '—',   // U
      email      || '—',   // V — email al final para no correr columnas viejas
    ];

    const r = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Degustaciones!A:V:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      { method:"POST", headers:{"Authorization":`Bearer ${token}`,"Content-Type":"application/json"}, body:JSON.stringify({values:[fila]}) }
    );
    if (!r.ok) { const e=await r.json(); return res.status(502).json({error:"Error Sheets",detail:e?.error?.message}); }
    return res.status(200).json({ success: true });
  } catch(err) {
    return res.status(500).json({ error: "Error interno.", detail: err.message });
  }
};

async function getGoogleToken(clientEmail, privateKeyRaw) {
  const privateKey = privateKeyRaw.replace(/\\n/g,"\n");
  const now = Math.floor(Date.now()/1000);
  const claim = {iss:clientEmail,scope:"https://www.googleapis.com/auth/spreadsheets",aud:"https://oauth2.googleapis.com/token",exp:now+3600,iat:now};
  const h = b64url(JSON.stringify({alg:"RS256",typ:"JWT"}));
  const p = b64url(JSON.stringify(claim));
  const unsigned = `${h}.${p}`;
  const key = await crypto.subtle.importKey("pkcs8",pemToAB(privateKey),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${b64url(sig)}`;
  const t = await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:`grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`});
  const d = await t.json();
  if (!d.access_token) throw new Error("Token fallido: "+JSON.stringify(d));
  return d.access_token;
}
function b64url(data){
  const s=data instanceof ArrayBuffer?String.fromCharCode(...new Uint8Array(data)):typeof data==="string"?data:JSON.stringify(data);
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function pemToAB(pem){
  const b64=pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g,"");
  const bin=atob(b64);const buf=new ArrayBuffer(bin.length);const v=new Uint8Array(buf);
  for(let i=0;i<bin.length;i++)v[i]=bin.charCodeAt(i);return buf;
}
