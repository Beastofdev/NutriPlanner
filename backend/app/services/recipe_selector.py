"""
Deterministic recipe selector — replaces Gemini for V3 menu generation.

4-stage algorithm:
  1. PARTITION: Split daily calories across meal slots
  2. SCORE: Multi-factor scoring for each candidate recipe
  3. ASSIGN: Greedy day-by-day assignment with hard constraints
  4. CALIBRATE: Adjust portions so each day hits the calorie target
"""

import logging
import random
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Set, Tuple

logger = logging.getLogger(__name__)

# Calorie distribution ratios per slot (will be normalized to active slots)
SLOT_RATIOS = {
    "desayuno": 0.25,
    "almuerzo": 0.10,
    "comida": 0.35,
    "merienda": 0.10,
    "cena": 0.30,
}

# Cross-slot fallbacks: when a slot has 0 recipes after filtering, try these
_SLOT_FALLBACKS = {
    "merienda": ["almuerzo", "desayuno"],
    "almuerzo": ["merienda", "desayuno"],
    "desayuno": ["almuerzo", "merienda"],
    "comida":   ["cena"],
    "cena":     ["comida"],
}

# Protein group mapping: ingredient prefix → protein group
# Used to prevent same protein source in multiple slots of the same day
# Sorted longest-first at runtime via _PROTEIN_PREFIXES_SORTED for correct matching
_PROTEIN_GROUPS = {
    # Pollo
    "carne_pechuga_pollo": "pollo", "carne_pollo": "pollo",
    "conserva_pollo": "pollo", "caldo_pollo": None,  # caldo is not a protein source
    # Vacuno
    "carne_picada_vacuno": "vacuno", "carne_ternera": "vacuno",
    "carne_filetes_vacuno": "vacuno",
    # Cerdo
    "carne_cerdo": "cerdo", "carne_lomo_cerdo": "cerdo",
    "carne_picada_vacuno_cerdo": "vacuno",  # mixed meat → primary group
    # Pavo
    "carne_pavo": "pavo", "carne_filetes_pechuga_pavo": "pavo",
    "carne_filete_pavo": "pavo", "embutido_lomo_pavo": "pavo",
    # Embutidos (cerdo-based)
    "embutido_bacon": "cerdo", "embutido_jamon": "cerdo",
    # Pescados (unified group to prevent fish concentration)
    "pescado_salmon": "pescado",
    "pescado_merluza": "pescado", "pescado_congelado_medallones_merluza": "pescado",
    "pescado_bacalao": "pescado",
    "pescado_atun": "pescado", "conserva_atun": "pescado",
    "pescado_dorada": "pescado", "pescado_congelado_dorada": "pescado",
    "pescado_emperador": "pescado",
    "pescado_calamar": "pescado", "marisco_calamar": "pescado",
    "pescado_trucha": "pescado", "pescado_sardina": "pescado",
    "pescado_caballa": "pescado", "pescado_boquerones": "pescado",
    "pescado_rape": "pescado", "pescado_pez_espada": "pescado",
    "pescado_lubina": "pescado",
    # Mariscos (same group as fish)
    "marisco_gambas": "pescado", "marisco_gamba": "pescado",
    "marisco_langostino": "pescado",
    "marisco_mejillon": "pescado",
    # Huevos
    "huevos": "huevos",
    # Tofu
    "verdura_procesada_tofu": "tofu",
}

# Sorted longest-first for correct prefix matching
_PROTEIN_PREFIXES_SORTED = sorted(_PROTEIN_GROUPS.keys(), key=len, reverse=True)


def _extract_primary_proteins(ing_set: Set[str]) -> Set[str]:
    """Extract protein group names from a set of ingredient canonical names."""
    proteins = set()
    for ing in ing_set:
        for prefix in _PROTEIN_PREFIXES_SORTED:
            if ing.startswith(prefix):
                group = _PROTEIN_GROUPS[prefix]
                if group is not None:  # skip non-protein entries like caldo_pollo
                    proteins.add(group)
                break
    return proteins


