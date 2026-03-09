import logging
import math
import re
import time
from collections import defaultdict
from typing import Any, Dict, List, Tuple

from sqlalchemy import text

from app.db.database import SessionLocal

logger = logging.getLogger("NutriPlanner.Aggregator")

_CACHE_TTL_SECONDS = 300  # 5 minutes


class ShoppingListAggregator:
    """Agregador de ingredientes para generar listas de la compra (V1 y V2)."""

    # Cache de mapeo canonical_name -> recipe_name
    _recipe_name_cache: Dict[str, str] | None = None
    _recipe_name_cache_ts: float = 0.0

    @classmethod
    def _load_recipe_names(cls) -> Dict[str, str]:
        """Carga el mapeo canonical_name -> recipe_name de la DB (con cache TTL)."""
        now = time.monotonic()
        if cls._recipe_name_cache is not None and (now - cls._recipe_name_cache_ts) < _CACHE_TTL_SECONDS:
            return cls._recipe_name_cache

        session = SessionLocal()
        try:
            results = session.execute(
                text(
                    """
                SELECT LOWER(canonical_name), recipe_name
                FROM products
                WHERE recipe_name IS NOT NULL
                AND canonical_name IS NOT NULL
            """
                )
            ).fetchall()

            cls._recipe_name_cache = {row[0]: row[1] for row in results}
            cls._recipe_name_cache_ts = time.monotonic()
            logger.info(
                "[AGGREGATOR] Cargados %d recipe_names",
                len(cls._recipe_name_cache),
            )
            return cls._recipe_name_cache
        except Exception as e:
            logger.warning("[AGGREGATOR] Error cargando recipe_names: %s", e)
            return {}
        finally:
            session.close()

    # Unit conversions delegated to unit_normalizer (single source of truth)
    @property
    def UNIT_CONVERSIONS(self) -> Dict[str, Tuple[str, float]]:
        from app.services.unit_normalizer import unit_normalizer
        return unit_normalizer.UNIT_CONVERSIONS

    def aggregate_weekly_plan(
        self,
        menu: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Agrega ingredientes a partir de un menú V1 (texto)."""
        all_ingredients = self._extract_all_ingredients(menu)
        grouped = self._group_by_canonical_name(all_ingredients)
        consolidated = self._sum_quantities(grouped)
        return consolidated

    def _extract_all_ingredients(
        self,
        menu: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Extrae todos los ingredientes del menú V1 en una lista normalizada."""
        all_ingredients: List[Dict[str, Any]] = []
        meal_keys = ["desayuno", "almuerzo", "comida", "merienda", "cena"]

        blacklist = ["ingrediente", "no especificado", "n:", "q:", "undefined"]

        for day in menu:
            day_name = day.get("dia", "Día")
            for meal_key in meal_keys:
                meal = day.get(meal_key)
                if not meal:
                    continue

                ingredients = meal.get("ingredientes", [])
                if isinstance(ingredients, str):
                    ingredients = [ingredients]

                for ing_raw in ingredients:
                    # Puede ser string o dict {n:..., q:...}
                    if isinstance(ing_raw, dict):
                        ing_str = (
                            ing_raw.get("n")
                            or ing_raw.get("name")
                            or ing_raw.get("nombre")
                            or ""
                        )
                    else:
                        ing_str = str(ing_raw)

                    if not ing_str:
                        continue

                    qty, unit, name = self._parse_ingredient_string(ing_str)

                    # 1. Filtrar nombres demasiado cortos salvo excepciones
                    if len(name) < 2 and name.lower() not in ["té", "te", "sal"]:
                        continue

                    # 2. Filtrar basura típica de IA
                    if any(bad in name.lower() for bad in blacklist):
                        logger.warning(
                            "[AGGREGATOR] Eliminado ingrediente basura: %s",
                            name,
                        )
                        continue

                    all_ingredients.append(
                        {
                            "name": name,
                            "qty": qty,
                            "unit": unit,
                            "source": f"{day_name}/{meal_key}",
                        }
                    )
        return all_ingredients

    def _parse_ingredient_string(self, ing_str: str) -> Tuple[float, str, str]:
        """Parsea una cadena de ingrediente y devuelve (cantidad, unidad, nombre)."""
        if "{" in ing_str:
            ing_str = re.sub(r"[{}:'\"\[\]]", " ", ing_str)

        original = ing_str.strip()

        # 1. Regex para "(150g)"
        paren = re.search(r"\(([\d.,/]+)\s*([a-zA-Z]+)?\)", original)
        if paren:
            try:
                q = self._parse_number(paren.group(1))
                u = paren.group(2) or "ud"
                n = re.sub(r"\(.*?\)", "", original)
                return self._normalize(q, u, self._clean_name(n))
            except Exception:
                pass

        # 2. Regex estándar "150g de Pollo" o "150 g pollo"
        match = re.match(
            r"^([\d.,/]+(?:-[\d.,/]+)?)\s*([a-zA-Z]+)?\s*(?:de\s+)?(.+)$",
            original,
            re.IGNORECASE,
        )
        if match:
            q = self._parse_number(match.group(1))
            u = match.group(2) or "ud"
            n = match.group(3)
            return self._normalize(q, u, self._clean_name(n))

        # 3. Buscar cantidad al final: "Aceite_Oliva 15ml"
        match_end = re.search(r"(.+?)\s+([\d.,/]+)\s*([a-zA-Z]+)?\s*$", original)
        if match_end:
            n = match_end.group(1)
            q = self._parse_number(match_end.group(2))
            u = match_end.group(3) or "ud"
            return self._normalize(q, u, self._clean_name(n))

        # 4. Heurísticas para ingredientes comunes
        lower_orig = original.lower()

        if "aceite" in lower_orig:
            # Aceites: asumir 15ml por uso si no tiene cantidad
            return 15.0, "ml", self._clean_name(original)

        if any(
            x in lower_orig
            for x in ["sal", "pimienta", "ajo", "perejil", "oregano", "comino"]
        ):
            # Especias y condimentos: cantidades pequeñas
            return 5.0, "g", self._clean_name(original)

        # 5. Fallback "Pollo" -> 1 ud (para productos enteros)
        return 1.0, "ud", self._clean_name(re.sub(r"\(.*?\)", "", original))

    def _parse_number(self, s: str) -> float:
        """Convierte una cadena numérica en float, soportando fracciones y rangos."""
        try:
            s = s.replace(",", ".")
            if "/" in s:
                n, d = s.split("/")
                return float(n) / float(d)
            if "-" in s:
                return max(float(x) for x in s.split("-") if x.strip())
            return float(s)
        except Exception:
            return 1.0

    def _clean_name(self, name: str) -> str:
        """Limpia el nombre del ingrediente para uso canónico."""
        name = re.sub(r"^[^a-zA-ZáéíóúñÁÉÍÓÚÑ]+", "", name)
        name = re.sub(r"^de\s+", "", name, flags=re.IGNORECASE)
        return name.strip().capitalize()

    def _normalize(self, qty: float, unit: str, name: str) -> Tuple[float, str, str]:
        """Normaliza la unidad a su base (g/ml/ud) según UNIT_CONVERSIONS."""
        unit = unit.lower().strip()
        if unit in self.UNIT_CONVERSIONS:
            base_unit, factor = self.UNIT_CONVERSIONS[unit]
            return qty * factor, base_unit, name
        return qty, "ud", name

    # Mapeo de consolidación de ingredientes similares
    # Single source of truth — also used by _aggregate_v3_ingredients in planner.py
    CONSOLIDATION_MAP: Dict[str, str] = {
        # --- Texto plano → canonical ---
        "mantequilla": "lacteo_mantequilla",
        "mantequilla con sal": "lacteo_mantequilla",
        "mantequilla sin sal": "lacteo_mantequilla",
        "butter": "lacteo_mantequilla",
        "aceite oliva": "aceite_oliva_virgen_extra",
        "aceite de oliva": "aceite_oliva_virgen_extra",
        "aceite_oliva": "aceite_oliva_virgen_extra",
        "aove": "aceite_oliva_virgen_extra",
        "leche": "lacteo_leche_entera",
        "leche entera": "lacteo_leche_entera",
        "leche_entera": "lacteo_leche_entera",
        "leche_desnatada": "lacteo_leche_desnatada",
        "leche_semidesnatada": "lacteo_leche_semidesnatada",
        "sal": "condimento_sal_fina",
        "pimienta": "especia_pimienta_negra_molida",
        "pimienta negra": "especia_pimienta_negra_molida",
        "ajo": "verdura_ajo",
        "cebolla": "verdura_cebolla",
        "tomate": "verdura_tomate",
        "arroz": "cereal_arroz_redondo",
        "pasta": "pasta_espagueti",
        "huevos": "huevos",
        "huevo": "huevos",
        "huevo campero l": "huevos",
        "huevo campero l decena": "huevos",
        "huevo campero cocido 1/2 docena": "huevos",
        "huevo l/xl docena": "huevos",
        "huevos l grandes docena": "huevos",
        "huevos l grandes": "huevos",
        "huevos camperos l": "huevos",
        # Aceite consolidation
        "aceite oliva virgen extra": "aceite_oliva_virgen_extra",
        "aceite de oliva virgen extra": "aceite_oliva_virgen_extra",
        # --- Canonical → canonical (variantes en DB) ---
        "edamame": "legumbre_edamame",
        "fruta_arandano_entero": "fruta_arandanos",
        "huevos_camperos_medianos_grandes": "huevos",
        "huevos_medianos": "huevos",
        "legumbre_bote_garbanzo_cocido": "legumbre_garbanzo_cocido",
        "legumbre_bote_alubia_cocida_blanca": "legumbre_alubia_blanca",
        "legumbre_bote_alubia_cocida_roja": "legumbre_alubia_roja",
        "verdura_espinacas": "verdura_espinaca",
        "verdura_espinaca_baby_lavada": "verdura_espinaca",
        "especia_pimienta_negra": "especia_pimienta_negra_molida",
        "especia_molinillo_pimienta_negra": "especia_pimienta_negra_molida",
        "verdura_champiñon": "verdura_champiñones_blancos",
        "pollo_contramuslos_deshuesados_sin_piel": "carne_pollo_contramuslos_deshuesados_sin_piel",
        "cereal_muesli_crunchy_fruta": "cereal_muesli_crujiente_frutas",
        "verdura_cebolla_roja": "verdura_cebolla_morada",
        "conserva_atun_aceite_girasol": "conserva_atun_claro_aceite_girasol",
        "harina_harina_trigo_frituras": "harina_trigo",
        "romero": "especia_romero",
        "cacao": "cacao_puro",
        "hummus": "hummus",
        # Tomate variants → verdura_tomate (avoid "Bocaditos Jamón y Tomate" matches)
        "verdura_tomate": "verdura_tomate",
        "tomate frito": "tomate_triturado",
        "tomate_frito": "tomate_triturado",
        # Burger/hamburguesa → carne picada (avoid "Burger Americana" prepared food)
        "burger": "carne_picada_vacuno",
        "hamburguesa": "carne_picada_vacuno",
        "carne_hamburguesa": "carne_picada_vacuno",
        "carne_burger": "carne_picada_vacuno",
        "carne_picada": "carne_picada_vacuno",
    }

    # Ingredientes que SIEMPRE deben usar ml (líquidos)
    FORCE_ML_INGREDIENTS = ["aceite", "leche", "vinagre", "salsa", "caldo"]

    def _group_by_canonical_name(
        self,
        ingredients: List[Dict[str, Any]],
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Agrupa ingredientes por nombre canónico, ajustando unidades específicas."""
        groups: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        for ing in ingredients:
            name = ing["name"].lower()

            canonical = self.CONSOLIDATION_MAP.get(name, name)

            # Forzar ml para ciertos líquidos que vienen en gramos
            if ing["unit"] == "g" and any(
                liq in canonical for liq in self.FORCE_ML_INGREDIENTS
            ):
                ing = dict(ing)  # copia para no mutar el original
                ing["unit"] = "ml"
                logger.info(
                    "[AGGREGATOR] Corregido unidad de '%s': g -> ml",
                    name,
                )

            groups[canonical].append(ing)
        return groups

    def _sum_quantities(
        self,
        grouped: Dict[str, List[Dict[str, Any]]],
    ) -> List[Dict[str, Any]]:
        """Suma cantidades por ingrediente y genera salida consolidada."""
        consolidated: List[Dict[str, Any]] = []
        recipe_names = self._load_recipe_names()

        for name, items in grouped.items():
            total_qty = 0.0
            units = [i["unit"] for i in items]
            primary_unit = (
                "g"
                if "g" in units
                else ("ml" if "ml" in units else items[0]["unit"])
            )

            for item in items:
                if item["unit"] == primary_unit:
                    total_qty += item["qty"]
                elif primary_unit == "g" and item["unit"] == "kg":
                    total_qty += item["qty"] * 1000
                elif primary_unit == "ml" and item["unit"] == "l":
                    total_qty += item["qty"] * 1000
                elif primary_unit == "l" and item["unit"] == "ml":
                    total_qty += item["qty"] / 1000
                elif primary_unit == "kg" and item["unit"] == "g":
                    total_qty += item["qty"] / 1000
                # Otros casos: sumamos directo asumiendo error menor

            if primary_unit == "ud":
                final_qty = math.ceil(total_qty)
            else:
                final_qty = round(total_qty, 1)

            canonical_key = name.lower().replace(" ", "_")
            display_name = recipe_names.get(
                canonical_key,
                name.replace("_", " ").title(),
            )

            consolidated.append(
                {
                    "name": display_name,  # Nombre amigable para UI
                    "canonical_name": canonical_key,  # Para búsqueda en comparador
                    "total_qty": final_qty,
                    "unit": primary_unit,
                }
            )

        logger.info("[AGGREGATOR] Salida consolidada: %d items.", len(consolidated))
        if consolidated:
            logger.debug("[AGGREGATOR] Ejemplo salida: %s", consolidated[0])

        return consolidated

    def get_comparison_ready_list(
        self,
        consolidated: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Devuelve la lista consolidada tal cual para el comparador (V1)."""
        return consolidated

    # ==========================================
    # SISTEMA V2 - AGREGACIÓN POR PRODUCT_ID
    # ==========================================
    def aggregate_weekly_plan_v2(
        self,
        menu: List[Dict[str, Any]],
        products_map: Dict[int, Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """
        SISTEMA V2: Agrega ingredientes por product_id.
        No necesita búsqueda - los IDs ya están en el menú.

        Args:
            menu: Lista de días con ingredientes como {product_id, qty_used, unit}
            products_map: Diccionario product_id -> info del producto

        Returns:
            Lista de productos agregados listos para el comparador
        """
        aggregated: Dict[int, Dict[str, Any]] = defaultdict(
            lambda: {"qty_used": 0.0, "unit": "g"}
        )
        meal_keys = ["desayuno", "almuerzo", "comida", "merienda", "cena"]

        for day in menu:
            for meal_key in meal_keys:
                meal = day.get(meal_key)
                if not meal:
                    continue

                ingredientes_v2 = meal.get("ingredientes_v2", [])
                ingredientes = meal.get("ingredientes", [])

                source_list = ingredientes_v2 if ingredientes_v2 else ingredientes

                for ing in source_list:
                    if isinstance(ing, dict):
                        product_id = ing.get("product_id")
                        qty_used = ing.get("qty_used", 0.0)
                        unit = ing.get("unit", "g")

                        if product_id:
                            existing_unit = aggregated[product_id]["unit"]
                            if existing_unit != unit and aggregated[product_id]["qty_used"] > 0:
                                # Units differ — normalize both to base unit before summing
                                from app.services.unit_normalizer import unit_normalizer
                                converted_qty, conv_base = unit_normalizer.normalize_unit(qty_used, unit)
                                existing_qty_norm, exist_base = unit_normalizer.normalize_unit(
                                    aggregated[product_id]["qty_used"], existing_unit
                                )
                                # Use the base unit from the incoming conversion (g or ml)
                                aggregated[product_id]["qty_used"] = existing_qty_norm + converted_qty
                                aggregated[product_id]["unit"] = conv_base
                            else:
                                aggregated[product_id]["qty_used"] += qty_used
                                aggregated[product_id]["unit"] = unit

        # Construir lista final con info del producto
        consolidated: List[Dict[str, Any]] = []
        for product_id, usage in aggregated.items():
            # claves de products_map pueden ser str o int
            product_info = products_map.get(
                str(product_id),
                products_map.get(product_id, {}),
            )

            # FALLBACK: Si no está en products_map, buscar en la DB
            if not product_info:
                logger.warning(
                    "[AGGREGATOR V2] Producto %s no encontrado en products_map, buscando en DB...",
                    product_id,
                )
                session = SessionLocal()
                try:
                    from app.db.models import Product
                    db_product = session.query(Product).filter(Product.id == product_id).first()
                    if db_product:
                        product_info = {
                            "name": db_product.product_name or f"Producto {product_id}",
                            "canonical_name": db_product.canonical_name or "",
                            "price": float(db_product.price or 0),
                            "amount": float(db_product.base_amount or 1),
                            "unit": db_product.base_unit or "ud",
                            "supermarket": db_product.supermarket or "",
                            "is_perishable": bool(db_product.is_perishable)
                        }
                        logger.info(
                            "[AGGREGATOR V2] ✓ Producto %s encontrado en DB: %s",
                            product_id,
                            product_info["name"]
                        )
                    else:
                        logger.error(
                            "[AGGREGATOR V2] ✗ Producto %s NO existe en la base de datos",
                            product_id,
                        )
                        continue
                finally:
                    session.close()

            # Calcular cuántos paquetes necesita el usuario
            package_amount = product_info.get("amount", 1)
            package_unit = product_info.get("unit", "g").lower()
            qty_needed = usage["qty_used"]
            usage_unit = usage["unit"].lower()

            # Conversión de unidades si es necesario
            canonical_name = product_info.get("canonical_name", "").lower()
            product_name = product_info.get("name", "").lower()

            # CASO ESPECIAL: Productos que se venden en unidades pero se usan en gramos
            # Pesos se leen de ingredients.unit_weight_g (DB, single source of truth)
            if package_unit == "ud" and usage_unit == "g":
                from app.services.unit_normalizer import unit_normalizer
                grams_per_unit = unit_normalizer.get_unit_weight(canonical_name)

                if grams_per_unit:
                    qty_needed_in_units = math.ceil(qty_needed / grams_per_unit)
                    logger.info(
                        "[AGGREGATOR V2] %s: %sg → %s unidades (%sg/ud from DB)",
                        product_name,
                        qty_needed,
                        qty_needed_in_units,
                        grams_per_unit,
                    )
                    qty_needed = qty_needed_in_units
                    usage_unit = "ud"
                    usage["unit"] = "ud"
                else:
                    # Fallback: extract weight from product name (e.g., "[Pieza 500 g aprox.]")
                    weight_match = re.search(
                        r"\[?[Pp]ieza\s+(\d+)\s*g",
                        product_info.get("name", ""),
                    )
                    if weight_match:
                        grams_per_unit = int(weight_match.group(1))
                        qty_needed_in_units = math.ceil(qty_needed / grams_per_unit)
                        logger.info(
                            "[AGGREGATOR V2] %s: %sg → %s unidades (extraído: %sg/ud)",
                            product_name,
                            qty_needed,
                            qty_needed_in_units,
                            grams_per_unit,
                        )
                        qty_needed = qty_needed_in_units
                        usage_unit = "ud"
                        usage["unit"] = "ud"
                    else:
                        logger.warning(
                            "[AGGREGATOR V2] No se pudo convertir g→ud para %s, asumiendo 1ud",
                            product_name,
                        )

            # Si el paquete está en litros y el uso en g/ml, convertir
            if package_unit == "l" and usage_unit in ["g", "ml"]:
                # 1L = 1000ml ≈ 1000g (para líquidos)
                package_amount_converted = package_amount * 1000
            elif package_unit == "kg" and usage_unit == "g":
                package_amount_converted = package_amount * 1000
            elif package_unit == "ml" and usage_unit == "g":
                # ml ≈ g para la mayoría de líquidos
                package_amount_converted = package_amount
            elif package_unit == "g" and usage_unit == "ml":
                # g ≈ ml para la mayoría de líquidos
                package_amount_converted = package_amount
            elif package_unit == "g" and usage_unit == "l":
                # uso en litros, producto en gramos: 1L ≈ 1000g
                qty_needed = qty_needed * 1000
                usage["unit"] = "g"
                package_amount_converted = package_amount
            elif package_unit == "kg" and usage_unit == "ml":
                # producto en kg, uso en ml: 1kg ≈ 1000ml
                package_amount_converted = package_amount * 1000
            elif package_unit == "ud" and usage_unit == "ud":
                package_amount_converted = package_amount
            else:
                package_amount_converted = package_amount

            packages_needed = (
                math.ceil(qty_needed / package_amount_converted)
                if package_amount_converted > 0
                else 1
            )

            consolidated.append(
                {
                    "product_id": product_id,
                    "name": product_info.get("name", f"Producto {product_id}"),
                    "canonical_name": product_info.get("canonical_name", ""),
                    "total_qty": round(qty_needed, 1),
                    "unit": usage["unit"],
                    "package_amount": package_amount,
                    "package_unit": product_info.get("unit", "g"),
                    "packages_needed": packages_needed,
                    "price_per_package": product_info.get("price", 0),
                    "total_price": round(
                        packages_needed * product_info.get("price", 0),
                        2,
                    ),
                    "supermarket": product_info.get("supermarket", ""),
                    "is_perishable": product_info.get("is_perishable", False),
                }
            )

        consolidated.sort(key=lambda x: x["total_price"], reverse=True)

        logger.info(
            "[AGGREGATOR V2] Consolidados %d productos con IDs",
            len(consolidated),
        )
        if consolidated:
            total_cost = sum(item["total_price"] for item in consolidated)
            logger.info(
                "[AGGREGATOR V2] Coste total estimado: %.2f€",
                total_cost,
            )

        return consolidated


ingredient_aggregator = ShoppingListAggregator()