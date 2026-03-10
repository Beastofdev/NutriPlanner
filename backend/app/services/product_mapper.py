"""
product_mapper.py - Ingredient-based product lookup service.

Replaces all text-based ILIKE/regex search with deterministic JOIN lookups
on the ingredients, ingredient_product_map, and ingredient_aliases tables.

Flow:
  canonical_name → resolve_ingredient() → Ingredient
  Ingredient → find_products() → List[Product]
  Product + qty → calc_purchase() → {units_to_buy, ticket_cost, ...}
"""

import math
import re
import time
import unicodedata
from typing import Any, Dict, List, Optional

from sqlalchemy import case
from sqlalchemy.orm import Session

from app.db.models import Ingredient, IngredientAlias, IngredientProductMap, Product

# In-memory cache for ingredient resolution (avoids repeated DB lookups)
# Key: canonical_key, Value: (ingredient_id, timestamp)
_ingredient_cache: Dict[str, tuple] = {}
_CACHE_TTL = 300  # 5 minutes

# Category prefixes to strip when doing fuzzy matching
CATEGORY_PREFIXES = {
    "verdura", "fruta", "carne", "pescado", "lacteo", "cereal", "aceite",
    "legumbre", "conserva", "condimento", "condimentos", "frutos", "fruto",
    "semilla", "pan", "pasta", "embutido", "especia", "harina", "salsa",
    "bebida", "salsas", "huevos", "caldo",
}


def _normalize_key(name: str) -> str:
    """Normalize name to canonical_key format: strip accents, lowercase, underscores."""
    nfkd = unicodedata.normalize("NFKD", name)
    ascii_str = "".join(c for c in nfkd if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "_", ascii_str.lower()).strip("_")


