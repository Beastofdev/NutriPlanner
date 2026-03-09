"""
Utilidades para normalización y matching de ingredientes.
Mejora la detección de items del inventario en el comparador.
"""

import re
import unicodedata
from rapidfuzz import fuzz


# Mapeo de plurales/singulares comunes
PLURAL_TO_SINGULAR = {
    # Frutas y verduras
    'almendras': 'almendra',
    'nueces': 'nuez',
    'patatas': 'patata',
    'cebollas': 'cebolla',
    'huevos': 'huevo',
    'arándanos': 'arándano',
    'frambuesas': 'frambuesa',
    'fresas': 'fresa',
    'manzanas': 'manzana',
    'naranjas': 'naranja',
    'plátanos': 'plátano',
    'tomates': 'tomate',
    'pimientos': 'pimiento',
    'zanahorias': 'zanahoria',
    'calabacines': 'calabacín',
    'berenjenas': 'berenjena',

    # Proteínas
    'pechugas': 'pechuga',
    'filetes': 'filete',
    'chuletas': 'chuleta',
    'muslitos': 'muslito',

    # Lácteos
    'yogures': 'yogur',
    'quesos': 'queso',

    # Legumbres y cereales
    'lentejas': 'lenteja',
    'garbanzos': 'garbanzo',
    'judías': 'judía',

    # Otros
    'especias': 'especia',
    'salsas': 'salsa',
}

# Variaciones comunes de nombres
NAME_VARIATIONS = {
    'patata': ['papa', 'batata'],
    'nuez': ['nueces'],
    'arándano': ['arandano'],  # Sin acento
    'almendra': ['almendra molida', 'almendras molidas'],
    'aceite de oliva': ['aceite oliva', 'aceite'],
    'leche': ['leche desnatada', 'leche entera', 'leche semidesnatada'],
    'arroz': ['arroz blanco', 'arroz basmati', 'arroz integral'],
    'cebolla': ['cebollas'],
}


def remove_accents(text: str) -> str:
    """
    Elimina acentos de un texto.

    Ejemplos:
        'Almendras' -> 'almendras'
        'Arándanos' -> 'arandanos'
    """
    if not text:
        return ""

    # Normalizar a NFD (Normalization Form Decomposed)
    nfd = unicodedata.normalize('NFD', text)
    # Filtrar solo caracteres que no sean marcas diacríticas
    without_accents = ''.join(c for c in nfd if unicodedata.category(c) != 'Mn')
    # Normalizar de vuelta a NFC
    return unicodedata.normalize('NFC', without_accents)


def normalize_ingredient_name(name: str) -> str:
    """
    Normaliza el nombre de un ingrediente para mejor matching.

    Pasos:
    1. Convertir a minúsculas
    2. Eliminar acentos
    3. Convertir plural a singular (si aplica)
    4. Eliminar artículos y preposiciones comunes
    5. Eliminar espacios extra

    Args:
        name: Nombre del ingrediente

    Returns:
        Nombre normalizado

    Ejemplos:
        'Almendras' -> 'almendra'
        'Aceite de Oliva' -> 'aceite oliva'
        'Nueces' -> 'nuez'
    """
    if not name or not isinstance(name, str):
        return ""

    # 1. Minúsculas
    name = name.lower().strip()

    # 2. Eliminar acentos
    name = remove_accents(name)

    # 3. Eliminar artículos y preposiciones comunes
    articles = ['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del']
    words = name.split()
    words = [w for w in words if w not in articles]
    name = ' '.join(words)

    # 4. Convertir plural a singular
    if name in PLURAL_TO_SINGULAR:
        name = PLURAL_TO_SINGULAR[name]

    # 5. Limpiar espacios múltiples
    name = re.sub(r'\s+', ' ', name).strip()

    return name


