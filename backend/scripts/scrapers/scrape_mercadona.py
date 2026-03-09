"""
scrape_mercadona.py — Mercadona supermarket scraper adapter.

Downloads the full Mercadona catalog (~10,000-15,000 products) from their
public REST API using async aiohttp for parallelism.

The API exposes products via category endpoints. We fetch all 139 known
subcategories in parallel and deduplicate by product ID.

Usage:
    python -m scripts.scrapers.scrape_mercadona                # Full scrape → DB
    python -m scripts.scrapers.scrape_mercadona --dry-run      # Download only
    python -m scripts.scrapers.scrape_mercadona --json-only    # Save to JSON
    python -m scripts.scrapers.scrape_mercadona --limit 50     # Test with 50 products
"""

import asyncio
from typing import Iterator, Optional

import aiohttp

from scripts.scrapers.base_scraper import BaseScraper, RawProduct

# ---------------------------------------------------------------------------
# Mercadona API config
# ---------------------------------------------------------------------------
API_BASE = "https://tienda.mercadona.es/api"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
}
CONCURRENCY = 20  # Max parallel requests

# All known working subcategory IDs (139 categories)
WORKING_CATEGORIES = [
    112, 115, 116, 117, 156, 163, 158, 159, 161, 162, 135, 133, 132,
    118, 121, 120, 89, 95, 92, 97, 90, 216, 219, 218, 217, 164, 166,
    181, 174, 168, 170, 173, 171, 169, 86, 81, 83, 84, 88, 46, 38,
    47, 37, 42, 43, 44, 40, 45, 78, 80, 79, 48, 52, 49, 51, 50,
    58, 54, 56, 53, 147, 148, 154, 155, 150, 149, 151, 884, 152, 145,
    122, 123, 127, 130, 129, 126, 201, 199, 203, 202, 192, 189, 185,
    191, 188, 187, 186, 190, 194, 196, 198, 213, 214, 27, 28, 29,
    77, 72, 75, 226, 237, 241, 234, 235, 233, 231, 230, 232, 229,
    243, 238, 239, 244, 206, 207, 208, 210, 212, 32, 34, 31, 36,
    222, 221, 225, 65, 66, 69, 59, 60, 62, 64, 68, 71, 897,
    138, 140, 142, 105, 110, 111, 106, 103, 109, 108, 104, 107,
    99, 100, 143, 98,
]


async def _fetch_json(session: aiohttp.ClientSession, url: str) -> Optional[dict]:
    """Fetch JSON with short timeout, return None on error."""
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
            if resp.status == 200:
                return await resp.json()
    except Exception:
        pass
    return None


async def _fetch_category(session: aiohttp.ClientSession, cat_id: int) -> list[dict]:
    """Fetch all products from a single category (including subcategories)."""
    data = await _fetch_json(session, f"{API_BASE}/categories/{cat_id}/")
    if not data:
        return []

    products = list(data.get("products", []))
    # Some categories have nested subcategories
    for subcat in data.get("categories", []):
        products.extend(subcat.get("products", []))
    return products


async def _build_catalog() -> dict[str, dict]:
    """Download all categories in parallel, deduplicate by product ID."""
    async with aiohttp.ClientSession(headers=HEADERS) as session:
        sem = asyncio.Semaphore(CONCURRENCY)

        async def fetch_with_sem(cat_id: int):
            async with sem:
                return await _fetch_category(session, cat_id)

        tasks = [fetch_with_sem(cid) for cid in WORKING_CATEGORIES]
        results = await asyncio.gather(*tasks)

    # Deduplicate by product ID
    catalog = {}
    for products in results:
        for p in products:
            pid = str(p.get("id", ""))
            if pid and pid not in catalog:
                catalog[pid] = p

    return catalog


def _extract_price(price_instructions: dict) -> tuple[Optional[float], Optional[float], Optional[float], Optional[float]]:
    """Extract (price, original_price, pum, discount_pct) from price_instructions."""
    if not price_instructions:
        return None, None, None, None

    # unit_price is the selling price (e.g. "1,50 €")
    unit_price_str = price_instructions.get("unit_price", "")
    bulk_price_str = price_instructions.get("bulk_price", "")
    reference_price_str = price_instructions.get("reference_price", "")

    def _parse_price(s: str) -> Optional[float]:
        if not s:
            return None
        # "1,50 €" or "1.50" — normalize comma to dot, strip currency
        cleaned = s.replace("€", "").replace(",", ".").strip()
        try:
            return float(cleaned)
        except (ValueError, TypeError):
            return None

    price = _parse_price(unit_price_str)
    # bulk_price is the previous price if on offer
    original = _parse_price(bulk_price_str)
    # reference_price is price per unit (e.g. "3,00 €/Kg")
    ref = reference_price_str.split("/")[0] if reference_price_str else ""
    pum = _parse_price(ref)

    # Discount calculation
    discount = None
    if original and price and original > price:
        discount = round((1 - price / original) * 100, 1)
    else:
        original = None  # Not on offer

    return price, original, pum, discount


def _extract_unit(price_instructions: dict) -> tuple[Optional[float], Optional[str]]:
    """Extract (base_amount, base_unit) from reference_format like '1 Kg'."""
    ref_format = (price_instructions or {}).get("reference_format", "")
    if not ref_format:
        return None, None

    import re
    match = re.match(r'^([\d.,]+)\s*(.+)$', ref_format.strip())
    if match:
        amount = float(match.group(1).replace(',', '.'))
        unit = match.group(2).strip().lower()
        unit_map = {'kg': 'kg', 'g': 'g', 'l': 'l', 'ml': 'ml', 'ud': 'ud'}
        return amount, unit_map.get(unit, unit)
    return None, ref_format.strip().lower()


class MercadonaScraper(BaseScraper):
    """Scraper for Mercadona via tienda.mercadona.es API (async)."""

    supermarket_code = "MERCADONA"

    def fetch_all(self) -> Iterator[RawProduct]:
        """Fetch all Mercadona products using async catalog builder."""
        print(f"[MERCADONA] Fetching {len(WORKING_CATEGORIES)} categories (async, concurrency={CONCURRENCY})...")
        catalog = asyncio.run(_build_catalog())
        print(f"[MERCADONA] Catalog: {len(catalog)} unique products")

        for pid, raw in catalog.items():
            product = self._transform(pid, raw)
            if product:
                yield product

    def _transform(self, pid: str, raw: dict) -> RawProduct | None:
        """Convert Mercadona API product to RawProduct."""
        name = (raw.get("display_name") or "").strip()
        if not name:
            return None

        price_instructions = raw.get("price_instructions", {})
        price, original_price, pum, discount = _extract_price(price_instructions)
        base_amount, base_unit = _extract_unit(price_instructions)

        # Category from the product's categories array or parent
        category = ""
        cats = raw.get("categories", [])
        if cats:
            category = cats[-1].get("name", "") if isinstance(cats[-1], dict) else str(cats[-1])

        # Brand: Mercadona brands are usually "Hacendado", "Deliplus", etc.
        packaging = raw.get("packaging", "")

        return RawProduct(
            external_id=pid,
            product_name=name,
            brand=None,  # Mercadona API doesn't expose brand directly
            price=price,
            original_price=original_price,
            base_amount=base_amount,
            base_unit=base_unit,
            category_raw=category,
            ean=None,  # Would need individual product calls
            image_url=raw.get("thumbnail", ""),
            supermarket="MERCADONA",
            pum_calculated=pum,
            discount_percentage=discount,
            product_format=packaging or None,
        )


if __name__ == "__main__":
    MercadonaScraper().cli()
