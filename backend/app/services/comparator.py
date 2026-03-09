"""
comparator.py - Price comparison service using ingredient-based product lookup.

V2 Architecture: Uses explicit ingredient→product mappings (JOIN-based)
instead of text-based ILIKE/regex search. All product discovery goes through
product_mapper.py which queries the ingredients, ingredient_product_map,
and ingredient_aliases tables.

NutriPlanner: Multi-supermarket mode
"""

import logging
from typing import Any, Dict, List

from app.db.database import SessionLocal

logger = logging.getLogger(__name__)
from app.db.models import Product
from app.services.product_mapper import product_mapper
from app.services.supermarket_registry import supermarket_registry


class Comparator:
    """Price comparison service for V1 (text-based) and V2 (product_id) flows."""

    def _init_stats(self, **extra) -> Dict[str, Any]:
        """Initialize stats dict with dynamic per-supermarket tracking."""
        codes = supermarket_registry.get_all_codes()
        stats = {
            "per_supermarket": {code: 0.0 for code in codes},
            "cheapest_total": 0.0,
            "savings": 0.0,
            **extra,
        }
        return stats

    def _accumulate_per_supermarket(
        self,
        stats: Dict[str, Any],
        candidates: List[Dict[str, Any]],
        fallback_cost: float,
    ) -> None:
        """Accumulate best-per-supermarket costs from a set of candidates."""
        codes = supermarket_registry.get_all_codes()

        # Find best candidate per supermarket
        best_by_super: Dict[str, Dict[str, Any]] = {}
        for c in candidates:
            s_code = (c.get("supermarket") or "").strip().upper()
            if s_code in codes and s_code not in best_by_super:
                best_by_super[s_code] = c

        # For each supermarket: use its own best, or fallback to cheapest overall
        for code in codes:
            best = best_by_super.get(code)
            if best:
                stats["per_supermarket"][code] += best["ticket_cost"]
            else:
                stats["per_supermarket"][code] += fallback_cost

    # ------------------------------------------------------------------
    # V1 / V3 COMPARATOR (ingredient name → product lookup)
    # ------------------------------------------------------------------
    async def bulk_compare(self, ingredients: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Compare a list of ingredients against available products.
        Used by V1 (text search) and V3 (recipe-based) flows.

        Each ingredient dict should have:
          - canonical_name or name: the ingredient key
          - total_qty: quantity needed
          - unit: measurement unit (g, ml, ud, etc.)

        Returns:
          {
            "items": [...],
            "stats": {per_supermarket, consum_total, cheapest_total, savings}
          }
        """
        processed_items: List[Dict[str, Any]] = []
        stats = self._init_stats()

        session = SessionLocal()
        try:  # noqa: session managed by try/finally
            for item in ingredients:
                query = item.get("canonical_name") or item.get("name", "")
                qty = float(item.get("total_qty", 1.0))
                unit = item.get("unit", "g")

                # Step 1: Resolve ingredient from mapping tables
                ingredient = product_mapper.resolve_ingredient(session, query)

                # Step 2: Find mapped products
                products = []
                if ingredient:
                    products = product_mapper.find_products(session, ingredient.id)

                # Step 3: Fallback to direct product search ONLY if ingredient
                # was not found at all. If ingredient exists but has no products,
                # that's a genuine stock gap — don't search for unrelated items.
                if not products and not ingredient:
                    products = product_mapper.fallback_product_search(session, query)
                    if products:
                        logger.info("Fallback search for '%s': %d products", query, len(products))

                if not products:
                    processed_items.append({
                        "status": "not_found",
                        "original_query": query,
                        "required_qty": qty,
                        "unit": unit,
                        "candidates": [],
                        "is_suggestion": False,
                    })
                    continue

                # Step 4: Calculate purchase amounts for each product
                candidates = []
                for p in products:
                    candidate = product_mapper.calc_purchase(p, qty, unit, ingredient)
                    candidates.append(candidate)

                # Sort by (units_to_buy, PUM) for non-perishables to avoid
                # oversized packages; min waste for perishables.
                is_perishable = bool(ingredient.is_perishable) if ingredient else False
                if is_perishable:
                    candidates.sort(key=lambda c: (c["units_to_buy"], c["ticket_cost"]))
                else:
                    candidates.sort(key=lambda c: (c["units_to_buy"], c.get("pum", 9999.0), c["ticket_cost"]))

                # Limit to top 3 per supermarket to reduce payload size
                candidates = self._limit_per_supermarket(candidates, max_per_super=3, is_perishable=is_perishable)

                # Step 5: Find best per supermarket and overall
                cheapest = candidates[0]
                stats["cheapest_total"] += cheapest["ticket_cost"]

                self._accumulate_per_supermarket(
                    stats, candidates, cheapest["ticket_cost"]
                )

                processed_items.append({
                    "status": "found",
                    "original_query": query,
                    "required_qty": qty,
                    "unit": unit,
                    "is_perishable": bool(ingredient.is_perishable) if ingredient else False,
                    "candidates": candidates,
                    "is_suggestion": False,
                    "search_level": "mapped" if ingredient else "fallback",
                })

        finally:
            session.close()

        # Calculate savings (including offer savings)
        self._calc_savings(stats)
        self._calc_offer_savings(processed_items, stats)
        return {"items": processed_items, "stats": stats}

    # ------------------------------------------------------------------
    # V2 COMPARATOR (product_id → alternatives via ingredient mapping)
    # ------------------------------------------------------------------
    async def bulk_compare_v2(
        self,
        aggregated_items: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        V2: Comparison by product_id with ingredient-based alternatives.

        Each item should have:
          - product_id: the exact product from Gemini
          - name: display name
          - total_qty: quantity needed
          - unit: measurement unit

        Finds the exact product, then discovers alternatives via the
        ingredient mapping (same ingredient = valid substitute).
        """
        processed_items: List[Dict[str, Any]] = []
        stats = self._init_stats(total_items=len(aggregated_items))

        session = SessionLocal()
        try:
            for item in aggregated_items:
                product_id = item.get("product_id")
                if not product_id:
                    continue

                qty_needed = float(item.get("total_qty", 1.0))
                qty_unit = item.get("unit", "g")

                # Get the exact product from DB
                db_product = session.query(Product).filter(Product.id == product_id).first()

                if not db_product:
                    continue

                # Find the ingredient this product maps to
                ingredient = product_mapper.find_ingredient_for_product(session, product_id)

                # Calculate purchase for the exact product
                exact_candidate = product_mapper.calc_purchase(
                    db_product, qty_needed, qty_unit, ingredient
                )
                exact_candidate["is_exact_match"] = True

                # Find alternatives (other products mapped to same ingredient)
                alt_candidates = []
                if ingredient:
                    alt_products = product_mapper.find_products(
                        session, ingredient.id, exclude_product_id=product_id
                    )
                    for p in alt_products:
                        alt = product_mapper.calc_purchase(p, qty_needed, qty_unit, ingredient)
                        alt["is_exact_match"] = False
                        alt_candidates.append(alt)

                # Combine and sort by supermarket + (units, PUM)
                all_candidates = [exact_candidate] + alt_candidates
                is_perishable_v2 = item.get("is_perishable", False)
                if is_perishable_v2:
                    all_candidates.sort(key=lambda x: (x.get("supermarket", ""), x["units_to_buy"], x["ticket_cost"]))
                else:
                    all_candidates.sort(key=lambda x: (x.get("supermarket", ""), x["units_to_buy"], x.get("pum", 9999.0), x["ticket_cost"]))

                # Best overall (min units first, then PUM for non-perishable)
                if is_perishable_v2:
                    best_overall = min(all_candidates, key=lambda x: (x["units_to_buy"], x["ticket_cost"]))
                else:
                    best_overall = min(all_candidates, key=lambda x: (x["units_to_buy"], x.get("pum", 9999.0), x["ticket_cost"]))
                stats["cheapest_total"] += best_overall["ticket_cost"]

                self._accumulate_per_supermarket(
                    stats, all_candidates, exact_candidate["ticket_cost"]
                )

                processed_items.append({
                    "status": "found",
                    "product_id": product_id,
                    "original_name": item.get("name"),
                    "required_qty": qty_needed,
                    "unit": qty_unit,
                    "is_perishable": item.get("is_perishable", False),
                    "candidates": all_candidates,
                    "is_suggestion": False,
                    "search_level": "direct",
                })

        finally:
            session.close()

        self._calc_savings(stats)
        self._calc_offer_savings(processed_items, stats)
        return {"items": processed_items, "stats": stats}

    # ------------------------------------------------------------------
    # SHARED HELPERS
    # ------------------------------------------------------------------
    @staticmethod
    def _limit_per_supermarket(
        candidates: List[Dict[str, Any]], max_per_super: int = 3,
        is_perishable: bool = False,
    ) -> List[Dict[str, Any]]:
        """Keep only the top N best candidates per supermarket.

        Uses perishable-aware sort: min waste for perishables, best PUM
        for non-perishables.
        """
        from collections import defaultdict
        by_super: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        for c in candidates:
            super_key = (c.get("supermarket") or "").strip().upper()
            by_super[super_key].append(c)
        result = []
        for super_key, items in by_super.items():
            result.extend(items[:max_per_super])
        if is_perishable:
            result.sort(key=lambda c: (c["units_to_buy"], c["ticket_cost"]))
        else:
            result.sort(key=lambda c: (c["units_to_buy"], c.get("pum", 9999.0), c["ticket_cost"]))
        return result

    @staticmethod
    def _calc_savings(stats: Dict[str, Any]) -> None:
        """Calculate savings and round all totals. Adds backward-compat aliases."""
        per_super = stats["per_supermarket"]

        # Round per-supermarket totals
        for code in per_super:
            per_super[code] = round(per_super[code], 2)

        # Savings = cheapest single-supermarket basket minus mixed basket
        totals = [v for v in per_super.values() if v > 0]
        if totals:
            min_single = min(totals)
        else:
            min_single = 0

        stats["cheapest_total"] = round(stats["cheapest_total"], 2)
        stats["savings"] = max(0, round(min_single - stats["cheapest_total"], 2))

        # Dynamic primary supermarket total (first available or cheapest)
        if per_super:
            primary = min(per_super, key=per_super.get) if per_super else None
            stats["primary_total"] = per_super.get(primary, 0.0) if primary else 0.0
            stats["primary_supermarket"] = primary
        else:
            stats["primary_total"] = 0.0
            stats["primary_supermarket"] = None

    @staticmethod
    def _calc_offer_savings(
        items: List[Dict[str, Any]], stats: Dict[str, Any]
    ) -> None:
        """Calculate total savings from products currently on offer."""
        offer_savings = 0.0
        offer_count = 0
        for item in items:
            if item.get("status") != "found":
                continue
            candidates = item.get("candidates", [])
            if not candidates:
                continue
            best = candidates[0]
            if best.get("is_on_offer") and best.get("offer_savings"):
                offer_savings += best["offer_savings"]
                offer_count += 1

        stats["offer_savings"] = round(offer_savings, 2)
        stats["offer_items_count"] = offer_count


comparator = Comparator()
