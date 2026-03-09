/**
 * Shared food category mappings used by Lista.jsx and Comparador.jsx.
 * Single source of truth for canonical_name → category resolution.
 */

const CANONICAL_PREFIXES = {
  // Carnes y Embutidos
  'carne_': 'Carnes y Embutidos',
  'embutido_': 'Carnes y Embutidos',
  'pollo': 'Carnes y Embutidos',
  'pechuga': 'Carnes y Embutidos',
  'ternera': 'Carnes y Embutidos',
  'cerdo': 'Carnes y Embutidos',
  'jamon': 'Carnes y Embutidos',
  'chorizo': 'Carnes y Embutidos',
  'salchicha': 'Carnes y Embutidos',
  'bacon': 'Carnes y Embutidos',
  'lomo': 'Carnes y Embutidos',
  'costilla': 'Carnes y Embutidos',
  'muslo': 'Carnes y Embutidos',
  'pavo': 'Carnes y Embutidos',
  'cordero': 'Carnes y Embutidos',
  'hamburguesa': 'Carnes y Embutidos',
  'albondiga': 'Carnes y Embutidos',
  'filete': 'Carnes y Embutidos',
  'solomillo': 'Carnes y Embutidos',

  // Pescado y Marisco
  'pescado_': 'Pescado y Marisco',
  'marisco_': 'Pescado y Marisco',
  'salmon': 'Pescado y Marisco',
  'atun': 'Pescado y Marisco',
  'merluza': 'Pescado y Marisco',
  'bacalao': 'Pescado y Marisco',
  'gamba': 'Pescado y Marisco',
  'langostino': 'Pescado y Marisco',
  'mejillon': 'Pescado y Marisco',
  'sardina': 'Pescado y Marisco',
  'lubina': 'Pescado y Marisco',
  'dorada': 'Pescado y Marisco',
  'trucha': 'Pescado y Marisco',
  'calamar': 'Pescado y Marisco',
  'pulpo': 'Pescado y Marisco',
  'anchoa': 'Pescado y Marisco',
  'surimi': 'Pescado y Marisco',

  // Frutas y Verduras
  'verdura_': 'Frutas y Verduras',
  'fruta_': 'Frutas y Verduras',
  'tomate': 'Frutas y Verduras',
  'cebolla': 'Frutas y Verduras',
  'ajo': 'Frutas y Verduras',
  'patata': 'Frutas y Verduras',
  'zanahoria': 'Frutas y Verduras',
  'pimiento': 'Frutas y Verduras',
  'calabacin': 'Frutas y Verduras',
  'lechuga': 'Frutas y Verduras',
  'espinaca': 'Frutas y Verduras',
  'brocoli': 'Frutas y Verduras',
  'coliflor': 'Frutas y Verduras',
  'berenjena': 'Frutas y Verduras',
  'pepino': 'Frutas y Verduras',
  'champi': 'Frutas y Verduras',
  'seta': 'Frutas y Verduras',
  'alcachofa': 'Frutas y Verduras',
  'judias_verde': 'Frutas y Verduras',
  'guisante': 'Frutas y Verduras',
  'maiz': 'Frutas y Verduras',
  'apio': 'Frutas y Verduras',
  'puerro': 'Frutas y Verduras',
  'col_': 'Frutas y Verduras',
  'repollo': 'Frutas y Verduras',
  'nabo': 'Frutas y Verduras',
  'calabaza': 'Frutas y Verduras',
  'boniato': 'Frutas y Verduras',
  'remolacha': 'Frutas y Verduras',
  'esparrago': 'Frutas y Verduras',
  'aguacate': 'Frutas y Verduras',
  'limon': 'Frutas y Verduras',
  'naranja': 'Frutas y Verduras',
  'manzana': 'Frutas y Verduras',
  'platano': 'Frutas y Verduras',
  'fresa': 'Frutas y Verduras',
  'melocoton': 'Frutas y Verduras',
  'perejil': 'Frutas y Verduras',
  'cilantro': 'Frutas y Verduras',
  'albahaca': 'Frutas y Verduras',
  'rucula': 'Frutas y Verduras',
  'canoni': 'Frutas y Verduras',
  'endibia': 'Frutas y Verduras',
  'acelga': 'Frutas y Verduras',

  // Lácteos y Huevos
  'lacteo_': 'Lácteos y Huevos',
  'yogur': 'Lácteos y Huevos',
  'leche': 'Lácteos y Huevos',
  'queso': 'Lácteos y Huevos',
  'nata': 'Lácteos y Huevos',
  'mantequilla': 'Lácteos y Huevos',
  'mozzarella': 'Lácteos y Huevos',
  'parmesano': 'Lácteos y Huevos',
  'crema': 'Lácteos y Huevos',
  'requesion': 'Lácteos y Huevos',
  'cuajada': 'Lácteos y Huevos',
  'feta': 'Lácteos y Huevos',
  'mascarpone': 'Lácteos y Huevos',
  'bechamel': 'Lácteos y Huevos',

  // Cereales y Pasta
  'cereal_': 'Cereales y Pasta',
  'pasta_': 'Cereales y Pasta',
  'arroz': 'Cereales y Pasta',
  'espagueti': 'Cereales y Pasta',
  'macarron': 'Cereales y Pasta',
  'fideos': 'Cereales y Pasta',
  'cuscus': 'Cereales y Pasta',
  'quinoa': 'Cereales y Pasta',
  'avena': 'Cereales y Pasta',
  'trigo': 'Cereales y Pasta',
  'tortita_': 'Cereales y Pasta',
  'tortilla_wrap': 'Cereales y Pasta',
  'lasana': 'Cereales y Pasta',
  'canelone': 'Cereales y Pasta',
  'tallarines': 'Cereales y Pasta',
  'noodle': 'Cereales y Pasta',

  // Panadería
  'pan_': 'Panadería',
  'harina': 'Panadería',
  'pan ': 'Panadería',
  'tostada': 'Panadería',
  'biscote': 'Panadería',

  // Legumbres
  'legumbre_': 'Legumbres',
  'lenteja': 'Legumbres',
  'garbanzo': 'Legumbres',
  'alubia': 'Legumbres',
  'judia_': 'Legumbres',

  // Despensa
  'aceite': 'Despensa',
  'vinagre': 'Despensa',
  'especia_': 'Despensa',
  'condimento_': 'Despensa',
  'caldo_': 'Despensa',
  'conserva_': 'Despensa',
  'salsa_': 'Despensa',
  'endulzante_': 'Despensa',
  'encurtido_': 'Despensa',
  'bebida_': 'Despensa',
  'jugo_': 'Despensa',
  'azucar': 'Despensa',
  'sal': 'Despensa',
  'pimienta': 'Despensa',
  'oregano': 'Despensa',
  'comino': 'Despensa',
  'pimenton': 'Despensa',
  'canela': 'Despensa',
  'curry': 'Despensa',
  'soja': 'Despensa',
  'miel': 'Despensa',
  'mostaza': 'Despensa',
  'ketchup': 'Despensa',
  'mayonesa': 'Despensa',
  'maizena': 'Despensa',
  'levadura': 'Despensa',
  'cacao': 'Despensa',
  'chocolate': 'Despensa',
  'cafe': 'Despensa',
  'te_': 'Despensa',
  'mermelada': 'Despensa',
  'concentrado': 'Despensa',
  'sofrito': 'Despensa',

  // Frutos Secos
  'frutos_secos_': 'Frutos Secos',
  'frutos_': 'Frutos Secos',
  'almendra': 'Frutos Secos',
  'nuez': 'Frutos Secos',
  'nueces': 'Frutos Secos',
  'cacahuete': 'Frutos Secos',
  'pistacho': 'Frutos Secos',
  'pasa': 'Frutos Secos',
  'semilla': 'Frutos Secos',
  'pipas': 'Frutos Secos',
  'sesamo': 'Frutos Secos',
};

