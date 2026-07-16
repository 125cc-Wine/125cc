// Extrae el precio de botella publicado en la página de producto de una tienda
// externa (tienda_url). Cubre los dos formatos más comunes en e-commerce
// argentino: JSON-LD schema.org/Product (Tiendanube, Shopify, WooCommerce) y,
// si no hay JSON-LD, los meta tags og:price:amount / product:price:amount.
function extraerPrecio(html) {
  const porJsonLd = extraerDeJsonLd(html);
  if (porJsonLd) return porJsonLd;
  return extraerDeMeta(html);
}

function extraerDeJsonLd(html) {
  const bloques = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const [, contenido] of bloques) {
    let json;
    try { json = JSON.parse(contenido.trim()); } catch { continue; }
    const nodos = Array.isArray(json) ? json : (Array.isArray(json['@graph']) ? json['@graph'] : [json]);
    for (const nodo of nodos) {
      const precio = precioDeProducto(nodo);
      if (precio != null) return precio;
    }
  }
  return null;
}

function precioDeProducto(nodo) {
  if (!nodo || typeof nodo !== 'object') return null;
  const tipo = nodo['@type'];
  const esProducto = tipo === 'Product' || (Array.isArray(tipo) && tipo.includes('Product'));
  if (!esProducto) return null;

  let offers = nodo.offers;
  if (Array.isArray(offers)) offers = offers[0];
  if (!offers || typeof offers !== 'object') return null;

  const crudo = offers.price ?? offers.priceSpecification?.price;
  const n = parseFloat(crudo);
  return isNaN(n) ? null : n;
}

function extraerDeMeta(html) {
  for (const prop of ['product:price:amount', 'og:price:amount']) {
    const re1 = new RegExp(`<meta[^>]*(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`, "i");
    const re2 = new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`, "i");
    const m = html.match(re1) || html.match(re2);
    if (m) {
      const n = parseFloat(m[1]);
      if (!isNaN(n)) return n;
    }
  }
  return null;
}

module.exports = { extraerPrecio };