# Justification templates per meal slot
_JUSTIFICATIONS = {
    "desayuno": [
        "Desayuno equilibrado con buena carga energética para empezar el día",
        "Aporta energía sostenida para la mañana con buen perfil de macros",
        "Combinación nutritiva que activa el metabolismo matutino",
    ],
    "almuerzo": [
        "Snack ligero a media mañana para mantener los niveles de energía",
        "Tentempié saludable que evita llegar con hambre al almuerzo",
        "Aporte moderado de energía para rendir hasta la comida principal",
    ],
    "comida": [
        "Plato principal completo con buen equilibrio de proteínas y carbohidratos",
        "Comida contundente que aporta la mayor carga calórica del día",
        "Almuerzo nutritivo con ingredientes de calidad para la tarde",
    ],
    "merienda": [
        "Merienda ligera que complementa el aporte calórico sin excederse",
        "Snack saludable para mantener energía hasta la cena",
        "Aporte extra de nutrientes con pocas calorías para la tarde",
    ],
    "cena": [
        "Cena ligera pero saciante para un buen descanso nocturno",
        "Cena equilibrada que completa el objetivo calórico del día",
        "Plato liviano con buen aporte proteico para la recuperación nocturna",
    ],
}


# ------------------------------------------------------------------
# SEASONAL DETECTION
# ------------------------------------------------------------------

def _get_current_season() -> str:
    """Return current season for the Spanish calendar."""
    month = datetime.now().month
    if month in (12, 1, 2):
        return "invierno"
    elif month in (3, 4, 5):
        return "primavera"
    elif month in (6, 7, 8):
        return "verano"
    else:
        return "otono"


# Recipe name keywords that strongly signal a season
_SEASONAL_RECIPE_KEYWORDS: Dict[str, List[str]] = {
    "primavera": [
        "espárrago", "esparrago", "alcachofa", "guisante", "habas",
        "primavera", "ensalada tibia",
    ],
    "verano": [
        "gazpacho", "salmorejo", "ensalada fría", "ensalada fresca",
        "smoothie", "batido", "granizado", "sandía", "sandia",
        "melón", "melon", "carpaccio", "ceviche", "tartar",
        "ensalada", "pisto", "escalivada",
    ],
    "otono": [
        "seta", "setas", "calabaza", "crema de calabaza",
        "manzana", "pera", "uva", "membrillo", "otoño", "otono",
        "castañas", "castanas", "boniato",
    ],
    "invierno": [
        "sopa", "guiso", "estofado", "caldo", "cocido", "potaje",
        "lentejas", "fabada", "crema de", "puerro", "invierno",
        "gratinado", "graten",
    ],
}

# Ingredient canonical prefixes that are seasonal
_SEASONAL_INGREDIENTS: Dict[str, List[str]] = {
    "primavera": [
        "verdura_esparrago", "verdura_alcachofa", "verdura_guisante",
        "verdura_habas", "verdura_espinaca", "fruta_fresa",
    ],
    "verano": [
        "verdura_tomate_cherry", "verdura_pimiento", "verdura_pepino",
        "verdura_berenjena", "verdura_calabacin", "fruta_sandia",
        "fruta_melon", "fruta_melocoton", "fruta_cereza", "fruta_nectarina",
    ],
    "otono": [
        "verdura_seta", "verdura_calabaza", "verdura_boniato",
        "fruta_manzana", "fruta_pera", "fruta_uva", "fruta_higo",
        "fruta_granada", "fruta_caqui",
    ],
    "invierno": [
        "verdura_puerro", "verdura_brocoli", "verdura_coliflor",
        "verdura_acelga", "verdura_col", "verdura_nabo", "verdura_apio",
        "fruta_naranja", "fruta_mandarina", "fruta_pomelo", "fruta_kiwi",
    ],
}


