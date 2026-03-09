from datetime import date, datetime
from enum import Enum
from typing import List, Optional

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
# Use JSON for SQLite, JSONB for PostgreSQL
from .database import IS_POSTGRES
if IS_POSTGRES:
    from sqlalchemy.dialects.postgresql import JSONB
else:
    JSONB = JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from .database import Base

# ==========================================
# Enums
# ==========================================
class UserRole(str, Enum):
    FREE = "free"
    PREMIUM = "premium"
    ADMIN = "admin"


class Gender(str, Enum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"


class GoalType(str, Enum):
    LOSE_WEIGHT = "lose_weight"
    GAIN_MUSCLE = "gain_muscle"
    MAINTAIN = "maintain"


class ActivityLevel(str, Enum):
    SEDENTARY = "sedentary"
    LIGHT = "light"
    MODERATE = "moderate"
    ACTIVE = "active"
    VERY_ACTIVE = "very_active"


class DietType(str, Enum):
    OMNIVORE = "omnivore"
    VEGETARIAN = "vegetarian"
    VEGAN = "vegan"
    KETO = "keto"
    PALEO = "paleo"
    GLUTEN_FREE = "gluten_free"


class MealType(str, Enum):
    DESAYUNO = "desayuno"
    ALMUERZO = "almuerzo"       # media mañana
    COMIDA = "comida"           # comida principal del mediodía
    MERIENDA = "merienda"       # merienda de la tarde
    CENA = "cena"


# ==========================================
# 1. User & Onboarding Module
# ==========================================
class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String)
    full_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    google_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    apple_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Relationships
    profile: Mapped["UserProfile"] = relationship(
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
    )
    goals: Mapped["UserGoals"] = relationship(
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
    )
    preferences: Mapped["UserPreferences"] = relationship(
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
    )
    subscription: Mapped["Subscription"] = relationship(
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
    )

    daily_plans: Mapped[List["DailyPlan"]] = relationship(back_populates="user")
    daily_trackings: Mapped[List["DailyTracking"]] = relationship(back_populates="user")
    pantry_items: Mapped[List["PantryItem"]] = relationship(back_populates="user")
    shopping_lists: Mapped[List["ShoppingList"]] = relationship(back_populates="user")
    shopping_history: Mapped[List["ShoppingHistory"]] = relationship(back_populates="user")
    support_tickets: Mapped[List["SupportTicket"]] = relationship(back_populates="user")
    family_members: Mapped[List["FamilyMember"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )


class FamilyMember(Base):
    """Family member profile for multi-person meal planning."""
    __tablename__ = "family_members"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    age: Mapped[int] = mapped_column(Integer, nullable=False)
    gender: Mapped[str] = mapped_column(String(10), nullable=False, server_default="male")
    weight_kg: Mapped[float] = mapped_column(Float, nullable=False, server_default="70")
    height_cm: Mapped[float] = mapped_column(Float, nullable=False, server_default="170")
    activity_level: Mapped[str] = mapped_column(String(20), nullable=False, server_default="moderate")
    goal: Mapped[str] = mapped_column(String(20), nullable=False, server_default="maintain")
    target_calories: Mapped[int] = mapped_column(Integer, nullable=False, server_default="2000")
    allergens: Mapped[Optional[list]] = mapped_column(JSON, default=list)
    hated_foods: Mapped[Optional[list]] = mapped_column(JSON, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="family_members")


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)

    age: Mapped[int] = mapped_column(Integer)
    gender: Mapped[Gender] = mapped_column(String)
    height_cm: Mapped[float] = mapped_column(Float)
    weight_kg: Mapped[float] = mapped_column(Float)

    user: Mapped["User"] = relationship(back_populates="profile")


class UserGoals(Base):
    __tablename__ = "user_goals"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)

    goal_type: Mapped[GoalType] = mapped_column(String)
    target_weight_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    weekly_rate_kg: Mapped[float] = mapped_column(Float, default=0.5)
    activity_level: Mapped[ActivityLevel] = mapped_column(String)

    target_calories: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    user: Mapped["User"] = relationship(back_populates="goals")


