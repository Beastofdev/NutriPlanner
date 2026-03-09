"""
scrape_consum.py — Consum supermarket scraper adapter.

Downloads the full Consum catalog (~9,000 products) from their public REST API
and yields RawProduct objects for the BaseScraper pipeline.

Usage:
    python -m scripts.scrapers.scrape_consum                # Full scrape → DB
    python -m scripts.scrapers.scrape_consum --dry-run      # Download only
    python -m scripts.scrapers.scrape_consum --json-only    # Save to JSON
    python -m scripts.scrapers.scrape_consum --limit 50     # Test with 50 products
"""

import re
import time
from typing import Iterator

import requests

from scripts.scrapers.base_scraper import BaseScraper, RawProduct

# ---------------------------------------------------------------------------
# Consum API config
# ---------------------------------------------------------------------------
API_BASE = "https://tienda.consum.es/api/rest/V1.0"
CATALOG_URL = f"{API_BASE}/catalog/product"
PAGE_SIZE = 100
DELAY_BETWEEN_REQUESTS = 0.5

HEADERS = {
    "Accept": "application/json",
    "User-Agent": "NutriPlanner/1.0 (meal planner; product catalog sync)",
}

# Unit normalization
_UNIT_RE = re.compile(r'^([\d.,]+)\s*(.+)$')
_UNIT_MAP = {'kg': 'kg', 'g': 'g', 'l': 'l', 'ml': 'ml', 'ud': 'ud', 'cl': 'cl'}


def _parse_base_unit(raw_unit: str) -> tuple:
    """Parse '1 Kg' -> (1.0, 'kg')."""
    match = _UNIT_RE.match((raw_unit or "").strip())
    if match:
        amount = float(match.group(1).replace(',', '.'))
        unit = match.group(2).strip().lower()
        return amount, _UNIT_MAP.get(unit, unit)
    return None, raw_unit


class ConsumScraper(BaseScraper):
    """Scraper for Consum supermarket via tienda.consum.es REST API."""

    supermarket_code = "CONSUM"

    def _fetch_page(self, offset: int, limit: int = PAGE_SIZE) -> dict:
        resp = requests.get(
            CATALOG_URL,
            params={"offset": offset, "limit": limit},
            headers=HEADERS,
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()

    def fetch_all(self) -> Iterator[RawProduct]:
        """Yield all Consum products by paginating the catalog API."""
        # Get total count
        first = self._fetch_page(0, 1)
        total = first.get("totalCount", 0)
        print(f"[CONSUM] Total in catalog: {total}")

        offset = 0
        yielded = 0

        while offset < total:
            data = self._fetch_page(offset)
            products = data.get("products", [])
            if not products:
                break

            for raw in products:
                product = self._transform(raw)
                if product:
                    yield product
                    yielded += 1

            print(f"  [{yielded}/{total}] offset={offset}")
            offset += PAGE_SIZE

            if data.get("hasMore", False):
                time.sleep(DELAY_BETWEEN_REQUESTS)
            else:
                break

        print(f"[CONSUM] Download complete: {yielded} products")

    def _transform(self, raw: dict) -> RawProduct | None:
        """Convert Consum API product to RawProduct."""
        pd = raw.get("productData", {})
        price_data = raw.get("priceData", {})
        prices = price_data.get("prices", [])
        categories = raw.get("categories", [])

        name = (pd.get("name") or "").strip()
        if not name:
            return None

        # Extract PRICE and OFFER_PRICE
        regular_price = None
        unit_price = None
        offer_price = None
        offer_unit_price = None
        for p in prices:
            if p["id"] == "PRICE":
                regular_price = p["value"].get("centAmount")
                unit_price = p["value"].get("centUnitAmount")
            elif p["id"] == "OFFER_PRICE":
                offer_price = p["value"].get("centAmount")
                offer_unit_price = p["value"].get("centUnitAmount")

        is_on_offer = offer_price is not None
        final_price = offer_price if is_on_offer else regular_price
        final_unit_price = offer_unit_price if is_on_offer else unit_price

        discount_pct = None
        if is_on_offer and regular_price and regular_price > 0:
            discount_pct = round((1 - offer_price / regular_price) * 100, 1)

        # Category: first non-offer category
        category = ""
        for cat in categories:
            cat_name = cat.get("name", "")
            if not cat_name.startswith("Ofertas"):
                category = cat_name
                break
        if not category and categories:
            category = categories[0].get("name", "")

        base_amount, base_unit = _parse_base_unit(
            price_data.get("unitPriceUnitType", "")
        )

        return RawProduct(
            external_id=raw.get("code", raw.get("ean", "")),
            product_name=name,
            brand=(pd.get("brand") or {}).get("name", "").strip() or None,
            price=final_price,
            original_price=regular_price if is_on_offer else None,
            base_amount=base_amount,
            base_unit=base_unit,
            category_raw=category,
            ean=raw.get("ean"),
            image_url=pd.get("imageURL", ""),
            supermarket="CONSUM",
            pum_calculated=final_unit_price,
            discount_percentage=discount_pct,
            product_format=(pd.get("description") or "").strip() or None,
        )


if __name__ == "__main__":
    ConsumScraper().cli()
