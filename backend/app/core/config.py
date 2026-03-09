import os
import secrets
import sys

from dotenv import load_dotenv

# Cargar variables de entorno desde .env (si existe)
load_dotenv()


class Settings:
    """Configuración central de la aplicación."""

    PROJECT_NAME: str = "NutriPlanner"
    API_V1_STR: str = "/api"

    # Seguridad
    SECRET_KEY: str = os.getenv("SECRET_KEY", "")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 horas
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7  # Refresh tokens válidos por 7 días

    # Rate Limiting
    LOGIN_RATE_LIMIT: int = 5  # Máximo 5 intentos
    LOGIN_RATE_WINDOW: int = 300  # Ventana de 5 minutos (300 segundos)

    # Password Reset
    RESET_TOKEN_EXPIRE_MINUTES: int = 60  # 1 hora
    RESEND_API_KEY: str = os.getenv("RESEND_API_KEY", "")
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "https://nutriplanner.vercel.app")

    def __init__(self) -> None:
        if not self.SECRET_KEY:
            environment = os.getenv("ENVIRONMENT", "development").lower()
            if environment == "production":
                print(
                    "CRITICAL: SECRET_KEY no configurada en producción. "
                    "Configura SECRET_KEY en el entorno o en .env."
                )
                sys.exit(1)
            else:
                # Modo desarrollo: generar key temporal
                self.SECRET_KEY = secrets.token_urlsafe(32)
                print(
                    "DEV MODE: SECRET_KEY temporal generada. "
                    "Configura SECRET_KEY en .env para producción."
                )


settings = Settings()
