import logging
import re
from typing import Any, Dict, List, Optional

from sqlalchemy import text

from app.db.database import IS_POSTGRES, SessionLocal
from app.schemas import WizardData
from app.services.exclusions import ALLERGEN_INGREDIENT_PATTERNS, expand_exclusions

logger = logging.getLogger("NutriPlanner.Nutritionist")


def _parse_instructions(text: str) -> list:
    """Split instruction text into individual steps."""
    if not text:
        return []
    steps = [s.strip() for s in re.split(r'\\n|\n', text) if s.strip()]
    if len(steps) <= 1 and len(text) > 100:
        steps = [s.strip() for s in re.split(r'(?=\d+\.\s)', text) if s.strip()]
    return steps


class Nutritionist:
    """Servicio principal de generación de menús y platos — 100% determinista (sin LLM)."""

    # ============================================================
    # MENÚ V3 (Recetas Verificadas + Selector Determinista)
    # ============================================================
    def _get_verified_recipes(
        self,
        diet_type: str,
        meal_types: List[str],
        excluded_ingredients: Optional[List[str]] = None,
        allergens: Optional[List[str]] = None
    ) -> Dict[str, List[Dict]]:
        """
        Carga recetas verificadas de la DB filtradas por dieta, tipo de comida,
        ingredientes excluidos (hated foods) y alérgenos.

        Los filtros son ESTRUCTURALES (SQL-level), no dependen del prompt de IA.
        """
        session = SessionLocal()
        try:
            # Mapear nombres de dieta del frontend a los de la DB
            diet_map = {
                "omnivoro": "omnivoro", "omnívoro": "omnivoro", "omnivore": "omnivoro",
                "vegetariano": "vegetariano", "vegetarian": "vegetariano",
                "vegano": "vegano", "vegan": "vegano",
                "sin gluten": "sin_gluten", "gluten free": "sin_gluten", "sin_gluten": "sin_gluten",
                "keto": "keto", "cetogenica": "keto",
                "paleo": "paleo",
                "sin lactosa": "sin_lactosa", "sin_lactosa": "sin_lactosa"
            }
            db_diet = diet_map.get(diet_type.lower().strip(), "omnivoro")

            # Availability filter disabled — coverage validated externally via
            # validate_coverage.py (96.3%). The old filter compared ri2.name
            # (human-readable) against ing.canonical_key (slugified) which never matched.
            availability_filter = ""

            # Filtro de dieta: excluir recetas con ingredientes incompatibles
            # Uses ingredient-level boolean flags (is_vegan, is_vegetarian, etc.)
            # instead of LIKE patterns — more robust and covers all 4 diet types
            diet_ingredient_filter = ""
            _DIET_FLAG_MAP = {
                "vegano": "is_vegan",
                "vegetariano": "is_vegetarian",
                "sin_gluten": "is_gluten_free",
                "sin_lactosa": "is_dairy_free",
            }
            diet_flag = _DIET_FLAG_MAP.get(db_diet)
            if diet_flag:
                diet_ingredient_filter = f"""
                    AND NOT EXISTS (
                        SELECT 1 FROM recipe_ingredients ri_diet
                        JOIN ingredients i_diet ON i_diet.canonical_key = ri_diet.name
                        WHERE ri_diet.recipe_id = r.id
                        AND i_diet.{diet_flag} = false
                    )
                """

            # Filtro de alérgenos: excluir recetas con ingredientes incompatibles con alérgenos
            # Ej: "Lactosa" → excluir recetas con mantequilla%, nata_%, queso_%, yogur_%, etc.
            allergen_filter = ""
            allergen_params = {}
            if allergens:
                all_allergen_patterns = []
                for allergen in allergens:
                    key = allergen.lower().strip()
                    if key in ALLERGEN_INGREDIENT_PATTERNS:
                        all_allergen_patterns.extend(ALLERGEN_INGREDIENT_PATTERNS[key])

                if all_allergen_patterns:
                    allergen_conditions = " OR ".join(
                        f"ri_alg.name LIKE :ap{i}" for i in range(len(all_allergen_patterns))
                    )
                    allergen_filter = f"""
                        AND NOT EXISTS (
                            SELECT 1 FROM recipe_ingredients ri_alg
                            WHERE ri_alg.recipe_id = r.id
                            AND ({allergen_conditions})
                        )
                    """
                    for i, pat in enumerate(all_allergen_patterns):
                        allergen_params[f"ap{i}"] = pat

            # Build hated-food filters (ingredient names + instructions text + recipe name)
            hated_filter = ""
            hated_params = {}
            if excluded_ingredients and len(excluded_ingredients) > 0:
                hated_keywords = [h.lower().strip() for h in excluded_ingredients if h and h.strip()]
                if hated_keywords:
                    # Filter by ingredient name in recipe_ingredients
                    ingredient_likes = " OR ".join(
                        f"LOWER(ri.name) LIKE :hk{i}" for i in range(len(hated_keywords))
                    )
                    # Filter by recipe name
                    name_likes = " OR ".join(
                        f"LOWER(r.name) LIKE :hk{i}" for i in range(len(hated_keywords))
                    )
                    # Filter by instructions text (catches "sofríe la cebolla" even if cebolla
                    # wasn't in recipe_ingredients — defense in depth)
                    instructions_likes = " OR ".join(
                        f"LOWER(r.instructions) LIKE :hk{i}" for i in range(len(hated_keywords))
                    )
                    hated_filter = f"""
                        AND NOT EXISTS (
                            SELECT 1 FROM recipe_ingredients ri
                            WHERE ri.recipe_id = r.id
                            AND ({ingredient_likes})
                        )
                        AND NOT ({name_likes})
                        AND NOT ({instructions_likes})
                    """
                    for i, kw in enumerate(hated_keywords):
                        hated_params[f"hk{i}"] = f"%{kw}%"

            # Build meal_type IN clause dynamically (SQLite compatible)
            meal_placeholders = ", ".join(f":mt{i}" for i in range(len(meal_types)))
            meal_params = {f"mt{i}": mt for i, mt in enumerate(meal_types)}

            # Combine all filters into a single query
            all_params = {
                "diet": db_diet,
                **meal_params,
                **allergen_params,
                **hated_params,
            }

            sql = text(f"""
                SELECT
                    r.id, r.name, r.description, r.instructions, r.calories,
                    r.protein, r.carbs, r.fats, r.meal_type, r.suitable_diets,
                    r.prep_time_minutes, r.difficulty, r.servings, r.image_url
                FROM recipes r
                WHERE r.is_verified = {"TRUE" if IS_POSTGRES else "1"}
                AND r.meal_type IN ({meal_placeholders})
                AND {"r.suitable_diets::text" if IS_POSTGRES else "r.suitable_diets"} LIKE '%' || :diet || '%'
                {hated_filter}
                {diet_ingredient_filter}
                {allergen_filter}
                {availability_filter}
                ORDER BY r.meal_type, r.name
            """)
            results = session.execute(sql, all_params).fetchall()

            # Organizar por meal_type
            recipes_by_meal: Dict[str, List[Dict]] = {mt: [] for mt in meal_types}

            for row in results:
                recipe = {
                    "id": row[0],
                    "name": row[1],
                    "description": row[2],
                    "instructions": row[3],
                    "calories": row[4],
                    "protein": row[5],
                    "carbs": row[6],
                    "fats": row[7],
                    "meal_type": row[8],
                    "prep_time": row[10],
                    "difficulty": row[11],
                    "servings": row[12],
                    "image_url": row[13]
                }

                if row[8] in recipes_by_meal:
                    recipes_by_meal[row[8]].append(recipe)

            logger.info(
                "[V3] Recetas cargadas para dieta '%s': %s",
                db_diet,
                {k: len(v) for k, v in recipes_by_meal.items()}
            )

            return recipes_by_meal

        finally:
            session.close()

    async def get_smart_menu_v3(
        self,
        data: WizardData,
        user_ratings: Optional[Dict[int, str]] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        SISTEMA V3: Selector determinista de recetas verificadas.
        No usa LLM — selecciona mediante scoring multi-factor.
        """
        num_days = data.plan_days if data.plan_days else 7
        meals_per_day = data.meals_per_day if data.meals_per_day else 3

        MEALS_CONFIG = {
            2: ["comida", "cena"],
            3: ["desayuno", "comida", "cena"],
            4: ["desayuno", "comida", "merienda", "cena"],
            5: ["desayuno", "almuerzo", "comida", "merienda", "cena"],
        }
        meals_to_generate = MEALS_CONFIG.get(meals_per_day, MEALS_CONFIG[3])

        logger.info(
            "[V3] Generando menu: %d dias, %d comidas, dieta: %s",
            num_days, meals_per_day, data.diet
        )

        # Expandir exclusiones jerárquicas (cerdo → bacon, panceta, chorizo, etc.)
        expanded_hated = expand_exclusions(data.hated_foods) if data.hated_foods else []

        # Cargar recetas verificadas (SQL-level filtering: diet + hated foods + allergens)
        recipes_by_meal = self._get_verified_recipes(
            diet_type=data.diet or "omnivoro",
            meal_types=meals_to_generate,
            excluded_ingredients=expanded_hated,
            allergens=data.allergens
        )

        # Check we have recipes to work with
        total_recipes = sum(len(v) for v in recipes_by_meal.values())
        if total_recipes == 0:
            logger.error("[V3] No hay recetas disponibles para la dieta: %s", data.diet)
            return None

        # --- DETERMINISTIC SELECTOR (replaces Gemini) ---
        from app.services.recipe_selector import RecipeSelector
        selector = RecipeSelector()
        data_response = selector.generate_menu(recipes_by_meal, data, meals_to_generate, user_ratings=user_ratings)

        if not data_response:
            logger.error("[V3] Selector devolvió None")
            return None

        # Enriquecer con datos completos de las recetas y validar calorías
        all_recipes = {r["id"]: r for recipes in recipes_by_meal.values() for r in recipes}

        for day in data_response.get("menu", []):
            day_total_kcal = 0
            for meal_type in meals_to_generate:
                meal_data = day.get(meal_type)
                if meal_data and "recipe_id" in meal_data:
                    recipe_id = meal_data["recipe_id"]
                    if recipe_id in all_recipes:
                        full_recipe = all_recipes[recipe_id]
                        meal_data["descripcion"] = full_recipe.get("description", "")
                        meal_data["instrucciones"] = full_recipe.get("instructions", "")
                        meal_data["prep_time"] = full_recipe.get("prep_time", 0)
                        if full_recipe.get("image_url"):
                            meal_data["image_url"] = full_recipe["image_url"]

                        if not meal_data.get("justificacion"):
                            meal_data["justificacion"] = full_recipe.get("description", "")
                        porciones_val = float(meal_data.get("porciones", 1))
                        recipe_servings = full_recipe.get("servings", 1) or 1
                        meal_data["macros"] = {
                            "proteinas": round((full_recipe.get("protein", 0) / recipe_servings) * porciones_val),
                            "carbohidratos": round((full_recipe.get("carbs", 0) / recipe_servings) * porciones_val),
                            "grasas": round((full_recipe.get("fats", 0) / recipe_servings) * porciones_val),
                        }
                        instructions_str = full_recipe.get("instructions", "")
                        meal_data["pasos"] = _parse_instructions(instructions_str)

                        # Validar/corregir calorías basándose en porciones (per-serving)
                        porciones = meal_data.get("porciones", 1)
                        kcal_per_serving = (full_recipe.get("calories") or 0) / recipe_servings
                        kcal_calculadas = int(kcal_per_serving * porciones)

                        if abs(meal_data.get("calorias", 0) - kcal_calculadas) > 50:
                            meal_data["calorias"] = kcal_calculadas
                            meal_data["kcal_base"] = int(kcal_per_serving)

                        day_total_kcal += meal_data.get("calorias", kcal_calculadas)

            day["total_kcal_dia"] = day_total_kcal

        # --- POST-PROCESADO: Ajustar porciones para alcanzar calorías objetivo ---
        target_kcal = data.target_calories or 2000
        tolerance_low = target_kcal * 0.92
        main_max_porciones = 3.0 if target_kcal > 3500 else 2.5
        side_max_porciones = 2.5 if target_kcal > 3500 else 2.0
        for _pass in range(2):  # 2 passes: first adjusts broadly, second refines
            for day in data_response.get("menu", []):
                day_total = day.get("total_kcal_dia", 0)
                if day_total < tolerance_low and day_total > 0:
                    factor = target_kcal / day_total
                    main_meals = [mt for mt in meals_to_generate if mt in ("desayuno", "comida", "cena")]
                    adjusted_total = 0
                    for meal_type in meals_to_generate:
                        meal_data = day.get(meal_type)
                        if not meal_data or "recipe_id" not in meal_data:
                            continue
                        recipe_id = meal_data.get("recipe_id")
                        if recipe_id not in all_recipes:
                            adjusted_total += meal_data.get("calorias", 0)
                            continue
                        full_recipe = all_recipes[recipe_id]
                        cal_servings = full_recipe.get("servings", 1) or 1
                        kcal_base = full_recipe.get("calories", 0) / cal_servings
                        if kcal_base <= 0:
                            adjusted_total += meal_data.get("calorias", 0)
                            continue
                        old_porciones = float(meal_data.get("porciones", 1))
                        if meal_type in main_meals:
                            new_porciones = round(old_porciones * factor * 2) / 2
                            new_porciones = max(0.5, min(main_max_porciones, new_porciones))
                        else:
                            new_porciones = round(old_porciones * min(factor, 1.3) * 2) / 2
                            new_porciones = max(0.5, min(side_max_porciones, new_porciones))
                        meal_data["porciones"] = new_porciones
                        new_kcal = int(kcal_base * new_porciones)
                        meal_data["calorias"] = new_kcal
                        meal_data["kcal_base"] = int(kcal_base)
                        meal_data["macros"] = {
                            "proteinas": round((full_recipe.get("protein", 0) / cal_servings) * new_porciones),
                            "carbohidratos": round((full_recipe.get("carbs", 0) / cal_servings) * new_porciones),
                            "grasas": round((full_recipe.get("fats", 0) / cal_servings) * new_porciones),
                        }
                        adjusted_total += new_kcal
                    day["total_kcal_dia"] = adjusted_total
                    logger.info(
                        "[V3 KCAL-FIX] Pass %d, Día %s: %d → %d kcal (target: %d)",
                        _pass + 1, day.get("dia", "?"), day_total, adjusted_total, target_kcal
                    )

        logger.info("[V3] Menu generado exitosamente con %d días", len(data_response.get("menu", [])))
        return data_response

    async def get_recipe_details(self, dish_name: str, original_ingredients: list = None, porciones: float = 1.0):
        """
        Devuelve detalles de receta desde la DB. 100% determinista, sin LLM.
        Todas las recetas verificadas tienen instructions en DB.
        Escala macros e ingredientes según porciones / servings.
        """
        session = SessionLocal()
        try:
            db_recipe = session.execute(
                text("SELECT id, instructions, calories, protein, carbs, fats, prep_time_minutes, servings FROM recipes WHERE LOWER(name) = :name"),
                {"name": dish_name.lower().strip()}
            ).fetchone()

            if not db_recipe:
                logger.warning("[recipe_details] Recipe not found: '%s'", dish_name)
                return {}

            recipe_servings = db_recipe[7] or 1
            scale = porciones / recipe_servings

            # Build ingredients from recipe_ingredients
            raw_ings = session.execute(
                text("SELECT name, quantity, unit FROM recipe_ingredients WHERE recipe_id = :rid"),
                {"rid": db_recipe[0]}
            ).fetchall()

            ingredientes = []
            for row in raw_ings:
                qty = row[1] or 0
                unit = row[2] or "g"
                scaled_qty = round(qty * scale, 1)
                ingredientes.append(f"{scaled_qty:g}{unit} {row[0]}")

            # Parse instructions into steps
            instructions_text = db_recipe[1] or ""
            pasos = _parse_instructions(instructions_text)

            prep_time = db_recipe[6] or 25
            logger.info("[recipe_details] Found '%s' (%d steps, %d ingredients, scale=%.2f)", dish_name, len(pasos), len(ingredientes), scale)
            return {
                "ingredientes": ingredientes,
                "pasos": pasos,
                "tiempo": f"{prep_time} min",
                "macros": {
                    "proteinas": round((db_recipe[3] or 0) * scale),
                    "carbohidratos": round((db_recipe[4] or 0) * scale),
                    "grasas": round((db_recipe[5] or 0) * scale),
                    "calorias": round((db_recipe[2] or 0) * scale),
                }
            }
        except Exception as e:
            logger.error("[recipe_details] DB error for '%s': %s", dish_name, e)
            return {}
        finally:
            session.close()

    # ============================================================
    # REGENERACIÓN DETERMINISTA (sin Gemini)
    # ============================================================
    async def change_dish_deterministic(
        self,
        current_dish: str,
        diet_type: str,
        target_calories: int,
        user_allergens: list = None,
        hated_foods: list = None,
        meal_type: str = None,
        excluded_recipe_ids: list = None,
    ) -> Dict[str, Any]:
        """
        Reemplaza un plato seleccionando una receta verificada de la DB.
        Sin LLM: <50ms, 0€ coste, 0 hallucinations, 100% determinista.
        """
        if not meal_type:
            meal_type = "comida"

        # 1. Cargar recetas filtradas por dieta/alérgenos/hated
        expanded_hated = expand_exclusions(hated_foods) if hated_foods else []
        recipes_by_meal = self._get_verified_recipes(
            diet_type=diet_type,
            meal_types=[meal_type],
            excluded_ingredients=expanded_hated,
            allergens=user_allergens,
        )
        candidates = recipes_by_meal.get(meal_type, [])

        # 2. Excluir recetas ya en el plan + la actual
        excluded_ids = set(excluded_recipe_ids or [])
        candidates = [r for r in candidates if r["id"] not in excluded_ids]
        # Also exclude by name match (for Gemini-generated dishes without recipe_id)
        current_lower = (current_dish or "").lower().strip()
        candidates = [r for r in candidates if r["name"].lower() != current_lower]

        if not candidates:
            logger.warning("[deterministic] No candidates for %s/%s after exclusions", meal_type, diet_type)
            return {
                "new_dish_name": "Sin alternativas disponibles",
                "descripcion": "No hay más recetas disponibles para este tipo de comida con tus filtros.",
                "calories": target_calories,
                "macros": {"proteinas": 0, "carbohidratos": 0, "grasas": 0},
                "ingredientes": [],
                "ingredientes_v2": [],
                "products_map": {},
                "justificacion": "Pool de recetas agotado",
            }

        # 3. Score candidates by calorie fit + random jitter for variety
        import random
        target = target_calories or 500
        scored = []
        for r in candidates:
            r_servings = r.get("servings", 1) or 1
            kcal_per_serving = (r["calories"] or 1) / r_servings
            cal_diff = abs(kcal_per_serving - target) / max(target, 1)
            cal_score = max(0, 30 - cal_diff * 60)  # 0-30 pts
            jitter = random.uniform(0, 8)  # randomness for variety
            scored.append((cal_score + jitter, r))
        scored.sort(key=lambda x: x[0], reverse=True)
        best = scored[0][1]

        # 4. Calculate portions to match target calories
        best_servings = best.get("servings", 1) or 1
        base_cal = (best["calories"] or 400) / best_servings
        portion = round(target / base_cal * 2) / 2  # snap to 0.5 steps
        portion = max(0.5, min(portion, 2.5))  # clamp
        final_calories = int(base_cal * portion)

        # 5. Build ingredients from DB (recipe_ingredients + ingredient_product_map)
        session = SessionLocal()
        try:
            ingredients_sql = text("""
                SELECT ri.name, ri.quantity, ri.unit
                FROM recipe_ingredients ri
                WHERE ri.recipe_id = :recipe_id
            """)
            raw_ings = session.execute(ingredients_sql, {"recipe_id": best["id"]}).fetchall()

            ingredientes_display = []
            ingredientes_v2 = []
            products_map = {}

            for row in raw_ings:
                ing_name, base_qty, unit = row[0], row[1], row[2]
                adj_qty = round(base_qty * portion, 1) if base_qty else 0

                # Clean ingredient name for display
                display_name = ing_name.replace("_", " ").title()
                # Remove category prefix (e.g. "Verdura Cebolla" → "Cebolla")
                prefixes = ("Carne ", "Pescado ", "Verdura ", "Fruta ", "Cereal ", "Lacteo ",
                            "Legumbre ", "Aceite ", "Especia ", "Frutos Secos ", "Marisco ",
                            "Embutido ", "Salsa ", "Endulzante ")
                for p in prefixes:
                    if display_name.startswith(p):
                        display_name = display_name[len(p):]
                        break

                ingredientes_display.append({"n": display_name, "q": f"{adj_qty}{unit}"})

                # Find cheapest mapped product for this ingredient
                product_sql = text("""
                    SELECT p.id, p.product_name, p.canonical_name, p.price,
                           p.base_amount, p.base_unit, p.supermarket, p.is_perishable
                    FROM ingredients i
                    JOIN ingredient_product_map ipm ON ipm.ingredient_id = i.id
                    JOIN products p ON p.id = ipm.product_id
                    WHERE i.canonical_key = :canonical_key
                    ORDER BY p.pum_calculated ASC NULLS LAST, p.price ASC
                    LIMIT 1
                """)
                product_row = session.execute(product_sql, {"canonical_key": ing_name}).fetchone()

                if product_row:
                    pid = product_row[0]
                    ingredientes_v2.append({
                        "product_id": pid,
                        "qty_used": adj_qty,
                        "unit": unit,
                    })
                    products_map[str(pid)] = {
                        "name": product_row[1],
                        "canonical_name": product_row[2],
                        "price": float(product_row[3]) if product_row[3] else 0,
                        "amount": float(product_row[4]) if product_row[4] else 0,
                        "unit": product_row[5] or "g",
                        "supermarket": product_row[6] or "",
                        "is_perishable": bool(product_row[7]),
                    }

            # 6. Build result in same format as change_dish_v2
            result = {
                "new_dish_name": best["name"],
                "descripcion": best.get("description") or f"{best['name']} — receta verificada.",
                "calories": final_calories,
                "macros": {
                    "proteinas": round(((best.get("protein") or 0) / best_servings) * portion, 1),
                    "carbohidratos": round(((best.get("carbs") or 0) / best_servings) * portion, 1),
                    "grasas": round(((best.get("fats") or 0) / best_servings) * portion, 1),
                },
                "ingredientes": ingredientes_display,
                "ingredientes_v2": ingredientes_v2,
                "justificacion": f"Seleccionado por scoring determinista (porción {portion}x)",
                "products_map": products_map,
                "recipe_id": best["id"],
                "image_url": best.get("image_url"),
            }

            logger.info(
                "[deterministic] Plato regenerado: %s (%d kcal, %d ingredientes, porción %.1fx)",
                result["new_dish_name"], final_calories, len(ingredientes_v2), portion
            )
            return result

        finally:
            session.close()