"""
Cleanup non-food products from the NutriConsum catalog.

Removes products in categories that are clearly non-food (cosmetics, cleaning,
hygiene, pet care, household items, etc.) and sets is_basic_ingredient=1 for
any remaining food products that were missed during the mapping pipeline.

Usage:
    python backend/scripts/cleanup_nonfood.py [--dry-run]
"""

import sqlite3
import sys
from pathlib import Path

# Non-food category patterns (case-insensitive substring match)
NON_FOOD_CATEGORIES = {
    # Cosmetics & Beauty
    "Coloración", "Labiales", "Rostro", "Ojos", "Uñas", "Sombras",
    "Brochas, pinceles y esponjas", "Brochas", "Manicura y pedicura",
    "Limpieza y desmaquilladores", "Cuidado facial", "Serums, aceites y otros",
    "Protector labial", "Crema de pies", "Cremas de manos", "Exfoliantes",
    "Lociones", "Cuidado corporal", "Raíces y cejas",
    # Hair care
    "Champú", "Mascarillas cabello", "Acondicionadores", "Lacas",
    "Gel y cera", "Anticaspa y anticaída", "Cremas y aguas de peinado",
    "Fijación capilar", "Cabello normal", "Cabello dañado y frágil",
    "Cuidado del cabello",
    # Body care & Deodorants
    "Body-lociones", "Hidratación", "Gel de baño", "Roll on", "Spray",
    "Crema, gel y spray", "Gel y champú", "Gel de manos",
    "Jabón en pastillas", "Cuidado personal", "Cuidado manos y pies",
    # Shaving
    "Maquinillas de afeitar", "Espuma de afeitar", "Gel y jabón de afeitado",
    "Crema de afeitado", "Después afeitado", "Maquinillas y recambios",
    "Recambios hojas afeitar", "Afeitado y cuidado masculino",
    # Oral care
    "Dentífricos", "Cepillos de dientes", "Antisépticos y enjuagues",
    "Seda dental", "Higiene bucal",
    # Feminine hygiene
    "Femeninas", "Compresas y protegeslips", "Tampones", "Braguita noche",
    "Masculinas",
    # Baby care (non-food)
    "Junior: Talla de 4 a 6", "Bebé: Talla de 0 a 3", "Puericultura",
    "Pañal adulto y protectores", "Toallitas húmedas", "Toallitas",
    # Intimate
    "Preservativos", "Aseo íntimo", "Higiene íntima",
    # Pet care
    "Pienso", "Comida Húmeda", "Pouches", "Otras mascotas",
    "Antiparásitos e higiene", "Arenas e higiene", "Perros",
    # Cleaning products
    "Limpieza hogar", "Limpiacristales y multiusos", "Lejías y amoniacos",
    "Quitamanchas", "Suavizante", "Limpiadores", "Estropajos",
    "Lavavajillas a máquina", "Lavavajillas a mano", "Gel WC",
    "Aditivos y limpiamáquinas", "Descalcificadores lavadora",
    "Limpieza calzado y accesorios", "Otros limpiadores específicos",
    "Limpiadores muebles", "Limpieza baños", "Limpieza cocina",
    "A mano y jabón común", "Amoníacos", "Prelavado y blanqueador",
    "Productos planchado", "Absorbe olores y antihumedad",
    "Aditivos para el lavado", "Prendas delicadas", "Droguería y limpieza",
    "Otros utensilios de limpieza", "Tender y planchar",
    "Accesorios y utensilios limpieza", "Textil",
    # Cleaning tools
    "Bayetas, gamuzas y plumeros", "Fregonas", "Mopas",
    "Escoba y recogedor", "Esponjas", "Cepillos y esponjas",
    "Cubos y barreños",
    # Pest control
    "Anti hormigas y cucarachicidas", "Spray voladores",
    "Antipolillas y carcoma", "Otros insecticidas",
    # Household items
    "Pilas", "Velas", "Peines y accesorios", "Accesorios de baño",
    "Complementos higiene", "Hogar", "Bazar", "Pequeño electrodoméstico",
    "Eléctricos y automáticos", "Eléctricos", "Decoración y fiestas",
    "Continuos y decorativos", "Accesorios y complementos", "Accesorios",
    "Arreglos", "Bañadores",
    # First aid
    "Bandas protectoras adhesivas", "Alcohol, agua oxigenada y otros",
    "Esparadrapo", "Vendas gasas esterilizadas", "Algodón", "Botiquín",
    # Disposable tableware
    "Platos, bandejas y cuencos", "Cubiertos", "Vasos y copas",
    "Desechables", "Manteles",
    # Paper products (non-food)
    "Papel higiénico", "Pañuelos y tissues", "Servilletas de papel",
    # Bags & wrapping
    "Bolsas de conservación", "Bolsas y sacos de basura",
    # Barbecue (non-food items)
    "Barbacoa, carbón y encendido",
    # Sun care
    "Solares",
    # Supplements (borderline, but not food)
    "Nutrición deportiva", "Fitoterapia", "Complementos nutricionales",
    "Productos protésicos",
    # Baby hygiene
    "Cremas, lociones y colonia",
    # Hermeticos (food storage containers)
    "Herméticos", "Moldes y recipientes", "Conservación alimentos y moldes",
    "Menaje cocina", "Menaje de mesa",
    # Palillos and straws
    "Palillos y pajitas",
    # Estuches
    "Estuches",
    # Additional cleaning/household
    "A máquina líquido", "Tratamiento", "Aerosol spray o pistola",
    "Guantes domésticos", "Máquina pastilla", "Papel de cocina",
    "Cera ", "Espumas y mousses", "Crema y barra", "Máquina polvo",
    "Film transparente", "Papel aluminio", "Papel horno", "Amoniacos",
}

