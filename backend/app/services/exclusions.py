"""
Diet exclusion logic: maps user food preferences/allergens to DB category
and canonical_name patterns for filtering products and ingredients.
"""
from typing import Any, Dict, List

# ============================================================
# MAPEO DE EXCLUSIONES GENERICAS
# ============================================================
# Cuando el usuario dice "no me gusta X", excluimos estas categorias
# y/o patrones de canonical_name
GENERIC_EXCLUSIONS: Dict[str, Dict[str, Any]] = {
    # Pescado y mariscos - usar PATRONES para capturar todos (incluso caldos)
    "pescado": {
        "categories": ["PESCADOS_FRESCOS", "CONSERVAS_PESCADO"],
        "patterns": ["%pescado%"]
    },
    "marisco": {
        "categories": [],
        "patterns": ["%marisco%"]
    },
    "atun": {
        "categories": [],
        "patterns": ["%atun%"]
    },
    "salmon": {
        "categories": [],
        "patterns": ["%salmon%"]
    },
    "merluza": {
        "categories": [],
        "patterns": ["%merluza%"]
    },
    "bacalao": {
        "categories": [],
        "patterns": ["%bacalao%"]
    },
    "sardina": {
        "categories": [],
        "patterns": ["%sardina%"]
    },
    "lubina": {
        "categories": [],
        "patterns": ["%lubina%"]
    },
    "dorada": {
        "categories": [],
        "patterns": ["%dorada%"]
    },
    "rape": {
        "categories": [],
        "patterns": ["%rape%"]
    },
    "lenguado": {
        "categories": [],
        "patterns": ["%lenguado%"]
    },
    "trucha": {
        "categories": [],
        "patterns": ["%trucha%"]
    },
    "caballa": {
        "categories": [],
        "patterns": ["%caballa%"]
    },
    "anchoa": {
        "categories": [],
        "patterns": ["%anchoa%"]
    },
    "boquerones": {
        "categories": [],
        "patterns": ["%boqueron%"]
    },
    # Mariscos individuales
    "gambas": {
        "categories": [],
        "patterns": ["%gamba%"]
    },
    "langostinos": {
        "categories": [],
        "patterns": ["%langostino%"]
    },
    "mejillones": {
        "categories": [],
        "patterns": ["%mejillon%"]
    },
    "almejas": {
        "categories": [],
        "patterns": ["%almeja%"]
    },
    "calamares": {
        "categories": [],
        "patterns": ["%calamar%"]
    },
    "pulpo": {
        "categories": [],
        "patterns": ["%pulpo%"]
    },
    "sepia": {
        "categories": [],
        "patterns": ["%sepia%"]
    },
    "cangrejo": {
        "categories": [],
        "patterns": ["%cangrejo%"]
    },

    # Carnes - usar PATRONES para mayor precision
    "carne": {
        "categories": ["CARNES_FRESCAS", "CARNES_PROCESADAS"],
        "patterns": ["carne_%"]
    },
    "pollo": {
        "categories": [],
        "patterns": ["%pollo%"]
    },
    "cerdo": {
        "categories": [],
        "patterns": ["%cerdo%"]
    },
    "ternera": {
        "categories": [],
        "patterns": ["%ternera%", "%vacuno%"]
    },
    "pavo": {
        "categories": [],
        "patterns": ["%pavo%"]
    },
    "cordero": {
        "categories": [],
        "patterns": ["%cordero%"]
    },
    "conejo": {
        "categories": [],
        "patterns": ["%conejo%"]
    },
    "jamon": {
        "categories": [],
        "patterns": ["%jamon%", "%jamón%"]
    },
    "bacon": {
        "categories": [],
        "patterns": ["%bacon%"]
    },
    "panceta": {
        "categories": [],
        "patterns": ["%panceta%"]
    },
    "chorizo": {
        "categories": [],
        "patterns": ["%chorizo%"]
    },
    "salchichon": {
        "categories": [],
        "patterns": ["%salchichon%", "%salchichón%"]
    },
    "lomo": {
        "categories": [],
        "patterns": ["%lomo%"]
    },
    "costillas": {
        "categories": [],
        "patterns": ["%costilla%"]
    },

    # Lacteos
    "lacteos": {
        "categories": ["LACTEOS_LECHE", "LACTEOS_QUESO", "LACTEOS_YOGUR", "LACTEOS_VARIOS"],
        "patterns": []
    },
    "leche": {
        "categories": ["LACTEOS_LECHE"],
        "patterns": []
    },
    "queso": {
        "categories": ["LACTEOS_QUESO"],
        "patterns": []
    },
    "yogur": {
        "categories": ["LACTEOS_YOGUR"],
        "patterns": []
    },
    "nata": {
        "categories": [],
        "patterns": ["%nata%"]
    },
    "mantequilla": {
        "categories": [],
        "patterns": ["%mantequilla%"]
    },

    # Huevos
    "huevos": {
        "categories": ["HUEVOS"],
        "patterns": ["huevo%"]
    },
    "huevo": {
        "categories": ["HUEVOS"],
        "patterns": ["huevo%"]
    },

    # Gluten
    "gluten": {
        "categories": ["PASTA_SECA", "PASTA_FRESCA", "HARINAS", "PANADERIA"],
        "patterns": ["pasta_%", "harina_%", "pan_%"]
    },

    # Frutos secos
    "frutos secos": {
        "categories": ["FRUTOS_SECOS"],
        "patterns": ["frutos_%"]
    },
    "almendras": {
        "categories": [],
        "patterns": ["%almendra%"]
    },
    "nueces": {
        "categories": [],
        "patterns": ["%nuez%", "%nueces%"]
    },
    "avellanas": {
        "categories": [],
        "patterns": ["%avellana%"]
    },
    "cacahuetes": {
        "categories": [],
        "patterns": ["%cacahuete%"]
    },
    "pistachos": {
        "categories": [],
        "patterns": ["%pistacho%"]
    },
    "anacardos": {
        "categories": [],
        "patterns": ["%anacardo%"]
    },

    # Verduras y frutas
    "verduras": {
        "categories": ["VERDURAS_FRESCAS", "VERDURAS_PROCESADAS"],
        "patterns": []
    },
    "frutas": {
        "categories": ["FRUTAS_FRESCAS"],
        "patterns": []
    },

    # Legumbres
    "legumbres": {
        "categories": ["LEGUMBRES_SECAS", "LEGUMBRES_BOTE", "CONSERVAS_LEGUMBRES"],
        "patterns": ["legumbre_%"]
    },

    # Soja y derivados
    "soja": {
        "categories": [],
        "patterns": ["%soja%", "%tofu%", "%edamame%", "%tempeh%", "%miso%"]
    },
    "tofu": {
        "categories": [],
        "patterns": ["%tofu%"]
    },

    # Especificos comunes
    "cilantro": {
        "categories": [],
        "patterns": ["%cilantro%"]
    },
    "picante": {
        "categories": [],
        "patterns": ["%picante%", "%guindilla%", "%cayena%", "%tabasco%"]
    },
}

