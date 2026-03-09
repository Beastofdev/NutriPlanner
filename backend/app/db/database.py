"""
Database configuration.

Soporta PostgreSQL (producción) y SQLite (desarrollo).
"""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

logger = logging.getLogger("NutriPlanner.Database")

# ==========================================
# Load .env file BEFORE reading DATABASE_URL
# ==========================================
env_paths = [
    Path(__file__).resolve().parent.parent.parent / ".env",  # backend/.env
    Path(__file__).resolve().parent.parent.parent.parent / ".env",  # NutriPlanner/.env
]
for env_path in env_paths:
    if env_path.exists():
        load_dotenv(dotenv_path=env_path)
        break

# ==========================================
# Environment-based Database URL
# ==========================================
DATABASE_URL = os.getenv("DATABASE_URL")

if DATABASE_URL:
    # Producción: PostgreSQL
    logger.info(
        "Using PostgreSQL: %s",
        DATABASE_URL.split('@')[1] if '@' in DATABASE_URL else 'configured'
    )
    
    # Create PostgreSQL engine
    engine = create_engine(
        DATABASE_URL,
        pool_size=10,
        max_overflow=20,
        pool_pre_ping=True,  # Verify connections before use
        pool_recycle=3600,   # Recycle connections after 1 hour
    )
    
    # Flag for raw SQL queries
    IS_POSTGRES = True
    MONOLITH_DB_PATH = None  # Not used in PostgreSQL mode
    
else:
    # Desarrollo: SQLite fallback
    logger.info("DATABASE_URL not set, using SQLite fallback")

    current_dir = Path(__file__).resolve().parent
    base_dir = current_dir.parent.parent  # backend/

    candidates = [
        base_dir / "nutriplanner.db",  # backend/nutriplanner.db
        base_dir.parent / "nutriplanner.db",  # NutriPlanner/nutriplanner.db
        current_dir.parent.parent.parent / "nutriplanner.db",  # raíz del proyecto
    ]

    env_db_path = os.getenv("SQLITE_DB_PATH")
    if env_db_path:
        candidates.insert(0, Path(env_db_path))

    MONOLITH_DB_PATH = None
    for path in candidates:
        if path.exists():
            MONOLITH_DB_PATH = str(path)
            logger.info("SQLite DB found at: %s", MONOLITH_DB_PATH)
            break

    if not MONOLITH_DB_PATH:
        # Crear la base de datos si no existe (desarrollo)
        default_db_path = base_dir / "nutriplanner.db"
        MONOLITH_DB_PATH = str(default_db_path)
        logger.info("Creating new SQLite DB at: %s", MONOLITH_DB_PATH)

    DATABASE_URL = f"sqlite:///{MONOLITH_DB_PATH}"

    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
    )

    IS_POSTGRES = False

# ==========================================
# SQLAlchemy Session Configuration
# ==========================================
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Base declarativa para los modelos ORM."""

    pass


# ==========================================
# Dependency Injection
# ==========================================
def get_db():
    """Dependencia de FastAPI para obtener una sesión de base de datos."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ==========================================
# Raw Connection Helper (for direct SQL)
# ==========================================
def get_db_connection():
    """
    Devuelve una conexión cruda a la base de datos para consultas SQL directas.
    Funciona tanto con PostgreSQL como con SQLite.
    """
    if IS_POSTGRES:
        return engine.raw_connection()
    else:
        import sqlite3

        conn = sqlite3.connect(MONOLITH_DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn


# ==========================================
# Compatibility exports
# ==========================================
PRICES_DB_PATH = MONOLITH_DB_PATH  # Legacy compatibility
PROJECT_ROOT = str(Path(__file__).resolve().parent.parent.parent)