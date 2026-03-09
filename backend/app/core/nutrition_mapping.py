"""
Mapeo de Categorías AI a Tipos Nutricionales
=============================================
Este archivo permite a la IA del nutricionista tomar decisiones
dietéticas coherentes basadas en el tipo de nutriente.

Uso:
    from app.core.nutrition_mapping import get_nutrition_type, VALID_FOOD_CATEGORIES
"""

# Mapeo de ai_category -> tipo nutricional para decisiones de la IA
NUTRITION_TYPE_MAPPING = {
    # === PROTEÍNAS ===
    "CARNES_FRESCAS": "proteina_animal_carne",
    "CARNES_AVES": "proteina_animal_carne",  # Categoría real en DB (93 productos)
    "PESCADOS_FRESCOS": "proteina_animal_pescado",
    "PESCADOS_CONGELADOS": "proteina_animal_pescado",
    "HUEVOS": "proteina_animal_huevo",
    "CARNES_PROCESADAS": "proteina_animal_procesada",
    "CONSERVAS_PESCADO": "proteina_animal_conserva",

    # === LÁCTEOS Y HUEVOS ===
    "LACTEOS_HUEVOS": "proteina_lactea_varios",  # Categoría real en DB (330 productos)
    "LACTEOS_LECHE": "proteina_lactea_liquida",
    "LACTEOS_YOGUR": "proteina_lactea_fermentada",
    "LACTEOS_QUESO": "proteina_lactea_queso",
    "LACTEOS_VARIOS": "proteina_lactea_varios",

    # === CARBOHIDRATOS COMPLEJOS ===
    "CEREALES_LEGUMBRES": "carbohidrato_cereal",  # Categoría real en DB (221 productos)
    "ARROZ_CEREALES": "carbohidrato_cereal",
    "CEREALES_ARROZ": "carbohidrato_cereal",
    "PASTA": "carbohidrato_pasta",
    "CEREALES_PASTA": "carbohidrato_pasta",
    "PASTA_FRESCA": "carbohidrato_pasta",
    "LEGUMBRES_SECAS": "carbohidrato_legumbre",
    "LEGUMBRES_BOTE": "carbohidrato_legumbre_cocida",
    "CONSERVAS_LEGUMBRES": "carbohidrato_legumbre_cocida",
    "PANADERIA": "carbohidrato_pan",
    "HARINAS": "carbohidrato_harina",

    # === VEGETALES ===
    "FRUTAS_VERDURAS": "vegetal_fresco",  # Categoría real en DB (213 productos)
    "VERDURAS_FRESCAS": "vegetal_fresco",
    "VERDURAS_PROCESADAS": "vegetal_procesado",
    "VERDURAS_CONGELADAS": "vegetal_procesado",

    # === FRUTAS ===
    "FRUTAS_FRESCAS": "fruta_fresca",

    # === GRASAS SALUDABLES ===
    "ACEITES": "grasa_aceite",
    "ACEITES_SALSAS": "grasa_aceite",  # Categoría real en DB (47 productos)
    "FRUTOS_SECOS": "grasa_fruto_seco",

    # === CONDIMENTOS Y SALSAS ===
    "CONDIMENTOS": "condimento_especia",  # Categoría real en DB (43 productos)
    "ESPECIAS": "condimento_especia",
    "SALSAS": "condimento_salsa",

    # === CALDOS (ingredientes de cocina) ===
    "CALDOS": "condimento_caldo",

    # === CATEGORÍAS NO VÁLIDAS PARA NUTRICIÓN ===
    "NO_ALIMENTACION": None,
    "PROCESADO_ELIMINADO": None,
    "PROCESADOS_ELIMINADOS": None,
    "ELIMINADO": None,
    "PROCESADOS_DULCES": None,
    "BEBIDAS_REFRESCANTES": None,
    "BEBIDAS_REFRESCOS": None,
    "BEBIDAS_ALCOHOLICAS": None,
    "SNACKS_SALADOS": None,
    "DULCES_GALLETAS": None,
    "PLATOS_PREPARADOS": None,
    "DESPENSA_VARIOS": None,  # Categoría ambigua, revisar caso por caso
}

# Categorías válidas para usar en planes nutricionales
VALID_FOOD_CATEGORIES = [
    cat for cat, nutrition_type in NUTRITION_TYPE_MAPPING.items()
    if nutrition_type is not None
]

# Categorías que NUNCA deben ser ingredientes básicos
EXCLUDED_CATEGORIES = [
    cat for cat, nutrition_type in NUTRITION_TYPE_MAPPING.items()
    if nutrition_type is None
]

# Agrupación por macronutriente principal
MACRO_GROUPS = {
    "proteina": [
        "proteina_animal_carne",
        "proteina_animal_pescado",
        "proteina_animal_huevo",
        "proteina_animal_procesada",
        "proteina_animal_conserva",
        "proteina_lactea_liquida",
        "proteina_lactea_fermentada",
        "proteina_lactea_queso",
    ],
    "carbohidrato": [
        "carbohidrato_cereal",
        "carbohidrato_pasta",
        "carbohidrato_legumbre",
        "carbohidrato_legumbre_cocida",
        "carbohidrato_pan",
        "carbohidrato_harina",
    ],
    "vegetal_fruta": [
        "vegetal_fresco",
        "vegetal_procesado",
        "fruta_fresca",
    ],
    "grasa": [
        "grasa_aceite",
        "grasa_fruto_seco",
    ],
    "condimento": [
        "condimento_especia",
        "condimento_salsa",
    ],
}


def get_nutrition_type(ai_category: str) -> str | None:
    """
    Obtiene el tipo nutricional de una categoría AI.

    Args:
        ai_category: La categoría AI del producto (ej: "CARNES_FRESCAS")

    Returns:
        El tipo nutricional (ej: "proteina_animal_carne") o None si no es válido
    """
    return NUTRITION_TYPE_MAPPING.get(ai_category)


def get_macro_group(nutrition_type: str) -> str | None:
    """
    Obtiene el grupo de macronutriente de un tipo nutricional.

    Args:
        nutrition_type: El tipo nutricional (ej: "proteina_animal_carne")

    Returns:
        El grupo macro (ej: "proteina") o None si no se encuentra
    """
    for macro, types in MACRO_GROUPS.items():
        if nutrition_type in types:
            return macro
    return None


def is_valid_for_meal_planning(ai_category: str) -> bool:
    """
    Verifica si una categoría es válida para planificación de comidas.

    Args:
        ai_category: La categoría AI del producto

    Returns:
        True si es válida para nutrición, False si debe excluirse
    """
    return ai_category in VALID_FOOD_CATEGORIES


def get_category_info(ai_category: str) -> dict:
    """
    Obtiene información completa de una categoría para la IA.

    Args:
        ai_category: La categoría AI del producto

    Returns:
        Dict con nutrition_type, macro_group, y is_valid
    """
    nutrition_type = get_nutrition_type(ai_category)
    return {
        "category": ai_category,
        "nutrition_type": nutrition_type,
        "macro_group": get_macro_group(nutrition_type) if nutrition_type else None,
        "is_valid": nutrition_type is not None,
    }
