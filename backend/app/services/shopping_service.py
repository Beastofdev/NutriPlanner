import logging
import re
from collections import defaultdict
from typing import Any, Dict, List, Optional, Set, Tuple

from sqlalchemy.orm import Session

from app.db import models
from app.services.cleaner import ingredient_cleaner
from app.services.unit_normalizer import unit_normalizer
from app.utils.ingredient_normalizer import fuzzy_match_ingredient, normalize_ingredient_name

logger = logging.getLogger("NutriPlanner.ShoppingService")

class ShoppingService:
    """Servicio de construcción y mantenimiento de la ShoppingList en DB."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def _extract_quantity_and_unit(self, raw_name: str) -> Tuple[float, str, str]:
        """Extrae cantidad, unidad y texto limpio de un ingrediente en crudo."""
        if not raw_name:
            return 1.0, "ud", ""
        clean = raw_name.strip()
        quantity = 1.0
        unit = "ud"

        qty_pattern = (
            r"^(\d+(?:[.,]\d+)?)\s*"
            r"(g|gr|kg|ml|l|ud|uds|unidad|unidades|piezas?|lonchas?"
            r"|cucharadas?|cucharaditas?|cda|cdta|tazas?|vasos?"
            r"|rebanadas?|filetes?)?"
            r"\s*(de\s+)?"
        )
        match = re.match(qty_pattern, clean, re.IGNORECASE)

        if match:
            try:
                quantity = float(match.group(1).replace(",", "."))
                if match.group(2):
                    unit_map = {
                        "gr": "g",
                        "gramos": "g",
                        "kilos": "kg",
                        "litro": "l",
                        "pieza": "ud",
                    }
                    raw_unit = match.group(2).lower()
                    unit = unit_map.get(raw_unit, raw_unit)
                clean = clean[match.end() :].strip()
            except Exception:
                pass

        return quantity, unit, clean

    def _clean_ingredient_name(self, raw_name: str) -> Dict[str, Any]:
        """
        Limpieza centralizada usando IngredientCleaner.
        Extrae cantidad/unidad y delega la limpieza de texto al cleaner.
        """
        if not raw_name:
            return {
                "display_name": "",
                "search_term": "",
                "quantity": 1.0,
                "unit": "ud",
                "hints": [],
            }

        try:
            quantity, unit, text_without_qty = self._extract_quantity_and_unit(raw_name)

            clean_name = ingredient_cleaner.clean(text_without_qty)

            display_name = clean_name.capitalize() if clean_name else text_without_qty

            return {
                "display_name": display_name,
                "search_term": clean_name,
                "quantity": quantity,
                "unit": unit,
                "specificity_hints": [],
            }
        except Exception as e:
            logger.error("Error cleaning ingredient '%s': %s", raw_name, e)
            return {
                "display_name": raw_name,
                "search_term": raw_name,
                "quantity": 1.0,
                "unit": "ud",
                "hints": [],
            }

    def _detect_category(self, name: str) -> str:
        """Clasifica un ingrediente en una categoría amplia de supermercado."""
        n = name.lower()
        if any(
            x in n
            for x in [
                "pollo",
                "ternera",
                "cerdo",
                "carne",
                "pavo",
                "lomo",
                "solomillo",
                "hamburguesa",
            ]
        ):
            return "Carnicería"
        if any(
            x in n for x in ["jamon", "chorizo", "pavo", "fuet", "queso", "salchichon"]
        ):
            return "Charcutería y Quesos"
        if any(
            x in n
            for x in ["merluza", "salmon", "atun", "pescado", "gamba", "bacalao"]
        ):
            return "Pescadería"
        if any(x in n for x in ["leche", "yogur", "mantequilla", "huevo"]):
            return "Lácteos y Huevos"
        if any(
            x in n
            for x in [
                "tomate",
                "lechuga",
                "fruta",
                "verdura",
                "patata",
                "cebolla",
                "ajo",
            ]
        ):
            return "Frutas y Verduras"
        if any(x in n for x in ["pan", "bollo", "tostada", "harina"]):
            return "Panadería"
        if any(x in n for x in ["detergente", "limpiador", "papel", "fregasuelos"]):
            return "Limpieza y Hogar"
        return "Despensa"

    # --- Métodos CRUD / principales ---
    def create_list_from_menu(
        self,
        user_id: int,
        menu_data: Dict[str, Any],
        pantry_items: Optional[List[Any]] = None,
    ) -> Dict[str, Any]:
        """
        Crea la shopping list desde un menú semanal con agregación correcta.

        1. Limpia la lista activa del usuario.
        2. Extrae ingredientes del menú.
        3. Agrega cantidades normalizando unidades.
        4. Excluye ingredientes que ya están en despensa.
        """
        pantry_items = pantry_items or []
        # Limpiar lista anterior / obtener activa
        active_list = (
            self.db.query(models.ShoppingList)
            .filter(
                models.ShoppingList.user_id == user_id,
                models.ShoppingList.is_archived.is_(False),
            )
            .first()
        )

        if not active_list:
            active_list = models.ShoppingList(user_id=user_id, name="Lista Semanal")
            self.db.add(active_list)
            self.db.commit()
        else:
            (
                self.db.query(models.ShoppingListItem)
                .filter(models.ShoppingListItem.shopping_list_id == active_list.id)
                .delete()
            )

        # [MEJORADO] Normalizar pantry_items con fuzzy matching
        # Guardar tanto nombre original como normalizado para matching
        pantry_items_normalized = []
        for p in pantry_items:
            if isinstance(p, str):
                original = p
            elif isinstance(p, dict):
                original = p.get("name", p.get("n", ""))
            else:
                continue

            if original:
                normalized = normalize_ingredient_name(original)
                pantry_items_normalized.append({
                    'original': original,
                    'normalized': normalized
                })

        logger.info(f"[INVENTARIO] Procesando {len(pantry_items_normalized)} items del inventario")

        # PHASE 1: Extract ALL ingredients from menu
        all_ingredients = self._extract_all_ingredients(menu_data)
        logger.info(
            "Extracted %d ingredient mentions from menu",
            len(all_ingredients),
        )

        # PHASE 2: Aggregate by canonical_name WITH UNIT NORMALIZATION
        aggregated = self._aggregate_with_unit_normalization(
            all_ingredients,
            pantry_items_normalized,  # Ahora pasamos la lista completa
        )
        logger.info(
            "Aggregated to %d unique ingredients",
            len(aggregated),
        )

        # PHASE 3: Save to database (con FUZZY MATCHING mejorado)
        pantry_excluded: List[str] = []
        for canonical_name, data in aggregated.items():
            # Intentar match con items del inventario usando fuzzy matching
            is_in_pantry = False
            matched_pantry_item = None

            for pantry_item in pantry_items_normalized:
                # Usar fuzzy matching con threshold de 80
                result = fuzzy_match_ingredient(
                    pantry_item['original'],
                    data["display_name"],
                    threshold=80
                )

                if result['match']:
                    is_in_pantry = True
                    matched_pantry_item = pantry_item['original']
                    logger.info(
                        f"[INVENTARIO] ✓ Match encontrado: '{data['display_name']}' "
                        f"<-> '{matched_pantry_item}' (score={result['score']}, method={result['method']})"
                    )
                    break

            if is_in_pantry:
                pantry_excluded.append(data["display_name"])
                continue

            # [DEBUG] Log para verificar canonical_name
            logger.info(f"[CANONICAL] Guardando item: name='{data['display_name']}', canonical_name='{canonical_name}'")

            new_item = models.ShoppingListItem(
                shopping_list_id=active_list.id,
                name=data["display_name"],
                canonical_name=canonical_name,  # [FIX] Guardar canonical_name para búsqueda precisa
                quantity=data["quantity"],
                unit=data["unit"],
                category=data["category"],
                is_checked=False,
            )
            self.db.add(new_item)

        self.db.commit()

        if pantry_excluded:
            logger.info("Excluded %d items from pantry", len(pantry_excluded))

        return {
            "items_added": len(aggregated) - len(pantry_excluded),
            "pantry_excluded": pantry_excluded,
        }

    def _extract_all_ingredients(
        self,
        menu_data: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        """
        Extrae todas las menciones de ingredientes del menú semanal.

        Devuelve lista de dicts con canonical_name/qty/unit/display_name.
        """
        all_ingredients: List[Dict[str, Any]] = []
        days = menu_data.get("menu", [])

        meal_keys = ["desayuno", "almuerzo", "comida", "merienda", "cena"]

        for day_idx, day in enumerate(days):
            day_name = day.get("dia", f"Día {day_idx + 1}")
            
            for meal_key in meal_keys:
                meal = day.get(meal_key)
                if not meal:
                    continue
                
                ingredients = meal.get("ingredientes", [])
                
                for ing_raw in ingredients:
                    # Parse with existing cleaner
                    parsed = self._clean_ingredient_name(ing_raw)

                    if not parsed or not parsed.get('search_term'):
                        logger.warning(f"[EXTRACT] Ingrediente sin search_term: '{ing_raw}' -> {parsed}")
                        continue

                    # [DEBUG] Log para verificar procesamiento
                    logger.debug(f"[EXTRACT] '{ing_raw}' -> canonical_name='{parsed['search_term']}', display='{parsed['display_name']}'")

                    all_ingredients.append({
                        "canonical_name": parsed['search_term'],
                        "qty": parsed['quantity'],
                        "unit": parsed['unit'],
                        "display_name": parsed['display_name'],
                        "source": f"{day_name}/{meal_key}"
                    })
        
        return all_ingredients

    def _aggregate_with_unit_normalization(self, ingredients: list, pantry_items_normalized: list) -> dict:
        """
        Aggregate ingredients by canonical_name WITH UNIT NORMALIZATION.
        
        CRITICAL: Converts mixed units (2 ud + 300g) to base units before summing.
        
        Returns dict: {
            "verdura_tomate": {
                "quantity": 430,
                "unit": "g",
                "display_name": "Tomate",
                "category": "Verduras"
            }
        }
        """
        # Group by canonical_name first
        grouped = defaultdict(list)
        for ing in ingredients:
            canonical = ing['canonical_name']
            grouped[canonical].append(ing)
        
        aggregated = {}
        
        for canonical_name, items in grouped.items():
            # Step 1: Detect all units used for this ingredient
            units_used = [item['unit'] for item in items]
            
            # Step 2: Check for unit conflicts (g + ml together)
            has_conflict = unit_normalizer.detect_unit_conflict(units_used)
            
            if has_conflict:
                logger.warning(f"Unit conflict detected for '{canonical_name}': {units_used}. Using first unit.")
            
            # Step 3: Normalize all to same base unit
            normalized_items = []
            for item in items:
                qty_normalized, unit_normalized = unit_normalizer.normalize_unit(
                    item['qty'],
                    item['unit'],
                    canonical_name
                )
                normalized_items.append({
                    "qty_base": qty_normalized,
                    "unit_base": unit_normalized,
                    "display_name": item['display_name']
                })
            
            # Step 4: Group by base unit and sum
            by_base_unit = defaultdict(float)
            display_names = set()
            
            for norm_item in normalized_items:
                by_base_unit[norm_item['unit_base']] += norm_item['qty_base']
                display_names.add(norm_item['display_name'])
            
            # Step 5: Choose dominant unit (prefer g over ml, prefer larger total)
            if 'g' in by_base_unit and 'ml' in by_base_unit:
                # Mixed - should never happen after normalization, but log warning
                logger.error(f"Still mixed units after normalization for '{canonical_name}': {dict(by_base_unit)}")
                dominant_unit = 'g' if by_base_unit['g'] > by_base_unit['ml'] else 'ml'
            elif 'g' in by_base_unit:
                dominant_unit = 'g'
            elif 'ml' in by_base_unit:
                dominant_unit = 'ml'
            elif 'ud' in by_base_unit:
                # All were units, converted to weight
                dominant_unit = list(by_base_unit.keys())[0]
            else:
                dominant_unit = list(by_base_unit.keys())[0]
            
            total_qty = by_base_unit[dominant_unit]
            
            # Step 6: Round intelligently
            if dominant_unit == 'ud':
                final_qty = round(total_qty)  # Round to nearest int for units
            else:
                final_qty = round(total_qty, 1)  # One decimal for g/ml
            
            # Step 7: Store aggregated result
            aggregated[canonical_name] = {
                "quantity": final_qty,
                "unit": dominant_unit,
                "display_name": list(display_names)[0] if display_names else canonical_name.title(),
                "category": self._detect_category(canonical_name)
            }
            
            logger.debug(f"Aggregated '{canonical_name}': {len(items)} mentions -> {final_qty}{dominant_unit}")
        
        return aggregated

    def get_items_for_comparator(self, user_id: int) -> list:
        active_list = self.db.query(models.ShoppingList).filter(
            models.ShoppingList.user_id == user_id,
            models.ShoppingList.is_archived .is_(False)
        ).first()

        if not active_list: return []

        items = self.db.query(models.ShoppingListItem).filter(
            models.ShoppingListItem.shopping_list_id == active_list.id
        ).all()

        result = []
        for item in items:
            # Aquí podríamos volver a limpiar si quisiéramos asegurarnos,
            # pero como ya guardamos el nombre limpio/display, usamos ese.
            # Sin embargo, para buscar, usamos el nombre guardado.
            # OJO: Si guardaste "Pechuga de pollo", clean() lo dejará igual (lo cual es correcto).
            # Si guardaste "Trozo de jengibre" (con el código viejo), al recuperarlo aquí,
            # DEBERÍAMOS limpiarlo otra vez por si acaso es una lista vieja.
            
            clean_search_term = ingredient_cleaner.clean(item.name)
            
            result.append({
                "name": clean_search_term,
                "display_name": item.name,
                "canonical_name": item.canonical_name,  # [FIX] Para búsqueda precisa en comparador
                "quantity": item.quantity,
                "unit": item.unit,
                "category": item.category
            })
        return result
    
    def update_ingredients_for_dish(self, user_id: int, old_ingredients: list, new_ingredients: list):
        """
        Actualiza la lista de compra cuando se regenera un plato.
        Elimina los ingredientes antiguos y añade los nuevos.
        """
        try:
            active_list = self.db.query(models.ShoppingList).filter(
                models.ShoppingList.user_id == user_id,
                models.ShoppingList.is_archived .is_(False)
            ).first()

            if not active_list:
                return {"success": False, "message": "No hay lista activa"}

            removed_count = 0
            added_count = 0

            # 1. Eliminar ingredientes antiguos (si existen)
            if old_ingredients:
                for old_ing in old_ingredients:
                    parsed = self._clean_ingredient_name(old_ing)
                    search_term = parsed['search_term'].lower()

                    # Buscar item similar en la lista
                    items = self.db.query(models.ShoppingListItem).filter(
                        models.ShoppingListItem.shopping_list_id == active_list.id
                    ).all()

                    for item in items:
                        if search_term in item.name.lower():
                            self.db.delete(item)
                            removed_count += 1
                            break

            # 2. Añadir nuevos ingredientes
            if new_ingredients:
                for new_ing in new_ingredients:
                    parsed = self._clean_ingredient_name(new_ing)
                    if not parsed['search_term']:
                        continue

                    # Verificar si ya existe
                    existing = self.db.query(models.ShoppingListItem).filter(
                        models.ShoppingListItem.shopping_list_id == active_list.id,
                        models.ShoppingListItem.name.ilike(f"%{parsed['search_term']}%")
                    ).first()

                    if existing:
                        existing.quantity += parsed['quantity']
                    else:
                        new_item = models.ShoppingListItem(
                            shopping_list_id=active_list.id,
                            name=parsed['display_name'],
                            quantity=parsed['quantity'],
                            unit=parsed['unit'],
                            category=self._detect_category(parsed['search_term']),
                            is_checked=False
                        )
                        self.db.add(new_item)
                        added_count += 1

            self.db.commit()
            return {
                "success": True,
                "message": f"Lista actualizada: -{removed_count} +{added_count} ingredientes"
            }

        except Exception as e:
            self.db.rollback()
            return {"success": False, "message": str(e)}

    def create_list_from_aggregated_v2(
        self,
        user_id: int,
        shopping_list: List[Dict[str, Any]],
        pantry_items: Optional[List[Any]] = None,
    ) -> Dict[str, Any]:
        """
        [V2] Crea la shopping list desde una lista ya agregada (con product_ids y canonical_names).

        Args:
            user_id: ID del usuario
            shopping_list: Lista agregada del aggregator V2
            pantry_items: Items del inventario para excluir

        Returns:
            Dict con items_added y pantry_excluded
        """
        pantry_items = pantry_items or []

        # Limpiar lista anterior / obtener activa
        active_list = (
            self.db.query(models.ShoppingList)
            .filter(
                models.ShoppingList.user_id == user_id,
                models.ShoppingList.is_archived.is_(False),
            )
            .first()
        )

        if not active_list:
            active_list = models.ShoppingList(user_id=user_id, name="Lista Semanal")
            self.db.add(active_list)
            self.db.commit()
        else:
            # Limpiar items anteriores
            (
                self.db.query(models.ShoppingListItem)
                .filter(models.ShoppingListItem.shopping_list_id == active_list.id)
                .delete()
            )

        pantry_excluded: List[str] = []

        for item in shopping_list:
            product_name = item.get("name", "Producto desconocido")
            canonical_name = item.get("canonical_name", "")
            total_qty = item.get("total_qty", 1.0)
            unit = item.get("unit", "ud")

            # Detectar categoría del producto
            category = self._detect_category(canonical_name if canonical_name else product_name)

            # Verificar si está en inventario (fuzzy matching)
            is_in_pantry = False
            for pantry_item in pantry_items:
                pantry_name = pantry_item if isinstance(pantry_item, str) else pantry_item.get("name", "")
                if pantry_name and (
                    pantry_name.lower() in product_name.lower() or
                    product_name.lower() in pantry_name.lower()
                ):
                    is_in_pantry = True
                    pantry_excluded.append(product_name)
                    logger.info(f"[V2 INVENTARIO] Excluyendo '{product_name}' (ya en inventario)")
                    break

            if is_in_pantry:
                continue

            # [DEBUG] Log para verificar guardado
            logger.info(f"[V2 CANONICAL] Guardando item: name='{product_name}', canonical_name='{canonical_name}'")

            new_item = models.ShoppingListItem(
                shopping_list_id=active_list.id,
                name=product_name,
                canonical_name=canonical_name,  # [FIX] Guardar canonical_name del producto
                quantity=total_qty,
                unit=unit,
                category=category,
                is_checked=False,
            )
            self.db.add(new_item)

        self.db.commit()

        if pantry_excluded:
            logger.info(f"[V2] Excluded {len(pantry_excluded)} items from pantry")

        return {
            "items_added": len(shopping_list) - len(pantry_excluded),
            "pantry_excluded": pantry_excluded,
        }