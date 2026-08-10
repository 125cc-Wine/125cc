// api/_lib/pos/comprobantes.js — orquesta la emisión de un comprobante
// fiscal AFIP para una comanda ya cobrada. Se llama DESPUÉS de que
// comanda-cerrar.js confirma el cobro — nunca antes, nunca bloqueante:
// si AFIP falla, la comanda queda cobrada igual y el comprobante queda
// reintentable (ver reintentarComprobante). Mismo principio de
// resiliencia que el cruce con Mis Catas en cliente.js.
//
// Explícitamente NO se usa la librería `afip.js`/`@afipsdk`: su versión
// mantenida hoy enruta las llamadas a WSAA/WSFE a través de un proxy
// propio de terceros (app.afipsdk.com) — el certificado y la clave
// privada del dueño no deben pasar por infraestructura de un tercero
// para esto. WSAA/WSFEv1 se reimplementan a mano en afip-wsaa.js /
// afip-wsfe.js.
const { sql, withTransaction } = require('../db');
const wsaa = require('./afip-wsaa');
const wsfe = require('./afip-wsfe');

function config() {
  const ambiente = process.env.AFIP_AMBIENTE === 'produccion' ? 'produccion' : 'homologacion';
  const cuit = process.env.AFIP_CUIT;
  const puntoVenta = Number(process.env.AFIP_PUNTO_VENTA);
  if (!cuit || !puntoVenta) throw new Error('Faltan AFIP_CUIT / AFIP_PUNTO_VENTA.');
  return { ambiente, cuit, puntoVenta };
}

// Decide Factura A (Responsable Inscripto, con CUIT) o B (Consumidor
// Final) según el cliente asociado a la comanda — nunca según lo que
// mande el frontend, para que no se pueda facturar A sin CUIT válido.
function armarDatosReceptor(cliente, docNroManual) {
  if (cliente && cliente.condicion_iva === 'responsable_inscripto' && cliente.cuit) {
    return {
      cbteTipo: wsfe.CBTE_TIPO.FACTURA_A,
      docTipo: wsfe.DOC_TIPO.CUIT,
      docNro: cliente.cuit,
      condicionIvaReceptorId: wsfe.CONDICION_IVA_RECEPTOR.RESPONSABLE_INSCRIPTO,
    };
  }
  const dni = docNroManual ? String(docNroManual).trim() : null;
  return {
    cbteTipo: wsfe.CBTE_TIPO.FACTURA_B,
    docTipo: dni ? wsfe.DOC_TIPO.DNI : wsfe.DOC_TIPO.CONSUMIDOR_FINAL,
    docNro: dni || '0',
    condicionIvaReceptorId: wsfe.CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL,
  };
}

