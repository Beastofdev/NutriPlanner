"""
nutriscore.py — Simplified Nutri-Score calculator for recipes.

Uses the official Nutri-Score algorithm (2024 revision) with estimations
for missing nutritional components. Based on available macros per serving
(calories, protein, carbs, fats) and BEDCA reference data where available.

The official formula scores per 100g:
  Negative points (N): energy_kj + sugars + saturated_fat + sodium  (0-10 each)
  Positive points (P): fiber + protein + fruits_veg_percent          (0-5 each)
  Score = N - P  (range: -15 to +40)
  A: ≤-1, B: 0-2, C: 3-10, D: 11-18, E: ≥19

Since our recipes have macros but not all micro-nutrients, we estimate:
  - sugars ≈ 30% of total carbs (conservative for home-cooked)
  - saturated_fat ≈ 33% of total fat (Spanish diet average)
  - sodium ≈ 300mg per 100g (cooking average)
  - fiber ≈ 2g per 100g (default, boosted for veggie-heavy dishes)
  - fruits_veg ≈ heuristic from recipe category/ingredients
"""

from typing import Dict, Optional, Tuple


# --- NEGATIVE POINTS TABLES (per 100g) ---

# Energy (kJ): 0-10 points
_ENERGY_THRESHOLDS = [335, 670, 1005, 1340, 1675, 2010, 2345, 2680, 3015, 3350]

# Sugars (g): 0-10 points
_SUGARS_THRESHOLDS = [4.5, 9, 13.5, 18, 22.5, 27, 31, 36, 40, 45]

# Saturated fat (g): 0-10 points
_SAT_FAT_THRESHOLDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

# Sodium (mg): 0-10 points
_SODIUM_THRESHOLDS = [90, 180, 270, 360, 450, 540, 630, 720, 810, 900]


# --- POSITIVE POINTS TABLES (per 100g) ---

# Fiber (g): 0-5 points
_FIBER_THRESHOLDS = [0.9, 1.9, 2.8, 3.7, 4.7]

# Protein (g): 0-5 points
_PROTEIN_THRESHOLDS = [1.6, 3.2, 4.8, 6.4, 8.0]

# Fruits/veg/legumes (%): 0-5 points
_FVL_THRESHOLDS = [40, 60, 80, 80, 80]  # only 0, 1, 2, 5 used in practice


def _score_from_thresholds(value: float, thresholds: list) -> int:
    """Map a value to 0-N points using threshold list."""
    for i, t in enumerate(thresholds):
        if value <= t:
            return i
    return len(thresholds)


def _estimate_serving_weight(calories: float, protein: float, carbs: float, fats: float) -> float:
    """
    Estimate total serving weight in grams from macros.
    protein=4 kcal/g, carbs=4 kcal/g, fat=9 kcal/g
    Add ~20% for water/fiber content.
    """
    macro_weight = protein + carbs + fats  # grams of macronutrients
    if macro_weight <= 0:
        return 300.0  # default
    # Typical home-cooked meal is ~30-40% macros by weight (rest is water)
    return max(macro_weight * 2.8, 150.0)


