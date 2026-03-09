"""
Script 2: Genera recetas con Gemini usando ingredientes disponibles en Consum.

Lee la tabla `ingredients` para saber que hay disponible,
genera recetas por meal_type con Gemini, y las inserta en
`recipes` + `recipe_ingredients`.

Uso:
    python backend/scripts/generate_recipes.py                # Generar todo
    python backend/scripts/generate_recipes.py --meal comida   # Solo un meal_type
    python backend/scripts/generate_recipes.py --dry-run       # Solo mostrar prompt
"""

import argparse
import json
import os
import re
import sys
import time
import unicodedata
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv
load_dotenv(BACKEND_DIR / ".env")

from google import genai

# ---------------------------------------------------------------------------
# Configuracion
# ---------------------------------------------------------------------------
MEAL_CONFIGS = {
    "desayuno": {"count": 55, "desc": "desayunos espanoles rapidos y nutritivos"},
    "almuerzo": {"count": 35, "desc": "snacks y platos ligeros para media manana"},
    "comida": {"count": 65, "desc": "platos principales espanoles para el mediodia"},
    "merienda": {"count": 35, "desc": "meriendas saludables y rapidas"},
    "cena": {"count": 60, "desc": "cenas ligeras y equilibradas"},
}

BATCH_SIZE = 15  # Recipes per Gemini call to avoid output truncation
MAX_RETRIES = 5
RETRY_BASE_DELAY = 10  # Seconds, doubles each retry
BATCH_DELAY = 5  # Seconds between successful batches

DIET_TYPES = ["omnivoro", "vegetariano", "vegano"]

PROMPT_TEMPLATE = """Eres un nutricionista experto en cocina espanola. Genera exactamente {count} recetas para {meal_type} ({desc}).

REGLAS OBLIGATORIAS:
1. Usa SOLO ingredientes de esta lista. No inventes ingredientes que no esten aqui.
2. Cada receta debe tener entre 3 y 10 ingredientes.
3. Incluye recetas para las 3 dietas: omnivoro, vegetariano, vegano. Reparte proporcionalmente.
4. Los nombres de ingredientes en la receta deben coincidir EXACTAMENTE con los de la lista.
5. Las cantidades deben ser realistas para 1 persona.
6. Calcula calorias y macros de forma precisa.

INGREDIENTES DISPONIBLES (por categoria):
{ingredients_by_group}

Devuelve un JSON array con este formato exacto (sin texto adicional, solo el JSON):
[
  {{
    "name": "Nombre de la receta",
    "description": "Descripcion corta (1 frase)",
    "meal_type": "{meal_type}",
    "suitable_diets": ["omnivoro", "vegetariano"],
    "calories": 450,
    "protein": 25.0,
    "carbs": 40.0,
    "fats": 18.0,
    "prep_time_minutes": 20,
    "difficulty": "facil",
    "servings": 1,
    "instructions": "Paso 1: ... Paso 2: ... Paso 3: ...",
    "ingredients": [
      {{"name": "Nombre exacto del ingrediente", "quantity": 200.0, "unit": "g"}},
      {{"name": "Otro ingrediente", "quantity": 1.0, "unit": "u"}}
    ]
  }}
]

Unidades validas: g, ml, u (unidad), cucharada, cucharadita, pellizco
Dificultades: facil, media, dificil
"""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def normalize_key(name: str) -> str:
    nfkd = unicodedata.normalize("NFKD", name)
    ascii_str = "".join(c for c in nfkd if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "_", ascii_str.lower()).strip("_")


def build_ingredient_list(session):
    """Lee ingredientes de la DB y los formatea por grupo para el prompt."""
    from app.db.models import Ingredient

    ingredients = session.query(Ingredient).all()

    # Agrupar por categoria, solo nombres concisos
    by_group = {}
    name_set = set()
    for ing in ingredients:
        group = ing.category
        name = ing.name
        if group not in by_group:
            by_group[group] = []
        # Solo incluir nombres simplificados (sin "Brik", "Pack de 6", etc.)
        simple_name = simplify_ingredient_name(name)
        if simple_name and simple_name not in name_set:
            by_group[group].append(simple_name)
            name_set.add(simple_name)

    # Formatear para el prompt
    lines = []
    # Solo grupos relevantes para cocina
    cooking_groups = [
        "frutas", "verduras", "carnes", "pescados", "lacteos", "quesos",
        "huevos", "pan_cereales", "pasta_arroz", "legumbres", "aceites",
        "condimentos", "conservas", "frutos_secos", "embutidos", "caldos",
    ]
    for group in cooking_groups:
        if group in by_group:
            items = sorted(by_group[group])[:60]  # Limitar para no exceder contexto
            lines.append(f"\n{group.upper()} ({len(items)}):")
            lines.append(", ".join(items))

    return "\n".join(lines), name_set


