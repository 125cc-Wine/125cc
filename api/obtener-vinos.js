// api/obtener-vinos.js
// Lee la hoja "Vinos" del Google Sheet y la devuelve como JSON al menú

const { getReadOnlyToken } = require('./_lib/google-auth');
const { normalizarBodega, leerBodegas } = require('./_lib/bodegas');
const { sql } = require('./_lib/db');

// Quincena vigente hoy, en hora de Buenos Aires — mismo esquema de cortes
// fijos (1–15 / 16–fin de mes) que datosQuincena()/cartaQuincenaDeFecha()
// en stats.html, reimplementado acá porque este archivo corre en el
// servidor y esas viven en el browser del admin (mismo criterio de
// duplicación ya usado con precioCopa()/vinoListoParaMenu — sin build
// step no hay módulo compartido posible entre los dos).
function normalizarTexto(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}
function quincenaVigenteInicio() {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }); // YYYY-MM-DD
  const [anio, mes, dia] = hoy.split('-');
  return `${anio}-${mes}-${Number(dia) <= 15 ? '01' : '16'}`;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  // Ventana corta a propósito: con el recambio de carta cada 14 días, un caché
  // de 5 min (como estaba antes) podía tardar hasta ~6 min en reflejar un vino
  // recién editado desde el admin.
  res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=30");
  if (req.method === "OPTIONS") return res.status(200).end();

  const SHEET_ID            = process.env.GOOGLE_SHEET_ID;
  const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
  const GOOGLE_PRIVATE_KEY  = process.env.GOOGLE_PRIVATE_KEY;

  if (!SHEET_ID || !GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY) {
    return res.status(500).json({ error: "Faltan credenciales de Google." });
  }

  try {
    const token = await getReadOnlyToken(GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY);

    // ?bodegas=1 — lo usa el admin (panel "Bodegas") para listar/editar el
    // catálogo centralizado. El menú público nunca manda este flag.
    if (req.query.bodegas === '1') {
      const { bodegas } = await leerBodegas(SHEET_ID, token);
      return res.status(200).json({ bodegas });
    }

    // Leer hoja Vinos — A:V incluye las 22 columnas hasta perfil_taninos
    const sheetRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Vinos!A1:V500`,
      { headers: { "Authorization": `Bearer ${token}` } }
    );

    if (!sheetRes.ok) {
      const err = await sheetRes.json();
      return res.status(502).json({ error: "Error leyendo Google Sheets.", detail: err?.error?.message });
    }

    const data = await sheetRes.json();
    const rows = data.values || [];

    if (rows.length < 2) {
      return res.status(200).json({ vinos: [] });
    }

    // Catálogo centralizado de bodegas (pestaña "Bodegas") — bodega_info de acá
    // pisa la del propio vino cuando el nombre matchea (normalizado). Si una
    // bodega todavía no está migrada, el vino conserva su bodega_info propia
    // como fallback — así nunca desaparece texto por no estar todavía en la
    // pestaña nueva.
    const { porNombre: bodegasPorNombre } = await leerBodegas(SHEET_ID, token);

    // Fila 0 = encabezados, filas 1+ = datos
    const headers = rows[0].map(h => h.trim().toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/\s+/g, "_")
    );

    const vinos = rows.slice(1)
      .filter(row => row[0] && row[0].toString().trim() !== "")
      .map(row => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = (row[i] || "").toString().trim(); });

        const bodegaCentral = bodegasPorNombre.get(normalizarBodega(obj.bodega));

        return {
          id:          parseInt(obj.id)  || 0,
          nombre:      obj.nombre        || "",
          bodega:      obj.bodega        || "",
          precio:      obj.precio        || "",
          copa:        obj.copa          || "125 cc",
          tipo:        obj.tipo          || "Tinto",
          x:           parseFloat(obj.x) || 0,
          y:           parseFloat(obj.y) || 0,
          varietal:    obj.varietal      || "",
          region:      obj.region        || "",
          altitud:     obj.altitud       || "",
          suelo:       obj.suelo         || "",
          crianza:     obj.crianza       || "",
          temperatura: obj.temperatura   || "",
          nota:        obj.nota          || "",
          maridaje:    obj.maridaje
            ? obj.maridaje.split(",").map(s => s.trim()).filter(Boolean)
            : [],
          bodega_info: bodegaCentral?.bodega_info || obj.bodega_info || "",
          bodega_lat:  bodegaCentral?.lat ?? null,
          bodega_lon:  bodegaCentral?.lon ?? null,
          tienda_url:  obj.tienda_url    || "",
          imagen:      obj.imagen        || "",
          perfil: {
            cuerpo:   parseInt(obj.perfil_cuerpo)   || 3,
            frescura: parseInt(obj.perfil_frescura) || 3,
            taninos:  parseInt(obj.perfil_taninos)  || 3,
          },
        };
      });

    // Número de copa (1..N) — ES la señal única de "este vino está en la
    // carta hoy": index.html, pos.html y la cuenta impresa lo muestran
    // como número, y ADEMÁS index.html usa numero!=null para decidir si
    // el vino aparece en el menú (ver vinoListoParaMenu()) — antes esa
    // decisión se tomaba dos veces, acá y de nuevo en el browser
    // (duplicado con el mismo riesgo de drift que ya se documentaba acá
    // mismo), sin que ninguna de las dos supiera qué quincena es hoy.
    //
    // "Debería ser automático junto al cambio de quincena" (pedido
    // real, 03/09/2026): un vino cuenta para la carta de HOY si el
    // Calendario de Carta lo confirmó para la quincena vigente
    // (carta_historial.semana_inicio) — match por nombre normalizado,
    // no por id (el id de carta_historial puede ser el UUID del
    // catálogo externo, distinto del id numérico que este vino tiene
    // acá en el Sheet; guardarCarta() en stats.html ya resuelve ese
    // mismo cruce por nombre al crear el borrador). Decisión explícita
    // del dueño: si llega el día del cambio y la ficha nueva no está
    // lista, el vino viejo se saca igual — el nuevo aparece con lo que
    // tenga (nombre/precio/tipo siempre están; nota/foto/maridaje se
    // muestran si existen — el resto de este archivo y de index.html ya
    // toleraba cada campo faltante por separado, acá solo se deja de
    // exigir los TRES juntos para poder aparecer). No se vuelve a
    // mostrar la quincena anterior mientras la nueva se completa, que
    // era el bug real reportado.
    //
    // Salvedad: si el Calendario de Carta directamente no tiene NADA
    // confirmado para la quincena vigente (nunca se planificó, no es el
    // caso de "está incompleta" sino "no existe registro"), cae a la
    // regla vieja (solo completitud) — evita un menú en blanco total
    // por no haber usado la herramienta esa quincena, que es peor que
    // mostrar la carta anterior sin actualizar.
    const inicioQuincena = quincenaVigenteInicio();
    const { rows: confirmadosRows } = await sql`
      SELECT DISTINCT vino_nombre FROM carta_historial WHERE semana_inicio = ${inicioQuincena}::date`;
    const confirmadosHoy = new Set(confirmadosRows.map((r) => normalizarTexto(r.vino_nombre)));
    const huboPlanificacion = confirmadosHoy.size > 0;

    let numeroSiguiente = 1;
    vinos.forEach((v) => {
      const enCartaVigente = huboPlanificacion
        ? confirmadosHoy.has(normalizarTexto(v.nombre))
        : (v.nota && v.imagen && Array.isArray(v.maridaje) && v.maridaje.length > 0); // salvedad: sin planificación, solo completitud
      v.numero = enCartaVigente ? numeroSiguiente++ : null;
    });

    return res.status(200).json({ vinos });

  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({ error: "Error interno.", detail: err.message });
  }
};
