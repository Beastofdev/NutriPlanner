"""
base_scraper.py — Abstract base class for supermarket scrapers.

Each supermarket adapter implements `fetch_all()` to yield RawProduct objects.
The base class handles DB upsert, stats, and CLI arguments.

Usage pattern:
    class MyScraper(BaseScraper):
        supermarket_code = "MYSUPER"
        def fetch_all(self) -> Iterator[RawProduct]: ...

    if __name__ == "__main__":
        MyScraper().cli()
"""

import argparse
import json
import sys
from abc import ABC, abstractmethod
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Iterator, Optional

SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent.parent
sys.path.insert(0, str(BACKEND_DIR))


@dataclass
class RawProduct:
    """Normalized product from any supermarket scraper."""
    external_id: str
    product_name: str
    brand: Optional[str]
    price: Optional[float]          # Current selling price (cents or euros depending on scraper)
    original_price: Optional[float]  # Pre-discount price (None if not on offer)
    base_amount: Optional[float]
    base_unit: Optional[str]         # "g", "kg", "ml", "l", "ud"
    category_raw: str
    ean: Optional[str]
    image_url: Optional[str]
    supermarket: str
    pum_calculated: Optional[float] = None  # Price per unit (€/kg or €/l)
    discount_percentage: Optional[float] = None
    product_format: Optional[str] = None


class BaseScraper(ABC):
    """Abstract scraper with DB upsert and CLI support."""

    supermarket_code: str = ""  # Override in subclass

    @abstractmethod
    def fetch_all(self) -> Iterator[RawProduct]:
        """Yield RawProduct objects for the entire catalog."""
        ...

    def normalize(self, raw: RawProduct) -> dict:
        """Convert RawProduct to Product DB row dict."""
        is_on_offer = raw.original_price is not None and raw.price is not None and raw.price < raw.original_price
        return {
            "product_name": raw.product_name,
            "brand": raw.brand,
            "supermarket": raw.supermarket,
            "price": raw.price,
            "original_price": raw.original_price if is_on_offer else raw.price,
            "offer_price": raw.price if is_on_offer else None,
            "discount_percentage": raw.discount_percentage,
            "is_on_offer": 1 if is_on_offer else 0,
            "product_format": raw.product_format or "",
            "image_url": raw.image_url,
            "date_scraped": datetime.now().strftime("%Y-%m-%d"),
            "base_amount": raw.base_amount,
            "base_unit": raw.base_unit,
            "pum_calculated": raw.pum_calculated,
            "ai_category": raw.category_raw,
            "is_basic_ingredient": 0,
        }

    def upsert_to_db(self, products: list[dict]):
        """Insert or update products in the DB."""
        from app.db.database import SessionLocal, engine
        from app.db.models import Product

        Product.__table__.create(bind=engine, checkfirst=True)

        session = SessionLocal()
        inserted = 0
        updated = 0

        try:
            existing = {}
            for p in session.query(Product).filter(
                Product.supermarket == self.supermarket_code
            ).all():
                existing[p.product_name] = p

            for item in products:
                name = item["product_name"]
                if not name:
                    continue

                if name in existing:
                    p = existing[name]
                    for key in ["price", "original_price", "offer_price",
                                "discount_percentage", "is_on_offer", "product_format",
                                "image_url", "date_scraped", "pum_calculated",
                                "base_unit", "ai_category", "brand"]:
                        if key in item:
                            setattr(p, key, item[key])
                    updated += 1
                else:
                    p = Product(
                        product_name=name,
                        brand=item.get("brand"),
                        supermarket=self.supermarket_code,
                        price=item.get("price"),
                        original_price=item.get("original_price"),
                        offer_price=item.get("offer_price"),
                        discount_percentage=item.get("discount_percentage"),
                        is_on_offer=item.get("is_on_offer", 0),
                        product_format=item.get("product_format", ""),
                        image_url=item.get("image_url"),
                        date_scraped=item.get("date_scraped"),
                        base_unit=item.get("base_unit"),
                        base_amount=item.get("base_amount"),
                        pum_calculated=item.get("pum_calculated"),
                        ai_category=item.get("ai_category"),
                        is_basic_ingredient=0,
                    )
                    session.add(p)
                    inserted += 1

            session.commit()
            print(f"[DB] Inserted: {inserted}, Updated: {updated}")

        except Exception as e:
            session.rollback()
            print(f"[DB] Error: {e}")
            raise
        finally:
            session.close()

    def run(self, dry_run: bool = False, json_only: bool = False, limit: int = 0) -> dict:
        """Main entry point: scrape → normalize → upsert."""
        print(f"\n{'=' * 60}")
        print(f"  SCRAPER: {self.supermarket_code}")
        print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"{'=' * 60}")

        # Fetch
        raw_products = list(self.fetch_all())
        print(f"[{self.supermarket_code}] Fetched: {len(raw_products)} raw products")

        if limit > 0:
            raw_products = raw_products[:limit]
            print(f"[limit] Truncated to {len(raw_products)}")

        # Normalize
        products = [self.normalize(p) for p in raw_products]
        valid = [p for p in products if p["product_name"]]
        print(f"[transform] {len(valid)} valid products")

        # Stats
        with_price = sum(1 for p in valid if p["price"] is not None)
        categories = set(p["ai_category"] for p in valid if p["ai_category"])
        on_offer = sum(1 for p in valid if p["is_on_offer"])
        print(f"[stats] With price: {with_price}/{len(valid)}")
        print(f"[stats] Categories: {len(categories)}")
        print(f"[stats] On offer: {on_offer}")

        if json_only:
            out_path = SCRIPT_DIR.parent / f"{self.supermarket_code.lower()}_products.json"
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(valid, f, ensure_ascii=False, indent=2)
            print(f"[json] Saved to {out_path}")
            return {"total": len(valid), "with_price": with_price}

        if dry_run:
            print("[dry-run] No DB write. First 5 products:")
            for p in valid[:5]:
                print(f"  {p['product_name']} | {p['price']} | {p['ai_category']}")
            return {"total": len(valid), "with_price": with_price}

        # Upsert
        self.upsert_to_db(valid)
        print(f"\n[OK] Scraping complete for {self.supermarket_code}")
        return {"total": len(valid), "with_price": with_price, "on_offer": on_offer}

    def cli(self):
        """CLI entry point with standard arguments."""
        parser = argparse.ArgumentParser(
            description=f"Scraper for {self.supermarket_code}"
        )
        parser.add_argument("--dry-run", action="store_true", help="Fetch only, no DB write")
        parser.add_argument("--json-only", action="store_true", help="Save to JSON file")
        parser.add_argument("--limit", type=int, default=0, help="Limit to N products")
        args = parser.parse_args()
        self.run(dry_run=args.dry_run, json_only=args.json_only, limit=args.limit)