class RecipeSelector:
    """Deterministic meal-plan generator."""

    def generate_menu(
        self,
        recipes_by_meal: Dict[str, List[Dict]],
        data: Any,
        meals_to_generate: List[str],
        user_ratings: Optional[Dict[int, str]] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Main entry point — replaces the Gemini call in get_smart_menu_v3.

        Returns the same JSON shape that Gemini used to produce:
        {"menu": [...], "total_calorias_dia": N, "notas": "..."}

        user_ratings: {recipe_id: "favorite"|"like"|"dislike"} or None
        """
        num_days = data.plan_days or 7
        target_kcal = data.target_calories or 2000
        menu_mode = getattr(data, "menu_mode", "savings") or "savings"
        cooking_time = getattr(data, "cooking_time", "normal") or "normal"
        skill_level = getattr(data, "skill_level", "intermediate") or "intermediate"
        meal_prep = getattr(data, "meal_prep", False)
        economic_level = getattr(data, "economic_level", "normal") or "normal"

        pantry_names = self._extract_pantry_names(data)

        # STAGE 1 — PARTITION
        slot_targets = self._partition_calories(target_kcal, meals_to_generate)

        # Preload ingredient sets per recipe for reuse scoring
        recipe_ingredients = self._build_ingredient_index(recipes_by_meal)

        # STAGE 2+3 — SCORE & ASSIGN (greedy, day by day)
        menu: List[Dict[str, Any]] = []
        used_global: Dict[str, int] = {}          # recipe_id → times used globally
        used_per_slot: Dict[str, Dict[int, int]] = {m: {} for m in meals_to_generate}
        day_fingerprints: List[str] = []           # to detect identical days
        week_ingredients: Set[str] = set()         # running set for reuse bonus
        ingredient_meal_count: Dict[str, int] = {} # ingredient → number of meals it appears in
        total_meals_assigned: int = 0              # running count of meals assigned so far
        prev_day_recipe_ids: Set[int] = set()      # recipes used yesterday (anti-consecutive)
        week_protein_counts: Dict[str, int] = {}   # protein_group → number of days it appeared

        # Max repetitions per slot depend on mode and days
        max_per_slot = self._max_per_slot(menu_mode, num_days)
        max_global = self._max_global(menu_mode, num_days)

        for day_num in range(1, num_days + 1):
            day_result: Dict[str, Any] = {"dia": day_num}
            day_recipe_ids: List[int] = []
            day_ingredients: Set[str] = set()
            day_proteins: Set[str] = set()  # protein groups already assigned today

            for slot in meals_to_generate:
                candidates = recipes_by_meal.get(slot, [])
                if not candidates:
                    # Cross-slot fallback: borrow from similar slots
                    fallback_order = _SLOT_FALLBACKS.get(slot, [])
                    for fb_slot in fallback_order:
                        candidates = recipes_by_meal.get(fb_slot, [])
                        if candidates:
                            logger.warning(
                                "[SELECTOR] Day %d: no %s recipes, borrowing from %s (%d candidates)",
                                day_num, slot, fb_slot, len(candidates),
                            )
                            break
                    if not candidates:
                        logger.warning("[SELECTOR] Day %d: slot %s skipped — 0 candidates", day_num, slot)
                        continue

                target = slot_targets[slot]

                scored = []
                for recipe in candidates:
                    rid = recipe["id"]

                    # Hard constraint: never same recipe twice in same day
                    if rid in day_recipe_ids:
                        continue
                    # Hard constraint: slot cap
                    if used_per_slot[slot].get(rid, 0) >= max_per_slot:
                        continue
                    # Hard constraint: global cap
                    if used_global.get(rid, 0) >= max_global:
                        continue

                    score = self._score_recipe(
                        recipe, target, slot,
                        used_global=used_global,
                        week_ingredients=week_ingredients,
                        day_proteins=day_proteins,
                        pantry_names=pantry_names,
                        recipe_ingredients=recipe_ingredients,
                        ingredient_meal_count=ingredient_meal_count,
                        total_meals_assigned=total_meals_assigned,
                        cooking_time=cooking_time,
                        skill_level=skill_level,
                        meal_prep=meal_prep,
                        economic_level=economic_level,
                        menu_mode=menu_mode,
                        user_ratings=user_ratings,
                        week_protein_counts=week_protein_counts,
                    )
                    # Heavy penalty for consecutive-day repetition
                    if rid in prev_day_recipe_ids:
                        score -= 30
                    scored.append((score, recipe))

                if not scored:
                    # Fallback: relax constraints, pick any candidate
                    scored = [(0, r) for r in candidates if r["id"] not in day_recipe_ids]
                    if not scored:
                        scored = [(0, candidates[0])]

                # Pick the best
                scored.sort(key=lambda x: x[0], reverse=True)
                best_recipe = scored[0][1]
                rid = best_recipe["id"]

                # Calculate optimal portion (per-serving calories)
                servings = best_recipe.get("servings", 1) or 1
                kcal_per_serving = (best_recipe.get("calories", 0) or 1) / servings
                portion = self._find_best_portion(kcal_per_serving, target)

                day_result[slot] = {
                    "recipe_id": rid,
                    "nombre": best_recipe["name"],
                    "kcal_base": int(kcal_per_serving),
                    "porciones": portion,
                    "calorias": int(kcal_per_serving * portion),
                    "justificacion": self._pick_justification(slot, best_recipe),
                }

                # Bookkeeping
                day_recipe_ids.append(rid)
                used_global[rid] = used_global.get(rid, 0) + 1
                used_per_slot[slot][rid] = used_per_slot[slot].get(rid, 0) + 1

                # Track ingredients for reuse scoring + concentration
                ing_set = recipe_ingredients.get(rid, set())
                day_ingredients.update(ing_set)
                day_proteins.update(_extract_primary_proteins(ing_set))
                for ing_name in ing_set:
                    ingredient_meal_count[ing_name] = ingredient_meal_count.get(ing_name, 0) + 1
                total_meals_assigned += 1

            # Fingerprint check: prevent identical days
            fp = "-".join(str(r) for r in sorted(day_recipe_ids))
            if fp in day_fingerprints and len(day_fingerprints) > 0:
                # Try to swap the least-important slot with next best candidate
                day_result, day_recipe_ids = self._swap_to_deduplicate(
                    day_result, day_recipe_ids, meals_to_generate,
                    recipes_by_meal, used_per_slot, max_per_slot,
                    used_global, max_global, slot_targets,
                    recipe_ingredients, pantry_names, week_ingredients,
                    cooking_time, skill_level, meal_prep, economic_level, menu_mode,
                )
                fp = "-".join(str(r) for r in sorted(day_recipe_ids))

            day_fingerprints.append(fp)
            week_ingredients.update(day_ingredients)
            prev_day_recipe_ids = set(day_recipe_ids)
            # Track cross-day protein diversity
            for pg in day_proteins:
                week_protein_counts[pg] = week_protein_counts.get(pg, 0) + 1
            menu.append(day_result)

        result = {
            "menu": menu,
            "total_calorias_dia": target_kcal,
            "notas": self._generate_notes(menu_mode, num_days, len(meals_to_generate)),
        }

        logger.info(
            "[SELECTOR] Menu generado: %d días, %d comidas/día, target %d kcal",
            num_days, len(meals_to_generate), target_kcal,
        )
        return result

    # ------------------------------------------------------------------
    # STAGE 1: PARTITION
    # ------------------------------------------------------------------

    @staticmethod
    def _partition_calories(
        target_kcal: int, meals: List[str]
    ) -> Dict[str, int]:
        active_ratios = {m: SLOT_RATIOS.get(m, 0.20) for m in meals}
        total_ratio = sum(active_ratios.values())
        return {
            m: int(target_kcal * (r / total_ratio))
            for m, r in active_ratios.items()
        }

    # ------------------------------------------------------------------
    # STAGE 2: SCORE
    # ------------------------------------------------------------------

    def _score_recipe(
        self,
        recipe: Dict,
        target_kcal: int,
        slot: str,
        *,
        used_global: Dict[int, int],
        week_ingredients: Set[str],
        day_proteins: Set[str],
        pantry_names: List[str],
        recipe_ingredients: Dict[int, Set[str]],
        ingredient_meal_count: Dict[str, int],
        total_meals_assigned: int,
        cooking_time: str,
        skill_level: str,
        meal_prep: bool,
        economic_level: str,
        menu_mode: str,
        user_ratings: Optional[Dict[int, str]] = None,
        week_protein_counts: Optional[Dict[str, int]] = None,
    ) -> float:
        score = 0.0
        rid = recipe["id"]
        servings_score = recipe.get("servings", 1) or 1
        kcal_base = (recipe.get("calories", 0) or 1) / servings_score

        # 1. Calorie fit (0-30 pts)
        best_portion = self._find_best_portion(kcal_base, target_kcal)
        actual_kcal = kcal_base * best_portion
        kcal_diff_pct = abs(actual_kcal - target_kcal) / max(target_kcal, 1)
        score += max(0, 30 - kcal_diff_pct * 60)

        # 2. Variety penalty
        times_used = used_global.get(rid, 0)
        if menu_mode == "variety":
            score -= times_used * 20
        else:
            score -= times_used * 8

        # 3. Ingredient reuse bonus (diminishing returns to avoid single-ingredient domination)
        ing_set = recipe_ingredients.get(rid, set())
        shared_week = sorted(
            (ing_set & week_ingredients),
            key=lambda i: ingredient_meal_count.get(i, 0),
        )
        reuse_bonus = 0.0
        for i, _ing in enumerate(shared_week):
            reuse_bonus += max(0.5, 2.0 - i * 0.5)  # +2, +1.5, +1, +0.5, +0.5...
        score += min(reuse_bonus, 6.0)  # cap total reuse bonus at 6

        # 3b. Ingredient concentration penalty (prevent eggs-in-every-meal syndrome)
        if total_meals_assigned >= 3:
            concentration_threshold = max(3, int(total_meals_assigned * 0.30))
            concentration_penalty = 0.0
            for ing in ing_set:
                count = ingredient_meal_count.get(ing, 0)
                if count > concentration_threshold:
                    excess = count - concentration_threshold
                    concentration_penalty += excess * 6  # -6 per excess meal per ingredient
            score -= concentration_penalty

        # 4. Same-day protein repetition penalty (flat -25 if any protein group repeats)
        recipe_proteins = _extract_primary_proteins(ing_set)
        shared_proteins = recipe_proteins & day_proteins
        if shared_proteins:
            score -= 25

        # 4b. Cross-day protein diversity penalty (-5 per previous day the protein appeared, max -15)
        if week_protein_counts and recipe_proteins:
            cross_day_penalty = 0.0
            for pg in recipe_proteins:
                prev_days = week_protein_counts.get(pg, 0)
                if prev_days > 0:
                    cross_day_penalty += min(15, prev_days * 5)
            score -= cross_day_penalty

        # 5. Pantry bonus (+5 per pantry ingredient the recipe uses)
        if pantry_names:
            # Build canonical prefixes from display names
            prefixes = []
            for pname in pantry_names:
                mapped = RecipeSelector.PANTRY_CANONICAL_MAP.get(pname)
                if mapped:
                    prefixes.extend(mapped)
                else:
                    # Fallback: normalize display name to canonical-style substring
                    normalized = pname.replace(" ", "_").replace("á", "a").replace("é", "e").replace("í", "i").replace("ó", "o").replace("ú", "u")
                    prefixes.append(normalized)
                    # Also try singular form (garbanzos→garbanzo, lentejas→lenteja)
                    if normalized.endswith("s"):
                        prefixes.append(normalized[:-1])
                    if normalized.endswith("es"):
                        prefixes.append(normalized[:-2])
            pantry_hits = sum(
                1 for ing in ing_set
                if any(ing.startswith(p) for p in prefixes)
            )
            score += pantry_hits * 5

        # 6. Cooking time fit (0-10 pts)
        prep = recipe.get("prep_time", 30) or 30
        if cooking_time == "express":
            score += 10 if prep <= 15 else (5 if prep <= 25 else -5)
        elif cooking_time == "chef":
            score += 5  # no penalty for long recipes
        else:
            score += 10 if prep <= 45 else 5

        # 7. Skill level fit (0-12 pts)
        difficulty = (recipe.get("difficulty") or "media").lower()
        if skill_level == "beginner":
            score += 12 if difficulty in ("facil", "fácil", "easy") else (3 if difficulty == "media" else -8)
        elif skill_level == "intermediate":
            score += 6 if difficulty == "media" else (3 if difficulty in ("facil", "fácil", "easy") else -3)
        elif skill_level == "advanced":
            score += 8 if difficulty in ("dificil", "difícil", "hard") else 4

        # 8. Economic level (0-10 pts)
        if economic_level == "economico":
            # Favor recipes with fewer ingredients (cheaper)
            score += min(10, max(0, 10 - len(ing_set) * 0.8))
        elif economic_level == "premium":
            # Slightly favor complex recipes
            score += min(5, len(ing_set) * 0.5)

        # 9. Meal prep bonus
        if meal_prep:
            # Favor recipes that appear in similar slots (batch-cookable)
            score += times_used * 3

        # 10. Random jitter (0-5 pts) for variety between generations
        score += random.uniform(0, 5)

        # 11. User ratings: favorite +15, like +5, dislike → effectively exclude
        if user_ratings:
            rating = user_ratings.get(rid)
            if rating == "favorite":
                score += 15
            elif rating == "like":
                score += 5
            elif rating == "dislike":
                score -= 999

        # 12. Seasonal bonus (0-12 pts): boost recipes that match current season
        season = _get_current_season()
        recipe_name = (recipe.get("name") or "").lower()

        # 12a. Recipe name keyword match (0-8 pts)
        season_keywords = _SEASONAL_RECIPE_KEYWORDS.get(season, [])
        kw_hits = sum(1 for kw in season_keywords if kw in recipe_name)
        score += min(8, kw_hits * 4)

        # 12b. Ingredient composition match (0-4 pts)
        season_prefixes = _SEASONAL_INGREDIENTS.get(season, [])
        if ing_set and season_prefixes:
            seasonal_hits = sum(
                1 for ing in ing_set
                if any(ing.startswith(sp) for sp in season_prefixes)
            )
            ratio = seasonal_hits / max(len(ing_set), 1)
            score += ratio * 4  # 0-4 pts based on ratio of seasonal ingredients

        return score

    # ------------------------------------------------------------------
    # STAGE 3 helpers: ASSIGN
    # ------------------------------------------------------------------

    @staticmethod
    def _max_per_slot(mode: str, num_days: int) -> int:
        if mode == "variety":
            return 1 if num_days <= 5 else 2
        else:
            return 2 if num_days <= 7 else 3

    @staticmethod
    def _max_global(mode: str, num_days: int) -> int:
        if mode == "variety":
            return 2 if num_days <= 7 else 3
        else:
            return min(3, max(2, num_days // 3))

    def _swap_to_deduplicate(
        self,
        day_result: Dict,
        day_recipe_ids: List[int],
        meals: List[str],
        recipes_by_meal: Dict[str, List[Dict]],
        used_per_slot: Dict[str, Dict[int, int]],
        max_per_slot: int,
        used_global: Dict[int, int],
        max_global: int,
        slot_targets: Dict[str, int],
        recipe_ingredients: Dict[int, Set[str]],
        pantry_names: List[str],
        week_ingredients: Set[str],
        cooking_time: str,
        skill_level: str,
        meal_prep: bool,
        economic_level: str,
        menu_mode: str,
    ) -> Tuple[Dict, List[int]]:
        """Try swapping the last slot to break fingerprint duplication."""
        # Try slots in reverse order (less important first)
        for slot in reversed(meals):
            current_rid = day_result.get(slot, {}).get("recipe_id")
            if current_rid is None:
                continue

            candidates = recipes_by_meal.get(slot, [])
            other_ids = [r for r in day_recipe_ids if r != current_rid]

            for recipe in candidates:
                rid = recipe["id"]
                if rid == current_rid:
                    continue
                if rid in other_ids:
                    continue
                if used_per_slot[slot].get(rid, 0) >= max_per_slot:
                    continue
                if used_global.get(rid, 0) >= max_global:
                    continue

                # Found a viable swap (per-serving calories)
                swap_servings = recipe.get("servings", 1) or 1
                kcal_per_serving = (recipe.get("calories", 0) or 1) / swap_servings
                portion = self._find_best_portion(kcal_per_serving, slot_targets[slot])

                # Undo bookkeeping for old recipe
                used_global[current_rid] = max(0, used_global.get(current_rid, 1) - 1)
                used_per_slot[slot][current_rid] = max(0, used_per_slot[slot].get(current_rid, 1) - 1)

                # Apply new recipe
                day_result[slot] = {
                    "recipe_id": rid,
                    "nombre": recipe["name"],
                    "kcal_base": int(kcal_per_serving),
                    "porciones": portion,
                    "calorias": int(kcal_per_serving * portion),
                    "justificacion": self._pick_justification(slot, recipe),
                }
                used_global[rid] = used_global.get(rid, 0) + 1
                used_per_slot[slot][rid] = used_per_slot[slot].get(rid, 0) + 1

                new_ids = other_ids + [rid]
                return day_result, new_ids

        return day_result, day_recipe_ids

    # ------------------------------------------------------------------
    # STAGE 4: CALIBRATE (portion adjustment)
    # ------------------------------------------------------------------

    @staticmethod
    def _find_best_portion(kcal_base: float, target: float) -> float:
        """Find the portion (0.5-2.5, step 0.5) closest to the calorie target.

        Starts at 0.5 for high-calorie recipes (e.g. paella 800kcal targeting
        a 300kcal merienda). Capped at 2.5 to avoid unrealistic quantities.
        """
        if kcal_base <= 0:
            return 1.0
        best_portion = 1.0
        best_diff = abs(kcal_base * 1.0 - target)
        for p_x10 in range(5, 26, 5):  # 0.5, 1.0, 1.5, 2.0, 2.5
            p = p_x10 / 10
            diff = abs(kcal_base * p - target)
            if diff < best_diff:
                best_diff = diff
                best_portion = p
        return best_portion

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    # Mapping from frontend pantry display names → canonical key prefixes
    # Used to match pantry items against recipe_ingredients.name
    PANTRY_CANONICAL_MAP: Dict[str, List[str]] = {
        "aceite de oliva": ["aceite_oliva"],
        "sal": ["condimento_sal", "especia_sal"],
        "pimienta": ["especia_pimienta"],
        "vinagre": ["condimento_vinagre"],
        "azúcar": ["endulzante_azucar", "azucar"],
        "orégano": ["especia_oregano"],
        "comino": ["especia_comino"],
        "pimentón": ["especia_pimenton"],
        "canela": ["especia_canela"],
        "ajo en polvo": ["especia_ajo"],
        "arroz": ["cereal_arroz"],
        "pasta": ["pasta_"],
        "harina": ["harina_"],
        "pan rallado": ["pan_rallado"],
        "avena": ["cereal_copos_avena", "cereal_avena"],
        "huevos": ["huevos"],
        "leche": ["lacteo_leche"],
        "mantequilla": ["lacteo_mantequilla"],
        "cebolla": ["verdura_cebolla"],
        "ajo": ["verdura_ajo"],
        "tomate triturado": ["tomate_triturado", "conserva_tomate"],
        "atún en lata": ["conserva_atun"],
        "legumbres cocidas": ["legumbre_bote_", "legumbre_garbanzo", "legumbre_lenteja", "legumbre_alubia"],
        "salsa de soja": ["salsa_soja"],
        "mostaza": ["condimento_mostaza", "mostaza"],
        "verduras congeladas": ["verdura_congelad", "menestra", "salteado_verdura"],
        "pescado congelado": ["pescado_congelad", "merluza_congelad", "salmon_congelad"],
        "pan congelado": ["pan_congelad", "pan_molde"],
    }

    @staticmethod
    def _extract_pantry_names(data: Any) -> List[str]:
        pantry = getattr(data, "pantry_items", None) or []
        names = []
        for item in pantry:
            if isinstance(item, dict):
                n = item.get("name", "")
            elif isinstance(item, str):
                n = item
            else:
                continue
            if n:
                names.append(n.lower().strip())
        return names

    @staticmethod
    def _build_ingredient_index(
        recipes_by_meal: Dict[str, List[Dict]],
    ) -> Dict[int, Set[str]]:
        """
        Build recipe_id → set of ingredient names.
        Uses a single DB query for all recipe IDs.
        """
        from app.db.database import SessionLocal
        from sqlalchemy import text

        all_ids = []
        for recipes in recipes_by_meal.values():
            for r in recipes:
                all_ids.append(r["id"])

        if not all_ids:
            return {}

        session = SessionLocal()
        try:
            placeholders = ", ".join(f":id{i}" for i in range(len(all_ids)))
            id_params = {f"id{i}": rid for i, rid in enumerate(all_ids)}
            rows = session.execute(
                text(f"SELECT recipe_id, name FROM recipe_ingredients WHERE recipe_id IN ({placeholders})"),
                id_params,
            ).fetchall()
        finally:
            session.close()

        index: Dict[int, Set[str]] = {}
        for recipe_id, name in rows:
            index.setdefault(recipe_id, set()).add(name)
        return index

    @staticmethod
    def _pick_justification(slot: str, recipe: Dict) -> str:
        templates = _JUSTIFICATIONS.get(slot, _JUSTIFICATIONS["comida"])
        return random.choice(templates)

    @staticmethod
    def _generate_notes(mode: str, num_days: int, num_meals: int) -> str:
        if mode == "savings":
            return (
                f"Plan de {num_days} días en modo ahorro con {num_meals} comidas/día. "
                "Se reutilizan ingredientes entre días para minimizar desperdicio y coste."
            )
        return (
            f"Plan de {num_days} días en modo variedad con {num_meals} comidas/día. "
            "Máxima diversidad de recetas para una alimentación variada."
        )