# ============================================================
# JERARQUÍA DE EXCLUSIONES
# ============================================================
# Cuando el usuario excluye un término "padre", también se excluyen
# automáticamente todos los términos "hijos".
EXCLUSION_HIERARCHY: Dict[str, List[str]] = {
    "pescado": ["atun", "salmon", "merluza", "bacalao", "sardina", "lubina", "dorada", "rape", "lenguado", "trucha", "caballa", "anchoa", "boquerones"],
    "marisco": ["gambas", "langostinos", "mejillones", "almejas", "calamares", "pulpo", "sepia", "cangrejo"],
    "carne": ["pollo", "cerdo", "ternera", "pavo", "cordero", "conejo", "jamon"],
    "cerdo": ["bacon", "panceta", "chorizo", "salchichon", "lomo", "costillas", "jamon"],
    "pollo": ["pechuga", "muslo", "contramuslo", "alitas"],
    "ternera": ["solomillo", "entrecot", "chuleton"],
    "lacteos": ["leche", "queso", "yogur", "nata", "mantequilla"],
    "frutos secos": ["almendras", "nueces", "avellanas", "cacahuetes", "pistachos", "anacardos"],
    "soja": ["tofu"],
}

# ============================================================
# ALLERGEN → INGREDIENT PATTERNS (para filtro SQL en recetas)
# ============================================================
# Mapea alérgenos del usuario a patrones de nombre de ingrediente
# en recipe_ingredients. Si el usuario marca "Lactosa", excluimos
# recetas que contengan mantequilla, nata, queso, yogur, leche, etc.
ALLERGEN_INGREDIENT_PATTERNS: Dict[str, List[str]] = {
    "lactosa": [
        "mantequilla", "mantequilla_sin_%", "mantequilla_light", "mantequilla_en_%",
        "nata_%", "queso_%", "yogur_%",
        "lacteo_%", "leche_%", "%crema%", "%bechamel%",
    ],
    "gluten": [
        "pasta_%", "harina_%", "pan_%", "cereal_trigo%",
        "cereal_cuscus%", "%galleta%", "%bizcocho%",
        # Avena (oats) — contaminación cruzada con gluten
        "cereal_copos_avena", "cereal_avena_%", "cereal_muesli%",
        "snack_barrita_avena", "bebida_vegetal_avena%",
        "cereales_semillas_granola%",
        # Salsa de soja — contiene trigo
        "salsa_soja",
    ],
    "huevo": [
        "huevo%",
    ],
    "frutos secos": [
        "%almendra%", "%nuez%", "%nueces%", "%avellana%",
        "%cacahuete%", "%pistacho%", "%anacardo%",
        "%frutos_secos%",
    ],
    "marisco": [
        "%gamba%", "%langostino%", "%mejillon%", "%almeja%",
        "%calamar%", "%pulpo%", "%sepia%", "%cangrejo%", "marisco_%",
    ],
    "pescado": [
        "pescado_%", "%salmon%", "%merluza%", "%bacalao%",
        "%atun%", "%sardina%", "%anchoa%", "%boqueron%",
    ],
    "soja": [
        "%soja%", "%tofu%", "%edamame%", "%tempeh%", "%miso%",
    ],
    # Aliases plurales — el frontend puede enviar "Mariscos", "Huevos", etc.
    "mariscos": [
        "%gamba%", "%langostino%", "%mejillon%", "%almeja%",
        "%calamar%", "%pulpo%", "%sepia%", "%cangrejo%", "marisco_%",
    ],
    "huevos": [
        "huevo%",
    ],
    "frutos_secos": [
        "%almendra%", "%nuez%", "%nueces%", "%avellana%",
        "%cacahuete%", "%pistacho%", "%anacardo%",
        "%frutos_secos%",
    ],
    "cacahuetes": [
        "%cacahuete%",
    ],
}


def expand_exclusions(hated_foods: List[str]) -> List[str]:
    """
    Expande la lista de exclusiones usando la jerarquía.
    Si el usuario dice 'pescado', se añaden automáticamente atun, salmon, etc.
    """
    expanded = set(hated_foods)
    for item in hated_foods:
        item_lower = item.lower().strip()
        if item_lower in EXCLUSION_HIERARCHY:
            expanded.update(EXCLUSION_HIERARCHY[item_lower])
    return list(expanded)
