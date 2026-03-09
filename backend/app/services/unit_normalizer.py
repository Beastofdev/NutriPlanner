"""
Unit Normalization System for Shopping Aggregation

Single source of truth for unit conversions across the entire app.
Reads ingredient-specific weights from the DB (ingredients.unit_weight_g).
"""
import logging
import time
from typing import Dict, Optional, Tuple

logger = logging.getLogger("NutriPlanner.UnitNormalizer")

_CACHE_TTL_SECONDS = 300  # 5 minutes


class UnitNormalizer:
    """Handles unit conversions and normalization for ingredient aggregation."""

    # Base unit conversions (everything to grams or ml)
    UNIT_CONVERSIONS: Dict[str, Tuple[str, float]] = {
        # Weight
        "g": ("g", 1),
        "gr": ("g", 1),
        "gramo": ("g", 1),
        "gramos": ("g", 1),
        "kg": ("g", 1000),
        "kilo": ("g", 1000),
        "kilos": ("g", 1000),
        # Volume
        "ml": ("ml", 1),
        "mililitro": ("ml", 1),
        "mililitros": ("ml", 1),
        "l": ("ml", 1000),
        "litro": ("ml", 1000),
        "litros": ("ml", 1000),
        # Kitchen measures
        "cucharada": ("g", 15),
        "cda": ("g", 15),
        "cucharadita": ("g", 5),
        "cdta": ("g", 5),
        "pizca": ("g", 1),
        "taza": ("ml", 250),
        "vaso": ("ml", 200),
        "loncha": ("g", 20),
        "rebanada": ("g", 30),
        "filete": ("g", 150),
        # Units
        "u": ("ud", 1),
        "ud": ("ud", 1),
        "unidad": ("ud", 1),
        "uds": ("ud", 1),
        "unidades": ("ud", 1),
        "pieza": ("ud", 1),
        "piezas": ("ud", 1),
        "pellizco": ("g", 1),
    }

    # Ingredients that should use ml instead of g
    _ML_CATEGORIES = {"aceites", "bebidas", "caldos", "salsas"}
    _ML_PREFIXES = ("aceite_", "lacteo_leche", "bebida_", "caldo_", "salsa_")

    def __init__(self):
        self._weight_cache: Dict[str, Optional[float]] = {}
        self._standard_unit_cache: Dict[str, str] = {}
        self._category_cache: Dict[str, str] = {}
        self._cache_ts: float = 0.0

    def _load_weights(self) -> None:
        """Load all unit_weight_g, standard_unit, and category from DB (cached)."""
        now = time.monotonic()
        if self._weight_cache and (now - self._cache_ts) < _CACHE_TTL_SECONDS:
            return

        from app.db.database import SessionLocal
        from sqlalchemy import text

        session = SessionLocal()
        try:
            rows = session.execute(
                text("SELECT canonical_key, unit_weight_g, standard_unit, category FROM ingredients")
            ).fetchall()
            self._weight_cache = {r[0]: r[1] for r in rows}
            self._standard_unit_cache = {r[0]: (r[2] or "g") for r in rows}
            self._category_cache = {r[0]: (r[3] or "otros") for r in rows}
            self._cache_ts = time.monotonic()
            logger.info("[UnitNormalizer] Loaded %d ingredient weights from DB", len(self._weight_cache))
        except Exception as e:
            logger.warning("[UnitNormalizer] Error loading weights: %s", e)
        finally:
            session.close()

    def get_unit_weight(self, canonical_key: str) -> Optional[float]:
        """Get unit_weight_g for an ingredient from DB cache."""
        self._load_weights()
        return self._weight_cache.get(canonical_key)

    def get_standard_unit(self, canonical_key: str) -> str:
        """Get standard_unit for an ingredient from DB cache."""
        self._load_weights()
        return self._standard_unit_cache.get(canonical_key, "g")

    def _is_liquid(self, canonical_key: str) -> bool:
        """Check if an ingredient should use ml instead of g."""
        self._load_weights()
        category = self._category_cache.get(canonical_key, "")
        if category in self._ML_CATEGORIES:
            return True
        return any(canonical_key.startswith(p) for p in self._ML_PREFIXES)

    def normalize_unit(self, quantity: float, unit: str, ingredient_name: str = "") -> Tuple[float, str]:
        """
        Normalize a quantity to base units (g or ml).

        Args:
            quantity: Original quantity
            unit: Original unit (g, kg, ud, etc.)
            ingredient_name: Canonical ingredient name for ud->g conversion

        Returns:
            Tuple of (normalized_quantity, base_unit)
        """
        unit_lower = unit.lower().strip()

        if unit_lower in self.UNIT_CONVERSIONS:
            base_unit, factor = self.UNIT_CONVERSIONS[unit_lower]

            if base_unit in ("g", "ml"):
                return quantity * factor, base_unit

            # "ud" -> convert to weight using DB
            if base_unit == "ud" and ingredient_name:
                return self._convert_units_to_weight(quantity, ingredient_name)

        if unit_lower:
            logger.warning("Unknown unit '%s' for %s, assuming grams", unit, ingredient_name)
        return quantity, "g"

    def _convert_units_to_weight(self, quantity: float, ingredient_name: str) -> Tuple[float, str]:
        """Convert units to grams/ml using DB unit_weight_g."""
        weight = self.get_unit_weight(ingredient_name)

        if weight:
            base_unit = "ml" if self._is_liquid(ingredient_name) else "g"
            total = quantity * weight
            logger.info(
                "Converted %s ud of '%s' -> %s%s (%s%s/ud)",
                quantity, ingredient_name, total, base_unit, weight, base_unit,
            )
            return total, base_unit

        # Fallback: keep as units
        logger.warning(
            "No unit_weight_g for '%s', keeping as %s ud", ingredient_name, quantity
        )
        return quantity, "ud"

    def convert_between(
        self, qty: float, from_unit: str, to_unit: str, canonical_key: str
    ) -> Tuple[float, str]:
        """
        Convert between two units for a specific ingredient.

        Used when aggregating mixed units (e.g., some recipes use 'g', others 'ud').
        Returns (converted_qty, final_unit).
        """
        from_lower = from_unit.lower().strip()
        to_lower = to_unit.lower().strip()

        if from_lower == to_lower:
            return qty, to_unit

        weight = self.get_unit_weight(canonical_key)
        if not weight:
            logger.warning(
                "Cannot convert %s->%s for '%s': no unit_weight_g",
                from_unit, to_unit, canonical_key,
            )
            return qty, from_unit

        # g -> ud
        if from_lower == "g" and to_lower == "ud":
            return qty / weight, "ud"
        # ud -> g
        if from_lower == "ud" and to_lower == "g":
            return qty * weight, "g"
        # ml -> ud (treat ml ~ g for weight conversion)
        if from_lower == "ml" and to_lower == "ud":
            return qty / weight, "ud"
        # ud -> ml
        if from_lower == "ud" and to_lower == "ml":
            return qty * weight, "ml"

        # For other conversions, normalize both to base first
        norm_qty, norm_unit = self.normalize_unit(qty, from_unit, canonical_key)
        if norm_unit == to_lower:
            return norm_qty, to_unit

        logger.warning(
            "Unsupported conversion %s->%s for '%s'", from_unit, to_unit, canonical_key
        )
        return qty, from_unit

    def can_aggregate(self, unit1: str, unit2: str) -> bool:
        """Check if two units can be aggregated after normalization."""
        base1 = self.UNIT_CONVERSIONS.get(unit1.lower(), (unit1, 1))[0]
        base2 = self.UNIT_CONVERSIONS.get(unit2.lower(), (unit2, 1))[0]
        compatible_bases = {"g", "ml", "ud"}
        return base1 in compatible_bases and base2 in compatible_bases

    def invalidate_cache(self) -> None:
        """Force cache reload on next access."""
        self._cache_ts = 0.0

    @staticmethod
    def detect_unit_conflict(units: list) -> bool:
        """Return True if the unit list mixes weight (g/kg) with volume (ml/l)."""
        weight_units = {"g", "kg", "gr", "gramo", "gramos", "kilo", "kilos"}
        volume_units = {"ml", "l", "mililitro", "mililitros", "litro", "litros"}
        normalized = {u.lower().strip() for u in units if u}
        has_weight = bool(normalized & weight_units)
        has_volume = bool(normalized & volume_units)
        return has_weight and has_volume


# Singleton instance
unit_normalizer = UnitNormalizer()
