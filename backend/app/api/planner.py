import json
import logging
import sys
import traceback
from datetime import date, timedelta

logger = logging.getLogger("NutriPlanner.Planner")

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.auth import get_current_user, get_optional_user, rate_limiter
from app.db import models
from app.db.database import IS_POSTGRES, get_db
from app.db.models import (
    DailyPlan,
    DailyTracking,
    FamilyMember,
    Meal,
    PlanHistory,
    Product,
    Recipe,
    RecipeIngredient,
    ShoppingHistory,
    UserActivePlan,
    UserRecipeRating,
)
from app.schemas import FamilyMemberCreate, RateRecipeRequest, RecalculateShoppingRequest, RecipeRequest, RegenerateDishRequest, WizardData
from app.services.aggregator import ShoppingListAggregator
from app.services.comparator import comparator
from app.services.nutritionist import Nutritionist
from app.services.shopping_service import ShoppingService

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

router = APIRouter()
nutritionist = Nutritionist()

def _parse_diets(raw):
    """Safely parse suitable_diets which may be a JSON string, list, or None."""
    if not raw:
        return []
    if isinstance(raw, list):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return parsed
        except (json.JSONDecodeError, TypeError):
            pass
        return []
    return []


# ==========================================
# HELPERS DE PERSISTENCIA
# ==========================================

def _get_or_create_recipe(db: Session, name: str, data: dict) -> Recipe:
    """
    Busca una receta por nombre. Si no existe, la crea con los datos proporcionados.
    (Embeddings deshabilitados para reducir RAM).
    """
    recipe = (
        db.query(Recipe)
        .filter(func.lower(Recipe.name) == name.lower())
        .first()
    )
    
    if not recipe:
        instr_list = data.get("pasos", [])
        instructions_text = (
            "\n".join(instr_list) if isinstance(instr_list, list) else str(instr_list)
        )

        macros = data.get("macros", {})

        recipe = Recipe(
            name=name,
            description=data.get("justificacion", ""),
            instructions=instructions_text,
            calories=data.get("calorias", 0),
            protein=macros.get("proteinas", 0),
            carbs=macros.get("carbohidratos", 0),
            fats=macros.get("grasas", 0),
        )
        db.add(recipe)
        db.commit()
        db.refresh(recipe)
        
        shopper = ShoppingService(db)
        raw_ings = data.get("ingredientes", [])

        for raw in raw_ings:
            parsed = shopper._clean_ingredient_name(raw)
            ri = RecipeIngredient(
                recipe_id=recipe.id,
                name=parsed["display_name"],
                quantity=parsed["quantity"],
                unit=parsed["unit"],
            )
            db.add(ri)
        db.commit()

    return recipe



# ==========================================
# ENDPOINTS
# ==========================================

