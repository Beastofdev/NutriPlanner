"""
Script 3: Valida la cobertura del pipeline de datos.

Verifica que cada ingrediente de cada receta:
  1. Existe en la tabla `ingredients`
  2. Tiene al menos 1 producto mapeado en `ingredient_product_map`
  3. Ese producto tiene precio > 0

Uso:
    python backend/scripts/validate_coverage.py
    python backend/scripts/validate_coverage.py --verbose
"""

import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv
load_dotenv(BACKEND_DIR / ".env")


def normalize_key(name: str) -> str:
    nfkd = unicodedata.normalize("NFKD", name)
    ascii_str = "".join(c for c in nfkd if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "_", ascii_str.lower()).strip("_")


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Validar cobertura del pipeline")
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args()

    from app.db.database import SessionLocal
    from app.db.models import (
        Recipe, RecipeIngredient, Ingredient, IngredientProductMap, Product,
    )

    session = SessionLocal()

    try:
        # --- Estadisticas generales ---
        recipes = session.query(Recipe).all()
        ingredients_db = session.query(Ingredient).all()
        mappings = session.query(IngredientProductMap).all()
        products = session.query(Product).all()

        print("=" * 60)
        print("  VALIDACION DE COBERTURA - NUTRICONSUM")
        print("=" * 60)
        print(f"\n[DB] Tablas:")
        print(f"  products:              {len(products)}")
        print(f"  ingredients:           {len(ingredients_db)}")
        print(f"  ingredient_product_map: {len(mappings)}")
        print(f"  recipes:               {len(recipes)}")

        ri_count = session.query(RecipeIngredient).count()
        print(f"  recipe_ingredients:    {ri_count}")

        # --- Recetas por meal_type ---
        print(f"\n[recipes] Por meal_type:")
        meal_counts = defaultdict(int)
        for r in recipes:
            meal_counts[r.meal_type] += 1
        for mt in ["desayuno", "almuerzo", "comida", "merienda", "cena"]:
            print(f"  {mt}: {meal_counts.get(mt, 0)}")

        # --- Recetas por dieta ---
        print(f"\n[recipes] Por dieta:")
        diet_counts = defaultdict(int)
        for r in recipes:
            diets = r.suitable_diets or ["omnivoro"]
            for d in diets:
                diet_counts[d] += 1
        for d in sorted(diet_counts):
            print(f"  {d}: {diet_counts[d]}")

        # --- Ingredientes de recetas vs DB ---
        print(f"\n[coverage] Validando ingredientes de recetas...")

        # Indexar ingredientes por nombre normalizado
        ing_by_key = {}
        ing_keys_sorted = []  # For prefix matching
        for ing in ingredients_db:
            key = normalize_key(ing.name)
            ing_by_key[key] = ing
            ing_keys_sorted.append((key, ing))
        ing_keys_sorted.sort(key=lambda x: x[0])

        # Indexar mappings por ingredient_id
        mapped_ingredient_ids = set()
        for m in mappings:
            mapped_ingredient_ids.add(m.ingredient_id)

        # Productos con precio
        products_with_price = set()
        for p in products:
            if p.price and p.price > 0:
                products_with_price.add(p.id)

        # Mappings a productos con precio
        mapped_with_price = set()
        for m in mappings:
            if m.product_id in products_with_price:
                mapped_with_price.add(m.ingredient_id)

        # Build a set of all normalized keys for prefix matching
        all_ing_keys = set(ing_by_key.keys())

        def find_ingredient(name):
            """Find ingredient by exact key, then prefix match."""
            key = normalize_key(name)
            # Exact match
            if key in ing_by_key:
                return ing_by_key[key]
            # Recipe key is prefix of a DB key (e.g. "aguacate" matches "aguacate_premadurado")
            for db_key, ing in ing_keys_sorted:
                if db_key.startswith(key):
                    return ing
            # DB key is prefix of recipe key (e.g. "tomate" in DB matches "tomate_frito")
            for db_key, ing in ing_keys_sorted:
                if key.startswith(db_key):
                    return ing
            return None

        # Recorrer ingredientes de recetas
        recipe_ingredients = session.query(RecipeIngredient).all()
        total_ri = len(recipe_ingredients)
        found_in_db = 0
        found_with_mapping = 0
        found_with_price = 0
        missing_ingredients = defaultdict(int)
        no_mapping = defaultdict(int)
        no_price = defaultdict(int)

        for ri in recipe_ingredients:
            ing = find_ingredient(ri.name)

            if ing:
                found_in_db += 1
                if ing.id in mapped_ingredient_ids:
                    found_with_mapping += 1
                    if ing.id in mapped_with_price:
                        found_with_price += 1
                    else:
                        no_price[ri.name] += 1
                else:
                    no_mapping[ri.name] += 1
            else:
                missing_ingredients[ri.name] += 1

        # --- Resultados ---
        print(f"\n[results] Cobertura de ingredientes de recetas:")
        print(f"  Total ingredient refs:     {total_ri}")
        print(f"  Encontrados en ingredients: {found_in_db} ({100*found_in_db/total_ri:.1f}%)")
        print(f"  Con mapping a producto:    {found_with_mapping} ({100*found_with_mapping/total_ri:.1f}%)")
        print(f"  Con producto con precio:   {found_with_price} ({100*found_with_price/total_ri:.1f}%)")

        if missing_ingredients:
            print(f"\n[gaps] Ingredientes NO encontrados en DB ({len(missing_ingredients)} unicos):")
            for name, count in sorted(missing_ingredients.items(), key=lambda x: -x[1])[:20]:
                print(f"  - {name} (x{count})")
            if len(missing_ingredients) > 20:
                print(f"  ... y {len(missing_ingredients) - 20} mas")

        if no_mapping and args.verbose:
            print(f"\n[gaps] Ingredientes SIN mapping a producto ({len(no_mapping)} unicos):")
            for name, count in sorted(no_mapping.items(), key=lambda x: -x[1])[:15]:
                print(f"  - {name} (x{count})")

        if no_price and args.verbose:
            print(f"\n[gaps] Ingredientes SIN producto con precio ({len(no_price)} unicos):")
            for name, count in sorted(no_price.items(), key=lambda x: -x[1])[:15]:
                print(f"  - {name} (x{count})")

        # --- Score final ---
        coverage_pct = 100 * found_with_mapping / total_ri if total_ri else 0
        print(f"\n{'=' * 60}")
        if coverage_pct >= 95:
            print(f"  [PASS] Cobertura: {coverage_pct:.1f}% (target: >95%)")
        elif coverage_pct >= 80:
            print(f"  [WARN] Cobertura: {coverage_pct:.1f}% (target: >95%, aceptable: >80%)")
        else:
            print(f"  [FAIL] Cobertura: {coverage_pct:.1f}% (target: >95%)")
        print(f"{'=' * 60}")

    finally:
        session.close()


if __name__ == "__main__":
    main()