def fuzzy_match_ingredient(pantry_name: str, product_name: str, threshold: int = 80) -> dict:
    """
    Realiza fuzzy matching entre un item del inventario y un nombre de producto.

    Args:
        pantry_name: Nombre del item en el inventario
        product_name: Nombre del producto en la DB
        threshold: Umbral mínimo de similitud (0-100)

    Returns:
        Dict con: {
            'match': bool,
            'score': int (0-100),
            'method': str (descripción del método usado)
        }

    Ejemplos:
        fuzzy_match_ingredient('Amlendras', 'Almendras')
        -> {'match': True, 'score': 88, 'method': 'fuzzy_ratio'}

        fuzzy_match_ingredient('Nueces', 'Nuez')
        -> {'match': True, 'score': 100, 'method': 'normalized_exact'}
    """
    if not pantry_name or not product_name:
        return {'match': False, 'score': 0, 'method': 'empty_input'}

    # Normalizar ambos nombres
    p_norm = normalize_ingredient_name(pantry_name)
    pr_norm = normalize_ingredient_name(product_name)

    # 1. Match exacto normalizado
    if p_norm == pr_norm:
        return {'match': True, 'score': 100, 'method': 'normalized_exact'}

    # 2. Contención (uno contiene al otro)
    if p_norm in pr_norm or pr_norm in p_norm:
        return {'match': True, 'score': 95, 'method': 'substring_match'}

    # 3. Fuzzy ratio
    ratio = fuzz.ratio(p_norm, pr_norm)
    if ratio >= threshold:
        return {'match': True, 'score': ratio, 'method': 'fuzzy_ratio'}

    # 4. Partial ratio (permite coincidencias parciales)
    partial_ratio = fuzz.partial_ratio(p_norm, pr_norm)
    if partial_ratio >= threshold:
        return {'match': True, 'score': partial_ratio, 'method': 'fuzzy_partial_ratio'}

    # 5. Token sort ratio (ignora orden de palabras)
    token_sort = fuzz.token_sort_ratio(p_norm, pr_norm)
    if token_sort >= threshold:
        return {'match': True, 'score': token_sort, 'method': 'fuzzy_token_sort'}

    # 6. Revisar variaciones conocidas
    for base_name, variations in NAME_VARIATIONS.items():
        if p_norm == base_name or p_norm in variations:
            if pr_norm == base_name or pr_norm in variations:
                return {'match': True, 'score': 90, 'method': 'known_variation'}

    # No match
    return {'match': False, 'score': max(ratio, partial_ratio, token_sort), 'method': 'no_match'}


def suggest_corrections(ingredient_name: str, common_ingredients: list, max_suggestions: int = 5) -> list:
    """
    Sugiere correcciones para un ingrediente con posible error de escritura.

    Args:
        ingredient_name: Nombre del ingrediente a corregir
        common_ingredients: Lista de ingredientes comunes
        max_suggestions: Máximo de sugerencias a retornar

    Returns:
        Lista de dicts con: [
            {'name': str, 'score': int, 'confidence': str},
            ...
        ]

    Ejemplo:
        suggest_corrections('Amlendras', ['Almendras', 'Nueces', 'Sal'])
        -> [{'name': 'Almendras', 'score': 88, 'confidence': 'high'}]
    """
    if not ingredient_name or not common_ingredients:
        return []

    suggestions = []

    for candidate in common_ingredients:
        result = fuzzy_match_ingredient(ingredient_name, candidate, threshold=70)

        if result['match'] or result['score'] >= 70:
            # Clasificar confianza
            if result['score'] >= 90:
                confidence = 'high'
            elif result['score'] >= 80:
                confidence = 'medium'
            else:
                confidence = 'low'

            suggestions.append({
                'name': candidate,
                'score': result['score'],
                'confidence': confidence,
                'method': result['method']
            })

    # Ordenar por score descendente
    suggestions.sort(key=lambda x: x['score'], reverse=True)

    # Retornar top N
    return suggestions[:max_suggestions]


# Para testing rápido
if __name__ == "__main__":
    # Test cases
    test_cases = [
        ('Amlendras', 'Almendras'),
        ('Nueces', 'Nuez'),
        ('Patatas', 'Patata'),
        ('Arándanos', 'Arandanos'),
        ('Aceite de oliva', 'Aceite oliva'),
        ('Leche', 'Leche desnatada'),
    ]

    print("=" * 70)
    print("TESTS DE NORMALIZACIÓN Y MATCHING")
    print("=" * 70)

    for pantry, product in test_cases:
        result = fuzzy_match_ingredient(pantry, product)
        print(f"\n'{pantry}' vs '{product}':")
        print(f"  Match: {result['match']}")
        print(f"  Score: {result['score']}")
        print(f"  Method: {result['method']}")
