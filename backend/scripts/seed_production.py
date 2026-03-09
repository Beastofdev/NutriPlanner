"""
Seed production database from JSON exports.

Usage:
  1. Export from local SQLite:   python -m scripts.seed_production --export
  2. Import to production PG:    DATABASE_URL=postgresql://... python -m scripts.seed_production --import

Run from backend/ directory.
"""
import argparse
import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))

DATA_DIR = BACKEND_DIR / "data" / "seed"
DATA_DIR.mkdir(parents=True, exist_ok=True)

TABLES = ["supermarkets", "products", "ingredients", "ingredient_product_map", "recipes", "recipe_ingredients"]


def export_data():
    """Export all seed tables from current DB to JSON files."""
    from app.db.database import engine
    from sqlalchemy import text

    with engine.connect() as conn:
        for table in TABLES:
            try:
                rows = conn.execute(text(f"SELECT * FROM {table}")).fetchall()
                keys = conn.execute(text(f"SELECT * FROM {table} LIMIT 1")).keys()
                data = [dict(zip(keys, row)) for row in rows]
                out = DATA_DIR / f"{table}.json"
                with open(out, "w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False, default=str)
                print(f"  {table}: {len(data)} rows -> {out.name}")
            except Exception as e:
                print(f"  {table}: SKIP ({e})")

    print(f"\nExported to {DATA_DIR}/")


def _get_pg_bool_columns(conn, table_name):
    """Query PostgreSQL information_schema to find actual BOOLEAN columns."""
    from sqlalchemy import text
    rows = conn.execute(text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name = :tbl AND data_type = 'boolean'"
    ), {"tbl": table_name}).fetchall()
    return {r[0] for r in rows}


def import_data():
    """Import JSON seed files into current DB."""
    from app.db.database import engine
    from app.db import models
    from sqlalchemy import text

    # Ensure tables exist
    models.Base.metadata.create_all(bind=engine)

    is_pg = "postgresql" in str(engine.url)

    with engine.connect() as conn:
        for table in TABLES:
            seed_file = DATA_DIR / f"{table}.json"
            if not seed_file.exists():
                print(f"  {table}: no seed file, skipping")
                continue

            with open(seed_file, "r", encoding="utf-8") as f:
                data = json.load(f)

            if not data:
                print(f"  {table}: empty, skipping")
                continue

            # Check if table already has data
            existing = conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
            if existing > 0:
                print(f"  {table}: already has {existing} rows, skipping")
                continue

            # Get actual DB column names
            try:
                db_cols = [col.name for col in conn.execute(text(f"SELECT * FROM {table} LIMIT 0")).cursor.description]
            except Exception:
                db_cols = list(data[0].keys())

            keys = [k for k in data[0].keys() if k in db_cols]

            # For PostgreSQL, detect which columns are actually BOOLEAN
            bool_cols = _get_pg_bool_columns(conn, table) if is_pg else set()

            placeholders = ", ".join(f":{k}" for k in keys)
            cols = ", ".join(keys)
            sql = f"INSERT INTO {table} ({cols}) VALUES ({placeholders})"

            batch_size = 500
            inserted = 0
            for i in range(0, len(data), batch_size):
                batch = data[i:i + batch_size]
                clean_batch = []
                for row in batch:
                    cleaned = {}
                    for k in keys:
                        v = row.get(k)
                        # Cast 0/1 to bool only for actual PG boolean columns
                        if k in bool_cols and v is not None:
                            v = bool(v)
                        cleaned[k] = v
                    clean_batch.append(cleaned)
                conn.execute(text(sql), clean_batch)
                inserted += len(batch)

            conn.commit()
            print(f"  {table}: {inserted} rows imported")

    print("\nImport complete!")


def main():
    parser = argparse.ArgumentParser(description="Seed production database")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--export", action="store_true", help="Export current DB to JSON")
    group.add_argument("--import", dest="do_import", action="store_true", help="Import JSON to current DB")
    args = parser.parse_args()

    if args.export:
        print("Exporting seed data...")
        export_data()
    elif args.do_import:
        print("Importing seed data...")
        import_data()


if __name__ == "__main__":
    main()
