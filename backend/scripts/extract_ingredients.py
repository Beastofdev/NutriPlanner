"""
Script 1: Extract base ingredients from the product catalog.

Reads the `products` table (filtered by supermarket), identifies food products,
groups them by canonical ingredient, and populates:
  - ingredients
  - ingredient_product_map
  - ingredient_aliases

Multi-supermarket: run once per supermarket. The script merges ingredients
(same canonical_key is reused across supermarkets) and adds per-super mappings.

Usage:
    python backend/scripts/extract_ingredients.py --supermarket CONSUM
    python backend/scripts/extract_ingredients.py --supermarket MERCADONA
    python backend/scripts/extract_ingredients.py --supermarket ALL
    python backend/scripts/extract_ingredients.py --supermarket CONSUM --dry-run
"""

import argparse
import re
import sys
import unicodedata
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))

# ---------------------------------------------------------------------------
# FOOD CATEGORIES ALLOWLIST
# Si una categoria NO esta aqui, se excluye (safe default).
# Agrupadas por super-categoria de ingrediente.
# ---------------------------------------------------------------------------
FOOD_CATEGORY_MAP = {
    # --- FRUTAS ---
    "frutas": [
        "Citricos", "Manzana, pera y uva", "Fruta de temporada",
        "Fruta tropical", "Frutos rojos", "Platano y banana",
        "Melon y sandia", "Fruta preparada", "Fruta desecada",
        "Frutas en almibar y en su jugo", "Frutas y Verduras",
    ],
    # --- VERDURAS Y HORTALIZAS ---
    "verduras": [
        "Tomates", "Patatas", "Cebollas, ajos y puerros",
        "Zanahorias y otras raices", "Pepino y pimiento",
        "Brocoli, col y coliflor", "Lechuga y endibias",
        "Calabaza, calabacin y berenjena", "Espinacas,coles y alcachofas",
        "Alcachofa", "Champi\u00f1ones y setas", "Setas y champi\u00f1ones",
        "Ensaladas y brotes", "Ensaladas preparadas y guacamole",
        "Otras verduras", "Verduras", "Verduras de temporada",
        "Verduras microondas", "Pimiento", "Guisantes",
        "Guisantes, judias y habas", "Judia verde",
        "Esparragos", "Esparragos y palmitos",
    ],
    # --- CARNES ---
    "carnes": [
        "Aves", "Cerdo", "Vacuno", "Buey, toro y vaca", "Cordero",
        "Conejo", "Picadas y hamburguesas", "Carnes", "Carne",
        "Carniceria", "Carniceria corte",
        "Preparados de carne", "Preparados de carne y pescado",
    ],
    # --- EMBUTIDOS Y CHARCUTERIA ---
    "embutidos": [
        "Jamon", "Jamon cocido - york", "Chorizo", "Fuet",
        "Longaniza", "Lomo", "Mortadela y chopped",
        "Salchichas", "Salchichon y salami", "Sobrasada",
        "Bacon y panceta", "Paleta", "Embutido",
        "Curados especialidades", "Cocidos de pavo", "Cocidos de pollo",
        "Otros cocidos", "Otros elaborados", "En lonchas",
    ],
    # --- PESCADOS Y MARISCOS ---
    "pescados": [
        "Pescado azul", "Pescado blanco", "Pescado congelado",
        "Pescado en bandeja", "Pescado y marisco", "Pescados y mariscos",
        "Atun y bonito", "Caballa y melva", "Sardinas",
        "Mejillones", "Almejas, berberechos y navajas",
        "Sepia, pulpo y calamares", "Calamar y sepia",
        "Marisco", "Marisco congelado", "Ahumados",
        "Surimis y salazones", "Salazones y marinados",
        "Otras conservas pescado", "Rebozados",
    ],
    # --- LACTEOS ---
    "lacteos": [
        "Entera", "Semidesnatada", "Desnatada",
        "Leche con calcio", "Leche fresca", "Leches especiales",
        "Leche en polvo y deshidratada", "Condensada", "Evaporada",
        "Nata para cocinar", "Nata para montar", "Nata en Spray",
        "Mantequilla", "Margarina",
        "Yogur natural y azucarado", "Yogur sabores", "Yogur desnatado",
        "Yogur griego", "Yogur liquido", "Yogur proteinas",
        "Yogur enriquecido", "Yogur especial salud", "Yogur vegetal",
        "Yogures", "Bifidus", "L-casei", "Cuajada",
        "Natillas", "Flanes", "Arroz con leche",
        "Otros postres", "Postres",
        "Petit e infantiles", "Preparados lacteos",
        "Batidos", "Batidos y cremas",
    ],
    # --- QUESOS ---
    "quesos": [
        "Quesos", "Quesos Nacionales", "Quesos Para untar",
        "Quesos Rallados", "Quesos de Barra", "Quesos de Cabra",
        "Quesos de Oveja", "Quesos de importacion",
        "Otros quesos importacion", "Fundidos y porciones",
        "Brie, camembert y cremosos", "Roquefort y azules",
        "Cu\u00f1a curado", "Cu\u00f1a semicurado", "Cu\u00f1a tierno y saludable",
        "Pasta blanda cabra", "Pasta blanda vaca",
    ],
    # --- HUEVOS ---
    "huevos": [
        "Huevos frescos", "Otros huevos y claras de huevo",
    ],
    # --- PAN Y CEREALES ---
    "pan_cereales": [
        "Pan comun", "Pan Integral y otras semillas",
        "Pan de molde integral y cereales", "Pan de molde y rebanado",
        "Pan de hamburguesa, hot dog y wraps", "Pan hamburguesas y perritos",
        "Pan de horno", "Pan rallado", "Pan rustico", "Pan sin gluten",
        "Pan, churros y porras", "Panecillos", "Panes especiales",
        "Panes y tostadas", "Tostadas y minibiscotes", "Tostada",
        "0,0 tostada", "Rosquilletas, picos y snacks",
        "Cereales", "Cereales y barritas", "Cereales solubles",
        "Bases y masas", "Harina",
    ],
    # --- PASTA Y ARROZ ---
    "pasta_arroz": [
        "Macarrones, espaguetis y tallarines", "Otras pastas secas",
        "Pasta al huevo", "Pasta fresca", "Pasta integral",
        "Pasta italiana", "Pasta sin gluten", "Pasta ensaladas",
        "Noodles", "Fideos y sopas",
        "Arroz Redondo", "Arroz basmati", "Arroz bomba",
        "Arroz cocido", "Arroz especial", "Arroz integral",
        "Arroz largo y vaporizado",
        "Canelones y lasagnas",
    ],
    # --- LEGUMBRES ---
    "legumbres": [
        "Garbanzos cocidos", "Garbanzos secos",
        "Lentejas cocidas", "Lentejas secas",
        "Alubias cocidas", "Alubias secas",
        "Judias, habas y otras legumbres",
        "Legumbres Texturizadas",
        "Preparados de legumbres y hortalizas",
    ],
    # --- ACEITES Y VINAGRES ---
    "aceites": [
        "Aceite de oliva virgen y virgen extra",
        "Aceite de oliva intenso y suave",
        "Aceite de girasol", "Otros aceites",
        "Vinagre y ali\u00f1os",
    ],
    # --- CONSERVAS ---
    "conservas": [
        "Aceitunas con hueso", "Aceitunas sin hueso",
        "Tomate frito", "Tomate natural",
        "Pimiento", "Alcaparras", "Cebollitas",
        "Pepinillos", "Guindillas", "Maiz",
        "Banderillas y cocktails", "Resto de encurtidos",
    ],
    # --- CONDIMENTOS Y ESPECIAS ---
    "condimentos": [
        "Especias", "Sal", "Sazonadores", "Condimentos",
        "Mayonesa", "Ketchup", "Mostaza",
        "Salsas frias", "Salsas calientes", "Salsas y siropes",
        "Barbacoa, carbon y encendido",  # solo las salsas BBQ, no el carbon
    ],
    # --- FRUTOS SECOS ---
    "frutos_secos": [
        "Nueces", "Almendras", "Avellanas y anacardos",
        "Cacahuetes", "Pistachos", "Pipas",
        "Otros frutos secos", "Frutos secos", "Semillas",
    ],
    # --- CALDOS Y SOPAS ---
    "caldos": [
        "Caldo en pastillas", "Caldo liquido",
        "Cremas y sopas", "Sopas en sobre",
        "Gazpachos", "Pures",
    ],
    # --- DULCES Y REPOSTERIA ---
    "dulces": [
        "Azucar", "Miel", "Mermeladas y confituras",
        "Membrillo", "Membrillos y compotas",
        "Chocolate Negro", "Chocolate con Leche",
        "Chocolate blanco", "Chocolate a la taza",
        "Chocolate para postres", "Cacao soluble",
        "Galletas de chocolate", "Desayuno y maria",
        "Galletas saludables", "Galletas saladas",
        "Bolleria", "Bolleria rellena y donuts",
        "Magdalenas", "Croissants", "Croissants y ensaimadas",
        "Napolitanas y croissants", "Napolitanas y hojaldres",
        "Cocas y bizcochos", "Pastelitos", "Pastas de te",
        "Tortitas", "Berlinas", "Cremas de desayuno",
        "Surtidos", "Bombones", "Chocolatinas",
        "Caramelos", "Gominolas", "Chicles",
        "Postres en polvo", "Gelatina", "Gelatinas",
        "Decoracion postres", "Levadura", "Bicarbonato",
        "Edulcorantes", "Reposter\u00eda",
        "Wafer y barquillos", "Hojaldres",
        "Tartas y bizcochos",
    ],
    # --- PLATOS PREPARADOS ---
    "preparados": [
        "Pizza congelada", "Pizzas", "Pizzas y hojaldres",
        "Croquetas y empanadillas", "Empanadillas",
        "Tortillas, croquetas y patatas",
        "Menestras y ensaladillas", "Salteados y revueltos",
        "Bocadillos y sandwiches", "Sandwich",
        "Platos para llevar", "Preparados refrigerados",
        "Preparados de arroz", "Preparados de pasta",
        "Preparados de pasta y arroz", "Preparados de verdura",
        "Base arroz", "Base pasta", "Base pescado", "Base verdura",
        "Bases congeladas", "Preparado paella y hervido",
        "Patatas fritas", "Snacks", "Snacks y otros aperitivos",
        "Maiz tostado y cocktail",
        "Comida etnica", "Asiatico", "Mexicano", "Oriental",
        "Ensaladas y humus", "Charcuteria origen vegetal",
        "Otros vegetales",
    ],
    # --- CONGELADOS ---
    "congelados": [
        "Fruta congelada", "Helado proteina",
        "Bloques, tartas y Nata", "Conos", "Polos de hielo",
        "Tartas", "Tarrinas", "Copa", "Familiar", "Especial",
    ],
    # --- BEBIDAS (no alcohol) ---
    "bebidas": [
        "Agua sin gas : botella", "Agua sin gas : garrafa",
        "Agua con gas", "Agua con sabores",
        "Zumos y nectares no refrigerados", "Zumos y nectares sin azucar",
        "Zumos frescos", "Zumos con leche",
        "Naranja", "Limon y lima-limon",
        "Cola", "Gaseosas y sodas", "Tonica",
        "Bitter y ginger ale", "Energeticas",
        "Isotonicas", "Isotonicas lata",
        "Bebidas refrescantes", "Refrescos", "Refrescos sin gas",
        "Bebidas vegetales",
        "Cafe Molido natural", "Cafe Molido mezcla", "Cafe Molido descafeinado",
        "Cafe Soluble", "Cafe Grano", "Cafe con Leche", "Cafes refrigerados",
        "Capsulas sistema Nespresso", "Capsulas sistema Dolce Gusto",
        "Capsulas otros sistemas",
        "Te", "Otras infusiones",
        "Horchatas", "Horchatas y granizados",
        "Mosto", "Aromatizada",
    ],
    # --- BEBIDAS ALCOHOLICAS ---
    "alcohol": [
        "Blanco DO", "Blanco mesa", "Tinto DO Rioja",
        "Tinto DO Ribera del Duero", "Tinto otras DO", "Tinto mesa",
        "Rosado DO", "Rosado mesa", "Fino, dulce y de licor",
        "Cavas y sidras", "Espumoso",
        "Rubia lata", "Rubia botella", "Negra",
        "Sin filtrar", "Ipa y artesana", "Baja graduacion",
        "0,0", "Especial Navidad",
        "Ginebra", "Ron", "Vodka", "Whisky", "Brandy",
        "Licores y cremas", "Otros licores", "Anis",
        "Combinados", "Sangrias y combinados base vino",
        "Vermut y aperitivo",
    ],
    # --- ALIMENTACION INFANTIL ---
    "infantil": [
        "Alimentacion infantil", "Leches infantiles",
        "Desayuno y merienda infantil",
        "Potitos de Carne", "Potitos y platos preparados",
        "Pouches", "Papillas",
    ],
    # --- VARIOS DESPENSA ---
    "despensa": [
        "Despensa", "Frescos y refrigerados",
        "Frescos y para ensaladas",
        "Sin gluten", "Sin azucar, veganos y saludables",
        "Untables", "Foie y pate de ave",
        "Pate de ave", "Pate de carne", "Pate de cerdo",
        "Pate pescado y marisco",
        "Tablas", "Galletas y Snacks",
        "Barritas y galletas",
        "Nutricion deportiva", "Complementos nutricionales",
        "Congelados y helados",
        "Hielo", "Pascua",
    ],
}

