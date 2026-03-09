"""
Generate recipe images using Google Gemini 2.5 Flash Image and save to static/recipe_images/.
Updates Recipe.image_url in the database.

Requirements: pip install google-genai pillow
Set GOOGLE_API_KEY in backend/.env before running.

Usage: python -m scripts.generate_recipe_images [--limit 10] [--dry-run] [--test]
Run from backend/ directory.
"""
import argparse
import io
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.db.database import engine

IMAGES_DIR = Path(__file__).parent.parent / "static" / "recipe_images"
IMAGES_DIR.mkdir(parents=True, exist_ok=True)

MODEL = "gemini-2.5-flash-image"  # Nano Banana: 500 RPM, 2000 RPD


def slugify(name: str) -> str:
    """Simple slugify for filenames."""
    import unicodedata
    name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return "".join(c if c.isalnum() or c == "-" else "-" for c in name.lower().strip()).strip("-")[:80]


def get_client():
    from google import genai
    return genai.Client(api_key=os.environ["GOOGLE_API_KEY"])


def generate_image(client, recipe_name: str, output_path: Path, model: str = MODEL) -> bool:
    """Generate a food photo using Gemini 2.5 Flash Image and save as 512x512 webp."""
    try:
        from google.genai import types
        from PIL import Image

        prompt = (
            f"Generate a professional food photography image of the Spanish dish: {recipe_name}. "
            "Overhead angle, warm natural lighting, rustic wooden table, "
            "appetizing and colorful, no text or watermarks or labels, "
            "shallow depth of field, restaurant quality plating, home-cooked style."
        )

        response = client.models.generate_content(
            model=model,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_modalities=["IMAGE", "TEXT"],
                temperature=1.0,
            ),
        )

        # Extract image from response parts
        for part in response.candidates[0].content.parts:
            if part.inline_data and part.inline_data.mime_type.startswith("image/"):
                image_bytes = part.inline_data.data
                img = Image.open(io.BytesIO(image_bytes))
                img = img.resize((512, 512), Image.LANCZOS)
                webp_path = output_path.with_suffix(".webp")
                img.save(webp_path, "WEBP", quality=82)
                return True

        print("[NO IMAGE IN RESPONSE]", end=" ")
        return False

    except Exception as e:
        print(f"[ERROR: {e}]", end=" ")
        return False


def generate_with_retry(client, recipe_name: str, output_path: Path, model: str = MODEL, max_retries: int = 3) -> bool:
    """Generate image with exponential backoff retry."""
    for attempt in range(max_retries):
        if generate_image(client, recipe_name, output_path, model=model):
            return True
        if attempt < max_retries - 1:
            wait = 2 ** (attempt + 1)
            print(f"[RETRY in {wait}s]", end=" ", flush=True)
            time.sleep(wait)
    return False


def main():
    parser = argparse.ArgumentParser(description="Generate recipe images with Gemini Flash Image")
    parser.add_argument("--limit", type=int, default=0, help="Max recipes to process (0=all)")
    parser.add_argument("--dry-run", action="store_true", help="Just show what would be generated")
    parser.add_argument("--test", action="store_true", help="Generate 1 test image and exit")
    parser.add_argument("--model", type=str, default=MODEL, help=f"Model to use (default: {MODEL})")
    args = parser.parse_args()

    model_name = args.model

    api_key = os.environ.get("GOOGLE_API_KEY")
    if not args.dry_run and not api_key:
        print("ERROR: Set GOOGLE_API_KEY in backend/.env")
        sys.exit(1)

    # Test mode: generate 1 image and exit
    if args.test:
        print(f"Testing with model: {model_name}")
        client = get_client()
        test_path = IMAGES_DIR / "test_tortilla.png"
        print("Generating test image: Tortilla Española...", end=" ", flush=True)
        ok = generate_image(client, "Tortilla Española", test_path, model=model_name)
        if ok:
            webp = test_path.with_suffix(".webp")
            size_kb = webp.stat().st_size / 1024 if webp.exists() else 0
            print(f"OK ({size_kb:.0f} KB)")
            print(f"Saved to: {webp}")
        else:
            print("FAILED")
        return

    client = get_client() if not args.dry_run else None

    with engine.connect() as conn:
        sql = "SELECT id, name, slug FROM recipes WHERE (image_url IS NULL OR image_url = '') AND is_verified = 1"
        if args.limit > 0:
            sql += f" LIMIT {args.limit}"

        recipes = conn.execute(text(sql)).fetchall()
        total = len(recipes)
        print(f"Found {total} recipes without images. Model: {model_name}\n")

        success_count = 0
        fail_count = 0
        skip_count = 0
        start_time = time.time()

        for i, row in enumerate(recipes):
            recipe_id, name, slug = row
            file_slug = slugify(slug or name)
            webp_path = IMAGES_DIR / f"{file_slug}.webp"
            png_path = IMAGES_DIR / f"{file_slug}.png"

            # Skip if already exists on disk
            if webp_path.exists() or png_path.exists():
                ext = "webp" if webp_path.exists() else "png"
                img_url = f"/static/recipe_images/{file_slug}.{ext}"
                conn.execute(text("UPDATE recipes SET image_url = :url WHERE id = :id"), {"url": img_url, "id": recipe_id})
                skip_count += 1
                continue

            if args.dry_run:
                print(f"  [{i+1}/{total}] WOULD GENERATE: {name} -> {file_slug}.webp")
                continue

            print(f"  [{i+1}/{total}] {name}...", end=" ", flush=True)
            ok = generate_with_retry(client, name, png_path, model=model_name)

            if ok:
                ext = "webp" if (IMAGES_DIR / f"{file_slug}.webp").exists() else "png"
                img_url = f"/static/recipe_images/{file_slug}.{ext}"
                conn.execute(text("UPDATE recipes SET image_url = :url WHERE id = :id"), {"url": img_url, "id": recipe_id})
                success_count += 1
                print("OK")
            else:
                fail_count += 1
                print("FAILED")

            # Delay to stay within rate limits and avoid hangs
            time.sleep(1)

        conn.commit()

        elapsed = time.time() - start_time
        print(f"\nDone in {elapsed:.0f}s. Generated: {success_count}, Failed: {fail_count}, Skipped: {skip_count}")


if __name__ == "__main__":
    main()
