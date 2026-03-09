"""
Auto-calculate suitable_diets for recipes based on ingredient diet flags.

Uses ingredients.is_vegan, is_vegetarian, is_gluten_free, is_dairy_free
to determine which diets a recipe is compatible with.

Note: keto and paleo cannot be auto-calculated (they depend on macro ratios,
not ingredient flags) and should remain manually tagged.
"""
import logging
from typing import List

from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger("NutriPlanner.DietCalculator")


def calculate_suitable_diets(db: Session, recipe_id: int) -> List[str]:
    """
    Auto-calculate suitable diets for a recipe from ingredient flags.

    Returns list of diet strings compatible with the recipe.
    Always includes 'omnivoro'. keto/paleo are NOT auto-calculated.
    """
    result = db.execute(
        text("""
            SELECT
                BOOL_AND(COALESCE(i.is_vegan, true)) as all_vegan,
                BOOL_AND(COALESCE(i.is_vegetarian, true)) as all_vegetarian,
                BOOL_AND(COALESCE(i.is_gluten_free, true)) as all_gluten_free,
                BOOL_AND(COALESCE(i.is_dairy_free, true)) as all_dairy_free
            FROM recipe_ingredients ri
            JOIN ingredients i ON i.canonical_key = ri.name
            WHERE ri.recipe_id = :recipe_id
        """),
        {"recipe_id": recipe_id},
    ).fetchone()

    if not result:
        logger.warning("No ingredients found for recipe %d", recipe_id)
        return ["omnivoro"]

    diets = ["omnivoro"]
    if result.all_vegan:
        diets.append("vegano")
    if result.all_vegetarian:
        diets.append("vegetariano")
    if result.all_gluten_free:
        diets.append("sin_gluten")
    if result.all_dairy_free:
        diets.append("sin_lactosa")

    return diets
