"""
One-time script to remove duplicate recipes from the database.
Keeps the recipe with more ingredient mappings.

Usage: python -m scripts.dedup_recipes
Run from backend/ directory.
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.db.database import engine


def dedup_recipes():
    with engine.connect() as conn:
        # Find duplicate recipe names
        dupes = conn.execute(text("""
            SELECT name, COUNT(*) as cnt
            FROM recipes
            GROUP BY name
            HAVING COUNT(*) > 1
            ORDER BY name
        """)).fetchall()

        if not dupes:
            print("No duplicate recipes found.")
            return

        print(f"Found {len(dupes)} duplicate recipe names:\n")
        total_deleted = 0

        for row in dupes:
            name = row[0]
            # Get all recipes with this name, ordered by ingredient count
            recipes = conn.execute(text("""
                SELECT r.id, r.name, r.slug,
                       (SELECT COUNT(*) FROM recipe_ingredients WHERE recipe_id = r.id) as ing_count
                FROM recipes r
                WHERE r.name = :name
                ORDER BY ing_count DESC, r.id ASC
            """), {"name": name}).fetchall()

            # Keep the first (most ingredients), delete the rest
            keep = recipes[0]
            to_delete = recipes[1:]

            for d in to_delete:
                print(f"  DELETE: id={d[0]} name='{d[1]}' ({d[3]} ingredients) — keeping id={keep[0]} ({keep[3]} ingredients)")
                # Delete ingredient mappings first
                conn.execute(text("DELETE FROM recipe_ingredients WHERE recipe_id = :rid"), {"rid": d[0]})
                # Delete recipe
                conn.execute(text("DELETE FROM recipes WHERE id = :rid"), {"rid": d[0]})
                total_deleted += 1

        conn.commit()
        print(f"\nDone. Deleted {total_deleted} duplicate recipes.")


if __name__ == "__main__":
    dedup_recipes()