def simplify_ingredient_name(name: str) -> str:
    """Simplifica nombres de productos a ingredientes de cocina.
    'Pechuga de Pollo Fileteada Bandeja' -> 'Pechuga de Pollo'
    'Leche Semidesnatada Brik' -> 'Leche Semidesnatada'
    """
    # Palabras a eliminar (packaging, formato, marcas)
    remove_patterns = [
        r'\b(brik|botella|lata|tarro|frasco|bolsa|bandeja|pack|paquete|caja|doypack)\b',
        r'\b(de \d+|x\d+|\d+ unidades|\d+ ud|\d+ gr?|\d+ ml|\d+ kg)\b',
        r'\b(pet|cristal|tetrabrik|garrafa|sobre|tarrinas?|tarrina)\b',
        r'\b(miniporcion|formato familiar|formato ahorro)\b',
        r'\bpack de \d+\b',
    ]
    result = name
    for pat in remove_patterns:
        result = re.sub(pat, "", result, flags=re.IGNORECASE)

    # Limpiar espacios multiples
    result = re.sub(r"\s+", " ", result).strip()
    # Quitar trailing de/del
    result = re.sub(r"\s+(de|del|en|con|al|la|el|los|las)$", "", result, flags=re.IGNORECASE)
    return result if len(result) > 2 else ""


# ---------------------------------------------------------------------------
# Generacion con Gemini
# ---------------------------------------------------------------------------
def parse_json_response(text: str) -> list:
    """Parsea JSON de la respuesta, recuperando recetas de JSON truncado."""
    # Limpiar markdown
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)

    # Intento 1: parseo directo
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Intento 2: buscar array completo
    match = re.search(r"\[.*\]", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    # Intento 3: recuperar recetas individuales de JSON truncado
    # Buscar objetos completos {...} dentro del array
    recipes = []
    depth = 0
    start = None
    for i, ch in enumerate(text):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start is not None:
                try:
                    obj = json.loads(text[start:i + 1])
                    if obj.get("name") and obj.get("ingredients"):
                        recipes.append(obj)
                except json.JSONDecodeError:
                    pass
                start = None

    return recipes


def generate_batch(client, meal_type: str, desc: str, batch_count: int,
                   batch_num: int, ingredients_text: str) -> list:
    """Genera un batch de recetas con Gemini."""
    prompt = PROMPT_TEMPLATE.format(
        count=batch_count,
        meal_type=meal_type,
        desc=desc,
        ingredients_by_group=ingredients_text,
    )

    for attempt in range(MAX_RETRIES + 1):
        try:
            response = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=prompt,
                config={
                    "temperature": 0.7,
                    "max_output_tokens": 16000,
                },
            )
            text = response.text
            if not text:
                print(f"    [batch {batch_num}] Empty response, retrying...")
                time.sleep(3)
                continue

            recipes = parse_json_response(text)
            print(f"    [batch {batch_num}] {len(recipes)} recetas parseadas")
            return recipes

        except Exception as e:
            print(f"    [batch {batch_num}] Error (attempt {attempt+1}): {e}")
            if attempt < MAX_RETRIES:
                delay = RETRY_BASE_DELAY * (2 ** attempt)
                print(f"    [wait] {delay}s before retry...")
                time.sleep(delay)

    return []


def generate_recipes_for_meal(client, meal_type: str, config: dict,
                               ingredients_text: str, available_names: set) -> list:
    """Genera recetas para un meal_type en batches de BATCH_SIZE."""
    total_count = config["count"]
    desc = config["desc"]

    print(f"\n[gemini] Generando {total_count} recetas para {meal_type} "
          f"(batches de {BATCH_SIZE})...")

    all_recipes = []
    remaining = total_count
    batch_num = 0

    while remaining > 0:
        batch_count = min(BATCH_SIZE, remaining)
        batch_num += 1

        recipes = generate_batch(
            client, meal_type, desc, batch_count, batch_num, ingredients_text,
        )

        # Validar y limpiar
        for r in recipes:
            if not r.get("name") or not r.get("ingredients"):
                continue
            r.setdefault("meal_type", meal_type)
            r.setdefault("suitable_diets", ["omnivoro"])
            r.setdefault("calories", 300)
            r.setdefault("protein", 15.0)
            r.setdefault("carbs", 30.0)
            r.setdefault("fats", 12.0)
            r.setdefault("prep_time_minutes", 15)
            r.setdefault("difficulty", "facil")
            r.setdefault("servings", 1)
            r.setdefault("instructions", "")
            r.setdefault("description", "")
            all_recipes.append(r)

        remaining -= batch_count

        # Rate limit between batches
        if remaining > 0:
            time.sleep(BATCH_DELAY)

    print(f"  [OK] {meal_type}: {len(all_recipes)} recetas validas de {total_count} solicitadas")
    return all_recipes