class UserPreferences(Base):
    __tablename__ = "user_preferences"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)

    weekly_budget: Mapped[float] = mapped_column(Float, default=100.0)
    diet_type: Mapped[DietType] = mapped_column(String, default=DietType.OMNIVORE)

    allergies: Mapped[Optional[list]] = mapped_column(JSON, default=list)
    hated_foods: Mapped[Optional[list]] = mapped_column(JSON, default=list)

    user: Mapped["User"] = relationship(back_populates="preferences")


class Subscription(Base):
    __tablename__ = "subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)

    status: Mapped[UserRole] = mapped_column(String, default=UserRole.FREE)
    renewal_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    user: Mapped["User"] = relationship(back_populates="subscription")


# ==========================================
# 2. Planning Module
# ==========================================
class Recipe(Base):
    __tablename__ = "recipes"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    instructions: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    calories: Mapped[int] = mapped_column(Integer, default=0)
    protein: Mapped[float] = mapped_column(Float, default=0.0)
    carbs: Mapped[float] = mapped_column(Float, default=0.0)
    fats: Mapped[float] = mapped_column(Float, default=0.0)
    image_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    servings: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=1)
    meal_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    suitable_diets: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    prep_time_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    difficulty: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    slug: Mapped[Optional[str]] = mapped_column(String, nullable=True, index=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    ingredients: Mapped[List["RecipeIngredient"]] = relationship(
        back_populates="recipe",
        cascade="all, delete-orphan",
    )


class RecipeIngredient(Base):
    __tablename__ = "recipe_ingredients"

    id: Mapped[int] = mapped_column(primary_key=True)
    recipe_id: Mapped[int] = mapped_column(ForeignKey("recipes.id"))

    name: Mapped[str] = mapped_column(String)
    quantity: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String)

    recipe: Mapped["Recipe"] = relationship(back_populates="ingredients")


class DailyPlan(Base):
    __tablename__ = "daily_plans"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    date: Mapped[date] = mapped_column(Date, index=True)

    # Columnas de validación de contexto para el cache
    goal_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    diet_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    target_calories: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    user: Mapped["User"] = relationship(back_populates="daily_plans")
    meals: Mapped[List["Meal"]] = relationship(
        back_populates="daily_plan",
        cascade="all, delete-orphan",
    )


class Meal(Base):
    __tablename__ = "meals"

    id: Mapped[int] = mapped_column(primary_key=True)
    daily_plan_id: Mapped[int] = mapped_column(ForeignKey("daily_plans.id"))
    recipe_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("recipes.id"),
        nullable=True,
    )

    meal_type: Mapped[MealType] = mapped_column(String)
    servings: Mapped[float] = mapped_column(Float, default=1.0)

    daily_plan: Mapped["DailyPlan"] = relationship(back_populates="meals")
    recipe: Mapped[Optional["Recipe"]] = relationship()


# ==========================================
# 2b. User Active Plan Cache
# ==========================================
class UserActivePlan(Base):
    """Stores the full plan JSON so users can restore their plan after re-login."""
    __tablename__ = "user_active_plans"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, index=True)
    plan_data: Mapped[dict] = mapped_column(JSONB, nullable=False)
    wizard_data: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    tracking_data: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    user: Mapped["User"] = relationship()


