import html
import re

from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Dict, Any, Literal


def _sanitize_food_list(values: List[str], field_name: str, max_items: int = 50) -> List[str]:
    """Sanitize a list of food/allergen strings to prevent injection."""
    if len(values) > max_items:
        raise ValueError(f"{field_name} no puede tener mas de {max_items} elementos")
    sanitized = []
    for v in values:
        if not isinstance(v, str):
            continue
        clean = html.escape(v.strip())
        clean = re.sub(r'[<>\"\';&]', '', clean)
        if len(clean) > 100:
            clean = clean[:100]
        if clean:
            sanitized.append(clean)
    return sanitized

# ==========================================
# 1. AUTENTICACIÓN Y USUARIOS
# ==========================================
class UserOut(BaseModel):
    id: int
    email: str
    full_name: Optional[str] = None
    
    model_config = {"from_attributes": True}

class UserProfileUpdate(BaseModel):
    age: int
    weight: float
    height: float
    gender: str
    goal: Optional[str] = None
    activity_level: Optional[str] = None

# ==========================================
# 2. WIZARD (GENERADOR DE MENÚ)
# ==========================================
class WizardData(BaseModel):
    # Campos obligatorios
    goal: str
    diet: Literal["omnivoro", "vegetariano", "vegano", "sin_gluten", "keto", "paleo", "sin_lactosa"] = Field(..., alias="diet")

    # Campos opcionales con valores por defecto
    current_weight: float = 0.0
    target_weight: float = 0.0
    budget: float = 80.0  # Legacy, mantener por compatibilidad
    economic_level: Literal["economico", "normal", "premium"] = "normal"
    prioritize_offers: bool = True

    # Plan customization
    plan_days: int = Field(default=7, ge=1, le=14)
    meals_per_day: int = Field(default=3, ge=2, le=5)
    menu_mode: Literal["savings", "variety"] = "savings"
    cooking_time: str = "normal"  # "express" (≤15min), "normal" (15-45min), "chef" (45min+)
    skill_level: str = "intermediate"  # "beginner", "intermediate", "advanced"
    meal_prep: bool = False  # batch cooking mode

    # Listas y diccionarios
    allergens: List[str] = []
    hated_foods: List[str] = []  # [NUEVO] Ingredientes que no le gustan (sin ser alérgeno)
    pantry_items: List[Any] = []

    # Preferencias de texto libre
    preferences: Optional[str] = None

    macros: Dict[str, Any] = {}

    # Family mode
    family_members: List[Dict[str, Any]] = []  # list of {name, age, gender, weight, height, activity_level, goal, target_calories, allergens, hated_foods}

    # Campos técnicos
    activity_level: Optional[str] = "moderate"
    target_calories: Optional[int] = 2000
    preferred_supermarket: Optional[str] = None

    @field_validator("allergens")
    @classmethod
    def sanitize_allergens(cls, v):
        return _sanitize_food_list(v, "allergens")

    @field_validator("hated_foods")
    @classmethod
    def sanitize_hated_foods(cls, v):
        return _sanitize_food_list(v, "hated_foods")

    @field_validator("target_calories")
    @classmethod
    def validate_target_calories(cls, v):
        if v is not None and (v < 800 or v > 10000):
            raise ValueError("target_calories debe estar entre 800 y 10000")
        return v

    class Config:
        populate_by_name = True

# ==========================================
# 3. SALIDA ESTRUCTURADA IA (GEMINI)
# ==========================================
class MacroResumen(BaseModel):
    calorias: int
    proteinas: int
    carbohidratos: int
    grasas: int

class MealItem(BaseModel):
    nombre: str = Field(description="Nombre creativo y apetitoso del plato")
    calorias: int
    ingredientes: List[str] = Field(description="Lista de ingredientes principales (ej: ['100g Pollo', '50g Arroz'])")
    justificacion: str = Field(description="Breve razón nutricional")
    macros: MacroResumen

class DayPlan(BaseModel):
    dia: str = Field(description="Nombre del día")
    resumen: MacroResumen
    desayuno: Optional[MealItem] = None
    almuerzo: Optional[MealItem] = None
    comida: Optional[MealItem] = None
    merienda: Optional[MealItem] = None
    cena: Optional[MealItem] = None

class WeeklyPlanResponse(BaseModel):
    menu: List[DayPlan] = Field(description="Lista ordenada de 7 días")

# ==========================================
# 4. INVENTARIO
# ==========================================
class InventoryItemBase(BaseModel):
    name: str
    quantity: float = 1.0
    unit: str = "ud"
    category: Optional[str] = "Despensa"
    min_quantity: float = 1.0
    detail: Optional[str] = None
    canonical_key: Optional[str] = None