@router.get("/active-plan")
async def get_active_plan(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Devuelve el plan activo del usuario desde la DB.
    Usado para restaurar el estado tras re-login sin perder datos.
    """
    cached = db.query(UserActivePlan).filter(
        UserActivePlan.user_id == current_user.id
    ).first()

    if not cached:
        return {"plan": None}

    return {
        "plan": cached.plan_data,
        "wizard_data": cached.wizard_data,
        "tracking_data": cached.tracking_data,
        "updated_at": cached.updated_at.isoformat() if cached.updated_at else None,
    }


@router.put("/tracking")
async def save_tracking(
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Guarda el estado de tracking (comidas consumidas, macros) en la DB.
    Se llama desde el frontend cada vez que el usuario marca una comida.
    """
    body = await request.json()
    cached = db.query(UserActivePlan).filter(
        UserActivePlan.user_id == current_user.id
    ).first()

    if not cached:
        return {"ok": False, "message": "No active plan found"}

    cached.tracking_data = body
    db.commit()
    return {"ok": True}


@router.put("/daily-tracking")
async def save_daily_tracking(
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Persiste tracking diario en tabla daily_tracking (histórico por día).
    Crea o actualiza el registro del día actual.
    """
    body = await request.json()
    today = date.today()

    record = db.query(DailyTracking).filter(
        DailyTracking.user_id == current_user.id,
        DailyTracking.date == today,
    ).first()

    if not record:
        record = DailyTracking(user_id=current_user.id, date=today)
        db.add(record)

    record.calories_consumed = body.get("calories_consumed", 0)
    record.water_intake_ml = body.get("water_intake_ml", 0)
    record.meals_logged = body.get("meals_logged", {})
    record.meal_details = body.get("meal_details", {})
    if body.get("weight_log_kg"):
        record.weight_log_kg = body["weight_log_kg"]

    db.commit()
    return {"ok": True}


@router.get("/daily-tracking")
async def get_daily_tracking(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Devuelve el tracking del día actual."""
    today = date.today()
    record = db.query(DailyTracking).filter(
        DailyTracking.user_id == current_user.id,
        DailyTracking.date == today,
    ).first()

    if not record:
        return {"tracking": None}

    return {
        "tracking": {
            "calories_consumed": record.calories_consumed,
            "water_intake_ml": record.water_intake_ml,
            "meals_logged": record.meals_logged or {},
            "meal_details": record.meal_details or {},
            "weight_log_kg": record.weight_log_kg,
            "date": today.isoformat(),
        }
    }


@router.put("/adopt-plan")
async def adopt_plan(
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Adopta un plan generado como guest y lo persiste en DB.
    Se llama desde el frontend tras registrarse si el guest tenia un plan en localStorage.
    """
    # Guard: reject payloads > 1 MB
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > 1_000_000:
        raise HTTPException(status_code=413, detail="Payload too large")

    body = await request.json()
    plan_data = body.get("plan_data")
    wizard_data = body.get("wizard_data")

    if not plan_data or not isinstance(plan_data, dict):
        return {"ok": False, "message": "No valid plan data provided"}

    try:
        existing = db.query(UserActivePlan).filter(
            UserActivePlan.user_id == current_user.id
        ).first()

        if existing:
            existing.plan_data = plan_data
            existing.wizard_data = wizard_data
        else:
            db.add(UserActivePlan(
                user_id=current_user.id,
                plan_data=plan_data,
                wizard_data=wizard_data,
            ))
        db.commit()
        logger.info(f"[adopt-plan] Plan adoptado para user {current_user.id}")
        return {"ok": True}
    except Exception as e:
        db.rollback()
        logger.error(f"[adopt-plan] Error: {e}")
        raise HTTPException(status_code=500, detail="Error saving plan")


@router.post("/regenerate-dish")
async def regenerate_dish(
    payload: RegenerateDishRequest,
    req: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_optional_user),
):
    """
    Regenera un plato usando selección determinista de recetas verificadas.
    Sin LLM: <50ms, 0€ coste, 0 hallucinations.
    """
    # Rate limit: max 10 regenerations per minute per IP
    client_ip = req.client.host if req.client else "unknown"
    regen_key = f"regen_{client_ip}"
    if rate_limiter.is_rate_limited(regen_key, max_attempts=10, window_seconds=60):
        raise HTTPException(
            status_code=429,
            detail="Demasiadas regeneraciones. Espera un minuto.",
        )
    rate_limiter.record_attempt(regen_key)

    logger.info("[regenerate] Plato: %s, meal_type: %s", payload.current_dish, payload.meal_type)
    try:
        new_dish_data = await nutritionist.change_dish_deterministic(
            current_dish=payload.current_dish,
            diet_type=payload.diet_type,
            target_calories=payload.calories,
            user_allergens=payload.allergens,
            hated_foods=payload.hated_foods,
            meal_type=payload.meal_type,
            excluded_recipe_ids=payload.excluded_recipe_ids,
        )

        if not new_dish_data or new_dish_data.get("new_dish_name") == "Sin alternativas disponibles":
            raise HTTPException(
                status_code=404,
                detail="No se encontró una alternativa válida con tus filtros actuales",
            )

        response_data = {
            "nombre": new_dish_data.get("new_dish_name", "Plato Alternativo"),
            "calorias": new_dish_data.get("calories", payload.calories),
            "macros": new_dish_data.get(
                "macros",
                {"proteinas": 0, "carbohidratos": 0, "grasas": 0},
            ),
            "ingredientes": new_dish_data.get("ingredientes", []),
            "ingredientes_v2": new_dish_data.get("ingredientes_v2", []),
            "justificacion": new_dish_data.get("justificacion", "Receta verificada"),
            "products_map": new_dish_data.get("products_map", {}),
            "descripcion": new_dish_data.get("descripcion", ""),
            "recipe_id": new_dish_data.get("recipe_id"),
            "image_url": new_dish_data.get("image_url"),
        }
        logger.info(
            "[regenerate] OK: %s (%d kcal, %d ings)",
            response_data["nombre"], response_data["calorias"],
            len(response_data["ingredientes_v2"]),
        )

        return response_data

    except HTTPException:
        raise
    except Exception as e:
        logger.error("[regenerate] Error: %s", e)
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail="Error regenerando el plato",
        )


@router.post("/recalculate-shopping-v2")
async def recalculate_shopping_v2(
    payload: RecalculateShoppingRequest,
    db: Session = Depends(get_db),
    _user=Depends(get_optional_user),
):
    """
    [V2] Recalcula la lista de compra despues de regenerar platos.
    Recibe el menu completo y devuelve shopping_list + comparison actualizados.
    """
    try:
        menu = payload.menu
        products_map = payload.products_map

        if not menu:
            raise HTTPException(status_code=400, detail="Menu vacío")

        logger.info("[V2] Recalculando lista de compra para %d días...", len(menu))

        if not products_map:
            # Batch-load all product IDs in ONE query instead of N+1
            all_pids = set()
            for day in menu:
                for meal_key in ["desayuno", "almuerzo", "comida", "merienda", "cena"]:
                    meal = day.get(meal_key, {})
                    for ing in meal.get("ingredientes_v2", []):
                        pid = ing.get("product_id")
                        if pid:
                            all_pids.add(pid)

            if all_pids:
                db_products = (
                    db.query(Product)
                    .filter(Product.id.in_(all_pids))
                    .all()
                )
                products_map = {
                    str(p.id): {
                        "name": p.product_name,
                        "canonical_name": p.canonical_name,
                        "price": float(p.price or 0),
                        "amount": float(p.base_amount or 1),
                        "unit": p.base_unit or "ud",
                        "is_perishable": bool(p.is_perishable),
                    }
                    for p in db_products
                }

        agg = ShoppingListAggregator()
        shopping_list = agg.aggregate_weekly_plan_v2(menu, products_map)

        comparison = await comparator.bulk_compare_v2(shopping_list)

        logger.info("[V2] Lista recalculada: %d productos", len(shopping_list))

        return {
            "shopping_list": shopping_list,
            "comparison": comparison,
            "products_map": products_map,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("[ERROR] Recalculate V2: %s", e)
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail="Error recalculando la lista de compra V2",
        )


@router.post("/recalculate-shopping-v3")
async def recalculate_shopping_v3(
    payload: RecalculateShoppingRequest,
    db: Session = Depends(get_db),
    _user=Depends(get_optional_user),
):
    """
    [V3] Recalcula la lista de compra tras regenerar platos.
    Soporta menú híbrido: platos originales (recipe_id) + regenerados (ingredientes_v2).
    Usa el mismo flujo de agregación + comparación V1 que generate-plan-v3.
    """
    try:
        menu = payload.menu
        if not menu:
            raise HTTPException(status_code=400, detail="Menu vacío")

        logger.info("[V3 RECALC] Recalculando lista para %d días...", len(menu))

        aggregated_items = _aggregate_v3_ingredients(db, menu)

        # [INVENTARIO] Marcar items de la despensa
        db_pantry_list = []
        pantry_names = []
        if _user:
            from app.db.models import PantryItem as PantryItemModel
            db_pantry_list = (
                db.query(PantryItemModel)
                .filter(PantryItemModel.user_id == _user.id)
                .all()
            )
            pantry_names = [{"name": p.name} for p in db_pantry_list]
        _mark_pantry_coverage(aggregated_items, pantry_names, db_pantry_list)

        comparison = await comparator.bulk_compare(aggregated_items)

        items_to_buy = [it for it in aggregated_items if not it.get("excluded")]
        pantry_excluded = [it for it in aggregated_items if it.get("excluded")]
        logger.info("[V3 RECALC] Lista recalculada: %d ingredientes (%d excluidos por despensa)", len(items_to_buy), len(pantry_excluded))
        return {
            "shopping_list": items_to_buy,
            "pantry_excluded": pantry_excluded,
            "comparison": comparison,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("[ERROR] Recalculate V3: %s", e)
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail="Error recalculando la lista de compra V3",
        )


@router.post("/recipe-details")
async def get_recipe_details_endpoint(
    payload: RecipeRequest,
    req: Request,
    db: Session = Depends(get_db),
):
    """
    Obtiene detalles de una receta.
    Acepta original_ingredients para mantener coherencia menú-receta.
    Usa caché DB y guarda recetas nuevas.
    """
    # Rate limit: max 30 recipe detail requests per minute per IP
    client_ip = req.client.host if req.client else "unknown"
    recipe_key = f"recipe_{client_ip}"
    if rate_limiter.is_rate_limited(recipe_key, max_attempts=30, window_seconds=60):
        raise HTTPException(
            status_code=429,
            detail="Demasiadas consultas de recetas. Espera un minuto.",
        )
    rate_limiter.record_attempt(recipe_key)

    dish_name = payload.dish_name
    raw_ingredients = payload.original_ingredients

    original_ingredients = []
    if raw_ingredients:
        for ing in raw_ingredients:
            if isinstance(ing, str):
                original_ingredients.append(ing)
            elif isinstance(ing, dict):
                # V1 format: {"n": "Pollo Pechuga", "q": "200g"}
                if "n" in ing:
                    text = f"{ing.get('q', '')} {ing.get('n', '')}".strip()
                    if text:
                        original_ingredients.append(text)
                    continue

                # V2 format: {"product_id": 123, "qty_used": 200, "unit": "g"}
                product_id = ing.get("product_id")
                qty = ing.get("qty_used", "")
                unit = ing.get("unit", "g")

                if product_id:
                    product = (
                        db.query(Product)
                        .filter(Product.id == product_id)
                        .first()
                    )
                    if product:
                        name = product.product_name or f"Producto {product_id}"
                        original_ingredients.append(f"{qty}{unit} {name}")
                    else:
                        original_ingredients.append(
                            f"{qty}{unit} Producto {product_id}"
                        )
            else:
                original_ingredients.append(str(ing))

    logger.info("Buscando detalles para: %s", dish_name)
    if original_ingredients:
        logger.info("Con ingredientes normalizados: %s...", original_ingredients[:3])

    if not dish_name:
        raise HTTPException(status_code=400, detail="dish_name es requerido")

    try:
        recipe = None

        if not original_ingredients:
            recipe = (
                db.query(Recipe)
                .filter(func.lower(Recipe.name) == dish_name.lower())
                .first()
            )

            if recipe and recipe.instructions and len(recipe.instructions) > 10:
                logger.info("[CACHE] Receta encontrada en DB: %s", recipe.name)
                return {
                    "ingredientes": [ri.name for ri in recipe.ingredients],
                    "pasos": recipe.instructions.split("\n"),
                    "tiempo": "15-30 min",
                    "calorias": recipe.calories,
                }

        details = await nutritionist.get_recipe_details(
            dish_name,
            original_ingredients=original_ingredients,
            porciones=payload.porciones or 1.0,
        )

        if isinstance(details, dict):
            if recipe:
                instr = details.get("pasos", [])
                recipe.instructions = (
                    "\n".join(instr) if isinstance(instr, list) else str(instr)
                )
                db.commit()
            else:
                dummy_data = {
                    "pasos": details.get("pasos", []),
                    "macros": details.get("macros", {}),
                    "calorias": details.get("calorias", 0),
                    "justificacion": details.get("justificacion", ""),
                    "ingredientes": details.get("ingredientes", []),
                }
                _get_or_create_recipe(db, dish_name, dummy_data)

        return details

    except Exception as e:
        logger.error("[ERROR] Recipe details: %s", e)
        raise HTTPException(
            status_code=500,
            detail="Error obteniendo detalles de la receta",
        )


# ==========================================
# ENDPOINTS V2 - SISTEMA CON PRODUCT_IDS
# ==========================================
# ENDPOINTS V3 - SISTEMA CON RECETAS VERIFICADAS
# ==========================================

def _generate_meal_prep_guide(menu: list) -> dict:
    """
    Genera una guía de batch cooking analizando el plan semanal.
    Agrupa recetas que comparten bases y sugiere sesiones de cocina.
    Incluye datos completos de cada receta para navegación y workflow.
    """
    num_days = len(menu)
    mid = (num_days + 1) // 2  # Split roughly in half

    session1_meals = []
    session2_meals = []
    all_recipes = {}  # Track unique recipes
    # Track shared ingredients across recipes
    ingredient_usage = {}  # ingredient_name -> [recipe_names]

    for i, day in enumerate(menu):
        for meal_type in ["desayuno", "almuerzo", "comida", "merienda", "cena"]:
            meal = day.get(meal_type)
            if not meal:
                continue
            name = meal.get("nombre", "")
            recipe_id = meal.get("recipe_id")
            key = recipe_id or name

            if key not in all_recipes:
                all_recipes[key] = {
                    "nombre": name,
                    "recipe_id": recipe_id,
                    "dias": [],
                    "meal_type": meal_type,
                    "calorias": meal.get("calorias", 0),
                    "ingredientes": meal.get("ingredientes", []),
                    "dish_data": meal,  # Full data for frontend navigation
                }
            all_recipes[key]["dias"].append(i + 1)

            # Track ingredient sharing
            for ing in meal.get("ingredientes", []):
                ing_name = ing.get("n", "") if isinstance(ing, dict) else str(ing)
                if ing_name:
                    ingredient_usage.setdefault(ing_name, set()).add(name)

    # Find shared ingredients (used in 2+ recipes)
    shared_ingredients = [
        {"nombre": ing, "recetas": list(recipes)}
        for ing, recipes in ingredient_usage.items()
        if len(recipes) >= 2
    ]
    shared_ingredients.sort(key=lambda x: -len(x["recetas"]))

    # Split recipes into 2 sessions based on which days they serve
    for key, recipe in all_recipes.items():
        first_day = recipe["dias"][0]
        if first_day <= mid:
            session1_meals.append(recipe)
        else:
            session2_meals.append(recipe)

    # Build guide with enriched data
    def format_session(meals):
        items = []
        for m in meals:
            days_str = ", ".join([f"Día {d}" for d in m["dias"]])
            # Determine storage advice based on meal type and days
            max_day = max(m["dias"])
            min_day = min(m["dias"])
            if max_day - min_day >= 4:
                storage = "Congela porciones de día " + str(min_day + 3) + " en adelante"
            elif max_day - min_day >= 2:
                storage = "Conservar en nevera (tuppers herméticos)"
            else:
                storage = "Consumir en 1-2 días"

            items.append({
                "nombre": m["nombre"],
                "recipe_id": m.get("recipe_id"),
                "dias": days_str,
                "dias_list": m["dias"],
                "repeticiones": len(m["dias"]),
                "meal_type": m["meal_type"],
                "calorias": m.get("calorias", 0),
                "ingredientes": m.get("ingredientes", []),
                "storage": storage,
                "dish_data": m.get("dish_data"),
            })
        # Sort: most repeated first, then by meal order
        meal_order = {"desayuno": 0, "almuerzo": 1, "comida": 2, "merienda": 3, "cena": 4}
        items.sort(key=lambda x: (-x["repeticiones"], meal_order.get(x["meal_type"], 5)))
        return items

    guide = {
        "sesiones": [
            {
                "titulo": "Sesión 1 (Domingo)",
                "descripcion": f"Prepara las comidas de los días 1-{mid}",
                "recetas": format_session(session1_meals),
                "num_recetas": len(session1_meals),
            },
            {
                "titulo": "Sesión 2 (Miércoles)",
                "descripcion": f"Prepara las comidas de los días {mid + 1}-{num_days}",
                "recetas": format_session(session2_meals),
                "num_recetas": len(session2_meals),
            },
        ],
        "shared_ingredients": shared_ingredients[:8],
        "consejos": [
            "Cocina las proteínas (pollo, carne) en lote y divídelas en porciones",
            "Prepara las bases (arroz, quinoa, pasta) para varios días",
            "Guarda en recipientes herméticos etiquetados con el día",
            "Las ensaladas y verduras crudas: prepáralas el mismo día",
            "Congela lo que vayas a comer después del día 4",
        ],
    }

    return guide


def _mark_pantry_coverage(
    shopping_list: list,
    pantry_items: list,
    db_pantry: list = None,
) -> None:
    """
    Mark each shopping list item with pantry coverage info (mutates in-place).

    Adds to each item:
      - in_pantry: bool (true if user has this ingredient)
      - pantry_covers: float 0.0-1.0 (fraction covered by pantry stock)
      - needed_qty: float (remaining quantity to buy, if partial)
      - needed_unit: str (unit of needed_qty)

    Uses the same PANTRY_CANONICAL_MAP as recipe scoring for consistency.
    For authenticated users, also checks DB quantities for proportional coverage.
    """
    from app.services.recipe_selector import RecipeSelector

    # Build canonical prefixes from pantry display names
    prefixes = []
    for item in pantry_items:
        pname = item.get("name", "") if isinstance(item, dict) else (item or "")
        pname = pname.lower().strip()
        if not pname:
            continue
        mapped = RecipeSelector.PANTRY_CANONICAL_MAP.get(pname)
        # Normalize pantry name for direct matching fallback
        pname_norm = (pname.replace(" ", "_")
                      .replace("á", "a").replace("é", "e")
                      .replace("í", "i").replace("ó", "o").replace("ú", "u"))
        if mapped:
            prefixes.extend([(p, pname) for p in mapped])
            # Also add raw pantry name as fallback prefix (handles products
            # whose canonical_name lacks the category prefix, e.g.
            # "pimienta negra molida" instead of "especia_pimienta_negra_molida")
            prefixes.append((pname_norm, pname))
            if pname_norm != pname:
                prefixes.append((pname, pname))
        else:
            prefixes.append((pname_norm, pname))
            if pname_norm.endswith("s"):
                prefixes.append((pname_norm[:-1], pname))

    # Build DB pantry lookup: name_lower -> {quantity, unit}
    db_stock = {}
    for pi in (db_pantry or []):
        db_stock[pi.name.lower().strip()] = {
            "quantity": pi.quantity or 0,
            "unit": (pi.unit or "").lower().strip(),
        }

    for shop_item in shopping_list:
        canonical = (shop_item.get("canonical_name") or "").lower()
        matched_pantry_name = None

        for prefix, pname in prefixes:
            # Normalize both sides (some canonical_names use spaces, others underscores)
            canon_n = canonical.replace("_", " ")
            prefix_n = prefix.replace("_", " ")
            if (canonical.startswith(prefix) or canonical == prefix
                    or canon_n.startswith(prefix_n) or canon_n == prefix_n):
                matched_pantry_name = pname
                break

        if not matched_pantry_name:
            shop_item["in_pantry"] = False
            continue

        shop_item["in_pantry"] = True
        shop_item["pantry_covers"] = 1.0  # default: fully covered
        shop_item["excluded"] = True  # will be set to False if partially covered

        # Check quantity coverage from DB stock
        stock = db_stock.get(matched_pantry_name)
        if not stock or stock["quantity"] <= 0:
            # User has item in pantry list but no tracked quantity -> assume covered
            continue

        needed_qty = shop_item.get("total_qty", 0)
        needed_unit = (shop_item.get("unit") or "").lower()
        stock_unit = stock["unit"]

        # Only compare if units are compatible
        if needed_unit and stock_unit and needed_unit == stock_unit:
            if stock["quantity"] >= needed_qty:
                shop_item["pantry_covers"] = 1.0
            else:
                shop_item["pantry_covers"] = round(stock["quantity"] / needed_qty, 2) if needed_qty > 0 else 1.0
                remaining = round(needed_qty - stock["quantity"], 1)
                shop_item["needed_qty"] = remaining
                shop_item["needed_unit"] = needed_unit
                shop_item["excluded"] = False  # partially covered, still need to buy
        elif not stock_unit or stock_unit in ("u", "ud"):
            # Stock in units (e.g. "12 ud" of eggs), can't compare with grams
            # Assume covered (user said they have it)
            pass


def _aggregate_v3_ingredients(db: Session, menu: list) -> list:
    """
    Agrega ingredientes de todas las recetas del menú V3.
    Soporta mezcla de platos originales (con recipe_id) y regenerados (con ingredientes_v2).
    Devuelve lista en formato compatible con comparator.bulk_compare().
    """
    from collections import defaultdict

    # Consolidation map: single source of truth in aggregator.py
    from app.services.aggregator import ShoppingListAggregator
    INGREDIENT_CONSOLIDATION = ShoppingListAggregator.CONSOLIDATION_MAP

    aggregated = defaultdict(lambda: {"quantity": 0.0, "unit": ""})

    from app.services.unit_normalizer import unit_normalizer

    meal_types = ["desayuno", "almuerzo", "comida", "merienda", "cena"]

    # --- PASS 1: Platos originales con recipe_id (lectura desde DB) ---
    recipe_portions = {}  # recipe_id -> list of porciones
    for day in menu:
        for mt in meal_types:
            md = day.get(mt)
            if md and "recipe_id" in md:
                rid = md["recipe_id"]
                recipe_portions.setdefault(rid, []).append(float(md.get("porciones", 1)))

    all_ings = db.query(RecipeIngredient).filter(
        RecipeIngredient.recipe_id.in_(recipe_portions.keys())
    ).all() if recipe_portions else []

    ings_by_recipe = defaultdict(list)
    for ing in all_ings:
        ings_by_recipe[ing.recipe_id].append(ing)

    # Cargar servings para normalizar cantidades a 1 persona
    recipe_servings_map = {}
    if recipe_portions:
        servings_rows = db.query(Recipe.id, Recipe.servings).filter(
            Recipe.id.in_(recipe_portions.keys())
        ).all()
        recipe_servings_map = {r.id: (r.servings or 1) for r in servings_rows}

    for recipe_id, portions_list in recipe_portions.items():
        servings = recipe_servings_map.get(recipe_id, 1)
        for porciones in portions_list:
            for ing in ings_by_recipe.get(recipe_id, []):
                key = ing.name.lower().strip()
                key = INGREDIENT_CONSOLIDATION.get(key, key)

                qty = ((ing.quantity or 0) / servings) * porciones
                unit = ing.unit or ""
                # Normalize "u" → "ud" (recipes use "u", rest of system uses "ud")
                if unit.lower() == "u":
                    unit = "ud"

                existing_unit = aggregated[key]["unit"]
                if existing_unit and unit and existing_unit != unit:
                    converted_qty, converted_unit = unit_normalizer.convert_between(
                        qty, unit, existing_unit, key
                    )
                    if converted_unit == existing_unit:
                        qty = converted_qty
                        unit = existing_unit
                    else:
                        # Conversion failed — prefer weight/volume over "ud"
                        if existing_unit in ("g", "ml") and unit == "ud":
                            # Skip: can't convert ud→g without unit_weight_g
                            logger.warning("Skipping %s ud of '%s' (no weight), keeping grams", qty, key)
                            continue
                        elif unit in ("g", "ml") and existing_unit == "ud":
                            # Switch to grams — more precise
                            aggregated[key]["unit"] = unit
                            # Convert existing ud quantity to a rough gram estimate
                            existing_qty = aggregated[key]["quantity"]
                            aggregated[key]["quantity"] = 0
                            logger.warning("Switching '%s' from ud to %s (had %s ud)", key, unit, existing_qty)
                        else:
                            logger.warning("Mixed units for '%s': %s vs %s", key, existing_unit, unit)

                aggregated[key]["quantity"] += qty
                if unit:
                    aggregated[key]["unit"] = unit

    # --- PASS 2: Platos regenerados con ingredientes_v2 (sin recipe_id) ---
    regen_product_ids = set()
    for day in menu:
        for mt in meal_types:
            md = day.get(mt)
            if md and "recipe_id" not in md and md.get("ingredientes_v2"):
                for ing in md["ingredientes_v2"]:
                    pid = ing.get("product_id")
                    if pid:
                        regen_product_ids.add(int(pid))

    if regen_product_ids:
        regen_products = db.query(Product).filter(
            Product.id.in_(regen_product_ids)
        ).all()
        pid_to_canonical = {p.id: (p.canonical_name or "").lower() for p in regen_products}

        for day in menu:
            for mt in meal_types:
                md = day.get(mt)
                if md and "recipe_id" not in md and md.get("ingredientes_v2"):
                    for ing in md["ingredientes_v2"]:
                        pid = ing.get("product_id")
                        if not pid:
                            continue
                        canonical = pid_to_canonical.get(int(pid), "")
                        if not canonical:
                            logger.warning("[V3 REGEN] product_id %s sin canonical_name", pid)
                            continue

                        key = INGREDIENT_CONSOLIDATION.get(canonical, canonical)
                        qty = float(ing.get("qty_used", 0))
                        unit = ing.get("unit", "g")

                        existing_unit = aggregated[key]["unit"]
                        if existing_unit and unit and existing_unit != unit:
                            converted_qty, converted_unit = unit_normalizer.convert_between(
                                qty, unit, existing_unit, key
                            )
                            if converted_unit == existing_unit:
                                qty = converted_qty
                                unit = existing_unit
                            else:
                                logger.warning("Mixed units for '%s': %s vs %s", key, existing_unit, unit)

                        aggregated[key]["quantity"] += qty
                        if unit:
                            aggregated[key]["unit"] = unit

        logger.info("[V3] %d productos de platos regenerados integrados", len(regen_product_ids))

    # Normalizar unidades a base (g/ml/ud) antes de enviar al comparador
    # Esto convierte "pizca" → g, "cucharada" → g, "taza" → ml, etc.
    for ing_name, ing_data in aggregated.items():
        raw_unit = ing_data["unit"]
        if raw_unit and raw_unit.lower() not in ("g", "ml", "ud", "u", "kg", "l"):
            norm_qty, norm_unit = unit_normalizer.normalize_unit(
                ing_data["quantity"], raw_unit, ing_name
            )
            ing_data["quantity"] = norm_qty
            ing_data["unit"] = norm_unit

    # Convertir a formato del comparador V1
    shopping_list = []
    for ing_name, ing_data in aggregated.items():
        qty = round(ing_data["quantity"], 1)
        shopping_list.append({
            "canonical_name": ing_name,
            "name": ing_name.replace("_", " ").title(),
            "total_qty": qty,
            "unit": ing_data["unit"],
        })

    logger.info("[V3] Ingredientes agregados: %d únicos", len(shopping_list))
    return shopping_list


@router.post("/generate-plan-v3")
async def generate_plan_v3(
    data: WizardData,
    req: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_optional_user),
):
    """
    SISTEMA V3: Genera menú seleccionando de recetas verificadas.

    Flow:
    1. Carga recetas verificadas de la DB filtradas por dieta
    2. Selector determinista SELECCIONA recetas apropiadas
    3. Devuelve menú con recetas completas (instrucciones, ingredientes, etc.)

    Returns:
        {
            "menu": [...],  # Menú con recetas verificadas
            "total_calorias_dia": int,
            "notas": str
        }
    """
    # Rate limit: max 5 plan generations per 5 minutes per IP
    client_ip = req.client.host if req.client else "unknown"
    plan_key = f"plan_{client_ip}"
    if rate_limiter.is_rate_limited(plan_key, max_attempts=5, window_seconds=300):
        raise HTTPException(
            status_code=429,
            detail="Demasiadas generaciones de menú. Espera unos minutos.",
        )
    rate_limiter.record_attempt(plan_key)

    logger.info("[V3] Generando plan con recetas verificadas para: %s", data.goal)

    # --- FAMILY MODE: aggregate family member preferences ---
    family_info = None
    if data.family_members:
        family_calories = 0
        family_allergens = set(data.allergens or [])
        family_hated = set(data.hated_foods or [])
        member_names = []
        for fm in data.family_members:
            family_calories += fm.get("target_calories", 2000)
            family_allergens.update(fm.get("allergens", []))
            family_hated.update(fm.get("hated_foods", []))
            member_names.append(fm.get("name", "?"))

        # Override wizard data with family aggregates
        data.target_calories = family_calories
        data.allergens = list(family_allergens)
        data.hated_foods = list(family_hated)

        family_info = {
            "members": data.family_members,
            "members_count": len(data.family_members),
            "total_calories": family_calories,
            "shared_allergens": sorted(family_allergens),
            "shared_hated_foods": sorted(family_hated),
        }
        logger.info(
            "[V3-FAMILY] Modo familia: %d miembros (%s), %d kcal totales, %d alérgenos, %d hated",
            len(data.family_members), ", ".join(member_names),
            family_calories, len(family_allergens), len(family_hated),
        )

    try:
        # [INVENTARIO] Cargar items del inventario de la DB + guardar nuevos del wizard
        if current_user:
            from app.db.models import PantryItem

            db_pantry_items = (
                db.query(PantryItem)
                .filter(PantryItem.user_id == current_user.id)
                .all()
            )

            if db_pantry_items:
                pantry_from_db = [
                    {
                        "name": item.name,
                        "quantity": item.quantity,
                        "unit": item.unit or "",
                    }
                    for item in db_pantry_items
                ]
                existing_names = {
                    p.get("name", "").lower()
                    if isinstance(p, dict)
                    else p.lower()
                    for p in data.pantry_items
                }
                for item in pantry_from_db:
                    if item["name"].lower() not in existing_names:
                        data.pantry_items.append(item)
                logger.info(
                    "[V3] Inventario cargado: %d items de DB + %d del formulario",
                    len(pantry_from_db),
                    len(data.pantry_items) - len(pantry_from_db),
                )

            # Guardar items del formulario en la DB si no existen
            if data.pantry_items:
                saved_count = 0
                for item_data in data.pantry_items:
                    if isinstance(item_data, dict):
                        item_name = item_data.get("name", "")
                        item_qty = item_data.get("quantity", 1.0)
                        item_unit = item_data.get("unit", "u")
                    elif isinstance(item_data, str):
                        item_name = item_data
                        item_qty = 1.0
                        item_unit = "u"
                    else:
                        continue

                    if not item_name or not item_name.strip():
                        continue

                    item_name = item_name.strip()

                    existing = (
                        db.query(PantryItem)
                        .filter(
                            PantryItem.user_id == current_user.id,
                            func.lower(PantryItem.name) == item_name.lower()
                        )
                        .first()
                    )

                    if not existing:
                        new_pantry_item = PantryItem(
                            user_id=current_user.id,
                            name=item_name,
                            quantity=float(item_qty),
                            unit=item_unit,
                            category="Despensa",
                            min_quantity=1.0
                        )
                        db.add(new_pantry_item)
                        saved_count += 1

                if saved_count > 0:
                    db.commit()
                    logger.info("[V3] Guardados %d items nuevos en inventario", saved_count)

        # Load user ratings for recipe scoring (favorites get boosted, dislikes excluded)
        user_ratings = None
        if current_user:
            rating_rows = db.query(UserRecipeRating).filter(
                UserRecipeRating.user_id == current_user.id
            ).all()
            if rating_rows:
                user_ratings = {r.recipe_id: r.rating for r in rating_rows}

        logger.info("[V3] Iniciando selección de recetas verificadas...")
        menu_response = await nutritionist.get_smart_menu_v3(data, user_ratings=user_ratings)

        if not menu_response:
            raise HTTPException(
                status_code=500,
                detail="No se pudieron seleccionar recetas verificadas. Verifica que existan recetas para la dieta seleccionada.",
            )

        menu_list = menu_response.get("menu", [])
        # Truncar al número de días solicitado (Gemini a veces genera más)
        num_days = data.plan_days or 7
        menu_list = menu_list[:num_days]

        # Guardar en memoria del usuario si está logueado
        if current_user and menu_list:
            try:
                from datetime import date

                # Guardar cada día en daily_plans
                for i, day_data in enumerate(menu_list):
                    current_date = date.today() + timedelta(days=i)

                    daily_plan = (
                        db.query(DailyPlan)
                        .filter(
                            DailyPlan.user_id == current_user.id,
                            DailyPlan.date == current_date,
                        )
                        .first()
                    )

                    if not daily_plan:
                        daily_plan = DailyPlan(
                            user_id=current_user.id,
                            date=current_date,
                            goal_type=data.goal,
                            diet_type=data.diet,
                            target_calories=data.target_calories,
                        )
                        db.add(daily_plan)
                        db.flush()

                    # Limpiar comidas existentes
                    db.query(Meal).filter(Meal.daily_plan_id == daily_plan.id).delete()

                    # Guardar cada comida del día
                    for meal_type in ["desayuno", "almuerzo", "comida", "merienda", "cena"]:
                        meal_data = day_data.get(meal_type)
                        if meal_data and "recipe_id" in meal_data:
                            recipe_id = meal_data["recipe_id"]
                            new_meal = Meal(
                                daily_plan_id=daily_plan.id,
                                recipe_id=recipe_id,
                                meal_type=meal_type,
                                servings=float(meal_data.get("porciones", 1.0)),
                            )
                            db.add(new_meal)

                db.commit()
                logger.info("[V3] Menú guardado en memoria: %d días", len(menu_list))

            except Exception as e:
                db.rollback()
                logger.warning("[V3] Error guardando menú en memoria: %s", e)

        # Enriquecer cada comida con ingredientes (batch query en vez de N+1)
        logger.info("[V3] Enriqueciendo comidas con ingredientes...")
        meal_types = ["desayuno", "almuerzo", "comida", "merienda", "cena"]
        all_recipe_ids = set()
        for day in menu_list:
            for mt in meal_types:
                md = day.get(mt)
                if md and "recipe_id" in md:
                    all_recipe_ids.add(md["recipe_id"])

        # UNA sola query para todos los ingredientes
        from collections import defaultdict
        _all_ings = db.query(RecipeIngredient).filter(
            RecipeIngredient.recipe_id.in_(all_recipe_ids)
        ).all() if all_recipe_ids else []
        _ings_by_recipe = defaultdict(list)
        for ing in _all_ings:
            _ings_by_recipe[ing.recipe_id].append(ing)

        # Batch query para image_url y servings de todas las recetas del menú
        _img_map = {}
        _servings_map = {}
        if all_recipe_ids:
            _recipes = db.query(Recipe.id, Recipe.image_url, Recipe.servings).filter(
                Recipe.id.in_(all_recipe_ids)
            ).all()
            _img_map = {r.id: r.image_url for r in _recipes if r.image_url}
            _servings_map = {r.id: (r.servings or 1) for r in _recipes}

        for day in menu_list:
            for mt in meal_types:
                meal_data = day.get(mt)
                if meal_data and "recipe_id" in meal_data:
                    recipe_id = meal_data["recipe_id"]
                    porciones = float(meal_data.get("porciones", 1))
                    servings = _servings_map.get(recipe_id, 1)
                    meal_data["ingredientes"] = [
                        {
                            "n": ing.name.replace("_", " ").title(),
                            "q": f"{round((ing.quantity / servings) * porciones, 1):g}{ing.unit}"
                        }
                        for ing in _ings_by_recipe.get(recipe_id, [])
                    ]
                    if recipe_id in _img_map:
                        meal_data["image_url"] = _img_map[recipe_id]

        # Generar lista de compra agregando ingredientes de las recetas
        logger.info("[V3] Agregando ingredientes de recetas...")
        aggregated_items = _aggregate_v3_ingredients(db, menu_list)

        # [INVENTARIO] Marcar items de la despensa con cobertura proporcional
        db_pantry_list = []
        if current_user:
            from app.db.models import PantryItem as PantryItemModel
            db_pantry_list = (
                db.query(PantryItemModel)
                .filter(PantryItemModel.user_id == current_user.id)
                .all()
            )
        _mark_pantry_coverage(aggregated_items, data.pantry_items or [], db_pantry_list)
        pantry_count = sum(1 for it in aggregated_items if it.get("in_pantry"))
        logger.info("[V3] Pantry coverage: %d/%d items marcados", pantry_count, len(aggregated_items))

        # Usar el comparador V1 existente (búsqueda en cascada + incompatibilidades)
        logger.info("[V3] Comparando precios con comparator V1...")
        comparison = await comparator.bulk_compare(aggregated_items)

        # Generar guía de meal prep si el usuario lo solicitó
        meal_prep_guide = None
        if getattr(data, 'meal_prep', False):
            meal_prep_guide = _generate_meal_prep_guide(menu_list)

        # Calculate Nutri-Score for each meal
        from app.services.nutriscore import nutriscore_for_recipe
        meal_keys = ["desayuno", "almuerzo", "comida", "merienda", "cena"]
        for day in menu_list:
            for mk in meal_keys:
                meal = day.get(mk)
                if meal and meal.get("calorias"):
                    ns = nutriscore_for_recipe(meal)
                    meal["nutriscore"] = ns

        # Seasonal info
        from app.services.recipe_selector import _get_current_season, _SEASONAL_RECIPE_KEYWORDS
        current_season = _get_current_season()
        season_labels = {"primavera": "Primavera", "verano": "Verano", "otono": "Otoño", "invierno": "Invierno"}
        seasonal_info = {
            "season": current_season,
            "season_label": season_labels.get(current_season, current_season),
        }

        # Separate shopping list into items to buy vs pantry-excluded items
        items_to_buy = [it for it in aggregated_items if not it.get("excluded")]
        pantry_excluded = [it for it in aggregated_items if it.get("excluded")]

        response = {
            "menu": menu_list,
            "total_calorias_dia": menu_response.get("total_calorias_dia", data.target_calories),
            "notas": menu_response.get("notas", ""),
            "sistema": "v3_recetas_verificadas",
            "user_preferences": {
                "diet_type": data.diet,
                "goal": data.goal,
                "target_calories": data.target_calories,
            },
            # Datos de compra: solo items que necesita comprar
            "shopping_list": items_to_buy,
            # Items excluidos por despensa (para UI colapsable)
            "pantry_excluded": pantry_excluded,
            "comparison": comparison,
            # [INVENTARIO] Incluir pantry_items normalizados (siempre dicts)
            "pantry_items": [
                {"name": p, "quantity": 1.0, "unit": "ud"} if isinstance(p, str)
                else p
                for p in (data.pantry_items or [])
                if (p.get("name", "").strip() if isinstance(p, dict) else (p or "").strip())
            ],
            "seasonal_info": seasonal_info,
        }
        if meal_prep_guide:
            response["meal_prep_guide"] = meal_prep_guide
        if family_info:
            response["family_info"] = family_info

        # Persistir plan completo en DB para restauración tras re-login
        if current_user:
            try:
                existing = db.query(UserActivePlan).filter(
                    UserActivePlan.user_id == current_user.id
                ).first()
                wizard_snapshot = {
                    "diet": data.diet, "goal": data.goal,
                    "allergens": data.allergens or [], "hatedFoods": data.hated_foods or [],
                    "planDays": data.plan_days, "mealsPerDay": data.meals_per_day,
                    "target_calories": data.target_calories,
                    "familyMembers": [
                        {"name": fm.get("name"), "target_calories": fm.get("target_calories"),
                         "preset": fm.get("preset"), "age": fm.get("age"), "gender": fm.get("gender")}
                        for fm in (data.family_members or [])
                    ],
                }

                # Archive old plan to history before overwriting
                if existing and existing.plan_data:
                    db.add(PlanHistory(
                        user_id=current_user.id,
                        plan_data=existing.plan_data,
                        wizard_data=existing.wizard_data,
                    ))

                if existing:
                    existing.plan_data = response
                    existing.wizard_data = wizard_snapshot
                else:
                    db.add(UserActivePlan(
                        user_id=current_user.id,
                        plan_data=response,
                        wizard_data=wizard_snapshot,
                    ))
                db.commit()
                logger.info("[V3] Plan completo persistido en user_active_plans")

                # Auto-save shopping history with savings data
                try:
                    stats = comparison.get("stats", {})
                    cheapest_total = stats.get("cheapest_total", 0)
                    savings = stats.get("savings", 0)
                    cheapest_super = stats.get("cheapest_supermarket", "mixed")
                    if cheapest_total > 0:
                        db.add(ShoppingHistory(
                            user_id=current_user.id,
                            total_cost=cheapest_total,
                            total_saved=savings,
                            supermarket=cheapest_super,
                        ))
                        db.commit()
                        logger.info("[V3] Shopping history saved: cost=%.2f saved=%.2f", cheapest_total, savings)
                except Exception as sh_err:
                    db.rollback()
                    logger.warning("[V3] Error saving shopping history: %s", sh_err)
            except Exception as e:
                db.rollback()
                logger.warning("[V3] Error persistiendo plan cache: %s", e)

        logger.info("[V3] Plan generado: %d días, %d ingredientes", len(menu_list), len(aggregated_items))
        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error("[ERROR] V3 Generate Plan: %s", e)
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail="Error generando plan V3 con recetas verificadas",
        )


# ==========================================
# RECIPE CATALOG (Browse All Recipes)
# ==========================================

@router.get("/recipes")
async def list_recipes(
    meal_type: str = None,
    diet: str = None,
    search: str = None,
    limit: int = 500,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    """List all verified recipes for browsing. Public endpoint (guests allowed)."""
    from sqlalchemy import text

    # Clamp pagination params
    limit = max(1, min(limit, 500))
    offset = max(0, offset)

    conditions = ["is_verified = TRUE" if IS_POSTGRES else "is_verified = 1"]
    params = {"limit": limit, "offset": offset}

    if meal_type:
        conditions.append("meal_type = :meal_type")
        params["meal_type"] = meal_type
    if diet:
        conditions.append(("suitable_diets::text" if IS_POSTGRES else "suitable_diets") + " LIKE '%' || :diet || '%'")
        params["diet"] = diet
    if search:
        conditions.append("name LIKE :search")
        params["search"] = f"%{search}%"

    where = " AND ".join(conditions)

    # Count total matching
    count_sql = text(f"SELECT COUNT(*) FROM recipes r WHERE {where}")
    total = db.execute(count_sql, params).scalar()

    if IS_POSTGRES:
        ratings_subquery = """
            SELECT recipe_id,
                   COUNT(*) AS rating_count,
                   ROUND(
                       (COUNT(*) FILTER (WHERE rating = 'favorite') * 2.0
                        + COUNT(*) FILTER (WHERE rating = 'like')
                        - COUNT(*) FILTER (WHERE rating = 'dislike') * 0.5
                       ) / NULLIF(COUNT(*), 0)::numeric,
                   2) AS avg_score
            FROM user_recipe_ratings
            GROUP BY recipe_id
        """
    else:
        ratings_subquery = """
            SELECT recipe_id,
                   COUNT(*) AS rating_count,
                   ROUND(
                       (SUM(CASE WHEN rating = 'favorite' THEN 2.0 ELSE 0 END)
                        + SUM(CASE WHEN rating = 'like' THEN 1.0 ELSE 0 END)
                        - SUM(CASE WHEN rating = 'dislike' THEN 0.5 ELSE 0 END)
                       ) / MAX(COUNT(*), 1),
                   2) AS avg_score
            FROM user_recipe_ratings
            GROUP BY recipe_id
        """

    sql = text(f"""
        SELECT r.id, r.name, r.slug AS slug, r.calories, r.protein, r.carbs, r.fats, r.image_url,
               r.meal_type, r.suitable_diets, r.prep_time_minutes, r.difficulty,
               COALESCE(rs.rating_count, 0) AS rating_count,
               COALESCE(rs.avg_score, 0) AS avg_score
        FROM recipes r
        LEFT JOIN ({ratings_subquery}) rs ON rs.recipe_id = r.id
        WHERE {where}
        ORDER BY r.meal_type, r.name
        LIMIT :limit OFFSET :offset
    """)

    rows = db.execute(sql, params).fetchall()

    return {
        "recipes": [
            {
                "id": r.id,
                "name": r.name,
                "slug": r.slug,
                "calories": r.calories,
                "protein": round(r.protein or 0, 1),
                "carbs": round(r.carbs or 0, 1),
                "fats": round(r.fats or 0, 1),
                "image_url": r.image_url,
                "meal_type": r.meal_type,
                "suitable_diets": _parse_diets(r.suitable_diets),
                "prep_time_minutes": r.prep_time_minutes,
                "difficulty": r.difficulty,
                "rating_count": r.rating_count,
                "avg_score": float(r.avg_score),
            }
            for r in rows
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


# ==========================================
# PUBLIC RECIPE DETAIL (SEO Pages)
# ==========================================

@router.get("/recipes-slugs")
async def list_recipe_slugs(db: Session = Depends(get_db)):
    """Returns all recipe slugs for Next.js SSG generateStaticParams()."""
    from sqlalchemy import text

    rows = db.execute(
        text("SELECT slug FROM recipes WHERE is_verified = true AND slug IS NOT NULL ORDER BY id")
    ).fetchall()
    return {"slugs": [r.slug for r in rows]}


@router.get("/recipes/{slug}")
async def get_recipe_by_slug(slug: str, db: Session = Depends(get_db)):
    """Public endpoint: full recipe detail by slug for SEO pages."""
    from sqlalchemy import text

    sql = text("""
        SELECT r.id, r.name, r.slug, r.description, r.instructions,
               r.calories, r.protein, r.carbs, r.fats,
               r.image_url, r.meal_type, r.suitable_diets,
               r.prep_time_minutes, r.difficulty, r.servings
        FROM recipes r
        WHERE r.slug = :slug AND r.is_verified = true
    """)
    row = db.execute(sql, {"slug": slug}).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Receta no encontrada")

    # Get ingredients
    ings = db.execute(
        text("SELECT name, quantity, unit FROM recipe_ingredients WHERE recipe_id = :rid ORDER BY id"),
        {"rid": row.id},
    ).fetchall()

    # Get rating stats (SQLite-compatible)
    rating = db.execute(
        text("""
            SELECT COUNT(*) as cnt,
                   SUM(CASE WHEN rating = 'favorite' THEN 1 ELSE 0 END) as favs
            FROM user_recipe_ratings WHERE recipe_id = :rid
        """),
        {"rid": row.id},
    ).fetchone()

    return {
        "id": row.id,
        "name": row.name,
        "slug": row.slug,
        "description": row.description,
        "instructions": row.instructions.split("\n") if row.instructions else [],
        "calories": row.calories,
        "protein": round(row.protein or 0, 1),
        "carbs": round(row.carbs or 0, 1),
        "fats": round(row.fats or 0, 1),
        "image_url": row.image_url,
        "meal_type": row.meal_type,
        "suitable_diets": _parse_diets(row.suitable_diets),
        "prep_time_minutes": row.prep_time_minutes,
        "difficulty": row.difficulty,
        "servings": row.servings or 1,
        "ingredients": [
            {"name": i.name, "quantity": round(i.quantity or 0, 1), "unit": i.unit}
            for i in ings
        ],
        "rating_count": rating.cnt if rating else 0,
        "favorites": rating.favs if rating else 0,
    }


# ==========================================
# RECIPE RATINGS (Favorites / Like / Dislike)
# ==========================================

@router.get("/recipe-ratings")
async def get_recipe_ratings(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Get all recipe ratings for the current user."""
    ratings = db.query(UserRecipeRating).filter(
        UserRecipeRating.user_id == current_user.id
    ).all()

    return {
        "ratings": [
            {
                "recipe_id": r.recipe_id,
                "rating": r.rating,
                "recipe_name": r.recipe.name if r.recipe else None,
                "image_url": r.recipe.image_url if r.recipe else None,
                "calories": r.recipe.calories if r.recipe else None,
                "meal_type": r.recipe.meal_type if r.recipe else None,
                "prep_time_minutes": r.recipe.prep_time_minutes if r.recipe else None,
                "difficulty": r.recipe.difficulty if r.recipe else None,
                "protein": round(r.recipe.protein or 0, 1) if r.recipe else None,
                "carbs": round(r.recipe.carbs or 0, 1) if r.recipe else None,
                "fats": round(r.recipe.fats or 0, 1) if r.recipe else None,
            }
            for r in ratings
        ]
    }


@router.post("/recipe-rating")
async def upsert_recipe_rating(
    payload: RateRecipeRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Add or update a recipe rating (favorite/like/dislike)."""
    # Verify recipe exists
    recipe = db.query(Recipe).filter(Recipe.id == payload.recipe_id).first()
    if not recipe:
        raise HTTPException(status_code=404, detail="Receta no encontrada")

    existing = db.query(UserRecipeRating).filter(
        UserRecipeRating.user_id == current_user.id,
        UserRecipeRating.recipe_id == payload.recipe_id,
    ).first()

    if existing:
        existing.rating = payload.rating
    else:
        db.add(UserRecipeRating(
            user_id=current_user.id,
            recipe_id=payload.recipe_id,
            rating=payload.rating,
        ))

    db.commit()
    return {"ok": True, "recipe_id": payload.recipe_id, "rating": payload.rating}


@router.delete("/recipe-rating/{recipe_id}")
async def delete_recipe_rating(
    recipe_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Remove a recipe rating."""
    deleted = db.query(UserRecipeRating).filter(
        UserRecipeRating.user_id == current_user.id,
        UserRecipeRating.recipe_id == recipe_id,
    ).delete()

    db.commit()
    return {"ok": True, "deleted": deleted}


@router.get("/recipe-recommendations")
async def get_recipe_recommendations(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Get personalized recipe recommendations for the current user."""
    from app.services.recommender import get_recommendations

    results = get_recommendations(db, current_user.id, limit=12)
    return {"recommendations": results}


# ==========================================
# PLAN HISTORY (Past Weekly Plans)
# ==========================================

@router.get("/plan-history")
async def get_plan_history(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Get past plans for the current user (newest first, max 10)."""
    plans = (
        db.query(PlanHistory)
        .filter(PlanHistory.user_id == current_user.id)
        .order_by(PlanHistory.created_at.desc())
        .limit(10)
        .all()
    )

    return {
        "plans": [
            {
                "id": p.id,
                "label": p.label,
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "wizard_data": p.wizard_data,
                "summary": _summarize_plan(p.plan_data),
            }
            for p in plans
        ]
    }


def _summarize_plan(plan_data: dict) -> dict:
    """Extract a lightweight summary from a full plan for the history list."""
    if not plan_data:
        return {}
    menu = plan_data.get("menu", [])
    prefs = plan_data.get("user_preferences", {})
    return {
        "days": len(menu),
        "target_calories": prefs.get("target_calories"),
        "diet_type": prefs.get("diet_type"),
        "goal": prefs.get("goal"),
    }


@router.post("/restore-plan/{plan_id}")
async def restore_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Restore a plan from history as the active plan."""
    history = db.query(PlanHistory).filter(
        PlanHistory.id == plan_id,
        PlanHistory.user_id == current_user.id,
    ).first()

    if not history:
        raise HTTPException(status_code=404, detail="Plan no encontrado en historial")

    # Archive current active plan first
    existing = db.query(UserActivePlan).filter(
        UserActivePlan.user_id == current_user.id
    ).first()

    if existing and existing.plan_data:
        db.add(PlanHistory(
            user_id=current_user.id,
            plan_data=existing.plan_data,
            wizard_data=existing.wizard_data,
        ))

    # Restore the selected plan
    if existing:
        existing.plan_data = history.plan_data
        existing.wizard_data = history.wizard_data
    else:
        db.add(UserActivePlan(
            user_id=current_user.id,
            plan_data=history.plan_data,
            wizard_data=history.wizard_data,
        ))

    db.commit()
    return {
        "ok": True,
        "plan": history.plan_data,
        "wizard_data": history.wizard_data,
    }


@router.delete("/plan-history/{plan_id}")
async def delete_plan_history(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Delete a plan from history."""
    deleted = db.query(PlanHistory).filter(
        PlanHistory.id == plan_id,
        PlanHistory.user_id == current_user.id,
    ).delete()

    db.commit()
    return {"ok": True, "deleted": deleted}


# ==========================================
# USER STREAK (Consecutive Weeks with Plans)
# ==========================================

@router.get("/user-streak")
async def get_user_streak(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Calculate the user's streak: consecutive weeks with generated plans.
    Uses plan_history + user_active_plans to find unique weeks.
    """
    from sqlalchemy import text

    # Get all unique plan-creation weeks for this user
    rows = db.execute(text("""
        SELECT DISTINCT DATE_TRUNC('week', created_at)::date AS week_start
        FROM (
            SELECT created_at FROM plan_history WHERE user_id = :uid
            UNION ALL
            SELECT created_at FROM user_active_plans WHERE user_id = :uid
        ) all_plans
        ORDER BY week_start DESC
    """), {"uid": current_user.id}).fetchall()

    if not rows:
        return {"streak": 0, "total_plans": 0, "weeks_active": 0}

    weeks = [r.week_start for r in rows]
    total_plans_row = db.execute(text("""
        SELECT COUNT(*) AS cnt FROM (
            SELECT id FROM plan_history WHERE user_id = :uid
            UNION ALL
            SELECT id FROM user_active_plans WHERE user_id = :uid
        ) t
    """), {"uid": current_user.id}).fetchone()
    total_plans = total_plans_row.cnt if total_plans_row else 0

    # Calculate consecutive weeks from most recent backwards
    current_week = date.today() - timedelta(days=date.today().weekday())  # Monday
    streak = 0

    for week in weeks:
        expected_week = current_week - timedelta(weeks=streak)
        if week == expected_week:
            streak += 1
        else:
            break

    return {
        "streak": streak,
        "total_plans": total_plans,
        "weeks_active": len(weeks),
    }


# ==========================================
# SUPERMARKET REGISTRY
# ==========================================

@router.get("/supermarkets")
async def list_supermarkets():
    """Returns available supermarkets for the frontend to render dynamically."""
    from app.services.supermarket_registry import supermarket_registry

    return {"supermarkets": supermarket_registry.get_display_info()}


# ==========================================
# SHOPPING HISTORY & STATS
# ==========================================

@router.get("/shopping-stats")
async def get_shopping_stats(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Accumulated shopping stats for the authenticated user."""
    from sqlalchemy import text

    # Aggregate totals
    row = db.execute(text("""
        SELECT
            COALESCE(SUM(total_saved), 0) AS total_saved,
            COALESCE(SUM(total_cost), 0)  AS total_spent,
            COUNT(*)                       AS trip_count
        FROM shopping_history
        WHERE user_id = :uid
    """), {"uid": current_user.id}).fetchone()

    if row is None:
        return {
            "total_saved": 0.0,
            "total_spent": 0.0,
            "trip_count": 0,
            "last_trip_cost": None,
            "previous_trip_cost": None,
            "weekly_average": 0.0,
        }

    total_saved: float = round(float(row[0]), 2)  # type: ignore[arg-type]
    total_spent: float = round(float(row[1]), 2)  # type: ignore[arg-type]
    trip_count: int = int(row[2])  # type: ignore[arg-type]

    # Two most recent trips for trend data
    recent_trips = db.execute(text("""
        SELECT total_cost
        FROM shopping_history
        WHERE user_id = :uid
        ORDER BY date DESC
        LIMIT 2
    """), {"uid": current_user.id}).fetchall()

    last_trip_cost: float | None = round(float(recent_trips[0][0]), 2) if len(recent_trips) >= 1 else None  # type: ignore[arg-type]
    previous_trip_cost: float | None = round(float(recent_trips[1][0]), 2) if len(recent_trips) >= 2 else None  # type: ignore[arg-type]

    weekly_average: float = round(total_spent / trip_count, 2) if trip_count > 0 else 0.0

    return {
        "total_saved": total_saved,
        "total_spent": total_spent,
        "trip_count": trip_count,
        "last_trip_cost": last_trip_cost,
        "previous_trip_cost": previous_trip_cost,
        "weekly_average": weekly_average,
    }


@router.post("/shopping-history")
async def save_shopping_history(
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Manually save a shopping trip with savings data."""
    body = await request.json()
    total_cost = float(body.get("total_cost", 0))
    total_saved = float(body.get("total_saved", 0))
    supermarket = str(body.get("supermarket", "unknown"))

    entry = ShoppingHistory(
        user_id=current_user.id,
        total_cost=total_cost,
        total_saved=total_saved,
        supermarket=supermarket,
    )
    db.add(entry)
    db.commit()
    return {"ok": True, "id": entry.id}


# ==========================================
# WEEKLY OFFERS ENDPOINT (FASE 2A)
# ==========================================
@router.get("/weekly-offers")
async def get_weekly_offers(
    db: Session = Depends(get_db),
    limit: int = 50,
):
    """
    Returns products currently on offer across all active supermarkets.
    Sorted by discount percentage (biggest discounts first).
    """
    from sqlalchemy import desc
    from app.services.supermarket_registry import supermarket_registry
    active_codes = supermarket_registry.get_all_codes()

    products = (
        db.query(Product)
        .filter(
            Product.is_on_offer == 1,
            Product.supermarket.in_(active_codes),
            Product.discount_percentage.isnot(None),
        )
        .order_by(desc(Product.discount_percentage))
        .limit(limit)
        .all()
    )

    items = []
    for p in products:
        items.append({
            "id": p.id,
            "product_name": p.product_name,
            "brand": p.brand,
            "category": p.ai_category,
            "price": float(p.price) if p.price else 0,
            "original_price": float(p.original_price) if p.original_price else None,
            "discount_percentage": float(p.discount_percentage) if p.discount_percentage else 0,
            "image_url": p.image_url,
        })

    # Summary stats
    all_offers = db.query(func.count(Product.id)).filter(
        Product.is_on_offer == 1, Product.supermarket.in_(active_codes)
    ).scalar()

    return {
        "total_offers": all_offers or 0,
        "items": items,
    }


@router.get("/offer-stats")
async def get_offer_stats(db: Session = Depends(get_db)):
    """
    Summary statistics about current offers across all active supermarkets.
    Useful for B2B dashboard and frontend banners.
    """
    from sqlalchemy import func as sqlfunc
    from app.services.supermarket_registry import supermarket_registry
    active_codes = supermarket_registry.get_all_codes()

    total_products = db.query(sqlfunc.count(Product.id)).filter(
        Product.supermarket.in_(active_codes)
    ).scalar() or 0

    total_on_offer = db.query(sqlfunc.count(Product.id)).filter(
        Product.is_on_offer == 1, Product.supermarket.in_(active_codes)
    ).scalar() or 0

    avg_discount = db.query(sqlfunc.avg(Product.discount_percentage)).filter(
        Product.is_on_offer == 1, Product.supermarket.in_(active_codes),
        Product.discount_percentage.isnot(None),
    ).scalar()

    max_discount = db.query(sqlfunc.max(Product.discount_percentage)).filter(
        Product.is_on_offer == 1, Product.supermarket.in_(active_codes),
    ).scalar()

    # Offers by category
    cat_rows = (
        db.query(Product.ai_category, sqlfunc.count(Product.id))
        .filter(Product.is_on_offer == 1, Product.supermarket.in_(active_codes))
        .group_by(Product.ai_category)
        .order_by(sqlfunc.count(Product.id).desc())
        .limit(10)
        .all()
    )

    return {
        "total_products": total_products,
        "total_on_offer": total_on_offer,
        "offer_percentage": round(total_on_offer / max(total_products, 1) * 100, 1),
        "avg_discount": round(float(avg_discount), 1) if avg_discount else 0,
        "max_discount": round(float(max_discount), 1) if max_discount else 0,
        "by_category": [{"category": r[0] or "Otros", "count": r[1]} for r in cat_rows],
    }


# ==========================================
# FAMILY MODE ENDPOINTS
# ==========================================


@router.get("/family-members")
def get_family_members(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Get all family members for the current user."""
    members = (
        db.query(FamilyMember)
        .filter(FamilyMember.user_id == current_user.id, FamilyMember.is_active == True)
        .order_by(FamilyMember.created_at)
        .all()
    )
    return [
        {
            "id": m.id,
            "name": m.name,
            "age": m.age,
            "gender": m.gender,
            "weight_kg": m.weight_kg,
            "height_cm": m.height_cm,
            "activity_level": m.activity_level,
            "goal": m.goal,
            "target_calories": m.target_calories,
            "allergens": m.allergens or [],
            "hated_foods": m.hated_foods or [],
        }
        for m in members
    ]


@router.post("/family-members")
def create_family_member(
    member: FamilyMemberCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Add a family member."""
    # Limit to 8 members per user
    count = (
        db.query(FamilyMember)
        .filter(FamilyMember.user_id == current_user.id, FamilyMember.is_active == True)
        .count()
    )
    if count >= 8:
        raise HTTPException(status_code=400, detail="Máximo 8 miembros familiares")

    new_member = FamilyMember(
        user_id=current_user.id,
        name=member.name,
        age=member.age,
        gender=member.gender,
        weight_kg=member.weight_kg,
        height_cm=member.height_cm,
        activity_level=member.activity_level,
        goal=member.goal,
        target_calories=member.target_calories,
        allergens=member.allergens,
        hated_foods=member.hated_foods,
    )
    db.add(new_member)
    db.commit()
    db.refresh(new_member)

    return {
        "id": new_member.id,
        "name": new_member.name,
        "age": new_member.age,
        "gender": new_member.gender,
        "weight_kg": new_member.weight_kg,
        "height_cm": new_member.height_cm,
        "activity_level": new_member.activity_level,
        "goal": new_member.goal,
        "target_calories": new_member.target_calories,
        "allergens": new_member.allergens or [],
        "hated_foods": new_member.hated_foods or [],
    }


@router.put("/family-members/{member_id}")
def update_family_member(
    member_id: int,
    member: FamilyMemberCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Update a family member."""
    existing = (
        db.query(FamilyMember)
        .filter(FamilyMember.id == member_id, FamilyMember.user_id == current_user.id)
        .first()
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Miembro no encontrado")

    existing.name = member.name
    existing.age = member.age
    existing.gender = member.gender
    existing.weight_kg = member.weight_kg
    existing.height_cm = member.height_cm
    existing.activity_level = member.activity_level
    existing.goal = member.goal
    existing.target_calories = member.target_calories
    existing.allergens = member.allergens
    existing.hated_foods = member.hated_foods
    db.commit()

    return {"status": "updated", "id": member_id}


@router.delete("/family-members/{member_id}")
def delete_family_member(
    member_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Soft-delete a family member."""
    existing = (
        db.query(FamilyMember)
        .filter(FamilyMember.id == member_id, FamilyMember.user_id == current_user.id)
        .first()
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Miembro no encontrado")

    existing.is_active = False
    db.commit()
    return {"status": "deleted", "id": member_id}


@router.get("/family-summary")
def get_family_summary(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Get aggregated family data for plan generation.
    Returns the combined calorie target, union of allergens/hated foods,
    and most restrictive diet needed.
    """
    members = (
        db.query(FamilyMember)
        .filter(FamilyMember.user_id == current_user.id, FamilyMember.is_active == True)
        .all()
    )

    if not members:
        return {"has_family": False, "members_count": 0}

    total_calories = sum(m.target_calories for m in members)
    all_allergens = set()
    all_hated = set()
    for m in members:
        all_allergens.update(m.allergens or [])
        all_hated.update(m.hated_foods or [])

    return {
        "has_family": True,
        "members_count": len(members),
        "members": [{"name": m.name, "target_calories": m.target_calories} for m in members],
        "total_calories": total_calories,
        "avg_calories": round(total_calories / len(members)),
        "shared_allergens": sorted(all_allergens),
        "shared_hated_foods": sorted(all_hated),
    }


# ==========================================
# RECIPE SEARCH BY INGREDIENTS
# ==========================================

@router.post("/recipes/by-ingredients")
async def search_recipes_by_ingredients(
    data: dict,
    db: Session = Depends(get_db),
):
    """Find recipes sorted by ingredient coverage from user's available ingredients."""
    from sqlalchemy import text as sql_text

    user_ingredients = [i.strip().lower() for i in (data.get("ingredients") or []) if i.strip()]
    if not user_ingredients:
        raise HTTPException(status_code=400, detail="No ingredients provided")

    limit = min(data.get("limit", 20), 50)

    # Get all verified recipes with their ingredients
    rows = db.execute(sql_text("""
        SELECT r.id, r.name, r.slug, r.calories, r.meal_type, r.image_url,
               r.suitable_diets, r.prep_time_minutes, r.difficulty,
               ri.name as ing_name
        FROM recipes r
        JOIN recipe_ingredients ri ON ri.recipe_id = r.id
        WHERE r.is_verified = {"TRUE" if IS_POSTGRES else "1"}
        ORDER BY r.id
    """)).fetchall()

    # Group ingredients by recipe
    recipes_map = {}
    for row in rows:
        rid = row.id
        if rid not in recipes_map:
            recipes_map[rid] = {
                "id": rid,
                "name": row.name,
                "slug": row.slug,
                "calories": row.calories,
                "meal_type": row.meal_type,
                "image_url": row.image_url,
                "suitable_diets": _parse_diets(row.suitable_diets),
                "prep_time_minutes": row.prep_time_minutes,
                "difficulty": row.difficulty,
                "ingredients": [],
                "matched": [],
                "missing": [],
            }
        recipes_map[rid]["ingredients"].append(row.ing_name)

    # Calculate coverage for each recipe
    results = []
    for recipe in recipes_map.values():
        matched = []
        missing = []
        for ing in recipe["ingredients"]:
            ing_lower = ing.lower()
            found = any(
                ui in ing_lower or ing_lower in ui
                for ui in user_ingredients
            )
            if found:
                matched.append(ing)
            else:
                missing.append(ing)

        total = len(recipe["ingredients"])
        coverage = len(matched) / total if total > 0 else 0

        if coverage > 0:  # Only include recipes with at least 1 match
            results.append({
                **{k: v for k, v in recipe.items() if k != "ingredients"},
                "total_ingredients": total,
                "matched_count": len(matched),
                "missing_count": len(missing),
                "coverage": round(coverage * 100, 1),
                "matched": matched,
                "missing": missing,
            })

    # Sort by coverage descending
    results.sort(key=lambda r: (-r["coverage"], -r["matched_count"], r["missing_count"]))

    return {"recipes": results[:limit], "total": len(results)}


# ==========================================
# PRODUCT COMPARATOR ENDPOINTS (Public)
# ==========================================

@router.get("/products/search")
async def search_products(
    q: str = "",
    category: str = None,
    supermarket: str = None,
    offers_only: bool = False,
    limit: int = 30,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    """Search products by name with optional filters. Public endpoint."""
    from sqlalchemy import func as sqlfunc, case

    limit = max(1, min(limit, 100))
    offset = max(0, offset)

    query = db.query(Product).filter(Product.product_name.isnot(None))

    if q and len(q) >= 2:
        query = query.filter(Product.product_name.ilike(f"%{q}%"))
    if category:
        query = query.filter(Product.ai_category == category)
    if supermarket:
        query = query.filter(Product.supermarket == supermarket.upper())
    if offers_only:
        query = query.filter(Product.is_on_offer == 1)

    total = query.count()

    # Relevance: exact start > word boundary > contains
    if q and len(q) >= 2:
        relevance = case(
            (Product.product_name.ilike(f"{q}%"), 0),        # starts with query
            (Product.product_name.ilike(f"% {q}%"), 1),      # word boundary
            else_=2,                                          # contains anywhere
        )
        products = (
            query.order_by(relevance, Product.price.asc())
            .offset(offset)
            .limit(limit)
            .all()
        )
    else:
        products = (
            query.order_by(Product.product_name)
            .offset(offset)
            .limit(limit)
            .all()
        )

    def _sanitize_offer(p):
        """Return sane discount data — reject PUM-as-original-price."""
        price = round(float(p.price), 2) if p.price else None
        orig = round(float(p.original_price), 2) if p.original_price else None
        # If original_price is >5x the price, it's likely PUM not real price
        if price and orig and orig > price * 5:
            return price, None, None, False
        disc = round(float(p.discount_percentage), 1) if p.discount_percentage else None
        # Cap discounts at 60% — anything higher is data error
        if disc and disc > 60:
            return price, None, None, False
        is_offer = bool(p.is_on_offer) and orig is not None and orig > (price or 0)
        return price, orig, disc, is_offer

    return {
        "products": [
            (lambda pr, orig, disc, offer: {
                "id": p.id,
                "product_name": p.product_name,
                "brand": p.brand,
                "supermarket": p.supermarket,
                "price": pr,
                "original_price": orig,
                "discount_percentage": disc,
                "is_on_offer": offer,
                "image_url": p.image_url,
                "category": p.ai_category,
                "format": p.product_format,
                "base_amount": p.base_amount,
                "base_unit": p.base_unit,
                "pum": round(float(p.pum_calculated), 2) if p.pum_calculated else None,
            })(*_sanitize_offer(p))
            for p in products
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/products/categories")
async def list_product_categories(db: Session = Depends(get_db)):
    """List unique product categories with counts. Public endpoint."""
    from sqlalchemy import func as sqlfunc

    rows = (
        db.query(Product.ai_category, sqlfunc.count(Product.id))
        .filter(Product.ai_category.isnot(None), Product.product_name.isnot(None))
        .group_by(Product.ai_category)
        .order_by(sqlfunc.count(Product.id).desc())
        .all()
    )

    return {
        "categories": [
            {"name": r[0], "count": r[1]}
            for r in rows
            if r[0]
        ]
    }


@router.get("/products/compare")
async def compare_product(
    q: str = "",
    limit: int = 20,
    db: Session = Depends(get_db),
):
    """Compare a product across supermarkets. Groups similar products side by side."""
    if not q or len(q) < 2:
        return {"query": q, "results": []}

    from app.services.supermarket_registry import supermarket_registry
    active_codes = supermarket_registry.get_all_codes()

    # Find matching products across all supers
    products = (
        db.query(Product)
        .filter(
            Product.product_name.ilike(f"%{q}%"),
            Product.supermarket.in_(active_codes),
            Product.price.isnot(None),
        )
        .order_by(Product.price)
        .limit(limit * 3)  # fetch more to allow grouping
        .all()
    )

    # Group by supermarket
    by_super = {}
    for p in products:
        code = (p.supermarket or "").upper()
        by_super.setdefault(code, []).append({
            "id": p.id,
            "product_name": p.product_name,
            "brand": p.brand,
            "price": round(float(p.price), 2) if p.price else None,
            "original_price": round(float(p.original_price), 2) if p.original_price else None,
            "is_on_offer": bool(p.is_on_offer),
            "image_url": p.image_url,
            "format": p.product_format,
            "pum": round(float(p.pum_calculated), 2) if p.pum_calculated else None,
        })

    # Build side-by-side comparison (cheapest per super)
    results = []
    all_codes = sorted(by_super.keys())
    if len(all_codes) >= 2:
        # Pair up cheapest from each super
        code_a, code_b = all_codes[0], all_codes[1]
        max_pairs = min(limit, len(by_super.get(code_a, [])), len(by_super.get(code_b, [])))
        for i in range(max_pairs):
            a = by_super[code_a][i] if i < len(by_super[code_a]) else None
            b = by_super[code_b][i] if i < len(by_super[code_b]) else None
            if a and b:
                cheaper = code_a if (a["price"] or 999) <= (b["price"] or 999) else code_b
                saving = abs((a["price"] or 0) - (b["price"] or 0))
                results.append({
                    code_a.lower(): a,
                    code_b.lower(): b,
                    "cheaper": cheaper,
                    "savings": round(saving, 2),
                })
    elif len(all_codes) == 1:
        code = all_codes[0]
        for p in by_super[code][:limit]:
            results.append({code.lower(): p, "cheaper": code, "savings": 0})

    return {"query": q, "results": results, "supermarkets": all_codes}


# Cesta básica: productos esenciales para comparar supers
# Cesta básica: each entry is (display_name, [search_terms_in_priority_order])
# Multiple search terms help find products across different supermarket naming conventions
BASIC_BASKET = [
    ("Leche Entera", ["leche entera"]),
    ("Pan Molde", ["pan molde", "pan de molde"]),
    ("Huevos", ["huevos", "huevo"]),
    ("Aceite Oliva", ["aceite oliva", "aceite de oliva"]),
    ("Arroz", ["arroz"]),
    ("Pasta", ["macarrones", "espagueti", "pasta"]),
    ("Tomate Frito", ["tomate frito"]),
    ("Atun", ["atun", "atún"]),
    ("Pollo", ["pechuga pollo", "pollo"]),
    ("Jamon", ["jamon cocido", "jamón cocido", "jamon", "jamón"]),
    ("Queso", ["queso lonchas", "queso"]),
    ("Yogur", ["yogur natural", "yogur"]),
    ("Platanos", ["plátano", "platano", "banana"]),
    ("Patatas", ["patata", "patatas"]),
    ("Cebolla", ["cebolla", "cebollas"]),
    ("Lechuga", ["lechuga"]),
    ("Mantequilla", ["mantequilla"]),
    ("Cafe", ["cafe molido", "café molido", "cafe", "café"]),
    ("Azucar", ["azucar", "azúcar"]),
    ("Sal", ["sal fina", "sal"]),
]


def _find_cheapest_product(db, term: str, supermarket_code: str):
    """Find cheapest product matching term, preferring prefix matches."""
    from app.db.models import Product
    # Try prefix match first (more relevant)
    prod = (
        db.query(Product)
        .filter(Product.product_name.ilike(f"{term}%"), Product.supermarket == supermarket_code, Product.price.isnot(None))
        .order_by(Product.price)
        .first()
    )
    if prod:
        return prod
    # Fall back to contains match
    return (
        db.query(Product)
        .filter(Product.product_name.ilike(f"%{term}%"), Product.supermarket == supermarket_code, Product.price.isnot(None))
        .order_by(Product.price)
        .first()
    )


@router.get("/products/rankings")
async def get_product_rankings(
    type: str = "cheapest_basket",
    limit: int = 20,
    db: Session = Depends(get_db),
):
    """Product rankings for landing page content. Public endpoint."""
    from sqlalchemy import func as sqlfunc
    from app.services.supermarket_registry import supermarket_registry
    active_codes = sorted(supermarket_registry.get_all_codes())  # sorted list for indexing

    if type == "cheapest_basket":
        # Compare basic basket products across supermarkets
        basket_items = []
        totals = {code: 0.0 for code in active_codes}

        for display_name, search_terms in BASIC_BASKET:
            item_data = {"name": display_name}
            for code in active_codes:
                product = None
                for term in search_terms:
                    product = _find_cheapest_product(db, term, code)
                    if product:
                        break
                if product:
                    price = round(float(product.price), 2)
                    item_data[code.lower()] = {
                        "product_name": product.product_name,
                        "price": price,
                        "brand": product.brand,
                        "image_url": product.image_url,
                    }
                    totals[code] += price
                else:
                    item_data[code.lower()] = None

            # Determine cheaper
            prices = {code: item_data.get(code.lower(), {}).get("price") for code in active_codes if item_data.get(code.lower())}
            if len(prices) >= 2:
                cheaper_code = min(prices, key=lambda k: prices[k] or 999)
                item_data["cheaper"] = cheaper_code
            basket_items.append(item_data)

        # Round totals
        for code in totals:
            totals[code] = round(totals[code], 2)

        cheapest_super = min(totals, key=totals.get) if totals else None

        return {
            "type": "cheapest_basket",
            "items": basket_items,
            "totals": totals,
            "cheapest": cheapest_super,
            "savings": round(max(totals.values()) - min(totals.values()), 2) if totals else 0,
        }

    elif type == "biggest_savings":
        # Find common products with biggest price difference using BASIC_BASKET + popular items
        if len(active_codes) < 2:
            return {"type": "biggest_savings", "items": []}

        COMPARISON_ITEMS = [
            "leche entera", "agua mineral", "yogur natural", "pan molde",
            "tomate frito", "aceite girasol", "macarrones", "arroz",
            "huevos", "atun", "jamon cocido", "queso lonchas",
            "mantequilla", "cafe molido", "galletas", "zumo naranja",
            "cerveza", "detergente", "papel higienico", "gel ducha",
        ]

        code_a, code_b = active_codes[0], active_codes[1]
        items = []

        for concept in COMPARISON_ITEMS:
            prod_a = _find_cheapest_product(db, concept, code_a)
            prod_b = _find_cheapest_product(db, concept, code_b)
            if prod_a and prod_b:
                diff = abs(float(prod_a.price) - float(prod_b.price))
                if diff > 0.10:
                    cheaper = code_a if float(prod_a.price) <= float(prod_b.price) else code_b
                    items.append({
                        "concept": concept.title(),
                        code_a.lower(): {"product_name": prod_a.product_name, "price": round(float(prod_a.price), 2), "brand": prod_a.brand, "image_url": prod_a.image_url},
                        code_b.lower(): {"product_name": prod_b.product_name, "price": round(float(prod_b.price), 2), "brand": prod_b.brand, "image_url": prod_b.image_url},
                        "cheaper": cheaper,
                        "savings": round(diff, 2),
                    })

        items.sort(key=lambda x: x["savings"], reverse=True)
        return {"type": "biggest_savings", "items": items[:limit]}

    elif type == "most_offers":
        # Products with biggest REAL discounts — filter out PUM-as-original-price
        products = (
            db.query(Product)
            .filter(
                Product.is_on_offer == 1,
                Product.supermarket.in_(active_codes),
                Product.discount_percentage.isnot(None),
                Product.discount_percentage <= 60,  # cap: anything >60% is data error
                Product.price.isnot(None),
                Product.original_price.isnot(None),
                Product.original_price <= Product.price * 5,  # reject PUM-as-price
            )
            .order_by(Product.discount_percentage.desc())
            .limit(limit)
            .all()
        )

        return {
            "type": "most_offers",
            "items": [
                {
                    "product_name": p.product_name,
                    "brand": p.brand,
                    "supermarket": p.supermarket,
                    "price": round(float(p.price), 2),
                    "original_price": round(float(p.original_price), 2) if p.original_price else None,
                    "discount": round(float(p.discount_percentage), 1),
                    "image_url": p.image_url,
                    "category": p.ai_category,
                }
                for p in products
            ],
        }

    return {"error": "Invalid type. Use: cheapest_basket, biggest_savings, most_offers"}