# ==========================================
# 2c. User Recipe Ratings (Favorites / Like / Dislike)
# ==========================================
class UserRecipeRating(Base):
    """User ratings for recipes: favorite, like, or dislike."""
    __tablename__ = "user_recipe_ratings"
    __table_args__ = (UniqueConstraint("user_id", "recipe_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    recipe_id: Mapped[int] = mapped_column(ForeignKey("recipes.id"), index=True)
    rating: Mapped[str] = mapped_column(String(10))  # 'favorite', 'like', 'dislike'
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    user: Mapped["User"] = relationship()
    recipe: Mapped["Recipe"] = relationship()


# ==========================================
# 2d. Plan History (Past Weekly Plans)
# ==========================================
class PlanHistory(Base):
    """Archives past plans so users can restore previous weeks."""
    __tablename__ = "plan_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    plan_data: Mapped[dict] = mapped_column(JSONB, nullable=False)
    wizard_data: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    label: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # e.g. "Semana 24 Feb"
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    user: Mapped["User"] = relationship()


# ==========================================
# 3. Tracking Module
# ==========================================
class DailyTracking(Base):
    __tablename__ = "daily_tracking"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    date: Mapped[date] = mapped_column(Date, index=True)

    water_intake_ml: Mapped[int] = mapped_column(Integer, default=0)
    calories_consumed: Mapped[int] = mapped_column(Integer, default=0)
    weight_log_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    meals_logged: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True, default=dict)
    meal_details: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True, default=dict)

    user: Mapped["User"] = relationship(back_populates="daily_trackings")


# ==========================================
# 4. Shopping & Inventory Module
# ==========================================
class PantryItem(Base):
    __tablename__ = "pantry_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    name: Mapped[str] = mapped_column(String, index=True)
    quantity: Mapped[float] = mapped_column(Float, default=1.0)
    unit: Mapped[str] = mapped_column(String, default="u")

    category: Mapped[str] = mapped_column(String, default="Despensa", index=True)
    min_quantity: Mapped[float] = mapped_column(Float, default=1.0)
    detail: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    canonical_key: Mapped[Optional[str]] = mapped_column(String, nullable=True, index=True)

    user: Mapped["User"] = relationship(back_populates="pantry_items")


class ShoppingList(Base):
    __tablename__ = "shopping_lists"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    name: Mapped[str] = mapped_column(String, default="My Shopping List")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    user: Mapped["User"] = relationship(back_populates="shopping_lists")
    items: Mapped[List["ShoppingListItem"]] = relationship(
        back_populates="shopping_list",
        cascade="all, delete-orphan",
    )


class ShoppingListItem(Base):
    __tablename__ = "shopping_list_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    shopping_list_id: Mapped[int] = mapped_column(
        ForeignKey("shopping_lists.id"),
        index=True,
    )

    name: Mapped[str] = mapped_column(String, index=True)
    canonical_name: Mapped[Optional[str]] = mapped_column(String, nullable=True, index=True)  # [FIX] Para búsqueda precisa en comparador
    quantity: Mapped[float] = mapped_column(Float, default=1.0)
    unit: Mapped[str] = mapped_column(String, default="u")
    category: Mapped[str] = mapped_column(String, default="General", index=True)
    is_checked: Mapped[bool] = mapped_column(Boolean, default=False)

    shopping_list: Mapped["ShoppingList"] = relationship(back_populates="items")


class ShoppingHistory(Base):
    __tablename__ = "shopping_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

    date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    total_cost: Mapped[float] = mapped_column(Float)
    total_saved: Mapped[float] = mapped_column(Float, default=0.0)
    supermarket: Mapped[str] = mapped_column(String)

    user: Mapped["User"] = relationship(back_populates="shopping_history")


# ==========================================
# 5. Support & System Module
# ==========================================
class SupportTicket(Base):
    __tablename__ = "support_tickets"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

    subject: Mapped[str] = mapped_column(String)
    message: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String, default="open")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    user: Mapped["User"] = relationship(back_populates="support_tickets")