class InventoryItemCreate(InventoryItemBase):
    pass

class InventoryItemUpdate(BaseModel):
    name: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    category: Optional[str] = None
    min_quantity: Optional[float] = None
    detail: Optional[str] = None
    canonical_key: Optional[str] = None

class InventoryItemRead(InventoryItemBase):
    id: int
    user_id: int

    class Config:
        from_attributes = True

# ==========================================
# 5. INPUTS API (REQUEST MODELS) - [FIXED]
# ==========================================
class IngredientsList(BaseModel):
    ingredients: List[str]

class RecipeRequest(BaseModel):
    dish_name: str
    supermarket: Optional[str] = None
    # [FIX V2] Acepta tanto strings (V1) como objetos {product_id, qty_used, unit} (V2)
    original_ingredients: Optional[List[Any]] = None
    porciones: Optional[float] = 1.0

class RegenerateDishRequest(BaseModel):
    current_dish: str
    calories: int = 500
    diet_type: Optional[str] = "equilibrada"
    allergens: List[str] = []
    hated_foods: List[str] = []
    meal_type: Optional[str] = None
    excluded_recipe_ids: List[int] = []

class RecalculateShoppingRequest(BaseModel):
    menu: List[Dict[str, Any]]
    products_map: Dict[str, Any] = {}

class WeeklyMenuRequest(BaseModel):
    menu: List[Dict[str, Any]]
    prioritize_offers: bool = True

class ComparisonItemRequest(BaseModel):
    name: str
    total_qty: float = 1.0
    unit: str = "ud"

    class Config:
        extra = "ignore"


# ==========================================
# 6. SISTEMA V2 - INGREDIENTES POR PRODUCT_ID
# ==========================================
# Este sistema permite que Gemini elija productos específicos de la DB
# y el comparador los muestre directamente sin búsqueda.

class ProductIngredient(BaseModel):
    """Ingrediente referenciado por ID de producto real de la DB."""
    product_id: int = Field(description="ID del producto en la DB (ej: 12345)")
    qty_used: float = Field(description="Cantidad usada en gramos o ml (ej: 200)")
    unit: str = Field(default="g", description="Unidad: g, ml, ud")

class MealItemV2(BaseModel):
    """Comida con ingredientes referenciados por product_id."""
    nombre: str = Field(description="Nombre creativo y apetitoso del plato")
    calorias: int
    ingredientes: List[ProductIngredient] = Field(
        description="Lista de ingredientes con product_id y cantidad usada"
    )
    justificacion: str = Field(description="Breve razón nutricional")
    macros: MacroResumen

class DayPlanV2(BaseModel):
    """Plan diario con MealItemV2."""
    dia: str = Field(description="Nombre del día")
    resumen: MacroResumen
    desayuno: Optional[MealItemV2] = None
    almuerzo: Optional[MealItemV2] = None
    comida: Optional[MealItemV2] = None
    merienda: Optional[MealItemV2] = None
    cena: Optional[MealItemV2] = None

class WeeklyPlanResponseV2(BaseModel):
    """
    Respuesta semanal V2 con product_ids.
    NOTA: products_map se añade programáticamente después de la respuesta de Gemini,
    no forma parte del schema que Gemini genera.
    """
    menu: List[DayPlanV2] = Field(description="Lista ordenada de días")


# ==========================================
# 7. RECIPE RATINGS & PLAN HISTORY
# ==========================================
class RateRecipeRequest(BaseModel):
    recipe_id: int
    rating: Literal["favorite", "like", "dislike"]


# ==========================================
# 8. FAMILY MODE
# ==========================================
class FamilyMemberCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    age: int = Field(..., ge=1, le=120)
    gender: Literal["male", "female", "other"] = "male"
    weight_kg: float = Field(..., ge=20, le=300)
    height_cm: float = Field(..., ge=80, le=250)
    activity_level: Literal["sedentary", "light", "moderate", "active", "very_active"] = "moderate"
    goal: Literal["lose_weight", "maintain", "gain_muscle"] = "maintain"
    target_calories: int = Field(default=2000, ge=800, le=10000)
    allergens: List[str] = []
    hated_foods: List[str] = []

    @field_validator("allergens")
    @classmethod
    def sanitize_member_allergens(cls, v):
        return _sanitize_food_list(v, "allergens")

    @field_validator("hated_foods")
    @classmethod
    def sanitize_member_hated(cls, v):
        return _sanitize_food_list(v, "hated_foods")


class FamilyMemberOut(FamilyMemberCreate):
    id: int

    model_config = {"from_attributes": True}