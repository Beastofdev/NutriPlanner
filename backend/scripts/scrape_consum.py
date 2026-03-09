"""
Scraper de productos de Consum (tienda.consum.es).

Descarga el catálogo completo (~9000 productos) via API REST pública
y los inserta/actualiza en la tabla 'products' de PostgreSQL.

Uso:
    python backend/scripts/scrape_consum.py                 # Scrape completo → DB
    python backend/scripts/scrape_consum.py --dry-run       # Solo descargar, no escribir DB
    python backend/scripts/scrape_consum.py --json-only     # Guardar en JSON sin DB
"""

import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path

import requests

# ---------------------------------------------------------------------------
# Añadir backend/ al path para importar modelos
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))

# ---------------------------------------------------------------------------
# Configuración API
# ---------------------------------------------------------------------------
API_BASE = "https://tienda.consum.es/api/rest/V1.0"
CATALOG_URL = f"{API_BASE}/catalog/product"
PAGE_SIZE = 100  # Max permitido por el servidor
DELAY_BETWEEN_REQUESTS = 0.5  # Segundos entre requests (respetuoso)

HEADERS = {
    "Accept": "application/json",
    "User-Agent": "NutriConsum/1.0 (meal planner; product catalog sync)",
}


# ---------------------------------------------------------------------------
# Funciones de descarga
# ---------------------------------------------------------------------------
def fetch_page(offset: int, limit: int = PAGE_SIZE) -> dict:
    """Descarga una página del catálogo."""
    resp = requests.get(
        CATALOG_URL,
        params={"offset": offset, "limit": limit},
        headers=HEADERS,
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def fetch_all_products() -> list[dict]:
    """Descarga todos los productos paginando automáticamente."""
    all_products = []
    offset = 0

    # Primera request para saber el total
    first_page = fetch_page(0, 1)
    total = first_page["totalCount"]
    print(f"[consum] Total productos en catálogo: {total}")

    while offset < total:
        data = fetch_page(offset)
        products = data.get("products", [])
        if not products:
            break

        all_products.extend(products)
        fetched = len(all_products)
        print(f"  [{fetched}/{total}] offset={offset}")

        offset += PAGE_SIZE
        if data.get("hasMore", False):
            time.sleep(DELAY_BETWEEN_REQUESTS)
        else:
            break

    print(f"[consum] Descarga completa: {len(all_products)} productos")
    return all_products


# ---------------------------------------------------------------------------
# Transformación: API Consum → modelo Product
# ---------------------------------------------------------------------------
def _parse_base_unit(raw_unit: str) -> dict:
    """Parse '1 Kg' -> {'base_amount': 1.0, 'base_unit': 'kg'}."""
    import re as _re
    match = _re.match(r'^([\d.,]+)\s*(.+)$', (raw_unit or "").strip())
    if match:
        amount = float(match.group(1).replace(',', '.'))
        unit = match.group(2).strip().lower()
        unit_map = {'kg': 'kg', 'g': 'g', 'l': 'l', 'ml': 'ml', 'ud': 'ud', 'cl': 'cl'}
        return {"base_amount": amount, "base_unit": unit_map.get(unit, unit)}
    return {"base_amount": None, "base_unit": raw_unit}


def transform_product(raw: dict) -> dict:
    """Convierte un producto de la API al formato de nuestro modelo Product."""
    pd = raw.get("productData", {})
    price_data = raw.get("priceData", {})
    prices = price_data.get("prices", [])
    categories = raw.get("categories", [])

    # Precio: extraer PRICE y OFFER_PRICE por separado
    regular_price = None
    regular_unit_price = None
    offer_price_val = None
    offer_unit_price = None
    for p in prices:
        if p["id"] == "PRICE":
            regular_price = p["value"].get("centAmount")
            regular_unit_price = p["value"].get("centUnitAmount")
        elif p["id"] == "OFFER_PRICE":
            offer_price_val = p["value"].get("centAmount")
            offer_unit_price = p["value"].get("centUnitAmount")

    # Final price = offer if available, otherwise regular
    is_on_offer = offer_price_val is not None
    price = offer_price_val if is_on_offer else regular_price
    unit_price = offer_unit_price if is_on_offer else regular_unit_price
    discount_pct = None
    if is_on_offer and regular_price is not None and regular_price > 0 and offer_price_val is not None:
        discount_pct = round((1 - offer_price_val / regular_price) * 100, 1)

    # Categoría principal (primera no-oferta)
    category = ""
    for cat in categories:
        name = cat.get("name", "")
        if not name.startswith("Ofertas"):
            category = name
            break
    if not category and categories:
        category = categories[0].get("name", "")

    return {
        "product_name": pd.get("name", "").strip(),
        "brand": (pd.get("brand") or {}).get("name", "").strip(),
        "supermarket": "CONSUM",
        "price": price,
        "original_price": regular_price,
        "offer_price": offer_price_val if is_on_offer else None,
        "discount_percentage": discount_pct,
        "is_on_offer": 1 if is_on_offer else 0,
        "product_format": pd.get("description", "").strip(),
        "image_url": pd.get("imageURL", ""),
        "date_scraped": datetime.now().strftime("%Y-%m-%d"),
        "canonical_name": None,  # Se llenará en el paso de mapping
        **_parse_base_unit(price_data.get("unitPriceUnitType", "")),
        "pum_calculated": unit_price,
        "ai_category": category,
        "is_basic_ingredient": 0,
        # Campos extra que guardamos para referencia
        "_ean": raw.get("ean", ""),
        "_code": raw.get("code", ""),
        "_availability": pd.get("availability", ""),
    }


# ---------------------------------------------------------------------------
# Inserción en DB
# ---------------------------------------------------------------------------
def upsert_to_db(products: list[dict]):
    """Inserta o actualiza productos en la DB."""
    from app.db.database import SessionLocal, engine
    from app.db.models import Product

    # Crear solo la tabla products (evita errores con ARRAY en SQLite)
    Product.__table__.create(bind=engine, checkfirst=True)

    session = SessionLocal()
    inserted = 0
    updated = 0

    try:
        # Cargar productos existentes indexados por nombre+supermercado
        existing = {}
        for p in session.query(Product).filter(Product.supermarket == "CONSUM").all():
            existing[p.product_name] = p

        for item in products:
            name = item["product_name"]
            if not name:
                continue

            if name in existing:
                # Actualizar precio y datos
                p = existing[name]
                p.price = item["price"]
                p.original_price = item.get("original_price")
                p.offer_price = item.get("offer_price")
                p.discount_percentage = item.get("discount_percentage")
                p.is_on_offer = item.get("is_on_offer", 0)
                p.product_format = item["product_format"]
                p.image_url = item["image_url"]
                p.date_scraped = item["date_scraped"]
                p.pum_calculated = item["pum_calculated"]
                p.base_unit = item["base_unit"]
                p.ai_category = item["ai_category"]
                p.brand = item["brand"]
                updated += 1
            else:
                # Insertar nuevo
                p = Product(
                    product_name=name,
                    brand=item["brand"],
                    supermarket="CONSUM",
                    price=item["price"],
                    original_price=item.get("original_price"),
                    offer_price=item.get("offer_price"),
                    discount_percentage=item.get("discount_percentage"),
                    is_on_offer=item.get("is_on_offer", 0),
                    product_format=item["product_format"],
                    image_url=item["image_url"],
                    date_scraped=item["date_scraped"],
                    base_unit=item["base_unit"],
                    pum_calculated=item["pum_calculated"],
                    ai_category=item["ai_category"],
                    is_basic_ingredient=0,
                )
                session.add(p)
                inserted += 1

        session.commit()
        print(f"[DB] Insertados: {inserted}, Actualizados: {updated}")

    except Exception as e:
        session.rollback()
        print(f"[DB] Error: {e}")
        raise
    finally:
        session.close()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Scraper de productos Consum")
    parser.add_argument("--dry-run", action="store_true", help="Solo descargar, no escribir DB")
    parser.add_argument("--json-only", action="store_true", help="Guardar en JSON")
    parser.add_argument("--limit", type=int, default=0, help="Limitar a N productos (para testing)")
    args = parser.parse_args()

    print("=" * 60)
    print("  SCRAPER DE PRODUCTOS CONSUM")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    # Descargar
    raw_products = fetch_all_products()

    if args.limit > 0:
        raw_products = raw_products[: args.limit]
        print(f"[limit] Recortado a {len(raw_products)} productos")

    # Transformar
    products = [transform_product(p) for p in raw_products]
    valid = [p for p in products if p["product_name"]]
    print(f"[transform] {len(valid)} productos válidos de {len(products)} totales")

    # Estadísticas
    with_price = sum(1 for p in valid if p["price"] is not None)
    categories = set(p["ai_category"] for p in valid if p["ai_category"])
    print(f"[stats] Con precio: {with_price}/{len(valid)}")
    print(f"[stats] Categorías únicas: {len(categories)}")

    if args.json_only:
        out_path = SCRIPT_DIR / "consum_products.json"
        # Quitar campos internos con _
        clean = [{k: v for k, v in p.items() if not k.startswith("_")} for p in valid]
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(clean, f, ensure_ascii=False, indent=2)
        print(f"[json] Guardado en {out_path}")
        return

    if args.dry_run:
        print("[dry-run] No se escribió en DB. Primeros 5 productos:")
        for p in valid[:5]:
            print(f"  {p['product_name']} | {p['price']}€ | {p['ai_category']}")
        return

    # Insertar en DB
    upsert_to_db(valid)
    print("\n[OK] Scraping completado con exito")


if __name__ == "__main__":
    main()