# ==========================================
# 6. PRODUCTS TABLE (Migrated from prices.db)
# ==========================================
class Product(Base):
    """
    Modelo de la tabla 'products'.
    34 columnas - Limpiado 2025-02.
    """

    __tablename__ = "products"

    # Primary Key
    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    # Core product info
    product_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True, index=True)
    brand: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    supermarket: Mapped[Optional[str]] = mapped_column(Text, nullable=True, index=True)
    price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    product_format: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    image_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    date_scraped: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    canonical_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Unit pricing
    base_amount: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    base_unit: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    pum_calculated: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # AI Classification
    ai_category: Mapped[Optional[str]] = mapped_column(Text, nullable=True, index=True)
    ai_tags: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ingredient_nature: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Product classification
    product_form: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    processing_level: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    is_basic_ingredient: Mapped[int] = mapped_column(Integer, default=0)
    is_composite: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    is_bulk: Mapped[int] = mapped_column(Integer, default=0)
    is_perishable: Mapped[bool] = mapped_column(Boolean, default=False)

    # Offer data
    original_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    offer_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    discount_percentage: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    is_on_offer: Mapped[int] = mapped_column(Integer, default=0)

    # Scoring
    purity_score: Mapped[int] = mapped_column(Integer, default=50)

    # FTS columns (PostgreSQL Full-Text Search)
    main_concept: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class FailedMatch(Base):
    __tablename__ = "failed_matches"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    query_text: Mapped[str] = mapped_column(String, index=True)
    category: Mapped[str] = mapped_column(String)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    suggested_closest_match: Mapped[Optional[str]] = mapped_column(
        String,
        nullable=True,
    )


# ==========================================
# 7. Audit & Monitoring Module (V10.0)
# ==========================================
class AuditLog(Base):
    """
    Registro de auditoría para trazabilidad de cambios críticos.
    Uso: Registrar modificaciones en perfil, datos sensibles, etc.
    """

    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    action: Mapped[str] = mapped_column(
        String(100),
        index=True,
    )  # "UPDATE_PROFILE", "DELETE_ITEM", etc.
    table_name: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        index=True,
    )
    record_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    old_values: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    new_values: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        index=True,
    )


class UserSession(Base):
    """
    Gestión de sesiones activas de usuarios.
    Uso: Login, logout remoto, ver dispositivos conectados.
    """

    __tablename__ = "user_sessions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )
    session_token: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    last_activity: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


# ==========================================
# 8. Ingredient Mapping Module (V2 Comparator)
# ==========================================
class Ingredient(Base):
    """
    Master ingredient catalog. Each row = one abstract ingredient
    (e.g. "huevos", "pechuga_pollo"). Products map to ingredients
    via IngredientProductMap for deterministic price comparison.
    """

    __tablename__ = "ingredients"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    canonical_key: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    category: Mapped[str] = mapped_column(String, nullable=False, server_default="otros")
    standard_unit: Mapped[str] = mapped_column(String, nullable=False, server_default="g")
    unit_weight_g: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    is_perishable: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, server_default="true")
    is_vegan: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    is_vegetarian: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    is_gluten_free: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    is_dairy_free: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, server_default=func.now())

    # Relationships
    product_maps: Mapped[List["IngredientProductMap"]] = relationship(
        back_populates="ingredient",
        cascade="all, delete-orphan",
    )
    aliases: Mapped[List["IngredientAlias"]] = relationship(
        back_populates="ingredient",
        cascade="all, delete-orphan",
    )


class IngredientProductMap(Base):
    """
    Explicit mapping between abstract ingredients and real supermarket products.
    JOIN on this table replaces all text-based ILIKE/regex search.
    """

    __tablename__ = "ingredient_product_map"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    ingredient_id: Mapped[int] = mapped_column(
        ForeignKey("ingredients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Relationships
    ingredient: Mapped["Ingredient"] = relationship(back_populates="product_maps")
    product: Mapped["Product"] = relationship()


class IngredientAlias(Base):
    """
    Synonym resolution: maps alternative names to canonical ingredients.
    E.g. "miel" -> ingredient "condimentos_miel_flores",
         "pan_integral" -> ingredient "pan_pan_molde_integral".
    """

    __tablename__ = "ingredient_aliases"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    ingredient_id: Mapped[int] = mapped_column(
        ForeignKey("ingredients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    alias: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)

    # Relationships
    ingredient: Mapped["Ingredient"] = relationship(back_populates="aliases")


# ==========================================
# 10. Supermarket Registry
# ==========================================
class Supermarket(Base):
    """
    Registry of supported supermarkets.
    """

    __tablename__ = "supermarkets"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(50))
    color: Mapped[str] = mapped_column(String(7), default="#666666")
    icon: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    affiliate_url_template: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    affiliate_tag: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