export const CATEGORY_META = {
  'Frutas y Verduras':  { icon: 'nutrition',     color: 'text-green-700',  bg: 'bg-green-100',  order: 1 },
  'Carnes y Embutidos': { icon: 'restaurant',    color: 'text-red-600',    bg: 'bg-red-100',    order: 2 },
  'Pescado y Marisco':  { icon: 'set_meal',      color: 'text-blue-500',   bg: 'bg-blue-100',   order: 3 },
  'Lácteos y Huevos':   { icon: 'water_drop',    color: 'text-blue-600',   bg: 'bg-blue-100',   order: 4 },
  'Cereales y Pasta':   { icon: 'grain',         color: 'text-amber-600',  bg: 'bg-amber-100',  order: 5 },
  'Legumbres':          { icon: 'spa',           color: 'text-lime-700',   bg: 'bg-lime-100',   order: 6 },
  'Panadería':          { icon: 'bakery_dining', color: 'text-yellow-700', bg: 'bg-yellow-100', order: 7 },
  'Frutos Secos':       { icon: 'psychiatry',    color: 'text-amber-800',  bg: 'bg-amber-100',  order: 8 },
  'Despensa':           { icon: 'shelves',       color: 'text-orange-600', bg: 'bg-orange-100', order: 9 },
  'Otros':              { icon: 'shopping_bag',  color: 'text-gray-600',   bg: 'bg-gray-100',   order: 99 },
};

/**
 * Map a canonical_name to its food category.
 * @param {string} canonicalName - e.g. "carne_pechuga_pollo", "huevos"
 * @returns {string} category label
 */
export function getCategoryFromCanonical(canonicalName, productName) {
  if (!canonicalName && !productName) return 'Otros';
  const cn = (canonicalName || '').toLowerCase().replace(/[áàä]/g,'a').replace(/[éèë]/g,'e').replace(/[íìï]/g,'i').replace(/[óòö]/g,'o').replace(/[úùü]/g,'u');

  // Exact matches
  if (cn === 'huevos' || cn.startsWith('huevo')) return 'Lácteos y Huevos';

  for (const [prefix, category] of Object.entries(CANONICAL_PREFIXES)) {
    if (cn.startsWith(prefix)) return category;
  }

  // Fallback: try matching against product name keywords
  if (productName) {
    const pn = productName.toLowerCase().replace(/[áàä]/g,'a').replace(/[éèë]/g,'e').replace(/[íìï]/g,'i').replace(/[óòö]/g,'o').replace(/[úùü]/g,'u');
    for (const [prefix, category] of Object.entries(CANONICAL_PREFIXES)) {
      if (pn.includes(prefix.replace(/_$/, ''))) return category;
    }
  }

  return 'Otros';
}

/**
 * Get metadata (icon, color, bg, order) for a category.
 */
export function getCategoryMeta(category) {
  return CATEGORY_META[category] || CATEGORY_META['Otros'];
}

/**
 * Get sorted array of category names from CATEGORY_META.
 */
export function getCategoryOrder() {
  return Object.keys(CATEGORY_META).sort(
    (a, b) => CATEGORY_META[a].order - CATEGORY_META[b].order
  );
}
