import json
import logging
import mimetypes
import os
import time
from pathlib import Path

# Register .webp mimetype (not always present in Python's mimetypes DB)
mimetypes.add_type("image/webp", ".webp")

import sentry_sdk
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api import auth, endpoints, inventory, planner, users
from app.db import models
from app.db.database import engine

# [FIX] Custom JSON Response con UTF-8 correcto (sin escape de caracteres especiales)
class UTF8JSONResponse(JSONResponse):
    def render(self, content) -> bytes:
        return json.dumps(
            content,
            ensure_ascii=False,  # Permite caracteres UTF-8 directamente
            allow_nan=False,
            indent=None,
            separators=(",", ":"),
        ).encode("utf-8")

# --- CONFIGURACIÓN DE LOGS ---
logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s:%(name)s:%(message)s",
    handlers=[logging.StreamHandler()],
)
logger = logging.getLogger("NutriPlanner.API")
logger.setLevel(logging.INFO)

logs_dir = Path(__file__).parent.parent / "logs"
logs_dir.mkdir(exist_ok=True)

all_requests_handler = logging.FileHandler(logs_dir / "requests.log")
all_requests_handler.setFormatter(
    logging.Formatter("%(asctime)s - %(message)s")
)
logger.addHandler(all_requests_handler)

slow_query_handler = logging.FileHandler(logs_dir / "slow_queries.log")
slow_query_handler.setFormatter(
    logging.Formatter("%(asctime)s - %(message)s")
)
slow_logger = logging.getLogger("SlowQueries")
slow_logger.addHandler(slow_query_handler)
slow_logger.setLevel(logging.WARNING)

load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")

# Initialize Sentry error monitoring (only when DSN is configured)
_sentry_dsn = os.getenv("SENTRY_DSN")
if _sentry_dsn:
    sentry_sdk.init(
        dsn=_sentry_dsn,
        environment=os.getenv("ENVIRONMENT", "development"),
        traces_sample_rate=0.2 if os.getenv("ENVIRONMENT") == "production" else 1.0,
        send_default_pii=False,
    )

try:
    models.Base.metadata.create_all(bind=engine)
    print("[main.py] ✅ Database tables ready")
except Exception as e:
    print(f"[main.py] ⚠️ Table creation note: {e}")

# [FIX] Usar UTF8JSONResponse como default para evitar caracteres escapados
app = FastAPI(
    title="NutriPlanner API",
    version="1.0",
    default_response_class=UTF8JSONResponse,
)