class ProductMapper:
    """Maps ingredient names to supermarket products via explicit DB mappings."""

    def resolve_ingredient(self, session: Session, query: str) -> Optional[Ingredient]:
        """
        Resolve a query string to an Ingredient.

        Search order:
        1. In-memory cache check
        2. Exact canonical_key match
        3. Alias lookup
        4. Suffix match (category_QUERY)
        5. Keyword match (strip category prefix, match core word)

        The query is normalized: lowercased, spaces→underscores, stripped.
        """
        if not query:
            return None

        key = _normalize_key(query)

        # 0. Check in-memory cache
        now = time.time()
        cached = _ingredient_cache.get(key)
        if cached:
            ing_id, ts = cached
            if now - ts < _CACHE_TTL:
                if ing_id is None:
                    return None
                return session.query(Ingredient).filter(Ingredient.id == ing_id).first()
            else:
                del _ingredient_cache[key]

        def _cache_and_return(result: Optional[Ingredient]) -> Optional[Ingredient]:
            _ingredient_cache[key] = (result.id if result else None, now)
            return result

        # 1. Exact canonical_key match
        ing = session.query(Ingredient).filter(
            Ingredient.canonical_key == key
        ).first()
        if ing:
            return _cache_and_return(ing)

        # 2. Alias lookup
        alias_row = session.query(IngredientAlias).filter(
            IngredientAlias.alias == key
        ).first()
        if alias_row:
            ing = session.query(Ingredient).filter(
                Ingredient.id == alias_row.ingredient_id
            ).first()
            if ing:
                return _cache_and_return(ing)

        # 3a. Prefix match: "salmon" → "salmon_entero_..." (most relevant)
        ing = session.query(Ingredient).filter(
            Ingredient.canonical_key.ilike(f"{key}_%")
        ).order_by(Ingredient.canonical_key).first()
        if ing:
            return _cache_and_return(ing)

        # 3b. Suffix match: "pechuga_pollo" → "%_pechuga_pollo"
        ing = session.query(Ingredient).filter(
            Ingredient.canonical_key.ilike(f"%_{key}")
        ).order_by(Ingredient.canonical_key).first()
        if ing:
            return _cache_and_return(ing)

        # 4. Strip category prefix and try again
        #    "verdura_tomate_cherry" → key_parts=["verdura","tomate","cherry"]
        #    → core = "tomate_cherry" → try exact, then suffix
        key_parts = key.split("_")
        if len(key_parts) > 1 and key_parts[0] in CATEGORY_PREFIXES:
            core = "_".join(key_parts[1:])

            # 4a. Exact match on core
            ing = session.query(Ingredient).filter(
                Ingredient.canonical_key == core
            ).first()
            if ing:
                return _cache_and_return(ing)

            # 4b. Alias on core
            alias_row = session.query(IngredientAlias).filter(
                IngredientAlias.alias == core
            ).first()
            if alias_row:
                ing = session.query(Ingredient).filter(
                    Ingredient.id == alias_row.ingredient_id
                ).first()
                if ing:
                    return _cache_and_return(ing)

            # 4c. Suffix match on core
            ing = session.query(Ingredient).filter(
                Ingredient.canonical_key.ilike(f"%_{core}")
            ).order_by(Ingredient.canonical_key).first()
            if ing:
                return _cache_and_return(ing)

        # 5. Contains match — pick shortest canonical_key (most generic)
        #    Only for keys >= 5 chars to avoid false matches (e.g. "pan" matching "pan_rallado")
        if len(key) >= 5:
            matches = (
                session.query(Ingredient)
                .filter(Ingredient.canonical_key.ilike(f"%{key}%"))
                .all()
            )
            if matches:
                return _cache_and_return(min(matches, key=lambda i: len(i.canonical_key)))

        # 6. If key has multiple parts, try the main keyword (first non-category word)
        core_words = [w for w in key_parts if w not in CATEGORY_PREFIXES and len(w) > 3]
        if core_words:
            main_word = core_words[0]
            if len(main_word) >= 5:
                matches = (
                    session.query(Ingredient)
                    .filter(Ingredient.canonical_key.ilike(f"%{main_word}%"))
                    .all()
                )
                if matches:
                    return _cache_and_return(min(matches, key=lambda i: len(i.canonical_key)))

        return _cache_and_return(None)

    def find_products(
        self,
        session: Session,
        ingredient_id: int,
        exclude_product_id: Optional[int] = None,
    ) -> List[Product]:
        """Find all products mapped to an ingredient via JOIN.

        Cross-supermarket: also searches sibling ingredients that share
        the same canonical_key prefix (e.g. arroz_redondo → arroz_redondo_hacendado).
        """
        # Get the resolved ingredient's canonical_key
        ingredient = session.query(Ingredient).filter(Ingredient.id == ingredient_id).first()

        # Collect ingredient IDs to search: the original + siblings with same prefix
        ingredient_ids = [ingredient_id]
        if ingredient and ingredient.canonical_key:
            base_key = ingredient.canonical_key
            siblings = (
                session.query(Ingredient.id)
                .filter(
                    Ingredient.canonical_key.ilike(f"{base_key}%"),
                    Ingredient.id != ingredient_id,
                )
                .limit(20)
                .all()
            )
            ingredient_ids.extend(s.id for s in siblings)

        query = (
            session.query(Product)
            .join(IngredientProductMap, IngredientProductMap.product_id == Product.id)
            .filter(
                IngredientProductMap.ingredient_id.in_(ingredient_ids),
                Product.is_basic_ingredient == 1,
            )
        )

        if exclude_product_id:
            query = query.filter(Product.id != exclude_product_id)

        return query.order_by(
            case((Product.pum_calculated.is_(None), 1), else_=0),
            Product.pum_calculated.asc(),
        ).all()

    def find_ingredient_for_product(
        self,
        session: Session,
        product_id: int,
    ) -> Optional[Ingredient]:
        """Find the ingredient that a product maps to (for V2 alternative lookup)."""
        mapping = (
            session.query(IngredientProductMap)
            .filter(IngredientProductMap.product_id == product_id)
            .first()
        )
        if mapping:
            return session.query(Ingredient).filter(
                Ingredient.id == mapping.ingredient_id
            ).first()
        return None

    def calc_purchase(
        self,
        product: Product,
        qty_needed: float,
        qty_unit: str,
        ingredient: Optional[Ingredient] = None,
    ) -> Dict[str, Any]:
        """
        Calculate packages to buy and total cost.

        Uses ingredient.unit_weight_g for cross-unit conversion:
        - "2 ud" eggs, product "12 ud" → 1 package
        - "120g" eggs, unit_weight_g=60 → 2 eggs → product "12 ud" → 1 package
        - "200g" chicken, product "500g" → 1 package
        """
        price = float(product.price) if product.price else 0.0
        base_amount = float(product.base_amount) if product.base_amount else 0.0
        base_unit = (product.base_unit or "g").lower()
        qty_unit = (qty_unit or "g").lower()

        # If base_amount is missing, try to derive from price / PUM
        if base_amount <= 0 and product.pum_calculated and product.pum_calculated > 0:
            base_amount = round(price / product.pum_calculated, 2)

        # Final fallback
        if base_amount <= 0:
            base_amount = 1.0

        unit_weight_g = ingredient.unit_weight_g if ingredient else None

        # Fallback unit weights when ingredient.unit_weight_g is NULL
        if not unit_weight_g and ingredient:
            DEFAULT_UNIT_WEIGHTS = {
                "limon": 100, "naranja": 200, "manzana": 180, "platano": 120,
                "tomate": 150, "patata": 170, "cebolla": 150, "ajo": 5,
                "huevo": 60, "burger": 150, "pechuga": 200, "filete": 200,
                "calabacin": 200, "berenjena": 250, "pimiento": 150,
                "pepino": 200, "zanahoria": 100, "aguacate": 170,
                "melon": 1500, "salmon": 200, "merluza": 200,
                "bacalao": 200, "pera": 170, "melocoton": 150,
                "kiwi": 80, "mandarina": 80, "pomelo": 300,
            }
            ikey = (ingredient.canonical_key or "").lower()
            for prefix, w in DEFAULT_UNIT_WEIGHTS.items():
                if ikey.startswith(prefix) or f"_{prefix}" in ikey:
                    unit_weight_g = w
                    break
            if not unit_weight_g:
                # Generic fallback: 150g per unit (reasonable for most produce)
                unit_weight_g = 150

        # Convert docena to units: 1 dc/dz = 12 ud
        # Also detect "1/2 Docena" in product name to fix base_amount
        if base_unit in ("dc", "dz"):
            product_name_lower = (product.product_name or "").lower()
            if "1/2" in product_name_lower or "media" in product_name_lower:
                base_amount = base_amount * 6  # half dozen = 6 units
            else:
                base_amount = base_amount * 12  # full dozen = 12 units
            base_unit = "ud"

        qty_normalized = qty_needed
        base_normalized = base_amount

        # Same units → direct comparison
        if qty_unit == base_unit:
            pass

        # Volume conversions
        elif base_unit == "l" and qty_unit == "ml":
            base_normalized = base_amount * 1000
        elif base_unit == "ml" and qty_unit == "l":
            qty_normalized = qty_needed * 1000

        # Weight conversions
        elif base_unit == "kg" and qty_unit == "g":
            base_normalized = base_amount * 1000
        elif base_unit == "g" and qty_unit == "kg":
            qty_normalized = qty_needed * 1000

        # Unit ↔ Weight: requires unit_weight_g
        elif qty_unit == "ud" and base_unit in ("g", "kg") and unit_weight_g:
            # "2 ud" eggs → 2 * 60g = 120g, compare to product "500g"
            qty_normalized = qty_needed * unit_weight_g
            if base_unit == "kg":
                base_normalized = base_amount * 1000

        elif qty_unit in ("g", "kg") and base_unit == "ud" and unit_weight_g:
            # "120g" eggs → 120/60 = 2 units, compare to product "12 ud"
            grams = qty_needed if qty_unit == "g" else qty_needed * 1000
            qty_normalized = grams / unit_weight_g

        elif qty_unit == "ud" and base_unit == "ud":
            pass  # Both in units, direct

        elif qty_unit == "ml" and base_unit == "ml":
            pass

        # Weight ↔ Volume cross-type: treat g ≈ ml for cooking liquids (density ~ 1)
        elif qty_unit == "g" and base_unit == "ml":
            pass  # 1g ≈ 1ml
        elif qty_unit == "ml" and base_unit == "g":
            pass  # 1ml ≈ 1g
        elif qty_unit == "g" and base_unit == "l":
            base_normalized = base_amount * 1000  # 1L ≈ 1000g
        elif qty_unit == "l" and base_unit == "g":
            qty_normalized = qty_needed * 1000  # 1L ≈ 1000g
        elif qty_unit == "ml" and base_unit == "kg":
            base_normalized = base_amount * 1000  # 1kg ≈ 1000ml
        elif qty_unit == "kg" and base_unit == "ml":
            qty_normalized = qty_needed * 1000  # 1kg ≈ 1000ml

        # Fallback: if units don't match and no conversion available,
        # assume direct comparison (better than failing)

        # Calculate packages
        if base_normalized > 0:
            units_to_buy = max(1, math.ceil(qty_normalized / base_normalized))
        else:
            units_to_buy = 1

        ticket_cost = round(price * units_to_buy, 2)

        pum = (
            float(product.pum_calculated)
            if product.pum_calculated
            else (price / base_amount if base_amount > 0 else float("inf"))
        )

        # Offer data
        is_on_offer = bool(getattr(product, "is_on_offer", 0))
        original_price = float(product.original_price) if getattr(product, "original_price", None) else None
        discount_pct = float(product.discount_percentage) if getattr(product, "discount_percentage", None) else None

        result = {
            "id": product.id,
            "product_name": product.product_name,
            "supermarket": product.supermarket,
            "price": price,
            "base_amount": base_amount,
            "base_unit": base_unit,
            "image_url": product.image_url,
            "units_to_buy": units_to_buy,
            "ticket_cost": ticket_cost,
            "pum": round(pum, 4) if pum != float("inf") else 9999.0,
            "affiliate_url": self._get_affiliate_url(product),
        }

        if is_on_offer:
            result["is_on_offer"] = True
            result["original_price"] = original_price
            result["discount_percentage"] = discount_pct
            if original_price:
                result["original_ticket_cost"] = round(original_price * units_to_buy, 2)
                result["offer_savings"] = round((original_price - price) * units_to_buy, 2)

        return result

    @staticmethod
    def _get_affiliate_url(product: Product) -> Optional[str]:
        from app.services.supermarket_registry import supermarket_registry

        return supermarket_registry.get_affiliate_url(
            (product.supermarket or "").strip().upper(), product
        )

    def fallback_product_search(
        self,
        session: Session,
        query: str,
        limit: int = 10,
    ) -> List[Product]:
        """
        Last-resort product search by canonical_name ILIKE.
        Used when ingredient mapping fails completely.
        Much simpler than the old search_v4 — just a direct ILIKE query.
        """
        key = _normalize_key(query)

        products = (
            session.query(Product)
            .filter(
                Product.is_basic_ingredient == 1,
                Product.canonical_name.ilike(f"%{key}%"),
            )
            .order_by(
                case((Product.pum_calculated.is_(None), 1), else_=0),
                Product.pum_calculated.asc(),
                Product.price,
            )
            .limit(limit)
            .all()
        )

        if not products:
            # Try with the main keyword only
            parts = key.split("_")
            core_words = [w for w in parts if w not in CATEGORY_PREFIXES and len(w) > 2]
            if core_words:
                main_word = core_words[0]
                products = (
                    session.query(Product)
                    .filter(
                        Product.is_basic_ingredient == 1,
                        Product.canonical_name.ilike(f"%{main_word}%"),
                    )
                    .order_by(
                        case((Product.pum_calculated.is_(None), 1), else_=0),
                        Product.pum_calculated.asc(),
                        Product.price,
                    )
                    .limit(limit)
                    .all()
                )

        return products


product_mapper = ProductMapper()