# Build reverse map: category_name -> food_group
FOOD_CATEGORIES = {}
for group, cats in FOOD_CATEGORY_MAP.items():
    for cat in cats:
        FOOD_CATEGORIES[cat] = group


# ---------------------------------------------------------------------------
# Normalizacion
# ---------------------------------------------------------------------------
def normalize_key(name: str) -> str:
    """Convierte nombre a canonical_key: lowercase, sin acentos, _ en vez de espacios."""
    # Quitar acentos
    nfkd = unicodedata.normalize("NFKD", name)
    ascii_str = "".join(c for c in nfkd if not unicodedata.combining(c))
    # Lowercase, reemplazar no-alfanumericos por _
    key = re.sub(r"[^a-z0-9]+", "_", ascii_str.lower()).strip("_")
    return key


def classify_diet_flags(product_name: str, category: str, food_group: str):
    """Clasifica propiedades dieteticas basadas en grupo y nombre."""
    name_lower = product_name.lower()

    is_vegan = food_group in ("frutas", "verduras", "legumbres", "aceites",
                               "pan_cereales", "pasta_arroz", "frutos_secos",
                               "condimentos", "conservas", "caldos")
    is_vegetarian = is_vegan or food_group in ("lacteos", "quesos", "huevos", "dulces")
    is_gluten_free = food_group not in ("pan_cereales", "pasta_arroz")
    is_dairy_free = food_group not in ("lacteos", "quesos")

    # Overrides por nombre
    if any(w in name_lower for w in ["pollo", "cerdo", "ternera", "jamon",
                                      "bacon", "carne", "atun", "salmon",
                                      "merluza", "gambas", "chorizo"]):
        is_vegan = False
        is_vegetarian = False

    if "sin gluten" in name_lower or "gluten free" in name_lower:
        is_gluten_free = True

    if any(w in name_lower for w in ["leche", "queso", "nata", "yogur",
                                      "mantequilla", "crema"]):
        is_dairy_free = False
        is_vegan = False

    return is_vegan, is_vegetarian, is_gluten_free, is_dairy_free