async function emitirComprobante(req, res) {
  const { comanda_id, doc_nro, creado_por } = req.body || {};
  if (!comanda_id) return res.status(400).json({ error: "Falta comanda_id." });

  let cfg;
  try {
    cfg = config();
  } catch (err) {
    // AFIP todavía no configurado (sin AFIP_CERT/CUIT/PUNTO_VENTA en
    // Vercel) — no es una falla real de facturación, es que la
    // funcionalidad todavía no está prendida. no_configurado:true deja
    // que el frontend lo trate en silencio (sin toast de error) en vez
    // de mostrarle al mozo "factura pendiente" en cada cobro mientras
    // se termina de configurar.
    return res.status(200).json({ comprobante: { estado: 'error', motivo_error: err.message, no_configurado: true } });
  }

  const { rows: comandaRows } = await sql`
    SELECT c.id, c.estado, c.total, c.cliente_id,
           cl.cuit, cl.razon_social, cl.condicion_iva
    FROM comandas c LEFT JOIN clientes cl ON cl.id = c.cliente_id
    WHERE c.id = ${comanda_id}`;
  if (!comandaRows.length) return res.status(404).json({ error: "Comanda no encontrada." });
  const comanda = comandaRows[0];
  if (comanda.estado !== 'cerrada') {
    return res.status(409).json({ error: "La comanda todavía no está cobrada." });
  }

  // Ya hay un comprobante aprobado para esta comanda — no se emite dos
  // veces la misma venta (protegido también por el índice único a
  // nivel DB, esto es solo para devolver un mensaje claro).
  const { rows: existentes } = await sql`
    SELECT id, cae FROM comprobantes WHERE comanda_id=${comanda_id} AND estado='aprobado'`;
  if (existentes.length) {
    return res.status(409).json({ error: "Ya existe un comprobante aprobado para esta comanda.", comprobante_id: existentes[0].id });
  }

  const cliente = comanda.cliente_id
    ? { cuit: comanda.cuit, razon_social: comanda.razon_social, condicion_iva: comanda.condicion_iva }
    : null;
  const receptor = armarDatosReceptor(cliente, doc_nro);
  const { neto, iva } = wsfe.calcularNetoIva(comanda.total, 21);
  const alicuotaIvaId = wsfe.ALICUOTA_IVA.VEINTIUNO_PCT;
  const cbteFch = wsfe.fechaHoyArgentina();

  let resultado;
  try {
    resultado = await withTransaction(async (client) => {
      await client.sql`
        INSERT INTO afip_contadores (punto_venta, cbte_tipo, ultimo_nro)
        VALUES (${cfg.puntoVenta}, ${receptor.cbteTipo}, 0)
        ON CONFLICT (punto_venta, cbte_tipo) DO NOTHING`;
      const { rows: contRows } = await client.sql`
        SELECT ultimo_nro FROM afip_contadores
        WHERE punto_venta=${cfg.puntoVenta} AND cbte_tipo=${receptor.cbteTipo} FOR UPDATE`;
      const ultimoLocal = contRows[0].ultimo_nro;

      const auth = { ...(await wsaa.getTicket('wsfe', cfg.ambiente)), cuit: cfg.cuit };

      let ultimoAfip;
      try {
        ultimoAfip = await wsfe.ultimoAutorizado(auth, cfg.ambiente, cfg.puntoVenta, receptor.cbteTipo);
      } catch (err) {
        return { estado: 'error', motivo_error: `No se pudo consultar el último autorizado en AFIP: ${err.message}` };
      }
      const proximoNro = Math.max(ultimoLocal, ultimoAfip) + 1;

      const detalle = {
        concepto: wsfe.CONCEPTO.PRODUCTOS,
        docTipo: receptor.docTipo,
        docNro: receptor.docNro,
        cbteNro: proximoNro,
        cbteFch,
        impTotal: comanda.total,
        impNeto: neto,
        impIva: iva,
        condicionIvaReceptorId: receptor.condicionIvaReceptorId,
        alicuotaIvaId,
      };

      let cae;
      try {
        cae = await wsfe.solicitarCAE(auth, cfg.ambiente, cfg.puntoVenta, receptor.cbteTipo, detalle);
      } catch (err) {
        // Timeout/caída: no sabemos si AFIP procesó el pedido antes de
        // que se perdiera la respuesta — se consulta ese número puntual
        // antes de asumir error, para no perder un CAE ya emitido.
        const recuperado = await wsfe.consultarComprobante(auth, cfg.ambiente, cfg.puntoVenta, receptor.cbteTipo, proximoNro);
        if (recuperado) {
          await client.sql`
            UPDATE afip_contadores SET ultimo_nro=${proximoNro}, updated_at=now()
            WHERE punto_venta=${cfg.puntoVenta} AND cbte_tipo=${receptor.cbteTipo}`;
          const { rows } = await client.sql`
            INSERT INTO comprobantes (comanda_id, cliente_id, ambiente, punto_venta, cbte_tipo, numero,
              doc_tipo, doc_nro, condicion_iva_receptor_id, concepto, imp_neto, imp_iva, imp_total,
              alicuota_iva_id, cae, cae_vencimiento, estado, request_json, creado_por)
            VALUES (${comanda_id}, ${comanda.cliente_id}, ${cfg.ambiente}, ${cfg.puntoVenta}, ${receptor.cbteTipo}, ${proximoNro},
              ${detalle.docTipo}, ${detalle.docNro}, ${detalle.condicionIvaReceptorId}, ${detalle.concepto},
              ${neto}, ${iva}, ${comanda.total}, ${alicuotaIvaId},
              ${recuperado.cae}, ${recuperado.caeFchVto ? formatFecha(recuperado.caeFchVto) : null},
              'aprobado', ${JSON.stringify(detalle)}::jsonb, ${creado_por || null})
            RETURNING id, cae, cae_vencimiento, numero, cbte_tipo, estado`;
          return { comprobante: rows[0] };
        }
        return { estado: 'error', motivo_error: `Error de comunicación con AFIP: ${err.message}`, cbteNro: proximoNro, detalle };
      }

      if (cae.resultado === 'A') {
        await client.sql`
          UPDATE afip_contadores SET ultimo_nro=${proximoNro}, updated_at=now()
          WHERE punto_venta=${cfg.puntoVenta} AND cbte_tipo=${receptor.cbteTipo}`;
        const { rows } = await client.sql`
          INSERT INTO comprobantes (comanda_id, cliente_id, ambiente, punto_venta, cbte_tipo, numero,
            doc_tipo, doc_nro, condicion_iva_receptor_id, concepto, imp_neto, imp_iva, imp_total,
            alicuota_iva_id, cae, cae_vencimiento, estado, observaciones, request_json, response_json, creado_por)
          VALUES (${comanda_id}, ${comanda.cliente_id}, ${cfg.ambiente}, ${cfg.puntoVenta}, ${receptor.cbteTipo}, ${proximoNro},
            ${detalle.docTipo}, ${detalle.docNro}, ${detalle.condicionIvaReceptorId}, ${detalle.concepto},
            ${neto}, ${iva}, ${comanda.total}, ${alicuotaIvaId},
            ${cae.cae}, ${cae.caeFchVto ? formatFecha(cae.caeFchVto) : null},
            'aprobado', ${JSON.stringify(cae.observaciones)}::jsonb, ${JSON.stringify(detalle)}::jsonb, ${JSON.stringify(cae.raw)}::jsonb, ${creado_por || null})
          RETURNING id, cae, cae_vencimiento, numero, cbte_tipo, estado, observaciones`;
        return { comprobante: rows[0] };
      }

      // Rechazado — AFIP contestó explícitamente que no. No se toca
      // afip_contadores (el número nunca se consumió del lado de AFIP).
      const { rows } = await client.sql`
        INSERT INTO comprobantes (comanda_id, cliente_id, ambiente, punto_venta, cbte_tipo, numero,
          doc_tipo, doc_nro, condicion_iva_receptor_id, concepto, imp_neto, imp_iva, imp_total,
          alicuota_iva_id, estado, motivo_error, request_json, response_json, creado_por)
        VALUES (${comanda_id}, ${comanda.cliente_id}, ${cfg.ambiente}, ${cfg.puntoVenta}, ${receptor.cbteTipo}, ${proximoNro},
          ${detalle.docTipo}, ${detalle.docNro}, ${detalle.condicionIvaReceptorId}, ${detalle.concepto},
          ${neto}, ${iva}, ${comanda.total}, ${alicuotaIvaId},
          'rechazado', ${cae.motivoError}, ${JSON.stringify(detalle)}::jsonb, ${JSON.stringify(cae.raw)}::jsonb, ${creado_por || null})
        RETURNING id, cbte_tipo, numero, estado, motivo_error`;
      return { comprobante: rows[0] };
    });
  } catch (err) {
    // Error no esperado (ticket WSAA no obtenible, excepción no
    // contemplada) — se registra igual como fila de auditoría, fuera
    // de la transacción de lock (que ya se cerró/revirtió).
    const { rows } = await sql`
      INSERT INTO comprobantes (comanda_id, cliente_id, ambiente, punto_venta, cbte_tipo,
        doc_tipo, doc_nro, condicion_iva_receptor_id, concepto, imp_neto, imp_iva, imp_total,
        alicuota_iva_id, estado, motivo_error, creado_por)
      VALUES (${comanda_id}, ${comanda.cliente_id}, ${cfg.ambiente}, ${cfg.puntoVenta}, ${receptor.cbteTipo},
        ${receptor.docTipo}, ${receptor.docNro}, ${receptor.condicionIvaReceptorId}, ${wsfe.CONCEPTO.PRODUCTOS},
        ${neto}, ${iva}, ${comanda.total}, ${wsfe.ALICUOTA_IVA.VEINTIUNO_PCT},
        'error', ${err.message}, ${creado_por || null})
      RETURNING id, cbte_tipo, estado, motivo_error`;
    return res.status(200).json({ comprobante: rows[0] });
  }

  if (resultado.estado === 'error') {
    const { rows } = await sql`
      INSERT INTO comprobantes (comanda_id, cliente_id, ambiente, punto_venta, cbte_tipo,
        doc_tipo, doc_nro, condicion_iva_receptor_id, concepto, imp_neto, imp_iva, imp_total,
        alicuota_iva_id, estado, motivo_error, creado_por)
      VALUES (${comanda_id}, ${comanda.cliente_id}, ${cfg.ambiente}, ${cfg.puntoVenta}, ${receptor.cbteTipo},
        ${receptor.docTipo}, ${receptor.docNro}, ${receptor.condicionIvaReceptorId}, ${wsfe.CONCEPTO.PRODUCTOS},
        ${neto}, ${iva}, ${comanda.total}, ${wsfe.ALICUOTA_IVA.VEINTIUNO_PCT},
        'error', ${resultado.motivo_error}, ${creado_por || null})
      RETURNING id, cbte_tipo, estado, motivo_error`;
    return res.status(200).json({ comprobante: rows[0] });
  }

  return res.status(200).json({ comprobante: resultado.comprobante });
}