# --- EVENTO DE ARRANQUE OPTIMIZADO (V34) ---
@app.on_event("startup")
async def startup_event():
    """Arranque ligero: no carga modelos pesados en memoria."""
    print("\n[startup] Inicializando NutriPlanner v1.0...")
    print("[startup] Modo de busqueda rapida (SQL Logico) activado.")

    # Load supermarket registry into memory
    from app.services.supermarket_registry import supermarket_registry
    from app.db.database import SessionLocal

    session = SessionLocal()
    try:
        # Seed supermarkets table with all supported chains
        from app.db.models import Supermarket
        SUPERMARKETS_SEED = [
            {
                "code": "MERCADONA", "display_name": "Mercadona", "color": "#009234",
                "icon": "storefront", "sort_order": 1,
                "affiliate_url_template": "https://tienda.mercadona.es/search-results?query={product_name}",
            },
            {
                "code": "CONSUM", "display_name": "Consum", "color": "#E8611A",
                "icon": "storefront", "sort_order": 2,
                "affiliate_url_template": "https://tiendaonline.consum.es/SearchEngine?q={product_name}",
            },
        ]
        for seed in SUPERMARKETS_SEED:
            existing = session.query(Supermarket).filter(Supermarket.code == seed["code"]).first()
            if existing:
                # Update affiliate URL if changed
                if existing.affiliate_url_template != seed["affiliate_url_template"]:
                    existing.affiliate_url_template = seed["affiliate_url_template"]
            else:
                session.add(Supermarket(
                    code=seed["code"],
                    display_name=seed["display_name"],
                    color=seed["color"],
                    icon=seed["icon"],
                    is_active=True,
                    affiliate_url_template=seed["affiliate_url_template"],
                    sort_order=seed["sort_order"],
                ))
        session.commit()
        print(f"[startup] Supermarkets seeded: {[s['code'] for s in SUPERMARKETS_SEED]}")
        supermarket_registry.load(session)
        print("[startup] SupermarketRegistry loaded.")
    except Exception as e:
        print(f"[startup] SupermarketRegistry fallback (DB not ready): {e}")

    # Seed ingredient aliases for correct product matching
    try:
        from app.db.models import IngredientAlias, Ingredient as IngModel
        ALIASES = {
            # Salmon: avoid whole-fish "salmon_a_rodajas" (31€), prefer fillets
            "salmon": "lomos_de_salmon_sin_piel_y_sin_espinas_hacendado_congelado",
            "filete_de_salmon": "lomos_de_salmon_sin_piel_y_sin_espinas_hacendado_congelado",
            # Common recipe names → real DB canonical_keys
            "arroz": "arroz_redondo_hacendado",
            "atun": "atun_claro_en_aceite_de_oliva_hacendado",
            "anchoas": "filetes_de_anchoa_en_aceite_de_oliva_hacendado",
            "bacalao": "filetes_de_bacalao_maredeus_ultracongelado",
            "jamon_curado": "jamon_serrano_lonchas_incarlopsa",
            "jamon_serrano": "jamon_serrano_lonchas_incarlopsa",
            "pechuga_pavo": "filetes_pechuga_de_pavo",
            "queso_rallado": "queso_rallado_emmental_gratinar_hacendado",
            "queso_cheddar": "queso_lonchas_cheddar_de_vaca_hacendado",
            "yogur": "yogur_natural_hacendado_0_mg_0_azucares_anadidos",
            "nuez": "nuez_natural_hacendado_pelada",
            "caldo_pollo": "caldo_de_pollo_hacendado",
            "ketchup": "ketchup_hacendado",
            "vinagre_manzana": "vinagre_de_manzana_hacendado",
            "vinagre_vino": "vinagre_de_vino_blanco_hacendado",
            "espaguetis": "macarron_fino_hacendado",
            "espirales": "macarron_fino_hacendado",
            "pasta": "macarron_fino_hacendado",
            "pan_integral": "pan_integral_trigo_100",
            "barra_pan": "barra_de_pan",
            "aceitunas": "aceitunas_verdes_sin_hueso_hacendado",
            "melon": "medio_melon_piel_de_sapo",
        }
        added = 0
        for alias_key, target_key in ALIASES.items():
            existing = session.query(IngredientAlias).filter(IngredientAlias.alias == alias_key).first()
            if existing:
                continue
            target = session.query(IngModel).filter(IngModel.canonical_key == target_key).first()
            if target:
                session.add(IngredientAlias(alias=alias_key, ingredient_id=target.id))
                added += 1
        session.commit()
        if added:
            print(f"[startup] Seeded {added} ingredient aliases")
    except Exception as e:
        session.rollback()
        print(f"[startup] Alias seeding note: {e}")

    # Fix corrupted product prices (price = pum × 99 for some seafood)
    try:
        from sqlalchemy import text as sa_text_fix
        result = session.execute(sa_text_fix("""
            UPDATE products SET price = pum_calculated, base_amount = 1.0
            WHERE pum_calculated > 0 AND base_unit = 'kg'
            AND ABS(price / pum_calculated - 99) < 2
        """))
        if result.rowcount > 0:
            session.commit()
            print(f"[startup] Fixed {result.rowcount} corrupted product prices")
        else:
            session.rollback()
    except Exception as e:
        session.rollback()
        print(f"[startup] Price fix note: {e}")

    # Ensure offer columns exist on products table (FASE 2A migration)
    try:
        from sqlalchemy import text as sa_text_m
        for col_def in [
            "original_price FLOAT",
            "offer_price FLOAT",
            "discount_percentage FLOAT",
            "is_on_offer INTEGER DEFAULT 0",
        ]:
            col_name = col_def.split()[0]
            try:
                session.execute(sa_text_m(f"ALTER TABLE products ADD COLUMN {col_def}"))
                session.commit()
                print(f"[startup] Added column products.{col_name}")
            except Exception:
                session.rollback()  # Column already exists
    except Exception as e:
        print(f"[startup] Offer columns migration note: {e}")

    # Ensure slug column exists (one-time migration for SEO pages)
    try:
        from sqlalchemy import text as sa_text
        session.execute(sa_text("ALTER TABLE recipes ADD COLUMN IF NOT EXISTS slug VARCHAR(300)"))
        session.commit()
        # Generate slugs for any recipes missing them
        rows = session.execute(sa_text("SELECT id, name FROM recipes WHERE slug IS NULL")).fetchall()
        if rows:
            import re, unicodedata
            for row in rows:
                nfkd = unicodedata.normalize("NFKD", row.name)
                ascii_t = nfkd.encode("ascii", "ignore").decode("ascii")
                slug = re.sub(r"[-\s_]+", "-", re.sub(r"[^\w\s-]", "", ascii_t.lower().strip())).strip("-")
                session.execute(sa_text("UPDATE recipes SET slug = :slug WHERE id = :id"), {"slug": slug, "id": row.id})
            session.commit()
            print(f"[startup] Generated slugs for {len(rows)} recipes.")
        else:
            print("[startup] All recipes have slugs.")
    except Exception as e:
        session.rollback()
        print(f"[startup] Slug migration note: {e}")
    finally:
        session.close()