def get_standard_unit(food_group: str) -> str:
    """Devuelve la unidad estandar para un grupo alimentario."""
    liquid_groups = {"bebidas", "alcohol", "aceites", "lacteos"}
    if food_group in liquid_groups:
        return "ml"
    if food_group in ("huevos",):
        return "u"
    return "g"


# ---------------------------------------------------------------------------
# Extraccion
# ---------------------------------------------------------------------------
def extract_ingredients_from_products(session, Product, supermarket: str = "ALL"):
    """Read food products and group them by ingredient."""
    query = session.query(Product)
    if supermarket != "ALL":
        query = query.filter(Product.supermarket == supermarket)
    products = query.all()
    print(f"[filter] Querying products for supermarket={supermarket}")

    food_products = []
    skipped_categories = set()

    for p in products:
        cat = (p.ai_category or "").strip()
        # Normalizar: quitar acentos para matching
        cat_normalized = normalize_key(cat)

        # Buscar en allowlist (matching flexible)
        food_group = None
        for allowed_cat, group in FOOD_CATEGORIES.items():
            if normalize_key(allowed_cat) == cat_normalized:
                food_group = group
                break

        if food_group:
            food_products.append((p, cat, food_group))
        else:
            skipped_categories.add(cat)

    print(f"[filter] {len(food_products)} productos alimentarios de {len(products)} totales")
    print(f"[filter] {len(skipped_categories)} categorias excluidas (no alimentarias)")

    if skipped_categories:
        print("[filter] Categorias excluidas:")
        for sc in sorted(skipped_categories)[:30]:
            print(f"  - {sc}")
        if len(skipped_categories) > 30:
            print(f"  ... y {len(skipped_categories) - 30} mas")

    # Agrupar: un ingrediente por product_name normalizado
    ingredient_map = {}  # canonical_key -> {info + product_ids}

    for p, cat, food_group in food_products:
        name = (p.product_name or "").strip()
        if not name or p.price is None or p.price <= 0:
            continue

        canonical = normalize_key(name)
        if not canonical:
            continue

        if canonical not in ingredient_map:
            is_vegan, is_veg, is_gf, is_df = classify_diet_flags(name, cat, food_group)
            ingredient_map[canonical] = {
                "name": name,
                "canonical_key": canonical,
                "category": food_group,
                "standard_unit": get_standard_unit(food_group),
                "is_vegan": is_vegan,
                "is_vegetarian": is_veg,
                "is_gluten_free": is_gf,
                "is_dairy_free": is_df,
                "product_ids": [],
            }

        ingredient_map[canonical]["product_ids"].append(p.id)

    print(f"[extract] {len(ingredient_map)} ingredientes unicos extraidos")
    return ingredient_map