def main():
    dry_run = "--dry-run" in sys.argv

    db_path = Path(__file__).parent.parent / "nutriconsum.db"
    if not db_path.exists():
        print(f"DB not found at {db_path}")
        sys.exit(1)

    conn = sqlite3.connect(str(db_path))
    cur = conn.cursor()

    # Build case-insensitive match
    nonfood_lower = {c.lower() for c in NON_FOOD_CATEGORIES}

    # Get all distinct categories
    cur.execute("SELECT DISTINCT ai_category FROM products WHERE ai_category IS NOT NULL")
    all_cats = [row[0] for row in cur.fetchall()]

    matched_cats = []
    for cat in all_cats:
        if cat and cat.lower().strip() in nonfood_lower:
            matched_cats.append(cat)

    print(f"Found {len(matched_cats)} non-food categories out of {len(all_cats)} total")

    # Count products to delete
    placeholders = ",".join(["?"] * len(matched_cats))
    cur.execute(f"SELECT COUNT(*) FROM products WHERE ai_category IN ({placeholders})", matched_cats)
    count = cur.fetchone()[0]
    print(f"Products to remove: {count}")

    if dry_run:
        print("\n[DRY RUN] Categories that would be removed:")
        for cat in sorted(matched_cats):
            cur.execute("SELECT COUNT(*) FROM products WHERE ai_category = ?", (cat,))
            n = cur.fetchone()[0]
            print(f"  {cat}: {n} products")
        conn.close()
        return

    # Delete mappings for non-food products first
    cur.execute(f"""
        DELETE FROM ingredient_product_map
        WHERE product_id IN (
            SELECT id FROM products WHERE ai_category IN ({placeholders})
        )
    """, matched_cats)
    deleted_mappings = cur.rowcount
    print(f"Deleted {deleted_mappings} ingredient-product mappings")

    # Delete non-food products
    cur.execute(f"DELETE FROM products WHERE ai_category IN ({placeholders})", matched_cats)
    deleted_products = cur.rowcount
    print(f"Deleted {deleted_products} non-food products")

    # Count remaining
    cur.execute("SELECT COUNT(*) FROM products")
    remaining = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM products WHERE is_basic_ingredient = 1")
    mapped = cur.fetchone()[0]
    print(f"\nRemaining: {remaining} products ({mapped} mapped to ingredients)")

    conn.commit()
    conn.close()
    print("Done!")


if __name__ == "__main__":
    main()
