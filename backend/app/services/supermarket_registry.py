"""
supermarket_registry.py - In-memory registry of active supermarkets.

Loaded once at startup from the `supermarkets` DB table.
NutriPlanner: Multi-supermarket mode.
"""

import logging
import urllib.parse
from typing import Dict, List, Optional, Set

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


class SupermarketRegistry:
    """Singleton registry of active supermarkets."""

    def __init__(self):
        self._supermarkets: Dict[str, dict] = {}
        self._loaded = False

    def load(self, session: Session) -> None:
        from app.db.models import Supermarket

        rows = (
            session.query(Supermarket)
            .filter(Supermarket.is_active == True)  # noqa: E712
            .order_by(Supermarket.sort_order)
            .all()
        )
        self._supermarkets = {
            s.code: {
                "code": s.code,
                "display_name": s.display_name,
                "color": s.color,
                "icon": s.icon,
                "affiliate_url_template": s.affiliate_url_template,
                "affiliate_tag": s.affiliate_tag,
                "sort_order": s.sort_order,
            }
            for s in rows
        }
        self._loaded = True
        logger.info(
            "[SupermarketRegistry] Loaded %d supermarkets: %s",
            len(self._supermarkets),
            list(self._supermarkets.keys()),
        )

    def _ensure_loaded(self) -> None:
        if not self._loaded:
            self._supermarkets = {}
            logger.warning("[SupermarketRegistry] No supermarkets loaded from DB — registry is empty")

    def get_all_codes(self) -> Set[str]:
        self._ensure_loaded()
        return set(self._supermarkets.keys())

    def get_display_info(self) -> List[dict]:
        self._ensure_loaded()
        return [
            {
                "code": s["code"],
                "display_name": s["display_name"],
                "color": s["color"],
                "icon": s["icon"],
            }
            for s in sorted(self._supermarkets.values(), key=lambda x: x["sort_order"])
        ]

    def get_affiliate_url(
        self, supermarket_code: str, product
    ) -> Optional[str]:
        self._ensure_loaded()
        info = self._supermarkets.get(supermarket_code)
        if not info or not info.get("affiliate_url_template"):
            return None

        template = info["affiliate_url_template"]
        tag = info.get("affiliate_tag", "")
        product_name = urllib.parse.quote_plus(
            getattr(product, "product_name", "") or ""
        )
        ean = getattr(product, "ean", "") or ""

        return template.format(product_name=product_name, tag=tag, ean=ean)


# Singleton instance
supermarket_registry = SupermarketRegistry()