# ---------------------------------------------------------------------------
# Insercion en DB
# ---------------------------------------------------------------------------
def insert_ingredients(session, ingredient_map, supermarket: str = "ALL"):
    """Insert/merge ingredients and mappings into the DB.

    For multi-supermarket support:
    - Ingredients with the same canonical_key are reused (not duplicated).
    - Only mappings for the target supermarket's products are replaced.
    """
    from app.db.models import Ingredient, IngredientProductMap, Product

    # Load existing ingredients by canonical_key for merging
    existing_ingredients = {
        ing.canonical_key: ing
        for ing in session.query(Ingredient).all()
    }

    # Delete old mappings only for products of this supermarket
    if supermarket != "ALL":
        product_ids_sub = session.query(Product.id).filter(
            Product.supermarket == supermarket
        ).subquery()
        deleted = session.query(IngredientProductMap).filter(
            IngredientProductMap.product_id.in_(
                session.query(product_ids_sub)
            )
        ).delete(synchronize_session="fetch")
        print(f"[DB] Cleared {deleted} old mappings for {supermarket}")
    else:
        session.query(IngredientProductMap).delete()
        print("[DB] Cleared all old mappings")

    new_ingredients = 0
    reused_ingredients = 0
    inserted_maps = 0

    for key, info in ingredient_map.items():
        if key in existing_ingredients:
            ing = existing_ingredients[key]
            reused_ingredients += 1
        else:
            ing = Ingredient(
                name=info["name"],
                canonical_key=info["canonical_key"],
                category=info["category"],
                standard_unit=info["standard_unit"],
                is_vegan=info["is_vegan"],
                is_vegetarian=info["is_vegetarian"],
                is_gluten_free=info["is_gluten_free"],
                is_dairy_free=info["is_dairy_free"],
            )
            session.add(ing)
            session.flush()
            existing_ingredients[key] = ing
            new_ingredients += 1

        for pid in info["product_ids"]:
            mapping = IngredientProductMap(
                ingredient_id=ing.id,
                product_id=pid,
            )
            session.add(mapping)
            inserted_maps += 1

    session.commit()
    print(f"[DB] New ingredients: {new_ingredients}, Reused: {reused_ingredients}")
    print(f"[DB] Mappings created: {inserted_maps}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Extract ingredients from product catalog")
    parser.add_argument("--supermarket", type=str, default="ALL",
                        help="Supermarket code: CONSUM, MERCADONA, or ALL (default: ALL)")
    parser.add_argument("--dry-run", action="store_true", help="Show stats only, no DB write")
    parser.add_argument("--clean", action="store_true",
                        help="Delete ALL ingredients/mappings before inserting (fresh start)")
    args = parser.parse_args()

    supermarket = args.supermarket.upper()

    from app.db.database import SessionLocal, engine
    from app.db.models import (
        Ingredient,
        IngredientAlias,
        IngredientProductMap,
        Product,
    )

    # Create tables
    for table in [Ingredient.__table__, IngredientProductMap.__table__, IngredientAlias.__table__]:
        table.create(bind=engine, checkfirst=True)

    session = SessionLocal()

    try:
        if args.clean:
            print("[clean] Deleting all ingredients and mappings...")
            session.query(IngredientProductMap).delete()
            session.query(IngredientAlias).delete()
            session.query(Ingredient).delete()
            session.commit()

        # Extract
        ingredient_map = extract_ingredients_from_products(session, Product, supermarket)

        if args.dry_run:
            groups = {}
            for info in ingredient_map.values():
                g = info["category"]
                groups[g] = groups.get(g, 0) + 1

            print(f"\n[stats] Ingredients by group ({supermarket}):")
            for g, count in sorted(groups.items(), key=lambda x: -x[1]):
                print(f"  {g:20s}: {count}")

            print("\n[dry-run] No DB write. Examples by group:")
            shown = set()
            for info in sorted(ingredient_map.values(), key=lambda x: x["category"]):
                g = info["category"]
                if g not in shown:
                    shown.add(g)
                    print(f"\n  --- {g} ---")
                    examples = [i for i in ingredient_map.values() if i["category"] == g][:3]
                    for ex in examples:
                        print(f"    {ex['name']} ({ex['canonical_key']}) -> {len(ex['product_ids'])} products")
            return

        # Insert/merge
        insert_ingredients(session, ingredient_map, supermarket)
        print(f"\n[OK] Ingredient extraction complete for {supermarket}")

    except Exception as e:
        session.rollback()
        print(f"[ERROR] {e}")
        raise
    finally:
        session.close()


if __name__ == "__main__":
    main()
