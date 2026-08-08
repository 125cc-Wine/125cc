// api/_lib/pos/afip-wsfe.js — llamadas SOAP a WSFEv1 (facturación
// electrónica). El request se arma a mano con template strings
// (controlado por nosotros); la respuesta se parsea con fast-xml-parser
// — parsear con regex la respuesta que determina si una factura con
// dinero real fue aprobada es un riesgo que no vale la pena correr.
const { XMLParser } = require('fast-xml-parser');

const WSFE_URL = {
  homologacion: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
  produccion: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
};
const NS = 'http://ar.gov.afip.dif.FEV1/';

// Códigos AFIP relevantes para 125cc — no mágicos sueltos en el código.
const CBTE_TIPO = { FACTURA_A: 1, FACTURA_B: 6 };
const DOC_TIPO = { CUIT: 80, DNI: 96, CONSUMIDOR_FINAL: 99 };
const CONDICION_IVA_RECEPTOR = { RESPONSABLE_INSCRIPTO: 1, CONSUMIDOR_FINAL: 5 };
const ALICUOTA_IVA = { VEINTIUNO_PCT: 5 }; // Id=5 → 21%, único usado hoy (ver §11 del plan)
const CONCEPTO = { PRODUCTOS: 1 };

function xmlAuth({ token, sign, cuit }) {
  return `<Auth><Token>${token}</Token><Sign>${sign}</Sign><Cuit>${cuit}</Cuit></Auth>`;
}