def calc_nutriscore(
    calories: float,
    protein: float,
    carbs: float,
    fats: float,
    fiber_override: Optional[float] = None,
    sodium_override: Optional[float] = None,
    is_vegetable_heavy: bool = False,
) -> Dict:
    """
    Calculate approximate Nutri-Score for a recipe serving.

    Args:
        calories: kcal per serving
        protein: grams per serving
        carbs: grams per serving
        fats: grams per serving
        fiber_override: grams per serving (if known from BEDCA)
        sodium_override: mg per serving (if known)
        is_vegetable_heavy: True if recipe has >40% vegetable ingredients

    Returns:
        {
            "grade": "A"|"B"|"C"|"D"|"E",
            "score": int (-15 to +40),
            "color": str (hex color for badge),
        }
    """
    if calories <= 0:
        return {"grade": "C", "score": 5, "color": "#FF9800"}

    # Estimate serving weight and convert to per-100g
    serving_g = _estimate_serving_weight(calories, protein, carbs, fats)
    factor = 100.0 / serving_g

    cal_100 = calories * factor
    protein_100 = protein * factor
    carbs_100 = carbs * factor
    fats_100 = fats * factor

    # Estimate missing values (per 100g)
    energy_kj_100 = cal_100 * 4.184
    sugars_100 = carbs_100 * 0.30  # ~30% of carbs are sugars in home cooking
    sat_fat_100 = fats_100 * 0.33  # ~33% of fat is saturated (Spanish avg)
    sodium_100 = (sodium_override * factor) if sodium_override else 300.0  # mg
    fiber_100 = (fiber_override * factor) if fiber_override else 2.0  # g

    # Fruits/veg estimation
    fvl_pct = 60 if is_vegetable_heavy else 20

    # --- NEGATIVE POINTS ---
    n_energy = _score_from_thresholds(energy_kj_100, _ENERGY_THRESHOLDS)
    n_sugars = _score_from_thresholds(sugars_100, _SUGARS_THRESHOLDS)
    n_sat_fat = _score_from_thresholds(sat_fat_100, _SAT_FAT_THRESHOLDS)
    n_sodium = _score_from_thresholds(sodium_100, _SODIUM_THRESHOLDS)
    negative = n_energy + n_sugars + n_sat_fat + n_sodium

    # --- POSITIVE POINTS ---
    p_fiber = _score_from_thresholds(fiber_100, _FIBER_THRESHOLDS)
    p_protein = _score_from_thresholds(protein_100, _PROTEIN_THRESHOLDS)

    # FVL scoring: 0 (<40%), 1 (40-60%), 2 (60-80%), 5 (≥80%)
    if fvl_pct >= 80:
        p_fvl = 5
    elif fvl_pct >= 60:
        p_fvl = 2
    elif fvl_pct >= 40:
        p_fvl = 1
    else:
        p_fvl = 0

    positive = p_fiber + p_protein + p_fvl

    # --- FINAL SCORE ---
    # Official rule: if negative >= 11 and fvl < 5, protein doesn't count
    if negative >= 11 and p_fvl < 5:
        score = negative - (p_fiber + p_fvl)
    else:
        score = negative - positive

    # --- GRADE ---
    grade, color = _score_to_grade(score)

    return {
        "grade": grade,
        "score": score,
        "color": color,
    }


def _score_to_grade(score: int) -> Tuple[str, str]:
    """Map numeric score to letter grade and color."""
    if score <= -1:
        return "A", "#038141"  # Dark green
    elif score <= 2:
        return "B", "#85BB2F"  # Light green
    elif score <= 10:
        return "C", "#FECB02"  # Yellow
    elif score <= 18:
        return "D", "#EE8100"  # Orange
    else:
        return "E", "#E63E11"  # Red


def nutriscore_for_recipe(recipe: dict) -> Dict:
    """
    Calculate Nutri-Score from a recipe dict with standard keys.
    Handles both raw recipe data and meal data from the menu.
    """
    macros = recipe.get("macros", {})
    calories = recipe.get("calorias") or recipe.get("calories") or 0
    protein = macros.get("proteinas") or macros.get("protein") or recipe.get("protein") or 0
    carbs = macros.get("carbohidratos") or macros.get("carbs") or recipe.get("carbs") or 0
    fats = macros.get("grasas") or macros.get("fats") or recipe.get("fats") or 0

    # Heuristic: detect vegetable-heavy recipes by name
    name_lower = (recipe.get("nombre") or recipe.get("name") or "").lower()
    veggie_keywords = [
        "ensalada", "verdura", "vegetal", "brócoli", "brocoli", "espinaca",
        "calabacín", "calabacin", "berenjena", "tomate", "pimiento",
        "alcachofa", "menestra", "gazpacho", "salmorejo", "ratatouille",
        "wok de verduras", "pisto", "escalivada",
    ]
    is_veg = any(kw in name_lower for kw in veggie_keywords)

    return calc_nutriscore(
        calories=calories,
        protein=protein,
        carbs=carbs,
        fats=fats,
        is_vegetable_heavy=is_veg,
    )