// AFIP devuelve fechas como YYYYMMDD (texto) — se guarda como date.
function formatFecha(yyyymmdd) {
  const s = String(yyyymmdd);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

async function listComprobantes(req, res) {
  const { mes, estado } = req.query;
  let inicio, finExclusivo;
  if (mes) {
    if (!/^\d{4}-\d{2}$/.test(mes)) return res.status(400).json({ error: "Formato de mes inválido (usar YYYY-MM)." });
    const [y, m] = mes.split('-').map(Number);
    inicio = `${mes}-01`;
    finExclusivo = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  }

  let rows;
  if (mes && estado) {
    ({ rows } = await sql`
      SELECT c.id, c.comanda_id, c.cliente_id, cl.nombre AS cliente_nombre, c.ambiente, c.punto_venta,
        c.cbte_tipo, c.numero, c.doc_tipo, c.doc_nro, c.imp_neto, c.imp_iva, c.imp_total,
        c.cae, c.cae_vencimiento, c.estado, c.motivo_error, c.observaciones, c.created_at
      FROM comprobantes c LEFT JOIN clientes cl ON cl.id = c.cliente_id
      WHERE c.created_at >= ${inicio} AND c.created_at < ${finExclusivo} AND c.estado = ${estado}
      ORDER BY c.created_at DESC LIMIT 200`);
  } else if (mes) {
    ({ rows } = await sql`
      SELECT c.id, c.comanda_id, c.cliente_id, cl.nombre AS cliente_nombre, c.ambiente, c.punto_venta,
        c.cbte_tipo, c.numero, c.doc_tipo, c.doc_nro, c.imp_neto, c.imp_iva, c.imp_total,
        c.cae, c.cae_vencimiento, c.estado, c.motivo_error, c.observaciones, c.created_at
      FROM comprobantes c LEFT JOIN clientes cl ON cl.id = c.cliente_id
      WHERE c.created_at >= ${inicio} AND c.created_at < ${finExclusivo}
      ORDER BY c.created_at DESC LIMIT 200`);
  } else if (estado) {
    ({ rows } = await sql`
      SELECT c.id, c.comanda_id, c.cliente_id, cl.nombre AS cliente_nombre, c.ambiente, c.punto_venta,
        c.cbte_tipo, c.numero, c.doc_tipo, c.doc_nro, c.imp_neto, c.imp_iva, c.imp_total,
        c.cae, c.cae_vencimiento, c.estado, c.motivo_error, c.observaciones, c.created_at
      FROM comprobantes c LEFT JOIN clientes cl ON cl.id = c.cliente_id
      WHERE c.estado = ${estado}
      ORDER BY c.created_at DESC LIMIT 200`);
  } else {
    ({ rows } = await sql`
      SELECT c.id, c.comanda_id, c.cliente_id, cl.nombre AS cliente_nombre, c.ambiente, c.punto_venta,
        c.cbte_tipo, c.numero, c.doc_tipo, c.doc_nro, c.imp_neto, c.imp_iva, c.imp_total,
        c.cae, c.cae_vencimiento, c.estado, c.motivo_error, c.observaciones, c.created_at
      FROM comprobantes c LEFT JOIN clientes cl ON cl.id = c.cliente_id
      ORDER BY c.created_at DESC LIMIT 200`);
  }

  let ambiente = 'homologacion';
  try { ambiente = config().ambiente; } catch (_) {}
  return res.status(200).json({ comprobantes: rows, ambiente });
}

// Reintenta un comprobante en estado rechazado/error — vuelve a correr
// exactamente el mismo flujo de emisión (nueva numeración, nuevo
// pedido de CAE). Si ya hay uno aprobado para la comanda, no reintenta
// (protegido también por el índice único a nivel DB).
async function reintentarComprobante(req, res) {
  const { comprobante_id, doc_nro } = req.body || {};
  if (!comprobante_id) return res.status(400).json({ error: "Falta comprobante_id." });

  const { rows } = await sql`SELECT comanda_id, estado, creado_por FROM comprobantes WHERE id=${comprobante_id}`;
  if (!rows.length) return res.status(404).json({ error: "Comprobante no encontrado." });
  if (rows[0].estado === 'aprobado') {
    return res.status(409).json({ error: "Este comprobante ya está aprobado, no se puede reintentar." });
  }

  req.body = { comanda_id: rows[0].comanda_id, doc_nro, creado_por: rows[0].creado_por };
  return emitirComprobante(req, res);
}

// Franja de cifras del panel Facturación (auditoría, sección 02 —
// "¿quedó todo emitido?"): el panel de hoy lista lo que se emitió, que
// es lo que no da problemas. Lo que falta es lo que NO está — comandas
// cerradas del mes sin comprobante aprobado asociado. Esa cifra tiene
// que existir ANTES de encender producción, no después.
async function getResumenFacturacion(req, res) {
  const mes = req.query.mes || new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(mes)) return res.status(400).json({ error: "Formato de mes inválido (usar YYYY-MM)." });
  const [y, m] = mes.split('-').map(Number);
  const inicio = `${mes}-01`;
  const finExclusivo = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);

  const { rows: facturadoRows } = await sql`
    SELECT COALESCE(SUM(imp_total), 0) AS total, COUNT(*) AS cantidad
    FROM comprobantes WHERE estado='aprobado' AND created_at >= ${inicio} AND created_at < ${finExclusivo}`;

  const { rows: reintentablesRows } = await sql`
    SELECT COUNT(*) AS cantidad FROM comprobantes WHERE estado IN ('rechazado','error')`;

  const { rows: sinEmitirRows } = await sql`
    SELECT COUNT(*) AS cantidad, COALESCE(SUM(c.total), 0) AS total
    FROM comandas c
    WHERE c.estado='cerrada' AND c.cerrada_at >= ${inicio} AND c.cerrada_at < ${finExclusivo}
      AND NOT EXISTS (SELECT 1 FROM comprobantes cp WHERE cp.comanda_id = c.id AND cp.estado='aprobado')`;

  let ambiente = 'homologacion';
  try { ambiente = config().ambiente; } catch (_) {}

  return res.status(200).json({
    mes,
    facturado: facturadoRows[0].total, facturadoCantidad: facturadoRows[0].cantidad,
    reintentables: reintentablesRows[0].cantidad,
    sinEmitir: sinEmitirRows[0].cantidad, sinEmitirTotal: sinEmitirRows[0].total,
    ambiente,
  });
}

module.exports = { emitirComprobante, listComprobantes, reintentarComprobante, getResumenFacturacion };