async function callWsfe(metodo, ambiente, bodyXml) {
  const url = WSFE_URL[ambiente];
  if (!url) throw new Error(`Ambiente AFIP inválido: ${ambiente}`);
  const envelope =
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soapenv:Body><${metodo} xmlns="${NS}">${bodyXml}</${metodo}></soapenv:Body>` +
    `</soapenv:Envelope>`;

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `${NS}${metodo}` },
    body: envelope,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`WSFE (${metodo}) respondió ${r.status}: ${text.slice(0, 800)}`);

  // parseTagValue:false — CAE, fechas y números de documento son datos
  // fiscales, no deben pasar por la conversión automática a Number de
  // fast-xml-parser (semánticamente son texto, aunque tengan forma de
  // número; convertir de más es el tipo de sorpresa que no querés en
  // un CAE). Se castean a Number a mano solo donde hace falta (CbteNro).
  const parser = new XMLParser({
    ignoreAttributes: true,
    removeNSPrefix: true,
    parseTagValue: false,
    isArray: (name) => ['AlicIva', 'FECAEDetResponse', 'Obs', 'Err', 'Evt'].includes(name),
  });
  const soap = parser.parse(text);
  const body = soap?.Envelope?.Body;
  if (body?.Fault) throw new Error(`WSFE (${metodo}) rechazó la llamada: ${body.Fault.faultstring || JSON.stringify(body.Fault)}`);
  const result = body?.[`${metodo}Response`]?.[`${metodo}Result`];
  if (!result) throw new Error(`WSFE (${metodo}): respuesta sin ${metodo}Result.`);
  return result;
}

// Último número autorizado para (puntoVenta, cbteTipo) — el próximo a
// pedir es CbteNro + 1.
async function ultimoAutorizado(auth, ambiente, puntoVenta, cbteTipo) {
  const bodyXml = `${xmlAuth(auth)}<PtoVta>${puntoVenta}</PtoVta><CbteTipo>${cbteTipo}</CbteTipo>`;
  const result = await callWsfe('FECompUltimoAutorizado', ambiente, bodyXml);
  return Number(result.CbteNro || 0);
}

// Pide el CAE para un único comprobante (CantReg=1, CbteDesde=CbteHasta).
// detalle: { concepto, docTipo, docNro, cbteNro, cbteFch (YYYYMMDD),
//            impTotal, impNeto, impIva, condicionIvaReceptorId, alicuotaIvaId }
async function solicitarCAE(auth, ambiente, puntoVenta, cbteTipo, detalle) {
  const detXml =
    `<FECAEDetRequest>` +
    `<Concepto>${detalle.concepto}</Concepto>` +
    `<DocTipo>${detalle.docTipo}</DocTipo>` +
    `<DocNro>${detalle.docNro}</DocNro>` +
    `<CbteDesde>${detalle.cbteNro}</CbteDesde>` +
    `<CbteHasta>${detalle.cbteNro}</CbteHasta>` +
    `<CbteFch>${detalle.cbteFch}</CbteFch>` +
    `<ImpTotal>${detalle.impTotal}</ImpTotal>` +
    `<ImpTotConc>0</ImpTotConc>` +
    `<ImpNeto>${detalle.impNeto}</ImpNeto>` +
    `<ImpOpEx>0</ImpOpEx>` +
    `<ImpTrib>0</ImpTrib>` +
    `<ImpIVA>${detalle.impIva}</ImpIVA>` +
    `<MonId>PES</MonId>` +
    `<MonCotiz>1</MonCotiz>` +
    `<CondicionIVAReceptorId>${detalle.condicionIvaReceptorId}</CondicionIVAReceptorId>` +
    `<Iva><AlicIva><Id>${detalle.alicuotaIvaId}</Id><BaseImp>${detalle.impNeto}</BaseImp><Importe>${detalle.impIva}</Importe></AlicIva></Iva>` +
    `</FECAEDetRequest>`;
  const bodyXml =
    `${xmlAuth(auth)}` +
    `<FeCAEReq>` +
    `<FeCabReq><CantReg>1</CantReg><PtoVta>${puntoVenta}</PtoVta><CbteTipo>${cbteTipo}</CbteTipo></FeCabReq>` +
    `<FeDetReq>${detXml}</FeDetReq>` +
    `</FeCAEReq>`;
  const result = await callWsfe('FECAESolicitar', ambiente, bodyXml);

  const cab = result.FeCabResp || {};
  const det = (result.FeDetResp?.FECAEDetResponse || [])[0] || {};
  const erroresCab = result.Errors?.Err || [];
  const observaciones = det.Observaciones?.Obs || [];

  return {
    resultado: cab.Resultado || det.Resultado, // 'A' aprobado, 'R' rechazado
    cae: det.CAE || null,
    caeFchVto: det.CAEFchVto || null,
    observaciones,
    errores: erroresCab,
    motivoError: [...erroresCab, ...observaciones].map((e) => `${e.Code}: ${e.Msg}`).join(' | ') || null,
    raw: result,
  };
}

// Consulta si un número específico ya fue autorizado — se usa para el
// flujo de reintento cuando la llamada a FECAESolicitar tuvo timeout y
// no sabemos si AFIP alcanzó a procesarla antes de que se perdiera la
// respuesta.
async function consultarComprobante(auth, ambiente, puntoVenta, cbteTipo, cbteNro) {
  const bodyXml =
    `${xmlAuth(auth)}` +
    `<FeCompConsReq><CbteTipo>${cbteTipo}</CbteTipo><CbteNro>${cbteNro}</CbteNro><PtoVta>${puntoVenta}</PtoVta></FeCompConsReq>`;
  try {
    const result = await callWsfe('FECompConsultar', ambiente, bodyXml);
    const g = result.ResultGet;
    if (!g || !g.CAE) return null; // no autorizado (AFIP no llegó a procesarlo)
    return { cae: g.CAE, caeFchVto: g.CAEFchVto };
  } catch (err) {
    // "no se encontró comprobante" también puede venir como Fault/Error
    // de AFIP en vez de un ResultGet vacío — se trata igual como "no
    // autorizado todavía", no como error de nuestro lado.
    return null;
  }
}

// YYYYMMDD en zona horaria Argentina — Vercel corre en UTC, y facturar
// pasada la medianoche con Date().toISOString() daría la fecha
// equivocada.
function fechaHoyArgentina() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  return `${parts.year}${parts.month}${parts.day}`;
}

// Descompone un total (con IVA incluido, como se muestra en el menú)
// en neto+IVA garantizando que neto+iva === total exactamente (AFIP
// rechaza por descuadre de centavos si no cuadra).
function calcularNetoIva(total, alicuotaPct) {
  const totalNum = Number(total);
  const neto = Math.round((totalNum / (1 + alicuotaPct / 100)) * 100) / 100;
  const iva = Math.round((totalNum - neto) * 100) / 100;
  return { neto, iva };
}

module.exports = {
  CBTE_TIPO, DOC_TIPO, CONDICION_IVA_RECEPTOR, ALICUOTA_IVA, CONCEPTO,
  ultimoAutorizado, solicitarCAE, consultarComprobante,
  fechaHoyArgentina, calcularNetoIva,
};
