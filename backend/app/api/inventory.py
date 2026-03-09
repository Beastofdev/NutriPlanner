# backend/app/api/inventory.py

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.auth import get_current_user, get_optional_user
from app.db.database import get_db
from app.db.models import Ingredient, PantryItem, User
from app.schemas import InventoryItemCreate, InventoryItemRead, InventoryItemUpdate

router = APIRouter()

# 1. OBTENER INVENTARIO
@router.get("/", response_model=List[InventoryItemRead])
def get_inventory(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Devuelve todos los productos de la despensa del usuario actual."""
    # Asumimos relación lazy/ eager ya configurada en el modelo User
    return list(current_user.pantry_items)

# 2. AÑADIR ITEM (evita duplicados sumando cantidad)
@router.post("/", response_model=InventoryItemRead, status_code=status.HTTP_201_CREATED)
def add_inventory_item(
    item: InventoryItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Añade un producto al inventario o suma cantidades si ya existe."""
    existing_item = (
        db.query(PantryItem)
        .filter(
            PantryItem.user_id == current_user.id,
            PantryItem.name == item.name,
        )
        .first()
    )

    if existing_item:
        existing_item.quantity += item.quantity
        db.commit()
        db.refresh(existing_item)
        return existing_item

    # Auto-resolve canonical_key from Ingredient table if not provided
    canonical_key = item.canonical_key
    if not canonical_key:
        import unicodedata
        normalized = item.name.lower().strip()
        normalized = unicodedata.normalize("NFKD", normalized)
        normalized = "".join(c for c in normalized if not unicodedata.combining(c))
        normalized = normalized.replace(" ", "_")
        ing = db.query(Ingredient).filter(Ingredient.canonical_key == normalized).first()
        if ing:
            canonical_key = ing.canonical_key
        else:
            canonical_key = normalized

    new_item = PantryItem(
        user_id=current_user.id,
        name=item.name,
        quantity=item.quantity,
        unit=item.unit,
        category=item.category or "Despensa",
        min_quantity=item.min_quantity,
        detail=item.detail,
        canonical_key=canonical_key,
    )
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return new_item

# 3. ACTUALIZAR CANTIDAD O DATOS
@router.patch("/{item_id}", response_model=InventoryItemRead)
def update_inventory_item(
    item_id: int,
    item_update: InventoryItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Actualiza datos de un producto del inventario del usuario actual."""
    db_item = (
        db.query(PantryItem)
        .filter(
            PantryItem.id == item_id,
            PantryItem.user_id == current_user.id,
        )
        .first()
    )

    if not db_item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado")

    update_data = item_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_item, key, value)

    db.commit()
    db.refresh(db_item)
    return db_item

# 4. BORRAR ITEM
@router.delete("/{item_id}", status_code=status.HTTP_200_OK)
def delete_inventory_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Elimina un producto del inventario del usuario actual."""
    db_item = (
        db.query(PantryItem)
        .filter(
            PantryItem.id == item_id,
            PantryItem.user_id == current_user.id,
        )
        .first()
    )

    if not db_item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado")

    db.delete(db_item)
    db.commit()
    return {"message": "Eliminado correctamente"}

# 5. BATCH DECREMENT (deduct ingredients after eating a meal)
@router.post("/decrement")
def decrement_inventory_items(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Batch decrement pantry items when a meal is logged.
    Expects: { "items": [{ "name": "...", "qty": 1.0, "unit": "g" }, ...] }
    Items that reach 0 are deleted. Missing items are skipped.
    """
    items = payload.get("items", [])
    if not items:
        return {"status": "ok", "decremented": 0, "deleted": 0}

    decremented = 0
    deleted = 0

    for item_data in items:
        name = item_data.get("name", "").strip()
        qty = float(item_data.get("qty", 0))
        if not name or qty <= 0:
            continue

        db_item = (
            db.query(PantryItem)
            .filter(
                PantryItem.user_id == current_user.id,
                PantryItem.name == name,
            )
            .first()
        )

        if not db_item:
            continue

        db_item.quantity = max(0, db_item.quantity - qty)
        if db_item.quantity <= 0:
            db.delete(db_item)
            deleted += 1
        else:
            decremented += 1

    db.commit()
    return {"status": "ok", "decremented": decremented, "deleted": deleted}


# 6. CARGA MASIVA (migración/inicialización)
@router.post("/upload")
def bulk_upload_inventory(
    items: List[InventoryItemCreate],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Carga masiva de productos. Si existen, suma cantidad; si no, crea entrada."""
    count = 0
    for item in items:
        existing = (
            db.query(PantryItem)
            .filter(
                PantryItem.user_id == current_user.id,
                PantryItem.name == item.name,
            )
            .first()
        )

        if existing:
            existing.quantity += item.quantity
        else:
            new_item = PantryItem(
                user_id=current_user.id,
                name=item.name,
                quantity=item.quantity,
                unit=item.unit,
                category=item.category or "Despensa",
                min_quantity=item.min_quantity,
            )
            db.add(new_item)

        count += 1

    db.commit()
    return {"status": "ok", "processed": count}


# 6. OBTENER INGREDIENTES COMUNES (para autocompletado)
@router.get("/common-ingredients")
def get_common_ingredients(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_optional_user),
):
    """
    Retorna lista de ingredientes comunes para autocompletado.
    Incluye ingredientes canónicos y los más usados en pantry_items.
    """
    # Ingredientes básicos hardcodeados
    basic_ingredients = [
        "Aceite de oliva",
        "Arroz",
        "Sal",
        "Azúcar",
        "Leche",
        "Huevos",
        "Harina",
        "Mantequilla",
        "Queso",
        "Tomate",
        "Cebolla",
        "Ajo",
        "Patatas",
        "Pasta",
        "Pan",
        "Pollo",
        "Carne",
        "Pescado",
        "Almendras",
        "Nueces",
        "Arándanos",
        "Frambuesas",
        "Fresas",
        "Plátano",
        "Manzana",
        "Naranja",
        "Yogur",
        "Limón",
        "Pimienta",
        "Perejil",
        "Orégano",
        "Albahaca",
        "Zanahoria",
        "Pimiento",
        "Berenjena",
        "Calabacín",
        "Espinacas",
        "Lechuga",
        "Brócoli",
        "Lentejas",
        "Garbanzos",
        "Judías",
        "Atún",
        "Salmón",
        "Jamón",
        "Chorizo",
        "Miel",
        "Chocolate",
        "Café",
        "Té",
        "Vino",
        "Cerveza",
    ]

    # Obtener ingredientes de la tabla master (con categorías reales)
    db_ingredients = (
        db.query(Ingredient.name)
        .order_by(Ingredient.name)
        .all()
    )
    canonical_names = [row[0] for row in db_ingredients]

    # Filtrar nombres que claramente no son alimentos
    non_food_keywords = [
        'esponja', 'pinza', 'filtro', 'biberón', 'biberon', 'pants', 'pañal',
        'cuchillo', 'rodillo', 'recipiente', 'vaso', 'bolsa', 'sobre perfumado',
        'bolsitas perfumadas', 'serum', 'gel', 'bálsamo', 'corrector', 'brillo',
        'desenredante', 'pastilla', 'carbón', 'bombón', 'chicle', 'golosinas',
        'gominolas', 'caramelo', 'palillo', 'cuelga', 'ampolla', 'bomba',
    ]

    # Combinar y eliminar duplicados + no-alimentos
    all_ingredients = list(set(basic_ingredients + canonical_names))
    all_ingredients = [
        ing for ing in all_ingredients
        if not any(nf in ing.lower() for nf in non_food_keywords)
    ]
    all_ingredients.sort()

    return {"ingredients": all_ingredients}


# 7. DESPENSA BÁSICA — items esenciales filtrados por dieta
BASIC_PANTRY = [
    {"name": "Aceite de oliva", "canonical_key": "aceite_oliva", "category": "Aceites", "unit": "l"},
    {"name": "Sal", "canonical_key": "sal", "category": "Especias", "unit": "ud"},
    {"name": "Pimienta negra", "canonical_key": "pimienta_negra", "category": "Especias", "unit": "ud"},
    {"name": "Azúcar", "canonical_key": "azucar", "category": "Despensa", "unit": "kg"},
    {"name": "Vinagre", "canonical_key": "vinagre", "category": "Aceites", "unit": "l"},
    {"name": "Harina de trigo", "canonical_key": "harina_trigo", "category": "Despensa", "unit": "kg", "exclude_diets": ["sin_gluten", "keto", "paleo"]},
    {"name": "Arroz", "canonical_key": "arroz", "category": "Despensa", "unit": "kg", "exclude_diets": ["keto", "paleo"]},
    {"name": "Pasta", "canonical_key": "pasta", "category": "Despensa", "unit": "kg", "exclude_diets": ["sin_gluten", "keto", "paleo"]},
    {"name": "Ajo", "canonical_key": "ajo", "category": "Verduras", "unit": "ud"},
    {"name": "Cebolla", "canonical_key": "cebolla", "category": "Verduras", "unit": "ud"},
    {"name": "Tomate frito", "canonical_key": "tomate_frito", "category": "Conservas", "unit": "ud"},
    {"name": "Leche", "canonical_key": "leche", "category": "Lácteos", "unit": "l", "exclude_diets": ["vegano", "sin_lactosa"]},
    {"name": "Huevos", "canonical_key": "huevo", "category": "Lácteos", "unit": "ud", "exclude_diets": ["vegano"]},
    {"name": "Mantequilla", "canonical_key": "mantequilla", "category": "Lácteos", "unit": "ud", "exclude_diets": ["vegano", "sin_lactosa"]},
    {"name": "Orégano", "canonical_key": "oregano", "category": "Especias", "unit": "ud"},
    {"name": "Pimentón", "canonical_key": "pimenton", "category": "Especias", "unit": "ud"},
    {"name": "Comino", "canonical_key": "comino", "category": "Especias", "unit": "ud"},
    {"name": "Laurel", "canonical_key": "laurel", "category": "Especias", "unit": "ud"},
    {"name": "Perejil", "canonical_key": "perejil", "category": "Especias", "unit": "ud"},
    {"name": "Pan rallado", "canonical_key": "pan_rallado", "category": "Despensa", "unit": "ud", "exclude_diets": ["sin_gluten", "keto", "paleo"]},
    {"name": "Caldo de pollo", "canonical_key": "caldo_pollo", "category": "Conservas", "unit": "l", "exclude_diets": ["vegano", "vegetariano"]},
    {"name": "Caldo de verduras", "canonical_key": "caldo_verduras", "category": "Conservas", "unit": "l"},
    {"name": "Miel", "canonical_key": "miel", "category": "Despensa", "unit": "ud", "exclude_diets": ["vegano"]},
    {"name": "Limón", "canonical_key": "limon", "category": "Frutas", "unit": "ud"},
]


@router.get("/pantry-essentials")
def get_pantry_essentials(
    diet: str = "omnivoro",
    current_user: User = Depends(get_optional_user),
):
    """Devuelve la lista de items esenciales de despensa, filtrada por dieta."""
    filtered = []
    for item in BASIC_PANTRY:
        exclude_diets = item.get("exclude_diets", [])
        if diet in exclude_diets:
            continue
        filtered.append({
            "name": item["name"],
            "canonical_key": item["canonical_key"],
            "category": item["category"],
            "unit": item["unit"],
            "quantity": 1.0,
        })
    return {"essentials": filtered}