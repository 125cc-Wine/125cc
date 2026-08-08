// api/_lib/pos/afip-wsaa.js — obtiene y cachea el Ticket de Acceso (TA)
// de AFIP para el servicio WSFE. El TA (Token+Sign) vale ~12hs; se
// persiste en la tabla afip_tickets porque Vercel no mantiene estado
// entre invocaciones serverless, y AFIP limita cuán seguido se puede
// pedir un ticket nuevo para el mismo servicio (2-10 min entre pedidos).
//
// Firma CMS/PKCS#7 (SHA-256) con node-forge — verificado en esta misma
// sesión con `openssl cms -verify` contra un certificado de prueba,
// antes de escribir este módulo. No se usa ninguna librería de AFIP de
// terceros (ver comentario en comprobantes.js sobre por qué).
const forge = require('node-forge');
const { XMLParser } = require('fast-xml-parser');
const { sql } = require('../db');

const WSAA_URL = {
  homologacion: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
  produccion: 'https://wsaa.afip.gov.ar/ws/services/LoginCms',
};

const MARGEN_SEGURIDAD_MS = 10 * 60 * 1000; // 10 min antes de expirar, se pide uno nuevo

function pem(raw) {
  // Mismo tratamiento que google-auth.js: Vercel guarda env vars
  // multilínea con \n literales, hay que convertirlos a salto real.
  return (raw || '').replace(/\\n/g, '\n');
}

function pad2(n) { return String(n).padStart(2, '0'); }

// Fecha/hora en formato AFIP (offset -03:00 de Argentina), sin depender
// de la timezone del proceso — Vercel corre en UTC.
function fechaAfip(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}-03:00`;
}

function buildTRA(servicio) {
  const ahora = new Date();
  const desde = new Date(ahora.getTime() - MARGEN_SEGURIDAD_MS);
  const hasta = new Date(ahora.getTime() + MARGEN_SEGURIDAD_MS);
  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<loginTicketRequest version="1.0">` +
    `<header>` +
    `<uniqueId>${Math.floor(ahora.getTime() / 1000)}</uniqueId>` +
    `<generationTime>${fechaAfip(desde)}</generationTime>` +
    `<expirationTime>${fechaAfip(hasta)}</expirationTime>` +
    `</header>` +
    `<service>${servicio}</service>` +
    `</loginTicketRequest>`;
}

function signTRA(traXml, certPem, keyPem) {
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(traXml, 'utf8');
  p7.addCertificate(certPem);
  p7.addSigner({
    key: keyPem,
    certificate: certPem,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  });
  p7.sign();
  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  return forge.util.encode64(der);
}

async function callLoginCms(cms64, ambiente) {
  const url = WSAA_URL[ambiente];
  if (!url) throw new Error(`Ambiente AFIP inválido: ${ambiente}`);
  const envelope =
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soapenv:Body>` +
    `<loginCms xmlns="http://wsaa.view.sua.dvadac.desein.afip.gov">` +
    `<in0>${cms64}</in0>` +
    `</loginCms>` +
    `</soapenv:Body>` +
    `</soapenv:Envelope>`;

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
    body: envelope,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`WSAA respondió ${r.status}: ${text.slice(0, 500)}`);
  return text;
}

function parseLoginCmsResponse(soapXml) {
  // parseTagValue:false por consistencia con afip-wsfe.js — acá no hay
  // campos puramente numéricos, pero mejor no depender de la heurística
  // de fast-xml-parser para nada que venga de AFIP.
  const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false });
  const soap = parser.parse(soapXml);
  const body = soap?.Envelope?.Body;
  if (body?.Fault) {
    throw new Error(`WSAA rechazó el login: ${body.Fault.faultstring || JSON.stringify(body.Fault)}`);
  }
  const returnXml = body?.loginCmsResponse?.loginCmsReturn;
  if (!returnXml) throw new Error('Respuesta de WSAA sin loginCmsReturn.');
  // loginCmsReturn viene como XML "de texto" (entidades ya decodificadas
  // por el primer parseo) — se parsea una segunda vez.
  const inner = parser.parse(returnXml);
  const cred = inner?.loginTicketResponse?.credentials;
  const header = inner?.loginTicketResponse?.header;
  if (!cred?.token || !cred?.sign) throw new Error('Respuesta de WSAA sin token/sign.');
  return { token: cred.token, sign: cred.sign, expirationTime: header?.expirationTime };
}

// Devuelve {token, sign} vigente para el servicio+ambiente dados,
// pidiendo uno nuevo a AFIP solo si no hay uno cacheado o está por
// vencer. AFIP_CERT/AFIP_PRIVATE_KEY nunca se loguean ni se exponen en
// ninguna respuesta — solo se usan en memoria para firmar el TRA.
async function getTicket(servicio, ambiente) {
  const { rows } = await sql`
    SELECT token, sign, expira_at FROM afip_tickets
    WHERE servicio=${servicio} AND ambiente=${ambiente}`;
  if (rows.length && new Date(rows[0].expira_at).getTime() - Date.now() > MARGEN_SEGURIDAD_MS) {
    return { token: rows[0].token, sign: rows[0].sign };
  }

  const certPem = pem(process.env.AFIP_CERT);
  const keyPem = pem(process.env.AFIP_PRIVATE_KEY);
  if (!certPem || !keyPem) throw new Error('Faltan AFIP_CERT / AFIP_PRIVATE_KEY.');

  const tra = buildTRA(servicio);
  const cms64 = signTRA(tra, certPem, keyPem);
  const soapResponse = await callLoginCms(cms64, ambiente);
  const { token, sign, expirationTime } = parseLoginCmsResponse(soapResponse);

  const expiraAt = expirationTime ? new Date(expirationTime) : new Date(Date.now() + 11 * 60 * 60 * 1000);
  await sql`
    INSERT INTO afip_tickets (servicio, ambiente, token, sign, generado_at, expira_at)
    VALUES (${servicio}, ${ambiente}, ${token}, ${sign}, now(), ${expiraAt.toISOString()})
    ON CONFLICT (servicio, ambiente) DO UPDATE
      SET token=${token}, sign=${sign}, generado_at=now(), expira_at=${expiraAt.toISOString()}`;

  return { token, sign };
}

module.exports = { getTicket, fechaAfip };
