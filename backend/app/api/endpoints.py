import hashlib
import logging
import sys
import time  # Import time for metrics
from pathlib import Path
from typing import Any, Dict, List

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

logger = logging.getLogger("NutriPlanner.Endpoints")

from app.api.auth import get_admin_user, get_current_user, get_optional_user
from app.db import models
from app.db.database import get_db
from app.schemas import (
    ComparisonItemRequest,
    IngredientsList,
    RecipeRequest,
    WeeklyMenuRequest,
)
from app.services.aggregator import ShoppingListAggregator
from app.services.comparator import Comparator
# Fix Windows encoding (solo si está disponible)
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

router = APIRouter()

comparator = Comparator()
aggregator = ShoppingListAggregator()

# --- RUTAS DE LISTA DE LA COMPRA (DB) ---

@router.get("/shopping-list")
def get_shopping_list(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Devuelve la lista guardada en DB por el Planner."""
    shopping_list = (
        db.query(models.ShoppingList)
        .filter(
            models.ShoppingList.user_id == current_user.id,
            models.ShoppingList.is_archived.is_(False),
        )
        .first()
    )
    
    if not shopping_list:
        return {"categories": {}}
        
    categories: Dict[str, List[Dict[str, Any]]] = {}
    for item in shopping_list.items:
        cat = item.category or "Otros"
        categories.setdefault(cat, []).append(
            {
                "id": item.id,
                "name": item.name,
                "canonical_name": item.canonical_name,  # [FIX] Para búsqueda precisa en comparador
                "quantity": item.quantity,
                "unit": item.unit,
                "is_checked": item.is_checked,
                "category": cat,
            }
        )

    return {"categories": categories}

@router.patch("/shopping-list/{item_id}/toggle")
def toggle_shopping_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Alterna el estado de 'is_checked' de un item de la lista de la compra."""
    item = (
        db.query(models.ShoppingListItem)
        .join(models.ShoppingList)
        .filter(
            models.ShoppingListItem.id == item_id,
            models.ShoppingList.user_id == current_user.id,
        )
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item no encontrado")
        
    item.is_checked = not item.is_checked
    db.commit()
    return {"status": "updated", "is_checked": item.is_checked}

# --- RUTAS DEL COMPARADOR Y AGREGADOR (CORE) ---

@router.post("/compare")
async def compare_prices(
    data: List[ComparisonItemRequest],
    current_user=Depends(get_optional_user),  # Permite guest
):
    """
    Recibe ingredientes con cantidades exactas (total_qty) y busca precios.
    """
    try:
        # Convertimos los modelos Pydantic a diccionarios para el servicio
        items_to_compare = [item.model_dump() for item in data]
        return await comparator.bulk_compare(items_to_compare)
    except Exception as e:
        logger.error("Endpoint Compare: %s", e)
        raise HTTPException(status_code=500, detail="Error comparando precios")

@router.post("/compare-optimized")
async def compare_prices_optimized(
    data: IngredientsList,
    current_user=Depends(get_optional_user),  # Permite guest
):
    """
    Endpoint optimizado para comparación de precios.
    Acepta lista de strings y los convierte al formato esperado por el comparador.
    """
    try:
        # Convertir strings a dicts para compatibilidad con bulk_compare
        items_as_dicts = [
            {"name": ing, "total_qty": 1.0, "unit": "ud"} for ing in data.ingredients
        ]
        return await comparator.bulk_compare(items_as_dicts)
    except Exception as e:
        logger.error("Compare Optimized: %s", e)
        raise HTTPException(status_code=500, detail="Error en comparación optimizada")

@router.post("/aggregate-shopping-list")
async def aggregate_shopping_list(
    data: WeeklyMenuRequest,
    current_user=Depends(get_optional_user),  # Permite guest
):
    """
    Flujo completo: Menú -> Agregación -> Comparación.
    """
    try:
        # 1. Agregación (textual + matemática)
        consolidated = aggregator.aggregate_weekly_plan(data.menu)

        # 2. Preparación para comparador (objetos ricos)
        comparison_ready = aggregator.get_comparison_ready_list(consolidated)

        # 3. Comparación de precios (SQL híbrido)
        comparison = await comparator.bulk_compare(comparison_ready)

        return {
            "consolidated_ingredients": consolidated,
            "comparison": comparison,
            "total_unique_ingredients": len(consolidated),
        }
    except Exception as e:
        logger.error("Aggregation: %s", e)
        raise HTTPException(
            status_code=500,
            detail="Error agregando lista de la compra",
        )

@router.post("/aggregate-ingredients-only")
def aggregate_ingredients_only(
    data: WeeklyMenuRequest,
    current_user=Depends(get_optional_user),  # Permite guest
):
    """
    Versión solo agregación textual rápida (sin llamadas externas).
    """
    try:
        start_time = time.time()
        consolidated = aggregator.aggregate_weekly_plan(data.menu)
        elapsed_ms = (time.time() - start_time) * 1000
        logger.debug("Aggregate-only completed in %.2fms", elapsed_ms)

        return {
            "consolidated_ingredients": consolidated,
            "total_unique_ingredients": len(consolidated),
            "processing_time_ms": round(elapsed_ms, 2),
        }
    except Exception as e:
        logger.error("Aggregation-Only: %s", e)
        raise HTTPException(
            status_code=500,
            detail="Error agregando lista (solo agregación)",
        )

# --- RUTAS DE CACHÉ Y ADMIN ---

@router.get("/cache-stats")
async def get_cache_stats(current_user=Depends(get_admin_user)):
    """Solo administradores pueden ver stats de caché."""
    try:
        # Asumiendo que comparator tiene acceso a la cache
        if hasattr(comparator, "persistent_cache"):
            stats = comparator.persistent_cache.get_stats()
            return {"status": "ok", "cache_stats": stats, "cache_enabled": True}
        return {
            "status": "ok",
            "message": "Cache no configurada en este comparador",
            "cache_enabled": False,
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

@router.post("/cache-clear")
async def clear_cache(current_user=Depends(get_admin_user)):
    """Solo administradores pueden limpiar caché."""
    try:
        if hasattr(comparator, "persistent_cache"):
            comparator.persistent_cache.clear()
            return {"status": "ok", "message": "Cache limpiado exitosamente"}
        return {"status": "error", "message": "No cache to clear"}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error limpiando cache")

# --- ENDPOINT DE DIAGNÓSTICO ---

@router.post("/debug-menu-analysis")
def debug_menu_analysis(
    data: WeeklyMenuRequest,
    current_user=Depends(get_admin_user),
):
    """
    [DEBUG] Analiza el menú y muestra exactamente qué ingredientes se extraen
    y cómo se agregan las cantidades.
    """
    try:
        results: Dict[str, Any] = {
            "raw_ingredients_by_day": [],
            "aggregated_totals": [],
            "issues_detected": [],
        }

        meal_keys = ["desayuno", "almuerzo", "comida", "merienda", "cena"]

        # 1. Extraer ingredientes día por día
        for day_idx, day in enumerate(data.menu):
            day_data: Dict[str, Any] = {
                "dia": day.get("dia", f"Día {day_idx + 1}"),
                "meals": {},
            }

            for meal_key in meal_keys:
                meal = day.get(meal_key)
                if not meal:
                    continue

                ingredients_raw = meal.get("ingredientes", [])
                parsed_ingredients = []

                for ing in ingredients_raw:
                    # Mostrar formato original
                    if isinstance(ing, dict):
                        ing_str = ing.get("n") or ing.get("name") or str(ing)
                        original_format = f"DICT: {ing}"
                    else:
                        ing_str = str(ing)
                        original_format = f"STRING: {ing_str}"

                    # Parsear con el agregador
                    qty, unit, name = aggregator._parse_ingredient_string(ing_str)

                    parsed_ingredients.append(
                        {
                            "original": original_format,
                            "parsed": {"qty": qty, "unit": unit, "name": name},
                        }
                    )

                    # Detectar problemas
                    if unit == "ud" and any(x in ing_str.lower() for x in ["ml", "g ", "kg", "litro"]):
                        results["issues_detected"].append(
                            f"Posible problema: '{ing_str}' parseado como 'ud' pero parece tener unidades"
                        )

                day_data["meals"][meal_key] = {
                    "dish": meal.get("nombre", "?"),
                    "ingredients": parsed_ingredients
                }

            results["raw_ingredients_by_day"].append(day_data)

        # 2. Agregar totales
        consolidated = aggregator.aggregate_weekly_plan(data.menu)
        results["aggregated_totals"] = consolidated

        # 3. Detectar problemas de cantidades
        for item in consolidated:
            name = item.get("name", "").lower()
            qty = item.get("total_qty", 0)
            unit = item.get("unit", "ud")

            # Aceite: si es "ud" y no tiene cantidad en ml, es sospechoso
            if "aceite" in name and unit == "ud":
                results["issues_detected"].append(
                    f"Posible problema: '{name}' tiene unidad 'ud' - debería ser 'ml'"
                )

            # Cantidades muy bajas que sugieren fallo de parsing
            if qty == 1 and unit == "ud" and any(x in name for x in ["aceite", "leche", "arroz", "pasta"]):
                results["issues_detected"].append(
                    f"Posible problema: '{name}' tiene qty=1 ud - posible fallo de agregación"
                )

        return results

    except Exception as e:
        logger.error("Debug Menu: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Error en debug de análisis de menú",
        )


# ==========================================
# ANALYTICS DASHBOARD (FASE 2C - B2B Metrics)
# ==========================================
@router.get("/analytics/dashboard")
async def get_analytics_dashboard(db: Session = Depends(get_db), current_user=Depends(get_admin_user)):
    """
    B2B dashboard metrics for Consum.
    Returns key business metrics about the platform.
    Resilient to missing tables (returns 0 for unavailable metrics).
    """
    from sqlalchemy import func, text

    def safe_scalar(query, default=0):
        try:
            return query.scalar() or default
        except Exception:
            return default

    def safe_execute(sql, default=None):
        try:
            return db.execute(text(sql)).fetchall()
        except Exception:
            return default or []

    # User metrics
    total_users = safe_scalar(db.query(func.count(models.User.id)))
    active_users_7d = safe_execute(
        "SELECT COUNT(DISTINCT user_id) FROM daily_tracking WHERE date >= date('now', '-7 days')"
    )
    active_users_7d = active_users_7d[0][0] if active_users_7d else 0

    # Menu generation metrics
    total_plans = 0
    try:
        total_plans = safe_scalar(db.query(func.count(models.PlanHistory.id)))
    except Exception:
        pass

    # Recipe metrics
    total_recipes = safe_scalar(db.query(func.count(models.Recipe.id)))
    top_recipes = safe_execute("""
        SELECT r.name, COUNT(dp.id) as uses
        FROM recipes r
        JOIN daily_plans dp ON dp.recipe_id = r.id
        GROUP BY r.id, r.name
        ORDER BY uses DESC
        LIMIT 10
    """)

    # Shopping metrics
    total_shopping_trips = 0
    total_spent = 0
    try:
        total_shopping_trips = safe_scalar(db.query(func.count(models.ShoppingHistory.id)))
        result = safe_execute("SELECT COALESCE(SUM(total_cost), 0) FROM shopping_history")
        total_spent = result[0][0] if result else 0
    except Exception:
        pass
    avg_basket = total_spent / max(total_shopping_trips, 1)

    # Product catalog metrics
    total_products = safe_scalar(
        db.query(func.count(models.Product.id))
    )
    products_on_offer = safe_scalar(
        db.query(func.count(models.Product.id)).filter(
            models.Product.is_on_offer == 1,
        )
    )
    mapped_products = safe_scalar(
        db.query(func.count(models.Product.id)).filter(models.Product.is_basic_ingredient == 1)
    )

    # Ingredient coverage
    total_ingredients = safe_scalar(db.query(func.count(models.Ingredient.id)))

    # Top ingredients from recipe usage
    top_ingredients = safe_execute("""
        SELECT ri.name, COUNT(*) as uses
        FROM recipe_ingredients ri
        GROUP BY ri.name
        ORDER BY uses DESC
        LIMIT 15
    """)

    # Rating stats
    likes = 0
    dislikes = 0
    total_ratings = 0
    try:
        total_ratings = safe_scalar(db.query(func.count(models.UserRecipeRating.id)))
        likes = safe_scalar(
            db.query(func.count(models.UserRecipeRating.id)).filter(
                models.UserRecipeRating.rating == "like"
            )
        )
        dislikes = safe_scalar(
            db.query(func.count(models.UserRecipeRating.id)).filter(
                models.UserRecipeRating.rating == "dislike"
            )
        )
    except Exception:
        pass

    return {
        "users": {
            "total": total_users,
            "active_7d": active_users_7d,
        },
        "menu": {
            "total_plans_generated": total_plans,
            "total_recipes": total_recipes,
            "top_recipes": [{"name": r[0], "uses": r[1]} for r in top_recipes],
        },
        "shopping": {
            "total_trips": total_shopping_trips,
            "total_revenue": round(float(total_spent), 2),
            "avg_basket": round(float(avg_basket), 2),
        },
        "catalog": {
            "total_products": total_products,
            "mapped_to_recipes": mapped_products,
            "on_offer": products_on_offer,
            "total_ingredients": total_ingredients,
        },
        "engagement": {
            "total_ratings": total_ratings,
            "likes": likes,
            "dislikes": dislikes,
            "satisfaction_rate": round(likes / max(likes + dislikes, 1) * 100, 1),
        },
        "top_ingredients": [{"name": r[0], "uses": r[1]} for r in top_ingredients],
    }


# ==========================================
# IMAGE PROXY — Cache Consum CDN images
# ==========================================

_PRODUCT_IMAGES_DIR = Path(__file__).parent.parent.parent / "data" / "product_images"
_PRODUCT_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
_PLACEHOLDER_PATH = Path(__file__).parent.parent.parent / "static" / "placeholder_product.svg"


@router.get("/proxy-image")
async def proxy_image(url: str):
    """Proxy and cache product images from Consum CDN to avoid 403/404."""
    if not url or not url.startswith("http"):
        raise HTTPException(status_code=400, detail="Invalid URL")

    # Domain allowlist — only proxy Consum CDN images
    from urllib.parse import urlparse
    allowed_domains = {"tienda.consum.es", "tiendaonline.consum.es", "cdn-consum.aktiosdigitalservices.com", "img.consum.es", "s3.consum.es", "www.consum.es", "consum.es"}
    parsed = urlparse(url)
    if parsed.hostname not in allowed_domains:
        raise HTTPException(status_code=403, detail="Domain not allowed")

    # Generate cache key from URL
    url_hash = hashlib.md5(url.encode()).hexdigest()
    cached_path = _PRODUCT_IMAGES_DIR / f"{url_hash}.jpg"

    # Serve from cache if available
    if cached_path.exists() and cached_path.stat().st_size > 100:
        return FileResponse(cached_path, media_type="image/jpeg")

    # Fetch from CDN
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            resp = await client.get(url, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Referer": "https://tienda.consum.es/",
                "Accept": "image/*",
            })
            if resp.status_code == 200 and len(resp.content) > 100:
                cached_path.write_bytes(resp.content)
                return FileResponse(cached_path, media_type=resp.headers.get("content-type", "image/jpeg"))
    except Exception:
        pass

    # Return placeholder on failure
    if _PLACEHOLDER_PATH.exists():
        return FileResponse(_PLACEHOLDER_PATH, media_type="image/svg+xml")
    raise HTTPException(status_code=404, detail="Image not available")