// Shared Google Service Account JWT helper
// Vercel excludes files in _lib from function exposure

async function getGoogleToken(clientEmail, privateKeyRaw, scope) {
  const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss:   clientEmail,
    scope: scope || 'https://www.googleapis.com/auth/spreadsheets',
    aud:   'https://oauth2.googleapis.com/token',
    exp:   now + 3600,
    iat:   now,
  };
  const header  = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify(claim));
  const unsigned = `${header}.${payload}`;
  const keyData  = pemToArrayBuffer(privateKey);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey,
    new TextEncoder().encode(unsigned)
  );
  const jwt = `${unsigned}.${b64url(signature)}`;
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error('Token fallido: ' + JSON.stringify(tokenData));
  return tokenData.access_token;
}

function b64url(data) {
  const str = data instanceof ArrayBuffer
    ? String.fromCharCode(...new Uint8Array(data))
    : typeof data === 'string' ? data : JSON.stringify(data);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToArrayBuffer(pem) {
  const b64    = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, '');
  const binary = atob(b64);
  const buf    = new ArrayBuffer(binary.length);
  const view   = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
  return buf;
}

const SCOPE_RO = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const SCOPE_RW = 'https://www.googleapis.com/auth/spreadsheets';

module.exports = {
  getGoogleToken,
  getReadOnlyToken:  (email, key) => getGoogleToken(email, key, SCOPE_RO),
  getReadWriteToken: (email, key) => getGoogleToken(email, key, SCOPE_RW),
};