# ---------------------------------------------------------------------------
# Insercion en DB
# ---------------------------------------------------------------------------
def insert_recipes(session, recipes: list):
    """Inserta recetas y sus ingredientes en la DB."""
    from app.db.models import Recipe, RecipeIngredient

    inserted = 0
    for r in recipes:
        slug = normalize_key(r["name"])

        recipe = Recipe(
            name=r["name"],
            description=r.get("description", ""),
            instructions=r.get("instructions", ""),
            calories=int(r.get("calories", 0)),
            protein=float(r.get("protein", 0)),
            carbs=float(r.get("carbs", 0)),
            fats=float(r.get("fats", 0)),
            servings=int(r.get("servings", 1)),
            meal_type=r["meal_type"],
            suitable_diets=r.get("suitable_diets", ["omnivoro"]),
            prep_time_minutes=int(r.get("prep_time_minutes", 15)),
            difficulty=r.get("difficulty", "facil"),
            slug=slug,
            is_verified=True,
        )
        session.add(recipe)
        session.flush()

        for ing in r.get("ingredients", []):
            ri = RecipeIngredient(
                recipe_id=recipe.id,
                name=ing["name"],
                quantity=float(ing.get("quantity", 1)),
                unit=ing.get("unit", "u"),
            )
            session.add(ri)

        inserted += 1

    session.commit()
    return inserted


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Generar recetas con Gemini")
    parser.add_argument("--meal", type=str, help="Solo generar para un meal_type")
    parser.add_argument("--dry-run", action="store_true", help="Solo mostrar prompt")
    parser.add_argument("--append", action="store_true", help="No borrar recetas existentes")
    args = parser.parse_args()

    api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("[ERROR] No se encontro GOOGLE_API_KEY ni GEMINI_API_KEY en .env")
        sys.exit(1)

    client = genai.Client(api_key=api_key)

    from app.db.database import SessionLocal, engine
    from app.db.models import Recipe, RecipeIngredient

    # Crear tablas
    Recipe.__table__.create(bind=engine, checkfirst=True)
    RecipeIngredient.__table__.create(bind=engine, checkfirst=True)

    session = SessionLocal()

    try:
        # Construir lista de ingredientes
        ingredients_text, available_names = build_ingredient_list(session)
        print(f"[ingredients] {len(available_names)} ingredientes unicos disponibles")

        if args.dry_run:
            meal = args.meal or "comida"
            config = MEAL_CONFIGS[meal]
            prompt = PROMPT_TEMPLATE.format(
                count=config["count"], meal_type=meal,
                desc=config["desc"], ingredients_by_group=ingredients_text,
            )
            print(f"\n[dry-run] Prompt para {meal} ({len(prompt)} chars):")
            print(prompt[:2000])
            print("..." if len(prompt) > 2000 else "")
            return

        # Limpiar recetas previas (salvo --append)
        if not args.append:
            session.query(RecipeIngredient).delete()
            session.query(Recipe).delete()
            session.commit()

        # Generar por meal_type
        meals_to_generate = [args.meal] if args.meal else list(MEAL_CONFIGS.keys())
        total_recipes = 0

        for meal_type in meals_to_generate:
            config = MEAL_CONFIGS[meal_type]
            recipes = generate_recipes_for_meal(
                client, meal_type, config, ingredients_text, available_names,
            )

            if recipes:
                count = insert_recipes(session, recipes)
                total_recipes += count
                print(f"  [DB] {count} recetas insertadas para {meal_type}")

            # Rate limiting entre calls
            if meal_type != meals_to_generate[-1]:
                print("  [wait] 2s rate limit...")
                time.sleep(2)

        print(f"\n[OK] Total: {total_recipes} recetas generadas e insertadas")

    except Exception as e:
        session.rollback()
        print(f"[ERROR] {e}")
        raise
    finally:
        session.close()


if __name__ == "__main__":
    main()