# Detect environment early (used in middleware + CORS)
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")

# --- MIDDLEWARE DE LOGS ---
SLOW_THRESHOLD_MS = 100

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    logger.info("[IN] %s %s", request.method, request.url.path)
    
    response = await call_next(request)
    
    process_time = time.time() - start_time
    elapsed_ms = process_time * 1000
    
    if response.status_code >= 400:
        status_prefix = "[ERR]"
    elif elapsed_ms > SLOW_THRESHOLD_MS:
        status_prefix = "[SLOW]"
    else:
        status_prefix = "[OUT]"
        
    logger.info(
        "%s %s %s -> %s (%.0fms)",
        status_prefix,
        request.method,
        request.url.path,
        response.status_code,
        elapsed_ms,
    )
    # Security headers
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    # Only expose timing in development
    if ENVIRONMENT != "production":
        response.headers["X-Response-Time"] = f"{elapsed_ms:.2f}ms"
    return response

# --- CONFIGURACIÓN CORS ---

CORE_ORIGINS = [
    "https://nutriplanner.vercel.app",
    "https://nutriplanner-backend.onrender.com",
]

if ENVIRONMENT == "production":
    ALLOWED_ORIGINS = CORE_ORIGINS + [
        "https://www.nutriplanner.es",
    ]
    custom_domain = os.getenv("FRONTEND_URL")
    if custom_domain:
        ALLOWED_ORIGINS.append(custom_domain)
else:
    # Dev: allow common Vite ports (5173-5180) on both localhost and 127.0.0.1
    ALLOWED_ORIGINS = CORE_ORIGINS + [
        f"http://{host}:{port}"
        for host in ["localhost", "127.0.0.1"]
        for port in [3000, 8080, 8085, 1888] + list(range(5173, 5181))
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
)

# --- RUTAS ---
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(users.router, prefix="/users", tags=["users"])
app.include_router(planner.router, prefix="/api", tags=["planner"])
app.include_router(endpoints.router, prefix="/api", tags=["endpoints"])
app.include_router(inventory.router, prefix="/api/inventory", tags=["inventory"])

# --- STATIC FILES (recipe images) ---
_static_dir = Path(__file__).parent.parent / "static"
_static_dir.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(_static_dir)), name="static")


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "nutriplanner-backend",
        "version": "1.0",
    }


@app.get("/")
def read_root():
    return {
        "message": "NutriPlanner Backend v1.0 Operativo",
        "search_engine": "Logic SQL (Canonical Match)",
    }